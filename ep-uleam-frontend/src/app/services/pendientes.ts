import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../config';
import { AvisosService } from './avisos';

export interface ItemPendiente {
  clave: string;
  titulo: string;
  cantidad: number;
  ruta: string;
  nivel: 'info' | 'alerta';
  filtroEstado?: string;
}

export interface ResumenPendientes {
  total: number;
  items: ItemPendiente[];
  advertencias: string[];
}

const VACIO: ResumenPendientes = { total: 0, items: [], advertencias: [] };
const INTERVALO_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PendientesService {
  private http = inject(HttpClient);
  private avisos = inject(AvisosService);

  readonly resumen = signal<ResumenPendientes>(VACIO);

  private reloj: ReturnType<typeof setInterval> | null = null;
  private resumenMostrado = false;

  iniciar(): void {
    if (this.reloj) {
      return;
    }
    this.cargar();
    this.reloj = setInterval(() => this.cargar(), INTERVALO_MS);
  }

  detener(): void {
    if (this.reloj) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
    this.resumen.set(VACIO);
    this.resumenMostrado = false;
  }

  cargar(): void {
    this.http.get<ResumenPendientes>(`${API_URL}/pendientes`).subscribe({
      next: (resumen) => {
        this.resumen.set(resumen);
        if (!this.resumenMostrado) {
          this.resumenMostrado = true;
          this.avisarResumen(resumen);
        }
      },
      error: () => {}, // un 401 lo atiende el interceptor
    });
  }

  // Cantidad de pendientes que apuntan a una pantalla (para el número del menú)
  cantidadEn(ruta: string): number {
    return this.resumen()
      .items.filter((i) => i.ruta === ruta)
      .reduce((suma, i) => suma + i.cantidad, 0);
  }

  // Resumen al ingresar: pendientes y advertencias del sistema
  private avisarResumen(resumen: ResumenPendientes): void {
    if (resumen.total > 0) {
      this.avisos.mostrar({
        tipo: resumen.items.some((i) => i.nivel === 'alerta') ? 'alerta' : 'info',
        titulo: `Tiene ${resumen.total} pendiente(s)`,
        mensaje: resumen.items.map((i) => `${i.cantidad} ${i.titulo.toLowerCase()}`).join(' · '),
        ruta: resumen.items[0].ruta,
      });
    }
    for (const advertencia of resumen.advertencias) {
      this.avisos.mostrar({ tipo: 'alerta', titulo: 'Atención', mensaje: advertencia, persistente: true });
    }
  }
}