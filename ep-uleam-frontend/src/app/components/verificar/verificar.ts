import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ComprobacionHash, PublicoService, RespuestaVerificacion } from '../../services/publico';

// Convierte el resultado de SHA-256 en el texto hexadecimal de 64 caracteres
export const aHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

type Estado = 'cargando' | 'valido' | 'invalido' | 'error';

// Página pública: se abre desde el código QR de un documento. No requiere iniciar sesión.
// El archivo NO se sube al servidor: su hash SHA-256 se calcula en el navegador y solo se envía ese valor.
@Component({
  selector: 'app-verificar',
  standalone: true,
  imports: [DatePipe],
  styleUrl: './verificar.css',
  templateUrl: './verificar.html',
})
export class VerificarComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private servicio = inject(PublicoService);

  readonly codigo = this.route.snapshot.paramMap.get('codigo') ?? '';
  private readonly clave = this.route.snapshot.queryParamMap.get('k') ?? '';

  // Calcular el hash en el navegador requiere una conexión segura (HTTPS) o localhost
  readonly soportaHash = typeof crypto !== 'undefined' && !!crypto.subtle;

  estado = signal<Estado>('cargando');
  info = signal<RespuestaVerificacion | null>(null);

  nombreArchivo = signal('');
  calculando = signal(false);
  hashCalculado = signal('');
  comprobacion = signal<ComprobacionHash | null>(null);
  errorArchivo = signal('');

  ngOnInit(): void {
    this.servicio.verificar(this.codigo, this.clave).subscribe({
      next: (respuesta) => {
        this.info.set(respuesta);
        this.estado.set('valido');
      },
      error: (err) => this.estado.set(err?.status === 404 || err?.status === 400 ? 'invalido' : 'error'),
    });
  }

  async alElegirArchivo(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) {
      return;
    }

    this.errorArchivo.set('');
    this.comprobacion.set(null);
    this.hashCalculado.set('');
    this.nombreArchivo.set(archivo.name);
    this.calculando.set(true);

    try {
      const hash = aHex(await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer()));
      this.hashCalculado.set(hash);

      this.servicio.verificar(this.codigo, this.clave, hash).subscribe({
        next: (respuesta) => {
          this.comprobacion.set(respuesta.comprobacion ?? null);
          this.calculando.set(false);
        },
        error: () => {
          this.errorArchivo.set('No se pudo completar la comprobación. Intente nuevamente.');
          this.calculando.set(false);
        },
      });
    } catch {
      this.errorArchivo.set('No se pudo leer el archivo seleccionado.');
      this.calculando.set(false);
    }
  }
}