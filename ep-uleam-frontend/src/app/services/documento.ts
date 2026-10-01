import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DocumentoService {
  // Ruta base de tu API en Docker/Local
  private apiUrl = 'http://localhost:3000/api/documentos';

  constructor(private http: HttpClient) { }

  // 1. Obtener todos los documentos
  obtenerDocumentos(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  // 2. Subir/Crear un nuevo documento (generará el hash en el backend)
  crearDocumento(documento: any): Observable<any> {
    return this.http.post(this.apiUrl, documento);
  }

  // 3. Validar que la cadena de custodia (hashes) no esté rota
  verificarIntegridad(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/verificar/${id}`);
  }
}