import { supabase } from './supabaseClient.js';
import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { initCustomReportsTab } from './stats-custom-reports.js';

// Estado del Módulo de Estadísticas
const state = {
    month: '',
    field: 'TODOS',
    records: [],
    charts: {},
    userEmail: ''
};

// Paleta de Colores Light Corporate Petrolera
const PALETTE = {
    blue: '#0052CC',      // Azul Petrolero Principal
    darkBlue: '#0A2540',  // Azul Petrolero Oscuro
    orange: '#D97706',    // Naranja de destaque / Fallas
    green: '#10B981',     // Verde de estado / Normal
    gray: '#64748B',      // Gris técnico de etiquetas
    lightGray: '#E1E6ED', // Gris claro de bordes
    chartColors: [
        '#0052CC', // Azul Petrolero
        '#10B981', // Verde
        '#D97706', // Naranja
        '#8B5CF6', // Violeta
        '#EC4899', // Rosa
        '#06B6D4'  // Turquesa
    ]
};

// Inicialización del Módulo
async function init() {
    // 1. Validar Sesión y Control de Acceso
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    state.userEmail = session?.user?.email || 'UV Servicios';
    if (!accessProfile?.canViewStats && !accessProfile?.canViewManagement) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    // 2. Configurar Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logout();
            window.location.href = 'index.html';
        });
    }

    // 3. Inicializar Pestaña de Reportes Personalizados
    try {
        initCustomReportsTab();
    } catch (err) {
        console.error('Error al inicializar Reportes Personalizados:', err);
    }

    // 4. Configurar Navegación de Pestañas
    const tabButtons = document.querySelectorAll('.stats-tab-btn');
    const tabContents = document.querySelectorAll('.stats-tab-pane');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.hidden = true);

            btn.classList.add('active');
            const targetId = btn.dataset.target;
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.hidden = false;
        });
    });

    // 5. Configurar Filtros
    const selectMonth = document.getElementById('select-month-report');
    const selectField = document.getElementById('select-field-report');

    // Por defecto, establecer el mes actual
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (selectMonth) {
        selectMonth.value = currentYearMonth;
        state.month = currentYearMonth;
    }

    if (selectField) {
        state.field = selectField.value;
    }

    // Escuchar cambios en los filtros
    selectMonth?.addEventListener('change', (e) => {
        state.month = e.target.value;
        loadData();
    });

    selectField?.addEventListener('change', (e) => {
        state.field = e.target.value;
        loadData();
    });

    // 6. Configurar Botón de Exportación PDF
    const btnExportPdf = document.getElementById('btn-export-pdf');
    btnExportPdf?.addEventListener('click', exportarPDF);

    // 8. Configurar filtros de la tabla de alertas operativas
    const alertasSearchInput = document.getElementById('alertas-search-input');
    alertasSearchInput?.addEventListener('input', () => applyAlertasFilters());

    const alertasStatusSelect = document.getElementById('alertas-status-select');
    alertasStatusSelect?.addEventListener('change', () => applyAlertasFilters());

    // Pozo multi-select filter
    const btnPozoFilter = document.getElementById('btn-pozo-filter');
    const pozoDropdown = document.getElementById('pozo-filter-dropdown');
    const btnPozoApply = document.getElementById('btn-pozo-apply');
    const btnPozoClear = document.getElementById('btn-pozo-clear');

    btnPozoFilter?.addEventListener('click', () => {
        const isHidden = pozoDropdown.hidden;
        pozoDropdown.hidden = !isHidden;
    });

    btnPozoApply?.addEventListener('click', () => {
        pozoDropdown.hidden = true;
        applyAlertasFilters();
        renderPozoChips();
    });

    btnPozoClear?.addEventListener('click', () => {
        document.querySelectorAll('#pozo-filter-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        pozoDropdown.hidden = true;
        applyAlertasFilters();
        renderPozoChips();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (pozoDropdown && !pozoDropdown.hidden) {
            const filterContainer = document.querySelector('.alertas-pozo-filter');
            if (filterContainer && !filterContainer.contains(e.target)) {
                pozoDropdown.hidden = true;
            }
        }
    });

    // 9. Cargar datos iniciales
    loadData();
}

