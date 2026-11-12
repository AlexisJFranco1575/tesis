import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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

@Component({
  selector: 'app-lista-documentos',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  styleUrls: ['./lista-documentos.css', './lista-avisos.css', './lista-busqueda.css'],
  templateUrl: './lista-documentos.html',
})
export class ListaDocumentosComponent implements OnInit {
  private documentoService = inject(DocumentoService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

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

  // Criterios de búsqueda (se combinan entre sí)
  textoBusqueda = signal('');
  filtroDepartamento = signal('');
  filtroEstado = signal('');
  filtroTipo = signal('');
  fechaDesde = signal('');
  fechaHasta = signal('');
  filtrosAbiertos = signal(false);

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
    // La barra de búsqueda de la parte superior envía el texto en la dirección (?texto=...)
    this.route.queryParamMap.subscribe((params) => {
      const texto = params.get('texto');
      if (texto !== null) {
        this.textoBusqueda.set(texto);
      }
    });
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
}