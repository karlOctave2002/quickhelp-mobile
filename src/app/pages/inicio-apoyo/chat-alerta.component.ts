import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
    Component, ElementRef, OnChanges, OnDestroy, ViewChild,
    inject, input, output, signal,
} from '@angular/core';
import { Subscription, timer } from 'rxjs';

import {
    AlertasApoyoService,
    type RespuestaAlerta,
    type TipoRespuestaApoyo,
} from '../../core/services/alertas-apoyo.service';
import type { SesionUsuario } from '../../core/services/auth.service';
import type { SolicitudAyuda } from '../../core/services/solicitudes.service';
import { UbicacionAlertaComponent } from './ubicacion-alerta.component';

// También la utiliza la tarjeta de emergencia.
export function textoRespuesta(
    tipo: TipoRespuestaApoyo,
    observacion: string | null
): string {
    const etiquetas: Record<TipoRespuestaApoyo, string> = {
        VOY_EN_CAMINO: 'Voy en camino',
        VOY_A_DEMORAR: 'Voy a demorar',
        NO_PUEDO_ASISTIR: 'No puedo asistir',
        PERSONALIZADA: 'Respuesta personalizada',
    };

    const detalle = observacion?.trim();

    if (!detalle) return etiquetas[tipo];

    return tipo === 'PERSONALIZADA'
        ? detalle
        : `${etiquetas[tipo]} · ${detalle}`;
}

interface MensajeChat {
    idMensaje: number;
    idAutor: number;
    nombreAutor: string;
    texto: string;
    fechaHora: string;
}

interface Burbuja {
    clave: string;
    idAutor: number;
    autor: string;
    texto: string;
    fecha: string;
}

