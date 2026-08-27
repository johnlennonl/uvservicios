-- ==============================================================================
-- PATRÓN DE SEGURIDAD BD (RLS) - CONTROL DE ROLES PARA EXPEDIENTES Y CARPETAS
-- ==============================================================================
-- Este script implementa la seguridad a nivel de base de datos (Backend/Supabase)
-- para garantizar que ningún rol pueda filtrar, leer o escribir documentos fuera
-- de su jurisdicción, protegiendo la información confidencial.

-- Limpiar políticas anteriores (nombres antiguos y nuevos) para evitar colisiones
DROP POLICY IF EXISTS "Permitir lectura autenticada en well_document_folders" ON public.well_document_folders;
DROP POLICY IF EXISTS "Permitir insercion autenticada en well_document_folders" ON public.well_document_folders;
DROP POLICY IF EXISTS "Permitir eliminacion autenticada en well_document_folders" ON public.well_document_folders;
DROP POLICY IF EXISTS "Permitir actualizacion autenticada en well_document_folders" ON public.well_document_folders;

DROP POLICY IF EXISTS "RLS_SELECT_folders_by_role" ON public.well_document_folders;
DROP POLICY IF EXISTS "RLS_INSERT_folders_by_role" ON public.well_document_folders;
DROP POLICY IF EXISTS "RLS_DELETE_folders_by_role" ON public.well_document_folders;
DROP POLICY IF EXISTS "RLS_UPDATE_folders_by_role" ON public.well_document_folders;

DROP POLICY IF EXISTS "Permitir lectura publica/autenticada en well_historical_documents" ON public.well_historical_documents;
DROP POLICY IF EXISTS "Permitir insercion autenticada en well_historical_documents" ON public.well_historical_documents;
DROP POLICY IF EXISTS "Permitir eliminacion autenticada en well_historical_documents" ON public.well_historical_documents;
DROP POLICY IF EXISTS "Permitir actualizacion autenticada en well_historical_documents" ON public.well_historical_documents;

DROP POLICY IF EXISTS "RLS_SELECT_documents_by_role" ON public.well_historical_documents;
DROP POLICY IF EXISTS "RLS_INSERT_documents_by_role" ON public.well_historical_documents;
DROP POLICY IF EXISTS "RLS_DELETE_documents_by_role" ON public.well_historical_documents;
DROP POLICY IF EXISTS "RLS_UPDATE_documents_by_role" ON public.well_historical_documents;

-- ==============================================================================
-- 1. POLÍTICAS RLS PARA LA TABLA DE CARPETAS (well_document_folders)
-- ==============================================================================

-- A) POLÍTICA DE SELECCIÓN (LECTURA)
CREATE POLICY "RLS_SELECT_folders_by_role"
ON public.well_document_folders FOR SELECT TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Control total de todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Lectura de todo
        WHEN public.get_access_role() = 'gerencial' THEN true
        
        -- Seguridad / SIAHO: Exclusivamente la carpeta SIAHO y sus subcarpetas
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND (
                name = 'SIAHO' OR parent_id IS NOT NULL
            )
            
        -- Administrador / Supervisor: Todo excepto la sección Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        -- Otros (Operador Campo, lectura readonly): Todo excepto Gerencial
        ELSE pozo_name != '_GERENCIAL'
    END
);

-- B) POLÍTICA DE INSERCIÓN (CREACIÓN)
CREATE POLICY "RLS_INSERT_folders_by_role"
ON public.well_document_folders FOR INSERT TO authenticated
WITH CHECK (
    CASE 
        -- DBA / BASEUV: Escribir en cualquier lado
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Solo puede crear carpetas en la sección Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Solo puede crear subcarpetas dentro del árbol de SIAHO
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND parent_id IS NOT NULL
            
        -- Administrador / Supervisor: Puede crear en cualquier lado excepto Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);

-- C) POLÍTICA DE ELIMINACIÓN (BORRADO)
CREATE POLICY "RLS_DELETE_folders_by_role"
ON public.well_document_folders FOR DELETE TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Borrar lo que sea
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Borrar solo dentro de Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Borrar subcarpetas dentro del árbol de SIAHO (no la carpeta raíz)
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND parent_id IS NOT NULL
            
        -- Administrador / Supervisor: Borrar fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);

