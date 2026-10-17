import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    localStorage.setItem(
      'usuario',
      JSON.stringify({
        id: '1',
        nombreCompleto: 'Alexis Franco',
        email: 'alexis@uleam.edu.ec',
        departamento: 'TIC',
        roles: ['TIC'],
        rol: 'TIC',
        permisos: ['documentos.consultar', 'usuarios.gestionar'],
        debeCambiarPassword: false,
      })
    );

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy(); // detiene el control de inactividad
    localStorage.clear();
  });

  it('debería crearse', () => {
    expect(component).toBeTruthy();
  });

  it('calcula las iniciales del usuario', () => {
    expect(component.iniciales()).toBe('AF');
  });

  it('muestra solo las opciones del menú permitidas por los permisos', () => {
    expect(component.verDocumentos()).toBe(true);
    expect(component.verUsuarios()).toBe(true);
    expect(component.verBitacora()).toBe(false);
  });
});