/**
 * Modulo principal del dashboard.
 * Resuelve filtros, consulta datos y dibuja indicadores y graficas.
 */
import { applyNavigationAccessProfile, logout, getAccessProfile, getSession, getDefaultRouteForAccessProfile } from './auth.js';
import { supabase } from './supabaseClient.js';
import { getMonitoringData, getLatestDate, getLatestMonitoringRecords, getNeighborRecords, getPozoRecordDates, getPozosHistorySummary, getWellRibbonData } from './data-service.js';
import { fetchConsolidatedDashboardRows } from './services/consolidado-service.js';
import { getFieldWellsByScope } from './services/operational-contracts-service.js';
import { getActiveOperationalScope, initOperationalScopeContext, renderOperationalScopeSwitcher } from './services/operational-scope-context.js';
import { buildMonitoringAnnotationKey, deleteMonitoringPointAnnotation, getMonitoringPointAnnotations, getMonitoringPointAnnotationsPage, upsertMonitoringPointAnnotation } from './services/monitoring-annotations-service.js';
import { hideFullLoader, showFullLoader } from './ui.js';

let charts = {};
let isDarkMode = localStorage.getItem('theme-uv') === 'dark';
let resizeFrame = null;
let historicalRecordOptions = [];
let dashboardResizeHandler = null;
let dashboardOutsideClickHandler = null;
let pozoSummaries = [];
let latestKpiSnapshot = null;
let latestStatusSnapshot = [];
let latestStatusRecordSnapshot = null;
let statusDonutMode = 'latest';
let dashboardAccessProfile = null;
let trendAnnotations = [];
let trendAnnotationPanelReady = false;
let trendAnnotationPanelState = {
    items: [],
    page: 1,
    pageSize: 8,
    total: 0,
    isLoading: false,
    error: null
};
let trendAnnotationProfilesCache = {};

// Variables para evitar clics accidentales al scrollear o arrastrar (drag/zoom) en las gráficas
let isScrollingOrDragging = false;
let touchStartPageY = 0;
let touchStartPageX = 0;
let isMouseDown = false;
let mouseDownX = 0;
let mouseDownY = 0;

// Registrar listeners táctiles globales para detectar deslizamiento (scroll) en móvil/tablet
window.addEventListener('touchstart', (e) => {
    isScrollingOrDragging = false;
    if (e.touches && e.touches[0]) {
        touchStartPageY = e.touches[0].pageY;
        touchStartPageX = e.touches[0].pageX;
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
        const deltaY = Math.abs(e.touches[0].pageY - touchStartPageY);
        const deltaX = Math.abs(e.touches[0].pageX - touchStartPageX);
        if (deltaY > 8 || deltaX > 8) {
            isScrollingOrDragging = true;
        }
    }
}, { passive: true });

// Registrar listeners de ratón para detectar arrastre (drag/zoom) en desktop
window.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    isScrollingOrDragging = false;
    mouseDownX = e.pageX;
    mouseDownY = e.pageY;
}, { passive: true });

window.addEventListener('mousemove', (e) => {
    if (isMouseDown) {
        const deltaX = Math.abs(e.pageX - mouseDownX);
        const deltaY = Math.abs(e.pageY - mouseDownY);
        if (deltaX > 5 || deltaY > 5) {
            isScrollingOrDragging = true;
        }
    }
}, { passive: true });

window.addEventListener('mouseup', () => {
    isMouseDown = false;
    // Retrasar el reseteo para permitir que el callback click de ApexCharts se ejecute primero
    setTimeout(() => {
        isScrollingOrDragging = false;
    }, 150);
}, { passive: true });

const FOCUSED_TREND_RECORD_COUNT = 15;
const MONITORING_RECORD_WINDOW = 30;
const TREND_WINDOW_STORAGE_KEY = 'uv-trend-window-mode';
const TREND_WINDOW_MODES = {
    latest1: 'latest-1',
    latest15: 'latest-15',
    latest30: 'latest-30',
    customRange: 'custom-range'
};
const TREND_INTERACTION_STORAGE_KEY = 'uv-trend-interaction-enabled';
const TREND_CHART_IDS = ['chart-frecuencia', 'chart-pip', 'chart-tm', 'chart-superficie', 'chart-motor-curr', 'chart-vsd-triphase'];
let trendWindowMode = (() => {
    const storedMode = sessionStorage.getItem(TREND_WINDOW_STORAGE_KEY);
    if (Object.values(TREND_WINDOW_MODES).includes(storedMode)) {
        return storedMode;
    }

    const legacyThirty = sessionStorage.getItem('uv-monitoring-30d-mode') === '1';
    const legacyFifteenRaw = sessionStorage.getItem('uv-latest-trend-mode');
    if (legacyThirty) return TREND_WINDOW_MODES.latest30;
    if (legacyFifteenRaw === null || legacyFifteenRaw === '1') return TREND_WINDOW_MODES.latest15;
    return TREND_WINDOW_MODES.latest1;
})();
let trendChartInteractionEnabled = sessionStorage.getItem(TREND_INTERACTION_STORAGE_KEY) === '1';
const ACTIVE_POZO_STORAGE_KEY = 'uv-selected-pozo';
const TREND_AXIS_BASES = {
    frecuencia: { min: 0, max: 60, step: 5, decimals: 1 },
    pip: { min: 0, max: 3000, step: 250, decimals: 0 },
    tm: { min: 0, max: 450, step: 25, decimals: 0 },
    superficie: { min: 0, max: 350, step: 25, decimals: 0 },
    corrienteMotor: { min: 0, max: 120, step: 10, decimals: 0 },
    vsd: { min: 0, max: 600, step: 50, decimals: 0 }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function canManageChartAnnotations() {
    return Boolean(dashboardAccessProfile?.canViewManagement && !dashboardAccessProfile?.isReadOnly && !dashboardAccessProfile?.isFieldOperator);
}

function buildTrendPointAnnotationKey(pointMeta = {}) {
    return buildMonitoringAnnotationKey({
        operational_scope: pointMeta.operationalScope || getActiveOperationalScope(),
        pozo_name: pointMeta.pozoName,
        chart_key: pointMeta.chartKey,
        variable_key: pointMeta.variableKey,
        point_fecha: pointMeta.fecha,
        point_hora: pointMeta.hora
    });
}

function getAnnotationByPointMeta(pointMeta = {}) {
    const key = buildTrendPointAnnotationKey(pointMeta);
    return trendAnnotations.find(annotation => buildMonitoringAnnotationKey(annotation) === key) || null;
}

function getTrendPointMetaFromApex(opts = {}) {
    return opts?.w?.config?.series?.[opts.seriesIndex]?.data?.[opts.dataPointIndex]?.meta || null;
}

function formatAnnotationDateTime(fecha, hora) {
    const date = new Date(`${fecha}T${hora || '00:00:00'}`);
    if (Number.isNaN(date.getTime())) return `${fecha || '--'} ${hora || ''}`.trim();
    return date.toLocaleString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAnnotationAuditDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function annotationToPointMeta(annotation = {}) {
    return {
        operationalScope: annotation.operational_scope,
        pozoName: annotation.pozo_name,
        chartKey: annotation.chart_key,
        variableKey: annotation.variable_key,
        variableLabel: annotation.variable_label,
        fecha: annotation.point_fecha,
        hora: annotation.point_hora,
        value: annotation.point_value,
        unit: getAnnotationUnit(annotation.variable_key)
    };
}

function getAnnotationUnit(variableKey = '') {
    if (variableKey === 'frecuencia') return 'Hz';
    if (variableKey === 'tm') return '°F';
    if (['pip', 'presion_thp', 'presion_chp', 'presion_lf'].includes(variableKey)) return 'PSI';
    return 'Amp';
}

function syncTrendAnnotationCount(count = trendAnnotations.length || 0) {
    const countBadge = document.getElementById('trend-annotations-count');
    if (countBadge) countBadge.textContent = String(count);
}

function getTrendAnnotationPanelFilters() {
    const selectedPozo = document.getElementById('filter-pozo')?.value || '';
    return {
        operationalScope: getActiveOperationalScope(),
        pozoNames: selectedPozo ? [selectedPozo] : []
    };
}

async function loadTrendAnnotationPanelPage(page = 1) {
    trendAnnotationPanelState = {
        ...trendAnnotationPanelState,
        page: Math.max(1, Number(page || 1)),
        isLoading: true,
        error: null
    };
    renderTrendAnnotationPanelList();

    try {
        const result = await getMonitoringPointAnnotationsPage({
            ...getTrendAnnotationPanelFilters(),
            page: trendAnnotationPanelState.page,
            pageSize: trendAnnotationPanelState.pageSize
        });

        // Consultar perfiles reales (nombre + apellido) en lote desde Supabase
        const uniqueUserIds = [
            ...new Set(
                (result.data || [])
                    .map(ann => ann.updated_by_user_id || ann.created_by_user_id)
                    .filter(Boolean)
            )
        ];
        // Solo consultamos IDs que no estén ya en caché
        const uncachedIds = uniqueUserIds.filter(id => !trendAnnotationProfilesCache[id]);
        if (uncachedIds.length > 0) {
            try {
                const { data: profilesList } = await supabase
                    .from('profiles')
                    .select('id, nombre, apellido, avatar_url')
                    .in('id', uncachedIds);
                if (profilesList) {
                    profilesList.forEach(p => {
                        trendAnnotationProfilesCache[p.id] = {
                            nombre: p.nombre || '',
                            apellido: p.apellido || '',
                            avatar_url: p.avatar_url || ''
                        };
                    });
                }
            } catch (err) {
                console.warn('Error resolviendo nombres de perfil para anotaciones:', err);
            }
        }

        trendAnnotationPanelState = {
            ...trendAnnotationPanelState,
            items: result.data,
            page: result.page,
            pageSize: result.pageSize,
            total: result.count,
            isLoading: false,
            error: null
        };
        syncTrendAnnotationCount(result.count);
    } catch (error) {
        trendAnnotationPanelState = {
            ...trendAnnotationPanelState,
            items: [],
            total: 0,
            isLoading: false,
            error: error?.message || 'No se pudieron cargar las anotaciones.'
        };
    }

    renderTrendAnnotationPanelList();
}

async function loadTrendAnnotations(pozoNames = [], timeline = []) {
    const fechas = (Array.isArray(timeline) ? timeline : [])
        .map(record => String(record?.fecha || '').slice(0, 10))
        .filter(Boolean)
        .sort();

    try {
        trendAnnotations = await getMonitoringPointAnnotations({
            operationalScope: getActiveOperationalScope(),
            pozoNames,
            startDate: fechas[0] || null,
            endDate: fechas[fechas.length - 1] || null
        });
    } catch (error) {
        console.warn('Anotaciones de ingeniería no disponibles:', error?.message || error);
        trendAnnotations = [];
    }

    syncTrendAnnotationCount();

    return trendAnnotations;
}

async function openTrendAnnotationModal(pointMeta = {}) {
    if (!pointMeta?.pozoName || !pointMeta?.chartKey || !pointMeta?.variableKey) return;

    if (!canManageChartAnnotations()) {
        if (window.Swal) {
            await window.Swal.fire({
                icon: 'info',
                title: 'Anotación de ingeniería',
                text: 'Solo Administración o Supervisión puede crear anotaciones sobre puntos de gráficas.'
            });
        }
        return;
    }

    const existingAnnotation = getAnnotationByPointMeta(pointMeta);
    const currentComment = existingAnnotation?.comment || '';
    const pointLabel = `${pointMeta.variableLabel || pointMeta.variableKey}: ${pointMeta.value ?? '--'}${pointMeta.unit || ''}`;

    if (!window.Swal) {
        const fallbackComment = window.prompt('Comentario técnico para este punto:', currentComment);
        if (!fallbackComment) return;
        await upsertMonitoringPointAnnotation(pointMeta, fallbackComment);
        await updateDashboard();
        return;
    }

    const result = await window.Swal.fire({
        title: existingAnnotation ? 'Actualizar anotación operativa' : 'Anotar punto operativo',
        html: `
            <div class="trend-annotation-modal">
                <div class="trend-annotation-context">
                    <div class="trend-annotation-chip">
                        <small>Pozo</small>
                        <strong>${escapeHtml(pointMeta.pozoName)}</strong>
                    </div>
                    <div class="trend-annotation-chip">
                        <small>Variable</small>
                        <strong>${escapeHtml(pointLabel)}</strong>
                    </div>
                </div>
                <div class="trend-annotation-time">
                    ${escapeHtml(formatAnnotationDateTime(pointMeta.fecha, pointMeta.hora))}
                </div>
                <label class="trend-annotation-field">
                    <span>Comentario técnico</span>
                    <textarea id="trend-annotation-comment" placeholder="Ej: Bajada por ajuste de frecuencia, condición de arranque, prueba operativa...">${escapeHtml(currentComment)}</textarea>
                </label>
            </div>
        `,
        customClass: {
            popup: 'trend-annotation-popup',
            title: 'trend-annotation-title',
            htmlContainer: 'trend-annotation-html',
            actions: 'trend-annotation-actions',
            confirmButton: 'trend-annotation-confirm',
            cancelButton: 'trend-annotation-cancel'
        },
        buttonsStyling: false,
        showCancelButton: true,
        confirmButtonText: existingAnnotation ? 'Actualizar anotación' : 'Guardar anotación',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
            const value = document.getElementById('trend-annotation-comment')?.value?.trim() || '';
            if (!value) {
                window.Swal.showValidationMessage('Escribe un comentario técnico.');
                return false;
            }
            return value;
        }
    });

    if (!result.isConfirmed || !result.value) return;

    try {
        await upsertMonitoringPointAnnotation(pointMeta, result.value);
        await window.Swal.fire({ icon: 'success', title: 'Anotación guardada', timer: 1600, showConfirmButton: false });
        await updateDashboard();
    } catch (error) {
        await window.Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: error?.message || 'Error guardando la anotación.' });
    }
}

