import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { VerificarComponent, aHex } from './verificar';

describe('aHex', () => {
  it('convierte bytes en hexadecimal con ceros a la izquierda', () => {
    expect(aHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
  });
});

describe('VerificarComponent', () => {
  let component: VerificarComponent;
  let fixture: ComponentFixture<VerificarComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerificarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ codigo: 'EP-ULEAM-2026-0001' }),
              queryParamMap: convertToParamMap({ k: 'abc123abc123' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VerificarComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  const consulta = () =>
    http.expectOne((r) => r.url === `${API_URL}/publico/verificar/EP-ULEAM-2026-0001` && r.params.get('k') === 'abc123abc123');

  it('consulta el documento con el código y la clave del enlace', () => {
    consulta().flush({ existe: true, confidencial: false });

    expect(component.estado()).toBe('valido');
    expect(component.info()?.existe).toBe(true);
  });

  it('muestra "no encontrado" cuando el enlace no es válido', () => {
    consulta().flush({ existe: false, mensaje: 'No encontrado' }, { status: 404, statusText: 'Not Found' });

    expect(component.estado()).toBe('invalido');
  });

  it('distingue un error de conexión de un documento inexistente', () => {
    consulta().flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.estado()).toBe('error');
  });
});