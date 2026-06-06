create extension if not exists pgcrypto;

--
-- Workflow nuevo y paralelo para Campo -> Admin Campo.
-- No modifica ni reemplaza la tabla legacy public.field_journey_reports.
--

create table if not exists public.field_journeys (
    id uuid primary key default gen_random_uuid(),
    submitted_by_user_id uuid references auth.users(id) on delete set null,
    submitted_by_email text not null,
    journey_date date not null,
    jornada text not null default 'Diurna'
        check (jornada in ('Diurna', 'Nocturna', 'Especial')),
    equipo_guardia text not null,
    locacion_jornada text,
    status text not null default 'draft'
        check (status in ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'published', 'archived')),
    submission_source text not null default 'field-web',
    total_reports integer not null default 0 check (total_reports >= 0),
    first_report_time time,
    last_report_time time,
    submitted_at timestamptz,
    review_started_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by_user_id uuid references auth.users(id) on delete set null,
    reviewed_by_email text,
    admin_notes text,
    published_at timestamptz,
    published_by_user_id uuid references auth.users(id) on delete set null,
    published_by_email text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists field_journeys_status_date_idx
    on public.field_journeys (status, journey_date desc, created_at desc);

create index if not exists field_journeys_owner_idx
    on public.field_journeys (submitted_by_user_id, journey_date desc);

create index if not exists field_journeys_owner_email_idx
    on public.field_journeys (lower(submitted_by_email), journey_date desc);

create table if not exists public.field_journey_records (
    id uuid primary key default gen_random_uuid(),
    journey_id uuid not null references public.field_journeys(id) on delete cascade,
    source_client_report_id text,
    pozo text not null,
    report_date date not null,
    report_time time not null default '00:00:00',
    campo text,
    ef text,
    estado text,
    categoria text,
    actividad text,
    estatus text,
    modo_operacion text,
    sentido_giro text,
    potencial numeric,
    bruta numeric,
    neta numeric,
    ays_percentage numeric,
    frecuencia numeric,
    i_motor numeric,
    v_motor numeric,
    out_vsd numeric,
    pip_psi numeric,
    pd_psi numeric,
    ti_f numeric,
    tm_f numeric,
    thp_psi numeric,
    chp_psi numeric,
    lf_psi numeric,
    observaciones_pozo text,
    diagnostico text,
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint field_journey_records_raw_payload_object
        check (jsonb_typeof(raw_payload) = 'object')
);

create unique index if not exists field_journey_records_source_client_uidx
    on public.field_journey_records (journey_id, source_client_report_id)
    where source_client_report_id is not null;

create index if not exists field_journey_records_journey_idx
    on public.field_journey_records (journey_id, report_time asc, pozo asc);

create index if not exists field_journey_records_pozo_idx
    on public.field_journey_records (pozo, report_date desc, report_time desc);

