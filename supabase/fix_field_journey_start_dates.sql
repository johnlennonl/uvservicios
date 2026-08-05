-- Corrige field_journeys.journey_date para que represente la fecha de inicio de la jornada.
-- Regla:
-- - Diurna/Especial: primera fecha de registros asociados.
-- - Nocturna con registros 18:00-23:59: primera fecha de esos registros vespertinos.
-- - Nocturna solo con registros 00:00-05:59: dia anterior a la primera fecha registrada.

with journey_record_bounds as (
    select
        journey.id as journey_id,
        journey.jornada,
        min(record.report_date) as first_record_date,
        min(record.report_date) filter (where record.report_time >= time '18:00:00') as first_evening_record_date
    from public.field_journeys journey
    join public.field_journey_records record on record.journey_id = journey.id
    group by journey.id, journey.jornada
), resolved_dates as (
    select
        journey_id,
        case
            when jornada = 'Nocturna' and first_evening_record_date is not null then first_evening_record_date
            when jornada = 'Nocturna' then first_record_date - interval '1 day'
            else first_record_date
        end::date as corrected_journey_date
    from journey_record_bounds
    where first_record_date is not null
)
update public.field_journeys journey
set
    journey_date = resolved.corrected_journey_date,
    updated_at = timezone('utc', now())
from resolved_dates resolved
where journey.id = resolved.journey_id
  and journey.journey_date is distinct from resolved.corrected_journey_date
returning
    journey.id,
    journey.jornada,
    journey.operational_scope,
    journey.journey_date as new_journey_date,
    resolved.corrected_journey_date;
