// Genera el PDF de un documento redactado en el sistema, con el formato institucional
// y un código QR para verificar su autenticidad.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { enlaceDeVerificacion } = require('../utils/verificacion');

const LOGO = path.join(__dirname, '..', 'assets', 'logo-ep-uleam.png');

const MARGEN = 70;
const ANCHO_PAGINA = 595.28; // A4
const ANCHO = ANCHO_PAGINA - MARGEN * 2;

const AZUL = '#004499';
const AZUL_MEDIO = '#0059a8';
const TEXTO = '#1f2a37';
const SUAVE = '#5b6b7c';
const ROJO = '#b71c1c';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const NOMBRES_TIPO = {
    'Oficio': 'OFICIO',
    'Memorando': 'MEMORANDO',
    'Circular': 'CIRCULAR',
    'Nota': 'NOTA',
    'Resolución': 'RESOLUCIÓN',
    'Informe Técnico': 'INFORME TÉCNICO',
    'Contrato': 'CONTRATO'
};

// Caracteres de la codificación Windows-1252 que están fuera de Latin-1 (los admite la fuente estándar del PDF)
const WIN1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

// El PDF usa una fuente estándar: lo que no pueda dibujar (emojis, flechas, etc.) se reemplaza por "?"
const limpiar = (texto) =>
    Array.from(String(texto ?? '').replace(/\r/g, ''))
        .map((c) => {
            const codigo = c.codePointAt(0);
            if (c === '\n' || c === '\t') return c;
            if (codigo < 32 || (codigo >= 127 && codigo <= 159)) return '';
            return codigo <= 255 || WIN1252_EXTRA.includes(c) ? c : '?';
        })
        .join('');

