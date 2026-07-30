-- ======================================================================
-- SEGURIDAD: Habilitar Lectura de Jornadas en Vivo para Clientes (cliente_view)
-- ======================================================================
--
-- Explicación:
-- Para que el rol 'cliente_view' pueda ver la pestaña de "Jornadas en Vivo",
-- la base de datos de Supabase debe permitirle leer (SELECT) las tablas
-- 'field_journeys', 'field_journey_records' y 'field_journey_review_log'.
-- Este script modifica las políticas RLS existentes para otorgarle este permiso.

-- 1. Permitir lectura de jornadas de campo (field_journeys)
DROP POLICY IF EXISTS "field journeys select management" ON public.field_journeys;
CREATE POLICY "field journeys select management"
    ON public.field_journeys
    FOR SELECT
    TO authenticated
    USING (public.can_manage_monitoring() OR public.get_access_role() = 'cliente_view');

-- 2. Permitir lectura de registros de pozos (field_journey_records)
DROP POLICY IF EXISTS "field records select management" ON public.field_journey_records;
CREATE POLICY "field records select management"
    ON public.field_journey_records
    FOR SELECT
    TO authenticated
    USING (public.can_manage_monitoring() OR public.get_access_role() = 'cliente_view');

-- 3. Permitir lectura de bitácora de revisión (field_journey_review_log)
DROP POLICY IF EXISTS "field review log select management" ON public.field_journey_review_log;
CREATE POLICY "field review log select management"
    ON public.field_journey_review_log
    FOR SELECT
    TO authenticated
    USING (public.can_manage_monitoring() OR public.get_access_role() = 'cliente_view');
