# Seguridad de Roles en Supabase

## Que se corrigio

La aplicacion ya no debe decidir privilegios por listas de correos en el frontend.

Ahora el rol debe venir desde Supabase y el navegador solo consume ese dato.

## Roles validos

- admin
- supervisor
- campo
- cliente_view

## Archivo para ejecutar en Supabase

Ejecuta este script en el SQL Editor de Supabase:

[supabase/auth_roles_setup.sql](supabase/auth_roles_setup.sql)

## Que hace ese script

- deja creadas las funciones de rol usadas por las politicas
- te muestra los usuarios actuales de auth.users
- te permite asignar el rol en raw_app_meta_data
- te muestra una verificacion final de como quedaron

## Flujo recomendado

1. Abre Supabase.
2. Ve a SQL Editor.
3. Ejecuta [supabase/auth_roles_setup.sql](supabase/auth_roles_setup.sql).
4. Revisa el primer select para confirmar los usuarios existentes.
5. Si tus correos reales no coinciden con los del script, reemplazalos y vuelve a ejecutar solo los update necesarios.
6. Luego ejecuta tambien estos scripts para que la base aplique seguridad por rol:

[supabase/readonly_client_security.sql](supabase/readonly_client_security.sql)

[supabase/well_bes_profile.sql](supabase/well_bes_profile.sql)

[supabase/well_production_history.sql](supabase/well_production_history.sql)

[supabase/field_journey_reports.sql](supabase/field_journey_reports.sql)

## Despues de ejecutar todo

- haz que cada usuario cierre sesion y vuelva a entrar
- el JWT debe refrescarse para traer el nuevo role
- si no reinician sesion, seguiran navegando con el token viejo

## Regla importante

No guardes roles sensibles en el frontend.

No uses listas de correos en JavaScript para decidir permisos.

El frontend solo debe leer el rol ya emitido por Supabase.

## Recomendacion fuerte

Usa raw_app_meta_data para el role, no raw_user_meta_data.

Motivo: user_metadata puede terminar siendo editable desde flujos de usuario; app_metadata debe quedar bajo control administrativo.

## Validacion rapida esperada

- admin y supervisor pueden editar informacion tecnica
- campo puede entrar a jornadas, captura e historial de campo
- cliente_view solo puede ver informacion
- un usuario sin role valido debe caer en cliente_view