import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { INACTIVIDAD_MINUTOS } from '../config';
import { AuthService } from './auth';

const LIMITE_MS = INACTIVIDAD_MINUTOS * 60 * 1000;
const AVISO_MS = 60 * 1000; // el aviso aparece 1 minuto antes del cierre
const LATIDO_MS = 5 * 60 * 1000; // cada 5 minutos se avisa al servidor que hay actividad
const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

@Injectable({ providedIn: 'root' })
export class InactividadService {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly advertencia = signal(false);
  readonly segundosRestantes = signal(0);

  private ultimaActividad = Date.now();
  private ultimoLatido = Date.now();
  private huboActividad = false;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private readonly alActividad = () => this.registrarActividad();

  iniciar(): void {
    if (this.reloj) {
      return;
    }
    this.ultimaActividad = Date.now();
    this.ultimoLatido = Date.now();
    this.huboActividad = false;
    this.advertencia.set(false);

    EVENTOS.forEach((e) => window.addEventListener(e, this.alActividad, { passive: true }));
    this.reloj = setInterval(() => this.revisar(), 1000);
  }

  detener(): void {
    if (this.reloj) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
    EVENTOS.forEach((e) => window.removeEventListener(e, this.alActividad));
    this.advertencia.set(false);
  }

  // Botón "Seguir conectado" del aviso
  continuar(): void {
    this.advertencia.set(false);
    this.registrarActividad();
    this.enviarLatido();
  }

  private registrarActividad(): void {
    // Con el aviso en pantalla solo cuenta el clic en "Seguir conectado"
    if (this.advertencia()) {
      return;
    }
    this.ultimaActividad = Date.now();
    this.huboActividad = true;
  }

  private revisar(): void {
    const ahora = Date.now();
    const inactivoMs = ahora - this.ultimaActividad;

    if (inactivoMs >= LIMITE_MS) {
      this.cerrarPorInactividad();
      return;
    }

    if (inactivoMs >= LIMITE_MS - AVISO_MS) {
      this.advertencia.set(true);
      this.segundosRestantes.set(Math.max(0, Math.ceil((LIMITE_MS - inactivoMs) / 1000)));
      return;
    }

    if (this.huboActividad && ahora - this.ultimoLatido >= LATIDO_MS) {
      this.enviarLatido();
    }
  }

  private enviarLatido(): void {
    this.ultimoLatido = Date.now();
    this.huboActividad = false;
    this.auth.refrescarPerfil().subscribe({ error: () => {} }); // un 401 lo atiende el interceptor
  }

  private cerrarPorInactividad(): void {
    this.detener();
    this.auth.guardarAviso('Su sesión se cerró por inactividad. Inicie sesión nuevamente.');
    this.auth.cerrarSesion('inactividad').subscribe(() => this.router.navigate(['/login']));
  }
}