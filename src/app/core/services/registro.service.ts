import { HttpClient } from '@angular/common/http'; // Envía el registro al backend.
import { Injectable, inject } from '@angular/core';
import { timeout } from 'rxjs';

// Tipos de cuenta disponibles en el formulario móvil.
export type TipoCuenta = 'persona_adulta' | 'red_apoyo';

export interface DatosRegistro {
    nombreApellido: string;
    correo: string;
    telefono: string;           // Obligatorio para ambos tipos de cuenta.
    password: string;
    codigoVinculacion?: string; // Solo se envía para la persona de apoyo.
}

@Injectable({ providedIn: 'root' })
export class RegistroService {
    private readonly http = inject(HttpClient);
    private readonly url = 'https://quickhelp-backend.onrender.com/api/auth/registro';

    registrar(tipo: TipoCuenta, datos: DatosRegistro) {
        const destino = tipo === 'red_apoyo' ? 'asistente' : 'adulto';

        return this.http.post<void>(`${this.url}/${destino}`, datos).pipe(
            timeout(60000)
        );
    }
}