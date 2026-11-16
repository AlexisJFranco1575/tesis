import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export interface Conteo {
  clave: string;
  total: number;
}

export interface Estadisticas {
  alcance: 'institucion' | 'personal';
  totales: { documentos: number; enRevision: number; rechazados: number; bloqueados: number; confidenciales: number };
  porEstado: Conteo[];
  porTipo: Conteo[];
  porArea: Conteo[];
  porMes: { mes: string; total: number }[];
  tramite: {
    recibidosSinLeer: number;
    vencidos: number;
    informadosSinLeer: number;
    tiempoMedioLecturaHoras: number | null;
  };
}

@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private http = inject(HttpClient);

  obtener(): Observable<Estadisticas> {
    return this.http.get<Estadisticas>(`${API_URL}/estadisticas`);
  }
}