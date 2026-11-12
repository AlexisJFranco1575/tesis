import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth';
import { claseEstado, mensajeDeError } from '../../services/documento';
import {
  BANDEJAS,
  Bandeja,
  FilaBandeja,
  InfoBandeja,
  TramiteService,
  esBandeja,
  semaforoDePlazo,
} from '../../services/tramite';

const ROTULOS: Record<string, string> = { para: 'Para', copia: 'Con copia', informado: 'Informado' };
const ESTADOS_TRAMITE: Record<string, string> = {
  pendiente: 'Sin leer',
  leido: 'Leído',
  respondido: 'Respondido',
  archivado: 'Archivado',
  reasignado: 'Reasignado',
};

@Component({
  selector: 'app-bandejas',
  standalone: true,
  imports: [DatePipe, RouterLink, RouterLinkActive],
  styleUrl: './bandejas.css',
  templateUrl: './bandejas.html',
})
export class BandejasComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private servicio = inject(TramiteService);
  private auth = inject(AuthService);

  readonly bandejas = BANDEJAS;
  readonly puedeRegistrar = this.auth.tienePermiso('documentos.registrar');
  readonly claseEstado = claseEstado;
  readonly semaforo = semaforoDePlazo;
  readonly resumen = this.servicio.resumenActual;

  bandeja = signal<InfoBandeja>(BANDEJAS[0]);
  items = signal<FilaBandeja[]>([]);
  cargando = signal(true);
  error = signal('');
  texto = signal('');
  soloVencidos = signal(false);

  vencidos = computed(() => this.resumen()?.recibidos.vencidos ?? 0);

  // En las bandejas de documentos propios la columna muestra al remitente
  columnaOrigen = computed(() => (['elaboracion', 'enviados'].includes(this.bandeja().clave) ? 'Remitente' : 'De'));

  private temporizador: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const clave = params.get('bandeja') ?? 'recibidos';
      if (!esBandeja(clave)) {
        this.router.navigate(['/dashboard/bandejas/recibidos']);
        return;
      }
      this.bandeja.set(BANDEJAS.find((b) => b.clave === clave)!);
      this.texto.set('');
      this.soloVencidos.set(false);
      this.cargar();
    });
  }

  ngOnDestroy(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
    }
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');

    this.servicio
      .listar(this.bandeja().clave, { texto: this.texto(), soloVencidos: this.soloVencidos() })
      .subscribe({
        next: (respuesta) => {
          this.items.set(respuesta.items);
          this.cargando.set(false);
        },
        error: async (err) => {
          this.cargando.set(false);
          this.error.set(await mensajeDeError(err, 'No se pudo cargar la bandeja.'));
        },
      });

    this.servicio.refrescar();
  }

  // La búsqueda espera un instante a que termine de escribir
  alBuscar(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
    if (this.temporizador) {
      clearTimeout(this.temporizador);
    }
    this.temporizador = setTimeout(() => this.cargar(), 300);
  }

  alternarVencidos(): void {
    this.soloVencidos.update((v) => !v);
    this.cargar();
  }

  abrir(fila: FilaBandeja): void {
    this.router.navigate(['/dashboard/documentos', fila.documentoId]);
  }

  // Número que se muestra en cada pestaña (sin leer donde aplica; si no, el total)
  contador(clave: Bandeja): { valor: number; destacar: boolean } | null {
    const resumen = this.resumen();
    if (!resumen) {
      return null;
    }
    if (clave === 'recibidos' || clave === 'informados') {
      const valor = resumen[clave].sinLeer;
      return valor > 0 ? { valor, destacar: true } : null;
    }
    const total = resumen[clave].total;
    return total > 0 ? { valor: total, destacar: false } : null;
  }

  rotuloTipo(fila: FilaBandeja): string {
    return ROTULOS[fila.tipo] ?? '';
  }

  estadoTramite(fila: FilaBandeja): string {
    return fila.tipo === 'autor' ? '' : (ESTADOS_TRAMITE[fila.estado] ?? fila.estado);
  }
}