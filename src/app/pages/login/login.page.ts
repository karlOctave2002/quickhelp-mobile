import { Component, inject, signal } from '@angular/core'; // Define la página y sus estados.
import { HttpErrorResponse } from '@angular/common/http'; // Identifica errores del backend.
import { Router, RouterLink } from '@angular/router'; // Permite navegar según el rol.
import { IonContent } from '@ionic/angular'; // Contenedor móvil.
import { finalize, TimeoutError } from 'rxjs'; // Finaliza la espera y reconoce tiempos agotados.
import { AuthService } from '../../core/services/auth.service'; // Gestiona la autenticación.

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [IonContent, RouterLink],
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
})
export class LoginPage {
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    readonly mostrarClave = signal(false);
    readonly cargando = signal(false);
    readonly error = signal('');

    // Con una sesión guardada, abre directamente la vista de la cuenta.
    ionViewWillEnter(): void {
        const sesion = this.auth.sesion();
        if (!sesion) return;

        void this.router.navigateByUrl(
            sesion.rol === 'ADULTO_MAYOR' ? '/home' : '/apoyo/inicio',
            { replaceUrl: true }
        );
    }

    alternarClave(): void {
        this.mostrarClave.update(visible => !visible);
    }

    iniciarSesion(formulario: HTMLFormElement): void {
        if (this.cargando()) return; // Evita envíos duplicados.

        this.error.set('');
        if (!formulario.reportValidity()) return;

        const datos = new FormData(formulario);
        const correo = String(datos.get('correo') ?? '').trim();
        const password = String(datos.get('clave') ?? '');

        if (!correo || !password.trim()) {
            this.error.set('Ingresa tu correo y contraseña.');
            return;
        }

        this.cargando.set(true);

        this.auth.iniciarSesion(correo, password).pipe(
            finalize(() => this.cargando.set(false)),
        ).subscribe({
            next: sesion => {
                formulario.reset(); // Limpia la contraseña después del acceso.
                this.mostrarClave.set(false);

                const destino = sesion.rol === 'ADULTO_MAYOR'
                    ? '/home'
                    : '/apoyo/inicio';

                void this.router.navigateByUrl(destino, { replaceUrl: true })
                    .then(navego => {
                        if (!navego) {
                            this.error.set('La sesión se inició, pero no se pudo abrir tu vista.');
                        }
                    })
                    .catch(() => {
                        this.error.set('La sesión se inició, pero ocurrió un error al abrir tu vista.');
                    });
            },
            error: (fallo: unknown) => {
                this.error.set(this.obtenerMensajeError(fallo));
            },
        });
    }

    private obtenerMensajeError(fallo: unknown): string {
        if (fallo instanceof TimeoutError) {
            return 'El servidor está tardando en responder. Inténtalo nuevamente.';
        }

        if (fallo instanceof HttpErrorResponse) {
            switch (fallo.status) {
                case 0:
                    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.';
                case 400:
                    return 'Revisa el formato del correo y completa la contraseña.';
                case 401:
                    return 'El correo o la contraseña son incorrectos.';
                case 403:
                    return 'Tu cuenta o su rol están inactivos. Contacta al administrador.';
                case 429:
                    return 'Hay demasiados intentos. Espera un momento e inténtalo nuevamente.';
                default:
                    return 'No se pudo iniciar sesión. Inténtalo nuevamente más tarde.';
            }
        }

        return fallo instanceof Error
            ? fallo.message
            : 'Ocurrió un error al iniciar sesión.';
    }
}