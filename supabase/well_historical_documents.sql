-- ==============================================================================
-- MÓDULO BASE DE DATOS & EXPEDIENTE DIGITAL POR POZO - UV SERVICIOS
-- Tabla PostgreSQL para registrar la metadata de documentos históricos por pozo
-- ==============================================================================

-- 1. Crear tabla de documentos históricos por pozo
CREATE TABLE IF NOT EXISTS public.well_historical_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pozo_name TEXT NOT NULL,
    categoria TEXT NOT NULL, -- 'SIMULACIONES', 'INFORMES_TECNICOS', 'PRUEBAS_PRODUCCION', 'FICHAS_BES'
    nombre_archivo TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Ruta almacenada en Supabase Storage
    file_size BIGINT DEFAULT 0, -- Tamaño del archivo en bytes
    file_type TEXT DEFAULT 'pdf', -- Extensión o tipo MIME (pdf, xlsx, docx, etc.)
    descripcion TEXT,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de rendimiento para consultas rápidas por pozo y categoría
CREATE INDEX IF NOT EXISTS idx_well_docs_pozo ON public.well_historical_documents(pozo_name);
CREATE INDEX IF NOT EXISTS idx_well_docs_categoria ON public.well_historical_documents(categoria);
CREATE INDEX IF NOT EXISTS idx_well_docs_pozo_cat ON public.well_historical_documents(pozo_name, categoria);

-- 3. Habilitar RLS (Row Level Security) con acceso amplio para lectura/escritura autenticada
ALTER TABLE public.well_historical_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica/autenticada en well_historical_documents"
ON public.well_historical_documents FOR SELECT
USING (true);

CREATE POLICY "Permitir insercion autenticada en well_historical_documents"
ON public.well_historical_documents FOR INSERT
WITH CHECK (true);

CREATE POLICY "Permitir eliminacion autenticada en well_historical_documents"
ON public.well_historical_documents FOR DELETE
USING (true);

-- ==============================================================================
-- POLÍTICAS RLS PARA SUPABASE STORAGE BUCKET: expedientes-pozos
-- ==============================================================================

-- 1. Permitir SUBIR (INSERT) archivos en expedientes-pozos
CREATE POLICY "Permitir subida en expedientes-pozos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'expedientes-pozos');

-- 2. Permitir LEER/DESCARGAR (SELECT) archivos en expedientes-pozos
CREATE POLICY "Permitir lectura en expedientes-pozos"
ON storage.objects FOR SELECT
USING (bucket_id = 'expedientes-pozos');

-- 3. Permitir ELIMINAR (DELETE) archivos en expedientes-pozos
CREATE POLICY "Permitir eliminacion en expedientes-pozos"
ON storage.objects FOR DELETE
USING (bucket_id = 'expedientes-pozos');
