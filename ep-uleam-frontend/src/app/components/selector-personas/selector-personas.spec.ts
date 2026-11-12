import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DirectorioService } from '../../services/directorio';
import { SelectorPersonasComponent } from './selector-personas';

describe('SelectorPersonasComponent', () => {
  let component: SelectorPersonasComponent;
  let fixture: ComponentFixture<SelectorPersonasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectorPersonasComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectorPersonasComponent);
    component = fixture.componentInstance;

    TestBed.inject(DirectorioService).personas.set([
      { id: '1', nombre: 'José Pérez', departamento: 'Contabilidad' },
      { id: '2', nombre: 'Ana Mora', departamento: 'Tesorería' },
      { id: '3', nombre: 'Luis Vera', departamento: 'Contabilidad' },
    ]);
    fixture.detectChanges();
  });

  it('busca sin importar tildes ni mayúsculas', () => {
    component.texto.set('JOSE');
    expect(component.visibles().map((p) => p.id)).toEqual(['1']);
  });

  it('filtra por área', () => {
    component.area.set('Contabilidad');
    expect(component.visibles().length).toBe(2);
  });

  it('no ofrece a las personas excluidas', () => {
    fixture.componentRef.setInput('excluir', ['2']);
    expect(component.visibles().some((p) => p.id === '2')).toBe(false);
  });

  it('agrega y quita personas de la selección', () => {
    component.alternar('1');
    component.alternar('3');
    expect(component.elegidas().map((p) => p.id)).toEqual(['1', '3']);

    component.quitar('1');
    expect(component.seleccion()).toEqual(['3']);
  });
});