import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, linkedSignal, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { IonContent } from '@ionic/angular';

import { AuthService } from '../../core/services/auth.service';
import { MiPerfilService, type MiPerfil } from '../../core/services/mi-perfil.service';
import { VinculacionService } from '../../core/services/vinculacion.service';
import {
    WidgetAndroid,
    type ResultadoAgregarPanel,
    type ResultadoAgregarWidget,
} from '../../core/services/widget-android';

interface EstadoCodigo {
    cargando: boolean;
    codigo: string;
    error: string;
}

// Texto que ve el adulto después de tocar «Agregar widget».
const MENSAJES_WIDGET: Record<ResultadoAgregarWidget, string> = {
    solicitado: 'Toca «Agregar» en el cuadro de Android y el botón SOS quedará en tu pantalla de inicio.',
    ya_agregado: 'El botón SOS ya está en tu pantalla de inicio.',
    no_soportado: 'Tu teléfono no permite agregarlo desde aquí: mantén presionada la pantalla de inicio, toca «Widgets» y busca Quick Help.',
};

// Texto que ve el adulto después de tocar «Agregar al panel rápido».
const MENSAJES_PANEL: Record<ResultadoAgregarPanel, string> = {
    agregado: '¡Listo! El botón «SOS Quick Help» ya está en tu panel rápido.',
    ya_agregado: 'El botón SOS ya está en tu panel rápido.',
    rechazado: 'No se agregó. Puedes intentarlo de nuevo cuando quieras.',
    no_soportado: 'Tu teléfono no permite agregarlo desde aquí. Sigue los pasos de arriba.',
};

interface DatosEditables {
    nombreApellido: string;
    correo: string;
    telefono: string;
}

@Component({
    selector: 'app-perfil',
    standalone: true,
    imports: [IonContent, RouterLink],
    templateUrl: './perfil.page.html',
    styleUrls: ['./perfil.page.scss'],
})
export class PerfilPage {
    private readonly auth = inject(AuthService);
    private readonly perfiles = inject(MiPerfilService);
    private readonly vinculacion = inject(VinculacionService);
    private readonly intento = signal(0);
    private readonly visible = signal(true);

    readonly sesion = this.auth.sesion;

    readonly pestana = linkedSignal({
        source: this.sesion,
        computation: (): 'datos' | 'opciones' => 'datos',
    });

    readonly perfil = signal<MiPerfil | null>(null);
    readonly cargando = signal(true);
    readonly errorPerfil = signal('');
    readonly borrador = signal<DatosEditables | null>(null);

    // Cada sesión tiene su propio estado de guardado.
    readonly guardando = linkedSignal({
        source: this.sesion,
        computation: () => false,
    });

    readonly avisoGuardado = signal('');
    readonly errorGuardado = signal('');

    // Widget de emergencia (solo en la app de Android).
    readonly esAndroid = Capacitor.getPlatform() === 'android';
    readonly widget = signal<{ soportado: boolean; agregado: boolean } | null>(null);
    readonly agregandoWidget = signal(false);
    readonly avisoWidget = signal('');

    // Activación por voz (escucha la frase aunque la app esté cerrada).
    readonly voz = signal<{ escuchando: boolean; permiso: boolean } | null>(null);
    readonly fraseVoz = signal('');
    readonly guardandoVoz = signal(false);
    readonly probandoVoz = signal(false);
    readonly avisoVoz = signal('');
    readonly errorVoz = signal('');

    // Botón SOS del panel rápido (solo en la app de Android).
    readonly panel = signal<{ soportado: boolean; agregado: boolean } | null>(null);
    readonly agregandoPanel = signal(false);
    readonly avisoPanel = signal('');
    private escuchaRegreso: PluginListenerHandle | null = null;

    readonly estado = linkedSignal({
        source: this.sesion,
        computation: (): EstadoCodigo => ({
            cargando: false,
            codigo: '',
            error: '',
        }),
    });

