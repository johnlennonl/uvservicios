-- ==============================================================================
-- SEGURIDAD: SOPORTE DE PIN OPERATIVO INDIVIDUAL Y ENCRIPTADO
-- ==============================================================================
-- Este script habilita PINs encriptados individuales para cada usuario en la
-- plataforma, reemplazando el PIN global hardcodeado '4826'.
-- ==============================================================================

-- 1. Habilitar la extensión pgcrypto si no existe (necesaria para crypt y gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Añadir la columna pin_hash a la tabla public.profiles
-- Usamos como valor por defecto la encriptación del PIN inicial '0000'
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT crypt('0000', gen_salt('bf'));

-- 3. Actualizar a los usuarios existentes que no tengan PIN asignado
UPDATE public.profiles
SET pin_hash = crypt('0000', gen_salt('bf'))
WHERE pin_hash IS NULL;

-- 4. FUNCIÓN RPC: Verificar PIN del usuario actual de forma segura
CREATE OR REPLACE FUNCTION public.verify_my_pin(p_pin text)
RETURNS boolean
SECURITY DEFINER -- Ejecuta con permisos de owner para leer la tabla profiles de forma segura
LANGUAGE plpgsql
AS $$
declare
    v_user_id uuid;
    v_match boolean;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        return false;
    end if;
    
    select (pin_hash = crypt(p_pin, pin_hash)) into v_match
    from public.profiles
    where id = v_user_id;
    
    return coalesce(v_match, false);
end;
$$;

-- 5. FUNCIÓN RPC: Cambiar PIN del usuario actual de forma segura
CREATE OR REPLACE FUNCTION public.change_my_pin(p_old_pin text, p_new_pin text)
RETURNS boolean
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
declare
    v_user_id uuid;
    v_match boolean;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        return false;
    end if;
    
    -- Validar PIN actual (se permite cambio directo si el pin_hash es nulo)
    select 
        (pin_hash = crypt(p_old_pin, pin_hash)) or (pin_hash is null)
    into v_match
    from public.profiles
    where id = v_user_id;
    
    if not coalesce(v_match, false) then
        return false;
    end if;
    
    -- Validar longitud del nuevo PIN (debe ser de 4 dígitos numéricos)
    if p_new_pin !~ '^[0-9]{4}$' then
        raise exception 'El PIN debe constar de exactamente 4 dígitos numéricos.';
    end if;
    
    -- Guardar el PIN encriptado
    update public.profiles
    set pin_hash = crypt(p_new_pin, gen_salt('bf'))
    where id = v_user_id;
    
    return true;
end;
$$;

-- 6. FUNCIÓN RPC: Restablecer PIN de un usuario (Solo Administradores/DBA/Gestor de Usuarios)
CREATE OR REPLACE FUNCTION public.admin_reset_user_pin(p_target_user_id uuid)
RETURNS boolean
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
begin
    -- Validar permisos de administrador, dba o gestor de usuarios
    if public.get_access_role() not in ('admin', 'base_datos', 'gestor_usuarios') then
        raise exception 'Acceso denegado: Se requieren permisos de administrador.';
    end if;
    
    -- Restablecer el PIN al inicial encriptado '0000'
    update public.profiles
    set pin_hash = crypt('0000', gen_salt('bf'))
    where id = p_target_user_id;
    
    return true;
end;
$$;

-- Recargar caché de PostgREST
NOTIFY pgrst, 'reload schema';
