import { DatePipe } from '@angular/common';
import {
    Component, effect, inject, input, signal,
} from '@angular/core';
import { catchError, map, of, switchMap } from 'rxjs';

import {
    AlertasApoyoService,
    type DireccionAlerta,
    type ResultadoDireccion,
    type UbicacionAlerta,
} from '../../core/services/alertas-apoyo.service';
import type { SesionUsuario } from '../../core/services/auth.service';

@Component({
    selector: 'app-ubicacion-alerta',
    standalone: true,
    imports: [DatePipe],
    template: `
        <div class="ubicacion" [attr.aria-busy]="cargando()">
            <div class="detalle">
                <span class="direccion" aria-live="polite">
                    {{ direccion() }}
                </span>

                @if (ubicacion(); as dato) {
                    <span class="referencia">
                        Ubicación registrada
                        @if (dato.fechaHora) {
                            · {{ dato.fechaHora | date:'dd/MM · HH:mm' }}
                        }
                    </span>

                    @if (dato.precisionMetros !== null) {
                        <span class="referencia">
                            Precisión aproximada: {{ dato.precisionMetros }} m
                        </span>
                    }
                }
            </div>

            @if (enlace(); as url) {
                <a
                    class="mapa"
                    [href]="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Cómo llegar a la ubicación de la emergencia en Google Maps"
                    title="Cómo llegar en Google Maps">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                            d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </a>
            }

            @if (fallo() && !cargando()) {
                <button type="button" class="reintentar"
                    (click)="reintentar()">
                    Reintentar
                </button>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            min-width: 0;
        }

        .ubicacion {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            min-width: 0;
        }

        .detalle {
            display: grid;
            flex: 1;
            min-width: 0;
            gap: 3px;
        }

        .direccion {
            color: #202633;
            font-size: .9rem;
            font-weight: 600;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }

        .referencia {
            color: #596677;
            font-size: .7rem;
            font-weight: 400;
            line-height: 1.3;
        }

        .mapa {
            display: grid;
            flex: 0 0 44px;
            width: 44px;
            height: 44px;
            place-items: center;
            border-radius: 12px;
            background: #fbe4e9;
            color: #a71930;
            text-decoration: none;
        }

        .mapa svg { width: 21px; height: 21px; }
        .mapa:active { background: #f5cdd7; }

        .reintentar {
            min-height: 44px;
            padding: 4px 6px;
            border: 0;
            background: transparent;
            color: #a71930;
            font: inherit;
            font-size: .75rem;
            cursor: pointer;
        }

        :focus-visible {
            outline: 2px solid #a71930;
            outline-offset: 2px;
        }
    `],
})
export class UbicacionAlertaComponent {
    readonly idAlerta = input.required<number>();
    readonly cuenta = input.required<SesionUsuario>();

    // El chat consulta únicamente cuando está abierto.
    readonly activa = input(true);

    private readonly servicio = inject(AlertasApoyoService);
    private readonly intento = signal(0);

    readonly direccion = signal('Consultando ubicación…');
    readonly ubicacion = signal<UbicacionAlerta | null>(null);
    readonly enlace = signal('');
    readonly cargando = signal(false);
    readonly fallo = signal(false);

    constructor() {
        effect(onCleanup => {
            const idAlerta = this.idAlerta();
            const cuenta = this.cuenta();
            const activa = this.activa();
            this.intento();

            // Limpia los datos al cambiar de alerta o sesión.
            this.direccion.set('Consultando ubicación…');
            this.ubicacion.set(null);
            this.enlace.set('');
            this.fallo.set(false);
            this.cargando.set(false);

            if (!activa) return;

            this.cargando.set(true);

            const consulta = this.servicio.consultarUbicacion(
                cuenta, idAlerta
            ).pipe(
                switchMap(dato => {
                    // Evita mostrar coordenadas de otra alerta.
                    if (!dato || dato.idAlerta !== idAlerta) {
                        throw new Error('Respuesta de ubicación inválida.');
                    }

                    if (!dato.disponible) {
                        return of('Esta emergencia no tiene ubicación registrada.');
                    }

                    const latitud = dato.latitud;
                    const longitud = dato.longitud;

                    if (
                        typeof latitud !== 'number' ||
                        typeof longitud !== 'number' ||
                        !Number.isFinite(latitud) ||
                        !Number.isFinite(longitud) ||
                        Math.abs(latitud) > 90 ||
                        Math.abs(longitud) > 180
                    ) {
                        throw new Error('Coordenadas inválidas.');
                    }

                    this.ubicacion.set(dato);

                    // El destino siempre es la coordenada guardada de la alerta.
                    const destino = encodeURIComponent(`${latitud},${longitud}`);
                    this.enlace.set(
                        `https://www.google.com/maps/dir/?api=1&destination=${destino}&dir_action=navigate`
                    );

                    return this.servicio.consultarDireccion(cuenta, idAlerta).pipe(
                        map(direccion => {
                            // Si la ubicación cambió durante la consulta, permite recargar la tarjeta.
                            const texto = direccion?.latitud === latitud && direccion.longitud === longitud
                                ? this.formatearDireccion(direccion.geocodificacion)
                                : '';

                            if (!texto) {
                                this.fallo.set(true);
                                return 'Dirección no disponible · consulta el mapa';
                            }

                            return texto;
                        }),
                        catchError(() => {
                            // El mapa continúa disponible aunque falle la dirección.
                            this.fallo.set(true);
                            return of('Dirección no disponible · consulta el mapa');
                        })
                    );
                })
            ).subscribe({
                next: texto => {
                    this.direccion.set(texto);
                    this.cargando.set(false);
                },
                error: () => {
                    this.ubicacion.set(null);
                    this.enlace.set('');
                    this.direccion.set('No pudimos consultar la ubicación.');
                    this.fallo.set(true);
                    this.cargando.set(false);
                },
            });

            // Cancela peticiones si cambia la alerta, se cierra o se destruye.
            onCleanup(() => consulta.unsubscribe());
        });
    }

    reintentar(): void {
        this.intento.update(valor => valor + 1);
    }

    private formatearDireccion(datos: DireccionAlerta['geocodificacion']): string {
        const resultados = datos.results ?? [];

        const campo = (resultado: ResultadoDireccion, tipo: string) =>
            resultado.addressComponents
                ?.find(componente => componente.types.includes(tipo))
                ?.longText;

        // Calle y número deben proceder del mismo resultado.
        const domicilio = resultados.find(
            resultado => campo(resultado, 'route') &&
                campo(resultado, 'street_number')
        ) ?? resultados.find(resultado => campo(resultado, 'route'));

        if (!domicilio) return '';

        const calle = campo(domicilio, 'route');
        const numero = campo(domicilio, 'street_number');

        const comuna = campo(domicilio, 'administrative_area_level_3')
            ?? resultados
                .map(resultado => campo(resultado, 'administrative_area_level_3'))
                .find(Boolean)
            ?? campo(domicilio, 'locality');

        const calleYNumero = [calle, numero].filter(Boolean).join(' ');
        return [calleYNumero, comuna].filter(Boolean).join(', ');
    }
}