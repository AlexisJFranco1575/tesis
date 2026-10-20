const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');

const { api, contenidoPdf, contenidoPng, registrarDocumento, nuevaVersion, subirAnexos, cambiarEstado } = ayudas;

describe('Flujo documental, revisión de Gerencia y notificaciones (M06)', () => {
    let admin;
    let ana; // Secretaría: registra y distribuye
    let gerente; // Gerencia: revisa
    let pedro; // Usuario institucional del área destinataria
    let id;

    // Las pruebas siguen el ciclo de vida de un mismo documento, en orden
    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await ayudas.usuarioListo(admin.token, { departamento: 'Secretaria General', roles: ['Secretaría'] });
        gerente = await ayudas.usuarioListo(admin.token, { departamento: 'Gerencia General', roles: ['Gerencia'] });
        pedro = await ayudas.usuarioListo(admin.token, { departamento: 'Recursos Humanos', roles: ['Usuario institucional'] });

        const r = await registrarDocumento(ana.token, {
            destinatario: { nombre: 'Pedro', departamento: 'Recursos Humanos' }
        });
        assert.equal(r.estado, 201, JSON.stringify(r.datos));
        id = r.datos.documento._id;
    });

    after(async () => {
        await ayudas.detener();
    });

    it('un documento Generado solo ofrece enviarlo a revisión y rechaza saltos del flujo', async () => {
        const detalle = await api(`/documentos/${id}`, { token: ana.token });
        assert.deepEqual(detalle.datos.transicionesPermitidas.map((t) => t.estado), ['En Revisión']);

        const salto = await cambiarEstado(ana.token, id, 'Aprobado');
        assert.equal(salto.estado, 409);
    });

    it('envía a revisión y quien no tiene autorización no puede aprobar', async () => {
        const envio = await cambiarEstado(ana.token, id, 'En Revisión');
        assert.equal(envio.estado, 200);
        assert.equal(envio.datos.documento.estado, 'En Revisión');

        const intento = await cambiarEstado(pedro.token, id, 'Aprobado');
        assert.equal(intento.estado, 403);
    });

    it('en revisión el documento queda congelado (sin versiones, anexos ni ediciones)', async () => {
        const version = await nuevaVersion(ana.token, id, 'Intento', contenidoPdf('otra'));
        assert.equal(version.estado, 409);

        const anexo = await subirAnexos(ana.token, id, {
            archivos: [{ contenido: contenidoPng('x'), nombre: 'x.png', tipo: 'image/png' }]
        });
        assert.equal(anexo.estado, 409);

        const edicion = await api(`/documentos/${id}`, { metodo: 'PATCH', token: ana.token, cuerpo: { asunto: 'Otro asunto' } });
        assert.equal(edicion.estado, 409);
    });

    it('Gerencia recibe la notificación de revisión pendiente', async () => {
        const lista = await api('/notificaciones', { token: gerente.token });
        assert.ok(lista.datos.notificaciones.some((n) => n.titulo === 'Documento pendiente de revisión'));
    });

    it('el rechazo exige una observación', async () => {
        const sin = await cambiarEstado(gerente.token, id, 'Rechazado');
        assert.equal(sin.estado, 400);

        const con = await cambiarEstado(gerente.token, id, 'Rechazado', 'Falta la firma de la jefatura');
        assert.equal(con.estado, 200);
        assert.equal(con.datos.documento.estado, 'Rechazado');
        assert.equal(con.datos.documento.revisiones.length, 1);
    });

    it('el creador recibe el rechazo con la observación', async () => {
        const lista = await api('/notificaciones', { token: ana.token });
        const aviso = lista.datos.notificaciones.find((n) => n.titulo === 'Documento rechazado');
        assert.ok(aviso);
        assert.ok(aviso.mensaje.includes('Falta la firma de la jefatura'));
    });

    it('un documento rechazado puede corregirse con una nueva versión y reenviarse', async () => {
        const version = await nuevaVersion(ana.token, id, 'Se agregó la firma', contenidoPdf('documento firmado'));
        assert.equal(version.estado, 201);

        const reenvio = await cambiarEstado(ana.token, id, 'En Revisión');
        assert.equal(reenvio.estado, 200);
    });

    it('Gerencia aprueba y el historial conserva ambas decisiones', async () => {
        const aprobacion = await cambiarEstado(gerente.token, id, 'Aprobado', 'Conforme');
        assert.equal(aprobacion.estado, 200);

        const detalle = await api(`/documentos/${id}`, { token: gerente.token });
        const decisiones = detalle.datos.revisiones.map((r) => r.decision);
        assert.deepEqual(decisiones, ['Rechazado', 'Aprobado']);
        assert.equal(detalle.datos.revisiones[1].version, 2);
    });

    it('al distribuir, el área destinataria recibe la notificación', async () => {
        const r = await cambiarEstado(ana.token, id, 'Distribuido');
        assert.equal(r.estado, 200);

        const lista = await api('/notificaciones', { token: pedro.token });
        assert.ok(lista.datos.notificaciones.some((n) => n.titulo === 'Documento distribuido'));
    });

    it('se puede archivar y recuperar del archivo', async () => {
        assert.equal((await cambiarEstado(ana.token, id, 'Archivado')).estado, 200);
        assert.equal((await cambiarEstado(ana.token, id, 'Generado')).estado, 200);
    });

    it('la bitácora registra cada decisión y cambio de estado', async () => {
        const bitacora = await api(`/bitacora?documento=${id}&limite=100`, { token: admin.token });
        const acciones = bitacora.datos.map((e) => e.accion);
        assert.ok(acciones.includes('REVISION_RECHAZADA'));
        assert.ok(acciones.includes('REVISION_APROBADA'));
        assert.ok(acciones.includes('CAMBIO_ESTADO'));
    });

    it('las notificaciones se pueden marcar como leídas', async () => {
        const antes = await api('/notificaciones', { token: ana.token });
        assert.ok(antes.datos.noLeidas > 0);

        const marcar = await api('/notificaciones/leer-todas', { metodo: 'POST', token: ana.token });
        assert.equal(marcar.estado, 200);

        const despues = await api('/notificaciones', { token: ana.token });
        assert.equal(despues.datos.noLeidas, 0);
    });
});