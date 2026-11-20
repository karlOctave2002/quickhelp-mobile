import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
    Component, ElementRef, OnChanges, OnDestroy, ViewChild,
    computed, inject, input, signal,
} from '@angular/core';
import { Subscription, timer } from 'rxjs';

import {
    AlertasApoyoService,
    type RespuestaAlerta,
    type TipoRespuestaApoyo,
} from '../../core/services/alertas-apoyo.service';
import type { SesionUsuario } from '../../core/services/auth.service';
import type { SolicitudAyuda } from '../../core/services/solicitudes.service';
import { ChatAlertaComponent, textoRespuesta } from './chat-alerta.component';
import { UbicacionAlertaComponent } from './ubicacion-alerta.component';

// Datos que devuelve el endpoint de mensajes.
interface MensajeVistaPrevia {
    idMensaje: number;
    idAutor: number;
    nombreAutor: string;
    texto: string;
    fechaHora: string;
}

// Formato común para comparar respuestas y mensajes.
interface ActividadConversacion {
    idAutor: number;
    nombreAutor: string;
    texto: string;
    fechaHora: string;
}

@Component({
    selector: 'app-tarjeta-alerta-apoyo',
    standalone: true,
    imports: [DatePipe, ChatAlertaComponent, UbicacionAlertaComponent],
    template: `
        @if (respondida()) {
            <!-- Toda la fila abre la conversación. -->
            <button
                type="button"
                class="fila-chat"
                aria-haspopup="dialog"
                [disabled]="sinAcceso()"
                (click)="chat.abrir()">

                <span class="avatar circular" aria-hidden="true">
                    {{ alerta().nombreAdultoMayor.charAt(0) }}
                </span>

                <span class="centro">
                    <strong>{{ alerta().nombreAdultoMayor }}</strong>
                    <span class="numero">
                        Solicitud #{{ alerta().idAlerta }}
                    </span>
                    <span class="preview">{{ vistaPrevia() }}</span>
                </span>

                <span class="lado">
                    @if (ultima(); as mensaje) {
                        <time [attr.datetime]="mensaje.fechaHora">
                            {{ mensaje.fechaHora | date:'HH:mm' }}
                        </time>
                    }

                    <span class="estado"
                        [class.atencion]="alerta().estado === 'EN_ATENCION'">
                        {{ etiquetaEstado() }}
                    </span>
                </span>
            </button>

            @if (errorPreview()) {
                <p class="nota" role="status">{{ errorPreview() }}</p>
            }
        } @else {
            <article class="tarjeta">
                <header class="cabecera">
                    <h3>Solicitud #{{ alerta().idAlerta }}</h3>
                    <time [attr.datetime]="alerta().fechaCreacion">
                        {{ alerta().fechaCreacion | date:'dd/MM · HH:mm' }}
                    </time>
                </header>

                <div class="persona">
                    <span class="avatar" aria-hidden="true">
                        {{ alerta().nombreAdultoMayor.charAt(0) }}
                    </span>

                    <div class="datos-persona">
                        <p class="nombre">{{ alerta().nombreAdultoMayor }}</p>
                        <p class="descripcion">Necesita tu ayuda</p>

                        <app-ubicacion-alerta
                            class="direccion-emergencia"
                            [idAlerta]="alerta().idAlerta"
                            [cuenta]="cuenta()" />
                    </div>
                </div>

                @if (alerta().estado === 'EN_ATENCION') {
                    <p class="estado atencion">En atención</p>
                }

                @if (consultando()) {
                    <p class="nota" role="status">
                        Consultando tu respuesta…
                    </p>
                } @else if (error()) {
                    <p class="error" role="alert">{{ error() }}</p>
                    <button class="secundario" type="button"
                        (click)="consultar()">
                        Volver a consultar
                    </button>
                } @else {
                    <fieldset [disabled]="enviando() || sinAcceso()">
                        <legend class="solo-lector">
                            Responder a la solicitud #{{ alerta().idAlerta }}
                        </legend>

                        <button class="principal" type="button"
                            (click)="enviar('VOY_EN_CAMINO')">
                            Voy en camino
                        </button>

                        <div class="secundarias">
                            <button class="secundario" type="button"
                                (click)="enviar('VOY_A_DEMORAR')">
                                Voy a demorar
                            </button>
                            <button class="secundario" type="button"
                                (click)="enviar('NO_PUEDO_ASISTIR')">
                                No puedo asistir
                            </button>
                        </div>

                        <form
                            (submit)="$event.preventDefault(); enviar('PERSONALIZADA')">
                            <label [for]="'mensaje-' + alerta().idAlerta">
                                O responde con un mensaje
                            </label>

                            <div class="barra">
                                <input
                                    #texto
                                    [id]="'mensaje-' + alerta().idAlerta"
                                    type="text"
                                    enterkeyhint="send"
                                    autocomplete="off"
                                    placeholder="Escribe tu respuesta…"
                                    [value]="borrador()"
                                    (input)="borrador.set(texto.value)" />

                                <button type="submit"
                                    [disabled]="!borrador().trim()">
                                    Enviar
                                </button>
                            </div>
                        </form>

                        @if (enviando()) {
                            <p class="nota" role="status">
                                Enviando respuesta…
                            </p>
                        }
                    </fieldset>
                }
            </article>
        }

        <app-chat-alerta
            #chat
            [alerta]="alerta()"
            [cuenta]="cuenta()"
            (respuestasActualizadas)="recibirRespuestas($event)" />
    `,
    styles: [`
        :host {
            display: block;
            --rojo: #bc1e38;
            --texto: #202633;
            --suave: #596677;
            --linea: #dfe5ed;
        }

        button, input { font: inherit; }
        button { cursor: pointer; }
        h3, p { margin: 0; }

        .tarjeta, .fila-chat {
            box-sizing: border-box;
            width: 100%;
            border: 1px solid var(--linea);
            background: white;
            color: var(--texto);
        }

        .tarjeta { padding: 18px; border-radius: 18px; }

        .cabecera, .persona, .barra, .secundarias {
            display: flex;
            align-items: center;
        }

        .cabecera { justify-content: space-between; gap: 8px; }
        .cabecera h3 { font-size: 1rem; }

        time, .numero, .descripcion, .nota, label {
            color: var(--suave);
            font-size: .875rem;
        }

        .persona { gap: 12px; margin: 18px 0; }
        .datos-persona { flex: 1; min-width: 0; }
        .direccion-emergencia { margin-top: 8px; }

        .avatar {
            display: grid;
            flex: 0 0 44px;
            width: 44px;
            height: 44px;
            place-items: center;
            border-radius: 14px;
            background: #fbe4e9;
            color: #a71930;
            font-weight: 700;
            font-size: 1.15rem;
        }

        .nombre {
            font-size: 1.1rem;
            font-weight: 700;
            overflow-wrap: anywhere;
        }

        .descripcion { margin-top: 3px; }
        .circular { border-radius: 50%; }

        .fila-chat {
            display: grid;
            grid-template-columns: 44px minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
            min-height: 82px;
            padding: 14px;
            border-radius: 16px;
            text-align: left;
        }

        .fila-chat:active { background: #fff6f8; }
        .centro, .lado { display: grid; gap: 4px; }
        .centro { min-width: 0; }

        .centro strong {
            font-size: 1rem;
            overflow-wrap: anywhere;
        }

        .centro .numero, .lado time { font-size: .75rem; }

        .preview {
            overflow: hidden;
            color: #455264;
            font-size: .875rem;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .lado {
            justify-items: end;
            align-self: start;
            gap: 8px;
        }

        .estado {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 20px;
            background: #fae3e8;
            color: #a71930;
            font-size: .75rem;
            font-weight: 700;
        }

        .estado.atencion {
            background: #fff4da;
            color: #79510b;
        }

        .tarjeta > .estado { margin-bottom: 10px; }

        fieldset {
            min-width: 0;
            margin: 0;
            padding: 0;
            border: 0;
        }

        .principal, .secundario {
            width: 100%;
            min-height: 44px;
            padding: 9px 12px;
            border-radius: 12px;
            font-weight: 700;
        }

        .principal {
            background: var(--rojo);
            color: white;
            border: 1px solid var(--rojo);
        }

        .secundario {
            background: white;
            color: #a71930;
            border: 1px solid #e3b7bf;
        }

        .secundarias { gap: 8px; margin-top: 8px; }
        .secundarias button { flex: 1; font-size: .875rem; }

        form {
            margin-top: 15px;
            padding-top: 13px;
            border-top: 1px solid var(--linea);
        }

        label { display: block; margin-bottom: 6px; }

        .barra {
            padding: 0 4px 0 10px;
            border: 1px solid #cad2df;
            border-radius: 12px;
        }

        input {
            flex: 1;
            min-width: 0;
            min-height: 44px;
            border: 0;
            color: var(--texto);
            background: white;
        }

        .barra button {
            min-height: 44px;
            padding: 0 8px;
            border: 0;
            color: #a71930;
            background: transparent;
            font-weight: 700;
        }

        button:disabled, fieldset:disabled button {
            opacity: .55;
            cursor: default;
        }

        .nota, .error { margin: 10px 0; line-height: 1.45; }
        .error { color: #a71930; }

        :focus-visible {
            outline: 2px solid #a71930;
            outline-offset: 2px;
        }

        .solo-lector {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip-path: inset(50%);
        }
    `],
})
export class TarjetaAlertaApoyoComponent implements OnChanges, OnDestroy {
    readonly alerta = input.required<SolicitudAyuda>();
    readonly cuenta = input.required<SesionUsuario>();

