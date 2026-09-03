# REGISTRO DE CAMBIOS Y DIAGNÓSTICO DE SISTEMA (UV SERVICIOS)
**Fecha:** 26 de Agosto de 2026
**Módulos Afectados:** Seguridad (PIN Operativo), Base de Datos, Gestión de Usuarios, Estadísticas (Reportes Gerenciales).

---

## 1. MÓDULO DE SEGURIDAD (PIN OPERATIVO INDIVIDUAL Y ENCRIPTADO)

Se eliminó la clave universal hardcodeada `4826` y se sustituyó por una arquitectura robusta, encriptada e individual para cada usuario en Supabase:

* **Encriptación en Base de Datos (Blowfish):** Se implementó la extensión `pgcrypto` en Supabase para encriptar los PINs mediante un hash lento y seguro de tipo Blowfish (`bf`). Los PINs nunca se almacenan ni viajan en texto plano.
* **Funciones RPC Seguras:**
  * `verify_my_pin(p_pin)`: Verifica de forma segura el PIN del usuario logueado usando su ID (`auth.uid()`).
  * `change_my_pin(p_old_pin, p_new_pin)`: Permite al usuario actualizar su propio PIN validando previamente su PIN actual.
  * `admin_reset_user_pin(p_target_user_id)`: Permite a administradores, DBA y gestores de accesos restablecer el PIN de un usuario a la contraseña por defecto (`0000`).
* **Integración en Login (`js/main.js`):** El inicio de sesión ahora desafía y valida el PIN de 4 dígitos consultando directamente el backend seguro de Supabase.
* **Autogestión desde "Mi Perfil" (`js/services/profile-service.js`):**
  * Se inyectó la sección para que los usuarios autorizados cambien su PIN operativo de manera autónoma.
  * **Filtro de Roles:** El botón de cambio de PIN solo es visible para roles que requieren PIN (`admin`, `supervisor`, `base_datos` y `seguridad`). Para `gerencial`, clientes y operadores de campo, esta sección se oculta automáticamente.
* **Restablecimiento Administrativo (`js/gestion-usuarios.js` & `gestion-usuarios.html`):**
  * Se agregó el botón "Restablecer PIN a 0000" en el panel de Gestión de Usuarios.
  * Se configuró para que este botón solo aparezca al editar usuarios con roles que efectivamente requieran PIN.

---

## 2. MEJORAS DE ACCESO EN "BASE DE DATOS" (`base-datos.html`)

* **Bloqueo en-sitio (Flat Overlay):** Se eliminó la redirección brusca hacia `index.html`. El bloqueo por PIN se realiza a través de un panel opaco integrado sobre la misma página.
* **Optimización de Velocidad (Sin Backdrop-Blur):** Se eliminaron las reglas de desenfoque por hardware (`backdrop-filter: blur`) que ponían lenta la GPU. Se reemplazaron por fondos oscuros semi-transparentes planos (`rgba(15, 23, 42, 0.97)`), eliminando el lag en celulares y computadoras antiguas.
* **Corrección de Cargador Infinito:** Se programó el controlador de la base de datos para ocultar el cargador (`premium-loader`) inmediatamente al iniciar el flujo de cambio obligatorio de PIN (cuando se detecta `0000`), evitando que el logo tapara la ventana de interacción.
* **Gestión de Redirecciones Seguras:** Si un usuario de `seguridad` o `base_datos` (quienes no tienen acceso al dashboard principal) cancela el modal de cambio de PIN, el sistema los desloguea automáticamente y los manda a `index.html` en lugar de enviarlos a una página restringida (eliminando bucles de redirección).
* **Navegación Enfocada (Ocultar "Volver al Portal"):** Para los roles de `base_datos` (BASEUV) y `seguridad` se ocultó el botón "Volver al Portal" del sidebar, ya que no poseen acceso al dashboard de inicio. Su menú lateral ahora muestra únicamente los expedientes técnicos autorizados y el botón de Cerrar Sesión.
* **Orden en Gestión (Filtro de Contratos):** Se configuró el rol de `seguridad` como un rol "global", por lo que al crearlo o editarlo en el panel de usuarios, el selector de "Contrato Operativo" se oculta automáticamente.

---

## 3. COMPORTAMIENTO STICKY DEL SIDEBAR (`stats.html`)

* Se solucionó el error donde la barra lateral izquierda (sidebar) se desplazaba hacia arriba al hacer scroll en la pestaña de estadísticas.
* **Causa:** La regla `overflow-x: hidden !important` aplicada a `html, body` rompía el contexto de adherencia (`position: sticky`) del navegador.
* **Solución:** Se retiró esa propiedad de `html, body` y se reubicó de manera segura dentro de la clase `.main-container`.

---

## 4. REDISEÑO PREMIUM DEL PANEL DE ESTADÍSTICAS (`stats.html` & `stats-custom-reports.js`)

Se rediseñó el panel de reportes personalizados para brindar una experiencia de usuario (UX) más profesional, interactiva y ágil:

* **Desplegable de Pozos en Checklist (Checklist Dropdown):**
  * Se eliminó el selector anterior basado en chips y campo de escritura libre.
  * Se implementó un botón desplegable premium con indicador dinámico de selección (ej: `"Seleccionar pozo(s)..."`, `"CEI0007, TOM0008"`, o `"5 pozos seleccionados"`).
  * Al hacer clic, despliega un menú flotante con casillas de verificación (checkboxes) y luces de estado (`RUN`/`OFF`) por pozo.
  * El menú permanece abierto mientras el usuario marca múltiples pozos consecutivamente. Incluye botones internos para "Seleccionar Todos" y "Limpiar".
  * Se removió el buscador secundario que duplicaba la interfaz.
* **Plantillas Rápidas (Presets Globales):**
  * Se añadieron botones rápidos en la cabecera de variables para configurar sets enteros de parámetros técnicos con un solo clic:
    * `📈 Presiones`: Activa al instante CHP, THP, LF y PIP (desmarcando el resto).
    * `⚡ Eléctrico/VSD`: Activa al instante Corriente, Frecuencia, VSD A, B, C y Temperatura TM.
    * `✨ Todo`: Selecciona las 13 variables del tirón.
    * `🗑️ Limpiar`: Desmarca todo para iniciar desde cero.
* **Prevenir Caché y Persistencia:**
  * Se implementó una sincronización forzada por JavaScript para garantizar que al abrir la pestaña por primera vez, todos los pozos y variables estén completamente desmarcados, bloqueando la memoria de autofill del navegador.
  * Se removieron los controles redundantes "Todos / Ninguno" de los encabezados de las tarjetas.

---

## 5. CONTROL DE CACHÉ DE ARCHIVOS (CACHE-BUSTING)

Para asegurar que todos los clientes de producción descarguen la última versión de la lógica inmediatamente sin tener que vaciar la caché de su navegador de forma manual, se incrementaron los identificadores de versión en las importaciones:

* `stats.html` -> Carga `js/estadisticas.js?v=20260826-2129`
* `router.js` -> Importa dinámicamente `estadisticas.js?v=20260826-2129`
* `estadisticas.js` -> Importa `stats-custom-reports.js?v=20260826-2129`
* `base-datos.html` -> Carga `database-controller.js?v=20260826-2101`

---
**El sistema se encuentra en un estado 100% verificado, seguro y óptimo para su despliegue inmediato.**