// Carga de Datos desde Supabase (monitoreo_pozos)
async function loadData() {
    if (!state.month) return;

    try {
        // Calcular rangos del mes seleccionado
        const [year, monthStr] = state.month.split('-');
        const lastDay = new Date(year, monthStr, 0).getDate();
        const start = `${state.month}-01`;
        const end = `${state.month}-${lastDay}`;

        // Mostrar Loading en los KPIs
        document.getElementById('kpi-total-visitas').textContent = '...';
        document.getElementById('kpi-normal-ops').textContent = '...';
        document.getElementById('kpi-pozos-unicos').textContent = '...';
        document.getElementById('kpi-visitas-prom').textContent = '...';

        // Consultar los registros de monitoreo (incluyendo variables numéricas)
        let query = supabase
            .from('monitoreo_pozos')
            .select('pozo_name, fecha, campo, estatus, observaciones, pip, tm, frecuencia')
            .order('fecha', { ascending: false });

        if (state.field !== 'TODOS') {
            query = query.eq('campo', state.field);
        }

        query = query.gte('fecha', start).lte('fecha', end);

        const { data, error } = await query;
        if (error) throw error;

        state.records = data || [];

        // Procesar y renderizar
        processMetrics();
        renderCharts();

    } catch (err) {
        console.error('Error al cargar datos de estadísticas:', err);
        document.getElementById('kpi-total-visitas').textContent = 'Error';
        document.getElementById('kpi-normal-ops').textContent = 'Error';
        document.getElementById('kpi-pozos-unicos').textContent = 'Error';
        document.getElementById('kpi-visitas-prom').textContent = 'Error';
    }
}

// Procesar Métricas y KPIs — Solo datos directos, sin heurísticas
function processMetrics() {
    const total = state.records.length;
    
    // 1. Total Registros
    document.getElementById('kpi-total-visitas').textContent = total;

    // 2. Disponibilidad Operativa — % de registros con estatus RUN (dato directo)
    const runCount = state.records.filter(r => 
        String(r.estatus || '').trim().toUpperCase() === 'RUN'
    ).length;
    const disponibilidad = total > 0 ? Math.round((runCount / total) * 100) : 0;
    document.getElementById('kpi-normal-ops').textContent = `${disponibilidad}%`;

    // 3. Pozos Únicos Monitoreados — Set de pozo_name
    const pozosUnicos = new Set(
        state.records.map(r => String(r.pozo_name || '').trim().toUpperCase()).filter(Boolean)
    );
    document.getElementById('kpi-pozos-unicos').textContent = pozosUnicos.size;

    // 4. Frecuencia de Inspección — Visitas Promedio por Pozo
    const visitasProm = pozosUnicos.size > 0 ? (total / pozosUnicos.size).toFixed(1) : '0.0';
    document.getElementById('kpi-visitas-prom').textContent = visitasProm;

    // 5. Métricas de Ingeniería de Detalle
    const pipValues = state.records.map(r => Number(r.pip)).filter(v => typeof v === 'number' && !isNaN(v) && v > 0);
    const tmValues = state.records.map(r => Number(r.tm)).filter(v => typeof v === 'number' && !isNaN(v) && v > 0);
    const frecValues = state.records.map(r => Number(r.frecuencia)).filter(v => typeof v === 'number' && !isNaN(v) && v > 0);

    const avgPip = pipValues.length > 0 ? Math.round(pipValues.reduce((a, b) => a + b, 0) / pipValues.length) : '—';
    const avgTm = tmValues.length > 0 ? Math.round(tmValues.reduce((a, b) => a + b, 0) / tmValues.length) : '—';
    const avgFrec = frecValues.length > 0 ? (frecValues.reduce((a, b) => a + b, 0) / frecValues.length).toFixed(1) : '—';

    // % de registros que tienen telemetría de fondo (PIP o Tm activa)
    const validSensorCount = state.records.filter(r => {
        const pip = Number(r.pip);
        const tm = Number(r.tm);
        return (typeof pip === 'number' && !isNaN(pip) && pip > 0) || 
               (typeof tm === 'number' && !isNaN(tm) && tm > 0);
    }).length;
    const sensorHealth = total > 0 ? Math.round((validSensorCount / total) * 100) : 0;

    // Inyectar en el panel de ingeniería
    const ingPip = document.getElementById('ing-prom-pip');
    const ingTm = document.getElementById('ing-prom-tm');
    const ingFrec = document.getElementById('ing-prom-frec');
    const ingSensor = document.getElementById('ing-sensor-health');

    if (ingPip) ingPip.textContent = avgPip;
    if (ingTm) ingTm.textContent = avgTm;
    if (ingFrec) ingFrec.textContent = avgFrec;
    if (ingSensor) ingSensor.textContent = `${sensorHealth}%`;

    // Actualizar metadata del PDF (Rediseño Premium)
    const selectMonth = document.getElementById('select-month-report');
    const selectedMonthText = selectMonth?.options[selectMonth.selectedIndex]?.text || state.month;
    
    const metaCampo = document.getElementById('pdf-report-meta-campo');
    const metaPeriodo = document.getElementById('pdf-report-meta-periodo');
    const metaEmision = document.getElementById('pdf-report-meta-emision');
    const metaUsuario = document.getElementById('pdf-report-meta-usuario');
    
    if (metaCampo) metaCampo.textContent = state.field === 'TODOS' ? 'TODOS LOS CAMPOS' : state.field;
    if (metaPeriodo) metaPeriodo.textContent = selectedMonthText.toUpperCase();
    if (metaEmision) metaEmision.textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (metaUsuario) metaUsuario.textContent = state.userEmail || 'UV Servicios';
}

