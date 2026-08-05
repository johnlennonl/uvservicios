# Flujo actual multi-contrato y Base de Datos

## Objetivo

Este documento explica cómo está funcionando hoy la separación entre contratos en la plataforma UV Servicios, especialmente en Base de Datos & Expediente Digital, Campo, Admin Campo y Estadísticas.

La idea central es simple: Ceiba / Tomoporo y BMM trabajan dentro de la misma aplicación, pero la visualización y captura se separan por contrato usando el alcance operativo (`operational_scope`) y el catálogo de pozos (`field_well_catalog`).

## Contratos activos

Los contratos se registran en `public.operational_contracts`:

- `ceiba_tomoporo`: Ceiba / Tomoporo.
- `bmm`: Barua / Motatan / Mene Grande.

Los pozos se registran en `public.field_well_catalog` con su contrato:

- `pozo_name`: nombre del pozo.
- `campo_name`: campo al que pertenece.
- `operational_scope`: contrato operativo.
- `active`: indica si el pozo está activo.

Mientras cada pozo esté correctamente asignado a su contrato en `field_well_catalog`, la aplicación puede separar la visualización sin mezclar carpetas ni listas de pozos.

## Selector de contrato

El selector global de contrato vive en `js/services/operational-scope-context.js`.

Ese selector define el contrato activo en la sesión del navegador. Las páginas que lo usan cargan datos según ese contrato activo.

Usuarios con permisos amplios, como `admin`, `supervisor`, `base_datos`, `gestor_usuarios` y usuarios de visualización autorizados, pueden cambiar contrato si tienen acceso a más de uno.

Usuarios de Campo normalmente quedan amarrados al contrato asignado a su login. Si un técnico de Ceiba / Tomoporo entra a Campo, trabaja en `ceiba_tomoporo`; si un técnico BMM entra con su login, trabaja en `bmm`.

### Selector de contrato en modo mobile

En pantallas pequeñas el selector no debe desaparecer. La solución aplicada es mantener el mismo selector global, pero en formato compacto:

- Se muestra como un control pequeño con icono de ubicación/contrato.
- En las páginas móviles con selector de contrato queda debajo de la barra superior donde aparece el logo, el título de la sección y el estado `Online`.
- No queda limitado al Dashboard: el componente global crea esa franja móvil automáticamente cuando la página usa selector de contrato.
- Al tocarlo, se abre el selector nativo del teléfono.
- El usuario elige `Ceiba / Tomoporo` o `Mene Grande / Barua / Motatan`.
- Al cambiar, la página recarga los datos del contrato activo igual que en escritorio.

No hace falta crear una pantalla aparte ni un flujo diferente para mobile. El icono funciona como punto visual para encontrar el cambio de contrato, y el `<select>` mantiene el comportamiento seguro del navegador.

## Base de Datos & Expediente Digital

La página `base-datos.html` ahora tiene selector de contrato en la cabecera, junto al botón `Cargar Documento`.

El controlador `js/modules/database/database-controller.js` funciona así:

1. Valida sesión y PIN.
2. Calcula el perfil real del usuario con `getAccessProfile()`.
3. Inicializa el selector de contrato.
4. Carga los pozos desde `field_well_catalog` usando el contrato activo.
5. Renderiza solo las carpetas de esos pozos.
6. Filtra los contadores de documentos para que solo cuenten documentos de pozos visibles en el contrato activo.
7. El selector de subida de documentos solo muestra pozos del contrato activo.

Esto significa:

- Si estás en Ceiba / Tomoporo, ves carpetas de pozos CEI/TOM del catálogo de ese contrato.
- Si cambias a BMM, ves carpetas de pozos BMM.
- Un documento cargado desde la vista BMM solo se puede asignar a un pozo BMM porque el selector de pozos queda filtrado.
- Un documento cargado desde la vista Ceiba / Tomoporo solo se puede asignar a un pozo Ceiba / Tomoporo.

## Cómo se guardan los documentos hoy

La metadata de documentos se guarda en `public.well_historical_documents`.

Campos principales:

- `pozo_name`
- `categoria`
- `nombre_archivo`
- `file_path`
- `file_size`
- `file_type`
- `descripcion`
- `uploaded_by`
- `created_at`

El archivo físico se guarda en Supabase Storage, bucket `expedientes-pozos`, con esta ruta:

