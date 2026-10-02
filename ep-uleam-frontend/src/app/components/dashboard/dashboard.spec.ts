import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    localStorage.setItem(
      'usuario',
      JSON.stringify({
        id: '1',
        nombreCompleto: 'Alexis Franco',
        rol: 'Administrador',
        departamento: 'TIC',
      })
    );

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('debería crearse', () => {
    expect(component).toBeTruthy();
  });

  it('calcula las iniciales del usuario', () => {
    expect(component.iniciales).toBe('AF');
  });
});