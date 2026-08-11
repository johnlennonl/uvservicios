# Notas de Implementación: Formato de Nombres de Contrato sin Slashes

Fecha: 2026-08-07
Estado: Implementado.

## Resumen Ejecutivo

Para mejorar la estética visual y alinearse con las pautas de diseño premium en la visualización de los alcances operativos, se reemplazaron las barras `/` que separaban los campos de contrato por puntos medios con espacio (` · `) en las zonas de visualización pública.

---

## Modificaciones Técnicas

### 1. Formateador de nombres de contrato (`js/services/operational-scope-context.js`)
*   Se creó una función de utilidad `formatContractName(name)` para reemplazar dinámicamente las barras y espacios por puntos medios:
    ```js
    function formatContractName(name) {
        return String(name || '')
            .replace(/\s*\/\s*/g, ' · ')
            .trim();
    }
    ```

*   **Zonas de aplicación:**
    *   **Loader de carga:** El mensaje de cambio de contrato ahora muestra `"Ceiba · Tomoporo"` o `"Barua · Motatan · Mene Grande"` durante la animación de transición.
    *   **Texto de selección estático:** Si el selector de contrato está bloqueado por permisos del perfil de usuario, el nombre se despliega formateado.
    *   **Botón selector y menú:** El texto del botón selector y cada opción del listado desplegable de contratos muestran los nombres con puntos medios en lugar de barras `/`.
