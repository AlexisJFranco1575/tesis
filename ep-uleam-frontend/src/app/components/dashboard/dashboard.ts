import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService, UsuarioSesion } from '../../services/auth';
import { InactividadService } from '../../services/inactividad';
import { CampanaComponent } from '../campana/campana';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterModule, CampanaComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
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
  verBitacora = computed(() => this.permisos().includes('bitacora.consultar'));

  ngOnInit(): void {
    this.usuarioActual.set(this.auth.getUsuario());
    this.inactividad.iniciar();

    // Actualiza roles y permisos por si cambiaron desde el último inicio de sesión
    this.auth.refrescarPerfil().subscribe({
      next: (usuario) => this.usuarioActual.set(usuario),
      error: () => {} // un 401 lo atiende el interceptor
    });
  }

  ngOnDestroy(): void {
    this.inactividad.detener();
  }

  continuarSesion(): void {
    this.inactividad.continuar();
  }

  cerrarSesion(): void {
    this.inactividad.detener();
    this.auth.cerrarSesion().subscribe(() => this.router.navigate(['/login']));
  }
}