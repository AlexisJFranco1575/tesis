import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export interface Rol {
  _id: string;
  nombre: string;
  descripcion: string;
  permisos: string[];
  protegido: boolean;
  sistema: boolean; // rol base: no se elimina
  usuarios: number;
  editable: boolean; // lo calcula el servidor según quién consulta
  eliminable: boolean;
}

@Injectable({ providedIn: 'root' })
export class RolService {
  private http = inject(HttpClient);
  private readonly url = `${API_URL}/roles`;

  listar(): Observable<Rol[]> {
    return this.http.get<Rol[]>(this.url);
  }

  crear(datos: { nombre: string; descripcion: string; permisos: string[] }): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(this.url, datos);
  }

  editar(id: string, datos: { descripcion: string; permisos: string[] }): Observable<{ mensaje: string }> {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}`, datos);
  }

  eliminar(id: string): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.url}/${id}`);
  }
}