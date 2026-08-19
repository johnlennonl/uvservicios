-- ==============================================================================
-- MÓDULO BASE DE DATOS & EXPEDIENTES DIGITALES POR POZO - UV SERVICIOS
-- Script SQL para crear la estructura de carpetas y subcarpetas dinámicas
-- ==============================================================================

-- 1. Crear tabla de carpetas relacionales con referencia recursiva
CREATE TABLE IF NOT EXISTS public.well_document_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operational_scope TEXT REFERENCES public.operational_contracts(scope_key) ON UPDATE CASCADE,
    pozo_name TEXT NOT NULL,
    parent_id UUID REFERENCES public.well_document_folders(id) ON DELETE CASCADE, -- Referencia recursiva
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'fa-solid fa-folder-closed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Añadir columnas por si la tabla ya había sido creada sin ellas
ALTER TABLE public.well_document_folders ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.well_document_folders ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'fa-solid fa-folder-closed';

-- 2. Modificar la tabla de documentos existentes para asociar su carpeta virtual (folder_id)
ALTER TABLE public.well_historical_documents 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.well_document_folders(id) ON DELETE CASCADE;

-- 3. Crear índices de rendimiento para optimizar la búsqueda de carpetas por pozo y carpeta padre
CREATE INDEX IF NOT EXISTS idx_folders_pozo_parent ON public.well_document_folders(pozo_name, parent_id);
CREATE INDEX IF NOT EXISTS idx_well_docs_folder_id ON public.well_historical_documents(folder_id);

-- 4. Habilitar Row Level Security (RLS) en la tabla de carpetas
ALTER TABLE public.well_document_folders ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas RLS flexibles de lectura y escritura para usuarios autenticados
DROP POLICY IF EXISTS "Permitir lectura autenticada en well_document_folders" ON public.well_document_folders;
CREATE POLICY "Permitir lectura autenticada en well_document_folders"
ON public.well_document_folders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion autenticada en well_document_folders" ON public.well_document_folders;
CREATE POLICY "Permitir insercion autenticada en well_document_folders"
ON public.well_document_folders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion autenticada en well_document_folders" ON public.well_document_folders;
CREATE POLICY "Permitir eliminacion autenticada en well_document_folders"
ON public.well_document_folders FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir actualizacion autenticada en well_document_folders" ON public.well_document_folders;
CREATE POLICY "Permitir actualizacion autenticada en well_document_folders"
ON public.well_document_folders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 6. Recargar caché del esquema de la API de Supabase de forma inmediata
NOTIFY pgrst, 'reload schema';
