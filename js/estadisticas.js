import { supabase } from './supabaseClient.js';
import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { getActiveOperationalScope, initOperationalScopeContext, renderOperationalScopeSwitcher } from './services/operational-scope-context.js';
import { getFieldWellsByScope } from './services/operational-contracts-service.js';
import { initCustomReportsTab, updateCustomReportWellsContext } from './stats-custom-reports.js?v=20260826-2129';

// Estado del Módulo de Estadísticas
const state = {
    month: '',
    field: 'TODOS',
    records: [],
    monitoringRecords: [],
    journeyRecords: [],
    fieldJourneys: [],
    fieldDocuments: [],
    charts: {},
    userEmail: '',
    activeOperationalScope: 'ceiba_tomoporo',
    activeScopePozoNames: [],
    activeScopeFields: [],
    loadToken: 0
};

function normalizePozoName(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeCampoName(value) {
    return String(value || '').trim().toUpperCase();
}

function populateFieldFilterOptions() {
    const selectField = document.getElementById('select-field-report');
    if (!selectField) return;

    const currentValue = selectField.value || state.field || 'TODOS';
    selectField.innerHTML = '<option value="TODOS">TODOS LOS CAMPOS</option>';

    state.activeScopeFields.forEach(campoName => {
        const option = document.createElement('option');
        option.value = campoName;
        option.textContent = campoName;
        selectField.appendChild(option);
    });

    selectField.value = state.activeScopeFields.includes(currentValue) ? currentValue : 'TODOS';
    state.field = selectField.value;
}

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
export async function initEstadisticas() {
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

    const operationalScopeContext = await initOperationalScopeContext(session, accessProfile);
    const handleOperationalScopeChange = async () => {
        state.activeOperationalScope = getActiveOperationalScope();
        const activeScopeWells = await getFieldWellsByScope(state.activeOperationalScope).catch(error => {
            console.warn('No se pudo cargar el catalogo del contrato activo en Estadisticas:', error);
            return [];
        });
        state.activeScopePozoNames = [...new Set(activeScopeWells.map(well => normalizePozoName(well?.pozo_name)).filter(Boolean))];
        state.activeScopeFields = [...new Set(activeScopeWells.map(well => normalizeCampoName(well?.campo_name)).filter(Boolean))].sort();
        populateFieldFilterOptions();
        updateCustomReportWellsContext();
        await loadData();
    };
    renderOperationalScopeSwitcher(document.getElementById('stats-operational-scope-switcher'), operationalScopeContext, {
        onChange: handleOperationalScopeChange
    });
    renderOperationalScopeSwitcher(document.getElementById('stats-mobile-operational-scope-switcher'), operationalScopeContext, {
        onChange: handleOperationalScopeChange
    });
    state.activeOperationalScope = getActiveOperationalScope();
    const activeScopeWells = await getFieldWellsByScope(state.activeOperationalScope).catch(error => {
        console.warn('No se pudo cargar el catalogo del contrato activo en Estadisticas:', error);
        return [];
    });
    state.activeScopePozoNames = [...new Set(activeScopeWells.map(well => normalizePozoName(well?.pozo_name)).filter(Boolean))];
    state.activeScopeFields = [...new Set(activeScopeWells.map(well => normalizeCampoName(well?.campo_name)).filter(Boolean))].sort();
    populateFieldFilterOptions();

    // 2. Configurar Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logout();
            window.location.href = 'index.html';
        });
    }

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', async () => {
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
        state.field = selectField.value || 'TODOS';
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
    if (btnExportPdf) {
        btnExportPdf.hidden = false;
        btnExportPdf.removeAttribute('aria-hidden');
        btnExportPdf.style.display = 'inline-flex';
        btnExportPdf.addEventListener('click', () => {
            exportarPDF();
        });
    }

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
    await loadData();

    // Hide loader overlay
    const loader = document.getElementById('premium-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

// Carga de datos desde Supabase: monitoreo publicado + jornadas aprobadas/publicadas.
async function loadData() {
    if (!state.month) return;
    const currentLoadToken = ++state.loadToken;
    showStatsLoading(`Cargando ${getMonthLabel().toUpperCase()}`);

    try {
        if (!state.activeScopePozoNames.length) {
            state.records = [];
            state.monitoringRecords = [];
            state.journeyRecords = [];
            state.fieldJourneys = [];
            state.fieldDocuments = [];
            processMetrics();
            renderCharts();
            return;
        }

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

        let monitoringQuery = supabase
            .from('monitoreo_pozos')
            .select('pozo_name, fecha, hora, campo, estatus, observaciones, pip, tm, frecuencia, operational_scope')
            .in('pozo_name', state.activeScopePozoNames)
            .order('fecha', { ascending: false });

        if (state.field !== 'TODOS') {
            monitoringQuery = monitoringQuery.eq('campo', state.field);
        }

        monitoringQuery = monitoringQuery.gte('fecha', start).lte('fecha', end);
        if (state.activeOperationalScope) {
            monitoringQuery = monitoringQuery.eq('operational_scope', state.activeOperationalScope);
        }

        const { data: monitoringData, error: monitoringError } = await monitoringQuery;
        if (monitoringError) throw monitoringError;

        let journeysQuery = supabase
            .from('field_journeys')
            .select('id, status, journey_date, jornada, equipo_guardia, total_reports, first_report_time, last_report_time, operational_scope, published_at, reviewed_at')
            .in('status', ['approved', 'published'])
            .gte('journey_date', start)
            .lte('journey_date', end)
            .order('journey_date', { ascending: false });

        if (state.activeOperationalScope) {
            journeysQuery = journeysQuery.eq('operational_scope', state.activeOperationalScope);
        }

        const { data: journeysData, error: journeysError } = await journeysQuery;
        if (journeysError) throw journeysError;

        state.fieldJourneys = journeysData || [];
        const journeyIds = state.fieldJourneys.map(journey => journey.id).filter(Boolean);
        let journeyRecords = [];

        if (journeyIds.length) {
            let recordsQuery = supabase
                .from('field_journey_records')
                .select('id, journey_id, operational_scope, pozo, report_date, report_time, campo, actividad, estatus, modo_operacion, observaciones_pozo, diagnostico, frecuencia, pip_psi, tm_f, raw_payload')
                .in('journey_id', journeyIds)
                .in('pozo', state.activeScopePozoNames)
                .order('report_date', { ascending: false })
                .order('report_time', { ascending: false });

            if (state.field !== 'TODOS') {
                recordsQuery = recordsQuery.eq('campo', state.field);
            }

            const { data: recordsData, error: recordsError } = await recordsQuery;
            if (recordsError) throw recordsError;
            journeyRecords = recordsData || [];
        }

        let documents = [];
        try {
            const { data: documentData, error: documentsError } = await supabase
                .from('well_historical_documents')
                .select('id, pozo_name, categoria, nombre_archivo, descripcion, uploaded_by, created_at')
                .is('deleted_at', null)
                .in('pozo_name', state.activeScopePozoNames)
                .in('categoria', ['REGISTROS_ECHOMETER', 'VOLCADOS_VSD', 'DATA_SENSOR_FONDO', 'SOPORTES'])
                .gte('created_at', `${start}T00:00:00.000Z`)
                .lte('created_at', `${end}T23:59:59.999Z`)
                .order('created_at', { ascending: false });
            if (documentsError) throw documentsError;
            documents = documentData || [];
        } catch (documentsError) {
            console.warn('No se pudieron cargar adjuntos de campo para Estadisticas:', documentsError);
            documents = [];
        }

        state.monitoringRecords = monitoringData || [];
        state.journeyRecords = journeyRecords;
        state.fieldDocuments = documents;
        state.records = journeyRecords.length ? normalizeJourneyRecordsForStats(journeyRecords) : normalizeMonitoringRecordsForStats(state.monitoringRecords);

        // Procesar y renderizar
        processMetrics();
        renderCharts();
        requestAnimationFrame(() => resizeReportCharts());

    } catch (err) {
        console.error('Error al cargar datos de estadísticas:', err);
        document.getElementById('kpi-total-visitas').textContent = 'Error';
        document.getElementById('kpi-normal-ops').textContent = 'Error';
        document.getElementById('kpi-pozos-unicos').textContent = 'Error';
        document.getElementById('kpi-visitas-prom').textContent = 'Error';
    } finally {
        if (currentLoadToken === state.loadToken) {
            hideStatsLoading();
        }
    }
}

function normalizeJourneyRecordsForStats(records = []) {
    return (Array.isArray(records) ? records : []).map(record => {
        const payload = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
        return {
            source: 'field_journey',
            id: record.id,
            journey_id: record.journey_id,
            pozo_name: normalizePozoName(record.pozo || payload.pozo),
            fecha: record.report_date || payload.fecha || '',
            hora: record.report_time || payload.hora || '',
            campo: record.campo || payload.campo || '',
            actividad: record.actividad || payload.actividad || 'Monitoreo',
            estatus: record.estatus || payload.estatus || '',
            modo_operacion: record.modo_operacion || payload.modo_operacion || '',
            observaciones: record.observaciones_pozo || payload.observaciones_pozo || '',
            diagnostico: record.diagnostico || payload.diagnostico || '',
            frecuencia: record.frecuencia ?? payload.frecuencia,
            pip: record.pip_psi ?? payload.pip_psi,
            tm: record.tm_f ?? payload.tm_f,
            echometer: payload.echometer || '',
            nivel_fluido_ft: payload.nivel_fluido_ft ?? payload.nivel_fluido ?? '',
            sumergencia_ft: payload.sumergencia_ft ?? payload.sumergencia ?? '',
            pip_echometer_psi: payload.pip_echometer_psi ?? payload.pip_echometer ?? '',
            baja_datos: payload.baja_datos || payload.descarga_datas_vsd || payload.descarga_datas_sensor || '',
            raw_payload: payload
        };
    });
}

function normalizeMonitoringRecordsForStats(records = []) {
    return (Array.isArray(records) ? records : []).map(record => ({
        source: 'monitoring',
        pozo_name: normalizePozoName(record.pozo_name),
        fecha: record.fecha || '',
        hora: record.hora || '',
        campo: record.campo || '',
        actividad: 'Monitoreo',
        estatus: record.estatus || '',
        modo_operacion: '',
        observaciones: record.observaciones || '',
        diagnostico: record.observaciones || '',
        frecuencia: record.frecuencia,
        pip: record.pip,
        tm: record.tm,
        echometer: '',
        nivel_fluido_ft: '',
        sumergencia_ft: '',
        pip_echometer_psi: '',
        baja_datos: ''
    }));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getMonthLabel() {
    const selectMonth = document.getElementById('select-month-report');
    return selectMonth?.options[selectMonth.selectedIndex]?.text || state.month;
}

function setStatsControlsDisabled(disabled = false) {
    document.getElementById('select-month-report')?.toggleAttribute('disabled', disabled);
    document.getElementById('select-field-report')?.toggleAttribute('disabled', disabled);
    document.getElementById('btn-export-pdf')?.toggleAttribute('disabled', disabled);
}

function showStatsLoading(message = 'Cargando reporte mensual') {
    const reportContainer = document.getElementById('reporte-container');
    if (!reportContainer) return;

    reportContainer.classList.add('stats-report-loading');
    let overlay = document.getElementById('stats-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'stats-loading-overlay';
        overlay.className = 'stats-loading-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = `
            <div class="stats-loading-dialog">
                <div class="stats-loading-spinner" aria-hidden="true"></div>
                <div>
                    <strong id="stats-loading-title">Cargando reporte mensual</strong>
                    <span>Actualizando indicadores, gráficos y resumen operativo.</span>
                </div>
            </div>
        `;
        reportContainer.appendChild(overlay);
    }

    const title = document.getElementById('stats-loading-title');
    if (title) title.textContent = message;
    setStatsControlsDisabled(true);
}

function hideStatsLoading() {
    document.getElementById('reporte-container')?.classList.remove('stats-report-loading');
    document.getElementById('stats-loading-overlay')?.remove();
    setStatsControlsDisabled(false);
}

function incrementMap(map, key, amount = 1) {
    const normalizedKey = String(key || 'SIN CLASIFICAR').trim().toUpperCase() || 'SIN CLASIFICAR';
    map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount);
}

function mapToSortedEntries(map) {
    return [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function isAffirmative(value) {
    return ['SI', 'SÍ', 'YES', 'TRUE', '1', 'OK'].includes(String(value || '').trim().toUpperCase());
}

function hasNumericValue(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0;
}

function hasExecutedLevel(record = {}) {
    return isAffirmative(record.echometer)
        || hasNumericValue(record.nivel_fluido_ft)
        || hasNumericValue(record.sumergencia_ft)
        || hasNumericValue(record.pip_echometer_psi);
}

function normalizeStatus(value = '') {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function classifyOperationMode(record = {}) {
    const value = String(record.modo_operacion || record.raw_payload?.modo_operacion || '').trim().toUpperCase();
    if (/CORRIENTE|AMP|I MOTOR/.test(value)) return 'CORRIENTE';
    if (/FRECUENCIA|HZ/.test(value)) return 'FRECUENCIA';
    if (/MANUAL/.test(value)) return 'MANUAL';
    if (/AUTO/.test(value)) return 'AUTOMÁTICO';
    return value || 'SIN MODO';
}

function classifyModeForChart(record = {}) {
    return classifyOperationMode(record);
}

function classifyOperationalStatusForChart(record = {}) {
    const status = normalizeStatus(record.estatus);
    if (['OFF', 'PARADAMANUAL', 'PARADO', 'PARADA', 'DETENIDO', 'INACTIVO', 'OFFATENCIONALCLIENTE'].includes(status)) return 'OFF';
    if (['RUN', 'RUNATENCIONALCLIENTE', 'RUNNING', 'OPERANDO', 'OPERATIVO', 'ACTIVO'].includes(status)) return 'RUN';
    return 'SIN ESTATUS / OTRO';
}

function classifyDiagnostico(record = {}) {
    const status = normalizeStatus(record.estatus);
    const text = `${record.diagnostico || ''} ${record.observaciones || ''}`.toLowerCase();

    if (['RUN', 'RUNATENCIONALCLIENTE'].includes(status)) {
        if (/señal|senal|sensor|comunicaci|data/.test(text)) return 'PÉRDIDA DE SEÑAL';
        return 'POZOS EN RUN / SIN FALLA';
    }

    if (!text.trim() && !['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(status)) return 'POZOS EN RUN / SIN FALLA';
    if (/sin falla|condiciones normales|normal|operativo/.test(text) && !['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(status)) return 'POZOS EN RUN / SIN FALLA';

    if (['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(status) && !text.trim()) return 'POZOS OFF / SIN DIAGNÓSTICO';
    if (/electr|vsd|volt|corriente|fusible|sen\b|suministro|generaci/.test(text)) return 'FALLA ELÉCTRICA';
    if (/baja produ|bajo aporte|baja frecuencia|declin/.test(text)) return 'BAJA PRODUCCIÓN';
    if (/señal|senal|sensor|comunicaci|data/.test(text)) return 'PÉRDIDA DE SEÑAL';
    if (/presi|thp|chp|lf|pip/.test(text)) return 'CONDICIÓN DE PRESIÓN';
    if (/temperatura|tm|calent/.test(text)) return 'ALTA TEMPERATURA';
    if (/mecanic|cabezal|manometro|cable|superficie/.test(text)) return 'CONDICIÓN MECÁNICA/SUPERFICIE';
    return ['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(status) ? 'OTROS DIAGNÓSTICOS' : 'POZOS EN RUN / SIN FALLA';
}

// Procesar Métricas y KPIs del resumen mensual corporativo.
function processMetrics() {
    const total = state.records.length;
    const diagnosticoEntries = buildDiagnosticEntries();
    
    // 1. Total Registros
    document.getElementById('kpi-total-visitas').textContent = total;

    // 2. Pozos en RUN / sin falla — basado principalmente en estatus operativo.
    const sinFallaCount = state.records.filter(record => classifyDiagnostico(record) === 'POZOS EN RUN / SIN FALLA').length;
    const sinFallaPercent = total > 0 ? Math.round((sinFallaCount / total) * 100) : 0;
    document.getElementById('kpi-normal-ops').textContent = `${sinFallaPercent}%`;

    // 3. Pozos Únicos Monitoreados — Set de pozo_name
    const pozosUnicos = new Set(
        state.records.map(r => String(r.pozo_name || '').trim().toUpperCase()).filter(Boolean)
    );
    document.getElementById('kpi-pozos-unicos').textContent = pozosUnicos.size;

    // 4. Niveles ejecutados — Echometer o medición acústica con valores reales.
    const nivelesEjecutados = getExecutedLevelPozoNames().size;
    document.getElementById('kpi-visitas-prom').textContent = nivelesEjecutados;

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

    const metaCampo = document.getElementById('pdf-report-meta-campo');
    const metaPeriodo = document.getElementById('pdf-report-meta-periodo');
    const metaEmision = document.getElementById('pdf-report-meta-emision');
    const metaUsuario = document.getElementById('pdf-report-meta-usuario');
    
    if (metaCampo) metaCampo.textContent = state.field === 'TODOS' ? 'TODOS LOS CAMPOS' : state.field;
    if (metaPeriodo) metaPeriodo.textContent = getMonthLabel().toUpperCase();
    if (metaEmision) metaEmision.textContent = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (metaUsuario) metaUsuario.textContent = state.userEmail || 'UV Servicios';

    renderMonthlyBrief({ total, pozosUnicos, diagnosticoEntries });
    renderAttachmentsSummary();
}

function getContractDisplayName() {
    if (state.activeOperationalScope === 'bmm') return 'BARUA / MOTATAN / MENE GRANDE';
    if (state.activeOperationalScope === 'ceiba_tomoporo') return 'LA CEIBA / TOMOPORO';
    return String(state.activeOperationalScope || 'CONTRATO ACTIVO').replace(/_/g, ' ').toUpperCase();
}

function buildDiagnosticEntries() {
    const diagnosticoMap = new Map();
    state.records.forEach(record => incrementMap(diagnosticoMap, classifyDiagnostico(record)));
    return mapToSortedEntries(diagnosticoMap);
}

function calculateJourneyCounts(totalRecords = state.records.length) {
    const journeysWithRecords = new Set(state.journeyRecords.map(record => record.journey_id).filter(Boolean));
    const countableJourneys = state.field === 'TODOS'
        ? state.fieldJourneys
        : state.fieldJourneys.filter(journey => journeysWithRecords.has(journey.id));
    let diurnoCount = 0;
    let nocturnoCount = 0;

    countableJourneys.forEach(journey => {
        const jornada = String(journey?.jornada || '').trim().toUpperCase();
        if (jornada === 'NOCTURNA') nocturnoCount += 1;
        if (jornada === 'DIURNA') diurnoCount += 1;
    });

    const hasJourneyTypeData = countableJourneys.length > 0;

    return {
        totalJourneys: countableJourneys.length || journeysWithRecords.size || totalRecords,
        diurnoCount: hasJourneyTypeData ? diurnoCount : totalRecords,
        nocturnoCount
    };
}

function renderMonthlyBrief({ total = 0, pozosUnicos = new Set(), diagnosticoEntries = [] } = {}) {
    const title = document.getElementById('monthly-report-title');
    const contract = document.getElementById('monthly-report-contract');
    const campo = document.getElementById('brief-campo');
    const estadoPozo = document.getElementById('brief-estado-pozo');
    const recorridoTotal = document.getElementById('brief-recorrido-total');
    const diurno = document.getElementById('brief-diurno');
    const nocturno = document.getElementById('brief-nocturno');
    const pozosCount = document.getElementById('brief-pozos-count');
    const actividad = document.getElementById('brief-actividad');
    const pozosLista = document.getElementById('brief-pozos-lista');
    const puntos = document.getElementById('brief-puntos-interes');

    const journeyCounts = calculateJourneyCounts(total);

    const offCount = state.records.filter(record => String(record.estatus || '').trim().toUpperCase().includes('OFF')).length;
    if (title) title.textContent = `Resumen de Actividades ${getMonthLabel().toUpperCase()}`;
    if (contract) contract.textContent = getContractDisplayName();
    if (campo) campo.textContent = state.field === 'TODOS' ? getContractDisplayName() : state.field;
    if (estadoPozo) estadoPozo.textContent = offCount > 0 ? 'OPERANDO / PARADO' : 'OPERANDO';
    if (recorridoTotal) recorridoTotal.textContent = String(journeyCounts.totalJourneys);
    if (diurno) diurno.textContent = String(journeyCounts.diurnoCount);
    if (nocturno) nocturno.textContent = String(journeyCounts.nocturnoCount);
    if (pozosCount) pozosCount.textContent = String(pozosUnicos.size);
    if (actividad) actividad.textContent = 'TOMA DE PARAMETROS OPERATIVOS';
    if (pozosLista) pozosLista.textContent = [...pozosUnicos].join(', ') || 'Sin pozos registrados';

    if (puntos) {
        const pointGroups = buildInterestPointGroups().slice(0, 6);
        puntos.innerHTML = pointGroups.length
            ? pointGroups.map(group => renderInterestPointItem(group)).join('')
            : '<li>Sin eventos críticos registrados en el período seleccionado.</li>';
    }
}

function buildInterestPointGroups() {
    const groups = new Map();
    state.records.forEach(record => {
        const diagnosticCategory = classifyDiagnostico(record);
        if (diagnosticCategory === 'POZOS EN RUN / SIN FALLA') return;
        const pozoName = normalizePozoName(record.pozo_name) || 'SIN POZO';
        const fieldDetail = String(record.diagnostico || record.observaciones || '').trim();
        const eventTitle = normalizeInterestEventTitle(fieldDetail || diagnosticCategory);
        if (!eventTitle) return;

        const current = groups.get(eventTitle) || {
            diagnostic: eventTitle,
            category: diagnosticCategory,
            records: [],
            pozos: new Set(),
            details: new Set(),
            pozoStats: new Map()
        };
        current.records.push(record);
        if (pozoName) current.pozos.add(pozoName);

        const detail = fieldDetail && normalizeInterestEventTitle(fieldDetail) !== eventTitle ? fieldDetail : '';
        if (detail) current.details.add(detail);

        const pozoStats = current.pozoStats.get(pozoName) || {
            pozoName,
            count: 0,
            details: new Set(),
            timestamps: new Set()
        };
        pozoStats.count += 1;
        if (detail) pozoStats.details.add(detail);
        const timestamp = [record.fecha, record.hora].map(value => String(value || '').trim()).filter(Boolean).join(' ');
        if (timestamp) pozoStats.timestamps.add(timestamp);
        current.pozoStats.set(pozoName, pozoStats);

        groups.set(eventTitle, current);
    });

    return [...groups.values()].sort((left, right) => right.records.length - left.records.length || left.diagnostic.localeCompare(right.diagnostic));
}

function normalizeInterestEventTitle(value = '') {
    const normalized = String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[.;:,]+$/g, '')
        .toUpperCase();

    if (!normalized) return '';
    if (/CONDICIONES? NORMALES?|SIN FALLA|OPERANDO NORMAL|SIN NOVEDAD/.test(normalized)) return '';
    if (/BAJA\s+CARGA/.test(normalized)) return 'BAJA CARGA';
    if (/FALLA.*GENERADOR|GENERADOR/.test(normalized)) return 'FALLA DE GENERADOR';
    if (/FALLA\s+ELECTR|ELECTRICA|ELÉCTRICA/.test(normalized)) return 'FALLA ELECTRICA';
    if (/PERDIDA\s+DE\s+SE[NÑ]AL|SE[NÑ]AL|SENSOR|COMUNICACI|DATA/.test(normalized)) return 'PERDIDA DE SENAL';
    if (/BAJA\s+PRODUCCI|BAJO\s+APORTE/.test(normalized)) return 'BAJA PRODUCCION';
    return normalized;
}

function renderInterestPointItem(group = {}) {
    const diagnosticText = String(group.diagnostic || '').toUpperCase();
    let cardAccentClass = 'diagnostic-card-default';

    // Determinar la clase de color según la categoría del diagnóstico
    if (diagnosticText.includes('ELECTRICA')) {
        cardAccentClass = 'diagnostic-card-blue';
    } else if (diagnosticText.includes('GENERADOR')) {
        cardAccentClass = 'diagnostic-card-orange';
    } else if (diagnosticText.includes('FUERA DE SERVICIO')) {
        cardAccentClass = 'diagnostic-card-red';
    } else if (diagnosticText.includes('DESBALANCEADO')) {
        cardAccentClass = 'diagnostic-card-purple';
    } else if (diagnosticText.includes('SUBCARGA')) {
        cardAccentClass = 'diagnostic-card-cyan';
    }

    const pozoRows = [...(group.pozoStats || new Map()).values()]
        .sort((left, right) => right.count - left.count || left.pozoName.localeCompare(right.pozoName));
        
    const pozoRowsHtml = pozoRows.map((row, index) => {
        const timestamps = [...row.timestamps].slice(0, 3);
        const isHidden = index >= 6;
        return `
            <div class="interest-point-pozo-row ${isHidden ? 'pozo-row-hidden' : ''}" style="${isHidden ? 'display: none;' : ''}">
                <div class="interest-point-pozo-main">
                    <strong>${escapeHtml(row.pozoName)}</strong>
                    <span>${row.count} evento${row.count === 1 ? '' : 's'}</span>
                </div>
                ${timestamps.length ? `<p>Registros de Campo: ${timestamps.map(escapeHtml).join(' · ')}</p>` : ''}
            </div>
        `;
    }).join('');

    const hiddenPozosCount = Math.max(0, pozoRows.length - 6);
    const supportDetails = [...(group.details || new Set())].slice(0, 3);
    const supportDetailsHtml = supportDetails.length
        ? `<div class="interest-point-support"><span>Notas asociadas desde Campo</span>${supportDetails.map(detail => `<p>${escapeHtml(detail)}</p>`).join('')}</div>`
        : '';

    const groupSafeId = 'group-' + String(group.diagnostic).toLowerCase().replace(/[^a-z0-9]/g, '-');

    return `
        <li id="${groupSafeId}" class="interest-point-category-card ${cardAccentClass}">
            <div class="interest-point-header">
                <strong>${escapeHtml(group.diagnostic)}</strong>
                <span>${group.records?.length || 0} evento${(group.records?.length || 0) === 1 ? '' : 's'} en ${group.pozoStats?.size || 0} pozo${(group.pozoStats?.size || 0) === 1 ? '' : 's'}</span>
            </div>
            <div class="interest-point-pozo-list">
                ${pozoRowsHtml}
                ${hiddenPozosCount ? `
                    <button type="button" class="interest-point-more-btn" onclick="toggleExtraPozos('${groupSafeId}', this, ${hiddenPozosCount})">
                        <i class="fa-solid fa-angles-down" style="margin-right: 6px;"></i> + ${hiddenPozosCount} pozo${hiddenPozosCount === 1 ? '' : 's'} adicional${hiddenPozosCount === 1 ? '' : 'es'}
                    </button>
                ` : ''}
            </div>
            ${supportDetailsHtml}
        </li>
    `;
}

// Controlar expansión/contracción de pozos adicionales en la web
window.toggleExtraPozos = function(groupSafeId, buttonEl, extraCount) {
    const cardEl = document.getElementById(groupSafeId);
    if (!cardEl) return;

    const hiddenRows = cardEl.querySelectorAll('.pozo-row-hidden');
    const isExpanding = !buttonEl.classList.contains('expanded');
    buttonEl.classList.toggle('expanded');

    if (isExpanding) {
        hiddenRows.forEach(row => {
            row.style.display = 'block';
            row.style.animation = 'fadeIn 0.25s ease forwards';
        });
        buttonEl.innerHTML = `<i class="fa-solid fa-angles-up" style="margin-right: 6px;"></i> Mostrar menos`;
    } else {
        hiddenRows.forEach(row => {
            row.style.display = 'none';
        });
        buttonEl.innerHTML = `<i class="fa-solid fa-angles-down" style="margin-right: 6px;"></i> + ${extraCount} pozo${extraCount === 1 ? '' : 's'} adicional${extraCount === 1 ? '' : 'es'}`;
    }
};

// Normalizar variantes de nombre de campo
function normalizeCampo(raw) {
    const val = String(raw || 'SIN CAMPO').trim().toUpperCase();
    if (val === 'LA CEIBA' || val === 'CEIBA') return 'CEIBA';
    if (val === 'TOM' || val === 'TOMOPORO') return 'TOMOPORO';
    if (val === 'BARÚA') return 'BARUA';
    return val;
}

// Renderizado de Gráficos (Chart.js) — Informe mensual corporativo.
function renderCharts() {
    // Destruir gráficos anteriores (excluyendo el gráfico de cobertura de adjuntos para evitar colisión de ciclos de vida)
    Object.entries(state.charts).forEach(([key, chart]) => {
        if (key === 'attachmentsProgress') return;
        if (chart && typeof chart.destroy === 'function') chart.destroy();
        delete state.charts[key];
    });

    const donutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: { font: { family: 'Inter', weight: 600, size: 11 }, color: '#475569', usePointStyle: true, pointStyle: 'circle' }
            }
        }
    };
    const motivoTitle = document.getElementById('chart-motivo-visita-title');
    const diagnosticoTitle = document.getElementById('chart-diagnostico-title');
    if (motivoTitle) motivoTitle.textContent = `Gráfico 2. Modo de operación ${getContractDisplayName()} · ${getMonthLabel().toUpperCase()}`;
    if (diagnosticoTitle) diagnosticoTitle.textContent = `Gráfico 4. Diagnóstico de falla ${getContractDisplayName()} · ${getMonthLabel().toUpperCase()}`;

    // ====================================================
    // GRÁFICO 1: Total de visitas por campo — Dona
    // ====================================================
    const visitasCampoMap = new Map();
    state.records.forEach(record => incrementMap(visitasCampoMap, normalizeCampo(record.campo)));
    const campoEntries = mapToSortedEntries(visitasCampoMap);

    const ctxVisitasCampo = document.getElementById('chart-visitas-campo')?.getContext('2d');
    if (ctxVisitasCampo) {
        state.charts.visitasCampo = new Chart(ctxVisitasCampo, {
            type: 'doughnut',
            data: {
                labels: campoEntries.map(([label]) => label),
                datasets: [{ data: campoEntries.map(([, value]) => value), backgroundColor: PALETTE.chartColors, borderWidth: 2, borderColor: '#FFFFFF' }]
            },
            options: donutOptions
        });
    }

    // ====================================================
    // GRÁFICO 2: Motivo de visita del contrato — Dona
    // ====================================================
    const motivoMap = new Map();
    state.records.forEach(record => incrementMap(motivoMap, classifyModeForChart(record)));
    const motivoEntries = mapToSortedEntries(motivoMap);

    const ctxMotivo = document.getElementById('chart-motivo-visita')?.getContext('2d');
    if (ctxMotivo) {
        state.charts.motivoVisita = new Chart(ctxMotivo, {
            type: 'doughnut',
            data: {
                labels: motivoEntries.map(([label]) => label),
                datasets: [{ data: motivoEntries.map(([, value]) => value), backgroundColor: PALETTE.chartColors, borderWidth: 2, borderColor: '#FFFFFF' }]
            },
            options: donutOptions
        });
    }

    // ====================================================
    // GRÁFICO 3: Cantidad de niveles por pozo — Barras verticales
    // ====================================================
    const pozosEntries = mapToSortedEntries(getExecutedLevelCountsByPozo());
    const maxNiveles = Math.max(...pozosEntries.map(([, value]) => value), 0);
    const barColors = pozosEntries.map(([, value]) => value === maxNiveles && value > 0 ? PALETTE.orange : PALETTE.blue);

    const ctxVisitas = document.getElementById('chart-niveles-pozo')?.getContext('2d');
    if (ctxVisitas) {
        state.charts.nivelesPozo = new Chart(ctxVisitas, {
            type: 'bar',
            data: {
                labels: pozosEntries.map(([label]) => label),
                datasets: [{ label: 'Niveles', data: pozosEntries.map(([, value]) => value), backgroundColor: barColors, borderRadius: 6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { family: 'Inter', weight: 600, size: 9 }, color: '#475569', maxRotation: 55, minRotation: 25 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } }
                }
            }
        });
    }

    // ====================================================
    // GRÁFICO 4: Diagnósticos — Torta + resumen numérico
    // ====================================================
    const diagnosticoEntries = buildDiagnosticEntries();
    const ctxDiagnosticos = document.getElementById('chart-diagnosticos')?.getContext('2d');
    if (ctxDiagnosticos) {
        state.charts.diagnosticos = new Chart(ctxDiagnosticos, {
            type: 'doughnut',
            data: {
                labels: diagnosticoEntries.map(([label]) => label),
                datasets: [{ data: diagnosticoEntries.map(([, value]) => value), backgroundColor: ['#10B981', '#EF4444', '#D97706', '#0052CC', '#06B6D4', '#8B5CF6', '#64748B'], borderWidth: 2, borderColor: '#FFFFFF' }]
            },
            options: {
                ...donutOptions,
                cutout: '62%',
                radius: '92%',
                layout: { padding: 0 },
                plugins: {
                    ...donutOptions.plugins,
                    legend: { display: false }
                }
            }
        });
    }
    renderDiagnosticSummary(diagnosticoEntries, state.records.length);
    renderFieldBreakdownCharts(donutOptions);

    // ====================================================
    // TABLA: Observaciones que Requieren Atención
    // ====================================================
    populatePozoFilterList();
    renderAlertasTable();
    renderOffWellsList();
}

function getReportFieldOrder() {
    const priority = ['TOMOPORO', 'CEIBA', 'BARUA', 'MOTATAN', 'MENE GRANDE'];
    const fieldsFromRecords = [...new Set(state.records.map(record => normalizeCampo(record.campo)).filter(Boolean))];
    const fields = [...new Set([...state.activeScopeFields.map(normalizeCampo), ...fieldsFromRecords])].filter(field => field && field !== 'SIN CAMPO');
    return fields.sort((left, right) => {
        const leftIndex = priority.indexOf(left);
        const rightIndex = priority.indexOf(right);
        const normalizedLeft = leftIndex === -1 ? 999 : leftIndex;
        const normalizedRight = rightIndex === -1 ? 999 : rightIndex;
        return normalizedLeft - normalizedRight || left.localeCompare(right);
    });
}

function renderFieldBreakdownCharts(donutOptions = {}) {
    const fields = getReportFieldOrder();
    renderFieldDetailSummary(fields);

    if (!fields.length) {
        return;
    }

    renderModeByFieldChart(fields);
    renderDiagnosticByFieldChart(fields);
}

function getFieldRecords(fieldName = '') {
    return state.records.filter(record => normalizeCampo(record.campo) === fieldName);
}

function collectOrderedCategories(fields = [], classifier = () => '') {
    const totals = new Map();
    fields.forEach(field => {
        getFieldRecords(field).forEach(record => incrementMap(totals, classifier(record)));
    });
    return mapToSortedEntries(totals).map(([label]) => label);
}

function buildStackedFieldDatasets(fields = [], categories = [], classifier = () => '', colors = PALETTE.chartColors) {
    return categories.map((category, index) => ({
        label: category,
        data: fields.map(field => getFieldRecords(field).filter(record => classifier(record) === category).length),
        backgroundColor: colors[index % colors.length],
        borderRadius: 5,
        stack: 'total'
    }));
}

function renderModeByFieldChart(fields = []) {
    const ctx = document.getElementById('chart-modo-operacion-campo')?.getContext('2d');
    if (!ctx) return;

    const orderedStatuses = ['RUN', 'OFF', 'SIN ESTATUS / OTRO'];
    const availableStatuses = new Set(collectOrderedCategories(fields, classifyOperationalStatusForChart));
    const categories = orderedStatuses.filter(status => availableStatuses.has(status));
    const datasets = buildStackedFieldDatasets(fields, categories, classifyOperationalStatusForChart, ['#10B981', '#DC2626', '#64748B']);

    state.charts.modoCampo = new Chart(ctx, {
        type: 'bar',
        data: { labels: fields, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Inter', weight: 600, size: 11 }, color: '#475569', usePointStyle: true, pointStyle: 'circle' }
                }
            },
            scales: {
                x: { stacked: true, ticks: { font: { family: 'Inter', weight: 700, size: 10 }, color: '#475569' }, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } }
            }
        }
    });
}

function renderDiagnosticByFieldChart(fields = []) {
    const ctx = document.getElementById('chart-diagnostico-campo')?.getContext('2d');
    if (!ctx) return;

    const categories = collectOrderedCategories(fields, classifyDiagnostico);
    const datasets = buildStackedFieldDatasets(fields, categories, classifyDiagnostico, ['#10B981', '#EF4444', '#D97706', '#0052CC', '#06B6D4', '#8B5CF6', '#64748B']);

    state.charts.diagnosticoCampo = new Chart(ctx, {
        type: 'bar',
        data: { labels: fields, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Inter', weight: 600, size: 11 }, color: '#475569', usePointStyle: true, pointStyle: 'circle' }
                }
            },
            scales: {
                x: { stacked: true, beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748B', stepSize: 1 }, grid: { color: '#F1F5F9' } },
                y: { stacked: true, ticks: { font: { family: 'Inter', weight: 700, size: 10 }, color: '#475569' }, grid: { display: false } }
            }
        }
    });
}

function getTopEntry(records = [], classifier = () => '') {
    const map = new Map();
    records.forEach(record => incrementMap(map, classifier(record)));
    return mapToSortedEntries(map)[0]?.[0] || '—';
}

function renderFieldDetailSummary(fields = []) {
    const tbody = document.getElementById('field-detail-summary-body');
    if (!tbody) return;

    if (!fields.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94A3B8;padding:24px;">Sin datos por campo para este período.</td></tr>';
        return;
    }

    tbody.innerHTML = buildFieldDetailRows(fields).map(row => {
        return `
            <tr>
                <td style="font-weight:800;white-space:nowrap;">${escapeHtml(row.field)}</td>
                <td>${row.total}</td>
                <td>${row.runCount}</td>
                <td>${row.offCount}</td>
                <td>${row.levelCount}</td>
                <td>${escapeHtml(row.mainMode)}</td>
                <td>${escapeHtml(row.mainDiagnostic)}</td>
            </tr>
        `;
    }).join('');
}

function buildFieldDetailRows(fields = getReportFieldOrder()) {
    const executedLevelPozos = getExecutedLevelPozoNames();
    return fields.map(field => {
        const records = getFieldRecords(field);
        return {
            field,
            total: records.length,
            runCount: records.filter(record => classifyDiagnostico(record) === 'POZOS EN RUN / SIN FALLA').length,
            offCount: records.filter(record => ['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(normalizeStatus(record.estatus))).length,
            levelCount: new Set(records.map(record => normalizePozoName(record.pozo_name)).filter(pozo => executedLevelPozos.has(pozo))).size,
            mainMode: getTopEntry(records, classifyModeForChart),
            mainDiagnostic: getTopEntry(records, classifyDiagnostico)
        };
    });
}

function renderDiagnosticSummary(entries = [], total = 0) {
    const container = document.getElementById('diagnosticos-resumen');
    if (!container) return;
    if (!entries.length) {
        container.innerHTML = '<div class="diagnostic-summary-empty">Sin diagnósticos registrados en el período.</div>';
        return;
    }

    container.innerHTML = entries.map(([label, value]) => {
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;
        return `
            <div class="diagnostic-summary-item">
                <span>${escapeHtml(label)}</span>
                <strong>${value} · ${percent}%</strong>
            </div>
        `;
    }).join('');
}

function getDocumentsByPozoAndCategory() {
    const map = new Map();
    state.fieldDocuments.forEach(doc => {
        const pozo = normalizePozoName(doc.pozo_name);
        const category = String(doc.categoria || '').trim().toUpperCase();
        if (!pozo || !category) return;
        const key = `${pozo}|${category}`;
        map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
}

function getExecutedLevelPozoNames() {
    return new Set(mapToSortedEntries(getExecutedLevelCountsByPozo()).map(([pozo]) => pozo));
}

function getExecutedLevelCountsByPozo() {
    const documentsMap = getDocumentsByPozoAndCategory();
    const counts = new Map();

    state.records.forEach(record => {
        const pozo = normalizePozoName(record.pozo_name);
        if (!pozo || !hasExecutedLevel(record)) return;
        counts.set(pozo, (counts.get(pozo) || 0) + 1);
    });

    documentsMap.forEach((count, key) => {
        const [pozo, category] = String(key || '').split('|');
        if (category !== 'REGISTROS_ECHOMETER' || !pozo) return;
        counts.set(pozo, Math.max(counts.get(pozo) || 0, Number(count) || 0));
    });

    return counts;
}

function renderAttachmentsSummary() {
    const list = document.getElementById('field-attachments-summary-list');
    if (!list) return;

    const documentsMap = getDocumentsByPozoAndCategory();
    const rowsByPozo = new Map();

    state.records.forEach(record => {
        const pozo = normalizePozoName(record.pozo_name);
        if (!pozo) return;
        const current = rowsByPozo.get(pozo) || {
            pozo,
            campo: record.campo || '—',
            fecha: record.fecha || '—',
            echometer: false,
            dataVsd: false
        };
        current.echometer = current.echometer || isAffirmative(record.echometer);
        current.dataVsd = current.dataVsd || isAffirmative(record.baja_datos);
        if (String(record.fecha || '') > String(current.fecha || '')) current.fecha = record.fecha;
        rowsByPozo.set(pozo, current);
    });

    const rows = [...rowsByPozo.values()].map(row => {
        const echoDocs = documentsMap.get(`${row.pozo}|REGISTROS_ECHOMETER`) || 0;
        const vsdDocs = (documentsMap.get(`${row.pozo}|VOLCADOS_VSD`) || 0) + (documentsMap.get(`${row.pozo}|DATA_SENSOR_FONDO`) || 0);
        const supportDocs = documentsMap.get(`${row.pozo}|SOPORTES`) || 0;
        return { ...row, echoDocs, vsdDocs, supportDocs };
    }).filter(row => row.echometer || row.dataVsd || row.echoDocs || row.vsdDocs || row.supportDocs)
        .sort((left, right) => left.pozo.localeCompare(right.pozo));

    const echoCount = rows.filter(row => row.echometer || row.echoDocs > 0).length;
    const vsdCount = rows.reduce((sum, row) => sum + row.vsdDocs, 0);
    const supportCount = rows.reduce((sum, row) => sum + row.supportDocs, 0);

    const echoKpi = document.getElementById('kpi-echometer-ejecutados');
    const vsdKpi = document.getElementById('kpi-vsd-adjuntos');
    const supportKpi = document.getElementById('kpi-soportes-adjuntos');
    if (echoKpi) echoKpi.textContent = echoCount;
    if (vsdKpi) vsdKpi.textContent = vsdCount;
    if (supportKpi) supportKpi.textContent = supportCount;

    // Instanciar gráfico de cobertura de adjuntos
    const ctx = document.getElementById('chart-attachments-progress')?.getContext('2d');
    if (ctx) {
        if (state.charts.attachmentsProgress) {
            state.charts.attachmentsProgress.destroy();
        }

        const totalWells = rows.length || 1;
        const countEcho = rows.filter(row => row.echometer || row.echoDocs > 0).length;
        const countVsd = rows.filter(row => row.dataVsd || row.vsdDocs > 0).length;
        const countPics = rows.filter(row => row.supportDocs > 0).length;

        state.charts.attachmentsProgress = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Echómetro', 'Volcado VSD', 'Soportes'],
                datasets: [{
                    label: 'Pozos con datos',
                    data: [countEcho, countVsd, countPics],
                    backgroundColor: ['rgba(16, 185, 129, 0.85)', 'rgba(37, 99, 235, 0.85)', 'rgba(139, 92, 246, 0.85)'],
                    borderRadius: 6,
                    barThickness: 14
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: totalWells,
                        ticks: { stepSize: Math.ceil(totalWells / 4), color: '#64748b', font: { family: 'Outfit', size: 10, weight: 600 } },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        ticks: { color: '#0f172a', font: { family: 'Outfit', size: 11, weight: 700 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    if (!rows.length) {
        list.innerHTML = '<div class="attachments-empty-state">Sin Echometer, volcados VSD o soportes cargados en este período.</div>';
        return;
    }

    const tableRows = rows.map(row => {
        const hasEcho = row.echometer || row.echoDocs > 0;
        const hasVsd = row.dataVsd || row.vsdDocs > 0;
        
        // Calcular porcentaje de completitud (33.3% por cada tipo de adjunto)
        let completeness = 0;
        if (hasEcho) completeness += 33.3;
        if (hasVsd) completeness += 33.3;
        if (row.supportDocs > 0) completeness += 33.4;
        completeness = Math.round(completeness);

        const echoBadge = hasEcho 
            ? `<span class="badge-attachment-ok" title="${row.echoDocs} archivo(s)"><i class="fa-solid fa-circle-check"></i> ${row.echoDocs || 1} ejec.</span>`
            : `<span class="badge-attachment-empty"><i class="fa-solid fa-circle-minus"></i> Sin dato</span>`;

        const vsdBadge = hasVsd
            ? `<span class="badge-attachment-ok" title="${row.vsdDocs} archivo(s)"><i class="fa-solid fa-circle-check"></i> ${row.vsdDocs || 1} subido</span>`
            : `<span class="badge-attachment-empty"><i class="fa-solid fa-circle-minus"></i> Sin dato</span>`;

        const supportBadge = row.supportDocs > 0
            ? `<span class="badge-attachment-info"><i class="fa-solid fa-camera"></i> ${row.supportDocs} fotos</span>`
            : `<span class="badge-attachment-empty"><i class="fa-solid fa-circle-minus"></i> Sin fotos</span>`;

        let progressColor = '#eab308'; // Amarillo (bajo)
        if (completeness > 80) progressColor = '#10b981'; // Verde (alto)
        else if (completeness > 40) progressColor = '#2563eb'; // Azul (medio)

        const formattedDate = row.fecha && row.fecha !== '—' ? row.fecha.split('-').reverse().join('/') : '—';

        return `
            <tr>
                <td style="font-weight: 800; color: #0f172a; padding: 10px 14px; font-size: 0.84rem;">${escapeHtml(row.pozo)}</td>
                <td style="color: #475569; padding: 10px 14px; font-size: 0.82rem;">${escapeHtml(row.campo || '—')}</td>
                <td style="color: #64748b; font-size: 0.78rem; padding: 10px 14px;">${escapeHtml(formattedDate)}</td>
                <td style="padding: 10px 14px; text-align: center;">${echoBadge}</td>
                <td style="padding: 10px 14px; text-align: center;">${vsdBadge}</td>
                <td style="padding: 10px 14px; text-align: center;">${supportBadge}</td>
                <td style="padding: 10px 14px; vertical-align: middle; width: 140px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex-grow: 1; height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; position: relative;">
                            <div style="width: ${completeness}%; height: 100%; background: ${progressColor}; border-radius: 999px;"></div>
                        </div>
                        <span style="font-size: 0.76rem; font-weight: 800; color: #0f172a; min-width: 32px; text-align: right;">${completeness}%</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    list.innerHTML = `
        <div class="stats-table-responsive" style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <table class="stats-table" style="width: 100%; border-collapse: collapse; text-align: left; font-family: 'Outfit', sans-serif;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569;">Pozo</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569;">Campo</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569;">Última Visita</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569; text-align: center; width: 120px;">Echometer</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569; text-align: center; width: 120px;">Volcados VSD</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569; text-align: center; width: 110px;">Soportes</th>
                        <th style="padding: 10px 14px; font-weight: 800; text-transform: uppercase; font-size: 0.7rem; color: #475569; width: 130px;">Completitud</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
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
            if (selectedStatus === 'RUN') {
                return ['RUN', 'RUN / ATENCION AL CLIENTE'].includes(status);
            }
            if (selectedStatus === 'OFF') {
                return ['OFF', 'PARADA MANUAL', 'OFF / ATENCION AL CLIENTE'].includes(status);
            }
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
        
        const isRun = ['RUN', 'RUN / ATENCION AL CLIENTE'].includes(estatus);
        const isOff = ['OFF', 'PARADA MANUAL', 'OFF / ATENCION AL CLIENTE'].includes(estatus);

        // Abreviar textos largos para que quepan perfectamente en el badge sin superponerse
        const estatusVisual = estatus
            .replace('RUN / ATENCION AL CLIENTE', 'RUN (Atención)')
            .replace('OFF / ATENCION AL CLIENTE', 'OFF (Atención)')
            .replace('PARADA MANUAL', 'OFF (Manual)');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;white-space:nowrap;width:100px;">${pozo}</td>
            <td style="white-space:nowrap;color:#64748B;width:110px;">${campo}</td>
            <td style="white-space:nowrap;color:#64748B;width:105px;">${fecha}</td>
            <td style="width:130px;text-align:center;padding:10px 8px;">
                <span class="pozo-option-state ${isRun ? 'active-run' : isOff ? 'inactive-off' : 'inactive'}" title="${estatus}">
                    ${estatusVisual}
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

function showPdfGenerationModal() {
    if (!window.Swal) return;

    window.Swal.fire({
        title: 'Generando reporte mensual',
        html: `
            <div class="stats-pdf-modal">
                <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV Servicios" class="stats-pdf-modal-logo">
                <p>Estamos preparando el informe ejecutivo con sus indicadores, gráficos y resumen operativo.</p>
                <span>Por favor espera unos segundos. No cierres esta ventana.</span>
            </div>
        `,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        background: '#ffffff',
        color: '#0A2540',
        customClass: {
            popup: 'stats-pdf-swal-popup',
            title: 'stats-pdf-swal-title',
            htmlContainer: 'stats-pdf-swal-html'
        },
        didOpen: () => window.Swal.showLoading()
    });
}

function closePdfGenerationModal() {
    if (window.Swal?.isVisible()) {
        window.Swal.close();
    }
}

function resizeReportCharts(width, height) {
    Object.values(state.charts || {}).forEach(chart => {
        if (chart && typeof chart.resize === 'function') {
            if (width && height) {
                chart.resize(width, height);
            } else {
                chart.resize();
            }
        }
    });
}

function waitForPdfLayout() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            Object.values(state.charts || {}).forEach(chart => {
                const parent = chart?.canvas?.parentElement;
                const width = parent?.clientWidth || 320;
                const height = parent?.clientHeight || 128;
                if (chart && typeof chart.resize === 'function') {
                    chart.resize(width, height);
                }
            });
            requestAnimationFrame(resolve);
        });
    });
}

function showPdfGenerationResult(type, title, text) {
    if (!window.Swal) {
        if (type === 'error') alert(text || title);
        return;
    }

    window.Swal.fire({
        icon: type,
        title,
        text,
        confirmButtonText: 'Entendido',
        confirmButtonColor: type === 'error' ? '#EF4444' : '#0052CC',
        customClass: {
            popup: 'stats-pdf-swal-popup',
            title: 'stats-pdf-swal-title'
        }
    });
}

function restorePdfCaptureState(container, headerPrint, ignoreElements, originalDisplays) {
    container?.classList.remove('stats-pdf-export-mode');
    resizeReportCharts();

    if (headerPrint) {
        headerPrint.style.display = 'none';
    }

    ignoreElements.forEach((el, idx) => {
        el.style.display = originalDisplays[idx];
    });
}

function getJourneyCounts() {
    return calculateJourneyCounts(state.records.length);
}

function getMonthlyPdfData() {
    const total = state.records.length;
    const pozosUnicos = new Set(state.records.map(record => normalizePozoName(record.pozo_name)).filter(Boolean));
    const sinFallaCount = state.records.filter(record => classifyDiagnostico(record) === 'POZOS EN RUN / SIN FALLA').length;
    const nivelesEjecutados = getExecutedLevelPozoNames().size;
    const offCount = state.records.filter(record => ['OFF', 'PARADAMANUAL', 'OFFATENCIONALCLIENTE'].includes(normalizeStatus(record.estatus))).length;

    return {
        total,
        pozosUnicos,
        sinFallaPercent: total > 0 ? Math.round((sinFallaCount / total) * 100) : 0,
        nivelesEjecutados,
        offCount,
        journeyCounts: getJourneyCounts(),
        fieldRows: buildFieldDetailRows(),
        interestPoints: buildInterestPointGroups().slice(0, 5),
        contractName: getContractDisplayName(),
        monthLabel: getMonthLabel().toUpperCase(),
        fieldLabel: state.field === 'TODOS' ? getContractDisplayName() : state.field,
        generatedAt: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        userEmail: state.userEmail || 'UV Servicios'
    };
}

function getChartImage(chartKey) {
    const chart = state.charts?.[chartKey];
    if (!chart) return '';
    try {
        return createPdfChartImage(chartKey, chart);
    } catch (error) {
        console.warn(`No se pudo convertir el grafico ${chartKey} a imagen:`, error);
        return '';
    }
}

function createPdfChartImage(chartKey, sourceChart) {
    if (typeof Chart === 'undefined') return sourceChart?.canvas?.toDataURL('image/png', 1) || '';

    const isDoughnut = ['visitasCampo', 'motivoVisita', 'diagnosticos'].includes(chartKey);
    const canvas = document.createElement('canvas');
    if (isDoughnut) {
        canvas.width = 440;
        canvas.height = 360;
    } else {
        canvas.width = 640;
        canvas.height = chartKey === 'diagnosticoCampo' ? 340 : 320;
    }
    const context = canvas.getContext('2d');
    if (!context) return sourceChart?.canvas?.toDataURL('image/png', 1) || '';

    const type = sourceChart.config?.type || 'bar';
    const data = JSON.parse(JSON.stringify(sourceChart.data || {}));
    const isHorizontal = chartKey === 'diagnosticoCampo';
    const showLegend = chartKey !== 'diagnosticos' && chartKey !== 'nivelesPozo';

    const pdfChart = new Chart(context, {
        type,
        data,
        options: {
            responsive: false,
            maintainAspectRatio: true,
            aspectRatio: isDoughnut ? 1.22 : (chartKey === 'diagnosticoCampo' ? 1.88 : 2.0),
            animation: false,
            indexAxis: isHorizontal ? 'y' : 'x',
            cutout: isDoughnut ? '55%' : undefined,
            plugins: {
                legend: {
                    display: showLegend,
                    position: 'bottom',
                    labels: {
                        color: '#475569',
                        boxWidth: 10,
                        boxHeight: 10,
                        font: { family: 'Inter', size: 10, weight: 700 },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            scales: isDoughnut ? undefined : {
                x: {
                    stacked: chartKey === 'modoCampo' || chartKey === 'diagnosticoCampo',
                    beginAtZero: true,
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 9, weight: 700 }, maxRotation: chartKey === 'nivelesPozo' ? 35 : 0, minRotation: chartKey === 'nivelesPozo' ? 20 : 0 },
                    grid: { color: '#eef2f7' }
                },
                y: {
                    stacked: chartKey === 'modoCampo' || chartKey === 'diagnosticoCampo',
                    beginAtZero: true,
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 9, weight: 700 } },
                    grid: { color: '#eef2f7' }
                }
            }
        }
    });

    pdfChart.update('none');
    const image = canvas.toDataURL('image/png', 1);
    pdfChart.destroy();
    return image;
}

function renderPdfKpiCard(label, value, tone = 'blue') {
    return `
        <article class="monthly-pdf-kpi monthly-pdf-kpi-${tone}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </article>
    `;
}

function renderPdfChartCard(title, subtitle, chartKey) {
    const image = getChartImage(chartKey);
    return `
        <article class="monthly-pdf-chart-card">
            <div class="monthly-pdf-card-head">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(subtitle)}</p>
            </div>
            ${image ? `<img src="${image}" alt="${escapeHtml(title)}">` : '<div class="monthly-pdf-empty">Grafico no disponible</div>'}
        </article>
    `;
}

function renderPdfInterestPointsPageHTML(eventsChunk, pageNum, totalPages) {
    const rows = eventsChunk.map(evt => {
        const dateStr = evt.fecha ? evt.fecha.split('-').reverse().join('/') : '--';
        const timeStr = evt.hora ? evt.hora.slice(0, 5) : '--';
        return `
            <tr>
                <td style="font-weight: 700; white-space: nowrap; color: #475569; padding: 7px 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.74rem;">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</td>
                <td style="font-weight: 800; color: #0f172a; padding: 7px 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.74rem;">${escapeHtml(evt.pozo)}</td>
                <td style="font-weight: 800; color: #2563eb; padding: 7px 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.74rem;">${escapeHtml(evt.diagnostico)}</td>
                <td style="color: #334155; font-size: 0.71rem; padding: 7px 12px; border-bottom: 1px solid #f1f5f9; line-height: 1.35;">${escapeHtml(evt.comentario)}</td>
            </tr>
        `;
    }).join('');

    const subtitleText = totalPages > 1 
        ? `Parte ${pageNum} de ${totalPages} · Lista cronológica de alertas operativas en el periodo.`
        : 'Lista cronológica de alertas operativas (fallas eléctricas, subcargas, paradas y fallas de generadores).';

    return `
        <!-- PÁGINA DE EVENTOS CRÍTICOS -->
        <section class="monthly-pdf-page monthly-pdf-page-events">
            <div class="monthly-pdf-page-title" style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;">
                <span>Trazabilidad Técnica</span>
                <h2>Puntos de Interés y Eventos Críticos</h2>
                <p>${subtitleText}</p>
            </div>
            <div style="flex-grow: 1;">
                ${eventsChunk.length === 0 ? `
                    <div style="padding: 30px; text-align: center; color: #64748b; font-size: 0.88rem; font-weight: 600; border: 1px dashed #e2e8f0; border-radius: 12px; margin-top: 14px;">
                        Sin eventos críticos registrados en el periodo seleccionado.
                    </div>
                ` : `
                    <div style="overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; margin-top: 14px; background: #ffffff;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: 'Outfit', sans-serif;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="width: 120px; font-weight: 800; text-transform: uppercase; font-size: 0.68rem; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; letter-spacing: 0.02em;">Fecha / Hora</th>
                                    <th style="width: 80px; font-weight: 800; text-transform: uppercase; font-size: 0.68rem; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; letter-spacing: 0.02em;">Pozo</th>
                                    <th style="width: 160px; font-weight: 800; text-transform: uppercase; font-size: 0.68rem; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; letter-spacing: 0.02em;">Categoría de Falla</th>
                                    <th style="font-weight: 800; text-transform: uppercase; font-size: 0.68rem; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; letter-spacing: 0.02em;">Observaciones / Comentario Técnico</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </section>
    `;
}

function renderPdfFieldCards(rows = []) {
    if (!rows.length) return '<div class="monthly-pdf-empty">Sin datos por campo para este periodo.</div>';
    const maxTotal = Math.max(...rows.map(row => row.total), 1);
    return rows.map(row => {
        const runPercent = row.total > 0 ? Math.round((row.runCount / row.total) * 100) : 0;
        const offPercent = row.total > 0 ? Math.round((row.offCount / row.total) * 100) : 0;
        const totalWidth = Math.max(6, Math.round((row.total / maxTotal) * 100));
        return `
            <article class="monthly-pdf-field-card">
                <div class="monthly-pdf-field-title">
                    <strong>${escapeHtml(row.field)}</strong>
                    <span>${row.total} visitas</span>
                </div>
                <div class="monthly-pdf-field-bars">
                    <div><span>Visitas</span><i style="width:${totalWidth}%"></i><b>${row.total}</b></div>
                    <div><span>RUN / sin falla</span><i class="ok" style="width:${runPercent}%"></i><b>${row.runCount}</b></div>
                    <div><span>OFF</span><i class="warn" style="width:${offPercent}%"></i><b>${row.offCount}</b></div>
                </div>
                <dl>
                    <div><dt>Niveles</dt><dd>${row.levelCount}</dd></div>
                    <div><dt>Modo principal</dt><dd>${escapeHtml(row.mainMode)}</dd></div>
                    <div><dt>Diagnostico principal</dt><dd>${escapeHtml(row.mainDiagnostic)}</dd></div>
                </dl>
            </article>
        `;
    }).join('');
}

function buildMonthlyPdfDocument() {
    const data = getMonthlyPdfData();
    
    // Extraer todos los eventos críticos individuales
    const events = [];
    data.interestPoints.forEach(group => {
        (group.records || []).forEach(record => {
            events.push({
                fecha: record.fecha || '',
                hora: record.hora || '',
                pozo: record.pozo_name || '',
                diagnostico: group.diagnostic || '',
                comentario: record.observaciones || record.diagnostico || 'Monitoreo de parámetros'
            });
        });
    });

    // Ordenar cronológicamente (más recientes primero)
    events.sort((a, b) => {
        const dateA = new Date(`${a.fecha}T${a.hora || '00:00:00'}`);
        const dateB = new Date(`${b.fecha}T${b.hora || '00:00:00'}`);
        return dateB - dateA;
    });

    // Dividir los eventos en chunks dinámicos según su longitud de texto para que nunca se corten
    const chunks = [];
    let currentChunk = [];
    let currentWeight = 0;
    const maxWeightPerPage = 17; // Peso máximo seguro por página A4

    events.forEach(evt => {
        const commentLength = String(evt.comentario || '').length;
        let weight = 1;
        if (commentLength > 160) {
            weight = 3.5; // Texto muy largo (ocupa 3-4 líneas)
        } else if (commentLength > 70) {
            weight = 2; // Texto medio (ocupa 2 líneas)
        }

        // Si agregar este evento supera el límite seguro de la página, creamos una nueva
        if (currentWeight + weight > maxWeightPerPage && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [evt];
            currentWeight = weight;
        } else {
            currentChunk.push(evt);
            currentWeight += weight;
        }
    });
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    // Generar el marcado de las páginas de eventos
    let eventsPagesHTML = '';
    if (chunks.length === 0) {
        eventsPagesHTML = renderPdfInterestPointsPageHTML([], 1, 1);
    } else {
        chunks.forEach((chunk, index) => {
            eventsPagesHTML += renderPdfInterestPointsPageHTML(chunk, index + 1, chunks.length);
        });
    }

    const documentElement = document.createElement('div');
    documentElement.className = 'monthly-pdf-document';
    documentElement.innerHTML = `
        <!-- PÁGINA 1: Portada y KPIs de Métricas -->
        <section class="monthly-pdf-page monthly-pdf-page-summary">
            <header class="monthly-pdf-header">
                <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV Servicios">
                <div>
                    <span>Resumen Ejecutivo Mensual</span>
                    <h1>Gestion Operativa de Monitoreo</h1>
                    <p>Reporte estadistico de visitas, disponibilidad y alertas de la flota de pozos.</p>
                </div>
            </header>
            <div class="monthly-pdf-meta-grid">
                <div><span>Campo(s)</span><strong>${escapeHtml(state.field === 'TODOS' ? 'TODOS LOS CAMPOS' : state.field)}</strong></div>
                <div><span>Contrato</span><strong>${escapeHtml(data.contractName)}</strong></div>
                <div><span>Periodo</span><strong>${escapeHtml(data.monthLabel)}</strong></div>
                <div><span>Emision</span><strong>${escapeHtml(data.generatedAt)}</strong></div>
                <div><span>Generado por</span><strong>${escapeHtml(data.userEmail)}</strong></div>
            </div>
            
            <article class="monthly-pdf-section monthly-pdf-brief" style="margin-bottom: 24px;">
                <div class="monthly-pdf-section-title">
                    <span>Resumen de Actividades</span>
                    <h2>${escapeHtml(data.monthLabel)}</h2>
                </div>
                <div class="monthly-pdf-info-grid" style="display: block !important;">
                    <dl style="margin: 0 !important; width: 100% !important;">
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Empresa</dt><dd>UV SERVICIOS</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Campo</dt><dd>${escapeHtml(data.fieldLabel)}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Estado del pozo</dt><dd>${data.offCount > 0 ? 'OPERANDO / PARADO' : 'OPERANDO'}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Tipo de sistema</dt><dd>BES</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Servicio</dt><dd>MONITOREO</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Recorrido total</dt><dd>${data.journeyCounts.totalJourneys}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Diurno</dt><dd>${data.journeyCounts.diurnoCount}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Nocturno</dt><dd>${data.journeyCounts.nocturnoCount}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Pozos</dt><dd>${data.pozosUnicos.size}</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important;"><dt>Actividad</dt><dd>TOMA DE PARAMETROS OPERATIVOS</dd></div>
                        <div style="grid-template-columns: 200px minmax(0, 1fr) !important; align-items: start !important; min-height: auto !important; padding-top: 8px !important; padding-bottom: 8px !important; border-bottom: none !important;">
                            <dt style="font-weight: 800; color: #0052cc;">Pozos Monitoreados</dt>
                            <dd style="text-align: right; line-height: 1.45; word-break: break-word; color: #475569; font-weight: 700; font-size: 10px !important;">
                                ${escapeHtml([...data.pozosUnicos].join(', ') || 'Sin pozos registrados')}
                            </dd>
                        </div>
                    </dl>
                </div>
            </article>

            <div class="monthly-pdf-kpi-grid" style="margin-top: auto;">
                ${renderPdfKpiCard('Total visitas registradas', data.total, 'blue')}
                ${renderPdfKpiCard('Pozos sin falla', `${data.sinFallaPercent}%`, 'green')}
                ${renderPdfKpiCard('Pozos unicos monitoreados', data.pozosUnicos.size, 'purple')}
                ${renderPdfKpiCard('Niveles ejecutados', data.nivelesEjecutados, 'orange')}
            </div>
        </section>

        <!-- PÁGINAS DINÁMICAS DE PUNTOS DE INTERÉS -->
        ${eventsPagesHTML}

        <!-- PÁGINA 3 (Siguiente): Gráficos Analíticos -->
        <section class="monthly-pdf-page monthly-pdf-page-charts">
            <div class="monthly-pdf-page-title" style="margin-bottom: 20px;">
                <span>Analitica Operativa</span>
                <h2>Graficos principales</h2>
            </div>
            <div class="monthly-pdf-chart-grid">
                ${renderPdfChartCard('Grafico 1. Total de Visitas por Campo', 'Distribucion mensual entre campos del contrato activo.', 'visitasCampo')}
                ${renderPdfChartCard(`Grafico 2. Modo de operacion ${data.contractName}`, 'Frecuencia, corriente y otros modos capturados en jornada.', 'motivoVisita')}
                ${renderPdfChartCard('Grafico 3. Cantidad de Niveles por Pozo', 'Pozos con niveles ejecutados durante el periodo.', 'nivelesPozo')}
                ${renderPdfChartCard(`Grafico 4. Diagnostico de falla ${data.contractName}`, 'Distribucion de diagnosticos segun jornadas aprobadas.', 'diagnosticos')}
            </div>
        </section>

        <!-- PÁGINA 4 (Siguiente): Comparativo Ejecutivo y Detalle de Campos -->
        <section class="monthly-pdf-page monthly-pdf-page-detail">
            <div class="monthly-pdf-page-title" style="margin-bottom: 16px;">
                <span>Comparativo por Campo</span>
                <h2>Detalle ejecutivo operativo</h2>
            </div>
            <div class="monthly-pdf-chart-grid monthly-pdf-chart-grid-compact" style="margin-bottom: 16px;">
                ${renderPdfChartCard('Estado Operativo por Campo', 'Comparativo de pozos en RUN y OFF por campo.', 'modoCampo')}
                ${renderPdfChartCard('Diagnostico Operativo por Campo', 'RUN/sin falla, perdida de senal y otros diagnosticos.', 'diagnosticoCampo')}
            </div>
            <div class="monthly-pdf-field-grid">
                ${renderPdfFieldCards(data.fieldRows)}
            </div>
        </section>
    `;
    return documentElement;
}

async function exportMonthlyPdfPages(pdfDocument, filename) {
    const JsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
    if (!window.html2canvas || !JsPdfCtor) return false;

    const pages = [...pdfDocument.querySelectorAll('.monthly-pdf-page')];
    if (!pages.length) return false;

    const pdf = new JsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let index = 0; index < pages.length; index += 1) {
        const canvas = await window.html2canvas(pages[index], {
            scale: 1.7,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794
        });
        const image = canvas.toDataURL('image/jpeg', 0.95);
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
    }

    pdf.save(filename);
    return true;
}

const PDF_THEME = {
    blue: '#0052CC',
    dark: '#0A2540',
    text: '#334155',
    muted: '#64748B',
    border: '#D8DEE8',
    soft: '#F8FAFC',
    row: '#F3F5F2',
    green: '#10B981',
    orange: '#D97706',
    red: '#EF4444',
    purple: '#8B5CF6'
};

function hexToRgb(hex = '#000000') {
    const clean = String(hex).replace('#', '');
    const value = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean;
    return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}

function setPdfFill(pdf, hex) {
    pdf.setFillColor(...hexToRgb(hex));
}

function setPdfDraw(pdf, hex) {
    pdf.setDrawColor(...hexToRgb(hex));
}

function setPdfText(pdf, hex) {
    pdf.setTextColor(...hexToRgb(hex));
}

function pdfText(pdf, text, x, y, options = {}) {
    const { size = 9, color = PDF_THEME.text, style = 'normal', maxWidth, lineHeight = 4.2, align } = options;
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    setPdfText(pdf, color);
    const value = String(text ?? '');
    if (maxWidth) {
        const lines = pdf.splitTextToSize(value, maxWidth);
        if (align) pdf.text(lines, x, y, { align });
        else pdf.text(lines, x, y);
        return y + (lines.length * lineHeight);
    }
    if (align) pdf.text(value, x, y, { align });
    else pdf.text(value, x, y);
    return y + lineHeight;
}

function pdfRoundedCard(pdf, x, y, w, h, fill = '#FFFFFF', stroke = PDF_THEME.border) {
    setPdfFill(pdf, fill);
    setPdfDraw(pdf, stroke);
    pdf.roundedRect(x, y, w, h, 2.2, 2.2, 'FD');
}

function addNativePdfHeader(pdf, data, sectionTitle = 'Resumen Ejecutivo Mensual') {
    setPdfFill(pdf, PDF_THEME.dark);
    pdf.roundedRect(12, 10, 17, 17, 2, 2, 'F');
    pdfText(pdf, 'UV', 15.3, 18, { size: 10, color: '#FFFFFF', style: 'bold' });
    pdfText(pdf, 'SERVICIOS', 14.1, 23, { size: 4.5, color: '#FFFFFF', style: 'bold' });

    pdfText(pdf, sectionTitle.toUpperCase(), 34, 15, { size: 7.5, color: PDF_THEME.blue, style: 'bold' });
    pdfText(pdf, 'Gestion Operativa de Monitoreo', 34, 23, { size: 15, color: PDF_THEME.dark, style: 'bold' });
    pdfText(pdf, `${data.contractName} · ${data.monthLabel}`, 34, 29, { size: 8.5, color: PDF_THEME.muted });

    setPdfDraw(pdf, '#E2E8F0');
    pdf.line(12, 36, 198, 36);
}

function addNativePdfFooter(pdf, pageNumber) {
    setPdfDraw(pdf, '#E2E8F0');
    pdf.line(12, 286, 198, 286);
    pdfText(pdf, 'UV Servicios · Reporte mensual ejecutivo', 12, 292, { size: 7, color: PDF_THEME.muted });
    pdfText(pdf, `Pagina ${pageNumber}`, 198, 292, { size: 7, color: PDF_THEME.muted, align: 'right' });
}

function drawNativeMetaGrid(pdf, data, y) {
    const items = [
        ['Campo(s)', state.field === 'TODOS' ? 'TODOS LOS CAMPOS' : state.field],
        ['Contrato', data.contractName],
        ['Periodo', data.monthLabel],
        ['Emision', data.generatedAt]
    ];
    const gap = 3;
    const cardW = (186 - (gap * 3)) / 4;
    items.forEach(([label, value], index) => {
        const x = 12 + index * (cardW + gap);
        pdfRoundedCard(pdf, x, y, cardW, 18, PDF_THEME.soft);
        pdfText(pdf, label.toUpperCase(), x + 3, y + 6, { size: 5.8, color: PDF_THEME.muted, style: 'bold' });
        pdfText(pdf, value, x + 3, y + 12.2, { size: 7.2, color: PDF_THEME.dark, style: 'bold', maxWidth: cardW - 6, lineHeight: 3.1 });
    });
    return y + 24;
}

function drawNativeKpis(pdf, data, y) {
    const items = [
        ['Total visitas', String(data.total), PDF_THEME.blue],
        ['Pozos sin falla', `${data.sinFallaPercent}%`, PDF_THEME.green],
        ['Pozos unicos', String(data.pozosUnicos.size), PDF_THEME.purple],
        ['Niveles ejecutados', String(data.nivelesEjecutados), PDF_THEME.orange]
    ];
    const gap = 4;
    const w = (186 - gap * 3) / 4;
    items.forEach(([label, value, color], index) => {
        const x = 12 + index * (w + gap);
        pdfRoundedCard(pdf, x, y, w, 24);
        setPdfFill(pdf, `${color}22`);
        pdf.roundedRect(x + 4, y + 5, 8, 8, 1.5, 1.5, 'F');
        pdfText(pdf, label.toUpperCase(), x + 15, y + 8, { size: 6.4, color: PDF_THEME.muted, style: 'bold', maxWidth: w - 18, lineHeight: 3 });
        pdfText(pdf, value, x + 15, y + 19, { size: 15, color: PDF_THEME.dark, style: 'bold' });
    });
    return y + 32;
}

function drawNativeSectionTitle(pdf, kicker, title, x, y) {
    pdfText(pdf, kicker.toUpperCase(), x, y, { size: 7, color: PDF_THEME.blue, style: 'bold' });
    pdfText(pdf, title, x, y + 7, { size: 13, color: PDF_THEME.dark, style: 'bold' });
    setPdfDraw(pdf, '#E2E8F0');
    pdf.line(x, y + 11, 198, y + 11);
    return y + 18;
}

function drawNativeInfoTable(pdf, rows, x, y, w) {
    rows.forEach(([label, value], index) => {
        const rowY = y + index * 8;
        if (index % 2 === 1) {
            setPdfFill(pdf, PDF_THEME.row);
            pdf.rect(x, rowY - 4.5, w, 7.2, 'F');
        }
        pdfText(pdf, label.toUpperCase(), x + 2, rowY, { size: 6.6, color: PDF_THEME.text, style: 'bold' });
        pdfText(pdf, value, x + w - 2, rowY, { size: 6.6, color: PDF_THEME.text, style: 'bold', maxWidth: w * 0.52, align: 'right', lineHeight: 3 });
    });
}

function formatNativePdfList(items, limit = 14) {
    const values = [...items].map(item => String(item || '').trim()).filter(Boolean).sort();
    if (!values.length) return 'Sin registros disponibles.';
    const visible = values.slice(0, limit);
    const remaining = values.length - visible.length;
    return `${visible.join(', ')}${remaining > 0 ? ` y ${remaining} mas` : ''}`;
}

function drawNativeSummaryCard(pdf, title, body, x, y, w, h) {
    pdfRoundedCard(pdf, x, y, w, h, PDF_THEME.soft);
    pdfText(pdf, title.toUpperCase(), x + 4, y + 7, { size: 6.8, color: PDF_THEME.blue, style: 'bold' });
    pdfText(pdf, body, x + 4, y + 14, { size: 7, color: PDF_THEME.text, style: 'bold', maxWidth: w - 8, lineHeight: 3.6 });
}

function drawNativeInterestPoints(pdf, points, x, y, w) {
    pdfText(pdf, 'PUNTOS DE INTERES', x, y, { size: 8, color: PDF_THEME.blue, style: 'bold' });
    let cursorY = y + 7;
    if (!points.length) {
        pdfRoundedCard(pdf, x, cursorY, w, 14, PDF_THEME.soft);
        pdfText(pdf, 'Sin eventos criticos registrados en el periodo seleccionado.', x + 3, cursorY + 8, { size: 7.5, color: PDF_THEME.muted });
        return cursorY + 18;
    }
    points.slice(0, 4).forEach(point => {
        const pozos = formatNativePdfList(point.pozos || [], 10);
        pdfRoundedCard(pdf, x, cursorY, w, 18, PDF_THEME.soft);
        pdfText(pdf, `${point.diagnostic} · ${point.records?.length || 0} evento(s)`, x + 3, cursorY + 6, { size: 7.3, color: PDF_THEME.dark, style: 'bold', maxWidth: w - 6, lineHeight: 3 });
        pdfText(pdf, `Pozos: ${pozos}`, x + 3, cursorY + 12, { size: 6.8, color: PDF_THEME.muted, maxWidth: w - 6, lineHeight: 3 });
        cursorY += 21;
    });
    return cursorY;
}

function drawNativeBarChart(pdf, title, entries, x, y, w, h, color = PDF_THEME.blue) {
    pdfRoundedCard(pdf, x, y, w, h);
    pdfText(pdf, title, x + 4, y + 8, { size: 8.2, color: PDF_THEME.dark, style: 'bold', maxWidth: w - 8, lineHeight: 3.4 });
    const chartY = y + 18;
    const maxValue = Math.max(...entries.map(([, value]) => value), 1);
    const barAreaW = w - 43;
    const rowH = Math.min(9, (h - 24) / Math.max(entries.length, 1));
    entries.slice(0, 8).forEach(([label, value], index) => {
        const rowY = chartY + index * rowH;
        pdfText(pdf, label, x + 4, rowY + 3.8, { size: 6.4, color: PDF_THEME.muted, style: 'bold', maxWidth: 28, lineHeight: 2.8 });
        setPdfFill(pdf, '#EEF2F7');
        pdf.roundedRect(x + 34, rowY, barAreaW, 4.8, 1.6, 1.6, 'F');
        setPdfFill(pdf, color);
        pdf.roundedRect(x + 34, rowY, Math.max(2, (value / maxValue) * barAreaW), 4.8, 1.6, 1.6, 'F');
        pdfText(pdf, String(value), x + w - 4, rowY + 3.8, { size: 6.4, color: PDF_THEME.dark, style: 'bold', align: 'right' });
    });
}

function drawNativeDiagnosticChart(pdf, title, entries, x, y, w, h) {
    pdfRoundedCard(pdf, x, y, w, h);
    pdfText(pdf, title, x + 4, y + 8, { size: 8.2, color: PDF_THEME.dark, style: 'bold', maxWidth: w - 8, lineHeight: 3.4 });
    const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
    let cursorY = y + 18;
    const colors = [PDF_THEME.green, PDF_THEME.red, PDF_THEME.orange, PDF_THEME.blue, PDF_THEME.purple, '#06B6D4'];
    entries.slice(0, 6).forEach(([label, value], index) => {
        const percent = Math.round((value / total) * 100);
        setPdfFill(pdf, colors[index % colors.length]);
        pdf.circle(x + 6, cursorY - 1.5, 1.6, 'F');
        pdfText(pdf, label, x + 10, cursorY, { size: 6.8, color: PDF_THEME.text, style: 'bold', maxWidth: w - 28, lineHeight: 3 });
        pdfText(pdf, `${value} · ${percent}%`, x + w - 4, cursorY, { size: 6.8, color: PDF_THEME.dark, style: 'bold', align: 'right' });
        setPdfFill(pdf, '#EEF2F7');
        pdf.roundedRect(x + 10, cursorY + 2.3, w - 18, 3, 1.2, 1.2, 'F');
        setPdfFill(pdf, colors[index % colors.length]);
        pdf.roundedRect(x + 10, cursorY + 2.3, Math.max(2, ((w - 18) * percent) / 100), 3, 1.2, 1.2, 'F');
        cursorY += 12;
    });
}

function drawNativeFieldCards(pdf, rows, x, y, w) {
    const maxTotal = Math.max(...rows.map(row => row.total), 1);
    let cursorY = y;
    rows.slice(0, 6).forEach(row => {
        pdfRoundedCard(pdf, x, cursorY, w, 26, PDF_THEME.soft);
        pdfText(pdf, row.field, x + 4, cursorY + 7, { size: 8.2, color: PDF_THEME.dark, style: 'bold' });
        pdfText(pdf, `${row.total} visitas`, x + w - 4, cursorY + 7, { size: 7, color: PDF_THEME.blue, style: 'bold', align: 'right' });
        const barW = w - 42;
        setPdfFill(pdf, '#E2E8F0');
        pdf.roundedRect(x + 4, cursorY + 12, barW, 4, 1.5, 1.5, 'F');
        setPdfFill(pdf, PDF_THEME.blue);
        pdf.roundedRect(x + 4, cursorY + 12, Math.max(2, (row.total / maxTotal) * barW), 4, 1.5, 1.5, 'F');
        pdfText(pdf, `RUN ${row.runCount} · OFF ${row.offCount} · Niveles ${row.levelCount}`, x + 4, cursorY + 22, { size: 6.5, color: PDF_THEME.text, style: 'bold' });
        pdfText(pdf, row.mainDiagnostic, x + w - 4, cursorY + 22, { size: 6.3, color: PDF_THEME.muted, maxWidth: w * 0.45, align: 'right', lineHeight: 2.6 });
        cursorY += 30;
    });
}

function exportNativeMonthlyPdf(filename) {
    const JsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPdfCtor) throw new Error('jsPDF no esta disponible.');
    const data = getMonthlyPdfData();
    const pdf = new JsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    addNativePdfHeader(pdf, data, 'Resumen Ejecutivo Mensual');
    let y = drawNativeMetaGrid(pdf, data, 42);
    y = drawNativeKpis(pdf, data, y);
    y = drawNativeSectionTitle(pdf, 'Resumen de actividades', data.monthLabel, 12, y);
    drawNativeInfoTable(pdf, [
        ['Empresa', 'UV SERVICIOS'],
        ['Campo', data.fieldLabel],
        ['Estado del pozo', data.offCount > 0 ? 'OPERANDO / PARADO' : 'OPERANDO'],
        ['Tipo de sistema', 'BES'],
        ['Servicio', 'MONITOREO']
    ], 12, y, 88);
    drawNativeInfoTable(pdf, [
        ['Recorrido total', data.journeyCounts.totalJourneys],
        ['Diurno', data.journeyCounts.diurnoCount],
        ['Nocturno', data.journeyCounts.nocturnoCount],
        ['Pozos monitoreados', data.pozosUnicos.size],
        ['Niveles ejecutados', data.nivelesEjecutados]
    ], 108, y, 90);
    drawNativeSummaryCard(pdf, 'Actividad principal', 'Toma de parametros operativos, verificacion BES y seguimiento de condiciones por pozo.', 12, y + 44, 88, 24);
    drawNativeSummaryCard(pdf, 'Pozos monitoreados', formatNativePdfList(data.pozosUnicos), 108, y + 44, 90, 24);
    drawNativeInterestPoints(pdf, data.interestPoints, 12, y + 78, 186);
    addNativePdfFooter(pdf, 1);

    pdf.addPage();
    addNativePdfHeader(pdf, data, 'Analitica Operativa');
    const campoEntries = mapToSortedEntries(state.records.reduce((map, record) => {
        incrementMap(map, normalizeCampo(record.campo));
        return map;
    }, new Map()));
    const modeEntries = mapToSortedEntries(state.records.reduce((map, record) => {
        incrementMap(map, classifyModeForChart(record));
        return map;
    }, new Map()));
    const nivelesEntries = mapToSortedEntries(getExecutedLevelCountsByPozo());
    const diagnosticEntries = buildDiagnosticEntries();
    drawNativeBarChart(pdf, 'Visitas por Campo', campoEntries, 12, 45, 88, 70, PDF_THEME.blue);
    drawNativeBarChart(pdf, 'Modo de Operacion', modeEntries, 110, 45, 88, 70, PDF_THEME.green);
    drawNativeBarChart(pdf, 'Niveles por Pozo', nivelesEntries, 12, 125, 88, 92, PDF_THEME.orange);
    drawNativeDiagnosticChart(pdf, 'Diagnostico Operativo', diagnosticEntries, 110, 125, 88, 92);
    addNativePdfFooter(pdf, 2);

    pdf.addPage();
    addNativePdfHeader(pdf, data, 'Detalle Ejecutivo por Campo');
    drawNativeFieldCards(pdf, data.fieldRows, 12, 48, 186);
    drawNativeDiagnosticChart(pdf, 'Resumen de Diagnosticos del Periodo', diagnosticEntries, 12, 190, 88, 62);
    drawNativeBarChart(pdf, 'Ranking de Visitas por Campo', campoEntries, 110, 190, 88, 62, PDF_THEME.blue);
    addNativePdfFooter(pdf, 3);

    pdf.save(filename);
}

// Exportación a PDF usando html2pdf.js
async function exportarPDF() {
    const hasNativePdfExport = Boolean(window.jspdf?.jsPDF || window.jsPDF);
    const hasCapturePdfExport = Boolean(window.html2canvas && typeof window.html2pdf !== 'undefined');
    if (!hasNativePdfExport && !hasCapturePdfExport) {
        showPdfGenerationResult('error', 'No se pudo preparar el PDF', 'La librería para generar PDF no se ha cargado correctamente. Recarga la página e intenta de nuevo.');
        return;
    }

    showPdfGenerationModal();

    let pdfDocument = null;
    const filename = `Resumen_Actividades_UV_SERVICIOS_${state.field}_${state.month}.pdf`;

    // Configuración de html2pdf.js
    const options = {
        margin: [0, 0, 0, 0],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
            scale: 1.35, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            backgroundColor: '#ffffff'
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait' 
        },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    try {
        resizeReportCharts();
        // Esperar brevemente a que los gráficos se redibujen con el ancho correcto
        await new Promise(resolve => setTimeout(resolve, 350));

        await waitForPdfLayout();
        pdfDocument = buildMonthlyPdfDocument();
        pdfDocument.style.position = 'relative';
        pdfDocument.style.left = '0';
        pdfDocument.style.top = '0';
        pdfDocument.style.margin = '0';
        pdfDocument.style.zIndex = '1';
        document.body.appendChild(pdfDocument);

        const exportedByPages = await exportMonthlyPdfPages(pdfDocument, filename);
        if (!exportedByPages) {
            await window.html2pdf()
                .set(options)
                .from(pdfDocument)
                .save();
        }

        closePdfGenerationModal();
        showPdfGenerationResult('success', 'Reporte generado', 'El PDF mensual fue preparado y descargado correctamente.');
    } catch (err) {
        console.error('Error al generar PDF:', err);
        closePdfGenerationModal();
        showPdfGenerationResult('error', 'No se pudo generar el PDF', err.message || 'Ocurrió un error inesperado al preparar el reporte.');
    } finally {
        pdfDocument?.remove();
    }
}

// Destrucción del Módulo y limpieza de recursos
export function destroyEstadisticas() {
    console.log('[Stats] Limpiando gráficos y recursos...');
    Object.values(state.charts || {}).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    state.charts = {};
}
