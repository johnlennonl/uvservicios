import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import {
    getLatestMonitoringRecords,
    getLatestMonitoringSnapshot,
    getLatestTechnicalSnapshot,
    getMonitoringAlertSummary,
    getOperationalAlertSignals,
    getPozosHistorySummary,
    getWellBESProfile,
    getWellTechnicalData,
    getRecentWellBESProfiles
} from './data-service.js';

const SEARCH_SELECTOR = '[data-help-card]';
const ASSISTANT_TYPING_DELAY = 14;
const ASSISTANT_NAME_KEY = 'uvito-session-name';
const ASSISTANT_THEME_KEY = 'uvito-session-theme';
const ASSISTANT_THREAD_KEY = 'uvito-session-thread-v1';
const HELP_ONBOARDING_KEY = 'uvito-help-onboarding-v2';
const ASSISTANT_LABEL = 'UVITO';
const LIVE_ASSISTANT_CACHE_TTL_MS = 60 * 1000;
const ASSISTANT_THEME_OPTIONS = ['teal', 'blue', 'red'];
let currentAccessProfile = null;
let currentAssistantContext = {
    id: 'general',
    label: 'General',
    description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
};
let liveAssistantCache = {
    loadedAt: 0,
    snapshot: null,
    historySummary: null,
    technicalSnapshot: null,
    besProfiles: null,
    alertSummary: null
};

const ASSISTANT_KNOWLEDGE_ENTRIES = [
    {
        type: 'module',
        title: 'Dashboard',
        sourceId: 'dashboard',
        keywords: 'dashboard pozo grafica tendencias historico sensores corriente temperatura produccion reporte tecnico',
        summary: 'Sirve para analizar el comportamiento de un pozo con su último monitoreo o con registros históricos, comparando variables operativas, sensores y producción visible.',
        steps: [
            'Abre Dashboard y selecciona el pozo que quieres revisar.',
            'Usa el selector histórico si quieres validar una fecha y hora específicas.',
            'Revisa tendencia de temperatura motor, corriente motor, frecuencia y presiones.',
            'Activa el modo reporte cuando necesites resumir el análisis técnico.'
        ],
        quickChecks: [
            'Es la mejor vista para diagnóstico rápido por pozo.',
            'Combina snapshot actual, histórico y referencia técnica.',
            'Desde aquí puedes validar OFF, sensores y producción visible.'
        ],
        action: { href: 'dashboard.html', label: 'Abrir Dashboard' }
    },
    {
        type: 'module',
        title: 'Gestión',
        sourceId: 'gestion',
        keywords: 'gestion importar excel carga manual corregir datos deduplicar registros monitoreo tecnico preview actualizar nuevos sin cambios duplicados',
        summary: 'Sirve para importar archivos, cargar mediciones manuales y corregir registros operativos o técnicos dentro del sistema, con preview operativo antes de guardar.',
        steps: [
            'Entra a Gestión cuando vayas a importar o corregir información.',
            'Carga el Excel limpio o usa el formulario manual para registros puntuales.',
            'En el preview operativo elige si vas a solo insertar nuevos, insertar y actualizar, o solo previsualizar sin guardar.',
            'Luego valida el resultado en Dashboard, Data o Estadísticas.'
        ],
        quickChecks: [
            'Es el módulo de mantenimiento de datos.',
            'No es la vista ideal para análisis operativo.',
            'El preview ahora separa nuevos, actualizaciones, sin cambios y duplicados del archivo.',
            'Te ayuda a evitar duplicados y errores de captura.'
        ],
        action: { href: 'dashboard-data.html', label: 'Abrir Gestión' }
    },
    {
        type: 'module',
        title: 'Data',
        sourceId: 'data',
        keywords: 'data historial ticket diario fecha auditoria registros pozo consulta detalle',
        summary: 'Sirve para auditar registros, revisar historial por pozo y consultar tickets diarios o fechas específicas sin pasar por el análisis gráfico.',
        steps: [
            'Abre Data cuando necesites validar si un registro existe.',
            'Busca por fecha, pozo o criterio operativo.',
            'Usa esta vista para auditoría y revisión de detalle tabular.',
            'Si detectas faltantes, corrige el dato desde Gestión.'
        ],
        quickChecks: [
            'Es la vista más directa para historial tabular.',
            'Sirve para revisar registros puntuales y exportables.',
            'Complementa a Dashboard y Estadísticas.'
        ],
        action: { href: 'data.html', label: 'Abrir Data' }
    },
    {
        type: 'module',
        title: 'Estadísticas',
        sourceId: 'estadisticas',
        keywords: 'estadisticas cobertura pozos off sin monitoreo alertas seguimiento top pozos rango fechas actividad',
        summary: 'Sirve para consolidar monitoreos por rango, ver pozos OFF, medir cobertura, detectar pozos sin actividad y priorizar seguimiento administrativo.',
        steps: [
            'Selecciona fecha inicio, fecha fin y pozos opcionales.',
            'Genera el rango para construir KPIs, top de pozos y monitoreos por día.',
            'Revisa cobertura, pozos OFF y alertas de seguimiento.',
            'Usa el drilldown para abrir el detalle operativo del bloque que te llamó la atención.'
        ],
        quickChecks: [
            'Es la vista ideal para saber cómo estuvo la operación en un período.',
            'Desde aquí salen pozos OFF, cobertura y rezagos.',
            'Complementa la consulta en vivo de UVITO con contexto administrativo.'
        ],
        action: { href: 'stats.html', label: 'Abrir Estadísticas' }
    },
    {
        type: 'module',
        title: 'Notificaciones',
        sourceId: 'notificaciones',
        keywords: 'notificaciones actividad cambios importaciones mediciones bes monitoreo reciente trazabilidad',
        summary: 'Sirve para revisar la actividad reciente del sistema: monitoreos del dia, mediciones tecnicas, actualizaciones BES y detalle agrupado por pozo.',
        steps: [
            'Abre Notificaciones para revisar primero el resumen del dia.',
            'Entra al bloque de monitoreo para ver los pozos agrupados.',
            'Haz clic en un pozo si necesitas abrir el detalle completo del registro.',
            'Usa los paneles tecnico y BES para confirmar que cambios recientes quedaron documentados.'
        ],
        quickChecks: [
            'El detalle por pozo muestra variables operativas completas del monitoreo del dia.',
            'Las actualizaciones dependen de la trazabilidad real guardada en la base.',
            'Es la vista mas rapida para confirmar actividad reciente antes de escalar una duda.'
        ],
        action: { href: 'notificacion.html', label: 'Abrir Notificaciones' }
    },
    {
        type: 'module',
        title: 'Jornada',
        sourceId: 'jornada',
        keywords: 'jornada turno campo cuadrilla panel diario locacion resumen operativo',
        summary: 'Es el flujo diario del equipo de campo para capturar pozos y enviar la carga operativa sin entrar al stack administrativo.',
        steps: [
            'Entra directamente a Captura y Envio para registrar los pozos del turno.',
            'Agrega cada pozo a la carga antes de enviarla a revision.',
            'Usa el historial si quieres revisar lo que la cuadrilla ya reporto.',
            'Mantente en este flujo si tu rol es Campo y no necesitas analisis administrativo.'
        ],
        quickChecks: [
            'Captura y Envio es la vista operativa principal del rol Campo.',
            'Esta pensada para rol Campo.',
            'Te evita pasar por Dashboard o Gestion para tareas de turno.'
        ],
        action: { href: 'field.html', label: 'Abrir Captura y Envio' }
    },
    {
        type: 'module',
        title: 'Historial de Jornada',
        sourceId: 'jornada-historial',
        keywords: 'historial jornada campo busqueda reportes enviados cuadrilla seguimiento operativo',
        summary: 'Sirve para consultar rapidamente lo que la cuadrilla ya envio durante la jornada, con filtros por fecha, locacion, equipo o pozo.',
        steps: [
            'Abre Historial de Jornada cuando necesites revisar lo ya reportado por Campo.',
            'Busca por fecha, jornada, locacion, equipo o pozo.',
            'Revisa la ultima actualizacion del registro para confirmar si el reporte ya fue enviado.',
            'Si falta informacion, vuelve a Captura y Envio para completar el reporte.'
        ],
        quickChecks: [
            'No reemplaza el historial tecnico global de Data.',
            'Su foco es seguimiento operativo de Campo.',
            'Es ideal para saber que ya salio durante el turno.'
        ],
        action: { href: 'jornada-history.html', label: 'Abrir Historial de Jornada' }
    },
    {
        type: 'module',
        title: 'Captura y Envio',
        sourceId: 'captura-envio',
        keywords: 'captura envio whatsapp mensaje operativo formulario campo pozo jornada reporte',
        summary: 'Es la vista de Campo para registrar un pozo, armar el mensaje operativo y dejarlo listo para compartir por WhatsApp.',
        steps: [
            'Completa equipo de guardia, locacion, fecha, hora y pozo.',
            'Llena las variables operativas y el comentario del monitoreo.',
            'Agrega el pozo a la jornada para armar el mensaje automaticamente.',
            'Copia, comparte o exporta el resultado cuando el reporte quede validado.'
        ],
        quickChecks: [
            'Esta pantalla evita usar Excel manual o Dashboard para capturar reportes de campo.',
            'El foco es compartir y exportar rapidamente.',
            'Es la ruta principal cuando el operador solo necesita reportar la jornada.'
        ],
        action: { href: 'field.html', label: 'Abrir Captura y Envio' }
    },
    {
        type: 'module',
        title: 'Centro de Ayuda',
        sourceId: 'ayuda',
        keywords: 'ayuda uvito guias pasos faq bloques buscar modulo',
        summary: 'Aqui UVITO encuentra rutas de trabajo, preguntas frecuentes y bloques por modulo para orientar al usuario segun su contexto.',
        steps: [
            'Busca una palabra clave o formula la duda como si hablaras con soporte.',
            'Revisa la respuesta tipeada y usa Ir al bloque cuando quieras el detalle.',
            'Filtra por inicio rapido, modulos o preguntas frecuentes si quieres acotar la ayuda.',
            'Usa este centro cuando necesites entender el flujo antes de ejecutar la tarea.'
        ],
        quickChecks: [
            'UVITO puede responder dudas conversacionales y tambien guiar por pasos.',
            'La ayuda prioriza el modulo visible en pantalla.',
            'Sirve como capa de orientacion sin interferir con botones operativos.'
        ],
        action: { href: 'help.html', label: 'Seguir en Ayuda' }
    }
];

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeCompactText(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, '');
}

