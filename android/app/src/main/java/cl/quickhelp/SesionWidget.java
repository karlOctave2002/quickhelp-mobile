package cl.quickhelp;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Copia nativa de la sesión para que el widget envíe la SOS sin abrir la app.
 * La app la guarda al iniciar sesión y la borra al cerrarla.
 */
final class SesionWidget {

    private static final String PREFERENCIAS = "quickhelp_widget";
    private static final String CLAVE_TOKEN = "token";
    private static final String CLAVE_ROL = "rol";

    private SesionWidget() {
    }

    static void guardar(Context context, String token, String rol) {
        preferencias(context).edit()
                .putString(CLAVE_TOKEN, token)
                .putString(CLAVE_ROL, rol)
                .apply();
    }

    static void olvidar(Context context) {
        preferencias(context).edit().clear().apply();
    }

    /** Token solo si la cuenta guardada es de un adulto mayor. */
    static String tokenAdultoMayor(Context context) {
        SharedPreferences preferencias = preferencias(context);
        String token = preferencias.getString(CLAVE_TOKEN, null);
        String rol = preferencias.getString(CLAVE_ROL, null);
        if (token == null || token.trim().isEmpty() || !"ADULTO_MAYOR".equals(rol)) {
            return null;
        }
        return token;
    }

    private static SharedPreferences preferencias(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
    }
}
