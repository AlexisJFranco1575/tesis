import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth';

// Crea un JWT falso solo con el campo exp (expiración), suficiente para estas pruebas
function crearToken(exp: number): string {
  return `cabecera.${btoa(JSON.stringify({ exp }))}.firma`;
}

describe('AuthService', () => {
  let servicio: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(AuthService);
  });

  afterEach(() => localStorage.clear());

  it('no hay sesión si no existe token', () => {
    expect(servicio.isLoggedIn()).toBe(false);
  });

  it('rechaza un token vencido', () => {
    localStorage.setItem('token', crearToken(1));
    expect(servicio.isLoggedIn()).toBe(false);
  });

  it('acepta un token vigente', () => {
    localStorage.setItem('token', crearToken(Math.floor(Date.now() / 1000) + 3600));
    expect(servicio.isLoggedIn()).toBe(true);
  });

  it('logout elimina token y usuario', () => {
    localStorage.setItem('token', 'x');
    localStorage.setItem('usuario', '{}');
    servicio.logout();
    expect(servicio.getToken()).toBeNull();
    expect(servicio.getUsuario()).toBeNull();
  });
});