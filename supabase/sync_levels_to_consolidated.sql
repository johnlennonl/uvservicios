-- ======================================================================
-- SCRIPT DE BASE DE DATOS: Sincronización automática de Niveles (Echómetro) al Consolidado
-- ======================================================================
--
-- Explicación:
-- Cuando un operador agrega o importa pruebas de nivel (Echómetro) desde la sección de Gestión,
-- estas se guardan en la tabla `public.well_level_tests`.
--
-- Para asegurar que estas mediciones se reflejen en tiempo real en el consolidado maestro
-- (columnas: 'NIVEL DE FLUIDO [FT]', 'SUMERGENCIA [FT]', 'PIP ECHOMETER [PSI]' y 'ECHOMETER?'),
-- sin necesidad de re-publicar la jornada, definimos triggers automáticos en PostgreSQL.
--
-- Estos triggers actualizan dinámicamente el JSON `row_data` de las filas existentes en:
-- 1. `consolidated_dashboard_operational` (Nuevas de campo publicadas)
-- 2. `consolidated_dashboard_general` (Consolidado histórico maestro)
--
-- Si no hay una fila de jornada para ese pozo y fecha, el registro se mantiene en `well_level_tests`
-- y se sincronizará cuando se publique la jornada correspondiente.

-- 1. Función disparadora para INSERT / UPDATE en well_level_tests
CREATE OR REPLACE FUNCTION public.sync_well_level_test_to_consolidated()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Actualizar consolidated_dashboard_operational (Tabla de jornadas de campo consolidadas)
    UPDATE public.consolidated_dashboard_operational
    SET row_data = COALESCE(row_data, '{}'::jsonb) 
        || jsonb_build_object(
            'NIVEL DE FLUIDO [FT]', NEW.nivel_dinamico,
            'SUMERGENCIA [FT]', NEW.sumergencia,
            'PIP ECHOMETER [PSI]', NEW.presion_pip,
            'ECHOMETER?', 'SI'
        )
    WHERE UPPER(TRIM(pozo)) = UPPER(TRIM(NEW.pozo_name))
      AND report_date = NEW.fecha;

    -- Actualizar consolidated_dashboard_general (Histórico consolidado completo)
    UPDATE public.consolidated_dashboard_general
    SET row_data = COALESCE(row_data, '{}'::jsonb) 
        || jsonb_build_object(
            'NIVEL DE FLUIDO [FT]', NEW.nivel_dinamico,
            'SUMERGENCIA [FT]', NEW.sumergencia,
            'PIP ECHOMETER [PSI]', NEW.presion_pip,
            'ECHOMETER?', 'SI'
        )
    WHERE UPPER(TRIM(pozo)) = UPPER(TRIM(NEW.pozo_name))
      AND report_date = NEW.fecha;

    RETURN NEW;
END;
$$;

-- 2. Vincular el trigger a la tabla well_level_tests (Insert / Update)
DROP TRIGGER IF EXISTS trg_sync_well_level_test_to_consolidated ON public.well_level_tests;
CREATE TRIGGER trg_sync_well_level_test_to_consolidated
AFTER INSERT OR UPDATE ON public.well_level_tests
FOR EACH ROW
EXECUTE FUNCTION public.sync_well_level_test_to_consolidated();


-- 3. Función disparadora para DELETE en well_level_tests (Limpia los campos en el consolidado)
CREATE OR REPLACE FUNCTION public.sync_well_level_test_delete_to_consolidated()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Limpiar campos en consolidated_dashboard_operational
    UPDATE public.consolidated_dashboard_operational
    SET row_data = COALESCE(row_data, '{}'::jsonb) 
        || jsonb_build_object(
            'NIVEL DE FLUIDO [FT]', '',
            'SUMERGENCIA [FT]', '',
            'PIP ECHOMETER [PSI]', '',
            'ECHOMETER?', 'NO'
        )
    WHERE UPPER(TRIM(pozo)) = UPPER(TRIM(OLD.pozo_name))
      AND report_date = OLD.fecha;

    -- Limpiar campos en consolidated_dashboard_general
    UPDATE public.consolidated_dashboard_general
    SET row_data = COALESCE(row_data, '{}'::jsonb) 
        || jsonb_build_object(
            'NIVEL DE FLUIDO [FT]', '',
            'SUMERGENCIA [FT]', '',
            'PIP ECHOMETER [PSI]', '',
            'ECHOMETER?', 'NO'
        )
    WHERE UPPER(TRIM(pozo)) = UPPER(TRIM(OLD.pozo_name))
      AND report_date = OLD.fecha;

    RETURN OLD;
END;
$$;

-- 4. Vincular el trigger de eliminación a la tabla well_level_tests (Delete)
DROP TRIGGER IF EXISTS trg_sync_well_level_test_delete_to_consolidated ON public.well_level_tests;
CREATE TRIGGER trg_sync_well_level_test_delete_to_consolidated
AFTER DELETE ON public.well_level_tests
FOR EACH ROW
EXECUTE FUNCTION public.sync_well_level_test_delete_to_consolidated();
