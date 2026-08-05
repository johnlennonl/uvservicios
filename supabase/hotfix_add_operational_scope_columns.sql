-- Hotfix seguro para habilitar escritura multi-contrato sin backfill.
-- Ejecutar antes de probar Campo/Admin Campo si aparece:
-- column monitoreo_pozos.operational_scope does not exist

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
