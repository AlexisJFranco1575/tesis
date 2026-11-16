import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { CambiarPasswordComponent } from './components/cambiar-password/cambiar-password';
import { DashboardComponent } from './components/dashboard/dashboard';
import { InicioComponent } from './components/inicio/inicio';
import { BandejasComponent } from './components/bandejas/bandejas';
import { NuevoDocumentoComponent } from './components/nuevo-documento/nuevo-documento';
import { ListaDocumentosComponent } from './components/lista-documentos/lista-documentos';
import { DetalleDocumentoComponent } from './components/detalle-documento/detalle-documento';
import { ReportesComponent } from './components/reportes/reportes';
import { UsuariosComponent } from './components/usuarios/usuarios';
import { RolesComponent } from './components/roles/roles';
import { AreasComponent } from './components/areas/areas';
import { TrazabilidadComponent } from './components/trazabilidad/trazabilidad';
import { VerificarComponent } from './components/verificar/verificar';
import { authGuard, sesionGuard } from './guards/auth.guard';
import { inicioGuard, permisoGuard } from './guards/permiso.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  // Verificación pública de autenticidad: se abre desde el código QR, sin iniciar sesión
  { path: 'verificar/:codigo', component: VerificarComponent },
  { path: 'cambiar-password', component: CambiarPasswordComponent, canActivate: [sesionGuard] },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [inicioGuard], children: [] },
      { path: 'inicio', component: InicioComponent, canActivate: [permisoGuard('documentos.consultar')] },
      { path: 'bandejas', pathMatch: 'full', redirectTo: 'bandejas/recibidos' },
      { path: 'bandejas/:bandeja', component: BandejasComponent, canActivate: [permisoGuard('documentos.consultar')] },
      { path: 'documentos/nuevo', component: NuevoDocumentoComponent, canActivate: [permisoGuard('documentos.registrar')] },
      { path: 'documentos', component: ListaDocumentosComponent, canActivate: [permisoGuard('documentos.consultar')] },
      { path: 'documentos/:id', component: DetalleDocumentoComponent, canActivate: [permisoGuard('documentos.consultar')] },
      { path: 'reportes', component: ReportesComponent, canActivate: [permisoGuard('documentos.consultar')] },
      {
        path: 'usuarios',
        component: UsuariosComponent,
        canActivate: [permisoGuard('usuarios.gestionar', 'roles.gestionar', 'permisos.gestionar')]
      },
      { path: 'roles', component: RolesComponent, canActivate: [permisoGuard('roles.gestionar')] },
      { path: 'areas', component: AreasComponent, canActivate: [permisoGuard('areas.gestionar')] },
      { path: 'auditoria', component: TrazabilidadComponent, canActivate: [permisoGuard('bitacora.consultar')] }
    ]
  },
  { path: '**', redirectTo: 'login' }
];