```text
POZO/CATEGORIA/timestamp_nombre_archivo
```

Hoy la tabla de documentos no tiene una columna `operational_scope`. La separación se hace por `pozo_name`, comparando contra los pozos del contrato activo en `field_well_catalog`.

Esto funciona correctamente si los nombres de pozos son únicos entre contratos. Actualmente el catálogo define `pozo_name` como único, por lo que no debería haber dos contratos con el mismo nombre exacto de pozo.

## ¿Se mezclan los documentos entre contratos?

En la visualización actual, no deberían mezclarse si el catálogo está bien cargado.

La pantalla no lista todos los documentos globalmente. Primero carga los pozos del contrato activo y luego muestra documentos asociados a esos pozos.

Ejemplo:

- Si `BMM001` está en `field_well_catalog` como `bmm`, aparecerá en BMM.
- Si `CEI0003` está en `field_well_catalog` como `ceiba_tomoporo`, aparecerá en Ceiba / Tomoporo.
- Si un documento tiene `pozo_name = CEI0003`, no aparecerá en BMM porque `CEI0003` no pertenece al catálogo BMM.

## ¿El nuevo contrato afecta el contrato viejo?

No debería afectar el contrato viejo mientras se cumplan estas condiciones:

1. Los pozos Ceiba / Tomoporo siguen asignados a `ceiba_tomoporo` en `field_well_catalog`.
2. Los pozos BMM están asignados a `bmm` en `field_well_catalog`.
3. Los usuarios de cada contrato tienen bien configurado su alcance en `user_operational_scopes`.
4. Las páginas usan el contrato activo para consultar datos, como ya lo hacen Campo, Admin Campo, Estadísticas y ahora Base de Datos.

El contrato viejo sigue funcionando sobre sus pozos, sus jornadas y sus documentos. Agregar BMM no borra ni mueve datos de Ceiba / Tomoporo.

## Campo y Admin Campo

Campo y Admin Campo ya trabajan con `operational_scope`.

En Campo:

- Los técnicos ven pozos y técnicos del contrato activo.
- Los borradores locales se guardan por contrato.
- Las jornadas se guardan en `field_journeys` y `field_journey_records` con `operational_scope`.

En Admin Campo:

- Las jornadas se filtran por contrato.
- Admin puede cambiar contrato si su perfil lo permite.
- La publicación y revisión trabajan sobre las jornadas del contrato seleccionado.

El caso reciente de una jornada nocturna partida en dos no mostró mezcla de BMM con Ceiba / Tomoporo. La evidencia indicó dos borradores/enviados del mismo usuario y contrato, probablemente por salida, recarga, doble pestaña o pérdida de referencia local del borrador.

## Estadísticas

Estadísticas usa el contrato activo para decidir qué pozos y jornadas entran en los cálculos.

La lógica actual evita contar pozos de otros contratos cuando el contrato activo es uno específico.

Esto ayuda a que Ceiba / Tomoporo y BMM tengan métricas separadas.

## Riesgos reales actuales

El sistema puede funcionar así, pero hay puntos importantes que conviene tener presentes.

## Control de riesgos

Actualizado: 2026-08-05

| Riesgo | Estado | Fecha | Evidencia |
| --- | --- | --- | --- |
| 1. Documentos sin `operational_scope` | Abordado / cerrado | 2026-08-05 | Migración ejecutada; `ceiba_tomoporo = 25`; sin `SIN_SCOPE`. |
| 2. Catálogo incompleto | Abordado / validado | 2026-08-05 | Al cambiar a BMM en Base de Datos se muestran pozos BMM. |
| 3. Usuario mal asignado | Abordado en código / gestionable desde UI | 2026-08-05 | `cliente_view` ya no tiene acceso universal; Gestión permite elegir un contrato o `Ambos`. |
| 4. Doble borrador en Campo | Pendiente de decisión | 2026-08-05 | Caso real identificado; falta decidir si se agrega alerta/bloqueo. |

### Riesgo 1: documentos sin `operational_scope`

Estado al 2026-08-05: problema abordado y cerrado. La migración fue ejecutada en Supabase.

Resultado de auditoría:

```text
operational_scope | documentos
ceiba_tomoporo    | 25
```

No apareció `SIN_SCOPE`, así que no quedaron documentos históricos sin contrato.

Hoy los documentos se separan por `pozo_name`, no por columna directa de contrato.