@Component({
    selector: 'app-chat-alerta',
    standalone: true,
    imports: [DatePipe, UbicacionAlertaComponent],
    template: `
        <dialog
            #ventana
            [attr.aria-labelledby]="'titulo-chat-' + alerta().idAlerta"
            (close)="alCerrar()">

            <div class="chat">
                <header class="cabecera">
                    <button
                        type="button"
                        class="volver"
                        (click)="cerrar()"
                        aria-label="Volver a solicitudes"
                        autofocus>
                        ‹ Volver
                    </button>

                    <div class="titulo">
                        <!-- La dirección sustituye al título Solicitud #. -->
                        <div
                            role="heading"
                            aria-level="2"
                            [id]="'titulo-chat-' + alerta().idAlerta">
                            <app-ubicacion-alerta
                                [idAlerta]="alerta().idAlerta"
                                [cuenta]="cuenta()"
                                [activa]="abierto()" />
                        </div>

                        <!-- El adulto ve su propio chat en Solicitudes. -->
                        <p>{{ alerta().idAdultoMayor === cuenta().idUsuario
                            ? 'Tú y tu red de apoyo'
                            : alerta().nombreAdultoMayor + ' y su red' }}</p>
                    </div>

                    <span class="estado">
                        {{ cerrada() ? 'Cerrada' :
                            alerta().estado === 'EN_ATENCION' ? 'En atención'
                                : alerta().estado === 'PENDIENTE' ? 'Activa/Pendiente' : 'Activa' }}
                    </span>
                </header>

                <section
                    #lista
                    class="mensajes"
                    aria-label="Conversación de la solicitud">

                    @if (errorLectura()) {
                        <p class="aviso" role="status">
                            {{ errorLectura() }}
                        </p>
                    }

                    @for (mensaje of burbujas(); track mensaje.clave) {
                        <article
                            class="burbuja"
                            [class.propia]="mensaje.idAutor === cuenta().idUsuario">
                            <strong>
                                {{ mensaje.idAutor === cuenta().idUsuario
                                    ? 'Tú' : mensaje.autor }}
                            </strong>

                            <p>{{ mensaje.texto }}</p>

                            <time [attr.datetime]="mensaje.fecha">
                                {{ mensaje.fecha | date:'dd/MM · HH:mm' }}
                            </time>
                        </article>
                    }
                </section>

                <!-- El formulario permanece debajo de la conversación. -->
                <footer class="pie-chat">
                    @if (errorEnvio()) {
                        <p class="error" role="alert">{{ errorEnvio() }}</p>
                    }

                    <form
                        class="compositor"
                        (submit)="$event.preventDefault(); enviar()">
                        <input
                            #campo
                            type="text"
                            aria-label="Mensaje para la red de apoyo"
                            placeholder="Escribe un mensaje…"
                            maxlength="2000"
                            enterkeyhint="send"
                            autocomplete="off"
                            [value]="borrador()"
                            [disabled]="enviando() || bloqueada() || cerrada()"
                            (input)="editar(campo.value)" />

                        <button
                            type="submit"
                            class="boton-enviar"
                            [disabled]="!borrador().trim() || enviando() || bloqueada() || cerrada()">
                            {{ enviando() ? 'Enviando…' : 'Enviar' }}
                        </button>
                    </form>
                </footer>
            </div>
        </dialog>
    `,
    styles: [`
        dialog {
            box-sizing: border-box;
            width: min(100%, 500px);
            height: min(85dvh, 720px);
            max-width: 100%;
            max-height: 100dvh;
            margin: auto;
            padding: 0;
            overflow: hidden;
            border: 0;
            border-radius: 18px;
            background: #fff;
            color: #202633;
            font-family: inherit;
        }

        dialog::backdrop {
            background: rgb(25 32 45 / 45%);
        }

        .chat {
            display: grid;
            grid-template-rows: auto minmax(0, 1fr) auto;
            height: 100%;
        }

        .cabecera {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            border-bottom: 1px solid #e4e8ef;
        }

        h2, p { margin: 0; }
        button, input { font: inherit; }

        button {
            min-height: 44px;
            cursor: pointer;
        }

        .titulo {
            flex: 1;
            min-width: 0;
        }

        .titulo p {
            margin-top: 3px;
            color: #596677;
            font-size: .83rem;
            overflow-wrap: anywhere;
        }

        .volver {
            flex-shrink: 0;
            padding: 0 4px;
            border: 0;
            background: transparent;
            color: #aa1932;
            font-weight: 700;
        }

        .estado {
            padding: 5px 8px;
            border-radius: 20px;
            background: #fbe4e9;
            color: #99162d;
            font-size: .78rem;
        }

        .mensajes {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
            overflow-y: auto;
            padding: 18px 16px;
        }

        .burbuja {
            box-sizing: border-box;
            flex-shrink: 0;
            align-self: flex-start;
            max-width: 82%;
            padding: 10px 13px;
            border-radius: 16px 16px 16px 4px;
            background: #f0f2f5;
            overflow-wrap: anywhere;
        }

        .burbuja.propia {
            align-self: flex-end;
            border-radius: 16px 16px 4px 16px;
            background: #b91e38;
            color: #fff;
        }

        .burbuja strong { font-size: .8rem; }

        .burbuja p {
            margin: 4px 0;
            line-height: 1.4;
            white-space: pre-wrap;
        }

        time {
            display: block;
            color: #596677;
            font-size: .72rem;
            text-align: right;
        }

        .propia time { color: #ffebef; }

        .pie-chat {
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
            border-top: 1px solid #e4e8ef;
            background: #fff;
        }

        .compositor {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .compositor input {
            box-sizing: border-box;
            flex: 1;
            min-width: 0;
            min-height: 44px;
            padding: 0 14px;
            border: 1px solid #ccd3de;
            border-radius: 22px;
            background: #f7f8fa;
            color: #202633;
            font-size: 16px;
        }

        .boton-enviar {
            padding: 0 16px;
            border: 0;
            border-radius: 22px;
            background: #b91e38;
            color: #fff;
            font-weight: 700;
        }

        .boton-enviar:disabled {
            opacity: .5;
            cursor: default;
        }

        .error {
            margin-bottom: 8px;
            color: #a71930;
            font-size: .85rem;
        }

        .aviso {
            color: #596677;
            font-size: .85rem;
            text-align: center;
        }

        :focus-visible {
            outline: 2px solid #a71930;
            outline-offset: 2px;
        }

        @media (max-width: 540px) {
            dialog {
                inset: 0;
                width: 100%;
                height: 100dvh;
                margin: 0;
                border-radius: 0;
            }

            .cabecera {
                padding-top: calc(12px + env(safe-area-inset-top, 0px));
            }
        }
    `],
})
export class ChatAlertaComponent implements OnChanges, OnDestroy {
    readonly alerta = input.required<SolicitudAyuda>();
    readonly cuenta = input.required<SesionUsuario>();
    readonly respuestasActualizadas = output<RespuestaAlerta[]>();