    @ViewChild(ChatAlertaComponent, { static: true })
    private chat!: ChatAlertaComponent;

    private readonly servicio = inject(AlertasApoyoService);
    private readonly http = inject(HttpClient);
    private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

    private consulta?: Subscription;
    private consultaMensajes?: Subscription;
    private envio?: Subscription;
    private reloj?: Subscription;
    private claveActual = '';
    private tokenActual = '';
    private abrirAlConsultar = false;

    readonly respondida = signal(false);
    readonly borrador = signal('');
    readonly consultando = signal(false);
    readonly enviando = signal(false);
    readonly error = signal('');
    readonly errorPreview = signal('');
    readonly sinAcceso = signal(false);

    private readonly ultimaRespuesta = signal<RespuestaAlerta | null>(null);
    private readonly ultimoMensaje = signal<MensajeVistaPrevia | null>(null);
    private readonly respuestaReciente = signal('');

    // Compara la última respuesta inicial con el último mensaje escrito.
    readonly ultima = computed<ActividadConversacion | null>(() => {
        const respuesta = this.ultimaRespuesta();
        const mensaje = this.ultimoMensaje();

        if (mensaje && (!respuesta || mensaje.fechaHora >= respuesta.fechaHora)) {
            return {
                idAutor: mensaje.idAutor,
                nombreAutor: mensaje.nombreAutor,
                texto: mensaje.texto,
                fechaHora: mensaje.fechaHora,
            };
        }

        if (!respuesta) return null;

        return {
            idAutor: respuesta.idIntegrante,
            nombreAutor: respuesta.nombreIntegrante?.trim() || 'Integrante de la red',
            texto: textoRespuesta(
                respuesta.tipoRespuesta, respuesta.observacion
            ),
            fechaHora: respuesta.fechaHora,
        };
    });