Esto está bien mientras los nombres de pozos sean únicos. El catálogo actual exige unicidad por `pozo_name`, así que el riesgo es bajo.

Blindaje implementado:

- Agregar `operational_scope` a `well_historical_documents`.
- Rellenar documentos existentes desde `field_well_catalog`.
- Guardar documentos nuevos con `operational_scope`.
- Guardar rutas nuevas de Storage como `contrato/pozo/categoria/archivo`.
- Crear índices por `operational_scope, pozo_name, categoria`.
- Filtrar consultas y conteos por contrato activo.

Archivos relacionados:

- `supabase/add_operational_scope_to_well_documents.sql`
- `supabase/well_historical_documents.sql`
- `js/services/well-documents-service.js`
- `js/modules/database/database-controller.js`
- `js/modules/field/field-controller.js`

Nota detallada: `notas/README_DOCUMENTOS_OPERATIONAL_SCOPE.md`.

### Riesgo 2: catálogo incompleto

Estado al 2026-08-05: problema abordado / validado.

Evidencia funcional:

- El selector de contrato en Base de Datos permite cambiar entre Ceiba / Tomoporo y BMM.
- Al seleccionar BMM, se muestran pozos del contrato BMM.
- Esto confirma que `field_well_catalog` tiene pozos BMM activos y que la pantalla está leyendo el catálogo por contrato activo.

Si BMM no tiene pozos cargados en `field_well_catalog`, la pantalla BMM no mostrará carpetas.

Eso no significa que el sistema esté roto. Significa que falta alimentar el catálogo de pozos de ese contrato.

Consulta útil:

```sql
select operational_scope, campo_name, pozo_name, active
from public.field_well_catalog
order by operational_scope, campo_name, pozo_name;
```

Estado final del Riesgo 2:

```text
ABORDADO / VALIDADO
Fecha: 2026-08-05
Evidencia: cambio visual de contrato muestra pozos BMM correctamente en Base de Datos.
```

### Riesgo 3: usuario mal asignado

Estado al 2026-08-05: abordado en código y gestionable desde Gestión de Usuarios.

Si un usuario no tiene bien configurado `user_operational_scopes`, puede quedar viendo solo un contrato o el contrato por defecto.

Resultado de auditoría observada el 2026-08-05:

- `ingcampobmm@uvservicios.com`: `campo`, asignado a `bmm`, `is_default = true`, `can_switch = false`.
- `sanchezalbino459@gmail.com`: `cliente_view`, asignado a `bmm`, `is_default = true`, `can_switch = false`.
- `ingcampo@uvservicios.com`: `campo`, sin fila en `user_operational_scopes`; por defecto cae en `ceiba_tomoporo`.
- Usuarios internos como `admin`, `base_datos` y administradores aparecen sin fila, lo cual es aceptable porque su rol tiene acceso interno amplio.
- Varios `cliente_view` aparecen sin fila; con el blindaje aplicado ya no tienen acceso universal por solo ser `cliente_view`.

Cómo funciona ahora:

- Roles amplios (`admin`, `supervisor`, `gestor_usuarios`, `base_datos`) pueden ver todos los contratos activos.
- Usuarios de visualización (`cliente_view`) solo ven contratos asignados en `user_operational_scopes`; si no tienen asignación, caen al contrato por defecto.
- Usuarios operativos de Campo dependen de `user_operational_scopes` para saber qué contrato les corresponde.
- Si un usuario no tiene alcance asignado, el sistema puede caer al contrato por defecto `ceiba_tomoporo`.

Cómo asignarlo desde Gestión de Usuarios:

1. Abrir `gestion-usuarios.html`.
2. Crear o editar un usuario.
3. En `Rol asignado`, seleccionar `Cliente (Solo Lectura)`.
4. En `Seleccionar contrato`, elegir una de estas opciones:
  - `Ceiba / Tomoporo`
  - `Mene Grande / Barua / Motatan`
  - `Ambos`
6. Guardar.

Si el cliente tiene un solo contrato, verá solo ese contrato. Si eliges `Ambos`, se guardan los dos contratos en `user_operational_scopes` con `can_switch = true`, y el cliente podrá cambiar desde el selector superior de las páginas que usan multi-contrato.

