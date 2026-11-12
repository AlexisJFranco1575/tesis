import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth';
import { mensajeDeError } from '../../services/documento';
import { Rol, RolService } from '../../services/rol';
import { Catalogo, UsuarioService } from '../../services/usuario';

interface GrupoPermisos {
  titulo: string;
  permisos: { codigo: string; etiqueta: string }[];
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [FormsModule],
  styleUrls: ['../usuarios/usuarios.css', './roles.css'],
  templateUrl: './roles.html',
})
export class RolesComponent implements OnInit {
  private servicio = inject(RolService);
  private usuarioServicio = inject(UsuarioService);
  private auth = inject(AuthService);

  private yo = this.auth.getUsuario();
  readonly soySuperadmin = this.yo?.roles.includes('Superadmin') ?? false;
  readonly puedeGestionar = this.auth.tienePermiso('roles.gestionar');

  roles = signal<Rol[]>([]);
  catalogo = signal<Catalogo | null>(null);
  cargando = signal(true);
  errorCarga = signal('');
  aviso = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Ventanas
  modal = signal<'formulario' | 'eliminar' | null>(null);
  seleccionado = signal<Rol | null>(null); // null en el formulario = rol nuevo
  procesando = signal(false);
  errorModal = signal('');

  nombre = '';
  descripcion = '';
  permisosSel = signal<string[]>([]);

  // Los permisos del catálogo, agrupados para leerlos mejor
  grupos = computed<GrupoPermisos[]>(() => {
    const todos = Object.entries(this.catalogo()?.permisos ?? {}).map(([codigo, etiqueta]) => ({ codigo, etiqueta }));
    const de = (...prefijos: string[]) => todos.filter((p) => prefijos.some((x) => p.codigo.startsWith(x)));

    return [
      { titulo: 'Documentos', permisos: de('documentos.') },
      { titulo: 'Integridad y auditoría', permisos: de('integridad.', 'bitacora.', 'auditoria.') },
      { titulo: 'Administración', permisos: de('usuarios.', 'roles.', 'permisos.', 'areas.') },
    ].filter((g) => g.permisos.length > 0);
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set('');

    forkJoin({ roles: this.servicio.listar(), catalogo: this.usuarioServicio.catalogo() }).subscribe({
      next: ({ roles, catalogo }) => {
        this.roles.set(roles);
        this.catalogo.set(catalogo);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudieron cargar los roles.'));
      },
    });
  }

  esSensible(codigo: string): boolean {
    return this.catalogo()?.permisosSensibles.includes(codigo) ?? false;
  }

  // Un permiso sensible solo lo agrega quien ya lo posee
  bloqueadoParaMi(codigo: string): boolean {
    if (this.soySuperadmin || !this.esSensible(codigo)) {
      return false;
    }
    return !(this.yo?.permisos.includes(codigo) ?? false) && !this.permisosSel().includes(codigo);
  }

  alternarPermiso(codigo: string): void {
    this.permisosSel.update((lista) =>
      lista.includes(codigo) ? lista.filter((p) => p !== codigo) : [...lista, codigo]
    );
  }

  abrirNuevo(): void {
    this.nombre = '';
    this.descripcion = '';
    this.permisosSel.set([]);
    this.abrir('formulario', null);
  }

  abrirEditar(rol: Rol): void {
    this.nombre = rol.nombre;
    this.descripcion = rol.descripcion;
    this.permisosSel.set([...rol.permisos]);
    this.abrir('formulario', rol);
  }

  abrirEliminar(rol: Rol): void {
    this.abrir('eliminar', rol);
  }

  cerrarModal(): void {
    this.modal.set(null);
    this.seleccionado.set(null);
  }

  private abrir(modal: 'formulario' | 'eliminar', rol: Rol | null): void {
    this.errorModal.set('');
    this.procesando.set(false);
    this.seleccionado.set(rol);
    this.modal.set(modal);
  }

  guardar(): void {
    const rol = this.seleccionado();

    if (!rol && this.nombre.trim().length < 2) {
      this.errorModal.set('Escriba el nombre del rol (mínimo 2 caracteres).');
      return;
    }
    if (this.permisosSel().length === 0) {
      this.errorModal.set('Seleccione al menos un permiso.');
      return;
    }

    const datos = { descripcion: this.descripcion.trim(), permisos: this.permisosSel() };
    this.ejecutar(
      rol
        ? this.servicio.editar(rol._id, datos)
        : this.servicio.crear({ nombre: this.nombre.trim(), ...datos }),
      'No se pudo guardar el rol.'
    );
  }

  confirmarEliminar(): void {
    const rol = this.seleccionado();
    if (rol) {
      this.ejecutar(this.servicio.eliminar(rol._id), 'No se pudo eliminar el rol.');
    }
  }

  private ejecutar(peticion: Observable<{ mensaje: string }>, errorPorDefecto: string): void {
    this.errorModal.set('');
    this.procesando.set(true);

    peticion.subscribe({
      next: (res) => {
        this.procesando.set(false);
        this.cerrarModal();
        this.aviso.set({ tipo: 'ok', texto: res.mensaje });
        setTimeout(() => this.aviso.set(null), 7000);
        this.cargar();
      },
      error: async (err) => {
        this.procesando.set(false);
        this.errorModal.set(await mensajeDeError(err, errorPorDefecto));
      },
    });
  }
}