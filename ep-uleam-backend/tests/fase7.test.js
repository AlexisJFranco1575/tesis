const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');
const { claveDe } = require('../src/utils/verificacion');

const { api, sha256, usuarioListo, registrarDocumento, contenidoPdf, contenidoPng, subirAnexos } = ayudas;

describe('Fase 7: verificación pública, estadísticas y reportes', () => {
    let admin;
    let ana; // Secretaría (ve todo lo no confidencial)
    let luis; // Funcionario de Contabilidad (solo lo suyo)
    let doc1; // Memorando enviado a Luis
    let doc2; // Memorando confidencial
    let doc3; // Oficio sin enviar
    const pdf1 = contenidoPdf('documento uno');
    const pdf2 = contenidoPdf('documento confidencial');

    const verificar = (documento, extra = '', clave) =>
        api(`/publico/verificar/${documento.codigoTramite}?k=${clave ?? claveDe(documento.codigoTramite)}${extra}`);

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await usuarioListo(admin.token, { departamento: 'Secretaría General', roles: ['Secretaría'] });
        luis = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });

        const base = { numeroOficio: '', tipoDocumento: 'Memorando', destinatario: { nombre: 'Luis', departamento: 'Contabilidad' } };

        const r1 = await registrarDocumento(ana.token, base, pdf1);
        assert.equal(r1.estado, 201, JSON.stringify(r1.datos));
        doc1 = r1.datos.documento;
        const envio = await api(`/documentos/${doc1._id}/enviar`, { metodo: 'POST', token: ana.token, cuerpo: { para: [luis.id] } });
        assert.equal(envio.estado, 200, JSON.stringify(envio.datos));

        const r2 = await registrarDocumento(ana.token, { ...base, confidencial: true }, pdf2);
        doc2 = r2.datos.documento;

        const r3 = await registrarDocumento(
            ana.token,
            { ...base, tipoDocumento: 'Oficio', asunto: '=1+1', destinatario: { nombre: 'Gerencia', departamento: 'Gerencia General' } },
            contenidoPdf('oficio')
        );
        doc3 = r3.datos.documento;
    });

    after(async () => {
        await ayudas.detener();
    });

    // ---------- Verificación pública ----------

    it('quien participa en el documento obtiene su enlace de verificación; los demás no', async () => {
        const r = await api(`/documentos/${doc1._id}/enlace-verificacion`, { token: ana.token });
        assert.equal(r.estado, 200);
        assert.equal(r.datos.codigo, doc1.codigoTramite);
        assert.match(r.datos.url, new RegExp(`/verificar/${doc1.codigoTramite}\\?k=[a-f0-9]{12}$`));

        const ajeno = await api(`/documentos/${doc3._id}/enlace-verificacion`, { token: luis.token });
        assert.equal(ajeno.estado, 403);
    });

    it('la consulta pública no requiere sesión y solo muestra datos no personales', async () => {
        const r = await verificar(doc1);
        assert.equal(r.estado, 200, JSON.stringify(r.datos));
        assert.equal(r.datos.existe, true);
        assert.equal(r.datos.documento.codigoTramite, doc1.codigoTramite);
        assert.equal(r.datos.documento.tipoDocumento, 'Memorando');
        assert.equal(r.datos.documento.emisor, 'Secretaría General');
        assert.equal(r.datos.documento.estado, 'Distribuido');
        assert.equal(r.datos.comprobacion, undefined);

        // Ningún nombre de persona (todos los usuarios de prueba tienen el apellido "Prueba")
        assert.ok(!JSON.stringify(r.datos).includes('Prueba'));
    });

    it('sin la clave correcta, un código inexistente y uno existente responden igual', async () => {
        const claveIncorrecta = await verificar(doc1, '', 'clave-falsa-123');
        assert.equal(claveIncorrecta.estado, 404);

        const inexistente = await api(`/publico/verificar/EP-ULEAM-2026-9999?k=${claveDe('EP-ULEAM-2026-9999')}`);
        assert.equal(inexistente.estado, 404);

        assert.deepEqual(claveIncorrecta.datos, inexistente.datos);
    });

    it('rechaza códigos y hashes con formato inválido', async () => {
        const codigo = await api('/publico/verificar/codigo-raro?k=abc');
        assert.equal(codigo.estado, 400);

        const hash = await verificar(doc1, '&hash=no-es-un-hash');
        assert.equal(hash.estado, 400);
    });

    it('compara el hash del archivo con las versiones registradas', async () => {
        const coincide = await verificar(doc1, `&hash=${sha256(pdf1)}`);
        assert.equal(coincide.datos.comprobacion.coincide, true);
        assert.equal(coincide.datos.comprobacion.tipo, 'version');
        assert.equal(coincide.datos.comprobacion.version, 1);
        assert.equal(coincide.datos.comprobacion.esVersionActual, true);

        const otro = await verificar(doc1, `&hash=${sha256(contenidoPdf('otro archivo'))}`);
        assert.equal(otro.datos.comprobacion.coincide, false);
    });

    it('una versión anterior sigue siendo auténtica pero se indica que no es la vigente', async () => {
        const formulario = new FormData();
        formulario.append('comentario', 'Corrección');
        formulario.append('archivo', new Blob([contenidoPdf('version dos')], { type: 'application/pdf' }), 'v2.pdf');

        // doc3 está en Generado: admite nuevas versiones
        const version = await api(`/documentos/${doc3._id}/versiones`, { metodo: 'POST', token: ana.token, formulario });
        assert.equal(version.estado, 201, JSON.stringify(version.datos));

        const antigua = await verificar(doc3, `&hash=${sha256(contenidoPdf('oficio'))}`);
        assert.equal(antigua.datos.comprobacion.coincide, true);
        assert.equal(antigua.datos.comprobacion.version, 1);
        assert.equal(antigua.datos.comprobacion.esVersionActual, false);
    });

    it('también reconoce el hash de un anexo', async () => {
        const png = contenidoPng('anexo publico');
        const anexo = await subirAnexos(ana.token, doc3._id, {
            archivos: [{ contenido: png, nombre: 'foto.png', tipo: 'image/png' }]
        });
        assert.equal(anexo.estado, 201, JSON.stringify(anexo.datos));

        const r = await verificar(doc3, `&hash=${sha256(png)}`);
        assert.equal(r.datos.comprobacion.coincide, true);
        assert.equal(r.datos.comprobacion.tipo, 'anexo');
        assert.equal(r.datos.comprobacion.anexo, 'foto.png');
    });

    it('un documento confidencial no muestra ningún dato, solo si el archivo coincide', async () => {
        const sinHash = await verificar(doc2);
        assert.equal(sinHash.estado, 200);
        assert.equal(sinHash.datos.confidencial, true);
        assert.equal(sinHash.datos.documento, undefined);

        const conHash = await verificar(doc2, `&hash=${sha256(pdf2)}`);
        assert.equal(conHash.datos.comprobacion.coincide, true);
        assert.equal(conHash.datos.comprobacion.version, null, 'No debe revelar el número de versión');
        assert.equal(conHash.datos.documento, undefined);
    });

    it('un PDF redactado en el sistema (con QR) se verifica con el hash de su archivo', async () => {
        const redactado = await api('/documentos/redactar', {
            metodo: 'POST',
            token: ana.token,
            cuerpo: {
                tipoDocumento: 'Memorando',
                asunto: 'Documento con código QR',
                motivo: 'Prueba',
                destinatario: { departamento: 'Contabilidad' },
                cuerpo: 'Este documento incluye un código QR de verificación al final de la hoja.'
            }
        });
        assert.equal(redactado.estado, 201, JSON.stringify(redactado.datos));
        const documento = redactado.datos.documento;

        const archivo = await api(`/documentos/${documento._id}/versiones/1/archivo?modo=descargar`, { token: ana.token });
        assert.equal(archivo.estado, 200);
        assert.equal(sha256(archivo.datos), documento.hashActual);

        const r = await verificar(documento, `&hash=${sha256(archivo.datos)}`);
        assert.equal(r.datos.comprobacion.coincide, true);
        assert.equal(r.datos.comprobacion.esVersionActual, true);
    });

    // ---------- Estadísticas ----------

    it('las estadísticas de un funcionario cuentan solo los documentos en que participa', async () => {
        const r = await api('/estadisticas', { token: luis.token });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));
        assert.equal(r.datos.alcance, 'personal');
        assert.equal(r.datos.totales.documentos, 2);
        assert.equal(r.datos.porEstado.find((x) => x.clave === 'Distribuido').total, 1);
        assert.equal(r.datos.porTipo.find((x) => x.clave === 'Memorando').total, 2);
        assert.equal(r.datos.tramite.recibidosSinLeer, 1);
        assert.equal(r.datos.porMes.length, 6);
    });

    it('las de Superadmin son de alcance institucional y excluyen los confidenciales ajenos', async () => {
        const r = await api('/estadisticas', { token: admin.token });
        assert.equal(r.datos.alcance, 'institucion');
        assert.equal(r.datos.totales.confidenciales, 0, 'El confidencial de Ana no debe contarse');

        const ahora = new Date().toISOString().slice(0, 7);
        assert.equal(r.datos.porMes[5].mes, ahora);
        assert.ok(r.datos.porMes[5].total >= 2);
    });

    it('las estadísticas exigen sesión', async () => {
        assert.equal((await api('/estadisticas')).estado, 401);
    });

    // ---------- Reportes ----------

    const filasDe = (texto) => texto.split('\r\n').filter(Boolean);

    it('el reporte de documentos es un CSV para Excel con solo los documentos visibles', async () => {
        const r = await api('/reportes/documentos', { token: luis.token });
        assert.equal(r.estado, 200);

        const texto = r.datos.toString('utf8');
        assert.equal(texto.charCodeAt(0), 0xfeff, 'Debe empezar con la marca BOM para que Excel lea las tildes');
        const filas = filasDe(texto);
        assert.match(filas[0], /Código de trámite;Número;Tipo/);
        assert.equal(filas.length, 3, 'Encabezado y los dos documentos de Luis');
        assert.ok(texto.includes(doc1.codigoTramite));
        assert.ok(!texto.includes(doc2.codigoTramite), 'El confidencial ajeno no debe aparecer');
        assert.ok(!texto.includes(doc3.codigoTramite), 'El oficio de otra area no debe aparecer');
    });

    it('permite filtrar por estado, tipo y fechas, y valida los parámetros', async () => {
        const archivado = await api('/reportes/documentos?estado=Archivado', { token: luis.token });
        assert.equal(filasDe(archivado.datos.toString('utf8')).length, 1, 'Solo el encabezado');

        const distribuido = await api('/reportes/documentos?estado=Distribuido&tipo=Memorando', { token: luis.token });
        assert.equal(filasDe(distribuido.datos.toString('utf8')).length, 2);

        assert.equal((await api('/reportes/documentos?estado=Inventado', { token: luis.token })).estado, 400);
        assert.equal((await api('/reportes/documentos?tipo=Inventado', { token: luis.token })).estado, 400);
        assert.equal((await api('/reportes/documentos?desde=hoy', { token: luis.token })).estado, 400);
        assert.equal((await api('/reportes/documentos?desde=2026-12-31&hasta=2026-01-01', { token: luis.token })).estado, 400);
    });

    it('protege las celdas contra fórmulas de Excel', async () => {
        const r = await api('/reportes/documentos', { token: ana.token });
        const texto = r.datos.toString('utf8');
        assert.ok(texto.includes("'=1+1"), 'El asunto "=1+1" debe exportarse como texto, no como fórmula');
        assert.ok(!texto.includes(';=1+1;'));
    });

    it('el reporte de la bitácora exige el permiso y registra quién exportó qué', async () => {
        const sinPermiso = await api('/reportes/bitacora', { token: luis.token });
        assert.equal(sinPermiso.estado, 403);

        const r = await api('/reportes/bitacora', { token: admin.token });
        assert.equal(r.estado, 200);
        const texto = r.datos.toString('utf8');
        assert.match(texto.split('\r\n')[0], /Fecha y hora;Acción/);
        assert.ok(texto.includes('REPORTE_EXPORTADO'), 'Las exportaciones anteriores deben figurar en la bitácora');
        assert.ok(texto.includes('DOCUMENTO_ENVIADO'));
    });

    it('la bitácora sigue íntegra después de las exportaciones', async () => {
        const r = await api('/bitacora/auditoria', { metodo: 'POST', token: admin.token });
        assert.equal(r.datos.bitacora.integra, true);
    });
});