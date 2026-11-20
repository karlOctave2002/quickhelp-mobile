import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { NotificacionesPushService } from './core/services/notificaciones-push.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    inject(NotificacionesPushService).iniciar(); // Observa el inicio y cierre de sesión.
  }
}
