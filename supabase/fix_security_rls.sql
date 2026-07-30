-- ======================================================================
-- SCRIPT DE SEGURIDAD: Corrección de Políticas RLS para evitar escalamiento de privilegios
-- ======================================================================
-- 
-- Explicación:
-- Supabase Advisor detectó que la política RLS "Gestores y Admins pueden crear/modificar perfiles"
-- valida el rol del usuario leyendo "user_metadata" (que se obtiene con auth.jwt() -> 'user_metadata').
-- 
-- Dado que "user_metadata" puede ser modificado directamente por el usuario desde el navegador
-- usando la API cliente de Supabase (por ejemplo: supabase.auth.updateUser({ data: { role: 'admin' } })),
-- un usuario malintencionado podría auto-asignarse el rol 'admin' y saltarse las políticas RLS.
-- 
-- Solución:
-- Cambiar la política para validar estrictamente contra "app_metadata" (que solo es editable
-- desde el backend o funciones con privilegios 'security definer', nunca por el cliente).

-- 1. Eliminar la política anterior vulnerable
DROP POLICY IF EXISTS "Gestores y Admins pueden crear/modificar perfiles" ON public.profiles;

-- 2. Recrear la política utilizando estrictamente "app_metadata"
CREATE POLICY "Gestores y Admins pueden crear/modificar perfiles"
    ON public.profiles
    FOR ALL
    TO authenticated
    USING (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'gestor_usuarios')
    )
    WITH CHECK (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'gestor_usuarios')
    );

-- 3. Corregir también la función get_access_role() para priorizar estrictamente app_metadata
-- y no usar user_metadata como fallback en contextos de seguridad.
CREATE OR REPLACE FUNCTION public.get_access_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        'cliente_view'
    ));
$$;