    constructor() {
        // Consulta el perfil al abrir la página, cambiar de sesión o reintentar.
        effect(onCleanup => {
            const cuenta = this.sesion();
            const visible = this.visible();
            this.intento();

            this.perfil.set(null);
            this.borrador.set(null);
            this.errorPerfil.set('');
            this.errorGuardado.set('');
            this.avisoGuardado.set('');
            this.cargando.set(false);

            if (!cuenta || !visible) return;

            this.cargando.set(true);

            const consulta = this.perfiles.consultar(cuenta).subscribe({
                next: datos => {
                    if (this.sesion() !== cuenta) return;

                    this.cargando.set(false);
                    if (datos?.idUsuario !== cuenta.idUsuario) {
                        this.errorPerfil.set('No pudimos confirmar los datos de tu cuenta.');
                        return;
                    }

                    this.perfil.set(datos);
                    if (!this.fraseVoz()) this.fraseVoz.set(datos.fraseActivacion ?? '');
                    void this.sincronizarVoz(datos);
                },
                error: (fallo: HttpErrorResponse) => {
                    if (this.sesion() !== cuenta) return;

                    this.cargando.set(false);
                    this.errorPerfil.set(
                        fallo.status === 401
                            ? 'Tu sesión venció. Vuelve a iniciar sesión.'
                            : 'No pudimos cargar tus datos personales.'
                    );
                },
            });

            onCleanup(() => consulta.unsubscribe());
        });
    }

    ionViewWillEnter(): void {
        this.visible.set(true);
        void this.revisarWidget();

        // Al volver del cuadro de Android, revisa si el widget quedó agregado.
        if (this.esAndroid && !this.escuchaRegreso) {
            void App.addListener('resume', () => void this.revisarWidget())
                .then(escucha => { this.escuchaRegreso = escucha; });
        }
    }

    ionViewWillLeave(): void {
        this.visible.set(false);
        void this.escuchaRegreso?.remove();
        this.escuchaRegreso = null;
    }

    async agregarWidget(): Promise<void> {
        if (!this.esAndroid || this.agregandoWidget()) return;

        this.agregandoWidget.set(true);
        this.avisoWidget.set('');

        try {
            const { resultado } = await WidgetAndroid.agregarWidget();
            this.avisoWidget.set(MENSAJES_WIDGET[resultado]);
        } catch {
            this.avisoWidget.set('No pudimos abrir el cuadro para agregar el widget. Inténtalo de nuevo.');
        } finally {
            this.agregandoWidget.set(false);
        }
    }

    cambiarFraseVoz(valor: string): void {
        this.fraseVoz.set(valor);
        this.avisoVoz.set('');
        this.errorVoz.set('');
    }

    // Escucha unos segundos y confirma si el teléfono entiende la frase.
    async probarFraseVoz(): Promise<void> {
        const frase = this.fraseVoz().trim();
        if (!this.esAndroid || this.probandoVoz()) return;
        if (!this.fraseTieneDosPalabras(frase)) {
            this.errorVoz.set('Escribe una frase de al menos dos palabras.');
            return;
        }

        this.probandoVoz.set(true);
        this.errorVoz.set('');
        this.avisoVoz.set('Di tu frase ahora…');

        try {
            const { reconocida, escuchado } = await WidgetAndroid.probarFrase({ frase });
            this.avisoVoz.set(reconocida
                ? '✓ Reconocimos tu frase. Puedes activar la voz.'
                : escuchado && escuchado !== '[unk]'
                    ? `No la reconocimos (escuchamos «${escuchado}»). Habla claro o prueba con otras palabras.`
                    : 'No la reconocimos. Habla claro o prueba con otras palabras comunes en español.');
        } catch (fallo) {
            this.avisoVoz.set('');
            this.errorVoz.set(this.mensajeErrorVoz(fallo));
        } finally {
            this.probandoVoz.set(false);
        }
    }

