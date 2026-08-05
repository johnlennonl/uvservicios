# Plan de Implementacion para el Nuevo Contrato de Barua, Motatan y Mene Grande

## 1. Objetivo

Preparar el sistema actual de UV Servicios para operar un nuevo contrato compuesto por los campos Barua, Motatan y Mene Grande, sin afectar el flujo que ya esta funcionando para Ceiba y Tomoporo.

La prioridad es avanzar paso a paso, trabajando primero en local, validando cada cambio antes de tocar datos reales o subir ajustes a produccion.

## 2. Contexto Actual

El sistema actual ya tiene un flujo operativo funcional:

- login por roles
- captura de jornadas desde Campo
- revision desde Admin Campo
- publicacion hacia monitoreo operativo
- historico y dashboard por pozo
- consolidado legacy y consolidado operativo
- ficha tecnica vigente por pozo
- ficha BES por pozo

Hasta ahora, el sistema se ha usado principalmente para Ceiba y Tomoporo. El nuevo contrato necesita convivir con ese flujo, pero sin mezclar pozos, tecnicos, jornadas ni reportes.

## 3. Problema que Debemos Evitar

Si simplemente agregamos pozos de Barua, Motatan y Mene Grande a las tablas actuales, el sistema podria mezclar informacion entre contratos.

Eso puede afectar:

- el selector de pozos en Campo
- el dashboard operativo
- Data e historicos
- Admin Campo
- consolidado
- estadisticas
- permisos por usuario
- futuras exportaciones para cliente

El riesgo principal es que un usuario del nuevo contrato vea o capture datos dentro del universo Ceiba/Tomoporo, o que un administrador publique datos del contrato incorrecto.

## 4. Principio de Implementacion

No se recomienda duplicar toda la aplicacion.

La solucion recomendada es crear una capa de alcance operativo, tambien llamada contrato, area o recorrido operativo.

Esa capa debe permitir que el sistema se comporte distinto segun el contrato activo:

- Ceiba / Tomoporo
- Barua / Motatan / Mene Grande

La misma pantalla puede seguir existiendo, pero sus datos, opciones y filtros deben cambiar segun el contrato seleccionado o asignado al usuario.

## 5. Concepto Propuesto: Contrato Activo

Se propone manejar un contrato activo en la sesion del usuario.

Ejemplo:

```text
Contrato activo: Ceiba / Tomoporo
Contrato activo: Barua / Motatan / Mene Grande
```

Para administradores y supervisores, el sistema podria permitir cambiar el contrato desde el nav o una zona debajo del perfil.

Para usuarios de Campo asignados exclusivamente al nuevo contrato, el sistema debe entrar directamente a Barua / Motatan / Mene Grande y no permitir cambiar a Ceiba / Tomoporo.

## 6. Contratos Iniciales

### Contrato 1: Ceiba / Tomoporo

Campos asociados:

- LA CEIBA
- TOMOPORO

### Contrato 2: Barua / Motatan / Mene Grande

Campos asociados:

- BARUA
- MOTATAN
- MENE GRANDE
- MG, si se confirma como abreviatura operativa

## 7. Comportamiento Esperado por Modulo

### Login y permisos

El login debe seguir usando roles, pero se debe agregar el alcance operativo.

Ejemplos:

```text
role: campo
contrato_asignado: bmm
```

```text
role: admin
contratos_permitidos: ceiba_tomoporo, bmm
```

Esto evita crear roles duplicados como campo_barua o admin_motatan.

### Navegacion

El nav puede mostrar un selector de contrato para usuarios con acceso a mas de un contrato.

Ejemplo visual:

```text
Contrato
[ Ceiba / Tomoporo v ]
```

Al cambiar el contrato, deben actualizarse los modulos dependientes.

### Gestion de Usuarios como Centro de Control

Gestion de Usuarios debe evolucionar para controlar tambien los contratos operativos.

La idea funcional seria:

```text
Gestion de Usuarios
	Contratos
		Ceiba / Tomoporo
			Tecnicos
			Pozos
			Usuarios asignados
		Barua / Motatan / Mene Grande
			Tecnicos
			Pozos
			Usuarios asignados
```

