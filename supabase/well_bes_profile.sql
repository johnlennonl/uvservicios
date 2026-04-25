create extension if not exists pgcrypto;

create or replace function public.is_read_only_client()
returns boolean
language sql
stable
as $$
    select lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'ingeniero@uvservicios.com'
    );
$$;

create table if not exists public.well_bes_profile (
    id uuid primary key default gen_random_uuid(),
    pozo_name text not null unique,
    pump_type text not null,
    updated_at timestamptz not null default now()
);

create index if not exists well_bes_profile_pozo_idx
    on public.well_bes_profile (pozo_name);

alter table public.well_bes_profile enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_bes_profile'
          and policyname = 'Allow authenticated read access to bes profile'
    ) then
        create policy "Allow authenticated read access to bes profile"
            on public.well_bes_profile
            for select
            to authenticated
            using (true);
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_bes_profile'
          and policyname = 'Allow authenticated insert access to bes profile'
    ) then
        create policy "Allow authenticated insert access to bes profile"
            on public.well_bes_profile
            for insert
            to authenticated
            with check (not public.is_read_only_client());
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'well_bes_profile'
          and policyname = 'Allow authenticated update access to bes profile'
    ) then
        create policy "Allow authenticated update access to bes profile"
            on public.well_bes_profile
            for update
            to authenticated
            using (not public.is_read_only_client())
            with check (not public.is_read_only_client());
    end if;
end $$;