// Normalizar variantes de nombre de campo
function normalizeCampo(raw) {
    const val = String(raw || 'SIN CAMPO').trim().toUpperCase();
    if (val === 'LA CEIBA' || val === 'CEIBA') return 'CEIBA';
    if (val === 'TOM' || val === 'TOMOPORO') return 'TOMOPORO';
    return val;
}

// Renderizado de Gráficos (Chart.js) — Rediseño V3
function renderCharts() {
    // Destruir gráficos anteriores
    Object.values(state.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    state.charts = {};

    // ====================================================
    // GRÁFICO 1: Estado por Campo — Stacked Bar (OFF / RUN)
    // ====================================================
    const campoStatusMap = {};
    state.records.forEach(r => {
        const campo = normalizeCampo(r.campo);
        const estatus = String(r.estatus || '').trim().toUpperCase();
        if (!campoStatusMap[campo]) campoStatusMap[campo] = { RUN: 0, OFF: 0 };
        if (estatus === 'RUN') campoStatusMap[campo].RUN++;
        else if (estatus === 'OFF') campoStatusMap[campo].OFF++;
    });

    const campoLabels = Object.keys(campoStatusMap).sort();
    const runData = campoLabels.map(c => campoStatusMap[c].RUN);
    const offData = campoLabels.map(c => campoStatusMap[c].OFF);

    const ctxStatusField = document.getElementById('chart-status-field')?.getContext('2d');
    if (ctxStatusField) {
        state.charts.statusField = new Chart(ctxStatusField, {
            type: 'bar',
            data: {
                labels: campoLabels,
                datasets: [
                    { label: 'RUN', data: runData, backgroundColor: PALETTE.green, borderRadius: 4 },
                    { label: 'OFF', data: offData, backgroundColor: '#EF4444', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { family: 'Inter', weight: 600, size: 11 }, color: '#475569', usePointStyle: true, pointStyle: 'circle' }
                    }
                },
                scales: {
                    x: { stacked: true, ticks: { font: { family: 'Inter', weight: 600, size: 10 }, color: '#475569' }, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { font: { family: 'Inter', weight: 500, size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } }
                }
            }
        });
    }

    // ====================================================
    // GRÁFICO 2: Actividad Diaria del Mes — Line Chart
    // ====================================================
    const [year, monthStr] = state.month.split('-');
    const daysInMonth = new Date(year, monthStr, 0).getDate();
    const dailyCounts = new Array(daysInMonth).fill(0);

    state.records.forEach(r => {
        const fecha = String(r.fecha || '');
        const day = parseInt(fecha.split('-')[2], 10);
        if (day >= 1 && day <= daysInMonth) dailyCounts[day - 1]++;
    });

    const dayLabels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

    const ctxDaily = document.getElementById('chart-actividad-diaria')?.getContext('2d');
    if (ctxDaily) {
        state.charts.actividadDiaria = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: dayLabels,
                datasets: [{
                    label: 'Registros',
                    data: dailyCounts,
                    borderColor: PALETTE.blue,
                    backgroundColor: 'rgba(0, 82, 204, 0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: PALETTE.blue,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', maxRotation: 0 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } }
                }
            }
        });
    }

    // ====================================================
    // GRÁFICO 3: Visitas por Pozo — Barra Horizontal
    // ====================================================
    const visitasPozoMap = {};
    state.records.forEach(r => {
        const pozo = String(r.pozo_name || '').trim().toUpperCase();
        if (pozo) visitasPozoMap[pozo] = (visitasPozoMap[pozo] || 0) + 1;
    });

    const pozosSorted = Object.keys(visitasPozoMap).sort((a, b) => visitasPozoMap[b] - visitasPozoMap[a]);
    const visitasValores = pozosSorted.map(p => visitasPozoMap[p]);
    const maxVisitas = Math.max(...visitasValores, 0);
    const barColorsH = visitasValores.map(val => val === maxVisitas && val > 0 ? PALETTE.orange : PALETTE.blue);

    const ctxVisitas = document.getElementById('chart-visitas-pozo')?.getContext('2d');
    if (ctxVisitas) {
        state.charts.visitas = new Chart(ctxVisitas, {
            type: 'bar',
            data: {
                labels: pozosSorted,
                datasets: [{ label: 'Visitas', data: visitasValores, backgroundColor: barColorsH, borderRadius: 6 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } },
                    y: { ticks: { font: { family: 'Inter', weight: 600, size: 9 }, color: '#475569' }, grid: { display: false } }
                }
            }
        });
    }

    // ====================================================
    // GRÁFICO 4: Distribución Global de Estado — Donut
    // ====================================================
    let globalRun = 0, globalOff = 0, globalOtro = 0;
    state.records.forEach(r => {
        const estatus = String(r.estatus || '').trim().toUpperCase();
        if (estatus === 'RUN') globalRun++;
        else if (estatus === 'OFF') globalOff++;
        else globalOtro++;
    });

    const ctxGlobal = document.getElementById('chart-status-global')?.getContext('2d');
    if (ctxGlobal) {
        const gLabels = ['RUN', 'OFF'];
        const gData = [globalRun, globalOff];
        const gColors = [PALETTE.green, '#EF4444'];
        if (globalOtro > 0) { gLabels.push('Sin Estatus'); gData.push(globalOtro); gColors.push('#94A3B8'); }

        state.charts.statusGlobal = new Chart(ctxGlobal, {
            type: 'doughnut',
            data: { labels: gLabels, datasets: [{ data: gData, backgroundColor: gColors, borderWidth: 2, borderColor: '#FFFFFF' }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { font: { family: 'Inter', weight: 600, size: 11 }, color: '#475569', usePointStyle: true, pointStyle: 'circle' }
                    }
                }
            }
        });
    }

    // ====================================================
    // TABLA: Observaciones que Requieren Atención
    // ====================================================
    populatePozoFilterList();
    renderAlertasTable();
    renderOffWellsList();
}

