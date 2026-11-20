package cl.quickhelp;

import android.Manifest;
import android.app.StatusBarManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import cl.quickhelp.mobile.R;

/** Puente entre la app y el widget de emergencia (también la activación por voz). */
@CapacitorPlugin(
        name = "QuickHelpWidget",
        permissions = {
                @Permission(alias = "microfono", strings = { Manifest.permission.RECORD_AUDIO })
        })
public class WidgetEmergenciaPlugin extends Plugin {

    /** Al abrir la app (también tras reiniciar el teléfono) vuelve a encender la escucha. */
    @Override
    public void load() {
        if (ConfigVoz.frase(getContext()) != null
                && SesionWidget.tokenAdultoMayor(getContext()) != null
                && getPermissionState("microfono") == PermissionState.GRANTED
                && !VozEmergenciaService.estaEscuchando()) {
            try {
                VozEmergenciaService.iniciar(getContext());
            } catch (RuntimeException error) {
                // Si Android no lo permite ahora, se reintenta desde el Perfil.
            }
        }
    }

    /** La app comparte el token y el rol de la cuenta activa. */
    @PluginMethod
    public void guardarSesion(PluginCall call) {
        String token = call.getString("token");
        String rol = call.getString("rol");
        if (token == null || token.trim().isEmpty() || rol == null) {
            call.reject("Faltan los datos de la sesión.");
            return;
        }
        SesionWidget.guardar(getContext(), token, rol);
        call.resolve();
    }

    /** Al cerrar sesión, el widget deja de poder enviar emergencias y se apaga la voz. */
    @PluginMethod
    public void olvidarSesion(PluginCall call) {
        SesionWidget.olvidar(getContext());
        ConfigVoz.olvidar(getContext());
        VozEmergenciaService.detener(getContext());
        call.resolve();
    }

    // ---------- Activación por voz ----------

    @PluginMethod
    public void estadoVoz(PluginCall call) {
        JSObject respuesta = new JSObject();
        respuesta.put("escuchando", VozEmergenciaService.estaEscuchando());
        respuesta.put("permiso", getPermissionState("microfono") == PermissionState.GRANTED);
        respuesta.put("frase", ConfigVoz.frase(getContext()));
        call.resolve(respuesta);
    }

