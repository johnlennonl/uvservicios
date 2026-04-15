/**
 * Elite Industrial Dashboard - Brutal Grid Logic
 * High-performance charting for UV Servicios.
 */

import { logout, getSession } from './auth.js';
import { getMonitoringData, getUniquePozos, getLatestDate, getNeighborRecords } from './data-service.js';

let charts = {};
let isComparisonMode = false;
let isDarkMode = localStorage.getItem('theme-uv') === 'dark';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // 0. Initialize Theme
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
            updateDashboard(); // Re-render charts with new theme
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

    // 1. Initialize Filters
    try {
        const pozos = await getUniquePozos();
        const pozoFilter = document.getElementById('filter-pozo');
        const comparePanel = document.getElementById('comparison-panel');

        // Intelligent Initial Date: Fetch latest date in DB
        const latestDate = await getLatestDate();
        if (latestDate) {
            document.getElementById('filter-start').value = latestDate;
            document.getElementById('filter-end').value = latestDate;
        }

        if (pozoFilter) {
            pozoFilter.innerHTML = '<option value="Todas">TODOS LOS POZOS</option>';
            pozos.sort().forEach(pozo => {
                const option = document.createElement('option');
                option.value = pozo; option.textContent = pozo;
                pozoFilter.appendChild(option);
            });
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

    // 2. Initial Data Load
    await updateDashboard();

    // 3. Event Binding
    const applyBtn = document.getElementById('apply-filters');
    if (applyBtn) applyBtn.addEventListener('click', updateDashboard);
    
    // Auto-update on selection change
    const pozoFilter = document.getElementById('filter-pozo');
    if (pozoFilter) {
        pozoFilter.addEventListener('change', async () => {
            const val = pozoFilter.value;
            if (val && val !== 'Todas') {
                const date = await getLatestDate(val);
                if (date) {
                    document.getElementById('filter-start').value = date;
                    document.getElementById('filter-end').value = date;
                }
            }
            updateDashboard();
        });
    }
    
    const startFilter = document.getElementById('filter-start');
    if (startFilter) startFilter.addEventListener('change', updateDashboard);
    
    const endFilter = document.getElementById('filter-end');
    if (endFilter) endFilter.addEventListener('change', updateDashboard);

    const histCheck = document.getElementById('check-historical');
    if (histCheck) histCheck.addEventListener('change', updateDashboard);
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Toggle Comparison Mode
    const compareToggleBtn = document.getElementById('btn-toggle-compare');
    if (compareToggleBtn) {
        compareToggleBtn.addEventListener('click', () => {
            isComparisonMode = !isComparisonMode;
            document.getElementById('comparison-panel').classList.toggle('active', isComparisonMode);
            document.getElementById('single-pozo-container').style.display = isComparisonMode ? 'none' : 'block';
            compareToggleBtn.classList.toggle('active', isComparisonMode);
            compareToggleBtn.textContent = isComparisonMode ? '✅ VISTA SIMPLE' : '🔄 COMPARAR';
        });
    }

    // Day Navigation Logic
    const shiftDate = (delta) => {
        const dateInput = document.getElementById('filter-start');
        if (!dateInput.value) return;
        const currentDate = new Date(dateInput.value + 'T12:00:00'); // Use noon to avoid TZ issues
        currentDate.setDate(currentDate.getDate() + delta);
        const newStr = currentDate.toISOString().split('T')[0];
        dateInput.value = newStr;
        document.getElementById('filter-end').value = newStr;
        updateDashboard();
    };

    document.getElementById('btn-prev-day')?.addEventListener('click', () => shiftDate(-1));
    document.getElementById('btn-next-day')?.addEventListener('click', () => shiftDate(1));
    
    // Global Resize Handler
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(c => c && c.render());
    });
});

