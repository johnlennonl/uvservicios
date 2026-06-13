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

create or replace function public.can_manage_monitoring()
returns boolean
language sql
stable
as $$
    select public.get_access_role() in ('admin', 'supervisor');
$$;

create table if not exists public.consolidated_dashboard_general (
    id uuid primary key default gen_random_uuid(),
    source_type text not null default 'legacy_excel',
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
    constraint consolidated_dashboard_general_source_type_check
        check (source_type in ('legacy_excel', 'field_journey', 'manual_adjustment')),
    constraint consolidated_dashboard_general_row_hash_length
        check (char_length(row_hash) <= 96),
    constraint consolidated_dashboard_general_row_data_object
        check (jsonb_typeof(row_data) = 'object'),
    constraint consolidated_dashboard_general_column_labels_array
        check (jsonb_typeof(column_labels) = 'array')
);

create unique index if not exists consolidated_dashboard_general_row_hash_uidx
    on public.consolidated_dashboard_general (row_hash);

update public.consolidated_dashboard_general
set row_hash = encode(digest(row_hash, 'sha256'), 'hex')
where char_length(row_hash) > 96;

alter table public.consolidated_dashboard_general
    drop constraint if exists consolidated_dashboard_general_row_hash_length;

alter table public.consolidated_dashboard_general
    add constraint consolidated_dashboard_general_row_hash_length
    check (char_length(row_hash) <= 96);

create index if not exists consolidated_dashboard_general_pozo_date_idx
    on public.consolidated_dashboard_general (pozo, report_date desc, report_time desc);

create index if not exists consolidated_dashboard_general_source_idx
    on public.consolidated_dashboard_general (source_type, created_at desc);

create index if not exists consolidated_dashboard_general_journey_idx
    on public.consolidated_dashboard_general (source_journey_id)
    where source_journey_id is not null;

alter table public.consolidated_dashboard_general enable row level security;

drop policy if exists "consolidated dashboard select authenticated" on public.consolidated_dashboard_general;
create policy "consolidated dashboard select authenticated"
on public.consolidated_dashboard_general
for select
to authenticated
using (true);

drop policy if exists "consolidated dashboard insert management" on public.consolidated_dashboard_general;
create policy "consolidated dashboard insert management"
on public.consolidated_dashboard_general
for insert
to authenticated
with check (public.can_manage_monitoring());

drop policy if exists "consolidated dashboard update management" on public.consolidated_dashboard_general;
create policy "consolidated dashboard update management"
on public.consolidated_dashboard_general
for update
to authenticated
using (public.can_manage_monitoring())
with check (public.can_manage_monitoring());

drop policy if exists "consolidated dashboard delete management" on public.consolidated_dashboard_general;
create policy "consolidated dashboard delete management"
on public.consolidated_dashboard_general
for delete
to authenticated
using (public.can_manage_monitoring());

create or replace function public.touch_consolidated_dashboard_general_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_consolidated_dashboard_general_updated_at on public.consolidated_dashboard_general;
create trigger trg_consolidated_dashboard_general_updated_at
before update on public.consolidated_dashboard_general
for each row
execute function public.touch_consolidated_dashboard_general_updated_at();

comment on table public.consolidated_dashboard_general is 'Filas normalizadas del consolidado maestro Dashboard General. Conserva el Excel legacy y luego filas publicadas desde Campo.';
comment on column public.consolidated_dashboard_general.row_data is 'Objeto JSON con valores por nombre exacto de columna del Dashboard General.';
comment on column public.consolidated_dashboard_general.column_labels is 'Orden de columnas detectado desde el Excel fuente para reconstruir exportaciones.';

notify pgrst, 'reload schema';
