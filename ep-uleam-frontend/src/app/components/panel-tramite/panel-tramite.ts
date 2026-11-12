import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth';
import {
  DatosEnvio,
  Documento,
  DocumentoService,
  PRIORIDADES,
  Prioridad,
  mensajeDeError,
  requiereAprobacion,
} from '../../services/documento';
import { PendientesService } from '../../services/pendientes';
import {
  DetalleTramite,
  MovimientoTramite,
  TramiteService,
  fechaLocalHoy,
  semaforoDePlazo,
} from '../../services/tramite';
import { SelectorPersonasComponent } from '../selector-personas/selector-personas';

type Modal = 'enviar' | 'reasignar' | 'informar' | 'archivar' | 'restaurar' | null;

const ESTADOS: Record<string, string> = {
  pendiente: 'Sin leer',
  leido: 'Leído',
  respondido: 'Respondido',
  archivado: 'Archivado',
  reasignado: 'Reasignado',
};

const TIPOS: Record<string, string> = {
  para: 'Destinatario principal (Para)',
  copia: 'Con copia',
  informado: 'Informado, para su conocimiento',
};

const MOVIMIENTOS: Record<MovimientoTramite['tipo'], string> = {
  ELABORACION: '📝 Elaborado',
  ENVIO: '📤 Enviado',
  LECTURA: '👁 Leído',
  REASIGNACION: '🔁 Reasignado',
  INFORME: 'ℹ️ Informado',
  ARCHIVO: '🗄️ Archivado',
  RESTAURACION: '↩ Restaurado',
  RESPUESTA: '💬 Respondido',
};

// Todo lo relacionado con el trámite del documento: envío, reasignación, informe, archivo,
// destinatarios con su acuse de lectura y la hoja de ruta.
@Component({
  selector: 'app-panel-tramite',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, SelectorPersonasComponent],
  styleUrl: './panel-tramite.css',
  templateUrl: './panel-tramite.html',
})
export class PanelTramiteComponent {
  private servicio = inject(TramiteService);
  private documentos = inject(DocumentoService);
  private pendientes = inject(PendientesService);
  private auth = inject(AuthService);

  documento = input.required<Documento>();
  cambio = output<void>(); // avisa a la pantalla para que recargue el documento

  readonly yoId = this.auth.getUsuario()?.id ?? '';
  readonly prioridades = PRIORIDADES;
  readonly hoy = fechaLocalHoy();
  readonly semaforo = semaforoDePlazo;

  detalle = signal<DetalleTramite | null>(null);
  cargando = signal(true);
  errorCarga = signal('');
  mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Ventanas
  modal = signal<Modal>(null);
  procesando = signal(false);
  errorModal = signal('');
  para = signal<string[]>([]);
  copia = signal<string[]>([]);
  envio: { prioridad: Prioridad; fechaLimite: string; confidencial: boolean; comentario: string } = {
    prioridad: 'Normal',
    fechaLimite: '',
    confidencial: false,
    comentario: '',
  };
  accion = { fechaLimite: '', comentario: '' };

  acciones = computed(() => this.detalle()?.acciones ?? null);
  miTramite = computed(() => this.detalle()?.miTramite ?? null);

  // Un Oficio, una Resolución o un Contrato necesitan la aprobación de Gerencia antes de enviarse
  esperaAprobacion = computed(() => {
    const doc = this.documento();
    return doc.estado === 'Generado' && requiereAprobacion(doc.tipoDocumento) && !doc.bloqueado;
  });

  constructor() {
    // Se carga (y se vuelve a cargar) cada vez que cambia el documento
    effect(() => {
      const id = this.documento()._id;
      untracked(() => this.cargar(id));
    });
  }

  private cargar(id: string, registrarLectura = true): void {
    this.servicio.detalleDeDocumento(id).subscribe({
      next: (detalle) => {
        this.detalle.set(detalle);
        this.cargando.set(false);

        // Acuse de lectura: al abrir un documento recibido por primera vez
        const tramite = detalle.miTramite;
        if (registrarLectura && tramite?.estado === 'pendiente') {
          this.servicio.leer(tramite._id).subscribe({
            next: () => {
              this.cargar(id, false);
              this.servicio.refrescar();
              this.pendientes.cargar();
            },
            error: () => {},
          });
        }
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudo cargar el trámite.'));
      },
    });
  }

  // ---------- Presentación ----------

