import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../config';
import { AuthService } from '../services/auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getToken();
  const peticion =
    token && req.url.startsWith(API_URL)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      const esLogin = req.url.endsWith('/auth/login');

      // Sesión vencida, cerrada, cuenta dada de baja o bloqueada
      if (error.status === 401 && !esLogin) {
        const mensaje =
          typeof error.error?.mensaje === 'string'
            ? error.error.mensaje
            : 'Su sesión ya no es válida. Inicie sesión nuevamente.';
        auth.guardarAviso(mensaje);
        auth.logout();
        router.navigate(['/login']);
      }

      // Contraseña temporal sin cambiar
      if (error.status === 403 && error.error?.codigo === 'CAMBIO_PASSWORD_REQUERIDO') {
        router.navigate(['/cambiar-password']);
      }

      return throwError(() => error);
    })
  );
};