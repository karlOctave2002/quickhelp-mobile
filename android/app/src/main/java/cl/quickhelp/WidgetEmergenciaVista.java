package cl.quickhelp;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import cl.quickhelp.mobile.R;

/** Dibuja los estados del widget de emergencia en todas sus copias y en el panel rápido. */
final class WidgetEmergenciaVista {

    private static final int COLOR_ROJO = 0xFFC91D39;
    private static final int COLOR_GRIS = 0xFF4A5566;

    private WidgetEmergenciaVista() {
    }

    /** Botón rojo pequeño «SOS». */
    static void mostrarReposo(Context context) {
        RemoteViews vista = crearVista(context);
        vista.setViewVisibility(R.id.widget_boton_sos, View.VISIBLE);
        vista.setViewVisibility(R.id.widget_franja, View.GONE);
        actualizar(context, vista);
        WidgetEmergenciaTile.mostrar(false, "Toca para pedir ayuda");
        WidgetEmergenciaTile.pedirActualizacion(context);
    }

    /** Franja abierta: cuenta regresiva (roja) o emergencia cancelada (gris). */
    static void mostrarFranja(Context context, String numero, String titulo, String subtitulo, boolean gris) {
        RemoteViews vista = crearVista(context);
        vista.setViewVisibility(R.id.widget_boton_sos, View.GONE);
        vista.setViewVisibility(R.id.widget_franja, View.VISIBLE);
        vista.setInt(R.id.widget_franja, "setBackgroundResource",
                gris ? R.drawable.widget_franja_cancelada : R.drawable.widget_franja);
        vista.setTextViewText(R.id.widget_numero, numero);
        vista.setTextColor(R.id.widget_numero, gris ? COLOR_GRIS : COLOR_ROJO);
        vista.setTextViewText(R.id.widget_titulo, titulo);
        vista.setTextViewText(R.id.widget_subtitulo, subtitulo);
        actualizar(context, vista);
        // El botón del panel rápido muestra lo mismo que la franja del widget.
        boolean esNumero = numero.matches("\\d+");
        WidgetEmergenciaTile.mostrar(!gris, esNumero ? "Se envía en " + numero + " s" : titulo);
    }

    private static RemoteViews crearVista(Context context) {
        RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_emergencia);
        vista.setOnClickPendingIntent(R.id.widget_raiz, crearIntentToque(context));
        return vista;
    }

    /** El mismo toque sirve para activar y para cancelar: siempre va al servicio. */
    private static PendingIntent crearIntentToque(Context context) {
        Intent intent = new Intent(context, WidgetEmergenciaService.class)
                .setAction(WidgetEmergenciaService.ACCION_TOQUE)
                .putExtra(WidgetEmergenciaService.EXTRA_ORIGEN, "WIDGET");
        int banderas = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return PendingIntent.getForegroundService(context, 0, intent, banderas);
        }
        return PendingIntent.getService(context, 0, intent, banderas);
    }

    private static void actualizar(Context context, RemoteViews vista) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] idsWidget = manager.getAppWidgetIds(new ComponentName(context, WidgetEmergenciaProvider.class));
        if (idsWidget.length > 0) {
            manager.updateAppWidget(idsWidget, vista);
        }
    }
}
