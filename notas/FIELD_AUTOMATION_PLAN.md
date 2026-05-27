# Plan de Estructuracion para Modulo de Campo

## Objetivo

Agregar un modulo de captura de monitoreos para personal de campo sin desordenar la base actual del proyecto.

La regla principal debe ser esta:

- una sola captura de datos
- multiples salidas automaticas
- separacion clara entre vistas, servicios, permisos y exportaciones

## Problema actual que debemos evitar

Si esta funcionalidad se agrega directamente dentro de paginas existentes como dashboard.html, data.html o dentro de js/charts.js, el proyecto va a quedar muy acoplado.

Hoy el proyecto ya tiene una base util:

- auth.js para autenticacion y perfil de acceso
- data-service.js para operaciones de datos
- ui.js para utilidades visuales puntuales
- charts.js para dashboard

Pero el siguiente modulo no debe crecer dentro de charts.js ni dentro de scripts inline grandes. Debe entrar como una capa nueva y separada.

## Estructura recomendada

Se recomienda pasar a una organizacion por dominios funcionales, no solo por paginas.

```text
uvservicios/
  index.html
  dashboard.html
  data.html
  dashboard-data.html
  field.html
  field-history.html
  css/
    style.css
    dashboard-page.css
    data-page.css
    dashboard-data-page.css
    field-page.css
    field-history-page.css
  js/
    core/
      auth.js
      access-control.js
      supabaseClient.js
      router.js
      session-store.js
    services/
      monitoring-service.js
      field-report-service.js
      export-service.js
      whatsapp-service.js
      pozo-service.js
    modules/
      dashboard/
        dashboard-controller.js
        dashboard-charts.js
        dashboard-filters.js
      history/
        history-controller.js
        history-table.js
      management/
        management-controller.js
        management-sync.js
      field/
        field-controller.js
        field-form.js
        field-draft-store.js
        field-share.js
        field-validation.js
        field-formatters.js
      reports/
        pdf-report.js
        excel-report.js
    shared/
      date-utils.js
      number-utils.js
      dom-utils.js
      formatters.js
      constants.js
```

## Como dividir responsabilidades

### 1. Capa core

Solo debe contener piezas base del sistema:

- autenticacion
- sesion
- permisos
- cliente de Supabase
- utilidades globales de navegacion

Regla: esta capa no debe saber nada del formulario de Campo ni de PDF ni de WhatsApp.

### 2. Capa services

Aqui debe vivir toda la logica de negocio que habla con base de datos o transforma informacion.

Ejemplos:

- monitoring-service.js
  - crear monitoreo
  - actualizar monitoreo
  - consultar monitoreos por pozo, fecha, operador o jornada

- field-report-service.js
  - construir el payload del reporte de campo
  - guardar borradores
  - confirmar envio

- export-service.js
  - generar PDF
  - generar Excel

- whatsapp-service.js
  - construir mensaje de WhatsApp
  - abrir enlace de compartir
  - despues integrarse con API real si la empresa lo decide

Regla: las paginas HTML no deben formatear directamente el mensaje de WhatsApp ni la estructura del PDF. Eso debe salir de servicios dedicados.

### 3. Capa modules

Cada modulo maneja su propia interfaz y eventos.

El nuevo modulo Field debe quedar completamente encapsulado en su carpeta.

Archivos clave del modulo:

- field-controller.js
  - inicializa la pagina
  - conecta formulario, permisos y acciones

- field-form.js
  - renderiza y recoge los campos
  - precarga fecha, hora, usuario y pozo

- field-validation.js
  - valida campos obligatorios
  - valida rangos tecnicos

- field-formatters.js
  - arma el texto exacto del reporte tipo WhatsApp

- field-share.js
  - dispara compartir por WhatsApp
  - dispara generar PDF y Excel

- field-draft-store.js
  - guarda borradores locales si el usuario pierde conexion

Regla: ninguna pagina externa debe conocer detalles internos de estos archivos. Debe hablar con field-controller.js.

## Roles recomendados

No conviene seguir resolviendo permisos solo por listas de correo en crecimiento. Para el nuevo modulo conviene definir un perfil de acceso central.

