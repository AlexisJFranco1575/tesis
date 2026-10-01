import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListaDocumentos } from './lista-documentos';

describe('ListaDocumentos', () => {
  let component: ListaDocumentos;
  let fixture: ComponentFixture<ListaDocumentos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListaDocumentos],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaDocumentos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