function getRoleLabel(profile) {
    if (profile?.isFieldOperator) return 'Perfil activo: Campo';
    if (profile?.canViewManagement && !profile?.isReadOnly) return 'Perfil activo: Administración y supervisión';
    if (profile?.isReadOnly) return 'Perfil activo: Consulta';
    return 'Perfil activo';
}

function toggleManagementVisibility(accessProfile) {
    const canViewManagement = Boolean(accessProfile?.canViewManagement);

    document.querySelectorAll('[data-management-only]').forEach(element => {
        element.classList.toggle('is-help-hidden', !canViewManagement);
    });

    document.querySelectorAll('[data-management-link]').forEach(element => {
        element.classList.toggle('is-disabled-nav', !canViewManagement);
        if (!canViewManagement) {
            element.setAttribute('aria-disabled', 'true');
            element.setAttribute('tabindex', '-1');
        }
    });
}

function applyFilters() {
    const query = normalizeText(document.getElementById('help-search-input')?.value);
    const activeChip = document.querySelector('.help-filter-chip.active');
    const category = activeChip?.dataset.filter || 'inicio';
    const cards = Array.from(document.querySelectorAll(SEARCH_SELECTOR));

    let visibleCount = 0;

    cards.forEach(card => {
        if (card.classList.contains('is-help-hidden')) {
            return;
        }

        const keywords = normalizeText(card.dataset.keywords);
        const text = normalizeText(card.textContent);
        const matchesQuery = !query || text.includes(query) || keywords.includes(query);
        const matchesCategory = category === 'all' || card.dataset.category === category;
        const isVisible = matchesQuery && matchesCategory;

        card.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
    });

    const emptyState = document.getElementById('help-empty-state');
    if (emptyState) {
        emptyState.hidden = visibleCount > 0;
    }

    updateAssistantContextFromViewport();
}

function bindToolbar() {
    const searchInput = document.getElementById('help-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    document.querySelectorAll('.help-filter-chip').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.help-filter-chip').forEach(chip => chip.classList.remove('active'));
            button.classList.add('active');
            applyFilters();
        });
    });

    document.querySelectorAll('.help-summary-card').forEach(card => {
        card.addEventListener('click', event => {
            const link = card.querySelector('a[href]');
            if (!link) return;
            if (event.target instanceof Element && event.target.closest('a')) return;
            link.click();
        });
    });
}

function sanitizeAssistantName(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
}

function getAssistantUserName() {
    return sanitizeAssistantName(sessionStorage.getItem(ASSISTANT_NAME_KEY) || '');
}

function getAssistantTheme() {
    const storedTheme = String(sessionStorage.getItem(ASSISTANT_THEME_KEY) || 'teal').trim().toLowerCase();
    return ASSISTANT_THEME_OPTIONS.includes(storedTheme) ? storedTheme : 'teal';
}

function setAssistantUserName(value) {
    const normalized = sanitizeAssistantName(value);
    if (!normalized) {
        sessionStorage.removeItem(ASSISTANT_NAME_KEY);
        return '';
    }
    sessionStorage.setItem(ASSISTANT_NAME_KEY, normalized);
    return normalized;
}

function setAssistantTheme(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const theme = ASSISTANT_THEME_OPTIONS.includes(normalized) ? normalized : 'teal';
    sessionStorage.setItem(ASSISTANT_THEME_KEY, theme);
    return theme;
}

function applyAssistantTheme(theme = getAssistantTheme()) {
    document.body.dataset.uvitoTheme = theme;
}

function getAssistantGreetingName() {
    const userName = getAssistantUserName();
    return userName || 'equipo';
}

function includesAny(query, phrases) {
    return phrases.some(phrase => query.includes(phrase));
}

function formatAssistantNumber(value) {
    return new Intl.NumberFormat('es-CO').format(Number(value) || 0);
}

function formatAssistantDate(value) {
    if (!value) return '--';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('es-CO');
}

function formatAssistantHour(value) {
    return String(value || '--').slice(0, 5) || '--';
}

