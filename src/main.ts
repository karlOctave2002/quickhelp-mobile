import { bootstrapApplication } from '@angular/platform-browser'; // Inicia la aplicación.
import { provideHttpClient } from '@angular/common/http'; // Configura las peticiones al backend.
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router'; // Configura la navegación.
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular'; // Configura Ionic.

import { routes } from './app/app.routes'; // Rutas de la aplicación.
import { AppComponent } from './app/app.component'; // Componente principal.

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideHttpClient(),
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding()),
  ],
}).catch(error => console.error('No se pudo iniciar Quick Help:', error));