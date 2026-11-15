import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Documento, DocumentoService, LIMITE_CUERPO, mensajeDeError } from '../../services/documento';

// Muestra el texto de un documento redactado en el sistema y permite editarlo.
// Cada edición genera una nueva versión del PDF, con su propio hash.
@Component({
  selector: 'app-panel-contenido',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './panel-contenido.css',
  templateUrl: './panel-contenido.html',
})
export class PanelContenidoComponent {
  private servicio = inject(DocumentoService);

  documento = input.required<Documento>();
  cambio = output<void>(); // avisa a la pantalla para que recargue el documento

  readonly limite = LIMITE_CUERPO;

  modal = signal(false);
  guardando = signal(false);
  error = signal('');
  mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  cuerpo = '';
  comentario = '';

  parrafos = computed(() =>
    (this.documento().cuerpo ?? '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
  );

  abrir(): void {
    this.cuerpo = this.documento().cuerpo ?? '';
    this.comentario = '';
    this.error.set('');
    this.modal.set(true);
  }

  cerrar(): void {
    this.modal.set(false);
  }

  guardar(): void {
    const texto = this.cuerpo.trim();

    if (texto.length < 10) {
      this.error.set('Escriba el contenido del documento (mínimo 10 caracteres).');
      return;
    }
    if (texto.length > LIMITE_CUERPO) {
      this.error.set(`El contenido supera el máximo de ${LIMITE_CUERPO} caracteres.`);
      return;
    }
    if (texto === (this.documento().cuerpo ?? '').trim()) {
      this.error.set('No hay cambios en el contenido.');
      return;
    }

    this.guardando.set(true);
    this.servicio.editarContenido(this.documento()._id, texto, this.comentario.trim()).subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.cerrar();
        this.mensaje.set({ tipo: 'ok', texto: res.mensaje });
        setTimeout(() => this.mensaje.set(null), 7000);
        this.cambio.emit();
      },
      error: async (err) => {
        this.guardando.set(false);
        this.error.set(await mensajeDeError(err, 'No se pudo actualizar el contenido.'));
      },
    });
  }
}