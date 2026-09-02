-- ==============================================================================
-- MIGRACIÓN SUPABASE: CONTRATO CCRC - LAGUNILLAS LAGO
-- ==============================================================================

-- 1. Insertar el nuevo contrato operativo
INSERT INTO public.operational_contracts (scope_key, display_name, short_name, active)
VALUES ('crc_ll', 'CCRC - Lagunillas Lago', 'CCRC LL', true)
ON CONFLICT (scope_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    short_name = EXCLUDED.short_name,
    active = true,
    updated_at = NOW();

-- 2. Agregar la columna para diferenciar pozos de Bombeo Mecánico (BM) y Cavidad Progresiva (BCP)
ALTER TABLE public.field_well_catalog 
ADD COLUMN IF NOT EXISTS lift_method TEXT CHECK (lift_method IN ('BM', 'BCP'));

-- 3. Insertar técnicos semilla para el contrato CCRC
INSERT INTO public.field_technicians (full_name, operational_scope, active)
VALUES 
    ('TÉCNICO CCRC 1', 'crc_ll', true),
    ('TÉCNICO CCRC 2', 'crc_ll', true),
    ('SUPERVISOR CCRC 1', 'crc_ll', true)
ON CONFLICT (full_name, operational_scope) DO UPDATE
SET active = true,
    updated_at = NOW();

-- 4. Insertar pozos semilla para el contrato CCRC
INSERT INTO public.field_well_catalog (pozo_name, campo_name, operational_scope, lift_method, active)
VALUES
    ('CCRC-BM-01', 'LAGUNILLAS LAGO', 'crc_ll', 'BM', true),
    ('CCRC-BM-02', 'LAGUNILLAS LAGO', 'crc_ll', 'BM', true),
    ('CCRC-BM-03', 'LAGUNILLAS LAGO', 'crc_ll', 'BM', true),
    ('CCRC-BCP-01', 'LAGUNILLAS LAGO', 'crc_ll', 'BCP', true),
    ('CCRC-BCP-02', 'LAGUNILLAS LAGO', 'crc_ll', 'BCP', true),
    ('CCRC-BCP-03', 'LAGUNILLAS LAGO', 'crc_ll', 'BCP', true)
ON CONFLICT (pozo_name) DO UPDATE
SET campo_name = EXCLUDED.campo_name,
    operational_scope = EXCLUDED.operational_scope,
    lift_method = EXCLUDED.lift_method,
    active = true,
    updated_at = NOW();

-- 5. Recargar esquema para propagar cambios en PostgREST
NOTIFY pgrst, 'reload schema';
