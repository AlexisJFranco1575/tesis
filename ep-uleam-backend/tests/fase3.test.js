const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ayudas = require('./ayudas');
const Tramite = require('../src/models/Tramite');

const { api, usuarioListo, nuevoUsuario, registrarDocumento, cambiarEstado } = ayudas;

const dentroDe = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

describe('Fase 3: trámite entre personas (bandejas, envío, reasignación y recorrido)', () => {
    let admin;
    let ana; // Secretaría: elabora y envía
    let luis; // Contabilidad: destinatario principal
    let marta; // Tesorería: recibe con copia
    let pedro; // Talento Humano: recibe por reasignación
    let externo; // Ventas: sin relación con el documento al inicio
    let gerente; // Gerencia

    let memoId; // memorando del trámite principal
    let tramiteLuis;
    let tramitePedro;
    let tramiteExterno;

    const enviar = (token, id, cuerpo) => api(`/documentos/${id}/enviar`, { metodo: 'POST', token, cuerpo });
    const bandeja = async (token, nombre, consulta = '') =>
        (await api(`/tramites?bandeja=${nombre}${consulta}`, { token })).datos.items;
    const resumen = async (token) => (await api('/tramites/resumen', { token })).datos;
    const filaDe = (items, documentoId) => items.find((f) => f.documentoId === documentoId);
    const accion = (token, tramite, nombre, cuerpo = {}) =>
        api(`/tramites/${tramite}/${nombre}`, { metodo: 'POST', token, cuerpo });
    const registrarMemo = (token, numeroOficio, sobrescribir = {}) =>
        registrarDocumento(token, {
            numeroOficio,
            tipoDocumento: 'Memorando',
            destinatario: { nombre: 'Luis', departamento: 'Contabilidad' },
            ...sobrescribir
        });

    before(async () => {
        await ayudas.iniciar();
        admin = await ayudas.crearSuperadmin();
        ana = await usuarioListo(admin.token, { departamento: 'Secretaría General', roles: ['Secretaría'] });
        luis = await usuarioListo(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });
        marta = await usuarioListo(admin.token, { departamento: 'Tesorería', roles: ['Funcionario'] });
        pedro = await usuarioListo(admin.token, { departamento: 'Talento Humano', roles: ['Funcionario'] });
        externo = await usuarioListo(admin.token, { departamento: 'Ventas', roles: ['Funcionario'] });
        gerente = await usuarioListo(admin.token, { departamento: 'Gerencia General', roles: ['Gerencia'] });

        const r = await registrarMemo(ana.token, 'MEM-001');
        assert.equal(r.estado, 201, JSON.stringify(r.datos));
        memoId = r.datos.documento._id;
    });

    after(async () => {
        await ayudas.detener();
    });

    // ---------- Registro y aprobación por tipo ----------

    it('el remitente del documento es siempre el usuario con sesión y su área', async () => {
        const r = await api(`/documentos/${memoId}`, { token: ana.token });
        assert.equal(r.datos.remitente.departamento, 'Secretaría General');
        assert.equal(r.datos.creadoPor.id, ana.id);
    });

    it('el área del destinatario debe ser del catálogo', async () => {
        const r = await registrarMemo(ana.token, 'MEM-ERR', { destinatario: { nombre: 'X', departamento: 'Área inventada' } });
        assert.equal(r.estado, 400);
        assert.match(r.datos.mensaje, /área/);
    });

    it('un Oficio debe ser aprobado por Gerencia antes de enviarse', async () => {
        const oficio = await registrarDocumento(ana.token, { numeroOficio: 'OF-100' });
        const id = oficio.datos.documento._id;

        const directo = await enviar(ana.token, id, { para: [luis.id] });
        assert.equal(directo.estado, 409);
        assert.match(directo.datos.mensaje, /aprobado/i);

        assert.equal((await cambiarEstado(ana.token, id, 'En Revisión')).estado, 200);
        assert.equal((await cambiarEstado(gerente.token, id, 'Aprobado')).estado, 200);

        const aprobado = await enviar(ana.token, id, { para: [luis.id] });
        assert.equal(aprobado.estado, 200, JSON.stringify(aprobado.datos));
    });

    it('el cambio manual a Distribuido ya no existe', async () => {
        const r = await cambiarEstado(ana.token, memoId, 'Distribuido');
        assert.equal(r.estado, 409);
    });

    // ---------- Enviar ----------

    it('rechaza envíos sin destinatario, con personas inexistentes o con plazo vencido', async () => {
        const sin = await enviar(ana.token, memoId, { para: [] });
        assert.equal(sin.estado, 400);

        const inexistente = await enviar(ana.token, memoId, { para: ['000000000000000000000000'] });
        assert.equal(inexistente.estado, 400);

        const plazo = await enviar(ana.token, memoId, { para: [luis.id], fechaLimite: '2020-01-01' });
        assert.equal(plazo.estado, 400);

        const prioridad = await enviar(ana.token, memoId, { para: [luis.id], prioridad: 'Inventada' });
        assert.equal(prioridad.estado, 400);
    });

    it('un Memorando se envía directamente, con Para, Con copia, plazo y prioridad', async () => {
        const r = await enviar(ana.token, memoId, {
            para: [luis.id],
            copia: [marta.id],
            prioridad: 'Urgente',
            fechaLimite: dentroDe(10),
            comentario: 'Revisar con urgencia'
        });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));
        assert.equal(r.datos.documento.estado, 'Distribuido');
        assert.equal(r.datos.documento.prioridad, 'Urgente');

        const recibidos = await bandeja(luis.token, 'recibidos');
        const fila = filaDe(recibidos, memoId);
        assert.ok(fila, 'El documento debe estar en los recibidos de Luis');
        assert.equal(fila.sinLeer, true);
        assert.equal(fila.prioridad, 'Urgente');
        assert.equal(fila.de.id, ana.id);

        assert.ok(filaDe(await bandeja(marta.token, 'informados'), memoId), 'Marta lo recibe con copia');
        assert.ok(filaDe(await bandeja(ana.token, 'enviados'), memoId));
        assert.ok(!filaDe(await bandeja(ana.token, 'elaboracion'), memoId));
    });

    it('el destinatario y quien recibe con copia lo ven; las demás áreas no', async () => {
        assert.equal((await api(`/documentos/${memoId}`, { token: luis.token })).estado, 200);
        assert.equal((await api(`/documentos/${memoId}`, { token: marta.token })).estado, 200);
        assert.equal((await api(`/documentos/${memoId}`, { token: externo.token })).estado, 403);
        assert.equal((await api(`/documentos/${memoId}`, { token: pedro.token })).estado, 403);
    });

    it('los destinatarios reciben su notificación (urgente como alerta)', async () => {
        const deLuis = (await api('/notificaciones', { token: luis.token })).datos.notificaciones;
        const aviso = deLuis.find((n) => n.titulo === 'Nuevo documento recibido' && n.documento === memoId);
        assert.ok(aviso);
        assert.equal(aviso.tipo, 'ALERTA');

        const deMarta = (await api('/notificaciones', { token: marta.token })).datos.notificaciones;
        assert.ok(deMarta.some((n) => n.titulo === 'Documento recibido con copia'));
    });

    // ---------- Lectura y resumen ----------

    it('el resumen de bandejas cuenta los documentos sin leer', async () => {
        const r = await resumen(luis.token);
        assert.equal(r.recibidos.total, 2); // el memorando y el oficio OF-100 aprobado antes
        assert.equal(r.recibidos.sinLeer, 2);

        const pendientes = await api('/pendientes', { token: luis.token });
        assert.ok(pendientes.datos.items.some((i) => i.clave === 'recibidos-sin-leer'));
    });

    it('abrir el documento marca la lectura una sola vez (acuse de lectura)', async () => {
        tramiteLuis = filaDe(await bandeja(luis.token, 'recibidos'), memoId).tramite;

        assert.equal((await accion(luis.token, tramiteLuis, 'leer')).estado, 200);
        assert.equal((await accion(luis.token, tramiteLuis, 'leer')).estado, 200);

        assert.equal(filaDe(await bandeja(luis.token, 'recibidos'), memoId).estado, 'leido');
        assert.equal((await resumen(luis.token)).recibidos.sinLeer, 1); // queda sin leer el oficio OF-100

        // El remitente ve que el destinatario ya lo leyó
        const detalle = await api(`/tramites/documento/${memoId}`, { token: ana.token });
        const destinatario = detalle.datos.destinatarios.find((d) => d.tipo === 'para');
        assert.equal(destinatario.estado, 'leido');
        assert.ok(destinatario.fechaLectura);
        assert.equal(detalle.datos.recorrido.filter((m) => m.tipo === 'LECTURA').length, 1);
    });

    it('detecta los plazos vencidos', async () => {
        await Tramite.updateOne({ _id: tramiteLuis }, { fechaLimite: new Date(Date.now() - 86400000) });

        assert.equal((await resumen(luis.token)).recibidos.vencidos, 1);
        assert.equal(filaDe(await bandeja(luis.token, 'recibidos'), memoId).vencido, true);
        assert.equal((await bandeja(luis.token, 'recibidos', '&soloVencidos=1')).length, 1);

        const pendientes = await api('/pendientes', { token: luis.token });
        assert.ok(pendientes.datos.items.some((i) => i.clave === 'recibidos-vencidos'));

        await Tramite.updateOne({ _id: tramiteLuis }, { fechaLimite: new Date(Date.now() + 10 * 86400000) });
    });

    it('la búsqueda de la bandeja ignora tildes y mayúsculas', async () => {
        assert.equal((await bandeja(luis.token, 'recibidos', '&texto=MEMORANDO')).length, 1);
        assert.equal((await bandeja(luis.token, 'recibidos', '&texto=inexistente')).length, 0);
    });

    it('una bandeja inexistente se rechaza', async () => {
        const r = await api('/tramites?bandeja=otra', { token: luis.token });
        assert.equal(r.estado, 400);
    });

    // ---------- Reasignar ----------

    it('reasigna el documento: el original pasa a Reasignados y el nuevo responsable lo recibe', async () => {
        const r = await accion(luis.token, tramiteLuis, 'reasignar', { usuarios: [pedro.id], comentario: 'Atender por favor' });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));

        assert.ok(filaDe(await bandeja(luis.token, 'reasignados'), memoId));
        assert.ok(!filaDe(await bandeja(luis.token, 'recibidos'), memoId));

        const fila = filaDe(await bandeja(pedro.token, 'recibidos'), memoId);
        assert.ok(fila);
        assert.equal(fila.de.id, luis.id);
        assert.equal(fila.comentario, 'Atender por favor');
        tramitePedro = fila.tramite;

        // Quien recibe por reasignación pasa a participar en el documento
        assert.equal((await api(`/documentos/${memoId}`, { token: pedro.token })).estado, 200);
    });

    it('no se reasigna dos veces el mismo trámite', async () => {
        const r = await accion(luis.token, tramiteLuis, 'reasignar', { usuarios: [marta.id] });
        assert.equal(r.estado, 409);
    });

    it('no se reasigna a uno mismo ni a quien ya tiene el documento', async () => {
        const aMismo = await accion(pedro.token, tramitePedro, 'reasignar', { usuarios: [pedro.id] });
        assert.equal(aMismo.estado, 400);

        const yaLoTiene = await accion(pedro.token, tramitePedro, 'reasignar', { usuarios: [marta.id] });
        assert.equal(yaLoTiene.estado, 409);
        assert.match(yaLoTiene.datos.mensaje, /ya tiene/);
    });

    it('sin el permiso de enviar no se puede reasignar ni informar', async () => {
        const quitar = await api(`/usuarios/${pedro.id}/permisos`, {
            metodo: 'PATCH',
            token: admin.token,
            cuerpo: { permisosExtra: [], permisosRetirados: ['documentos.enviar'] }
        });
        assert.equal(quitar.estado, 200);

        assert.equal((await accion(pedro.token, tramitePedro, 'reasignar', { usuarios: [externo.id] })).estado, 403);
        assert.equal((await accion(pedro.token, tramitePedro, 'informar', { usuarios: [externo.id] })).estado, 403);

        const devolver = await api(`/usuarios/${pedro.id}/permisos`, {
            metodo: 'PATCH',
            token: admin.token,
            cuerpo: { permisosExtra: [], permisosRetirados: [] }
        });
        assert.equal(devolver.estado, 200);
    });

    // ---------- Informar, archivar y restaurar ----------

    it('informar envía una copia solo para conocimiento', async () => {
        const r = await accion(pedro.token, tramitePedro, 'informar', { usuarios: [externo.id], comentario: 'Para su conocimiento' });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));

        const fila = filaDe(await bandeja(externo.token, 'informados'), memoId);
        assert.ok(fila);
        tramiteExterno = fila.tramite;
        assert.equal((await api(`/documentos/${memoId}`, { token: externo.token })).estado, 200);

        const repetido = await accion(pedro.token, tramitePedro, 'informar', { usuarios: [externo.id] });
        assert.equal(repetido.estado, 409);
    });

    it('archivar exige un motivo, y un trámite archivado se puede restaurar', async () => {
        const sinMotivo = await accion(externo.token, tramiteExterno, 'archivar', {});
        assert.equal(sinMotivo.estado, 400);

        const archivado = await accion(externo.token, tramiteExterno, 'archivar', { comentario: 'Ya revisado' });
        assert.equal(archivado.estado, 200);
        assert.ok(filaDe(await bandeja(externo.token, 'archivados'), memoId));
        assert.ok(!filaDe(await bandeja(externo.token, 'informados'), memoId));

        const restaurado = await accion(externo.token, tramiteExterno, 'restaurar');
        assert.equal(restaurado.estado, 200);
        assert.ok(filaDe(await bandeja(externo.token, 'informados'), memoId));
    });

    it('solo el dueño de la bandeja puede actuar sobre su trámite', async () => {
        const ajeno = await accion(luis.token, tramitePedro, 'archivar', { comentario: 'No me corresponde' });
        assert.equal(ajeno.estado, 404);
    });

    // ---------- Responder ----------

    it('un documento que responde a otro deja el original como respondido al enviarse', async () => {
        const respuesta = await registrarMemo(pedro.token, 'MEM-002', {
            referencia: memoId,
            destinatario: { nombre: 'Ana', departamento: 'Secretaría General' }
        });
        assert.equal(respuesta.estado, 201, JSON.stringify(respuesta.datos));
        const idRespuesta = respuesta.datos.documento._id;
        assert.equal(respuesta.datos.documento.referencia, memoId);

        const envio = await enviar(pedro.token, idRespuesta, { para: [ana.id] });
        assert.equal(envio.estado, 200, JSON.stringify(envio.datos));

        assert.equal(filaDe(await bandeja(pedro.token, 'recibidos'), memoId).estado, 'respondido');

        const detalle = await api(`/documentos/${idRespuesta}`, { token: pedro.token });
        assert.equal(detalle.datos.referenciaDocumento._id, memoId);
    });

    it('no se puede referenciar un documento al que no se tiene acceso', async () => {
        const otro = await registrarMemo(gerente.token, 'MEM-GER', { confidencial: 'true' });
        assert.equal(otro.estado, 201, JSON.stringify(otro.datos));

        const r = await registrarMemo(externo.token, 'MEM-REF', { referencia: otro.datos.documento._id });
        assert.equal(r.estado, 400);
    });

    // ---------- Recorrido y bitácora ----------

    it('el recorrido muestra la hoja de ruta en orden, con los días entre cada paso', async () => {
        const r = await api(`/tramites/documento/${memoId}`, { token: ana.token });
        assert.equal(r.estado, 200);

        const tipos = r.datos.recorrido.map((m) => m.tipo);
        assert.equal(tipos[0], 'ELABORACION');
        for (const esperado of ['ENVIO', 'LECTURA', 'REASIGNACION', 'INFORME', 'ARCHIVO', 'RESTAURACION', 'RESPUESTA']) {
            assert.ok(tipos.includes(esperado), `Falta ${esperado} en el recorrido`);
        }
        assert.ok(r.datos.recorrido.every((m) => typeof m.dias === 'number'));
    });

    it('cada paso del trámite queda en la bitácora', async () => {
        const r = await api('/bitacora?limite=500', { token: admin.token });
        const acciones = r.datos.map((e) => e.accion);
        for (const esperada of [
            'DOCUMENTO_ENVIADO',
            'DOCUMENTO_LEIDO',
            'DOCUMENTO_REASIGNADO',
            'DOCUMENTO_INFORMADO',
            'TRAMITE_ARCHIVADO',
            'TRAMITE_RESTAURADO',
            'DOCUMENTO_RESPONDIDO'
        ]) {
            assert.ok(acciones.includes(esperada), `Falta ${esperada}`);
        }
    });

    // ---------- Confidencial y directorio ----------

    it('un documento confidencial solo lo ven quienes intervienen, ni Gerencia ni Superadmin', async () => {
        const registro = await registrarMemo(ana.token, 'MEM-CONF');
        const id = registro.datos.documento._id;

        const r = await enviar(ana.token, id, { para: [luis.id], confidencial: true });
        assert.equal(r.estado, 200, JSON.stringify(r.datos));

        assert.equal((await api(`/documentos/${id}`, { token: luis.token })).estado, 200);
        assert.equal((await api(`/documentos/${id}`, { token: ana.token })).estado, 200);
        assert.equal((await api(`/documentos/${id}`, { token: gerente.token })).estado, 403);
        assert.equal((await api(`/documentos/${id}`, { token: admin.token })).estado, 403);

        const lista = await api('/documentos', { token: admin.token });
        assert.ok(!lista.datos.some((d) => d._id === id), 'No debe aparecer en el listado de quien no interviene');

        // La verificación de integridad sí alcanza al documento, sin mostrar su contenido
        const verificacion = await api(`/documentos/${id}/verificar`, { metodo: 'POST', token: gerente.token });
        assert.equal(verificacion.estado, 200);
        assert.equal(verificacion.datos.valido, true);
    });

    it('el directorio lista a las personas activas de un área', async () => {
        const r = await api('/directorio?area=Contabilidad', { token: ana.token });
        assert.equal(r.estado, 200);
        assert.ok(r.datos.some((p) => p.id === luis.id));
        assert.ok(r.datos.every((p) => p.departamento === 'Contabilidad'));

        const inexistente = await api('/directorio?area=Inexistente', { token: ana.token });
        assert.deepEqual(inexistente.datos, []);
    });

    it('el directorio no incluye a los usuarios dados de baja', async () => {
        const baja = await nuevoUsuario(admin.token, { departamento: 'Contabilidad', roles: ['Funcionario'] });

        const antes = await api('/directorio?area=Contabilidad', { token: ana.token });
        assert.ok(antes.datos.some((p) => p.id === baja.id));

        await api(`/usuarios/${baja.id}/baja`, { metodo: 'PATCH', token: admin.token, cuerpo: { motivo: 'Prueba' } });

        const despues = await api('/directorio?area=Contabilidad', { token: ana.token });
        assert.ok(!despues.datos.some((p) => p.id === baja.id));
    });
});