async function updateDashboard() {
    let selectedPozos = [];
    
    if (isComparisonMode) {
        const checkboxes = document.querySelectorAll('input[name="compare-pozo"]:checked');
        selectedPozos = Array.from(checkboxes).map(c => c.value);
    } else {
        const val = document.getElementById('filter-pozo').value;
        if (val && val !== 'Todas') selectedPozos = [val];
    }

    const isHistorical = document.getElementById('check-historical')?.checked;
    const start = isHistorical ? null : (document.getElementById('filter-start').value || null);
    const end = isHistorical ? null : (document.getElementById('filter-end').value || null);
    
    // Activate Skeletons
    const chartContainers = document.querySelectorAll('.chart-space, .trend-space');
    chartContainers.forEach(el => el.parentElement.classList.add('loading-skeleton'));

    try {
        const data = await getMonitoringData(selectedPozos, start, end);
        
        if (!data || data.length === 0) {
            clearDashboard();
            chartContainers.forEach(el => el.parentElement.classList.remove('loading-skeleton'));
            return;
        }

        // AUTO-CONTEXT: Fetch neighbors to draw connecting lines point-to-point without needing Historical mode
        let extendedData = [...data];
        if (data.length > 0 && selectedPozos.length === 1 && !isHistorical) {
            // Find the oldest date in our current dataset (which might be just 'today')
            const oldestDate = data[data.length - 1].fecha; 
            // Find the newest date in our dataset
            const newestDate = data[0].fecha;
            
            // Get records right before oldest and right after newest
            const neighbors = await getNeighborRecords(selectedPozos[0], oldestDate, newestDate);
            extendedData = [...extendedData, ...neighbors];
        }

        // Sorting for timeline
        const timelineData = [...extendedData].sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            return dateA - dateB;
        });

        // Filter and sanitize observations for the selected wells only
        const filteredObs = data.filter(d => {
            if (isComparisonMode) return selectedPozos.includes(d.pozo_name);
            if (selectedPozos.length === 1) return d.pozo_name === selectedPozos[0];
            return true; // "Todas" case
        });

        renderKPIs(data[0]);
        renderStatusDonut(data);
        renderCoreTrends(timelineData, selectedPozos, isHistorical);
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
            charts[id].updateOptions({ series: [], noData: { text: 'Sin datos para la selección' } });
        }
    });
    const tbody = document.getElementById('obs-body');
    if (tbody) tbody.innerHTML = '<tr><td style="padding: 20px; text-align: center; color: var(--text-muted);">No hay registros</td></tr>';
}

/**
 * 1. KPIs & GAUGES
 */
function renderKPIs(latest) {
    createEliteGauge('gauge-frecuencia', latest.frecuencia, 0, 60, 'Hz', '#2563EB');
    createEliteGauge('gauge-pip', latest.pip, 0, 5000, 'PSI', '#DC2626');
    createEliteGauge('gauge-tm', latest.tm, 0, 450, '°F', '#9333EA');
    
    // Update header info
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
    
    const options = {
        series: [Number(percentage.toFixed(1))],
        chart: { 
            type: 'radialBar', 
            height: 200, 
            sparkline: { enabled: true },
        },
        theme: { mode: isDarkMode ? 'dark' : 'light' },
        plotOptions: {
            radialBar: {
                startAngle: -115,
                endAngle: 115,
                hollow: { size: '68%', background: 'transparent' },
                track: { 
                    background: isDarkMode ? '#1E293B' : '#E2E8F0', 
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
                        color: isDarkMode ? '#F8FAFC' : '#1E293B',
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
 * 2. STATUS
 */
function renderStatusDonut(data) {
    const runCount = data.filter(d => d.estatus === 'RUN').length;
    const offCount = data.filter(d => d.estatus === 'OFF').length;

    const options = {
        series: [runCount, offCount],
        labels: ['RUN', 'OFF'],
        chart: { type: 'donut', height: 180 },
        theme: { mode: isDarkMode ? 'dark' : 'light' },
        colors: ['#10B981', '#F43F5E'],
        dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, label: 'Registros', color: isDarkMode ? '#94A3B8' : '#64748B', formatter: () => data.length } } } } },
        legend: { position: 'bottom', labels: { colors: isDarkMode ? '#94A3B8' : '#6B7280' } }
    };
    renderOrUpdate('donut-status', options);
}

/**
 * 3. TRENDS
 */
/**
 * 3. TRENDS - REPSOL OVERHAUL
 */
