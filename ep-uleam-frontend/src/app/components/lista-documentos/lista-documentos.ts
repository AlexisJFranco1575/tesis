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

@Component({
  selector: 'app-lista-documentos',
  standalone: true,
  imports: [FormsModule, DatePipe],
  styleUrls: ['./lista-documentos.css', './lista-avisos.css'],
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

  // Filtros
  textoBusqueda = signal('');
  filtroDepartamento = signal('');
  filtroEstado = signal('');

  // Formulario de registro
  modalAbierto = signal(false);
  guardando = signal(false);
  errorFormulario = signal('');
  archivo: File | null = null;
  formulario = this.formularioVacio();

  departamentos = computed(() => {
    const lista = this.documentos().map((d) => d.remitente.departamento);
    return [...new Set(lista)].sort();
  });

  // Tareas pendientes
  pendientesRevision = computed(() => this.documentos().filter((d) => d.estado === 'En Revisión').length);
  rechazados = computed(() => this.documentos().filter((d) => d.estado === 'Rechazado').length);

  documentosFiltrados = computed(() => {
    const texto = this.textoBusqueda().trim().toLowerCase();
    const departamento = this.filtroDepartamento();
    const estado = this.filtroEstado();

    return this.documentos().filter((d) => {
      const coincideTexto =
        !texto ||
        d.codigoTramite.toLowerCase().includes(texto) ||
        d.asunto.toLowerCase().includes(texto) ||
        d.remitente.nombre.toLowerCase().includes(texto) ||
        d.hashActual.toLowerCase().includes(texto);
      const coincideDepartamento = !departamento || d.remitente.departamento === departamento;
      const coincideEstado = !estado || d.estado === estado;
      return coincideTexto && coincideDepartamento && coincideEstado;
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
      !f.codigoTramite.trim() ||
      !f.asunto.trim() ||
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
    datos.append('codigoTramite', f.codigoTramite.trim());
    datos.append('tipoDocumento', f.tipoDocumento);
    datos.append('asunto', f.asunto.trim());
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
      next: () => {
        this.guardando.set(false);
        this.cerrarModal();
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
      codigoTramite: '',
      tipoDocumento: 'Oficio',
      asunto: '',
      remitenteNombre: usuario?.nombreCompleto ?? '',
      remitenteDepartamento: usuario?.departamento ?? '',
      destinatarioNombre: '',
      destinatarioDepartamento: ''
    };
  }
}