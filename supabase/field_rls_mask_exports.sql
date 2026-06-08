-- Supabase RLS proposal: limitar exportaciones y acceso a campos sensibles para el rol 'campo'
--
-- Uso: ejecutar este script en la base de datos Supabase (SQL editor) tras revisar los nombres de rol y de tablas.
-- Requisitos previos: tener RLS activado en las tablas objetivo (field_journey_reports, field_journeys, field_journey_records)
-- y una función rpc 'get_access_role' o claims JWT que devuelva el rol del usuario.

-- 1) Crear una vista enmascarada con sólo columnas permitidas para usuarios de campo
CREATE OR REPLACE VIEW public.field_journey_reports_masked AS
SELECT
  id,
  client_report_id,
  report_date,
  report_time,
  jornada,
  equipo_guardia,
  locacion_jornada,
  pozo,
  updated_at,
  user_email
FROM public.field_journey_reports;

-- 2) Revocar permisos directos sobre la tabla a la role pública (opcional)
-- REVOKE SELECT ON public.field_journey_reports FROM public;

-- 3) Crear política que permita a role 'campo' seleccionar sólo desde la vista enmascarada
-- Nota: en Supabase los roles de la base de datos pueden diferir; si gestionas roles vía JWT,
-- adapta la condición a `auth.role()` o `current_setting('jwt.claims.role', true)`.

-- Ejemplo: permitir que usuarios con claim role='campo' sólo lean desde la vista (no desde la tabla)
-- Asegúrate de ejecutar esto con un rol supabase_admin o equivalente.

-- Habilitar RLS en la tabla (si no está habilitado)
ALTER TABLE IF EXISTS public.field_journey_reports ENABLE ROW LEVEL SECURITY;

-- Política que impide SELECT en la tabla para usuarios con rol 'campo'
CREATE POLICY deny_field_role_select ON public.field_journey_reports
  FOR SELECT
  USING (
    (current_setting('jwt.claims.role', true) IS NULL) OR (current_setting('jwt.claims.role', true) <> 'campo')
  );

-- Otorgar SELECT sobre la vista enmascarada a todos los roles autenticados (o ajusta según tu esquema)
GRANT SELECT ON public.field_journey_reports_masked TO authenticated;

-- 4) Recomendación de uso desde la app
-- - Los endpoints públicos para usuarios de campo deberían consultar la vista `field_journey_reports_masked`.
-- - Los endpoints administrativos (admins/supervisores) seguirán consultando `field_journey_reports`.
-- - Aplica políticas similares para `field_journey_records` y `field_journeys` si necesitas controlar exports fines.

-- NOTA: adapta current_setting('jwt.claims.role', true) según cómo inyectes el rol en el JWT.
-- En algunos esquemas se usa `auth.role()` o `jwt.claims->>'role'`.

-- Fin del script
