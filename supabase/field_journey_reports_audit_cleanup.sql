-- Habilita borrado administrativo del historico legacy de Campo
-- y deja consultas seguras para auditar antes de eliminar.

begin;

drop policy if exists "field journey delete management" on public.field_journey_reports;
create policy "field journey delete management"
on public.field_journey_reports
for delete
to authenticated
using (
    public.can_manage_monitoring()
);

commit;

-- 1) Resumen general por pozo legacy
select
  upper(trim(pozo)) as pozo,
  count(*) as total_registros,
  min(report_date) as primera_fecha,
  max(report_date) as ultima_fecha,
  string_agg(distinct lower(trim(user_email)), ', ' order by lower(trim(user_email))) as usuarios
from public.field_journey_reports
group by upper(trim(pozo))
order by upper(trim(pozo));

-- 2) Sustituye 'TOM012' por el pozo a revisar
select
  id,
  client_report_id,
  user_email,
  pozo,
  report_date,
  report_time,
  jornada,
  equipo_guardia,
  locacion_jornada,
  created_at,
  updated_at
from public.field_journey_reports
where upper(trim(pozo)) = 'TOM012'
order by report_date desc, report_time desc;

-- 3) Cuando confirmes que es de prueba, descomenta el delete exacto
-- delete from public.field_journey_reports
-- where upper(trim(pozo)) = 'TOM012';

-- 4) Auditoria opcional en monitoreo para confirmar si ese pozo tambien fue publicado
select
  upper(trim(pozo_name)) as pozo_name,
  count(*) as total_registros,
  min(fecha) as primera_fecha,
  max(fecha) as ultima_fecha
from public.monitoreo_pozos
where upper(trim(pozo_name)) = 'TOM012'
group by upper(trim(pozo_name));
