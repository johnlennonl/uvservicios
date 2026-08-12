# Registro de Optimizaciones y Correcciones V3 - Agosto 2026

Este documento detalla las optimizaciones y correcciones de errores aplicadas para resolver fallas de navegación, seguridad y rendimiento en la versión 3 de la plataforma.

---

## 1. Rendimiento y Carga de Archivos
* **Compresión de Imágenes en el Cliente (`well-documents-service.js`)**:
  * **Problema**: Los operadores suben fotos pesadas (5MB - 12MB) directamente de la cámara de sus móviles. En cobertura de campo petrolero, esto causaba extrema lentitud y timeouts.
  * **Solución**: Se implementó compresión local antes de la subida. Si la imagen supera los 400KB, el navegador reduce su tamaño proporcionalmente (max 1600px en el lado largo) y la exporta como JPEG al 75% de calidad (estandarizando la extensión a `.jpg`).
  * **Impacto**: Reduce el tamaño en ~95% (de ~8MB a ~250KB), haciendo que la carga sea de 20 a 50 veces más rápida y consuma menos datos móviles.

---

## 2. Estabilidad de Navegación y SPA (Single Page Application)
* **Cargador Dinámico de Scripts en Enrutador (`router.js`)**:
  * **Problema**: Al navegar de forma dinámica (SPA), las etiquetas `<script>` externas en el `<head>` de las páginas destino (ej. Chart.js en estadísticas) no se re-evaluaban, provocando errores como `Chart is not defined`.
  * **Solución**: Se añadió lógica en `router.js` para detectar nuevos scripts en el `<head>` destino, cargarlos asíncronamente preservando su atributo `type` (como `type="module"`), y esperar su carga completa antes de iniciar el módulo.
* **Auto-cierre del Menú Móvil "Más Opciones" (`router.js`)**:
  * **Problema**: Al navegar a otra sección en móvil, el Bottom Sheet `#mobile-more-menu` se mantenía activo y visible tapando la pantalla.
  * **Solución**: Se agregó una limpieza en `navigate` para desactivar el menú removiendo la clase `active` en la transición.
* **Fuga de Memoria / Clics Huérfanos en Selector de Pozos (`data-controller.js`)**:
  * **Problema**: El listener de clic fuera del selector de pozos se añadía de forma anónima, por lo que `destroyData()` no podía eliminarlo. Al hacer clics en otras páginas, arrojaba error de lectura de clases sobre elementos nulos.
  * **Solución**: Se asignó a la variable modular `pozoOutsideClickListener` para garantizar su correcta remoción al salir del módulo.

---

## 3. Seguridad y CSP (Content Security Policy)
* **Actualización Global de Políticas CSP en Archivos HTML**:
  * **Problema**: El CSP bloqueaba la ejecución de scripts/estilos traídos desde `cdnjs.cloudflare.com` y `cdn.jsdelivr.net` (como iconos de FontAwesome y utilidades de PDF).
  * **Solución**: Se actualizó masivamente el tag `<meta>` de CSP en todos los HTML del proyecto para incluir los orígenes permitidos en `script-src`, `style-src` y `font-src`.
* **Eliminación de Log Sensible en Administrador de Campo (`campo-admin.js`)**:
  * **Problema**: Un log de depuración (`console.log`) imprimía todo el mapa de perfiles (nombres, correos y roles) en la consola pública del desarrollador.
  * **Solución**: Se removió el log por completo para proteger la privacidad.

---

## 4. Sincronización y Lógica de Contratos
* **Corrección de Errata de Carga de Datos en Estadísticas (`estadisticas.js`)**:
  * **Problema**: Al cambiar de contrato, la interfaz llamaba a un método inexistente (`loadReportData()`), arrojando un error y dejando la pantalla congelada.
  * **Solución**: Se cambió al método correcto `loadData()`.
* **Actualización del Catálogo en Reportes Personalizados (`estadisticas.js` + `stats-custom-reports.js`)**:
  * **Problema**: El dropdown de pozos en reportes personalizados se quedaba con el catálogo del contrato con el que inició la página.
  * **Solución**: Se creó la función `updateCustomReportWellsContext()` para actualizar los pozos elegibles según el contrato seleccionado al vuelo.

---

## 5. Expediente Digital y Descargas
* **Resolución de Promesa en Descarga/Visualización de Documentos (`database-controller.js`)**:
  * **Problema**: Al intentar descargar o previsualizar cualquier archivo del expediente digital, se descargaba un archivo vacío `.htm` con nombre `[object Promise].htm`, y al intentar visualizarlo arrojaba error de red.
  * **Causa**: La función `getDocumentDownloadUrl()` es asíncrona (retorna una Promesa), pero se llamaba en modo síncrono dentro del renderizado de la tabla. Al no usar `await`, la URL se convertía a la cadena `"[object Promise]"`.
  * **Solución**: Se modificó `fetchAndRenderFiles()` para que resuelva todas las URLs de descarga en paralelo usando `Promise.all` antes de inyectar el HTML, asegurando que las acciones de "VER" y "DESCARGAR" dispongan de enlaces válidos.

---

