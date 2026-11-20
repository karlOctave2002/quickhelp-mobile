import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked, viewChildren } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { ChatAlertaComponent } from '../inicio-apoyo/chat-alerta.component';
import { AlertasApoyoService } from '../../core/services/alertas-apoyo.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificacionesPushService } from '../../core/services/notificaciones-push.service';
import { SolicitudesService, type SolicitudAyuda } from '../../core/services/solicitudes.service';

@Component({
    selector: 'app-solicitudes',
    standalone: true,
    imports: [IonContent, DatePipe, ChatAlertaComponent],
    templateUrl: './solicitudes.page.html',
    styleUrls: ['./solicitudes.page.scss'],
})
export class SolicitudesPage {
    private readonly auth = inject(AuthService);
    private readonly solicitudesAdulto = inject(SolicitudesService);
    private readonly alertasApoyo = inject(AlertasApoyoService);
    private readonly notificaciones = inject(NotificacionesPushService);
    private readonly chats = viewChildren(ChatAlertaComponent);
    private readonly visible = signal(true);
    private readonly intento = signal(0);

    readonly sesion = this.auth.sesion;
    readonly esAsistente = computed(() => this.auth.sesion()?.rol === 'ASISTENTE');
    readonly solicitudes = signal<SolicitudAyuda[]>([]);
    readonly cargando = signal(true);
    readonly error = signal('');

    constructor() {
        // Abre el chat indicado por un aviso cuando su solicitud ya está en pantalla.
        effect(() => {
            const id = this.notificaciones.chatPendiente();
            const chat = this.chats().find(c => c.alerta().idAlerta === id);
            if (id === null || !chat || !this.visible()) return;

            untracked(() => {
                this.notificaciones.consumirChatPendiente(id);
                chat.abrir();
            });
        });

        effect(onCleanup => {
            const cuenta = this.auth.sesion();
            const visible = this.visible();
            this.intento(); // Vuelve a consultar al pulsar Reintentar.

            this.solicitudes.set([]);
            this.error.set('');
            this.cargando.set(false);

            if (!visible) return;

            if (!cuenta) {
                this.error.set('Inicia sesión para consultar tus solicitudes.');
                return;
            }

            // Cada servicio usa el token de la cuenta que inició sesión.
            const historial = cuenta.rol === 'ASISTENTE'
                ? this.alertasApoyo.listar(cuenta)
                : this.solicitudesAdulto.listar(cuenta);

            this.cargando.set(true);

            const consulta = historial.subscribe({
                next: datos => {
                    if (this.auth.sesion() !== cuenta) return;

                    // Incluye todos los estados que entrega el backend.
                    // Ordena desde la solicitud más reciente.
                    const ordenadas = [...datos].sort((a, b) =>
                        b.fechaCreacion.localeCompare(a.fechaCreacion)
                        || b.idAlerta - a.idAlerta
                    );

                    this.solicitudes.set(ordenadas);
                    this.cargando.set(false);
                },
                error: (fallo: HttpErrorResponse) => {
                    if (this.auth.sesion() !== cuenta) return;

                    this.cargando.set(false);

                    if (fallo.status === 401) {
                        this.error.set('Tu sesión venció. Vuelve a iniciar sesión.');
                    } else if (fallo.status === 403) {
                        this.error.set('Tu cuenta no tiene permiso para consultar estas solicitudes.');
                    } else {
                        this.error.set('No pudimos cargar tus solicitudes. Inténtalo de nuevo.');
                    }
                },
            });

            // Cancela la petición al salir, cambiar de cuenta o reintentar.
            onCleanup(() => consulta.unsubscribe());
        });
    }

    ionViewWillEnter(): void {
        this.visible.set(true);
    }

    ionViewWillLeave(): void {
        this.visible.set(false);
    }

    // El adulto conversa con su red mientras la solicitud sigue abierta.
    tieneChat(solicitud: SolicitudAyuda): boolean {
        return !this.esAsistente() &&
            (solicitud.estado === 'ACTIVA' || solicitud.estado === 'PENDIENTE' ||
                solicitud.estado === 'EN_ATENCION');
    }

    reintentar(): void {
        this.intento.update(valor => valor + 1);
    }
}