const fechaLarga = (fecha) => {
    const d = fecha ? new Date(fecha) : new Date();
    return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

const dibujar = (doc, d, qr, enlace) => {
    const tipo = NOMBRES_TIPO[d.tipoDocumento] || limpiar(String(d.tipoDocumento).toUpperCase());
    const numero = limpiar(d.numero || d.codigoTramite);
    const lugar = limpiar(process.env.LUGAR_DOCUMENTOS || 'Manta');

    // ----- Encabezado: logo a la izquierda, tipo y número a la derecha -----
    let yEncabezado = 72;
    if (fs.existsSync(LOGO)) {
        try {
            const imagen = doc.openImage(LOGO);
            const ancho = 125;
            const alto = (imagen.height * ancho) / imagen.width;
            doc.image(imagen, MARGEN, 45, { width: ancho });
            yEncabezado = 45 + alto;
        } catch {
            // si el logo no se puede leer, el documento se genera igual
        }
    } else {
        doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('EP-ULEAM', MARGEN, 50, { lineBreak: false });
    }

    doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL)
        .text(tipo, MARGEN + ANCHO - 260, 52, { width: 260, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(11).fillColor(AZUL_MEDIO)
        .text(`Nro. ${numero}`, MARGEN + ANCHO - 260, 72, { width: 260, align: 'right', lineBreak: false });
    if (d.confidencial) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(ROJO)
            .text('CONFIDENCIAL', MARGEN + ANCHO - 260, 90, { width: 260, align: 'right', lineBreak: false });
    }

    const yLinea = Math.max(yEncabezado, 108) + 8;
    doc.moveTo(MARGEN, yLinea).lineTo(MARGEN + ANCHO, yLinea).lineWidth(1.5).strokeColor(AZUL_MEDIO).stroke();

    // ----- Lugar y fecha -----
    doc.x = MARGEN;
    doc.y = yLinea + 20;
    doc.font('Helvetica').fontSize(10.5).fillColor(TEXTO)
        .text(`${lugar}, ${fechaLarga(d.fecha)}`, MARGEN, doc.y, { width: ANCHO, align: 'right' });
    doc.moveDown(1.2);

    // ----- Para / De / Asunto / Referencia -----
    const fila = (rotulo, valor) => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(AZUL).text(rotulo, MARGEN, y, { width: 68 });
        doc.font('Helvetica').fillColor(TEXTO).text(limpiar(valor), MARGEN + 72, y, { width: ANCHO - 72 });
        doc.moveDown(0.5);
    };

    fila('PARA:', `${d.destinatario.nombre} · ${d.destinatario.departamento}`);
    fila('DE:', `${d.remitente.nombre} · ${d.remitente.departamento}`);
    fila('ASUNTO:', d.asunto);
    if (d.referencia) {
        fila('REFERENCIA:', `${d.referencia.codigoTramite} · ${d.referencia.asunto}`);
    }
    if (d.prioridad && d.prioridad !== 'Normal') {
        fila('PRIORIDAD:', d.prioridad);
    }

    doc.moveDown(0.3);
    const ySeparador = doc.y;
    doc.moveTo(MARGEN, ySeparador).lineTo(MARGEN + ANCHO, ySeparador).lineWidth(0.5).strokeColor('#b9cde3').stroke();
    doc.y = ySeparador + 14;

    // ----- Cuerpo: un párrafo por cada bloque separado por línea en blanco -----
    doc.font('Helvetica').fontSize(11).fillColor(TEXTO);
    limpiar(d.cuerpo)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((parrafo) => {
            doc.text(parrafo, MARGEN, doc.y, { width: ANCHO, align: 'justify', lineGap: 2 });
            doc.moveDown(0.8);
        });

    // ----- Firma -----
    if (doc.y > doc.page.height - 200) {
        doc.addPage();
    }
    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(11).fillColor(TEXTO).text('Atentamente,', MARGEN, doc.y, { width: ANCHO });
    doc.moveDown(3.2);
    doc.font('Helvetica-Bold').text(limpiar(d.remitente.nombre), MARGEN, doc.y, { width: ANCHO });
    doc.font('Helvetica').fontSize(10).fillColor(SUAVE)
        .text(limpiar(d.remitente.departamento), MARGEN, doc.y, { width: ANCHO });
    doc.text('Empresa Pública de Producción y Desarrollo Estratégico EP-ULEAM', MARGEN, doc.y, { width: ANCHO });

    // ----- Verificación de autenticidad (código QR) -----
    if (qr) {
        if (doc.y > doc.page.height - 170) {
            doc.addPage();
        }
        doc.moveDown(1.5);
        const y = doc.y;
        const xTexto = MARGEN + 84;
        const anchoTexto = ANCHO - 84;

        doc.image(qr, MARGEN, y, { width: 72 });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL)
            .text('Verifique la autenticidad de este documento', xTexto, y + 4, { width: anchoTexto });
        doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
            .text('Escanee el código QR o ingrese a este enlace y suba el archivo recibido: el sistema comprueba, mediante su hash SHA-256, que no fue alterado.', xTexto, doc.y + 2, { width: anchoTexto });
        doc.fontSize(7.5).fillColor(AZUL_MEDIO).text(enlace, xTexto, doc.y + 3, { width: anchoTexto });
        doc.y = Math.max(doc.y, y + 76);
    }

    // ----- Pie de página en cada hoja -----
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i += 1) {
        doc.switchToPage(i);
        const margenInferior = doc.page.margins.bottom;
        doc.page.margins.bottom = 0; // sin esto, escribir en el pie abriría una hoja nueva
        doc.font('Helvetica').fontSize(8).fillColor(SUAVE).text(
            `Documento generado por el Sistema de Gestión Documental EP-ULEAM · Trámite ${limpiar(d.codigoTramite)} · Página ${i + 1} de ${rango.count}`,
            MARGEN,
            doc.page.height - 40,
            { width: ANCHO, align: 'center', lineBreak: false }
        );
        doc.page.margins.bottom = margenInferior;
    }
};

// Escribe el PDF en "ruta". datos: { tipoDocumento, numero, codigoTramite, fecha, remitente, destinatario,
// asunto, cuerpo, referencia, prioridad, confidencial }
const generarPdfDocumento = async (ruta, datos) => {
    const enlace = enlaceDeVerificacion(datos.codigoTramite);

    // Si el QR no se pudiera generar, el documento se crea igual
    let qr = null;
    try {
        qr = await QRCode.toBuffer(enlace, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 180 });
    } catch (error) {
        console.error('No se pudo generar el código QR:', error.message);
    }

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 70, left: MARGEN, right: MARGEN },
            bufferPages: true,
            info: {
                Title: limpiar(`${datos.tipoDocumento} ${datos.numero || datos.codigoTramite}`),
                Author: limpiar(datos.remitente.nombre),
                Subject: limpiar(datos.asunto),
                Creator: 'Sistema de Gestión Documental EP-ULEAM'
            }
        });

        const salida = fs.createWriteStream(ruta);
        salida.on('finish', () => resolve(ruta));
        salida.on('error', reject);
        doc.on('error', reject);
        doc.pipe(salida);

        try {
            dibujar(doc, datos, qr, enlace);
            doc.end();
        } catch (error) {
            salida.destroy();
            reject(error);
        }
    });
};

module.exports = { generarPdfDocumento };