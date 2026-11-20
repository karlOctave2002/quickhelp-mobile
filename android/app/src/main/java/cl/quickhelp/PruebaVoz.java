package cl.quickhelp;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

/** «Probar mi frase» del Perfil: escucha hasta 8 segundos y dice si reconoció la frase. */
final class PruebaVoz {

    interface AlTerminar {
        void resultado(boolean reconocida, String escuchado);
    }

    private static final float FRECUENCIA = 16_000f;
    private static final long DURACION_MS = 8_000;

    private PruebaVoz() {
    }

    static void probar(Context context, String frase, AlTerminar alTerminar) {
        Handler handler = new Handler(Looper.getMainLooper());
        String buscada = ConfigVoz.paraReconocer(frase);
        VozEmergenciaService.pausarParaPrueba(true); // Libera el micrófono.

        ModeloVoz.cargar(context, new ModeloVoz.AlCargar() {
            @Override
            public void listo(Model modelo) {
                escuchar(modelo, buscada, handler, alTerminar);
            }

            @Override
            public void fallo() {
                VozEmergenciaService.pausarParaPrueba(false);
                alTerminar.resultado(false, "");
            }
        });
    }

    private static void escuchar(Model modelo, String frase, Handler handler, AlTerminar alTerminar) {
        final boolean[] terminado = {false};
        final String[] ultimo = {""};
        final Recognizer[] reconocedor = {null};
        final SpeechService[] escucha = {null};

        Runnable[] cerrar = new Runnable[1];
        cerrar[0] = () -> {
            if (escucha[0] != null) {
                escucha[0].stop();
                escucha[0].shutdown();
            }
            if (reconocedor[0] != null) {
                reconocedor[0].close();
            }
            VozEmergenciaService.pausarParaPrueba(false);
        };

        RecognitionListener oyente = new RecognitionListener() {
            private void revisar(String hipotesis) {
                if (terminado[0]) {
                    return;
                }
                String texto;
                try {
                    texto = new JSONObject(hipotesis).optString("text", "");
                } catch (Exception error) {
                    return;
                }
                if (!texto.isEmpty()) {
                    ultimo[0] = texto;
                }
                if (ConfigVoz.contiene(texto, frase)) {
                    terminado[0] = true;
                    cerrar[0].run();
                    alTerminar.resultado(true, texto);
                }
            }

            @Override
            public void onPartialResult(String hipotesis) {
            }

            @Override
            public void onResult(String hipotesis) {
                revisar(hipotesis);
            }

            @Override
            public void onFinalResult(String hipotesis) {
                revisar(hipotesis);
            }

            @Override
            public void onError(Exception error) {
                if (!terminado[0]) {
                    terminado[0] = true;
                    cerrar[0].run();
                    alTerminar.resultado(false, ultimo[0]);
                }
            }

            @Override
            public void onTimeout() {
                onError(null);
            }
        };

        try {
            reconocedor[0] = new Recognizer(modelo, FRECUENCIA, new JSONArray().put(frase).put("[unk]").toString());
            escucha[0] = new SpeechService(reconocedor[0], FRECUENCIA);
            escucha[0].startListening(oyente);
        } catch (Exception error) {
            terminado[0] = true;
            cerrar[0].run();
            alTerminar.resultado(false, "");
            return;
        }

        handler.postDelayed(() -> {
            if (!terminado[0]) {
                terminado[0] = true;
                cerrar[0].run();
                alTerminar.resultado(false, ultimo[0]);
            }
        }, DURACION_MS);
    }
}
