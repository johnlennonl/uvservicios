import { getMonitoringData, getPozosHistorySummary, getWellLevelTests } from './data-service.js';
import { getActiveOperationalScopeWellNames } from './services/operational-scope-context.js';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let customChartsInstances = [];
let selectedCustomWells = [];
let availableCustomPozos = [];
let activeCustomScopePozos = [];

function normalizePozoName(value) {
    return String(value || '').trim().toUpperCase();
}

const VARIABLE_CONFIG = {
    presion_chp: { label: 'Presión CHP', unit: 'psi', color: '#2563EB', key: 'presion_chp' }, // Azul Rey
    presion_thp: { label: 'Presión THP', unit: 'psi', color: '#D97706', key: 'presion_thp' }, // Ámbar
    presion_lf: { label: 'Presión LF', unit: 'psi', color: '#059669', key: 'presion_lf' }, // Verde Esmeralda
    pip: { label: 'Presión PIP', unit: 'psi', color: '#7C3AED', key: 'pip' }, // Violeta
    corriente_motor: { label: 'Corriente Motor', unit: 'A', color: '#DC2626', key: 'corriente_motor' }, // Rojo
    frecuencia: { label: 'Frecuencia VSD', unit: 'Hz', color: '#65A30D', key: 'frecuencia' }, // Verde Lima (antes celeste)
    vsd_a: { label: 'VSD A', unit: 'V/A', color: '#EA580C', key: 'vsd_a' }, // Naranja
    vsd_b: { label: 'VSD B', unit: 'V/A', color: '#4F46E5', key: 'vsd_b' }, // Índigo
    vsd_c: { label: 'VSD C', unit: 'V/A', color: '#0891B2', key: 'vsd_c' }, // Cian
    tm: { label: 'Temperatura TM', unit: '°F', color: '#D946EF', key: 'tm' }, // Fucsia (antes morado)
    nivel_dinamico: { label: 'Nivel Dinámico (Echó.)', unit: 'ft', color: '#0D9488', key: 'nivel_dinamico' }, // Teal
    sumergencia: { label: 'Sumergencia (Echó.)', unit: 'ft', color: '#F43F5E', key: 'sumergencia' }, // Rosa Vibrante
    echometer_pip: { label: 'Presión PIP (Echó.)', unit: 'psi', color: '#475569', key: 'echometer_pip' } // Pizarra Oscuro
};

function isScatterMetric(varKey) {
    const key = String(varKey || '').trim().toLowerCase();
    return key === 'nivel_dinamico' || key === 'sumergencia' || key === 'echometer_pip';
}

function formatIsoDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getRangeDatesForDays(daysCount) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (daysCount - 1));
    return { startIso: formatIsoDate(start), endIso: formatIsoDate(end) };
}

export function initCustomReportsTab() {
    setupTabNavigation();
    setupQuickDaysPresets();
    setupCustomWellSelector();
    setupFormSubmission();
    setupExportButtons();
    setDefaultDates(15);
}

function setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.stats-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            const targetId = btn.dataset.target;
            document.querySelectorAll('.stats-tab-pane').forEach(pane => {
                pane.hidden = pane.id !== targetId;
            });
        });
    });
}

function setDefaultDates(days) {
    const { startIso, endIso } = getRangeDatesForDays(days);
    const startInput = document.getElementById('custom-start-date');
    const endInput = document.getElementById('custom-end-date');
    if (startInput) startInput.value = startIso;
    if (endInput) endInput.value = endIso;
}

function setupQuickDaysPresets() {
    const presetBtns = document.querySelectorAll('.custom-days-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const days = parseInt(btn.dataset.days, 10);
            if (!isNaN(days)) {
                setDefaultDates(days);
            }
        });
    });
}

async function setupCustomWellSelector() {
    try {
        activeCustomScopePozos = [...new Set((await getActiveOperationalScopeWellNames()).map(normalizePozoName).filter(Boolean))];
        const summaries = await getPozosHistorySummary();
        const scopeSet = new Set(activeCustomScopePozos);
        availableCustomPozos = (summaries || []).filter(item => scopeSet.has(normalizePozoName(item.pozo_name)));
        renderCustomWellDropdown('');
    } catch (err) {
        console.error('Error cargando pozos para selector:', err);
    }

    const input = document.getElementById('custom-ms-input');
    const dropdown = document.getElementById('custom-ms-dropdown');
    const container = document.getElementById('custom-report-wells-container');
    if (!input || !dropdown || !container) return;

    container.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && !e.target.classList.contains('ms-chip-remove')) {
            dropdown.hidden = false;
            input.focus();
        }
    });

    input.addEventListener('focus', () => {
        dropdown.hidden = false;
        renderCustomWellDropdown(input.value);
    });

    input.addEventListener('input', () => {
        dropdown.hidden = false;
        renderCustomWellDropdown(input.value);
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.hidden = true;
        }
    });
}