function formatPozoList(pozos = [], limit = 8) {
    const names = pozos.filter(Boolean).slice(0, limit);
    if (!names.length) {
        return '⚠ No se encontraron registros disponibles actualmente.';
    }

    const suffix = pozos.length > limit
        ? `\n- y ${pozos.length - limit} pozo(s) más`
        : '';

    return names.map(name => `- ${name}`).join('\n') + suffix;
}

function getAssistantReportRoute() {
    return currentAccessProfile?.canViewManagement ? 'stats.html' : 'data.html';
}

function getAssistantOperationsRoute() {
    return currentAccessProfile?.canViewManagement ? 'stats.html' : 'data.html';
}

function getAssistantOperationalKeywords() {
    return [
        'pozo',
        'pozos',
        'operativo',
        'operativos',
        'run',
        'off',
        'detenido',
        'detenidos',
        'apagado',
        'alarm',
        'alarma',
        'alarmas',
        'alerta',
        'alertas',
        'sin registros',
        'produccion',
        'bbpd',
        'bnpd',
        'ays',
        'temperatura',
        'tm',
        'amperaje',
        'corriente',
        'sensor',
        'sensores',
        'historial',
        'falla',
        'fallas',
        'evento',
        'eventos',
        'mantenimiento',
        'exportar',
        'reporte'
    ];
}

function isOperationalAssistantQuery(rawQuery) {
    const query = normalizeText(rawQuery);
    return getAssistantOperationalKeywords().some(keyword => query.includes(keyword));
}

function getSnapshotStatusCounts(snapshot = []) {
    return snapshot.reduce((accumulator, record) => {
        const status = record?.normalized_estatus || 'UNKNOWN';
        accumulator[status] = (accumulator[status] || 0) + 1;
        return accumulator;
    }, {});
}

function findPozoNameInQuery(rawQuery, pozoNames = []) {
    const compactQuery = normalizeCompactText(rawQuery);
    if (!compactQuery) return null;

    const sortedPozos = [...pozoNames]
        .filter(Boolean)
        .sort((left, right) => String(right).length - String(left).length);

    const directMatch = sortedPozos.find(pozoName => compactQuery.includes(normalizeCompactText(pozoName)));
    if (directMatch) return directMatch;

    const explicitPozoMatch = String(rawQuery || '').match(/pozo\s+([a-z0-9-]+)/i);
    if (!explicitPozoMatch) return null;

    const explicitToken = normalizeCompactText(explicitPozoMatch[1]);
    return sortedPozos.find(pozoName => normalizeCompactText(pozoName) === explicitToken) || null;
}

async function getAssistantOperationalData({ includeAlertSummary = false } = {}) {
    const now = Date.now();
    const cacheIsFresh = now - liveAssistantCache.loadedAt < LIVE_ASSISTANT_CACHE_TTL_MS;

    if (!cacheIsFresh || !liveAssistantCache.snapshot || !liveAssistantCache.historySummary || !liveAssistantCache.technicalSnapshot || !liveAssistantCache.besProfiles) {
        const [snapshot, historySummary, technicalSnapshot, besProfiles] = await Promise.all([
            getLatestMonitoringSnapshot(),
            getPozosHistorySummary(),
            getLatestTechnicalSnapshot().catch(() => []),
            getRecentWellBESProfiles(300).catch(() => [])
        ]);

        liveAssistantCache = {
            loadedAt: now,
            snapshot,
            historySummary,
            technicalSnapshot,
            besProfiles,
            alertSummary: cacheIsFresh ? liveAssistantCache.alertSummary : null
        };
    }

    if (includeAlertSummary && !liveAssistantCache.alertSummary) {
        liveAssistantCache.alertSummary = await getMonitoringAlertSummary(7).catch(() => []);
    }

    return liveAssistantCache;
}

function buildOperationalOverviewResponse(snapshot = [], historySummary = [], technicalSnapshot = []) {
    const counts = getSnapshotStatusCounts(snapshot);
    const noRecords = historySummary.filter(item => !item.has_records);
    const alertPozos = snapshot.filter(record => getOperationalAlertSignals(record).length > 0);
    const totalProduction = technicalSnapshot.reduce((sum, row) => sum + (Number(row?.bbpd) || 0), 0);

    return `📊 Consultando sistema...\n\nResumen operativo actual:\n- Pozos operativos: ${formatAssistantNumber(counts.RUN || 0)}\n- Pozos OFF o detenidos: ${formatAssistantNumber(counts.OFF || 0)}\n- Pozos sin registros: ${formatAssistantNumber(noRecords.length)}\n- Pozos con alertas visibles: ${formatAssistantNumber(alertPozos.length)}\n- Producción BBPD consolidada: ${formatAssistantNumber(totalProduction)}`;
}

function buildPozoOperationalSnapshot(record, technicalRecord) {
    if (!record && !technicalRecord) {
        return '⚠ No se encontraron registros disponibles actualmente.';
    }

    const statusLabel = record?.normalized_estatus || record?.estatus || 'Sin estatus visible';
    const productionLine = technicalRecord
        ? `- Producción: POT ${formatAssistantNumber(technicalRecord.potencial)} · BBPD ${formatAssistantNumber(technicalRecord.bbpd)} · BNPD ${formatAssistantNumber(technicalRecord.bnpd)} · AYS ${formatAssistantNumber(technicalRecord.ays_percentage)}%`
        : '- Producción: sin snapshot técnico visible';

    return `🔎 Consultando sistema...\n\nEstado actual del pozo ${record?.pozo_name || technicalRecord?.pozo_name}:\n- Estatus: ${statusLabel}\n- Último monitoreo: ${formatAssistantDate(record?.fecha)} ${formatAssistantHour(record?.hora)}\n- Frecuencia: ${record?.frecuencia ?? '--'}\n- Corriente motor: ${record?.corriente_motor ?? '--'}\n- Temperatura motor: ${record?.tm ?? '--'}\n${productionLine}`;
}

function buildPozoBESProfileResponse(pozoName, profile) {
    if (!profile) {
        return `⚠ Consultando ficha BES...

No se encontró ficha BES configurada para ${pozoName}. Puedes registrarla desde Gestión > Gestión de Pozos.`;
    }

    const cleanBESValue = value => {
        const normalized = String(value ?? '').trim();
        return normalized && !/^(0+|--|n\/a|na|s\/n|sin dato|sin datos)$/i.test(normalized) ? normalized : '';
    };
    const joinBESValues = values => values.map(cleanBESValue).filter(Boolean).join(' · ');
    const pumpLine = joinBESValues([profile.pump_manufacturer, profile.pump_model, profile.multiphase_pump]) || cleanBESValue(profile.pump_type) || '--';
    const motorLine = cleanBESValue(profile.motor_model) || '--';
    const electricalLine = joinBESValues([profile.motor_voltage, profile.motor_current]) || '--';

    return `🔧 Consultando ficha BES...

Ficha BES de ${pozoName}:
- Bomba: ${pumpLine}
- Serial bomba: ${cleanBESValue(profile.pump_serial) || '--'}
- Succión (ft): ${cleanBESValue(profile.suction_ft) || '--'}
- Bomba multifásica: ${cleanBESValue(profile.multiphase_pump) || '--'}
- Separador de gas: ${cleanBESValue(profile.gas_separator) || '--'}
- Sellos: ${cleanBESValue(profile.seal_section) || '--'}
- Motor: ${motorLine}
- Voltaje/corriente motor: ${electricalLine}
- Sensor: ${cleanBESValue(profile.sensor_model) || '--'}
- Drain Valve: ${cleanBESValue(profile.drain_valve) || '--'}
- Instalación: ${cleanBESValue(profile.installed_at) || '--'}
- Notas: ${cleanBESValue(profile.profile_notes) || '--'}`;
}

