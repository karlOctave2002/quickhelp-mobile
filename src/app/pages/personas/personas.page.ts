import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';

interface PersonaVinculada {
    idAdultoMayor: number;
    nombreAdultoMayor: string;
}

@Component({
    selector: 'app-personas',
    standalone: true,
    imports: [IonContent],
    template: `
        <ion-content>
            <main>
                <header>
                    <p class="marca">QUICK HELP</p>
                    <h1>Personas</h1>
                    <p class="descripcion">Personas a las que acompañas en su red de apoyo.</p>
                </header>

                @if (cargando()) {
                    <p class="aviso" role="status">Cargando personas…</p>
                } @else if (error()) {
                    <section class="panel">
                        <p role="alert">{{ error() }}</p>
                        <button type="button" (click)="reintentar()">Reintentar</button>
                    </section>
                } @else if (personas().length === 0) {
                    <section class="panel">
                        <h2>Aún no tienes personas vinculadas</h2>
                        <p>Cuando una persona apruebe tu vinculación, aparecerá aquí.</p>
                    </section>
                } @else {
                    <ul aria-label="Personas vinculadas">
                        @for (persona of personas(); track persona.idAdultoMayor) {
                            <li>
                                <span class="avatar" aria-hidden="true">
                                    {{ persona.nombreAdultoMayor.trim().charAt(0).toUpperCase() }}
                                </span>
                                <div>
                                    <strong>{{ persona.nombreAdultoMayor }}</strong>
                                    <span class="detalle">Persona adulta</span>
                                </div>
                            </li>
                        }
                    </ul>
                }
            </main>
        </ion-content>
    `,
    styles: [`
        :host { display: block; height: 100%; }
        ion-content { --background: #eff2f7; --color: #202633; }
        main {
            box-sizing: border-box;
            max-width: 520px;
            margin: 0 auto;
            padding: calc(24px + env(safe-area-inset-top, 0px)) 22px 32px;
        }
        .marca {
            margin: 0 0 10px;
            color: #be2037;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .12em;
        }
        h1 { margin: 0; font-size: 28px; letter-spacing: -.035em; }
        .descripcion, .aviso, .panel p {
            color: #58667a;
            line-height: 1.5;
        }
        .descripcion { margin: 8px 0 24px; }
        ul, .panel {
            margin: 0;
            padding: 0;
            border: 1px solid #dce3ed;
            border-radius: 16px;
            background: #fff;
        }
        ul { list-style: none; }
        li { display: flex; align-items: center; gap: 14px; padding: 16px; }
        li + li { border-top: 1px solid #e5e9ef; }
        li strong { overflow-wrap: anywhere; }
        .avatar {
            display: grid;
            place-items: center;
            flex: 0 0 44px;
            height: 44px;
            border-radius: 50%;
            background: #fbe5ea;
            color: #ad1933;
            font-weight: 700;
        }
        .detalle { display: block; margin-top: 3px; font-size: 14px; color: #58667a; }
        .panel { padding: 18px; }
        .panel h2 { margin: 0; font-size: 18px; }
        .panel p { margin: 6px 0; }
        button {
            min-height: 44px;
            padding: 0 8px;
            background: transparent;
            color: #ad1933;
            font: inherit;
            font-weight: 700;
        }
    `],
})
export class PersonasPage {
    private readonly http = inject(HttpClient);
    private readonly auth = inject(AuthService);
    private readonly visible = signal(false);
    private readonly intento = signal(0);

    // Ruta propuesta para el backend. El token identifica al asistente.
    private readonly url =
        'https://quickhelp-backend.onrender.com/api/red-apoyo/personas';

    readonly personas = signal<PersonaVinculada[]>([]);
    readonly cargando = signal(true);
    readonly error = signal('');

    constructor() {
        effect(onCleanup => {
            const cuenta = this.auth.sesion();
            const visible = this.visible();
            this.intento();

            this.personas.set([]);
            this.error.set('');
            this.cargando.set(false);

            if (!visible) return;

            if (!cuenta || cuenta.rol !== 'ASISTENTE') {
                this.error.set('Ingresa con tu cuenta de persona de apoyo para ver tus vinculaciones.');
                return;
            }

            this.cargando.set(true);
            const consulta = this.http.get<PersonaVinculada[]>(this.url, {
                headers: { Authorization: `Bearer ${cuenta.token}` },
                timeout: 60000,
            }).subscribe({
                next: personas => {
                    if (this.auth.sesion() !== cuenta) return;
                    this.personas.set(personas);
                    this.cargando.set(false);
                },
                error: (fallo: HttpErrorResponse) => {
                    if (this.auth.sesion() !== cuenta) return;
                    this.cargando.set(false);
                    this.error.set(
                        fallo.status === 401
                            ? 'Tu sesión venció. Vuelve a iniciar sesión.'
                            : 'No pudimos cargar tus personas vinculadas.'
                    );
                },
            });

            onCleanup(() => consulta.unsubscribe());
        });
    }

    ionViewWillEnter(): void {
        this.visible.set(true);
    }

    ionViewWillLeave(): void {
        this.visible.set(false);
    }

    reintentar(): void {
        this.intento.update(valor => valor + 1);
    }
}