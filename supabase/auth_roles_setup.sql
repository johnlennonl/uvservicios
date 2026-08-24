create or replace function public.get_access_role()
returns text
language sql
stable
as $$
    select lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        'cliente_view'
    ));
$$;

create or replace function public.can_manage_monitoring()
returns boolean
language sql
stable
as $$
    select public.get_access_role() in ('admin', 'supervisor', 'gerencial');
$$;

create or replace function public.is_read_only_client()
returns boolean
language sql
stable
as $$
    select public.get_access_role() = 'cliente_view';
$$;

-- Ver usuarios actuales y su rol cargado en metadata.
select
    id,
    email,
    coalesce(raw_app_meta_data ->> 'role', raw_user_meta_data ->> 'role', 'cliente_view') as current_role,
    created_at,
    last_sign_in_at
from auth.users
order by created_at desc;

-- Asignaciones iniciales sugeridas.
-- Ajusta los correos solo aqui en backend si necesitas otros usuarios.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('admin@uvservicios.com');

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'supervisor')
where lower(email) = lower('supervisor@uvservicios.com');

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'campo')
where lower(email) = lower('ingcampo@uvservicios.com');

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'cliente_view')
where lower(email) = lower('ingeniero@uvservicios.com');

-- Sincronizar la tabla public.profiles con los roles definidos en auth.users
update public.profiles p
set role = coalesce(
  u.raw_app_meta_data ->> 'role',
  u.raw_user_meta_data ->> 'role',
  'cliente_view'
)
from auth.users u
where p.id = u.id;

-- Sincronizar fechas de último acceso desde auth.users (para no mostrar "Nunca" si ya han ingresado)
update public.profiles p
set last_login_at = u.last_sign_in_at
from auth.users u
where p.id = u.id and p.last_login_at is null;

-- Crear tabla de historial de ingresos si no existe
create table if not exists public.user_access_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade,
    email text not null,
    login_time timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS en logs de accesos
alter table public.user_access_logs enable row level security;

-- Borrar políticas previas para evitar duplicidad al re-ejecutar
drop policy if exists "Allow authenticated read to user_access_logs" on public.user_access_logs;
drop policy if exists "Allow authenticated insert to user_access_logs" on public.user_access_logs;

-- Crear nuevas políticas RLS
create policy "Allow authenticated read to user_access_logs"
    on public.user_access_logs for select to authenticated using (true);

create policy "Allow authenticated insert to user_access_logs"
    on public.user_access_logs for insert to authenticated with check (true);

-- Crear función RPC segura para cambio de contraseñas por administradores
create or replace function public.admin_change_user_password(
    target_user_id uuid,
    new_password text
)
returns boolean
security definer -- se ejecuta con privilegios de superusuario para poder escribir en auth.users
language plpgsql
as $$
declare
    calling_user_role text;
begin
    -- 1. Obtener rol de quien llama
    calling_user_role := lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        'cliente_view'
    ));

    -- 2. Validar permisos
    if calling_user_role not in ('admin', 'gestor_usuarios') then
        raise exception 'Acceso denegado. No tienes permisos para cambiar contraseñas.';
    end if;

    -- 3. Validar longitud
    if length(new_password) < 6 then
        raise exception 'La contraseña debe tener al menos 6 caracteres.';
    end if;

    -- 4. Actualizar en auth.users
    update auth.users
    set encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    where id = target_user_id;

    -- 5. Guardar la contraseña plana en profiles para consulta del administrador
    update public.profiles
    set clave_plana = new_password
    where id = target_user_id;

    return true;
end;
$$;

-- Crear función RPC segura para actualización de perfiles por administradores
create or replace function public.admin_update_user_profile(
    target_user_id uuid,
    new_nombre text,
    new_apellido text,
    new_empresa text,
    new_role text
)
returns boolean
security definer -- se ejecuta con privilegios de superusuario para poder escribir en auth.users
language plpgsql
as $$
declare
    calling_user_role text;
begin
    -- 1. Obtener rol de quien llama
    calling_user_role := lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        'cliente_view'
    ));

    -- 2. Validar permisos
    if calling_user_role not in ('admin', 'gestor_usuarios') then
        raise exception 'Acceso denegado. No tienes permisos para modificar perfiles.';
    end if;

    -- 3. Actualizar la tabla pública profiles
    update public.profiles
    set nombre = new_nombre,
        apellido = new_apellido,
        empresa = new_empresa,
        role = new_role
    where id = target_user_id;

    -- 4. Actualizar metadatos en auth.users
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) 
        || jsonb_build_object('nombre', new_nombre, 'apellido', new_apellido, 'empresa', new_empresa, 'role', new_role),
        raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', new_role)
    where id = target_user_id;

    return true;
end;
$$;

-- Disparador para confirmar automáticamente el correo de todos los usuarios nuevos
create or replace function public.auto_confirm_user_email()
returns trigger
security definer
language plpgsql
as $$
begin
    new.email_confirmed_at = now();
    return new;
end;
$$;

drop trigger if exists tr_auto_confirm_user_email on auth.users;
create trigger tr_auto_confirm_user_email
    before insert on auth.users
    for each row
    execute function public.auto_confirm_user_email();

-- Verificacion final.
select
    id,
    email,
    raw_app_meta_data ->> 'role' as app_role,
    raw_user_meta_data ->> 'role' as user_role
from auth.users
order by email asc;

-- ==========================================
-- FUNCIÓN RPC PARA ELIMINAR USUARIOS SECURE
-- ==========================================
create or replace function public.admin_delete_user(
    target_user_id uuid
)
returns boolean
security definer -- ejecuta con privilegios de superusuario para borrar en auth.users
language plpgsql
as $$
declare
    calling_user_role text;
begin
    -- 1. Obtener el rol del usuario que realiza la petición
    calling_user_role := lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        'cliente_view'
    ));

    -- 2. Validar privilegios de administrador o gestor de usuarios
    if calling_user_role not in ('admin', 'gestor_usuarios') then
        raise exception 'Acceso denegado. No tienes permisos para eliminar usuarios.';
    end if;

    -- 3. Evitar que un usuario se auto-elimine
    if target_user_id = auth.uid() then
        raise exception 'Operación inválida. No puedes eliminar tu propia cuenta en uso.';
    end if;

    -- 4. Eliminar el usuario de auth.users (el cascade borrará su perfil en public.profiles y logs asociados)
    delete from auth.users
    where id = target_user_id;

    return true;
end;
$$;