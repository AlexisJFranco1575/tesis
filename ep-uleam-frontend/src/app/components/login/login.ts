import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule], // FormsModule es clave para que funcione ngModel
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  credenciales = {
    email: '',
    password: ''
  };
  
  mensajeError = '';

  // Inyectamos el Router para poder cambiar de página tras el login
  constructor(private router: Router) {}

  async iniciarSesion() {
    this.mensajeError = ''; // Limpiamos errores previos

    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.credenciales)
      });

      const data = await response.json();

      if (!response.ok) {
        // Si el backend lanza error (credenciales inválidas, etc.)
        this.mensajeError = data.mensaje || 'Error al iniciar sesión';
        return;
      }

      // LOGIN EXITOSO: Guardamos el token y los datos del usuario en el navegador
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      
      console.log('Login exitoso. Redirigiendo al Dashboard...');
      
      // Redirigir al dashboard (Asegúrate de que esta ruta exista en tu app.routes.ts)
      this.router.navigate(['/dashboard']); 

    } catch (error) {
      console.error(error);
      this.mensajeError = 'Error de conexión con el servidor backend.';
    }
  }
}