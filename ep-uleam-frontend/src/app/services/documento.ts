import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export type EstadoDocumento = 'Generado' | 'En Revisión' | 'Rechazado' | 'Aprobado' | 'Distribuido' | 'Archivado';

export const ESTADOS_DOCUMENTO: EstadoDocumento[] = [
  'Generado',
  'En Revisión',
  'Rechazado',
  'Aprobado',
  'Distribuido',
  'Archivado',
];

export const TIPOS_DOCUMENTO = ['Oficio', 'Memorando', 'Resolución', 'Informe Técnico', 'Contrato'];

// Un documento puede tener anexos de distintos tipos documentales
export const TIPOS_ANEXO = [...TIPOS_DOCUMENTO, 'Factura', 'Certificado', 'Fotografía', 'Otro'];

// Formatos, cantidad y tamaño que acepta el servidor para los anexos
export const FORMATOS_ANEXO = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx';
export const MAX_ANEXOS_POR_CARGA = 10;
export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

export interface Persona {
  nombre: string;
  departamento: string;
}

// Decisión de Gerencia sobre una versión del documento
export interface Revision {
  decision: 'Aprobado' | 'Rechazado';
  observacion: string;
  version: number;
  por: { id: string; nombre: string; rol: string };
  fecha: string;
}

// Cambio de estado que el usuario puede ejecutar ahora mismo (lo calcula el servidor)
export interface Transicion {
  estado: EstadoDocumento;
  requiereObservacion: boolean;
}

export interface AccionesDocumento {
  modificar: boolean;
  versionar: boolean;
  anexar: boolean;
}

export interface Documento {
  _id: string;
  codigoTramite: string;
  // Datos del oficio (los documentos antiguos pueden no tenerlos)
  numeroOficio?: string;
  fechaOficio?: string;
  motivo?: string;
  observacion?: string;
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
  // Solo vienen al consultar un documento individual
  revisiones?: Revision[];
  transicionesPermitidas?: Transicion[];
  acciones?: AccionesDocumento;
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

export interface Anexo {
  _id: string;
  nombreOriginal: string;
  extension: string;
  tamanoBytes: number;
  hashArchivo: string;
  tipoAnexo: string;
  descripcion: string;
  creadoPor: { id: string; nombre: string };
  createdAt: string;
}

export interface VersionVerificada {
  numero: number;
  hashAlmacenado: string;
  hashCalculado: string | null;
  archivoExiste: boolean;
  coincide: boolean;
}

export interface AnexoVerificado {
  id: string;
  nombre: string;
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
  anexos?: AnexoVerificado[];
}

export type AccionBitacora =
  | 'REGISTRO_DOCUMENTO'
  | 'MODIFICACION_DOCUMENTO'
  | 'NUEVA_VERSION'
  | 'ANEXO_AGREGADO'
  | 'CONSULTA_DOCUMENTO'
  | 'DESCARGA_DOCUMENTO'
  | 'CAMBIO_ESTADO'
  | 'REVISION_APROBADA'
  | 'REVISION_RECHAZADA'
  | 'VERIFICACION_INTEGRIDAD'
  | 'ALERTA_ALTERACION'
  | 'DESBLOQUEO'
  | 'AUDITORIA_GENERAL'
  | 'INICIO_SESION'
  | 'LOGIN_FALLIDO'
  | 'CUENTA_BLOQUEADA'
  | 'CIERRE_SESION'
  | 'CAMBIO_PASSWORD'
  | 'SOLICITUD_RECUPERACION'
  | 'CLAVE_TEMPORAL'
  | 'USUARIO_REGISTRADO'
  | 'USUARIO_BAJA'
  | 'USUARIO_REACTIVADO'
  | 'ROLES_MODIFICADOS'
  | 'PERMISOS_MODIFICADOS';

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
  anexos?: AnexoVerificado[];
}

export interface ResultadoAuditoria {
  mensaje: string;
  valido: boolean;
  documentosAnalizados: number;
  versionesAnalizadas: number;
  anexosAnalizados?: number;
  documentosAlterados: DocumentoAlterado[];
  bitacora: { integra: boolean; totalEntradas: number; errores: string[] };
}

// ---------- Ayudas compartidas por las pantallas ----------

