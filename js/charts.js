/**
 * Modulo principal del dashboard.
 * Resuelve filtros, consulta datos y dibuja indicadores y graficas.
 */

import { applyNavigationAccessProfile, logout, getAccessProfile, getSession } from './auth.js';
import { getMonitoringData, getLatestDate, getLatestMonitoringRecords, getNeighborRecords, getPozoRecordDates, getPozosHistorySummary, getWellRibbonData } from './data-service.js';
import { fetchConsolidatedDashboardRows } from './services/consolidado-service.js';
import { hideFullLoader, showFullLoader } from './ui.js';

let charts = {};
let isDarkMode = localStorage.getItem('theme-uv') === 'dark';
let resizeFrame = null;
let historicalRecordOptions = [];
let pozoSummaries = [];
let latestKpiSnapshot = null;
let latestStatusSnapshot = [];
let latestStatusRecordSnapshot = null;
let statusDonutMode = 'latest';
const FOCUSED_TREND_RECORD_COUNT = 15;
const MONITORING_RECORD_WINDOW = 30;
const TREND_WINDOW_STORAGE_KEY = 'uv-trend-window-mode';
const TREND_WINDOW_MODES = {
    latest1: 'latest-1',
    latest15: 'latest-15',
    latest30: 'latest-30'
};
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

function getPozoSummary(pozoName) {
    return pozoSummaries.find(item => item.pozo_name === pozoName) || null;
}

function applyDashboardAccessProfile(accessProfile) {
    applyNavigationAccessProfile(accessProfile);

    if (!accessProfile?.isReadOnly) return;

    const heroCopy = document.querySelector('.page-hero-copy');
    if (heroCopy && !heroCopy.querySelector('.access-role-badge')) {
        const badge = document.createElement('span');
        badge.className = 'access-role-badge';
        badge.textContent = 'Panel de Visualizacion';
        heroCopy.appendChild(badge);
    }
}