    // Enciende o apaga la voz: primero se guarda en la cuenta y después en el teléfono.
    async cambiarVoz(activar: boolean): Promise<void> {
        const cuenta = this.sesion();
        const frase = this.fraseVoz().trim();
        if (!cuenta || !this.esAndroid || this.guardandoVoz()) return;

        if (activar && !this.fraseTieneDosPalabras(frase)) {
            this.errorVoz.set('Escribe una frase de al menos dos palabras.');
            return;
        }

        this.guardandoVoz.set(true);
        this.avisoVoz.set('');
        this.errorVoz.set('');

        try {
            if (activar) {
                await WidgetAndroid.activarVoz({ frase });
            } else {
                await WidgetAndroid.desactivarVoz();
            }

            const actualizado = await firstValueFrom(
                this.perfiles.configurarVoz(cuenta, activar, activar ? frase : null)
            );
            if (this.sesion() === cuenta) this.perfil.set(actualizado);

            this.avisoVoz.set(activar
                ? 'Listo: Quick Help escucha tu frase aunque la app esté cerrada.'
                : 'La activación por voz quedó apagada.');
        } catch (fallo) {
            // Si la cuenta no se pudo guardar, el teléfono vuelve al estado anterior.
            if (activar) await WidgetAndroid.desactivarVoz().catch(() => undefined);
            this.errorVoz.set(this.mensajeErrorVoz(fallo));
        } finally {
            this.guardandoVoz.set(false);
            await this.revisarVoz();
        }
    }

    abrirAjustesBateria(): void {
        void WidgetAndroid.abrirAjustesBateria().catch(() => undefined);
    }

    private fraseTieneDosPalabras(frase: string): boolean {
        return frase.split(/\s+/).filter(Boolean).length >= 2;
    }

    private mensajeErrorVoz(fallo: unknown): string {
        const codigo = (fallo as { code?: string })?.code;
        if (codigo === 'SIN_PERMISO') {
            return 'Sin permiso de micrófono no podemos escuchar tu frase. Actívalo en los ajustes del teléfono.';
        }
        if (fallo instanceof HttpErrorResponse) {
            return fallo.status === 401
                ? 'Tu sesión venció. Vuelve a iniciar sesión.'
                : 'No pudimos guardar la activación por voz. Inténtalo de nuevo.';
        }
        return 'No pudimos encender la escucha. Inténtalo de nuevo.';
    }

    private async revisarVoz(): Promise<void> {
        if (!this.esAndroid) return;
        try {
            const estado = await WidgetAndroid.estadoVoz();
            this.voz.set({ escuchando: estado.escuchando, permiso: estado.permiso });
        } catch {
            this.voz.set({ escuchando: false, permiso: false });
        }
    }

    // Si la cuenta tiene la voz encendida (por ejemplo, en otro teléfono), la enciende aquí también.
    private async sincronizarVoz(datos: MiPerfil): Promise<void> {
        await this.revisarVoz();
        const estado = this.voz();
        if (
            this.esAndroid && datos.vozActiva && datos.fraseActivacion &&
            estado && !estado.escuchando && estado.permiso
        ) {
            await WidgetAndroid.activarVoz({ frase: datos.fraseActivacion }).catch(() => undefined);
            await this.revisarVoz();
        }
    }

    async agregarAlPanel(): Promise<void> {
        if (!this.esAndroid || this.agregandoPanel()) return;

        this.agregandoPanel.set(true);
        this.avisoPanel.set('');

        try {
            const { resultado } = await WidgetAndroid.agregarAlPanel();
            this.avisoPanel.set(MENSAJES_PANEL[resultado]);
            if (resultado === 'agregado' || resultado === 'ya_agregado') {
                this.panel.update(actual => actual ? { ...actual, agregado: true } : actual);
            }
        } catch {
            this.avisoPanel.set('No pudimos abrir el cuadro para agregar el botón. Inténtalo de nuevo.');
        } finally {
            this.agregandoPanel.set(false);
        }
    }

    private async revisarWidget(): Promise<void> {
        if (!this.esAndroid) return;

        try {
            const estado = await WidgetAndroid.estadoWidget();
            this.widget.set(estado);
            if (estado.agregado) this.avisoWidget.set('');
        } catch {
            this.widget.set({ soportado: false, agregado: false });
        }

        // Botón del panel rápido: no depende de que el widget responda.
        try {
            this.panel.set(await WidgetAndroid.estadoPanel());
        } catch {
            this.panel.set({ soportado: false, agregado: false });
        }
    }

