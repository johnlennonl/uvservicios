-- ======================================================================
-- SCRIPT DE MIGRACIÓN: Sincronización retroactiva de niveles históricos
-- ======================================================================
--
-- Explicación:
-- Los triggers creados anteriormente solo se ejecutan cuando ocurre una NUEVA inserción
-- o modificación en la tabla `well_level_tests`.
--
-- Para que los registros de niveles que cargaste en el PASADO se reflejen retroactivamente
-- en las filas ya existentes del Consolidado, debes ejecutar este script de actualización
-- por única vez en el SQL Editor de Supabase.

-- 1. Actualizar filas históricas en consolidated_dashboard_operational (Jornadas consolidadas)
UPDATE public.consolidated_dashboard_operational c
SET row_data = COALESCE(c.row_data, '{}'::jsonb) 
    || jsonb_build_object(
        'NIVEL DE FLUIDO [FT]', l.nivel_dinamico,
        'SUMERGENCIA [FT]', l.sumergencia,
        'PIP ECHOMETER [PSI]', l.presion_pip,
        'ECHOMETER?', 'SI'
    )
FROM public.well_level_tests l
WHERE UPPER(TRIM(c.pozo)) = UPPER(TRIM(l.pozo_name))
  AND c.report_date = l.fecha;

-- 2. Actualizar filas históricas en consolidated_dashboard_general (Consolidado histórico completo)
UPDATE public.consolidated_dashboard_general c
SET row_data = COALESCE(c.row_data, '{}'::jsonb) 
    || jsonb_build_object(
        'NIVEL DE FLUIDO [FT]', l.nivel_dinamico,
        'SUMERGENCIA [FT]', l.sumergencia,
        'PIP ECHOMETER [PSI]', l.presion_pip,
        'ECHOMETER?', 'SI'
    )
FROM public.well_level_tests l
WHERE UPPER(TRIM(c.pozo)) = UPPER(TRIM(l.pozo_name))
  AND c.report_date = l.fecha;
