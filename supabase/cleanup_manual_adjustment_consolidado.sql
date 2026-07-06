-- Limpieza segura de filas temporales importadas desde Gestion/Preparador.
-- NO toca el consolidado historico legacy_excel.
-- NO toca jornadas publicadas desde Campo Admin field_journey.

-- 1) Vista previa: revisa cuantas filas manuales existen y en que rango quedaron.
select
    count(*) as manual_adjustment_rows,
    min(created_at) as first_created_at,
    max(created_at) as last_created_at
from public.consolidated_dashboard_general
where source_type = 'manual_adjustment';

-- 2) Muestra una muestra de las filas que se borrarian.
select
    id,
    source_type,
    source_file_name,
    pozo,
    campo,
    report_date,
    report_time,
    created_at,
    column_labels
from public.consolidated_dashboard_general
where source_type = 'manual_adjustment'
order by created_at desc
limit 30;

-- 3) Cuando confirmes que son las filas malas de Gestion/Preparador,
-- descomenta este bloque y ejecutalo.
-- delete from public.consolidated_dashboard_general
-- where source_type = 'manual_adjustment';

-- 4) Verificacion posterior.
-- select source_type, count(*)
-- from public.consolidated_dashboard_general
-- group by source_type
-- order by source_type;