    @ViewChild('ventana', { static: true })
    private ventana!: ElementRef<HTMLDialogElement>;

    @ViewChild('lista', { static: true })
    private lista!: ElementRef<HTMLElement>;

    private readonly http = inject(HttpClient);
    private readonly servicio = inject(AlertasApoyoService);

    private reloj?: Subscription;
    private consultaRespuestas?: Subscription;
    private consultaMensajes?: Subscription;
    private envio?: Subscription;

    private contexto = '';
    private claveEnvio = '';
    private respuestas: RespuestaAlerta[] = [];
    private textos: MensajeChat[] = [];

    readonly abierto = signal(false);
    readonly burbujas = signal<Burbuja[]>([]);
    readonly borrador = signal('');
    readonly enviando = signal(false);
    readonly bloqueada = signal(false);
    readonly cerrada = signal(false);
    readonly errorLectura = signal('');
    readonly errorEnvio = signal('');

    ngOnChanges(): void {
        const contexto = `${this.cuenta().idUsuario}/${this.alerta().idAlerta}`;

        if (contexto !== this.contexto) {
            this.contexto = contexto;
            this.cerrar();
            this.envio?.unsubscribe();
            this.enviando.set(false);
            this.bloqueada.set(false);
            this.editar('');
            this.respuestas = [];
            this.textos = [];
            this.burbujas.set([]);
        }

        this.cerrada.set(
            this.alerta().estado !== 'ACTIVA' &&
            this.alerta().estado !== 'PENDIENTE' &&
            this.alerta().estado !== 'EN_ATENCION'
        );
    }

    abrir(): void {
        if (this.ventana.nativeElement.open) return;

        this.ventana.nativeElement.showModal();
        this.abierto.set(true); // Consulta la ubicación al abrir el chat.
        this.bloqueada.set(false);
        this.errorLectura.set('');
        this.reloj?.unsubscribe();
        this.reloj = timer(0, 5000).subscribe(() => this.actualizar());
    }

    cerrar(): void {
        this.abierto.set(false);
        this.detenerLectura();
        this.ventana?.nativeElement.close();
    }

    alCerrar(): void {
        if (!this.ventana.nativeElement.open) {
            this.abierto.set(false);
            this.detenerLectura();
        }
    }

    editar(valor: string): void {
        this.borrador.set(valor);
        this.claveEnvio = '';
        this.errorEnvio.set('');
    }

    enviar(): void {
        const texto = this.borrador().trim();

        if (
            !texto ||
            this.enviando() ||
            this.bloqueada() ||
            this.cerrada()
        ) return;

        // Conserva la clave al reintentar el mismo mensaje.
        this.claveEnvio ||= crypto.randomUUID();
        this.enviando.set(true);
        this.errorEnvio.set('');

        this.envio = this.http.post<void>(
            this.urlMensajes(),
            { texto, clave: this.claveEnvio },
            this.opciones()
        ).subscribe({
            next: () => {
                this.enviando.set(false);
                this.editar('');
                this.consultaMensajes?.unsubscribe();
                this.actualizar();
            },
            error: (fallo: HttpErrorResponse) => {
                this.enviando.set(false);

                if (fallo.status === 409) {
                    this.cerrada.set(true);
                    this.errorEnvio.set('La solicitud ya está cerrada.');
                } else if (fallo.status === 401 || fallo.status === 403) {
                    this.denegarAcceso();
                } else {
                    this.errorEnvio.set(
                        'No pudimos confirmar el envío. Puedes reintentar con el mismo texto.'
                    );
                }
            },
        });
    }

