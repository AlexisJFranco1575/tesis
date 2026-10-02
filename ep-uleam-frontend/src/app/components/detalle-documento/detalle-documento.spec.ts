import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Documento, Version } from '../../services/documento';
import { DetalleDocumentoComponent } from './detalle-documento';

const documentoDePrueba: Documento = {
  _id: 'abc123',
  codigoTramite: 'EP-ULEAM-2026-001',
  tipoDocumento: 'Oficio',
  asunto: 'Aprobación de presupuesto',
  remitente: { nombre: 'Admin Sistema', departamento: 'TIC' },
  destinatario: { nombre: 'Gerencia', departamento: 'Gerencia General' },
  estado: 'Generado',
  versionActual: 1,
  hashActual: 'a'.repeat(64),
  bloqueado: false,
  motivoBloqueo: '',
  creadoPor: { id: '1', nombre: 'Admin Sistema' },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const versionDePrueba: Version = {
  numero: 1,
  nombreOriginal: 'oficio.pdf',
  tamanoBytes: 2048,
  hashArchivo: 'a'.repeat(64),
  comentario: 'Versión inicial',
  creadoPor: { id: '1', nombre: 'Admin Sistema' },
  createdAt: '2026-10-01T10:00:00.000Z',
  esActual: true,
};

describe('DetalleDocumentoComponent', () => {
  let component: DetalleDocumentoComponent;
  let fixture: ComponentFixture<DetalleDocumentoComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear(); // sin usuario: no es rol de control, no se pide la bitácora

    await TestBed.configureTestingModule({
      imports: [DetalleDocumentoComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'abc123' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DetalleDocumentoComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y las peticiones
  });

  it('carga el documento y sus versiones', () => {
    http.expectOne(`${API_URL}/documentos/abc123`).flush(documentoDePrueba);
    http.expectOne(`${API_URL}/documentos/abc123/versiones`).flush([versionDePrueba]);

    expect(component.documento()?.codigoTramite).toBe('EP-ULEAM-2026-001');
    expect(component.versiones().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('formatea el tamaño de los archivos', () => {
    http.expectOne(`${API_URL}/documentos/abc123`).flush(documentoDePrueba);
    http.expectOne(`${API_URL}/documentos/abc123/versiones`).flush([]);

    expect(component.formatearTamano(2048)).toBe('2.0 KB');
    expect(component.formatearTamano(0)).toBe('—');
  });
});