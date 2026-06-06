begin;

-- Ajusta estos dos valores si quieres reutilizar el script con otro pozo o fecha.
with target as (
    select
        'CEI0006'::text as pozo_name,
        '2026-05-31'::date as target_date
),
deleted_history as (
    delete from public.well_production_history history
    using target
    where upper(trim(history.pozo_name)) = upper(trim(target.pozo_name))
      and history.fecha = target.target_date
    returning history.*
),
latest_valid_history as (
    select
        history.pozo_name,
        history.campo_name,
        history.ef,
        history.fecha,
        history.bbpd,
        history.ays_percentage,
        history.bnpd,
        history.cat_number
    from public.well_production_history history
    join target
      on upper(trim(history.pozo_name)) = upper(trim(target.pozo_name))
        where history.fecha is distinct from target.target_date
    order by history.fecha desc, history.created_at desc
    limit 1
),
restored_snapshot as (
    update public.well_production current_row
    set
        campo_name = latest_valid_history.campo_name,
        ef = latest_valid_history.ef,
        fecha = latest_valid_history.fecha,
        bbpd = latest_valid_history.bbpd,
        ays_percentage = latest_valid_history.ays_percentage,
        bnpd = latest_valid_history.bnpd,
        cat_number = latest_valid_history.cat_number
    from latest_valid_history
    where upper(trim(current_row.pozo_name)) = upper(trim(latest_valid_history.pozo_name))
    returning current_row.*
)
select
    (select count(*) from deleted_history) as deleted_history_rows,
    (select count(*) from restored_snapshot) as restored_snapshot_rows,
    (select pozo_name from latest_valid_history limit 1) as restored_pozo,
    (select fecha from latest_valid_history limit 1) as restored_fecha;

commit;

-- Verificación posterior.
select *
from public.well_production_history
where upper(trim(pozo_name)) = 'CEI0006'
order by fecha desc, created_at desc;

select *
from public.well_production
where upper(trim(pozo_name)) = 'CEI0006';
