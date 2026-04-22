alter table public.monitoreo_pozos
    add column if not exists presion_lf numeric,
    add column if not exists sentido_giro text;