import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NuevoDocumentoComponent } from './nuevo-documento';

describe('NuevoDocumentoComponent', () => {
  let component: NuevoDocumentoComponent;
  let fixture: ComponentFixture<NuevoDocumentoComponent>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [NuevoDocumentoComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(NuevoDocumentoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function completarDatosBasicos(): void {
    component.formulario.asunto = 'Solicitud de equipos';
    component.formulario.motivo = 'Renovación';
    component.area.set('Contabilidad');
  }

  it('empieza en el modo de redactar en el sistema', () => {
    expect(component.modo()).toBe('redactar');
  });

  it('exige el asunto, el motivo y el área', () => {
    component.guardar();
    expect(component.error()).toBe('Complete el asunto y el motivo.');

    component.formulario.asunto = 'Asunto';
    component.formulario.motivo = 'Motivo';
    component.guardar();
    expect(component.error()).toBe('Seleccione el área del destinatario.');
  });

  it('al redactar exige un contenido de al menos 10 caracteres', () => {
    completarDatosBasicos();
    component.formulario.cuerpo = 'corto';
    component.guardar();
    expect(component.error()).toContain('mínimo 10 caracteres');
  });

  it('al redactar no admite un contenido que supere el límite', () => {
    completarDatosBasicos();
    component.formulario.cuerpo = 'a'.repeat(component.limite + 1);
    component.guardar();
    expect(component.error()).toContain('supera el máximo');
  });

  it('al cargar un archivo exige elegirlo y que sea PDF, Word o Excel', () => {
    completarDatosBasicos();
    component.cambiarModo('archivo');

    component.guardar();
    expect(component.error()).toContain('Seleccione el archivo');

    component.archivo = new File(['texto'], 'nota.txt', { type: 'text/plain' });
    component.guardar();
    expect(component.error()).toContain('PDF, Word');
  });

  it('divide el contenido en párrafos para la vista previa', () => {
    component.formulario.cuerpo = 'Primer párrafo.\n\nSegundo párrafo.\n\n\nTercero.';
    expect(component.parrafos()).toEqual(['Primer párrafo.', 'Segundo párrafo.', 'Tercero.']);
  });

  it('da formato largo a la fecha de la vista previa', () => {
    expect(component.fechaLarga('2026-10-15')).toBe('15 de octubre de 2026');
    expect(component.fechaLarga('')).toBe('');
  });

  it('la vista previa indica que el número se asigna al guardar, o muestra el escrito a mano', () => {
    expect(component.numeroVista()).toBe('se asignará al guardar');

    component.formulario.numeroOficio = ' mem-77 ';
    expect(component.numeroVista()).toBe('MEM-77');
  });

  it('avisa qué tipos de documento necesitan aprobación de Gerencia', () => {
    component.tipo.set('Oficio');
    expect(component.avisoTipo()).toContain('aprobado por Gerencia');

    component.tipo.set('Memorando');
    expect(component.avisoTipo()).toContain('directamente');
  });
});