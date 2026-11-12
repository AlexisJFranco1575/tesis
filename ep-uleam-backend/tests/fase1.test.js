const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');
const Usuario = require('../src/models/Usuario');

const { api, nuevoUsuario, usuarioListo, registrarDocumento, cambiarEstado, EMAIL_ADMIN } = ayudas;

describe('Fase 1: bloqueo temporal, desbloqueo, roles y pendientes', () => {
    let admin;
    let tic;
    let contador = 0;

    const fallar = async (email, veces = 3) => {
        for (let i = 0; i < veces; i += 1) {
            await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: 'incorrecta1' } });
        }
    };

    const entrarCon = (email, password) => api('/auth/login', { metodo: 'POST', cuerpo: { email, password } });

    const crearComoTic = (roles) => {
        contador += 1;
        return api('/usuarios', {
            metodo: 'POST',
            token: tic.token,
            cuerpo: {
                cedula: String(7000000000 + contador),
                nombres: 'Nuevo',
                apellidos: `Usuario${contador}`,
                email: `nuevo${contador}@uleam.edu.ec`,
                departamento: 'Contabilidad',
                roles,
                password: 'Temporal123'
            }
        });
    };

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        tic = await usuarioListo(admin.token, { departamento: 'Tecnologías de la Información', roles: ['TIC'] });
    });

    after(async () => {
        await ayudas.detener();
    });

    // ---------- Bloqueo temporal ----------

    it('el mensaje de bloqueo indica cuánto falta para el desbloqueo automático', async () => {
        const u = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await fallar(u.email);

        const r = await entrarCon(u.email, u.clave);
        assert.equal(r.estado, 423);
        assert.match(r.datos.mensaje, /automáticamente en \d+ minuto/);
        assert.ok(r.datos.bloqueadoHasta);
    });

    it('el bloqueo se levanta solo al cumplirse el tiempo y queda en la bitácora', async () => {
        const u = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await fallar(u.email);

        // Se simula que pasaron 16 minutos desde el bloqueo
        await Usuario.updateOne({ email: u.email }, { bloqueadoEn: new Date(Date.now() - 16 * 60 * 1000) });

        const r = await entrarCon(u.email, u.clave);
        assert.equal(r.estado, 200);

        const bitacora = await api('/bitacora?limite=50', { token: admin.token });
        assert.ok(bitacora.datos.some((e) => e.accion === 'CUENTA_DESBLOQUEADA'));
    });

    it('un bloqueo antiguo sin fecha (anterior a este cambio) no deja la cuenta atrapada', async () => {
        const u = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await Usuario.updateOne({ email: u.email }, { bloqueado: true, bloqueadoEn: null, intentosFallidos: 3 });

        const r = await entrarCon(u.email, u.clave);
        assert.equal(r.estado, 200);
    });

    it('Gerencia y TIC pueden desbloquear una cuenta manualmente, sin cambiar su clave', async () => {
        const u = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await fallar(u.email);
        assert.equal((await entrarCon(u.email, u.clave)).estado, 423);

        const r = await api(`/usuarios/${u.id}/desbloquear`, { metodo: 'POST', token: tic.token });
        assert.equal(r.estado, 200);
        assert.equal((await entrarCon(u.email, u.clave)).estado, 200);

        const otra = await api(`/usuarios/${u.id}/desbloquear`, { metodo: 'POST', token: tic.token });
        assert.equal(otra.estado, 409);
    });

    it('TIC no puede desbloquear a un Superadmin', async () => {
        await Usuario.updateOne({ email: EMAIL_ADMIN }, { bloqueado: true, bloqueadoEn: new Date() });

        const r = await api(`/usuarios/${admin.usuario.id}/desbloquear`, { metodo: 'POST', token: tic.token });
        assert.equal(r.estado, 403);

        await Usuario.updateOne({ email: EMAIL_ADMIN }, { bloqueado: false, bloqueadoEn: null, intentosFallidos: 0 });
    });

    // ---------- Roles y permisos ----------

    it('el catálogo describe cada rol e indica cuáles están protegidos', async () => {
        const r = await api('/usuarios/catalogo', { token: admin.token });
        assert.equal(r.estado, 200);
        assert.ok(r.datos.rolesInfo.Funcionario.descripcion);
        assert.equal(r.datos.rolesInfo.Superadmin.protegido, true);
        assert.equal(r.datos.rolesInfo.Gerencia.protegido, true);
        assert.equal(r.datos.rolesInfo.TIC.protegido, false);
        assert.ok(!r.datos.roles.includes('Usuario institucional'));
        assert.ok(r.datos.permisosSensibles.includes('documentos.aprobar'));
    });

    it('TIC puede asignar roles operativos como Secretaría y Funcionario', async () => {
        const secretaria = await crearComoTic(['Secretaría']);
        assert.equal(secretaria.estado, 201, JSON.stringify(secretaria.datos));

        const funcionario = await crearComoTic(['Funcionario']);
        assert.equal(funcionario.estado, 201, JSON.stringify(funcionario.datos));
    });

    it('TIC no puede asignar los roles protegidos Gerencia y Superadmin', async () => {
        const gerencia = await crearComoTic(['Gerencia']);
        assert.equal(gerencia.estado, 403);
        assert.match(gerencia.datos.mensaje, /Solo un Superadmin/);

        const superadmin = await crearComoTic(['Superadmin']);
        assert.equal(superadmin.estado, 403);
    });

    it('TIC no puede quitar el rol Gerencia a quien lo tiene', async () => {
        const gerente = await nuevoUsuario(admin.token, { departamento: 'Gerencia General', roles: ['Gerencia'] });

        const r = await api(`/usuarios/${gerente.id}/roles`, {
            metodo: 'PATCH',
            token: tic.token,
            cuerpo: { roles: ['Funcionario'] }
        });
        assert.equal(r.estado, 403);
    });

    it('un Superadmin sí puede asignar Gerencia', async () => {
        const f = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });

        const r = await api(`/usuarios/${f.id}/roles`, {
            metodo: 'PATCH',
            token: admin.token,
            cuerpo: { roles: ['Funcionario', 'Gerencia'] }
        });
        assert.equal(r.estado, 200);
    });

    it('los permisos sensibles individuales siguen restringidos y los operativos se otorgan libremente', async () => {
        const f = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });

        const sensible = await api(`/usuarios/${f.id}/permisos`, {
            metodo: 'PATCH',
            token: tic.token,
            cuerpo: { permisosExtra: ['documentos.aprobar'], permisosRetirados: [] }
        });
        assert.equal(sensible.estado, 403);

        const operativo = await api(`/usuarios/${f.id}/permisos`, {
            metodo: 'PATCH',
            token: tic.token,
            cuerpo: { permisosExtra: [], permisosRetirados: ['documentos.anexar'] }
        });
        assert.equal(operativo.estado, 200);
    });

    it('el rol TIC ya puede registrar documentos y participar en ellos', async () => {
        const r = await registrarDocumento(tic.token, {
            numeroOficio: 'TIC-2026-001',
            remitente: { nombre: 'TIC', departamento: 'Tecnologías de la Información' },
            destinatario: { nombre: 'Gerencia', departamento: 'Gerencia General' }
        });
        assert.equal(r.estado, 201, JSON.stringify(r.datos));

        const lista = await api('/documentos', { token: tic.token });
        assert.ok(lista.datos.some((d) => d._id === r.datos.documento._id));
    });

    // ---------- Pendientes ----------

    it('los pendientes exigen sesión iniciada', async () => {
        assert.equal((await api('/pendientes')).estado, 401);
    });

    it('los pendientes de administración se calculan desde el estado real', async () => {
        const solicitante = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await api('/auth/recuperar', { metodo: 'POST', cuerpo: { email: solicitante.email } });

        const bloqueado = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        await fallar(bloqueado.email);

        const r = await api('/pendientes', { token: tic.token });
        assert.equal(r.estado, 200);

        const solicitudes = r.datos.items.find((i) => i.clave === 'solicitudes-recuperacion');
        const bloqueadas = r.datos.items.find((i) => i.clave === 'cuentas-bloqueadas');
        assert.ok(solicitudes && solicitudes.cantidad >= 1);
        assert.ok(bloqueadas && bloqueadas.cantidad >= 1);
        assert.ok(r.datos.total >= 2);
    });

    it('un usuario sin permisos de administración no ve los pendientes de administración', async () => {
        const f = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        const r = await api('/pendientes', { token: f.token });

        assert.ok(!r.datos.items.some((i) => i.clave === 'solicitudes-recuperacion'));
        assert.ok(!r.datos.items.some((i) => i.clave === 'cuentas-bloqueadas'));
    });

    it('avisa si solo hay un Superadmin activo y deja de avisar al registrar otro', async () => {
        const antes = await api('/pendientes', { token: admin.token });
        assert.equal(antes.datos.advertencias.length, 1);

        const segundo = await api('/usuarios', {
            metodo: 'POST',
            token: admin.token,
            cuerpo: {
                cedula: '7100000001',
                nombres: 'Segundo',
                apellidos: 'Admin',
                email: 'segundo@uleam.edu.ec',
                departamento: 'Tecnologías de la Información',
                roles: ['Superadmin'],
                password: 'Temporal123'
            }
        });
        assert.equal(segundo.estado, 201, JSON.stringify(segundo.datos));

        const despues = await api('/pendientes', { token: admin.token });
        assert.equal(despues.datos.advertencias.length, 0);
    });

    it('Gerencia ve los documentos por revisar y el creador ve los rechazados', async () => {
        const gerente = await usuarioListo(admin.token, { departamento: 'Gerencia General', roles: ['Gerencia'] });
        const ana = await usuarioListo(admin.token, { departamento: 'Secretaria General', roles: ['Secretaría'] });

        const registro = await registrarDocumento(ana.token, { numeroOficio: 'PEND-001' });
        assert.equal(registro.estado, 201, JSON.stringify(registro.datos));
        const id = registro.datos.documento._id;

        assert.equal((await cambiarEstado(ana.token, id, 'En Revisión')).estado, 200);

        const g = await api('/pendientes', { token: gerente.token });
        assert.equal(g.datos.items.find((i) => i.clave === 'documentos-por-revisar').cantidad, 1);

        assert.equal((await cambiarEstado(gerente.token, id, 'Rechazado', 'Falta la firma')).estado, 200);

        const a = await api('/pendientes', { token: ana.token });
        assert.equal(a.datos.items.find((i) => i.clave === 'documentos-rechazados').cantidad, 1);

        const g2 = await api('/pendientes', { token: gerente.token });
        assert.ok(!g2.datos.items.some((i) => i.clave === 'documentos-por-revisar'));
    });
});