function ensureTrendAnnotationPanel() {
    if (trendAnnotationPanelReady) return;

    const panel = document.createElement('aside');
    panel.id = 'trend-annotation-panel';
    panel.className = 'trend-annotation-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="trend-annotation-panel-backdrop" data-annotation-close></div>
        <section class="trend-annotation-drawer" role="dialog" aria-modal="true" aria-labelledby="trend-annotation-panel-title">
            <header class="trend-annotation-drawer-header">
                <div>
                    <span>Anotaciones de ingeniería</span>
                    <h2 id="trend-annotation-panel-title">Revisión operativa</h2>
                </div>
                <button type="button" class="trend-annotation-close" data-annotation-close aria-label="Cerrar panel">
                    <i class="fas fa-times"></i>
                </button>
            </header>
            <div id="trend-annotation-panel-list" class="trend-annotation-panel-list"></div>
        </section>
    `;

    document.body.appendChild(panel);
    panel.addEventListener('click', handleTrendAnnotationPanelClick);
    trendAnnotationPanelReady = true;
}

function setTrendAnnotationPanelOpen(isOpen) {
    ensureTrendAnnotationPanel();
    const panel = document.getElementById('trend-annotation-panel');
    if (!panel) return;

    panel.classList.toggle('is-open', isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('trend-annotation-panel-open', isOpen);

    if (isOpen) loadTrendAnnotationPanelPage(trendAnnotationPanelState.page || 1);
}

function formatAuthorName(email, userId) {
    // 1. Si tenemos el ID en caché de perfiles, retornamos nombre real de Supabase
    if (userId && trendAnnotationProfilesCache[userId]) {
        const p = trendAnnotationProfilesCache[userId];
        if (p.nombre || p.apellido) {
            return `${p.nombre} ${p.apellido}`.trim();
        }
    }

    if (!email) return 'Ingeniería';
    const firstPart = email.split('@')[0];
    if (!firstPart) return 'Ingeniería';
    
    // Si contiene separadores (punto, guión, guión bajo), dividir por ellos
    if (/[\._-]/.test(firstPart)) {
        return firstPart.split(/[\._-]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    // Si contiene mayúsculas internas (camelCase), dividir por ellas
    // Ejemplo: "JoseBarreto" → "Jose Barreto"
    if (/[a-z][A-Z]/.test(firstPart)) {
        return firstPart.replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    // Heurística: intentar separar nombres pegados en minúscula
    // Buscar patrones donde termina una vocal y empieza una consonante típica de apellido
    const lowerName = firstPart.toLowerCase();
    const nameBreakMatch = lowerName.match(/^([a-záéíóú]{3,}?)((?:b|c|d|f|g|h|l|m|n|p|r|s|t|v|z)[a-záéíóú]+)$/i);
    if (nameBreakMatch) {
        const [, nombre, apellido] = nameBreakMatch;
        return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${apellido.charAt(0).toUpperCase()}${apellido.slice(1)}`;
    }

    // Último recurso: capitalizar todo como una sola palabra
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
}

function renderTrendAnnotationPanelList() {
    ensureTrendAnnotationPanel();
    const list = document.getElementById('trend-annotation-panel-list');
    if (!list) return;

    if (trendAnnotationPanelState.isLoading) {
        list.innerHTML = `
            <div class="trend-annotation-empty is-loading">
                <i class="trend-annotation-empty-icon" aria-hidden="true"></i>
                <strong>Cargando anotaciones</strong>
                <p>Consultando el historial operativo paginado.</p>
            </div>
        `;
        return;
    }

    if (trendAnnotationPanelState.error) {
        list.innerHTML = `
            <div class="trend-annotation-empty is-error">
                <i class="trend-annotation-empty-icon" aria-hidden="true"></i>
                <strong>No se pudo cargar el historial</strong>
                <p>${escapeHtml(trendAnnotationPanelState.error)}</p>
            </div>
        `;
        return;
    }

    const panelAnnotations = trendAnnotationPanelState.items || [];
    const totalPages = Math.max(1, Math.ceil((trendAnnotationPanelState.total || 0) / trendAnnotationPanelState.pageSize));

    if (!panelAnnotations.length) {
        list.innerHTML = `
            <div class="trend-annotation-empty">
                <i class="trend-annotation-empty-icon" aria-hidden="true"></i>
                <strong>Sin anotaciones registradas</strong>
                <p>Haz click sobre un punto de las gráficas para documentar una variación operativa.</p>
            </div>
        `;
        return;
    }

    const listMarkup = panelAnnotations.map(annotation => {
        const email = annotation.updated_by_email || annotation.created_by_email || '';
        const userId = annotation.updated_by_user_id || annotation.created_by_user_id || '';
        const author = formatAuthorName(email, userId);
        const auditDate = annotation.updated_at || annotation.created_at;
        const pointValue = annotation.point_value === null || annotation.point_value === undefined
            ? '--'
            : `${Number(annotation.point_value).toLocaleString('es-VE')}${getAnnotationUnit(annotation.variable_key)}`;

        // Resolver avatar o inicial del autor
        const profile = userId ? trendAnnotationProfilesCache[userId] : null;
        const avatarUrl = profile?.avatar_url || '';
        const authorInitial = author.charAt(0).toUpperCase();
        const avatarMarkup = avatarUrl && !avatarUrl.includes('default-avatar')
            ? `<img class="annotation-author-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(author)}" loading="lazy" />`
            : `<span class="annotation-author-initial">${escapeHtml(authorInitial)}</span>`;

        return `
            <article class="trend-annotation-item" data-annotation-id="${escapeHtml(annotation.id)}">
                <div class="trend-annotation-item-top">
                    <div>
                        <span>${escapeHtml(annotation.pozo_name || '--')}</span>
                        <h3>${escapeHtml(annotation.variable_label || annotation.variable_key || '--')}: ${escapeHtml(pointValue)}</h3>
                    </div>
                    <small>${escapeHtml(formatAnnotationDateTime(annotation.point_fecha, annotation.point_hora))}</small>
                </div>
                <p>${escapeHtml(annotation.comment)}</p>
                <footer>
                    <div class="annotation-author-info">
                        ${avatarMarkup}
                        <div>
                            <b>${escapeHtml(author)}</b>
                            <small>${escapeHtml(formatAnnotationAuditDate(auditDate))}</small>
                        </div>
                    </div>
                    ${canManageChartAnnotations() ? `
                        <div class="trend-annotation-item-actions">
                            <button type="button" data-annotation-edit="${escapeHtml(annotation.id)}">Editar</button>
                            <button type="button" class="is-danger" data-annotation-delete="${escapeHtml(annotation.id)}">Eliminar</button>
                        </div>
                    ` : ''}
                </footer>
            </article>
        `;
    }).join('');

    const paginationMarkup = `
        <nav class="trend-annotation-pagination" aria-label="Paginación de anotaciones">
            <button type="button" data-annotation-page="${trendAnnotationPanelState.page - 1}" ${trendAnnotationPanelState.page <= 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${trendAnnotationPanelState.page} de ${totalPages} · ${trendAnnotationPanelState.total} anotaciones</span>
            <button type="button" data-annotation-page="${trendAnnotationPanelState.page + 1}" ${trendAnnotationPanelState.page >= totalPages ? 'disabled' : ''}>Siguiente</button>
        </nav>
    `;

    // Renderizamos la lista de anotaciones primero, y colocamos la paginación únicamente en la parte inferior
    list.innerHTML = `${listMarkup}${paginationMarkup}`;
}

async function handleTrendAnnotationPanelClick(event) {
    const closeTarget = event.target.closest('[data-annotation-close]');
    if (closeTarget) {
        setTrendAnnotationPanelOpen(false);
        return;
    }

    const editTarget = event.target.closest('[data-annotation-edit]');
    if (editTarget) {
        const annotation = trendAnnotationPanelState.items.find(item => item.id === editTarget.dataset.annotationEdit)
            || trendAnnotations.find(item => item.id === editTarget.dataset.annotationEdit);
        if (!annotation) return;
        setTrendAnnotationPanelOpen(false);
        await openTrendAnnotationModal(annotationToPointMeta(annotation));
        return;
    }

    const deleteTarget = event.target.closest('[data-annotation-delete]');
    if (deleteTarget) {
        await confirmDeleteTrendAnnotation(deleteTarget.dataset.annotationDelete);
        return;
    }

    const pageTarget = event.target.closest('[data-annotation-page]');
    if (pageTarget && !pageTarget.disabled) {
        await loadTrendAnnotationPanelPage(pageTarget.dataset.annotationPage);
    }
}

