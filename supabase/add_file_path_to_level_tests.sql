-- Migración: Agregar columna file_path a well_level_tests
-- Permite asociar una foto o PDF del echómetro a cada prueba de nivel.
-- Ejecutar este script en el Editor SQL de Supabase.

ALTER TABLE public.well_level_tests 
ADD COLUMN IF NOT EXISTS file_path text;

COMMENT ON COLUMN public.well_level_tests.file_path IS 'Ruta del archivo de soporte (foto/PDF del echómetro) almacenado en Supabase Storage bucket expedientes-pozos';
