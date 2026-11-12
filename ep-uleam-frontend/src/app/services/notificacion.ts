import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_URL } from '../config';
import { AvisosService } from './avisos';

export interface Notificacion {
  _id: string;
  tipo: 'FLUJO' | 'ALERTA' | 'INFO';
  titulo: string;
  mensaje: string;
  documento: string | null;
  codigoTramite: string;
  leida: boolean;
  createdAt: string;
}

interface RespuestaNotificaciones {
  notificaciones: Notificacion[];
  noLeidas: number;
}

const INTERVALO_MS = 30 * 1000;

// Pantalla a la que lleva una notificación
export const destinoDeNotificacion = (n: Notificacion): string | undefined => {
  if (n.documento) {
    return `/dashboard/documentos/${n.documento}`;
  }
  if (n.titulo === 'Cuenta bloqueada' || n.titulo === 'Solicitud de recuperación') {
    return '/dashboard/usuarios';
  }
  return undefined;
};

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private http = inject(HttpClient);
  private avisos = inject(AvisosService);
  private readonly url = `${API_URL}/notificaciones`;

  readonly notificaciones = signal<Notificacion[]>([]);
  readonly noLeidas = signal(0);

  private reloj: ReturnType<typeof setInterval> | null = null;
  private vistas = new Set<string>();
  private primeraCarga = true;

  // Empieza a consultar periódicamente (al abrir el dashboard)
  iniciar(): void {
    if (this.reloj) {
      return;
    }
    this.cargar();
    this.reloj = setInterval(() => this.cargar(), INTERVALO_MS);
  }

  // Deja de consultar y vacía lo guardado (al cerrar el dashboard o la sesión)
  detener(): void {
    if (this.reloj) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
    this.notificaciones.set([]);
    this.noLeidas.set(0);
    this.vistas.clear();
    this.primeraCarga = true;
  }

  cargar(): void {
    this.http.get<RespuestaNotificaciones>(this.url, { params: { limite: 30 } }).subscribe({
      next: (respuesta) => {
        // En la primera carga no se avisa (para eso está el resumen de pendientes);
        // después, cada notificación nueva sin leer aparece como aviso emergente
        if (!this.primeraCarga) {
          for (const n of respuesta.notificaciones) {
            if (!n.leida && !this.vistas.has(n._id)) {
              this.avisos.mostrar({
                tipo: n.tipo === 'ALERTA' ? 'alerta' : 'info',
                titulo: n.titulo,
                mensaje: n.mensaje,
                ruta: destinoDeNotificacion(n),
              });
            }
          }
        }
        respuesta.notificaciones.forEach((n) => this.vistas.add(n._id));
        this.primeraCarga = false;

        this.notificaciones.set(respuesta.notificaciones);
        this.noLeidas.set(respuesta.noLeidas);
      },
      error: () => {}, // un 401 lo atiende el interceptor
    });
  }

  marcarLeida(id: string): Observable<{ mensaje: string }> {
    return this.http.patch<{ mensaje: string }>(`${this.url}/${id}/leida`, {}).pipe(
      tap(() => {
        this.notificaciones.update((lista) => lista.map((n) => (n._id === id ? { ...n, leida: true } : n)));
        this.noLeidas.update((total) => Math.max(0, total - 1));
      })
    );
  }

  marcarTodasLeidas(): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.url}/leer-todas`, {}).pipe(
      tap(() => {
        this.notificaciones.update((lista) => lista.map((n) => ({ ...n, leida: true })));
        this.noLeidas.set(0);
      })
    );
  }
}