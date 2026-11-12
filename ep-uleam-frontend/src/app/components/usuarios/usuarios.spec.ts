import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../config';
import { Area } from '../../services/area';
import { Catalogo, UsuarioAdmin } from '../../services/usuario';
import { UsuariosComponent } from './usuarios';

const catalogoDePrueba: Catalogo = {
  roles: ['Superadmin', 'Gerencia', 'Funcionario'],
  rolesInfo: {
    Superadmin: { descripcion: 'Administra todo', protegido: true },
    Gerencia: { descripcion: 'Máxima autoridad', protegido: true },
    Funcionario: { descripcion: 'Personal de cualquier área', protegido: false },
  },
  permisos: { 'documentos.consultar': 'Consultar documentos', 'documentos.aprobar': 'Aprobar documentos' },
  permisosSensibles: ['documentos.aprobar'],
  permisosPorRol: { Superadmin: [], Gerencia: [], Funcionario: ['documentos.consultar'] },
};

const areasDePrueba: Area[] = [
  { _id: 'a1', nombre: 'Gerencia General', siglas: 'GG', tipo: 'area', padre: null, activa: true, nivel: 0, ruta: 'Gerencia General' },
  { _id: 'a2', nombre: 'Contabilidad', siglas: 'CONT', tipo: 'area', padre: 'a1', activa: true, nivel: 1, ruta: 'Gerencia General / Contabilidad' },
];

function usuario(datos: Partial<UsuarioAdmin>): UsuarioAdmin {
  return {
    _id: '1',
    cedula: '0912345678',
    nombres: 'María',
    apellidos: 'Prueba',
    email: 'maria@uleam.edu.ec',
    departamento: 'Contabilidad',
    roles: ['Funcionario'],
    permisos: ['documentos.consultar'],
    permisosExtra: [],
    permisosRetirados: [],
    estado: true,
    fechaBaja: null,
    motivoBaja: '',
    bloqueado: false,
    bloqueadoHasta: null,
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
    http.expectOne(`${API_URL}/areas`).flush(areasDePrueba);
  }

  it('carga usuarios, catálogo y áreas al iniciar', () => {
    cargarDatos([usuario({})]);

    expect(component.usuarios().length).toBe(1);
    expect(component.roles()).toEqual(['Superadmin', 'Gerencia', 'Funcionario']);
    expect(component.areas().length).toBe(2);
    expect(component.cargando()).toBe(false);
  });

  it('muestra cada rol con su descripción y marca los protegidos', () => {
    cargarDatos([]);

    const roles = component.rolesDisponibles();
    expect(roles.find((r) => r.nombre === 'Gerencia')?.protegido).toBe(true);
    expect(roles.find((r) => r.nombre === 'Funcionario')?.descripcion).toBe('Personal de cualquier área');
  });

  it('quien no es Superadmin no puede asignar roles protegidos', () => {
    cargarDatos([]);

    expect(component.soySuperadmin).toBe(false);
    component.alternarRol({ nombre: 'Gerencia', protegido: true });
    expect(component.rolesSel()).toEqual([]);

    component.alternarRol({ nombre: 'Funcionario', protegido: false });
    expect(component.rolesSel()).toEqual(['Funcionario']);
  });

  it('arma la lista de áreas con sangría según el nivel', () => {
    cargarDatos([]);

    expect(component.opcionesArea().map((o) => o.etiqueta)).toEqual(['Gerencia General', '— Contabilidad']);
  });

  it('filtra por texto y por estado, y cuenta bloqueadas y solicitudes', () => {
    cargarDatos([
      usuario({ _id: '1' }),
      usuario({ _id: '2', nombres: 'Luis', email: 'luis@uleam.edu.ec', estado: false }),
      usuario({ _id: '3', nombres: 'Ana', bloqueado: true, solicitoRecuperacion: true }),
    ]);

    component.textoBusqueda.set('luis');
    expect(component.usuariosFiltrados().length).toBe(1);

    component.textoBusqueda.set('');
    component.filtroEstado.set('bloqueados');
    expect(component.usuariosFiltrados()[0]._id).toBe('3');

    expect(component.bloqueadas()).toBe(1);
    expect(component.solicitudesPendientes()).toBe(1);
  });
});