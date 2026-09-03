--
-- CORRECCIÓN DEFINITIVA DE AUTORÍA Y POLÍTICAS RLS EN public.field_journeys Y public.field_journey_records
-- Resuelve la desincronización de pozos en borradores y jornadas en curso cuando submitted_by_user_id es NULL.
--

-- 1. Vincular submitted_by_user_id con el ID real de auth.users basado en el correo
update public.field_journeys j
set submitted_by_user_id = u.id
from auth.users u
where lower(trim(j.submitted_by_email)) = lower(trim(u.email))
  and (j.submitted_by_user_id is null or j.submitted_by_user_id != u.id);

-- 2. Permitir lectura de jornadas en public.field_journeys
drop policy if exists "field journeys select own" on public.field_journeys;
create policy "field journeys select own"
on public.field_journeys
for select
to authenticated
using (
    auth.uid() = submitted_by_user_id
    or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
);

-- 3. Permitir inserción de jornadas en public.field_journeys
drop policy if exists "field journeys insert own" on public.field_journeys;
create policy "field journeys insert own"
on public.field_journeys
for insert
to authenticated
with check (
    auth.uid() = submitted_by_user_id
    or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or submitted_by_user_id is null
);

-- 4. Permitir actualización de borradores en public.field_journeys
drop policy if exists "field journeys update own" on public.field_journeys;
create policy "field journeys update own"
on public.field_journeys
for update
to authenticated
using (
    (
        auth.uid() = submitted_by_user_id
        or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
    )
    and status in ('draft', 'submitted', 'rejected')
)
with check (
    auth.uid() = submitted_by_user_id
    or lower(submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
);

-- 5. Permitir lectura de registros de pozos en public.field_journey_records (REPARA LA VISTA DE POZOS EN CURSO)
drop policy if exists "field records select own" on public.field_journey_records;
create policy "field records select own"
on public.field_journey_records
for select
to authenticated
using (
    exists (
        select 1 from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
        and (
            journey.submitted_by_user_id = auth.uid()
            or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or journey.operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
        )
    )
);

-- 6. Permitir inserción de registros de pozos en public.field_journey_records
drop policy if exists "field records insert own" on public.field_journey_records;
create policy "field records insert own"
on public.field_journey_records
for insert
to authenticated
with check (
    exists (
        select 1 from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
        and (
            journey.submitted_by_user_id = auth.uid()
            or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or journey.operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
        )
    )
);

-- 7. Permitir actualización de registros de pozos en public.field_journey_records
drop policy if exists "field records update own" on public.field_journey_records;
create policy "field records update own"
on public.field_journey_records
for update
to authenticated
using (
    exists (
        select 1 from public.field_journeys journey
        where journey.id = field_journey_records.journey_id
        and (
            journey.submitted_by_user_id = auth.uid()
            or lower(journey.submitted_by_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or journey.operational_scope in ('crc_ll', 'ccrc_ll', 'bmm', 'ceiba_tomoporo')
        )
    )
);
