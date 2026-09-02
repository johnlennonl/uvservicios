--
-- CORRECCIÓN DE AUTORÍA Y POLÍTICAS RLS EN public.field_journeys
-- Resuelve la invisibilidad de jornadas borrador y pendientes cuando se usa cuenta compartida/universal
--

-- 1. Sincronizar submitted_by_user_id con el ID real de auth.users basado en el correo
update public.field_journeys j
set submitted_by_user_id = u.id
from auth.users u
where lower(trim(j.submitted_by_email)) = lower(trim(u.email))
  and (j.submitted_by_user_id is null or j.submitted_by_user_id != u.id);

-- 2. Permitir lectura de jornadas creadas por el usuario o pertenecientes al ámbito operativo
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

-- 3. Permitir inserción de borradores propios
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

-- 4. Permitir actualización de borradores propios
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
