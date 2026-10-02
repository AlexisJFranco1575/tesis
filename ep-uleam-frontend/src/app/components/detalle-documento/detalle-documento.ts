import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth';
import {
  Documento,
  DocumentoService,
  EntradaBitacora,
  EstadoDocumento,
  ResultadoVerificacion,
  Version,
  claseAccion,
  etiquetaAccion,
  mensajeDeError,
} from '../../services/documento';

@Component({
  selector: 'app-detalle-documento',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  styleUrl: './detalle-documento.css',
  templateUrl: './detalle-documento.html',
})
export class DetalleDocumentoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private servicio = inject(DocumentoService);
  private auth = inject(AuthService);

  readonly esControl = this.auth.esControl();
  readonly etiqueta = etiquetaAccion;
  readonly clase = claseAccion;

  private id = '';

  documento = signal<Documento | null>(null);
  versiones = signal<Version[]>([]);
  trazabilidad = signal<EntradaBitacora[]>([]);
  cargando = signal(true);
  error = signal('');
  mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Verificación de integridad
  verificando = signal(false);
  verificacion = signal<ResultadoVerificacion | null>(null);

  // Ventana: nueva versión
  modalVersion = signal(false);
  guardandoVersion = signal(false);
  errorVersion = signal('');
  comentario = '';
  archivo: File | null = null;

  // Ventana: desbloqueo
  modalDesbloqueo = signal(false);
  desbloqueando = signal(false);
  errorDesbloqueo = signal('');
  motivoDesbloqueo = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.cargar();
  }

  // Carga el documento, sus versiones y (si el rol lo permite) su trazabilidad.
  // Con mostrarCarga = false se refresca sin parpadeo.
  cargar(mostrarCarga = true): void {
    if (mostrarCarga) {
      this.cargando.set(true);
    }
    this.error.set('');

    forkJoin({
      documento: this.servicio.obtenerDocumento(this.id),
      versiones: this.servicio.listarVersiones(this.id),
    }).subscribe({
      next: ({ documento, versiones }) => {
        this.documento.set(documento);
        this.versiones.set(versiones);
        this.cargando.set(false);
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        this.cargando.set(false);
        this.error.set(await mensajeDeError(err, 'No se pudo cargar el documento.'));
      },
    });
  }

  cargarTrazabilidad(): void {
    if (!this.esControl) {
      return;
    }
    this.servicio.listarBitacora({ documento: this.id, limite: 100 }).subscribe({
      next: (entradas) => this.trazabilidad.set(entradas),
      error: () => this.trazabilidad.set([]),
    });
  }

  // ---------- Ver y descargar ----------

  verVersion(version: Version): void {
    // La ventana se abre al instante (dentro del clic) para que el navegador no la bloquee
    const ventana = window.open('', '_blank');
    if (!ventana) {
      this.mostrar('error', 'El navegador bloqueó la ventana emergente. Permítala e intente de nuevo.');
      return;
    }

    this.servicio.descargarVersion(this.id, version.numero, 'ver').subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        ventana.location.href = url;
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        ventana.close();
        this.mostrar('error', await mensajeDeError(err, 'No se pudo abrir el documento.'));
        this.cargar(false); // por si el servidor lo bloqueó
      },
    });
  }

  descargar(version: Version): void {
    this.servicio.descargarVersion(this.id, version.numero, 'descargar').subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = version.nombreOriginal;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        this.mostrar('error', await mensajeDeError(err, 'No se pudo descargar el documento.'));
        this.cargar(false);
      },
    });
  }

  // ---------- Nueva versión ----------

  abrirModalVersion(): void {
    this.comentario = '';
    this.archivo = null;
    this.errorVersion.set('');
    this.modalVersion.set(true);
  }

  cerrarModalVersion(): void {
    this.modalVersion.set(false);
  }

  alSeleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  guardarVersion(): void {
    this.errorVersion.set('');

    if (!this.archivo) {
      this.errorVersion.set('Debe adjuntar el archivo PDF de la nueva versión.');
      return;
    }
    if (!this.comentario.trim()) {
      this.errorVersion.set('Indique el motivo del cambio.');
      return;
    }

    const datos = new FormData();
    datos.append('comentario', this.comentario.trim());
    datos.append('archivo', this.archivo);

    this.guardandoVersion.set(true);
    this.servicio.crearVersion(this.id, datos).subscribe({
      next: (res) => {
        this.guardandoVersion.set(false);
        this.cerrarModalVersion();
        this.mostrar('ok', res.mensaje);
        this.cargar(false);
      },
      error: async (err) => {
        this.guardandoVersion.set(false);
        this.errorVersion.set(await mensajeDeError(err, 'No se pudo registrar la nueva versión.'));
      },
    });
  }

  // ---------- Verificar integridad ----------

  verificar(): void {
    this.verificando.set(true);
    this.verificacion.set(null);

    this.servicio.verificarIntegridad(this.id).subscribe({
      next: (resultado) => {
        this.verificacion.set(resultado);
        this.verificando.set(false);
        this.cargar(false); // refresca: puede haber quedado bloqueado
      },
      error: async (err) => {
        this.verificando.set(false);
        this.mostrar('error', await mensajeDeError(err, 'No se pudo verificar la integridad.'));
      },
    });
  }

  // ---------- Desbloqueo ----------

  abrirModalDesbloqueo(): void {
    this.motivoDesbloqueo = '';
    this.errorDesbloqueo.set('');
    this.modalDesbloqueo.set(true);
  }

  cerrarModalDesbloqueo(): void {
    this.modalDesbloqueo.set(false);
  }

  confirmarDesbloqueo(): void {
    const motivo = this.motivoDesbloqueo.trim();
    if (!motivo) {
      this.errorDesbloqueo.set('Indique el motivo del desbloqueo.');
      return;
    }

    this.desbloqueando.set(true);
    this.servicio.desbloquear(this.id, motivo).subscribe({
      next: (res) => {
        this.desbloqueando.set(false);
        this.cerrarModalDesbloqueo();
        this.verificacion.set(null);
        this.mostrar('ok', res.mensaje);
        this.cargar(false);
      },
      error: async (err) => {
        this.desbloqueando.set(false);
        this.errorDesbloqueo.set(await mensajeDeError(err, 'No se pudo desbloquear el documento.'));
      },
    });
  }

  // ---------- Presentación ----------

  claseEstado(estado: EstadoDocumento): string {
    switch (estado) {
      case 'Aprobado':
        return 'approved';
      case 'En Revisión':
        return 'review';
      default:
        return 'archived';
    }
  }

  formatearTamano(bytes: number): string {
    if (!bytes) {
      return '—';
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  hashCorto(hash: string | null): string {
    return hash ? `${hash.slice(0, 16)}…` : '—';
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => this.mensaje.set(null), 7000);
  }
}