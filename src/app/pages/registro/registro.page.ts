import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize, TimeoutError } from 'rxjs';
import {
    RegistroService,
    type DatosRegistro,
    type TipoCuenta,
} from '../../core/services/registro.service';

@Component({
    selector: 'app-registro',
    standalone: true,
    imports: [IonContent, RouterLink],
    templateUrl: './registro.page.html',
    styleUrls: ['./registro.page.scss'],
})
export class RegistroPage {
    private readonly registro = inject(RegistroService);

    readonly mostrarClave = signal(false);
    readonly tipoCuenta = signal<TipoCuenta>('persona_adulta');
    readonly error = signal('');
    readonly resultado = signal('');
    readonly cargando = signal(false);
    readonly registrado = signal(false);

    limpiarMensajes(): void {
        if (this.cargando() || this.registrado()) return;
        this.error.set('');
        this.resultado.set('');
    }

    seleccionarTipo(tipo: TipoCuenta): void {
        if (this.cargando() || this.registrado()) return;
        this.tipoCuenta.set(tipo);
        this.limpiarMensajes();
    }

    alternarClave(): void {
        this.mostrarClave.update(visible => !visible);
    }

    registrarCuenta(formulario: HTMLFormElement): void {
        if (this.cargando() || this.registrado()) return;

        this.limpiarMensajes();

        const datos = new FormData(formulario);
        const tipo = this.tipoCuenta();
        const nombre = String(datos.get('nombre') ?? '').trim();
        const correo = String(datos.get('correo') ?? '').trim().toLowerCase();
        const clave = String(datos.get('clave') ?? '');
        const confirmacion = String(datos.get('confirmacion') ?? '');
        const codigo = String(datos.get('codigoVinculacion') ?? '').trim().toUpperCase();

        // Permite escribir, por ejemplo, +56 9 1234 5678 y envía +56912345678.
        const telefono = String(datos.get('telefono') ?? '')
            .trim()
            .replace(/[\s()-]/g, '');

        const campoCorreo = formulario.elements.namedItem('correo') as HTMLInputElement;

        if (!nombre || nombre.length > 150) {
            this.indicarError(formulario, 'nombre',
                'Ingresa tu nombre completo, con un máximo de 150 caracteres.');
            return;
        }

        // La misma validación se aplica al adulto y al asistente.
        if (!telefono) {
            this.indicarError(formulario, 'telefono',
                'Ingresa tu teléfono de contacto para crear tu cuenta.');
            return;
        }

        if (!/^\+?[0-9]{7,15}$/.test(telefono)) {
            this.indicarError(formulario, 'telefono',
                'Ingresa un teléfono de 7 a 15 dígitos. Puedes incluir el prefijo +56.');
            return;
        }

        if (!correo || correo.length > 150 || campoCorreo.validity.typeMismatch) {
            this.indicarError(formulario, 'correo', 'Ingresa un correo electrónico válido.');
            return;
        }

        if (!clave.trim() || clave.length < 8) {
            this.indicarError(formulario, 'clave',
                'La contraseña debe tener al menos 8 caracteres.');
            return;
        }

        if (!confirmacion || clave !== confirmacion) {
            this.indicarError(formulario, 'confirmacion', 'Las contraseñas deben coincidir.');
            return;
        }

        if (tipo === 'red_apoyo' && (!codigo || codigo.length > 20)) {
            this.indicarError(formulario, 'codigoVinculacion',
                'Ingresa el código de vinculación recibido, de hasta 20 caracteres.');
            return;
        }

        const solicitud: DatosRegistro = {
            nombreApellido: nombre,
            telefono,
            correo,
            password: clave,
            ...(tipo === 'red_apoyo' ? { codigoVinculacion: codigo } : {}),
        };

        this.cargando.set(true);
        this.registro.registrar(tipo, solicitud).pipe(
            finalize(() => this.cargando.set(false))
        ).subscribe({
            next: () => {
                formulario.reset();
                this.mostrarClave.set(false);
                this.registrado.set(true);
                this.resultado.set(tipo === 'red_apoyo'
                    ? 'Tu cuenta fue creada. La solicitud de vinculación está pendiente de aprobación de la persona adulta. Ya puedes iniciar sesión.'
                    : 'Tu cuenta fue creada correctamente. Ya puedes iniciar sesión.');
            },
            error: (fallo: unknown) => {
                this.error.set(this.obtenerMensajeError(fallo));
            },
        });
    }

    private indicarError(formulario: HTMLFormElement, campo: string, mensaje: string): void {
        this.error.set(mensaje);
        const control = formulario.elements.namedItem(campo);
        if (control instanceof HTMLInputElement) control.focus();
    }

    private obtenerMensajeError(fallo: unknown): string {
        if (fallo instanceof TimeoutError ||
            (fallo instanceof HttpErrorResponse && fallo.status === 0)) {
            return 'No pudimos confirmar si se creó tu cuenta. Intenta iniciar sesión antes de volver a registrarte.';
        }

        if (fallo instanceof HttpErrorResponse) {
            switch (fallo.status) {
                case 400:
                    return 'Revisa tus datos. Si elegiste Red de apoyo, comprueba el código de vinculación.';
                case 404:
                    return 'No se encontró el recurso solicitado. Si elegiste Red de apoyo, verifica el código recibido.';
                case 409:
                    return 'No se pudo completar el registro. Si ya registraste este correo, intenta iniciar sesión.';
                case 403:
                    return 'El servidor no permite completar este registro. Contacta al administrador.';
            }
        }

        return 'No se pudo completar el registro. Inténtalo nuevamente más tarde.';
    }
}