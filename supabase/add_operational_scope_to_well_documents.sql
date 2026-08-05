-- ==============================================================================
-- BLINDAJE MULTI-CONTRATO PARA EXPEDIENTES DIGITALES
-- Fecha: 2026-08-05
--
-- Agrega operational_scope a well_historical_documents y rellena documentos
-- existentes usando el catálogo public.field_well_catalog.
-- ==============================================================================

ALTER TABLE public.well_historical_documents
ADD COLUMN IF NOT EXISTS operational_scope TEXT;

ALTER TABLE public.well_historical_documents
DROP CONSTRAINT IF EXISTS well_historical_documents_operational_scope_fkey;

ALTER TABLE public.well_historical_documents
ADD CONSTRAINT well_historical_documents_operational_scope_fkey
FOREIGN KEY (operational_scope)
REFERENCES public.operational_contracts(scope_key)
ON UPDATE CASCADE;

UPDATE public.well_historical_documents docs
SET operational_scope = catalog.operational_scope
FROM public.field_well_catalog catalog
WHERE upper(trim(docs.pozo_name)) = upper(trim(catalog.pozo_name))
  AND docs.operational_scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_well_docs_scope_pozo_cat
ON public.well_historical_documents (operational_scope, pozo_name, categoria);

CREATE INDEX IF NOT EXISTS idx_well_docs_scope_created
ON public.well_historical_documents (operational_scope, created_at DESC);

-- Auditoría: documentos que quedaron sin contrato porque el pozo no existe en catálogo.
SELECT
    docs.pozo_name,
    count(*) AS documentos_sin_scope
FROM public.well_historical_documents docs
WHERE docs.operational_scope IS NULL
GROUP BY docs.pozo_name
ORDER BY docs.pozo_name;

-- Auditoría: resumen final por contrato.
SELECT
    coalesce(operational_scope, 'SIN_SCOPE') AS operational_scope,
    count(*) AS documentos
FROM public.well_historical_documents
GROUP BY coalesce(operational_scope, 'SIN_SCOPE')
ORDER BY operational_scope;