# Fusion de jornadas divididas en Campo Admin

## Objetivo

Resolver casos donde una misma jornada fue enviada en dos partes desde Campo, por ejemplo una jornada principal con 10 pozos y otra parcial con 5 pozos del mismo dia y turno.

## Flujo implementado

Desde el detalle de una jornada en Campo Admin aparece la accion **Fusionar jornadas**.

El sistema:

1. Usa la jornada seleccionada como destino.
2. Busca jornadas candidatas con estado pendiente, en revision o rechazada.
3. Filtra candidatas por misma fecha operativa y mismo turno.
4. Permite seleccionar la jornada origen.
5. Pide confirmacion antes de modificar datos.
6. Mueve a la jornada destino solo los pozos no duplicados.
7. Recalcula los conteos y ventana horaria de ambas jornadas.
8. Registra bitacora en la jornada destino y en la jornada origen.
9. Archiva la jornada origen solo si no quedan pozos duplicados.

## Bitacora y trazabilidad

La fusion no elimina la jornada origen de forma silenciosa. El sistema registra eventos en `field_journey_review_log` para ambas jornadas:

- Jornada destino: indica cuantos pozos se fusionaron y desde que jornada vinieron.
- Jornada origen: indica si fue archivada o si quedo en revision por pozos duplicados.
- Metadata: guarda `source_journey_id`, `target_journey_id`, `moved_record_ids`, `moved_pozos` y `conflict_pozos`.

Esto permite auditar quien hizo la correccion, cuando se hizo y que pozos fueron movidos.

## Guardas de seguridad

- No fusiona jornadas publicadas, aprobadas, archivadas ni jornadas en vivo.
- No mueve pozos duplicados por nombre de pozo.
- Si quedan duplicados, la jornada origen queda en revision para resolverlos manualmente.
- No elimina la jornada origen directamente.
- No toca `monitoreo_pozos` ni tablas consolidadas si la jornada aun no fue publicada.
- Recalcula explicitamente `total_reports`, `first_report_time` y `last_report_time` porque el trigger de rollup puede actualizar solo una jornada cuando se cambia `journey_id`.

## Recomendacion operativa

Usar esta herramienta solo para corregir envios divididos reales y antes de publicar la jornada al Dashboard/Data. Si alguna de las jornadas ya fue publicada, no usar este flujo; requiere una reconciliacion separada contra las tablas publicadas.
