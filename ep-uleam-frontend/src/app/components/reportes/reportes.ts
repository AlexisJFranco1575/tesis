import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Area, AreaService } from '../../services/area';
import { AuthService } from '../../services/auth';
import { ESTADOS_DOCUMENTO, TIPOS_DOCUMENTO, mensajeDeError } from '../../services/documento';
import { ReportesService, TipoReporte } from '../../services/reportes';
import { fechaLocalHoy } from '../../services/tramite';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './reportes.css',
  templateUrl: './reportes.html',
})
export class ReportesComponent implements OnInit {
  private servicio = inject(ReportesService);
  private areasServicio = inject(AreaService);
  private auth = inject(AuthService);

  readonly puedeBitacora = this.auth.tienePermiso('bitacora.consultar');
  readonly estados = ESTADOS_DOCUMENTO;
  readonly tipos = TIPOS_DOCUMENTO;

  areas = signal<Area[]>([]);
  descargando = signal<TipoReporte | null>(null);
  mensaje = signal<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  filtrosDocumentos = { estado: '', tipo: '', area: '', desde: '', hasta: '' };
  filtrosBitacora = { desde: '', hasta: '' };

  ngOnInit(): void {
    this.areasServicio.listar().subscribe({
      next: (areas) => this.areas.set(areas),
      error: () => {}, // el filtro por área simplemente quedará vacío
    });
  }

  descargarDocumentos(): void {
    this.descargar('documentos', this.filtrosDocumentos, 'documentos');
  }

  descargarBitacora(): void {
    this.descargar('bitacora', this.filtrosBitacora, 'bitacora');
  }

  private descargar(tipo: TipoReporte, filtros: { desde: string; hasta: string }, nombre: string): void {
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      this.mostrar('error', 'La fecha inicial no puede ser posterior a la final.');
      return;
    }

    this.descargando.set(tipo);
    this.servicio.descargar(tipo, { ...filtros }).subscribe({
      next: (blob) => {
        this.guardar(blob, `${nombre}-${fechaLocalHoy()}.csv`);
        this.descargando.set(null);
        this.mostrar('ok', 'Reporte generado. Ábralo con Excel: las columnas ya vienen separadas.');
      },
      error: async (err) => {
        this.descargando.set(null);
        this.mostrar('error', await mensajeDeError(err, 'No se pudo generar el reporte.'));
      },
    });
  }

  private guardar(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private mostrar(tipo: 'ok' | 'error', texto: string): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => this.mensaje.set(null), 8000);
  }
}