const auditoriaModel = require('../models/auditoria.model');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const MODULOS = {
  auth: 'Autenticacion',
  multas: 'Multas',
  alicuotas: 'Alicuotas',
  reservas: 'Reservas',
  personas: 'Personas',
  departamentos: 'Departamentos',
  usuarios: 'Usuarios',
  finanzas: 'Finanzas',
  accesos: 'Control de acceso',
  'mi-cuenta': 'Portal de pagos',
  comunicados: 'Comunicados',
  solicitudes: 'Solicitudes',
  porteria: 'Porteria',
  encuestas: 'Encuestas',
  cargos: 'Cargos extraordinarios',
  'estado-cuenta': 'Estado de cuenta',
};

function describirAccion(method, ruta, status) {
  if (ruta.endsWith('/auth/login')) {
    return status < 400 ? 'Inicio de sesion' : 'Inicio de sesion fallido';
  }

  if (ruta.endsWith('/auth/change-password')) {
    return 'Cambio de contrasena';
  }

  const ultimo = ruta.split('/').filter(Boolean).pop();
  const especiales = {
    aprobar: 'Aprobar',
    rechazar: 'Rechazar',
    comprobante: 'Subir comprobante',
    estado: 'Cambiar estado',
    autorizar: 'Autorizar ingreso',
    salida: 'Registrar salida',
    movilidad: 'Actualizar vehiculo/parqueadero',
    cancelar: 'Cancelar',
    ingreso: 'Registrar ingreso',
    entregar: 'Entregar paquete',
    cerrar: 'Cerrar',
    votar: 'Votar',
    revertir: 'Revertir',
    'paz-y-salvo': 'Emitir paz y salvo',
  };

  if (ruta.includes('/mi-cuenta/pagos/')) {
    return { multas: 'Pagar multas', cargos: 'Pagar cargos' }[ultimo] || 'Pagar alicuotas';
  }

  if (especiales[ultimo]) {
    return especiales[ultimo];
  }

  return { POST: 'Crear', PUT: 'Actualizar', PATCH: 'Actualizar', DELETE: 'Eliminar' }[method] || method;
}

// Registra en la tabla auditoria cada cambio exitoso y cada inicio de sesion fallido.
// Nunca guarda el cuerpo de la peticion (puede contener contrasenas o imagenes).
// Los controladores pueden agregar contexto con res.locals.auditDetalle.
function auditTrail(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  res.on('finish', () => {
    const ruta = req.originalUrl.split('?')[0];
    const esLoginFallido = ruta.endsWith('/auth/login') && res.statusCode === 401;

    if (res.statusCode >= 400 && !esLoginFallido) {
      return;
    }

    const segmento = ruta.replace(/^\/api\/v1\//, '').split('/')[0];
    const usuario = req.user || res.locals.auditUsuario || null;
    const detalleLogin = esLoginFallido ? `Usuario ingresado: ${String(req.body?.username || req.body?.login || '').slice(0, 120)}` : null;

    auditoriaModel.create({
      usuario_id: usuario?.sub ?? usuario?.id,
      usuario_nombre: usuario?.nombre || (usuario ? null : 'Formulario publico'),
      role: usuario?.role,
      modulo: MODULOS[segmento] || segmento,
      accion: describirAccion(req.method, ruta, res.statusCode),
      detalle: res.locals.auditDetalle || detalleLogin,
      metodo: req.method,
      ruta,
      status: res.statusCode,
      ip: req.ip,
    }).catch((error) => {
      console.error('No se pudo registrar la auditoria:', error.message);
    });
  });

  return next();
}

module.exports = auditTrail;
