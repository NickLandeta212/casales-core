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