function renderCustomWellDropdown(searchQuery = '') {
    const dropdown = document.getElementById('custom-ms-dropdown');
    if (!dropdown) return;

    const query = String(searchQuery || '').trim().toLowerCase();
    const filtered = availableCustomPozos.filter(item => {
        if (!query) return true;
        return (item.pozo_name || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:14px; text-align:center; color:#64748b; font-weight:700;">No hay pozos para esa búsqueda</div>';
        return;
    }

    const isAllSelected = availableCustomPozos.length > 0 && selectedCustomWells.length === availableCustomPozos.length;
    const selectAllHtml = `
        <button type="button" class="pozo-selector-option select-all-option ${isAllSelected ? 'active' : ''}" style="background:#f1f5f9; border-bottom:1px solid #cbd5e1; font-weight:800; color:#2563eb;">
            <span class="pozo-status-dot active"></span>
            <span class="pozo-option-name">${isAllSelected ? '✓ Todos los pozos seleccionados' : ' Seleccionar Todos los Pozos'}</span>
            <span style="margin-left:auto; font-size:0.75rem; font-weight:700; color:#64748b;">(${availableCustomPozos.length} pozos)</span>
        </button>
    `;

    dropdown.innerHTML = selectAllHtml + filtered.map(item => {
        const pozoName = item.pozo_name;
        const isSelected = selectedCustomWells.includes(pozoName);

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
            <button type="button" class="pozo-selector-option ${isSelected ? 'active' : ''}" data-pozo="${escapeHtml(pozoName)}">
                <span class="pozo-status-dot ${dotClass}"></span>
                <span class="pozo-option-name">${escapeHtml(pozoName)}</span>
                <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                    <span class="pozo-option-state ${stateClass}">${stateText}</span>
                    <span style="font-weight: 800; font-size: 0.95rem; color: #2563eb; width: 14px; text-align: center;">${isSelected ? '✓' : ''}</span>
                </div>
            </button>
        `;
    }).join('');

    const selectAllBtn = dropdown.querySelector('.select-all-option');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectedCustomWells.length === availableCustomPozos.length) {
                selectedCustomWells = [];
            } else {
                selectedCustomWells = availableCustomPozos.map(w => w.pozo_name);
            }
            renderCustomWellChips();
            const input = document.getElementById('custom-ms-input');
            if (input) input.value = '';
            dropdown.hidden = true;
        });
    }

    dropdown.querySelectorAll('.pozo-selector-option[data-pozo]').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pozo = button.dataset.pozo;
            toggleSelectCustomWell(pozo);
            renderCustomWellChips();
            const input = document.getElementById('custom-ms-input');
            if (input) input.value = '';
            dropdown.hidden = true;
        });
    });
}

function toggleSelectCustomWell(pozo) {
    if (selectedCustomWells.includes(pozo)) {
        selectedCustomWells = selectedCustomWells.filter(p => p !== pozo);
    } else {
        selectedCustomWells.push(pozo);
    }
}

function renderCustomWellChips() {
    const chipsHolder = document.getElementById('custom-ms-chips');
    const input = document.getElementById('custom-ms-input');
    if (!chipsHolder) return;

    chipsHolder.innerHTML = selectedCustomWells.map(pozo => `
        <span class="ms-chip">
            ${escapeHtml(pozo)}
            <button type="button" class="ms-chip-remove" data-pozo="${escapeHtml(pozo)}">&times;</button>
        </span>
    `).join('');

    if (input) {
        if (selectedCustomWells.length > 0) {
            input.placeholder = 'Seleccionar otro pozo...';
        } else {
            input.placeholder = 'Buscar y elegir pozo(s)...';
        }
    }

    chipsHolder.querySelectorAll('.ms-chip-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pozo = btn.dataset.pozo;
            toggleSelectCustomWell(pozo);
            renderCustomWellChips();
            renderCustomWellDropdown(document.getElementById('custom-ms-input')?.value || '');
        });
    });
}

function setupFormSubmission() {
    const form = document.getElementById('custom-report-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await generateCustomReport();
    });
}

async function generateCustomReport() {
    const startIso = document.getElementById('custom-start-date')?.value;
    const endIso = document.getElementById('custom-end-date')?.value;
    const customTitle = document.getElementById('custom-report-title-input')?.value?.trim();

    if (selectedCustomWells.length === 0) {
        alert('Por favor busca y selecciona al menos un pozo para generar el reporte (o usa la opción "Seleccionar Todos los Pozos").');
        return;
    }

    const selectedVarCheckboxes = document.querySelectorAll('input[name="custom-vars"]:checked');
    const selectedVarKeys = Array.from(selectedVarCheckboxes).map(cb => cb.value);

    if (selectedVarKeys.length === 0) {
        alert('Por favor selecciona al menos una variable a graficar.');
        return;
    }

    const outputContainer = document.getElementById('custom-report-output');
    if (outputContainer) outputContainer.style.display = 'block';

    const kpisGrid = document.getElementById('custom-report-kpis-grid');
    if (kpisGrid) {
        kpisGrid.innerHTML = '<div style="padding:20px; text-align:center; width:100%;"><strong>Consultando y generando reporte...</strong></div>';
    }

    try {
        const scopedSelectedWells = selectedCustomWells.filter(pozo => activeCustomScopePozos.includes(normalizePozoName(pozo)));
        if (!scopedSelectedWells.length) {
            alert('Los pozos seleccionados no pertenecen al contrato activo. Selecciona pozos de este contrato.');
            return;
        }
        const telemetryRows = await getMonitoringData(scopedSelectedWells, startIso, endIso);

        // Consultar las pruebas de nivel por Echómetro para los pozos seleccionados en el rango de fechas
        let levelTests = [];
        try {
            const levelPromises = scopedSelectedWells.map(well => getWellLevelTests(well));
            const levelResults = await Promise.all(levelPromises);
            levelResults.forEach((wellTests, index) => {
                const wellName = scopedSelectedWells[index];
                (wellTests || []).forEach(test => {
                    const testDate = test.fecha; // 'YYYY-MM-DD'
                    if (testDate >= startIso && testDate <= endIso) {
                        levelTests.push({
                            pozo_name: wellName,
                            fecha: testDate,
                            nivel_dinamico: test.nivel_dinamico,
                            sumergencia: test.sumergencia,
                            presion_pip: test.presion_pip
                        });
                    }
                });
            });
        } catch (e) {
            console.warn('No se pudieron cargar las pruebas de nivel por Echómetro:', e);
        }

        // Fusionar cronológicamente los datos de telemetría y pruebas de nivel
        const mergedRowsMap = new Map();

        // 1. Agregar registros de telemetría
        (telemetryRows || []).forEach(row => {
            const key = `${row.pozo_name.toUpperCase()}|${row.fecha}`;
            mergedRowsMap.set(key, {
                ...row,
                nivel_dinamico: null,
                sumergencia: null,
                echometer_pip: null
            });
        });

        // 2. Fusionar registros de nivel
        levelTests.forEach(test => {
            const key = `${test.pozo_name.toUpperCase()}|${test.fecha}`;
            const existing = mergedRowsMap.get(key);
            if (existing) {
                existing.nivel_dinamico = test.nivel_dinamico;
                existing.sumergencia = test.sumergencia;
                existing.echometer_pip = test.presion_pip;
            } else {
                mergedRowsMap.set(key, {
                    pozo_name: test.pozo_name,
                    fecha: test.fecha,
                    hora: '00:00:00',
                    estatus: 'RUN',
                    nivel_dinamico: test.nivel_dinamico,
                    sumergencia: test.sumergencia,
                    echometer_pip: test.presion_pip,
                    presion_chp: null,
                    presion_thp: null,
                    presion_lf: null,
                    pip: null,
                    corriente_motor: null,
                    frecuencia: null,
                    vsd_a: null,
                    vsd_b: null,
                    vsd_c: null,
                    tm: null
                });
            }
        });

        const rows = [...mergedRowsMap.values()];
        const sortedRows = (rows || []).sort((a, b) => {
            const dA = `${a.fecha || ''} ${a.hora || ''}`;
            const dB = `${b.fecha || ''} ${b.hora || ''}`;
            return dA.localeCompare(dB);
        });

        // Actualizar cabecera del papel
        document.getElementById('custom-paper-title').textContent = customTitle || (selectedCustomWells.length > 0 ? `Reporte de Monitoreo - Pozo(s): ${selectedCustomWells.join(', ')}` : 'Reporte de Monitoreo General de Campo');
        document.getElementById('meta-wells-val').textContent = selectedCustomWells.length > 0 ? selectedCustomWells.join(', ') : 'Todos los pozos';
        document.getElementById('meta-range-val').textContent = `${startIso} al ${endIso}`;

        const varNamesList = selectedVarKeys.map(k => (VARIABLE_CONFIG[k] ? VARIABLE_CONFIG[k].label : k)).join(', ');
        document.getElementById('meta-vars-val').textContent = varNamesList || 'Ninguna';

        document.getElementById('meta-records-val').textContent = sortedRows.length;
        document.getElementById('meta-date-val').textContent = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

        renderMetricsKPIs(sortedRows, selectedVarKeys);
        renderCharts(sortedRows, selectedVarKeys);
        renderTable(sortedRows, selectedVarKeys);

        // Desplazar suavemente hacia el reporte generado
        outputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
        console.error('Error generando reporte personalizado:', err);
        if (kpisGrid) {
            kpisGrid.innerHTML = `<div class="stats-kpi-card" style="background:#FFEDED; border-color:#FCA5A5;"><strong>Error</strong><div>${String(err.message || err)}</div></div>`;
        }
    }
}

function renderMetricsKPIs(rows, varKeys) {
    const kpisGrid = document.getElementById('custom-report-kpis-grid');
    if (!kpisGrid) return;

    if (rows.length === 0) {
        kpisGrid.innerHTML = '<div class="empty-panel compact" style="width:100%;"><strong>No hay registros para las fechas y pozos seleccionados.</strong></div>';
        return;
    }

    kpisGrid.innerHTML = varKeys.map(key => {
        const config = VARIABLE_CONFIG[key] || { label: key, unit: '', color: '#2563eb' };
        const validRows = rows
            .map(r => ({
                pozo: r.pozo_name || 'Pozo',
                val: Number(r[key]),
                fecha: r.fecha,
                hora: r.hora
            }))
            .filter(item => typeof item.val === 'number' && !isNaN(item.val));

        if (validRows.length === 0) {
            return `
                <div class="custom-kpi-card">
                    <span class="custom-kpi-label">${config.label}</span>
                    <strong class="custom-kpi-value">--</strong>
                    <span class="custom-kpi-sub">Sin datos en el periodo</span>
                </div>
            `;
        }

        // Agrupar lecturas por pozo individual
        const pozoMap = new Map();
        validRows.forEach(item => {
            if (!pozoMap.has(item.pozo)) pozoMap.set(item.pozo, []);
            pozoMap.get(item.pozo).push(item);
        });

        const pozoStats = Array.from(pozoMap.entries()).map(([pozoName, items]) => {
            const sum = items.reduce((a, b) => a + b.val, 0);
            const avg = sum / items.length;
            const latest = items[items.length - 1].val;
            return { pozo: pozoName, avg, latest, count: items.length };
        });

        const globalSum = validRows.reduce((a, b) => a + b.val, 0);
        const globalAvg = globalSum / validRows.length;

        // Renderizar lista de promedios individuales por pozo
        const wellsBreakdownHtml = pozoStats.map(stat => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:5px 9px; border-radius:6px; border:1px solid #e2e8f0; font-size:0.75rem;">
                <span style="font-weight:700; color:#334155; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:55%;">${escapeHtml(stat.pozo)}</span>
                <span style="color:#0f172a; font-weight:800;">Prom: <span style="color:${config.color}; font-weight:800;">${stat.avg.toFixed(1)} ${config.unit}</span></span>
            </div>
        `).join('');

        return `
            <div class="custom-kpi-card" style="border-top: 4px solid ${config.color}; padding:14px; background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0; border-top-width:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="custom-kpi-label" style="font-size:0.85rem; font-weight:700; color:#334155;">${config.label} (${config.unit})</span>
                    <span style="font-size:0.72rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">
                        ${pozoStats.length > 1 ? `${pozoStats.length} Pozos` : escapeHtml(pozoStats[0].pozo)}
                    </span>
                </div>

                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px;">
                    <strong class="custom-kpi-value" style="color:${config.color}; font-size:1.75rem; font-weight:800;">
                        ${globalAvg.toFixed(1)} <small style="font-size:0.9rem; font-weight:600;">${config.unit}</small>
                    </strong>
                    <span style="font-size:0.72rem; color:#64748b; font-weight:600;">(Promedio del Campo)</span>
                </div>

                <div style="font-size:0.73rem; font-weight:700; color:#475569; margin-bottom:5px;">Promedio por Pozo:</div>
                <div style="display:flex; flex-direction:column; gap:4px; max-height:160px; overflow-y:auto;">
                    ${wellsBreakdownHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderCharts(rows, varKeys) {
    const container = document.getElementById('custom-report-charts-container');
    if (!container) return;

    // Destruir gráficos anteriores
    customChartsInstances.forEach(chart => {
        try { chart.destroy(); } catch (e) {}
    });
    customChartsInstances = [];
    container.innerHTML = '';

    if (rows.length === 0 || varKeys.length === 0) return;

    const chartMode = document.querySelector('input[name="custom-chart-mode"]:checked')?.value || 'combined';
    const chartStyle = document.getElementById('custom-chart-style')?.value || 'line';
    const showDataLabels = document.getElementById('custom-show-datalabels')?.checked ?? true;
    const enableShading = document.getElementById('custom-enable-shading')?.checked ?? true;

    if (chartMode === 'combined') {
        renderCombinedChart(container, rows, varKeys, chartStyle, showDataLabels, enableShading);
    } else {
        renderIndividualCharts(container, rows, varKeys, chartStyle, showDataLabels, enableShading);
    }
}

function calculateCorridorYAxisBounds(dataPoints, seriesIndex, totalSeriesCount) {
    const validValues = (dataPoints || [])
        .map(v => typeof v === 'object' ? Number(v.y) : Number(v))
        .filter(v => typeof v === 'number' && !isNaN(v));

    if (validValues.length === 0) return { min: 0, max: 100 };

    let minVal = Math.min(...validValues);
    let maxVal = Math.max(...validValues);

    // Si solo hay 1 serie en el lienzo, usar escalado proporcional normal
    if (totalSeriesCount <= 1) {
        const range = maxVal - minVal;
        const avgVal = validValues.reduce((a, b) => a + b, 0) / validValues.length;
        const minPadding = Math.max(range * 0.5, Math.abs(avgVal) * 0.15, 10);

        let yMin = Math.floor((minVal - minPadding) / 5) * 5;
        let yMax = Math.ceil((maxVal + minPadding) / 5) * 5;

        if (minVal >= 0 && yMin < 0) yMin = 0;
        return { min: yMin, max: yMax };
    }

    // Evitar división entre cero en series de valor constante
    if (minVal === maxVal) {
        minVal = Math.max(0, minVal - 5);
        maxVal = maxVal + 5;
    }

    const range = maxVal - minVal;

    // Asignar corredores horizontales garantizados con márgenes de separación limpios
    let bottomFraction = 0.05;
    let topFraction = 0.95;

    if (totalSeriesCount === 2) {
        if (seriesIndex === 0) {
            bottomFraction = 0.54; // Variable 0: 54% a 95% (Banda Superior)
            topFraction = 0.95;
        } else {
            bottomFraction = 0.05; // Variable 1: 5% a 46% (Banda Inferior)
            topFraction = 0.46;
        }
    } else if (totalSeriesCount >= 3) {
        if (seriesIndex === 0) {
            bottomFraction = 0.68; // Variable 0: 68% a 95% (Banda Alta)
            topFraction = 0.95;
        } else if (seriesIndex === 1) {
            bottomFraction = 0.36; // Variable 1: 36% a 62% (Banda Media)
            topFraction = 0.62;
        } else {
            bottomFraction = 0.05; // Variable 2: 5% a 30% (Banda Baja)
            topFraction = 0.30;
        }
    }

    const corridorWidth = topFraction - bottomFraction;
    const delta = range / corridorWidth;

    let yMin = minVal - bottomFraction * delta;
    let yMax = yMin + delta;

    // Si el valor real cae a 0 (ej. pozo apagado), permitir que la línea baje al piso 0
    if (minVal === 0) {
        yMin = 0;
    }

    return {
        min: Number(yMin.toFixed(2)),
        max: Number(yMax.toFixed(2))
    };
}

function calculateSmartYAxisBounds(values) {
    return calculateCorridorYAxisBounds(values, 0, 1);
}

function renderCombinedChart(container, rows, varKeys, chartStyle, showDataLabels, enableShading) {
    const uniqueWells = Array.from(new Set(rows.map(r => r.pozo_name || 'Pozo Sin Nombre'))).filter(Boolean);

    if (uniqueWells.length === 0) {
        container.innerHTML = '<div class="empty-panel compact">No hay lecturas disponibles para generar gráficos.</div>';
        return;
    }

    uniqueWells.forEach((pozoName, pIdx) => {
        const pozoRows = rows.filter(r => (r.pozo_name || 'Pozo Sin Nombre') === pozoName);
        if (pozoRows.length === 0) return;

        const safeId = `chart-combined-${pozoName.replace(/[^a-zA-Z0-9]/g, '_')}-${pIdx}`;
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'custom-chart-card';
        chartWrapper.style.marginBottom = '28px';
        chartWrapper.innerHTML = `
            <div class="chart-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <h3 style="font-size:1.05rem; font-weight:800; color:#0f172a;">📊 Gráfico Combinado Multivariable: <span style="color:#2563eb;">${escapeHtml(pozoName)}</span></h3>
                <span style="font-size:0.75rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:4px 12px; border-radius:12px; border:1px solid #bfdbfe;">
                    ${varKeys.length} Variables en Lienzo Único
                </span>
            </div>
            <div id="${safeId}" style="min-height: 420px; margin-top:10px;"></div>
        `;
        container.appendChild(chartWrapper);

        const seriesList = [];
        const yaxisConfigList = [];
        const colorsList = [];

        varKeys.forEach((key, idx) => {
            const config = VARIABLE_CONFIG[key] || { label: key, unit: '', color: '#2563eb' };
            const dataPoints = pozoRows.map(r => {
                const status = String(r.estatus || r.estado || 'RUN').trim().toUpperCase();
                const isOff = status === 'OFF';

                let yVal = null;
                const rawVal = r[key];
                if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
                    const num = Number(rawVal);
                    yVal = isNaN(num) ? null : num;
                }

                // Si el pozo está en OFF y el valor es nulo/vacío, lo forzamos a 0 para evitar vacíos/recortes en la gráfica
                if (isOff && (yVal === null || yVal === undefined)) {
                    yVal = 0;
                }

                const momentStr = `${r.fecha || ''} ${r.hora ? r.hora.substring(0, 5) : ''}`;
                return { x: momentStr, y: yVal };
            });

            const hasValidData = dataPoints.some(pt => pt.y !== null);
            if (hasValidData) {
                let seriesType = 'line';
                if (chartStyle === 'bar') {
                    seriesType = (idx % 2 === 0 ? 'column' : 'line');
                } else if (enableShading && !isScatterMetric(key)) {
                    seriesType = 'area';
                }
                seriesList.push({
                    name: `${config.label}`,
                    type: seriesType,
                    data: dataPoints,
                    unit: config.unit,
                    color: config.color,
                    key: key
                });
            }
        });

        if (seriesList.length === 0) {
            document.getElementById(safeId).parentNode.innerHTML = `<div style="padding:30px; text-align:center; color:#64748b;">Sin datos válidos para el pozo ${escapeHtml(pozoName)}.</div>`;
            return;
        }

        const totalSeriesCount = seriesList.length;

        seriesList.forEach((s, idx) => {
            colorsList.push(s.color);
            const isOpposite = idx % 2 === 1;
            const bounds = calculateCorridorYAxisBounds(s.data, idx, totalSeriesCount);

            yaxisConfigList.push({
                seriesName: s.name,
                opposite: isOpposite,
                min: bounds.min,
                max: bounds.max,
                forceNiceScale: false,
                axisTicks: { show: true },
                axisBorder: { show: true, color: s.color },
                labels: {
                    style: { colors: s.color, fontWeight: '700', fontSize: '11px' },
                    formatter: (val) => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(1) : ''
                },
                title: {
                    text: s.unit ? `${s.name} [${s.unit}]` : s.name,
                    style: { color: s.color, fontWeight: '700', fontSize: '11px' }
                },
                show: true
            });
        });

        const options = {
            chart: {
                type: 'line',
                height: 440,
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: false,
                        zoom: false,
                        zoomin: false,
                        zoomout: false,
                        pan: false,
                        reset: false
                    }
                },
                zoom: { enabled: false },
                animations: { enabled: false }
            },
            colors: colorsList,
            stroke: {
                curve: 'smooth',
                width: seriesList.map(s => isScatterMetric(s.key) ? 0 : (s.type === 'area' ? 2.5 : 3))
            },
            fill: {
                type: seriesList.some(s => s.type === 'area') ? 'gradient' : 'solid',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.35,
                    opacityTo: 0.05,
                    stops: [0, 90, 100]
                }
            },
            markers: {
                size: seriesList.map(s => isScatterMetric(s.key) ? 6 : 4.5),
                strokeColors: '#ffffff',
                strokeWidth: 1.5,
                hover: {
                    size: seriesList.map(s => isScatterMetric(s.key) ? 8 : 7)
                }
            },
        dataLabels: {
            enabled: showDataLabels,
            hideOverflowingLabels: true,
            formatter: function (val) {
                if (val === null || val === undefined) return '';
                const num = Number(val);
                if (isNaN(num)) return '';
                return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
            },
            offsetY: -6,
            style: {
                fontSize: '8px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: '800',
                colors: colorsList
            },
            background: { enabled: false },
            dropShadow: {
                enabled: true,
                top: 1,
                left: 1,
                blur: 2,
                color: '#ffffff',
                opacity: 1
            }
        },
            series: seriesList,
            xaxis: {
                type: 'category',
                labels: { rotate: -45, style: { fontSize: '11px', fontWeight: '600' } }
            },
            yaxis: yaxisConfigList,
            legend: {
                position: 'top',
                horizontalAlign: 'center',
                fontSize: '12px',
                fontWeight: '700',
                markers: { width: 10, height: 10, radius: 12 }
            },
            tooltip: {
                shared: true,
                intersect: false,
                custom: function({ series, seriesIndex, dataPointIndex, w }) {
                    const row = pozoRows[dataPointIndex];
                    if (!row) return '';

                    const dateStr = `${row.fecha || ''} ${row.hora ? row.hora.substring(0, 5) : ''}`;
                    const isOff = String(row.estatus || row.estado || '').trim().toUpperCase() === 'OFF';
                    const observation = row.observaciones ? String(row.observaciones).trim() : '';

                    let variablesHtml = '';
                    w.config.series.forEach((s) => {
                        const val = s.data[dataPointIndex]?.y;
                        const formattedVal = (val !== null && val !== undefined) ? val : '--';
                        const unit = s.unit || '';
                        const color = s.color || '#2563eb';
                        variablesHtml += `
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin:3px 0; font-size:0.85rem;">
                                <span style="display:flex; align-items:center; gap:6px; color:#334155; font-weight:600;">
                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${color};"></span>
                                    ${escapeHtml(s.name)}
                                </span>
                                <strong style="color:#0f172a;">${escapeHtml(formattedVal)} ${escapeHtml(unit)}</strong>
                            </div>
                        `;
                    });

                    return `
                        <div class="stats-combined-tooltip" style="padding:10px 14px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1); font-family:Inter, sans-serif; min-width:220px; color:#334155;">
                            <div style="font-size:0.78rem; color:#64748b; font-weight:700; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                                <span>${escapeHtml(dateStr)}</span>
                                ${isOff ? '<span style="color:#ef4444; font-weight:bold; background:#fef2f2; padding:1px 6px; border-radius:4px; font-size:0.7rem;">OFF</span>' : '<span style="color:#10b981; font-weight:bold; background:#ecfdf5; padding:1px 6px; border-radius:4px; font-size:0.7rem;">RUN</span>'}
                            </div>
                            <div style="margin-bottom:2px;">
                                ${variablesHtml}
                            </div>
                            ${observation ? `
                                <div style="margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9; color:#475569; text-align:left;">
                                    <b style="font-size:0.75rem; color:#1e293b; display:block; margin-bottom:2px;">Observación de Campo:</b>
                                    <p style="margin:0; font-size:0.8rem; line-height:1.25; color:#475569; font-weight:500; white-space:normal; word-break:break-word;">${escapeHtml(observation)}</p>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
            },
            grid: {
                borderColor: '#e2e8f0',
                padding: { left: 20, right: 20, top: 15, bottom: 15 }
            }
        };

        const chartInstance = new ApexCharts(document.getElementById(safeId), options);
        chartInstance.render();
        customChartsInstances.push(chartInstance);
    });
}

function renderIndividualCharts(container, rows, varKeys, chartStyle, showDataLabels, enableShading) {
    varKeys.forEach(key => {
        const config = VARIABLE_CONFIG[key] || { label: key, unit: '', color: '#2563eb' };

        const seriesByPozo = {};
        rows.forEach(r => {
            const pozo = r.pozo_name || 'Sin Nombre';
            const val = Number(r[key]);
            if (typeof val === 'number' && !isNaN(val)) {
                if (!seriesByPozo[pozo]) seriesByPozo[pozo] = [];
                const momentStr = `${r.fecha || ''} ${r.hora ? r.hora.substring(0, 5) : ''}`;
                seriesByPozo[pozo].push({ x: momentStr, y: val });
            }
        });

        const seriesList = Object.keys(seriesByPozo).map(pozoName => {
            let seriesType = 'line';
            if (chartStyle === 'bar') {
                seriesType = 'column';
            } else if (enableShading && !isScatterMetric(key)) {
                seriesType = 'area';
            }
            return {
                name: `${pozoName} - ${config.label}`,
                type: seriesType,
                data: seriesByPozo[pozoName]
            };
        });

        if (seriesList.length === 0) return;

        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'custom-chart-card';
        chartWrapper.style.marginBottom = '20px';
        chartWrapper.innerHTML = `
            <div class="chart-card-header">
                <h3>Tendencia Temporal: ${config.label} [${config.unit}]</h3>
            </div>
            <div id="chart-instance-${key}" style="min-height: 280px;"></div>
        `;
        container.appendChild(chartWrapper);

        const allIndividualPoints = seriesList.flatMap(s => s.data);
        const bounds = calculateSmartYAxisBounds(allIndividualPoints);

        const options = {
            chart: {
                type: 'line',
                height: 340,
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: { enabled: false }
            },
            colors: seriesList.length === 1 ? [config.color] : ['#2563EB', '#D97706', '#059669', '#7C3AED', '#DC2626', '#0284C7'],
            stroke: { curve: 'smooth', width: isScatterMetric(key) ? 0 : (enableShading ? 2.5 : 3) },
            fill: {
                type: (enableShading && !isScatterMetric(key)) ? 'gradient' : 'solid',
                gradient: { opacityFrom: 0.35, opacityTo: 0.05 }
            },
            markers: {
                size: isScatterMetric(key) ? 6 : 4.5,
                strokeColors: '#ffffff',
                strokeWidth: 1.5,
                hover: {
                    size: isScatterMetric(key) ? 8 : 7
                }
            },
            dataLabels: {
                enabled: showDataLabels,
                hideOverflowingLabels: true,
                formatter: function (val) {
                    if (val === null || val === undefined) return '';
                    const num = Number(val);
                    if (isNaN(num)) return '';
                    return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
                },
                offsetY: -6,
                style: {
                    fontSize: '8px',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: '800',
                    colors: [config.color]
                },
                background: { enabled: false },
                dropShadow: {
                    enabled: true,
                    top: 1,
                    left: 1,
                    blur: 2,
                    color: '#ffffff',
                    opacity: 1
                }
            },
            series: seriesList,
            xaxis: {
                type: 'category',
                labels: { rotate: -45, style: { fontSize: '11px', fontWeight: '600' } }
            },
            yaxis: {
                min: bounds.min,
                max: bounds.max,
                forceNiceScale: true,
                title: { text: `${config.label} (${config.unit})`, style: { fontSize: '12px', fontWeight: '700' } }
            },
            legend: {
                position: 'bottom',
                horizontalAlign: 'center',
                fontSize: '12px',
                fontWeight: '600'
            },
            tooltip: { shared: true, intersect: false },
            grid: {
                borderColor: '#e2e8f0',
                padding: { left: 25, right: 40, top: 20, bottom: 15 }
            }
        };

        const chartInstance = new ApexCharts(document.getElementById(`chart-instance-${key}`), options);
        chartInstance.render();
        customChartsInstances.push(chartInstance);
    });
}

function renderTable(rows, varKeys) {
    const holder = document.getElementById('custom-report-table-holder');
    if (!holder) return;

    if (rows.length === 0) {
        holder.innerHTML = '<div class="empty-panel compact">Sin lecturas para mostrar en la tabla.</div>';
        return;
    }

    const headCols = varKeys.map(k => {
        const config = VARIABLE_CONFIG[k] || { label: k, unit: '' };
        return `<th>${escapeHtml(config.label)} (${config.unit})</th>`;
    }).join('');

    const bodyRows = rows.map(r => {
        const varCells = varKeys.map(k => {
            const val = r[k];
            const numVal = Number(val);
            const isNum = typeof numVal === 'number' && !isNaN(numVal);
            return `<td>${isNum ? numVal.toFixed(1) : (escapeHtml(val) || '--')}</td>`;
        }).join('');

        const isRun = String(r.estatus || '').toUpperCase() === 'RUN';
        const isOff = String(r.estatus || '').toUpperCase() === 'OFF';

        return `
            <tr>
                <td><strong>${escapeHtml(r.pozo_name || '--')}</strong></td>
                <td>${escapeHtml(r.fecha || '--')}</td>
                <td>${escapeHtml(r.hora ? r.hora.substring(0, 5) : '--')}</td>
                <td>
                    <span class="pozo-option-state ${isRun ? 'active-run' : isOff ? 'inactive-off' : 'inactive'}">
                        ${escapeHtml(r.estatus || '--')}
                    </span>
                </td>
                ${varCells}
            </tr>
        `;
    }).join('');

    holder.innerHTML = `
        <div class="custom-report-table-scroll">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Pozo</th>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Estatus</th>
                        ${headCols}
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
        </div>
    `;
}

function setupExportButtons() {
    const btnPrint = document.getElementById('btn-print-custom-report');
    if (btnPrint) {
        btnPrint.addEventListener('click', async () => {
            const paperElement = document.getElementById('custom-report-paper');
            if (!paperElement) return;

            if (typeof window.html2pdf === 'undefined') {
                window.print();
                return;
            }

            const originalBtnHtml = btnPrint.innerHTML;
            btnPrint.disabled = true;
            btnPrint.innerHTML = `<span>Generando PDF...</span>`;

            // Expandir papel a 1050px y redibujar gráficos para ocupar la hoja A4 completa
            paperElement.classList.add('is-generating-pdf');
            window.dispatchEvent(new Event('resize'));

            // Esperar brevemente a que los gráficos ajusten su ancho a 1050px
            await new Promise(resolve => setTimeout(resolve, 150));

            const opt = {
                margin:       [8, 8, 8, 8],
                filename:     `Reporte_Monitoreo_UV_${new Date().toISOString().slice(0,10)}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            try {
                await window.html2pdf().set(opt).from(paperElement).save();
            } catch (err) {
                console.error('Error generando PDF con html2pdf:', err);
                window.print();
            } finally {
                paperElement.classList.remove('is-generating-pdf');
                window.dispatchEvent(new Event('resize'));
                btnPrint.disabled = false;
                btnPrint.innerHTML = originalBtnHtml;
            }
        });
    }

    const btnCsv = document.getElementById('btn-csv-custom-report');
    if (btnCsv) {
        btnCsv.addEventListener('click', () => {
            exportTableToCsv('reporte_personalizado_uvservicios.csv');
        });
    }
}

function exportTableToCsv(filename) {
    const table = document.querySelector('#custom-report-table-holder table');
    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tr'));
    const csvContent = rows.map(row => {
        const cols = Array.from(row.querySelectorAll('th, td'));
        return cols.map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(',');
    }).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function updateCustomReportWellsContext() {
    try {
        activeCustomScopePozos = [...new Set((await getActiveOperationalScopeWellNames()).map(normalizePozoName).filter(Boolean))];
        const summaries = await getPozosHistorySummary();
        const scopeSet = new Set(activeCustomScopePozos);
        availableCustomPozos = (summaries || []).filter(item => scopeSet.has(normalizePozoName(item.pozo_name)));
        
        // Limpiar pozos seleccionados que ya no pertenezcan al nuevo contrato
        selectedCustomWells = selectedCustomWells.filter(pozo => scopeSet.has(normalizePozoName(pozo)));
        
        renderCustomWellChips();
        renderCustomWellDropdown('');
    } catch (err) {
        console.error('Error actualizando catálogo de pozos en Reporte Gerencial:', err);
    }
}
