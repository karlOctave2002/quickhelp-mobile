import { Injectable, inject, signal } from '@angular/core'; // Define el servicio y el estado de sesión.
import { HttpClient } from '@angular/common/http'; // Realiza peticiones al backend.
import { tap, timeout } from 'rxjs'; // Procesa la respuesta y limita la espera.
import { Capacitor } from '@capacitor/core'; // Comparte la sesión con el widget de Android.
import { WidgetAndroid } from './widget-android';

// Clave donde el dispositivo recuerda la sesión hasta cerrarla manualmente.
const CLAVE_SESION = 'quickhelp.sesion';

export interface SesionUsuario {
    token: string;
    tipo: string;
    idUsuario: number;
    nombreApellido: string;
    rol: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly http = inject(HttpClient);
    private readonly url = 'https://quickhelp-backend.onrender.com/api/auth';
    private readonly sesionInterna = signal<SesionUsuario | null>(this.recuperarSesion());

    readonly sesion = this.sesionInterna.asReadonly(); // Permite consultar la sesión.

    iniciarSesion(correo: string, password: string) {
        this.sesionInterna.set(null);
        this.olvidarSesion();

        return this.http.post<SesionUsuario>(`${this.url}/login`, {
            correo: correo.trim(),
            password, // Conserva exactamente la contraseña escrita.
        }).pipe(
            timeout(60000),
            tap(respuesta => {
                // Comprueba los datos necesarios antes de guardar la sesión.
                if (
                    !respuesta ||
                    typeof respuesta.token !== 'string' ||
                    !respuesta.token.trim() ||
                    respuesta.tipo !== 'Bearer' ||
                    !Number.isInteger(respuesta.idUsuario) ||
                    typeof respuesta.nombreApellido !== 'string' ||
                    typeof respuesta.rol !== 'string'
                ) {
                    throw new Error('La respuesta del servidor no tiene el formato esperado.');
                }

                if (
                    respuesta.rol !== 'ADULTO_MAYOR' &&
                    respuesta.rol !== 'ASISTENTE'
                ) {
                    throw new Error('Esta cuenta no tiene un rol habilitado para la app móvil.');
                }

                this.sesionInterna.set(respuesta);
                this.guardarSesion(respuesta);
                this.compartirConWidget(respuesta);
            }),
        );
    }

    cerrarSesion(): void {
        this.sesionInterna.set(null); // Elimina la sesión de la memoria.
        this.olvidarSesion(); // Y también la guardada en el dispositivo.
    }

    // Recupera la sesión guardada si sigue completa y su token no ha vencido.
    private recuperarSesion(): SesionUsuario | null {
        try {
            const guardada = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null') as SesionUsuario | null;

            if (
                guardada &&
                typeof guardada.token === 'string' &&
                guardada.tipo === 'Bearer' &&
                Number.isInteger(guardada.idUsuario) &&
                typeof guardada.nombreApellido === 'string' &&
                (guardada.rol === 'ADULTO_MAYOR' || guardada.rol === 'ASISTENTE') &&
                !this.tokenVencido(guardada.token)
            ) {
                this.compartirConWidget(guardada); // Sincroniza sesiones iniciadas antes del widget.
                return guardada;
            }
        } catch {
            // Un valor dañado se descarta y se pide iniciar sesión.
        }

        this.olvidarSesion();
        return null;
    }

    // Lee la fecha de vencimiento (exp) incluida en el JWT.
    private tokenVencido(token: string): boolean {
        try {
            const carga = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const { exp } = JSON.parse(atob(carga)) as { exp?: unknown };
            return typeof exp !== 'number' || exp * 1000 <= Date.now();
        } catch {
            return true;
        }
    }

    private guardarSesion(sesion: SesionUsuario): void {
        try {
            localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
        } catch {
            // Si el almacenamiento falla, la sesión sigue activa en memoria.
        }
    }

    // Copia el token y el rol en Android para el widget de emergencia.
    private compartirConWidget(sesion: SesionUsuario): void {
        if (Capacitor.getPlatform() !== 'android') return;
        WidgetAndroid.guardarSesion({ token: sesion.token, rol: sesion.rol }).catch(() => {
            // Sin el plugin, la app sigue funcionando; solo el widget no podrá enviar.
        });
    }

    private olvidarSesion(): void {
        try {
            localStorage.removeItem(CLAVE_SESION);
        } catch {
            // No hay nada que limpiar.
        }

        if (Capacitor.getPlatform() === 'android') {
            WidgetAndroid.olvidarSesion().catch(() => {
                // Sin el plugin no hay copia que borrar.
            });
        }
    }
}