create extension if not exists pgcrypto;

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

create or replace function public.is_read_only_client()
returns boolean
language sql
stable
as $$
    select public.get_access_role() = 'cliente_view';
$$;

create or replace function public.can_manage_monitoring()
returns boolean
language sql
stable
as $$
    select public.get_access_role() in ('admin', 'supervisor');
$$;

create table if not exists public.well_production_history (
    id uuid primary key default gen_random_uuid(),
    pozo_name text not null,
    campo_name text,
    ef text,
    fecha date not null,
    bbpd numeric(12,2) default 0,
    ays_percentage numeric(12,2) default 0,
    bnpd numeric(12,2) default 0,
    cat_number integer default 1,
    created_at timestamptz not null default now()
);

create unique index if not exists well_production_history_pozo_fecha_uidx
    on public.well_production_history (pozo_name, fecha);

create index if not exists well_production_history_pozo_fecha_idx
    on public.well_production_history (pozo_name, fecha desc);

alter table public.well_production_history enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_production_history'
          and policyname = 'Allow authenticated read access to technical history'
    ) then
        create policy "Allow authenticated read access to technical history"
            on public.well_production_history
            for select
            to authenticated
            using (true);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_production_history'
          and policyname = 'Allow authenticated insert access to technical history'
    ) then
        create policy "Allow authenticated insert access to technical history"
            on public.well_production_history
            for insert
            to authenticated
            with check (public.can_manage_monitoring());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_production_history'
          and policyname = 'Allow authenticated update access to technical history'
    ) then
        create policy "Allow authenticated update access to technical history"
            on public.well_production_history
            for update
            to authenticated
            using (public.can_manage_monitoring())
            with check (public.can_manage_monitoring());
    end if;
end $$;

insert into public.well_production_history (
    pozo_name,
    campo_name,
    ef,
    fecha,
    bbpd,
    ays_percentage,
    bnpd,
    cat_number
)
select
    pozo_name,
    campo_name,
    ef,
    fecha,
    bbpd,
    ays_percentage,
    bnpd,
    cat_number
from public.well_production
where fecha is not null
on conflict (pozo_name, fecha) do nothing;