import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  tipo: 'info' | 'alerta' | 'ok';
  titulo: string;
  mensaje?: string;
  ruta?: string; // al hacer clic, lleva a esta pantalla
  persistente?: boolean; // si es true no se cierra solo
}

const MAXIMO_VISIBLES = 4;
const DURACION_MS = 9000;

@Injectable({ providedIn: 'root' })
export class AvisosService {
  readonly avisos = signal<Aviso[]>([]);
  private siguiente = 1;

  mostrar(aviso: Omit<Aviso, 'id'>): void {
    const id = this.siguiente++;
    this.avisos.update((lista) => [...lista, { ...aviso, id }].slice(-MAXIMO_VISIBLES));

    if (!aviso.persistente) {
      setTimeout(() => this.cerrar(id), DURACION_MS);
    }
  }

  cerrar(id: number): void {
    this.avisos.update((lista) => lista.filter((a) => a.id !== id));
  }
}