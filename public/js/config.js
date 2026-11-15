// Configuración del frontend: de dónde salen y dónde se guardan las tareas.
//
//   'api'      -> Express + PostgreSQL (versión local). Es el valor de este archivo fuente.
//   'session'  -> sessionStorage del navegador (demo web en modo invitado).
//
// No se detecta el entorno automáticamente: `npm run build:demo` genera la carpeta
// dist-demo/ con una copia de este archivo que vale 'session'.

export const STORAGE_MODE = 'api';
