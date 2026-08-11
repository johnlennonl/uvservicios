# 📋 PLAN PENDIENTE — Sistema UV Servicios V3.0

> Documento de referencia rápida para el equipo. Actualizar al completar cada ítem.
> Última revisión: 2026-08-08

---

## 🔴 URGENTE

### ~~A. Reparar `gestion-usuarios.js` (SPA Router)~~ ✅ COMPLETADO
- [x] `export async function initGestionUsuarios()` creado
- [x] `export function destroyGestionUsuarios()` creado
- [x] Dom refs capturadas dentro de `_captureDomRefs()` (no al nivel del módulo)
- [x] `DOMContentLoaded` auto-ejecutable eliminado

> ⚠️ **Ficha BES**: Para agregar/editar parámetros fijos de cada pozo (Sistema BES, motor, VSD etc.) se consulta la tabla `well_bes_profile`. Por ahora se accede desde la página **Base de Datos** (`base-datos.html`). A futuro se puede añadir un formulario editable dentro de Gestión.

---

### ~~B. Integrar `consolidado.html` al SPA Router~~ ✅ COMPLETADO
- [x] Agregar `'consolidado.html'` al mapa `ROUTES` en `js/services/router.js`
- [x] Crear `export function initConsolidado()` y `export function destroyConsolidado()` en `js/consolidado.js`
- [x] Quitar el `<script type="module" src="js/consolidado.js">` del HTML (el enrutador lo carga dinámicamente)

**Archivos afectados**: `js/consolidado.js`, `js/services/router.js`, `consolidado.html`

---
### ~~C. Aplicar RLS a tabla `field_tickets` en Supabase~~ ✅ COMPLETADO (Aplicado por John)
- [x] RLS habilitado en la tabla `field_tickets`
- [x] Política select de lectura para usuarios autenticados creada
- [x] Política insert de escritura para usuarios autenticados creada

---

## 🟡 PRÓXIMA ITERACIÓN



### E. Mejora UX Móvil — Formulario de Campo (Wizard por pasos)
Propuesta completa documentada en `notas/V3/PROPUESTA_MEJORA_MOVIL_CAMPO.md`.
- Formulario dividido en pasos progresivos en móvil
- Indicador de sincronización nube verde/amarilla/roja
- Botón "Descartar borrador" ya implementado ✅

---

## ✅ COMPLETADO

- [x] Normalización de estatus `OFF`/`RUN` para CHECK constraint de `monitoreo_pozos`
- [x] Eliminación de fallback forzado a "Todas" en filtro de pendientes de Campo Admin
- [x] Botón "Descartar Borrador" visible en Campo + borrado físico en Supabase
- [x] Alertas KPI apagadas para pozos con estatus OFF en Campo Admin
- [x] Corrección autoría de jornadas BMM (`ingcampobmm@uvservicios.com`)
- [x] Restauración de `logFieldJourneyAudit` en `field-journey-service.js`
- [x] Integración router SPA V3.0 para: Dashboard, Campo Admin, Datos, Datos Consolidados, Estadísticas
- [x] Implementación expandida de bitácora en Pulso de la Jornada (Delta de pozos, subida de adjuntos)
- [x] Prevención física y visual de jornadas duplicadas (auto-fusión en Supabase y advertencia interactiva en Campo)
- [x] Impresión visual de la bitácora Pulso de la Jornada en el reporte PDF exportable
- [x] Reubicación del Pulso de la Jornada en la columna izquierda y remoción de duplicidades de layouts
- [x] Normalización inteligente de tipos de datos en auditoría (horas y decimales) para eliminar falsos positivos
- [x] Corrección de falsos positivos en auditoría retrospectiva de turnos (sólo detecta discrepancias de horario reales)
- [x] Reparación de notificación de nuevas jornadas (toast) en Campo Admin para evitar estiramiento horizontal (width stretch)
- [x] Eliminación de `window.location.reload()` al cambiar contrato en Dashboard (reemplazado por navegación SPA reactiva)
- [x] Módulo dinámico de múltiples reportes/apoyos en Campo con ordenamiento cronológico en portapapeles y almacenamiento en bitácora de base de datos
