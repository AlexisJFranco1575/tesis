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

  credenciales = { email: '', password: '' };
  mensajeError = signal('');
  cargando = signal(false);

  iniciarSesion(): void {
    this.mensajeError.set('');
    this.cargando.set(true);

    this.auth.login(this.credenciales.email, this.credenciales.password).subscribe({
      next: () => {
        this.cargando.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.cargando.set(false);
        if (err.status === 0) {
          this.mensajeError.set('Error de conexión con el servidor backend.');
        } else {
          this.mensajeError.set(err.error?.mensaje || 'Error al iniciar sesión');
        }
      }
    });
  }
}