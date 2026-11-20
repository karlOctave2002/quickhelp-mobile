import { Component, computed, input, output, signal } from '@angular/core';

@Component({
    selector: 'app-fila-contacto',
    standalone: true,
    templateUrl: './fila-contacto.component.html',
    styleUrls: ['./fila-contacto.component.scss'],
})
export class FilaContactoComponent {
    readonly nombre = input.required<string>();
    readonly telefono = input<string | null>(null);
    readonly fotoUrl = input<string | null>(null);
    readonly pendiente = input(false);
    readonly activa = input(true);
    readonly bloqueada = input(false);
    readonly gestionable = input(false); // Muestra «Retirar» o «Reactivar» en la red.

    readonly aceptar = output<void>();
    readonly rechazar = output<void>();
    readonly retirar = output<void>();
    readonly reactivar = output<void>();
    readonly fotoFallida = signal<string | null>(null);

    // Si no hay foto, muestra hasta dos iniciales del nombre real.
    readonly iniciales = computed(() =>
        this.nombre().trim().split(/\s+/).slice(0, 2)
            .map(parte => parte.charAt(0)).join('').toLocaleUpperCase('es') || '·'
    );
}