async function buildOperationalAssistantResponse(rawQuery) {
    const query = normalizeText(rawQuery);
    if (!isOperationalAssistantQuery(query)) {
        return null;
    }

    if (includesAny(query, ['generar reporte', 'genera reporte', 'reporte diario', 'reporte semanal', 'reporte de alarmas', 'reporte de produccion', 'exportar datos', 'exportacion de datos'])) {
        return {
            text: '📄 Procesando información operativa...\n\nSeleccione:\n1. Reporte diario\n2. Reporte semanal\n3. Alarmas\n4. Producción',
            action: { href: getAssistantReportRoute(), label: 'Abrir módulo de reportes' }
        };
    }

    const wantsAlerts = includesAny(query, ['alarma', 'alarmas', 'alerta', 'alertas', 'falla', 'fallas', 'trip', 'evento']);
    const { snapshot, historySummary, technicalSnapshot, besProfiles, alertSummary } = await getAssistantOperationalData({ includeAlertSummary: wantsAlerts });
    const pozoNames = [...new Set([
        ...snapshot.map(item => item?.pozo_name),
        ...historySummary.map(item => item?.pozo_name),
        ...technicalSnapshot.map(item => item?.pozo_name),
        ...(besProfiles || []).map(item => item?.pozo_name)
    ].filter(Boolean))];
    const pozoName = findPozoNameInQuery(rawQuery, pozoNames);
    const statusCounts = getSnapshotStatusCounts(snapshot);
    const noRecordPozos = historySummary.filter(item => !item.has_records).map(item => item.pozo_name);
    const currentAlertPozos = snapshot.filter(record => getOperationalAlertSignals(record).length > 0);

    if (includesAny(query, ['resumen', 'estado general', 'como estan los pozos', 'panel operativo'])) {
        return { text: buildOperationalOverviewResponse(snapshot, historySummary, technicalSnapshot) };
    }

    if (!pozoName && includesAny(query, ['operativo', 'operativos', 'run'])) {
        return {
            text: `✅ Consultando sistema...\n\nActualmente hay ${formatAssistantNumber(statusCounts.RUN || 0)} pozos operativos.`
        };
    }

    if (!pozoName && includesAny(query, ['off', 'detenido', 'detenidos', 'apagado', 'apagados', 'parado', 'parados'])) {
        const offPozos = snapshot.filter(record => record?.normalized_estatus === 'OFF').map(record => record.pozo_name);
        return {
            text: `📊 Consultando sistema...\n\nActualmente hay ${formatAssistantNumber(offPozos.length)} pozos en estado OFF.\n${formatPozoList(offPozos)}`,
            action: offPozos.length ? { href: getAssistantOperationsRoute(), label: currentAccessProfile?.canViewManagement ? 'Abrir Estadísticas' : 'Revisar historial en Data' } : null
        };
    }

    if (!pozoName && includesAny(query, ['sin registros', 'no tienen registros', 'sin data', 'sin monitoreo'])) {
        return {
            text: `⚠ Verificando registros...\n\nSe detectaron ${formatAssistantNumber(noRecordPozos.length)} pozos sin registros recientes.\n${formatPozoList(noRecordPozos)}`,
            action: noRecordPozos.length ? { href: getAssistantOperationsRoute(), label: currentAccessProfile?.canViewManagement ? 'Abrir Estadísticas' : 'Abrir Data' } : null
        };
    }

    if (!pozoName && includesAny(query, ['alarma', 'alarmas', 'alerta', 'alertas'])) {
        const pozoNamesWithAlerts = currentAlertPozos.map(record => record.pozo_name);
        return {
            text: `🚨 Analizando datos...\n\nPozos con alertas visibles en el último monitoreo:\n${formatPozoList(pozoNamesWithAlerts)}`,
            action: pozoNamesWithAlerts.length ? { href: 'notificacion.html', label: 'Abrir Notificaciones' } : null
        };
    }

    if (!pozoName && includesAny(query, ['mas fallas', 'más fallas', 'mas eventos', 'más eventos'])) {
        const top = (alertSummary || [])[0];
        if (!top) {
            return {
                text: '⚠ Analizando datos...\n\nNo se encontraron eventos de alerta visibles en la ventana analizada actualmente.'
            };
        }

        return {
            text: `📈 Analizando historial...\n\nEl pozo ${top.pozo_name} presenta la mayor cantidad de eventos visibles en los últimos 7 días, con ${formatAssistantNumber(top.count)} registro(s) asociados a ${top.signals.join(', ')}.`
        };
    }

    if (!pozoName && includesAny(query, ['produccion', 'producción', 'bbpd', 'bnpd'])) {
        const totalProduction = technicalSnapshot.reduce((sum, row) => sum + (Number(row?.bbpd) || 0), 0);
        const topProduction = [...technicalSnapshot]
            .sort((left, right) => (Number(right?.bbpd) || 0) - (Number(left?.bbpd) || 0))
            .slice(0, 5)
            .map(row => `${row.pozo_name}: ${formatAssistantNumber(row.bbpd)} BBPD`);

        return {
            text: `🛢 Procesando información operativa...\n\nProducción consolidada visible: ${formatAssistantNumber(totalProduction)} BBPD.\nTop de producción actual:\n${formatPozoList(topProduction, 5)}`
        };
    }

    if (pozoName) {
        const monitoringRecord = snapshot.find(item => item.pozo_name === pozoName) || null;
        const technicalRecord = technicalSnapshot.find(item => item.pozo_name === pozoName)
            || await getWellTechnicalData(pozoName).catch(() => null);

        if (includesAny(query, ['bes', 'bomba', 'fabricante', 'modelo', 'serial', 'motor', 'sensor', 'cable', 'equipo instalado', 'ficha'])) {
            const profile = (besProfiles || []).find(item => item.pozo_name === pozoName)
                || await getWellBESProfile(pozoName).catch(() => null);
            return {
                text: buildPozoBESProfileResponse(pozoName, profile),
                action: { href: 'data.html', label: 'Abrir Data' }
            };
        }

        if (includesAny(query, ['temperatura', 'tm', 'amperaje', 'corriente', 'sensor', 'sensores'])) {
            if (!monitoringRecord) {
                return { text: '⚠ No se encontraron registros disponibles actualmente.' };
            }

            return {
                text: `🧪 Verificando registros...\n\nÚltimas variables visibles para ${pozoName}:\n- Corriente motor: ${monitoringRecord.corriente_motor ?? '--'}\n- Temperatura motor: ${monitoringRecord.tm ?? '--'}\n- Frecuencia: ${monitoringRecord.frecuencia ?? '--'}\n- PIP: ${monitoringRecord.pip ?? '--'}\n- Presiones THP/CHP/LF: ${monitoringRecord.presion_thp ?? '--'} / ${monitoringRecord.presion_chp ?? '--'} / ${monitoringRecord.presion_lf ?? '--'}`,
                action: { href: 'dashboard.html', label: 'Abrir Dashboard' }
            };
        }

        if (includesAny(query, ['produccion', 'producción', 'bbpd', 'bnpd', 'ays'])) {
            if (!technicalRecord) {
                return { text: `⚠ Verificando registros...\n\nNo se encontró snapshot técnico visible para ${pozoName} actualmente.` };
            }

            return {
                text: `🛢 Consultando sistema...\n\nProducción visible para ${pozoName}:\n- Fecha técnica: ${formatAssistantDate(technicalRecord.fecha)}\n- Potencial: ${formatAssistantNumber(technicalRecord.potencial)}\n- BBPD: ${formatAssistantNumber(technicalRecord.bbpd)}\n- BNPD: ${formatAssistantNumber(technicalRecord.bnpd)}\n- AYS: ${formatAssistantNumber(technicalRecord.ays_percentage)}%\n- CAT: ${formatAssistantNumber(technicalRecord.cat_number)}`,
                action: { href: 'dashboard.html', label: 'Abrir Dashboard' }
            };
        }

        if (includesAny(query, ['historial', 'fallas', 'eventos', 'ultimos registros', 'últimos registros'])) {
            const latestRecords = await getLatestMonitoringRecords(pozoName, 5).catch(() => []);
            if (!latestRecords.length) {
                return { text: `⚠ Verificando registros...\n\nNo se encontraron registros recientes para ${pozoName}.` };
            }

            const historyLines = latestRecords.map(record => {
                const signals = getOperationalAlertSignals(record);
                const signalText = signals.length ? ` · Señales: ${signals.join(', ')}` : '';
                return `- ${formatAssistantDate(record.fecha)} ${formatAssistantHour(record.hora)} · ${record.estatus || 'Sin estatus'}${signalText}`;
            });

            return {
                text: `📚 Analizando datos...\n\nÚltimos registros visibles para ${pozoName}:\n${historyLines.join('\n')}`,
                action: { href: 'data.html', label: 'Abrir Data' }
            };
        }

        const alertSignals = monitoringRecord ? getOperationalAlertSignals(monitoringRecord) : [];
        const alertLine = alertSignals.length
            ? `\n- Alertas visibles: ${alertSignals.join(', ')}`
            : '\n- Alertas visibles: sin señales explícitas en el último monitoreo';

        return {
            text: `${buildPozoOperationalSnapshot(monitoringRecord, technicalRecord)}${alertLine}`,
            action: { href: 'dashboard.html', label: 'Abrir Dashboard' }
        };
    }

    return {
        text: buildOperationalOverviewResponse(snapshot, historySummary, technicalSnapshot)
    };
}

