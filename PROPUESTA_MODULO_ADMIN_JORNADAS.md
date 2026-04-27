# Propuesta: Integracion de Jornadas de Campo con Revision Administrativa

## 1. Resumen Ejecutivo

La solucion actual ya permite capturar jornadas operativas desde el rol Campo dentro de una sola plataforma.

La siguiente evolucion propuesta consiste en que esas jornadas, una vez cargadas por Campo, queden visibles automaticamente para el rol Administrador, sin necesidad de depender de un flujo manual basado en Excel para iniciar la revision.

Con esta mejora, la plataforma pasaria de ser una herramienta de captura y envio a convertirse en un sistema integral de operacion, revision y consolidacion tecnica por pozo.

## 2. Objetivo de la Propuesta

Permitir que:

- Campo capture y guarde jornadas directamente en el sistema.
- Administracion visualice automaticamente esas jornadas.
- Administracion revise los parametros reportados por cada pozo.
- Si la informacion es correcta, esos parametros puedan consolidarse al historial operativo del pozo correspondiente.
- Excel y PDF permanezcan disponibles como apoyo, pero no como paso obligatorio del proceso.

## 3. Problema Actual

En un flujo tradicional, la informacion operativa suele pasar por varias etapas manuales:

- Campo reporta.
- Luego se exporta o comparte la informacion.
- Administracion vuelve a revisar por fuera.
- Finalmente, si todo esta bien, se actualiza manualmente el historial o los parametros del pozo.

Esto genera:

- reprocesos
- mayor riesgo de error humano
- dependencia de archivos externos
- poca trazabilidad sobre que se reporto, que se aprobo y cuando

## 4. Solucion Propuesta

La propuesta es incorporar un flujo nativo entre Campo y Administracion dentro del mismo proyecto.

### Flujo propuesto

1. Campo registra una jornada con uno o varios pozos.
2. La jornada se guarda automaticamente en la base de datos.
3. El modulo Administrador visualiza esas jornadas sin necesidad de importarlas manualmente.
4. Administracion revisa los valores reportados.
5. Si todo esta correcto, puede aprobar y consolidar esos parametros al pozo correspondiente.
6. Si existen observaciones, puede dejar la jornada pendiente, observada o rechazada.

## 5. Que Ganaria el Cliente

- Menor dependencia de Excel como herramienta principal.
- Mayor velocidad entre captura y revision.
- Informacion centralizada en un solo sistema.
- Mejor trazabilidad entre operacion y administracion.
- Posibilidad de aprobar y consolidar parametros sin reprocesos manuales.
- Base solida para futuras alertas y analitica tecnica.

## 6. Vision Funcional del Modulo Administrador

### Bandeja de jornadas

El administrador podria contar con una vista donde aparezcan automaticamente las jornadas cargadas desde Campo.

Campos sugeridos:

- Fecha
- Jornada
- Locacion
- Equipo de guardia
- Cantidad de pozos reportados
- Estado de revision
- Alertas detectadas
- Accion para abrir detalle

### Detalle de jornada

Al entrar a una jornada, Administracion podria ver:

- informacion general de la jornada
- lista de pozos incluidos
- parametros reportados por cada pozo
- comentario operativo
- estado de revision
- opcion de aprobar, observar o rechazar

### Consolidacion al pozo

Una vez revisado el reporte, el sistema podria permitir que los parametros aprobados pasen al historial operativo del pozo.

## 7. Variables que Podrian Revisarse y Consolidarse

Las variables del reporte de Campo que pueden entrar al flujo administrativo incluyen:

- Hz
- I Motor
- V Motor
- V VSD
- THP
- LF
- CHP
- PI
- PD
- TI
- TM
- Corrientes por fase
- Comentario operativo

En otras palabras, la misma informacion reportada por Campo podria convertirse en historico validado por Administracion.

## 8. Recomendacion de Estados Operativos

Para que el cliente entienda el proceso y exista orden funcional, se recomienda manejar estados como:

- Enviada por Campo
- Pendiente de revision
- Revisada
- Aprobada
- Aprobada con observacion
- Consolidada al pozo
- Rechazada

Esto permite saber con claridad en que punto del proceso se encuentra cada jornada o cada pozo reportado.

## 9. Recomendacion de Arquitectura Funcional

La mejor practica es separar claramente los tipos de informacion:

### A. Reporte original de Campo

Es el dato operativo tal como fue capturado.

### B. Revision administrativa

Es la decision del administrador sobre ese reporte.

### C. Historico consolidado del pozo

Es el dato oficial aprobado y asociado al pozo.

Esto evita que la informacion original se pierda o sea modificada sin control.

## 10. Diferencial Clave

El valor principal de esta propuesta es que el sistema no solo captura informacion, sino que tambien organiza el flujo entre quien reporta y quien valida.

Eso permite:

- mantener evidencia del reporte original
- reducir errores por reproceso manual
- mejorar la confianza del dato
- crear un historial tecnico mas confiable

## 11. Evolucion Recomendada por Fases

### Fase 1

Visualizacion de jornadas de Campo en Administracion.

Incluye:

- bandeja automatica de jornadas
- filtros
- detalle por jornada y pozo

### Fase 2

Revision administrativa.

Incluye:

- estados
- observaciones
- aprobacion o rechazo

### Fase 3

Consolidacion al pozo.

Incluye:

- aprobacion de parametros
- actualizacion del historico del pozo
- registro de auditoria

### Fase 4

Validacion automatica por parametros esperados.

Incluye:

- rangos por pozo
- comparacion automatica
- alertas por desviaciones

## 12. Mensaje Comercial Recomendado

La propuesta puede presentarse al cliente asi:

"La plataforma ya permite capturar jornadas operativas desde Campo. La siguiente evolucion consiste en que esas jornadas ingresen automaticamente a un modulo de revision administrativa, donde puedan validarse y consolidarse directamente al historial operativo de cada pozo, reduciendo la dependencia de Excel y mejorando el control del proceso."

## 13. Conclusión

Esta propuesta no reemplaza lo que ya existe, sino que aprovecha la base actual para convertir el sistema en una herramienta mas completa, conectando la operacion de Campo con la validacion administrativa dentro de un solo flujo digital.

Esto hace que la solucion gane valor operativo, valor tecnico y valor comercial frente al cliente final.