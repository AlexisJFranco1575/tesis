import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../config';
import { Catalogo, UsuarioAdmin } from '../../services/usuario';
import { UsuariosComponent } from './usuarios';

const catalogoDePrueba: Catalogo = {
  roles: ['Superadmin', 'Secretaría'],
  permisos: { 'documentos.consultar': 'Consultar documentos' },
  permisosPorRol: { Superadmin: ['documentos.consultar'], Secretaría: ['documentos.consultar'] },
};

function usuario(datos: Partial<UsuarioAdmin>): UsuarioAdmin {
  return {
    _id: '1',
    cedula: '0912345678',
    nombres: 'María',
    apellidos: 'Prueba',
    email: 'maria@uleam.edu.ec',
    departamento: 'Secretaría General',
    roles: ['Secretaría'],
    permisos: ['documentos.consultar'],
    permisosExtra: [],
    permisosRetirados: [],
    estado: true,
    fechaBaja: null,
    motivoBaja: '',
    bloqueado: false,
    debeCambiarPassword: false,
    solicitoRecuperacion: false,
    solicitudRecuperacionEn: null,
    ultimoAcceso: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...datos,
  };
}

describe('UsuariosComponent', () => {
  let component: UsuariosComponent;
  let fixture: ComponentFixture<UsuariosComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [UsuariosComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(UsuariosComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit y las peticiones
  });

  function cargarDatos(usuarios: UsuarioAdmin[]): void {
    http.expectOne(`${API_URL}/usuarios`).flush(usuarios);
    http.expectOne(`${API_URL}/usuarios/catalogo`).flush(catalogoDePrueba);
  }

  it('carga los usuarios y el catálogo al iniciar', () => {
    cargarDatos([usuario({})]);

    expect(component.usuarios().length).toBe(1);
    expect(component.roles()).toEqual(['Superadmin', 'Secretaría']);
    expect(component.cargando()).toBe(false);
  });

  it('filtra por texto y por estado', () => {
    cargarDatos([
      usuario({ _id: '1' }),
      usuario({ _id: '2', nombres: 'Luis', email: 'luis@uleam.edu.ec', estado: false }),
    ]);

    component.textoBusqueda.set('luis');
    expect(component.usuariosFiltrados().length).toBe(1);

    component.textoBusqueda.set('');
    component.filtroEstado.set('inactivos');
    expect(component.usuariosFiltrados().length).toBe(1);
    expect(component.usuariosFiltrados()[0]._id).toBe('2');
  });

  it('cuenta las solicitudes de recuperación pendientes', () => {
    cargarDatos([usuario({ _id: '1', solicitoRecuperacion: true }), usuario({ _id: '2' })]);

    expect(component.solicitudesPendientes()).toBe(1);
  });
});