function getAssistantKnowledgeEntries() {
    return ASSISTANT_KNOWLEDGE_ENTRIES.map(entry => ({
        ...entry,
        anchor: entry.action?.href || null,
        keywords: normalizeText(entry.keywords),
        text: normalizeText(`${entry.title} ${entry.summary} ${(entry.steps || []).join(' ')} ${(entry.quickChecks || []).join(' ')}`)
    }));
}

function getAssistantDirectResponse(rawQuery) {
    const query = normalizeText(rawQuery);
    const greetingName = getAssistantGreetingName();

    if (!query) return null;

    if (includesAny(query, ['hola como estas', 'como estas', 'que tal', 'como te va'])) {
        return {
            text: `${greetingName}, estoy listo para orientarte dentro de UV Servicios. Soy fuerte en rutas de trabajo, pasos por modulo, dudas rapidas y ubicacion de funciones dentro de la app.`
        };
    }

    if (includesAny(query, ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'saludos'])) {
        return {
            text: `Hola, ${greetingName}. Puedo decirte que hace cada modulo, que pasos seguir y donde resolver una tarea dentro de la app.`
        };
    }

    if (includesAny(query, ['en que eres bueno', 'para que sirves', 'que puedes hacer', 'que sabes hacer', 'quien eres', 'que haces'])) {
        return {
            text: `${greetingName}, soy ${ASSISTANT_LABEL} y te ayudo a ubicarte dentro de UV Servicios.\n\nPuedo ayudarte con esto:\n- Explicarte para que sirve cada modulo.\n- Decirte los pasos para importar, corregir, revisar o generar.\n- Guiarte entre Dashboard, Gestion, Data, Estadisticas y Notificaciones.\n- Orientarte en el flujo de Campo: Jornada, Captura y Envio e Historial de Jornada.\n- Llevarte al bloque o a la pantalla mas util segun tu duda.`
        };
    }

    if (includesAny(query, ['que modulos conoces', 'que hay en la app', 'cada rincon', 'que tiene la app', 'que areas tiene'])) {
        return {
            text: `${greetingName}, conozco estos rincones de la app:\n- Dashboard: analisis operativo y reporte tecnico.\n- Gestion: importacion, carga manual y correccion de datos.\n- Data: historial por pozo y ticket diario por fecha.\n- Estadisticas: cobertura, actividad y seguimiento por rango.\n- Notificaciones: actividad reciente y trazabilidad visible.\n- Jornada: orientacion del turno para Campo.\n- Captura y Envio: registro y mensaje operativo listo para compartir.\n- Historial de Jornada: seguimiento de lo enviado por la cuadrilla.\n- Ayuda: guias, FAQs y rutas de trabajo.`
        };
    }

    if (includesAny(query, ['gracias', 'muchas gracias', 'ok gracias'])) {
        return {
            text: `Listo, ${greetingName}. Si quieres, ahora dime la tarea y te respondo con la ruta exacta dentro de la app.`
        };
    }

    return null;
}

function updateAssistantIdentityUi() {
    const userName = getAssistantUserName();
    const activeTheme = getAssistantTheme();
    const launcherStatus = document.getElementById('help-assistant-launcher-status');
    const subtitle = document.getElementById('help-assistant-subtitle');
    const welcome = document.getElementById('help-assistant-welcome');
    const nameInput = document.getElementById('help-assistant-name-input');
    const currentName = document.getElementById('help-assistant-current-name');
    const themeLabel = document.getElementById('help-assistant-current-theme');

    applyAssistantTheme(activeTheme);

    if (launcherStatus) {
        launcherStatus.textContent = userName
            ? `Listo para ayudarte, ${userName}`
            : 'Consulta pozos, alarmas y producción';
    }

    if (subtitle) {
        subtitle.textContent = userName
            ? `${userName}, consulta pozos OFF, alarmas, producción, sensores o historial y responderé con datos visibles del sistema.`
            : 'Consulta pozos OFF, alarmas, producción, sensores o historial y responderé con datos visibles del sistema.';
    }

    if (welcome) {
        welcome.textContent = userName
            ? `${userName}, soy ${ASSISTANT_LABEL}. Pregúntame cuántos pozos están OFF, qué alarmas hay o la producción de un pozo.`
            : `Soy ${ASSISTANT_LABEL}. Pregúntame cuántos pozos están OFF, qué alarmas hay o la producción de un pozo.`;
    }

    if (nameInput) {
        nameInput.value = userName;
    }

    if (currentName) {
        currentName.textContent = userName || 'Modo general';
    }

    if (themeLabel) {
        const labels = {
            teal: 'Verde UV',
            blue: 'Azul técnico',
            red: 'Rojo alerta'
        };
        themeLabel.textContent = labels[activeTheme] || 'Verde UV';
    }

    document.querySelectorAll('[data-assistant-theme]').forEach(button => {
        button.classList.toggle('active', button.dataset.assistantTheme === activeTheme);
    });

    const contextValue = document.getElementById('help-assistant-context-value');
    const contextCopy = document.getElementById('help-assistant-context-copy');
    if (contextValue) {
        contextValue.textContent = currentAssistantContext.label;
    }
    if (contextCopy) {
        contextCopy.textContent = currentAssistantContext.description;
    }
}

