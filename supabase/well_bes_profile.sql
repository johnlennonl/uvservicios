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

create table if not exists public.well_bes_profile (
    id uuid primary key default gen_random_uuid(),
    pozo_name text not null unique,
    pump_type text not null,
    pump_manufacturer text,
    pump_model text,
    pump_serial text,
    suction_ft text,
    multiphase_pump text,
    gas_separator text,
    seal_section text,
    motor_manufacturer text,
    motor_model text,
    motor_hp text,
    motor_voltage text,
    motor_current text,
    amp_nominal_motor text,
    volt_nominal_motor text,
    frec_max_hz text,
    low_speed_hz text,
    ul_a text,
    ol_a text,
    i_limit_a text,
    tiempo_desaceleracion_seg text,
    low_pip_shutdown_psi text,
    max_high_temp_shutdown_f text,
    sensor_model text,
    cable_type text,
    drain_valve text,
    installed_at date,
    profile_notes text,
    updated_at timestamptz not null default now()
);

alter table public.well_bes_profile
    add column if not exists pump_manufacturer text,
    add column if not exists pump_model text,
    add column if not exists pump_serial text,
    add column if not exists suction_ft text,
    add column if not exists multiphase_pump text,
    add column if not exists gas_separator text,
    add column if not exists seal_section text,
    add column if not exists motor_manufacturer text,
    add column if not exists motor_model text,
    add column if not exists motor_hp text,
    add column if not exists motor_voltage text,
    add column if not exists motor_current text,
    add column if not exists amp_nominal_motor text,
    add column if not exists volt_nominal_motor text,
    add column if not exists frec_max_hz text,
    add column if not exists low_speed_hz text,
    add column if not exists ul_a text,
    add column if not exists ol_a text,
    add column if not exists i_limit_a text,
    add column if not exists tiempo_desaceleracion_seg text,
    add column if not exists low_pip_shutdown_psi text,
    add column if not exists max_high_temp_shutdown_f text,
    add column if not exists sensor_model text,
    add column if not exists cable_type text,
    add column if not exists drain_valve text,
    add column if not exists installed_at date,
    add column if not exists profile_notes text;

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
            with check (public.can_manage_monitoring());
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
            using (public.can_manage_monitoring())
            with check (public.can_manage_monitoring());
    end if;
end $$;

notify pgrst, 'reload schema';