import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Anexo, Documento, Version } from '../../services/documento';
import { DetalleDocumentoComponent } from './detalle-documento';

const documentoDePrueba: Documento = {
  _id: 'abc123',
  codigoTramite: 'EP-ULEAM-2026-0001',
  numeroOficio: 'OF-2026-001',
  fechaOficio: '2026-10-15T00:00:00.000Z',
  motivo: 'Requerimiento del cuarto trimestre',
  observacion: '',
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
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

const versionDePrueba: Version = {
  numero: 1,
  nombreOriginal: 'oficio.pdf',
  tamanoBytes: 2048,
  hashArchivo: 'a'.repeat(64),
  comentario: 'Versión inicial',
  creadoPor: { id: '1', nombre: 'Admin Sistema' },
  createdAt: '2026-10-15T10:00:00.000Z',
  esActual: true,
};

const anexoDePrueba: Anexo = {
  _id: 'anx1',
  nombreOriginal: 'factura.png',
  extension: '.png',
  tamanoBytes: 135,
  hashArchivo: 'b'.repeat(64),
  tipoAnexo: 'Factura',
  descripcion: 'Factura del proveedor',
  creadoPor: { id: '1', nombre: 'Admin Sistema' },
  createdAt: '2026-10-15T10:05:00.000Z',
};

describe('DetalleDocumentoComponent', () => {
  let component: DetalleDocumentoComponent;
  let fixture: ComponentFixture<DetalleDocumentoComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear(); // sin usuario: sin permisos, no se pide la bitácora

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

  function cargarTodo(anexos: Anexo[] = []): void {
    http.expectOne(`${API_URL}/documentos/abc123`).flush(documentoDePrueba);
    http.expectOne(`${API_URL}/documentos/abc123/versiones`).flush([versionDePrueba]);
    http.expectOne(`${API_URL}/documentos/abc123/anexos`).flush(anexos);
  }

  it('carga el documento, sus versiones y sus anexos', () => {
    cargarTodo([anexoDePrueba]);

    expect(component.documento()?.codigoTramite).toBe('EP-ULEAM-2026-0001');
    expect(component.versiones().length).toBe(1);
    expect(component.anexos().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('formatea el tamaño de los archivos', () => {
    cargarTodo();

    expect(component.formatearTamano(2048)).toBe('2.0 KB');
    expect(component.formatearTamano(0)).toBe('—');
  });

  it('solo permite abrir en pantalla los formatos visibles', () => {
    cargarTodo();

    expect(component.puedeVerAnexo(anexoDePrueba)).toBe(true);
    expect(component.puedeVerAnexo({ ...anexoDePrueba, extension: '.docx' })).toBe(false);
  });

  it('valida la carga de anexos antes de enviarla', () => {
    cargarTodo();

    component.guardarAnexos();
    expect(component.errorAnexos()).toBe('Seleccione al menos un archivo.');

    const demasiados = Array.from({ length: 11 }, (_, i) => new File(['x'], `a${i}.pdf`));
    component.archivosAnexo.set(demasiados);
    component.guardarAnexos();
    expect(component.errorAnexos()).toContain('hasta 10 archivos');
  });
});