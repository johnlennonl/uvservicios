# 📋 Documentación de Implementación: Rol Gerencial (Management Profile)

Este documento detalla la estructura, permisos y flujos del nuevo **Rol Gerencial** (`gerencial`) en la plataforma de UV Servicios.

---

## 🎯 Objetivo de Negocio
Habilitar un acceso ejecutivo para que la Gerencia tenga una visibilidad de **Monitoreo Total** de toda la plataforma sin riesgo de alterar registros operativos, y a la vez brindarle la capacidad de administrar y organizar expedientes gerenciales (contratos, informes ejecutivos, presupuestos) directamente desde la sección "Gerencial" de la Base de Datos.

---

## 🔒 Estructura de Permisos y Control de Acceso

El perfil gerencial está mapeado de manera híbrida: **Lectura Total** en los módulos de operaciones y **Escritura Completa** en las carpetas gerenciales.

### Tabla de Matriz de Accesos por Rol:

| Módulo / Vista | 👷 Técnico | 👔 Supervisor | 📈 Gerencial (Nuevo) | 🔐 DBA |
| :--- | :---: | :---: | :---: | :---: |
| **Dashboard de Monitoreo** | ❌ | ✔️ | ✔️ | ❌ |
| **Estadísticas & Gráficas** | ❌ | ✔️ | ✔️ | ❌ |
| **Consolidado General** | ❌ | ✔️ | ✔️ | ❌ |
| **Base de Datos / Expedientes** | ❌ | ❌ | ✔️ (Solo Lectura) | ✔️ |
| **Sección \"Gerencial\" (DB)** | ❌ | ❌ | ✔️ (Lectura/Escritura) | ✔️ |
| **Jornadas en Vivo / Campo** | ❌ | ✔️ | ✔️ (Solo Lectura) | ❌ |
| **Módulo Reportes PULL** | ✔️ | ✔️ | ❌ | ❌ |

---

## 🚀 Flujo de Trabajo del Gerente (Paso a Paso)

1.  **Inicio de Sesión**:
    El gerente ingresa con su correo y contraseña corporativa en `index.html`.
2.  **Pantalla de Inicio (Landing Page)**:
    Es redirigido automáticamente al dashboard principal (`dashboard.html`), donde puede visualizar los estados de telemetría de todos los pozos activos, históricos de simulación y gráficos estadísticos.
3.  **Acceso a Base de Datos**:
    En la barra lateral izquierda del portal, hace clic en el link **Base de Datos**. Tras ingresar el PIN de seguridad de la plataforma (`4826`), accede a la pantalla de archivos.
4.  **Carga en Expediente Gerencial**:
    Dentro de `base-datos.html`, selecciona la opción **Gerencial** en el menú de la izquierda. Aquí podrá:
    *   Crear carpetas personalizadas (ej: "Presupuestos 2026", "Auditoría Petroquiriquire").
    *   Subir contratos, informes o minutas ejecutivas arrastrando y soltando archivos.
    *   Previsualizar y descargar documentos.
5.  **Retorno Fluido al Portal**:
    En la barra lateral de la base de datos, dispone del botón **\"Volver al Portal\"** (exclusivo para usuarios con acceso a telemetría). Al presionarlo, regresa de inmediato al portal principal sin cerrar sesión.

---

## 🛠️ Archivos del Proyecto Modificados

1.  **[`access-control.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/core/access-control.js)**:
    *   Se registró el rol `gerencial` en la enumeración `ACCESS_ROLES`.
    *   Se adaptó `getAccessProfile()` para asignar permisos globales de lectura y autorizar la carga de la vista `base-datos.html`.
    *   Se ajustó `applyNavigationAccessProfile()` para que exponga la base de datos a los gerentes sin deshabilitar los accesos de telemetría.
2.  **[`operational-scope-context.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/services/operational-scope-context.js)**:
    *   Se incluyó al rol `'gerencial'` en `canUseAllContracts()` para permitir la consulta ilimitada de todos los pozos.
3.  **[`base-datos.html`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/base-datos.html)**:
    *   Se insertó el botón de navegación `#sidebar-link-portal` (\"Volver al Portal\") al inicio del menú lateral, oculto por defecto mediante estilos inline.
4.  **[`database-controller.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/modules/database/database-controller.js)**:
    *   Se acopló la lógica de inicialización para mostrar el botón \"Volver al Portal\" solo si el rol del usuario cuenta con el permiso `canViewDashboard` (evitando su visualización a los perfiles de soporte de base de datos puro).
5.  **[`gestion-usuarios.html`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/gestion-usuarios.html) & [`js/gestion-usuarios.js`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/js/gestion-usuarios.js)**:
    *   Se añadió la opción **`Gerencial / Dirección`** en los selectores de rol de creación y edición.
    *   Se configuró una regla interactiva para **ocultar automáticamente** el selector **"Seleccionar contrato"** si el rol asignado tiene acceso global por defecto (`admin`, `supervisor`, `base_datos`, `gestor_usuarios`, `gerencial`), evitando confusiones de asignación de contratos fijos a directores o administradores.
6.  **[`css/gestion-usuarios-page.css`](file:///c:/Users/johnl/OneDrive/Escritorio/uvservicios/css/gestion-usuarios-page.css)**:
    *   Se añadió el estilo `.badge-gerencial` para el badge del rol con fondo azul celeste ejecutivo.

---

## 👤 Cómo Asignar este Rol a un Usuario

Existen dos alternativas para asignar el rol gerencial a tu jefe u otros directivos:

### Opción A: Desde la interfaz de Gestión de Usuarios (Recomendado)
1. Inicia sesión con una cuenta de rol **Administrador** (`admin`) o **Gestor de Accesos** (`gestor_usuarios`).
2. Ve a la pantalla de **Gestión de Usuarios** (`gestion-usuarios.html`).
3. En la tabla de usuarios registrados, haz clic en **Editar** sobre el usuario correspondiente (o haz clic en "Nuevo Usuario" para crearlo).
4. En el campo **Rol asignado / Rol y Permisos**, selecciona la nueva opción: **`Gerencial / Dirección`**.
5. Presiona **Guardar Cambios**. El rol se sincronizará automáticamente en base de datos.

### Opción B: Directo en Supabase (Fallback)
1. Ve al panel de control de tu proyecto en **Supabase**.
2. Accede a la pestaña **Table Editor** en la barra izquierda y abre la tabla `profiles`.
3. Ubica el registro correspondiente al correo de tu jefe.
4. En la columna `role` de su perfil, edita el valor y escribe exactamente: `gerencial` (en minúsculas).
5. Guarda los cambios. La próxima vez que inicie sesión, entrará con este perfil.

---

## 🗄️ Actualización de Seguridad en la Base de Datos (Supabase RLS)

Dado que Supabase utiliza Row Level Security (RLS) para proteger las tablas de pozos, jornadas y consolidaciones, es **indispensable** que la base de datos reconozca al rol `gerencial` como autorizado para leer los datos del workflow administrativo.

Ejecuta la siguiente consulta en el **SQL Editor** de tu consola de Supabase para aplicar esta actualización:

```sql
-- Actualizar la validación de roles con acceso de lectura/supervisión al monitoreo
create or replace function public.can_manage_monitoring()
returns boolean
language sql
stable
as $$
    select public.get_access_role() in ('admin', 'supervisor', 'gerencial');
$$;
```

*(Esta función otorga permisos de lectura al rol `gerencial` en los workflows y telemetrías protegidos, solucionando el aviso de "bandeja administrativa vacía" al cambiar de rol).*
