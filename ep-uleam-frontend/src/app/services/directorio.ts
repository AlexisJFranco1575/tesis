import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../config';

export interface PersonaDirectorio {
  id: string;
  nombre: string;
  departamento: string;
}

@Injectable({ providedIn: 'root' })
export class DirectorioService {
  private http = inject(HttpClient);

  readonly personas = signal<PersonaDirectorio[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');

  private cargado = false;

  cargar(forzar = false): void {
    if ((this.cargado && !forzar) || this.cargando()) {
      return;
    }
    this.cargando.set(true);
    this.error.set('');

    this.http.get<PersonaDirectorio[]>(`${API_URL}/directorio`).subscribe({
      next: (lista) => {
        this.personas.set(lista);
        this.cargado = true;
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('No se pudo cargar la lista de personas.');
      },
    });
  }

  // Al cerrar sesión, para que el siguiente usuario no vea datos anteriores
  reiniciar(): void {
    this.personas.set([]);
    this.cargado = false;
    this.cargando.set(false);
    this.error.set('');
  }
}