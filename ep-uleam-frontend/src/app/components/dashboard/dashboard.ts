import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService, UsuarioSesion } from '../../services/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  usuarioActual: UsuarioSesion | null = null;
  iniciales = 'U';
  esControl = false;

  ngOnInit(): void {
    this.usuarioActual = this.auth.getUsuario();
    this.esControl = this.auth.esControl();

    if (this.usuarioActual?.nombreCompleto) {
      const partes = this.usuarioActual.nombreCompleto.split(' ').filter(Boolean);
      this.iniciales = (partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '');
      this.iniciales = this.iniciales.toUpperCase() || 'U';
    }
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}