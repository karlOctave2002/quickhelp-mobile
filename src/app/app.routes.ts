import { Routes } from '@angular/router'; // Define las rutas de la app.

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page')
      .then(m => m.LoginPage), // Pantalla de acceso sin footer.
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full', // Abre el login al entrar a la app.
  },
  {
    path: 'recuperar-clave',
    loadComponent: () => import('./pages/recuperar-clave/recuperar-clave.page')
      .then(m => m.RecuperarClavePage), // Recuperar la contraseña con un código por correo.
  },
  {
    path: 'registro',
    loadComponent: () => import('./pages/registro/registro.page')
      .then(m => m.RegistroPage), // Registro independiente, sin footer.
  },
  {
    path: '',
    loadComponent: () => import('./layouts/mobile-layout/mobile-layout.component')
      .then(m => m.MobileLayoutComponent), // Contenedor de las páginas con footer.
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.page')
          .then(m => m.HomePage), // Inicio.
      },
      {
        path: 'solicitudes',
        loadComponent: () => import('./pages/solicitudes/solicitudes.page')
          .then(m => m.SolicitudesPage), // Solicitudes de ayuda.
      },
      {
        path: 'red-apoyo',
        loadComponent: () => import('./pages/red-apoyo/red-apoyo.page')
          .then(m => m.RedApoyoPage), // Contactos de apoyo.
      },
      {
        path: 'perfil',
        loadComponent: () => import('./pages/perfil/perfil.page')
          .then(m => m.PerfilPage), // Perfil del usuario.
      },
      {
        path: 'apoyo/inicio',
        loadComponent: () => import('./pages/inicio-apoyo/inicio-apoyo.page')
          .then(m => m.InicioApoyoPage), // Inicio de la persona de apoyo.
      },
      {
        path: 'apoyo/solicitudes',
        loadComponent: () => import('./pages/solicitudes/solicitudes.page')
          .then(m => m.SolicitudesPage), // Historial de la persona de apoyo.
      },
      {
        // Las personas vinculadas ahora se muestran en el Inicio del asistente.
        path: 'apoyo/personas',
        redirectTo: 'apoyo/inicio',
        pathMatch: 'full',
      },
      {
        path: 'apoyo/perfil',
        loadComponent: () => import('./pages/perfil/perfil.page')
          .then(m => m.PerfilPage), // Perfil de la persona de apoyo.
      },
    ],
  },
];