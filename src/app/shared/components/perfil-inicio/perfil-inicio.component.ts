import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MiPerfilService, type MiPerfil } from '../../../core/services/mi-perfil.service';

@Component({
    selector: 'app-perfil-inicio',
    standalone: true,
    templateUrl: './perfil-inicio.component.html',
    styleUrls: ['./perfil-inicio.component.scss'],
})
export class PerfilInicioComponent implements OnDestroy {
    private readonly auth = inject(AuthService);
    private readonly perfiles = inject(MiPerfilService);
    private readonly router = inject(Router);
    private consulta?: Subscription;

    readonly sesion = this.auth.sesion;
    readonly perfil = signal<MiPerfil | null>(null);
    readonly cargando = signal(false);
    readonly error = signal('');

    // El saludo aparece de inmediato con el nombre que ya entregó el login.
    readonly primerNombre = computed(() =>
        this.sesion()?.nombreApellido.trim().split(/\s+/)[0] || ''
    );

    readonly inicial = computed(() =>
        this.primerNombre().charAt(0).toLocaleUpperCase('es') || '—'
    );

    abrir(ventana: HTMLDialogElement): void {
        if (!this.sesion() || ventana.open) return;
        ventana.showModal();
        this.cargarPerfil();
    }

    cargarPerfil(): void {
        const cuenta = this.sesion();
        if (!cuenta) return;

        this.consulta?.unsubscribe();
        this.perfil.set(null);
        this.error.set('');
        this.cargando.set(true);

        this.consulta = this.perfiles.consultar(cuenta).subscribe({
            next: datos => {
                if (this.sesion() !== cuenta) return;
                this.cargando.set(false);

                if (!datos || datos.idUsuario !== cuenta.idUsuario) {
                    this.error.set('No pudimos confirmar los datos de tu perfil.');
                    return;
                }

                this.perfil.set(datos);
            },
            error: (fallo: HttpErrorResponse) => {
                if (this.sesion() !== cuenta) return;
                this.cargando.set(false);
                this.error.set(
                    fallo.status === 401
                        ? 'Tu sesión venció. Cierra sesión y vuelve a ingresar.'
                        : 'No pudimos cargar tus datos de contacto. Inténtalo de nuevo.'
                );
            },
        });
    }

    limpiar(): void {
        this.consulta?.unsubscribe();
        this.perfil.set(null);
        this.error.set('');
        this.cargando.set(false);
    }

    cerrarSesion(ventana: HTMLDialogElement): void {
        ventana.close();
        this.limpiar();
        this.auth.cerrarSesion();
        void this.router.navigateByUrl('/login', { replaceUrl: true });
    }

    ngOnDestroy(): void {
        this.consulta?.unsubscribe();
    }
}