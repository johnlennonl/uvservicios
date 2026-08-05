-- Aislamiento multi-contrato para datos operativos existentes.
-- Ejecutar despues de supabase/operational_contracts.sql.

alter table public.field_journeys
    add column if not exists operational_scope text;

alter table public.field_journey_records
    add column if not exists operational_scope text;

alter table public.field_journey_reports
    add column if not exists operational_scope text;

alter table public.monitoreo_pozos
    add column if not exists operational_scope text;

alter table public.well_production
    add column if not exists operational_scope text;

alter table public.well_production_history
    add column if not exists operational_scope text;

alter table public.well_bes_profile
    add column if not exists operational_scope text;

alter table public.consolidated_dashboard_operational
    add column if not exists operational_scope text;

alter table public.consolidated_dashboard_general
    add column if not exists operational_scope text;

update public.field_journey_records record
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(record.pozo)) = catalog.pozo_name
  and record.operational_scope is null;

update public.field_journeys journey
set operational_scope = scoped_records.operational_scope
from (
    select
        journey_id,
        min(operational_scope) as operational_scope
    from public.field_journey_records
    where operational_scope is not null
    group by journey_id
) scoped_records
where journey.id = scoped_records.journey_id
  and journey.operational_scope is null;

update public.field_journey_reports report
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(report.pozo)) = catalog.pozo_name
  and report.operational_scope is null;

update public.monitoreo_pozos record
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(record.pozo_name)) = catalog.pozo_name
    and record.operational_scope is null;

update public.well_production record
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(record.pozo_name)) = catalog.pozo_name
    and record.operational_scope is null;

update public.well_production_history record
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(record.pozo_name)) = catalog.pozo_name
    and record.operational_scope is null;

update public.well_bes_profile record
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(record.pozo_name)) = catalog.pozo_name
    and record.operational_scope is null;

update public.consolidated_dashboard_operational target_row
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(target_row.pozo)) = catalog.pozo_name
    and target_row.operational_scope is null;

update public.consolidated_dashboard_general target_row
set operational_scope = catalog.operational_scope
from public.field_well_catalog catalog
where upper(trim(target_row.pozo)) = catalog.pozo_name
    and target_row.operational_scope is null;

update public.field_journey_records record
set raw_payload = coalesce(record.raw_payload, '{}'::jsonb) || jsonb_build_object('operational_scope', record.operational_scope)
where record.operational_scope is not null
  and coalesce(record.raw_payload, '{}'::jsonb) ->> 'operational_scope' is null;

update public.consolidated_dashboard_operational target_row
set row_data = coalesce(target_row.row_data, '{}'::jsonb) || jsonb_build_object('OPERATIONAL_SCOPE', target_row.operational_scope)
where target_row.operational_scope is not null
    and coalesce(target_row.row_data, '{}'::jsonb) ->> 'OPERATIONAL_SCOPE' is null;

create index if not exists field_journeys_operational_scope_idx
    on public.field_journeys (operational_scope, status, journey_date desc, updated_at desc);

create index if not exists field_journey_records_operational_scope_idx
    on public.field_journey_records (operational_scope, pozo, report_date desc, report_time desc);

create index if not exists field_journey_reports_operational_scope_idx
    on public.field_journey_reports (operational_scope, pozo, report_date desc, report_time desc);

create index if not exists monitoreo_pozos_operational_scope_idx
    on public.monitoreo_pozos (operational_scope, pozo_name, fecha desc, hora desc);

create index if not exists well_production_operational_scope_idx
    on public.well_production (operational_scope, pozo_name);

create index if not exists well_production_history_operational_scope_idx
    on public.well_production_history (operational_scope, pozo_name, fecha desc);

create index if not exists well_bes_profile_operational_scope_idx
    on public.well_bes_profile (operational_scope, pozo_name);

create index if not exists consolidated_dashboard_operational_scope_idx
    on public.consolidated_dashboard_operational (operational_scope, pozo, report_date desc, report_time desc);

create index if not exists consolidated_dashboard_general_scope_idx
    on public.consolidated_dashboard_general (operational_scope, pozo, report_date desc, report_time desc);

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'field_journeys_operational_scope_fk'
    ) then
        alter table public.field_journeys
            add constraint field_journeys_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'field_journey_records_operational_scope_fk'
    ) then
        alter table public.field_journey_records
            add constraint field_journey_records_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'field_journey_reports_operational_scope_fk'
    ) then
        alter table public.field_journey_reports
            add constraint field_journey_reports_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'monitoreo_pozos_operational_scope_fk'
    ) then
        alter table public.monitoreo_pozos
            add constraint monitoreo_pozos_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'well_production_operational_scope_fk'
    ) then
        alter table public.well_production
            add constraint well_production_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'well_production_history_operational_scope_fk'
    ) then
        alter table public.well_production_history
            add constraint well_production_history_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'well_bes_profile_operational_scope_fk'
    ) then
        alter table public.well_bes_profile
            add constraint well_bes_profile_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'consolidated_dashboard_operational_scope_fk'
    ) then
        alter table public.consolidated_dashboard_operational
            add constraint consolidated_dashboard_operational_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'consolidated_dashboard_general_scope_fk'
    ) then
        alter table public.consolidated_dashboard_general
            add constraint consolidated_dashboard_general_scope_fk
            foreign key (operational_scope)
            references public.operational_contracts(scope_key)
            on update cascade
            not valid;
    end if;
end $$;