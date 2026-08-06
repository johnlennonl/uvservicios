create extension if not exists pgcrypto;

create table if not exists public.monitoring_point_annotations (
    id uuid primary key default gen_random_uuid(),
    operational_scope text not null default 'ceiba_tomoporo',
    pozo_name text not null,
    chart_key text not null,
    variable_key text not null,
    variable_label text not null,
    point_fecha date not null,
    point_hora time not null,
    point_value numeric,
    comment text not null,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_by_email text not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_email text,
    updated_at timestamptz,
    deleted_at timestamptz,
    deleted_by_user_id uuid references auth.users(id) on delete set null,
    deleted_by_email text,
    delete_reason text,
    metadata jsonb not null default '{}'::jsonb,
    constraint monitoring_point_annotations_metadata_object
        check (jsonb_typeof(metadata) = 'object')
);

create index if not exists monitoring_point_annotations_lookup_idx
    on public.monitoring_point_annotations (
        operational_scope,
        pozo_name,
        chart_key,
        variable_key,
        point_fecha,
        point_hora
    )
    where deleted_at is null;

create unique index if not exists monitoring_point_annotations_active_uidx
    on public.monitoring_point_annotations (
        operational_scope,
        pozo_name,
        chart_key,
        variable_key,
        point_fecha,
        point_hora
    )
    where deleted_at is null;

alter table public.monitoring_point_annotations enable row level security;

drop policy if exists "monitoring annotations select management" on public.monitoring_point_annotations;
create policy "monitoring annotations select management"
on public.monitoring_point_annotations
for select
to authenticated
using (public.can_manage_monitoring());

drop policy if exists "monitoring annotations select readonly" on public.monitoring_point_annotations;
create policy "monitoring annotations select readonly"
on public.monitoring_point_annotations
for select
to authenticated
using (public.get_access_role() = 'cliente_view');

drop policy if exists "monitoring annotations insert management" on public.monitoring_point_annotations;
create policy "monitoring annotations insert management"
on public.monitoring_point_annotations
for insert
to authenticated
with check (public.can_manage_monitoring());

drop policy if exists "monitoring annotations update management" on public.monitoring_point_annotations;
create policy "monitoring annotations update management"
on public.monitoring_point_annotations
for update
to authenticated
using (public.can_manage_monitoring())
with check (public.can_manage_monitoring());

comment on table public.monitoring_point_annotations is 'Anotaciones tecnicas de ingenieria asociadas a puntos especificos de graficas operativas.';
comment on column public.monitoring_point_annotations.chart_key is 'Identificador de la grafica ApexCharts, por ejemplo chart-vsd-triphase.';
comment on column public.monitoring_point_annotations.variable_key is 'Campo operativo anotado, por ejemplo vsd_a, tm, pip o frecuencia.';
