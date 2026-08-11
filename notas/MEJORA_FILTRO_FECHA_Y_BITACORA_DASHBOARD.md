# Notas de Implementación: Rango de Fechas y Bitácora Completa en Dashboard

Fecha: 2026-08-07
Estado: Implementado.

## Resumen Ejecutivo

Para optimizar el análisis de tendencias históricas de pozos en el Dashboard, se implementaron dos mejoras funcionales críticas en la interfaz de consulta de gráficas:
1.  **Filtro Desde/Hasta:** Un mecanismo para seleccionar de manera interactiva un periodo personalizado de fechas.
2.  **Bitácora sin Scroll:** La visualización sin cortes de todas las observaciones correspondientes al pozo y periodo seleccionado.

---

## Modificaciones Técnicas

### 1. Interfaz y Selección (`dashboard.html`)
*   Se agregó la opción **"Elegir rango de fecha"** al selector de vista de tendencias:
    ```html
    <option value="custom-range">Elegir rango de fecha</option>
    ```
*   Se introdujeron los inputs de tipo fecha (`Desde` y `Hasta`) dentro del contenedor `#trend-date-range-container`. Este contenedor permanece oculto por defecto y se visualiza en formato `inline-flex` únicamente cuando el modo activo es `custom-range`.
*   Se eliminó la restricción de altura máxima de `150px` y el scroll vertical en la Bitácora de Observaciones modificando la envoltura HTML del cuerpo de la tabla.

### 2. Sincronización y Consulta (`js/charts.js`)
*   **Constantes:** Se incorporó `customRange: 'custom-range'` dentro de `TREND_WINDOW_MODES`.
*   **Inicialización y Visibilidad:** La función `syncTrendWindowControl` controla la visibilidad del contenedor de fechas. Al activarse por primera vez para un pozo, calcula de forma retrospectiva un rango por defecto de **30 días** en base al último registro disponible.
*   **Eventos:** Se enlazaron manejadores de eventos `change` en los selectores de fecha Desde/Hasta para invocar a `updateDashboard()` automáticamente.
*   **Lectura de Parámetros:** En `updateDashboard()`, si el modo es `custom-range`, las variables `start` y `end` leídas de la base de datos se sustituyen con las fechas personalizadas seleccionadas por el usuario.
*   **Bitácora:** Se eliminó el truncamiento `.slice(0, 15)` al renderizar las observaciones en `renderObservations()`, permitiendo iterar sobre todo el conjunto de registros devueltos por la consulta del periodo.
*   **Feedback Visual:** El encabezado del Dashboard se actualiza dinámicamente indicando el rango de análisis seleccionado por el usuario.
