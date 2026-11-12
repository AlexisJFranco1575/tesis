import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { DirectorioService } from '../../services/directorio';

// Quita tildes y pasa a minúsculas, para buscar sin importar cómo se escribió
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Lista de personas con búsqueda, filtro por área y selección múltiple.
// Uso: <app-selector-personas titulo="Para" [(seleccion)]="para" [excluir]="[miId]" />
@Component({
  selector: 'app-selector-personas',
  standalone: true,
  templateUrl: './selector-personas.html',
  styleUrl: './selector-personas.css',
})
export class SelectorPersonasComponent implements OnInit {
  private directorio = inject(DirectorioService);

  titulo = input('Personas');
  excluir = input<string[]>([]);
  seleccion = model<string[]>([]);

  readonly personas = this.directorio.personas;
  readonly cargando = this.directorio.cargando;
  readonly error = this.directorio.error;

  texto = signal('');
  area = signal('');

  areas = computed(() => [...new Set(this.personas().map((p) => p.departamento))].sort((a, b) => a.localeCompare(b, 'es')));

  visibles = computed(() => {
    const buscado = normalizar(this.texto().trim());
    const area = this.area();

    return this.personas().filter(
      (p) =>
        !this.excluir().includes(p.id) &&
        (!area || p.departamento === area) &&
        (!buscado || normalizar(p.nombre).includes(buscado))
    );
  });

  elegidas = computed(() => this.personas().filter((p) => this.seleccion().includes(p.id)));

  ngOnInit(): void {
    this.directorio.cargar();
  }

  alternar(id: string): void {
    this.seleccion.update((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
  }

  quitar(id: string): void {
    this.seleccion.update((lista) => lista.filter((x) => x !== id));
  }

  alEscribir(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
  }

  alElegirArea(evento: Event): void {
    this.area.set((evento.target as HTMLSelectElement).value);
  }
}