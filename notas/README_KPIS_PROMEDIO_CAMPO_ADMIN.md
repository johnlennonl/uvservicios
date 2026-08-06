# README - KPIs promedio en Campo Admin

Fecha: 2026-08-06

Estado: Implementado en Campo Admin.

## Decision funcional

En el detalle administrativo de jornadas de Campo, cada tarjeta de pozo debe mostrar como valor principal el dato reportado por Campo en esa jornada y, debajo, el promedio de los ultimos 7 registros publicados del mismo pozo.

La finalidad es que Ingenieria pueda revisar rapidamente si el reporte actual luce coherente frente al comportamiento reciente del pozo, sin mezclar datos entre pozos distintos.

## Variables principales requeridas

Reemplazar los valores principales actuales:

- Frecuencia
- THP
- LF
- PIP
- PD

Por estos cinco indicadores:

- FREC
- PIP
- I MOTOR
- THP
- TM

Cada indicador debe mostrar primero el dato capturado en Campo y debajo el promedio correspondiente de los ultimos 7 registros publicados para ese mismo pozo.

## Fuente ideal de datos

La fuente recomendada para el promedio es la data publicada o consolidada del pozo, no solo los registros temporales de la jornada en revision.

Motivo:

- La data publicada representa informacion ya validada o consolidada.
- Permite comparar el reporte nuevo contra el comportamiento operativo reciente real del pozo.
- Evita que una jornada en revision contamine su propio promedio si aun no ha sido aprobada.

## Alcance del calculo

El promedio debe calcularse por pozo:

```text
Pozo CEI0003 -> ultimos 7 registros publicados de CEI0003
Pozo CEI0004 -> ultimos 7 registros publicados de CEI0004
```

No se deben mezclar registros de diferentes pozos aunque pertenezcan a la misma jornada.

## Presentacion sugerida

Mantener la organizacion visual de la tarjeta actual y mostrar los indicadores en una fila compacta:

```text
FREC          PIP           I MOTOR        THP           TM
53.5 Hz       1663 psi      42 A           100 psi       185 F
Prom. 7 reg: 53.1 Hz   Prom. 7 reg: 1659 psi   Prom. 7 reg: 41.8 A   Prom. 7 reg: 98 psi   Prom. 7 reg: 184.5 F
```

Si no existen 7 registros disponibles, el sistema puede calcular el promedio con los registros publicados existentes y mostrar una nota corta, por ejemplo:

```text
Prom. 3 reg
```

Si no existe data publicada para ese pozo, mostrar `--` y evitar inventar valores.

## Campos tecnicos relacionados

Campos esperados en Campo/jornadas:

- `frecuencia`
- `pip_psi`
- `i_motor`
- `thp_psi`
- `tm_f`

Campos equivalentes en monitoreo publicado, si se usa `monitoreo_pozos`:

- `frecuencia`
- `pip`
- `corriente_motor`
- `presion_thp`
- `tm`

## Criterio de implementacion

La pantalla afectada es Campo Admin, en el detalle de jornada por pozo.

Referencia actual de render:

```text
js/campo-admin.js
```

La implementacion debe conservar los botones y acciones actuales:

- Ver parametros
- Editar
- Eliminar

Solo cambia el bloque visual de metricas principales y la forma en que se calculan esos valores.

## Implementacion aplicada

- `js/services/field-journey-service.js` consulta `monitoreo_pozos` para traer los ultimos 7 registros publicados por cada pozo visible en el detalle de jornada.
- La consulta acepta registros del contrato activo y tambien registros legacy sin `operational_scope`, manteniendo el filtro por pozo para no mezclar contratos.
- El calculo se hace por pozo y por variable, usando `frecuencia`, `pip`, `corriente_motor`, `presion_thp` y `tm`.
- `js/campo-admin.js` reemplaza la fila principal de metricas por FREC, PIP, I MOTOR, THP y TM, mostrando arriba el valor reportado por Campo y debajo el promedio publicado.
- `campo-admin.html` agrega una franja visual diferenciada para mostrar el promedio publicado debajo del valor capturado en Campo.
- Si una variable no tiene registros validos publicados, la tarjeta muestra `--` y `Sin data publicada`.
- La franja del promedio incluye comparacion visual: normal, revisar o alerta segun la diferencia entre el valor de Campo y el promedio publicado.
- Campo Admin incluye el boton global `Configurar alertas` en la barra superior para que Ingenieria ajuste umbrales por variable. La configuracion se guarda en `localStorage` del navegador y aplica a todas las jornadas visibles.
- El modal **Ver parametros** ahora incluye una seccion operacional de **Promedios operativos** para FREC, PIP, I MOTOR, THP y TM. Esta vista muestra valor de Campo, promedio publicado, cantidad de registros usados, diferencia y estado visual.
- Las desviaciones que alcancen umbral de `Revisar` o `Alerta` tambien se agregan arriba en la seccion **Alertas** del modal del pozo, para que el ingeniero vea rapidamente que parametro requiere criterio tecnico.
- El scroll del fondo queda bloqueado mientras un modal de Campo Admin esta abierto; el desplazamiento se mantiene dentro del modal para evitar mover accidentalmente la jornada de atras.

## Umbrales iniciales de alerta

Los umbrales son orientativos y no bloquean acciones. Sirven para priorizar revision visual:

- FREC: revisar desde 1 Hz de diferencia; alerta desde 2 Hz.
- PIP: revisar desde 75 psi o 5%; alerta desde 150 psi o 10%.
- I MOTOR: revisar desde 3 A o 5%; alerta desde 6 A o 10%.
- THP: revisar desde 50 psi o 10%; alerta desde 100 psi o 20%.
- TM: revisar desde 5 F; alerta desde 10 F.

## Historial de revision y auditoria

Las ediciones de pozos desde Admin Campo registran bitacora en `field_journey_review_log`.

Para cada actualizacion de pozo, el historial guarda y muestra:

- Pozo actualizado.
- Usuario que ejecuto la actualizacion, resolviendo nombre desde perfiles cuando esta disponible.
- Fecha y hora del evento (`created_at`).
- Campos modificados.
- Valor anterior y valor nuevo por campo.
- Metadata tecnica (`record_id`, `pozo`, `changed_fields`, `changes`, `changed_count`, `updated_at_client`).

La intencion operativa es que Ingenieria pueda responder preguntas como:

```text
Quien actualizo este pozo?
Que parametro cambio?
Cual era el valor antes?
Cual quedo despues?
A que hora se hizo el ajuste?
```

Las modificaciones nuevas aparecen en el historial como eventos de revision con detalle tipo:

```text
Actualizado por Ing. Manuel Sanchez · Pozo TOM0012
Parámetros modificados: Frecuencia, Tm, Diagnóstico
Frecuencia: 55 -> 57
Tm: 297.4 -> 303
Diagnostico: -- -> Revisar temperatura de motor
```

La linea **Parametros modificados** es el resumen rapido para revision operacional. Debajo se muestra el detalle campo por campo con valor anterior y valor nuevo, por ejemplo `PIP: 1500 -> 1620` o `THP: 145 -> 150`.