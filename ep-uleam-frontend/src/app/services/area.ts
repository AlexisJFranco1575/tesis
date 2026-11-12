import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export interface Area {
  _id: string;
  nombre: string;
  siglas: string;
  tipo: 'area' | 'unidad';
  padre: string | null;
  activa: boolean;
  nivel: number;
  ruta: string;
  // Solo vienen en la lista completa del administrador
  usuarios?: number;
  hijos?: number;
}

export interface DatosArea {
  nombre?: string;
  siglas?: string;
  tipo?: 'area' | 'unidad';
  padre?: string | null;
  activa?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AreaService {
  private http = inject(HttpClient);
  private readonly url = `${API_URL}/areas`;

  // Áreas activas, ordenadas como árbol (para las listas de selección)
  listar(): Observable<Area[]> {
    return this.http.get<Area[]>(this.url);
  }

  // Incluye las inactivas y los totales (requiere el permiso de administrar áreas)
  listarTodas(): Observable<Area[]> {
    return this.http.get<Area[]>(this.url, { params: { todas: '1' } });
  }

  crear(datos: DatosArea): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(this.url, datos);
  }

  editar(id: string, datos: DatosArea): Observable<{ mensaje: string }> {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}`, datos);
  }

  eliminar(id: string): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.url}/${id}`);
  }
}

// Texto de una opción de lista con sangría según el nivel del área
export const etiquetaDeArea = (area: Area): string => `${'— '.repeat(area.nivel)}${area.nombre}`;