import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export interface ComprobacionHash {
  coincide: boolean;
  tipo: 'version' | 'anexo' | null;
  version: number | null;
  esVersionActual: boolean | null;
  anexo: string | null;
}

export interface RespuestaVerificacion {
  existe: boolean;
  confidencial: boolean;
  // Solo si el documento no es confidencial
  documento?: {
    codigoTramite: string;
    tipoDocumento: string;
    numeroOficio: string | null;
    fecha: string;
    emisor: string;
    estado: string;
    versionActual: number;
    enviadoEn: string | null;
  };
  // Solo si se envió el hash de un archivo
  comprobacion?: ComprobacionHash;
}

@Injectable({ providedIn: 'root' })
export class PublicoService {
  private http = inject(HttpClient);

  // Consulta pública (sin sesión). Con hash, comprueba si el archivo coincide con alguna versión registrada
  verificar(codigo: string, clave: string, hash = ''): Observable<RespuestaVerificacion> {
    let params = new HttpParams().set('k', clave);
    if (hash) {
      params = params.set('hash', hash);
    }
    return this.http.get<RespuestaVerificacion>(`${API_URL}/publico/verificar/${encodeURIComponent(codigo)}`, { params });
  }

  // Enlace de verificación del documento (con sesión): el mismo que lleva el código QR
  enlace(documentoId: string): Observable<{ codigo: string; url: string }> {
    return this.http.get<{ codigo: string; url: string }>(`${API_URL}/documentos/${documentoId}/enlace-verificacion`);
  }
}