// Renderiza la lista de pozos que quedaron en estado OFF
function renderOffWellsList() {
    const listContainer = document.getElementById('off-wells-list-container');
    const totalCountElement = document.getElementById('off-wells-count-val');
    if (!listContainer) return;

    // Obtener el último estatus de cada pozo en el mes (la data ya viene ordenada por fecha desc)
    const latestStatusMap = {};
    state.records.forEach(r => {
        const pozo = String(r.pozo_name || '').trim().toUpperCase();
        if (pozo && !latestStatusMap[pozo]) {
            latestStatusMap[pozo] = {
                estatus: String(r.estatus || '').trim().toUpperCase(),
                fecha: r.fecha,
                campo: r.campo
            };
        }
    });

    // Filtrar solo los pozos cuyo último estado reportado sea 'OFF'
    const offWells = Object.entries(latestStatusMap)
        .filter(([pozo, data]) => data.estatus === 'OFF')
        .map(([pozo, data]) => ({ pozo, ...data }))
        .sort((a, b) => a.pozo.localeCompare(b.pozo));

    // Mostrar total
    if (totalCountElement) {
        totalCountElement.textContent = offWells.length;
    }

    listContainer.innerHTML = '';
    if (offWells.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center;color:#64748B;padding:24px;font-size:13px;">Todos los pozos se encuentran operativos (RUN).</div>';
        return;
    }

    offWells.forEach(well => {
        const item = document.createElement('div');
        item.className = 'off-well-item';
        item.innerHTML = `
            <div class="off-well-copy">
                <strong>${well.pozo}</strong>
                <span>Campo: ${well.campo || '—'} · Última visita: ${well.fecha}</span>
            </div>
            <span class="off-well-status">OFF</span>
        `;
        listContainer.appendChild(item);
    });
}

