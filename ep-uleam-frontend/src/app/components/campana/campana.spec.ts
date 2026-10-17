import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Notificacion } from '../../services/notificacion';
import { CampanaComponent } from './campana';

const notificacionDePrueba: Notificacion = {
  _id: 'n1',
  tipo: 'FLUJO',
  titulo: 'Documento pendiente de revisión',
  mensaje: 'Ana envió a revisión el documento EP-ULEAM-2026-100.',
  documento: 'abc123',
  codigoTramite: 'EP-ULEAM-2026-100',
  leida: false,
  createdAt: '2026-10-17T10:00:00.000Z',
};

describe('CampanaComponent', () => {
  let component: CampanaComponent;
  let fixture: ComponentFixture<CampanaComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampanaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(CampanaComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y la primera consulta
  });

  afterEach(() => fixture.destroy()); // detiene la consulta periódica

  it('muestra el contador de notificaciones sin leer', () => {
    http.expectOne((r) => r.url === `${API_URL}/notificaciones`).flush({ notificaciones: [notificacionDePrueba], noLeidas: 1 });

    expect(component.noLeidas()).toBe(1);
    expect(component.notificaciones().length).toBe(1);
  });

  it('abre y cierra el panel', () => {
    http.expectOne((r) => r.url === `${API_URL}/notificaciones`).flush({ notificaciones: [], noLeidas: 0 });

    component.alternar();
    http.expectOne((r) => r.url === `${API_URL}/notificaciones`).flush({ notificaciones: [], noLeidas: 0 });
    expect(component.abierta()).toBe(true);

    component.cerrar();
    expect(component.abierta()).toBe(false);
  });
});