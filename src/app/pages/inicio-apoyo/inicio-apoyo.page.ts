import { DOCUMENT, DatePipe } from '@angular/common'; // Detecta si la app está visible y da formato a fechas.
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, signal, untracked, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { auditTime, fromEvent, merge, Subscription, timer } from 'rxjs';
import { PerfilInicioComponent } from '../../shared/components/perfil-inicio/perfil-inicio.component';
import { AlertasApoyoService, type PersonaVinculada } from '../../core/services/alertas-apoyo.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificacionesPushService } from '../../core/services/notificaciones-push.service';
import type { SolicitudAyuda } from '../../core/services/solicitudes.service';
import { TarjetaAlertaApoyoComponent } from './tarjeta-alerta-apoyo.component';

@Component({
    selector: 'app-inicio-apoyo',
    standalone: true,
    imports: [IonContent, RouterLink, DatePipe, TarjetaAlertaApoyoComponent, PerfilInicioComponent],
    templateUrl: './inicio-apoyo.page.html',
    styleUrls: ['./inicio-apoyo.page.scss'],
})
export class InicioApoyoPage implements OnDestroy {
    private readonly auth = inject(AuthService);
    private readonly servicio = inject(AlertasApoyoService);
    private readonly notificaciones = inject(NotificacionesPushService);
    private readonly documento = inject(DOCUMENT);
    private readonly tarjetas = viewChildren(TarjetaAlertaApoyoComponent);
    private consulta?: Subscription;
    private consultaPersonas?: Subscription;
    private refresco?: Subscription;

    readonly sesion = this.auth.sesion;
    readonly cargando = signal(false);
    readonly error = signal('');
    readonly actualizado = signal<Date | null>(null);
    readonly avisosDesactivados = this.notificaciones.avisosDesactivados;

    // Personas vinculadas de la cuenta que inició sesión.
    private readonly personasCargadas = signal<{
        idAsistente: number;
        lista: PersonaVinculada[];
    } | null>(null);

    private readonly resultado = signal<{
        idAsistente: number;
        alertas: SolicitudAyuda[];
    } | null>(null);

    // Todas las solicitudes de la red de la cuenta que inició sesión.
    private readonly alertasDeMiRed = computed(() => {
        const datos = this.resultado();
        return datos && datos.idAsistente === this.sesion()?.idUsuario
            ? datos.alertas
            : [];
    });

    readonly alertasAbiertas = computed(() =>
        this.alertasDeMiRed().filter(alerta =>
            alerta.estado === 'ACTIVA' || alerta.estado === 'PENDIENTE' ||
            alerta.estado === 'EN_ATENCION'
        )
    );

    readonly personas = computed(() => {
        const datos = this.personasCargadas();
        if (!datos || datos.idAsistente !== this.sesion()?.idUsuario) return [];

        // Agrega a cada persona la fecha de su última solicitud.
        return datos.lista.map(persona => ({
            ...persona,
            inicial: persona.nombreAdultoMayor.trim().charAt(0).toUpperCase() || '·',
            ultima: this.alertasDeMiRed()
                .filter(alerta => alerta.idAdultoMayor === persona.idAdultoMayor)
                .map(alerta => alerta.fechaCreacion)
                .sort()
                .at(-1) ?? null,
        }));
    });

    // Resumen del mes; el backend entrega las fechas en hora de Chile.
    readonly resumen = computed(() => {
        const hoy = new Date();
        const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        const delMes = this.alertasDeMiRed()
            .filter(alerta => alerta.fechaCreacion?.slice(0, 7) === mes);

        return {
            personas: this.personas().length,
            solicitudes: delMes.length,
            resueltas: delMes.filter(alerta => alerta.estado === 'RESUELTA').length,
        };
    });

    // Últimas solicitudes cerradas de la red.
    readonly actividad = computed(() =>
        this.alertasDeMiRed()
            .filter(alerta =>
                alerta.estado !== 'ACTIVA' && alerta.estado !== 'PENDIENTE' &&
                alerta.estado !== 'EN_ATENCION'
            )
            .sort((a, b) =>
                b.fechaCreacion.localeCompare(a.fechaCreacion) || b.idAlerta - a.idAlerta
            )
            .slice(0, 3)
    );

