import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth';

// Crea un JWT falso solo con el campo exp (expiración), suficiente para estas pruebas
function crearToken(exp: number): string {
  return `cabecera.${btoa(JSON.stringify({ exp }))}.firma`;
}

function guardarUsuario(permisos: string[]): void {
  localStorage.setItem(
    'usuario',
    JSON.stringify({
      id: '1',
      nombreCompleto: 'Ana Pérez',
      email: 'ana@uleam.edu.ec',
      departamento: 'TIC',
      roles: ['TIC'],
      rol: 'TIC',
      permisos,
      debeCambiarPassword: false,
    })
  );
}

describe('AuthService', () => {
  let servicio: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

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

  it('evalúa los permisos del usuario', () => {
    guardarUsuario(['usuarios.gestionar', 'documentos.consultar']);

    expect(servicio.tienePermiso('usuarios.gestionar')).toBe(true);
    expect(servicio.tienePermiso('bitacora.consultar')).toBe(false);
    expect(servicio.tieneAlgunPermiso('bitacora.consultar', 'documentos.consultar')).toBe(true);
  });

  it('no falla si el usuario guardado no trae permisos', () => {
    localStorage.setItem('usuario', '{}');
    expect(servicio.tienePermiso('documentos.consultar')).toBe(false);
  });

  it('elige la pantalla de inicio según los permisos', () => {
    guardarUsuario(['documentos.consultar']);
    expect(servicio.rutaInicio()).toBe('/dashboard/documentos');

    guardarUsuario(['usuarios.gestionar']);
    expect(servicio.rutaInicio()).toBe('/dashboard/usuarios');

    guardarUsuario([]);
    expect(servicio.rutaInicio()).toBeNull();
  });

  it('entrega el aviso de login una sola vez', () => {
    servicio.guardarAviso('Sesión cerrada');
    expect(servicio.tomarAviso()).toBe('Sesión cerrada');
    expect(servicio.tomarAviso()).toBe('');
  });
});