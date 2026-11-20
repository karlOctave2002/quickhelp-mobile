import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { SesionUsuario } from './auth.service';
import type { RespuestaAlerta } from './alertas-apoyo.service';

// Campos que devuelve el backend para cada solicitud.
export interface SolicitudAyuda {
    idAlerta: number;
    idAdultoMayor: number;
    nombreAdultoMayor: string;
    estado: string;
    tipoActivacion: string;
    fechaCreacion: string;
    fechaAtencion: string | null;
    fechaCierre: string | null;
}

// Coordenadas obtenidas del dispositivo al solicitar ayuda.
export interface CoordenadasEmergencia {
    latitud: number;
    longitud: number;
    precisionMetros: number;
}

// El backend devuelve el ID de la emergencia nueva o reutilizada.
export interface ResultadoEmergencia {
    idAlerta: number;
}

// Dirección de la ubicación actual, con el mismo formato que usa la tarjeta.
export interface DireccionActual {
    latitud: number;
    longitud: number;
    geocodificacion: {
        results?: { addressComponents?: { longText: string; types: string[] }[] }[];
    };
}

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
    private readonly http = inject(HttpClient);
    private readonly url = 'https://quickhelp-backend.onrender.com/api/alertas';

    // Consulta las solicitudes del adulto autenticado.
    listar(cuenta: SesionUsuario) {
        return this.http.get<SolicitudAyuda[]>(this.url, {
            headers: { Authorization: `Bearer ${cuenta.token}` },
            timeout: 60000,
        });
    }

    // Envía el GPS junto con la solicitud de emergencia.
    // Si no se pudo obtener ubicación, permite solicitar ayuda sin GPS.
    crear(
        cuenta: SesionUsuario,
        coordenadas: CoordenadasEmergencia | null
    ) {
        return this.http.post<ResultadoEmergencia>(
            this.url,
            coordenadas ?? {},
            {
                headers: { Authorization: `Bearer ${cuenta.token}` },
                timeout: 60000,
            }
        );
    }

    // Pide al backend la dirección del punto donde está el adulto.
    // Las coordenadas viajan en el cuerpo para no quedar en la URL.
    consultarDireccionActual(cuenta: SesionUsuario, latitud: number, longitud: number) {
        return this.http.post<DireccionActual>(
            'https://quickhelp-backend.onrender.com/api/ubicacion/direccion',
            { latitud, longitud },
            {
                headers: { Authorization: `Bearer ${cuenta.token}` },
                timeout: 60000,
            }
        );
    }

    // Respuestas de la red para saber si ya hay un asistente en el chat.
    listarRespuestas(cuenta: SesionUsuario, idAlerta: number) {
        return this.http.get<RespuestaAlerta[]>(
            `${this.url}/${idAlerta}/respuestas`,
            {
                headers: { Authorization: `Bearer ${cuenta.token}` },
                timeout: 60000,
            }
        );
    }

    // Publica en el chat de la emergencia un mensaje del adulto.
    // La clave evita duplicar el mensaje si se reintenta el envío.
    enviarMensaje(cuenta: SesionUsuario, idAlerta: number, texto: string, clave: string) {
        return this.http.post<unknown>(
            `${this.url}/${idAlerta}/mensajes`,
            { texto, clave },
            {
                headers: { Authorization: `Bearer ${cuenta.token}` },
                timeout: 60000,
            }
        );
    }
}