    constructor() {
        // Abre el chat indicado por un aviso cuando su tarjeta ya está en pantalla.
        effect(() => {
            const id = this.notificaciones.chatPendiente();
            const tarjeta = this.tarjetas().find(t => t.alerta().idAlerta === id);
            if (id === null || !tarjeta) return;

            untracked(() => {
                this.notificaciones.consumirChatPendiente(id);
                tarjeta.abrirDesdeAviso();
            });
        });
    }

    ionViewWillEnter(): void {
        this.refresco?.unsubscribe();
        // Agrupa el aviso, el toque y la vuelta a la app si ocurren juntos.
        this.refresco = merge(
            this.notificaciones.recargarAlertas$,
            fromEvent(this.documento, 'visibilitychange'),
        ).pipe(auditTime(150)).subscribe(() => this.actualizarVisible(true));
        // Si falta el push, consulta la red cada 15 segundos mientras se ve Inicio.
        this.refresco.add(timer(15_000, 15_000).subscribe(() => this.actualizarVisible(false)));
        this.cargar();
        this.cargarPersonas();
        void this.notificaciones.revisarAvisos();
    }

    activarAvisos(): void {
        void this.notificaciones.activarAvisos();
    }

    ionViewWillLeave(): void {
        this.refresco?.unsubscribe();
        this.refresco = undefined;
        this.cancelarConsulta();
    }

    private actualizarVisible(inmediata: boolean): void {
        if (this.documento.hidden || this.sesion()?.rol !== 'ASISTENTE') return;
        // El intervalo permite terminar la consulta actual; el aviso pide datos nuevos.
        if (!inmediata && this.consulta && !this.consulta.closed) return;
        this.cargar(false);
    }

    cargar(mostrarCarga = true): void {
        const cargaVisible = mostrarCarga || this.cargando();
        this.cancelarConsulta();
        if (cargaVisible) this.error.set('');

        const cuenta = this.sesion();
        if (!cuenta || cuenta.rol !== 'ASISTENTE') {
            this.resultado.set(null);
            return;
        }

        // Durante una actualización, conserva las tarjetas y sus borradores.
        this.cargando.set(cargaVisible);

        this.consulta = this.servicio.listar(cuenta).subscribe({
            next: alertas => {
                if (this.sesion() !== cuenta) return;

                this.error.set('');
                this.resultado.set({
                    idAsistente: cuenta.idUsuario,
                    alertas,
                });
                this.actualizado.set(new Date());
                this.cargando.set(false);
            },
            error: (fallo: HttpErrorResponse) => {
                if (this.sesion() !== cuenta) return;
                this.cargando.set(false);

                if (fallo.status === 401) {
                    this.resultado.set(null);
                    this.auth.cerrarSesion();
                    return;
                }

                if (fallo.status === 403) {
                    this.resultado.set(null);
                    this.error.set('Tu cuenta no tiene permiso para consultar esta red.');
                    return;
                }

                this.error.set(
                    'No pudimos actualizar las solicitudes. Pulsa Actualizar para reintentar.'
                );
            },
        });
    }

    // Se consulta al entrar al Inicio; las personas cambian poco.
    private cargarPersonas(): void {
        const cuenta = this.sesion();
        if (!cuenta || cuenta.rol !== 'ASISTENTE') return;

        this.consultaPersonas?.unsubscribe();
        this.consultaPersonas = this.servicio.listarPersonas(cuenta).subscribe({
            next: lista => {
                if (this.sesion() !== cuenta) return;
                this.personasCargadas.set({ idAsistente: cuenta.idUsuario, lista });
            },
            // Si falla, la sección muestra su mensaje y se reintenta al volver al Inicio.
            error: () => undefined,
        });
    }

    private cancelarConsulta(): void {
        this.consulta?.unsubscribe();
        this.consulta = undefined;
        this.cargando.set(false);
    }

    ngOnDestroy(): void {
        this.ionViewWillLeave();
        this.consultaPersonas?.unsubscribe();
    }
}