  etiquetaEstado(estado: string): string {
    return ESTADOS[estado] ?? estado;
  }

  etiquetaTipo(tipo: string): string {
    return TIPOS[tipo] ?? tipo;
  }

  etiquetaMovimiento(tipo: MovimientoTramite['tipo']): string {
    return MOVIMIENTOS[tipo];
  }

  nombresDe(movimiento: MovimientoTramite): string {
    return movimiento.para.map((p) => p.nombre).join(', ');
  }

  // ---------- Ventanas ----------

  abrir(modal: Exclude<Modal, null>): void {
    this.errorModal.set('');
    this.procesando.set(false);
    this.para.set([]);
    this.copia.set([]);
    this.accion = { fechaLimite: '', comentario: '' };

    if (modal === 'enviar') {
      const doc = this.documento();
      this.envio = {
        prioridad: doc.prioridad ?? 'Normal',
        fechaLimite: '',
        confidencial: !!doc.confidencial,
        comentario: '',
      };
    }
    this.modal.set(modal);
  }

  cerrar(): void {
    this.modal.set(null);
  }

  // ---------- Acciones ----------

  confirmarEnviar(): void {
    if (this.para().length === 0) {
      this.errorModal.set('Seleccione al menos un destinatario en «Para».');
      return;
    }
    if (this.envio.fechaLimite && this.envio.fechaLimite < this.hoy) {
      this.errorModal.set('El plazo no puede estar en el pasado.');
      return;
    }

    const datos: DatosEnvio = {
      para: this.para(),
      copia: this.copia(),
      prioridad: this.envio.prioridad,
      confidencial: this.envio.confidencial,
      comentario: this.envio.comentario.trim(),
    };
    if (this.envio.fechaLimite) {
      datos.fechaLimite = this.envio.fechaLimite;
    }

    this.ejecutar(this.documentos.enviarDocumento(this.documento()._id, datos), 'No se pudo enviar el documento.');
  }

  confirmarReasignar(): void {
    const tramite = this.miTramite();
    if (!tramite) return;

    if (this.para().length === 0) {
      this.errorModal.set('Seleccione a quién desea reasignar el documento.');
      return;
    }
    if (this.accion.fechaLimite && this.accion.fechaLimite < this.hoy) {
      this.errorModal.set('El plazo no puede estar en el pasado.');
      return;
    }

    this.ejecutar(
      this.servicio.reasignar(tramite._id, {
        usuarios: this.para(),
        comentario: this.accion.comentario.trim(),
        ...(this.accion.fechaLimite ? { fechaLimite: this.accion.fechaLimite } : {}),
      }),
      'No se pudo reasignar el documento.'
    );
  }

  confirmarInformar(): void {
    const tramite = this.miTramite();
    if (!tramite) return;

    if (this.para().length === 0) {
      this.errorModal.set('Seleccione a quién desea informar.');
      return;
    }
    this.ejecutar(
      this.servicio.informar(tramite._id, { usuarios: this.para(), comentario: this.accion.comentario.trim() }),
      'No se pudo informar el documento.'
    );
  }

  confirmarArchivar(): void {
    const tramite = this.miTramite();
    if (!tramite) return;

    if (this.accion.comentario.trim().length < 3) {
      this.errorModal.set('Indique el motivo del archivo (mínimo 3 caracteres).');
      return;
    }
    this.ejecutar(this.servicio.archivar(tramite._id, this.accion.comentario.trim()), 'No se pudo archivar el documento.');
  }

  confirmarRestaurar(): void {
    const tramite = this.miTramite();
    if (tramite) {
      this.ejecutar(this.servicio.restaurar(tramite._id), 'No se pudo restaurar el documento.');
    }
  }

  private ejecutar(peticion: Observable<{ mensaje: string }>, errorPorDefecto: string): void {
    this.errorModal.set('');
    this.procesando.set(true);

    peticion.subscribe({
      next: (res) => {
        this.procesando.set(false);
        this.cerrar();
        this.mostrar('ok', res.mensaje);
        this.servicio.refrescar();
        this.pendientes.cargar();
        this.cambio.emit(); // la pantalla recarga el documento y este panel se actualiza
      },
      error: async (err) => {
        this.procesando.set(false);
        this.errorModal.set(await mensajeDeError(err, errorPorDefecto));
      },
    });
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => this.mensaje.set(null), 7000);
  }
}