import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Area, AreaService, etiquetaDeArea } from '../../services/area';
import { AuthService } from '../../services/auth';
import { DirectorioService } from '../../services/directorio';
import { PendientesService } from '../../services/pendientes';
import { TramiteService } from '../../services/tramite';
import {
  Anexo,
  Documento,
  DocumentoService,
  EntradaBitacora,
  EstadoDocumento,
  FORMATOS_ANEXO,
  FORMATOS_DOCUMENTO,
  MAX_ANEXOS_POR_CARGA,
  ResultadoVerificacion,
  TAMANO_MAXIMO_BYTES,
  TIPOS_ANEXO,
  TIPOS_DOCUMENTO,
  Transicion,
  Version,
  claseAccion,
  claseEstado,
  etiquetaAccion,
  mensajeDeError,
} from '../../services/documento';
import { PanelContenidoComponent } from '../panel-contenido/panel-contenido';
import { PanelTramiteComponent } from '../panel-tramite/panel-tramite';

const DESCRIPCION_TRANSICION: Record<string, string> = {
  'En Revisión':
    'El documento pasará a Gerencia para su revisión. Mientras esté en revisión no podrá modificarse ni tendrá nuevas versiones.',
  Aprobado: 'Se registrará su aprobación. Puede agregar una observación (opcional).',
  Rechazado: 'El documento volverá al área para su corrección. La observación con el motivo es obligatoria.',
  Archivado: 'El documento quedará archivado.',
  Generado: 'El documento volverá al estado Generado y podrá modificarse nuevamente.',
};

// Formatos que se pueden abrir en una pestaña del navegador
const EXTENSIONES_VISIBLES = ['.pdf', '.png', '.jpg', '.jpeg'];

