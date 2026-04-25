/**
 * Modulo principal del dashboard.
 * Resuelve filtros, consulta datos y dibuja indicadores y graficas.
 */

import { logout, getAccessProfile, getSession } from './auth.js';
import { getMonitoringData, getLatestDate, getLatestMonitoringRecords, getNeighborRecords, getPozoRecordDates, getPozosHistorySummary, getWellRibbonData } from './data-service.js';
import { hideFullLoader, showFullLoader } from './ui.js';

let charts = {};
let isComparisonMode = false;
let isDarkMode = localStorage.getItem('theme-uv') === 'dark';
let resizeFrame = null;
let historicalRecordOptions = [];
let pozoSummaries = [];
let isLatestSevenTrendMode = false;
const FOCUSED_TREND_RECORD_COUNT = 15;
const ACTIVE_POZO_STORAGE_KEY = 'uv-selected-pozo';
const TREND_AXIS_BASES = {
    frecuencia: { min: 0, max: 60, step: 5, decimals: 1 },
    pip: { min: 0, max: 3000, step: 250, decimals: 0 },
    tm: { min: 0, max: 450, step: 25, decimals: 0 },
    superficie: { min: 0, max: 350, step: 25, decimals: 0 },
    corrienteMotor: { min: 0, max: 120, step: 10, decimals: 0 },
    vsd: { min: 0, max: 600, step: 50, decimals: 0 }
};

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
    if (!accessProfile?.isReadOnly) return;

    document.body.classList.add('access-readonly');

    document.querySelectorAll('a[href="data.html"]').forEach(link => {
        const label = link.querySelector('span');
        if (label) {
            label.textContent = 'Historial';
            return;
        }

        const textNode = [...link.childNodes]
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .find(node => node.textContent.trim());

        if (textNode) {
            textNode.textContent = ' Historial';
        }
    });

    document.querySelectorAll('a[href="dashboard-data.html"]').forEach(link => {
        link.style.display = 'none';
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
    });

    const heroCopy = document.querySelector('.page-hero-copy');
    if (heroCopy && !heroCopy.querySelector('.access-role-badge')) {
        const badge = document.createElement('span');
        badge.className = 'access-role-badge';
        badge.textContent = 'Panel de Visualizacion';
        heroCopy.appendChild(badge);
    }
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
        <button type="button" class="pozo-selector-option ${item.pozo_name === hiddenInput.value ? 'active' : ''}" data-pozo="${item.pozo_name}">
            <span class="pozo-status-dot ${item.has_records ? 'active' : 'inactive'}"></span>
            <span class="pozo-option-name">${item.pozo_name}</span>
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
        if (bounds.min < min) {
            min = roundDownToStep(bounds.min, baseConfig.step);
        }

        if (bounds.max > max) {
            max = roundUpToStep(bounds.max, baseConfig.step);
        }
    }

    if (max <= min) {
        max = min + baseConfig.step;
    }

    return {
        min,
        max,
        tickAmount: Math.max(2, Math.round((max - min) / baseConfig.step)),
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
            <button type="button" class="historical-record-option ${option.value === getSelectedHistoricalRecordValue() ? 'active' : ''}" data-value="${option.value}">
                <span class="historical-record-option-date">${option.date}</span>
                <span class="historical-record-option-time">${option.time}</span>
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

    const shouldEnable = Boolean(pozoName && !isComparisonMode);
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

    applyDashboardAccessProfile(getAccessProfile(session));

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
        const comparePanel = document.getElementById('comparison-panel');
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
            }
        }

        if (comparePanel) {
            comparePanel.innerHTML = '';
            pozos.sort().forEach(pozo => {
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                label.innerHTML = `<input type="checkbox" name="compare-pozo" value="${pozo}"> ${pozo}`;
                comparePanel.appendChild(label);
            });
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

    // Conecta eventos de filtros, logout, comparacion y navegacion historica.
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

    const trendWindowBtn = document.getElementById('btn-trend-last-7');
    if (trendWindowBtn) {
        trendWindowBtn.addEventListener('click', () => {
            isLatestSevenTrendMode = !isLatestSevenTrendMode;
            trendWindowBtn.classList.toggle('active', isLatestSevenTrendMode);
            trendWindowBtn.setAttribute('aria-pressed', String(isLatestSevenTrendMode));
            trendWindowBtn.textContent = isLatestSevenTrendMode
                ? 'Volver a vista normal'
                : `Ver ultimos ${FOCUSED_TREND_RECORD_COUNT} registros`;
            updateDashboard();
        });
    }

    // Activa o desactiva la comparacion simultanea entre pozos.
    const compareToggleBtn = document.getElementById('btn-toggle-compare');
    if (compareToggleBtn) {
        compareToggleBtn.addEventListener('click', () => {
            isComparisonMode = !isComparisonMode;
            document.getElementById('comparison-panel').classList.toggle('active', isComparisonMode);
            document.getElementById('single-pozo-container').style.display = isComparisonMode ? 'none' : 'block';
            compareToggleBtn.classList.toggle('active', isComparisonMode);
            compareToggleBtn.textContent = isComparisonMode ? 'VISTA SIMPLE' : 'COMPARAR';
            compareToggleBtn.title = isComparisonMode ? 'Volver a vista simple' : 'Comparar pozos';
            compareToggleBtn.setAttribute('aria-label', isComparisonMode ? 'Volver a vista simple' : 'Comparar pozos');
            syncHistoricalRecordSelector(document.getElementById('filter-pozo')?.value || '', true);
        });
    }

    // Permite moverse entre registros historicos del pozo activo.
    const shiftDate = (delta) => {
        const currentValue = getSelectedHistoricalRecordValue();
        const currentIndex = historicalRecordOptions.findIndex(option => option.value === currentValue);
        if (currentIndex === -1) return;

        const nextIndex = currentIndex + delta;
        if (nextIndex < 0 || nextIndex >= historicalRecordOptions.length) return;

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
        });
    });
});

