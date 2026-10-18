import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import {
  Documento,
  DocumentoService,
  ESTADOS_DOCUMENTO,
  TIPOS_DOCUMENTO,
  claseEstado,
  mensajeDeError,
} from '../../services/documento';

// Para comparar textos sin importar mayúsculas ni tildes
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Fecha de hoy en formato AAAA-MM-DD (hora local), para el campo de fecha del formulario
const fechaLocalHoy = (): string => {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
};

@Component({
  selector: 'app-lista-documentos',
  standalone: true,
  imports: [FormsModule, DatePipe],
  styleUrls: ['./lista-documentos.css', './lista-avisos.css', './lista-busqueda.css'],
  templateUrl: './lista-documentos.html',
})
export class ListaDocumentosComponent implements OnInit {
  private documentoService = inject(DocumentoService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly puedeRegistrar = this.auth.tienePermiso('documentos.registrar');
  readonly puedeAprobar = this.auth.tienePermiso('documentos.aprobar');
  readonly puedeCorregir = this.auth.tienePermiso('documentos.versionar');

  readonly tipos = TIPOS_DOCUMENTO;
  readonly estados = ESTADOS_DOCUMENTO;
  readonly claseEstado = claseEstado;

  // Lista y estado de carga
  documentos = signal<Documento[]>([]);
  cargando = signal(true);
  errorCarga = signal('');
  aviso = signal('');

  // Criterios de búsqueda (se combinan entre sí)
  textoBusqueda = signal('');
  filtroDepartamento = signal('');
  filtroEstado = signal('');
  filtroTipo = signal('');
  fechaDesde = signal('');
  fechaHasta = signal('');
  filtrosAbiertos = signal(false);

  // Formulario de registro
  modalAbierto = signal(false);
  guardando = signal(false);
  errorFormulario = signal('');
  archivo: File | null = null;
  formulario = this.formularioVacio();

  // Departamentos que aparecen como remitente o destinatario
  departamentos = computed(() => {
    const lista = this.documentos().flatMap((d) => [d.remitente.departamento, d.destinatario.departamento]);
    return [...new Set(lista)].sort();
  });

  // Tareas pendientes
  pendientesRevision = computed(() => this.documentos().filter((d) => d.estado === 'En Revisión').length);
  rechazados = computed(() => this.documentos().filter((d) => d.estado === 'Rechazado').length);

  hayFiltros = computed(
    () =>
      !!(
        this.textoBusqueda().trim() ||
        this.filtroDepartamento() ||
        this.filtroEstado() ||
        this.filtroTipo() ||
        this.fechaDesde() ||
        this.fechaHasta()
      )
  );

  // Todos los criterios ingresados se combinan (CU-11, A2)
  documentosFiltrados = computed(() => {
    const texto = normalizar(this.textoBusqueda().trim());
    const departamento = this.filtroDepartamento();
    const estado = this.filtroEstado();
    const tipo = this.filtroTipo();
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    return this.documentos().filter((d) => {
      const coincideTexto =
        !texto ||
        [
          d.codigoTramite,
          d.numeroOficio ?? '',
          d.asunto,
          d.motivo ?? '',
          d.observacion ?? '',
          d.remitente.nombre,
          d.destinatario.nombre,
          d.hashActual,
        ].some((campo) => normalizar(campo).includes(texto));

      const coincideDepartamento =
        !departamento || d.remitente.departamento === departamento || d.destinatario.departamento === departamento;
      const coincideEstado = !estado || d.estado === estado;
      const coincideTipo = !tipo || d.tipoDocumento === tipo;

      // Fecha del oficio; los documentos antiguos usan la fecha de registro
      const fecha = (d.fechaOficio ?? d.createdAt).slice(0, 10);
      const coincideDesde = !desde || fecha >= desde;
      const coincideHasta = !hasta || fecha <= hasta;

      return coincideTexto && coincideDepartamento && coincideEstado && coincideTipo && coincideDesde && coincideHasta;
    });
  });

  ngOnInit(): void {
    this.cargarDocumentos();
  }

  cargarDocumentos(): void {
    this.cargando.set(true);
    this.errorCarga.set('');

    this.documentoService.obtenerDocumentos().subscribe({
      next: (docs) => {
        this.documentos.set(docs);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudieron cargar los documentos.'));
      }
    });
  }

  filtrarPorEstado(estado: string): void {
    this.filtroEstado.set(estado);
  }

  alternarFiltros(): void {
    this.filtrosAbiertos.update((abierto) => !abierto);
  }

  limpiarFiltros(): void {
    this.textoBusqueda.set('');
    this.filtroDepartamento.set('');
    this.filtroEstado.set('');
    this.filtroTipo.set('');
    this.fechaDesde.set('');
    this.fechaHasta.set('');
  }

  verDetalle(id: string): void {
    this.router.navigate(['/dashboard/documentos', id]);
  }

  abrirModal(): void {
    this.formulario = this.formularioVacio();
    this.archivo = null;
    this.errorFormulario.set('');
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  alSeleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  guardar(): void {
    this.errorFormulario.set('');
    const f = this.formulario;

    const faltanDatos =
      !f.numeroOficio.trim() ||
      !f.fechaOficio ||
      !f.asunto.trim() ||
      !f.motivo.trim() ||
      !f.remitenteNombre.trim() ||
      !f.remitenteDepartamento.trim() ||
      !f.destinatarioNombre.trim() ||
      !f.destinatarioDepartamento.trim();

    if (faltanDatos) {
      this.errorFormulario.set('Complete todos los campos obligatorios.');
      return;
    }
    if (!this.archivo) {
      this.errorFormulario.set('Debe adjuntar el archivo PDF del documento.');
      return;
    }

    const datos = new FormData();
    datos.append('numeroOficio', f.numeroOficio.trim());
    datos.append('fechaOficio', f.fechaOficio);
    datos.append('tipoDocumento', f.tipoDocumento);
    datos.append('asunto', f.asunto.trim());
    datos.append('motivo', f.motivo.trim());
    datos.append('observacion', f.observacion.trim());
    datos.append(
      'remitente',
      JSON.stringify({ nombre: f.remitenteNombre.trim(), departamento: f.remitenteDepartamento.trim() })
    );
    datos.append(
      'destinatario',
      JSON.stringify({ nombre: f.destinatarioNombre.trim(), departamento: f.destinatarioDepartamento.trim() })
    );
    datos.append('archivo', this.archivo);

    this.guardando.set(true);
    this.documentoService.crearDocumento(datos).subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.cerrarModal();
        this.aviso.set(res.mensaje);
        setTimeout(() => this.aviso.set(''), 9000);
        this.cargarDocumentos();
      },
      error: async (err) => {
        this.guardando.set(false);
        this.errorFormulario.set(await mensajeDeError(err, 'No se pudo registrar el documento.'));
      }
    });
  }

  // El remitente se pre-llena con el usuario que inició sesión
  private formularioVacio() {
    const usuario = this.auth.getUsuario();
    return {
      numeroOficio: '',
      fechaOficio: fechaLocalHoy(),
      tipoDocumento: 'Oficio',
      asunto: '',
      motivo: '',
      observacion: '',
      remitenteNombre: usuario?.nombreCompleto ?? '',
      remitenteDepartamento: usuario?.departamento ?? '',
      destinatarioNombre: '',
      destinatarioDepartamento: ''
    };
  }
}