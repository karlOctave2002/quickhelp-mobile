import { Injectable, signal } from '@angular/core'; // Servicio compartido con estado reactivo.

export type RespuestaApoyo =
    | 'pendiente'
    | 'en_camino'
    | 'no_puedo'
    | 'demora'
    | 'personalizada'; // Respuesta del contacto, independiente del estado de la emergencia.

interface SolicitudApoyoDemo {
    readonly id: string;
    readonly nombrePersona: string;
    readonly descripcion: string;
    readonly respuesta: RespuestaApoyo;
    readonly mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class SolicitudesApoyoDemoService {
    private readonly solicitudInicial: SolicitudApoyoDemo = {
        id: 'solicitud-demo-1',
        nombrePersona: 'Marta · Persona de prueba',
        descripcion: 'Necesito asistencia.',
        respuesta: 'pendiente',
        mensaje: '',
    };

    private readonly solicitudInterna = signal<SolicitudApoyoDemo>({
        ...this.solicitudInicial,
    }); // Conserva los datos únicamente en memoria.

    readonly solicitud = this.solicitudInterna.asReadonly(); // Estado disponible para las vistas.

    responder(respuesta: Exclude<RespuestaApoyo, 'pendiente'>, mensaje = ''): void {
        const texto = mensaje.trim(); // Elimina espacios sobrantes del mensaje.
        if (respuesta === 'personalizada' && !texto) return; // Impide respuestas vacías.

        this.solicitudInterna.update(solicitud =>
            solicitud.respuesta === 'pendiente'
                ? { ...solicitud, respuesta, mensaje: respuesta === 'personalizada' ? texto : '' }
                : solicitud
        ); // Registra una sola respuesta por prueba.
    }

    reiniciar(): void {
        this.solicitudInterna.set({ ...this.solicitudInicial }); // Restablece la solicitud.
    }
}