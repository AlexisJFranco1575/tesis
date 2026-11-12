import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Aviso, AvisosService } from '../../services/avisos';

@Component({
  selector: 'app-avisos',
  standalone: true,
  templateUrl: './avisos.html',
  styleUrl: './avisos.css',
})
export class AvisosComponent {
  private servicio = inject(AvisosService);
  private router = inject(Router);

  readonly avisos = this.servicio.avisos;

  abrir(aviso: Aviso): void {
    this.servicio.cerrar(aviso.id);
    if (aviso.ruta) {
      this.router.navigateByUrl(aviso.ruta);
    }
  }

  cerrar(evento: Event, aviso: Aviso): void {
    evento.stopPropagation();
    this.servicio.cerrar(aviso.id);
  }
}