# Propuesta y Notas: Optimización del Loader de Cambio de Contrato para Mobile

Fecha: 2026-08-07
Estado: Propuesta de optimización para implementar.

## Recomendaciones del desarrollador web experto en móviles

Al cambiar de contrato operativo en una aplicación web móvil, la experiencia debe sentirse instantánea, sin parpadeos de pantalla blanca y sin demoras artificiales. 

A continuación se detallan las 4 recomendaciones técnicas clave para optimizar este componente en dispositivos móviles:

### 1. Integración con Promesas Reales (Evitar Tiempos de Espera Fijos)
*   **Problema actual:** El código actual usa un `setTimeout` con un retardo fijo de `2200ms` después de ejecutar `onChange`. Si el cambio es en memoria (como en Campo Admin que solo ejecuta `loadJourneys()`), el usuario queda "bloqueado" artificialmente por más de 4 segundos aunque los datos ya se hayan cargado.
*   **Solución:** Si el callback `onChange` devuelve una Promesa (como una consulta a Supabase), el loader debe ocultarse **exactamente** cuando la Promesa se resuelva (con un mínimo de `600ms` para que la animación se aprecie y no parpadee). Si no hay Promesa y no se detecta recarga de página inmediata, el loader debe desaparecer suavemente tras `600ms`.

### 2. Bloqueo Absoluto de Gestos y Touch Scroll en Mobile
*   **Problema actual:** En teléfonos móviles, un usuario puede intentar hacer scroll o pulsar botones invisibles debajo del difuminado de fondo mientras el loader está activo (efecto "touch-through").
*   **Solución:** Agregar `touch-action: none;` en CSS a la capa `.operational-scope-transition-overlay` y bloquear el evento `touchmove` en JavaScript para asegurar que ningún gesto sea transmitido a la página de fondo.

### 3. Animaciones Aceleradas por Hardware (GPU)
*   **Problema actual:** Las animaciones CSS en móviles de gama media/baja pueden ralentizarse si fuerzan repintados continuos del DOM (layout reflows).
*   **Solución:**
    *   Usar propiedades compuestas como `transform` (para la rotación de órbitas y escalado de tarjetas) y `opacity` (para el fundido).
    *   Agregar `will-change: transform, opacity;` a los elementos animados en CSS para que el navegador móvil los asigne directamente a la GPU.

### 4. Suavizado en la Recarga Física de Página
*   **Problema actual:** En páginas como Base de Datos, Estadísticas o Consolidado, `onChange` invoca un `window.location.reload()`. Durante este proceso, el navegador web móvil destruye el DOM, provocando un parpadeo en blanco antes de renderizar la página de nuevo.
*   **Solución:** El loader debe presentarse inmediatamente al hacer clic. Al detectar que el navegador inicia la descarga de la página actual (`pagehide` o `beforeunload`), el loader debe mantenerse visible y estático hasta el último milisegundo, permitiendo una transición visual continua mientras el navegador carga el nuevo código.

---

## Cambios Propuestos en el Código

### A. Modificar [operational-scope-context.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/operational-scope-context.js)

Actualizar la función de transición para:
1.  Detectar si la Promesa devuelta por `onChange` está activa.
2.  Reducir el retardo base del loader a `600ms` como mínimo visual si no hay promesas.
3.  Bloquear gestos de toque (`touchstart`, `touchmove`) en el overlay.

```js
// Ejemplo de mejora en runOperationalScopeChange:
function runOperationalScopeChange(onChange, nextScope, transitionDelay) {
    const minDisplayPromise = new Promise(resolve => window.setTimeout(resolve, 600));

    window.setTimeout(async () => {
        if (typeof onChange !== 'function') {
            finishOperationalScopeTransition();
            return;
        }

        let didLeavePage = false;
        const markLeaving = () => { didLeavePage = true; };
        window.addEventListener('pagehide', markLeaving, { once: true });
        window.addEventListener('beforeunload', markLeaving, { once: true });

        try {
            // Ejecutar el callback de la página y capturar su resultado (que puede ser una Promesa)
            const result = onChange(nextScope);
            
            if (result instanceof Promise || (result && typeof result.then === 'function')) {
                // Esperar tanto la resolución de la carga como el tiempo mínimo de la animación
                await Promise.all([result, minDisplayPromise]);
            } else {
                // Si no es promesa, esperar el tiempo mínimo de animación
                await minDisplayPromise;
            }
        } catch (error) {
            console.error('Error durante el cambio de contrato:', error);
        } finally {
            if (!didLeavePage) {
                finishOperationalScopeTransition();
            }
        }
    }, transitionDelay);
}
```

### B. Modificar [campo-admin.js](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/campo-admin.js)

Hacer que la función del callback retorne la promesa de `loadJourneys()` para que el loader sepa exactamente cuándo ocultarse:

```js
    renderOperationalScopeSwitcher(document.getElementById('campo-admin-operational-scope-switcher'), operationalScopeContext, {
        onChange: () => {
            state.selectedJourneyId = '';
            state.currentDetail = null;
            return loadJourneys(); // <-- Retornar la promesa!
        }
    });
```

### C. Modificar [style.css](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/css/style.css)

Optimizar con propiedades compuestas y bloqueo táctil en mobile:

```css
.operational-scope-transition-overlay {
    /* ... estilos existentes ... */
    touch-action: none; /* Bloquea gestos en mobile */
    will-change: opacity, visibility;
}

.operational-scope-transition-card {
    /* ... estilos existentes ... */
    will-change: transform;
}

.operational-scope-transition-brand::before,
.operational-scope-transition-brand::after {
    /* ... estilos existentes ... */
    will-change: transform;
}
```
