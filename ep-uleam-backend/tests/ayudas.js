// Utilidades compartidas por las pruebas automáticas del backend.
// Las pruebas usan SU PROPIA base de datos (epuleam_test) y su propia carpeta de archivos:
// nunca tocan los datos reales.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-automaticas-0123456789';
process.env.SETUP_KEY = 'llave-de-instalacion-de-pruebas';
process.env.UPLOADS_DIR = './uploads-test';

const URI_PRUEBAS = process.env.MONGODB_URI_TEST || 'mongodb://mongo:27017/epuleam_test';
if (!/_test(\?.*)?$/.test(URI_PRUEBAS)) {
    throw new Error('Por seguridad, la base de datos de pruebas debe terminar en "_test": las pruebas la BORRAN.');
}
process.env.MONGODB_URI = URI_PRUEBAS;

const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');

const EMAIL_ADMIN = 'admin@uleam.edu.ec';
const CLAVE_ADMIN = 'Cambiar123*';
const CLAVE_TEMPORAL = 'Temporal123';
const CLAVE_NUEVA = 'ClaveNueva2026';

let servidor;
let base = '';
let contador = 0;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Repite la comprobación hasta que devuelva un valor verdadero o se acabe el tiempo
const esperarHasta = async (condicion, ms = 3000) => {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
        const resultado = await condicion();
        if (resultado) {
            return resultado;
        }
        await esperar(50);
    }
    return null;
};

