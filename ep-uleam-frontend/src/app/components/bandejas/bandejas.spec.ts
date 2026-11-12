import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_URL } from '../../config';
import { FilaBandeja, TramiteService, semaforoDePlazo } from '../../services/tramite';
import { BandejasComponent } from './bandejas';

const fila: FilaBandeja = {
  _id: 't1',
  tramite: 't1',
  documentoId: 'd1',
  codigoTramite: 'EP-ULEAM-2026-0001',
  asunto: 'Solicitud de presupuesto',
  tipoDocumento: 'Memorando',
  prioridad: 'Urgente',
  confidencial: false,
  estadoDocumento: 'Distribuido',
  bloqueado: false,
  de: { id: 'u1', nombre: 'Ana Mora', departamento: 'Secretaría General' },
  tipo: 'para',
  estado: 'pendiente',
  sinLeer: true,
  fechaLimite: null,
  vencido: false,
  comentario: '',
  comentarioArchivo: '',
  fecha: '2026-11-10T10:00:00.000Z',
};

describe('BandejasComponent', () => {
  let component: BandejasComponent;
  let fixture: ComponentFixture<BandejasComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [BandejasComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ bandeja: 'recibidos' })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BandejasComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y la primera carga
  });

  function cargar(items: FilaBandeja[]): void {
    http
      .expectOne((r) => r.url === `${API_URL}/tramites` && r.params.get('bandeja') === 'recibidos')
      .flush({ bandeja: 'recibidos', items });
  }

  it('carga la bandeja indicada en la ruta', () => {
    cargar([fila]);

    expect(component.bandeja().clave).toBe('recibidos');
    expect(component.items().length).toBe(1);
    expect(component.cargando()).toBe(false);
  });

  it('muestra el número de documentos sin leer en las pestañas', () => {
    cargar([fila]);
    TestBed.inject(TramiteService).resumenActual.set({
      elaboracion: { total: 0 },
      recibidos: { total: 3, sinLeer: 2, vencidos: 1 },
      enviados: { total: 5 },
      informados: { total: 0, sinLeer: 0 },
      reasignados: { total: 0 },
      archivados: { total: 0 },
    });

    expect(component.contador('recibidos')).toEqual({ valor: 2, destacar: true });
    expect(component.contador('enviados')).toEqual({ valor: 5, destacar: false });
    expect(component.contador('informados')).toBeNull();
    expect(component.vencidos()).toBe(1);
  });

  it('nombra la columna de origen según la bandeja', () => {
    cargar([fila]);
    expect(component.columnaOrigen()).toBe('De');
  });
});

describe('semaforoDePlazo', () => {
  const enDias = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString();

  it('marca en rojo un plazo vencido', () => {
    expect(semaforoDePlazo(enDias(-2)).clase).toBe('vencido');
  });

  it('marca en ámbar un plazo que vence pronto', () => {
    expect(semaforoDePlazo(enDias(2)).clase).toBe('proximo');
  });

  it('marca en verde un plazo holgado', () => {
    expect(semaforoDePlazo(enDias(10)).clase).toBe('ok');
  });

  it('no alerta si el trámite ya fue atendido o no tiene plazo', () => {
    expect(semaforoDePlazo(enDias(-2), 'archivado').clase).toBe('sin');
    expect(semaforoDePlazo(null).clase).toBe('sin');
  });
});