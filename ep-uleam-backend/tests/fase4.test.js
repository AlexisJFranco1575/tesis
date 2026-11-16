const fs = require('node:fs');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');
const Version = require('../src/models/Version');

const { api, sha256, usuarioListo, registrarDocumento, cambiarEstado, datosDocumento } = ayudas;

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// DOCX y XLSX son archivos ZIP: empiezan con la firma "PK\x03\x04"
const contenidoZip = (texto) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(texto)]);

describe('Fase 4: numeración automática, redacción con formato institucional y Word/Excel', () => {
    let admin;
    let ana; // Secretaría General (siglas SG)
    let luis; // Contabilidad

    const redactar = (token, sobrescribir = {}) =>
        api('/documentos/redactar', {
            metodo: 'POST',
            token,
            cuerpo: {
                tipoDocumento: 'Memorando',
                asunto: 'Solicitud de equipos',
                motivo: 'Renovación tecnológica',
                fechaOficio: '2026-10-15',
                destinatario: { departamento: 'Contabilidad' },
                cuerpo: 'Estimados señores:\n\nPor medio del presente solicito la renovación de los equipos del área.\n\nAtentamente,',
                ...sobrescribir
            }
        });

    // Sube un archivo como documento principal con el formato indicado
    const subirArchivo = (token, sobrescribir, contenido, mime, nombre) => {
        const formulario = new FormData();
        for (const [clave, valor] of Object.entries(datosDocumento(sobrescribir))) {
            formulario.append(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
        }
        formulario.append('archivo', new Blob([contenido], { type: mime }), nombre);
        return api('/documentos', { metodo: 'POST', token, formulario });
    };

    const descargar = (token, id, numero = 1) =>
        api(`/documentos/${id}/versiones/${numero}/archivo?modo=descargar`, { token });

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await usuarioListo(admin.token, { departamento: 'Secretaría General', roles: ['Secretaría'] });
        luis = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
    });

    after(async () => {
        await ayudas.detener();
    });

    // ---------- Número automático ----------

    it('asigna el número automáticamente por área, tipo y año, con consecutivo independiente', async () => {
        const base = { numeroOficio: '', tipoDocumento: 'Memorando', destinatario: { nombre: 'Luis', departamento: 'Contabilidad' } };
        const pdf = ayudas.contenidoPdf('numeracion');

        const primero = await registrarDocumento(ana.token, base, pdf);
        assert.equal(primero.estado, 201, JSON.stringify(primero.datos));
        assert.equal(primero.datos.documento.numeroOficio, 'SG-2026-0001-MEM');

        const segundo = await registrarDocumento(ana.token, base, ayudas.contenidoPdf('numeracion 2'));
        assert.equal(segundo.datos.documento.numeroOficio, 'SG-2026-0002-MEM');

        // Otro tipo lleva su propio consecutivo
        const oficio = await registrarDocumento(ana.token, { ...base, tipoDocumento: 'Oficio' }, ayudas.contenidoPdf('numeracion 3'));
        assert.equal(oficio.datos.documento.numeroOficio, 'SG-2026-0001-OFI');

        // Otra área lleva el suyo
        const deLuis = await registrarDocumento(luis.token, { ...base, destinatario: { nombre: 'Ana', departamento: 'Secretaría General' } }, ayudas.contenidoPdf('numeracion 4'));
        assert.equal(deLuis.datos.documento.numeroOficio, 'CONT-2026-0001-MEM');
    });

    it('respeta un número escrito a mano y rechaza repetirlo', async () => {
        const manual = await registrarDocumento(ana.token, { numeroOficio: 'manual-77' }, ayudas.contenidoPdf('manual'));
        assert.equal(manual.estado, 201);
        assert.equal(manual.datos.documento.numeroOficio, 'MANUAL-77');

        const repetido = await registrarDocumento(ana.token, { numeroOficio: 'MANUAL-77' }, ayudas.contenidoPdf('manual 2'));
        assert.equal(repetido.estado, 409);
    });

    // ---------- Redactar ----------

    it('redacta un documento: genera el PDF institucional, el número y el hash', async () => {
        const r = await redactar(ana.token);
        assert.equal(r.estado, 201, JSON.stringify(r.datos));

        const documento = r.datos.documento;
        assert.equal(documento.origen, 'redactado');
        assert.match(documento.numeroOficio, /^SG-2026-\d{4}-MEM$/);
        assert.equal(documento.remitente.departamento, 'Secretaría General');
        assert.equal(documento.destinatario.departamento, 'Contabilidad');
        assert.ok(documento.cuerpo.includes('renovación de los equipos'));

        const archivo = await descargar(ana.token, documento._id);
        assert.equal(archivo.estado, 200);
        assert.ok(Buffer.isBuffer(archivo.datos));
        assert.equal(archivo.datos.subarray(0, 5).toString('latin1'), '%PDF-');
        assert.ok(archivo.datos.length > 1500, 'El PDF generado debe tener contenido');
        assert.equal(sha256(archivo.datos), documento.hashActual, 'El hash registrado debe ser el del archivo');
    });

    it('valida los datos al redactar', async () => {
        assert.equal((await redactar(ana.token, { cuerpo: '' })).estado, 400);
        assert.equal((await redactar(ana.token, { cuerpo: 'corto' })).estado, 400);
        assert.equal((await redactar(ana.token, { cuerpo: 'a'.repeat(15001) })).estado, 400);
        assert.equal((await redactar(ana.token, { tipoDocumento: 'Inventado' })).estado, 400);
        assert.equal((await redactar(ana.token, { prioridad: 'Inventada' })).estado, 400);
        assert.equal((await redactar(ana.token, { asunto: '' })).estado, 400);

        const area = await redactar(ana.token, { destinatario: { departamento: 'Área inventada' } });
        assert.equal(area.estado, 400);
        assert.match(area.datos.mensaje, /área/);
    });

    it('acepta tildes, eñes y caracteres que la fuente del PDF no soporta', async () => {
        const r = await redactar(ana.token, {
            asunto: 'Planificación del año — ñandú',
            cuerpo: 'Señores: ¿Podrían confirmar la reunión? ✓ → 😀\n\nGracias por su atención, “muy amable”.'
        });
        assert.equal(r.estado, 201, JSON.stringify(r.datos));
    });

    it('un documento redactado se envía y el destinatario descarga el mismo PDF', async () => {
        const r = await redactar(ana.token);
        const id = r.datos.documento._id;

        const envio = await api(`/documentos/${id}/enviar`, { metodo: 'POST', token: ana.token, cuerpo: { para: [luis.id] } });
        assert.equal(envio.estado, 200, JSON.stringify(envio.datos));

        const archivo = await descargar(luis.token, id);
        assert.equal(archivo.estado, 200);
        assert.equal(sha256(archivo.datos), r.datos.documento.hashActual);
    });

    // ---------- Editar el contenido ----------

    it('editar el contenido crea una nueva versión con otro hash y conserva la anterior', async () => {
        const r = await redactar(ana.token);
        const id = r.datos.documento._id;
        const hashInicial = r.datos.documento.hashActual;

        const edicion = await api(`/documentos/${id}/contenido`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { cuerpo: 'Texto corregido del documento, con otro contenido completo.', comentario: 'Corrección de redacción' }
        });
        assert.equal(edicion.estado, 200, JSON.stringify(edicion.datos));
        assert.equal(edicion.datos.documento.versionActual, 2);
        assert.notEqual(edicion.datos.documento.hashActual, hashInicial);

        const versiones = await api(`/documentos/${id}/versiones`, { token: ana.token });
        assert.equal(versiones.datos.length, 2);
        assert.equal(versiones.datos.find((v) => v.numero === 1).hashArchivo, hashInicial);

        const sinCambios = await api(`/documentos/${id}/contenido`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { cuerpo: 'Texto corregido del documento, con otro contenido completo.' }
        });
        assert.equal(sinCambios.estado, 400);
    });

    it('no se edita el contenido en revisión ni en un documento cargado como archivo', async () => {
        const redactado = await redactar(ana.token);
        const id = redactado.datos.documento._id;

        assert.equal((await cambiarEstado(ana.token, id, 'En Revisión')).estado, 200);
        const enRevision = await api(`/documentos/${id}/contenido`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { cuerpo: 'Intento de cambiar el contenido en revisión.' }
        });
        assert.equal(enRevision.estado, 409);

        const cargado = await registrarDocumento(ana.token, { numeroOficio: '' }, ayudas.contenidoPdf('cargado'));
        const deArchivo = await api(`/documentos/${cargado.datos.documento._id}/contenido`, {
            metodo: 'PATCH',
            token: ana.token,
            cuerpo: { cuerpo: 'Intento de cambiar el contenido de un archivo.' }
        });
        assert.equal(deArchivo.estado, 409);
        assert.match(deArchivo.datos.mensaje, /nueva versión/);
    });

    it('las acciones indican si se puede editar el contenido', async () => {
        const redactado = await redactar(ana.token);
        const a = await api(`/documentos/${redactado.datos.documento._id}`, { token: ana.token });
        assert.equal(a.datos.acciones.editarContenido, true);

        const cargado = await registrarDocumento(ana.token, { numeroOficio: '' }, ayudas.contenidoPdf('cargado 2'));
        const b = await api(`/documentos/${cargado.datos.documento._id}`, { token: ana.token });
        assert.equal(b.datos.acciones.editarContenido, false);
    });

    it('al cambiar el asunto de un documento redactado se genera una nueva versión del PDF', async () => {
        const r = await redactar(ana.token);
        const id = r.datos.documento._id;

        const cambio = await api(`/documentos/${id}`, { metodo: 'PATCH', token: ana.token, cuerpo: { asunto: 'Asunto actualizado' } });
        assert.equal(cambio.estado, 200, JSON.stringify(cambio.datos));
        assert.equal(cambio.datos.documento.versionActual, 2);
        assert.notEqual(cambio.datos.documento.hashActual, r.datos.documento.hashActual);
        assert.match(cambio.datos.mensaje, /versión 2/);

        // Los datos que no aparecen en el PDF no generan versión
        const motivo = await api(`/documentos/${id}`, { metodo: 'PATCH', token: ana.token, cuerpo: { motivo: 'Otro motivo interno' } });
        assert.equal(motivo.datos.documento.versionActual, 2);
    });

    it('subir un archivo como nueva versión de un documento redactado lo vuelve documento cargado', async () => {
        const r = await redactar(ana.token);
        const id = r.datos.documento._id;

        const formulario = new FormData();
        formulario.append('comentario', 'Versión final firmada');
        formulario.append('archivo', new Blob([ayudas.contenidoPdf('firmado')], { type: 'application/pdf' }), 'firmado.pdf');
        const version = await api(`/documentos/${id}/versiones`, { metodo: 'POST', token: ana.token, formulario });
        assert.equal(version.estado, 201, JSON.stringify(version.datos));
        assert.equal(version.datos.documento.origen, 'cargado');
        assert.equal(version.datos.documento.acciones.editarContenido, false);
    });

    // ---------- Integridad del PDF generado ----------

    it('la verificación de integridad detecta la alteración de un PDF generado', async () => {
        const r = await redactar(ana.token);
        const id = r.datos.documento._id;

        const limpio = await api(`/documentos/${id}/verificar`, { metodo: 'POST', token: admin.token });
        assert.equal(limpio.datos.valido, true);

        const version = await Version.findOne({ documento: id });
        fs.appendFileSync(version.rutaArchivo, 'alterado');

        const alterado = await api(`/documentos/${id}/verificar`, { metodo: 'POST', token: admin.token });
        assert.equal(alterado.datos.valido, false);
        assert.equal(alterado.datos.bloqueado, true);
    });

    // ---------- Word y Excel ----------

    it('acepta Word y Excel como archivo principal del documento', async () => {
        const docx = contenidoZip('contenido de word');
        const word = await subirArchivo(ana.token, { numeroOficio: '' }, docx, MIME_DOCX, 'informe.docx');
        assert.equal(word.estado, 201, JSON.stringify(word.datos));
        assert.equal(word.datos.documento.hashActual, sha256(docx));
        assert.equal(word.datos.documento.origen, 'cargado');

        const xlsx = contenidoZip('contenido de excel');
        const excel = await subirArchivo(ana.token, { numeroOficio: '' }, xlsx, MIME_XLSX, 'presupuesto.xlsx');
        assert.equal(excel.estado, 201, JSON.stringify(excel.datos));

        const descarga = await descargar(ana.token, word.datos.documento._id);
        assert.equal(descarga.estado, 200);
        assert.ok(descarga.datos.equals(docx), 'La descarga debe ser idéntica al archivo original');
    });

    it('rechaza un Word falso y los formatos no permitidos', async () => {
        const falso = await subirArchivo(ana.token, { numeroOficio: '' }, Buffer.from('esto no es un zip'), MIME_DOCX, 'falso.docx');
        assert.equal(falso.estado, 400);
        assert.match(falso.datos.mensaje, /no corresponde/);

        const texto = await subirArchivo(ana.token, { numeroOficio: '' }, Buffer.from('texto plano'), 'text/plain', 'nota.txt');
        assert.equal(texto.estado, 400);
        assert.match(texto.datos.mensaje, /Formato no válido/);
    });

    it('una nueva versión puede ser un archivo Word o Excel', async () => {
        const registro = await registrarDocumento(ana.token, { numeroOficio: '' }, ayudas.contenidoPdf('base'));
        const id = registro.datos.documento._id;

        const formulario = new FormData();
        formulario.append('comentario', 'Se pasó a Excel');
        formulario.append('archivo', new Blob([contenidoZip('hoja de calculo')], { type: MIME_XLSX }), 'datos.xlsx');

        const version = await api(`/documentos/${id}/versiones`, { metodo: 'POST', token: ana.token, formulario });
        assert.equal(version.estado, 201, JSON.stringify(version.datos));
        assert.equal(version.datos.documento.versionActual, 2);
    });

    it('el listado de documentos no incluye el contenido redactado', async () => {
        const lista = await api('/documentos', { token: ana.token });
        assert.equal(lista.estado, 200);
        assert.ok(lista.datos.length > 0);
        assert.ok(lista.datos.every((d) => !d.cuerpo), 'El listado no debe traer el texto completo de cada documento');
    });
});