Roles sugeridos:

- admin
- supervisor
- campo
- cliente_view

El perfil de acceso debe vivir en una pieza central como access-control.js.

Ejemplo de capacidades:

- admin
  - ver todo
  - editar todo
  - gestionar usuarios y configuracion

- supervisor
  - ver monitoreos de campo
  - revisar y corregir
  - aprobar y exportar

- campo
  - crear monitoreos
  - editar solo sus propios borradores o registros recientes
  - compartir por WhatsApp
  - generar PDF y Excel de su jornada

- cliente_view
  - solo lectura

## Estructura de datos recomendada

No mezclar directamente los registros operativos del dashboard con el flujo de captura de campo sin una capa clara.

Se recomienda separar conceptos:

### Tabla o entidad principal de captura de campo

- id
- pozo_name
- fecha
- hora
- jornada
- sentido_giro
- hz
- ivsd_a
- ivsd_b
- ivsd_c
- v_vsd
- i_motor
- v_motor
- pi
- pd
- ti
- tm
- thp
- lf
- chp
- comentario
- estado_operacion
- created_by
- created_at
- updated_at
- report_status

### Campos derivados utiles

- whatsapp_message
- pdf_url si luego guardan el archivo
- excel_batch_id si sale en un consolidado
- supervisor_reviewed_by
- supervisor_reviewed_at

## Flujo funcional correcto

### Flujo de Campo

1. El operador inicia sesion.
2. Ve solo sus pozos o su lista del dia.
3. Llena un formulario corto.
4. Guarda.
5. El sistema genera automaticamente:
   - registro en base de datos
   - texto WhatsApp
   - opcion de PDF
   - opcion de Excel
6. Puede compartir sin reescribir nada.

### Flujo de Supervisor

1. Revisa reportes recibidos.
2. Filtra por jornada, pozo y operador.
3. Corrige o aprueba si hace falta.
4. Exporta consolidado diario.

## Reglas de implementacion

Estas reglas son importantes para no ensuciar el proyecto.

### Regla 1

No meter logica nueva de Campo dentro de js/charts.js.

### Regla 2

No repetir validaciones en cada pagina. Las validaciones deben vivir en field-validation.js o en servicios compartidos.

### Regla 3

No construir el texto de WhatsApp directamente desde el HTML. Debe existir un formateador reutilizable.

### Regla 4

No atar la exportacion PDF y Excel a botones dispersos con codigo inline. Deben salir de un servicio de exportacion.

### Regla 5

No mezclar permisos visuales con permisos de escritura reales. Debe mantenerse doble capa:

- control de UI
- control de servicios
- control real en RLS de Supabase

## Orden recomendado de implementacion

### Fase 1 - Base tecnica

- mover auth.js y supabaseClient.js hacia una base mas modular si se decide reorganizar carpetas
- crear access-control.js
- crear monitoring-service.js
- crear constants.js con enums de roles, estados y campos

### Fase 2 - Modulo Campo MVP

- crear field.html
- crear field-page.css
- crear modulo field/
- formulario movil de captura
- guardado en base de datos
- mensaje WhatsApp automatico

### Fase 3 - Salidas automatizadas

- PDF individual
- Excel por jornada
- historial del operador
- borradores locales

### Fase 4 - Supervisor y automatizacion real

- aprobacion de reportes
- consolidado diario
- alertas por valores fuera de rango
- integracion WhatsApp API si la empresa la aprueba

## Recomendacion final

Para este proyecto, la mejor organizacion no es rehacer todo de golpe. Lo correcto es introducir el modulo Campo como un bloque aislado y bien estructurado, mientras gradualmente se separan responsabilidades del codigo existente.

La prioridad tecnica debe ser esta:

1. permisos centralizados
2. servicios separados por dominio
3. modulo de Campo independiente
4. exportaciones desacopladas
5. compatibilidad con la seguridad ya creada en Supabase

Si se sigue esta estructura, el sistema puede crecer a captura movil, supervisor, aprobaciones y automatizacion real sin convertirse en un proyecto dificil de mantener.