-- Script para agregar tipo_nivel, nivel_estatico y numero_reporte a well_level_tests
alter table public.well_level_tests
    add column if not exists tipo_nivel text default 'dinamico' check (tipo_nivel in ('dinamico', 'estatico')),
    add column if not exists nivel_estatico numeric(12,3) default 0,
    add column if not exists numero_reporte text;

-- Índice para búsquedas rápidas por número de reporte
create index if not exists idx_well_level_tests_numero_reporte
    on public.well_level_tests (numero_reporte)
    where numero_reporte is not null;