    /** Guarda la frase en el teléfono y enciende la escucha (pide el micrófono si falta). */
    @PluginMethod
    public void activarVoz(PluginCall call) {
        if (fraseValida(call) == null) {
            return;
        }
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "alPermisoParaActivar");
            return;
        }
        encenderVoz(call);
    }

    @PermissionCallback
    private void alPermisoParaActivar(PluginCall call) {
        if (getPermissionState("microfono") == PermissionState.GRANTED) {
            encenderVoz(call);
        } else {
            call.reject("Sin permiso de micrófono.", "SIN_PERMISO");
        }
    }

    private void encenderVoz(PluginCall call) {
        ConfigVoz.guardar(getContext(), fraseValida(call));
        try {
            VozEmergenciaService.iniciar(getContext());
        } catch (RuntimeException error) {
            call.reject("No se pudo encender la escucha.", "NO_INICIA");
            return;
        }
        JSObject respuesta = new JSObject();
        respuesta.put("escuchando", true);
        call.resolve(respuesta);
    }

    @PluginMethod
    public void desactivarVoz(PluginCall call) {
        ConfigVoz.olvidar(getContext());
        VozEmergenciaService.detener(getContext());
        call.resolve();
    }

    /** Escucha hasta 8 segundos y responde si reconoció la frase. */
    @PluginMethod
    public void probarFrase(PluginCall call) {
        if (fraseValida(call) == null) {
            return;
        }
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "alPermisoParaProbar");
            return;
        }
        escucharPrueba(call);
    }

    @PermissionCallback
    private void alPermisoParaProbar(PluginCall call) {
        if (getPermissionState("microfono") == PermissionState.GRANTED) {
            escucharPrueba(call);
        } else {
            call.reject("Sin permiso de micrófono.", "SIN_PERMISO");
        }
    }

    private void escucharPrueba(PluginCall call) {
        PruebaVoz.probar(getContext(), fraseValida(call), (reconocida, escuchado) -> {
            JSObject respuesta = new JSObject();
            respuesta.put("reconocida", reconocida);
            respuesta.put("escuchado", escuchado);
            call.resolve(respuesta);
        });
    }

    /** Abre los ajustes de batería para que Samsung no detenga la escucha. */
    @PluginMethod
    public void abrirAjustesBateria(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (RuntimeException error) {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        call.resolve();
    }

    /** Abre los ajustes de notificaciones de Quick Help (Inicio del asistente). */
    @PluginMethod
    public void abrirAjustesNotificaciones(PluginCall call) {
        Intent ajustes;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ajustes = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            ajustes = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
        }
        try {
            getActivity().startActivity(ajustes);
        } catch (RuntimeException error) {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        call.resolve();
    }

    /** La frase debe tener al menos 2 palabras; si no, rechaza la llamada y devuelve null. */
    private String fraseValida(PluginCall call) {
        String frase = ConfigVoz.paraReconocer(call.getString("frase"));
        if (frase.split(" ").length < 2) {
            call.reject("Escribe una frase de al menos dos palabras.", "FRASE_INVALIDA");
            return null;
        }
        return frase;
    }

    /** Indica si el teléfono permite agregarlo desde la app y si ya está en la pantalla. */
    @PluginMethod
    public void estadoWidget(PluginCall call) {
        JSObject respuesta = new JSObject();
        respuesta.put("soportado", permiteAgregarDesdeApp());
        respuesta.put("agregado", cantidadWidgets() > 0);
        call.resolve(respuesta);
    }

    /** Abre el cuadro de Android «¿Agregar a la pantalla de inicio?». */
    @PluginMethod
    public void agregarWidget(PluginCall call) {
        String resultado;
        if (cantidadWidgets() > 0) {
            resultado = "ya_agregado";
        } else if (!permiteAgregarDesdeApp()) {
            resultado = "no_soportado";
        } else {
            boolean solicitado = AppWidgetManager.getInstance(getContext()).requestPinAppWidget(
                    new ComponentName(getContext(), WidgetEmergenciaProvider.class), null, null);
            resultado = solicitado ? "solicitado" : "no_soportado";
        }

        JSObject respuesta = new JSObject();
        respuesta.put("resultado", resultado);
        call.resolve(respuesta);
    }

    /** Android 13+ permite agregar el botón del panel rápido desde la app. */
    @PluginMethod
    public void estadoPanel(PluginCall call) {
        JSObject respuesta = new JSObject();
        respuesta.put("soportado", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU);
        respuesta.put("agregado", WidgetEmergenciaTile.estaAgregado(getContext()));
        call.resolve(respuesta);
    }

    /** Abre el cuadro de Android «¿Agregar al panel rápido?» (Android 13+). */
    @PluginMethod
    public void agregarAlPanel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            responderPanel(call, "no_soportado");
            return;
        }
        StatusBarManager barra = getContext().getSystemService(StatusBarManager.class);
        if (barra == null) {
            responderPanel(call, "no_soportado");
            return;
        }
        barra.requestAddTileService(
                new ComponentName(getContext(), WidgetEmergenciaTile.class),
                "SOS Quick Help",
                Icon.createWithResource(getContext(), R.drawable.ic_tile_sos),
                ContextCompat.getMainExecutor(getContext()),
                codigo -> {
                    if (codigo == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED) {
                        responderPanel(call, "agregado");
                    } else if (codigo == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED) {
                        responderPanel(call, "ya_agregado");
                    } else if (codigo == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED) {
                        responderPanel(call, "rechazado");
                    } else {
                        responderPanel(call, "no_soportado");
                    }
                });
    }

    private void responderPanel(PluginCall call, String resultado) {
        JSObject respuesta = new JSObject();
        respuesta.put("resultado", resultado);
        call.resolve(respuesta);
    }

    private boolean permiteAgregarDesdeApp() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported();
    }

    private int cantidadWidgets() {
        return AppWidgetManager.getInstance(getContext())
                .getAppWidgetIds(new ComponentName(getContext(), WidgetEmergenciaProvider.class))
                .length;
    }
}
