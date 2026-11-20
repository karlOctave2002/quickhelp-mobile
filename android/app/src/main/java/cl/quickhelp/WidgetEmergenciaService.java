package cl.quickhelp;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import cl.quickhelp.mobile.R;

/**
 * Cuenta regresiva del widget de emergencia.
 * Primer toque: empieza en 10. Dos toques seguidos (dentro de 3 s): cancela.
 * Al llegar a 0 envía la emergencia sin abrir la app (EnvioEmergencia).
 */
public class WidgetEmergenciaService extends Service {

    static final String ACCION_TOQUE = "cl.quickhelp.widget.TOQUE";
    static final String ACCION_ACTIVAR_POR_VOZ = "cl.quickhelp.widget.ACTIVAR_POR_VOZ";
    static final String ACCION_CANCELAR = "cl.quickhelp.widget.CANCELAR";
    // Quién inició la cuenta: WIDGET, PANEL o VOZ (se guarda como tipo de activación).
    static final String EXTRA_ORIGEN = "origen";

    private static final String CANAL_WIDGET = "quickhelp_widget";
    private static final String CANAL_RESULTADO = "quickhelp_widget_resultado";
    private static final int ID_NOTIFICACION = 7301;
    private static final int ID_RESULTADO = 7302;
    private static final int SEGUNDOS_INICIALES = 10;
    private static final long UN_SEGUNDO_MS = 1_000;
    private static final long VENTANA_DOBLE_TOQUE_MS = 3_000;
    private static final long PAUSA_CANCELADA_MS = 2_000;
    private static final long PAUSA_RESULTADO_MS = 5_000;

    private enum Estado { REPOSO, CONTANDO, TERMINANDO }

    private static volatile boolean activo;
    private static volatile boolean contando;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable avanzarSegundo = this::avanzarSegundo;
    private Estado estado = Estado.REPOSO;
    private int segundosRestantes;
    private long primerToqueMs;
    private String origen = "WIDGET";

    static boolean estaActivo() {
        return activo;
    }

