import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DocumentoService,
  EntradaBitacora,
  ResultadoAuditoria,
  claseAccion,
  etiquetaAccion,
  mensajeDeError,
} from '../../services/documento';

@Component({
  selector: 'app-trazabilidad',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  styleUrl: './trazabilidad.css',
  templateUrl: './trazabilidad.html',
})
export class TrazabilidadComponent implements OnInit {
  private documentoService = inject(DocumentoService);

  readonly etiqueta = etiquetaAccion;
  readonly clase = claseAccion;

  entradas = signal<EntradaBitacora[]>([]);
  cargando = signal(true);
  errorCarga = signal('');

  // Filtros
  textoBusqueda = signal('');
  filtroAccion = signal('');

  // Auditoría general
  ejecutando = signal(false);
  resultado = signal<ResultadoAuditoria | null>(null);
  errorAuditoria = signal('');

  acciones = computed(() => [...new Set(this.entradas().map((e) => e.accion))].sort());

  entradasFiltradas = computed(() => {
    const texto = this.textoBusqueda().trim().toLowerCase();
    const accion = this.filtroAccion();

    return this.entradas().filter((e) => {
      const coincideTexto =
        !texto ||
        e.codigoTramite.toLowerCase().includes(texto) ||
        e.usuario.nombre.toLowerCase().includes(texto) ||
        e.detalle.toLowerCase().includes(texto) ||
        etiquetaAccion(e.accion).toLowerCase().includes(texto);
      const coincideAccion = !accion || e.accion === accion;
      return coincideTexto && coincideAccion;
    });
  });

  ngOnInit(): void {
    this.cargarBitacora();
  }

  cargarBitacora(): void {
    this.cargando.set(true);
    this.errorCarga.set('');

    this.documentoService.listarBitacora({ limite: 200 }).subscribe({
      next: (entradas) => {
        this.entradas.set(entradas);
        this.cargando.set(false);
      },
      error: async (err) => {
        this.cargando.set(false);
        this.errorCarga.set(await mensajeDeError(err, 'No se pudo cargar la bitácora.'));
      },
    });
  }

  ejecutarAuditoria(): void {
    this.ejecutando.set(true);
    this.errorAuditoria.set('');
    this.resultado.set(null);

    this.documentoService.ejecutarAuditoria().subscribe({
      next: (res) => {
        this.resultado.set(res);
        this.ejecutando.set(false);
        this.cargarBitacora(); // la auditoría y las alertas quedan registradas
      },
      error: async (err) => {
        this.ejecutando.set(false);
        this.errorAuditoria.set(await mensajeDeError(err, 'No se pudo ejecutar la auditoría.'));
      },
    });
  }

  hashCorto(hash: string): string {
    return `${hash.slice(0, 12)}…`;
  }
}