function buildSectionContext(section) {
    const id = section?.id || section?.dataset?.category || 'general';
    const title = section?.querySelector('h2')?.textContent?.trim();

    if (id === 'dashboard') {
        return { id, label: 'Dashboard', description: 'UVITO priorizará respuestas sobre análisis de pozo, filtros históricos y reporte técnico.' };
    }

    if (id === 'gestion') {
        return { id, label: 'Gestión', description: 'UVITO priorizará respuestas sobre importación, carga manual, deduplicación y corrección de registros.' };
    }

    if (id === 'data') {
        return { id, label: 'Data', description: 'UVITO priorizará respuestas sobre historial por pozo, ticket diario por fecha y auditoría operativa.' };
    }

    if (id === 'estadisticas') {
        return { id, label: 'Estadísticas', description: 'UVITO priorizará respuestas sobre cobertura, pozos monitoreados, drilldown y rango de fechas.' };
    }

    if (section?.classList?.contains('help-section-faq')) {
        return { id: 'faq', label: 'Preguntas frecuentes', description: 'UVITO priorizará respuestas rápidas a dudas comunes y errores recurrentes.' };
    }

    return {
        id,
        label: title || 'General',
        description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
    };
}

function inferAssistantContextFromPage() {
    const pageName = String(window.location.pathname || '').split('/').pop().toLowerCase();

    if (pageName === 'stats.html') {
        return {
            id: 'estadisticas',
            label: 'Estadísticas',
            description: 'UVITO priorizará respuestas sobre cobertura, pozos OFF, alertas de seguimiento y análisis por rango de fechas.'
        };
    }

    if (pageName === 'dashboard.html') {
        return {
            id: 'dashboard',
            label: 'Dashboard',
            description: 'UVITO priorizará respuestas sobre análisis de pozo, sensores, histórico y reporte técnico.'
        };
    }

    if (pageName === 'data.html') {
        return {
            id: 'data',
            label: 'Data',
            description: 'UVITO priorizará respuestas sobre historial por pozo, auditoría y revisión tabular.'
        };
    }

    if (pageName === 'dashboard-data.html') {
        return {
            id: 'gestion',
            label: 'Gestión',
            description: 'UVITO priorizará respuestas sobre importación, carga manual y corrección de registros.'
        };
    }

    if (pageName === 'notificacion.html') {
        return {
            id: 'notificaciones',
            label: 'Notificaciones',
            description: 'UVITO priorizará respuestas sobre actividad reciente, trazabilidad y cambios del día.'
        };
    }

    return {
        id: 'general',
        label: 'General',
        description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
    };
}

function setAssistantContext(context) {
    currentAssistantContext = context || currentAssistantContext;
    updateAssistantIdentityUi();
}

function updateAssistantContextFromViewport() {
    const sections = Array.from(document.querySelectorAll(SEARCH_SELECTOR)).filter(section => !section.hidden && !section.classList.contains('is-help-hidden'));
    if (!sections.length) {
        setAssistantContext(inferAssistantContextFromPage());
        return;
    }

    const viewportAnchor = Math.max(120, window.innerHeight * 0.22);
    let bestSection = sections[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top - viewportAnchor);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSection = section;
        }
    });

    setAssistantContext(buildSectionContext(bestSection));
}

function getAssistantEntries() {
    const sectionEntries = Array.from(document.querySelectorAll(SEARCH_SELECTOR)).map(section => {
        const title = section.querySelector('h2')?.textContent?.trim()
            || section.querySelector('h3')?.textContent?.trim()
            || 'Ayuda UV';
        const anchorSource = section.id ? `#${section.id}` : section.querySelector('a[href^="#"]')?.getAttribute('href') || null;
        const summaryNode = section.querySelector('p, li');
        const summary = summaryNode?.textContent?.trim() || section.textContent.trim();
        const steps = Array.from(section.querySelectorAll('ol li'))
            .map(item => item.textContent?.trim())
            .filter(Boolean)
            .slice(0, 4);
        const quickChecks = Array.from(section.querySelectorAll('ul li'))
            .map(item => item.textContent?.trim())
            .filter(Boolean)
            .slice(0, 3);
        return {
            type: 'section',
            title,
            anchor: anchorSource,
            sourceId: section.id || section.dataset.category || 'general',
            keywords: normalizeText(section.dataset.keywords),
            text: normalizeText(section.textContent),
            summary,
            steps,
            quickChecks
        };
    });

    const faqEntries = Array.from(document.querySelectorAll('.help-faq-item')).map((item, index) => {
        if (!item.id) {
            item.id = `help-faq-${index + 1}`;
        }

        const title = item.querySelector('summary')?.textContent?.trim() || 'Pregunta frecuente';
        const summary = item.querySelector('p')?.textContent?.trim() || item.textContent.trim();
        return {
            type: 'faq',
            title,
            anchor: `#${item.id}`,
            sourceId: 'faq',
            keywords: normalizeText(`${title} ${summary}`),
            text: normalizeText(item.textContent),
            summary,
            steps: [],
            quickChecks: []
        };
    });

    return [...sectionEntries, ...getAssistantKnowledgeEntries(), ...faqEntries];
}

function scoreAssistantEntry(entry, query, tokens) {
    let score = 0;
    const isActionQuery = tokens.some(token => [
        'como',
        'pasos',
        'hacer',
        'usar',
        'importar',
        'corregir',
        'generar',
        'ver',
        'revisar',
        'consultar'
    ].includes(token));

    if (entry.title && normalizeText(entry.title).includes(query)) score += 10;
    if (entry.keywords.includes(query)) score += 8;
    if (entry.text.includes(query)) score += 4;

    tokens.forEach(token => {
        if (!token) return;
        if (normalizeText(entry.title).includes(token)) score += 3;
        if (entry.keywords.includes(token)) score += 2;
        if (entry.text.includes(token)) score += 1;
    });

    if (currentAssistantContext?.id && entry.sourceId === currentAssistantContext.id) {
        score += 6;
    }

    if (currentAssistantContext?.id === 'faq' && entry.type === 'faq') {
        score += 2;
    }

    if (isActionQuery && entry.steps?.length) {
        score += 7;
    }

    if (isActionQuery && entry.type === 'faq' && !entry.steps?.length) {
        score -= 2;
    }

    return score;
}