function initializeDashboardConnectionClock() {
    const statusLabel = document.getElementById('dashboard-connection-status');
    const dateTimeLabel = document.getElementById('dashboard-live-datetime');
    if (!statusLabel && !dateTimeLabel) return;

    const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const renderConnectionClock = () => {
        if (statusLabel) {
            statusLabel.textContent = 'SISTEMA ONLINE';
        }

        if (dateTimeLabel) {
            dateTimeLabel.textContent = dateTimeFormatter.format(new Date());
        }
    };

    renderConnectionClock();
    window.setInterval(renderConnectionClock, 1000);
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

    menu.innerHTML = filteredPozos.map(item => `
        <button type="button" class="pozo-selector-option ${item.pozo_name === hiddenInput.value ? 'active' : ''}" data-pozo="${escapeHtml(item.pozo_name)}">
            <span class="pozo-status-dot ${item.has_records ? 'active' : 'inactive'}"></span>
            <span class="pozo-option-name">${escapeHtml(item.pozo_name)}</span>
            <span class="pozo-option-state ${item.has_records ? 'active' : 'inactive'}">${item.has_records ? 'Con registros' : 'Sin registros'}</span>
        </button>
    `).join('');

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

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (accessProfile.isFieldOperator) {
        window.location.href = 'field.html';
        return;
    }

    applyDashboardAccessProfile(accessProfile);
    initializeDashboardConnectionClock();

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
        pozoSummaries = await getPozosHistorySummary();
        const pozos = pozoSummaries.map(item => item.pozo_name);
        const pozoFilter = document.getElementById('filter-pozo');
        const pozoFilterDisplay = document.getElementById('filter-pozo-display');
        const storedPozo = getStoredSelectedPozo();

        // Toma la fecha mas reciente de la base para no abrir el dashboard vacio.
        const latestDate = await getLatestDate();
        if (latestDate) {
            document.getElementById('filter-start').value = latestDate;
            document.getElementById('filter-end').value = latestDate;
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
                if (pozoDate) {
                    document.getElementById('filter-start').value = pozoDate;
                    document.getElementById('filter-end').value = pozoDate;
                } else {
                    document.getElementById('filter-start').value = '';
                    document.getElementById('filter-end').value = '';
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
        updateDashboard();
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

    document.addEventListener('click', (event) => {
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
    });
    
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
                } else {
                    await applyFocusedMonitoringRange(pozoName, historicalRecordOptions[0]?.date || null);
                }
            }

            syncTrendWindowControl(Boolean(pozoName));
            updateDashboard();
        });

        syncTrendWindowControl(Boolean(document.getElementById('filter-pozo')?.value));
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
    window.addEventListener('resize', () => {
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
    });

    initializeStatusDonutInteractions();
});

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

    const start = document.getElementById('filter-start').value || null;
    const end = document.getElementById('filter-end').value || null;
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
        title.textContent = trendWindowMode === TREND_WINDOW_MODES.latest30
            ? `Analizando Pozo: ${latest.pozo_name} (Ultimos ${MONITORING_RECORD_WINDOW} registros)`
            : trendWindowMode === TREND_WINDOW_MODES.latest15
                ? `Analizando Pozo: ${latest.pozo_name} (Ultimos ${FOCUSED_TREND_RECORD_COUNT} registros)`
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
            toolbar: { show: true },
            zoom: { enabled: true },
            animations: { enabled: true, easing: 'easeinout', speed: 800 },
            background: 'transparent',
            fontFamily: 'Outfit, Inter, sans-serif'
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

    const makeSeries = (nameSuffix, field, pozo) => ({
        name: isComparison ? `${pozo} (${nameSuffix})` : nameSuffix,
        data: scopedTimeline
            .filter(d => d.pozo_name === pozo)
            .map(d => {
                const rawValue = d[field];
                const numericValue = rawValue !== null && rawValue !== undefined && rawValue !== ''
                    ? Number(rawValue)
                    : null;

                if (useFocusedTrendAxis && !Number.isFinite(numericValue)) {
                    return null;
                }

                const pointTimestamp = new Date(`${d.fecha}T${d.hora}`).getTime();
                if (!Number.isFinite(pointTimestamp)) {
                    return null;
                }

                return {
                    x: pointTimestamp,
                    y: Number.isFinite(numericValue) ? numericValue : null
                };
            })
            .filter(Boolean)
    });

    // 1. FRECUENCIA
    const freqSeries = pozosPresentes.map(p => makeSeries('Hz', 'frecuencia', p));
    renderOrUpdate('chart-frecuencia', {
        ...getBaseOptions('Frecuencia (Hz)', REPSOL_ORANGE, 'Hz', TREND_AXIS_BASES.frecuencia),
        yaxis: {
            ...getBaseOptions('Frecuencia (Hz)', REPSOL_ORANGE, 'Hz', TREND_AXIS_BASES.frecuencia).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.frecuencia, freqSeries)
        },
        series: freqSeries
    });

    // 2. PIP (FONDO)
    const pipSeries = pozosPresentes.map(p => makeSeries('PSI', 'pip', p));
    renderOrUpdate('chart-pip', {
        ...getBaseOptions('Presión PIP (PSI)', REPSOL_RED, 'PSI', TREND_AXIS_BASES.pip),
        yaxis: {
            ...getBaseOptions('Presión PIP (PSI)', REPSOL_RED, 'PSI', TREND_AXIS_BASES.pip).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.pip, pipSeries)
        },
        series: pipSeries
    });

    // 3. TM (MOTOR)
    const tmSeries = pozosPresentes.map(p => makeSeries('°F', 'tm', p));
    renderOrUpdate('chart-tm', {
        ...getBaseOptions('Temperatura Motor (°F)', TECH_PURPLE, '°F', TREND_AXIS_BASES.tm),
        yaxis: {
            ...getBaseOptions('Temperatura Motor (°F)', TECH_PURPLE, '°F', TREND_AXIS_BASES.tm).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.tm, tmSeries)
        },
        series: tmSeries
    });

    // 4. SUPERFICIE (THP / CHP / LF)
    const surfSeries = [];
    pozosPresentes.forEach(p => {
        surfSeries.push(makeSeries('THP', 'presion_thp', p));
        surfSeries.push(makeSeries('CHP', 'presion_chp', p));
        surfSeries.push(makeSeries('LF', 'presion_lf', p));
    });
    renderOrUpdate('chart-superficie', {
        ...getBaseOptions('Presión Superficie (PSI)', [TECH_BLUE, TECH_CYAN, '#0F766E'], 'PSI', TREND_AXIS_BASES.superficie),
        yaxis: {
            ...getBaseOptions('Presión Superficie (PSI)', [TECH_BLUE, TECH_CYAN, '#0F766E'], 'PSI', TREND_AXIS_BASES.superficie).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.superficie, surfSeries)
        },
        series: surfSeries
    });

    // 5. CORRIENTE MOTOR
    const currSeries = pozosPresentes.map(p => makeSeries('Amp', 'corriente_motor', p));
    renderOrUpdate('chart-motor-curr', {
        ...getBaseOptions('Corriente Motor (Amp)', TECH_BLUE, 'Amp', TREND_AXIS_BASES.corrienteMotor),
        yaxis: {
            ...getBaseOptions('Corriente Motor (Amp)', TECH_BLUE, 'Amp', TREND_AXIS_BASES.corrienteMotor).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.corrienteMotor, currSeries)
        },
        series: currSeries
    });

    // 6. VSD TRÍFASICO (A / B / C)
    const vsdSeries = [];
    pozosPresentes.forEach(p => {
        vsdSeries.push(makeSeries('VSD A', 'vsd_a', p));
        vsdSeries.push(makeSeries('VSD B', 'vsd_b', p));
        vsdSeries.push(makeSeries('VSD C', 'vsd_c', p));
    });
    renderOrUpdate('chart-vsd-triphase', {
        ...getBaseOptions('Corriente VSD (Amp)', ['#6366F1', '#EC4899', '#F43F5E'], 'Amp', TREND_AXIS_BASES.vsd),
        yaxis: {
            ...getBaseOptions('Corriente VSD (Amp)', ['#6366F1', '#EC4899', '#F43F5E'], 'Amp', TREND_AXIS_BASES.vsd).yaxis,
            ...getExpandedAxisConfig(TREND_AXIS_BASES.vsd, vsdSeries)
        },
        series: vsdSeries
    });
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
    data.slice(0, 15).forEach(record => {
        const observationText = formatObservationText(record.observaciones);
        if (observationText) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-body);">
                <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">${escapeHtml(record.pozo_name)} - ${escapeHtml(record.fecha)} ${escapeHtml(record.hora)}</span>
                ${escapeHtml(observationText)}
            </td>`;
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

    if (charts[id]) {
        charts[id].updateOptions(options);
    } else {
        charts[id] = new ApexCharts(el, options);
        charts[id].render();
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

