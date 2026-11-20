import { registerPlugin } from '@capacitor/core'; // Conecta con el plugin nativo del widget.

// Respuesta al pedir que Android agregue el widget a la pantalla de inicio.
export type ResultadoAgregarWidget = 'solicitado' | 'ya_agregado' | 'no_soportado';

// Respuesta al pedir que Android agregue el botón SOS al panel rápido.
export type ResultadoAgregarPanel = 'agregado' | 'ya_agregado' | 'rechazado' | 'no_soportado';

// Plugin nativo QuickHelpWidget (solo Android). Se registra una sola vez aquí.
export const WidgetAndroid = registerPlugin<{
    guardarSesion(datos: { token: string; rol: string }): Promise<void>;
    olvidarSesion(): Promise<void>;
    estadoWidget(): Promise<{ soportado: boolean; agregado: boolean }>;
    agregarWidget(): Promise<{ resultado: ResultadoAgregarWidget }>;
    estadoPanel(): Promise<{ soportado: boolean; agregado: boolean }>;
    agregarAlPanel(): Promise<{ resultado: ResultadoAgregarPanel }>;
    // Activación por voz: escucha la frase aunque la app esté cerrada.
    estadoVoz(): Promise<{ escuchando: boolean; permiso: boolean; frase: string | null }>;
    activarVoz(datos: { frase: string }): Promise<{ escuchando: boolean }>;
    desactivarVoz(): Promise<void>;
    probarFrase(datos: { frase: string }): Promise<{ reconocida: boolean; escuchado: string }>;
    abrirAjustesBateria(): Promise<void>;
    abrirAjustesNotificaciones(): Promise<void>;
}>('QuickHelpWidget');