@Component({
  selector: 'app-detalle-documento',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, PanelTramiteComponent, PanelContenidoComponent],
  styleUrls: ['./detalle-documento.css', './detalle-flujo.css', './detalle-anexos.css', './detalle-tramite.css'],
  templateUrl: './detalle-documento.html',
})
export class DetalleDocumentoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private servicio = inject(DocumentoService);
  private auth = inject(AuthService);
  private areasServicio = inject(AreaService);
  private directorio = inject(DirectorioService);
  private tramites = inject(TramiteService);
  private pendientes = inject(PendientesService);

  // Qué botones se muestran según los permisos del usuario (el backend los exige igualmente)
  readonly puedeDescargar = this.auth.tienePermiso('documentos.descargar');
  readonly puedeVerificar = this.auth.tienePermiso('integridad.verificar');
  readonly puedeDesbloquear = this.auth.tienePermiso('integridad.desbloquear');
  readonly puedeTrazabilidad = this.auth.tienePermiso('bitacora.consultar');
  readonly puedeRevisar = this.auth.tienePermiso('documentos.aprobar');
  readonly tienePermisoEdicion =
    this.auth.tienePermiso('documentos.versionar') ||
    this.auth.tienePermiso('documentos.modificar') ||
    this.auth.tienePermiso('documentos.anexar');

  readonly tipos = TIPOS_DOCUMENTO;
  readonly tiposAnexo = TIPOS_ANEXO;
  readonly formatosAnexo = FORMATOS_ANEXO;
  readonly formatosDocumento = FORMATOS_DOCUMENTO;
  readonly maxAnexos = MAX_ANEXOS_POR_CARGA;
  readonly claseEstado = claseEstado;
  readonly etiqueta = etiquetaAccion;
  readonly clase = claseAccion;

  private id = '';

  documento = signal<Documento | null>(null);
  versiones = signal<Version[]>([]);
  anexos = signal<Anexo[]>([]);
  trazabilidad = signal<EntradaBitacora[]>([]);
  cargando = signal(true);
  error = signal('');
  mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Cambios de estado que el servidor permite al usuario
  transiciones = computed(() => this.documento()?.transicionesPermitidas ?? []);

  // Decisiones de Gerencia, de la más reciente a la más antigua
  revisiones = computed(() => [...(this.documento()?.revisiones ?? [])].reverse());

  // Observación de Gerencia cuando el documento fue devuelto para corrección
  ultimoRechazo = computed(() => {
    const doc = this.documento();
    if (!doc || doc.estado !== 'Rechazado') {
      return null;
    }
    return (doc.revisiones ?? []).filter((r) => r.decision === 'Rechazado').pop() ?? null;
  });

  // Verificación de integridad
  verificando = signal(false);
  verificacion = signal<ResultadoVerificacion | null>(null);

  // Ventana: cambio de estado
  modalEstado = signal<Transicion | null>(null);
  cambiandoEstado = signal(false);
  errorEstado = signal('');
  observacionEstado = '';

  // Ventana: editar datos (el destinatario se elige de listas, no se escribe)
  modalEditar = signal(false);
  guardandoEdicion = signal(false);
  errorEdicion = signal('');
  areas = signal<Area[]>([]);
  areaEdicion = signal('');
  edicion = {
    asunto: '',
    tipoDocumento: 'Oficio',
    motivo: '',
    observacion: '',
    fechaOficio: '',
    personaId: '',
  };

  opcionesArea = computed(() => this.areas().map((a) => ({ valor: a.nombre, etiqueta: etiquetaDeArea(a) })));
  personasDelArea = computed(() => this.directorio.personas().filter((p) => p.departamento === this.areaEdicion()));

  // Ventana: nueva versión
  modalVersion = signal(false);
  guardandoVersion = signal(false);
  errorVersion = signal('');
  comentario = '';
  archivo: File | null = null;

  // Ventana: anexos
  modalAnexos = signal(false);
  subiendoAnexos = signal(false);
  errorAnexos = signal('');
  tipoAnexo = 'Otro';
  descripcionAnexo = '';
  archivosAnexo = signal<File[]>([]);

  // Ventana: desbloqueo
  modalDesbloqueo = signal(false);
  desbloqueando = signal(false);
  errorDesbloqueo = signal('');
  motivoDesbloqueo = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.cargar();
  }

  // Carga el documento, sus versiones, sus anexos y (si el usuario puede) su trazabilidad.
  // Con mostrarCarga = false se refresca sin parpadeo.
  cargar(mostrarCarga = true): void {
    if (mostrarCarga) {
      this.cargando.set(true);
    }
    this.error.set('');

    forkJoin({
      documento: this.servicio.obtenerDocumento(this.id),
      versiones: this.servicio.listarVersiones(this.id),
      anexos: this.servicio.listarAnexos(this.id),
    }).subscribe({
      next: ({ documento, versiones, anexos }) => {
        this.documento.set(documento);
        this.versiones.set(versiones);
        this.anexos.set(anexos);
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
    if (!this.puedeTrazabilidad) {
      return;
    }
    this.servicio.listarBitacora({ documento: this.id, limite: 100 }).subscribe({
      next: (entradas) => this.trazabilidad.set(entradas),
      error: () => this.trazabilidad.set([]),
    });
  }

  // Los paneles hijos (trámite y contenido) avisan cuando algo cambió
  alCambiarTramite(): void {
    this.cargar(false);
  }

  // ---------- Ver y descargar versiones ----------

  // Solo los PDF se abren en el navegador; Word y Excel se descargan
  puedeVerVersion(version: Version): boolean {
    return version.nombreOriginal.toLowerCase().endsWith('.pdf');
  }

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
        this.guardarArchivo(blob, version.nombreOriginal);
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        this.mostrar('error', await mensajeDeError(err, 'No se pudo descargar el documento.'));
        this.cargar(false);
      },
    });
  }

  // ---------- Ver y descargar anexos ----------

  puedeVerAnexo(anexo: Anexo): boolean {
    return EXTENSIONES_VISIBLES.includes(anexo.extension);
  }

  verAnexo(anexo: Anexo): void {
    const ventana = window.open('', '_blank');
    if (!ventana) {
      this.mostrar('error', 'El navegador bloqueó la ventana emergente. Permítala e intente de nuevo.');
      return;
    }

    this.servicio.descargarAnexo(this.id, anexo._id, 'ver').subscribe({
      next: (blob) => {
        ventana.location.href = URL.createObjectURL(blob);
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        ventana.close();
        this.mostrar('error', await mensajeDeError(err, 'No se pudo abrir el anexo.'));
        this.cargar(false); // por si el servidor lo bloqueó
      },
    });
  }

  descargarAnexo(anexo: Anexo): void {
    this.servicio.descargarAnexo(this.id, anexo._id, 'descargar').subscribe({
      next: (blob) => {
        this.guardarArchivo(blob, anexo.nombreOriginal);
        this.cargarTrazabilidad();
      },
      error: async (err) => {
        this.mostrar('error', await mensajeDeError(err, 'No se pudo descargar el anexo.'));
        this.cargar(false);
      },
    });
  }

  // ---------- Cambio de estado (revisión, aprobación, rechazo y archivo) ----------

  etiquetaTransicion(t: Transicion): string {
    const actual = this.documento()?.estado;
    switch (t.estado) {
      case 'En Revisión':
        return actual === 'Rechazado' ? 'Reenviar a revisión' : 'Enviar a revisión';
      case 'Aprobado':
        return '✓ Aprobar';
      case 'Rechazado':
        return '✗ Rechazar';
      case 'Archivado':
        return 'Archivar documento';
      default:
        return 'Recuperar del archivo';
    }
  }

  claseBoton(estado: EstadoDocumento): string {
    if (estado === 'Aprobado') {
      return 'btn-exito';
    }
    return estado === 'Rechazado' ? 'btn-peligro' : 'btn-primario';
  }

  descripcionTransicion(estado: string): string {
    return DESCRIPCION_TRANSICION[estado] ?? '';
  }

  abrirEstado(transicion: Transicion): void {
    this.observacionEstado = '';
    this.errorEstado.set('');
    this.modalEstado.set(transicion);
  }

  cerrarEstado(): void {
    this.modalEstado.set(null);
  }

  confirmarEstado(): void {
    const transicion = this.modalEstado();
    if (!transicion) {
      return;
    }

    const observacion = this.observacionEstado.trim();
    if (transicion.requiereObservacion && !observacion) {
      this.errorEstado.set('Debe registrar la observación con el motivo del rechazo.');
      return;
    }

    this.cambiandoEstado.set(true);
    this.servicio.cambiarEstado(this.id, transicion.estado, observacion).subscribe({
      next: (res) => {
        this.cambiandoEstado.set(false);
        this.cerrarEstado();
        this.verificacion.set(null);
        this.mostrar('ok', res.mensaje);
        this.cargar(false);
        this.tramites.refrescar();
        this.pendientes.cargar();
      },
      error: async (err) => {
        this.cambiandoEstado.set(false);
        this.errorEstado.set(await mensajeDeError(err, 'No se pudo cambiar el estado.'));
      },
    });
  }

  // ---------- Editar datos del documento ----------

  abrirEditar(): void {
    const doc = this.documento();
    if (!doc) {
      return;
    }
    this.edicion = {
      asunto: doc.asunto,
      tipoDocumento: doc.tipoDocumento,
      motivo: doc.motivo ?? '',
      observacion: doc.observacion ?? '',
      fechaOficio: doc.fechaOficio ? doc.fechaOficio.slice(0, 10) : '',
      personaId: doc.destinatario.usuario ?? '',
    };
    this.areaEdicion.set(doc.destinatario.departamento);
    this.errorEdicion.set('');
    this.modalEditar.set(true);

    this.directorio.cargar();
    this.areasServicio.listar().subscribe({
      next: (areas) => this.areas.set(areas),
      error: () => this.errorEdicion.set('No se pudo cargar la lista de áreas.'),
    });
  }

  cerrarEditar(): void {
    this.modalEditar.set(false);
  }

  cambiarAreaEdicion(area: string): void {
    this.areaEdicion.set(area);
    this.edicion.personaId = '';
  }

  guardarEdicion(): void {
    const e = this.edicion;
    if (!e.asunto.trim()) {
      this.errorEdicion.set('El asunto no puede quedar vacío.');
      return;
    }
    if (!this.areaEdicion()) {
      this.errorEdicion.set('Seleccione el área del destinatario.');
      return;
    }

    const datos: {
      asunto: string;
      tipoDocumento: string;
      observacion: string;
      destinatario: { departamento: string; usuario?: string };
      motivo?: string;
      fechaOficio?: string;
    } = {
      asunto: e.asunto.trim(),
      tipoDocumento: e.tipoDocumento,
      observacion: e.observacion.trim(),
      destinatario: { departamento: this.areaEdicion(), ...(e.personaId ? { usuario: e.personaId } : {}) },
    };
    // Los documentos antiguos pueden no tener motivo ni fecha: solo se envían si se completaron
    if (e.motivo.trim()) {
      datos.motivo = e.motivo.trim();
    }
    if (e.fechaOficio) {
      datos.fechaOficio = e.fechaOficio;
    }

    this.guardandoEdicion.set(true);
    this.servicio.modificarDocumento(this.id, datos).subscribe({
      next: (res) => {
        this.guardandoEdicion.set(false);
        this.cerrarEditar();
        this.mostrar('ok', res.mensaje);
        this.cargar(false);
      },
      error: async (err) => {
        this.guardandoEdicion.set(false);
        this.errorEdicion.set(await mensajeDeError(err, 'No se pudo actualizar el documento.'));
      },
    });
  }

  // ---------- Nueva versión (con un archivo PDF, Word o Excel) ----------

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
      this.errorVersion.set('Debe adjuntar el archivo de la nueva versión (PDF, Word o Excel).');
      return;
    }
    if (this.archivo.size > TAMANO_MAXIMO_BYTES) {
      this.errorVersion.set('El archivo supera los 20 MB permitidos.');
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

  // ---------- Agregar anexos ----------

  abrirModalAnexos(): void {
    this.tipoAnexo = 'Otro';
    this.descripcionAnexo = '';
    this.archivosAnexo.set([]);
    this.errorAnexos.set('');
    this.modalAnexos.set(true);
  }

  cerrarModalAnexos(): void {
    this.modalAnexos.set(false);
  }

  alSeleccionarAnexos(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivosAnexo.set(Array.from(input.files ?? []));
  }

  guardarAnexos(): void {
    this.errorAnexos.set('');
    const archivos = this.archivosAnexo();

    if (archivos.length === 0) {
      this.errorAnexos.set('Seleccione al menos un archivo.');
      return;
    }
    if (archivos.length > MAX_ANEXOS_POR_CARGA) {
      this.errorAnexos.set(`Solo puede adjuntar hasta ${MAX_ANEXOS_POR_CARGA} archivos por carga.`);
      return;
    }
    const demasiadoGrande = archivos.find((a) => a.size > TAMANO_MAXIMO_BYTES);
    if (demasiadoGrande) {
      this.errorAnexos.set(`El archivo "${demasiadoGrande.name}" supera los 20 MB permitidos.`);
      return;
    }

    const datos = new FormData();
    datos.append('tipoAnexo', this.tipoAnexo);
    datos.append('descripcion', this.descripcionAnexo.trim());
    archivos.forEach((archivo) => datos.append('archivos', archivo));

    this.subiendoAnexos.set(true);
    this.servicio.subirAnexos(this.id, datos).subscribe({
      next: (res) => {
        this.subiendoAnexos.set(false);
        this.cerrarModalAnexos();
        this.mostrar('ok', res.mensaje);
        this.cargar(false);
      },
      error: async (err) => {
        this.subiendoAnexos.set(false);
        this.errorAnexos.set(await mensajeDeError(err, 'No se pudieron cargar los anexos.'));
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

  private guardarArchivo(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => this.mensaje.set(null), 7000);
  }
}