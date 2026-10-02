import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_URL, ROLES_CONTROL } from '../config';

export interface UsuarioSesion {
  id: string;
  nombreCompleto: string;
  rol: string;
  departamento: string;
}

interface RespuestaLogin {
  mensaje: string;
  token: string;
  usuario: UsuarioSesion;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly urlAuth = `${API_URL}/auth`;

  login(email: string, password: string): Observable<RespuestaLogin> {
    return this.http.post<RespuestaLogin>(`${this.urlAuth}/login`, { email, password }).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('usuario', JSON.stringify(res.usuario));
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUsuario(): UsuarioSesion | null {
    const guardado = localStorage.getItem('usuario');
    if (!guardado) {
      return null;
    }
    try {
      return JSON.parse(guardado) as UsuarioSesion;
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    return !!token && this.tokenVigente(token);
  }

  // ¿El usuario tiene un rol de control? (verificar integridad, bitácora, desbloqueo)
  esControl(): boolean {
    const rol = this.getUsuario()?.rol;
    return !!rol && ROLES_CONTROL.includes(rol);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }

  // Lee la fecha de expiración (exp) que trae el JWT
  private tokenVigente(token: string): boolean {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
}