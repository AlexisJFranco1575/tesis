import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { PublicoService } from '../../services/publico';

// Muestra el enlace público que lleva el código QR del documento, para compartirlo
@Component({
  selector: 'app-enlace-verificacion',
  standalone: true,
  templateUrl: './enlace-verificacion.html',
  styleUrl: './enlace-verificacion.css',
})
export class EnlaceVerificacionComponent {
  private servicio = inject(PublicoService);

  documentoId = input.required<string>();

  url = signal('');
  error = signal('');
  copiado = signal(false);

  constructor() {
    effect(() => {
      const id = this.documentoId();
      untracked(() => this.cargar(id));
    });
  }

  private cargar(id: string): void {
    this.servicio.enlace(id).subscribe({
      next: (respuesta) => {
        this.url.set(respuesta.url);
        this.error.set('');
      },
      error: () => this.error.set('No se pudo obtener el enlace de verificación.'),
    });
  }

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 3000);
    } catch {
      this.error.set('No se pudo copiar. Selecciónelo y cópielo manualmente.');
    }
  }
}