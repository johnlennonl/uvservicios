# Notas de Implementación: Ocultar Sección de Ayuda Globalmente

Fecha: 2026-08-07
Estado: Implementado.

## Resumen Ejecutivo

A requerimiento del usuario, se ha procedido a ocultar el acceso a la sección de Ayuda (`help.html`) en todas las secciones y páginas de la aplicación de manera segura y centralizada, con el fin de definir posteriormente su reestructuración o destino.

---

## Modificaciones Técnicas

### 1. Ocultación centralizada (`css/style.css`)
*   Se añadió una regla global en la hoja de estilos compartida por todo el proyecto para interceptar cualquier elemento de navegación que apunte al recurso de ayuda.
*   **Regla aplicada:**
    ```css
    a[href="help.html"] {
      display: none !important;
    }
    ```
*   **Alcance:** Esta regla oculta automáticamente los botones de ayuda en las siguientes vistas sin necesidad de alterar su estructura HTML individual:
    *   Barra de navegación lateral (Sidebar) de escritorio.
    *   Botonera móvil del "Menú Más" (Bottom sheet).
    *   Cualquier enlace de apoyo contextual existente en Dashboard, Datos, Campo, Estadísticas y Gestión de Usuarios.
