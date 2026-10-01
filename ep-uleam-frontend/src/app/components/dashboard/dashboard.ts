import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router'; // <-- RouterModule ES VITAL AQUÍ

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule], // <-- DEBE ESTAR IMPORTADO AQUÍ
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  usuarioActual: any = null;
  iniciales: string = 'U';

  constructor(private router: Router) {}

  ngOnInit() {
    const usuarioString = localStorage.getItem('usuario');
    
    if (!usuarioString) {
      this.router.navigate(['/login']);
      return;
    }

    this.usuarioActual = JSON.parse(usuarioString);
    
    if (this.usuarioActual && this.usuarioActual.nombreCompleto) {
      const partesNombre = this.usuarioActual.nombreCompleto.split(' ');
      if (partesNombre.length >= 2) {
        this.iniciales = partesNombre[0][0] + partesNombre[1][0];
      } else {
        this.iniciales = partesNombre[0][0];
      }
    }
  }

  cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}