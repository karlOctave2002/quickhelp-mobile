import { Component } from '@angular/core'; // Define el contenedor.
import { IonRouterOutlet } from '@ionic/angular'; // Presenta las páginas móviles.
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component'; // Footer compartido.

@Component({
    selector: 'app-mobile-layout',
    standalone: true,
    imports: [IonRouterOutlet, BottomNavComponent],
    templateUrl: './mobile-layout.component.html',
    styleUrls: ['./mobile-layout.component.scss'],
})
export class MobileLayoutComponent { }