// Palabras clave que indican "condiciones normales" → se excluyen de la tabla de alertas
const NORMAL_KEYWORDS = ['condiciones normales', 'condiciones optimas', 'condiciones óptimas', 'operativo', 'operando en condiciones', 'sin novedad', 'sin falla'];
const ALERT_KEYWORDS = ['fuera de rango', 'falla', 'parada', 'detenido', 'daño', 'problema', 'temperatura', 'presion', 'presión', 'vsd', 'alarma', 'alta', 'baja', 'reemplazo', 'sensor', 'fusible', 'arranque', 'reemplazaron'];

function isObservacionNormal(obs) {
    const lower = obs.toLowerCase();
    // Si menciona explícitamente algún término de alerta, NO es normal.
    const hasAlert = ALERT_KEYWORDS.some(kw => lower.includes(kw));
    if (hasAlert) return false;
    
    // Si no tiene alertas y contiene palabras clave de normalidad, es normal.
    return NORMAL_KEYWORDS.some(kw => lower.includes(kw));
}

// Renderiza la tabla de observaciones del mes
function renderAlertasTable(filterText, selectedPozos, selectedStatus) {
    const tbody = document.getElementById('alertas-operativas-body');
    if (!tbody) return;

    // Obtener todos los registros con observaciones escritas
    let alertas = state.records.filter(r => {
        return String(r.observaciones || '').trim() !== '';
    });

    // Filtrar por pozos seleccionados
    if (selectedPozos && selectedPozos.length > 0) {
        alertas = alertas.filter(r => {
            const pozo = String(r.pozo_name || '').trim().toUpperCase();
            return selectedPozos.includes(pozo);
        });
    }

    // Filtrar por estatus
    if (selectedStatus && selectedStatus !== 'TODOS') {
        alertas = alertas.filter(r => {
            const status = String(r.estatus || '').trim().toUpperCase();
            return status === selectedStatus;
        });
    }

    // Filtrar por texto de búsqueda
    if (filterText && filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        alertas = alertas.filter(r => {
            const pozo = String(r.pozo_name || '').toLowerCase();
            const obs = String(r.observaciones || '').toLowerCase();
            return pozo.includes(q) || obs.includes(q);
        });
    }

    // Mostrar todas las observaciones encontradas (ya ordenadas por fecha desc)
    const top = alertas;

    tbody.innerHTML = '';
    if (top.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94A3B8;padding:24px;">Sin observaciones registradas para este filtro.</td></tr>';
        return;
    }

    top.forEach(r => {
        const pozo = String(r.pozo_name || '—').trim();
        const campo = String(r.campo || '—').trim();
        const fecha = String(r.fecha || '—');
        const estatus = String(r.estatus || '—').trim().toUpperCase();
        const obs = String(r.observaciones || '').trim();
        
        const isRun = estatus === 'RUN';
        const isOff = estatus === 'OFF';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;white-space:nowrap;">${pozo}</td>
            <td style="white-space:nowrap;color:#64748B;">${campo}</td>
            <td style="white-space:nowrap;color:#64748B;">${fecha}</td>
            <td style="white-space:nowrap;text-align:center;">
                <span class="pozo-option-state ${isRun ? 'active-run' : isOff ? 'inactive-off' : 'inactive'}">
                    ${estatus}
                </span>
            </td>
            <td title="${obs.replace(/"/g, '&quot;')}">${obs}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Poblar la lista de checkboxes de pozos desde los datos actuales
function populatePozoFilterList() {
    const container = document.getElementById('pozo-filter-list');
    if (!container) return;

    const pozos = [...new Set(
        state.records.map(r => String(r.pozo_name || '').trim().toUpperCase()).filter(Boolean)
    )].sort();

    container.innerHTML = '';
    pozos.forEach(pozo => {
        const label = document.createElement('label');
        label.className = 'pozo-filter-item';
        label.innerHTML = `<input type="checkbox" value="${pozo}" /> <span>${pozo}</span>`;
        container.appendChild(label);
    });
}

// Obtener los pozos seleccionados del dropdown
function getSelectedPozos() {
    const checkboxes = document.querySelectorAll('#pozo-filter-list input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Aplicar todos los filtros de alertas (texto + pozos + estatus)
function applyAlertasFilters() {
    const searchText = document.getElementById('alertas-search-input')?.value || '';
    const selectedPozos = getSelectedPozos();
    const selectedStatus = document.getElementById('alertas-status-select')?.value || 'TODOS';
    renderAlertasTable(searchText, selectedPozos, selectedStatus);
}

// Renderizar chips de pozos seleccionados
function renderPozoChips() {
    const container = document.getElementById('alertas-pozo-chips');
    if (!container) return;

    const selectedPozos = getSelectedPozos();
    container.innerHTML = '';

    selectedPozos.forEach(pozo => {
        const chip = document.createElement('span');
        chip.className = 'pozo-chip';
        chip.innerHTML = `${pozo} <i class="fa-solid fa-xmark pozo-chip-remove" data-pozo="${pozo}"></i>`;
        chip.querySelector('.pozo-chip-remove').addEventListener('click', (e) => {
            const pozoToRemove = e.target.dataset.pozo;
            const cb = document.querySelector(`#pozo-filter-list input[value="${pozoToRemove}"]`);
            if (cb) cb.checked = false;
            applyAlertasFilters();
            renderPozoChips();
        });
        container.appendChild(chip);
    });
}

// Exportación a PDF usando html2pdf.js
function exportarPDF() {
    const container = document.getElementById('reporte-container');
    if (!container) return;

    // Mostrar cabecera de impresión antes de capturar
    const headerPrint = document.querySelector('.pdf-header-print');
    if (headerPrint) {
        headerPrint.style.display = 'block';
    }

    // Ocultar físicamente los elementos marcados con data-html2pdf-ignore antes de capturar
    const ignoreElements = document.querySelectorAll('[data-html2pdf-ignore]');
    const originalDisplays = [];
    ignoreElements.forEach((el, idx) => {
        originalDisplays[idx] = el.style.display;
        el.style.display = 'none';
    });

    // Configuración de html2pdf.js
    const options = {
        margin: [12, 12, 12, 12],
        filename: `Resumen_Actividades_UV_SERVICIOS_${state.field}_${state.month}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait' 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Lanzar generación
    if (typeof window.html2pdf === 'undefined') {
        alert('La librería para generar PDF no se ha cargado correctamente. Por favor intenta recargar la página.');
        return;
    }

    window.html2pdf()
        .set(options)
        .from(container)
        .save()
        .then(() => {
            // Ocultar cabecera de impresión tras terminar
            if (headerPrint) {
                headerPrint.style.display = 'none';
            }
            // Restaurar visualización de los elementos ignorados
            ignoreElements.forEach((el, idx) => {
                el.style.display = originalDisplays[idx];
            });
        })
        .catch(err => {
            console.error('Error al generar PDF:', err);
            alert('Ocurrió un error al generar el PDF: ' + err.message);
            if (headerPrint) {
                headerPrint.style.display = 'none';
            }
            // Restaurar visualización de los elementos ignorados
            ignoreElements.forEach((el, idx) => {
                el.style.display = originalDisplays[idx];
            });
        });
}

// Arrancar script
document.addEventListener('DOMContentLoaded', init);
