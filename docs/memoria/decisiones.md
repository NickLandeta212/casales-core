# Decisiones

Una entrada por decision: fecha, decision y por que. Lo que esta aqui no se vuelve a preguntar.

- 2026-10-20: No se implementa interes de mora por ahora. Por que: lo pidio el dueno del proyecto.
- 2026-10-20: La alicuota ordinaria sigue implicita (se calcula con el valor vigente); lo que se emite por mes son cargos extraordinarios. Por que: no cambiar flujos ya establecidos.
- 2026-10-20: Una emision de cargos solo se revierte con motivo (10 a 500 caracteres) y si ningun departamento la pago o tiene pago en revision.
- 2026-10-20: (reemplaza la regla de privacidad anterior) La administracion CONSULTA pagos de departamentos, estado de cuenta, morosidad y paz y salvo de todas las torres; APROBAR o RECHAZAR pagos de departamentos sigue siendo solo del tesorero de la torre. En el codigo: `getVisibleTorreIds` para consultar y `getAuthorizedTorreIds` para actuar (`casales-core/src/utils/torreAccess.js`). Por que: lo pidio el dueno del proyecto.
- 2026-10-20: El tesorero define el valor de alicuota de sus torres; el valor general (todas las torres) solo lo cambia la administracion.
- 2026-10-20: El formulario de pago de torre esta dentro del panel (`/dashboard/torres/pagar-alicuota/:torreId`); los enlaces viejos `/pago-alicuota-torre/:id` redirigen ahi. El login vuelve a la pagina pedida (`returnUrl`). Por que: la sesion vive en sessionStorage (por pestana) y abrir otra pestana obligaba a iniciar sesion otra vez.
- 2026-10-20: El paz y salvo solo se emite sin deuda y sin pagos en revision; queda numerado `PYS-ANIO-00001` con quien lo emitio.
- 2026-10-20: La memoria compartida vive en `casales-core/docs/memoria/` y se versiona con git, para que Claude en VS Code y Claude en el proyecto trabajen con el mismo contexto.
- 2026-10-24: Un egreso pagado no se borra desde Finanzas: se anula en Egresos con motivo y su gasto sale de Finanzas; el egreso queda en el historial. Por que: trazabilidad de gastos.
- 2026-10-24: Alcance financiero: la administracion gestiona egresos y presupuesto del conjunto; el tesorero los de sus torres (`casales-core/src/utils/alcanceFinanciero.js`).
- 2026-10-24: Correos de avisos (asambleas, recordatorios) no se envian a cuentas @casales.app; fallar un correo nunca bloquea la operacion.
- 2026-10-24: La bitacora de guardia es de solo lectura una vez guardada. Por que: es un registro de novedades.
- 2026-10-24: El correo de factura se sigue enviando antes de confirmar la aprobacion (si SMTP falla, la aprobacion falla). Por que: el dueno decidio no cambiarlo por ahora.
- 2026-10-24: El paz y salvo solo revisa el anio actual. Por que: decision del dueno.
- 2026-10-24: El admin del conjunto gestiona usuarios (crear, editar, eliminar), p. ej. para asignar tesoreros; no puede crear, modificar, eliminar ni ascender administradores generales (`assertPuedeGestionarRol` en usuarios.controller.js). Por que: lo pidio el dueno.
- 2026-10-24: (reemplaza la anterior) Cada solicitud tiene destino: 'conjunto' (areas comunales o todo el conjunto) la atiende la administracion; 'torre' la atiende el tesorero de esa torre (la administracion solo la consulta). El condomino elige administracion o su torre; la guardia, administracion o cualquier torre; el tesorero envia solo a la administracion. Una foto de evidencia por solicitud y lo sucedido en la descripcion. Por que: lo pidio el dueno.