Desde esta seccion se debe poder:

- crear nuevos contratos
- editar nombre y abreviatura del contrato
- activar o desactivar contratos
- agregar tecnicos por contrato
- editar o desactivar tecnicos por contrato
- agregar pozos por contrato
- editar o desactivar pozos por contrato
- asignar usuarios a uno o varios contratos
- definir si un usuario puede cambiar de contrato o queda fijo a uno solo

Ejemplo practico:

```text
Usuario: ingcampobmm@uvservicios.com
Rol: campo
Contrato asignado: Barua / Motatan / Mene Grande
Puede cambiar contrato: no
```

```text
Usuario: admin@uvservicios.com
Rol: admin
Contratos permitidos: Ceiba/Tomoporo, BMM
Puede cambiar contrato: si
```

### Campo

Campo debe filtrar:

- lista de locaciones
- lista de pozos
- tecnicos disponibles, si aplica
- borradores locales
- borradores remotos
- jornadas enviadas
- historico de jornadas

Para el contrato Barua / Motatan / Mene Grande, la locacion de captura debe mostrar solo los campos de ese contrato.

### Admin Campo

Admin Campo debe filtrar:

- bandeja de jornadas pendientes
- jornadas en revision
- jornadas publicadas
- detalle por jornada
- exportaciones Excel/PDF
- badge de pendientes en el nav

Cada jornada debe quedar marcada con el contrato correspondiente para evitar que se mezcle en revision o publicacion.

### Dashboard

El dashboard debe mostrar solo pozos del contrato activo.

Esto aplica a:

- filtros de pozo
- indicadores
- tarjetas por estado
- tendencias
- ribbon tecnico del pozo
- alertas visibles

### Data e Historico

Data debe filtrar por contrato activo para que el usuario no vea historicos de otro contrato.

El filtro puede hacerse por campo, por pozo o por una columna de contrato si se agrega a la base de datos.

### Consolidado

El consolidado debe preservar la separacion entre:

- legacy_excel de Ceiba/Tomoporo
- publicaciones desde Campo Admin
- futuro legacy o carga base del contrato Barua/Motatan/Mene Grande

No se debe permitir que una publicacion de BMM sustituya filas historicas de Ceiba/Tomoporo.

### Estadisticas y UVITO

Las estadisticas y consultas de UVITO deben responder usando el contrato activo.

Ejemplo:

- pozos OFF del contrato activo
- pozos sin registros del contrato activo
- alertas del contrato activo
- actividad diaria del contrato activo

## 8. Cambios Tecnicos Recomendados

### 8.1 Crear una configuracion central de contratos

Crear un modulo central, por ejemplo:

```text
js/core/operational-scope.js
```

Responsabilidades:

- definir contratos disponibles
- normalizar nombres de campo
- resolver contrato activo
- guardar contrato en sessionStorage
- validar si un usuario puede acceder a un contrato

### 8.2 Agregar alcance operativo al perfil de usuario

Opciones iniciales:

- guardar el alcance en metadata de Supabase Auth
- guardar el alcance en la tabla profiles
- resolver temporalmente por correo mientras se define la estructura final

La opcion mas ordenada es usar profiles con campos como:

```text
operational_scope
allowed_scopes
```

En Gestion de Usuarios, al crear o editar un usuario, debe aparecer un campo para seleccionar el contrato o los contratos permitidos.

Ejemplo para usuario de Campo:

```text
Correo: ingcampobmm@uvservicios.com
Rol: campo
Contrato principal: bmm
Contratos permitidos: bmm
```

Ejemplo para administrador:

```text
Correo: admin@uvservicios.com
Rol: admin
Contrato principal: ceiba_tomoporo
Contratos permitidos: ceiba_tomoporo, bmm
```

### 8.3 Filtrar pozos por contrato

Actualmente el sistema obtiene pozos desde monitoreo, produccion tecnica y ficha BES.

Se debe cambiar la logica para que devuelva solo pozos del contrato activo.

Primera version posible:

- filtrar por campo conocido
- filtrar por prefijo/nombre de pozo si aplica

Version robusta:

- crear tabla catalogo de pozos con contrato asignado
- usar ese catalogo como fuente principal

### 8.4 Crear Gestion de Tecnicos por Contrato

Actualmente los tecnicos de Campo estan escritos directamente dentro de field.html.

Esto no conviene para el nuevo contrato, porque cualquier cambio de cuadrilla obligaria a editar codigo.

Se recomienda crear una seccion dentro de Gestion de Usuarios llamada Gestion de Tecnicos.

La seccion debe permitir:

- agregar tecnicos
- editar nombres
- activar o desactivar tecnicos
- asignar cada tecnico a un contrato
- filtrar por Ceiba/Tomoporo o Barua/Motatan/Mene Grande

Tabla sugerida:

```text
field_technicians
```

Campos sugeridos:

```text
id
full_name
operational_scope
active
created_at
updated_at
```

### 8.5 Crear Gestion de Contratos

Antes de gestionar tecnicos y pozos, conviene que Gestion de Usuarios tenga un bloque principal de Contratos.

Ese bloque debe funcionar como una administracion sencilla del catalogo operativo.

Tabla sugerida:

```text
operational_contracts
```

Campos sugeridos:

```text
id
scope_key
display_name
short_name
active
created_at
updated_at
```

Ejemplos:

```text
scope_key: ceiba_tomoporo
display_name: Ceiba / Tomoporo
short_name: CT
```

```text
scope_key: bmm
display_name: Barua / Motatan / Mene Grande
short_name: BMM
```

Dentro de cada contrato deben aparecer sus secciones dependientes:

- Tecnicos
- Pozos
- Usuarios asignados

### 8.6 Crear Gestion de Pozos por Contrato

Para que ingcampobmm@uvservicios.com pueda capturar sin mezclar informacion, tambien hace falta una Gestion de Pozos por contrato.

No basta con que el pozo exista en monitoreo_pozos, well_production o well_bes_profile. Se necesita un catalogo maestro que indique a que contrato pertenece cada pozo.

Se recomienda crear una seccion dentro de Gestion de Usuarios o Gestion de Datos llamada Gestion de Pozos por Contrato.

La seccion debe permitir:

- agregar pozos nuevos
- editar nombre del pozo
- asignar campo: BARUA, MOTATAN, MENE GRANDE, LA CEIBA o TOMOPORO
- asignar contrato operativo
- activar o desactivar pozos
- preparar pozos aunque todavia no tengan registros operativos
- evitar que Campo escriba nombres manuales con errores

Tabla sugerida:

```text
field_well_catalog
```

Campos sugeridos:

```text
id
pozo_name
campo_name
operational_scope
active
created_at
updated_at
```

El selector de pozos de Campo debe consultar primero este catalogo. Luego, si existe informacion tecnica o BES para ese pozo, puede precargarla como ya hace hoy.

### 8.7 Guardar contrato en jornadas de Campo

Agregar el contrato en el workflow de Campo.

Tablas sugeridas:

- field_journeys
- field_journey_records, si se necesita trazabilidad por pozo
- consolidated_dashboard_operational, si se quiere consultar/exportar rapido por contrato

Campo minimo recomendado:

```text
operational_scope text
```

### 8.8 Separar borradores locales por contrato

Los borradores actuales de Campo usan localStorage.

Se debe evitar que un borrador de Ceiba/Tomoporo aparezca cuando el usuario esta en BMM.

Ejemplo:

```text
uv-field-capture-draft:ceiba_tomoporo
uv-field-capture-draft:bmm
```

### 8.9 Aplicar filtros en servicios

Los servicios deben recibir o resolver el contrato activo antes de consultar datos.

Servicios impactados inicialmente:

- monitoring-records-service.js
- technical-measurements-service.js
- field-journey-service.js
- consolidado-service.js
- bes-profile-service.js
- monitoring-service.js, como agregador

## 9. Plan por Fases

## Fase 0: Levantamiento de Datos

Objetivo: tener claro que se va a separar antes de programar.

Pendientes:

- confirmar nombres oficiales de campos
- confirmar si Mene Grande se usara como MENE GRANDE, MENEG, MG u otra nomenclatura
- recibir lista inicial de pozos por campo
- recibir lista de tecnicos asignados al nuevo contrato
- definir usuarios que tendran login exclusivo BMM
- definir usuarios que podran cambiar entre contratos
- definir si Gestion de Usuarios sera el centro unico para crear contratos, tecnicos, pozos y asignaciones

Resultado esperado:

- matriz inicial de contrato, campos, pozos, tecnicos y usuarios

## Fase 1: Capa Local de Contrato Activo

Objetivo: agregar la nocion de contrato sin tocar aun toda la base de datos.

Tareas:

- crear modulo central de contrato activo
- definir Ceiba/Tomoporo y BMM en configuracion
- guardar contrato activo en sessionStorage
- preparar helper para saber si un campo/pozo pertenece al contrato activo
- agregar selector visual solo para administradores/supervisores en local

Validacion:

- cambiar contrato activo sin romper login ni navegacion
- confirmar que el valor queda persistido durante la sesion

## Fase 1A: Gestion de Tecnicos y Pozos BMM

Objetivo: dejar listo el inventario operativo minimo para que ingcampobmm@uvservicios.com pueda capturar.

Tareas:

- crear seccion Contratos dentro de Gestion de Usuarios
- crear contrato Ceiba / Tomoporo
- crear contrato Barua / Motatan / Mene Grande
- permitir ver dentro de cada contrato sus tecnicos, pozos y usuarios asignados
- crear tabla o estructura local para tecnicos por contrato
- crear tabla o estructura local para pozos por contrato
- agregar seccion Gestion de Tecnicos en Gestion de Usuarios
- agregar seccion Gestion de Pozos por Contrato
- cargar tecnicos iniciales de BMM
- cargar pozos iniciales de BARUA, MOTATAN y MENE GRANDE
- permitir activar/desactivar tecnicos y pozos
- mantener los tecnicos y pozos actuales de Ceiba/Tomoporo como contrato separado
- agregar selector de contrato al crear o editar usuarios
- asignar ingcampobmm@uvservicios.com al contrato BMM

Validacion:

- Gestion muestra contratos activos
- Gestion muestra tecnicos separados por contrato
- Gestion muestra pozos separados por contrato
- Gestion permite ver usuarios asignados a cada contrato
- un tecnico BMM no aparece en Ceiba/Tomoporo si no corresponde
- un pozo BMM no aparece en Ceiba/Tomoporo si no corresponde
- ingcampobmm@uvservicios.com puede entrar a Campo y ver solo datos BMM

## Fase 2: Adaptar Captura de Campo

Objetivo: que Campo funcione separado por contrato.

Tareas:

- filtrar locaciones segun contrato activo
- filtrar pozos disponibles segun contrato activo
- separar borradores locales por contrato
- separar borradores remotos por contrato cuando exista columna en base
- guardar contrato en cada jornada enviada
- mostrar etiqueta de contrato activo dentro de Campo

Validacion:

- un usuario BMM solo ve BARUA, MOTATAN y MENE GRANDE
- no aparecen pozos Ceiba/Tomoporo dentro de Campo BMM
- un borrador BMM no aparece en Ceiba/Tomoporo

## Fase 3: Adaptar Admin Campo

Objetivo: revisar y publicar jornadas sin mezclar contratos.

Tareas:

- filtrar bandeja por contrato activo
- mostrar contrato en cada jornada
- ajustar contador de pendientes del nav por contrato
- publicar manteniendo operational_scope
- exportar Excel/PDF con identificacion del contrato

Validacion:

- Admin puede cambiar contrato y ver bandejas separadas
- publicar una jornada BMM no afecta listados de Ceiba/Tomoporo
- logs de revision conservan el contrato

## Fase 4: Adaptar Dashboard, Data y Estadisticas

Objetivo: que las vistas de consulta respondan al contrato activo.

Tareas:

- filtrar getUniquePozos por contrato
- filtrar dashboard por contrato activo
- filtrar Data e historicos
- filtrar estadisticas
- ajustar UVITO para responder sobre el contrato activo

Validacion:

