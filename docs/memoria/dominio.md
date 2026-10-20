# Dominio

## Roles
- `admin_general`, `admin_conjunto`: administran todo el conjunto.
- `tesorero`: aprueba/rechaza pagos de departamentos y lleva finanzas solo de sus torres (`torre_ids`); define el valor de alicuota de sus torres.
- La administracion consulta todo el conjunto, pero no aprueba pagos de departamentos.
- `guardia`: porteria y accesos.
- `condomino`: su departamento en "Mi cuenta".

## Regla de deuda (unica para portal, reportes, PDF y KPIs)
Implementada en `src/models/estado-cuenta.model.js` (`calcularResumen`) y en `morosidad.model.js`.
- Alicuotas: meses del anio en curso hasta el mes actual en estado `pendiente` o `rechazado`.
- Multas: las que siguen `pendiente`.
- Cargos extraordinarios: los que siguen `pendiente`.
- Lo que esta en revision no cuenta como deuda, pero impide emitir el paz y salvo.

## Flujo de pago
El condomino sube el comprobante -> queda en revision -> el tesorero aprueba (entra a finanzas de la torre) o rechaza con motivo (se notifica por correo y vuelve a pendiente).

## Estados
- Cargo: pendiente -> en_pago -> pagado; anulado si se revierte la emision.
- Pago de cargos o multas: en_proceso -> aprobado | rechazado.
- Emision de cargos: activa | revertida.