const iniciar = async () => {
    await mongoose.connect(URI_PRUEBAS);
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((modelo) => modelo.syncIndexes()));
    fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });

    await new Promise((resolve) => {
        servidor = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${servidor.address().port}/api`;
};

const detener = async () => {
    await esperar(150); // deja terminar notificaciones pendientes
    servidor.closeAllConnections?.();
    await new Promise((resolve) => servidor.close(resolve));
    await mongoose.disconnect();
    fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
};

// Llamada a la API. Devuelve { estado, datos }: datos es JSON, o un Buffer si es un archivo.
const api = async (ruta, { metodo = 'GET', cuerpo, token, formulario, cabeceras = {} } = {}) => {
    const encabezados = { ...cabeceras };
    if (token) {
        encabezados.Authorization = `Bearer ${token}`;
    }

    let body;
    if (formulario) {
        body = formulario;
    } else if (cuerpo !== undefined) {
        encabezados['Content-Type'] = 'application/json';
        body = JSON.stringify(cuerpo);
    }

    const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers: encabezados, body });
    const tipo = respuesta.headers.get('content-type') || '';
    const datos = tipo.includes('application/json')
        ? await respuesta.json()
        : Buffer.from(await respuesta.arrayBuffer());

    return { estado: respuesta.status, datos };
};

// ---------- Archivos de prueba ----------

const sha256 = (contenido) => crypto.createHash('sha256').update(contenido).digest('hex');

// Un PDF mínimo: lo importante es que empiece con "%PDF-" y que cada texto dé un hash distinto
const contenidoPdf = (texto = 'contenido') => Buffer.from(`%PDF-1.4\n% ${texto}\n%%EOF\n`, 'latin1');

const contenidoPng = (texto = 'imagen') =>
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(texto)]);

// ---------- Usuarios ----------

const entrar = async (email, clave) => {
    const login = await api('/auth/login', { metodo: 'POST', cuerpo: { email, password: clave } });
    assert.equal(login.estado, 200, `Login de ${email}: ${JSON.stringify(login.datos)}`);

    if (!login.datos.usuario.debeCambiarPassword) {
        return { token: login.datos.token, usuario: login.datos.usuario, clave };
    }

    const cambio = await api('/auth/cambiar-password', {
        metodo: 'POST',
        token: login.datos.token,
        cuerpo: { passwordActual: clave, passwordNueva: CLAVE_NUEVA }
    });
    assert.equal(cambio.estado, 200, `Cambio de clave de ${email}: ${JSON.stringify(cambio.datos)}`);
    return { token: cambio.datos.token, usuario: cambio.datos.usuario, clave: CLAVE_NUEVA };
};

const crearSuperadmin = async () => {
    const r = await api('/auth/registrar-admin-inicial', {
        metodo: 'POST',
        cabeceras: { 'x-setup-key': process.env.SETUP_KEY },
        cuerpo: {
            cedula: '1234567890',
            nombres: 'Admin',
            apellidos: 'Sistema',
            email: EMAIL_ADMIN,
            password: CLAVE_ADMIN,
            departamento: 'TIC'
        }
    });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    return entrar(EMAIL_ADMIN, CLAVE_ADMIN);
};

// Crea un usuario con clave temporal (aún no ha iniciado sesión)
const nuevoUsuario = async (tokenAdmin, { departamento, roles }) => {
    contador += 1;
    const email = `usuario${contador}@uleam.edu.ec`;
    const r = await api('/usuarios', {
        metodo: 'POST',
        token: tokenAdmin,
        cuerpo: {
            cedula: String(900000000 + contador).padStart(10, '0'),
            nombres: `Usuario${contador}`,
            apellidos: 'Prueba',
            email,
            departamento,
            roles,
            password: CLAVE_TEMPORAL
        }
    });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    return { id: r.datos.usuario._id, email, clave: CLAVE_TEMPORAL };
};

// Crea un usuario y lo deja con sesión iniciada (ya cambió su clave temporal)
const usuarioListo = async (tokenAdmin, datos) => {
    const nuevo = await nuevoUsuario(tokenAdmin, datos);
    const sesion = await entrar(nuevo.email, nuevo.clave);
    return { id: nuevo.id, email: nuevo.email, token: sesion.token, clave: sesion.clave };
};

// ---------- Documentos ----------

const datosDocumento = (sobrescribir = {}) => ({
    numeroOficio: 'of-2026-001',
    fechaOficio: '2026-10-15',
    tipoDocumento: 'Oficio',
    asunto: 'Solicitud de presupuesto',
    motivo: 'Requerimiento del trimestre',
    observacion: '',
    remitente: { nombre: 'Ana', departamento: 'Secretaria General' },
    destinatario: { nombre: 'Gerardo', departamento: 'Gerencia General' },
    ...sobrescribir
});

const registrarDocumento = async (token, sobrescribir = {}, contenido = contenidoPdf('contenido original')) => {
    const formulario = new FormData();
    for (const [clave, valor] of Object.entries(datosDocumento(sobrescribir))) {
        formulario.append(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
    }
    formulario.append('archivo', new Blob([contenido], { type: 'application/pdf' }), 'oficio.pdf');
    return api('/documentos', { metodo: 'POST', token, formulario });
};

const nuevaVersion = async (token, id, comentario, contenido) => {
    const formulario = new FormData();
    formulario.append('comentario', comentario);
    formulario.append('archivo', new Blob([contenido], { type: 'application/pdf' }), 'version.pdf');
    return api(`/documentos/${id}/versiones`, { metodo: 'POST', token, formulario });
};

// archivos: [{ contenido, nombre, tipo }]
const subirAnexos = async (token, id, { tipoAnexo = 'Factura', descripcion = '', archivos }) => {
    const formulario = new FormData();
    formulario.append('tipoAnexo', tipoAnexo);
    formulario.append('descripcion', descripcion);
    for (const a of archivos) {
        formulario.append('archivos', new Blob([a.contenido], { type: a.tipo }), a.nombre);
    }
    return api(`/documentos/${id}/anexos`, { metodo: 'POST', token, formulario });
};

const cambiarEstado = (token, id, estado, observacion = '') =>
    api(`/documentos/${id}/estado`, { metodo: 'POST', token, cuerpo: { estado, observacion } });

module.exports = {
    EMAIL_ADMIN,
    CLAVE_ADMIN,
    CLAVE_TEMPORAL,
    iniciar,
    detener,
    api,
    esperar,
    esperarHasta,
    sha256,
    contenidoPdf,
    contenidoPng,
    entrar,
    crearSuperadmin,
    nuevoUsuario,
    usuarioListo,
    datosDocumento,
    registrarDocumento,
    nuevaVersion,
    subirAnexos,
    cambiarEstado
};