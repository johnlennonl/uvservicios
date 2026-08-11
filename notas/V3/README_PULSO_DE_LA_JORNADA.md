# Bitácora Expandida — Pulso de la Jornada y Prevención de Duplicados

Este documento detalla el funcionamiento, la arquitectura y las eventualidades registradas por el sistema **Pulso de la Jornada**, diseñado para garantizar la trazabilidad de auditoría al 100% y erradicar la duplicidad de registros en la base de datos.

---

## ⚡ 1. ¿Qué Eventualidades se Capturan en el "Pulso de la Jornada"?

La línea de tiempo consolida eventos tanto de la bitácora física (`field_journey_review_log`) como de análisis dinámico del estado de los datos:

| Evento | Origen | Color del Nodo | Descripción |
| :--- | :--- | :--- | :--- |
| **RECEPCIÓN CAMPO** | Campo | 🔵 Azul | Transmisión inicial de la jornada desde el dispositivo móvil del operador. |
| **RECUPERADO** | Campo / Admin | 🟡 Ámbar | La jornada fue devuelta a Campo para edición (el técnico puede añadir/modificar pozos). |
| **RE-ENVIADO** | Campo | 🔵 Azul | Envío posterior de la jornada tras una recuperación. Registra el **Delta de Cambios** (ej. cuántos pozos se agregaron o eliminaron y cuáles fueron). |
| **ARCHIVO ADJUNTO** | Campo | 🟣 Morado | Registro en tiempo real cada vez que el técnico sube un ecómetro, sensor de fondo, volcado de VSD o foto de soporte, asociándolo al pozo correspondiente. |
| **SEPARACIÓN / FUSIÓN**| Admin | 🟣 Morado | Acciones administrativas para combinar jornadas o extraer pozos hacia una nueva jornada. |
| **APROBADO / PUBLICADO**| Admin | 🟢 Verde | Cierre de la jornada por supervisión y su publicación formal en el Dashboard histórico. |
| **RECHAZADO** | Admin | 🔴 Rojo | Devolución de la jornada por inconsistencias en los datos operativos. |
| **TRAZABILIDAD (Retro)**| Sistema | 🟡 Ámbar | Diagnósticos automáticos basados en discrepancias de técnicos asignados a pozos o registros nocturnos. |

---

## 🛡️ 2. Mecanismo de Prevención de Duplicados

Para evitar la duplicidad física en Supabase (cuando un técnico reenvía una jornada sin ID asignado en su caché local), implementamos una estrategia en dos capas:

1. **Capa Preventiva (Frontend Móvil)**:
   * Antes de ejecutar el envío, la aplicación móvil verifica en la base de datos si ya existe un registro activo (`submitted`, `under_review`, `rejected`) para la misma fecha, turno y técnico.
   * Si existe, se muestra una advertencia visual interactiva (SweetAlert2) informándole que los datos se fusionarán para evitar registros duplicados.
2. **Capa Defensiva (Servidor/Backend)**:
   * En `submitFieldJourneyWorkflow`, si la combinación de `journey_date`, `jornada` y `tecnico_1` ya existe bajo un estado activo en la tabla `field_journeys`, el backend reutiliza automáticamente el ID existente (`upsert` de seguridad) en lugar de insertar una fila duplicada.

---

## 🧠 3. Recomendaciones de Arquitectura (Senior Web Developer)

Para llevar esta herramienta al siguiente nivel de sofisticación y control, recomiendo implementar las siguientes mejoras en las próximas fases de desarrollo:

### A. Frontend (Interactividad y Experiencia de Usuario)
* **Filtros Dinámicos**: Añadir pequeños chips de filtrado en la cabecera del Pulso de la Jornada (ej. `[Todos]`, `[Archivos]`, `[Alertas]`, `[Estados]`) para que el supervisor pueda aislar rápidamente las acciones de subida de archivos o rechazos.
* **Resaltado Bidireccional (Interactivity Link)**:
  * Al hacer clic en un pozo dentro de la lista de un evento del Pulso de la Jornada (por ejemplo, en el pill de un pozo al que se le subió un archivo), la pantalla debería desplazarse suavemente (*scroll*) y resaltar con un destello amarillo la tarjeta del pozo en la sección de parámetros operativos.
* **Descarga Inmediata desde la Bitácora**: Que el pill del archivo adjunto en la bitácora sea un botón de descarga directa para no tener que buscarlo en la barra lateral de soportes.

### B. Backend (Presencia y Auditoría Avanzada)
* **Auditoría de Presencia en Tiempo Real**: Registrar cuándo un supervisor o administrador abre por primera vez la jornada para revisarla (ej. `"Supervisor [EMAIL] comenzó la revisión de la jornada"`). Esto evita conflictos si dos personas revisan la misma jornada a la vez.
* **Webhooks / Notificaciones Push**: Integrar disparadores para que eventos clave del Pulso (como un reenvío con delta o un rechazo) envíen una alerta inmediata a canales corporativos de mensería (Telegram/Slack) o por correo electrónico.
