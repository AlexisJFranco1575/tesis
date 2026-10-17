import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { mensajeDeError } from '../../services/documento';

@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cambiar-password.html',
  styleUrls: ['../login/login.css'] // comparte el diseño de la pantalla de login
})
export class CambiarPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  // true cuando entró con una clave temporal: no puede omitir el cambio
  readonly obligatorio = this.auth.debeCambiarPassword();

  datos = { actual: '', nueva: '', confirmar: '' };
  mensajeError = signal('');
  cargando = signal(false);

  guardar(): void {
    this.mensajeError.set('');
    const { actual, nueva, confirmar } = this.datos;

    const error = this.validar(actual, nueva, confirmar);
    if (error) {
      this.mensajeError.set(error);
      return;
    }

    this.cargando.set(true);
    this.auth.cambiarPassword(actual, nueva).subscribe({
      next: () => {
        this.cargando.set(false);
        this.router.navigateByUrl(this.auth.rutaInicio() ?? '/login');
      },
      error: async (err) => {
        this.cargando.set(false);
        this.mensajeError.set(await mensajeDeError(err, 'No se pudo cambiar la contraseña.'));
      }
    });
  }

  cancelar(): void {
    this.router.navigateByUrl(this.auth.rutaInicio() ?? '/login');
  }

  salir(): void {
    this.auth.cerrarSesion().subscribe(() => this.router.navigate(['/login']));
  }

  private validar(actual: string, nueva: string, confirmar: string): string | null {
    if (!actual || !nueva || !confirmar) {
      return 'Complete los tres campos.';
    }
    if (nueva.length < 8) {
      return 'La nueva contraseña debe tener al menos 8 caracteres.';
    }
    if (!/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) {
      return 'La nueva contraseña debe combinar letras y números.';
    }
    if (nueva !== confirmar) {
      return 'La confirmación no coincide con la nueva contraseña.';
    }
    if (nueva === actual) {
      return 'La nueva contraseña debe ser distinta de la actual.';
    }
    return null;
  }
}