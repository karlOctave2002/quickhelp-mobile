package cl.quickhelp;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

import java.io.IOException;

import cl.quickhelp.mobile.R;

/**
 * Escucha la frase clave aunque la app esté cerrada (con notificación fija, como exige Android).
 * Al oírla avisa en voz alta, inicia la cuenta regresiva del widget y escucha «cancelar».
 */
public class VozEmergenciaService extends Service implements RecognitionListener {

    private static final String CANAL_VOZ = "quickhelp_voz";
    private static final int ID_NOTIFICACION = 7303;
    private static final float FRECUENCIA = 16_000f;
    private static final long REINTENTO_MS = 3_000;
    private static final String PALABRA_CANCELAR = "cancelar";

    private static final String MENSAJE_ACTIVACION =
            "Has solicitado una emergencia. Si fue un error, di cancelar. Si no, se enviará en 10 segundos.";

    private enum Estado { CARGANDO, ESCUCHANDO, HABLANDO, EN_CUENTA, EN_PRUEBA }

    private static volatile VozEmergenciaService activo;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private VozHablada voz;
    private Model modelo;
    private Recognizer reconocedor;
    private SpeechService escucha;
    private String frase;
    private Estado estado = Estado.CARGANDO;

    // ---------- Uso desde otras clases ----------

    static boolean estaEscuchando() {
        return activo != null;
    }

    /** Solo se llama con la app abierta: Android no deja encender el micrófono desde segundo plano. */
    static void iniciar(Context context) {
        ContextCompat.startForegroundService(context, new Intent(context, VozEmergenciaService.class));
    }

    static void detener(Context context) {
        context.stopService(new Intent(context, VozEmergenciaService.class));
    }

    /** La cuenta regresiva que empezó por voz terminó: enviada, cancelada o fallo. */
    static void avisarResultado(String resultado) {
        VozEmergenciaService servicio = activo;
        if (servicio != null) {
            servicio.decirResultado(resultado);
        }
    }

    /** Libera el micrófono mientras el adulto prueba su frase en el Perfil. */
    static void pausarParaPrueba(boolean pausar) {
        VozEmergenciaService servicio = activo;
        if (servicio == null) {
            return;
        }
        if (pausar) {
            servicio.estado = Estado.EN_PRUEBA;
            servicio.detenerEscucha();
        } else if (servicio.estado == Estado.EN_PRUEBA) {
            servicio.cargar();
        }
    }

