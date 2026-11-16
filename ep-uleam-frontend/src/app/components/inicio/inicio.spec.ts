import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Estadisticas } from '../../services/estadisticas';
import { InicioComponent } from './inicio';

const estadisticas: Estadisticas = {
  alcance: 'personal',
  totales: { documentos: 5, enRevision: 1, rechazados: 0, bloqueados: 0, confidenciales: 0 },
  porEstado: [
    { clave: 'Generado', total: 2 },
    { clave: 'Distribuido', total: 3 },
  ],
  porTipo: [{ clave: 'Memorando', total: 5 }],
  porArea: [{ clave: 'Secretaría General', total: 5 }],
  porMes: [
    { mes: '2026-06', total: 0 },
    { mes: '2026-07', total: 0 },
    { mes: '2026-08', total: 1 },
    { mes: '2026-09', total: 0 },
    { mes: '2026-10', total: 4 },
    { mes: '2026-11', total: 0 },
  ],
  tramite: { recibidosSinLeer: 2, vencidos: 0, informadosSinLeer: 0, tiempoMedioLecturaHoras: 5 },
};

describe('InicioComponent', () => {
  let component: InicioComponent;
  let fixture: ComponentFixture<InicioComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [InicioComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InicioComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${API_URL}/estadisticas`).flush(estadisticas);
  });

  it('carga los indicadores al iniciar', () => {
    expect(component.datos()?.totales.documentos).toBe(5);
    expect(component.cargando()).toBe(false);
  });

  it('calcula el largo de las barras respecto del máximo, sin dejar invisibles las que tienen valor', () => {
    expect(component.maxEstado()).toBe(3);
    expect(component.porcentaje(3, 3)).toBe(100);
    expect(component.porcentaje(0, 3)).toBe(0);
    expect(component.porcentaje(1, 1000)).toBe(4);
  });

  it('da formato al mes y al tiempo medio', () => {
    expect(component.etiquetaMes('2026-10')).toBe('oct 2026');
    expect(component.tiempoMedio(null)).toBe('—');
    expect(component.tiempoMedio(0.5)).toBe('30 min');
    expect(component.tiempoMedio(5)).toBe('5 h');
    expect(component.tiempoMedio(72)).toBe('3 días');
  });
});