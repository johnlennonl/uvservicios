/**
 * Elite Industrial Dashboard - Brutal Grid Logic
 * High-performance charting for UV Servicios.
 */

import { logout, getSession } from './auth.js';
import { getMonitoringData, getUniquePozos, getLatestDate, getNeighborRecords } from './data-service.js';

let charts = {};
let isComparisonMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
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
    
    try {
        const data = await getMonitoringData(selectedPozos, start, end);
        
        if (!data || data.length === 0) {
            clearDashboard();
            return;
        }

        // AUTO-CONTEXT: If only 1 record found, fetch neighbors to draw lines
        let extendedData = [...data];
        if (data.length === 1 && selectedPozos.length === 1 && !isHistorical) {
            const neighbors = await getNeighborRecords(selectedPozos[0], data[0].fecha);
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
    }
}

function clearDashboard() {
    const chartIds = ['gauge-frecuencia', 'gauge-pip', 'gauge-tm', 'donut-status', 'trend-freq-curr', 'chart-pressure', 'trend-vsd'];
    chartIds.forEach(id => {
        if (charts[id]) {
            charts[id].updateOptions({ series: [], noData: { text: 'Sin datos para la selección' } });
        }
    });
    const tbody = document.getElementById('obs-body');
    if (tbody) tbody.innerHTML = '<tr><td style="padding: 20px; text-align: center; color: #9CA3AF;">No hay registros</td></tr>';
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
        chart: { type: 'radialBar', height: 200, sparkline: { enabled: true } },
        plotOptions: {
            radialBar: {
                startAngle: -110,
                endAngle: 110,
                hollow: { size: '65%', background: 'transparent' },
                track: { background: '#F3F4F6', strokeWidth: '100%' },
                dataLabels: {
                    name: { show: false },
                    value: {
                        offsetY: 15,
                        fontSize: '22px',
                        fontWeight: '900',
                        color: color,
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
                gradientToColors: [color + 'CC'], // Subtle secondary glow
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
        colors: ['#10B981', '#F43F5E'],
        dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { size: '75%', labels: { show: true, total: { show: true, label: 'Registros', formatter: () => data.length } } } } },
        legend: { position: 'bottom', labels: { colors: '#6B7280' } }
    };
    renderOrUpdate('donut-status', options);
}

/**
 * 3. TRENDS
 */
function renderCoreTrends(timeline, requestedPozos, isHistorical = false) {
    const pozosPresentes = [...new Set(timeline.map(d => d.pozo_name))];
    const isComparison = pozosPresentes.length > 1;

    // Helper to generate series
    const makeSeries = (nameSuffix, field, pozo) => ({
        name: isComparison ? `${pozo} (${nameSuffix})` : nameSuffix,
        data: timeline.filter(d => d.pozo_name === pozo).map(d => ({
            x: new Date(`${d.fecha}T${d.hora}`).getTime(),
            y: d[field] !== null ? Number(d[field]) : null
        }))
    });

    // Main Trend: Freq & Curr
    const mainSeries = [];
    
    // 1. ADD FIELD TREND (Global line to connect all points)
    if (requestedPozos.length === 0 || requestedPozos.includes('Todas')) {
        mainSeries.push({
            name: 'Tendencia Campo (Hz)',
            data: timeline.map(d => ({
                x: new Date(`${d.fecha}T${d.hora}`).getTime(),
                y: d.frecuencia !== null ? Number(d.frecuencia) : null,
                pozo: d.pozo_name // For custom tooltip
            }))
        });
    }

    // 2. Individual Well Series
    pozosPresentes.forEach(p => {
        mainSeries.push(makeSeries('Hz', 'frecuencia', p));
        mainSeries.push(makeSeries('Amp', 'corriente_motor', p));
    });

    renderOrUpdate('trend-freq-curr', {
        series: mainSeries,
        chart: { 
            height: 450, 
            type: 'line', 
            toolbar: { show: true }, 
            zoom: { enabled: true } 
        },
        stroke: { width: 2, curve: 'smooth', connectNulls: true },
        markers: { 
            size: 4, 
            strokeWidth: 2,
            strokeColors: '#fff',
            hover: { size: 6 } 
        },
        xaxis: { 
            type: 'datetime', 
            labels: { 
                datetimeUTC: false,
                style: { colors: '#9CA3AF' },
                format: isComparisonMode ? 'dd MMM' : 'HH:mm'
            },
            // Fix: If viewing single day and NOT in historical mode, force 24h axis
            ...(timeline.length > 0 && !isHistorical ? (() => {
                const d = timeline[0].fecha;
                try {
                    return {
                        min: new Date(`${d}T00:00:00`).getTime(),
                        max: new Date(`${d}T23:59:59`).getTime()
                    };
                } catch(e) { return {}; }
            })() : {})
        },
        yaxis: [
            { 
                title: { text: 'Frecuencia (Hz)', style: { color: '#2563EB' } },
                labels: { style: { colors: '#2563EB' } }
            }, 
            { 
                opposite: true, 
                title: { text: 'I MOTOR (Amp)', style: { color: '#F59E0B' } },
                labels: { style: { colors: '#F59E0B' } }
            }
        ],
        colors: ['#2563EB', '#F59E0B', '#10B981', '#9333EA', '#EF4444', '#06B6D4'],
        tooltip: { 
            x: { format: 'dd MMM HH:mm' },
            y: {
                formatter: function(val, { series, seriesIndex, dataPointIndex, w }) {
                    const item = w.config.series[seriesIndex].data[dataPointIndex];
                    return item && item.pozo ? `${val} (${item.pozo})` : val;
                }
            }
        }
    });

    // Pressures
    const pressSeries = [];
    pozosPresentes.forEach(p => {
        pressSeries.push(makeSeries('THP', 'presion_thp', p));
        pressSeries.push(makeSeries('CHP', 'presion_chp', p));
    });

    renderOrUpdate('chart-pressure', {
        series: pressSeries,
        chart: { height: 400, type: 'line', toolbar: { show: false } },
        stroke: { width: 2, connectNulls: true },
        markers: { size: 4 },
        xaxis: { type: 'datetime' },
        colors: ['#3B82F6', '#EF4444', '#10B981', '#F59E0B'],
        tooltip: { x: { format: 'HH:mm' } }
    });

    // VSD
    const vsdSeries = [];
    pozosPresentes.forEach(p => {
        vsdSeries.push(makeSeries(p, 'vsd_a', p));
    });

    renderOrUpdate('trend-vsd', {
        series: vsdSeries,
        chart: { height: 400, type: 'area', toolbar: { show: false } },
        stroke: { width: 2, connectNulls: true },
        markers: { size: 4 },
        fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
        xaxis: { type: 'datetime' },
        colors: ['#6366F1', '#10B981', '#EC4899', '#F59E0B']
    });
}

function renderObservations(data) {
    const tbody = document.getElementById('obs-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.slice(0, 15).forEach(record => {
        if (record.observaciones) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding: 12px; border-bottom: 1px solid #F3F4F6; color: #4B5563;">
                <span style="font-size: 0.7rem; color: #9CA3AF; display: block;">${record.pozo_name} - ${record.fecha} ${record.hora}</span>
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

