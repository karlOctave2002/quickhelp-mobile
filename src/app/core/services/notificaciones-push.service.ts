import { HttpClient, HttpErrorResponse } from '@angular/common/http'; // Registra el dispositivo en la API.
import { Injectable, Injector, effect, inject, signal } from '@angular/core'; // Observa la cuenta activa.
import { Router } from '@angular/router'; // Abre el chat al tocar un aviso.
import { App } from '@capacitor/app'; // Detecta cuándo la app vuelve a estar activa.
import { Capacitor, ExceptionCode, registerPlugin } from '@capacitor/core'; // Usa las funciones nativas.
import { Haptics } from '@capacitor/haptics'; // Vibra al recibir una emergencia con la app abierta.
import { LocalNotifications } from '@capacitor/local-notifications'; // Muestra avisos con Android abierto.
import { FirebaseMessaging, Importance, Visibility, type Notification } from '@capacitor-firebase/messaging';
import { firstValueFrom, Subject, timeout } from 'rxjs'; // Coordina avisos y registro.
import { AuthService, type SesionUsuario } from './auth.service';
import { WidgetAndroid } from './widget-android';

const PushAndroid = registerPlugin<{ revocarToken(): Promise<void> }>('QuickHelpPushAndroid');
const CLAVE_CUENTA_PUSH = 'quickhelp.push.cuenta';
// Android no permite cambiar el sonido de un canal creado: el sonido nuevo usa un canal nuevo.
const SOS = { id: 'quickhelp_sos_v2', name: 'Emergencias SOS', sound: 'quickhelp_sos_alerta.wav' };
const SOS_ANTERIOR = 'quickhelp_sos_v1';
const CHAT = { id: 'quickhelp_chat_v1', name: 'Mensajes del chat', sound: 'quickhelp_chat.wav' };

@Injectable({ providedIn: 'root' })
export class NotificacionesPushService {
    private readonly auth = inject(AuthService);
    private readonly http = inject(HttpClient);
    private readonly injector = inject(Injector);
    private readonly router = inject(Router);
    private readonly android = Capacitor.getPlatform() === 'android';
    private readonly url = 'https://quickhelp-backend.onrender.com/api/usuarios/token-fcm';
    private cola = Promise.resolve();
    private iniciado = false;
    private canalesListos = false;
    private cuentaAnterior: SesionUsuario | null = null;
    private registro: { cuenta: SesionUsuario; token: string } | null = null;
    private siguienteId = Date.now() % 2_000_000_000;
    private readonly recargarAlertas = new Subject<void>();
    readonly recargarAlertas$ = this.recargarAlertas.asObservable();
    // Solicitud cuyo chat se debe abrir tras tocar un aviso de mensaje.
    private readonly chatPendienteInterno = signal<number | null>(null);
    readonly chatPendiente = this.chatPendienteInterno.asReadonly();
    // true si Android no mostrará los avisos (permiso negado o canal SOS apagado).
    private readonly avisosDesactivadosInterno = signal(false);
    readonly avisosDesactivados = this.avisosDesactivadosInterno.asReadonly();