function renderCoreTrends(timeline, requestedPozos, isHistorical = false) {
    const pozosPresentes = [...new Set(timeline.map(d => d.pozo_name))];
    const isComparison = pozosPresentes.length > 1;

    // Premium Color Palette (Repsol Inspired)
    const REPSOL_ORANGE = '#FF8200';
    const REPSOL_RED = '#DA291C';
    const TECH_BLUE = '#2563EB';
    const TECH_CYAN = '#06B6D4';
    const TECH_PURPLE = '#7C3AED';

    // Helper for shared options
    const getBaseOptions = (title, color, unit) => ({
        chart: {
            type: 'area',
            height: 220,
            toolbar: { show: true },
            zoom: { enabled: true },
            animations: { enabled: true, easing: 'easeinout', speed: 800 },
            background: 'transparent'
        },
        theme: { mode: isDarkMode ? 'dark' : 'light' },
        stroke: { curve: 'smooth', width: 2, connectNulls: true },
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
            size: 4,
            strokeWidth: 2,
            strokeColors: isDarkMode ? '#0F172A' : '#fff',
            hover: { size: 6 }
        },
        grid: {
            borderColor: isDarkMode ? '#1E293B' : '#F1F5F9',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } }
        },
        xaxis: {
            type: 'datetime',
            labels: { 
                datetimeUTC: false,
                style: { colors: isDarkMode ? '#94A3B8' : '#64748B', fontSize: '11px', fontWeight: 600 },
                format: isComparisonMode ? 'dd MMM' : 'HH:mm'
            }
        },
        yaxis: {
            title: { text: title, style: { color: isDarkMode ? '#E2E8F0' : '#475569', fontWeight: 700 } },
            labels: { 
                style: { colors: isDarkMode ? '#94A3B8' : '#64748B', fontWeight: 600 },
                formatter: (v) => v ? v.toFixed(1) + ' ' + unit : v
            }
        },
        colors: Array.isArray(color) ? color : [color, REPSOL_RED, TECH_BLUE, TECH_CYAN, TECH_PURPLE],
        tooltip: { theme: isDarkMode ? 'dark' : 'light', x: { format: 'dd MMM HH:mm' } }
    });

    const makeSeries = (nameSuffix, field, pozo) => ({
        name: isComparison ? `${pozo} (${nameSuffix})` : nameSuffix,
        data: timeline.filter(d => d.pozo_name === pozo).map(d => ({
            x: new Date(`${d.fecha}T${d.hora}`).getTime(),
            y: d[field] !== null ? Number(d[field]) : null
        }))
    });

    // 1. FRECUENCIA
    const freqSeries = pozosPresentes.map(p => makeSeries('Hz', 'frecuencia', p));
    renderOrUpdate('chart-frecuencia', {
        ...getBaseOptions('Frecuencia (Hz)', REPSOL_ORANGE, 'Hz'),
        series: freqSeries
    });

    // 2. PIP (FONDO)
    const pipSeries = pozosPresentes.map(p => makeSeries('PSI', 'pip', p));
    renderOrUpdate('chart-pip', {
        ...getBaseOptions('Presión PIP (PSI)', REPSOL_RED, 'PSI'),
        series: pipSeries
    });

    // 3. TM (MOTOR)
    const tmSeries = pozosPresentes.map(p => makeSeries('°F', 'tm', p));
    renderOrUpdate('chart-tm', {
        ...getBaseOptions('Temperatura Motor (°F)', TECH_PURPLE, '°F'),
        series: tmSeries
    });

    // 4. SUPERFICIE (THP / CHP)
    const surfSeries = [];
    pozosPresentes.forEach(p => {
        surfSeries.push(makeSeries('THP', 'presion_thp', p));
        surfSeries.push(makeSeries('CHP', 'presion_chp', p));
    });
    renderOrUpdate('chart-superficie', {
        ...getBaseOptions('Presión Superficie (PSI)', [TECH_BLUE, TECH_CYAN], 'PSI'),
        series: surfSeries
    });

    // 5. CORRIENTE MOTOR
    const currSeries = pozosPresentes.map(p => makeSeries('Amp', 'corriente_motor', p));
    renderOrUpdate('chart-motor-curr', {
        ...getBaseOptions('Corriente Motor (Amp)', TECH_BLUE, 'Amp'),
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
        ...getBaseOptions('Corriente VSD (Amp)', ['#6366F1', '#EC4899', '#F43F5E'], 'Amp'),
        series: vsdSeries
    });
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

