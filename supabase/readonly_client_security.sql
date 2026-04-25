create or replace function public.is_read_only_client()
returns boolean
language sql
stable
as $$
    select lower(coalesce(auth.jwt() ->> 'email', '')) in (
        'ingeniero@uvservicios.com'
    );
$$;

alter table if exists public.monitoreo_pozos enable row level security;
alter table if exists public.well_production enable row level security;
alter table if exists public.well_production_history enable row level security;
alter table if exists public.well_bes_profile enable row level security;

do $$
declare
    policy_record record;
begin
    for policy_record in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in ('monitoreo_pozos', 'well_production', 'well_production_history', 'well_bes_profile')
          and 'authenticated' = any(roles)
    loop
        execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
    end loop;
end $$;

create policy "Allow authenticated read access to monitoring"
    on public.monitoreo_pozos
    for select
    to authenticated
    using (true);

create policy "Allow authenticated write access to monitoring except read only"
    on public.monitoreo_pozos
    for all
    to authenticated
    using (not public.is_read_only_client())
    with check (not public.is_read_only_client());

create policy "Allow authenticated read access to technical snapshot"
    on public.well_production
    for select
    to authenticated
    using (true);

create policy "Allow authenticated write access to technical snapshot except read only"
    on public.well_production
    for all
    to authenticated
    using (not public.is_read_only_client())
    with check (not public.is_read_only_client());

create policy "Allow authenticated read access to technical history"
    on public.well_production_history
    for select
    to authenticated
    using (true);

create policy "Allow authenticated write access to technical history except read only"
    on public.well_production_history
    for all
    to authenticated
    using (not public.is_read_only_client())
    with check (not public.is_read_only_client());

create policy "Allow authenticated read access to bes profile"
    on public.well_bes_profile
    for select
    to authenticated
    using (true);

create policy "Allow authenticated write access to bes profile except read only"
    on public.well_bes_profile
    for all
    to authenticated
    using (not public.is_read_only_client())
    with check (not public.is_read_only_client());
