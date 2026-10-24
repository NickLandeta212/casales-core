// Catalogos fijos de la gestion administrativa. El frontend los pide a la API (GET /egresos/catalogos),
// asi que agregar una opcion aqui basta para que aparezca en las pantallas.

// Categorias de egreso. El presupuesto anual se arma con estas mismas categorias.
const CATEGORIAS_EGRESO = [
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'servicios_basicos', label: 'Servicios básicos (agua, luz, internet)' },
  { key: 'seguridad', label: 'Seguridad y guardianía' },
  { key: 'limpieza', label: 'Limpieza y jardinería' },
  { key: 'administracion', label: 'Administración y honorarios' },
  { key: 'reparaciones', label: 'Reparaciones' },
  { key: 'fondo_reserva', label: 'Fondo de reserva' },
  { key: 'otros', label: 'Otros' },
];

const CATEGORIA_EGRESO_KEYS = CATEGORIAS_EGRESO.map((categoria) => categoria.key);

module.exports = { CATEGORIAS_EGRESO, CATEGORIA_EGRESO_KEYS };
