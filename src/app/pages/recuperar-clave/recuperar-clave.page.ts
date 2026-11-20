import { Component, OnDestroy, inject, signal } from '@angular/core'; // Página y sus estados.
import { HttpErrorResponse } from '@angular/common/http'; // Identifica errores del backend.
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize, TimeoutError } from 'rxjs';
import { RecuperarClaveService } from '../../core/services/recuperar-clave.service';

type Paso = 'correo' | 'codigo' | 'listo';

@Component({
    selector: 'app-recuperar-clave',
    standalone: true,
    imports: [IonContent, RouterLink],
    templateUrl: './recuperar-clave.page.html',
    // Reutiliza el estilo del login para que se vea igual.
    styleUrls: ['../login/login.page.scss', './recuperar-clave.page.scss'],
})
export class RecuperarClavePage implements OnDestroy {
    private readonly servicio = inject(RecuperarClaveService);
    private readonly router = inject(Router);
    private reloj?: ReturnType<typeof setInterval>;

    readonly paso = signal<Paso>('correo');
    readonly correo = signal('');
    readonly cargando = signal(false);
    readonly error = signal('');
    readonly aviso = signal('');
    readonly mostrarClave = signal(false);
    readonly segundosReenvio = signal(0); // Espera antes de poder pedir otro código.

    ngOnDestroy(): void {
        this.detenerReloj();
    }

    // Al volver a entrar, empieza desde el primer paso.
    ionViewWillEnter(): void {
        this.paso.set('correo');
        this.error.set('');
        this.aviso.set('');
        this.mostrarClave.set(false);
    }

    alternarClave(): void {
        this.mostrarClave.update(visible => !visible);
    }

    // Paso 1: pide el código por correo.
    enviarCodigo(formulario: HTMLFormElement): void {
        if (this.cargando()) return;
        this.error.set('');
        if (!formulario.reportValidity()) return;

        const correo = String(new FormData(formulario).get('correo') ?? '').trim();
        if (!correo) {
            this.error.set('Escribe el correo de tu cuenta.');
            return;
        }
        this.pedirCodigo(correo);
    }

    // «Reenviar código» desde el paso 2.
    reenviarCodigo(): void {
        if (this.cargando() || this.segundosReenvio() > 0) return;
        this.error.set('');
        this.pedirCodigo(this.correo());
    }

    // Paso 2: valida el código y guarda la contraseña nueva.
    cambiarClave(formulario: HTMLFormElement): void {
        if (this.cargando()) return;
        this.error.set('');
        this.aviso.set('');
        if (!formulario.reportValidity()) return;

        const datos = new FormData(formulario);
        const codigo = String(datos.get('codigo') ?? '').replace(/\s/g, '');
        const nuevaClave = String(datos.get('nueva') ?? '');
        const confirmacion = String(datos.get('confirmacion') ?? '');

        if (!/^\d{6}$/.test(codigo)) {
            this.error.set('El código tiene 6 números.');
            return;
        }
        if (!nuevaClave.trim() || nuevaClave.length < 8) {
            this.error.set('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (nuevaClave !== confirmacion) {
            this.error.set('Las contraseñas deben coincidir.');
            return;
        }

        this.cargando.set(true);
        this.servicio.cambiarClave(this.correo(), codigo, nuevaClave).pipe(
            finalize(() => this.cargando.set(false)),
        ).subscribe({
            next: () => {
                formulario.reset(); // No deja la contraseña escrita en pantalla.
                this.detenerReloj();
                this.paso.set('listo');
            },
            error: (fallo: unknown) => this.error.set(this.mensajeError(fallo, 'cambiar')),
        });
    }

    irAlLogin(): void {
        void this.router.navigateByUrl('/login', { replaceUrl: true });
    }

    private pedirCodigo(correo: string): void {
        this.cargando.set(true);
        this.servicio.solicitarCodigo(correo).pipe(
            finalize(() => this.cargando.set(false)),
        ).subscribe({
            next: () => {
                this.correo.set(correo);
                this.aviso.set(this.paso() === 'codigo' ? 'Te enviamos un código nuevo.' : '');
                this.paso.set('codigo');
                this.iniciarReloj();
            },
            error: (fallo: unknown) => this.error.set(this.mensajeError(fallo, 'solicitar')),
        });
    }

    private iniciarReloj(): void {
        this.detenerReloj();
        this.segundosReenvio.set(60);
        this.reloj = setInterval(() => {
            this.segundosReenvio.update(s => Math.max(0, s - 1));
            if (this.segundosReenvio() === 0) this.detenerReloj();
        }, 1000);
    }

    private detenerReloj(): void {
        if (this.reloj) clearInterval(this.reloj);
        this.reloj = undefined;
    }

    private mensajeError(fallo: unknown, accion: 'solicitar' | 'cambiar'): string {
        if (fallo instanceof TimeoutError) {
            return 'El servidor está tardando en responder. Inténtalo nuevamente.';
        }
        if (fallo instanceof HttpErrorResponse) {
            // Usa el mensaje del backend cuando viene (por ejemplo, «Te quedan 3 intentos»).
            const mensaje = (fallo.error as { message?: unknown } | null)?.message;
            if (fallo.status === 0) {
                return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.';
            }
            if (typeof mensaje === 'string' && mensaje.trim() && fallo.status < 500) return mensaje;
            if (fallo.status === 400) {
                return accion === 'solicitar'
                    ? 'Revisa el formato del correo.'
                    : 'El código es incorrecto o ya venció. Revísalo o pide uno nuevo.';
            }
            if (fallo.status === 503) {
                return 'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.';
            }
        }
        return 'Ocurrió un error. Inténtalo nuevamente más tarde.';
    }
}
