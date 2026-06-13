alter table if exists public.well_production
    add column if not exists potencial numeric(12,2) default 0;

alter table if exists public.well_production_history
    add column if not exists potencial numeric(12,2) default 0;

update public.well_production_history history
set potencial = coalesce(history.potencial, current_row.potencial, 0)
from public.well_production current_row
where history.pozo_name = current_row.pozo_name
  and history.potencial is null;

notify pgrst, 'reload schema';