package cl.quickhelp.mobile;

import com.getcapacitor.Plugin; // Puente entre el código móvil y Android.
import com.getcapacitor.PluginCall; // Resultado devuelto a TypeScript.
import com.getcapacitor.PluginMethod; // Expone la operación a la app.
import com.getcapacitor.annotation.CapacitorPlugin; // Registra el nombre del puente.
import com.google.firebase.messaging.FirebaseMessaging; // Revoca el token del dispositivo.

@CapacitorPlugin(name = "QuickHelpPushAndroid")
public class QuickHelpPushAndroidPlugin extends Plugin {

    @PluginMethod
    public void revocarToken(PluginCall call) {
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            // La próxima sesión volverá a habilitar FCM al solicitar su token.
            messaging.setAutoInitEnabled(false);
            messaging.deleteToken().addOnCompleteListener(resultado -> {
                if (resultado.isSuccessful()) call.resolve();
                else call.reject("Firebase no pudo revocar el token del dispositivo.");
            });
        } catch (IllegalStateException e) {
            call.reject("Firebase no está disponible en Android.");
        }
    }
}
