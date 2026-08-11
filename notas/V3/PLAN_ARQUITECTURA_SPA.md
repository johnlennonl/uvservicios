# Arquitectura UV Servicios V3.0: Enrutador Hybrid SPA

Fecha: 2026-08-07
Versión: 3.0-RC1
Estado: Propuesta de arquitectura y viabilidad.

## 1. Diseño del Enrutador Híbrido (Hybrid SPA)

Para evitar reescribir toda la estructura del servidor (como reglas de reescritura de URL en Apache, Nginx o Supabase Hosting), la versión V3.0 utilizará un **Enrutador Híbrido**.

### Cómo funciona:
1.  **Carga inicial (Física):** El usuario puede entrar directamente a cualquier URL (ej: `dashboard.html` o `campo-admin.html`). El navegador carga el archivo HTML físico normalmente, lo que garantiza compatibilidad 100% si se recarga la página.
2.  **Interceptación de clics:** Al inicializarse el script global de enrutamiento (`js/services/router.js`), intercepta todos los clics del menú sidebar que apunten a archivos `.html` locales.
3.  **Transición asíncrona:**
    *   Cancela la recarga física del navegador (`e.preventDefault()`).
    *   Ejecuta el ciclo de vida `destroy()` de la sección actual para limpiar memoria.
    *   Hace un `fetch()` en segundo plano del nuevo archivo HTML.
    *   Extrae el bloque `<main class="main-container">` del HTML descargado y reemplaza el `<main>` actual en el DOM.
    *   Actualiza el título de la página (`document.title`) y las clases del `body` para aplicar temas.
    *   Modifica la URL de la barra de navegación usando `history.pushState()`.
    *   Importa dinámicamente (`import()`) el controlador JS de la nueva página y ejecuta su ciclo de vida `init()`.

---

## 2. Definición del Ciclo de Vida del Controlador

Cada página tendrá un controlador de JavaScript estructurado como un módulo ES6. Expondrá obligatoriamente dos funciones asíncronas:

```js
/**
 * Ciclo de Vida: Inicialización de la página
 * Se ejecuta inmediatamente después de inyectar el HTML de la sección en el DOM.
 */
export async function initPage() {
    // 1. Cargar datos de base de datos
    // 2. Dibujar gráficas o tablas
    // 3. Registrar escuchadores de eventos específicos de esta vista
}

/**
 * Ciclo de Vida: Destrucción de la página
 * Se ejecuta justo antes de cambiar de sección para evitar fugas de memoria y eventos huérfanos.
 */
export function destroyPage() {
    // 1. Destruir instancias de gráficas (chart.destroy())
    // 2. Limpiar intervalos de refresco (clearInterval)
    // 3. Quitar escuchadores globales (window.removeEventListener)
    // 4. Limpiar variables de estado volátiles en memoria
}
```

---

## 3. Matriz de Controladores y Páginas

A continuación se detalla cómo se reorganizarán las secciones para la V3.0:

| Página HTML | Controlador JS Destino | Estado de Origen |
| --- | --- | --- |
| `dashboard.html` | [charts.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/charts.js) | Requiere encapsular arranque global en `initDashboard` y crear `destroyDashboard`. |
| `campo-admin.html` | [campo-admin.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/campo-admin.js) | Requiere encapsular bootstrap en `initCampoAdmin` y crear `destroyCampoAdmin`. |
| `stats.html` | [estadisticas.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/estadisticas.js) | Requiere encapsular arranque en `initEstadisticas` y crear `destroyEstadisticas`. |
| `notificacion.html` | [notificacion.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/notificacion.js) | Requiere encapsular bootstrap en `initNotificaciones` y crear `destroyNotificaciones`. |
| `base-datos.html` | [database-controller.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/database/database-controller.js) | Ya tiene estructura modular. Requiere encapsular arranque y agregar destructor. |
| `consolidado.html` | [consolidado.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/consolidado.js) | Requiere encapsular arranque en `initConsolidado` y crear `destroyConsolidado`. |
| `data.html` | [data-controller.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/data-controller.js) *[NUEVO]* | La lógica inline de 600 líneas se extraerá a este nuevo archivo modular. |
| `dashboard-data.html` | [dashboard-data-controller.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/dashboard-data-controller.js) *[NUEVO]* | La lógica inline de 300 líneas se extraerá a este nuevo archivo modular. |

---

## 4. Estrategia de Comentarios y Blindaje

Para garantizar que el sistema funcione sin romperse:
1.  **Comentarios Explicativos:** Cada función del enrutamiento y del ciclo de vida de los controladores tendrá comentarios exhaustivos detallando qué hace, qué parámetros recibe y por qué limpia la memoria.
2.  **Verificación de Fallback:** Si un navegador antiguo o una conexión inestable interrumpe la carga de la SPA, el enrutador capturará el error de forma segura y realizará una navegación física tradicional como respaldo.
3.  **Trazabilidad:** Cada cambio será registrado detalladamente en la carpeta de notas `notas/V3/` con fechas y descripciones.
