# V3.0 - Migración SPA Híbrida y Rediseño Directo de Modales en Gestión

Fecha: 2026-08-08
Versión: 3.0.0
Estado: En progreso (5 de 12 páginas migradas).

---

## 🗂️ Rediseño UI/UX de Gestión — Formularios Directos en Modales (`dashboard-data.html`)

### 1. Apertura Directa de Formularios en Modales
*   Se eliminaron botones secundarios de alternancia y paneles ocultos (`display: none`).
*   Al abrir cada modal desde su tarjeta Bento Hero, el formulario correspondiente aparece **100% visible y listo para ingresar o editar parámetros de inmediato**:
    - **Modal 1**: Todos los parámetros de captura operativa (Contexto, Críticos, Presiones y VSD).
    - **Modal 2**: Medición completa de Producción Técnica (Potencial, BBPD, AyS%, BNPD, EF, CAT).
    - **Modal 3**: Ficha Fija BES Maestra (Bomba, Motor, Sensor, Profundidad, VSD, Overload, Underload).
*   Auto-enfoque al selector de pozo al desplegar el modal.

### 2. Opciones de Importación Masiva Excel/CSV
*   Colocados en bloques desplegables opcionales en la parte inferior de cada modal.

---

## Fase 1 y 2 — Motor SPA Híbrido

### Páginas Migradas
| Página | Controlador | Init | Destroy |
|---|---|---|---|
| `dashboard.html` | [charts.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/charts.js) | `initDashboard()` | `destroyDashboard()` |
| `campo-admin.html` | [campo-admin.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/campo-admin.js) | `initCampoAdmin()` | `destroyCampoAdmin()` |
| `data.html` | [data-controller.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/data-controller.js) | `initData()` | `destroyData()` |
| `dashboard-data.html` | [dashboard-data-controller.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/dashboard-data-controller.js) | `initDashboardData()` | `destroyDashboardData()` |
| `stats.html` | [estadisticas.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/estadisticas.js) | `initEstadisticas()` | `destroyEstadisticas()` |
