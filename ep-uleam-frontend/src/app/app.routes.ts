import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { CambiarPasswordComponent } from './components/cambiar-password/cambiar-password';
import { DashboardComponent } from './components/dashboard/dashboard';
import { ListaDocumentosComponent } from './components/lista-documentos/lista-documentos';
import { DetalleDocumentoComponent } from './components/detalle-documento/detalle-documento';
import { UsuariosComponent } from './components/usuarios/usuarios';
import { TrazabilidadComponent } from './components/trazabilidad/trazabilidad';
import { authGuard, sesionGuard } from './guards/auth.guard';
import { inicioGuard, permisoGuard } from './guards/permiso.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'cambiar-password', component: CambiarPasswordComponent, canActivate: [sesionGuard] },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [inicioGuard], children: [] },
      { path: 'documentos', component: ListaDocumentosComponent, canActivate: [permisoGuard('documentos.consultar')] },
      { path: 'documentos/:id', component: DetalleDocumentoComponent, canActivate: [permisoGuard('documentos.consultar')] },
      {
        path: 'usuarios',
        component: UsuariosComponent,
        canActivate: [permisoGuard('usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar')]
      },
      { path: 'auditoria', component: TrazabilidadComponent, canActivate: [permisoGuard('bitacora.consultar')] }
    ]
  },
  { path: '**', redirectTo: 'login' }
];