    private actualizar(): void {
        if (
            !this.ventana.nativeElement.open ||
            document.hidden ||
            this.bloqueada()
        ) return;

        // Mantiene las respuestas iniciales aunque falle la ruta de mensajes.
        if (!this.consultaRespuestas || this.consultaRespuestas.closed) {
            this.consultaRespuestas = this.servicio.listarRespuestas(
                this.cuenta(), this.alerta().idAlerta
            ).subscribe({
                next: datos => {
                    this.respuestas = datos;
                    this.respuestasActualizadas.emit(datos);
                    this.dibujarConversacion();
                },
                error: (fallo: HttpErrorResponse) => {
                    if (fallo.status === 401 || fallo.status === 403) {
                        this.denegarAcceso();
                    }
                },
            });
        }

        if (this.consultaMensajes && !this.consultaMensajes.closed) return;

        this.consultaMensajes = this.http.get<MensajeChat[]>(
            this.urlMensajes(), this.opciones()
        ).subscribe({
            next: datos => {
                this.textos = datos;
                this.errorLectura.set('');
                this.dibujarConversacion();
            },
            error: (fallo: HttpErrorResponse) => {
                if (fallo.status === 401 || fallo.status === 403) {
                    this.denegarAcceso();
                    return;
                }

                this.errorLectura.set(
                    'No pudimos cargar los mensajes del grupo. Volveremos a intentarlo.'
                );
            },
        });
    }

    private dibujarConversacion(): void {
        const lista = this.lista.nativeElement;
        const estabaAlFinal =
            lista.scrollHeight - lista.scrollTop - lista.clientHeight < 48;

        const iniciales: Burbuja[] = this.respuestas.map(respuesta => ({
            clave: `respuesta-${respuesta.idRespuesta}`,
            idAutor: respuesta.idIntegrante,
            autor: respuesta.nombreIntegrante?.trim() || 'Integrante de la red', // Muestra el nombre de la persona.
            texto: textoRespuesta(
                respuesta.tipoRespuesta,
                respuesta.observacion
            ),
            fecha: respuesta.fechaHora,
        }));

        const posteriores: Burbuja[] = this.textos.map(mensaje => ({
            clave: `mensaje-${mensaje.idMensaje}`,
            idAutor: mensaje.idAutor,
            autor: mensaje.nombreAutor,
            texto: mensaje.texto,
            fecha: mensaje.fechaHora,
        }));

        this.burbujas.set(
            [...iniciales, ...posteriores].sort(
                (a, b) => a.fecha.localeCompare(b.fecha)
            )
        );

        if (estabaAlFinal) {
            requestAnimationFrame(() => {
                lista.scrollTop = lista.scrollHeight;
            });
        }
    }

    private urlMensajes(): string {
        return `https://quickhelp-backend.onrender.com/api/alertas/${this.alerta().idAlerta}/mensajes`;
    }

    private opciones() {
        return {
            headers: { Authorization: `Bearer ${this.cuenta().token}` },
            timeout: 60000,
        };
    }

    private denegarAcceso(): void {
        this.abierto.set(false); // Oculta la ubicación si se pierde acceso.
        this.detenerLectura();
        this.bloqueada.set(true);
        this.respuestas = [];
        this.textos = [];
        this.burbujas.set([]);
        this.errorLectura.set(
            'Tu sesión ya no tiene acceso a esta conversación.'
        );
    }

    private detenerLectura(): void {
        this.reloj?.unsubscribe();
        this.consultaRespuestas?.unsubscribe();
        this.consultaMensajes?.unsubscribe();
    }

    ngOnDestroy(): void {
        this.detenerLectura();
        this.envio?.unsubscribe();
    }
}