- dashboard Ceiba/Tomoporo no muestra BMM
- dashboard BMM no muestra Ceiba/Tomoporo
- estadisticas y conteos cambian al cambiar contrato

## Fase 5: Base de Datos y Seguridad

Objetivo: llevar la separacion tambien al backend.

Tareas:

- crear o actualizar catalogo de contratos
- crear o actualizar catalogo de pozos por contrato
- agregar operational_scope donde corresponda
- ajustar policies RLS para evitar cruces entre contratos
- preparar script SQL reversible
- probar con usuarios de cada tipo

Validacion:

- usuario BMM no puede consultar datos Ceiba/Tomoporo aunque manipule frontend
- admin autorizado puede ver ambos contratos
- cliente_view solo ve lo permitido

## Fase 6: Carga Inicial del Nuevo Contrato

Objetivo: dejar BMM listo para operar.

Tareas:

- cargar pozos iniciales
- cargar fichas tecnicas iniciales si existen
- cargar fichas BES iniciales si existen
- crear usuarios de Campo BMM
- probar captura completa local
- probar revision Admin Campo
- probar publicacion hacia monitoreo

Validacion:

- jornada BMM entra completa
- Admin la revisa y publica
- dashboard BMM muestra el dato publicado
- Ceiba/Tomoporo queda sin cambios

## 10. Orden de Trabajo Recomendado

No avanzar directamente a base de datos sin probar primero la capa local.

Orden sugerido:

1. definir datos base del contrato
2. crear configuracion local de contratos
3. crear Gestion de Contratos dentro de Gestion de Usuarios
4. crear Gestion de Tecnicos por contrato
5. crear Gestion de Pozos por contrato
6. agregar asignacion de contratos al crear/editar usuarios
7. cargar tecnicos y pozos iniciales BMM
8. crear o preparar login ingcampobmm@uvservicios.com
9. adaptar Campo para leer tecnicos y pozos por contrato
10. adaptar Admin Campo
11. adaptar Dashboard/Data/Stats
12. agregar columnas y RLS en Supabase
13. cargar datos reales
14. prueba piloto local
15. prueba controlada con usuarios internos
16. despliegue cuando el flujo este validado

## 11. Decisiones Pendientes

- Nombre final del contrato en la interfaz.
- Abreviatura oficial: BMM, Barua-Motatan-MG u otra.
- Nombres exactos de campos en base de datos.
- Lista inicial de pozos.
- Lista de tecnicos del nuevo contrato.
- Si el cliente BMM tendra usuario de solo lectura.
- Si los administradores actuales podran ver ambos contratos.
- Si Gestion de Usuarios sera tambien Gestion de Contratos o si el nombre visible debe cambiar a Centro de Gestion.
- Si existira Excel legacy inicial para BMM.
- Si los reportes deben salir con logo o formato distinto.

## 12. Riesgos

### Mezcla de datos entre contratos

Mitigacion:

- contrato activo centralizado
- filtros en servicios
- columna operational_scope
- RLS en Supabase

### Ruptura del flujo actual Ceiba/Tomoporo

Mitigacion:

- trabajar en local
- cambios por fases
- pruebas despues de cada modulo
- mantener Ceiba/Tomoporo como contrato por defecto

### Pozos sin campo o sin ficha tecnica

Mitigacion:

- catalogo inicial de pozos
- validacion antes de activar BMM
- mensajes claros en Campo cuando falte ficha

### Usuarios con permisos ambiguos

Mitigacion:

- separar rol de alcance operativo
- no crear roles duplicados innecesarios
- validar allowed_scopes al iniciar sesion

## 13. Recomendacion Final

La implementacion debe hacerse como una evolucion del sistema actual, no como una copia separada.

La clave es agregar el concepto de contrato activo y hacer que cada modulo lo respete.

Primero se recomienda resolver Campo y Admin Campo, porque son el punto operativo mas urgente para el nuevo contrato. Luego se debe extender el filtro a Dashboard, Data, Estadisticas, Consolidado y seguridad en Supabase.

Este enfoque permite empezar localmente, paso a paso, protegiendo el flujo existente de Ceiba/Tomoporo mientras se prepara el nuevo contrato Barua, Motatan y Mene Grande.