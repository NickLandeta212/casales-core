# Estado del proyecto

Actualizado: 2026-10-20. Mantener corto: lo hecho en una linea por modulo, lo pendiente en orden de prioridad.

## Hecho
- Base: torres, departamentos, personas, usuarios con 5 roles, permisos por pagina, auditoria.
- Alicuotas: valores vigentes, pago por departamento y por torre con comprobante, aprobacion del tesorero.
- Multas e infracciones con pago y revision.
- Reservas de areas comunes (con QR publico).
- Finanzas por torre con ingresos automaticos de pagos aprobados.
- Comunicados, solicitudes, porteria (visitas y paquetes), encuestas y votaciones.
- Portal "Mi cuenta" del condomino y reporte de morosidad.
- Prioridad alta (migracion 011, 2026-10-20):
  - Cargos extraordinarios del mes con reversion y motivo (Finanzas > Cargos del mes).
  - Bandeja "Revision de pagos" del tesorero con pestanas por estado.
  - Estado de cuenta por departamento en PDF y certificado de paz y salvo numerado.
  - KPIs en el inicio: % al dia, cartera, recaudacion, pagos por revisar.
- Accesos (2026-10-20): el admin consulta Revision de pagos, Estado de cuenta, Pagos departamentos y Morosidad de todo el conjunto; el tesorero edita el valor de alicuota de sus torres (Ajustes > Valor de alicuotas); el pago de torre al conjunto vive en el panel (Torres > Pagar alicuota de torre) y ya no pide login de nuevo.

## En curso
- (nada)

## Pendiente (prioridad media)
1. Egresos: gastos y ordenes de compra con proveedor, RUC, comprobante y anulacion.
2. Presupuesto anual y ejecucion presupuestaria.
3. Asambleas: convocatoria con orden del dia, PDF y correo.
4. Mantenimientos programados con recordatorio.
5. Archivo de documentos (reglamento, actas, contratos).
6. Bitacora de guardia con fotos.

## Pendiente (seguridad)
- `.env` estuvo subido a GitHub en casales-core: cambiar la clave de la base y `JWT_SECRET`.
- Agregar pruebas automaticas al calculo de deuda.
