# Resolución de Diferencia de Registros y Límite de 1000 Filas (Supabase PostgREST)

Este documento detalla la investigación, diagnóstico y solución aplicados para resolver la discrepancia de registros entre el **Consolidado** (1013 reportes) y las pantallas de **Admin Campo / Estadísticas** (967 reportes) para el contrato de Ceiba/Tomoporo.

---

## 1. El Problema (Discrepancia 967 vs 1013)

* **Consolidado**: Mostraba **1013** reportes aprobados.
* **Admin Campo y Estadísticas**: Mostraban **967** reportes (320 en agosto y 647 en julio).
* **Diferencia**: Faltaban exactamente **46** reportes.

---

## 2. Diagnóstico y Causas Raíz

### Causa 1: Ámbitos Operativos en `NULL` (Base de Datos)
Al inicio, se detectó que la jornada Diurna del **04 de agosto de 2026** (`journey_id: ef6c3fe7-f685-47e3-8e10-e2bd52963337`) y sus **15** registros asociados tenían la columna `operational_scope` en `NULL`. Debido a esto:
* El consolidado (que autodetecta el contrato usando reglas de nombres de pozos) sí los contaba.
* El frontend de Campo los ignoraba porque filtra estrictamente por `operational_scope = 'ceiba_tomoporo'`.

### Causa 2: Límite de 1000 filas de Supabase PostgREST (Frontend)
Incluso después de corregir el `NULL` en la base de datos a `'ceiba_tomoporo'`, la web seguía mostrando 967. 
Al realizar un diagnóstico en la consola del navegador, se descubrió lo siguiente:
* El frontend obtenía las jornadas válidas consultando primero la tabla `field_journey_records` filtrando por el catálogo de pozos activos, solicitando un límite de 10000 registros (`.limit(10000)`).
* **Supabase / PostgREST** tiene un límite estricto de seguridad de **1000 filas por petición** configurado en el servidor.
* Dado que el total de registros acumulados de todos los contratos superaba los 1000, los registros de la jornada Diurna del 4 de agosto quedaban fuera de las primeras 1000 filas devueltas.
* Al no recibir esos registros de pozos, el frontend asumía que la jornada del 4 de agosto estaba vacía y la ocultaba por completo, perdiendo reportes en el camino.

---

## 3. Soluciones Aplicadas

### Paso 1: Corrección y Backfill en la Base de Datos
Se ejecutaron sentencias SQL en el editor de Supabase para asignar el ámbito correcto a todos los registros históricos que lo tuvieran en `NULL`:

```sql
-- 1. Actualizar jornadas huérfanas
UPDATE public.field_journeys
SET operational_scope = 'ceiba_tomoporo'
WHERE operational_scope IS NULL;

-- 2. Actualizar reportes de pozos huérfanos
UPDATE public.field_journey_records
SET operational_scope = 'ceiba_tomoporo'
WHERE operational_scope IS NULL;
```

Esto cuadró la base de datos perfectamente en **1013 reportes en ambas tablas**.

### Paso 2: Optimización de Consultas en el Frontend
Para evitar el límite de 1000 registros, se modificó la lógica de consulta en el código JS. En lugar de consultar primero todos los registros de pozos para deducir las jornadas, ahora consultamos las jornadas de forma directa mediante la columna indexada `operational_scope`.

#### Archivo: `js/services/field-journey-service.js`
Se reescribieron las funciones `getAdminFieldJourneys` y `getAdminFieldJourneyPendingCount`:
* **Antes**: Hacían un `select('journey_id')` a `field_journey_records` limitado a 10000 (pero truncado a 1000 por Supabase).
* **Ahora**: Hacen un `select('*')` directo a `field_journeys` filtrando por `.eq('operational_scope', scopeGuard.operationalScope)`. Como el número de jornadas históricas es muy bajo (apenas ~62), la consulta nunca llegará al límite de 1000.

#### Archivo: `js/estadisticas.js`
Se optimizó la función `loadData` de la misma manera:
* Se reemplazó la búsqueda preliminar en `field_journey_records` por una consulta directa a `field_journeys` utilizando `operational_scope` y el rango de fechas del mes seleccionado.

---

## 4. Resultados e Impacto
* **Exactitud**: El total de reportes de Ceiba/Tomoporo cargados en la web ahora es **1013**, cuadrando al 100% con el consolidado.
* **Velocidad**: El tiempo de carga de las páginas web disminuyó notablemente, ya que el navegador no tiene que descargar miles de registros solo para construir la lista de jornadas en la bandeja.
* **Escalabilidad**: El sistema ahora es inmune al límite de 1000 registros de Supabase a medida que se sigan agregando jornadas y reportes en el futuro.
