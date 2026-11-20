import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { SesionUsuario } from './auth.service';

export interface MiPerfil {
    idUsuario: number;
    nombreApellido: string;
    correo: string;
    telefono: string | null;
    rol: string;
    vozActiva: boolean;
    fraseActivacion: string | null;
}

// Campos que la persona puede editar desde Mi perfil.
export type CambiosPerfil = Pick<MiPerfil, 'nombreApellido' | 'correo' | 'telefono'>;

@Injectable({ providedIn: 'root' })
export class MiPerfilService {
    private readonly http = inject(HttpClient);
    private readonly url = 'https://quickhelp-backend.onrender.com/api/mi-perfil';

    consultar(cuenta: SesionUsuario) {
        return this.http.get<MiPerfil>(this.url, this.opciones(cuenta));
    }

    actualizar(cuenta: SesionUsuario, cambios: CambiosPerfil) {
        return this.http.put<MiPerfil>(this.url, {
            nombreApellido: cambios.nombreApellido.trim(),
            correo: cambios.correo.trim(),
            telefono: cambios.telefono?.trim() || null,
        }, this.opciones(cuenta));
    }

    // Guarda en la cuenta si la activación por voz está encendida y su frase.
    configurarVoz(cuenta: SesionUsuario, vozActiva: boolean, fraseActivacion: string | null) {
        return this.http.put<MiPerfil>(`${this.url}/voz`, {
            vozActiva,
            fraseActivacion: fraseActivacion?.trim() || null,
        }, this.opciones(cuenta));
    }

    private opciones(cuenta: SesionUsuario) {
        // El backend identifica la cuenta por el token de la sesión.
        return {
            headers: { Authorization: `Bearer ${cuenta.token}` },
            timeout: 60000,
        };
    }
}