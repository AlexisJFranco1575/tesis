import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

// Sesión válida y contraseña ya actualizada (para entrar al dashboard)
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    auth.logout();
    return router.createUrlTree(['/login']);
  }
  if (auth.debeCambiarPassword()) {
    return router.createUrlTree(['/cambiar-password']);
  }
  return true;
};

// Sesión válida, aunque aún deba cambiar la contraseña temporal (pantalla de cambio de contraseña)
export const sesionGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }
  auth.logout();
  return router.createUrlTree(['/login']);
};