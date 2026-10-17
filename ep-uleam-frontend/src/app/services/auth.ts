import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { API_URL } from '../config';

export interface UsuarioSesion {
  id: string;
  nombreCompleto: string;
  email: string;
  departamento: string;
  roles: string[];
  rol: string; // roles unidos por coma, para mostrar
  permisos: string[];
  debeCambiarPassword: boolean;
}

export interface RespuestaSesion {
  mensaje: string;
  token: string;
  usuario: UsuarioSesion;
}

const PERMISOS_ADMINISTRACION = ['usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly urlAuth = `${API_URL}/auth`;

  // ---------- Peticiones ----------

  login(email: string, password: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>(`${this.urlAuth}/login`, { email, password })
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  recuperar(email: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.urlAuth}/recuperar`, { email });
  }

  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<RespuestaSesion> {
    return this.http
      .post<RespuestaSesion>(`${this.urlAuth}/cambiar-password`, { passwordActual, passwordNueva })
      .pipe(tap((res) => this.guardarSesion(res)));
  }

  // Trae los datos y permisos actuales del usuario. También sirve de "latido" de actividad.
  refrescarPerfil(): Observable<UsuarioSesion> {
    return this.http
      .get<UsuarioSesion>(`${this.urlAuth}/yo`)
      .pipe(tap((usuario) => localStorage.setItem('usuario', JSON.stringify(usuario))));
  }

  // Avisa al servidor (queda en la bitácora) y limpia la sesión local, aunque el servidor no responda
  cerrarSesion(motivo: 'manual' | 'inactividad' = 'manual'): Observable<void> {
    return this.http.post(`${this.urlAuth}/logout`, { motivo }).pipe(
      catchError(() => of(null)),
      tap(() => this.logout()),
      map(() => undefined)
    );
  }

  // ---------- Estado de la sesión (local) ----------

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUsuario(): UsuarioSesion | null {
    const guardado = localStorage.getItem('usuario');
    if (!guardado) {
      return null;
    }
    try {
      const usuario = JSON.parse(guardado) as Partial<UsuarioSesion>;
      return {
        ...(usuario as UsuarioSesion),
        roles: usuario.roles ?? [],
        permisos: usuario.permisos ?? [],
      };
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    return !!token && this.tokenVigente(token);
  }

  debeCambiarPassword(): boolean {
    return this.getUsuario()?.debeCambiarPassword ?? false;
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }

  // ---------- Permisos ----------
  // Solo sirven para mostrar u ocultar opciones: el backend es quien realmente los exige.

  tienePermiso(permiso: string): boolean {
    return this.getUsuario()?.permisos.includes(permiso) ?? false;
  }

  tieneAlgunPermiso(...permisos: string[]): boolean {
    const mios = this.getUsuario()?.permisos ?? [];
    return permisos.some((p) => mios.includes(p));
  }

  // Primera pantalla a la que el usuario tiene acceso (null si no tiene ninguna)
  rutaInicio(): string | null {
    if (this.tienePermiso('documentos.consultar')) {
      return '/dashboard/documentos';
    }
    if (this.tieneAlgunPermiso(...PERMISOS_ADMINISTRACION)) {
      return '/dashboard/usuarios';
    }
    if (this.tienePermiso('bitacora.consultar')) {
      return '/dashboard/auditoria';
    }
    return null;
  }

  // ---------- Avisos para la pantalla de login ----------

  guardarAviso(texto: string): void {
    sessionStorage.setItem('aviso_login', texto);
  }

  tomarAviso(): string {
    const texto = sessionStorage.getItem('aviso_login') ?? '';
    sessionStorage.removeItem('aviso_login');
    return texto;
  }

  // ---------- Internos ----------

  private guardarSesion(res: RespuestaSesion): void {
    localStorage.setItem('token', res.token);
    localStorage.setItem('usuario', JSON.stringify(res.usuario));
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