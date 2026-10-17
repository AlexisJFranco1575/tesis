import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export interface UsuarioAdmin {
  _id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  email: string;
  departamento: string;
  roles: string[];
  permisos: string[]; // permisos efectivos
  permisosExtra: string[];
  permisosRetirados: string[];
  estado: boolean; // false = dado de baja
  fechaBaja: string | null;
  motivoBaja: string;
  bloqueado: boolean;
  debeCambiarPassword: boolean;
  solicitoRecuperacion: boolean;
  solicitudRecuperacionEn: string | null;
  ultimoAcceso: string | null;
  createdAt: string;
}

export interface Catalogo {
  roles: string[];
  permisos: Record<string, string>; // código → descripción
  permisosPorRol: Record<string, string[]>;
}

export interface NuevoUsuario {
  cedula: string;
  nombres: string;
  apellidos: string;
  email: string;
  departamento: string;
  roles: string[];
  password: string;
}

interface RespuestaUsuario {
  mensaje: string;
  usuario: UsuarioAdmin;
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private http = inject(HttpClient);
  private readonly url = `${API_URL}/usuarios`;

  catalogo(): Observable<Catalogo> {
    return this.http.get<Catalogo>(`${this.url}/catalogo`);
  }

  listar(): Observable<UsuarioAdmin[]> {
    return this.http.get<UsuarioAdmin[]>(this.url);
  }

  crear(datos: NuevoUsuario): Observable<RespuestaUsuario> {
    return this.http.post<RespuestaUsuario>(this.url, datos);
  }

  darDeBaja(id: string, motivo: string): Observable<RespuestaUsuario> {
    return this.http.patch<RespuestaUsuario>(`${this.url}/${id}/baja`, { motivo });
  }

  reactivar(id: string): Observable<RespuestaUsuario> {
    return this.http.patch<RespuestaUsuario>(`${this.url}/${id}/reactivar`, {});
  }

  cambiarRoles(id: string, roles: string[]): Observable<RespuestaUsuario> {
    return this.http.patch<RespuestaUsuario>(`${this.url}/${id}/roles`, { roles });
  }

  cambiarPermisos(id: string, permisosExtra: string[], permisosRetirados: string[]): Observable<RespuestaUsuario> {
    return this.http.patch<RespuestaUsuario>(`${this.url}/${id}/permisos`, { permisosExtra, permisosRetirados });
  }

  generarClave(id: string): Observable<RespuestaUsuario & { claveTemporal: string }> {
    return this.http.post<RespuestaUsuario & { claveTemporal: string }>(`${this.url}/${id}/clave-temporal`, {});
  }
}