# Finalización y Entrega: Base de Datos & Expediente Digital (Versión V2)
## UV Servicios

Este documento resume de forma oficial todos los desarrollos, integraciones premium, optimizaciones UX y reestructuraciones lógicas realizadas para dar por finalizada con éxito la **Versión V2** del módulo de Base de Datos.

---

## 🚀 Resumen de Funcionalidades V2 Implementadas

### 1. 🗑️ Papelera de Reciclaje (Borrado Lógico / Soft Delete)
*   **Seguridad de Información**: Los documentos ya no se eliminan permanentemente de forma inmediata. Al hacer clic en "Eliminar", se realiza una marca lógica (`deleted_at`).
*   **Panel de Recuperación**: Se integró una vista de Papelera de Reciclaje que muestra el listado de elementos eliminados con opciones para:
    *   **Restaurar**: Devuelve el archivo a su pozo y carpeta original al instante.
    *   **Eliminar Permanentemente (Purga)**: Borra físicamente el archivo del Storage Bucket y el registro de la base de datos de forma definitiva.
*   **Tolerancia a Fallos en Caliente**: El código JS incluye un fallback automático. Si el administrador no ha corrido la migración SQL de `deleted_at` en Supabase, el sistema lo detecta y opera de forma normal sin crasear la página web de los operadores en producción.

### 2. 📊 Control de Almacenamiento ("Dashboard BRUTAL")
*   **Estadísticas de Cuota**: Muestra el consumo total de espacio calculado contra una cuota de **100.00 GB** (correspondiente al plan Supabase Pro).
*   **Barra de Progreso Dinámica**: Cambia de color según el consumo (azul/verde para consumo normal, amarillo preventivo, rojo crítico a partir del 85%).
*   **Gráficos en Tiempo Real (Chart.js)**:
    *   *Espacio por Categorías*: Gráfico de rosca (doughnut) que desglosa el almacenamiento consumido por simulaciones, informes, fichas BES, etc.
    *   *Top 5 Pozos más Pesados*: Gráfico de barras horizontales que identifica qué pozos están consumiendo más bytes en disco.
*   **Últimos Archivos Registrados**: Tabla inferior que muestra los 5 documentos cargados más recientemente con el pozo, categoría, nombre del archivo, peso, usuario que lo subió y fecha.

### 3. 🔍 Selector de Pozos con Auto-completado (Miga de Pan)
*   **Filtro Inteligente**: Se reemplazó el menú `<select>` tradicional por un campo de texto interactivo con autocompletado en el breadcrumb.
*   **UX Mejorada**:
    *   Al hacer clic o enfocar el buscador, muestra la **lista completa de pozos** (no se queda vacía por el texto actual).
    *   El pozo activo en el que se encuentra el usuario se resalta visualmente en color azul, negrita y con un icono de check (`fa-circle-check`).
    *   Hace scroll automático dentro de la lista para enfocar el pozo activo.
    *   Selecciona todo el texto del input al enfocar para que el usuario pueda escribir y filtrar de forma inmediata.

### 4. 🗂️ Globalización de Información General y Gerencial
*   **Archivos y Carpetas de los Jefes**: Las carpetas y archivos dentro de las secciones virtuales de **"Información General"** y **"Gerencial"** ahora se graban con el contrato vacío (`operational_scope = NULL`).
*   **Visualización Multicontrato**: Las consultas en estas dos secciones omiten la validación de contrato. Esto asegura que la información administrativa de los jefes sea visible por igual en cualquiera de los contratos seleccionados en la barra superior.

### 5. 📁 Subcarpeta Selector Jerárquico (Modal de Carga)
*   **Organización Visual**: En el modal "Cargar Nuevo Documento", el selector de "Subcarpeta" ahora muestra la jerarquía identada con un formato de árbol (`└─ 📁 NOMBRE_SUBCARPETA`).
*   **Legibilidad**: Se eliminó la repetición del prefijo de carpetas padres (ej: `REPORTES DE NIVELES > ABRIL 2026` ahora se ve simplemente como `└─ 📁 ABRIL 2026` bajo su respectiva sección), facilitando la selección precisa a la hora de subir archivos.

### 🗺️ Reubicación y Enrutamiento en Sidebar & Móvil
*   **Menú Lateral (Escritorio)**: El botón "Almacenamiento" se eliminó de la cabecera y se integró como una opción principal del menú lateral izquierdo con un icono de gráfico circular.
*   **Menú Inferior (Móvil)**: Se agregó un nuevo botón **"Espacio"** en el menú móvil inferior de cinco columnas para acceso rápido desde teléfonos.
*   **Sincronización Active**: El sistema enruta y actualiza el estado de las clases `.active` del menú para resaltar correctamente en qué pestaña (Pozos, General, Gerencial, Almacenamiento) se encuentra navegando el usuario en tiempo real.

---

## 🛠️ Estructura de Archivos Modificados y Desplegados

Los cambios han sido commiteados y pusheados de forma segura a la rama principal (`main`) de tu repositorio GitHub:

1.  [`base-datos.html`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/base-datos.html): Estructura del menú lateral, barra de navegación móvil, tabla de últimos archivos y contenedores de gráficos.
2.  [`js/modules/database/database-controller.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/database/database-controller.js): Lógica de gráficos de Chart.js, cálculo de cuota de 100 GB, listado de últimos archivos, eventos de navegación, breadcrumb dinámico y enrutamiento con active sync.
3.  [`js/services/well-documents-service.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/well-documents-service.js): Consulta de base de datos con omisión de contrato para secciones virtuales, guardado de carpetas y documentos con scope `NULL` para globalización, soft-delete, restauración y eliminación física.
4.  [`supabase/add_deleted_at_to_well_documents.sql`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/supabase/add_deleted_at_to_well_documents.sql): Script de migración para activar la papelera de reciclaje en la base de datos de producción.

---

## 📝 Script SQL de Regularización (Ejecutar en Supabase)

Para activar y homologar la base de datos de producción con la versión V2, ejecuta el siguiente código en el SQL Editor de tu consola Supabase:

```sql
-- 1. Agregar columna de borrado lógico a documentos
ALTER TABLE public.well_historical_documents 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Crear índice parcial para búsquedas eficientes de archivos activos
CREATE INDEX IF NOT EXISTS idx_well_docs_active_status 
ON public.well_historical_documents (deleted_at) 
WHERE deleted_at IS NULL;

-- 3. Hacer globales las carpetas generales y gerenciales existentes
UPDATE public.well_document_folders 
SET operational_scope = NULL 
WHERE pozo_name IN ('_GENERAL', '_GERENCIAL');

-- 4. Hacer globales los documentos generales y gerenciales existentes
UPDATE public.well_historical_documents 
SET operational_scope = NULL 
WHERE pozo_name IN ('_GENERAL', '_GERENCIAL');
```

---
*UV Servicios - Versión V2 Finalizada con Éxito - 2026*
