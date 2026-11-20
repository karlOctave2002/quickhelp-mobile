package cl.quickhelp;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Envía la SOS igual que el botón de la app: POST /api/alertas con el GPS,
 * o sin coordenadas si no se pudo obtener la ubicación.
 */
final class EnvioEmergencia {

    interface Escucha {
        void obteniendoUbicacion();

        void enviando();

        void enviada(long idAlerta, boolean conUbicacion);

        void fallo(String titulo, String detalle);
    }

    private interface AlObtenerUbicacion {
        void listo(Location ubicacion);
    }

    private static final String URL_ALERTAS = "https://quickhelp-backend.onrender.com/api/alertas";
    private static final int ESPERA_SERVIDOR_MS = 60_000; // Render puede tardar en despertar.
    private static final long ESPERA_GPS_MS = 12_000;
    private static final long ANTIGUEDAD_MAXIMA_MS = 2 * 60_000;
    private static final float PRECISION_SUFICIENTE_METROS = 100f;

    private final Context context;
    private final String tipoActivacion;
    private final Escucha escucha;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService hilo = Executors.newSingleThreadExecutor();

    EnvioEmergencia(Context context, String tipoActivacion, Escucha escucha) {
        this.context = context.getApplicationContext();
        this.tipoActivacion = tipoActivacion;
        this.escucha = escucha;
    }

    void iniciar() {
        String token = SesionWidget.tokenAdultoMayor(context);
        if (token == null) {
            escucha.fallo("Abre Quick Help", "Inicia sesión para usar el botón");
            return;
        }

        escucha.obteniendoUbicacion();
        obtenerUbicacion(ubicacion -> {
            escucha.enviando();
            hilo.execute(() -> enviar(token, ubicacion));
        });
    }

    // ---------- Ubicación ----------

    private void obtenerUbicacion(AlObtenerUbicacion alObtener) {
        if (!tienePermisoUbicacion()) {
            alObtener.listo(null);
            return;
        }

        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            alObtener.listo(null);
            return;
        }

        Location reciente = mejorUltimaUbicacion(manager);
        if (reciente != null
                && edadMs(reciente) <= ANTIGUEDAD_MAXIMA_MS
                && reciente.hasAccuracy()
                && reciente.getAccuracy() <= PRECISION_SUFICIENTE_METROS) {
            alObtener.listo(reciente);
            return;
        }

        String proveedor = elegirProveedor(manager);
        if (proveedor == null) {
            alObtener.listo(reciente);
            return;
        }

