const fs = require('node:fs');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ayudas = require('./ayudas');
const Version = require('../src/models/Version');
const Anexo = require('../src/models/Anexo');
const Bitacora = require('../src/models/Bitacora');

const { api, contenidoPdf, contenidoPng, registrarDocumento, subirAnexos } = ayudas;

describe('Integridad SHA-256 y bitácora (M05)', () => {
    let admin;
    let ana; // Secretaría: participa pero no puede verificar integridad
    let id;
    let rutaVersion;
    let contenidoOriginal;

    const verificar = () => api(`/documentos/${id}/verificar`, { metodo: 'POST', token: admin.token });
    const documento = async () => (await api(`/documentos/${id}`, { token: admin.token })).datos;
    const desbloquear = () =>
        api(`/documentos/${id}/desbloquear`, { metodo: 'POST', token: admin.token, cuerpo: { motivo: 'Archivo restaurado' } });

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await ayudas.usuarioListo(admin.token, { departamento: 'Secretaria General', roles: ['Secretaría'] });

        const registro = await registrarDocumento(ana.token, {}, contenidoPdf('documento para integridad'));
        assert.equal(registro.estado, 201, JSON.stringify(registro.datos));
        id = registro.datos.documento._id;

        const anexo = await subirAnexos(ana.token, id, {
            archivos: [{ contenido: contenidoPng('anexo de integridad'), nombre: 'foto.png', tipo: 'image/png' }]
        });
        assert.equal(anexo.estado, 201, JSON.stringify(anexo.datos));

        rutaVersion = (await Version.findOne({ documento: id })).rutaArchivo;
        contenidoOriginal = fs.readFileSync(rutaVersion);
    });

    after(async () => {
        await ayudas.detener();
    });

    it('verifica como íntegro un documento sin alteraciones', async () => {
        const r = await verificar();
        assert.equal(r.estado, 200);
        assert.equal(r.datos.valido, true);
        assert.ok(r.datos.versiones.every((v) => v.coincide));
        assert.ok(r.datos.anexos.every((a) => a.coincide));
    });

    it('quien no tiene el permiso no puede verificar la integridad', async () => {
        const r = await api(`/documentos/${id}/verificar`, { metodo: 'POST', token: ana.token });
        assert.equal(r.estado, 403);
    });

    it('detecta una versión alterada, bloquea el documento y avisa a los administradores', async () => {
        fs.appendFileSync(rutaVersion, 'alterado');

        const r = await verificar();
        assert.equal(r.datos.valido, false);
        assert.equal(r.datos.bloqueado, true);
        assert.equal(r.datos.versiones[0].coincide, false);
        assert.notEqual(r.datos.versiones[0].hashCalculado, r.datos.versiones[0].hashAlmacenado);

        assert.equal((await documento()).bloqueado, true);

        const aviso = await ayudas.esperarHasta(async () => {
            const lista = await api('/notificaciones', { token: admin.token });
            return lista.datos.notificaciones.find((n) => n.titulo === 'Alerta de alteración');
        });
        assert.ok(aviso, 'Los administradores debieron recibir la alerta');
    });

    it('no permite desbloquear mientras el archivo siga alterado', async () => {
        const r = await desbloquear();
        assert.equal(r.estado, 409);
    });

    it('un documento bloqueado no admite nuevas versiones ni descargas de quien no puede verificar', async () => {
        const version = await ayudas.nuevaVersion(ana.token, id, 'Intento', contenidoPdf('otra'));
        assert.equal(version.estado, 423);

        const descarga = await api(`/documentos/${id}/versiones/1/archivo`, { token: ana.token });
        assert.equal(descarga.estado, 423);
    });

    it('permite desbloquear una vez restaurado el archivo original', async () => {
        fs.writeFileSync(rutaVersion, contenidoOriginal);

        const r = await desbloquear();
        assert.equal(r.estado, 200);
        assert.equal((await documento()).bloqueado, false);
    });

    it('la descarga de un archivo alterado se rechaza y bloquea el documento', async () => {
        fs.appendFileSync(rutaVersion, 'otra-alteracion');

        const descarga = await api(`/documentos/${id}/versiones/1/archivo?modo=descargar`, { token: ana.token });
        assert.equal(descarga.estado, 409);
        assert.equal((await documento()).bloqueado, true);

        fs.writeFileSync(rutaVersion, contenidoOriginal);
        assert.equal((await desbloquear()).estado, 200);
    });

    it('detecta un anexo alterado', async () => {
        const anexo = await Anexo.findOne({ documento: id });
        const original = fs.readFileSync(anexo.rutaArchivo);
        fs.appendFileSync(anexo.rutaArchivo, 'alterado');

        const r = await verificar();
        assert.equal(r.datos.valido, false);
        assert.ok(r.datos.anexos.some((a) => !a.coincide));
        assert.ok((await documento()).motivoBloqueo.includes('anexo'));

        fs.writeFileSync(anexo.rutaArchivo, original);
        assert.equal((await desbloquear()).estado, 200);
    });

    it('detecta un archivo eliminado', async () => {
        fs.renameSync(rutaVersion, `${rutaVersion}.oculto`);

        const r = await verificar();
        assert.equal(r.datos.valido, false);
        assert.equal(r.datos.versiones[0].archivoExiste, false);

        fs.renameSync(`${rutaVersion}.oculto`, rutaVersion);
        assert.equal((await desbloquear()).estado, 200);
    });

    it('la auditoría general confirma que todo está íntegro', async () => {
        const r = await api('/bitacora/auditoria', { metodo: 'POST', token: admin.token });
        assert.equal(r.estado, 200);
        assert.equal(r.datos.valido, true);
        assert.equal(r.datos.bitacora.integra, true);
        assert.ok(r.datos.versionesAnalizadas >= 1);
        assert.ok(r.datos.anexosAnalizados >= 1);
    });

    it('las entradas de la bitácora forman una cadena de hashes consecutiva', async () => {
        const r = await api('/bitacora?limite=500', { token: admin.token });
        const entradas = [...r.datos].reverse(); // de la más antigua a la más reciente

        assert.equal(entradas[0].hashAnterior, '0'.repeat(64));
        for (let i = 1; i < entradas.length; i += 1) {
            assert.equal(entradas[i].hashAnterior, entradas[i - 1].hashActual, `La entrada #${i + 1} no enlaza con la anterior`);
        }
    });

    it('la aplicación no puede modificar ni borrar la bitácora', async () => {
        await assert.rejects(() => Bitacora.updateOne({}, { detalle: 'manipulado' }), /solo lectura/);
        await assert.rejects(() => Bitacora.deleteMany({}), /solo lectura/);
    });

    it('la auditoría descubre una entrada de la bitácora manipulada directamente en la base de datos', async () => {
        // Se salta la aplicación y se altera el registro con el controlador de MongoDB
        await mongoose.connection
            .collection('bitacoras')
            .updateOne({ accion: 'REGISTRO_DOCUMENTO' }, { $set: { detalle: 'texto manipulado' } });

        const r = await api('/bitacora/auditoria', { metodo: 'POST', token: admin.token });
        assert.equal(r.datos.valido, false);
        assert.equal(r.datos.bitacora.integra, false);
        assert.ok(r.datos.bitacora.errores.length > 0);
    });
});