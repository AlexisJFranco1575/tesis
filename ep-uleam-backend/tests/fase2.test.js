const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');

const { api, usuarioListo } = ayudas;

describe('Fase 2: catálogo de áreas y roles dinámicos', () => {
    let admin;
    let tic;
    let contador = 0;

    const areas = async (token, consulta = '') => (await api(`/areas${consulta}`, { token })).datos;
    const buscarArea = async (nombre) => (await areas(admin.token, '?todas=1')).find((a) => a.nombre === nombre);

    const registrar = (token, departamento, roles) => {
        contador += 1;
        return api('/usuarios', {
            metodo: 'POST',
            token,
            cuerpo: {
                cedula: String(8000000000 + contador),
                nombres: 'Prueba',
                apellidos: `Fase${contador}`,
                email: `fase2-${contador}@uleam.edu.ec`,
                departamento,
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

    // ---------- Áreas ----------

    it('el catálogo trae la estructura de la empresa, con su jerarquía', async () => {
        const lista = await areas(tic.token);
        const contabilidad = lista.find((a) => a.nombre === 'Contabilidad');

        assert.equal(contabilidad.ruta, 'Gerencia General / Área Financiera / Contabilidad');
        assert.equal(contabilidad.nivel, 2);
        assert.equal(lista.find((a) => a.nombre === 'CENFOR').tipo, 'unidad');
        assert.ok(lista.every((a) => a.activa));
    });

    it('el registro de un usuario exige un área de la lista y la normaliza', async () => {
        const inventada = await registrar(admin.token, 'Área Inventada', ['Funcionario']);
        assert.equal(inventada.estado, 400);
        assert.match(inventada.datos.mensaje, /área/);

        const escrita = await registrar(admin.token, 'secretaria general', ['Funcionario']);
        assert.equal(escrita.estado, 201, JSON.stringify(escrita.datos));
        assert.equal(escrita.datos.usuario.departamento, 'Secretaría General');
    });

    it('se puede cambiar el área de un usuario, y solo a un área del catálogo', async () => {
        const r = await registrar(admin.token, 'Ventas', ['Funcionario']);
        const id = r.datos.usuario._id;

        const mal = await api(`/usuarios/${id}/area`, { metodo: 'PATCH', token: tic.token, cuerpo: { departamento: 'Nada' } });
        assert.equal(mal.estado, 400);

        const bien = await api(`/usuarios/${id}/area`, { metodo: 'PATCH', token: tic.token, cuerpo: { departamento: 'Tesorería' } });
        assert.equal(bien.estado, 200);
        assert.equal(bien.datos.usuario.departamento, 'Tesorería');
    });

    it('permite crear una subárea y rechaza nombres duplicados', async () => {
        const financiera = await buscarArea('Área Financiera');

        const creada = await api('/areas', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'Nómina', siglas: 'nom', padre: financiera._id } });
        assert.equal(creada.estado, 201, JSON.stringify(creada.datos));

        const repetida = await api('/areas', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'nomina', padre: financiera._id } });
        assert.equal(repetida.estado, 409);
    });

    it('un área no puede quedar dentro de sí misma ni de sus subáreas', async () => {
        const financiera = await buscarArea('Área Financiera');
        const contabilidad = await buscarArea('Contabilidad');

        const r = await api(`/areas/${financiera._id}`, { metodo: 'PATCH', token: tic.token, cuerpo: { padre: contabilidad._id } });
        assert.equal(r.estado, 400);
    });

    it('no se elimina un área con subáreas o usuarios, pero sí una vacía', async () => {
        const financiera = await buscarArea('Área Financiera');
        assert.equal((await api(`/areas/${financiera._id}`, { metodo: 'DELETE', token: tic.token })).estado, 409);

        const nomina = await buscarArea('Nómina');
        assert.equal((await api(`/areas/${nomina._id}`, { metodo: 'DELETE', token: tic.token })).estado, 200);
    });

    it('renombrar un área actualiza a sus usuarios', async () => {
        await api('/areas', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'Archivo' } });
        const archivo = await buscarArea('Archivo');
        const usuario = await registrar(admin.token, 'Archivo', ['Funcionario']);
        assert.equal(usuario.estado, 201);

        const r = await api(`/areas/${archivo._id}`, { metodo: 'PATCH', token: tic.token, cuerpo: { nombre: 'Archivo Central' } });
        assert.equal(r.estado, 200);

        const lista = await api('/usuarios', { token: admin.token });
        const actualizado = lista.datos.find((u) => u._id === usuario.datos.usuario._id);
        assert.equal(actualizado.departamento, 'Archivo Central');
    });

    it('no se desactiva un área que tiene usuarios activos', async () => {
        const archivo = await buscarArea('Archivo Central');
        const r = await api(`/areas/${archivo._id}`, { metodo: 'PATCH', token: tic.token, cuerpo: { activa: false } });
        assert.equal(r.estado, 409);
    });

    it('un usuario sin permiso no administra áreas ni ve las inactivas', async () => {
        const f = await usuarioListo(admin.token, { departamento: 'Ventas', roles: ['Funcionario'] });

        assert.equal((await api('/areas', { metodo: 'POST', token: f.token, cuerpo: { nombre: 'Otra' } })).estado, 403);
        assert.equal((await api('/areas?todas=1', { token: f.token })).estado, 403);
        assert.equal((await api('/areas', { token: f.token })).estado, 200);
    });

    // ---------- Roles ----------

    it('el catálogo de roles incluye los roles base y marca lo que cada usuario puede editar', async () => {
        const r = await api('/roles', { token: tic.token });
        assert.equal(r.estado, 200);

        const nombres = r.datos.map((x) => x.nombre);
        for (const base of ['Superadmin', 'Gerencia', 'TIC', 'Secretaría', 'Funcionario']) {
            assert.ok(nombres.includes(base), `Falta el rol ${base}`);
        }
        assert.equal(r.datos.find((x) => x.nombre === 'Superadmin').editable, false);
        assert.equal(r.datos.find((x) => x.nombre === 'Gerencia').editable, false); // TIC no edita roles protegidos
        assert.equal(r.datos.find((x) => x.nombre === 'Funcionario').editable, true);
        assert.equal(r.datos.find((x) => x.nombre === 'Funcionario').eliminable, false); // rol base
    });

    it('TIC crea un rol propio con permisos operativos y se lo asigna a un usuario', async () => {
        const creado = await api('/roles', {
            metodo: 'POST',
            token: tic.token,
            cuerpo: { nombre: 'Tesorería (consulta)', descripcion: 'Solo lectura', permisos: ['documentos.consultar', 'documentos.descargar'] }
        });
        assert.equal(creado.estado, 201, JSON.stringify(creado.datos));

        const usuario = await registrar(tic.token, 'Tesorería', ['Tesorería (consulta)']);
        assert.equal(usuario.estado, 201, JSON.stringify(usuario.datos));
        assert.deepEqual([...usuario.datos.usuario.permisos].sort(), ['documentos.consultar', 'documentos.descargar']);

        const catalogo = await api('/usuarios/catalogo', { token: tic.token });
        assert.ok(catalogo.datos.roles.includes('Tesorería (consulta)'));
        assert.equal(catalogo.datos.rolesInfo['Tesorería (consulta)'].protegido, false);
    });

    it('rechaza nombres de rol duplicados, sin importar tildes ni mayúsculas', async () => {
        const r = await api('/roles', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'tesoreria (CONSULTA)', permisos: ['documentos.consultar'] } });
        assert.equal(r.estado, 409);
    });

    it('un rol no puede incluir permisos sensibles que su creador no posee', async () => {
        const tic403 = await api('/roles', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'Revisor', permisos: ['documentos.aprobar'] } });
        assert.equal(tic403.estado, 403);

        const admin201 = await api('/roles', { metodo: 'POST', token: admin.token, cuerpo: { nombre: 'Revisor', permisos: ['documentos.aprobar'] } });
        assert.equal(admin201.estado, 201);
    });

    it('al editar los permisos de un rol, sus usuarios lo notan de inmediato', async () => {
        const roles = await api('/roles', { token: tic.token });
        const rol = roles.datos.find((x) => x.nombre === 'Tesorería (consulta)');

        const usuario = await ayudas.nuevoUsuario(admin.token, { departamento: 'Tesorería', roles: ['Tesorería (consulta)'] });
        const sesion = await ayudas.entrar(usuario.email, usuario.clave);
        assert.ok(!sesion.usuario.permisos.includes('documentos.registrar'));

        const r = await api(`/roles/${rol._id}`, {
            metodo: 'PATCH',
            token: tic.token,
            cuerpo: { permisos: ['documentos.consultar', 'documentos.descargar', 'documentos.registrar'] }
        });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));

        const yo = await api('/auth/yo', { token: sesion.token });
        assert.ok(yo.datos.permisos.includes('documentos.registrar'));
    });

    it('los roles protegidos no los modifica TIC, y Superadmin no lo modifica nadie', async () => {
        const roles = await api('/roles', { token: admin.token });
        const gerencia = roles.datos.find((x) => x.nombre === 'Gerencia');
        const superadmin = roles.datos.find((x) => x.nombre === 'Superadmin');

        const porTic = await api(`/roles/${gerencia._id}`, { metodo: 'PATCH', token: tic.token, cuerpo: { permisos: ['documentos.consultar'] } });
        assert.equal(porTic.estado, 403);

        const sobreSuperadmin = await api(`/roles/${superadmin._id}`, { metodo: 'PATCH', token: admin.token, cuerpo: { descripcion: 'x' } });
        assert.equal(sobreSuperadmin.estado, 403);
    });

    it('no se elimina un rol en uso ni un rol base; sí uno sin usuarios', async () => {
        const roles = await api('/roles', { token: tic.token });
        const enUso = roles.datos.find((x) => x.nombre === 'Tesorería (consulta)');
        const base = roles.datos.find((x) => x.nombre === 'TIC');

        assert.equal((await api(`/roles/${enUso._id}`, { metodo: 'DELETE', token: tic.token })).estado, 409);
        assert.equal((await api(`/roles/${base._id}`, { metodo: 'DELETE', token: tic.token })).estado, 403);

        const vacio = await api('/roles', { metodo: 'POST', token: tic.token, cuerpo: { nombre: 'Temporal', permisos: ['documentos.consultar'] } });
        assert.equal((await api(`/roles/${vacio.datos.rol._id}`, { metodo: 'DELETE', token: tic.token })).estado, 200);
    });

    it('los cambios de roles y áreas quedan en la bitácora', async () => {
        const r = await api('/bitacora?limite=200', { token: admin.token });
        const acciones = r.datos.map((e) => e.accion);
        for (const esperada of ['AREA_CREADA', 'AREA_MODIFICADA', 'AREA_ELIMINADA', 'ROL_CREADO', 'ROL_MODIFICADO', 'ROL_ELIMINADO', 'USUARIO_AREA_MODIFICADA']) {
            assert.ok(acciones.includes(esperada), `Falta ${esperada}`);
        }
    });
});