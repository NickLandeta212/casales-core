# Estado del proyecto

Actualizado: 2026-10-24. Mantener corto: lo hecho en una linea por modulo, lo pendiente en orden de prioridad.

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
- Prioridad media (migracion 012, 2026-10-24):
  - Egresos con proveedor (RUC), comprobante (imagen o PDF), pago y anulacion con motivo; al pagarse entran a Finanzas.
  - Presupuesto anual por categoria con ejecutado y comprometido.
  - Asambleas: convocatoria con orden del dia, comunicado fijado, PDF y correo con el PDF adjunto.
  - Mantenimientos programados con frecuencia y recordatorio por correo (revisa cada 6 h).
  - Archivo de documentos con visibilidad (todos o solo gestion).
  - Bitacora de guardia con hasta 4 fotos, sin edicion ni borrado.
- Migracion 012 aplicada en Supabase (2026-10-24). El admin del conjunto gestiona usuarios (no administradores generales).
- Solicitudes (migraciones 013 y 014, aplicadas en Supabase, 2026-10-24): envian condomino, tesorero y guardia con una foto de evidencia y eligen destino: administracion (areas comunales o todo el conjunto) o tesoreria de una torre.
- Revision de flujos (2026-10-24): inicio segun rol (sin KPIs falsos), menu movil se cierra al navegar, mensajes de error/exito en personas, multas y usuarios, confirmacion al borrar persona, tablas con scroll horizontal, correccion de acceso en meses de torre y carrera en pago de torre.

## En curso
- (nada)

## Pendiente (otros hallazgos sin cambiar)
- Boton Aprobar multa sin efecto, borrar departamento borra en cascada, personas sin validar duplicados, reservas y porteria/acceso se solapan.

## Pendiente (seguridad)
- `.env` estuvo subido a GitHub en casales-core: cambiar la clave de la base y `JWT_SECRET`.
- Agregar pruebas automaticas al calculo de deuda.
