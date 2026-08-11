# 📁 Exclusiones en Git y Optimización de Despliegue en Vercel
**Última actualización: 10 de Agosto de 2026**

---

Este documento detalla los cambios realizados en la configuración de Git del proyecto para asegurar despliegues limpios, rápidos y libres de archivos temporales en **Vercel** tras cada confirmación (`git push`).

## ⚙️ 1. Modificaciones en el Archivo `.gitignore`

Hemos agregado reglas explícitas al archivo `.gitignore` del proyecto para evitar el seguimiento de archivos de desarrollo local y binarios temporales:

```gitignore
# Desarrollo local y binarios temporales
cloudflared.exe
scratch/
```

---

## 🔍 2. Archivos e Históricos Excluidos (Obviados en Vercel)

Al incluir estas reglas, los siguientes directorios y archivos **nunca se subirán a GitHub ni se desplegarán en producción en Vercel**:

### 🚫 A. Ejecutables Pesados (`cloudflared.exe`)
* **Ubicación**: Carpeta raíz (`/cloudflared.exe`).
* **Peso**: ~54.1 MB.
* **Propósito**: Herramienta de túneles locales de Cloudflare para pruebas de red en PC.
* **Razón de exclusión**: No es necesaria para la web final y ralentiza considerablemente la velocidad de build de Vercel.

### 🚫 B. Historial de Pruebas y Respaldos (`scratch/`)
* **Ubicación**: Carpeta `/scratch/` en la raíz.
* **Propósito**: Directorio que contiene 22 scripts de prueba, utilidades de extracción y copias de seguridad de archivos HTML originales.
* **Archivos clave excluidos**:
  * `dashboard-data-original.html` (Respaldo original del script de gestión, 378KB).
  * `original-script-extracted.js` (Extracción del bloque JS original, 129KB).
  * Varios scripts de depuración local (`inspect_listeners.js`, `test_wells.js`, etc.).
* **Razón de exclusión**: Son archivos meramente informativos y herramientas del programador. Al no ser referenciados por ningún componente de la aplicación de producción, su subida generaría "ruido" en el despliegue y consumo innecesario de almacenamiento.

---

## 💡 3. Garantía de Seguridad de los Cambios

* **Persistencia Local**: Estos archivos **siguen estando en tu computadora local** en la misma ubicación. No los hemos borrado, por lo que tus respaldos de código no se perderán.
* **Integridad del Sitio**: Ningún módulo funcional de la SPA lee archivos dentro de `scratch/`. Por tanto, su exclusión en los despliegues de Vercel tiene **cero impacto operativo**.
