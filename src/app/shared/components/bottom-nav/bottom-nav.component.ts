import { Component, inject } from '@angular/core'; // Define el componente e inyecta dependencias.
import { Router, RouterLink } from '@angular/router'; // Permite navegar y consultar la ruta.

@Component({
    selector: 'app-bottom-nav',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './bottom-nav.component.html',
    styleUrls: ['./bottom-nav.component.scss'],
})
export class BottomNavComponent {
    private readonly router = inject(Router); // La ruta determina la opción activa.

    // Habilitaremos cada destino cuando implementemos su página.
    private readonly opcionesAdulto = [
        {
            nombre: 'Inicio', ruta: '/home', habilitada: true,
            icono: 'M3 10 12 3 21 10V21H15V14H9V21H3Z',
        },
        {
            nombre: 'Solicitudes', ruta: '/solicitudes', habilitada: true,
            icono: 'M8 4H5V21H19V4H16 M8 3H16V7H8Z M8 12H16 M8 16H14',
        },
        {
            nombre: 'Red de apoyo', ruta: '/red-apoyo', habilitada: true,
            icono: 'M12 8A3 3 0 1 1 6 8A3 3 0 1 1 12 8 M3 21V18A6 6 0 0 1 15 18V21 M16 5A3 3 0 0 1 16 11 M18 15A5 5 0 0 1 21 20',
        },
        {
            nombre: 'Perfil', ruta: '/perfil', habilitada: true,
            icono: 'M16 8A4 4 0 1 1 8 8A4 4 0 1 1 16 8 M4 22V19A8 8 0 0 1 20 19V22',
        },
    ];

    // El asistente usa tres destinos: Inicio, Solicitudes y Perfil.
    private readonly opcionesApoyo = [
        { ...this.opcionesAdulto[0], ruta: '/apoyo/inicio' },
        { ...this.opcionesAdulto[1], ruta: '/apoyo/solicitudes' },
        { ...this.opcionesAdulto[3], ruta: '/apoyo/perfil' },
    ];

    get opciones() {
        const ruta = this.router.url.split(/[?#]/)[0]; // Consulta la vista de demostración actual.
        return ruta.startsWith('/apoyo/')
            ? this.opcionesApoyo
            : this.opcionesAdulto;
    }

    get indiceActivo(): number {
        const ruta = this.router.url.split(/[?#]/)[0]; // Excluye parámetros y fragmentos.
        return this.opciones.findIndex(
            opcion => ruta === opcion.ruta || ruta.startsWith(`${opcion.ruta}/`),
        );
    }
}