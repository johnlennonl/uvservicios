-- Catalogos operativos para separar contratos, tecnicos, pozos y usuarios asignados.
-- Ejecutar en Supabase cuando se vaya a activar la gestion por contrato.

create table if not exists public.operational_contracts (
    id uuid primary key default gen_random_uuid(),
    scope_key text not null unique,
    display_name text not null,
    short_name text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.field_technicians (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    operational_scope text not null references public.operational_contracts(scope_key) on update cascade,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint field_technicians_unique_name_scope unique (full_name, operational_scope)
);

create table if not exists public.field_well_catalog (
    id uuid primary key default gen_random_uuid(),
    pozo_name text not null,
    campo_name text not null,
    operational_scope text not null references public.operational_contracts(scope_key) on update cascade,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint field_well_catalog_unique_pozo unique (pozo_name)
);

create table if not exists public.user_operational_scopes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    operational_scope text not null references public.operational_contracts(scope_key) on update cascade,
    is_default boolean not null default false,
    can_switch boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_operational_scopes_unique_user_scope unique (user_id, operational_scope)
);

insert into public.operational_contracts (scope_key, display_name, short_name)
values
    ('ceiba_tomoporo', 'Ceiba / Tomoporo', 'CT'),
    ('bmm', 'Barua / Motatan / Mene Grande', 'BMM')
on conflict (scope_key) do update
set display_name = excluded.display_name,
    short_name = excluded.short_name,
    active = true,
    updated_at = now();

-- Semilla inicial de tecnicos actuales del contrato Ceiba / Tomoporo.
insert into public.field_technicians (full_name, operational_scope)
values
    ('ALFREEDO JESUS CHIRINOS AREVALO', 'ceiba_tomoporo'),
    ('ALEXANDER JOSE CHIRINOS APOSTOL', 'ceiba_tomoporo'),
    ('ARMANDO JESUS CHIRINOS APOSTOL', 'ceiba_tomoporo'),
    ('JUAN CARLOS CHIRINOS AREVALO', 'ceiba_tomoporo'),
    ('OSWALDO JOSE CURIEL ROMERO', 'ceiba_tomoporo'),
    ('MARVIL XAVIER CARDONA HERRERA', 'ceiba_tomoporo'),
    ('WILSON JOSE SILVA APUSHANA', 'ceiba_tomoporo'),
    ('CARLOS LUIS REYES LARA', 'ceiba_tomoporo'),
    ('HECTOR JOSE DIAZ ELIAS', 'ceiba_tomoporo'),
    ('JOSE LUIS CHIRINOS', 'ceiba_tomoporo'),
    ('CESAR JOSE MEDINA CANIZALEZ', 'ceiba_tomoporo'),
    ('ROSS AMEL SAENZ ZAMBRANO', 'ceiba_tomoporo'),
    ('EDIXON ENRIQUE CHIRINOS AREVALO', 'ceiba_tomoporo'),
    ('DAVID ANDRE MORELO PARRA', 'ceiba_tomoporo'),
    ('JOSMAR GREGORIO MORALES SANCHEZ', 'ceiba_tomoporo'),
    ('ELDY FRANCISCO DEBEL CHOURIO', 'ceiba_tomoporo')
on conflict (full_name, operational_scope) do update
set active = true,
    updated_at = now();

-- Migrar pozos actuales usando la misma fuente que el selector del Dashboard:
-- monitoreo_pozos + well_production + well_bes_profile.
insert into public.field_well_catalog (pozo_name, campo_name, operational_scope)
select distinct on (pozo_name)
    pozo_name,
    coalesce(campo_name, 'SIN CLASIFICAR') as campo_name,
    'ceiba_tomoporo'
from (
    select
        upper(trim(pozo_name)) as pozo_name,
        case
            when upper(trim(campo_name)) like '%CEIBA%' then 'LA CEIBA'
            when upper(trim(campo_name)) like '%TOMOPORO%' then 'TOMOPORO'
            when upper(trim(pozo_name)) like 'CEI%' then 'LA CEIBA'
            when upper(trim(pozo_name)) like 'TOM%' then 'TOMOPORO'
            else nullif(upper(trim(campo_name)), '')
        end as campo_name
    from public.well_production
    where nullif(trim(pozo_name), '') is not null
    union
    select
        upper(trim(pozo_name)) as pozo_name,
        case
            when upper(trim(campo)) like '%CEIBA%' then 'LA CEIBA'
            when upper(trim(campo)) like '%TOMOPORO%' then 'TOMOPORO'
            when upper(trim(pozo_name)) like 'CEI%' then 'LA CEIBA'
            when upper(trim(pozo_name)) like 'TOM%' then 'TOMOPORO'
            else nullif(upper(trim(campo)), '')
        end as campo_name
    from public.monitoreo_pozos
    where nullif(trim(pozo_name), '') is not null
    union
    select
        upper(trim(pozo_name)) as pozo_name,
        case
            when upper(trim(pozo_name)) like 'CEI%' then 'LA CEIBA'
            when upper(trim(pozo_name)) like 'TOM%' then 'TOMOPORO'
            else null
        end as campo_name
    from public.well_bes_profile
    where nullif(trim(pozo_name), '') is not null
) existing_wells
where pozo_name is not null
order by
    pozo_name,
    case
        when campo_name in ('LA CEIBA', 'TOMOPORO') then 0
        when campo_name is not null then 1
        else 2
    end
on conflict (pozo_name) do update
set campo_name = excluded.campo_name,
    operational_scope = excluded.operational_scope,
    active = true,
    updated_at = now();

alter table public.operational_contracts enable row level security;
alter table public.field_technicians enable row level security;
alter table public.field_well_catalog enable row level security;
alter table public.user_operational_scopes enable row level security;

drop policy if exists "Read operational contracts" on public.operational_contracts;
drop policy if exists "Manage operational contracts" on public.operational_contracts;
drop policy if exists "Read field technicians" on public.field_technicians;
drop policy if exists "Manage field technicians" on public.field_technicians;
drop policy if exists "Read field well catalog" on public.field_well_catalog;
drop policy if exists "Manage field well catalog" on public.field_well_catalog;
drop policy if exists "Read user operational scopes" on public.user_operational_scopes;
drop policy if exists "Manage user operational scopes" on public.user_operational_scopes;

create policy "Read operational contracts"
    on public.operational_contracts for select to authenticated using (true);

create policy "Manage operational contracts"
    on public.operational_contracts for all to authenticated
    using (public.get_access_role() in ('admin', 'gestor_usuarios'))
    with check (public.get_access_role() in ('admin', 'gestor_usuarios'));

create policy "Read field technicians"
    on public.field_technicians for select to authenticated using (true);

create policy "Manage field technicians"
    on public.field_technicians for all to authenticated
    using (public.get_access_role() in ('admin', 'gestor_usuarios'))
    with check (public.get_access_role() in ('admin', 'gestor_usuarios'));

create policy "Read field well catalog"
    on public.field_well_catalog for select to authenticated using (true);

create policy "Manage field well catalog"
    on public.field_well_catalog for all to authenticated
    using (public.get_access_role() in ('admin', 'gestor_usuarios'))
    with check (public.get_access_role() in ('admin', 'gestor_usuarios'));

create policy "Read user operational scopes"
    on public.user_operational_scopes for select to authenticated using (true);

create policy "Manage user operational scopes"
    on public.user_operational_scopes for all to authenticated
    using (public.get_access_role() in ('admin', 'gestor_usuarios'))
    with check (public.get_access_role() in ('admin', 'gestor_usuarios'));