        // Entrega una sola vez: la lectura nueva o, si tarda, la última conocida.
        final boolean[] entregado = {false};
        final Location respaldo = reciente;
        final Runnable[] detener = {() -> { }};
        AlObtenerUbicacion entregar = ubicacion -> {
            if (entregado[0]) {
                return;
            }
            entregado[0] = true;
            detener[0].run();
            alObtener.listo(ubicacion != null ? ubicacion : respaldo);
        };

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                CancellationSignal cancelacion = new CancellationSignal();
                detener[0] = cancelacion::cancel;
                manager.getCurrentLocation(proveedor, cancelacion,
                        ContextCompat.getMainExecutor(context), entregar::listo);
            } else {
                LocationListener escuchaGps = crearEscuchaUnica(entregar);
                detener[0] = () -> manager.removeUpdates(escuchaGps);
                manager.requestLocationUpdates(proveedor, 0L, 0f, escuchaGps, Looper.getMainLooper());
            }
        } catch (SecurityException | IllegalArgumentException error) {
            entregar.listo(null);
            return;
        }

        handler.postDelayed(() -> entregar.listo(null), ESPERA_GPS_MS);
    }

    /** Android 7 a 10 exigen implementar los cuatro métodos. */
    private LocationListener crearEscuchaUnica(AlObtenerUbicacion entregar) {
        return new LocationListener() {
            @Override
            public void onLocationChanged(Location ubicacion) {
                entregar.listo(ubicacion);
            }

            @Override
            public void onStatusChanged(String proveedor, int estado, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String proveedor) {
            }

            @Override
            public void onProviderDisabled(String proveedor) {
            }
        };
    }

    private String elegirProveedor(LocationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && manager.isProviderEnabled(LocationManager.FUSED_PROVIDER)) {
            return LocationManager.FUSED_PROVIDER;
        }
        if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            return LocationManager.GPS_PROVIDER;
        }
        if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            return LocationManager.NETWORK_PROVIDER;
        }
        return null;
    }

    private Location mejorUltimaUbicacion(LocationManager manager) {
        Location mejor = null;
        try {
            for (String proveedor : manager.getProviders(true)) {
                Location ubicacion = manager.getLastKnownLocation(proveedor);
                if (ubicacion != null && (mejor == null || ubicacion.getTime() > mejor.getTime())) {
                    mejor = ubicacion;
                }
            }
        } catch (SecurityException error) {
            return null;
        }
        return mejor;
    }

    private long edadMs(Location ubicacion) {
        return (SystemClock.elapsedRealtimeNanos() - ubicacion.getElapsedRealtimeNanos()) / 1_000_000L;
    }

    private boolean tienePermisoUbicacion() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    // ---------- Envío al backend ----------

    private void enviar(String token, Location ubicacion) {
        HttpURLConnection conexion = null;
        try {
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("tipoActivacion", tipoActivacion); // WIDGET, PANEL o VOZ.
            if (ubicacion != null) {
                cuerpo.put("latitud", ubicacion.getLatitude());
                cuerpo.put("longitud", ubicacion.getLongitude());
                cuerpo.put("precisionMetros", ubicacion.hasAccuracy() ? ubicacion.getAccuracy() : 0);
            }
            byte[] datos = cuerpo.toString().getBytes(StandardCharsets.UTF_8);

            conexion = (HttpURLConnection) new URL(URL_ALERTAS).openConnection();
            conexion.setRequestMethod("POST");
            conexion.setConnectTimeout(ESPERA_SERVIDOR_MS);
            conexion.setReadTimeout(ESPERA_SERVIDOR_MS);
            conexion.setDoOutput(true);
            conexion.setRequestProperty("Authorization", "Bearer " + token);
            conexion.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conexion.setRequestProperty("Accept", "application/json");
            try (OutputStream salida = conexion.getOutputStream()) {
                salida.write(datos);
            }

            int codigo = conexion.getResponseCode();
            if (codigo >= 200 && codigo < 300) {
                JSONObject respuesta = new JSONObject(leer(conexion.getInputStream()));
                long idAlerta = respuesta.optLong("idAlerta", 0);
                boolean conUbicacion = ubicacion != null;
                handler.post(() -> escucha.enviada(idAlerta, conUbicacion));
            } else if (codigo == 401 || codigo == 403) {
                handler.post(() -> escucha.fallo("Abre Quick Help", "Tu sesión venció, inicia sesión otra vez"));
            } else {
                handler.post(() -> escucha.fallo("No se pudo enviar", "Abre Quick Help y toca SOS"));
            }
        } catch (IOException error) {
            handler.post(() -> escucha.fallo("Sin conexión", "Revisa internet y toca SOS en la app"));
        } catch (JSONException error) {
            handler.post(() -> escucha.fallo("No se pudo enviar", "Abre Quick Help y toca SOS"));
        } finally {
            if (conexion != null) {
                conexion.disconnect();
            }
            hilo.shutdown();
        }
    }

    private static String leer(InputStream entrada) throws IOException {
        try (InputStream flujo = entrada; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] bloque = new byte[4096];
            int leidos;
            while ((leidos = flujo.read(bloque)) != -1) {
                bytes.write(bloque, 0, leidos);
            }
            return bytes.toString("UTF-8");
        }
    }
}