    readonly vistaPrevia = computed(() => {
        if (this.sinAcceso()) return 'Conversación no disponible';

        const mensaje = this.ultima();
        if (!mensaje) {
            return this.respuestaReciente() || 'Abre la conversación';
        }

        const autor = mensaje.idAutor === this.cuenta().idUsuario
            ? 'Tú'
            : mensaje.nombreAutor?.trim() || 'Integrante de la red';

        return `${autor}: ${mensaje.texto}`;
    });

    readonly etiquetaEstado = computed(() => {
        switch (this.alerta().estado) {
            case 'ACTIVA': return 'Activa';
            case 'EN_ATENCION': return 'En atención';
            case 'PENDIENTE': return 'Activa/Pendiente';
            default: return 'Cerrada';
        }
    });

    ngOnChanges(): void {
        const clave = `${this.cuenta().idUsuario}/${this.alerta().idAlerta}`;
        const token = this.cuenta().token;

        if (clave === this.claveActual && token === this.tokenActual) return;

        this.detenerConsultas();
        this.envio?.unsubscribe();

        this.claveActual = clave;
        this.tokenActual = token;
        this.enviando.set(false);
        this.respondida.set(false);
        this.sinAcceso.set(false);
        this.ultimaRespuesta.set(null);
        this.ultimoMensaje.set(null);
        this.respuestaReciente.set('');
        this.borrador.set('');
        this.errorPreview.set('');
        this.abrirAlConsultar = false;

        this.consultar();

        // Actualiza la tarjeta sin necesitar abrir la conversación.
        this.reloj = timer(5000, 5000).subscribe(() => {
            if (!this.puedeActualizar()) return;

            // El chat ya consulta las respuestas mientras está abierto.
            if (!this.chat?.abierto()) {
                this.cargarRespuestas(false);
            }

            if (this.respondida()) {
                this.cargarMensajes();
            }
        });
    }

