# Prompt para Gemini: Presupuesto en USD

Crea una propuesta comercial formal en espanol, lista para exportar a PDF, para presentar a un cliente del sector operativo y petrolero en Venezuela.

Quiero que el documento tenga tono profesional, claro y comercial, sin sonar demasiado tecnico, pero dejando claro el valor del desarrollo realizado y de la siguiente fase propuesta.

La moneda debe estar expresada en dolares estadounidenses (USD).

## Contexto general del proyecto

Se desarrollo una plataforma web interna para gestion operativa y monitoreo de pozos, con autenticacion, control de acceso por roles y modulos separados por tipo de usuario.

Dentro del proyecto ya se implemento un modulo de Campo orientado al personal operativo que permite capturar jornadas de monitoreo desde terreno, registrar varios pozos dentro de una misma jornada, generar mensajes operativos, exportar reportes y guardar la informacion en base de datos.

Adicionalmente, se esta proponiendo una segunda etapa para que Administracion pueda visualizar automaticamente esas jornadas, revisarlas, validarlas y consolidarlas al historial operativo del pozo correspondiente.

## Alcance actual ya desarrollado

Incluye lo siguiente:

- control de acceso por roles
- separacion entre Admin, Campo y otros perfiles
- modulo Campo independiente
- formulario de captura de jornada operativa
- registro de multiples pozos dentro de una misma jornada
- validacion de campos obligatorios
- generacion automatica de mensaje operativo consolidado
- historial de jornadas
- opcion de continuar jornadas desde historial
- exportacion de reportes en PDF
- exportacion de reportes en Excel
- guardado real en base de datos mediante Supabase
- mejoras de experiencia de usuario
- mejor organizacion y estructura tecnica del codigo

## Segunda fase propuesta

La siguiente etapa busca integrar lo reportado por Campo con el rol Administrador.

Esta fase incluiria:

- bandeja administrativa para visualizar jornadas cargadas desde Campo
- filtros por fecha, jornada, locacion, equipo y estado
- vista detalle por jornada y por pozo
- estados de revision
- observaciones administrativas
- aprobacion o rechazo de reportes
- consolidacion de informacion aprobada al historial operativo del pozo
- trazabilidad del proceso de revision

## Objetivo comercial del documento

Necesito que el presupuesto se presente en dos escenarios:

### Escenario 1

Valor del desarrollo tal como se encuentra hoy, es decir, solo con el alcance actual ya implementado.

### Escenario 2

Valor del proyecto completo, incluyendo el alcance actual mas la segunda fase administrativa.

## Valores de referencia que puedes usar

Usa estos valores como base sugerida en USD:

- alcance actual implementado: USD 1,200
- segunda fase administrativa adicional: USD 850
- proyecto completo con ambas etapas: USD 2,050

Si consideras que la presentacion comercial mejora usando una redaccion como propuesta base mas ampliacion opcional, hazlo de esa manera.

## Lo que necesito que redactes

Genera un documento con esta estructura:

1. Titulo profesional del documento.
2. Resumen ejecutivo.
3. Descripcion breve del sistema desarrollado.
4. Alcance actual implementado.
5. Propuesta de ampliacion administrativa.
6. Beneficios para el cliente.
7. Presupuesto en USD con dos opciones.
8. Condiciones comerciales sugeridas.
9. Tiempo estimado de entrega por fases.
10. Cierre comercial elegante.

## Requisitos de estilo

- redacta en espanol neutro
- tono profesional y comercial
- que se vea presentable para cliente final
- evita lenguaje demasiado tecnico de programacion
- no menciones codigo fuente, archivos internos ni nombres tecnicos del repositorio
- no hables como IA ni menciones que esto fue generado por inteligencia artificial
- deja el texto listo para copiar en un PDF o en una propuesta formal

## Condiciones comerciales sugeridas

Incluye una propuesta razonable de forma de pago, por ejemplo:

- 50 por ciento de anticipo
- 50 por ciento contra entrega

Tambien puedes sugerir una variante alternativa de pago por fases si encaja mejor.

## Resultado esperado

Quiero que entregues directamente el texto final del presupuesto, ya redactado, no instrucciones ni recomendaciones.