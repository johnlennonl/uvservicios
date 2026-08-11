--
-- Corrección de Autoría y RLS en public.field_journeys
-- Asegura que submitted_by_user_id coincida exactamente con auth.users.id
-- para que las vistas de Campo (Vercel y Local) muestren todas las cargas enviadas.
--

update public.field_journeys j
set submitted_by_user_id = u.id
from auth.users u
where lower(trim(j.submitted_by_email)) = lower(trim(u.email))
  and (j.submitted_by_user_id is null or j.submitted_by_user_id != u.id);

-- Para jornadas creadas por separación administrativa donde submitted_by_email era admin,
-- vincular al usuario de campo que registró los pozos en field_journey_records:
update public.field_journeys j
set 
    submitted_by_user_id = r.user_id,
    submitted_by_email = coalesce(r.raw_payload->>'user_email', j.submitted_by_email)
from (
    select distinct on (journey_id) journey_id, user_id, raw_payload
    from public.field_journey_records
    where user_id is not null
    order by journey_id, created_at asc
) r
where j.id = r.journey_id
  and (j.submitted_by_email ilike '%admin%' or j.submitted_by_user_id is null);
