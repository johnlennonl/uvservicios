create extension if not exists pgcrypto;

create table if not exists public.consolidated_dashboard_operational (
    id uuid primary key default gen_random_uuid(),
    source_type text not null default 'field_journey',
    source_file_name text,
    source_sheet_name text not null default 'DASHBOARD GENERAL',
    source_row_number integer,
    source_journey_id uuid references public.field_journeys(id) on delete set null,
    source_record_id uuid references public.field_journey_records(id) on delete set null,
    row_hash text not null,
    pozo text,
    campo text,
    ef text,
    report_date date,
    report_time time,
    row_data jsonb not null default '{}'::jsonb,
    column_labels jsonb not null default '[]'::jsonb,
    imported_by_user_id uuid default auth.uid(),
    imported_by_email text default (auth.jwt() ->> 'email'),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint consolidated_dashboard_operational_source_type_check
        check (source_type in ('field_journey')),
    constraint consolidated_dashboard_operational_row_hash_length
        check (char_length(row_hash) <= 96),
    constraint consolidated_dashboard_operational_row_data_object
        check (jsonb_typeof(row_data) = 'object'),
    constraint consolidated_dashboard_operational_column_labels_array
        check (jsonb_typeof(column_labels) = 'array')
);

create unique index if not exists consolidated_dashboard_operational_row_hash_uidx
    on public.consolidated_dashboard_operational (row_hash);

create index if not exists consolidated_dashboard_operational_pozo_date_idx
    on public.consolidated_dashboard_operational (pozo, report_date desc, report_time desc);

create index if not exists consolidated_dashboard_operational_journey_idx
    on public.consolidated_dashboard_operational (source_journey_id)
    where source_journey_id is not null;

alter table public.consolidated_dashboard_operational enable row level security;

drop policy if exists "consolidated operational select authenticated" on public.consolidated_dashboard_operational;
create policy "consolidated operational select authenticated"
on public.consolidated_dashboard_operational
for select
to authenticated
using (true);

drop policy if exists "consolidated operational insert management" on public.consolidated_dashboard_operational;
create policy "consolidated operational insert management"
on public.consolidated_dashboard_operational
for insert
to authenticated
with check (public.can_manage_monitoring());

drop policy if exists "consolidated operational update management" on public.consolidated_dashboard_operational;
create policy "consolidated operational update management"
on public.consolidated_dashboard_operational
for update
to authenticated
using (public.can_manage_monitoring())
with check (public.can_manage_monitoring());

drop policy if exists "consolidated operational delete management" on public.consolidated_dashboard_operational;
create policy "consolidated operational delete management"
on public.consolidated_dashboard_operational
for delete
to authenticated
using (public.can_manage_monitoring());

create or replace function public.touch_consolidated_dashboard_operational_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_consolidated_dashboard_operational_updated_at on public.consolidated_dashboard_operational;
create trigger trg_consolidated_dashboard_operational_updated_at
before update on public.consolidated_dashboard_operational
for each row
execute function public.touch_consolidated_dashboard_operational_updated_at();