import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import {
    RedApoyoService,
    type IntegranteRed,
    type SolicitudPendiente,
} from '../../core/services/red-apoyo.service';
import { FilaContactoComponent } from '../../shared/components/fila-contacto/fila-contacto.component';

@Component({
    selector: 'app-red-apoyo',
    standalone: true,
    imports: [IonContent, RouterLink, FilaContactoComponent],
    templateUrl: './red-apoyo.page.html',
    styleUrls: ['./red-apoyo.page.scss'],
})
export class RedApoyoPage {
    private readonly auth = inject(AuthService);
    private readonly red = inject(RedApoyoService);
    private consulta?: Subscription;

    readonly sesion = this.auth.sesion;
    readonly pendientes = signal<SolicitudPendiente[]>([]);
    readonly integrantes = signal<IntegranteRed[]>([]);
    readonly cargando = signal(false);
    readonly procesando = signal(false);
    readonly error = signal('');
    readonly avisoAccion = signal('');
    readonly confirmandoRetiro = signal<IntegranteRed | null>(null); // Persona a punto de retirarse.

    // Ionic vuelve a consultar la red cada vez que se abre esta pestaña.
    ionViewWillEnter(): void {
        this.avisoAccion.set('');
        this.confirmandoRetiro.set(null);
        this.cargar();
    }

    ionViewWillLeave(): void {
        this.consulta?.unsubscribe();
    }

    cargar(): void {
        this.consulta?.unsubscribe();
        this.pendientes.set([]);
        this.integrantes.set([]);
        this.error.set('');
        this.cargando.set(false);

        const cuenta = this.sesion();
        if (!cuenta || cuenta.rol !== 'ADULTO_MAYOR') return;

        this.cargando.set(true);

        this.consulta = this.red.consultar(cuenta.token).subscribe({
            next: ({ pendientes, integrantes }) => {
                if (this.sesion() !== cuenta) return;

                this.pendientes.set(pendientes);
                this.integrantes.set(integrantes);
                this.cargando.set(false);
            },
            error: (fallo: HttpErrorResponse) => {
                if (this.sesion() !== cuenta) return;

                this.cargando.set(false);

                if (fallo.status === 401) {
                    this.auth.cerrarSesion();
                    return;
                }

                this.error.set(
                    fallo.status === 403
                        ? 'Esta cuenta no tiene permiso para consultar la red de apoyo.'
                        : 'No pudimos cargar tu red de apoyo. Inténtalo de nuevo.'
                );
            },
        });
    }

    // El botón ✓ aprueba la solicitud. El botón × rechaza solo la solicitud.
    resolver(solicitud: SolicitudPendiente, accion: 'aprobar' | 'rechazar'): void {
        const cuenta = this.sesion();
        if (!cuenta || cuenta.rol !== 'ADULTO_MAYOR' || this.procesando()) return;

        this.procesando.set(true); // Evita enviar dos veces por un doble toque.
        this.avisoAccion.set('');

        this.red.resolverSolicitud(cuenta.token, solicitud.idSolicitud, accion).subscribe({
            next: () => {
                this.procesando.set(false);
                if (this.sesion() !== cuenta) return;

                this.avisoAccion.set(
                    accion === 'aprobar'
                        ? `${solicitud.nombreAsistente} ahora forma parte de tu red.`
                        : `Rechazaste la solicitud de ${solicitud.nombreAsistente}.`
                );

                this.cargar(); // Muestra las listas actualizadas por el backend.
            },
            error: (fallo: HttpErrorResponse) => {
                this.procesando.set(false);
                if (this.sesion() !== cuenta) return;

                if (fallo.status === 401) {
                    this.auth.cerrarSesion();
                    return;
                }

                this.avisoAccion.set(
                    'No pudimos confirmar el cambio. Revisa si la solicitud sigue pendiente.'
                );
                this.cargar();
            },
        });
    }

    // «Retirar» primero pide confirmación dentro de la misma fila.
    pedirRetiro(persona: IntegranteRed): void {
        this.avisoAccion.set('');
        this.confirmandoRetiro.set(persona);
    }

    cancelarRetiro(): void {
        this.confirmandoRetiro.set(null);
    }

    // Desactiva o reactiva la vinculación; el backend conserva el historial.
    cambiarEstado(persona: IntegranteRed, accion: 'desactivar' | 'reactivar'): void {
        const cuenta = this.sesion();
        if (!cuenta || cuenta.rol !== 'ADULTO_MAYOR' || this.procesando()) return;

        this.procesando.set(true); // Evita enviar dos veces por un doble toque.
        this.avisoAccion.set('');

        this.red.cambiarEstado(cuenta.token, persona.idRedApoyo, accion).subscribe({
            next: () => {
                this.procesando.set(false);
                this.confirmandoRetiro.set(null);
                if (this.sesion() !== cuenta) return;

                this.avisoAccion.set(
                    accion === 'desactivar'
                        ? `${persona.nombreIntegrante} ya no forma parte de tu red.`
                        : `${persona.nombreIntegrante} volvió a tu red.`
                );

                this.cargar(); // Muestra la lista actualizada por el backend.
            },
            error: (fallo: HttpErrorResponse) => {
                this.procesando.set(false);
                this.confirmandoRetiro.set(null);
                if (this.sesion() !== cuenta) return;

                if (fallo.status === 401) {
                    this.auth.cerrarSesion();
                    return;
                }

                this.avisoAccion.set(
                    fallo.status === 409 && accion === 'reactivar'
                        ? `${persona.nombreIntegrante} no está disponible para volver a tu red.`
                        : 'No pudimos guardar el cambio. Inténtalo de nuevo.'
                );
                this.cargar();
            },
        });
    }
}