function findAssistantAnswer(rawQuery) {
    const query = normalizeText(rawQuery);
    const tokens = query.split(/\s+/).filter(token => token.length > 1);
    const entries = getAssistantEntries();

    const ranked = entries
        .map(entry => ({ ...entry, score: scoreAssistantEntry(entry, query, tokens) }))
        .filter(entry => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

    return ranked[0] || null;
}

function formatAssistantSteps(steps = []) {
    if (!steps.length) return '';

    return steps
        .map((step, index) => `${index + 1}. ${step}`)
        .join('\n');
}

function buildAssistantResponse(match) {
    const greetingName = getAssistantGreetingName();
    const contextPrefix = currentAssistantContext?.label && currentAssistantContext.label !== 'General'
        ? `Estando en ${currentAssistantContext.label}, `
        : '';

    if (match.steps?.length) {
        const stepsBlock = formatAssistantSteps(match.steps);
        const checksBlock = match.quickChecks?.length
            ? `\n\nAntes de cerrar, valida esto:\n${match.quickChecks.map(item => `- ${item}`).join('\n')}`
            : '';

        return `${greetingName}, ${contextPrefix}para ${match.title.toLowerCase()} sigue esta ruta:\n${stepsBlock}${checksBlock}`;
    }

    if (match.quickChecks?.length) {
        return `${greetingName}, ${contextPrefix}te recomiendo revisar esto en ${match.title}:\n${match.quickChecks.map(item => `- ${item}`).join('\n')}`;
    }

    return `${greetingName}, ${contextPrefix}encontré esto para ti en ${match.title}: ${match.summary}`;
}

function revealAllHelpContent() {
    const searchInput = document.getElementById('help-search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    document.querySelectorAll('.help-filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === 'all');
    });

    applyFilters();
}

function navigateToHelpAnchor(anchor) {
    if (!anchor) return;

    if (!anchor.startsWith('#')) {
        window.location.href = anchor;
        return;
    }

    revealAllHelpContent();

    const target = document.querySelector(anchor);
    if (!target) return;

    if (target.matches('.help-faq-item')) {
        target.open = true;
        document.querySelector('.help-section-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 180);
        return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createAssistantMessage(author, title, text, action = null) {
    const thread = document.getElementById('help-assistant-thread');
    if (!thread) return null;

    const article = document.createElement('article');
    article.className = `help-assistant-message ${author}`;

    const avatar = document.createElement('span');
    avatar.className = 'help-assistant-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = author === 'robot' ? 'UV' : 'YO';

    const bubble = document.createElement('div');
    bubble.className = 'help-assistant-bubble';

    const strong = document.createElement('strong');
    strong.textContent = title;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    bubble.append(strong, paragraph);

    const safeActionHref = sanitizeAssistantActionHref(action?.href);

    if (safeActionHref && action?.label) {
        const actions = document.createElement('div');
        actions.className = 'help-assistant-actions';
        const link = document.createElement('a');
        link.className = 'help-assistant-link';
        link.href = safeActionHref;
        link.textContent = action.label;
        actions.appendChild(link);
        bubble.appendChild(actions);
    }

    article.append(avatar, bubble);
    thread.appendChild(article);
    thread.scrollTop = thread.scrollHeight;
    return paragraph;
}

function serializeAssistantThread() {
    const thread = document.getElementById('help-assistant-thread');
    if (!thread) return [];

    return Array.from(thread.querySelectorAll('.help-assistant-message')).map(message => {
        const bubble = message.querySelector('.help-assistant-bubble');
        const link = bubble?.querySelector('.help-assistant-link');
        return {
            author: message.classList.contains('user') ? 'user' : 'robot',
            title: bubble?.querySelector('strong')?.textContent || ASSISTANT_LABEL,
            text: bubble?.querySelector('p')?.textContent || '',
            action: link?.getAttribute('href') && link?.textContent
                ? { href: link.getAttribute('href'), label: link.textContent }
                : null
        };
    });
}

function persistAssistantThread() {
    try {
        sessionStorage.setItem(ASSISTANT_THREAD_KEY, JSON.stringify(serializeAssistantThread()));
    } catch (error) {
        console.warn('No fue posible persistir la conversación de UVITO:', error);
    }
}

function restoreAssistantThread() {
    const thread = document.getElementById('help-assistant-thread');
    if (!thread) return false;

    try {
        const raw = sessionStorage.getItem(ASSISTANT_THREAD_KEY);
        if (!raw) return false;

        const messages = JSON.parse(raw);
        if (!Array.isArray(messages) || !messages.length) return false;

        thread.innerHTML = '';
        messages.forEach(message => {
            createAssistantMessage(message.author, message.title, message.text, message.action || null);
        });
        scrollAssistantThreadToBottom();
        return true;
    } catch (error) {
        console.warn('No fue posible restaurar la conversación de UVITO:', error);
        return false;
    }
}

function setAssistantMessageAction(paragraph, action = null) {
    const bubble = paragraph?.parentElement;
    if (!bubble) return;

    const existingActions = bubble.querySelector('.help-assistant-actions');
    if (existingActions) {
        existingActions.remove();
    }

    const safeActionHref = sanitizeAssistantActionHref(action?.href);

    if (!safeActionHref || !action?.label) {
        return;
    }

    const actions = document.createElement('div');
    actions.className = 'help-assistant-actions';

    const link = document.createElement('a');
    link.className = 'help-assistant-link';
    link.href = safeActionHref;
    link.textContent = action.label;

    actions.appendChild(link);
    bubble.appendChild(actions);
}

function sanitizeAssistantActionHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (/^(javascript|data|vbscript):/i.test(raw)) {
        return '';
    }

    if (/^(https?:|mailto:|tel:)/i.test(raw)) {
        return raw;
    }

    if (/^[./#?]/.test(raw) || /^[a-z0-9_-]+\.html(?:[?#].*)?$/i.test(raw)) {
        return raw;
    }

    return '';
}

function scrollAssistantThreadToBottom() {
    const thread = document.getElementById('help-assistant-thread');
    if (!thread) return;

    thread.scrollTop = thread.scrollHeight;
}

function typeAssistantText(element, text) {
    if (!element) return Promise.resolve();

    return new Promise(resolve => {
        let index = 0;
        const tick = () => {
            const visibleText = text.slice(0, index);
            if (index < text.length) {
                element.textContent = visibleText;
                const cursor = document.createElement('span');
                cursor.className = 'help-assistant-cursor';
                cursor.textContent = '|';
                element.appendChild(cursor);
                scrollAssistantThreadToBottom();
                index += 1;
                window.setTimeout(tick, ASSISTANT_TYPING_DELAY);
                return;
            }

            element.textContent = text;
            scrollAssistantThreadToBottom();
            resolve();
        };

        tick();
    });
}

async function answerAssistantQuery(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) return;

    const assistantGuide = document.querySelector('#help-assistant-panel .help-assistant-guide');
    if (assistantGuide instanceof HTMLDetailsElement) {
        assistantGuide.open = false;
    }

    const settingsPanel = document.getElementById('help-assistant-settings-panel');
    const settingsButton = document.getElementById('help-assistant-settings-toggle');
    if (settingsPanel) {
        settingsPanel.hidden = true;
    }
    if (settingsButton) {
        settingsButton.setAttribute('aria-expanded', 'false');
    }

    const userName = getAssistantUserName();
    createAssistantMessage('user', userName ? `Consulta de ${userName}` : 'Tu consulta', query);
    persistAssistantThread();

    const loadingParagraph = createAssistantMessage('robot', ASSISTANT_LABEL, 'Consultando sistema...');

    const resolveAssistantResponse = async ({ text, action = null }) => {
        if (!loadingParagraph) return;
        setAssistantMessageAction(loadingParagraph, action);
        await typeAssistantText(loadingParagraph, text);
        persistAssistantThread();
    };

    try {
        const directResponse = getAssistantDirectResponse(query);
        if (directResponse) {
            await resolveAssistantResponse(directResponse);
            return;
        }

        const operationalResponse = await buildOperationalAssistantResponse(query);
        if (operationalResponse) {
            await resolveAssistantResponse(operationalResponse);
            return;
        }

        const searchInput = document.getElementById('help-search-input');
        if (searchInput) {
            searchInput.value = query;
            applyFilters();
        }

        const match = findAssistantAnswer(query);
        if (!match) {
            const fallbackText = `${getAssistantGreetingName()}, no encontré una coincidencia exacta. Prueba con preguntas como cuántos pozos están OFF, muéstrame los pozos con alarmas, producción de CEI0006 o cómo importo Excel.`;
            await resolveAssistantResponse({ text: fallbackText });
            return;
        }

        const responseText = buildAssistantResponse(match);
        await resolveAssistantResponse({
            text: responseText,
            action: match.anchor ? { href: match.anchor, label: 'Ir al bloque' } : null
        });
    } catch (error) {
        console.error('UVITO no pudo responder la consulta:', error);

        const message = String(error?.message || error || '').trim();
        const fallbackText = message
            ? `⚠ Verificando registros...\n\nNo pude completar la consulta operativa en este momento. ${message}`
            : '⚠ Verificando registros...\n\nNo pude completar la consulta operativa en este momento. Intenta nuevamente en unos segundos.';

        await resolveAssistantResponse({ text: fallbackText });
    }
}

function saveAssistantIdentity(rawName) {
    setAssistantUserName(rawName);
    updateAssistantIdentityUi();
}

async function handleHelpLogout() {
    sessionStorage.removeItem(ASSISTANT_NAME_KEY);
    sessionStorage.removeItem(ASSISTANT_THEME_KEY);
    sessionStorage.removeItem(ASSISTANT_THREAD_KEY);
    await logout();
}

function bindHelpOnboardingModal() {
    const modal = document.getElementById('help-onboarding-modal');
    const launcher = document.getElementById('help-assistant-launcher');
    const openAssistantButton = document.getElementById('help-onboarding-open-assistant');
    if (!modal || !launcher || localStorage.getItem(HELP_ONBOARDING_KEY) === 'seen') return;

    const closeModal = ({ openAssistant = false } = {}) => {
        localStorage.setItem(HELP_ONBOARDING_KEY, 'seen');
        modal.hidden = true;
        document.body.classList.remove('help-modal-open');

        if (openAssistant) {
            launcher.click();
        }
    };

    modal.hidden = false;
    document.body.classList.add('help-modal-open');

    modal.querySelectorAll('[data-help-onboarding-close]').forEach(button => {
        button.addEventListener('click', () => closeModal());
    });

    document.getElementById('help-onboarding-close')?.addEventListener('click', () => closeModal());
    openAssistantButton.addEventListener('click', () => closeModal({ openAssistant: true }));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });
}

