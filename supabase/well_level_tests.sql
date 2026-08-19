-- Script para crear la tabla de mediciones de niveles y presiones por Echómetro
create table if not exists public.well_level_tests (
    id uuid primary key default gen_random_uuid(),
    pozo_name text not null,
    fecha date not null,
    nivel_dinamico numeric(12,3) default 0,
    sumergencia numeric(12,3) default 0,
    presion_pip numeric(12,2) default 0,
    operational_scope text not null references public.operational_contracts(scope_key) on update cascade,
    file_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Índice único para evitar registros de nivel duplicados el mismo día para un mismo pozo
create unique index if not exists well_level_tests_pozo_fecha_uidx
    on public.well_level_tests (pozo_name, fecha);

-- Índice para ordenación rápida por fecha
create index if not exists well_level_tests_pozo_fecha_idx
    on public.well_level_tests (pozo_name, fecha desc);

-- Índice de aislamiento de seguridad por contrato
create index if not exists well_level_tests_operational_scope_idx
    on public.well_level_tests (operational_scope, pozo_name, fecha desc);

-- Habilitar Row Level Security (RLS)
alter table public.well_level_tests enable row level security;

-- Crear políticas de acceso basadas en roles de usuario
do $$
begin
    -- Política de lectura: Todos los usuarios autenticados pueden consultar las mediciones
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_level_tests'
          and policyname = 'Allow authenticated read access to level tests'
    ) then
        create policy "Allow authenticated read access to level tests"
            on public.well_level_tests
            for select
            to authenticated
            using (true);
    end if;

    -- Política de inserción: Solo administradores y supervisores pueden ingresar datos
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_level_tests'
          and policyname = 'Allow authenticated insert access to level tests'
    ) then
        create policy "Allow authenticated insert access to level tests"
            on public.well_level_tests
            for insert
            to authenticated
            with check (public.can_manage_monitoring());
    end if;

    -- Política de actualización: Solo administradores y supervisores pueden modificar datos
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_level_tests'
          and policyname = 'Allow authenticated update access to level tests'
    ) then
        create policy "Allow authenticated update access to level tests"
            on public.well_level_tests
            for update
            to authenticated
            using (public.can_manage_monitoring())
            with check (public.can_manage_monitoring());
    end if;

    -- Política de eliminación: Solo administradores y supervisores pueden eliminar datos de nivel
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_level_tests'
          and policyname = 'Allow authenticated delete access to level tests'
    ) then
        create policy "Allow authenticated delete access to level tests"
            on public.well_level_tests
            for delete
            to authenticated
            using (public.can_manage_monitoring());
    end if;
end $$;
