-- ======================================================================
-- PARCHE: Sincronización Automática de Roles al Crear Nuevos Usuarios
-- ======================================================================
--
-- Explicación:
-- Cuando creas un usuario desde la pantalla "Registrar Nuevo Usuario",
-- el frontend envía el rol dentro de "user_metadata" (que es el campo editable).
--
-- Para que el nuevo usuario tenga el rol guardado de forma segura en "app_metadata"
-- desde el primer segundo de su creación, actualizamos la función disparadora
-- "auto_confirm_user_email()" que ya se ejecuta antes de insertar el usuario en Supabase.

CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS trigger
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Confirmar el correo automáticamente
    new.email_confirmed_at = now();
    
    -- 2. Copiar el rol de user_metadata a app_metadata de forma automática y segura
    new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb) 
        || jsonb_build_object('role', coalesce(new.raw_user_meta_data ->> 'role', 'cliente_view'));
        
    RETURN new;
END;
$$;
