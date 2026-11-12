import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService, UsuarioSesion } from '../../services/auth';
import { DirectorioService } from '../../services/directorio';
import { InactividadService } from '../../services/inactividad';
import { PendientesService } from '../../services/pendientes';
import { TramiteService } from '../../services/tramite';
import { AvisosComponent } from '../avisos/avisos';
import { CampanaComponent } from '../campana/campana';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterModule, CampanaComponent, AvisosComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  private pendientes = inject(PendientesService);
  private tramites = inject(TramiteService);
  private directorio = inject(DirectorioService);
  readonly inactividad = inject(InactividadService);

  usuarioActual = signal<UsuarioSesion | null>(null);

  iniciales = computed(() => {
    const partes = (this.usuarioActual()?.nombreCompleto ?? '').split(' ').filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || 'U';
  });

  // Opciones del menú según los permisos del usuario
  private permisos = computed(() => this.usuarioActual()?.permisos ?? []);
  verDocumentos = computed(() => this.permisos().includes('documentos.consultar'));
  verUsuarios = computed(() =>
    ['usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar'].some((p) => this.permisos().includes(p))
  );
  verRoles = computed(() => this.permisos().includes('roles.gestionar'));
  verAreas = computed(() => this.permisos().includes('areas.gestionar'));
  verBitacora = computed(() => this.permisos().includes('bitacora.consultar'));

  // Contadores de las bandejas
  private resumen = this.tramites.resumenActual;
  recibidosSinLeer = computed(() => this.resumen()?.recibidos.sinLeer ?? 0);
  recibidosVencidos = computed(() => this.resumen()?.recibidos.vencidos ?? 0);
  informadosSinLeer = computed(() => this.resumen()?.informados.sinLeer ?? 0);

  // Pendientes de administración y de revisión
  pendientesUsuarios = computed(() => {
    this.pendientes.resumen();
    return this.pendientes.cantidadEn('/dashboard/usuarios');
  });
  pendientesDocumentos = computed(() => {
    this.pendientes.resumen();
    return this.pendientes.cantidadEn('/dashboard/documentos');
  });

  ngOnInit(): void {
    this.usuarioActual.set(this.auth.getUsuario());
    this.inactividad.iniciar();
    this.pendientes.iniciar();
    if (this.auth.tienePermiso('documentos.consultar')) {
      this.tramites.iniciar();
    }

    // Actualiza roles y permisos por si cambiaron desde el último inicio de sesión
    this.auth.refrescarPerfil().subscribe({
      next: (usuario) => this.usuarioActual.set(usuario),
      error: () => {} // un 401 lo atiende el interceptor
    });
  }

  ngOnDestroy(): void {
    this.inactividad.detener();
    this.pendientes.detener();
    this.tramites.detener();
    this.directorio.reiniciar();
  }

  // La barra de la parte superior busca en el repositorio de documentos
  buscar(texto: string): void {
    this.router.navigate(['/dashboard/documentos'], { queryParams: { texto: texto.trim() || null } });
  }

  continuarSesion(): void {
    this.inactividad.continuar();
  }

  cerrarSesion(): void {
    this.inactividad.detener();
    this.pendientes.detener();
    this.tramites.detener();
    this.directorio.reiniciar();
    this.auth.cerrarSesion().subscribe(() => this.router.navigate(['/login']));
  }
}