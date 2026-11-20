import { Injectable, signal } from '@angular/core'; // Servicio compartido y estado reactivo.

@Injectable({ providedIn: 'root' })
export class VinculacionDemoService {
    private readonly numeroInterno = signal<string | null>(null); // Código temporal del perfil de demostración.
    readonly numero = this.numeroInterno.asReadonly(); // Permite consultar el código sin modificarlo.

    generarNumero(): void {
        if (this.numeroInterno() !== null) return; // Conserva el número ya generado.

        const valores = new Uint32Array(1); // Contenedor para un valor aleatorio.
        crypto.getRandomValues(valores); // Obtiene aleatoriedad del navegador.
        const numero = String(100000 + (valores[0] % 900000)); // Usa seis dígitos para esta demostración.
        this.numeroInterno.set(numero); // Comparte el número entre las páginas de la app.
    }

    validarNumero(numero: string): boolean {
        const actual = this.numeroInterno(); // Consulta el código generado en Perfil.
        return actual !== null && numero.trim() === actual; // Comprueba la coincidencia.
    }
}