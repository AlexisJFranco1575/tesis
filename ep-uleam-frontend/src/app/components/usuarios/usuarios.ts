import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { AuthService } from '../../services/auth';
import { mensajeDeError } from '../../services/documento';
import { Catalogo, UsuarioAdmin, UsuarioService } from '../../services/usuario';

type Modal = 'registrar' | 'roles' | 'permisos' | 'clave' | 'baja' | 'reactivar' | null;
type FiltroEstado = '' | 'activos' | 'inactivos' | 'bloqueados' | 'solicitudes';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule, DatePipe],
  styleUrl: './usuarios.css',
  templateUrl: './usuarios.html',
})
export class UsuariosComponent implements OnInit {
  private servicio = inject(UsuarioService);
  private auth = inject(AuthService);

  private yo = this.auth.getUsuario();
  readonly miId = this.yo?.id ?? '';
  readonly soySuperadmin = this.yo?.roles.includes('Superadmin') ?? false;

  // Qué acciones se muestran (el backend las exige igualmente)
  readonly puedeGestionar = this.auth.tienePermiso('usuarios.gestionar');
  readonly puedeRoles = this.auth.tienePermiso('roles.gestionar');
  readonly puedePermisos = this.auth.tienePermiso('permisos.gestionar');

  usuarios = signal<UsuarioAdmin[]>([]);
  catalogo = signal<Catalogo | null>(null);
  cargando = signal(true);
  errorCarga = signal('');
  aviso = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Filtros
  textoBusqueda = signal('');
  filtroEstado = signal<FiltroEstado>('');

  // Ventanas
  modal = signal<Modal>(null);
  seleccionado = signal<UsuarioAdmin | null>(null);
  procesando = signal(false);
  errorModal = signal('');

  // Registrar
  formulario = this.formularioVacio();
  rolesSel = signal<string[]>([]);

  // Permisos
  permisosSel = signal<string[]>([]);

  // Baja
  motivoBaja = '';

  // Clave temporal
  claveGenerada = signal('');
  copiada = signal(false);

  roles = computed(() => this.catalogo()?.roles ?? []);

  listaPermisos = computed(() =>
    Object.entries(this.catalogo()?.permisos ?? {}).map(([codigo, etiqueta]) => ({ codigo, etiqueta }))
  );

  solicitudesPendientes = computed(
    () => this.usuarios().filter((u) => u.estado && u.solicitoRecuperacion).length
  );

  usuariosFiltrados = computed(() => {
    const texto = this.textoBusqueda().trim().toLowerCase();
    const estado = this.filtroEstado();

    return this.usuarios().filter((u) => {
      const coincideTexto =
        !texto ||
        [u.nombres, u.apellidos, u.cedula, u.email, u.departamento].some((c) => c.toLowerCase().includes(texto));

      const coincideEstado =
        !estado ||
        (estado === 'activos' && u.estado && !u.bloqueado) ||
        (estado === 'inactivos' && !u.estado) ||
        (estado === 'bloqueados' && u.estado && u.bloqueado) ||
        (estado === 'solicitudes' && u.estado && u.solicitoRecuperacion);

      return coincideTexto && coincideEstado;
    });
  });

  // Permisos que dan por defecto los roles del usuario seleccionado
  permisosDeRolSel = computed(() => this.permisosDeRoles(this.seleccionado()?.roles ?? []));

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.errorCarga.set('');

