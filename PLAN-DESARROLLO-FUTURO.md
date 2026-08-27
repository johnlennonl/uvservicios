# PLAN DE DESARROLLO FUTURO - PLATAFORMA UV SERVICIOS
**Fecha de Planificación:** 26 de Agosto de 2026
**Objetivo:** Trazar la arquitectura, interfaz y requerimientos de base de datos para los nuevos módulos acordados en el flujo de gestión y análisis operativo.

---

## 1. MÓDULOS DE GESTIÓN Y ANÁLISIS A IMPLEMENTAR

### Módulo A: Simulaciones Operativas (Simulaciones)
* **Objetivo:** Permitir a los ingenieros y supervisores simular escenarios de producción y comportamiento del pozo antes de aplicar cambios en campo.
* **Componentes Visuales:**
  * Panel interactivo con sliders/campos para variables de entrada: frecuencia VSD proyectada, presiones estimadas (PIP, THP), y productividad del yacimiento (IP).
  * Gráficos comparativos en vivo (Curva de rendimiento de bomba real vs. simulada).
* **Base de Datos (Supabase):**
  * Crear tabla `public.simulations_history` para guardar y cargar escenarios simulados por pozo, permitiendo compartirlos entre usuarios.

### Módulo B: Análisis Avanzado de Parámetros Eléctricos
* **Objetivo:** Diagnosticar la salud de los variadores (VSD) y motores sumergibles (ESP/PCP).
* **Componentes Visuales:**
  * Gráfico de dispersión/correlación de Corriente vs. Frecuencia.
  * Análisis de desbalance de corrientes de fases (VSD A, B, C) con alertas automáticas si el desbalance supera el límite crítico (generalmente > 5%).
  * Históricos de temperatura del motor (TM) y su correlación con la frecuencia operativa para detectar sobrecalentamientos preventivos.

### Módulo C: Reporte General de Pozos
* **Objetivo:** Hoja de vida y ficha técnica unificada de cada pozo del contrato activo.
* **Componentes Visuales:**
  * Buscador rápido por pozo con tarjeta expandible.
  * Datos estáticos clave: profundidad, tipo de bomba (ESP/PCP/BEC), marca, potencia de motor, número de etapas, contrato asignado.
  * Historial de eventos relevantes (última intervención, cambio de equipo, fallas históricas).
* **Base de Datos (Supabase):**
  * Asegurar que la tabla de pozos/metadatos (`public.pozo_metadata` o similar) cuente con los campos técnicos para poblar esta ficha.

### Módulo D: Reporte de Programa de Arranque (Planificación)
* **Objetivo:** Diseñar y autorizar la rampa de arranque de un pozo (frecuencias iniciales, tiempos de estabilización y frecuencia destino).
* **Componentes Visuales:**
  * Formulario de creación de "Programa de Arranque" que genera una tabla de pasos de frecuencia.
  * Workflow de aprobación (Creado por Supervisor / Aprobado por Gerente).
  * Exportador en PDF firmado para enviar a campo.
* **Base de Datos (Supabase):**
  * Crear tabla `public.startup_programs` y `public.startup_program_steps` para registrar la rampa secuencial de frecuencias programadas.

### Módulo E: Reportes de Arranque y Monitoreo (Ejecución y Seguimiento)
* **Objetivo:** Registrar las variables de campo reales durante las primeras horas críticas tras el arranque de un pozo.
* **Componentes Visuales:**
  * Panel de registro rápido para operarios de campo (optimizada para móviles).
  * Tablas de seguimiento horario (cada 15 minutos / 1 hora durante el primer día): corriente, frecuencia, presiones, nivel dinámico, aporte de gas.
  * Gráfico automático de "Estabilización de Arranque".
* **Base de Datos (Supabase):**
  * Crear tabla `public.startup_monitoring_records` vinculada al ID del programa de arranque del Módulo D.

---

## 2. MEJORAS EN MÓDULO DE NIVEL Y ECHOMETER (Nivel Estático vs. Dinámico)

* **Objetivo:** Diferenciar el comportamiento y cálculo de las mediciones de nivel tomadas por Echometer.
* **Requerimientos Técnicos:**
  * **Campo en Formulario:** Añadir un selector interactivo tipo toggle o dropdown en el formulario de carga de niveles:
    * `Estático` (Nivel del pozo parado/sin producción).
    * `Dinámico` (Nivel del pozo activo en producción).
  * **Lógica de Cálculos:**
    * Si es **Dinámico**, el sistema utilizará el valor para calcular la **Sumergencia Operativa** y la **PIP Calculada** dinámicamente.
    * Si es **Estático**, el sistema lo registrará como nivel base/estático del yacimiento para análisis de declinación de presión estática, pero no alterará las métricas de monitoreo diario de la bomba activa.
  * **Visualización en Gráficos:**
    * En el gráfico de niveles de Estadísticas, graficar el Nivel Dinámico en una línea continua y el Nivel Estático como puntos de control independientes para evitar confusiones de lectura.

---

## 3. PRÓXIMOS PASOS (Plan de Acción sugerido)

1. **Fase 1 (Niveles):** Implementar el toggle Estático/Dinámico en el formulario de Echometer y actualizar los gráficos correspondientes en Estadísticas.
2. **Fase 2 (Fichas de Pozos):** Diseñar el Módulo C (Ficha técnica de pozos) que es el menos complejo y sirve de base para los demás.
3. **Fase 3 (Arranques):** Diseñar las tablas de programas de arranque (Módulos D y E) y configurar los formularios de ingreso.
4. **Fase 4 (Análisis Eléctrico & Simulador):** Implementar las herramientas de analítica gráfica y matemática compleja (Módulos A y B).
