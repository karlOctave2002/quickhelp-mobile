package cl.quickhelp;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.Normalizer;
import java.util.Locale;

/** Frase clave del adulto guardada en el teléfono, para escuchar sin abrir la app. */
final class ConfigVoz {

    private static final String PREFERENCIAS = "quickhelp_voz";
    private static final String CLAVE_FRASE = "frase";
    private static final Locale ESPANOL = new Locale("es");

    private ConfigVoz() {
    }

    static void guardar(Context context, String frase) {
        preferencias(context).edit().putString(CLAVE_FRASE, paraReconocer(frase)).apply();
    }

    static void olvidar(Context context) {
        preferencias(context).edit().clear().apply();
    }

    /** Frase activa o null si la voz está apagada en este teléfono. */
    static String frase(Context context) {
        String frase = preferencias(context).getString(CLAVE_FRASE, null);
        return frase == null || frase.isEmpty() ? null : frase;
    }

    /** Minúsculas, sin signos y con un espacio entre palabras (conserva tildes y ñ). */
    static String paraReconocer(String texto) {
        if (texto == null) {
            return "";
        }
        return texto.toLowerCase(ESPANOL)
                .replaceAll("[^\\p{L}\\p{N} ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /** Igual que paraReconocer, pero además sin tildes: así «ayúdame» y «ayudame» coinciden. */
    static String paraComparar(String texto) {
        return Normalizer.normalize(paraReconocer(texto), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
    }

    /** true si el texto escuchado contiene la frase completa, palabra por palabra. */
    static boolean contiene(String escuchado, String frase) {
        String texto = " " + paraComparar(escuchado) + " ";
        String buscada = paraComparar(frase);
        return !buscada.isEmpty() && texto.contains(" " + buscada + " ");
    }

    private static SharedPreferences preferencias(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
    }
}