    forkJoin({ usuarios: this.servicio.listar(), catalogo: this.servicio.catalogo() }).subscribe({
      next: ({ usuarios, catalogo }) => {
        this.usuarios.set(usuarios);
        this.catalogo.set(catalogo);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudieron cargar los usuarios.'));
      },
    });
  }

  // Un usuario se puede administrar si no es uno mismo y, si es Superadmin, solo otro Superadmin puede
  esAdministrable(u: UsuarioAdmin): boolean {
    return u._id !== this.miId && (!u.roles.includes('Superadmin') || this.soySuperadmin);
  }

  tengoPermiso(codigo: string): boolean {
    return this.soySuperadmin || (this.yo?.permisos.includes(codigo) ?? false);
  }

  // ---------- Abrir y cerrar ventanas ----------

  abrirRegistro(): void {
    this.formulario = this.formularioVacio();
    this.rolesSel.set([]);
    this.abrir('registrar', null);
  }

  abrirRoles(u: UsuarioAdmin): void {
    this.rolesSel.set([...u.roles]);
    this.abrir('roles', u);
  }

  abrirPermisos(u: UsuarioAdmin): void {
    this.permisosSel.set([...u.permisos]);
    this.abrir('permisos', u);
  }

  abrirClave(u: UsuarioAdmin): void {
    this.claveGenerada.set('');
    this.copiada.set(false);
    this.abrir('clave', u);
  }

  abrirBaja(u: UsuarioAdmin): void {
    this.motivoBaja = '';
    this.abrir('baja', u);
  }

  abrirReactivar(u: UsuarioAdmin): void {
    this.abrir('reactivar', u);
  }

  cerrarModal(): void {
    this.modal.set(null);
    this.seleccionado.set(null);
    this.claveGenerada.set(''); // la clave temporal solo se muestra una vez
  }

  private abrir(modal: Modal, usuario: UsuarioAdmin | null): void {
    this.errorModal.set('');
    this.procesando.set(false);
    this.seleccionado.set(usuario);
    this.modal.set(modal);
  }

  // ---------- Selección de roles y permisos ----------

  alternarRol(rol: string): void {
    this.rolesSel.update((lista) => (lista.includes(rol) ? lista.filter((r) => r !== rol) : [...lista, rol]));
  }

  alternarPermiso(codigo: string): void {
    this.permisosSel.update((lista) =>
      lista.includes(codigo) ? lista.filter((p) => p !== codigo) : [...lista, codigo]
    );
  }

  // ---------- Acciones ----------

  guardarRegistro(): void {
    const error = this.validarRegistro();
    if (error) {
      this.errorModal.set(error);
      return;
    }

    const f = this.formulario;
    this.ejecutar(
      this.servicio.crear({
        cedula: f.cedula.trim(),
        nombres: f.nombres.trim(),
        apellidos: f.apellidos.trim(),
        email: f.email.trim(),
        departamento: f.departamento.trim(),
        roles: this.rolesSel(),
        password: f.password,
      }),
      'No se pudo registrar el usuario.'
    );
  }

  guardarRoles(): void {
    const u = this.seleccionado();
    if (!u) {
      return;
    }
    if (this.rolesSel().length === 0) {
      this.errorModal.set('Seleccione al menos un rol.');
      return;
    }
    this.ejecutar(this.servicio.cambiarRoles(u._id, this.rolesSel()), 'No se pudieron actualizar los roles.');
  }

  guardarPermisos(): void {
    const u = this.seleccionado();
    if (!u) {
      return;
    }

    // Lo marcado que el rol no da → "agregado"; lo que el rol da y se desmarcó → "retirado"
    const porRol = this.permisosDeRoles(u.roles);
    const deseados = this.permisosSel();
    const extra = deseados.filter((p) => !porRol.includes(p));
    const retirados = porRol.filter((p) => !deseados.includes(p));

    this.ejecutar(
      this.servicio.cambiarPermisos(u._id, extra, retirados),
      'No se pudieron actualizar los permisos.'
    );
  }

  generarClave(): void {
    const u = this.seleccionado();
    if (!u) {
      return;
    }
    this.ejecutar(this.servicio.generarClave(u._id), 'No se pudo generar la clave temporal.', (res) => {
      this.claveGenerada.set(res.claveTemporal);
      this.recargarLista();
    });
  }

  confirmarBaja(): void {
    const u = this.seleccionado();
    if (u) {
      this.ejecutar(this.servicio.darDeBaja(u._id, this.motivoBaja.trim()), 'No se pudo dar de baja al usuario.');
    }
  }

  confirmarReactivar(): void {
    const u = this.seleccionado();
    if (u) {
      this.ejecutar(this.servicio.reactivar(u._id), 'No se pudo reactivar al usuario.');
    }
  }

  async copiarClave(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.claveGenerada());
      this.copiada.set(true);
    } catch {
      this.errorModal.set('No se pudo copiar. Seleccione la clave y cópiela manualmente.');
    }
  }

  // Genera una contraseña temporal aleatoria para el formulario de registro
  generarPasswordTemporal(): void {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let clave = '';
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      clave = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
    } while (!/[A-Za-z]/.test(clave) || !/\d/.test(clave));
    this.formulario.password = clave;
  }

  // ---------- Internos ----------

  // Ejecuta una petición con el estado de "procesando". Si no se indica qué hacer al terminar,
  // cierra la ventana, muestra el mensaje y recarga la lista. Es genérico para conservar el tipo
  // de la respuesta (por ejemplo, la clave temporal).
  private ejecutar<T extends { mensaje: string }>(
    peticion: Observable<T>,
    errorPorDefecto: string,
    alExito?: (respuesta: T) => void
  ): void {
    this.errorModal.set('');
    this.procesando.set(true);

    peticion.subscribe({
      next: (res) => {
        this.procesando.set(false);
        if (alExito) {
          alExito(res);
        } else {
          this.cerrarModal();
          this.mostrar('ok', res.mensaje);
          this.recargarLista();
        }
      },
      error: async (err) => {
        this.procesando.set(false);
        this.errorModal.set(await mensajeDeError(err, errorPorDefecto));
      },
    });
  }

  private recargarLista(): void {
    this.servicio.listar().subscribe({ next: (u) => this.usuarios.set(u), error: () => {} });
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.aviso.set({ tipo, texto });
    setTimeout(() => this.aviso.set(null), 7000);
  }

  private permisosDeRoles(roles: string[]): string[] {
    const porRol = this.catalogo()?.permisosPorRol ?? {};
    return [...new Set(roles.flatMap((r) => porRol[r] ?? []))];
  }

  private validarRegistro(): string | null {
    const f = this.formulario;

    if (![f.cedula, f.nombres, f.apellidos, f.email, f.departamento].every((c) => c.trim() !== '')) {
      return 'Complete todos los datos obligatorios.';
    }
    if (!/^\d{10}$/.test(f.cedula.trim())) {
      return 'La cédula debe tener 10 dígitos.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      return 'El correo ingresado no es válido.';
    }
    if (this.rolesSel().length === 0) {
      return 'Seleccione al menos un rol.';
    }
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) {
      return 'La contraseña temporal debe tener al menos 8 caracteres, con letras y números.';
    }
    return null;
  }

  private formularioVacio() {
    return { cedula: '', nombres: '', apellidos: '', email: '', departamento: '', password: '' };
  }
}