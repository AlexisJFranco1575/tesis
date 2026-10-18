import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../config';
import { Documento } from '../../services/documento';
import { ListaDocumentosComponent } from './lista-documentos';

const documentoDePrueba: Documento = {
  _id: '1',
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

const otroDocumento: Documento = {
  ...documentoDePrueba,
  _id: '2',
  codigoTramite: 'EP-ULEAM-2026-0002',
  numeroOficio: 'MEM-2026-007',
  fechaOficio: '2026-09-01T00:00:00.000Z',
  tipoDocumento: 'Memorando',
  asunto: 'Informe de requerimientos',
  motivo: 'Renovación de equipos',
  remitente: { nombre: 'Luis', departamento: 'Contabilidad' },
  destinatario: { nombre: 'Ana', departamento: 'Secretaría General' },
  estado: 'Aprobado',
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

  function cargar(documentos: Documento[]): void {
    http.expectOne(`${API_URL}/documentos`).flush(documentos);
  }

  it('carga los documentos al iniciar', () => {
    cargar([documentoDePrueba]);

    expect(component.documentos().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('filtra por texto sin importar tildes ni mayúsculas', () => {
    cargar([documentoDePrueba, otroDocumento]);

    component.textoBusqueda.set('no-existe');
    expect(component.documentosFiltrados().length).toBe(0);

    component.textoBusqueda.set('APROBACION');
    expect(component.documentosFiltrados().length).toBe(1);

    component.textoBusqueda.set('mem-2026-007'); // número de oficio
    expect(component.documentosFiltrados()[0]._id).toBe('2');
  });

  it('combina varios criterios a la vez', () => {
    cargar([documentoDePrueba, otroDocumento]);

    component.filtroTipo.set('Memorando');
    expect(component.documentosFiltrados().length).toBe(1);

    component.filtroEstado.set('Generado'); // el memorando está Aprobado: ya no coincide
    expect(component.documentosFiltrados().length).toBe(0);
  });

  it('busca por departamento del remitente o del destinatario', () => {
    cargar([documentoDePrueba, otroDocumento]);

    component.filtroDepartamento.set('Secretaría General'); // solo destinatario del segundo
    expect(component.documentosFiltrados().length).toBe(1);

    component.filtroDepartamento.set('TIC'); // solo remitente del primero
    expect(component.documentosFiltrados()[0]._id).toBe('1');
  });

  it('filtra por rango de fechas del oficio', () => {
    cargar([documentoDePrueba, otroDocumento]);

    component.fechaDesde.set('2026-10-01');
    expect(component.documentosFiltrados().length).toBe(1);

    component.fechaDesde.set('');
    component.fechaHasta.set('2026-09-30');
    expect(component.documentosFiltrados()[0]._id).toBe('2');
  });

  it('limpia todos los filtros', () => {
    cargar([documentoDePrueba, otroDocumento]);

    component.textoBusqueda.set('presupuesto');
    component.filtroTipo.set('Oficio');
    expect(component.hayFiltros()).toBe(true);

    component.limpiarFiltros();
    expect(component.hayFiltros()).toBe(false);
    expect(component.documentosFiltrados().length).toBe(2);
  });
});