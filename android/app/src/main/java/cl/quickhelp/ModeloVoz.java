package cl.quickhelp;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Modelo de voz en español (Vosk, sin internet).
 * Viene comprimido en assets/vosk; la primera vez se descomprime en la memoria de la app.
 */
final class ModeloVoz {

    interface AlCargar {
        void listo(Model modelo);

        void fallo();
    }

    private static final String ZIP = "vosk/vosk-model-es.zip";
    private static final String VERSION = "small-es-0.42";

    private static final ExecutorService HILO = Executors.newSingleThreadExecutor();
    private static final Handler PRINCIPAL = new Handler(Looper.getMainLooper());
    private static Model modelo; // Se comparte entre la escucha y la prueba de la frase.

    private ModeloVoz() {
    }

    static void cargar(Context context, AlCargar alCargar) {
        Context app = context.getApplicationContext();
        HILO.execute(() -> {
            try {
                Model cargado;
                synchronized (ModeloVoz.class) {
                    if (modelo == null) {
                        LibVosk.setLogLevel(LogLevel.WARNINGS);
                        modelo = new Model(descomprimir(app).getAbsolutePath());
                    }
                    cargado = modelo;
                }
                PRINCIPAL.post(() -> alCargar.listo(cargado));
            } catch (IOException | RuntimeException error) {
                PRINCIPAL.post(alCargar::fallo);
            }
        });
    }

    private static File descomprimir(Context app) throws IOException {
        File base = new File(app.getFilesDir(), "vosk");
        File destino = new File(base, "model-es");
        if (new File(destino, ".version-" + VERSION).exists()) {
            return destino;
        }

        File temporal = new File(base, "model-es-tmp");
        borrar(temporal);
        borrar(destino);
        String raiz = temporal.getCanonicalPath() + File.separator;
        byte[] bloque = new byte[64 * 1024];

        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(app.getAssets().open(ZIP)))) {
            ZipEntry entrada;
            while ((entrada = zip.getNextEntry()) != null) {
                // Quita la carpeta principal del zip (vosk-model-small-es-0.42/).
                String nombre = entrada.getName();
                int barra = nombre.indexOf('/');
                String relativo = barra >= 0 ? nombre.substring(barra + 1) : nombre;
                if (relativo.isEmpty()) {
                    continue;
                }

                File archivo = new File(temporal, relativo);
                if (!archivo.getCanonicalPath().startsWith(raiz)) {
                    throw new IOException("Ruta no válida en el modelo.");
                }
                if (entrada.isDirectory()) {
                    archivo.mkdirs();
                    continue;
                }
                File padre = archivo.getParentFile();
                if (padre != null) {
                    padre.mkdirs();
                }
                try (OutputStream salida = new FileOutputStream(archivo)) {
                    int leidos;
                    while ((leidos = zip.read(bloque)) > 0) {
                        salida.write(bloque, 0, leidos);
                    }
                }
            }
        }

        if (!temporal.renameTo(destino)) {
            throw new IOException("No se pudo preparar el modelo de voz.");
        }
        new File(destino, ".version-" + VERSION).createNewFile();
        return destino;
    }

    private static void borrar(File archivo) {
        File[] hijos = archivo.listFiles();
        if (hijos != null) {
            for (File hijo : hijos) {
                borrar(hijo);
            }
        }
        archivo.delete();
    }
}