    // ---------- Ciclo de vida ----------

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activo = this;
        voz = new VozHablada(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        frase = ConfigVoz.frase(this);
        if (!iniciarPrimerPlano() || frase == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Al cambiar la frase se vuelve a crear el reconocedor con la nueva.
        detenerEscucha();
        cargar();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        activo = null;
        handler.removeCallbacksAndMessages(null);
        detenerEscucha();
        voz.cerrar();
        super.onDestroy();
    }

    // ---------- Reconocimiento ----------

    private void cargar() {
        estado = Estado.CARGANDO;
        ModeloVoz.cargar(this, new ModeloVoz.AlCargar() {
            @Override
            public void listo(Model cargado) {
                if (activo != VozEmergenciaService.this || estado != Estado.CARGANDO) {
                    return;
                }
                modelo = cargado;
                empezarEscucha();
            }

            @Override
            public void fallo() {
                actualizarNotificacion("No se pudo encender la escucha", "Abre Quick Help e inténtalo de nuevo.");
            }
        });
    }

    private void empezarEscucha() {
        try {
            // Solo reconoce la frase, «cancelar» o «[unk]» (cualquier otra cosa): menos errores.
            JSONArray gramatica = new JSONArray().put(frase).put(PALABRA_CANCELAR).put("[unk]");
            reconocedor = new Recognizer(modelo, FRECUENCIA, gramatica.toString());
            escucha = new SpeechService(reconocedor, FRECUENCIA);
            escucha.startListening(this);
            estado = Estado.ESCUCHANDO;
            actualizarNotificacion("Activación por voz encendida", "Di «" + frase + "» para pedir ayuda.");
        } catch (IOException | RuntimeException error) {
            detenerEscucha();
            reintentar();
        }
    }

    private void detenerEscucha() {
        if (escucha != null) {
            escucha.stop();
            escucha.shutdown();
            escucha = null;
        }
        if (reconocedor != null) {
            reconocedor.close();
            reconocedor = null;
        }
    }

    private void reintentar() {
        handler.postDelayed(() -> {
            if (activo == this && escucha == null && estado != Estado.EN_PRUEBA && modelo != null) {
                empezarEscucha();
            }
        }, REINTENTO_MS);
    }

    @Override
    public void onResult(String hipotesis) {
        procesar(hipotesis);
    }

    @Override
    public void onFinalResult(String hipotesis) {
        procesar(hipotesis);
    }

    @Override
    public void onPartialResult(String hipotesis) {
        // Se espera la frase completa para evitar activaciones por palabras sueltas.
    }

    @Override
    public void onError(Exception error) {
        detenerEscucha();
        reintentar();
    }

    @Override
    public void onTimeout() {
        detenerEscucha();
        reintentar();
    }

    private void procesar(String hipotesis) {
        String texto;
        try {
            texto = new JSONObject(hipotesis).optString("text", "");
        } catch (Exception error) {
            return;
        }

        if (estado == Estado.ESCUCHANDO && ConfigVoz.contiene(texto, frase)) {
            fraseDetectada();
        } else if (estado == Estado.EN_CUENTA && ConfigVoz.contiene(texto, PALABRA_CANCELAR)) {
            // El servicio del widget ya corre en primer plano: basta con startService.
            startService(new Intent(this, WidgetEmergenciaService.class)
                    .setAction(WidgetEmergenciaService.ACCION_CANCELAR));
        }
    }

    /** Avisa en voz alta y, al terminar de hablar, empieza la cuenta de 10 segundos. */
    private void fraseDetectada() {
        if (WidgetEmergenciaService.estaActivo()) {
            return; // Ya hay una cuenta regresiva en curso.
        }
        estado = Estado.HABLANDO;
        pausarMicrofono(true); // Que no se escuche a sí mismo decir «cancelar».
        voz.decir(MENSAJE_ACTIVACION, () -> {
            try {
                ContextCompat.startForegroundService(this, new Intent(this, WidgetEmergenciaService.class)
                        .setAction(WidgetEmergenciaService.ACCION_ACTIVAR_POR_VOZ));
            } catch (RuntimeException error) {
                decirResultado("fallo");
                return;
            }
            estado = Estado.EN_CUENTA;
            pausarMicrofono(false);
        });
    }

    private void decirResultado(String resultado) {
        String mensaje;
        switch (resultado) {
            case "enviada":
                mensaje = "Emergencia enviada. Tu red de apoyo ya fue avisada.";
                break;
            case "cancelada":
                mensaje = "Emergencia cancelada.";
                break;
            default:
                mensaje = "No se pudo enviar la emergencia. Abre Quick Help.";
                break;
        }
        estado = Estado.HABLANDO;
        pausarMicrofono(true);
        voz.decir(mensaje, () -> {
            if (estado == Estado.HABLANDO) {
                estado = Estado.ESCUCHANDO;
                pausarMicrofono(false);
            }
        });
    }

    private void pausarMicrofono(boolean pausar) {
        if (escucha != null) {
            escucha.setPause(pausar);
        }
    }

    // ---------- Notificación fija ----------

    private boolean iniciarPrimerPlano() {
        try {
            ServiceCompat.startForeground(this, ID_NOTIFICACION,
                    crearNotificacion("Activación por voz encendida", "Preparando la escucha…"),
                    tipoPrimerPlano());
            return true;
        } catch (RuntimeException error) {
            // Falta el permiso de micrófono o Android no permite iniciarla ahora.
            return false;
        }
    }

    private int tipoPrimerPlano() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return 0;
        }
        int tipo = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        // Con ubicación, la SOS por voz puede llevar el GPS aunque la app esté cerrada.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
            tipo |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        }
        return tipo;
    }

    private void actualizarNotificacion(String titulo, String texto) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(ID_NOTIFICACION, crearNotificacion(titulo, texto));
        }
    }

    private Notification crearNotificacion(String titulo, String texto) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel canal = new NotificationChannel(
                    CANAL_VOZ, "Activación por voz", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Se muestra mientras Quick Help escucha tu frase de emergencia.");
            manager.createNotificationChannel(canal);
        }

        Intent abrirApp = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent alTocar = abrirApp == null ? null : PendingIntent.getActivity(this, 1, abrirApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CANAL_VOZ)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle("🎙️ " + titulo)
                .setContentText(texto)
                .setContentIntent(alTocar)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .build();
    }
}