    reintentar(): void {
        this.intento.update(valor => valor + 1);
    }

    editar(): void {
        const datos = this.perfil();
        if (!datos || this.guardando()) return;

        this.pestana.set('datos');
        this.avisoGuardado.set('');
        this.errorGuardado.set('');

        // El formulario trabaja con una copia hasta que el servidor confirme.
        this.borrador.set({
            nombreApellido: datos.nombreApellido,
            correo: datos.correo,
            telefono: datos.telefono ?? '',
        });
    }

    cambiarCampo(campo: keyof DatosEditables, valor: string): void {
        if (this.guardando()) return;

        this.errorGuardado.set('');
        this.borrador.update(actual => actual ? { ...actual, [campo]: valor } : null);
    }

    cancelarEdicion(): void {
        if (this.guardando()) return;

        this.borrador.set(null);
        this.errorGuardado.set('');
    }

    guardarCambios(): void {
        const cuenta = this.sesion();
        const datos = this.borrador();

        if (!cuenta || !datos || this.guardando()) return;

        this.errorGuardado.set('');
        this.avisoGuardado.set('');

        if (!datos.nombreApellido.trim() || !datos.correo.trim()) {
            this.errorGuardado.set('Escribe tu nombre y tu correo electrónico.');
            return;
        }

        this.guardando.set(true);

        this.perfiles.actualizar(cuenta, datos).subscribe({
            next: actualizado => {
                if (this.sesion() !== cuenta) return;

                this.guardando.set(false);

                // Si salió del editor durante el envío, la próxima consulta
                // debe leer la versión que acaba de guardar el servidor.
                if (this.borrador() !== datos) {
                    this.reintentar();
                    return;
                }

                if (actualizado?.idUsuario !== cuenta.idUsuario) {
                    this.errorGuardado.set('No pudimos confirmar la actualización de tu perfil.');
                    return;
                }

                this.perfil.set(actualizado);
                this.borrador.set(null);
                this.avisoGuardado.set('Cambios guardados.');
            },
            error: (fallo: HttpErrorResponse) => {
                if (this.sesion() !== cuenta) return;

                this.guardando.set(false);

                const mensajes: Record<number, string> = {
                    400: 'Revisa el nombre, el correo electrónico y el teléfono.',
                    401: 'Tu sesión venció. Vuelve a iniciar sesión.',
                    403: 'Tu cuenta no tiene permiso para guardar estos cambios.',
                    409: 'Ese correo ya está registrado en otra cuenta.',
                };

                this.errorGuardado.set(
                    mensajes[fallo.status]
                    ?? 'No pudimos confirmar el guardado. Inténtalo de nuevo.'
                );
            },
        });
    }

    generarCodigo(): void {
        const cuenta = this.sesion();

        if (!cuenta || cuenta.rol !== 'ADULTO_MAYOR') return;
        if (this.estado().cargando || this.estado().codigo) return;

        this.estado.set({ cargando: true, codigo: '', error: '' });

        this.vinculacion.obtenerCodigo(cuenta.token).subscribe({
            next: ({ codigoVinculacion }) => {
                if (this.sesion() !== cuenta) return;

                const codigo = codigoVinculacion?.trim() || '';

                this.estado.set({
                    cargando: false,
                    codigo,
                    error: codigo ? '' : 'No recibimos el código. Inténtalo de nuevo.',
                });
            },
            error: (fallo: HttpErrorResponse) => {
                if (this.sesion() !== cuenta) return;

                if (fallo.status === 401) {
                    this.auth.cerrarSesion();
                    return;
                }

                this.estado.set({
                    cargando: false,
                    codigo: '',
                    error: fallo.status === 403
                        ? 'Esta cuenta no tiene permiso para obtener el código.'
                        : 'No pudimos obtener tu código. Inténtalo de nuevo.',
                });
            },
        });
    }
}