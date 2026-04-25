create extension if not exists pgcrypto;

create table if not exists public.field_journey_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    user_email text not null,
    client_report_id text not null,
    journey_key text not null,
    report_date date not null,
    report_time time not null default '00:00:00',
    jornada text not null default 'Diurna',
    equipo_guardia text not null,
    locacion_jornada text not null,
    pozo text not null,
    hz numeric not null,
    sentido_giro text not null,
    v_vsd numeric not null,
    i_mot numeric not null,
    v_mot numeric not null,
    thp numeric not null,
    lf numeric not null,
    chp numeric not null,
    pi numeric not null,
    pd numeric not null,
    ti numeric not null,
    tm numeric not null,
    ivsd_a numeric not null,
    ivsd_b numeric not null,
    ivsd_c numeric not null,
    comentario text not null,
    message_text text not null,
    saved_from text not null default 'field-web',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists field_journey_reports_user_client_report_uidx
    on public.field_journey_reports (user_email, client_report_id);

create index if not exists field_journey_reports_user_date_idx
    on public.field_journey_reports (user_email, report_date desc, report_time desc);

create or replace function public.set_field_journey_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists trg_field_journey_reports_updated_at on public.field_journey_reports;

create trigger trg_field_journey_reports_updated_at
before update on public.field_journey_reports
for each row
execute function public.set_field_journey_updated_at();

alter table public.field_journey_reports enable row level security;

drop policy if exists "field journey select own" on public.field_journey_reports;
create policy "field journey select own"
on public.field_journey_reports
for select
to authenticated
using (
    auth.uid() = user_id
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journey insert own" on public.field_journey_reports;
create policy "field journey insert own"
on public.field_journey_reports
for insert
to authenticated
with check (
    auth.uid() = user_id
    and lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journey update own" on public.field_journey_reports;
create policy "field journey update own"
on public.field_journey_reports
for update
to authenticated
using (
    auth.uid() = user_id
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
    auth.uid() = user_id
    and lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "field journey delete own" on public.field_journey_reports;
create policy "field journey delete own"
on public.field_journey_reports
for delete
to authenticated
using (
    auth.uid() = user_id
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);