import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  modo = signal<'ingreso' | 'recuperar'>('ingreso');
  credenciales = { email: '', password: '' };
  emailRecuperacion = '';

  aviso = signal(this.auth.tomarAviso()); // p. ej. "Su sesión se cerró por inactividad"
  mensajeError = signal('');
  mensajeExito = signal('');
  cargando = signal(false);

  iniciarSesion(): void {
    this.mensajeError.set('');
    this.aviso.set('');
    this.cargando.set(true);

    this.auth.login(this.credenciales.email, this.credenciales.password).subscribe({
      next: (res) => {
        this.cargando.set(false);

        if (res.usuario.debeCambiarPassword) {
          this.router.navigate(['/cambiar-password']);
          return;
        }

        const destino = this.auth.rutaInicio();
        if (!destino) {
          this.auth.logout();
          this.mensajeError.set('Su cuenta no tiene permisos asignados. Comuníquese con Gerencia o TIC.');
          return;
        }
        this.router.navigateByUrl(destino);
      },
      error: (err) => {
        this.cargando.set(false);
        this.mensajeError.set(this.textoDeError(err, 'Error al iniciar sesión'));
      }
    });
  }

  irARecuperar(): void {
    this.limpiarMensajes();
    this.emailRecuperacion = this.credenciales.email;
    this.modo.set('recuperar');
  }

  volverAlIngreso(): void {
    this.limpiarMensajes();
    this.modo.set('ingreso');
  }

  solicitarRecuperacion(): void {
    this.limpiarMensajes();
    this.cargando.set(true);

    this.auth.recuperar(this.emailRecuperacion).subscribe({
      next: (res) => {
        this.cargando.set(false);
        this.mensajeExito.set(res.mensaje);
      },
      error: (err) => {
        this.cargando.set(false);
        this.mensajeError.set(this.textoDeError(err, 'No se pudo enviar la solicitud.'));
      }
    });
  }

  private limpiarMensajes(): void {
    this.aviso.set('');
    this.mensajeError.set('');
    this.mensajeExito.set('');
  }

  private textoDeError(err: { status?: number; error?: { mensaje?: string } }, porDefecto: string): string {
    if (err.status === 0) {
      return 'Error de conexión con el servidor backend.';
    }
    return err.error?.mensaje || porDefecto;
  }
}