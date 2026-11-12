import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { Area, AreaService, DatosArea, etiquetaDeArea } from '../../services/area';
import { AuthService } from '../../services/auth';
import { mensajeDeError } from '../../services/documento';

@Component({
  selector: 'app-areas',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../usuarios/usuarios.css', './areas.css'],
  templateUrl: './areas.html',
})
export class AreasComponent implements OnInit {
  private servicio = inject(AreaService);
  private auth = inject(AuthService);

  readonly puedeGestionar = this.auth.tienePermiso('areas.gestionar');

  areas = signal<Area[]>([]);
  cargando = signal(true);
  errorCarga = signal('');
  aviso = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Ventanas
  modal = signal<'formulario' | 'eliminar' | null>(null);
  seleccionada = signal<Area | null>(null); // null en el formulario = área nueva
  procesando = signal(false);
  errorModal = signal('');

  nombre = '';
  siglas = '';
  tipo: 'area' | 'unidad' = 'area';
  padre = '';

  readonly etiquetaDeArea = etiquetaDeArea;

  // Opciones para elegir el área superior (al editar, no se ofrece el área misma)
  opcionesPadre = computed(() => {
    const actual = this.seleccionada();
    return this.areas().filter((a) => a.activa && a._id !== actual?._id);
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set('');

    this.servicio.listarTodas().subscribe({
      next: (areas) => {
        this.areas.set(areas);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudieron cargar las áreas.'));
      },
    });
  }

  abrirNueva(): void {
    this.nombre = '';
    this.siglas = '';
    this.tipo = 'area';
    this.padre = '';
    this.abrir('formulario', null);
  }

  abrirEditar(area: Area): void {
    this.nombre = area.nombre;
    this.siglas = area.siglas;
    this.tipo = area.tipo;
    this.padre = area.padre ?? '';
    this.abrir('formulario', area);
  }

  abrirEliminar(area: Area): void {
    this.abrir('eliminar', area);
  }

  cerrarModal(): void {
    this.modal.set(null);
    this.seleccionada.set(null);
  }

  private abrir(modal: 'formulario' | 'eliminar', area: Area | null): void {
    this.errorModal.set('');
    this.procesando.set(false);
    this.seleccionada.set(area);
    this.modal.set(modal);
  }

  guardar(): void {
    if (this.nombre.trim().length < 2) {
      this.errorModal.set('Escriba el nombre del área (mínimo 2 caracteres).');
      return;
    }

    const datos: DatosArea = {
      nombre: this.nombre.trim(),
      siglas: this.siglas.trim(),
      tipo: this.tipo,
      padre: this.padre || null,
    };

    const area = this.seleccionada();
    this.ejecutar(
      area ? this.servicio.editar(area._id, datos) : this.servicio.crear(datos),
      'No se pudo guardar el área.'
    );
  }

  // Activar o desactivar sin abrir ventana
  alternarActiva(area: Area): void {
    this.ejecutar(this.servicio.editar(area._id, { activa: !area.activa }), 'No se pudo cambiar el estado del área.', false);
  }

  confirmarEliminar(): void {
    const area = this.seleccionada();
    if (area) {
      this.ejecutar(this.servicio.eliminar(area._id), 'No se pudo eliminar el área.');
    }
  }

  private ejecutar(peticion: Observable<{ mensaje: string }>, errorPorDefecto: string, conVentana = true): void {
    this.errorModal.set('');
    this.procesando.set(true);

    peticion.subscribe({
      next: (res) => {
        this.procesando.set(false);
        this.cerrarModal();
        this.mostrar('ok', res.mensaje);
        this.cargar();
      },
      error: async (err) => {
        this.procesando.set(false);
        const mensaje = await mensajeDeError(err, errorPorDefecto);
        if (conVentana) {
          this.errorModal.set(mensaje);
        } else {
          this.mostrar('error', mensaje);
        }
      },
    });
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.aviso.set({ tipo, texto });
    setTimeout(() => this.aviso.set(null), 7000);
  }
}