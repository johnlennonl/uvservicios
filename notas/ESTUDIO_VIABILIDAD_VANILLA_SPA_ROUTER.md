# Estudio de Viabilidad: Enrutamiento SPA en Vanilla JS sin Contras

Fecha: 2026-08-07
Estado: Estudio de viabilidad y planificación técnica.

## 1. Viabilidad General

Es **100% viable** convertir la plataforma de UV Servicios en una aplicación de página única (SPA - Single Page Application) manteniendo el stack actual de HTML y JavaScript nativo (sin necesidad de migrar a frameworks pesados como React o Angular).

El cambio resolverá de raíz los siguientes problemas:
- Parpadeo de pantalla y menú al cambiar de sección (sidebar estático).
- Pérdida de estado en el scroll o colapsos del menú.
- Consumo innecesario de ancho de banda (se descarga el CSS y librerías una sola vez).

---

## 2. Los "Contras" que Debemos Evitar y su Solución

Para lograr una SPA robusta y libre de fallos a largo plazo, debemos blindar el sistema contra tres riesgos comunes:

| Riesgo | Qué lo causa | Cómo lo solucionaremos |
| --- | --- | --- |
| **Fugas de Memoria (Memory Leaks)** | El navegador no limpia los datos porque la sesión nunca se reinicia físicamente. | Cada controlador de página expondrá una función `destroy()` o `cleanup()` que limpie temporizadores (`setInterval`), destruya instancias de ApexCharts (`chart.destroy()`) y remueva escuchadores de eventos globales (`window.removeEventListener`). |
| **Scripts Huérfanos e Inline** | Archivos HTML como `data.html` tienen scripts embebidos en etiquetas `<script>` que no se ejecutan al inyectar HTML dinámicamente. | Extraeremos toda la lógica inline a controladores externos estructurados como módulos ES6 (ej. `js/modules/data/data-controller.js`). |
| **Manejadores de Eventos Duplicados** | Si el usuario entra, sale y vuelve a entrar a una página, las funciones de clic de los botones podrían registrarse dos veces. | Utilizaremos la delegación de eventos en el contenedor central, o limpiaremos los escuchadores en la fase de destrucción. |

---

## 3. Plan de Acción y Arquitectura Propuesta

### Paso A: Creación del Enrutador Central (`js/services/router.js`)
El enrutador interceptará los clics del sidebar, gestionará el historial del navegador (`pushState`) y hará la carga asíncrona del contenido.

```js
// Ejemplo conceptual del enrutador central
const routes = {
    'dashboard.html': {
        load: () => import('../charts.js'),
        init: (m) => m.initDashboard(),
        destroy: (m) => m.destroyDashboard()
    },
    'campo-admin.html': {
        load: () => import('../campo-admin.js'),
        init: (m) => m.initCampoAdmin(),
        destroy: (m) => m.destroyCampoAdmin()
    }
};

let currentPage = null;

export async function navigate(url, pushState = true) {
    const pageName = url.split('/').pop() || 'dashboard.html';
    const route = routes[pageName];
    if (!route) return;

    // 1. Destruir página anterior
    if (currentPage && routes[currentPage]?.destroy) {
        routes[currentPage].destroy();
    }

    // 2. Fetch del nuevo HTML
    const response = await fetch(url);
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // 3. Reemplazar contenedor principal
    const newMain = doc.querySelector('.main-container');
    const currentMain = document.querySelector('.main-container');
    if (newMain && currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
    }

    // 4. Actualizar URL
    if (pushState) history.pushState(null, '', url);
    currentPage = pageName;

    // 5. Cargar e inicializar módulo
    const module = await route.load();
    if (route.init) route.init(module);
}
```

### Paso B: Encapsular cada Controlador en Módulos
Cada controlador JS pasará de autoejecutarse a exportar funciones de ciclo de vida.

#### Ejemplo en `js/charts.js`:
```js
let refreshInterval = null;
let charts = {};

// Todo el código de arranque actual se mueve a esta función:
export async function initDashboard() {
    // Inicializar ApexCharts...
    // Configurar intervals...
    refreshInterval = setInterval(updateDashboard, 60000);
}

// Limpieza para liberar memoria al salir:
export function destroyDashboard() {
    clearInterval(refreshInterval);
    Object.values(charts).forEach(chart => {
        if (typeof chart.destroy === 'function') chart.destroy();
    });
    charts = {};
}
```

### Paso C: Estructurar el Contenedor Global
Crearemos un contenedor maestro (ej. `app.html` o `index.html`) que contenga el Sidebar, el Header y el switcher de contrato. Ese marco estructural se mantendrá estático siempre, y el contenido interior de las páginas se cargará dentro del `<main>` central.

---

## 4. Viabilidad y Esfuerzo de Trabajo

- **Esfuerzo:** Estimamos unas **8 a 12 horas de desarrollo** neto.
- **Riesgo:** Bajo si se ejecuta en una rama local separada, realizando la transición página por página.
- **Viabilidad:** Excelente. Al finalizar, la aplicación de UV Servicios responderá como una SPA moderna (al nivel de React/Svelte) pero con código nativo ultra-eficiente de apenas unos kilobytes.