Para técnicos de Campo, administradores de base de datos, gestores o administradores, el selector se mantiene simple: un contrato principal cuando aplica, o acceso amplio por rol interno. La opción `Ambos` solo aparece para `Cliente (Solo Lectura)`.

Qué debemos validar:

- Usuario Base de Datos: debe poder cambiar entre Ceiba / Tomoporo y BMM.
- Técnicos Ceiba / Tomoporo: deben quedar en `ceiba_tomoporo`.
- Técnicos BMM: deben quedar en `bmm`.
- Clientes de visualización: deben ver los contratos que correspondan según acceso definido.

Consulta útil:

```sql
select
  uos.user_id,
  uos.operational_scope,
  uos.is_default,
  uos.can_switch
from public.user_operational_scopes uos
order by uos.user_id, uos.operational_scope;
```

Archivo SQL de apoyo creado:

```text
supabase/audit_user_operational_scopes.sql
```

Ese archivo incluye:

- Auditoría general de usuarios, roles y contratos.
- Detección de usuarios `campo` o `cliente_view` sin alcance explícito.
- Detección de usuarios con más de un contrato por defecto.
- Plantillas seguras para asignar un contrato a un usuario.
- Plantilla para asignar dos contratos a un cliente que realmente debe cambiar entre ambos.

Consulta recomendada con correo:

```sql
select
  users.email,
  users.raw_app_meta_data ->> 'role' as role,
  uos.operational_scope,
  uos.is_default,
  uos.can_switch
from auth.users users
left join public.user_operational_scopes uos
  on uos.user_id = users.id
order by users.email, uos.operational_scope;
```

Resultado esperado:

- `baseuv@uvservicios.com` o usuario `base_datos`: acceso operativo suficiente para cambiar contrato.
- Usuarios Campo Ceiba / Tomoporo: `operational_scope = 'ceiba_tomoporo'`.
- Usuarios Campo BMM: `operational_scope = 'bmm'`.
- Si un usuario tiene más de un contrato y debe cambiar, `can_switch = true` y un solo `is_default = true`.

Estado operativo del Riesgo 3:

```text
ABORDADO EN CODIGO / GESTIONABLE DESDE UI
Fecha: 2026-08-05
Evidencia: cliente_view ya no tiene acceso universal a todos los contratos por rol; Gestión de Usuarios permite elegir Ceiba / Tomoporo, Mene Grande / Barua / Motatan o Ambos.
```

### Riesgo 4: doble borrador en Campo

Campo funciona, pero puede existir más de un borrador si el técnico sale de una jornada, abre otra pestaña o pierde el estado local.

Esto no mezcla contratos, pero puede partir una jornada en dos envíos.

Blindaje futuro recomendado:

- Antes de crear un nuevo borrador, avisar si el usuario ya tiene una jornada `draft` para el mismo contrato.
- Permitir continuar la jornada existente o crear una nueva solo con confirmación.

## ¿Puede funcionar mucho tiempo así?

Sí, puede funcionar así de forma estable si se mantiene el catálogo de pozos y usuarios correctamente.

La separación actual por `operational_scope` ya está aplicada en los módulos críticos de operación. Base de Datos ahora se alinea con esa misma lógica visual usando el catálogo por contrato.

La recomendación técnica para máxima robustez a largo plazo es hacer una segunda fase sobre documentos históricos:

1. Agregar `operational_scope` a `well_historical_documents`.
2. Rellenar esa columna según `field_well_catalog`.
3. Hacer que `uploadWellDocument()` guarde también el contrato activo.
4. Filtrar documentos por `operational_scope` además de `pozo_name`.
5. Opcionalmente reorganizar Storage con prefijo por contrato.

Esa fase no es urgente para que la visualización funcione, pero sí es el blindaje definitivo.

## Conclusión operativa

El nuevo contrato no debería afectar el contrato viejo.

Ceiba / Tomoporo conserva su flujo normal. BMM entra como otro alcance operativo separado. La página de Base de Datos ahora muestra carpetas según el contrato activo y no debería mezclar carpetas entre contratos si `field_well_catalog` está bien mantenido.

Estado actual:

- Campo: separado por contrato.
- Admin Campo: separado por contrato.
- Estadísticas: separado por contrato.
- Base de Datos: visualización separada por contrato desde el catálogo de pozos.
- Documentos: blindaje `operational_scope` implementado en código y SQL; migración ejecutada y auditoría correcta al 2026-08-05.
