import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Documento } from '../../services/documento';
import { ListaDocumentosComponent } from './lista-documentos';

const documentoDePrueba: Documento = {
  _id: '1',
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

describe('ListaDocumentosComponent', () => {
  let component: ListaDocumentosComponent;
  let fixture: ComponentFixture<ListaDocumentosComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListaDocumentosComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaDocumentosComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y la petición
  });

  it('carga los documentos al iniciar', () => {
    http.expectOne(`${API_URL}/documentos`).flush([documentoDePrueba]);

    expect(component.documentos().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('filtra por texto de búsqueda', () => {
    http.expectOne(`${API_URL}/documentos`).flush([documentoDePrueba]);

    component.textoBusqueda.set('no-existe');
    expect(component.documentosFiltrados().length).toBe(0);

    component.textoBusqueda.set('presupuesto');
    expect(component.documentosFiltrados().length).toBe(1);
  });
});