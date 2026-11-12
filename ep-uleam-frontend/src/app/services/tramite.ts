import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

export type Bandeja = 'elaboracion' | 'recibidos' | 'enviados' | 'informados' | 'reasignados' | 'archivados';

export interface InfoBandeja {
  clave: Bandeja;
  titulo: string;
  icono: string;
  descripcion: string;
  vacio: string;
}

export const BANDEJAS: InfoBandeja[] = [
  { clave: 'recibidos', titulo: 'Recibidos', icono: '📥', descripcion: 'Documentos que le enviaron y espera su atención', vacio: 'No tiene documentos recibidos pendientes.' },
  { clave: 'elaboracion', titulo: 'En elaboración', icono: '📝', descripcion: 'Documentos que usted elaboró y aún no ha enviado', vacio: 'No tiene documentos en elaboración.' },
  { clave: 'enviados', titulo: 'Enviados', icono: '📤', descripcion: 'Documentos que usted envió a otras personas', vacio: 'Aún no ha enviado documentos.' },
  { clave: 'informados', titulo: 'Informados', icono: 'ℹ️', descripcion: 'Documentos que recibió con copia o solo para su conocimiento', vacio: 'No tiene documentos para su conocimiento.' },
  { clave: 'reasignados', titulo: 'Reasignados', icono: '🔁', descripcion: 'Documentos que usted pasó a otra persona', vacio: 'No ha reasignado documentos.' },
  { clave: 'archivados', titulo: 'Archivados', icono: '🗄️', descripcion: 'Documentos que usted archivó', vacio: 'No tiene documentos archivados.' },
];

export const esBandeja = (valor: string): valor is Bandeja => BANDEJAS.some((b) => b.clave === valor);

export interface PersonaTramite {
  id: string;
  nombre: string;
  departamento: string;
}

// Una fila de cualquiera de las bandejas
export interface FilaBandeja {
  _id: string;
  tramite: string | null; // null en las bandejas de documentos propios (elaboración y enviados)
  documentoId: string;
  codigoTramite: string;
  asunto: string;
  tipoDocumento: string;
  prioridad: string;
  confidencial: boolean;
  estadoDocumento: string;
  bloqueado: boolean;
  de: PersonaTramite;
  tipo: 'para' | 'copia' | 'informado' | 'autor';
  estado: string;
  sinLeer: boolean;
  fechaLimite: string | null;
  vencido: boolean;
  comentario: string;
  comentarioArchivo: string;
  fecha: string;
}

export interface ResumenBandejas {
  elaboracion: { total: number };
  recibidos: { total: number; sinLeer: number; vencidos: number };
  enviados: { total: number };
  informados: { total: number; sinLeer: number };
  reasignados: { total: number };
  archivados: { total: number };
}

export interface MiTramite {
  _id: string;
  tipo: 'para' | 'copia' | 'informado';
  estado: 'pendiente' | 'leido' | 'respondido' | 'archivado' | 'reasignado';
  de: PersonaTramite;
  comentario: string;
  fechaLimite: string | null;
  fechaLectura: string | null;
  vencido: boolean;
  comentarioArchivo: string;
  fechaArchivo: string | null;
  createdAt: string;
}

export interface AccionesTramite {
  reasignar: boolean;
  informar: boolean;
  archivar: boolean;
  restaurar: boolean;
  responder: boolean;
}

export interface DestinatarioDocumento {
  tipo: 'para' | 'copia';
  nombre: string;
  departamento: string;
  estado: string;
  fechaLectura: string | null;
}

export interface MovimientoTramite {
  _id: string;
  tipo: 'ELABORACION' | 'ENVIO' | 'LECTURA' | 'REASIGNACION' | 'INFORME' | 'ARCHIVO' | 'RESTAURACION' | 'RESPUESTA';
  de: PersonaTramite;
  para: PersonaTramite[];
  comentario: string;
  fecha: string;
  dias: number; // días desde el movimiento anterior
}

