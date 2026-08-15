# 📊 Replicación y Consistencia de Datos (Campo vs Consolidado)

Este documento detalla el flujo de replicación de datos de jornadas de Campo a la tabla consolidada (`consolidated_dashboard_operational`) y el estado de la migración para resolver registros huérfanos.

---

## 1. Flujo de Replicación de Datos (JS Backend)

La propagación de cambios desde la interfaz de administración de Campo hacia la tabla de consolidado general funciona de la siguiente manera:

### A. Edición de Parámetros (Actualización)
* **Jornadas Publicadas (`published` o `approved`):** 
  Al guardar los cambios de un pozo, la función [updateAdminFieldJourneyRecord](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/field-journey-service.js#L2120-L2125) realiza una actualización en caliente en el consolidado llamando a `upsertFieldJourneyIntoConsolidatedDashboard`. Esta función borra el registro consolidado anterior que coincide con el `source_record_id` y realiza un `upsert` con los nuevos datos.
* **Jornadas en Revisión o Borrador (`submitted`, `under_review`, `draft`):** 
  Los cambios quedan guardados únicamente en la tabla de reportes de origen (`field_journey_records`). No se tocan en el consolidado hasta que se publique la jornada completa.

### B. Publicación de Jornadas (Inserción Masiva)
* Al presionar "Publicar", la función [publishAdminFieldJourneyToDashboard](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/field-journey-service.js#L2530-L2533) procesa todos los pozos de la jornada, normaliza sus datos con los perfiles BES activos, y los carga masivamente al consolidado operativo.

### C. Eliminación de Registros
* **Desde la Interfaz:** Al borrar un pozo con [deleteAdminFieldJourneyRecord](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/field-journey-service.js#L2162-L2165), el sistema ejecuta una eliminación física tanto en la tabla de monitoreo como en el consolidado para evitar registros fantasma.

---

## 2. Migración SQL en Standby: Limpieza de Huérfanos

Actualmente, si se elimina una jornada o registro directamente en la base de datos (por ejemplo, mediante comandos SQL manuales), la tabla consolidada puede quedar desfasada debido a que las claves foráneas originales no se configuraron con cascado automático (`ON DELETE SET NULL`).

### Script Desarrollado
👉 **[fix_consolidated_orphans.sql](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/supabase/fix_consolidated_orphans.sql)**

Este script realiza dos acciones críticas:
1. **Limpieza Retrospectiva:** Elimina los **93 registros huérfanos globales** (32 correspondientes al contrato activo actual).
2. **Cascada en Base de Datos (Garbage Collection):** Altera las restricciones `consolidated_dashboard_operational_source_journey_id_fkey` y `consolidated_dashboard_operational_source_record_id_fkey` para usar **`ON DELETE CASCADE`**. Con esto, cualquier borrado directo en la base de datos limpiará automáticamente la tabla consolidada en tiempo real.

> [!IMPORTANT]
> **Estado Actual: STANDBY**
> El script ha sido diseñado y verificado, pero **no se ha ejecutado en Supabase**. Debe ser corrido en el SQL Editor de Supabase cuando se decida proceder con la limpieza física de la base de datos.
