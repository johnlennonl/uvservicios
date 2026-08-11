# V3.0 - Plan de Refactorización Limpia y Fase 2

Fecha: 2026-08-07
Versión: 3.0.0-PlanRefactor
Estado: Planificado para ejecución en la siguiente sesión.

Este documento establece la estrategia técnica para limpiar la deuda técnica ("código sucio") de la plataforma y ejecutar la **Fase 2** de la migración SPA, garantizando un código modular, legible y libre de riesgos.

---

## Parte 1: Refactorización y Limpieza de "Código Sucio"

Para que el proyecto sea mantenible y cargue aún más rápido, limpiaremos la estructura de archivos HTML extrayendo los bloques masivos de código embebido.

### 1. Extracción de CSS Embebido en Campo Admin
*   **Problema:** `campo-admin.html` contiene 3,987 líneas de estilos CSS en su cabecera, aumentando el archivo a 151KB de código mixto.
*   **Solución:**
    *   Crear el archivo externo [css/campo-admin-page.css](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/css/campo-admin-page.css).
    *   Mudar todas las reglas CSS del bloque `<style>` a este archivo.
    *   Vincular el archivo en `campo-admin.html`:
        ```html
        <link rel="stylesheet" href="css/campo-admin-page.css">
        ```
    *   El enrutador SPA cargará este archivo automáticamente cuando el usuario entre a Campo y lo limpiará al salir.
    *   **Resultado:** `campo-admin.html` se reduce a solo ~470 líneas de código limpio de estructura HTML.

### 2. Extracción de JavaScript Embebido en Vistas de Datos
*   **Problema:** `data.html` y `dashboard-data.html` tienen scripts inline pesados (~600 y ~300 líneas respectivamente), dificultando su mantenimiento.
*   **Solución:**
    *   Crear los controladores modulares:
        *   `js/modules/data-controller.js` (para `data.html`).
        *   `js/modules/dashboard-data-controller.js` (para `dashboard-data.html`).
    *   Mudar la lógica JavaScript a estos archivos y exportar las funciones de ciclo de vida `init()` y `destroy()`.
    *   Cargar el enrutador en dichos archivos HTML:
        ```html
        <script type="module" src="js/services/router.js"></script>
        ```

---

## Parte 2: Fase 2 - Migración al Enrutador SPA

Una vez limpiado el código, expandiremos el enrutador híbrido agregando las siguientes páginas al mapeo de rutas SPA en `js/services/router.js`:

### 1. Sección de Datos (`data.html` y `dashboard-data.html`)
*   Se añadirán al objeto `ROUTES` del enrutador.
*   El enrutador inyectará su contenido y ejecutará la carga de sus nuevos controladores asíncronos (`data-controller.js` y `dashboard-data-controller.js`).

### 2. Sección de Estadísticas (`stats.html`)
*   Se encapsulará el archivo `js/estadisticas.js` bajo las funciones exportables `initEstadisticas()` y `destroyEstadisticas()`.
*   Se limpiarán los ApexCharts de tendencias de producción y tiempos al salir de la sección para evitar fugas de memoria.

---

## Matriz de Rutas de la Fase 2 en `router.js`

El enrutador central se actualizará para incluir las nuevas rutas:

```js
const ROUTES = {
    'dashboard.html': {
        load: () => import('../charts.js'),
        init: (m) => m.initDashboard(),
        destroy: (m) => m.destroyDashboard()
    },
    'campo-admin.html': {
        load: () => import('../campo-admin.js'),
        init: (m) => m.initCampoAdmin(),
        destroy: (m) => m.destroyCampoAdmin()
    },
    'data.html': {
        load: () => import('../modules/data-controller.js'),
        init: (m) => m.initData(),
        destroy: (m) => m.destroyData()
    },
    'dashboard-data.html': {
        load: () => import('../modules/dashboard-data-controller.js'),
        init: (m) => m.initDashboardData(),
        destroy: (m) => m.destroyDashboardData()
    },
    'stats.html': {
        load: () => import('../estadisticas.js'),
        init: (m) => m.initEstadisticas(),
        destroy: (m) => m.destroyEstadisticas()
    }
};
```
