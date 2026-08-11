# Estado Actual del SPA Router V3.0 - Diagnóstico y Plan

Fecha: 08 Agosto 2026

---

## 1. Estado de cada módulo en el Router SPA

El router (`js/services/router.js`) espera que cada módulo exporte `init()` y `destroy()`. Aquí está el estado real:

| Página | Módulo JS | `init()` | `destroy()` | Estado |
|---|---|---|---|---|
| `dashboard.html` | `charts.js` | ✅ `initDashboard()` (L1070) | ✅ `destroyDashboard()` (L1380) | **FUNCIONAL** |
| `campo-admin.html` | `campo-admin.js` | ✅ `initCampoAdmin()` | ✅ `destroyCampoAdmin()` | **FUNCIONAL** |
| `data.html` | `modules/data-controller.js` | ✅ `initData()` (L640) | ✅ `destroyData()` (L1864) | **FUNCIONAL** |
| `dashboard-data.html` | `modules/dashboard-data-controller.js` | ✅ `initDashboardData()` (L251) | ✅ `destroyDashboardData()` (L2406) | **FUNCIONAL** |
| `stats.html` | `estadisticas.js` | ✅ `initEstadisticas()` (L69) | ✅ `destroyEstadisticas()` (L2112) | **FUNCIONAL** |
| `gestion-usuarios.html` | `gestion-usuarios.js` | ❌ **NO EXISTE** | ❌ **NO EXISTE** | **🔴 ROTO** |

---

## 2. Diagnóstico: ¿Por qué Dashboard pierde gráficos al venir de Gestión?

**CAUSA**: `gestion-usuarios.js` es el ÚNICO módulo que NO fue migrado al patrón SPA. Todo su código se auto-ejecuta con un `DOMContentLoaded` listener al final del archivo (L1617). No exporta `initGestionUsuarios()` ni `destroyGestionUsuarios()`.

### Lo que pasa paso a paso:

1. Entras a `gestion-usuarios.html` → El router carga el módulo → llama `m.initGestionUsuarios()` → **ERROR: la función no existe** → El router falla silenciosamente
2. `gestion-usuarios.js` se ejecuta de todos modos por su listener `DOMContentLoaded`, registrando listeners globales en `document`
3. Sales hacia `dashboard.html` → El router intenta `destroyGestionUsuarios()` → **ERROR: no existe** → Los listeners de gestión quedan colgados
4. El router carga `dashboard.html` e inyecta el contenido → llama `initDashboard()` correctamente
5. **PERO**: los listeners huérfanos de gestión interfieren con el DOM nuevo y los gráficos Chart.js no logran renderizar

### Problema secundario: `window.location.reload()` en Dashboard

En `initDashboard()` (charts.js L1088), al cambiar de contrato operativo se hace `window.location.reload()`. Esto rompe el ciclo SPA porque recarga la página completa, perdiendo el contexto del router.

---

## 3. Plan de Acción (ordenado por prioridad)

### Paso 1: Migrar `gestion-usuarios.js` al patrón SPA ⬅️ URGENTE

Refactorizar para que:
- Todo el código de bootstrap se encapsule dentro de `export async function initGestionUsuarios()`
- Se cree `export function destroyGestionUsuarios()` que limpie todos los listeners
- Se elimine el `DOMContentLoaded` auto-ejecutable del final

### Paso 2: Eliminar `window.location.reload()` en Dashboard

Cambiar `handleScopeChange` en `initDashboard()` para que recargue los datos internamente en vez de hacer un reload completo de página.

### Paso 3: Verificar campo-admin.html

`campo-admin.html` NO está en la lista de HTMLs que cargan `router.js`. Confirmar si esto es intencional o si falta agregar.

### Paso 4: Testing integral

Flujo de prueba: Dashboard → Gestión → Dashboard → Datos → Stats → Dashboard. Cada transición debe:
- No parpadear el sidebar
- Conservar gráficos al regresar
- No dejar listeners huérfanos

---

## 4. Archivos que NO se deben tocar

| Archivo | Razón |
|---|---|
| `field.html` / `field-controller.js` | Campo opera de forma independiente, sin router SPA |
| `index.html` | Página de login, fuera del router |

---

## 5. Resumen

El router SPA V3.0 está al **83% de completitud** (5 de 6 módulos migrados). Solo falta migrar `gestion-usuarios.js` al patrón `init/destroy` para que toda la plataforma navegue sin parpadeo y sin pérdida de gráficos.
