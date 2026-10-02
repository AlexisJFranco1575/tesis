import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { EntradaBitacora } from '../../services/documento';
import { TrazabilidadComponent } from './trazabilidad';

const entradaDePrueba: EntradaBitacora = {
  _id: 'e1',
  fecha: '2026-10-01T10:00:00.000Z',
  accion: 'REGISTRO_DOCUMENTO',
  documento: 'abc123',
  codigoTramite: 'EP-ULEAM-2026-001',
  usuario: { id: '1', nombre: 'Admin Sistema', rol: 'Administrador' },
  detalle: 'Versión 1',
  hashAnterior: '0'.repeat(64),
  hashActual: 'b'.repeat(64),
};

describe('TrazabilidadComponent', () => {
  let component: TrazabilidadComponent;
  let fixture: ComponentFixture<TrazabilidadComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrazabilidadComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(TrazabilidadComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y la petición
  });

  it('carga la bitácora al iniciar', () => {
    http.expectOne((r) => r.url === `${API_URL}/bitacora`).flush([entradaDePrueba]);

    expect(component.entradas().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('filtra por acción', () => {
    http.expectOne((r) => r.url === `${API_URL}/bitacora`).flush([entradaDePrueba]);

    component.filtroAccion.set('NUEVA_VERSION');
    expect(component.entradasFiltradas().length).toBe(0);

    component.filtroAccion.set('REGISTRO_DOCUMENTO');
    expect(component.entradasFiltradas().length).toBe(1);
  });
});