    consultar(): void {
        if (this.sinAcceso()) return;

        this.cargarRespuestas(true);

        if (this.respondida()) {
            this.cargarMensajes();
        }
    }

    private puedeActualizar(): boolean {
        if (document.hidden || this.sinAcceso() || this.enviando()) return false;

        const elemento = this.elemento.nativeElement;

        // Ionic conserva algunas páginas ocultas: evita consultarlas.
        return elemento.isConnected
            && !elemento.closest('.ion-page-hidden, [hidden], [aria-hidden="true"]')
            && elemento.getClientRects().length > 0;
    }

    private cargarRespuestas(mostrarCarga: boolean): void {
        // Evita peticiones simultáneas a la misma ruta.
        if (this.consulta && !this.consulta.closed) return;

        if (mostrarCarga) this.consultando.set(true);

        this.consulta = this.servicio.listarRespuestas(
            this.cuenta(), this.alerta().idAlerta
        ).subscribe({
            next: respuestas => {
                const estabaRespondida = this.respondida();

                this.recibirRespuestas(respuestas);
                this.consultando.set(false);
                this.error.set('');

                if (this.respondida() && !estabaRespondida) {
                    this.cargarMensajes();
                }

                // Completa la apertura pedida por un aviso de mensaje.
                if (this.abrirAlConsultar) {
                    this.abrirAlConsultar = false;
                    if (this.respondida()) this.chat.abrir();
                }
            },
            error: (fallo: HttpErrorResponse) => {
                this.consultando.set(false);

                if (fallo.status === 401 || fallo.status === 403) {
                    this.denegarAcceso();
                    return;
                }

                this.error.set(
                    'No pudimos consultar las respuestas de esta solicitud.'
                );
            },
        });
    }

    private cargarMensajes(): void {
        if (this.sinAcceso()) return;
        if (this.consultaMensajes && !this.consultaMensajes.closed) return;

        const url = 'https://quickhelp-backend.onrender.com/api/alertas'
            + `/${this.alerta().idAlerta}/mensajes`;

        this.consultaMensajes = this.http.get<MensajeVistaPrevia[]>(url, {
            headers: { Authorization: `Bearer ${this.cuenta().token}` },
            timeout: 60000,
        }).subscribe({
            next: mensajes => {
                let ultimo: MensajeVistaPrevia | null = null;

                for (const mensaje of mensajes) {
                    if (
                        !ultimo ||
                        mensaje.fechaHora > ultimo.fechaHora ||
                        (
                            mensaje.fechaHora === ultimo.fechaHora &&
                            mensaje.idMensaje > ultimo.idMensaje
                        )
                    ) {
                        ultimo = mensaje;
                    }
                }

                this.ultimoMensaje.set(ultimo);
                this.errorPreview.set('');
            },
            error: (fallo: HttpErrorResponse) => {
                if (fallo.status === 401 || fallo.status === 403) {
                    this.denegarAcceso();
                    return;
                }

                // Conserva la última vista previa confirmada y avisa del fallo.
                this.errorPreview.set(
                    'No pudimos actualizar el último mensaje. Volveremos a intentarlo.'
                );
            },
        });
    }