create table if not exists public.field_journey_review_log (
    id uuid primary key default gen_random_uuid(),
    journey_id uuid not null references public.field_journeys(id) on delete cascade,
    action text not null
        check (action in ('submitted', 'under_review', 'approved', 'rejected', 'published', 'reopened', 'commented')),
    comment text,
    performed_by_user_id uuid references auth.users(id) on delete set null,
    performed_by_email text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint field_journey_review_log_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

create index if not exists field_journey_review_log_journey_idx
    on public.field_journey_review_log (journey_id, created_at desc);

create or replace function public.set_field_workflow_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_field_journeys_updated_at on public.field_journeys;
create trigger trg_field_journeys_updated_at
before update on public.field_journeys
for each row
execute function public.set_field_workflow_updated_at();

drop trigger if exists trg_field_journey_records_updated_at on public.field_journey_records;
create trigger trg_field_journey_records_updated_at
before update on public.field_journey_records
for each row
execute function public.set_field_workflow_updated_at();

create or replace function public.refresh_field_journey_rollup()
returns trigger
language plpgsql
as $$
declare
    target_journey_id uuid;
begin
    target_journey_id := coalesce(new.journey_id, old.journey_id);

    update public.field_journeys
    set
        total_reports = coalesce((
            select count(*)::integer
            from public.field_journey_records record
            where record.journey_id = target_journey_id
        ), 0),
        first_report_time = (
            select min(record.report_time)
            from public.field_journey_records record
            where record.journey_id = target_journey_id
        ),
        last_report_time = (
            select max(record.report_time)
            from public.field_journey_records record
            where record.journey_id = target_journey_id
        ),
        updated_at = timezone('utc', now())
    where id = target_journey_id;

    return coalesce(new, old);
end;
$$;

drop trigger if exists trg_field_journey_records_rollup_insert on public.field_journey_records;
create trigger trg_field_journey_records_rollup_insert
after insert on public.field_journey_records
for each row
execute function public.refresh_field_journey_rollup();

drop trigger if exists trg_field_journey_records_rollup_update on public.field_journey_records;
create trigger trg_field_journey_records_rollup_update
after update on public.field_journey_records
for each row
execute function public.refresh_field_journey_rollup();

drop trigger if exists trg_field_journey_records_rollup_delete on public.field_journey_records;
create trigger trg_field_journey_records_rollup_delete
after delete on public.field_journey_records
for each row
execute function public.refresh_field_journey_rollup();

alter table public.field_journeys enable row level security;
alter table public.field_journey_records enable row level security;
alter table public.field_journey_review_log enable row level security;

drop policy if exists "field journeys select own" on public.field_journeys;
create policy "field journeys select own"
on public.field_journeys
for select
to authenticated
using (
    auth.uid() = submitted_by_user_id
    or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journeys select management" on public.field_journeys;
create policy "field journeys select management"
on public.field_journeys
for select
to authenticated
using (public.can_manage_monitoring());

drop policy if exists "field journeys insert own" on public.field_journeys;
create policy "field journeys insert own"
on public.field_journeys
for insert
to authenticated
with check (
    auth.uid() = submitted_by_user_id
    and lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journeys update own" on public.field_journeys;
create policy "field journeys update own"
on public.field_journeys
for update
to authenticated
using (
    (
        auth.uid() = submitted_by_user_id
        or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and status in ('draft', 'submitted', 'rejected')
)
with check (
    auth.uid() = submitted_by_user_id
    and lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journeys update management" on public.field_journeys;
create policy "field journeys update management"
on public.field_journeys
for update
to authenticated
using (public.can_manage_monitoring())
with check (public.can_manage_monitoring());

drop policy if exists "field journeys delete own" on public.field_journeys;
create policy "field journeys delete own"
on public.field_journeys
for delete
to authenticated
using (
    (
        auth.uid() = submitted_by_user_id
        or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and status in ('draft', 'rejected')
);

drop policy if exists "field journeys delete management" on public.field_journeys;
create policy "field journeys delete management"
on public.field_journeys
for delete
to authenticated
using (public.can_manage_monitoring());

drop policy if exists "field records select own" on public.field_journey_records;
create policy "field records select own"
on public.field_journey_records
for select
to authenticated
using (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
          and (
              auth.uid() = journey.submitted_by_user_id
              or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
    )
);

drop policy if exists "field records select management" on public.field_journey_records;
create policy "field records select management"
on public.field_journey_records
for select
to authenticated
using (public.can_manage_monitoring());

drop policy if exists "field records insert own" on public.field_journey_records;
create policy "field records insert own"
on public.field_journey_records
for insert
to authenticated
with check (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
          and auth.uid() = journey.submitted_by_user_id
          and lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and journey.status in ('draft', 'submitted', 'rejected')
    )
);

drop policy if exists "field records update own" on public.field_journey_records;
create policy "field records update own"
on public.field_journey_records
for update
to authenticated
using (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
          and (
              auth.uid() = journey.submitted_by_user_id
              or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
          and journey.status in ('draft', 'submitted', 'rejected')
    )
)
with check (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
          and auth.uid() = journey.submitted_by_user_id
          and lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and journey.status in ('draft', 'submitted', 'rejected')
    )
);

drop policy if exists "field records delete own" on public.field_journey_records;
create policy "field records delete own"
on public.field_journey_records
for delete
to authenticated
using (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
          and (
              auth.uid() = journey.submitted_by_user_id
              or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
          and journey.status in ('draft', 'submitted', 'rejected')
    )
);

drop policy if exists "field records manage" on public.field_journey_records;
create policy "field records manage"
on public.field_journey_records
for all
to authenticated
using (public.can_manage_monitoring())
with check (public.can_manage_monitoring());

drop policy if exists "field review log select own" on public.field_journey_review_log;
create policy "field review log select own"
on public.field_journey_review_log
for select
to authenticated
using (
    exists (
        select 1
        from public.field_journeys journey
        where journey.id = field_journey_review_log.journey_id
          and (
              auth.uid() = journey.submitted_by_user_id
              or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
    )
);

drop policy if exists "field review log select management" on public.field_journey_review_log;
create policy "field review log select management"
on public.field_journey_review_log
for select
to authenticated
using (public.can_manage_monitoring());

drop policy if exists "field review log insert management" on public.field_journey_review_log;
create policy "field review log insert management"
on public.field_journey_review_log
for insert
to authenticated
with check (public.can_manage_monitoring());

comment on table public.field_journeys is 'Cabecera de cada jornada enviada desde Campo para revision administrativa.';
comment on table public.field_journey_records is 'Registros por pozo asociados a una jornada; conserva columnas clave y raw_payload completo.';
comment on table public.field_journey_review_log is 'Bitacora de acciones y comentarios de revision sobre jornadas de Campo.';
comment on column public.field_journey_records.raw_payload is 'Snapshot completo del formulario de Campo para evitar perder campos mientras evoluciona el modelo.';