function bindHelpAssistant() {
    const launcher = document.getElementById('help-assistant-launcher');
    const panel = document.getElementById('help-assistant-panel');
    const closeButton = document.getElementById('help-assistant-close');
    const settingsButton = document.getElementById('help-assistant-settings-toggle');
    const settingsPanel = document.getElementById('help-assistant-settings-panel');
    const assistantGuide = panel?.querySelector('.help-assistant-guide');
    const settingsForm = document.getElementById('help-assistant-settings-form');
    const form = document.getElementById('help-assistant-form');
    const input = document.getElementById('help-assistant-input');
    const nameInput = document.getElementById('help-assistant-name-input');
    const resetNameButton = document.getElementById('help-assistant-reset-name');
    if (!launcher || !panel || !form || !input || !settingsButton || !settingsPanel || !settingsForm || !nameInput || !resetNameButton) return;

    const setOpen = (open) => {
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
        if (open) {
            collapseAssistantGuide();
            scrollAssistantThreadToBottom();
        }
        if (!open) {
            settingsPanel.hidden = true;
            settingsButton.setAttribute('aria-expanded', 'false');
        }
    };

    const setSettingsOpen = (open) => {
        settingsPanel.hidden = !open;
        settingsButton.setAttribute('aria-expanded', String(open));
        if (open && assistantGuide instanceof HTMLDetailsElement) {
            assistantGuide.open = false;
        }
    };

    const collapseAssistantGuide = () => {
        if (assistantGuide instanceof HTMLDetailsElement) {
            assistantGuide.open = false;
        }
    };

    launcher.addEventListener('click', () => {
        const nextState = panel.hidden;
        setOpen(nextState);
        if (nextState) input.focus();
    });

    closeButton?.addEventListener('click', () => {
        setSettingsOpen(false);
        collapseAssistantGuide();
        setOpen(false);
    });

    settingsButton.addEventListener('click', event => {
        event.stopPropagation();
        const nextState = settingsPanel.hidden;
        setSettingsOpen(nextState);
        if (nextState) {
            nameInput.focus();
        }
    });

    if (assistantGuide instanceof HTMLDetailsElement) {
        assistantGuide.addEventListener('toggle', () => {
            if (assistantGuide.open) {
                setSettingsOpen(false);
            }
        });
    }

    settingsForm.addEventListener('submit', event => {
        event.preventDefault();
        saveAssistantIdentity(nameInput.value);
        setSettingsOpen(false);
    });

    resetNameButton.addEventListener('click', () => {
        sessionStorage.removeItem(ASSISTANT_NAME_KEY);
        updateAssistantIdentityUi();
        nameInput.focus();
    });

    document.querySelectorAll('[data-assistant-theme]').forEach(button => {
        button.addEventListener('click', () => {
            setAssistantTheme(button.dataset.assistantTheme || 'teal');
            updateAssistantIdentityUi();
        });
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) return;
        collapseAssistantGuide();
        setSettingsOpen(false);
        input.value = '';
        await answerAssistantQuery(query);
    });

    document.querySelectorAll('[data-assistant-query]').forEach(button => {
        button.addEventListener('click', async () => {
            const query = button.dataset.assistantQuery || '';
            collapseAssistantGuide();
            setSettingsOpen(false);
            await answerAssistantQuery(query);
        });
    });

    document.getElementById('help-assistant-thread')?.addEventListener('click', event => {
        const link = event.target.closest('.help-assistant-link');
        if (!link) return;
        event.preventDefault();
        navigateToHelpAnchor(link.getAttribute('href') || '');
    });

    document.addEventListener('click', event => {
        if (settingsPanel.hidden) return;
        if (settingsPanel.contains(event.target) || settingsButton.contains(event.target)) return;
        setSettingsOpen(false);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !settingsPanel.hidden) {
            setSettingsOpen(false);
        }
    });

    updateAssistantIdentityUi();

    if (!restoreAssistantThread()) {
        persistAssistantThread();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    currentAccessProfile = accessProfile;
    const rolePill = document.getElementById('help-role-pill');
    if (rolePill) {
        rolePill.textContent = getRoleLabel(accessProfile);
    }

    toggleManagementVisibility(accessProfile);
    bindToolbar();
    bindHelpAssistant();
    bindHelpOnboardingModal();
    applyFilters();
    updateAssistantContextFromViewport();
    window.addEventListener('scroll', updateAssistantContextFromViewport, { passive: true });

    document.getElementById('logout-btn')?.addEventListener('click', handleHelpLogout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', handleHelpLogout);

    if (accessProfile?.isFieldOperator) {
        const firstNavLink = document.querySelector('.sidebar nav a[href="dashboard.html"]');
        if (firstNavLink) {
            firstNavLink.setAttribute('href', getDefaultRouteForAccessProfile(accessProfile));
        }
    }
});