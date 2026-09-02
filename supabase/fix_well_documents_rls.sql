-- ==============================================================================
-- FIX DEFINITIVO DE PERMISOS Y ESTRUCTURA DE DOCUMENTOS EN SUPABASE
-- UV SERVICIOS - CONTRATOS OPERATIVOS (BMM / TOM / CEI / CCRC LL)
-- ==============================================================================
-- Ejecuta este script en el Editor SQL de tu proyecto Supabase (SQL Editor)
-- para garantizar que la subida de archivos y consulta de adjuntos funcione 
-- sin bloqueos de RLS o claves foráneas faltantes.
-- ==============================================================================

-- 1. Registrar contrato CCRC LL en operational_contracts
INSERT INTO public.operational_contracts (scope_key, display_name, short_name, active)
VALUES ('crc_ll', 'CCRC - Lagunillas Lago', 'CCRC LL', true)
ON CONFLICT (scope_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    short_name = EXCLUDED.short_name,
    active = true,
    updated_at = NOW();

-- 2. Asegurar estructura completa de well_historical_documents
CREATE TABLE IF NOT EXISTS public.well_historical_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operational_scope TEXT REFERENCES public.operational_contracts(scope_key) ON UPDATE CASCADE,
    pozo_name TEXT NOT NULL,
    categoria TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_type TEXT DEFAULT 'doc',
    descripcion TEXT,
    uploaded_by TEXT,
    fecha_documento DATE DEFAULT CURRENT_DATE,
    folder_id UUID,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas si la tabla ya existía
ALTER TABLE public.well_historical_documents ADD COLUMN IF NOT EXISTS operational_scope TEXT;
ALTER TABLE public.well_historical_documents ADD COLUMN IF NOT EXISTS folder_id UUID;
ALTER TABLE public.well_historical_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.well_historical_documents ADD COLUMN IF NOT EXISTS fecha_documento DATE DEFAULT CURRENT_DATE;

-- 3. Habilitar RLS con acceso total para usuarios autenticados y públicos
ALTER TABLE public.well_historical_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica/autenticada en well_historical_documents" ON public.well_historical_documents;
CREATE POLICY "Permitir lectura publica/autenticada en well_historical_documents"
ON public.well_historical_documents FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "Permitir insercion autenticada en well_historical_documents" ON public.well_historical_documents;
CREATE POLICY "Permitir insercion autenticada en well_historical_documents"
ON public.well_historical_documents FOR INSERT TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion autenticada en well_historical_documents" ON public.well_historical_documents;
CREATE POLICY "Permitir actualizacion autenticada en well_historical_documents"
ON public.well_historical_documents FOR UPDATE TO public
USING (true);

DROP POLICY IF EXISTS "Permitir eliminacion autenticada en well_historical_documents" ON public.well_historical_documents;
CREATE POLICY "Permitir eliminacion autenticada en well_historical_documents"
ON public.well_historical_documents FOR DELETE TO public
USING (true);

-- 4. Asegurar Bucket expedientes-pozos en Supabase Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedientes-pozos', 'expedientes-pozos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Habilitar políticas RLS públicas para expedientes-pozos en storage.objects
DROP POLICY IF EXISTS "Permitir subida en expedientes-pozos" ON storage.objects;
CREATE POLICY "Permitir subida en expedientes-pozos"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'expedientes-pozos');

DROP POLICY IF EXISTS "Permitir lectura en expedientes-pozos" ON storage.objects;
CREATE POLICY "Permitir lectura en expedientes-pozos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'expedientes-pozos');

DROP POLICY IF EXISTS "Permitir actualizacion en expedientes-pozos" ON storage.objects;
CREATE POLICY "Permitir actualizacion en expedientes-pozos"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'expedientes-pozos');

DROP POLICY IF EXISTS "Permitir eliminacion en expedientes-pozos" ON storage.objects;
CREATE POLICY "Permitir eliminacion en expedientes-pozos"
ON storage.objects FOR DELETE TO public
USING (bucket_id = 'expedientes-pozos');

-- 6. Recargar esquema PostgREST
NOTIFY pgrst, 'reload schema';
