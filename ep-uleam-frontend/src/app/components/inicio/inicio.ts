import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { claseEstado, mensajeDeError } from '../../services/documento';
import { Conteo, Estadisticas, EstadisticasService } from '../../services/estadisticas';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './inicio.css',
  templateUrl: './inicio.html',
})
export class InicioComponent implements OnInit {
  private servicio = inject(EstadisticasService);
  private auth = inject(AuthService);

  readonly usuario = this.auth.getUsuario();
  readonly puedeRegistrar = this.auth.tienePermiso('documentos.registrar');
  readonly claseEstado = claseEstado;

  datos = signal<Estadisticas | null>(null);
  cargando = signal(true);
  error = signal('');

  // Los máximos sirven para calcular el largo de cada barra
  maxEstado = computed(() => this.maximo(this.datos()?.porEstado ?? []));
  maxTipo = computed(() => this.maximo(this.datos()?.porTipo ?? []));
  maxArea = computed(() => this.maximo(this.datos()?.porArea ?? []));
  maxMes = computed(() => this.maximo((this.datos()?.porMes ?? []).map((m) => ({ clave: m.mes, total: m.total }))));

  ngOnInit(): void {
    this.servicio.obtener().subscribe({
      next: (datos) => {
        this.datos.set(datos);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.error.set(await mensajeDeError(err, 'No se pudieron cargar los indicadores.'));
      },
    });
  }

  saludo(): string {
    const hora = new Date().getHours();
    if (hora < 12) {
      return 'Buenos días';
    }
    return hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  // Largo de la barra en porcentaje (las que tienen valor nunca quedan invisibles)
  porcentaje(valor: number, maximo: number): number {
    if (valor <= 0) {
      return 0;
    }
    return Math.max(4, Math.round((valor / maximo) * 100));
  }

  // "2026-10" → "oct 2026"
  etiquetaMes(mes: string): string {
    const [anio, numero] = mes.split('-').map(Number);
    return `${MESES_CORTOS[numero - 1] ?? ''} ${anio}`;
  }

  // 0.5 → "30 min" · 5 → "5 h" · 50 → "2 días"
  tiempoMedio(horas: number | null): string {
    if (horas === null) {
      return '—';
    }
    if (horas < 1) {
      return `${Math.round(horas * 60)} min`;
    }
    if (horas < 48) {
      return `${horas} h`;
    }
    return `${Math.round(horas / 24)} días`;
  }

  private maximo(lista: Conteo[]): number {
    return Math.max(1, ...lista.map((x) => x.total));
  }
}