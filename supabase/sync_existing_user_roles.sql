-- ======================================================================
-- PARCHE DE SINCRONIZACIÓN: Copiar Roles Existentes a app_metadata
-- ======================================================================
--
-- Explicación:
-- Tras la corrección de seguridad RLS (que ahora busca el rol de forma segura en 'app_metadata'),
-- los usuarios creados antes del parche no tienen su rol en 'app_metadata' (solo en 'user_metadata').
-- Esto provoca que la base de datos los vea como 'cliente_view'.
--
-- Solución:
-- Este script copia el rol desde 'user_metadata' a 'app_metadata' para todos los usuarios existentes.

UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) 
    || jsonb_build_object('role', coalesce(raw_user_meta_data ->> 'role', 'cliente_view'))
WHERE raw_user_meta_data ->> 'role' IS NOT NULL;
