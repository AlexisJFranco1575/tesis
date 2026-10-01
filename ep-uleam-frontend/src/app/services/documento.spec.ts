import { TestBed } from '@angular/core/testing';
import { Documento } from './documento';

describe('Documento', () => {
  let service: Documento;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Documento);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
