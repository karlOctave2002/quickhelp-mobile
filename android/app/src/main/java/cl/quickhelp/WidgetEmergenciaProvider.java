package cl.quickhelp;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Widget de emergencia de la pantalla de inicio.
 * Solo dibuja el estado de reposo; la cuenta regresiva vive en WidgetEmergenciaService.
 */
public class WidgetEmergenciaProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] idsWidget) {
        if (!WidgetEmergenciaService.estaActivo()) {
            WidgetEmergenciaVista.mostrarReposo(context);
        }
    }
}