async function updateDashboard() {
    let selectedPozos = [];
    
    if (isComparisonMode) {
        const checkboxes = document.querySelectorAll('input[name="compare-pozo"]:checked');
        selectedPozos = Array.from(checkboxes).map(c => c.value);
    } else {
        const val = document.getElementById('filter-pozo').value;
        if (val) selectedPozos = [val];
    }

    if (selectedPozos.length === 0) {
        if (!isComparisonMode) {
            setStoredSelectedPozo('');
        }
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
    
    // Activa skeletons mientras resolvemos consultas y volvemos a dibujar las visualizaciones.
    // Activa skeletons mientras llegan datos y se repinta la vista.
    const chartContainers = document.querySelectorAll('.chart-space, .trend-space');
    chartContainers.forEach(el => el.parentElement.classList.add('loading-skeleton'));

    try {
        const data = await getMonitoringData(selectedPozos, start, end);
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
                    ? `Pozo ${selectedPozos[0]} sin telemetria para la fecha seleccionada. Mostrando Produccion Tecnica.`
                    : `Pozo ${selectedPozos[0]} sin telemetria ni Produccion Tecnica disponible.`;
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

        const shouldUseFocusedTrendData = isLatestSevenTrendMode && selectedPozos.length === 1 && !isComparisonMode;

        // Trae vecinos anterior/siguiente para que las lineas no queden cortadas en filtros cerrados.
        let extendedData = [...data];
        if (!shouldUseFocusedTrendData && data.length > 0 && selectedPozos.length === 1 && !isComparisonMode) {
            // Busca el registro mas viejo del bloque filtrado.
            const oldestDate = data[data.length - 1].fecha; 
            // Busca el registro mas reciente del bloque filtrado.
            const newestDate = data[0].fecha;
            
            // Trae vecinos fuera del rango para evitar cortes bruscos en las lineas.
            const neighbors = await getNeighborRecords(selectedPozos[0], oldestDate, newestDate);
            extendedData = [...extendedData, ...neighbors];
        }

        const trendSourceData = shouldUseFocusedTrendData
            ? await getLatestMonitoringRecords(selectedPozos[0], FOCUSED_TREND_RECORD_COUNT)
            : extendedData;

        // Ordena por fecha y hora antes de alimentar las graficas de tendencia.
        const timelineData = [...trendSourceData].sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            return dateA - dateB;
        });

        // Filtra observaciones para que solo queden las del contexto visible.
        const filteredObs = data.filter(d => {
            if (isComparisonMode) return selectedPozos.includes(d.pozo_name);
            if (selectedPozos.length === 1) return d.pozo_name === selectedPozos[0];
            return true; // Caso comodin cuando no hay filtro puntual.
        });

        const activeRecord = selectedPozos.length === 1 && selectedRecordValue
            ? data.find(record => `${record.fecha}T${record.hora}` === selectedRecordValue) || data[0]
            : data[0];

        renderKPIs(activeRecord);
        renderStatusDonut(data);
        renderCoreTrends(timelineData, selectedPozos, {
            latestRecordsOnly: isLatestSevenTrendMode,
            latestRecordCount: FOCUSED_TREND_RECORD_COUNT
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

    const rotationBadge = document.getElementById('rotation-badge');
    const rotationValue = document.getElementById('rotation-badge-value');
    if (rotationBadge) rotationBadge.style.display = 'none';
    if (rotationValue) rotationValue.textContent = '--';

    const tbody = document.getElementById('obs-body');
    if (tbody) tbody.innerHTML = '<tr><td style="padding: 20px; text-align: center; color: var(--text-muted);">No hay registros</td></tr>';
}

/**
 * Indicadores rapidos y gauges del encabezado operativo.
 */
function renderKPIs(latest) {
    createEliteGauge('gauge-frecuencia', latest.frecuencia, 0, 60, 'Hz', '#2563EB');
    createEliteGauge('gauge-pip', latest.pip, 0, 5000, 'PSI', '#DC2626');
    createEliteGauge('gauge-tm', latest.tm, 0, 450, '°F', '#9333EA');

    const rotationBadge = document.getElementById('rotation-badge');
    const rotationValue = document.getElementById('rotation-badge-value');
    const rawRotation = String(latest?.sentido_giro || '').trim();

    if (rotationBadge && rotationValue) {
        if (!isComparisonMode && rawRotation) {
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
        title.textContent = isComparisonMode 
            ? `Comparando ${latest.pozo_name} y otros` 
            : `Analizando Pozo: ${latest.pozo_name} (Último: ${latest.fecha} ${latest.hora})`;
    }
}

function createEliteGauge(id, value, min, max, unit, color) {
    const val = Number(value) || 0;
    const percentage = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    
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
            height: 200, 
            sparkline: { enabled: true },
        },
        theme: { mode: effectiveMode },
        plotOptions: {
            radialBar: {
                startAngle: -115,
                endAngle: 115,
                hollow: { size: '68%', background: 'transparent' },
                track: { 
                    background: effectiveMode === 'dark' ? '#1E293B' : '#E2E8F0', 
                    strokeWidth: '97%', 
                    dropShadow: { enabled: true, top: 0, left: 0, blur: 3, opacity: 0.1 } 
                },
                dataLabels: {
                    name: { show: false },
                    value: {
                        offsetY: 10,
                        fontSize: '28px',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: '900',
                        color: effectiveMode === 'dark' ? '#F8FAFC' : '#1E293B',
                        formatter: () => `${val.toFixed(1)} ${unit}`
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

/**
 * Estado general del pozo segun sus registros operativos.
 */
function renderStatusDonut(data) {
    const runCount = data.filter(d => d.estatus === 'RUN').length;
    const offCount = data.filter(d => d.estatus === 'OFF').length;

    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';
    
    const options = {
        series: [runCount, offCount],
        labels: ['RUN', 'OFF'],
        chart: { type: 'donut', height: 180 },
        theme: { mode: effectiveMode },
        colors: ['#10B981', '#F43F5E'],
        dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, label: 'Registros', color: effectiveMode === 'dark' ? '#94A3B8' : '#64748B', formatter: () => data.length } } } } },
        legend: { position: 'bottom', labels: { colors: effectiveMode === 'dark' ? '#94A3B8' : '#6B7280' } }
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

    // Paleta principal de colores para tendencias y comparaciones.
    const REPSOL_ORANGE = '#FF8200';
    const REPSOL_RED = '#DA291C';
    const TECH_BLUE = '#2563EB';
    const TECH_CYAN = '#06B6D4';
    const TECH_PURPLE = '#7C3AED';

    const effectiveMode = (isDarkMode && !document.body.classList.contains('view-mode-report')) ? 'dark' : 'light';

    const formatTrendAxisLabel = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        return latestRecordsOnly
            ? date.toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
            : date.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short'
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
            background: 'transparent'
        },
        theme: { mode: effectiveMode },
        stroke: { curve: latestRecordsOnly ? 'straight' : 'smooth', width: 2, connectNulls: true },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [0, 90, 100]
            }
        },
        markers: {
            size: latestRecordsOnly ? 5 : 4,
            strokeWidth: 2,
            strokeColors: effectiveMode === 'dark' ? '#0F172A' : '#fff',
            hover: { size: 6 }
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
                style: { colors: effectiveMode === 'dark' ? '#94A3B8' : '#64748B', fontSize: '11px', fontWeight: 600 },
                formatter: formatTrendAxisLabel,
                rotate: latestRecordsOnly ? -20 : 0,
                hideOverlappingLabels: true,
                showDuplicates: false
            }
        },
        yaxis: {
            title: { text: title, style: { color: effectiveMode === 'dark' ? '#E2E8F0' : '#475569', fontWeight: 700 } },
            ...getExpandedAxisConfig(axisBase, []),
            labels: { 
                style: { colors: effectiveMode === 'dark' ? '#94A3B8' : '#64748B', fontWeight: 600 },
                formatter: (v) => v === null || v === undefined ? v : `${Number(v).toFixed(axisBase.decimals)} ${unit}`
            }
        },
        colors: Array.isArray(color) ? color : [color, REPSOL_RED, TECH_BLUE, TECH_CYAN, TECH_PURPLE],
        tooltip: {
            theme: effectiveMode,
            x: {
                formatter: (value) => {
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) return '';

                    return date.toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
        }
    });

    const makeSeries = (nameSuffix, field, pozo) => ({
        name: isComparison ? `${pozo} (${nameSuffix})` : nameSuffix,
        data: scopedTimeline.filter(d => d.pozo_name === pozo).map(d => ({
            x: new Date(`${d.fecha}T${d.hora}`).getTime(),
            y: d[field] !== null ? Number(d[field]) : null
        }))
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
    const span = Math.max(maxTimestamp - minTimestamp, 60 * 60 * 1000);
    const padding = Math.min(span * 0.12, 12 * 60 * 60 * 1000);

    return {
        min: minTimestamp - padding,
        max: maxTimestamp + padding
    };
}

function renderObservations(data) {
    const tbody = document.getElementById('obs-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.slice(0, 15).forEach(record => {
        if (record.observaciones) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-body);">
                <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">${record.pozo_name} - ${record.fecha} ${record.hora}</span>
                ${record.observaciones}
            </td>`;
            tbody.appendChild(tr);
        }
    });
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
        'rb-pump': data?.pump_type || '--',
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

