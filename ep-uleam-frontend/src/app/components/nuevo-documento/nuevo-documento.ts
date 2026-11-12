import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Area, AreaService, etiquetaDeArea } from '../../services/area';
import { AuthService } from '../../services/auth';
import { DirectorioService } from '../../services/directorio';
import {
  DocumentoService,
  PRIORIDADES,
  TIPOS_DOCUMENTO,
  mensajeDeError,
  requiereAprobacion,
} from '../../services/documento';
import { TramiteService, fechaLocalHoy } from '../../services/tramite';

@Component({
  selector: 'app-nuevo-documento',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrl: './nuevo-documento.css',
  templateUrl: './nuevo-documento.html',
})
export class NuevoDocumentoComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private documentos = inject(DocumentoService);
  private areasServicio = inject(AreaService);
  private directorio = inject(DirectorioService);
  private tramites = inject(TramiteService);

  readonly yo = this.auth.getUsuario();
  readonly tipos = TIPOS_DOCUMENTO;
  readonly prioridades = PRIORIDADES;
  readonly personas = this.directorio.personas;

  areas = signal<Area[]>([]);
  referencia = signal<{ _id: string; codigoTramite: string; asunto: string } | null>(null);
  guardando = signal(false);
  error = signal('');
  archivo: File | null = null;

  // Campos que cambian otras partes de la pantalla
  tipo = signal('Oficio');
  area = signal('');

  formulario = {
    numeroOficio: '',
    fechaOficio: fechaLocalHoy(),
    asunto: '',
    motivo: '',
    observacion: '',
    prioridad: 'Normal',
    confidencial: false,
    personaId: '',
  };

  opcionesArea = computed(() => this.areas().map((a) => ({ valor: a.nombre, etiqueta: etiquetaDeArea(a) })));

  personasDelArea = computed(() =>
    this.personas().filter((p) => p.departamento === this.area() && p.id !== this.yo?.id)
  );

  avisoTipo = computed(() =>
    requiereAprobacion(this.tipo())
      ? `Un documento de tipo ${this.tipo()} debe ser aprobado por Gerencia antes de enviarse.`
      : `Un documento de tipo ${this.tipo()} puede enviarse directamente, sin pasar por Gerencia.`
  );

  ngOnInit(): void {
    this.directorio.cargar();
    this.areasServicio.listar().subscribe({
      next: (areas) => this.areas.set(areas),
      error: () => this.error.set('No se pudo cargar la lista de áreas.'),
    });

    // Al responder un documento se precargan sus datos
    const responde = this.route.snapshot.queryParamMap.get('responde');
    if (responde) {
      this.cargarReferencia(responde);
    }
  }

  cambiarArea(area: string): void {
    this.area.set(area);
    this.formulario.personaId = '';
  }

  alSeleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  guardar(): void {
    this.error.set('');
    const f = this.formulario;

    if (!f.numeroOficio.trim() || !f.fechaOficio || !f.asunto.trim() || !f.motivo.trim()) {
      this.error.set('Complete el número de oficio, la fecha, el asunto y el motivo.');
      return;
    }
    if (!this.area()) {
      this.error.set('Seleccione el área del destinatario.');
      return;
    }
    if (!this.archivo) {
      this.error.set('Debe adjuntar el archivo PDF del documento.');
      return;
    }

    const datos = new FormData();
    datos.append('numeroOficio', f.numeroOficio.trim());
    datos.append('fechaOficio', f.fechaOficio);
    datos.append('tipoDocumento', this.tipo());
    datos.append('asunto', f.asunto.trim());
    datos.append('motivo', f.motivo.trim());
    datos.append('observacion', f.observacion.trim());
    datos.append('prioridad', f.prioridad);
    datos.append('confidencial', String(f.confidencial));
    datos.append(
      'destinatario',
      JSON.stringify({ departamento: this.area(), ...(f.personaId ? { usuario: f.personaId } : {}) })
    );
    const referencia = this.referencia();
    if (referencia) {
      datos.append('referencia', referencia._id);
    }
    datos.append('archivo', this.archivo);

    this.guardando.set(true);
    this.documentos.crearDocumento(datos).subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.tramites.refrescar();
        // Se abre el documento: desde allí se envía a sus destinatarios
        this.router.navigate(['/dashboard/documentos', res.documento._id]);
      },
      error: async (err) => {
        this.guardando.set(false);
        this.error.set(await mensajeDeError(err, 'No se pudo registrar el documento.'));
      },
    });
  }

  private cargarReferencia(id: string): void {
    forkJoin({
      original: this.documentos.obtenerDocumento(id),
      tramite: this.tramites.detalleDeDocumento(id),
    }).subscribe({
      next: ({ original, tramite }) => {
        this.referencia.set({ _id: original._id, codigoTramite: original.codigoTramite, asunto: original.asunto });
        this.tipo.set(original.tipoDocumento);
        this.formulario.asunto = original.asunto.startsWith('RE:') ? original.asunto : `RE: ${original.asunto}`;

        // La respuesta se dirige a quien envió el documento
        this.area.set(original.remitente.departamento);
        this.formulario.personaId = tramite.miTramite?.de?.id ?? '';
      },
      error: async (err) => {
        this.error.set(await mensajeDeError(err, 'No se pudo cargar el documento al que desea responder.'));
      },
    });
  }
}