const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');
const { TODOS_LOS_PERMISOS } = require('../src/config/roles');

const { api, nuevoUsuario, usuarioListo, EMAIL_ADMIN, CLAVE_ADMIN } = ayudas;

describe('Seguridad y acceso (M01 y M02)', () => {
    let admin;

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
    });

    after(async () => {
        await ayudas.detener();
    });

    it('rechaza el registro inicial con una llave incorrecta', async () => {
        const r = await api('/auth/registrar-admin-inicial', {
            metodo: 'POST',
            cabeceras: { 'x-setup-key': 'llave-equivocada' },
            cuerpo: {}
        });
        assert.equal(r.estado, 403);
    });

    it('no permite inicializar el sistema por segunda vez', async () => {
        const r = await api('/auth/registrar-admin-inicial', {
            metodo: 'POST',
            cabeceras: { 'x-setup-key': process.env.SETUP_KEY },
            cuerpo: {}
        });
        assert.equal(r.estado, 409);
    });

    it('el Superadmin inicia sesión y recibe todos los permisos', async () => {
        const r = await api('/auth/login', { metodo: 'POST', cuerpo: { email: EMAIL_ADMIN, password: CLAVE_ADMIN } });
        assert.equal(r.estado, 200);
        assert.deepEqual(r.datos.usuario.roles, ['Superadmin']);
        assert.equal(r.datos.usuario.permisos.length, TODOS_LOS_PERMISOS.length);
        assert.ok(r.datos.token);
    });

    it('rechaza credenciales inválidas e informa los intentos restantes', async () => {
        const { email } = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        const r = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: 'incorrecta1' } });
        assert.equal(r.estado, 401);
        assert.equal(r.datos.intentosRestantes, 2);
    });

    it('bloquea la cuenta al tercer intento fallido y la mantiene bloqueada', async () => {
        const { email, clave } = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        const intento = () => api('/auth/login', { metodo: 'POST', cuerpo: { email, password: 'incorrecta1' } });

        assert.equal((await intento()).estado, 401);
        assert.equal((await intento()).estado, 401);
        assert.equal((await intento()).estado, 423);

        // Ni siquiera la clave correcta permite entrar a una cuenta bloqueada
        const conClaveCorrecta = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: clave } });
        assert.equal(conClaveCorrecta.estado, 423);
    });

    it('el administrador desbloquea con una clave temporal y el usuario debe cambiarla', async () => {
        const { id, email } = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        for (let i = 0; i < 3; i += 1) {
            await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: 'incorrecta1' } });
        }

        const generada = await api(`/usuarios/${id}/clave-temporal`, { metodo: 'POST', token: admin.token });
        assert.equal(generada.estado, 200);
        const claveTemporal = generada.datos.claveTemporal;
        assert.ok(claveTemporal);

        const login = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: claveTemporal } });
        assert.equal(login.estado, 200);
        assert.equal(login.datos.usuario.debeCambiarPassword, true);

        // Mientras no cambie la clave temporal, el resto del sistema le está vetado
        const vetado = await api('/documentos', { token: login.datos.token });
        assert.equal(vetado.estado, 403);
        assert.equal(vetado.datos.codigo, 'CAMBIO_PASSWORD_REQUERIDO');

        const cambio = await api('/auth/cambiar-password', {
            metodo: 'POST',
            token: login.datos.token,
            cuerpo: { passwordActual: claveTemporal, passwordNueva: 'MiClave2026' }
        });
        assert.equal(cambio.estado, 200);

        const permitido = await api('/documentos', { token: cambio.datos.token });
        assert.equal(permitido.estado, 200);
    });

    it('rechaza contraseñas débiles al cambiarla', async () => {
        const u = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });

        for (const debil of ['corta1', 'sololetrasaquiii', '123456789012']) {
            const r = await api('/auth/cambiar-password', {
                metodo: 'POST',
                token: u.token,
                cuerpo: { passwordActual: u.clave, passwordNueva: debil }
            });
            assert.equal(r.estado, 400, `La clave "${debil}" debió rechazarse`);
        }
    });

    it('la baja deja sin acceso inmediato a un usuario con sesión abierta', async () => {
        const u = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        assert.equal((await api('/documentos', { token: u.token })).estado, 200);

        const baja = await api(`/usuarios/${u.id}/baja`, { metodo: 'PATCH', token: admin.token, cuerpo: { motivo: 'Prueba' } });
        assert.equal(baja.estado, 200);

        assert.equal((await api('/documentos', { token: u.token })).estado, 401);
        const login = await api('/auth/login', { metodo: 'POST', cuerpo: { email: u.email, password: u.clave } });
        assert.equal(login.estado, 403);
    });

    it('niega la gestión de usuarios a quien no tiene el permiso', async () => {
        const u = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        assert.equal((await api('/usuarios', { token: u.token })).estado, 403);
        assert.equal((await api('/usuarios')).estado, 401);
    });

    it('impide a TIC asignar el rol Superadmin o administrar a un Superadmin', async () => {
        const tic = await usuarioListo(admin.token, { departamento: 'TIC', roles: ['TIC'] });

        const crear = await api('/usuarios', {
            metodo: 'POST',
            token: tic.token,
            cuerpo: {
                cedula: '0999999999',
                nombres: 'Falso',
                apellidos: 'Admin',
                email: 'falso@uleam.edu.ec',
                departamento: 'TIC',
                roles: ['Superadmin'],
                password: 'Temporal123'
            }
        });
        assert.equal(crear.estado, 403);

        const baja = await api(`/usuarios/${admin.usuario.id}/baja`, { metodo: 'PATCH', token: tic.token, cuerpo: {} });
        assert.equal(baja.estado, 403);
    });

    it('nadie puede darse de baja a sí mismo', async () => {
        const r = await api(`/usuarios/${admin.usuario.id}/baja`, { metodo: 'PATCH', token: admin.token, cuerpo: {} });
        assert.equal(r.estado, 403);
    });

    it('la solicitud de recuperación avisa a los administradores', async () => {
        const { email } = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });

        const noExiste = await api('/auth/recuperar', { metodo: 'POST', cuerpo: { email: 'noexiste@uleam.edu.ec' } });
        assert.equal(noExiste.estado, 404);

        const r = await api('/auth/recuperar', { metodo: 'POST', cuerpo: { email } });
        assert.equal(r.estado, 200);

        const aviso = await ayudas.esperarHasta(async () => {
            const lista = await api('/notificaciones', { token: admin.token });
            return lista.datos.notificaciones.find((n) => n.titulo === 'Solicitud de recuperación');
        });
        assert.ok(aviso, 'El administrador debió recibir la notificación');
    });

    it('el cierre de sesión invalida el token', async () => {
        const u = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Usuario institucional'] });
        await ayudas.esperar(10);

        const cierre = await api('/auth/logout', { metodo: 'POST', token: u.token, cuerpo: { motivo: 'manual' } });
        assert.equal(cierre.estado, 200);
        assert.equal((await api('/documentos', { token: u.token })).estado, 401);
    });

    it('rechaza peticiones sin token o con un token inválido', async () => {
        assert.equal((await api('/documentos')).estado, 401);
        assert.equal((await api('/documentos', { token: 'token.falso.invalido' })).estado, 401);
    });
});