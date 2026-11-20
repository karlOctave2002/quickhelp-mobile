package cl.quickhelp.mobile;

import android.os.Bundle; // Estado de la actividad.
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QuickHelpPushAndroidPlugin.class); // Habilita la baja del dispositivo.
        registerPlugin(cl.quickhelp.WidgetEmergenciaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
