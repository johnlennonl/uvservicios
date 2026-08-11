# V3.0 - Fase 1: Implementación del Motor SPA Híbrido

Fecha: 2026-08-07
Versión: 3.0.0-Fase1
Estado: Implementado.

## Resumen de Cambios

Se ha estructurado y desplegado con éxito el motor de enrutamiento SPA (Single Page Application) híbrido y se han migrado las dos secciones clave: **Dashboard** e **Inicio** (`dashboard.html`) y el panel de **Administración de Campo** (`campo-admin.html`).

---

## Detalle Técnico de Archivos Modificados

### 1. Motor del Enrutador (`js/services/router.js`)
*   Centraliza el control de la navegación en un script global.
*   Intercepta las pulsaciones de enlaces internos (`<a>`).
*   **Pantalla de Carga SPA con Logo (Sin Contenedor):**
    *   Se implementó `ensureLoaderOverlay()` para generar e inyectar dinámicamente un overlay con el logo de UV Servicios centrado flotando sobre un fondo difuminado premium.
    *   Se eliminaron por completo las cajas, bordes, contenedores blancos y barras de carga, logrando un aspecto limpio, moderno y de alta tecnología.
    *   Al navegar, el overlay se desvanece suavemente con un fondo de desenfoque (`backdrop-filter: blur(12px) saturate(1.2)`) y bloquea toques o clics adicionales para evitar duplicidad.
    *   Se aplicó una **duración de transición mínima de 420ms** para evitar destellos blancos bruscos en conexiones veloces locales, asegurando que la carga siempre sea fluida y percibida como premium.
*   **Animación de Transición de Páginas (Fade Out / Fade In):**
    *   Al solicitar un cambio de página, se añade la clase `.spa-fade-out` al contenedor activo, desvaneciéndolo con un desplazamiento vertical sutil en 180ms.
    *   Se inyecta el contenedor de la nueva página con la clase `.spa-fade-out` activa.
    *   Tras resolver e inicializar el módulo entrante, se remueve la clase `.spa-fade-out`, ejecutando una transición suave de entrada (Fade In) con un desplazamiento ascendente fluido.
    *   Se utiliza una curva de tiempo cubic-bezier premium para un movimiento natural.
*   **Sincronización Dinámica de Estilos:**
    *   Para dar soporte a vistas que contienen estilos embebidos (como `campo-admin.html` que cuenta con un bloque `<style>` de más de 3900 líneas en su cabecera), el enrutador copia y agrega de forma dinámica los estilos internos `<style>` y hojas externas `<link>` nuevas al `<head>` del documento principal.
    *   Al cambiar de sección, remueve y limpia de manera segura todos los estilos de la SPA anterior marcados con `data-spa-styles="true"`, evitando colisiones visuales entre páginas.
*   Preserva el Sidebar y el menú inferior móvil, actualizando dinámicamente sus estados activos (clase `.active`).
*   Dispara el ciclo de vida de los controladores (`destroy` en el anterior, `init` en el nuevo).
*   Maneja eventos de retroceso y avance del navegador (`popstate`) e implementa un mecanismo de redirección física tradicional como respaldo de seguridad en caso de fallos.

### 2. Controlador de Gráficas (`js/charts.js`)
*   Se removió el escuchador automático `DOMContentLoaded`.
*   Se encapsuló toda la lógica de inicialización en la función exportable `initDashboard()`.
*   **Sincronización de Carga Asíncrona (Await):**
    *   Se agregó la instrucción `await` en la llamada a `updateDashboard()` durante la carga de `initDashboard()`. Esto garantiza que la promesa del ciclo de vida se resuelva únicamente cuando todos los datos de Supabase han sido descargados y los gráficos de ApexCharts están completamente renderizados y visibles.
*   Se implementó la función exportable `destroyDashboard()` que:
    *   Destruye activamente todas las instancias de ApexCharts registradas (`chart.destroy()`).
    *   Desvincula de forma segura el escuchador global de redimensionado `resize` (`dashboardResizeHandler`).
    *   Remueve el escuchador global de clics en el documento (`dashboardOutsideClickHandler`).
    *   Limpia la caché de datos de indicadores de la sesión anterior.

### 3. Panel Administrativo (`js/campo-admin.js`)
*   Se removió la llamada global a `bootstrap()`.
*   Se encapsuló la llamada a bootstrap y arranque de jornadas en la función exportable `initCampoAdmin()`.
*   **Inicialización Dinámica de Elementos DOM:**
    *   Se resolvió el problema del objeto `const elements` estático que se evaluaba antes de cambiar de DOM (quedando nulo al importarse desde otra página).
    *   Se convirtió en una variable dinámica (`let elements`) y se creó `initElements()`, la cual realiza las consultas de elementos sobre el DOM en vivo cada vez que se arranca la vista mediante `bootstrap()`.
*   Se implementó la función exportable `destroyCampoAdmin()` para:
    *   Desvincular el escuchador global de clic sobre el documento para las pestañas de incidentes (`sidebarTabClickHandler`).

### 4. Vistas HTML (`dashboard.html` y `campo-admin.html`)
*   Se eliminaron las llamadas directas a sus controladores específicos (`js/charts.js` y `js/campo-admin.js`).
*   Se añadió la carga del script modular del enrutador central:
    ```html
    <script type="module" src="js/services/router.js"></script>
    ```
