package cl.quickhelp;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import androidx.core.content.ContextCompat;

import cl.quickhelp.mobile.R;

/**
 * Botón «SOS Quick Help» del panel rápido de Android.
 * Usa la misma cuenta regresiva que el widget: 1 toque activa, 2 toques cancelan.
 */
public class WidgetEmergenciaTile extends TileService {

    // Lo que muestra el botón; lo actualiza WidgetEmergenciaVista en cada cambio.
    private static volatile boolean contando;
    private static volatile String subtitulo = "Toca para pedir ayuda";
    private static volatile WidgetEmergenciaTile visible;

    private static final String PREFERENCIAS = "quickhelp_panel";
    private static final String CLAVE_AGREGADO = "agregado";

    /** Si el adulto ya puso el botón en su panel rápido (lo usa el Perfil). */
    static boolean estaAgregado(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)
                .getBoolean(CLAVE_AGREGADO, false);
    }

    private void recordarAgregado(boolean agregado) {
        getApplicationContext().getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)
                .edit().putBoolean(CLAVE_AGREGADO, agregado).apply();
    }

    /** Llamado desde WidgetEmergenciaVista para reflejar el mismo estado del widget. */
    static void mostrar(boolean activo, String texto) {
        contando = activo;
        subtitulo = texto;
        WidgetEmergenciaTile tile = visible;
        if (tile != null) {
            tile.actualizar();
        }
    }

    @Override
    public void onTileAdded() {
        recordarAgregado(true);
    }

    @Override
    public void onTileRemoved() {
        recordarAgregado(false);
    }

    @Override
    public void onStartListening() {
        // Solo se llama si el botón está en el panel: cubre también los agregados antes.
        recordarAgregado(true);
        visible = this;
        actualizar();
    }

    @Override
    public void onStopListening() {
        if (visible == this) {
            visible = null;
        }
    }

    @Override
    public void onClick() {
        Intent toque = new Intent(this, WidgetEmergenciaService.class)
                .setAction(WidgetEmergenciaService.ACCION_TOQUE)
                .putExtra(WidgetEmergenciaService.EXTRA_ORIGEN, "PANEL");
        try {
            ContextCompat.startForegroundService(this, toque);
        } catch (IllegalStateException error) {
            // Si Android no deja iniciar la cuenta desde aquí, abre la app con su botón SOS.
            abrirApp();
        }
    }

    private void actualizar() {
        Tile tile = getQsTile();
        if (tile == null) {
            return;
        }
        tile.setIcon(Icon.createWithResource(this, R.drawable.ic_tile_sos));
        tile.setLabel("SOS Quick Help");
        tile.setContentDescription("Activar emergencia de Quick Help");
        tile.setState(contando ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.setSubtitle(subtitulo);
        }
        tile.updateTile();
    }

    @SuppressWarnings("deprecation")
    private void abrirApp() {
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (abrir == null) {
            return;
        }
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(abrir);
        }
    }

    /** Pide a Android refrescar el botón aunque el panel no esté abierto. */
    static void pedirActualizacion(Context context) {
        try {
            TileService.requestListeningState(context,
                    new ComponentName(context, WidgetEmergenciaTile.class));
        } catch (RuntimeException error) {
            // El botón no está agregado al panel: no hay nada que refrescar.
        }
    }
}
