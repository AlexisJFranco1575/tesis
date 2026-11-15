import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Area, AreaService, etiquetaDeArea } from '../../services/area';
import { AuthService } from '../../services/auth';
import { DirectorioService } from '../../services/directorio';
import {
  DatosRedaccion,
  DocumentoService,
  EXTENSIONES_DOCUMENTO,
  FORMATOS_DOCUMENTO,
  LIMITE_CUERPO,
  PRIORIDADES,
  Prioridad,
  TAMANO_MAXIMO_BYTES,
  TIPOS_DOCUMENTO,
  mensajeDeError,
  requiereAprobacion,
} from '../../services/documento';
import { TramiteService, fechaLocalHoy } from '../../services/tramite';

type Modo = 'redactar' | 'archivo';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

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
  readonly limite = LIMITE_CUERPO;
  readonly formatos = FORMATOS_DOCUMENTO;
  readonly personas = this.directorio.personas;

  modo = signal<Modo>('redactar');
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
    prioridad: 'Normal' as Prioridad,
    confidencial: false,
    personaId: '',
    cuerpo: '',
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

  cambiarModo(modo: Modo): void {
    this.modo.set(modo);
    this.error.set('');
  }

  cambiarArea(area: string): void {
    this.area.set(area);
    this.formulario.personaId = '';
  }

  alSeleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  // ---------- Vista previa ----------

  parrafos(): string[] {
    return this.formulario.cuerpo
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // "2026-10-15" → "15 de octubre de 2026"
  fechaLarga(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    if (!anio || !mes || !dia) {
      return '';
    }
    return `${dia} de ${MESES[mes - 1]} de ${anio}`;
  }

  destinatarioVista(): string {
    const area = this.area();
    if (!area) {
      return 'Seleccione el área del destinatario';
    }
    const persona = this.personasDelArea().find((p) => p.id === this.formulario.personaId);
    return persona ? `${persona.nombre} · ${area}` : area;
  }

  numeroVista(): string {
    return this.formulario.numeroOficio.trim().toUpperCase() || 'se asignará al guardar';
  }

  // ---------- Guardar ----------

  guardar(): void {
    this.error.set('');
    const f = this.formulario;

    if (!f.asunto.trim() || !f.motivo.trim()) {
      this.error.set('Complete el asunto y el motivo.');
      return;
    }
    if (!f.fechaOficio) {
      this.error.set('Indique la fecha del documento.');
      return;
    }
    if (!this.area()) {
      this.error.set('Seleccione el área del destinatario.');
      return;
    }

    if (this.modo() === 'redactar') {
      const cuerpo = f.cuerpo.trim();
      if (cuerpo.length < 10) {
        this.error.set('Escriba el contenido del documento (mínimo 10 caracteres).');
        return;
      }
      if (cuerpo.length > LIMITE_CUERPO) {
        this.error.set(`El contenido supera el máximo de ${LIMITE_CUERPO} caracteres.`);
        return;
      }
      this.enviarRedaccion(cuerpo);
      return;
    }

    if (!this.archivo) {
      this.error.set('Seleccione el archivo del documento (PDF, Word o Excel).');
      return;
    }
    const nombre = this.archivo.name.toLowerCase();
    if (!EXTENSIONES_DOCUMENTO.some((extension) => nombre.endsWith(extension))) {
      this.error.set('El archivo debe ser PDF, Word (.docx) o Excel (.xlsx).');
      return;
    }
    if (this.archivo.size > TAMANO_MAXIMO_BYTES) {
      this.error.set('El archivo supera los 20 MB permitidos.');
      return;
    }
    this.enviarArchivo(this.archivo);
  }

  private destinatario(): { departamento: string; usuario?: string } {
    const personaId = this.formulario.personaId;
    return { departamento: this.area(), ...(personaId ? { usuario: personaId } : {}) };
  }

  private enviarRedaccion(cuerpo: string): void {
    const f = this.formulario;
    const referencia = this.referencia();
    const numero = f.numeroOficio.trim();

    const datos: DatosRedaccion = {
      tipoDocumento: this.tipo(),
      asunto: f.asunto.trim(),
      motivo: f.motivo.trim(),
      observacion: f.observacion.trim(),
      fechaOficio: f.fechaOficio,
      prioridad: f.prioridad,
      confidencial: f.confidencial,
      destinatario: this.destinatario(),
      cuerpo,
      ...(numero ? { numeroOficio: numero } : {}),
      ...(referencia ? { referencia: referencia._id } : {}),
    };

    this.guardando.set(true);
    this.documentos.redactarDocumento(datos).subscribe({
      next: (res) => this.alGuardar(res.documento._id),
      error: async (err) => this.alFallar(await mensajeDeError(err, 'No se pudo generar el documento.')),
    });
  }

  private enviarArchivo(archivo: File): void {
    const f = this.formulario;
    const referencia = this.referencia();

    const datos = new FormData();
    if (f.numeroOficio.trim()) {
      datos.append('numeroOficio', f.numeroOficio.trim());
    }
    datos.append('fechaOficio', f.fechaOficio);
    datos.append('tipoDocumento', this.tipo());
    datos.append('asunto', f.asunto.trim());
    datos.append('motivo', f.motivo.trim());
    datos.append('observacion', f.observacion.trim());
    datos.append('prioridad', f.prioridad);
    datos.append('confidencial', String(f.confidencial));
    datos.append('destinatario', JSON.stringify(this.destinatario()));
    if (referencia) {
      datos.append('referencia', referencia._id);
    }
    datos.append('archivo', archivo);

    this.guardando.set(true);
    this.documentos.crearDocumento(datos).subscribe({
      next: (res) => this.alGuardar(res.documento._id),
      error: async (err) => this.alFallar(await mensajeDeError(err, 'No se pudo registrar el documento.')),
    });
  }

  private alGuardar(id: string): void {
    this.guardando.set(false);
    this.tramites.refrescar();
    // Se abre el documento: desde allí se envía a sus destinatarios
    this.router.navigate(['/dashboard/documentos', id]);
  }

  private alFallar(mensaje: string): void {
    this.guardando.set(false);
    this.error.set(mensaje);
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