async function confirmDeleteTrendAnnotation(annotationId) {
    const annotation = trendAnnotationPanelState.items.find(item => item.id === annotationId)
        || trendAnnotations.find(item => item.id === annotationId);
    if (!annotation || !canManageChartAnnotations()) return;

    const result = await window.Swal.fire({
        title: 'Eliminar anotación',
        html: `
            <div class="trend-annotation-delete-modal">
                <p>Esta anotación dejará de verse en el dashboard, pero quedará registrada con auditoría.</p>
                <strong>${escapeHtml(annotation.pozo_name)} · ${escapeHtml(annotation.variable_label || annotation.variable_key)}</strong>
                <textarea id="trend-annotation-delete-reason" placeholder="Motivo opcional de eliminación"></textarea>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Eliminar anotación',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
        preConfirm: () => document.getElementById('trend-annotation-delete-reason')?.value?.trim() || ''
    });

    if (!result.isConfirmed) return;

    try {
        await deleteMonitoringPointAnnotation(annotation.id, result.value);
        trendAnnotations = trendAnnotations.filter(item => item.id !== annotation.id);
        syncTrendAnnotationCount();
        await loadTrendAnnotationPanelPage(trendAnnotationPanelState.page);
        await updateDashboard();
        setTrendAnnotationPanelOpen(true);
    } catch (error) {
        await window.Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: error?.message || 'Error eliminando la anotación.' });
    }
}

function buildTrendAnnotationMarkers(series = []) {
    const markers = [];

    series.forEach((serie, seriesIndex) => {
        (serie.data || []).forEach((point, dataPointIndex) => {
            if (!point?.meta || !getAnnotationByPointMeta(point.meta)) return;
            markers.push({
                seriesIndex,
                dataPointIndex,
                fillColor: '#f59e0b',
                strokeColor: '#0f172a',
                size: 8,
                shape: 'circle'
            });
        });
    });

    return markers;
}

function buildTrendAnnotationTooltip({ series, seriesIndex, dataPointIndex, w }) {
    // Buscar la primera serie activa para extraer los metadatos de ese punto de tiempo
    const firstActiveSerie = w?.config?.series?.find(s => s?.data?.[dataPointIndex]?.meta);
    const pointMeta = firstActiveSerie?.data?.[dataPointIndex]?.meta || null;
    if (!pointMeta) return '';

    // Guardar globalmente el punto activo actual para poder reaccionar al click
    window.activeHoveredTrendPointMeta = pointMeta;

    const annotation = getAnnotationByPointMeta(pointMeta);
    const isOff = String(pointMeta.estatus || '').trim().toUpperCase() === 'OFF';
    const fieldObservation = pointMeta.observaciones ? String(pointMeta.observaciones).trim() : '';

    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';
    const isDarkModeActive = effectiveMode === 'dark';
    const bg = isDarkModeActive ? '#0f172a' : '#ffffff';
    const border = isDarkModeActive ? '1px solid #334155' : '1px solid #e2e8f0';
    const textColor = isDarkModeActive ? '#cbd5e1' : '#334155';
    const titleColor = isDarkModeActive ? '#94a3b8' : '#64748b';
    const valueColor = isDarkModeActive ? '#f8fafc' : '#0f172a';
    const separatorColor = isDarkModeActive ? '#334155' : '#f1f5f9';

    const dateStr = formatAnnotationDateTime(pointMeta.fecha, pointMeta.hora);

    let variablesHtml = '';
    w.config.series.forEach((s, sIdx) => {
        const val = s.data[dataPointIndex]?.y;
        const formattedVal = (val !== null && val !== undefined) ? Number(val).toFixed(1) : '--';
        const unit = s.unit || s.data[dataPointIndex]?.meta?.unit || '';
        const color = w.config.colors?.[sIdx] || '#2563eb';
        
        variablesHtml += `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin:3px 0; font-size:0.85rem;">
                <span style="display:flex; align-items:center; gap:6px; color:${titleColor}; font-weight:600;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${color};"></span>
                    ${escapeHtml(s.name)}
                </span>
                <strong style="color:${valueColor}; font-size:0.95rem;">${escapeHtml(formattedVal)} ${escapeHtml(unit)}</strong>
            </div>
        `;
    });

    return `
        <div style="padding:12px 14px; background:${bg}; border:${border}; border-radius:8px; box-shadow:0 10px 15px -3px rgb(0 0 0 / 0.3); font-family:Inter, sans-serif; min-width:280px; max-width:420px; width:min(420px, calc(100vw - 32px)); color:${textColor}; text-align:left; white-space:normal; word-break:break-word; line-height:1.4;">
            <div style="font-size:0.78rem; color:${titleColor}; font-weight:700; border-bottom:1px solid ${separatorColor}; padding-bottom:6px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <span>${escapeHtml(dateStr)}</span>
                ${isOff ? '<span style="color:#ef4444; font-weight:bold; background:' + (isDarkModeActive ? '#881337' : '#fef2f2') + '; padding:1px 6px; border-radius:4px; font-size:0.7rem;">OFF</span>' : '<span style="color:#10b981; font-weight:bold; background:' + (isDarkModeActive ? '#064e3b' : '#ecfdf5') + '; padding:1px 6px; border-radius:4px; font-size:0.7rem;">RUN</span>'}
            </div>
            
            <div style="margin-bottom:2px;">
                ${variablesHtml}
            </div>

            ${fieldObservation ? `
                <div style="margin-top:8px; padding-top:8px; border-top:1px solid ${separatorColor};">
                    <b style="font-size:0.75rem; color:${titleColor}; display:block; margin-bottom:2px;">Observación de Campo:</b>
                    <p style="margin:0; font-size:0.8rem; line-height:1.3; color:${textColor}; font-weight:500;">${escapeHtml(fieldObservation)}</p>
                </div>
            ` : ''}
            
            ${annotation ? `
                <div style="margin-top:8px; padding-top:8px; border-top:1px solid ${separatorColor};">
                    <b style="font-size:0.75rem; color:${titleColor}; display:block; margin-bottom:2px;">Anotación:</b>
                    <p style="margin:0; font-size:0.8rem; line-height:1.3; color:${textColor}; font-weight:500;">${escapeHtml(annotation.comment)}</p>
                    <small style="opacity:0.7; display:block; margin-top:2px; font-size:0.7rem;">${escapeHtml(annotation.updated_by_email || annotation.created_by_email || 'Ingeniería')}</small>
                </div>
            ` : canManageChartAnnotations() ? `
                <div style="margin-top:6px; opacity:0.6; font-size:0.7rem; border-top:1px solid ${separatorColor}; padding-top:6px; color:${titleColor};">
                    <em>Click en el punto para agregar anotación.</em>
                </div>
            ` : ''}
        </div>
    `;
}

function getTrendWindowRecordCount() {
    if (trendWindowMode === TREND_WINDOW_MODES.latest1) return 1;
    if (trendWindowMode === TREND_WINDOW_MODES.latest30) return MONITORING_RECORD_WINDOW;
    return FOCUSED_TREND_RECORD_COUNT;
}

function isFocusedTrendMode() {
    return trendWindowMode === TREND_WINDOW_MODES.latest15 || trendWindowMode === TREND_WINDOW_MODES.latest30;
}

function syncTrendWindowControl(isAvailable) {
    const select = document.getElementById('trend-window-select');
    if (!select) return;

    select.disabled = !isAvailable;
    select.value = trendWindowMode;

    const rangeContainer = document.getElementById('trend-date-range-container');
    if (rangeContainer) {
        if (isAvailable && trendWindowMode === TREND_WINDOW_MODES.customRange) {
            rangeContainer.style.display = 'inline-flex';
            
            const startInput = document.getElementById('trend-filter-start');
            const endInput = document.getElementById('trend-filter-end');
            if (startInput && endInput && (!startInput.value || !endInput.value)) {
                const today = new Date().toISOString().slice(0, 10);
                const latestDate = historicalRecordOptions[0]?.date || today;
                endInput.value = latestDate;
                
                const endDateObj = new Date(latestDate);
                endDateObj.setDate(endDateObj.getDate() - 30);
                startInput.value = endDateObj.toISOString().slice(0, 10);
            }
        } else {
            rangeContainer.style.display = 'none';
        }
    }
}

function setTrendWindowMode(mode, syncControl = true) {
    trendWindowMode = Object.values(TREND_WINDOW_MODES).includes(mode)
        ? mode
        : TREND_WINDOW_MODES.latest15;

    sessionStorage.setItem(TREND_WINDOW_STORAGE_KEY, trendWindowMode);
    sessionStorage.removeItem('uv-latest-trend-mode');
    sessionStorage.removeItem('uv-monitoring-30d-mode');

    if (syncControl) {
        const pozoName = document.getElementById('filter-pozo')?.value || '';
        syncTrendWindowControl(Boolean(pozoName));
    }
}

function getTrendInteractionChartOptions() {
    return {
        chart: {
            toolbar: { show: trendChartInteractionEnabled },
            zoom: { enabled: trendChartInteractionEnabled },
            selection: { enabled: trendChartInteractionEnabled }
        }
    };
}

function syncTrendInteractionControl() {
    const button = document.getElementById('trend-interaction-toggle');
    if (!button) return;

    button.classList.toggle('is-active', trendChartInteractionEnabled);
    button.setAttribute('aria-pressed', trendChartInteractionEnabled ? 'true' : 'false');
    const label = button.querySelector('span');
    if (label) label.textContent = trendChartInteractionEnabled ? 'Explorar grafica' : 'Scroll seguro';
}

function setTrendChartInteractionEnabled(isEnabled) {
    trendChartInteractionEnabled = Boolean(isEnabled);
    sessionStorage.setItem(TREND_INTERACTION_STORAGE_KEY, trendChartInteractionEnabled ? '1' : '0');
    syncTrendInteractionControl();

    TREND_CHART_IDS.forEach(id => {
        if (charts[id]) charts[id].updateOptions(getTrendInteractionChartOptions(), false, false, false);
    });
}

async function applyFocusedMonitoringRange(pozoName, latestDateOverride = null) {
    const input = document.getElementById('historical-record-input');
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    const timeInput = document.getElementById('filter-time');
    const dateJumpInput = document.getElementById('historical-date-jump');

    if (!pozoName || !startInput || !endInput) return false;

    const recordCount = getTrendWindowRecordCount();
    const scopedOptions = historicalRecordOptions.slice(0, recordCount);
    const latestOption = scopedOptions[0] || null;
    const oldestOption = scopedOptions[scopedOptions.length - 1] || null;

    const latestDate = latestOption?.date || latestDateOverride || getPozoSummary(pozoName)?.latest_fecha || await getLatestDate(pozoName);
    const startDate = oldestOption?.date || latestDate;
    const endDate = latestDate;
    if (!startDate || !endDate) return false;

    startInput.value = startDate;
    endInput.value = endDate;
    if (timeInput) timeInput.value = '';
    if (input) {
        input.value = recordCount === 1
            ? 'Ultimo registro'
            : `Ultimos ${scopedOptions.length || recordCount} registros`;
        input.dataset.recordValue = '';
    }
    if (dateJumpInput) {
        dateJumpInput.value = endDate;
    }

    return true;
}

// Mantiene el pozo activo entre Dashboard, Data y Gestion durante la sesion actual.
function getStoredSelectedPozo() {
    return sessionStorage.getItem(ACTIVE_POZO_STORAGE_KEY) || '';
}

function setStoredSelectedPozo(pozoName) {
    if (pozoName) {
        sessionStorage.setItem(ACTIVE_POZO_STORAGE_KEY, pozoName);
    } else {
        sessionStorage.removeItem(ACTIVE_POZO_STORAGE_KEY);
    }
}

async function filterPozoSummariesByActiveScope(summaries = []) {
    const activeScope = getActiveOperationalScope();
    try {
        const wells = await getFieldWellsByScope(activeScope);
        const catalogPozos = (wells || [])
            .map(well => String(well.pozo_name || '').trim().toUpperCase())
            .filter(Boolean);
        const allowedPozos = new Set(catalogPozos);
        if (allowedPozos.size === 0) return [];

        const summaryByPozo = new Map((summaries || []).map(item => [
            String(item.pozo_name || '').trim().toUpperCase(),
            item
        ]));

        return catalogPozos
            .map(pozoName => summaryByPozo.get(pozoName) || {
                pozo_name: pozoName,
                latest_fecha: null,
                latest_hora: null,
                latest_estatus: null,
                has_records: false
            })
            .sort((a, b) => String(a.pozo_name || '').localeCompare(String(b.pozo_name || '')));
    } catch (error) {
        console.warn('No se pudo filtrar dashboard por contrato operativo:', error);
        return summaries;
    }
}

function getPozoSummary(pozoName) {
    return pozoSummaries.find(item => item.pozo_name === pozoName) || null;
}

function applyDashboardAccessProfile(accessProfile) {
    applyNavigationAccessProfile(accessProfile);
}

// Renderiza el selector personalizado del pozo y conserva el estado de cada opcion.
function renderPozoFilterOptions(ignoreSearch = false) {
    const menu = document.getElementById('filter-pozo-menu');
    const input = document.getElementById('filter-pozo-display');
    const hiddenInput = document.getElementById('filter-pozo');
    if (!menu || !input || !hiddenInput) return;

    const searchTerm = ignoreSearch ? '' : input.value.trim().toLowerCase();
    const filteredPozos = pozoSummaries.filter(item => {
        if (!searchTerm) return true;
        return item.pozo_name.toLowerCase().includes(searchTerm);
    });

    if (filteredPozos.length === 0) {
        menu.innerHTML = '<div class="pozo-selector-empty">No hay pozos para esa busqueda.</div>';
        return;
    }

    menu.innerHTML = filteredPozos.map(item => {
        let dotClass = 'inactive';
        let stateClass = 'inactive';
        let stateText = item.has_records ? 'Con registros' : 'Sin registros';

        if (item.latest_estatus === 'RUN') {
            dotClass = 'active';
            stateClass = 'active-run';
            stateText = 'RUN';
        } else if (item.latest_estatus === 'OFF') {
            dotClass = 'inactive-off';
            stateClass = 'inactive-off';
            stateText = 'OFF';
        } else if (item.has_records) {
            dotClass = 'active';
            stateClass = 'active';
            stateText = 'Con registros';
        }

        return `
            <button type="button" class="pozo-selector-option ${item.pozo_name === hiddenInput.value ? 'active' : ''}" data-pozo="${escapeHtml(item.pozo_name)}">
                <span class="pozo-status-dot ${dotClass}"></span>
                <span class="pozo-option-name">${escapeHtml(item.pozo_name)}</span>
                <span class="pozo-option-state ${stateClass}">${stateText}</span>
            </button>
        `;
    }).join('');

    menu.querySelectorAll('.pozo-selector-option').forEach(button => {
        button.addEventListener('click', async () => {
            await selectDashboardPozo(button.dataset.pozo);
        });
    });
}

function openPozoFilterMenu(ignoreSearch = false) {
    const menu = document.getElementById('filter-pozo-menu');
    if (!menu) return;
    renderPozoFilterOptions(ignoreSearch);
    menu.classList.add('active');
}

function closePozoFilterMenu() {
    document.getElementById('filter-pozo-menu')?.classList.remove('active');
}

// Cuando el usuario elige un pozo, sincronizamos filtros, fecha sugerida e historial rapido.
async function selectDashboardPozo(pozoName) {
    const hiddenInput = document.getElementById('filter-pozo');
    const displayInput = document.getElementById('filter-pozo-display');
    if (!hiddenInput || !displayInput) return;

    hiddenInput.value = pozoName || '';
    displayInput.value = pozoName || '';
    setStoredSelectedPozo(pozoName || '');
    closePozoFilterMenu();

    const latestDate = getPozoSummary(pozoName)?.latest_fecha || null;
    document.getElementById('filter-start').value = latestDate || '';
    document.getElementById('filter-end').value = latestDate || '';

    await syncHistoricalRecordSelector(pozoName || '');
    if (pozoName && isFocusedTrendMode()) {
        await applyFocusedMonitoringRange(pozoName, latestDate || historicalRecordOptions[0]?.date || null);
    }
    syncTrendWindowControl(Boolean(pozoName));
    updateDashboard();
}

function closeHistoricalRecordMenu() {
    document.getElementById('historical-record-menu')?.classList.remove('active');
}

function getSelectedHistoricalRecordValue() {
    return document.getElementById('historical-record-input')?.dataset.recordValue || '';
}

function getSeriesNumericBounds(series) {
    const values = series
        .flatMap(item => Array.isArray(item.data) ? item.data : [])
        .map(point => point?.y)
        .filter(value => Number.isFinite(value));

    if (values.length === 0) {
        return null;
    }

    return {
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

function roundUpToStep(value, step) {
    if (!Number.isFinite(value)) return step;
    return Math.ceil(value / step) * step;
}

function roundDownToStep(value, step) {
    if (!Number.isFinite(value)) return 0;
    return Math.floor(value / step) * step;
}

function getExpandedAxisConfig(baseConfig, series) {
    const bounds = getSeriesNumericBounds(series);
    let min = baseConfig.min;
    let max = baseConfig.max;

    if (bounds) {
        // Si hay datos, ajustamos min/max en torno a los bounds.
        // Usar un paso dinámico cuando el rango real es mucho más pequeño
        const rawMin = bounds.min;
        const rawMax = bounds.max;
        const rawSpan = rawMax - rawMin;

        let step = baseConfig.step;
        if (Number.isFinite(rawSpan) && rawSpan > 0) {
            // Si el span es pequeño comparado con el step base, generar un step más fino
            if (rawSpan < baseConfig.step * 1.5) {
                // Queremos ~4 ticks dentro del rango real
                step = Math.max(1, Math.ceil(rawSpan / 4));
            }
        }

        if (rawMin < min) {
            min = roundDownToStep(rawMin, step);
        } else {
            min = roundDownToStep(rawMin, step);
        }

        if (rawMax > max) {
            max = roundUpToStep(rawMax, step);
        } else {
            max = roundUpToStep(rawMax, step);
        }

        // Añadir un padding relativo para que las líneas no queden pegadas al borde
        const span = Math.max(1, max - min);
        const pad = Math.max(step, Math.ceil(span * 0.08));
        min = Math.max(0, min - pad);
        max = max + pad;
    }

    if (max <= min) {
        max = min + baseConfig.step;
    }

    return {
        min,
        max,
        tickAmount: Math.max(2, Math.round((max - min) / Math.max(1, baseConfig.step))),
        forceNiceScale: true
    };
}

// Aplica el registro historico elegido y alinea fecha, hora y selector visual.
function applyHistoricalRecordSelection(option, shouldUpdate = true) {
    const input = document.getElementById('historical-record-input');
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    const timeInput = document.getElementById('filter-time');
    const dateJumpInput = document.getElementById('historical-date-jump');

    if (!input || !startInput || !endInput || !timeInput) return;

    input.value = option?.label || '';
    input.dataset.recordValue = option?.value || '';
    startInput.value = option?.date || '';
    endInput.value = option?.date || '';
    timeInput.value = option?.time || '';

    if (dateJumpInput) {
        dateJumpInput.value = option?.date || '';
    }

    if (shouldUpdate) {
        updateDashboard();
    }
}

function selectHistoricalDate(dateValue) {
    if (!dateValue) return;
    setTrendWindowMode(TREND_WINDOW_MODES.latest1);

    const exactMatch = historicalRecordOptions.find(option => option.date === dateValue);
    if (exactMatch) {
        applyHistoricalRecordSelection(exactMatch);
        closeHistoricalRecordMenu();
        return;
    }

    const nearestMatch = historicalRecordOptions
        .slice()
        .sort((left, right) => Math.abs(new Date(left.date) - new Date(dateValue)) - Math.abs(new Date(right.date) - new Date(dateValue)))[0] || null;

    if (nearestMatch) {
        applyHistoricalRecordSelection(nearestMatch);
        closeHistoricalRecordMenu();
    }
}

async function openHistoricalDatePicker() {
    const historicalRecordInput = document.getElementById('historical-record-input');
    const dateJumpInput = document.getElementById('historical-date-jump');
    if (historicalRecordInput?.disabled || !dateJumpInput || historicalRecordOptions.length === 0) return;

    const result = await Swal.fire({
        title: 'Buscar registro por fecha',
        input: 'date',
        inputValue: dateJumpInput.value || dateJumpInput.max || '',
        inputAttributes: {
            min: dateJumpInput.min || '',
            max: dateJumpInput.max || ''
        },
        confirmButtonText: 'Ir a la fecha',
        cancelButtonText: 'Cancelar',
        showCancelButton: true,
        confirmButtonColor: '#1D4ED8',
        reverseButtons: true,
        inputValidator: (value) => value ? undefined : 'Selecciona o escribe una fecha.'
    });

    if (result.isConfirmed && result.value) {
        dateJumpInput.value = result.value;
        selectHistoricalDate(result.value);
    }
}

function selectHistoricalRecord(dateValue) {
    setTrendWindowMode(TREND_WINDOW_MODES.latest1);
    const selectedOption = historicalRecordOptions.find(option => option.value === dateValue) || null;
    applyHistoricalRecordSelection(selectedOption, false);

    closeHistoricalRecordMenu();
    updateDashboard();
}

function renderHistoricalRecordMenu() {
    const menu = document.getElementById('historical-record-menu');
    const input = document.getElementById('historical-record-input');
    if (!menu || !input) return;

    if (historicalRecordOptions.length === 0) {
        menu.innerHTML = '<button type="button" class="historical-record-option" disabled>Sin registros disponibles</button>';
        return;
    }

    menu.innerHTML = historicalRecordOptions
        .map(option => `
            <button type="button" class="historical-record-option ${option.value === getSelectedHistoricalRecordValue() ? 'active' : ''}" data-value="${escapeHtml(option.value)}">
                <span class="historical-record-option-date">${escapeHtml(option.date)}</span>
                <span class="historical-record-option-time">${escapeHtml(option.time)}</span>
            </button>
        `)
        .join('');

    menu.querySelectorAll('.historical-record-option[data-value]').forEach(button => {
        button.addEventListener('click', () => selectHistoricalRecord(button.dataset.value));
    });
}

async function syncHistoricalRecordSelector(pozoName, preserveSelection = false) {
    const input = document.getElementById('historical-record-input');
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    const timeInput = document.getElementById('filter-time');
    const dateJumpInput = document.getElementById('historical-date-jump');
    const dateJumpButton = document.getElementById('btn-pick-historical-date');

    if (!input || !startInput || !endInput || !timeInput) return;

    const shouldEnable = Boolean(pozoName);
    input.disabled = !shouldEnable;
    if (dateJumpButton) {
        dateJumpButton.disabled = !shouldEnable;
    }

    if (!shouldEnable) {
        historicalRecordOptions = [];
        input.value = '';
        input.dataset.recordValue = '';
        startInput.value = '';
        endInput.value = '';
        timeInput.value = '';
        if (dateJumpInput) {
            dateJumpInput.value = '';
            dateJumpInput.min = '';
            dateJumpInput.max = '';
        }
        input.placeholder = !pozoName ? 'Selecciona un pozo' : 'No disponible en comparacion';
        renderHistoricalRecordMenu();
        closeHistoricalRecordMenu();
        return;
    }

    const records = await getPozoRecordDates(pozoName);

    historicalRecordOptions = records
        .filter(record => record?.fecha)
        .map(record => ({
            value: `${record.fecha}T${record.hora || '00:00:00'}`,
            date: record.fecha,
            time: record.hora || '00:00:00',
            label: record.hora ? `${record.fecha} ${record.hora}` : `${record.fecha} 00:00:00`
        }));

    const currentValueIsValid = historicalRecordOptions.some(option => option.value === getSelectedHistoricalRecordValue());
    if (!preserveSelection || !currentValueIsValid) {
        applyHistoricalRecordSelection(historicalRecordOptions[0] || null, false);
    } else {
        const selectedOption = historicalRecordOptions.find(option => option.value === getSelectedHistoricalRecordValue()) || null;
        applyHistoricalRecordSelection(selectedOption, false);
    }

    input.placeholder = historicalRecordOptions.length > 0 ? 'Selecciona una fecha y hora registrada' : 'Sin registros disponibles';
    if (dateJumpButton) {
        dateJumpButton.disabled = historicalRecordOptions.length === 0;
    }

    if (dateJumpInput) {
        const availableDates = historicalRecordOptions.map(option => option.date).filter(Boolean);
        const minDate = availableDates.length > 0 ? availableDates[availableDates.length - 1] : '';
        const maxDate = availableDates.length > 0 ? availableDates[0] : '';
        dateJumpInput.min = minDate;
        dateJumpInput.max = maxDate;
        dateJumpInput.value = getSelectedHistoricalRecordValue() ? (historicalRecordOptions.find(option => option.value === getSelectedHistoricalRecordValue())?.date || '') : '';
    }

    renderHistoricalRecordMenu();
}

export async function initDashboard() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }


    const accessProfile = getAccessProfile(session);
    dashboardAccessProfile = accessProfile;

    const defaultRoute = getDefaultRouteForAccessProfile(accessProfile);
    if (defaultRoute !== 'dashboard.html') {
        window.location.href = defaultRoute;
        return;
    }

    applyDashboardAccessProfile(accessProfile);
    const operationalScopeContext = await initOperationalScopeContext(session, accessProfile);
    const handleScopeChange = async () => {
        sessionStorage.removeItem(ACTIVE_POZO_STORAGE_KEY);
        try {
            const { navigate } = await import('./services/router.js');
            await navigate('dashboard.html', false);
        } catch (error) {
            console.warn('[Dashboard] Fallback a recarga física en cambio de contrato:', error);
            window.location.reload();
        }
    };
    renderOperationalScopeSwitcher(document.getElementById('dashboard-operational-scope-switcher'), operationalScopeContext, {
        onChange: handleScopeChange
    });
    renderOperationalScopeSwitcher(document.getElementById('dashboard-mobile-operational-scope-switcher'), operationalScopeContext, {
        onChange: handleScopeChange
    });

    const isFirstEntry = !sessionStorage.getItem('dashboard-visited');

    // Aplica el tema almacenado antes de empezar a dibujar el dashboard.
    if (isDarkMode) {
        document.body.classList.add('dark-room');
        updateThemeIcon();
    }

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            document.body.classList.toggle('dark-room', isDarkMode);
            localStorage.setItem('theme-uv', isDarkMode ? 'dark' : 'white');
            updateThemeIcon();
            updateDashboard(); // Redibuja las graficas con el tema activo.
        });
    }

    function updateThemeIcon() {
        const icon = document.getElementById('theme-icon');
        if (!icon) return;
        if (isDarkMode) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.364 17.636l-.707.707M6.364 6.364l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />';
        } else {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />';
        }
    }

    // Carga el catalogo de pozos y deja listos los filtros principales.
    try {
        pozoSummaries = await filterPozoSummariesByActiveScope(await getPozosHistorySummary());
        const pozos = pozoSummaries.map(item => item.pozo_name);
        const pozoFilter = document.getElementById('filter-pozo');
        const pozoFilterDisplay = document.getElementById('filter-pozo-display');
        const storedPozo = getStoredSelectedPozo();

        // Toma la fecha mas reciente de la base para no abrir el dashboard vacio.
        const latestDate = await getLatestDate();
        if (latestDate) {
            const startInput = document.getElementById('filter-start');
            const endInput = document.getElementById('filter-end');
            if (startInput) startInput.value = latestDate;
            if (endInput) endInput.value = latestDate;
        }

        if (pozoFilter) {
            pozoFilter.value = '';
            if (pozoFilterDisplay) {
                pozoFilterDisplay.value = '';
                pozoFilterDisplay.placeholder = 'Busca o selecciona un pozo';
            }
            renderPozoFilterOptions(true);

            if (storedPozo && pozos.includes(storedPozo)) {
                pozoFilter.value = storedPozo;
                if (pozoFilterDisplay) pozoFilterDisplay.value = storedPozo;
                const pozoDate = getPozoSummary(storedPozo)?.latest_fecha || await getLatestDate(storedPozo);
                const startInput = document.getElementById('filter-start');
                const endInput = document.getElementById('filter-end');
                if (pozoDate) {
                    if (startInput) startInput.value = pozoDate;
                    if (endInput) endInput.value = pozoDate;
                } else {
                    if (startInput) startInput.value = '';
                    if (endInput) endInput.value = '';
                }
                await syncHistoricalRecordSelector(storedPozo);
                if (isFocusedTrendMode()) {
                    await applyFocusedMonitoringRange(storedPozo, pozoDate || historicalRecordOptions[0]?.date || null);
                }
                syncTrendWindowControl(Boolean(storedPozo));
            }
        }
    } catch (err) { console.error('Filter load error:', err); }

    // Mantiene la vista de bienvenida hasta que exista un pozo seleccionado.
    clearDashboard();

    if (document.getElementById('filter-pozo')?.value) {
        await updateDashboard();
    }

    // Oculta el loader solo despues del primer render real del dashboard.
    if (isFirstEntry) {
        setTimeout(() => {
            hideFullLoader();
            sessionStorage.setItem('dashboard-visited', 'true');
        }, 1000);
    }

    // Conecta eventos de filtros, logout y navegacion historica.
    const applyBtn = document.getElementById('apply-filters');
    if (applyBtn) applyBtn.addEventListener('click', updateDashboard);
    
    // Actualiza automaticamente cuando cambian filtros o selectores.
    const pozoFilter = document.getElementById('filter-pozo');
    const pozoFilterDisplay = document.getElementById('filter-pozo-display');
    const pozoFilterToggle = document.getElementById('filter-pozo-toggle');
    if (pozoFilter && pozoFilterDisplay) {
        pozoFilterDisplay.addEventListener('focus', () => {
            if (pozoFilter.value && pozoFilterDisplay.value.trim() === pozoFilter.value) {
                pozoFilterDisplay.select();
            }
            openPozoFilterMenu(pozoFilter.value && pozoFilterDisplay.value.trim() === pozoFilter.value);
        });

        pozoFilterDisplay.addEventListener('input', async () => {
            pozoFilter.value = '';
            setStoredSelectedPozo('');
            openPozoFilterMenu(false);
        });

        pozoFilterDisplay.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePozoFilterMenu();
            }
        });
    }

    if (pozoFilterToggle) {
        pozoFilterToggle.addEventListener('click', () => {
            const menu = document.getElementById('filter-pozo-menu');
            const shouldOpen = !menu?.classList.contains('active');
            if (shouldOpen) {
                openPozoFilterMenu(true);
            } else {
                closePozoFilterMenu();
            }
        });
    }
    
    const startFilter = document.getElementById('filter-start');
    if (startFilter) {
        startFilter.addEventListener('change', () => {
            const matchedOption = historicalRecordOptions.find(option => option.date === startFilter.value) || null;
            if (matchedOption) {
                applyHistoricalRecordSelection(matchedOption);
            } else {
                updateDashboard();
            }
        });
    }
    
    const endFilter = document.getElementById('filter-end');
    if (endFilter) endFilter.addEventListener('change', updateDashboard);

    const historicalRecordInput = document.getElementById('historical-record-input');
    const historicalDateJump = document.getElementById('historical-date-jump');
    const historicalDateBtn = document.getElementById('btn-pick-historical-date');
    if (historicalRecordInput) {
        historicalRecordInput.addEventListener('click', () => {
            if (historicalRecordInput.disabled) return;
            renderHistoricalRecordMenu();
            document.getElementById('historical-record-menu')?.classList.toggle('active');
        });

        historicalRecordInput.addEventListener('focus', () => {
            if (historicalRecordInput.disabled) return;
            renderHistoricalRecordMenu();
            document.getElementById('historical-record-menu')?.classList.add('active');
        });

        historicalRecordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeHistoricalRecordMenu();
            }
        });
    }

    if (historicalDateBtn && historicalDateJump) {
        historicalDateBtn.addEventListener('click', openHistoricalDatePicker);

        historicalDateJump.addEventListener('change', () => {
            selectHistoricalDate(historicalDateJump.value);
        });
    }

    dashboardOutsideClickHandler = (event) => {
        const picker = document.querySelector('.historical-record-picker');
        if (picker && !picker.contains(event.target)) {
            closeHistoricalRecordMenu();
        }

        const pozoWrapper = document.querySelector('.dashboard-pozo-selector');
        if (pozoWrapper && !pozoWrapper.contains(event.target)) {
            closePozoFilterMenu();
            if (pozoFilter && pozoFilterDisplay && pozoFilter.value && !pozoFilterDisplay.value.trim()) {
                pozoFilterDisplay.value = pozoFilter.value;
            }
        }
    };
    document.addEventListener('click', dashboardOutsideClickHandler);
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', logout);

    const trendWindowSelect = document.getElementById('trend-window-select');
    if (trendWindowSelect) {
        trendWindowSelect.addEventListener('change', async () => {
            const pozoName = document.getElementById('filter-pozo')?.value || '';
            const nextMode = trendWindowSelect.value;

            setTrendWindowMode(nextMode, false);

            if (pozoName) {
                if (trendWindowMode === TREND_WINDOW_MODES.latest1) {
                    await syncHistoricalRecordSelector(pozoName, false);
                } else if (trendWindowMode === TREND_WINDOW_MODES.customRange) {
                    // No sobreescribir con fecha única al seleccionar rango personalizado
                } else {
                    await applyFocusedMonitoringRange(pozoName, historicalRecordOptions[0]?.date || null);
                }
            }

            syncTrendWindowControl(Boolean(pozoName));
            updateDashboard();
        });

        syncTrendWindowControl(Boolean(document.getElementById('filter-pozo')?.value));
    }

    const trendStartFilter = document.getElementById('trend-filter-start');
    if (trendStartFilter) trendStartFilter.addEventListener('change', updateDashboard);

    const trendEndFilter = document.getElementById('trend-filter-end');
    if (trendEndFilter) trendEndFilter.addEventListener('change', updateDashboard);

    const trendAnnotationsBtn = document.getElementById('trend-annotations-btn');
    if (trendAnnotationsBtn) {
        trendAnnotationsBtn.addEventListener('click', () => setTrendAnnotationPanelOpen(true));
        syncTrendAnnotationCount();
    }

    const trendInteractionToggle = document.getElementById('trend-interaction-toggle');
    if (trendInteractionToggle) {
        trendInteractionToggle.addEventListener('click', () => setTrendChartInteractionEnabled(!trendChartInteractionEnabled));
        syncTrendInteractionControl();
    }

    // Permite moverse entre registros historicos del pozo activo.
    const shiftDate = (delta) => {
        const currentValue = getSelectedHistoricalRecordValue();
        const currentIndex = historicalRecordOptions.findIndex(option => option.value === currentValue);
        if (currentIndex === -1) return;

        const nextIndex = currentIndex + delta;
        if (nextIndex < 0 || nextIndex >= historicalRecordOptions.length) return;

        setTrendWindowMode(TREND_WINDOW_MODES.latest1);
        applyHistoricalRecordSelection(historicalRecordOptions[nextIndex]);
    };

    document.getElementById('btn-prev-day')?.addEventListener('click', () => shiftDate(-1));
    document.getElementById('btn-next-day')?.addEventListener('click', () => shiftDate(1));
    
    // En moviles el navegador dispara resize al colapsar la barra superior.
    // Aqui solo pedimos un refresh liviano para no duplicar nodos SVG de ApexCharts.
    dashboardResizeHandler = () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            Object.values(charts).forEach(chart => {
                if (chart) chart.updateOptions({}, false, false, false);
            });
            if (latestKpiSnapshot) {
                renderKPIs(latestKpiSnapshot);
            }
            if (latestStatusSnapshot.length > 0) {
                renderStatusDonut(latestStatusSnapshot, latestStatusRecordSnapshot);
            }
        });
    };
    window.addEventListener('resize', dashboardResizeHandler);

    initializeStatusDonutInteractions();

    // Pre-inicializa el panel de anotaciones para que esté en el DOM y las animaciones funcionen al primer clic
    ensureTrendAnnotationPanel();
}

export function destroyDashboard() {
    console.log('[Dashboard] Limpiando recursos y removiendo listeners...');
    
    const panel = document.getElementById('trend-annotation-panel');
    if (panel) {
        panel.remove();
    }
    trendAnnotationPanelReady = false;
    
    if (dashboardResizeHandler) {
        window.removeEventListener('resize', dashboardResizeHandler);
        dashboardResizeHandler = null;
    }
    if (dashboardOutsideClickHandler) {
        document.removeEventListener('click', dashboardOutsideClickHandler);
        dashboardOutsideClickHandler = null;
    }
    
    Object.keys(charts).forEach(id => {
        if (charts[id] && typeof charts[id].destroy === 'function') {
            charts[id].destroy();
        }
    });
    charts = {};
    
    latestKpiSnapshot = null;
    latestStatusSnapshot = [];
    latestStatusRecordSnapshot = null;
}

async function updateDashboard() {
    const selectedPozos = [];
    const selectedPozo = document.getElementById('filter-pozo')?.value || '';
    if (selectedPozo) selectedPozos.push(selectedPozo);

    if (selectedPozos.length === 0) {
        setStoredSelectedPozo('');
        syncTrendWindowControl(false);
        clearDashboard();

        const title = document.querySelector('.main-container header p');
        if (title) {
            title.textContent = 'Selecciona un pozo para cargar las graficas y la telemetria.';
        }

        return;
    }

    let start = document.getElementById('filter-start').value || null;
    let end = document.getElementById('filter-end').value || null;

    if (trendWindowMode === TREND_WINDOW_MODES.customRange) {
        const customStart = document.getElementById('trend-filter-start')?.value;
        const customEnd = document.getElementById('trend-filter-end')?.value;
        if (customStart) start = customStart;
        if (customEnd) end = customEnd;
    }
    const selectedRecordValue = getSelectedHistoricalRecordValue();
    syncTrendWindowControl(selectedPozos.length === 1);
    
    // Activa skeletons mientras resolvemos consultas y volvemos a dibujar las visualizaciones.
    // Activa skeletons mientras llegan datos y se repinta la vista.
    const chartContainers = document.querySelectorAll('.chart-space, .trend-space');
    chartContainers.forEach(el => el.parentElement.classList.add('loading-skeleton'));

    try {
        const requestedRecordCount = getTrendWindowRecordCount();
        const shouldUseFixedRecordWindow = selectedPozos.length === 1 && isFocusedTrendMode();
        const rawData = shouldUseFixedRecordWindow
            ? await getLatestMonitoringRecords(selectedPozos[0], requestedRecordCount)
            : await getMonitoringData(selectedPozos, start, end);
        const data = await applyConsolidatedOperationalOverrides(rawData, {
            selectedPozos,
            startDate: start,
            endDate: end
        });
        const ribbonData = selectedPozos.length === 1
            ? await getWellRibbonData(selectedPozos[0])
            : null;
        
        const welcomeView = document.getElementById('welcome-view');
        const dataRibbon = document.getElementById('data-ribbon-elite');
        const brutalGrid = document.getElementById('brutal-grid');

        if (!data || data.length === 0) {
            clearDashboard();
            if (dataRibbon && ribbonData) {
                if (welcomeView) welcomeView.style.display = 'none';
                dataRibbon.style.display = 'grid';
                updateDataRibbon(ribbonData);
            } else {
                if (welcomeView) welcomeView.style.display = 'block';
            }

            if (!ribbonData && dataRibbon) {
                dataRibbon.style.display = 'none';
            }
            if (brutalGrid) brutalGrid.style.display = 'none';

            const title = document.querySelector('.main-container header p');
            if (title && selectedPozos.length === 1) {
                title.textContent = ribbonData
                    ? `Pozo ${selectedPozos[0]} sin telemetria para la seleccion actual.`
                    : `Pozo ${selectedPozos[0]} sin telemetria disponible para la seleccion actual.`;
            }
            
            chartContainers.forEach(el => el.parentElement.classList.remove('loading-skeleton'));
            return;
        }

        // Si hay datos, ocultamos la bienvenida y mostramos todo el panel.
        if (welcomeView) welcomeView.style.display = 'none';
        if (dataRibbon) dataRibbon.style.display = 'grid';
        if (brutalGrid) brutalGrid.style.display = 'grid';

        // Prioriza el ultimo dato operativo y usa la ficha tecnica como respaldo.
        if (selectedPozos.length === 1) {
            updateDataRibbon(ribbonData);
        } else {
            updateDataRibbon(null);
        }

        const shouldUseFocusedTrendData = shouldUseFixedRecordWindow;

        // Trae vecinos anterior/siguiente para que las lineas no queden cortadas en filtros cerrados.
        let extendedData = [...data];
        if (!shouldUseFocusedTrendData && data.length > 0 && selectedPozos.length === 1) {
            // Busca el registro mas viejo del bloque filtrado.
            const oldestDate = data[data.length - 1].fecha; 
            // Busca el registro mas reciente del bloque filtrado.
            const newestDate = data[0].fecha;
            
            // Trae vecinos fuera del rango para evitar cortes bruscos en las lineas.
            const neighbors = await getNeighborRecords(selectedPozos[0], oldestDate, newestDate);
            const normalizedNeighbors = await applyConsolidatedOperationalOverrides(neighbors, {
                selectedPozos,
                startDate: oldestDate,
                endDate: newestDate
            });
            extendedData = [...extendedData, ...normalizedNeighbors];
        }

        const trendSourceData = shouldUseFocusedTrendData
            ? data
            : extendedData;

        // Ordena por fecha y hora antes de alimentar las graficas de tendencia.
        const timelineData = [...trendSourceData].sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            return dateA - dateB;
        });

        // Filtra observaciones para que solo queden las del contexto visible.
        const filteredObs = data.filter(d => {
            if (selectedPozos.length === 1) return d.pozo_name === selectedPozos[0];
            return true;
        });

        const activeRecord = selectedPozos.length === 1 && selectedRecordValue
            ? data.find(record => `${record.fecha}T${record.hora}` === selectedRecordValue) || data[0]
            : data[0];

        renderKPIs(activeRecord);
        renderStatusDonut(data, activeRecord);
        await loadTrendAnnotations(selectedPozos, timelineData);
        renderCoreTrends(timelineData, selectedPozos, {
            latestRecordsOnly: shouldUseFocusedTrendData,
            latestRecordCount: requestedRecordCount
        });
        renderObservations(filteredObs);
    } catch (err) {
        console.error('Update Fail:', err);
    } finally {
        chartContainers.forEach(el => el.parentElement.classList.remove('loading-skeleton'));
    }
}

function clearDashboard() {
    const chartIds = ['gauge-frecuencia', 'gauge-pip', 'gauge-tm', 'donut-status', 'chart-frecuencia', 'chart-pip', 'chart-tm', 'chart-superficie', 'chart-motor-curr', 'chart-vsd-triphase'];
    chartIds.forEach(id => {
        if (charts[id]) {
            charts[id].updateOptions({ series: [], noData: { text: 'Sin datos' } });
        }
    });

    const welcomeView = document.getElementById('welcome-view');
    const dataRibbon = document.getElementById('data-ribbon-elite');
    const brutalGrid = document.getElementById('brutal-grid');
    
    if (welcomeView) welcomeView.style.display = 'block';
    if (dataRibbon) dataRibbon.style.display = 'none';
    if (brutalGrid) brutalGrid.style.display = 'none';
    syncTrendWindowControl(false);

    const rotationBadge = document.getElementById('rotation-badge');
    const rotationValue = document.getElementById('rotation-badge-value');
    if (rotationBadge) rotationBadge.style.display = 'none';
    if (rotationValue) rotationValue.textContent = '--';
    latestKpiSnapshot = null;
    latestStatusSnapshot = [];
    latestStatusRecordSnapshot = null;
    statusDonutMode = 'latest';

    const tbody = document.getElementById('obs-body');
    if (tbody) tbody.innerHTML = '<tr><td style="padding: 20px; text-align: center; color: var(--text-muted);">No hay registros</td></tr>';
}

/**
 * Indicadores rapidos y gauges del encabezado operativo.
 */
function renderKPIs(latest) {
    latestKpiSnapshot = latest || null;
    createEliteGauge('gauge-frecuencia', latest.frecuencia, 0, 60, 'Hz', '#2563EB');
    createEliteGauge('gauge-pip', latest.pip, 0, 5000, 'PSI', '#DC2626');
    createEliteGauge('gauge-tm', latest.tm, 0, 450, '°F', '#9333EA');

    const rotationBadge = document.getElementById('rotation-badge');
    const rotationValue = document.getElementById('rotation-badge-value');
    const rawRotation = String(latest?.sentido_giro || '').trim();

    if (rotationBadge && rotationValue) {
        if (rawRotation) {
            rotationValue.textContent = rawRotation;
            rotationBadge.style.display = 'inline-flex';
        } else {
            rotationValue.textContent = '--';
            rotationBadge.style.display = 'none';
        }
    }
    
    // Actualiza el subtitulo superior con el contexto de analisis actual.
    const title = document.querySelector('.main-container header p');
    if (title) {
        const startVal = document.getElementById('trend-filter-start')?.value || '';
        const endVal = document.getElementById('trend-filter-end')?.value || '';
        title.textContent = trendWindowMode === TREND_WINDOW_MODES.latest30
            ? `Analizando Pozo: ${latest.pozo_name} (Ultimos ${MONITORING_RECORD_WINDOW} registros)`
            : trendWindowMode === TREND_WINDOW_MODES.latest15
                ? `Analizando Pozo: ${latest.pozo_name} (Ultimos ${FOCUSED_TREND_RECORD_COUNT} registros)`
                : trendWindowMode === TREND_WINDOW_MODES.customRange
                    ? `Analizando Pozo: ${latest.pozo_name} (Rango: ${startVal} al ${endVal})`
                    : `Analizando Pozo: ${latest.pozo_name} (Último: ${latest.fecha} ${latest.hora})`;
    }
}

function getGaugeLayout(id, valueLabel = '') {
    const container = document.getElementById(id);
    const parentWidth = container?.parentElement?.clientWidth || container?.clientWidth || 260;
    const safeWidth = Math.max(parentWidth, 220);
    
    // Increased height for gauges to match the taller card layout
    const chartHeight = Math.max(200, Math.min(230, Math.round(safeWidth * 0.65)));
    const baseValueFontSize = Math.max(24, Math.min(32, Math.round(safeWidth * 0.09)));
    const labelLength = String(valueLabel).trim().length;
    const lengthScale = labelLength > 8
        ? Math.max(0.64, 1 - ((labelLength - 8) * 0.065))
        : 1;
    const valueFontSize = Math.max(20, Math.round(baseValueFontSize * lengthScale));
    const offsetY = Math.max(6, Math.min(10, Math.round(chartHeight * 0.03)));
    // Hollow area (62%) to make the gauge dial thicker and more prominent
    const hollowSize = '62%';

    return {
        chartHeight,
        valueFontSize: `${valueFontSize}px`,
        offsetY,
        hollowSize: `${hollowSize}`
    };
}

function createEliteGauge(id, value, min, max, unit, color) {
    const val = Number(value) || 0;
    const percentage = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    const valueLabel = `${val.toFixed(1)} ${unit}`;
    const gaugeLayout = getGaugeLayout(id, valueLabel);
    
    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';

    const formatTrendAxisLabel = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        return latestRecordsOnly
            ? date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };
    const isReport = document.body.classList.contains('view-mode-report');
    
    const options = {
        series: [Number(percentage.toFixed(1))],
        chart: { 
            type: 'radialBar', 
            height: gaugeLayout.chartHeight,
            sparkline: { enabled: true },
            fontFamily: 'Outfit, Inter, sans-serif'
        },
        theme: { mode: effectiveMode },
        plotOptions: {
            radialBar: {
                offsetY: -8,
                startAngle: -110,
                endAngle: 110,
                hollow: { size: gaugeLayout.hollowSize, background: 'transparent' },
                track: { 
                    background: effectiveMode === 'dark' ? '#1E293B' : '#E2E8F0', 
                    strokeWidth: '95%', 
                    dropShadow: { enabled: true, top: 0, left: 0, blur: 3, opacity: 0.1 } 
                },
                dataLabels: {
                    name: { show: false },
                    value: {
                        offsetY: gaugeLayout.offsetY,
                        fontSize: gaugeLayout.valueFontSize,
                        fontFamily: 'Outfit, Inter, sans-serif',
                        fontWeight: '900',
                        color: effectiveMode === 'dark' ? '#F8FAFC' : '#1E293B',
                        formatter: () => valueLabel
                    }
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'dark',
                type: 'horizontal',
                gradientToColors: [color], 
                stops: [0, 100]
            }
        },
        stroke: { lineCap: 'round' },
        colors: [color]
    };
    renderOrUpdate(id, options);
}

function getLatestStatusLabel(record = null) {
    const normalizedStatus = String(record?.normalized_estatus || record?.estatus || '').trim().toUpperCase();
    if (normalizedStatus === 'RUN' || normalizedStatus === 'ON') return 'RUN';
    if (normalizedStatus === 'OFF') return 'OFF';
    return '--';
}

function initializeStatusDonutInteractions() {
    const donutContainer = document.getElementById('donut-status');
    if (!donutContainer) return;

    const handleToggle = () => {
        if (!latestStatusSnapshot.length) return;
        statusDonutMode = statusDonutMode === 'latest' ? 'history' : 'latest';
        renderStatusDonut(latestStatusSnapshot, latestStatusRecordSnapshot);
    };

    donutContainer.addEventListener('click', handleToggle);
}

/**
 * Estado general del pozo segun sus registros operativos.
 */
function renderStatusDonut(data, latestRecord = null) {
    latestStatusSnapshot = Array.isArray(data) ? [...data] : [];
    latestStatusRecordSnapshot = latestRecord || latestStatusSnapshot[0] || null;
    const runCount = data.filter(d => d.estatus === 'RUN').length;
    const offCount = data.filter(d => d.estatus === 'OFF').length;
    const donutContainer = document.getElementById('donut-status');
    const parentWidth = donutContainer?.parentElement?.clientWidth || donutContainer?.clientWidth || 260;
    const chartHeight = Math.max(180, Math.min(240, Math.round(parentWidth * 0.64)));
    const totalFontSize = Math.max(26, Math.min(38, Math.round(parentWidth * 0.1)));
    const latestStatusLabel = getLatestStatusLabel(latestStatusRecordSnapshot);
    const isHistoryMode = statusDonutMode === 'history';

    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';
    const options = isHistoryMode
        ? {
            series: [runCount, offCount],
            labels: ['RUN', 'OFF'],
            chart: { type: 'donut', height: chartHeight, fontFamily: 'Outfit, Inter, sans-serif' },
            theme: { mode: effectiveMode },
            colors: ['#10B981', '#F43F5E'],
            dataLabels: { enabled: false },
            plotOptions: {
                pie: {
                    donut: {
                        size: '78%',
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: 'Registros',
                                fontSize: '13px',
                                color: effectiveMode === 'dark' ? '#94A3B8' : '#64748B',
                                formatter: () => data.length
                            },
                            value: {
                                fontSize: `${totalFontSize}px`,
                                fontWeight: 800,
                                color: effectiveMode === 'dark' ? '#F8FAFC' : '#111827'
                            }
                        }
                    }
                }
            },
            legend: { position: 'bottom', labels: { colors: effectiveMode === 'dark' ? '#94A3B8' : '#6B7280' } }
        }
        : {
            series: [1],
            labels: [latestStatusLabel],
            chart: { type: 'donut', height: chartHeight, fontFamily: 'Outfit, Inter, sans-serif' },
            theme: { mode: effectiveMode },
            colors: [latestStatusLabel === 'OFF' ? '#F43F5E' : latestStatusLabel === 'RUN' ? '#10B981' : '#94A3B8'],
            dataLabels: { enabled: false },
            plotOptions: {
                pie: {
                    donut: {
                        size: '78%',
                        labels: {
                            show: true,
                            name: {
                                offsetY: -10,
                            },
                            value: {
                                fontSize: '46px',
                                fontWeight: 900,
                                color: effectiveMode === 'dark' ? '#F8FAFC' : '#0F172A',
                                offsetY: 12,
                            },
                            total: {
                                show: true,
                                label: 'Ultimo registro',
                                fontSize: '13px',
                                color: effectiveMode === 'dark' ? '#94A3B8' : '#64748B',
                                formatter: () => latestStatusLabel
                            }
                        }
                    }
                }
            },
            legend: { show: false }
        };

    renderOrUpdate('donut-status', options);
}

/**
 * Tendencias historicas y comparativas del panel.
 */
function renderCoreTrends(timeline, requestedPozos, options = {}) {
    const { latestRecordsOnly = false, latestRecordCount = 7 } = options;
    const scopedTimeline = latestRecordsOnly
        ? getLatestTrendWindow(timeline, latestRecordCount)
        : timeline;
    const trendBounds = getTrendWindowBounds(scopedTimeline, latestRecordsOnly, latestRecordCount);
    const pozosPresentes = [...new Set(scopedTimeline.map(d => d.pozo_name))];
    const isComparison = pozosPresentes.length > 1;
    const useFocusedTrendAxis = latestRecordsOnly && !isComparison;
    const useDenseFocusedAxis = useFocusedTrendAxis && latestRecordCount >= 30;
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1440;
    const isMobileTrendViewport = viewportWidth <= 768;
    const isTabletTrendViewport = viewportWidth > 768 && viewportWidth <= 1366;
    const focusedAxisRotation = !useFocusedTrendAxis
        ? 0
        : useDenseFocusedAxis
            ? (isMobileTrendViewport ? -45 : (isTabletTrendViewport ? -28 : 0))
            : 0;
    const focusedAxisFontSize = useDenseFocusedAxis && isMobileTrendViewport ? '10px' : '11px';
    const shouldHideOverlappingFocusedLabels = useDenseFocusedAxis && isMobileTrendViewport;

    // Paleta principal de colores para tendencias y comparaciones.
    const REPSOL_ORANGE = '#FF8200';
    const REPSOL_RED = '#DA291C';
    const TECH_BLUE = '#2563EB';
    const TECH_CYAN = '#06B6D4';
    const TECH_PURPLE = '#7C3AED';

    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';

    const formatTrendPointLabel = (value, includeYear = false, includeTime = true) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const opts = {
            day: '2-digit',
            month: 'short',
            ...(includeYear ? { year: 'numeric' } : {})
        };

        if (includeTime) {
            opts.hour = '2-digit';
            opts.minute = '2-digit';
        }

        return date.toLocaleString('es-ES', opts);
    };

    const formatCompressedTrendAxisLabel = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        return date.toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };


    // Genera la base comun de opciones para no repetir configuracion por grafica.
    const getBaseOptions = (title, color, unit, axisBase) => ({
        chart: {
            type: 'area',
            height: 220,
            toolbar: { show: trendChartInteractionEnabled },
            zoom: { enabled: trendChartInteractionEnabled },
            selection: { enabled: trendChartInteractionEnabled },
            animations: { enabled: true, easing: 'easeinout', speed: 800 },
            background: 'transparent',
            fontFamily: 'Outfit, Inter, sans-serif',
            events: {
                dataPointMouseEnter: (event) => {
                    if (event?.target?.style) event.target.style.cursor = 'pointer';
                },
                click: async (event, chartContext, config) => {
                    // Evitar clics accidentales si el usuario está deslizando la pantalla (scroll) o arrastrando (drag/zoom) la gráfica
                    if (isScrollingOrDragging) return;

                    // Evitar clicks si se interactúa con la barra de herramientas (toolbar)
                    const isToolbarClick = event?.target?.closest('.apexcharts-toolbar');
                    if (isToolbarClick) return;

                    if (window.activeHoveredTrendPointMeta) {
                        await openTrendAnnotationModal(window.activeHoveredTrendPointMeta);
                    }
                }
            }
        },
        theme: { mode: effectiveMode },
        stroke: { curve: latestRecordsOnly ? 'straight' : 'smooth', width: 4, connectNulls: true },
        markers: {
            size: latestRecordsOnly ? 3 : 5,
            strokeWidth: 0,
            hover: { size: latestRecordsOnly ? 5 : 8 }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [0, 90, 100]
            }
        },
        grid: {
            borderColor: effectiveMode === 'dark' ? '#1E293B' : '#F1F5F9',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } }
        },
        xaxis: {
            type: 'datetime',
            min: trendBounds?.min,
            max: trendBounds?.max,
            labels: {
                datetimeUTC: false,
                style: { colors: effectiveMode === 'dark' ? '#94A3B8' : '#64748B', fontSize: focusedAxisFontSize, fontWeight: 600 },
                formatter: (value) => {
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) return '';

                    if (useFocusedTrendAxis) {
                        return useDenseFocusedAxis && isMobileTrendViewport
                            ? formatCompressedTrendAxisLabel(value)
                            : formatTrendPointLabel(value);
                    }

                    return date.toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                },
                rotate: focusedAxisRotation,
                rotateAlways: focusedAxisRotation !== 0,
                trim: true,
                hideOverlappingLabels: shouldHideOverlappingFocusedLabels,
                showDuplicates: false
            }
        },
        tooltip: {
            shared: true,
            intersect: false,
            custom: buildTrendAnnotationTooltip,
            x: {
                formatter: (value) => {
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) return String(value || '');

                    return date.toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
        },
        colors: Array.isArray(color) ? color : [color],
        dataLabels: (() => {
            // Pre-calcula colores de texto para cada serie según contraste con su color de fondo
            const cfgColors = Array.isArray(color) ? color : [color];
            const textColors = cfgColors.map(col => {
                const hex = (String(col || '#000')).replace('#', '').slice(0, 6).padEnd(6, '0');
                const r = parseInt(hex.substring(0, 2), 16) || 0;
                const g = parseInt(hex.substring(2, 4), 16) || 0;
                const b = parseInt(hex.substring(4, 6), 16) || 0;
                const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
                return luminance > 0.6 ? '#0F172A' : '#fff';
            });

            return {
                enabled: true,
                offsetY: -8,
                style: {
                    fontSize: '11px',
                    fontWeight: 700,
                    colors: [effectiveMode === 'dark' ? '#0F172A' : '#fff']
                },
                background: {
                    enabled: true,
                    foreColor: effectiveMode === 'dark' ? '#0F172A' : '#334155',
                    borderRadius: 6,
                    padding: 6,
                    opacity: 1,
                    borderWidth: 0,
                    borderColor: 'transparent'
                },
                formatter: (_value, opts) => {
                    const point = opts?.w?.config?.series?.[opts.seriesIndex]?.data?.[opts.dataPointIndex];
                    if (!point) return '';
                    const decimals = axisBase?.decimals ?? 0;
                    if (typeof point.y === 'number') return Number(point.y).toFixed(decimals);
                    return '';
                }
            };
        })()
    });

    const makeSeries = (nameSuffix, field, pozo, chartKey, unit) => ({
        name: isComparison ? `${pozo} (${nameSuffix})` : nameSuffix,
        data: scopedTimeline
            .filter(d => d.pozo_name === pozo)
            .map(d => {
                const rawValue = d[field];
                const status = String(d.normalized_estatus || d.estatus || 'RUN').trim().toUpperCase();
                const isOff = status === 'OFF';

                // Campos operacionales principales que caen a cero si el pozo está en OFF
                const zeroOnOffFields = ['frecuencia', 'corriente_motor', 'vsd_a', 'vsd_b', 'vsd_c'];

                let numericValue = null;
                if (isOff && zeroOnOffFields.includes(field)) {
                    numericValue = 0;
                } else if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
                    numericValue = Number(rawValue);
                }

                if (useFocusedTrendAxis && !Number.isFinite(numericValue)) {
                    return null;
                }

                const pointTimestamp = new Date(`${d.fecha}T${d.hora}`).getTime();
                if (!Number.isFinite(pointTimestamp)) {
                    return null;
                }

                return {
                    x: pointTimestamp,
                    y: Number.isFinite(numericValue) ? numericValue : null,
                    meta: {
                        operationalScope: getActiveOperationalScope(),
                        pozoName: pozo,
                        chartKey,
                        variableKey: field,
                        variableLabel: nameSuffix,
                        fecha: d.fecha,
                        hora: d.hora,
                        value: Number.isFinite(numericValue) ? numericValue : null,
                        unit,
                        estatus: status,
                        observaciones: d.observaciones || ''
                    }
                };
            })
            .filter(Boolean)
    });

    const renderTrendChart = (id, title, colors, unit, axisBase, series) => {
        const baseOptions = getBaseOptions(title, colors, unit, axisBase);
        renderOrUpdate(id, {
            ...baseOptions,
            markers: {
                ...baseOptions.markers,
                discrete: buildTrendAnnotationMarkers(series)
            },
            yaxis: {
                ...baseOptions.yaxis,
                ...getExpandedAxisConfig(axisBase, series)
            },
            series
        });
    };

    // 1. FRECUENCIA
    const freqSeries = pozosPresentes.map(p => makeSeries('Hz', 'frecuencia', p, 'chart-frecuencia', 'Hz'));
    renderTrendChart('chart-frecuencia', 'Frecuencia (Hz)', REPSOL_ORANGE, 'Hz', TREND_AXIS_BASES.frecuencia, freqSeries);

    // 2. PIP (FONDO)
    const pipSeries = pozosPresentes.map(p => makeSeries('PSI', 'pip', p, 'chart-pip', 'PSI'));
    renderTrendChart('chart-pip', 'Presión PIP (PSI)', REPSOL_RED, 'PSI', TREND_AXIS_BASES.pip, pipSeries);

    // 3. TM (MOTOR)
    const tmSeries = pozosPresentes.map(p => makeSeries('°F', 'tm', p, 'chart-tm', '°F'));
    renderTrendChart('chart-tm', 'Temperatura Motor (°F)', TECH_PURPLE, '°F', TREND_AXIS_BASES.tm, tmSeries);

    // 4. SUPERFICIE (THP / CHP / LF)
    const surfSeries = [];
    pozosPresentes.forEach(p => {
        surfSeries.push(makeSeries('THP', 'presion_thp', p, 'chart-superficie', 'PSI'));
        surfSeries.push(makeSeries('CHP', 'presion_chp', p, 'chart-superficie', 'PSI'));
        surfSeries.push(makeSeries('LF', 'presion_lf', p, 'chart-superficie', 'PSI'));
    });
    renderTrendChart('chart-superficie', 'Presión Superficie (PSI)', [TECH_BLUE, TECH_CYAN, '#0F766E'], 'PSI', TREND_AXIS_BASES.superficie, surfSeries);

    // 5. CORRIENTE MOTOR
    const currSeries = pozosPresentes.map(p => makeSeries('Amp', 'corriente_motor', p, 'chart-motor-curr', 'Amp'));
    renderTrendChart('chart-motor-curr', 'Corriente Motor (Amp)', TECH_BLUE, 'Amp', TREND_AXIS_BASES.corrienteMotor, currSeries);

    // 6. VSD TRÍFASICO (A / B / C)
    const vsdSeries = [];
    pozosPresentes.forEach(p => {
        vsdSeries.push(makeSeries('VSD A', 'vsd_a', p, 'chart-vsd-triphase', 'Amp'));
        vsdSeries.push(makeSeries('VSD B', 'vsd_b', p, 'chart-vsd-triphase', 'Amp'));
        vsdSeries.push(makeSeries('VSD C', 'vsd_c', p, 'chart-vsd-triphase', 'Amp'));
    });
    renderTrendChart('chart-vsd-triphase', 'Corriente VSD (Amp)', ['#6366F1', '#EC4899', '#F43F5E'], 'Amp', TREND_AXIS_BASES.vsd, vsdSeries);
}

function getLatestTrendWindow(timeline, latestRecordCount) {
    const timelineByPozo = new Map();

    timeline.forEach(record => {
        const pozoName = record?.pozo_name;
        if (!pozoName) return;

        if (!timelineByPozo.has(pozoName)) {
            timelineByPozo.set(pozoName, []);
        }

        timelineByPozo.get(pozoName).push(record);
    });

    return [...timelineByPozo.values()]
        .flatMap(records => records.slice(-latestRecordCount));
}

function getTrendWindowBounds(timeline, latestRecordsOnly, latestRecordCount) {
    if (!latestRecordsOnly || !Array.isArray(timeline) || timeline.length === 0) {
        return null;
    }

    const timestamps = timeline
        .map(record => new Date(`${record?.fecha}T${record?.hora || '00:00:00'}`).getTime())
        .filter(value => Number.isFinite(value));

    if (timestamps.length === 0) {
        return null;
    }

    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);

    return {
        min: minTimestamp,
        max: maxTimestamp
    };
}

function renderObservations(data) {
    const tbody = document.getElementById('obs-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(record => {
        const observationText = formatObservationText(record.observaciones);
        if (observationText) {
            const tr = document.createElement('tr');
            tr.className = 'bitacora-row';
            tr.innerHTML = `<td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); color: var(--text-body); transition: all 0.2s ease;">
                <span class="bitacora-meta" style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 4px; font-weight: 500;">
                    <span class="bitacora-pozo" style="color: var(--scope-accent); font-weight: 700;">${escapeHtml(record.pozo_name)}</span> · ${escapeHtml(record.fecha)} ${escapeHtml(record.hora ? record.hora.slice(0, 5) : '00:00')}
                </span>
                <span class="bitacora-text" style="font-size: 0.88rem; line-height: 1.4;">${escapeHtml(observationText)}</span>
            </td>`;
            
            const pozoName = document.getElementById('filter-pozo')?.value || '';
            if (pozoName) {
                tr.addEventListener('click', () => {
                    const recordValue = `${record.fecha}T${record.hora || '00:00:00'}`;
                    selectHistoricalRecord(recordValue);
                    
                    const targetElement = document.getElementById('data-ribbon-elite') || document.getElementById('chart-frecuencia');
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            }
            tbody.appendChild(tr);
        }
    });
}

function formatObservationText(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const parts = rawValue
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);

    if (!parts.length) return '';
    const operationalPart = [...parts].reverse().find(part => /observ|oper|condici|normal|falla|monitoreo|pozo/i.test(part));
    return operationalPart || parts[parts.length - 1];
}

function normalizeDashboardTime(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';
    const match = rawValue.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?/);
    if (!match) return rawValue;
    const hours = String(Math.min(Number(match[1]) || 0, 23)).padStart(2, '0');
    const minutes = String(Math.min(Number(match[2]) || 0, 59)).padStart(2, '0');
    const seconds = String(Math.min(Number(match[3]) || 0, 59)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function buildDashboardRecordKey({ pozo_name, pozo, fecha, report_date, hora, report_time } = {}) {
    const pozoName = String(pozo_name || pozo || '').trim().toUpperCase();
    const dateValue = String(fecha || report_date || '').trim().slice(0, 10);
    const timeValue = normalizeDashboardTime(hora || report_time || '');
    if (!pozoName || !dateValue || !timeValue) return '';
    return `${pozoName}|${dateValue}|${timeValue}`;
}

function getConsolidatedRowValue(rowData = {}, aliases = []) {
    const normalizeKey = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9%]+/g, '')
        .toUpperCase();
    const normalizedAliases = new Set(aliases.map(normalizeKey));

    for (const [key, value] of Object.entries(rowData || {})) {
        if (!normalizedAliases.has(normalizeKey(key))) continue;
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }

    return undefined;
}

function buildConsolidatedOperationalMap(rows = []) {
    const map = new Map();

    rows.forEach(row => {
        const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
        const key = buildDashboardRecordKey({
            pozo: row.pozo || getConsolidatedRowValue(rowData, ['POZO']),
            report_date: row.report_date || getConsolidatedRowValue(rowData, ['FECHA']),
            report_time: row.report_time || getConsolidatedRowValue(rowData, ['HORA'])
        });
        if (!key) return;

        const patch = {
            presion_thp: getConsolidatedRowValue(rowData, ['THP [psi]', 'THP']),
            presion_chp: getConsolidatedRowValue(rowData, ['CHP [psi]', 'CHP']),
            presion_lf: getConsolidatedRowValue(rowData, ['LF [psi]', 'LF']),
            observaciones: getConsolidatedRowValue(rowData, ['OBSERVACIONES', 'OBSERVACION'])
        };

        Object.keys(patch).forEach(fieldName => {
            if (patch[fieldName] === undefined || patch[fieldName] === null || String(patch[fieldName]).trim() === '') {
                delete patch[fieldName];
            }
        });

        if (Object.keys(patch).length) map.set(key, patch);
    });

    return map;
}

async function applyConsolidatedOperationalOverrides(records = [], { selectedPozos = [], startDate = '', endDate = '' } = {}) {
    if (!Array.isArray(records) || records.length === 0) return records;

    try {
        const pozo = selectedPozos.length === 1 ? selectedPozos[0] : '';
        const consolidatedRows = await fetchConsolidatedDashboardRows({
            limit: 2000,
            pozo,
            startDate,
            endDate
        });
        const operationalMap = buildConsolidatedOperationalMap(consolidatedRows);
        if (!operationalMap.size) return records;

        return records.map(record => {
            const patch = operationalMap.get(buildDashboardRecordKey(record));
            return patch ? { ...record, ...patch } : record;
        });
    } catch (error) {
        console.warn('No se pudieron cruzar datos operativos del consolidado para el dashboard.', error); 
        return records;
    }
}

function renderOrUpdate(id, options) {
    const el = document.getElementById(id);
    if (!el) return;

    if (typeof ApexCharts === 'undefined') {
        console.warn(`[Charts] ApexCharts no está disponible globalmente para renderizar #${id}.`);
        return;
    }

    try {
        if (charts[id]) {
            const isAttached = el.contains(charts[id].el) || charts[id].el === el;
            if (isAttached) {
                charts[id].updateOptions(options);
                return;
            }
            try { charts[id].destroy(); } catch (e) {}
            delete charts[id];
        }

        el.innerHTML = '';
        charts[id] = new ApexCharts(el, options);
        charts[id].render();
    } catch (err) {
        console.error(`[Charts] Error renderizando gráfica #${id}:`, err);
    }
}

/**
 * 4. ELITE DATA RIBBON UPDATE
 */
function updateDataRibbon(data) {
    const fields = {
        'rb-campo': data?.campo_name || '--',
        'rb-pozo': data?.pozo_name || '--',
        'rb-ef': data?.ef || '--',
        'rb-pump': data?.pump_manufacturer || '--',
        'rb-fecha': data?.measurement_date || data?.fecha || '--',
        'rb-bbpd': data?.bbpd || '--',
        'rb-ays': data?.ays_percentage ? `${data.ays_percentage}%` : '--',
        'rb-bnpd': data?.bnpd || '--',
        'rb-cat': data?.cat_number || '--'
    };

    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
            // Add a small animation for the update
            el.parentElement.style.animation = 'none';
            void el.parentElement.offsetWidth; // trigger reflow
            el.parentElement.style.animation = 'fadeIn 0.5s ease';
        }
    });
}

