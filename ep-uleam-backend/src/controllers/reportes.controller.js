// Exportación de reportes en CSV con formato para Excel: separador ";" (el de las configuraciones
// regionales en español), codificación UTF-8 con marca BOM para que las tildes se vean bien.
const Documento = require('../models/Documento');
const Bitacora = require('../models/Bitacora');
const { esParticipante, normalizar } = require('../utils/acceso');
const { ESTADOS } = require('../config/flujo');
const { TIPOS_DOCUMENTO } = require('../config/clasificacion');
const { registrarAccion } = require('../services/bitacora.service');

const SEPARADOR = ';';
const LIMITE_BITACORA = 5000;

// Evita la "inyección de fórmulas": un texto que empiece con = + - @ se ejecutaría como fórmula en Excel
const celda = (valor) => {
    let texto = String(valor ?? '').replace(/\r?\n/g, ' ');
    if (/^[=+\-@]/.test(texto)) {
        texto = `'${texto}`;
    }
    return /[";]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

const aCsv = (cabecera, filas) =>
    `\uFEFF${[cabecera, ...filas].map((fila) => fila.map(celda).join(SEPARADOR)).join('\r\n')}\r\n`;

const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const fechaHora = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '');
const hoy = () => new Date().toISOString().slice(0, 10);

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lee y valida un rango de fechas AAAA-MM-DD; devuelve { error } si no es válido
const leerRango = (query) => {
    const desde = String(query.desde || '');
    const hasta = String(query.hasta || '');
    if ((desde && !FORMATO_FECHA.test(desde)) || (hasta && !FORMATO_FECHA.test(hasta))) {
        return { error: 'Las fechas deben tener el formato AAAA-MM-DD.' };
    }
    if (desde && hasta && desde > hasta) {
        return { error: 'La fecha inicial no puede ser posterior a la final.' };
    }
    return { desde, hasta };
};

const enviarCsv = (res, nombre, contenido) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}-${hoy()}.csv"`);
    res.send(contenido);
};

// GET /api/reportes/documentos?estado=&tipo=&desde=&hasta=&area=
const reporteDocumentos = async (req, res) => {
    try {
        const estado = String(req.query.estado || '');
        const tipo = String(req.query.tipo || '');
        const area = normalizar(String(req.query.area || ''));

        if (estado && !ESTADOS.includes(estado)) {
            return res.status(400).json({ mensaje: 'El estado indicado no es válido.' });
        }
        if (tipo && !TIPOS_DOCUMENTO.includes(tipo)) {
            return res.status(400).json({ mensaje: 'El tipo de documento indicado no es válido.' });
        }
        const rango = leerRango(req.query);
        if (rango.error) {
            return res.status(400).json({ mensaje: rango.error });
        }

        // Solo los documentos en los que el usuario participa
        const documentos = (await Documento.find().select('-cuerpo').sort({ createdAt: -1 }).lean())
            .filter((d) => esParticipante(req.usuario, d))
            .filter((d) => {
                const fechaDoc = fecha(d.fechaOficio || d.createdAt);
                return (
                    (!estado || d.estado === estado) &&
                    (!tipo || d.tipoDocumento === tipo) &&
                    (!rango.desde || fechaDoc >= rango.desde) &&
                    (!rango.hasta || fechaDoc <= rango.hasta) &&
                    (!area || normalizar(d.remitente?.departamento) === area || normalizar(d.destinatario?.departamento) === area)
                );
            });

        const cabecera = [
            'Código de trámite', 'Número', 'Tipo', 'Asunto', 'Remitente', 'Área del remitente',
            'Destinatario', 'Área del destinatario', 'Estado', 'Prioridad', 'Confidencial',
            'Fecha del documento', 'Fecha de registro', 'Enviado el', 'Plazo', 'Versión',
            'SHA-256 de la versión actual', 'Origen'
        ];
        const filas = documentos.map((d) => [
            d.codigoTramite, d.numeroOficio, d.tipoDocumento, d.asunto,
            d.remitente?.nombre, d.remitente?.departamento,
            d.destinatario?.nombre, d.destinatario?.departamento,
            d.estado, d.prioridad, d.confidencial ? 'Sí' : 'No',
            fecha(d.fechaOficio), fechaHora(d.createdAt), fechaHora(d.enviadoEn), fecha(d.fechaLimite),
            d.versionActual, d.hashActual, d.origen === 'redactado' ? 'Redactado en el sistema' : 'Archivo cargado'
        ]);

        await registrarAccion({
            accion: 'REPORTE_EXPORTADO',
            usuario: req.usuario,
            detalle: `Documentos · ${filas.length} fila(s)${estado ? ` · estado ${estado}` : ''}${tipo ? ` · tipo ${tipo}` : ''}${rango.desde ? ` · desde ${rango.desde}` : ''}${rango.hasta ? ` · hasta ${rango.hasta}` : ''}`
        });

        enviarCsv(res, 'documentos', aCsv(cabecera, filas));
    } catch (error) {
        console.error('Error al generar el reporte de documentos:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

// GET /api/reportes/bitacora?desde=&hasta=   (requiere el permiso de consultar la bitácora)
const reporteBitacora = async (req, res) => {
    try {
        const rango = leerRango(req.query);
        if (rango.error) {
            return res.status(400).json({ mensaje: rango.error });
        }

        const filtro = {};
        if (rango.desde || rango.hasta) {
            filtro.fecha = {};
            if (rango.desde) filtro.fecha.$gte = new Date(`${rango.desde}T00:00:00-05:00`);
            if (rango.hasta) filtro.fecha.$lte = new Date(`${rango.hasta}T23:59:59-05:00`);
        }

        const entradas = await Bitacora.find(filtro).sort({ fecha: -1 }).limit(LIMITE_BITACORA).lean();

        const cabecera = ['Fecha y hora', 'Acción', 'Código de trámite', 'Usuario', 'Rol', 'Detalle', 'Hash', 'Hash anterior'];
        const filas = entradas.map((e) => [
            fechaHora(e.fecha), e.accion, e.codigoTramite, e.usuario?.nombre, e.usuario?.rol, e.detalle, e.hashActual, e.hashAnterior
        ]);

        await registrarAccion({
            accion: 'REPORTE_EXPORTADO',
            usuario: req.usuario,
            detalle: `Bitácora · ${filas.length} fila(s)${rango.desde ? ` · desde ${rango.desde}` : ''}${rango.hasta ? ` · hasta ${rango.hasta}` : ''}`
        });

        enviarCsv(res, 'bitacora', aCsv(cabecera, filas));
    } catch (error) {
        console.error('Error al generar el reporte de la bitácora:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = { reporteDocumentos, reporteBitacora };