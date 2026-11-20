# Quick Help · App móvil

Aplicación móvil para que **adultos mayores pidan ayuda** con un solo gesto y su **red de apoyo** (familiares, vecinos o cuidadores) reciba el aviso al instante, vea la ubicación, responda y converse por chat.

Proyecto de Ingeniería en Informática · **Duoc UC** (2026).

---

## Funcionalidades

### Persona adulta (`ADULTO_MAYOR`)
- **Botón SOS** (mantener presionado 2 s) que envía la ubicación GPS.
- **Widget en la pantalla de inicio**: un toque inicia una cuenta regresiva de 10 s y envía la emergencia **sin abrir la app**. Se cancela tocando 2 veces.
- **Botón SOS en el panel rápido** de Android (junto a WiFi o Linterna), disponible desde cualquier pantalla.
- **Activación por voz con la app cerrada**: al decir la frase configurada, el teléfono avisa en voz alta, cuenta 10 s y envía la SOS. Para cancelar basta con decir «cancelar». El reconocimiento funciona **sin internet** (Vosk).
- Mensajes rápidos al chat de la emergencia: «Me siento mal», «Necesito asistencia», «Estoy bien».
- **Mi red de apoyo**: aceptar o rechazar solicitudes, **retirar** a un integrante y **reactivarlo**.
- Historial de solicitudes con su chat.

### Persona de apoyo (`ASISTENTE`)
- Notificación de emergencia con sonido propio, visible en la pantalla bloqueada.
- Tarjeta de la emergencia con dirección, mapa y respuestas: «Voy en camino», «Voy a demorar», «No puedo asistir» o un mensaje propio.
- Chat por emergencia con la persona adulta y el resto de la red.
- Recordatorios cada 2 minutos (hasta 5) mientras nadie responda.
- Aviso si tiene las notificaciones desactivadas.

### General
- Registro e inicio de sesión por rol (la sesión dura 30 días).
- **Recuperación de contraseña** con un código de 6 dígitos enviado por correo.
- Estados de la emergencia: **Activa → Activa/Pendiente** (escalada al administrador si en 2 min nadie va en camino) **→ En atención → Resuelta** (la cierra el administrador).

---

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| App | Ionic 9 · Angular 22 (componentes *standalone* y *signals*) · Capacitor 8 |
| Android nativo | Java: widget (`AppWidgetProvider`), panel rápido (`TileService`), servicios en primer plano, voz con **Vosk** y `TextToSpeech` |
| Notificaciones | Firebase Cloud Messaging |
| Backend | Spring Boot 4 · Java 17 · PostgreSQL ([repositorio aparte](https://github.com/Schna2018/quickhelp-backend)), desplegado en Render |
| Correos | Brevo (API HTTPS) |
| Direcciones | Google Geocoding con respaldo de OpenStreetMap |

---

## Estructura

```
src/app/
├── core/services/        # Conexión con el backend (auth, alertas, red, perfil, push…)
├── home/                 # Inicio de la persona adulta (botón SOS)
├── pages/
│   ├── login/            # Inicio de sesión
│   ├── registro/         # Registro por rol
│   ├── recuperar-clave/  # Recuperar contraseña por correo
│   ├── red-apoyo/        # Mi red de apoyo
│   ├── solicitudes/      # Historial y chat
│   ├── inicio-apoyo/     # Inicio de la persona de apoyo (tarjetas, chat, mapa)
│   └── perfil/           # Perfil, widget, panel rápido y voz
├── shared/components/    # Navegación inferior, filas de contacto…
android/app/src/main/java/cl/quickhelp/   # Widget, panel rápido y activación por voz
```

---

## Cómo ejecutarla

**Requisitos:** Node.js 20 o superior, Ionic CLI (`npm i -g @ionic/cli`), Android Studio con JDK 17 y un celular Android con depuración USB.

```bash
npm install
ionic build
npx cap sync android
```

Luego abre la carpeta `android/` en Android Studio y presiona **Run**.

Para probar solo la parte web:

```bash
ionic serve
```

> La app se conecta al backend publicado en `https://quickhelp-backend.onrender.com`. En el plan gratuito de Render el servidor «se duerme», así que la primera consulta puede tardar hasta un minuto.

### Variables locales (opcional)

Solo para el servidor de desarrollo web (`ionic serve`) se usa un archivo `.env` en la raíz, que **no se sube al repositorio**:

```
QUICKHELP_MAPS_KEY=tu_clave_de_google_maps
```

---

## Generar el APK

1. `ionic build` y `npx cap sync android`
2. En Android Studio: **Build → Generate App Bundles or APKs → Generate APKs**
3. El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`

**Para instalarlo:** desinstala cualquier versión anterior, permite la instalación de apps de origen desconocido y, si aparece Play Protect, elige «Instalar de todas formas».

---

## Notas

- Probada en Android (Samsung Galaxy A20, Android 11). No hay versión para iOS.
- La activación por voz consume batería: conviene excluir la app de la optimización de batería desde su Perfil.
- Después de reiniciar el teléfono hay que abrir la app una vez para que vuelva a escuchar.