export interface DetalleTramite {
  miTramite: MiTramite | null;
  acciones: AccionesTramite | null;
  destinatarios: DestinatarioDocumento[];
  recorrido: MovimientoTramite[];
}

// ---------- Ayudas ----------

// Fecha de hoy en formato AAAA-MM-DD (hora local), para los campos de fecha
export const fechaLocalHoy = (): string => {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
};

export interface Semaforo {
  clase: 'vencido' | 'proximo' | 'ok' | 'sin';
  texto: string;
}

const ATENDIDOS = ['archivado', 'reasignado', 'respondido'];

// Rojo = vencido, ámbar = vence pronto, verde = en plazo. Un trámite ya atendido no se alerta.
export const semaforoDePlazo = (fechaLimite: string | null | undefined, estado = ''): Semaforo => {
  if (!fechaLimite) {
    return { clase: 'sin', texto: 'Sin plazo' };
  }

  const limite = new Date(fechaLimite);
  const fecha = limite.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });

  if (ATENDIDOS.includes(estado)) {
    return { clase: 'sin', texto: `Plazo: ${fecha}` };
  }

  const restanteMs = limite.getTime() - Date.now();
  if (restanteMs < 0) {
    return { clase: 'vencido', texto: `Vencido el ${fecha}` };
  }

  const dias = Math.ceil(restanteMs / 86400000);
  if (dias <= 1) {
    return { clase: 'proximo', texto: 'Vence hoy' };
  }
  if (dias <= 3) {
    return { clase: 'proximo', texto: `Vence en ${dias} días` };
  }
  return { clase: 'ok', texto: `Vence el ${fecha}` };
};

// ---------- Servicio ----------

const INTERVALO_MS = 45 * 1000;

@Injectable({ providedIn: 'root' })
export class TramiteService {
  private http = inject(HttpClient);
  private readonly url = `${API_URL}/tramites`;

  // Contadores de las bandejas, para el menú y las pestañas
  readonly resumenActual = signal<ResumenBandejas | null>(null);

  private reloj: ReturnType<typeof setInterval> | null = null;

  iniciar(): void {
    if (this.reloj) {
      return;
    }
    this.refrescar();
    this.reloj = setInterval(() => this.refrescar(), INTERVALO_MS);
  }

  detener(): void {
    if (this.reloj) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
    this.resumenActual.set(null);
  }

  refrescar(): void {
    this.resumen().subscribe({
      next: (resumen) => this.resumenActual.set(resumen),
      error: () => {}, // un 401 lo atiende el interceptor
    });
  }

  listar(
    bandeja: Bandeja,
    opciones: { texto?: string; soloVencidos?: boolean } = {}
  ): Observable<{ bandeja: Bandeja; items: FilaBandeja[] }> {
    let params = new HttpParams().set('bandeja', bandeja);
    if (opciones.texto?.trim()) {
      params = params.set('texto', opciones.texto.trim());
    }
    if (opciones.soloVencidos) {
      params = params.set('soloVencidos', '1');
    }
    return this.http.get<{ bandeja: Bandeja; items: FilaBandeja[] }>(this.url, { params });
  }

  resumen(): Observable<ResumenBandejas> {
    return this.http.get<ResumenBandejas>(`${this.url}/resumen`);
  }

  detalleDeDocumento(documentoId: string): Observable<DetalleTramite> {
    return this.http.get<DetalleTramite>(`${this.url}/documento/${documentoId}`);
  }

  // Acuse de lectura: se registra una sola vez
  leer(tramiteId: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/${tramiteId}/leer`, {});
  }

  reasignar(
    tramiteId: string,
    datos: { usuarios: string[]; comentario?: string; fechaLimite?: string }
  ): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/${tramiteId}/reasignar`, datos);
  }

  informar(tramiteId: string, datos: { usuarios: string[]; comentario?: string }): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/${tramiteId}/informar`, datos);
  }

  archivar(tramiteId: string, comentario: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/${tramiteId}/archivar`, { comentario });
  }

  restaurar(tramiteId: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/${tramiteId}/restaurar`, {});
  }
}