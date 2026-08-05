# Riesgo 1 - Documentos con `operational_scope`

Fecha: 2026-08-05

## Estado

Problema abordado el 2026-08-05.

Resuelto en código, SQL y migración ejecutada en Supabase.

Resultado de auditoría ejecutada el 2026-08-05:

```text
operational_scope | documentos
ceiba_tomoporo    | 25
```

No apareció `SIN_SCOPE`, por lo tanto los documentos históricos existentes quedaron asociados correctamente al contrato Ceiba / Tomoporo.

## Problema original

La tabla `public.well_historical_documents` guardaba documentos por `pozo_name`, pero no guardaba el contrato (`operational_scope`).

Eso funcionaba mientras los nombres de pozos fueran únicos, porque la pantalla Base de Datos filtraba por los pozos del contrato activo. Sin embargo, para un blindaje multi-contrato a largo plazo, cada documento debe saber explícitamente a qué contrato pertenece.

## Cambio aplicado

Se agregó soporte para `operational_scope` en tres capas.

### 1. Base de datos

Archivo nuevo:

```text
supabase/add_operational_scope_to_well_documents.sql
```

Ese script hace lo siguiente:

- Agrega la columna `operational_scope` a `well_historical_documents`.
- Agrega relación con `operational_contracts(scope_key)`.
- Rellena documentos existentes usando `field_well_catalog`.
- Crea índices por contrato, pozo y categoría.
- Devuelve auditorías para ver documentos que quedaron sin contrato.

También se actualizó el esquema base:

```text
supabase/well_historical_documents.sql
```

Para instalaciones nuevas, la tabla ya nacerá con `operational_scope`.

### 2. Servicio de documentos

Archivo actualizado:

```text
js/services/well-documents-service.js
```

Cambios:

- `getWellDocuments()` acepta `operationalScope` y filtra por contrato.
- `getWellDocumentSummaryCounts()` acepta `operationalScope` y filtra conteos por contrato.
- `uploadWellDocument()` guarda `operational_scope`.
- Las rutas nuevas de Storage quedan con prefijo de contrato:

```text
contrato/POZO/CATEGORIA/timestamp_archivo
```

Ejemplos:

```text
ceiba_tomoporo/CEI0003/SOPORTES/...
bmm/MG0001/FICHAS_BES/...
```

El servicio mantiene compatibilidad temporal: si la columna aún no existe en Supabase, intenta usar el flujo legacy para no detener la aplicación. Aun así, lo correcto es ejecutar la migración.

### 3. Pantallas que suben documentos

Archivos actualizados:

```text
js/modules/database/database-controller.js
js/modules/field/field-controller.js
```

Base de Datos pasa el contrato activo cuando consulta, cuenta y sube documentos.

Campo pasa `currentOperationalScope` cuando sube soportes o adjuntos desde la captura.

## Pasos ejecutados el 2026-08-05

1. Se creó `supabase/add_operational_scope_to_well_documents.sql`.
2. Se agregó la columna `operational_scope` a `public.well_historical_documents`.
3. Se agregó la relación con `public.operational_contracts(scope_key)`.
4. Se rellenaron documentos históricos usando `public.field_well_catalog`.
5. Se crearon índices por contrato, pozo, categoría y fecha de carga.
6. Se actualizó `supabase/well_historical_documents.sql` para que instalaciones nuevas ya incluyan `operational_scope`.
7. Se actualizó `js/services/well-documents-service.js` para consultar, contar y subir documentos con contrato.
8. Se actualizó `js/modules/database/database-controller.js` para pasar el contrato activo en Base de Datos.
9. Se actualizó `js/modules/field/field-controller.js` para que soportes y adjuntos de Campo guarden el contrato activo.
10. Se ejecutó la migración en Supabase.
11. Se validó la auditoría final: `ceiba_tomoporo | 25 documentos` y sin documentos `SIN_SCOPE`.

## Cómo ejecutar la migración en otro ambiente

En Supabase SQL Editor, ejecutar:

```sql
-- contenido de supabase/add_operational_scope_to_well_documents.sql
```

Al final del script salen dos auditorías. En producción ya fue ejecutado el 2026-08-05.

## Auditoría esperada

Primera auditoría: documentos que quedaron sin contrato.

Resultado ideal:

```text
0 rows
```

Si aparecen pozos, significa que esos `pozo_name` existen en documentos pero no están en `field_well_catalog`. En ese caso hay que cargar o corregir esos pozos en el catálogo.

Segunda auditoría: resumen por contrato.

Resultado esperado:

```text
ceiba_tomoporo | N documentos
bmm            | N documentos
```

Puede aparecer `SIN_SCOPE` si hay documentos históricos de pozos no catalogados.

## Validación funcional

Después de ejecutar el SQL:

1. Entrar a Base de Datos.
2. Seleccionar Ceiba / Tomoporo.
3. Confirmar que solo aparecen pozos CEI/TOM.
4. Abrir un pozo con documentos y confirmar que sus archivos aparecen.
5. Cambiar a BMM.
6. Confirmar que aparecen solo pozos BMM.
7. Cargar un documento de prueba en BMM.
8. Verificar en Supabase que ese registro tiene `operational_scope = 'bmm'`.

Consulta de verificación:

```sql
select
  operational_scope,
  pozo_name,
  categoria,
  nombre_archivo,
  file_path,
  created_at
from public.well_historical_documents
order by created_at desc
limit 20;
```

## Resultado

Con este cambio, los documentos ya no dependen solo del nombre del pozo para saber su contrato. El sistema queda preparado para operar Ceiba / Tomoporo y BMM con separación explícita de metadata documental.

Estado final del Riesgo 1:

```text
ABORDADO / CERRADO
Fecha: 2026-08-05
Evidencia: 25 documentos históricos asociados a ceiba_tomoporo; 0 documentos SIN_SCOPE reportados.
```

## Riesgo residual

Los documentos antiguos conservan su ruta original en Storage si fueron subidos antes del cambio:

```text
POZO/CATEGORIA/archivo
```

Los documentos nuevos usarán ruta con contrato:

```text
contrato/POZO/CATEGORIA/archivo
```

Esto no rompe descargas porque cada documento guarda su `file_path` exacto. No es necesario mover archivos antiguos para que funcionen.

Mover archivos antiguos a carpetas con prefijo de contrato sería una mejora opcional futura, no un requisito para operar.
