import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export type EstadoDocumento = 'Generado' | 'En Revisión' | 'Aprobado' | 'Archivado';

export interface Persona {
  nombre: string;
  departamento: string;
}

export interface Documento {
  _id: string;
  codigoTramite: string;
  tipoDocumento: string;
  asunto: string;
  remitente: Persona;
  destinatario: Persona;
  estado: EstadoDocumento;
  versionActual: number;
  hashActual: string;
  bloqueado: boolean;
  motivoBloqueo: string;
  creadoPor: { id: string; nombre: string };
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  numero: number;
  nombreOriginal: string;
  tamanoBytes: number;
  hashArchivo: string;
  comentario: string;
  creadoPor: { id: string; nombre: string };
  createdAt: string;
  esActual: boolean;
}

export interface VersionVerificada {
  numero: number;
  hashAlmacenado: string;
  hashCalculado: string | null;
  archivoExiste: boolean;
  coincide: boolean;
}

export interface ResultadoVerificacion {
  mensaje: string;
  valido: boolean;
  sinHash: boolean;
  bloqueado: boolean;
  documento: { _id: string; codigoTramite: string; versionActual: number };
  versiones: VersionVerificada[];
}

export type AccionBitacora =
  | 'REGISTRO_DOCUMENTO'
  | 'NUEVA_VERSION'
  | 'CONSULTA_DOCUMENTO'
  | 'DESCARGA_DOCUMENTO'
  | 'VERIFICACION_INTEGRIDAD'
  | 'ALERTA_ALTERACION'
  | 'DESBLOQUEO'
  | 'AUDITORIA_GENERAL';

export interface EntradaBitacora {
  _id: string;
  fecha: string;
  accion: AccionBitacora;
  documento: string | null;
  codigoTramite: string;
  usuario: { id: string; nombre: string; rol: string };
  detalle: string;
  hashAnterior: string;
  hashActual: string;
}

export interface DocumentoAlterado {
  documentoId: string;
  codigoTramite: string;
  versiones: VersionVerificada[];
}

export interface ResultadoAuditoria {
  mensaje: string;
  valido: boolean;
  documentosAnalizados: number;
  versionesAnalizadas: number;
  documentosAlterados: DocumentoAlterado[];
  bitacora: { integra: boolean; totalEntradas: number; errores: string[] };
}

// ---------- Ayudas compartidas por las pantallas ----------

const ETIQUETAS_ACCION: Record<string, string> = {
  REGISTRO_DOCUMENTO: 'Registro del documento',
  NUEVA_VERSION: 'Nueva versión',
  CONSULTA_DOCUMENTO: 'Consulta del documento',
  DESCARGA_DOCUMENTO: 'Descarga del documento',
  VERIFICACION_INTEGRIDAD: 'Verificación de integridad',
  ALERTA_ALTERACION: 'Alerta de alteración',
  DESBLOQUEO: 'Desbloqueo',
  AUDITORIA_GENERAL: 'Auditoría general',
};

export const etiquetaAccion = (accion: string): string => ETIQUETAS_ACCION[accion] ?? accion;

// Color de la insignia: rojo = alerta, verde = comprobación correcta, azul = el resto
export const claseAccion = (accion: string): string => {
  if (accion === 'ALERTA_ALTERACION') {
    return 'alerta';
  }
  if (accion === 'VERIFICACION_INTEGRIDAD' || accion === 'DESBLOQUEO') {
    return 'ok';
  }
  return 'neutra';
};

const leerTexto = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsText(blob);
  });

// Obtiene el mensaje de error de una respuesta de la API.
// Cuando se pedía un archivo (blob), el error también llega como blob y hay que leerlo.
export async function mensajeDeError(error: unknown, porDefecto: string): Promise<string> {
  const err = error as { status?: number; error?: unknown };

  if (err?.status === 0) {
    return 'No hay conexión con el servidor.';
  }

  let cuerpo: any = err?.error;
  if (cuerpo instanceof Blob) {
    try {
      cuerpo = JSON.parse(await leerTexto(cuerpo));
    } catch {
      cuerpo = null;
    }
  }
  return cuerpo?.mensaje || porDefecto;
}

// ---------- Servicio ----------

@Injectable({ providedIn: 'root' })
export class DocumentoService {
  private http = inject(HttpClient);
  private readonly url = `${API_URL}/documentos`;

  obtenerDocumentos(): Observable<Documento[]> {
    return this.http.get<Documento[]>(this.url);
  }

  obtenerDocumento(id: string): Observable<Documento> {
    return this.http.get<Documento>(`${this.url}/${id}`);
  }

  // Recibe FormData porque se envía el archivo PDF junto con los datos
  crearDocumento(datos: FormData): Observable<{ mensaje: string; documento: Documento }> {
    return this.http.post<{ mensaje: string; documento: Documento }>(this.url, datos);
  }

  listarVersiones(id: string): Observable<Version[]> {
    return this.http.get<Version[]>(`${this.url}/${id}/versiones`);
  }

  crearVersion(id: string, datos: FormData): Observable<{ mensaje: string; documento: Documento }> {
    return this.http.post<{ mensaje: string; documento: Documento }>(`${this.url}/${id}/versiones`, datos);
  }

  // 'ver' registra una consulta; 'descargar' registra una descarga
  descargarVersion(id: string, numero: number, modo: 'ver' | 'descargar'): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/versiones/${numero}/archivo`, {
      params: { modo },
      responseType: 'blob',
    });
  }

  verificarIntegridad(id: string): Observable<ResultadoVerificacion> {
    return this.http.post<ResultadoVerificacion>(`${this.url}/${id}/verificar`, {});
  }

  desbloquear(id: string, motivo: string): Observable<{ mensaje: string; documento: Documento }> {
    return this.http.post<{ mensaje: string; documento: Documento }>(`${this.url}/${id}/desbloquear`, { motivo });
  }

  listarBitacora(opciones: { documento?: string; limite?: number } = {}): Observable<EntradaBitacora[]> {
    let params = new HttpParams();
    if (opciones.documento) {
      params = params.set('documento', opciones.documento);
    }
    if (opciones.limite) {
      params = params.set('limite', opciones.limite);
    }
    return this.http.get<EntradaBitacora[]>(`${API_URL}/bitacora`, { params });
  }

  ejecutarAuditoria(): Observable<ResultadoAuditoria> {
    return this.http.post<ResultadoAuditoria>(`${API_URL}/bitacora/auditoria`, {});
  }
}