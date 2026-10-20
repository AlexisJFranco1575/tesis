const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');

const { api, sha256, contenidoPdf, contenidoPng, registrarDocumento, nuevaVersion, subirAnexos } = ayudas;

describe('Operaciones documentales, versiones y anexos (M03 y M04)', () => {
    let admin;
    let ana; // Secretaría
    let pedro; // Usuario institucional de otra área
    let primero;
    const contenidoUno = contenidoPdf('documento uno');

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await ayudas.usuarioListo(admin.token, { departamento: 'Secretaria General', roles: ['Secretaría'] });
        pedro = await ayudas.usuarioListo(admin.token, { departamento: 'Recursos Humanos', roles: ['Usuario institucional'] });
    });

    after(async () => {
        await ayudas.detener();
    });

    it('registra un documento con código generado, oficio en mayúsculas y hash del archivo', async () => {
        const r = await registrarDocumento(ana.token, {}, contenidoUno);
        assert.equal(r.estado, 201, JSON.stringify(r.datos));

        primero = r.datos.documento;
        assert.match(primero.codigoTramite, /^EP-ULEAM-\d{4}-0001$/);
        assert.equal(primero.numeroOficio, 'OF-2026-001');
        assert.equal(primero.estado, 'Generado');
        assert.equal(primero.hashActual, sha256(contenidoUno));
    });

    it('asigna códigos consecutivos', async () => {
        const r = await registrarDocumento(ana.token, { numeroOficio: 'OF-2026-002' });
        assert.equal(r.estado, 201);
        assert.match(r.datos.documento.codigoTramite, /-0002$/);
    });

    it('rechaza un número de oficio repetido (aunque cambie mayúsculas)', async () => {
        const r = await registrarDocumento(ana.token, { numeroOficio: 'of-2026-001' });
        assert.equal(r.estado, 409);
    });

    it('rechaza el registro sin motivo', async () => {
        const r = await registrarDocumento(ana.token, { numeroOficio: 'OF-2026-003', motivo: '' });
        assert.equal(r.estado, 400);
    });

    it('rechaza un archivo que dice ser PDF pero no lo es', async () => {
        const r = await registrarDocumento(ana.token, { numeroOficio: 'OF-2026-004' }, Buffer.from('esto no es un pdf'));
        assert.equal(r.estado, 400);
        assert.match(r.datos.mensaje, /PDF válido/);
    });

    it('rechaza un tipo de documento fuera de la clasificación', async () => {
        const r = await registrarDocumento(ana.token, { numeroOficio: 'OF-2026-005', tipoDocumento: 'Inventado' });
        assert.equal(r.estado, 400);
    });

    it('cada usuario solo ve los documentos de su área', async () => {
        const listaPedro = await api('/documentos', { token: pedro.token });
        assert.ok(!listaPedro.datos.some((d) => d._id === primero._id));

        const directo = await api(`/documentos/${primero._id}`, { token: pedro.token });
        assert.equal(directo.estado, 403);

        const listaAdmin = await api('/documentos', { token: admin.token });
        assert.ok(listaAdmin.datos.some((d) => d._id === primero._id));
    });

    it('al cambiar el destinatario al área de otro usuario, este pasa a participar', async () => {
        const cambio = await api(`/documentos/${primero._id}`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { destinatario: { nombre: 'Pedro', departamento: 'Recursos Humanos' } }
        });
        assert.equal(cambio.estado, 200);

        const directo = await api(`/documentos/${primero._id}`, { token: pedro.token });
        assert.equal(directo.estado, 200);
    });

    it('la modificación conserva los valores anteriores en la bitácora', async () => {
        const cambio = await api(`/documentos/${primero._id}`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { asunto: 'Asunto corregido' }
        });
        assert.equal(cambio.estado, 200);

        const bitacora = await api(`/bitacora?documento=${primero._id}`, { token: admin.token });
        const entrada = bitacora.datos.find((e) => e.accion === 'MODIFICACION_DOCUMENTO' && e.detalle.includes('Asunto corregido'));
        assert.ok(entrada, 'La modificación debió quedar registrada');
        assert.ok(entrada.detalle.includes('Solicitud de presupuesto'), 'Debe conservar el valor anterior');
    });

    it('una nueva versión conserva la anterior y calcula su propio hash', async () => {
        const contenidoDos = contenidoPdf('documento uno, versión 2');
        const r = await nuevaVersion(ana.token, primero._id, 'Corrección de cifras', contenidoDos);
        assert.equal(r.estado, 201);
        assert.equal(r.datos.documento.versionActual, 2);

        const versiones = await api(`/documentos/${primero._id}/versiones`, { token: ana.token });
        assert.equal(versiones.datos.length, 2);

        const v2 = versiones.datos.find((v) => v.numero === 2);
        const v1 = versiones.datos.find((v) => v.numero === 1);
        assert.equal(v2.hashArchivo, sha256(contenidoDos));
        assert.equal(v1.hashArchivo, sha256(contenidoUno));
        assert.notEqual(v1.hashArchivo, v2.hashArchivo);
    });

    it('carga varios anexos a la vez con su hash y tipo documental', async () => {
        const pdf = contenidoPdf('anexo pdf');
        const png = contenidoPng('anexo png');

        const r = await subirAnexos(ana.token, primero._id, {
            tipoAnexo: 'Factura',
            descripcion: 'Respaldo',
            archivos: [
                { contenido: pdf, nombre: 'factura.pdf', tipo: 'application/pdf' },
                { contenido: png, nombre: 'foto.png', tipo: 'image/png' }
            ]
        });
        assert.equal(r.estado, 201, JSON.stringify(r.datos));
        assert.equal(r.datos.anexos.length, 2);

        const hashes = r.datos.anexos.map((a) => a.hashArchivo).sort();
        assert.deepEqual(hashes, [sha256(pdf), sha256(png)].sort());

        const lista = await api(`/documentos/${primero._id}/anexos`, { token: ana.token });
        assert.equal(lista.datos.length, 2);
        assert.ok(lista.datos.every((a) => a.tipoAnexo === 'Factura'));
    });

    it('rechaza anexos con formato no permitido o con contenido que no corresponde', async () => {
        const texto = await subirAnexos(ana.token, primero._id, {
            archivos: [{ contenido: Buffer.from('texto'), nombre: 'nota.txt', tipo: 'text/plain' }]
        });
        assert.equal(texto.estado, 400);
        assert.match(texto.datos.mensaje, /Formato no permitido/);

        const falso = await subirAnexos(ana.token, primero._id, {
            archivos: [{ contenido: Buffer.from('no soy una imagen'), nombre: 'falsa.png', tipo: 'image/png' }]
        });
        assert.equal(falso.estado, 400);
        assert.match(falso.datos.mensaje, /no corresponde/);
    });

    it('rechaza un tipo documental de anexo inválido', async () => {
        const r = await subirAnexos(ana.token, primero._id, {
            tipoAnexo: 'TipoInventado',
            archivos: [{ contenido: contenidoPdf('x'), nombre: 'x.pdf', tipo: 'application/pdf' }]
        });
        assert.equal(r.estado, 400);
    });

    it('la descarga entrega el contenido original y queda en la bitácora', async () => {
        const r = await api(`/documentos/${primero._id}/versiones/1/archivo?modo=descargar`, { token: ana.token });
        assert.equal(r.estado, 200);
        assert.ok(Buffer.isBuffer(r.datos));
        assert.ok(r.datos.equals(contenidoUno), 'El archivo descargado debe ser idéntico al original');

        const bitacora = await api(`/bitacora?documento=${primero._id}`, { token: admin.token });
        assert.ok(bitacora.datos.some((e) => e.accion === 'DESCARGA_DOCUMENTO'));
    });
});