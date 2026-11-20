import { HttpClient } from '@angular/common/http'; // Peticiones al backend.
import { Injectable, inject } from '@angular/core'; // Servicio e inyección.
import type { SesionUsuario } from './auth.service';
import type { SolicitudAyuda } from './solicitudes.service';

export type TipoRespuestaApoyo =
    | 'VOY_EN_CAMINO'
    | 'VOY_A_DEMORAR'
    | 'NO_PUEDO_ASISTIR'
    | 'PERSONALIZADA';

export interface RespuestaAlerta {
    idRespuesta: number;
    idAlerta: number;
    idIntegrante: number;
    nombreIntegrante?: string; // Nombre enviado por el backend actualizado.
    tipoRespuesta: TipoRespuestaApoyo;
    observacion: string | null;
    fechaHora: string;
}

// Última ubicación registrada para una emergencia autorizada.
export interface UbicacionAlerta {
    idAlerta: number;
    disponible: boolean;
    latitud: number | null;
    longitud: number | null;
    precisionMetros: number | null;
    fechaHora: string | null;
}

// Adulto mayor vinculado a la cuenta del asistente.
export interface PersonaVinculada {
    idAdultoMayor: number;
    nombreAdultoMayor: string;
}

export interface ResultadoDireccion {
    addressComponents?: { longText: string; types: string[] }[];
}

export interface DireccionAlerta {
    latitud: number;
    longitud: number;
    geocodificacion: { results?: ResultadoDireccion[] };
}

@Injectable({ providedIn: 'root' })
export class AlertasApoyoService {
    private readonly http = inject(HttpClient);
    private readonly api = 'https://quickhelp-backend.onrender.com/api/alertas';

    private opciones(cuenta: SesionUsuario) {
        return {
            headers: { Authorization: `Bearer ${cuenta.token}` },
            timeout: 60000,
        };
    }

    listar(cuenta: SesionUsuario) {
        return this.http.get<SolicitudAyuda[]>(
            `${this.api}/mi-red`, this.opciones(cuenta)
        );
    }

    // Personas a las que apoya el asistente autenticado.
    listarPersonas(cuenta: SesionUsuario) {
        return this.http.get<PersonaVinculada[]>(
            'https://quickhelp-backend.onrender.com/api/red-apoyo/personas',
            this.opciones(cuenta)
        );
    }

    consultarUbicacion(cuenta: SesionUsuario, idAlerta: number) {
        // El backend verifica que la cuenta tenga acceso a esta alerta.
        return this.http.get<UbicacionAlerta>(
            `${this.api}/${idAlerta}/ubicacion`, this.opciones(cuenta)
        );
    }

    consultarDireccion(cuenta: SesionUsuario, idAlerta: number) {
        // Render consulta al proveedor usando las coordenadas autorizadas de la alerta.
        return this.http.get<DireccionAlerta | null>(
            `${this.api}/${idAlerta}/ubicacion/direccion`, this.opciones(cuenta)
        );
    }

    listarRespuestas(cuenta: SesionUsuario, idAlerta: number) {
        return this.http.get<RespuestaAlerta[]>(
            `${this.api}/${idAlerta}/respuestas`, this.opciones(cuenta)
        );
    }

    responder(
        cuenta: SesionUsuario,
        idAlerta: number,
        tipoRespuesta: TipoRespuestaApoyo,
        observacion: string | null
    ) {
        return this.http.post<{ idRespuesta: number }>(
            `${this.api}/${idAlerta}/respuestas`,
            { tipoRespuesta, observacion },
            this.opciones(cuenta)
        );
    }
}