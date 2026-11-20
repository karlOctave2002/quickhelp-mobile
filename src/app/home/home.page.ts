import {
  Component, OnDestroy, OnInit, effect, inject, signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { IonContent } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import {
  SolicitudesService,
  type CoordenadasEmergencia,
} from '../core/services/solicitudes.service';
import { PerfilInicioComponent } from '../shared/components/perfil-inicio/perfil-inicio.component';

// Campos utilizados para mostrar la dirección del dispositivo.
interface ComponenteDireccion {
  longText: string;
  types: string[];
}

interface ResultadoDireccion {
  addressComponents?: ComponenteDireccion[];
}

// Mensaje que cada tarjeta envía al chat de la emergencia.
type OpcionAyuda = 'MAL' | 'ASISTENCIA' | 'BIEN';

const MENSAJES_OPCION: Record<OpcionAyuda, string> = {
  MAL: 'Me siento mal, ayúdame por favor',
  ASISTENCIA: 'Necesito asistencia, por favor ven',
  BIEN: 'Estoy bien, gracias',
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonContent, PerfilInicioComponent],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly solicitudes = inject(SolicitudesService);

  readonly sesion = this.auth.sesion;
  readonly direccion = signal('Buscando ubicación…');
  readonly presionando = signal(false);
  readonly enviando = signal(false);
  readonly enviandoOpcion = signal(false);
  readonly mensaje = signal('');
  readonly error = signal('');

  private seguimiento?: number;
  // Punto y momento de la última consulta de dirección.
  private ultimaPosicion?: { latitud: number; longitud: number; momento: number };
  private pausaDireccionHasta = 0;
  private tieneDireccion = false;
  private ultimaLecturaGps?: { posicion: GeolocationPosition; token: string };
  private consulta?: AbortController;
  private temporizador?: ReturnType<typeof setTimeout>;

  private visible = true;
  private destruida = false;
  private operacion = 0;

  constructor() {
    // Limpia los avisos y descarta operaciones de una sesión anterior.
    effect(() => {
      this.sesion();
      this.operacion++;
      this.cancelarPulsacion();
      this.enviando.set(false);
      this.mensaje.set('');
      this.error.set('');
    });
  }

  ngOnInit(): void {
    this.iniciarSeguimiento();
  }

  ionViewDidEnter(): void {
    this.visible = true;
    this.iniciarSeguimiento();
  }

  iniciarPulsacion(evento: PointerEvent): void {
    if (!evento.isPrimary || evento.button !== 0) return;
    this.prepararPulsacion();
  }

  iniciarTeclado(evento: KeyboardEvent): void {
    if (evento.key !== ' ' && evento.key !== 'Enter') return;

    evento.preventDefault();
    if (!evento.repeat) this.prepararPulsacion();
  }

  terminarTeclado(evento: KeyboardEvent): void {
    if (evento.key !== ' ' && evento.key !== 'Enter') return;

    evento.preventDefault();
    this.cancelarPulsacion();
  }

  private prepararPulsacion(): void {
    if (
      this.enviando() ||
      this.presionando() ||
      !this.visible ||
      this.sesion()?.rol !== 'ADULTO_MAYOR'
    ) return;

    this.mensaje.set('');
    this.error.set('');
    this.presionando.set(true);

    // Soltar antes de dos segundos cancela la activación.
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.presionando.set(false);
      void this.solicitarEmergencia();
    }, 2000);
  }

  cancelarPulsacion(): void {
    if (this.temporizador !== undefined) {
      clearTimeout(this.temporizador);
      this.temporizador = undefined;
    }

    this.presionando.set(false);
  }

  activarAccesible(evento: MouseEvent): void {
    // Permite activar mediante tecnologías de asistencia.
    // Los clics normales se gestionan con la pulsación mantenida.
    if (evento.detail !== 0 || this.enviando()) return;

    if (window.confirm('¿Quieres solicitar ayuda de emergencia?')) {
      void this.solicitarEmergencia();
    }
  }

  private async solicitarEmergencia(): Promise<void> {
    const cuenta = this.sesion();

    if (
      !cuenta ||
      cuenta.rol !== 'ADULTO_MAYOR' ||
      this.enviando() ||
      !this.visible ||
      this.destruida
    ) return;

    this.cancelarPulsacion();
    const operacion = ++this.operacion;

    this.enviando.set(true);
    this.error.set('');
    this.mensaje.set('Obteniendo ubicación para tu emergencia…');

    try {
      // Aprovecha el GPS de Inicio si la lectura pertenece a esta sesión.
      const coordenadas = this.ubicacionReciente(cuenta.token)
        ?? await this.obtenerCoordenadas()
        ?? this.ubicacionReciente(cuenta.token);

      // No envía una emergencia si se salió antes de obtener el GPS.
      if (!this.contextoVigente(operacion, cuenta.token) || !this.visible) {
        return;
      }

      this.mensaje.set(
        coordenadas
          ? 'Enviando tu solicitud con ubicación…'
          : 'No obtuvimos el GPS. Enviando tu solicitud sin ubicación nueva…'
      );

      const resultado = await firstValueFrom(
        this.solicitudes.crear(cuenta, coordenadas)
      );

      if (!this.contextoVigente(operacion, cuenta.token)) return;

      if (!Number.isInteger(resultado?.idAlerta) || resultado.idAlerta <= 0) {
        throw new Error('Respuesta de emergencia inválida.');
      }

      // Confirma la respuesta del servidor, sin asegurar recepción push.
      this.mensaje.set(
        coordenadas
          ? `Solicitud #${resultado.idAlerta} registrada con tu ubicación.`
          : `Solicitud #${resultado.idAlerta} registrada sin ubicación nueva.`
      );
    } catch (fallo: unknown) {
      if (!this.contextoVigente(operacion, cuenta.token)) return;

      this.mensaje.set('');

      if (fallo instanceof HttpErrorResponse && fallo.status === 401) {
        this.error.set('Tu sesión venció. Vuelve a iniciar sesión.');
      } else if (fallo instanceof HttpErrorResponse && fallo.status === 403) {
        this.error.set('Esta cuenta no tiene permiso para activar emergencias.');
      } else {
        // Un corte de conexión puede ocurrir después de guardar la solicitud.
        this.error.set(
          'No pudimos confirmar el envío. Revisa Solicitudes antes de reintentar.'
        );
      }
    } finally {
      if (this.contextoVigente(operacion, cuenta.token)) {
        this.enviando.set(false);
      }
    }
  }

  async enviarOpcion(opcion: OpcionAyuda): Promise<void> {
    const cuenta = this.sesion();
    if (
      !cuenta ||
      cuenta.rol !== 'ADULTO_MAYOR' ||
      this.enviando() ||
      this.enviandoOpcion()
    ) return;

    const texto = MENSAJES_OPCION[opcion];
    this.enviandoOpcion.set(true);
    this.error.set('');
    this.mensaje.set('Enviando tu mensaje…');

    try {
      // Busca la emergencia abierta más reciente del adulto.
      const alertas = await firstValueFrom(this.solicitudes.listar(cuenta));
      const abierta = alertas
        .filter(a => a.estado === 'ACTIVA' || a.estado === 'PENDIENTE' || a.estado === 'EN_ATENCION')
        .sort((a, b) =>
          b.fechaCreacion.localeCompare(a.fechaCreacion) || b.idAlerta - a.idAlerta
        )[0];

      if (this.sesion()?.token !== cuenta.token) return;

      if (!abierta) {
        this.mensaje.set('');
        this.error.set('Primero mantén presionado el botón rojo para pedir ayuda.');
        return;
      }

      // El chat se habilita cuando al menos un asistente respondió.
      const respuestas = await firstValueFrom(
        this.solicitudes.listarRespuestas(cuenta, abierta.idAlerta)
      );

      if (this.sesion()?.token !== cuenta.token) return;

      if (respuestas.length === 0) {
        this.mensaje.set('');
        this.error.set('Tu red todavía no responde. Intenta de nuevo en un momento.');
        return;
      }

      await firstValueFrom(this.solicitudes.enviarMensaje(
        cuenta, abierta.idAlerta, texto, crypto.randomUUID()
      ));

      if (this.sesion()?.token !== cuenta.token) return;
      this.mensaje.set(`Mensaje enviado a tu red: «${texto}»`);
    } catch (fallo: unknown) {
      if (this.sesion()?.token !== cuenta.token) return;

      this.mensaje.set('');

      if (fallo instanceof HttpErrorResponse && fallo.status === 401) {
        this.error.set('Tu sesión venció. Vuelve a iniciar sesión.');
      } else if (fallo instanceof HttpErrorResponse && fallo.status === 409) {
        this.error.set('Tu solicitud ya fue cerrada. Si necesitas ayuda, usa el botón rojo.');
      } else {
        this.error.set('No pudimos enviar tu mensaje. Intenta nuevamente.');
      }
    } finally {
      this.enviandoOpcion.set(false);
    }
  }

  private contextoVigente(operacion: number, token: string): boolean {
    return !this.destruida &&
      operacion === this.operacion &&
      this.sesion()?.token === token;
  }

  private obtenerCoordenadas(): Promise<CoordenadasEmergencia | null> {
    return new Promise(resolve => {
      if (!window.isSecureContext) {
        console.warn('Ubicación SOS: la página no está en un contexto seguro.');
        resolve(null);
        return;
      }

      if (!navigator.geolocation) {
        console.warn('Ubicación SOS: el navegador no ofrece geolocalización.');
        resolve(null);
        return;
      }

      // Evita resolver la misma consulta más de una vez.
      let finalizada = false;

      const terminar = (valor: CoordenadasEmergencia | null): void => {
        if (finalizada) return;
        finalizada = true;
        clearTimeout(limite);
        resolve(valor);
      };

      // Limita también la espera si el usuario no responde al permiso.
      const limite = setTimeout(() => {
        console.warn(
          'Ubicación SOS: se agotaron los 10 segundos de espera.'
        );
        terminar(null);
      }, 10000);

      try {
        navigator.geolocation.getCurrentPosition(
          posicion => {
            // Descarta una respuesta que llegó después del límite.
            if (finalizada) return;

            const { latitude, longitude, accuracy } = posicion.coords;

            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              !Number.isFinite(accuracy) ||
              Math.abs(latitude) > 90 ||
              Math.abs(longitude) > 180 ||
              accuracy < 0
            ) {
              console.warn(
                'Ubicación SOS: el navegador devolvió coordenadas inválidas.'
              );
              terminar(null);
              return;
            }

            terminar({
              latitud: latitude,
              longitud: longitude,
              precisionMetros: accuracy,
            });
          },
          fallo => {
            if (finalizada) return;

            // Registra el motivo sin imprimir coordenadas ni datos de sesión.
            console.warn(
              'Error de ubicación SOS:',
              fallo.code,
              fallo.message
            );
            terminar(null);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        );
      } catch {
        console.warn(
          'Ubicación SOS: ocurrió una excepción al solicitar la ubicación.'
        );
        terminar(null);
      }
    });
  }

  private iniciarSeguimiento(): void {
    if (this.seguimiento !== undefined) return;

    if (!window.isSecureContext || !navigator.geolocation) {
      this.direccion.set('Ubicación no disponible');
      return;
    }

    this.direccion.set('Buscando ubicación…');

    this.seguimiento = navigator.geolocation.watchPosition(
      posicion => {
        if (!this.visible || this.destruida) return;

        // Guarda la lectura antes de consultar la dirección o descartar el mismo punto.
        const token = this.sesion()?.token;
        if (token) this.ultimaLecturaGps = { posicion, token };

        const { latitude, longitude } = posicion.coords;
        if (!this.debeActualizarDireccion(latitude, longitude)) return;

        this.ultimaPosicion = { latitud: latitude, longitud: longitude, momento: Date.now() };
        void this.actualizarDireccion(latitude, longitude);
      },
      fallo => {
        if (!this.visible || this.destruida) return;

        if (fallo.code === fallo.PERMISSION_DENIED) this.ultimaLecturaGps = undefined;
        this.consulta?.abort();
        this.ultimaPosicion = undefined;
        this.tieneDireccion = false;

        this.direccion.set(
          fallo.code === fallo.PERMISSION_DENIED
            ? 'Permiso de ubicación desactivado'
            : 'Esperando ubicación…'
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  // Limita las consultas: cada 30 segundos y solo si se movió 50 metros o más.
  private debeActualizarDireccion(latitud: number, longitud: number): boolean {
    const ahora = Date.now();
    if (ahora < this.pausaDireccionHasta) return false;

    const anterior = this.ultimaPosicion;
    if (!anterior) return true;

    return ahora - anterior.momento >= 30_000 &&
      this.distanciaMetros(anterior.latitud, anterior.longitud, latitud, longitud) >= 50;
  }

  // Distancia aproximada entre dos puntos GPS (fórmula de Haversine).
  private distanciaMetros(
    latitud1: number, longitud1: number, latitud2: number, longitud2: number
  ): number {
    const radian = (grados: number) => grados * Math.PI / 180;
    const dLatitud = radian(latitud2 - latitud1);
    const dLongitud = radian(longitud2 - longitud1);
    const a = Math.sin(dLatitud / 2) ** 2 +
      Math.cos(radian(latitud1)) * Math.cos(radian(latitud2)) *
      Math.sin(dLongitud / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async actualizarDireccion(latitud: number, longitud: number): Promise<void> {
    const cuenta = this.sesion();
    if (!cuenta) return;

    this.consulta?.abort();
    const consulta = new AbortController();
    this.consulta = consulta;

    try {
      // El backend consulta Google y, si falla, OpenStreetMap.
      const respuesta = await firstValueFrom(
        this.solicitudes.consultarDireccionActual(cuenta, latitud, longitud)
      );
      if (consulta.signal.aborted) return;

      const resultados = respuesta?.geocodificacion?.results ?? [];
      const campo = (resultado: ResultadoDireccion, tipo: string) =>
        resultado.addressComponents
          ?.find(dato => dato.types.includes(tipo))?.longText;

      // Mantiene calle y número del mismo resultado.
      const domicilio = resultados.find(
        r => campo(r, 'route') && campo(r, 'street_number')
      ) ?? resultados.find(r => campo(r, 'route'));

      const calle = domicilio && campo(domicilio, 'route');
      const numero = domicilio && campo(domicilio, 'street_number');
      const comuna = resultados
        .map(r => campo(r, 'administrative_area_level_3'))
        .find(Boolean);

      const calleYNumero = [calle, numero].filter(Boolean).join(' ');
      const texto = [calleYNumero, comuna].filter(Boolean).join(', ');

      if (texto) {
        this.direccion.set(texto);
        this.tieneDireccion = true;
      } else if (!this.tieneDireccion) {
        this.direccion.set('Dirección no disponible');
      }
    } catch (fallo: unknown) {
      if (consulta.signal.aborted) return;

      // Tras un 429 espera 60 segundos; ante otros errores, 30 segundos.
      const limite = fallo instanceof HttpErrorResponse && fallo.status === 429;
      this.pausaDireccionHasta = Date.now() + (limite ? 60_000 : 30_000);
      this.ultimaPosicion = undefined;

      // Conserva la última dirección válida si ya se mostró una.
      if (!this.tieneDireccion) {
        this.direccion.set('No se pudo obtener la dirección');
      }
    }
  }

  private ubicacionReciente(token: string): CoordenadasEmergencia | null {
    const lectura = this.ultimaLecturaGps;
    if (lectura?.token !== token) return null;

    const { coords, timestamp } = lectura.posicion;
    const antiguedad = Date.now() - timestamp;
    const { latitude, longitude, accuracy } = coords;

    // Usa solo una posición válida capturada en los últimos 30 segundos.
    if (
      !Number.isFinite(antiguedad) || antiguedad < 0 || antiguedad > 30_000 ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0
    ) return null;

    return { latitud: latitude, longitud: longitude, precisionMetros: accuracy };
  }

  private detenerSeguimiento(): void {
    this.ultimaLecturaGps = undefined;
    if (this.seguimiento !== undefined) {
      navigator.geolocation.clearWatch(this.seguimiento);
      this.seguimiento = undefined;
    }

    this.consulta?.abort();
    this.ultimaPosicion = undefined;
    this.tieneDireccion = false;
  }

  ionViewWillLeave(): void {
    this.visible = false;
    this.cancelarPulsacion();
    this.detenerSeguimiento();
  }

  ngOnDestroy(): void {
    this.destruida = true;
    this.operacion++;
    this.cancelarPulsacion();
    this.detenerSeguimiento();
  }
}