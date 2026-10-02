// Dirección base de la API. Si cambia el puerto o el servidor, se cambia solo aquí.
export const API_URL = 'http://localhost:3000/api';

// Roles que ven la bitácora y verifican la integridad.
// Solo sirve para mostrar u ocultar botones: el backend es quien realmente lo exige.
export const ROLES_CONTROL = ['Administrador', 'Gerencia', 'Superadmin'];