    recibirRespuestas(respuestas: RespuestaAlerta[]): void {
        if (this.sinAcceso()) return;

        let ultima: RespuestaAlerta | null = null;
        let tieneRespuestaPropia = false;

        for (const respuesta of respuestas) {
            if (respuesta.idAlerta !== this.alerta().idAlerta) continue;

            if (respuesta.idIntegrante === this.cuenta().idUsuario) {
                tieneRespuestaPropia = true;
            }

            if (
                !ultima ||
                respuesta.fechaHora > ultima.fechaHora ||
                (
                    respuesta.fechaHora === ultima.fechaHora &&
                    respuesta.idRespuesta > ultima.idRespuesta
                )
            ) {
                ultima = respuesta;
            }
        }

        this.respondida.set(tieneRespuestaPropia);
        this.ultimaRespuesta.set(ultima);
    }

    // Al tocar un aviso de mensaje abre el chat si ya respondiste la solicitud.
    abrirDesdeAviso(): void {
        if (this.sinAcceso()) return;
        if (this.respondida()) {
            this.chat.abrir();
            return;
        }
        // Si la consulta de respuestas sigue en curso, abre al terminarla.
        this.abrirAlConsultar = true;
        this.consultar();
    }

    enviar(tipo: TipoRespuestaApoyo): void {
        if (
            this.enviando() ||
            this.consultando() ||
            this.respondida() ||
            this.sinAcceso() ||
            this.error()
        ) return;

        const observacion = tipo === 'PERSONALIZADA'
            ? this.borrador().trim()
            : null;

        if (tipo === 'PERSONALIZADA' && !observacion) return;

        // Cancela lecturas anteriores para que no sobrescriban el envío.
        this.consulta?.unsubscribe();
        this.consultaMensajes?.unsubscribe();
        this.enviando.set(true);

        this.envio = this.servicio.responder(
            this.cuenta(), this.alerta().idAlerta, tipo, observacion
        ).subscribe({
            next: () => {
                this.enviando.set(false);
                this.respondida.set(true);
                this.ultimaRespuesta.set(null);
                this.ultimoMensaje.set(null);
                this.respuestaReciente.set(
                    `Tú: ${textoRespuesta(tipo, observacion)}`
                );
                this.borrador.set('');
                this.chat.abrir();
                this.cargarMensajes();
            },
            error: (fallo: HttpErrorResponse) => {
                this.enviando.set(false);

                if (fallo.status === 401 || fallo.status === 403) {
                    this.denegarAcceso();
                    return;
                }

                this.error.set(
                    fallo.status === 409
                        ? 'La solicitud cambió. Vuelve a consultar para ver su respuesta.'
                        : 'No pudimos confirmar el envío. Consulta si quedó registrado.'
                );
            },
        });
    }

    private denegarAcceso(): void {
        this.sinAcceso.set(true);
        this.detenerConsultas();
        this.envio?.unsubscribe();
        this.enviando.set(false);
        this.consultando.set(false);
        this.ultimaRespuesta.set(null);
        this.ultimoMensaje.set(null);
        this.respuestaReciente.set('');

        const mensaje = 'Tu sesión ya no tiene acceso a esta conversación.';
        this.error.set(mensaje);
        this.errorPreview.set(mensaje);
        this.chat?.cerrar();
    }

    private detenerConsultas(): void {
        this.reloj?.unsubscribe();
        this.consulta?.unsubscribe();
        this.consultaMensajes?.unsubscribe();
    }

    ngOnDestroy(): void {
        this.detenerConsultas();
        this.envio?.unsubscribe();
    }
}