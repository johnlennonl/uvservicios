-- 1. LIMPIEZA DE REGISTROS HUÉRFANOS ACTUALES
-- Elimina filas en consolidado cuyos registros de origen en jornadas ya no existen
DELETE FROM public.consolidated_dashboard_operational
WHERE source_record_id IS NOT NULL
  AND source_record_id NOT IN (SELECT id FROM public.field_journey_records);

-- Elimina filas en consolidado cuyas jornadas de origen ya no existen
DELETE FROM public.consolidated_dashboard_operational
WHERE source_journey_id IS NOT NULL
  AND source_journey_id NOT IN (SELECT id FROM public.field_journeys);

-- 2. REESTRUCTURACIÓN DE CLAVES FORÁNEAS (GARBAGE COLLECTION AUTOMÁTICO)
-- Para evitar que al borrar una jornada o un pozo queden filas huérfanas en el consolidado.

-- Dropear las constraints existentes si existen (con nombres por defecto de Postgres o personalizados)
ALTER TABLE public.consolidated_dashboard_operational
    DROP CONSTRAINT IF EXISTS consolidated_dashboard_operational_source_journey_id_fkey,
    DROP CONSTRAINT IF EXISTS consolidated_dashboard_operational_source_record_id_fkey;

-- Añadir nuevas restricciones con ON DELETE CASCADE para limpieza automática en cascada
ALTER TABLE public.consolidated_dashboard_operational
    ADD CONSTRAINT consolidated_dashboard_operational_source_journey_id_fkey
        FOREIGN KEY (source_journey_id)
        REFERENCES public.field_journeys(id)
        ON DELETE CASCADE,
    ADD CONSTRAINT consolidated_dashboard_operational_source_record_id_fkey
        FOREIGN KEY (source_record_id)
        REFERENCES public.field_journey_records(id)
        ON DELETE CASCADE;
