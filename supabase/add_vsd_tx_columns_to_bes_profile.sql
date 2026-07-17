-- SQL migration: Add VSD and Transformer fixed design columns to public.well_bes_profile table

ALTER TABLE public.well_bes_profile
    ADD COLUMN IF NOT EXISTS vsd_kva text,
    ADD COLUMN IF NOT EXISTS marca_vsd text,
    ADD COLUMN IF NOT EXISTS modelo_vsd text,
    ADD COLUMN IF NOT EXISTS tx_kva text,
    ADD COLUMN IF NOT EXISTS tap_v text,
    ADD COLUMN IF NOT EXISTS rt text;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
