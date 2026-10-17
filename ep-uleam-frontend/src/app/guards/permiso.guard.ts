import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

const redirigirSegunPermisos = (auth: AuthService, router: Router) => {
  const ruta = auth.rutaInicio();
  if (ruta) {
    return router.parseUrl(ruta);
  }

  // Cuenta sin ningún permiso: no hay a dónde llevarla
  auth.guardarAviso('Su cuenta no tiene permisos asignados. Comuníquese con Gerencia o TIC.');
  auth.logout();
  return router.createUrlTree(['/login']);
};

// Deja pasar si el usuario tiene AL MENOS UNO de los permisos indicados
export const permisoGuard =
  (...permisos: string[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.tieneAlgunPermiso(...permisos) ? true : redirigirSegunPermisos(auth, router);
  };

// Entrada a /dashboard: redirige a la primera pantalla disponible
export const inicioGuard: CanActivateFn = () => redirigirSegunPermisos(inject(AuthService), inject(Router));