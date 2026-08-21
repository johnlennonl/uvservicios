-- ==============================================================================
-- MIGRACIÓN: AGREGAR COLUMNA DE BORRADO LÓGICO (SOFT DELETE) A DOCUMENTOS
-- ==============================================================================

-- 1. Agregar la columna deleted_at si no existe
ALTER TABLE public.well_historical_documents 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Crear un índice parcial para optimizar las consultas donde deleted_at es NULL (documentos activos)
CREATE INDEX IF NOT EXISTS idx_well_docs_active_status 
ON public.well_historical_documents (deleted_at) 
WHERE deleted_at IS NULL;
