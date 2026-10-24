// Catalogo unico de roles y permisos de pagina.
// El frontend tiene una copia en casales-ng/src/app/auth/permisos.ts: si cambias algo aqui, actualizala tambien.

const ROLES = ['admin_general', 'admin_conjunto', 'tesorero', 'guardia', 'condomino'];

const PAGES = [
  'home',
  'torres',
  'pagos_alicuota',
  'pagos_alicuota_torre',
  'pagos_torres',
  'pagos_departamentos',
  'departamentos',
  'control_acceso',
  'reservas',
  'personas',
  'personas_crear',
  'multas',
  'multas_crear',
  'gastos_comunes',
  'valores_alicuota',
  'cargos',
  'egresos',
  'presupuesto',
  'mantenimientos',
  'auditoria',
  'usuarios',
  'usuarios_crear',
];

// Grupos de roles usados en las rutas.
const ADMINS = ['admin_general', 'admin_conjunto'];
const GESTION = ['admin_general', 'admin_conjunto', 'tesorero'];

module.exports = { ROLES, PAGES, ADMINS, GESTION };
