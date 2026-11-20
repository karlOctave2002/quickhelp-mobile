package cl.quickhelp;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * El teléfono habla en español por el volumen de alarma (se oye aunque esté en silencio).
 * Si no hay voz en español instalada, no habla y sigue igual.
 */
final class VozHablada {

    interface AlTerminar {
        void listo();
    }

    private static final long ESPERA_MAXIMA_MS = 15_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, AlTerminar> pendientes = new HashMap<>();
    private TextToSpeech tts;
    private boolean lista;

    VozHablada(Context context) {
        this.tts = new TextToSpeech(context.getApplicationContext(), estado -> {
            if (estado != TextToSpeech.SUCCESS) {
                return;
            }
            int idioma = this.tts.setLanguage(new Locale("es", "CL"));
            if (idioma < TextToSpeech.LANG_AVAILABLE) {
                idioma = this.tts.setLanguage(new Locale("es"));
            }
            lista = idioma >= TextToSpeech.LANG_AVAILABLE;
            this.tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
            }

            @Override
            public void onDone(String id) {
                handler.post(() -> terminar(id));
            }

            @Override
            public void onError(String id) {
                handler.post(() -> terminar(id));
            }
        });
    }

    /** Dice el texto y avisa al terminar (o de inmediato si no puede hablar). */
    void decir(String texto, AlTerminar alTerminar) {
        if (!lista) {
            handler.post(alTerminar::listo);
            return;
        }
        String id = UUID.randomUUID().toString();
        pendientes.put(id, alTerminar);
        // Por si el motor nunca avisa que terminó.
        handler.postDelayed(() -> terminar(id), ESPERA_MAXIMA_MS);
        if (tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
            terminar(id);
        }
    }

    void cerrar() {
        pendientes.clear();
        handler.removeCallbacksAndMessages(null);
        tts.stop();
        tts.shutdown();
    }

    private void terminar(String id) {
        AlTerminar alTerminar = pendientes.remove(id);
        if (alTerminar != null) {
            alTerminar.listo();
        }
    }
}
