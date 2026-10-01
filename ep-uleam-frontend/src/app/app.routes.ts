import { Routes } from '@angular/router';

// Rutas corregidas según tu árbol de directorios
import { LoginComponent } from './components/login/login'; 
import { DashboardComponent } from './components/dashboard/dashboard'; 
import { ListaDocumentos } from './components/lista-documentos/lista-documentos';
import { Trazabilidad } from './components/trazabilidad/trazabilidad';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    children: [
      { path: '', redirectTo: 'documentos', pathMatch: 'full' },
      // Aquí usamos exactamente los nombres que importaste arriba
      { path: 'documentos', component: ListaDocumentos },
      { path: 'auditoria', component: Trazabilidad }
    ]
  },
  { path: '**', redirectTo: 'login' }
];