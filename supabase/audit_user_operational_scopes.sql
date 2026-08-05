-- ==============================================================================
-- AUDITORIA Y BLINDAJE DE ALCANCES OPERATIVOS POR USUARIO
-- Fecha: 2026-08-05
--
-- Objetivo:
-- Verificar que usuarios de Campo y clientes de visualizacion tengan asignado
-- el contrato correcto en public.user_operational_scopes.
-- ==============================================================================

-- 1. Auditoria general con correo, rol y alcance operativo.
SELECT
    users.id AS user_id,
    users.email,
    users.raw_app_meta_data ->> 'role' AS role,
    scopes.operational_scope,
    scopes.is_default,
    scopes.can_switch
FROM auth.users users
LEFT JOIN public.user_operational_scopes scopes
    ON scopes.user_id = users.id
ORDER BY users.email, scopes.operational_scope;

-- 2. Usuarios operativos o clientes sin alcance explicito.
-- Estos usuarios no quedan con acceso universal; si no tienen alcance,
-- el frontend usa el contrato por defecto ceiba_tomoporo.
SELECT
    users.id AS user_id,
    users.email,
    users.raw_app_meta_data ->> 'role' AS role
FROM auth.users users
LEFT JOIN public.user_operational_scopes scopes
    ON scopes.user_id = users.id
WHERE users.raw_app_meta_data ->> 'role' IN ('campo', 'cliente_view')
  AND scopes.user_id IS NULL
ORDER BY users.email;

-- 3. Usuarios con mas de un contrato marcado como default.
-- Resultado esperado: 0 rows.
SELECT
    users.email,
    count(*) AS defaults
FROM auth.users users
JOIN public.user_operational_scopes scopes
    ON scopes.user_id = users.id
WHERE scopes.is_default = true
GROUP BY users.email
HAVING count(*) > 1
ORDER BY users.email;

-- 4. Plantilla segura para asignar un usuario a un contrato.
-- Editar email y operational_scope antes de ejecutar.
--
-- INSERT INTO public.user_operational_scopes (user_id, operational_scope, is_default, can_switch)
-- SELECT id, 'ceiba_tomoporo', true, false
-- FROM auth.users
-- WHERE email = 'usuario@correo.com'
-- ON CONFLICT (user_id, operational_scope) DO UPDATE
-- SET is_default = excluded.is_default,
--     can_switch = excluded.can_switch,
--     updated_at = now();

-- 5. Plantilla segura para dar dos contratos a un cliente que debe cambiar entre ambos.
-- Editar email antes de ejecutar.
--
-- INSERT INTO public.user_operational_scopes (user_id, operational_scope, is_default, can_switch)
-- SELECT id, scope_key, scope_key = 'ceiba_tomoporo', true
-- FROM auth.users
-- CROSS JOIN (VALUES ('ceiba_tomoporo'), ('bmm')) AS contracts(scope_key)
-- WHERE email = 'cliente@correo.com'
-- ON CONFLICT (user_id, operational_scope) DO UPDATE
-- SET is_default = excluded.is_default,
--     can_switch = excluded.can_switch,
--     updated_at = now();