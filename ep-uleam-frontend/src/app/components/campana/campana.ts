import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Notificacion, NotificacionService } from '../../services/notificacion';

@Component({
  selector: 'app-campana',
  standalone: true,
  imports: [DatePipe],
  styleUrl: './campana.css',
  templateUrl: './campana.html',
})
export class CampanaComponent implements OnInit, OnDestroy {
  private servicio = inject(NotificacionService);
  private router = inject(Router);

  readonly notificaciones = this.servicio.notificaciones;
  readonly noLeidas = this.servicio.noLeidas;

  abierta = signal(false);

  ngOnInit(): void {
    this.servicio.iniciar();
  }

  ngOnDestroy(): void {
    this.servicio.detener();
  }

  alternar(): void {
    this.abierta.update((v) => !v);
    if (this.abierta()) {
      this.servicio.cargar(); // al abrir, se actualiza la lista
    }
  }

  cerrar(): void {
    this.abierta.set(false);
  }

  // Marca como leída y lleva al documento (o a la pantalla relacionada)
  abrir(notificacion: Notificacion): void {
    if (!notificacion.leida) {
      this.servicio.marcarLeida(notificacion._id).subscribe({ error: () => {} });
    }
    this.cerrar();

    const destino = this.destino(notificacion);
    if (destino) {
      this.router.navigateByUrl(destino);
    }
  }

  marcarTodas(): void {
    this.servicio.marcarTodasLeidas().subscribe({ error: () => {} });
  }

  private destino(n: Notificacion): string | null {
    if (n.documento) {
      return `/dashboard/documentos/${n.documento}`;
    }
    if (n.titulo === 'Cuenta bloqueada' || n.titulo === 'Solicitud de recuperación') {
      return '/dashboard/usuarios';
    }
    return null;
  }
}