-- D) POLÍTICA DE ACTUALIZACIÓN (EDICIÓN)
CREATE POLICY "RLS_UPDATE_folders_by_role"
ON public.well_document_folders FOR UPDATE TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Control total de todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Editar solo en Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Editar solo subcarpetas SIAHO (donde parent_id is not null)
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND parent_id IS NOT NULL
            
        -- Administrador / Supervisor: Editar fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
)
WITH CHECK (
    CASE 
        -- DBA / BASEUV: Control total de todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Editar solo en Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Editar solo subcarpetas SIAHO (donde parent_id is not null)
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND parent_id IS NOT NULL
            
        -- Administrador / Supervisor: Editar fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);


-- ==============================================================================
-- 2. POLÍTICAS RLS PARA LA TABLA DE DOCUMENTOS (well_historical_documents)
-- ==============================================================================

-- A) POLÍTICA DE SELECCIÓN (LECTURA DE ARCHIVOS)
CREATE POLICY "RLS_SELECT_documents_by_role"
ON public.well_historical_documents FOR SELECT TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Control total
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Lectura de todo
        WHEN public.get_access_role() = 'gerencial' THEN true
        
        -- Seguridad / SIAHO: Solo archivos de categoría SIAHO
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            categoria = 'SIAHO'
            
        -- Administrador / Supervisor: Todo excepto Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor') THEN 
            pozo_name != '_GERENCIAL'
            
        -- Otros: Todo excepto Gerencial
        ELSE pozo_name != '_GERENCIAL'
    END
);

-- B) POLÍTICA DE INSERCIÓN (SUBIDA DE ARCHIVOS)
CREATE POLICY "RLS_INSERT_documents_by_role"
ON public.well_historical_documents FOR INSERT TO authenticated
WITH CHECK (
    CASE 
        -- DBA / BASEUV: Escribir en cualquier lado
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Solo subir a la sección Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Solo subir a la categoría SIAHO en sección Gerencial
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND categoria = 'SIAHO'
            
        -- Administrador / Supervisor / Operador Campo (campo): Subir fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor', 'campo') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);

-- C) POLÍTICA DE ELIMINACIÓN (BORRADO DE ARCHIVOS)
CREATE POLICY "RLS_DELETE_documents_by_role"
ON public.well_historical_documents FOR DELETE TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Borrar todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Borrar solo dentro de Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Borrar solo archivos SIAHO
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND categoria = 'SIAHO'
            
        -- Administrador / Supervisor / Operador Campo (campo): Borrar fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor', 'campo') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);

-- D) POLÍTICA DE ACTUALIZACIÓN (EDICIÓN DE ARCHIVOS / SOFT DELETE)
CREATE POLICY "RLS_UPDATE_documents_by_role"
ON public.well_historical_documents FOR UPDATE TO authenticated
USING (
    CASE 
        -- DBA / BASEUV: Actualizar todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Solo dentro de Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Solo SIAHO en Gerencial
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND categoria = 'SIAHO'
            
        -- Administrador / Supervisor / Operador Campo (campo): Fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor', 'campo') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
)
WITH CHECK (
    CASE 
        -- DBA / BASEUV: Actualizar todo
        WHEN public.get_access_role() = 'base_datos' THEN true
        
        -- Gerencial: Solo dentro de Gerencial
        WHEN public.get_access_role() = 'gerencial' THEN 
            pozo_name = '_GERENCIAL'
            
        -- Seguridad / SIAHO: Solo SIAHO en Gerencial
        WHEN public.get_access_role() in ('seguridad', 'siaho') THEN 
            pozo_name = '_GERENCIAL' AND categoria = 'SIAHO'
            
        -- Administrador / Supervisor / Operador Campo (campo): Fuera de Gerencial
        WHEN public.get_access_role() in ('admin', 'supervisor', 'campo') THEN 
            pozo_name != '_GERENCIAL'
            
        ELSE false
    END
);

-- Recargar caché de PostgREST
NOTIFY pgrst, 'reload schema';
