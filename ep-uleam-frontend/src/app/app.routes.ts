import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { ListaDocumentosComponent } from './components/lista-documentos/lista-documentos';
import { DetalleDocumentoComponent } from './components/detalle-documento/detalle-documento';
import { TrazabilidadComponent } from './components/trazabilidad/trazabilidad';
import { authGuard } from './guards/auth.guard';
import { controlGuard } from './guards/control.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'documentos', pathMatch: 'full' },
      { path: 'documentos', component: ListaDocumentosComponent },
      { path: 'documentos/:id', component: DetalleDocumentoComponent },
      { path: 'auditoria', component: TrazabilidadComponent, canActivate: [controlGuard] }
    ]
  },
  { path: '**', redirectTo: 'login' }
];