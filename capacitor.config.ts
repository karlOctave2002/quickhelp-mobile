import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.quickhelp.mobile', // Identificador que registraremos en Firebase.
  appName: 'Quick Help',       // Nombre visible en el teléfono.
  webDir: 'www'               // Carpeta generada al compilar Angular.
};

export default config;