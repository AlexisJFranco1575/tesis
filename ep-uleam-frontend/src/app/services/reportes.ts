import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export type TipoReporte = 'documentos' | 'bitacora';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private http = inject(HttpClient);

  // El servidor devuelve un CSV; los criterios vacíos no se envían
  descargar(tipo: TipoReporte, filtros: Record<string, string>): Observable<Blob> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) {
        params = params.set(clave, valor);
      }
    }
    return this.http.get(`${API_URL}/reportes/${tipo}`, { params, responseType: 'blob' });
  }
}