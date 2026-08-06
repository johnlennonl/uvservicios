# Anotaciones de ingenieria en graficas operativas

Fecha: 2026-08-06

Estado: Propuesta funcional para implementar.

## Objetivo

Permitir que los ingenieros de administracion agreguen comentarios directamente sobre puntos especificos de las graficas operativas del Dashboard, por ejemplo:

```text
30 jul. 2026 05:00 - VSD C bajo a 340 A por ajuste de frecuencia durante arranque.
02 ago. 2026 17:14 - TM subio por condicion transitoria de carga.
```

La finalidad es que una subida, bajada o comportamiento raro tenga contexto tecnico visible sin depender de mensajes externos.

## Donde aplica

La funcionalidad debe aplicar a las graficas historicas renderizadas en `js/charts.js`, principalmente:

- Frecuencia.
- PIP.
- Temperatura de motor.
- Corriente de motor.
- Superficie: THP, CHP, LF.
- VSD trifasico: VSD A, VSD B, VSD C.

En el caso mostrado por el usuario, aplica a **VSD Trifasico Corriente (Fases A/B/C)**.

## Comportamiento esperado

### 1. Crear anotacion desde un punto

Cuando un usuario autorizado haga click sobre un punto de la grafica:

1. El sistema identifica el pozo, variable, fecha, hora y valor del punto.
2. Abre un modal corto de anotacion.
3. El ingeniero escribe el motivo o comentario tecnico.
4. Guarda la anotacion.
5. El punto queda marcado visualmente en la grafica.

Ejemplo de modal:

```text
Anotar punto operativo
Pozo: TOM0012
Variable: VSD C
Fecha/hora: 30 jul. 2026 05:00
Valor: 340 A

Comentario tecnico:
[ Hubo ajuste de frecuencia por condicion de arranque. ]

[Cancelar] [Guardar anotacion]
```

### 2. Ver anotacion en tooltip

Cuando se pase el cursor por un punto con anotacion, el tooltip debe mostrar:

```text
VSD C: 340 A
Anotacion: Hubo ajuste de frecuencia por condicion de arranque.
Registrado por: Ing. Manuel Sanchez
Fecha: 06 ago. 2026 08:15
```

### 3. Ver resumen de anotaciones

Cada grafica puede tener un boton o contador:

```text
3 anotaciones
```

Al abrirlo, muestra una lista filtrada por pozo/grafica:

```text
30 jul. 2026 05:00 · VSD C · 340 A
Hubo ajuste de frecuencia por condicion de arranque.
Ing. Manuel Sanchez
```

### 4. Editar o eliminar anotacion

Solo perfiles autorizados deben poder editar/eliminar anotaciones:

- `admin`
- `supervisor`
- usuarios con permiso de gestion/monitoreo administrativo

La eliminacion no deberia ser silenciosa. Recomendado:

- eliminar logico con `deleted_at`, `deleted_by_email`, `delete_reason`; o
- mantener bitacora de auditoria.

## Modelo de datos recomendado

Crear tabla nueva en Supabase, sin modificar `monitoreo_pozos`:

```sql
create table if not exists public.monitoring_point_annotations (
    id uuid primary key default gen_random_uuid(),
    operational_scope text not null default 'ceiba_tomoporo',
    pozo_name text not null,
    chart_key text not null,
    variable_key text not null,
    variable_label text not null,
    point_fecha date not null,
    point_hora time not null,
    point_value numeric,
    comment text not null,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_by_email text not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_email text,
    updated_at timestamptz,
    deleted_at timestamptz,
    deleted_by_user_id uuid references auth.users(id) on delete set null,
    deleted_by_email text,
    delete_reason text,
    metadata jsonb not null default '{}'::jsonb,
    constraint monitoring_point_annotations_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

create index if not exists monitoring_point_annotations_lookup_idx
    on public.monitoring_point_annotations (
        operational_scope,
        pozo_name,
        chart_key,
        variable_key,
        point_fecha,
        point_hora
    )
    where deleted_at is null;
```