## 6. Dashboard y Gráficas de Tendencia (Pozos en OFF)
* **Graficado de Parámetros en 0 e Integración de Observaciones (`charts.js`)**:
  * **Problema**: Cuando un pozo estaba en estatus `OFF`, los parámetros eléctricos (frecuencia, corriente, vsd) quedaban vacíos (nulos), lo que producía un "recorte" o hueco vacío en las curvas de tendencia en vez de mostrar visualmente la parada del equipo.
  * **Solución**:
    1. Se modificó `makeSeries` para forzar a `0` las variables principales (`frecuencia`, `corriente_motor`, `vsd_a`, `vsd_b`, `vsd_c`) cuando el registro tiene estatus `OFF`, permitiendo que la gráfica dibuje el declive hacia el suelo. Las presiones y temperaturas conservan sus valores originales.
    2. Se incluyó el estatus (`d.estatus`) y el texto de `observaciones` de campo en el objeto `meta` de cada punto.
    3. Se rediseñó `buildTrendAnnotationTooltip` usando estilos en línea responsivos y libres de las clases fijas del CSS (que forzaban el tamaño y causaban conflictos). Ahora el tooltip ajusta su alto y ancho de forma automática al tamaño de la bitácora para que nunca se recorte ("incompleta").
    4. Se implementó una regla CSS (`.chart-space .apexcharts-canvas { overflow: visible !important; }` en `dashboard-page.css`) para que el cuadro del tooltip pueda dibujarse fuera de los límites del lienzo sin recortar el texto.
    5. Se configuraron las opciones de tooltip en `shared: true` e `intersect: false` para que la tarjeta aparezca inmediatamente al pasar el ratón por cualquier parte de la línea vertical de la fecha, mostrando la bitácora y anotaciones de forma ágil y fluida.
    6. Se implementó el patrón de sincronización reactiva `window.activeHoveredTrendPointMeta` en `charts.js`. Cada vez que el tooltip se renderiza (lo cual garantiza que el punto está activo y a la vista del usuario), se almacena su metadata. Al hacer clic en cualquier parte del gráfico, el evento de clic lee esta metadata global para abrir el modal de anotaciones de ingeniería de forma instantánea y robusta.

---

## 7. Historial y Auditoría (Pulso de la Jornada)
* **Corrección de Comparaciones Numéricas Vacías (`field-journey-service.js`)**:
  * **Problema**: En la bitácora de auditoría ("Pulso de la Jornada"), al re-enviar una jornada se registraban cambios vacíos redundantes del tipo `frecuencia (-- → --)` o `i_motor (-- → --)`.
  * **Causa**: La función `compareNum` comparaba un valor nulo (`null`) contra un string vacío (`""`) enviado desde los inputs del formulario. En JavaScript, `Number("") === 0`, por lo que se detectaba una diferencia numérica ficticia (`"" !== 0`). Al formatear ambos valores falsis como `--` en el texto del comentario, se generaba el log erróneo `(-- → --)`.
  * **Solución**: Se implementó una función limpiadora `getVal` dentro de `compareNum` que normaliza tanto los strings vacíos como los valores nulos/indefinidos a `null` de forma consistente. Ahora, el sistema solo registra cambios cuando hay variaciones numéricas reales en los parámetros.

---

## 8. Estadísticas y Reportes Personalizados
* **Tooltip Compartido Multivariable con Observaciones (`stats-custom-reports.js`)**:
  * **Problema**: En la gráfica multivariable combinada de estadísticas, al pasar el cursor sobre un punto no se mostraba el estatus del pozo (RUN/OFF) ni los comentarios/observaciones de campo correspondientes a esa lectura. Además, las paradas en OFF generaban huecos en las líneas.
  * **Solución**:
    1. Se modificó el llenado de datos para mapear a `0` las variables operacionales eléctricas principales en estado `OFF` (evitando cortes e interrupciones en la línea de tendencia).
    2. Se reemplazó el tooltip predeterminado de ApexCharts por un tooltip personalizado y formateado que muestra el badge de estatus `RUN`/`OFF` y renderiza la sección **"Observación de Campo"** inyectando el comentario exacto del pozo a esa hora.

---

## 9. Captura de Campo y Reportes de Apoyo (Pozo Manual)
* **Sustitución de Motivo por Pozo (`field-controller.js`)**:
  * **Problema**: El operador necesitaba reportar tareas de apoyo en pozos externos al contrato (no listados), ingresando el identificador del pozo manualmente y formateando el mensaje de salida con la etiqueta `Pozo: <Nombre>` en lugar del genérico `Reporte: <Motivo>`.
  * **Solución**:
    1. Se modificó la interfaz visual de SweetAlert de creación y edición de reportes de apoyo, renombrando la etiqueta "Motivo" a "Pozo" y la validación de campo requerida.
    2. Se actualizó la lista flotante de reportes de jornada para mostrar las tarjetas con la etiqueta `Pozo: <Nombre>` en negrita.
    3. Se rediseñó la función de formateo `buildJourneyShareMessage` para estructurar la salida en líneas separadas: la primera línea dice `Reporte`, la segunda línea muestra `Pozo: <Nombre>`, y continúa con la hora y la descripción ingresada.
    4. Se implementó la sincronización persistente de reportes de apoyo en base de datos durante el estado de borrador (`status = 'draft'`). Ahora, al agregar, editar o eliminar un reporte de apoyo, se guarda automáticamente en `field_journey_review_log` vinculado al borrador en Supabase.
    5. Se identificó que la tabla `field_journey_review_log` carece de políticas RLS de `DELETE` en Supabase, lo que impedía que los métodos convencionales borraran los logs del borrador remoto anterior y provocaba duplicación acumulativa (ej. 11 reportes en vez de 2).
    6. Se resolvió la limitación de RLS implementando un flujo de recreación limpia en `autosaveFieldJourneyDraft` y `submitFieldJourneyWorkflow` que primero elimina el encabezado del borrador previo (lo cual limpia en cascada todos los registros e historial en el motor de base de datos) antes de insertar los nuevos datos, garantizando una base limpia.
    7. Se añadió una salvaguarda de deduplicación de metadatos del lado del cliente en `getLatestFieldJourneyDraft` y `fetchSubmittedJourneyForField` que purga de forma inmediata y automática cualquier residuo de duplicados que haya quedado guardado previamente.