    iniciar(): void {
        if (!Capacitor.isNativePlatform() || this.iniciado) return;
        this.iniciado = true;

        this.encolar(async () => {
            await App.addListener('resume', () => {
                this.alVolver();
                void this.revisarAvisos(); // Por si los activó en los ajustes del teléfono.
                this.recargarAlertas.next(); // Incluye los avisos recibidos en segundo plano.
            });
            await FirebaseMessaging.addListener('tokenReceived', () => this.alVolver());
            await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
                if (this.esSos(notification)) {
                    console.info('Quick Help: aviso SOS recibido.');
                    this.recargarAlertas.next();
                    // Con la app abierta, una vibración larga refuerza el aviso.
                    void Haptics.vibrate({ duration: 1500 }).catch(() => undefined);
                }
                if (!this.android) return;
                void this.mostrarEnAndroid(notification).catch(() => {
                    console.warn('Quick Help: no se pudo mostrar el aviso.');
                });
            });
            await FirebaseMessaging.addListener('notificationActionPerformed', ({ actionId, notification }) => {
                if (actionId !== 'tap') return;
                if (this.esSos(notification)) this.recargarAlertas.next();
                this.abrirChat(notification.data);
            });
            // Aviso mostrado por la app mientras estaba abierta.
            await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
                this.abrirChat(notification.extra);
            });
            if (!this.android) {
                // En iOS la llegada del token de Apple permite reintentar la obtención del token FCM.
                await FirebaseMessaging.addListener('apnsTokenReceived', () => this.alVolver());
            }
        });

        effect(() => {
            const cuenta = this.auth.sesion();
            const anterior = this.cuentaAnterior;
            this.cuentaAnterior = cuenta;

            if (cuenta) {
                this.encolar(() => this.registrar(cuenta, true));
            } else if (anterior) {
                // Conserva la marca hasta confirmar la revocación, incluso si se pierde la conexión.
                const idAnterior = String(anterior.idUsuario);
                if (localStorage.getItem(CLAVE_CUENTA_PUSH) === idAnterior) {
                    localStorage.setItem(CLAVE_CUENTA_PUSH, 'cerrada');
                    this.encolar(() => this.revocar());
                }
            }
        }, { injector: this.injector });
    }

    // Lleva al chat de la solicitud: el adulto en Solicitudes y el asistente en su Inicio.
    private abrirChat(datos: unknown): void {
        const { tipo, idAlerta } = (datos ?? {}) as { tipo?: unknown; idAlerta?: unknown };
        const id = Number(idAlerta);
        const cuenta = this.auth.sesion();
        if (tipo !== 'MENSAJE_CHAT' || !cuenta || !Number.isInteger(id) || id <= 0) return;

        this.chatPendienteInterno.set(id);
        void this.router.navigateByUrl(
            cuenta.rol === 'ASISTENTE' ? '/apoyo/inicio' : '/solicitudes'
        );
    }

    // Revisa si el teléfono puede mostrar los avisos de Quick Help.
    async revisarAvisos(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        try {
            const { receive } = await FirebaseMessaging.checkPermissions();
            let desactivados = receive !== 'granted';

            // En Android también se puede apagar solo el canal de emergencias.
            if (!desactivados && this.android) {
                const { channels } = await LocalNotifications.listChannels();
                const canalSos = channels.find(canal => canal.id === SOS.id);
                desactivados = canalSos !== undefined && Number(canalSos.importance) === 0;
            }
            this.avisosDesactivadosInterno.set(desactivados);
        } catch {
            this.avisosDesactivadosInterno.set(false); // Sin datos no se muestra el aviso.
        }
    }

    // Pide el permiso; si ya fue negado, abre los ajustes de notificaciones de la app.
    async activarAvisos(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        let { receive } = await FirebaseMessaging.checkPermissions();
        if (receive === 'prompt' || receive === 'prompt-with-rationale') {
            ({ receive } = await FirebaseMessaging.requestPermissions());
        }
        if (receive !== 'granted' || this.avisosDesactivadosInterno()) {
            if (this.android) await WidgetAndroid.abrirAjustesNotificaciones().catch(() => undefined);
        }
        await this.revisarAvisos();
        this.alVolver(); // Registra el dispositivo si ya tiene permiso.
    }

    // La pantalla avisa cuando ya abrió el chat pendiente.
    consumirChatPendiente(idAlerta: number): void {
        if (this.chatPendienteInterno() === idAlerta) this.chatPendienteInterno.set(null);
    }

    private alVolver(): void {
        const cuenta = this.auth.sesion();
        if (cuenta) this.encolar(() => this.registrar(cuenta, false));
        else this.encolar(async () => {
            if (localStorage.getItem(CLAVE_CUENTA_PUSH) === 'cerrada') await this.revocar();
        });
    }

    private encolar(tarea: () => Promise<void>): void {
        // Un cambio de cuenta espera a que termine el registro o la baja anterior.
        this.cola = this.cola.then(tarea).catch((fallo: unknown) => {
            const detalle = fallo instanceof HttpErrorResponse ? ` (HTTP ${fallo.status})` : '';
            console.warn(`Quick Help: no se pudo sincronizar el dispositivo${detalle}.`);
        });
    }

    private async registrar(cuenta: SesionUsuario, pedirPermiso: boolean): Promise<void> {
        if (this.auth.sesion() !== cuenta) return;

        const propietario = localStorage.getItem(CLAVE_CUENTA_PUSH);
        const idUsuario = String(cuenta.idUsuario);
        if (propietario !== null && propietario !== idUsuario) await this.revocar();
        if (this.auth.sesion() !== cuenta) return;

        if (this.android && !this.canalesListos) {
            await this.crearCanalesAndroid();
            this.canalesListos = true;
        }
        let { receive } = await FirebaseMessaging.checkPermissions();
        if (pedirPermiso && (receive === 'prompt' || receive === 'prompt-with-rationale')
                && this.auth.sesion() === cuenta) {
            ({ receive } = await FirebaseMessaging.requestPermissions());
        }
        if (receive !== 'granted' || this.auth.sesion() !== cuenta) return;

        const { token } = await FirebaseMessaging.getToken();
        if (!token || this.auth.sesion() !== cuenta) return;
        if (this.registro?.cuenta === cuenta && this.registro.token === token) return;

        // Permite detectar la cuenta previa aun si la app se vuelve a abrir desde cero.
        localStorage.setItem(CLAVE_CUENTA_PUSH, idUsuario);
        await firstValueFrom(this.http.put<void>(this.url, { tokenFcm: token }, {
            headers: { Authorization: `Bearer ${cuenta.token}` },
        }).pipe(timeout(60_000)));
        if (this.auth.sesion() !== cuenta) return;
        this.registro = { cuenta, token };
        console.info('Quick Help: dispositivo registrado para notificaciones.');
    }

    private async revocar(): Promise<void> {
        if (!localStorage.getItem(CLAVE_CUENTA_PUSH)) return;
        this.registro = null;
        await FirebaseMessaging.removeAllDeliveredNotifications();
        // La función nativa de Android confirma que Firebase invalidó el token.
        if (this.android) await PushAndroid.revocarToken();
        else await FirebaseMessaging.deleteToken();
        localStorage.removeItem(CLAVE_CUENTA_PUSH);
    }

    private async crearCanalesAndroid(): Promise<void> {
        try {
            // La emergencia se ve completa aunque el celular esté bloqueado.
            await FirebaseMessaging.createChannel({
                ...SOS, importance: Importance.High, vibration: true, visibility: Visibility.Public,
            });
            // Quita el canal SOS anterior para no duplicarlo en los ajustes.
            await FirebaseMessaging.deleteChannel({ id: SOS_ANTERIOR }).catch(() => undefined);
            await FirebaseMessaging.createChannel({
                ...CHAT, importance: Importance.Default, vibration: false, visibility: Visibility.Private,
            });
        } catch (fallo) {
            // Android 7 usa directamente el sonido del aviso.
            if ((fallo as { code?: string })?.code !== ExceptionCode.Unavailable) throw fallo;
        }
    }

    private esSos(notificacion: Notification): boolean {
        const datos = notificacion.data as { tipo?: unknown } | undefined;
        return datos?.tipo === 'ALERTA_EMERGENCIA';
    }

    private async mostrarEnAndroid(notificacion: Notification): Promise<void> {
        const cuenta = this.auth.sesion();
        if (!cuenta || localStorage.getItem(CLAVE_CUENTA_PUSH) !== String(cuenta.idUsuario)) return;
        const datos = notificacion.data as { tipo?: string; idAlerta?: string } | undefined;
        if (datos?.tipo !== 'ALERTA_EMERGENCIA' && datos?.tipo !== 'MENSAJE_CHAT') return;
        const { isActive } = await App.getState();
        if (!isActive || this.auth.sesion() !== cuenta) return;

        // En segundo plano Firebase ya publica el aviso en la bandeja de Android.
        const canal = datos.tipo === 'ALERTA_EMERGENCIA' ? SOS : CHAT;
        await LocalNotifications.schedule({
            notifications: [{
                id: ++this.siguienteId,
                title: notificacion.title ?? 'Quick Help',
                body: notificacion.body ?? 'Abre Quick Help para ver el aviso.',
                channelId: canal.id,
                sound: canal.sound,
                extra: { tipo: datos.tipo, idAlerta: datos.idAlerta }, // Permite abrir el chat al tocarlo.
            }],
        });
    }
}