const ETIQUETAS_ACCION: Record<string, string> = {
  REGISTRO_DOCUMENTO: 'Registro del documento',
  MODIFICACION_DOCUMENTO: 'Modificación de datos',
  NUEVA_VERSION: 'Nueva versión',
  ANEXO_AGREGADO: 'Anexo agregado',
  CONSULTA_DOCUMENTO: 'Consulta del documento',
  DESCARGA_DOCUMENTO: 'Descarga del documento',
  CAMBIO_ESTADO: 'Cambio de estado',
  REVISION_APROBADA: 'Documento aprobado',
  REVISION_RECHAZADA: 'Documento rechazado',
  VERIFICACION_INTEGRIDAD: 'Verificación de integridad',
  ALERTA_ALTERACION: 'Alerta de alteración',
  DESBLOQUEO: 'Desbloqueo de documento',
  AUDITORIA_GENERAL: 'Auditoría general',
  INICIO_SESION: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
  CUENTA_BLOQUEADA: 'Cuenta bloqueada',
  CIERRE_SESION: 'Cierre de sesión',
  CAMBIO_PASSWORD: 'Cambio de contraseña',
  SOLICITUD_RECUPERACION: 'Solicitud de recuperación',
  CLAVE_TEMPORAL: 'Clave temporal generada',
  USUARIO_REGISTRADO: 'Usuario registrado',
  USUARIO_BAJA: 'Usuario dado de baja',
  USUARIO_REACTIVADO: 'Usuario reactivado',
  ROLES_MODIFICADOS: 'Roles modificados',
  PERMISOS_MODIFICADOS: 'Permisos modificados',
};

export const etiquetaAccion = (accion: string): string => ETIQUETAS_ACCION[accion] ?? accion;

// Color de la insignia: rojo = alerta, verde = comprobación o restablecimiento, azul = el resto
export const claseAccion = (accion: string): string => {
  if (
    ['ALERTA_ALTERACION', 'CUENTA_BLOQUEADA', 'LOGIN_FALLIDO', 'USUARIO_BAJA', 'REVISION_RECHAZADA'].includes(accion)
  ) {
    return 'alerta';
  }
  if (['VERIFICACION_INTEGRIDAD', 'DESBLOQUEO', 'USUARIO_REACTIVADO', 'REVISION_APROBADA'].includes(accion)) {
    return 'ok';
  }
  return 'neutra';
};

// Clase de la etiqueta de estado del documento
export const claseEstado = (estado: string): string => {
  switch (estado) {
    case 'Generado':
      return 'generated';
    case 'En Revisión':
      return 'review';
    case 'Rechazado':
      return 'rejected';
    case 'Aprobado':
      return 'approved';
    case 'Distribuido':
      return 'distributed';
    default:
      return 'archived';
  }
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

  modificarDocumento(
    id: string,
    datos: {
      asunto?: string;
      tipoDocumento?: string;
      motivo?: string;
      observacion?: string;
      fechaOficio?: string;
      destinatario?: Persona;
    }
  ): Observable<{ mensaje: string; documento: Documento }> {
    return this.http.patch<{ mensaje: string; documento: Documento }>(`${this.url}/${id}`, datos);
  }

  // Revisión, aprobación, rechazo y demás cambios del flujo documental
  cambiarEstado(
    id: string,
    estado: EstadoDocumento,
    observacion = ''
  ): Observable<{ mensaje: string; documento: Documento }> {
    return this.http.post<{ mensaje: string; documento: Documento }>(`${this.url}/${id}/estado`, {
      estado,
      observacion,
    });
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

  listarAnexos(id: string): Observable<Anexo[]> {
    return this.http.get<Anexo[]>(`${this.url}/${id}/anexos`);
  }

  // Recibe FormData: tipoAnexo, descripcion y uno o varios archivos en el campo "archivos"
  subirAnexos(id: string, datos: FormData): Observable<{ mensaje: string; anexos: Anexo[] }> {
    return this.http.post<{ mensaje: string; anexos: Anexo[] }>(`${this.url}/${id}/anexos`, datos);
  }

  descargarAnexo(id: string, anexoId: string, modo: 'ver' | 'descargar'): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/anexos/${anexoId}/archivo`, {
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