    /** true solo durante los 10 segundos en que todavía se puede cancelar. */
    static boolean estaContando() {
        return contando;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Android exige pasar a primer plano en cada inicio con startForegroundService.
        iniciarPrimerPlano();
        activo = true;

        String accion = intent == null ? null : intent.getAction();

        if (ACCION_ACTIVAR_POR_VOZ.equals(accion)) {
            if (estado == Estado.REPOSO) {
                origen = "VOZ";
                iniciarCuenta();
            }
            return START_NOT_STICKY;
        }

        if (ACCION_CANCELAR.equals(accion)) {
            // Botón «Cancelar» de la notificación o la palabra «cancelar».
            if (estado == Estado.CONTANDO) {
                cancelar();
            } else if (estado == Estado.REPOSO) {
                terminar();
            }
            return START_NOT_STICKY;
        }

        if (!ACCION_TOQUE.equals(accion)) {
            if (estado == Estado.REPOSO) {
                terminar();
            }
            return START_NOT_STICKY;
        }

        switch (estado) {
            case REPOSO: {
                String desde = intent.getStringExtra(EXTRA_ORIGEN);
                origen = "PANEL".equals(desde) ? "PANEL" : "WIDGET";
                iniciarCuenta();
                break;
            }
            case CONTANDO:
                registrarToqueCancelacion();
                break;
            default:
                // Ya se está cancelando o enviando: el toque no hace nada.
                break;
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        activo = false;
        contando = false;
        super.onDestroy();
    }

    private void iniciarCuenta() {
        estado = Estado.CONTANDO;
        contando = true;
        segundosRestantes = SEGUNDOS_INICIALES;
        primerToqueMs = 0;
        vibrar(80);
        mostrarCuenta();
        handler.postDelayed(avanzarSegundo, UN_SEGUNDO_MS);
    }

    private void avanzarSegundo() {
        if (estado != Estado.CONTANDO) {
            return;
        }
        segundosRestantes--;
        if (segundosRestantes <= 0) {
            enviarEmergencia();
            return;
        }
        if (primerToqueMs > 0 && SystemClock.elapsedRealtime() - primerToqueMs > VENTANA_DOBLE_TOQUE_MS) {
            primerToqueMs = 0;
        }
        mostrarCuenta();
        handler.postDelayed(avanzarSegundo, UN_SEGUNDO_MS);
    }

    /** El primer toque solo avisa; el segundo dentro de 3 s cancela. */
    private void registrarToqueCancelacion() {
        long ahora = SystemClock.elapsedRealtime();
        if (primerToqueMs > 0 && ahora - primerToqueMs <= VENTANA_DOBLE_TOQUE_MS) {
            cancelar();
            return;
        }
        primerToqueMs = ahora;
        vibrar(40);
        mostrarCuenta();
    }

    private void mostrarCuenta() {
        String subtitulo;
        if (primerToqueMs > 0) {
            subtitulo = "Toca otra vez para cancelar";
        } else if ("VOZ".equals(origen)) {
            subtitulo = "Di «cancelar» o toca 2 veces";
        } else {
            subtitulo = "Toca 2 veces para cancelar";
        }
        WidgetEmergenciaVista.mostrarFranja(this, String.valueOf(segundosRestantes),
                "Activando emergencia", subtitulo, false);
    }

    private void cancelar() {
        estado = Estado.TERMINANDO;
        contando = false;
        avisarVoz("cancelada");
        handler.removeCallbacks(avanzarSegundo);
        vibrar(40);
        WidgetEmergenciaVista.mostrarFranja(this, "✕", "Emergencia cancelada", "No se envió ningún aviso", true);
        handler.postDelayed(this::terminar, PAUSA_CANCELADA_MS);
    }

    private void enviarEmergencia() {
        estado = Estado.TERMINANDO;
        contando = false;
        vibrar(400);
        new EnvioEmergencia(this, origen, new EnvioEmergencia.Escucha() {
            @Override
            public void obteniendoUbicacion() {
                WidgetEmergenciaVista.mostrarFranja(WidgetEmergenciaService.this, "…",
                        "Enviando emergencia", "Obteniendo tu ubicación…", false);
            }

            @Override
            public void enviando() {
                WidgetEmergenciaVista.mostrarFranja(WidgetEmergenciaService.this, "…",
                        "Enviando emergencia", "Avisando a tu red de apoyo…", false);
            }

            @Override
            public void enviada(long idAlerta, boolean conUbicacion) {
                vibrar(150);
                WidgetEmergenciaVista.mostrarFranja(WidgetEmergenciaService.this, "✓",
                        "Emergencia enviada", "Solicitud #" + idAlerta + " registrada", false);
                notificarResultado("🚨 Emergencia enviada",
                        "Solicitud #" + idAlerta + " registrada"
                                + (conUbicacion ? " con tu ubicación." : " sin ubicación.")
                                + " Tu red de apoyo ya fue avisada.");
                avisarVoz("enviada");
                handler.postDelayed(WidgetEmergenciaService.this::terminar, PAUSA_RESULTADO_MS);
            }

            @Override
            public void fallo(String titulo, String detalle) {
                vibrar(400);
                WidgetEmergenciaVista.mostrarFranja(WidgetEmergenciaService.this, "!", titulo, detalle, true);
                notificarResultado("No se pudo enviar tu emergencia", titulo + ": " + detalle + ".");
                avisarVoz("fallo");
                handler.postDelayed(WidgetEmergenciaService.this::terminar, PAUSA_RESULTADO_MS);
            }
        }).iniciar();
    }

    /** Si la cuenta empezó por voz, el teléfono dice en voz alta cómo terminó. */
    private void avisarVoz(String resultado) {
        if ("VOZ".equals(origen)) {
            VozEmergenciaService.avisarResultado(resultado);
        }
    }

    /** Aviso que queda en la barra al terminar; al tocarlo abre la app. */
    private void notificarResultado(String titulo, String texto) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(
                    CANAL_RESULTADO, "Resultado del botón de emergencia", NotificationManager.IMPORTANCE_HIGH));
        }

        Intent abrirApp = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent alTocar = abrirApp == null ? null : PendingIntent.getActivity(this, 0, abrirApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notificacion = new NotificationCompat.Builder(this, CANAL_RESULTADO)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(alTocar)
                .setAutoCancel(true)
                .build();
        manager.notify(ID_RESULTADO, notificacion);
    }

    private void terminar() {
        handler.removeCallbacksAndMessages(null);
        estado = Estado.REPOSO;
        primerToqueMs = 0;
        origen = "WIDGET";
        activo = false;
        contando = false;
        WidgetEmergenciaVista.mostrarReposo(this);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void iniciarPrimerPlano() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel canal = new NotificationChannel(
                    CANAL_WIDGET, "Botón de emergencia", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Se muestra mientras corre la cuenta regresiva del widget.");
            manager.createNotificationChannel(canal);
        }

        PendingIntent cancelar = PendingIntent.getService(this, 2,
                new Intent(this, WidgetEmergenciaService.class).setAction(ACCION_CANCELAR),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notificacion = new NotificationCompat.Builder(this, CANAL_WIDGET)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle("Botón de emergencia activo")
                .setContentText("Quick Help está preparando tu emergencia.")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .addAction(0, "Cancelar", cancelar)
                .build();

        ServiceCompat.startForeground(this, ID_NOTIFICACION, notificacion, tipoPrimerPlano());
    }

    /** Ubicación si hay permiso; si no, en Android 14+ un servicio corto. */
    private int tipoPrimerPlano() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return tienePermisoUbicacion()
                    ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                    : ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        }
        return 0;
    }

    private boolean tienePermisoUbicacion() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void vibrar(long milisegundos) {
        Vibrator vibrador = getSystemService(Vibrator.class);
        if (vibrador == null || !vibrador.hasVibrator()) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrador.vibrate(VibrationEffect.createOneShot(milisegundos, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrador.vibrate(milisegundos);
        }
    }
}
