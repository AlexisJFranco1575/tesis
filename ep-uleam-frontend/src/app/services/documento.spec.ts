import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../config';
import { DocumentoService, claseAccion, etiquetaAccion, mensajeDeError } from './documento';

describe('DocumentoService', () => {
  let servicio: DocumentoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(DocumentoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('obtiene la lista de documentos', () => {
    let total = -1;
    servicio.obtenerDocumentos().subscribe((docs) => (total = docs.length));

    http.expectOne(`${API_URL}/documentos`).flush([]);
    expect(total).toBe(0);
  });

  it('lista las versiones de un documento', () => {
    let total = -1;
    servicio.listarVersiones('abc').subscribe((v) => (total = v.length));

    http.expectOne(`${API_URL}/documentos/abc/versiones`).flush([]);
    expect(total).toBe(0);
  });

  it('ejecuta la auditoría general con POST', () => {
    servicio.ejecutarAuditoria().subscribe();

    const peticion = http.expectOne(`${API_URL}/bitacora/auditoria`);
    expect(peticion.request.method).toBe('POST');
    peticion.flush({});
  });
});

describe('Ayudas de documento', () => {
  it('traduce las acciones de la bitácora', () => {
    expect(etiquetaAccion('NUEVA_VERSION')).toBe('Nueva versión');
    expect(etiquetaAccion('ACCION_DESCONOCIDA')).toBe('ACCION_DESCONOCIDA');
  });

  it('asigna color según la acción', () => {
    expect(claseAccion('ALERTA_ALTERACION')).toBe('alerta');
    expect(claseAccion('VERIFICACION_INTEGRIDAD')).toBe('ok');
    expect(claseAccion('NUEVA_VERSION')).toBe('neutra');
  });

  it('lee el mensaje de error aunque llegue como blob', async () => {
    const blob = new Blob([JSON.stringify({ mensaje: 'Documento bloqueado' })], { type: 'application/json' });
    const mensaje = await mensajeDeError({ status: 423, error: blob }, 'por defecto');
    expect(mensaje).toBe('Documento bloqueado');
  });

  it('usa el mensaje por defecto si no hay detalle', async () => {
    expect(await mensajeDeError({ status: 500, error: null }, 'por defecto')).toBe('por defecto');
  });
});