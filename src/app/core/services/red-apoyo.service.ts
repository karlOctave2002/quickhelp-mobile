import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin } from 'rxjs';

export interface SolicitudPendiente {
    idSolicitud: number;
    nombreAsistente: string;
}

export interface IntegranteRed {
    idRedApoyo: number;
    nombreIntegrante: string;
    estado: boolean;
}

@Injectable({ providedIn: 'root' })
export class RedApoyoService {
    private readonly http = inject(HttpClient);
    private readonly api = 'https://quickhelp-backend.onrender.com/api';

    // Consulta las solicitudes pendientes y los integrantes de la persona adulta.
    consultar(token: string) {
        const opciones = {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 60000,
        };

        return forkJoin({
            pendientes: this.http.get<SolicitudPendiente[]>(
                `${this.api}/vinculaciones/pendientes`, opciones
            ),
            integrantes: this.http.get<IntegranteRed[]>(
                `${this.api}/red-apoyo`, opciones
            ),
        });
    } // Aquí termina consultar().

    // Acepta o rechaza la solicitud que la persona adulta seleccionó.
    resolverSolicitud(token: string, idSolicitud: number, accion: 'aprobar' | 'rechazar') {
        return this.http.post<void>(
            `${this.api}/vinculaciones/${idSolicitud}/${accion}`,
            null,
            {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 60000,
            }
        );
    }

    // Retira (desactiva) o vuelve a agregar (reactiva) a un integrante de la red.
    cambiarEstado(token: string, idRedApoyo: number, accion: 'desactivar' | 'reactivar') {
        return this.http.patch<void>(
            `${this.api}/red-apoyo/${idRedApoyo}/${accion}`,
            null,
            {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 60000,
            }
        );
    }
}