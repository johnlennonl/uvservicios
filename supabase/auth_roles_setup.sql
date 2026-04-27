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
    select public.get_access_role() in ('admin', 'supervisor');
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

-- Verificacion final.
select
    id,
    email,
    raw_app_meta_data ->> 'role' as app_role,
    raw_user_meta_data ->> 'role' as user_role
from auth.users
order by email asc;

-- Si un usuario requiere quitar o cambiar rol:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'cliente_view')
-- where lower(email) = lower('usuario@dominio.com');