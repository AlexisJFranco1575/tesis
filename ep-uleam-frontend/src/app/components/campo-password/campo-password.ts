import { Component, input, model, signal } from '@angular/core';

// Campo de contraseña con botón para mostrarla u ocultarla y aviso de Bloq Mayús.
// Uso: <app-campo-password [(valor)]="datos.password" autocompletar="current-password" />
@Component({
  selector: 'app-campo-password',
  standalone: true,
  templateUrl: './campo-password.html',
  styleUrl: './campo-password.css',
})
export class CampoPasswordComponent {
  valor = model('');
  nombre = input('password');
  marcador = input('••••••••');
  autocompletar = input('current-password');
  icono = input('🔒');

  visible = signal(false);
  mayusculas = signal(false);

  alternar(): void {
    this.visible.update((v) => !v);
  }

  alEscribir(evento: Event): void {
    this.valor.set((evento.target as HTMLInputElement).value);
  }

  revisarTeclas(evento: KeyboardEvent): void {
    this.mayusculas.set(evento.getModifierState?.('CapsLock') ?? false);
  }

  alSalir(): void {
    this.mayusculas.set(false);
  }
}