## Identidad del punto

La anotacion debe asociarse a un punto por:

```text
operational_scope + pozo_name + chart_key + variable_key + fecha + hora
```

No se recomienda asociarla solo por posicion del array de la grafica, porque si se filtra o cambia la ventana de datos, el indice puede moverse.

## Cambios frontend propuestos

### Servicio nuevo

Crear `js/services/monitoring-annotations-service.js` con funciones:

```js
getMonitoringPointAnnotations(filters)
createMonitoringPointAnnotation(payload)
updateMonitoringPointAnnotation(annotationId, payload)
deleteMonitoringPointAnnotation(annotationId, reason)
```

### Integracion en `js/charts.js`

En `renderCoreTrends()`:

1. Al construir cada punto con `makeSeries()`, incluir metadata:

```js
{
  x: pointTimestamp,
  y: value,
  meta: {
    pozoName,
    chartKey,
    variableKey,
    variableLabel,
    fecha,
    hora,
    value
  }
}
```

2. Cargar anotaciones del pozo/ventana visible.
3. Marcar puntos anotados visualmente:
   - marcador mas grande
   - borde o color distintivo
   - icono pequeno si ApexCharts lo permite via annotation marker
4. Extender tooltip para mostrar comentarios.
5. Agregar evento `dataPointSelection` para abrir modal de anotacion.

## UX recomendada

### En la grafica

- Punto normal: marcador actual.
- Punto con anotacion: marcador con borde oscuro o icono pequeno.
- Tooltip: muestra comentario si existe.
- Boton arriba de la grafica: `Anotaciones` con contador.

### Modal de anotacion

Debe ser corto, operativo y sin sacar al usuario del dashboard:

```text
Anotar punto operativo
[Datos del punto]
[Comentario tecnico]
[Guardar]
```

### Panel de anotaciones

Debe permitir revisar todas las anotaciones visibles por pozo:

- Fecha/hora.
- Variable.
- Valor.
- Comentario.
- Autor.
- Fecha de creacion.
- Acciones: editar/eliminar si tiene permiso.

## Seguridad y permisos

Lectura:

- Administracion y supervisores.
- Clientes de solo lectura podrian ver anotaciones si se decide que son parte del contexto operativo publicado.

Escritura:

- Solo perfiles que administran ingenieria/monitoreo.
- No permitir al tecnico de Campo crear o editar anotaciones desde Dashboard, salvo que se defina explicitamente.

## Preguntas de decision antes de implementar

1. Las anotaciones las debe ver tambien el cliente `cliente_view` o solo administracion?
2. Se permite una sola anotacion por punto/variable o varias anotaciones tipo hilo?
3. Eliminar debe borrar realmente o archivar con motivo?
4. Debe aplicar primero solo a VSD trifasico o a todas las graficas historicas?
5. Las anotaciones deben exportarse en PDF/reportes?

## Recomendacion de implementacion por fases

### Fase 1 - MVP seguro

- Tabla Supabase `monitoring_point_annotations`.
- Crear/leer anotaciones.
- Click en punto abre modal.
- Tooltip muestra anotacion.
- Solo una anotacion activa por punto/variable.
- Sin eliminar fisico; solo soft delete.

### Fase 2 - Operacion completa

- Panel lateral/lista de anotaciones por grafica.
- Editar/eliminar con motivo.
- Contador de anotaciones por grafica.
- Auditoria de ediciones.

### Fase 3 - Reportabilidad

- Incluir anotaciones en PDF o reportes.
- Filtros por periodo, pozo, variable y autor.
- Vista historica de anotaciones de ingenieria.

## Nota importante

Esta funcionalidad no debe modificar los registros de `monitoreo_pozos`. Una anotacion es contexto tecnico sobre un punto, no una correccion del dato original.
