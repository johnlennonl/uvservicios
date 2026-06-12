import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { getAdminFieldJourneys, getAdminFieldJourneyDetail, deleteAdminFieldJourney, getFieldWorkflowDiagnostics, updateAdminFieldJourneyRecord, previewAdminFieldJourneyPublication, publishAdminFieldJourneyToDashboard, getFieldTicketsByJourney, getHistoricalFieldReports } from './services/field-journey-service.js';
import { exportFieldJourneyToExcel, openFieldJourneyPdf, exportHistoricalFieldReportsToExcel } from './services/field-journey-export.js';
import { validateFieldReport } from './modules/field/field-validation.js';

const STATUS_FILTERS = {
    pending: ['submitted', 'under_review'],
    submitted: ['submitted'],
    under_review: ['under_review'],
    approved: ['approved', 'published'],
    all: ['submitted', 'under_review', 'approved', 'published', 'rejected', 'archived']
};

const STATUS_LABELS = {
    submitted: 'Pendiente',
    under_review: 'En revisión',
    approved: 'Aprobada',
    published: 'Publicada',
    rejected: 'Rechazada',
    archived: 'Archivada'
};

const FILTER_EMPTY_COPY = {
    pending: {
        title: 'Sin pendientes',
        detail: 'No hay jornadas pendientes o en revisión en este momento.'
    },
    submitted: {
        title: 'Sin jornadas pendientes',
        detail: 'No hay jornadas recién recibidas en la bandeja.'
    },
    under_review: {
        title: 'Sin jornadas en revisión',
        detail: 'No hay jornadas marcadas como en revisión en este momento.'
    },
    approved: {
        title: 'Sin jornadas aprobadas',
        detail: 'No hay jornadas aprobadas o publicadas en la bandeja actual.'
    },
    all: {
        title: 'Sin jornadas visibles',
        detail: 'No hay jornadas disponibles para mostrar en este momento.'
    }
};

const REVIEW_ACTION_LABELS = {
    submitted: 'Jornada recibida',
    under_review: 'Parámetros actualizados',
    approved: 'Jornada aprobada',
    published: 'Jornada publicada',
    rejected: 'Jornada rechazada',
    reopened: 'Jornada reabierta',
    commented: 'Comentario de revisión'
};

const PUBLICATION_FIELD_LABELS = {
    campo: 'Campo',
    fecha: 'Fecha',
    hora: 'Hora',
    frecuencia: 'Frecuencia',
    corriente_motor: 'Corriente motor',
    presion_thp: 'THP',
    presion_chp: 'CHP',
    presion_lf: 'LF',
    pip: 'PIP',
    tm: 'TM',
    vsd_a: 'VSD A',
    vsd_b: 'VSD B',
    vsd_c: 'VSD C',
    sentido_giro: 'Sentido de giro',
    estatus: 'Estatus',
    observaciones: 'Observaciones'
};

const PUBLICATION_FIELD_SUFFIXES = {
    frecuencia: ' Hz',
    corriente_motor: ' A',
    presion_thp: ' psi',
    presion_chp: ' psi',
    presion_lf: ' psi',
    pip: ' psi',
    tm: ' F',
    vsd_a: ' A',
    vsd_b: ' A',
    vsd_c: ' A'
};

const PUBLICATION_DETAIL_FIELDS = [
    'frecuencia',
    'corriente_motor',
    'presion_thp',
    'presion_chp',
    'presion_lf',
    'pip',
    'tm',
    'vsd_a',
    'vsd_b',
    'vsd_c',
    'sentido_giro',
    'estatus',
    'observaciones'
];

const RECORD_EDITOR_SECTIONS = [
    {
        title: 'Jornada',
        fields: [
            ['Equipo de guardia', 'equipo_guardia'],
            ['Locacion de la jornada', 'locacion_jornada'],
            ['Jornada', 'jornada'],
            ['Pozo', 'pozo'],
            ['Campo', 'campo'],
            ['Fecha', 'fecha'],
            ['Hora', 'hora']
        ]
    },
    {
        title: 'Informacion general',
        fields: [
            ['EF', 'ef'],
            ['Estado', 'estado'],
            ['Categoria', 'categoria'],
            ['Potencial', 'potencial'],
            ['Bruta', 'bruta'],
            ['Neta', 'neta'],
            ['% AyS', 'ays_percentage'],
            ['Actividad', 'actividad'],
            ['Estatus', 'estatus']
        ]
    },
    {
        title: 'Parametros operacionales',
        fields: [
            ['Frecuencia', 'frecuencia'],
            ['Modo de operacion', 'modo_operacion'],
            ['Sentido de giro', 'sentido_giro'],
            ['I Motor [A]', 'i_motor'],
            ['V Motor [V]', 'v_motor'],
            ['Out VSD [V]', 'out_vsd'],
            ['I VSD A [A]', 'i_vsd_a'],
            ['I VSD B [A]', 'i_vsd_b'],
            ['I VSD C [A]', 'i_vsd_c'],
            ['Prom I VSD [A]', 'prom_i_vsd'],
            ['Desv. Fase A', 'desv_fase_a'],
            ['Desv. Fase B', 'desv_fase_b'],
            ['Desv. Fase C', 'desv_fase_c'],
            ['Max. Desviacion', 'max_desviacion_vsd'],
            ['% Desbalance Corriente VSD', 'desbalance_corriente_vsd'],
            ['PIP [psi]', 'pip_psi'],
            ['PD [psi]', 'pd_psi'],
            ['Ti [F]', 'ti_f'],
            ['Tm [F]', 'tm_f'],
            ['Vx [G]', 'vx_g'],
            ['Vy [G]', 'vy_g'],
            ['Vz [G]', 'vz_g']
        ]
    },
    {
        title: 'Sistema BES',
        fields: [
            ['Amp nominal motor [A]', 'amp_nominal_motor'],
            ['Volt nominal motor [V]', 'volt_nominal_motor'],
            ['Frec max [Hz]', 'frec_max_hz'],
            ['Low speed [Hz]', 'low_speed_hz'],
            ['UL [A]', 'ul_a'],
            ['OL [A]', 'ol_a'],
            ['I-Limit [A]', 'i_limit_a'],
            ['Tiempo de desaceleracion [seg]', 'tiempo_desaceleracion_seg'],
            ['Low PIP shut down [psi]', 'low_pip_shutdown_psi'],
            ['Max high temp. shut down [F]', 'max_high_temp_shutdown_f']
        ]
    },
    {
        title: 'Superficie',
        fields: [
            ['Baja datos', 'baja_datos'],
            ['VSD [KVA]', 'vsd_kva'],
            ['Marca VSD', 'marca_vsd'],
            ['Modelo VSD', 'modelo_vsd'],
            ['Tx [KVA]', 'tx_kva'],
            ['Tap [V]', 'tap_v'],
            ['R.T', 'rt'],
            ['Estado del Tx', 'estado_tx'],
            ['Estado del VSD', 'estado_vsd'],
            ['Estado panel sensor / choques', 'estado_panel_sensor_choques'],
            ['Estado del aterramiento', 'estado_aterramiento'],
            ['Condicion del cableado', 'condicion_cableado'],
            ['Condicion de la caseta', 'condicion_caseta'],
            ['Temperatura de la caseta', 'temperatura_caseta'],
            ['Estado de fosa [%]', 'estado_fosa_porcentaje'],
            ['Estado del BIW/conector', 'estado_biw_conector'],
            ['Estado de manometros', 'estado_manometros'],
            ['Estado del cabezal', 'estado_cabezal'],
            ['Estado de tomamuestras', 'estado_tomamuestras'],
            ['Estado caja de venteo', 'estado_caja_venteo']
        ]
    },
    {
        title: 'Sensor y presiones',
        fields: [
            ['Posee sensor de fondo', 'posee_sensor_fondo'],
            ['Descarga datas del sensor', 'descarga_datas_sensor'],
            ['Echometer', 'echometer'],
            ['THP [psi]', 'thp_psi'],
            ['CHP [psi]', 'chp_psi'],
            ['LF [psi]', 'lf_psi'],
            ['Cond. CHP', 'cond_chp'],
            ['Nivel de fluido [ft]', 'nivel_fluido_ft'],
            ['Sumergencia [ft]', 'sumergencia_ft'],
            ['PIP Echometer [psi]', 'pip_echometer_psi'],
            ['Diagnostico', 'diagnostico']
        ]
    },
    {
        title: 'Prueba electrica',
        fields: [
            ['Resistencia A-B [Ohm]', 'resistencia_ab_ohm'],
            ['Resistencia B-C [Ohm]', 'resistencia_bc_ohm'],
            ['Resistencia C-A [Ohm]', 'resistencia_ca_ohm'],
            ['Aislamiento fase-tierra [MOhm]', 'aislamiento_fase_tierra_mohm']
        ]
    },
    {
        title: 'Tx bobina primaria',
        fields: [
            ['Fase-Fase X1-X2 [Volt]', 'ff_x1_x2_v'],
            ['Fase-Fase X2-X3 [Volt]', 'ff_x2_x3_v'],
            ['Fase-Fase X3-X1 [Volt]', 'ff_x3_x1_v'],
            ['Promedio Fase-Fase', 'promedio_fase_fase'],
            ['Desv. X1-X2', 'desv_ff_x1_x2'],
            ['Desv. X2-X3', 'desv_ff_x2_x3'],
            ['Desv. X3-X1', 'desv_ff_x3_x1'],
            ['Max. Desviacion Fase-Fase', 'max_desviacion_ff'],
            ['% Desbalance Fase-Fase', 'desbalance_fase_fase'],
            ['Fase-Tierra X1-Tierra [Volt]', 'ft_x1_tierra_v'],
            ['Fase-Tierra X2-Tierra [Volt]', 'ft_x2_tierra_v'],
            ['Fase-Tierra X3-Tierra [Volt]', 'ft_x3_tierra_v'],
            ['Promedio Fase-Tierra', 'promedio_fase_tierra'],
            ['Desv. X1-Tierra', 'desv_ft_x1_tierra'],
            ['Desv. X2-Tierra', 'desv_ft_x2_tierra'],
            ['Desv. X3-Tierra', 'desv_ft_x3_tierra'],
            ['Max. Desviacion Fase-Tierra', 'max_desviacion_ft'],
            ['% Desbalance Fase-Tierra', 'desbalance_fase_tierra']
        ]
    },
    {
        title: 'Tx bobina secundaria',
        fields: [
            ['Fase-Fase H1-H2 [Volt]', 'sec_ff_h1_h2_v'],
            ['Fase-Fase H2-H3 [Volt]', 'sec_ff_h2_h3_v'],
            ['Fase-Fase H3-H1 [Volt]', 'sec_ff_h3_h1_v'],
            ['% Desbalance Fase/Fase Secundaria', 'sec_desbalance_fase_fase'],
            ['Fase-Tierra H1-Tierra [Volt]', 'sec_ft_h1_tierra_v'],
            ['Fase-Tierra H2-Tierra [Volt]', 'sec_ft_h2_tierra_v'],
            ['Fase-Tierra H3-Tierra [Volt]', 'sec_ft_h3_tierra_v'],
            ['% Desbalance Fase/Tierra Secundaria', 'sec_desbalance_fase_tierra']
        ]
    },
    {
        title: 'Corrientes e indicadores',
        fields: [
            ['Corriente X1-X2 [Amp]', 'corriente_x1_x2_amp'],
            ['Corriente H1-H2 [Amp]', 'corriente_h1_h2_amp'],
            ['Corriente H2-H3 [Amp]', 'corriente_h2_h3_amp'],
            ['Corriente H3-H1 [Amp]', 'corriente_h3_h1_amp'],
            ['% Desbalance Corriente', 'desbalance_corriente_secundaria'],
            ['Relacion A. Con. / A. Nom', 'relacion_a_con_a_nom'],
            ['% Amp', 'porcentaje_amp'],
            ['Relacion V. Mot / V. Nom', 'relacion_v_mot_v_nom'],
            ['% Volt', 'porcentaje_volt'],
            ['PD Max [psi]', 'pd_max_psi'],
            ['Delta Presion [psi]', 'delta_presion_psi'],
            ['% Delta Presion', 'porcentaje_delta_presion'],
            ['Tm / T Max Permisible', 'relacion_tm_t_max'],
            ['% Temp', 'porcentaje_temp'],
            ['PIP Min / PIP', 'relacion_pip_min_pip'],
            ['% PIP', 'porcentaje_pip']
        ]
    },
    {
        title: 'Observaciones',
        fields: [
            ['Observaciones del pozo', 'observaciones_pozo']
        ]
    }
];

const NUMERIC_FIELD_NAMES = new Set([
    'potencial',
    'bruta',
    'neta',
    'ays_percentage',
    'frecuencia',
    'i_motor',
    'v_motor',
    'out_vsd',
    'i_vsd_a',
    'i_vsd_b',
    'i_vsd_c',
    'prom_i_vsd',
    'desv_fase_a',
    'desv_fase_b',
    'desv_fase_c',
    'max_desviacion_vsd',
    'desbalance_corriente_vsd',
    'pip_psi',
    'pd_psi',
    'ti_f',
    'tm_f',
    'vx_g',
    'vy_g',
    'vz_g',
    'amp_nominal_motor',
    'volt_nominal_motor',
    'frec_max_hz',
    'low_speed_hz',
    'ul_a',
    'ol_a',
    'i_limit_a',
    'tiempo_desaceleracion_seg',
    'low_pip_shutdown_psi',
    'max_high_temp_shutdown_f',
    'vsd_kva',
    'tx_kva',
    'tap_v',
    'temperatura_caseta',
    'estado_fosa_porcentaje',
    'thp_psi',
    'chp_psi',
    'lf_psi',
    'nivel_fluido_ft',
    'sumergencia_ft',
    'pip_echometer_psi',
    'resistencia_ab_ohm',
    'resistencia_bc_ohm',
    'resistencia_ca_ohm',
    'aislamiento_fase_tierra_mohm',
    'ff_x1_x2_v',
    'ff_x2_x3_v',
    'ff_x3_x1_v',
    'promedio_fase_fase',
    'desv_ff_x1_x2',
    'desv_ff_x2_x3',
    'desv_ff_x3_x1',
    'max_desviacion_ff',
    'desbalance_fase_fase',
    'ft_x1_tierra_v',
    'ft_x2_tierra_v',
    'ft_x3_tierra_v',
    'promedio_fase_tierra',
    'desv_ft_x1_tierra',
    'desv_ft_x2_tierra',
    'desv_ft_x3_tierra',
    'max_desviacion_ft',
    'desbalance_fase_tierra',
    'sec_ff_h1_h2_v',
    'sec_ff_h2_h3_v',
    'sec_ff_h3_h1_v',
    'sec_desbalance_fase_fase',
    'sec_ft_h1_tierra_v',
    'sec_ft_h2_tierra_v',
    'sec_ft_h3_tierra_v',
    'sec_desbalance_fase_tierra',
    'corriente_x1_x2_amp',
    'corriente_h1_h2_amp',
    'corriente_h2_h3_amp',
    'corriente_h3_h1_amp',
    'desbalance_corriente_secundaria',
    'relacion_a_con_a_nom',
    'porcentaje_amp',
    'relacion_v_mot_v_nom',
    'porcentaje_volt',
    'pd_max_psi',
    'delta_presion_psi',
    'porcentaje_delta_presion',
    'relacion_tm_t_max',
    'porcentaje_temp',
    'relacion_pip_min_pip',
    'porcentaje_pip'
]);

const LONG_TEXT_FIELDS = new Set(['diagnostico', 'observaciones_pozo']);
const EDITOR_FIELD_NAMES = RECORD_EDITOR_SECTIONS.flatMap(section => section.fields.map(([, fieldName]) => fieldName));

const state = {
    journeys: [],
    selectedJourneyId: '',
    filterKey: 'pending',
    searchTerm: '',
    loading: false,
    searchTimer: null,
    currentDetail: null,
    actionInFlight: false,
    diagnostics: null,
    selectedRecordId: '',
    recordPanelMode: 'view',
    recordSaving: false,
    selectedIncidentIndex: -1,
    historicalExporting: false
};

const elements = {
    refreshButton: document.getElementById('campo-admin-refresh-btn'),
    searchInput: document.getElementById('campo-admin-search'),
    historicalExportButton: document.getElementById('campo-admin-historical-export-btn'),
    filterGroup: document.getElementById('campo-admin-filter-group'),
    toolbarStatus: document.getElementById('campo-admin-toolbar-status'),
    sideCopy: document.getElementById('campo-admin-side-copy'),
    visibleCount: document.getElementById('campo-admin-visible-count'),
    reviewCount: document.getElementById('campo-admin-review-count'),
    reportCount: document.getElementById('campo-admin-report-count'),
    listCount: document.getElementById('campo-admin-list-count'),
    list: document.getElementById('campo-admin-list'),
    detailShell: document.getElementById('campo-admin-detail-shell'),
    recordModal: document.getElementById('campo-admin-record-modal'),
    recordModalBody: document.getElementById('campo-admin-record-modal-body'),
    incidentModal: document.getElementById('campo-admin-incident-modal'),
    incidentModalBody: document.getElementById('campo-admin-incident-modal-body'),
    historicalModal: document.getElementById('campo-admin-historical-modal'),
    historicalModalBody: document.getElementById('campo-admin-historical-modal-body'),
    logoutButton: document.getElementById('logout-btn'),
    mobileLogoutButton: document.getElementById('mobile-logout-btn')
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getLocalFieldTicketsByJourney(journeyId) {
    try {
        const raw = localStorage.getItem('uv-field-tickets');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item => String(item?.journey_key) === String(journeyId));
    } catch (error) {
        console.warn('No se pudieron leer tickets locales de Campo Admin', error);
        return [];
    }
}

function buildAdminTicketMarkup(ticket, index) {
    const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
    const attachmentsMarkup = attachments.length > 0
        ? `
            <div class="campo-admin-incident-attachments">
                ${attachments.map(file => {
                    const src = file?.url || file?.dataUrl || file?.publicUrl || '';
                    const label = escapeHtml(file?.name || 'Adjunto');
                    if (!src) {
                        return `<span class="campo-admin-incident-attachment-fallback">${label}</span>`;
                    }
                    return `
                        <button type="button" class="campo-admin-incident-thumb" data-ticket-src="${escapeHtml(src)}" title="Abrir adjunto">
                            <img src="${escapeHtml(src)}" alt="${label}">
                        </button>
                    `;
                }).join('')}
            </div>
        `
        : '';

    return `
        <article class="campo-admin-incident-card" data-incident-open="${escapeHtml(String(index))}" tabindex="0" role="button" aria-label="Abrir incidencia ${escapeHtml(ticket.subject || 'sin asunto')}">
            <div class="campo-admin-incident-head">
                <div>
                    <strong>${escapeHtml(ticket.subject || 'Incidencia sin asunto')}</strong>
                    <p>${escapeHtml(ticket.message || 'Sin detalle adicional.')}</p>
                </div>
                <span class="campo-admin-tag campo-admin-tag-soft">${ticket._local ? 'Local' : 'Enviado'}</span>
            </div>
            <div class="campo-admin-detail-meta">
                <span class="campo-admin-tag">${escapeHtml(formatDateTime(ticket.submitted_at || ticket.created_at))}</span>
                <span class="campo-admin-tag">${escapeHtml(ticket.submitted_by_email || 'Sin correo')}</span>
            </div>
            ${attachmentsMarkup}
        </article>
    `;
}

function closeIncidentModal() {
    state.selectedIncidentIndex = -1;
    if (elements.incidentModal) elements.incidentModal.hidden = true;
    if (elements.incidentModalBody) elements.incidentModalBody.innerHTML = '';
}

function closeHistoricalModal() {
    if (elements.historicalModal) elements.historicalModal.hidden = true;
}

function resolveHistoricalPresetDates(preset) {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);

    if (preset === 'last7' || preset === 'last30') {
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() - (preset === 'last7' ? 6 : 29));
        return {
            startDate: nextDate.toISOString().slice(0, 10),
            endDate
        };
    }

    return {
        startDate: '',
        endDate: ''
    };
}

function normalizeHistoricalFilters(filters = {}) {
    const mode = String(filters.mode || 'filtered').trim().toLowerCase();
    const preset = String(filters.preset || 'custom').trim().toLowerCase();
    const pozo = String(filters.pozo || '').trim();
    let startDate = String(filters.startDate || '').trim();
    let endDate = String(filters.endDate || '').trim();
    const rawLimit = Number(filters.limit);

    if (mode === 'all') {
        return { mode, preset: 'all', pozo: '', startDate: '', endDate: '', limit: 10000 };
    }

    if (preset !== 'custom') {
        const resolvedDates = resolveHistoricalPresetDates(preset);
        startDate = resolvedDates.startDate;
        endDate = resolvedDates.endDate;
    }

    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.max(Math.trunc(rawLimit), 100), 25000) : 10000;
    return { mode, preset, pozo, startDate, endDate, limit };
}

function getHistoricalModeConfig(mode) {
    const normalizedMode = String(mode || 'filtered').trim().toLowerCase();

    if (normalizedMode === 'all') {
        return {
            submitLabel: state.historicalExporting ? 'Exportando histórico completo...' : 'Generar histórico completo',
            helpText: 'Se exportará todo el histórico disponible. Los filtros se desactivan porque este modo no necesita pozo ni fechas.'
        };
    }

    if (normalizedMode === 'recent') {
        return {
            submitLabel: state.historicalExporting ? 'Exportando corte reciente...' : 'Generar corte reciente',
            helpText: 'Este modo prepara un corte reciente. Usa la ventana rápida para decidir si quieres los últimos 7 o 30 días.'
        };
    }

    return {
        submitLabel: state.historicalExporting ? 'Exportando Excel filtrado...' : 'Generar Excel filtrado',
        helpText: 'Este modo utiliza los criterios que completes abajo. Puedes exportar por pozo, por fechas o combinando ambos.'
    };
}

function applyHistoricalModeState(form) {
    if (!form) return;

    const mode = String(form.querySelector('input[name="mode"]:checked')?.value || 'filtered').trim().toLowerCase();
    const pozoInput = form.querySelector('input[name="pozo"]');
    const presetSelect = form.querySelector('select[name="preset"]');
    const startDateInput = form.querySelector('input[name="startDate"]');
    const endDateInput = form.querySelector('input[name="endDate"]');
    const submitButton = form.querySelector('[data-historical-submit]');
    const modeHelp = form.querySelector('[data-historical-mode-help]');

    const isAllMode = mode === 'all';
    const isRecentMode = mode === 'recent';
    const isFilteredMode = mode === 'filtered';
    const modeConfig = getHistoricalModeConfig(mode);

    if (pozoInput) {
        pozoInput.disabled = isAllMode || isRecentMode;
        if (pozoInput.disabled) pozoInput.value = '';
    }

    if (presetSelect) {
        presetSelect.disabled = isAllMode;
        if (isRecentMode && (!presetSelect.value || presetSelect.value === 'custom')) {
            presetSelect.value = 'last7';
        }
        if (isAllMode) {
            presetSelect.value = 'custom';
        }
    }

    const manualDatesEnabled = isFilteredMode && String(presetSelect?.value || 'custom') === 'custom';
    if (startDateInput) {
        startDateInput.disabled = !manualDatesEnabled;
        if (startDateInput.disabled) startDateInput.value = '';
    }

    if (endDateInput) {
        endDateInput.disabled = !manualDatesEnabled;
        if (endDateInput.disabled) endDateInput.value = '';
    }

    if (submitButton) {
        submitButton.textContent = modeConfig.submitLabel;
    }

    if (modeHelp) {
        modeHelp.textContent = modeConfig.helpText;
    }
}

function collectHistoricalFormFilters(form, overrides = {}) {
    const formData = new FormData(form);
    const resolvedPozo = overrides.pozo ?? formData.get('pozo') ?? '';

    return {
        mode: String(overrides.mode || formData.get('mode') || 'filtered').trim(),
        preset: String(overrides.preset || formData.get('preset') || 'custom').trim(),
        pozo: String(resolvedPozo).trim(),
        startDate: String(overrides.startDate || formData.get('startDate') || '').trim(),
        endDate: String(overrides.endDate || formData.get('endDate') || '').trim(),
        limit: String(overrides.limit || formData.get('limit') || '').trim()
    };
}

function buildHistoricalModalMarkup() {
    const defaultLimit = 10000;
    return `
        <div class="campo-admin-historical-shell">
            <div class="campo-admin-modal-head">
                <div>
                    <span class="campo-admin-tag campo-admin-tag-soft">Exportacion historica</span>
                    <h3 id="campo-admin-historical-modal-title">Centro de exportación histórica Campo</h3>
                    <p>Configura cómo quieres sacar el consolidado. Puedes exportar todo el histórico, filtrar por un pozo puntual o acotar por ventanas de tiempo para análisis operativos.</p>
                </div>
                <button type="button" class="campo-admin-modal-close" data-historical-close aria-label="Cerrar exportacion historica">×</button>
            </div>
            <div class="campo-admin-historical-hero">
                <div class="campo-admin-historical-summary">
                    <article class="campo-admin-historical-summary-card">
                        <span>Modo rápido</span>
                        <strong>Todo el histórico</strong>
                    </article>
                    <article class="campo-admin-historical-summary-card">
                        <span>Filtro técnico</span>
                        <strong>Por pozo específico</strong>
                    </article>
                    <article class="campo-admin-historical-summary-card">
                        <span>Corte temporal</span>
                        <strong>Últimos 7, 30 días o rango manual</strong>
                    </article>
                </div>
                <p class="campo-admin-historical-note">Usa este exportador cuando necesites un archivo exclusivo para histórico. La bandeja principal seguirá sirviendo solo para revisión administrativa de jornadas.</p>
                <div class="campo-admin-historical-backup-note">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 17h.01"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
                    </svg>
                    <div>
                        <strong>Respaldo recomendado</strong>
                        <p>Antes de cerrar ciclo operativo, genera un respaldo del histórico operacional. Es la forma más simple de asegurar disponibilidad de datos críticos ante ajustes, reprocesos o incidentes.</p>
                    </div>
                </div>
            </div>
            <form id="campo-admin-historical-form" class="campo-admin-record-form">
                <section class="campo-admin-historical-panel">
                    <div class="campo-admin-historical-panel-head">
                        <div>
                            <h4>1. Elige el tipo de exportación</h4>
                            <p class="campo-admin-historical-help">Selecciona primero si quieres sacar todo, un corte reciente o un consolidado más preciso.</p>
                        </div>
                        <span class="campo-admin-count-badge">Paso 1</span>
                    </div>
                    <div class="campo-admin-historical-presets">
                        <label class="campo-admin-historical-option">
                            <input type="radio" name="mode" value="all">
                            <span class="campo-admin-historical-option-icon" aria-hidden="true">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 4h9l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M14 4v4h4" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8M8 16h8" />
                                </svg>
                            </span>
                            <strong>Todo el histórico</strong>
                            <span>Exporta todos los registros disponibles sin aplicar filtros de pozo ni de fecha.</span>
                        </label>
                        <label class="campo-admin-historical-option">
                            <input type="radio" name="mode" value="filtered" checked>
                            <span class="campo-admin-historical-option-icon" aria-hidden="true">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 12h10" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 18h4" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 6l2 3h10l2-3" opacity=".45" />
                                </svg>
                            </span>
                            <strong>Exportación filtrada</strong>
                            <span>Usa pozo, fechas o ambas condiciones para construir un consolidado específico.</span>
                        </label>
                        <label class="campo-admin-historical-option">
                            <input type="radio" name="mode" value="recent">
                            <span class="campo-admin-historical-option-icon" aria-hidden="true">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-3.2-6.9" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 4v5h-5" />
                                </svg>
                            </span>
                            <strong>Corte reciente</strong>
                            <span>Prepara un histórico corto para revisión operativa rápida de los últimos días.</span>
                        </label>
                    </div>
                </section>
                <section class="campo-admin-historical-panel">
                    <div class="campo-admin-historical-panel-head">
                        <div>
                            <h4>2. Define los filtros del archivo</h4>
                            <p class="campo-admin-historical-help">Completa solo lo que necesites. Si dejas un campo vacío, ese criterio no limitará el resultado.</p>
                        </div>
                        <span class="campo-admin-count-badge">Paso 2</span>
                    </div>
                    <div class="campo-admin-editor-grid campo-admin-historical-grid">
                        <label class="campo-admin-editor-field campo-admin-editor-field-long">
                            <span>Pozo objetivo</span>
                            <input type="text" name="pozo" placeholder="Ej: CEI0004, UV-12, ESP-001">
                            <small class="campo-admin-field-help">Escribe el nombre o parte del identificador del pozo si quieres un consolidado exclusivo de esa unidad.</small>
                        </label>
                        <label class="campo-admin-editor-field">
                            <span>Ventana rápida</span>
                            <select name="preset">
                                <option value="custom" selected>Rango manual</option>
                                <option value="last7">Últimos 7 días</option>
                                <option value="last30">Últimos 30 días</option>
                            </select>
                            <small class="campo-admin-field-help">Si eliges una ventana rápida, las fechas manuales se completarán automáticamente.</small>
                        </label>
                        <label class="campo-admin-editor-field">
                            <span>Límite máximo de registros</span>
                            <input type="number" name="limit" min="100" max="25000" step="100" value="${defaultLimit}">
                            <small class="campo-admin-field-help">Útil para evitar archivos demasiado pesados cuando el histórico es muy amplio.</small>
                        </label>
                        <label class="campo-admin-editor-field">
                            <span>Fecha inicial</span>
                            <input type="date" name="startDate">
                            <small class="campo-admin-field-help">Punto de inicio del corte histórico.</small>
                        </label>
                        <label class="campo-admin-editor-field">
                            <span>Fecha final</span>
                            <input type="date" name="endDate">
                            <small class="campo-admin-field-help">Punto de cierre del corte histórico.</small>
                        </label>
                    </div>
                </section>
                <div class="campo-admin-modal-actions campo-admin-historical-actions">
                    <p class="campo-admin-historical-help" data-historical-mode-help>Este modo utiliza los criterios que completes abajo. Puedes exportar por pozo, por fechas o combinando ambos.</p>
                    <div class="campo-admin-historical-action-slot">
                        <button type="submit" class="campo-admin-action-btn campo-admin-action-btn-secondary" data-historical-submit ${state.historicalExporting ? 'disabled' : ''}>${state.historicalExporting ? 'Exportando Excel filtrado...' : 'Generar Excel filtrado'}</button>
                    </div>
                </div>
            </form>
        </div>
    `;
}

function openHistoricalModal() {
    if (!elements.historicalModal || !elements.historicalModalBody) return;
    elements.historicalModal.hidden = false;
    elements.historicalModalBody.innerHTML = buildHistoricalModalMarkup();
    const form = elements.historicalModalBody.querySelector('#campo-admin-historical-form');

    elements.historicalModalBody.querySelectorAll('[data-historical-close]').forEach(button => {
        button.addEventListener('click', closeHistoricalModal);
    });

    form?.querySelectorAll('input[name="mode"]').forEach(input => {
        input.addEventListener('change', () => applyHistoricalModeState(form));
    });

    form?.querySelector('select[name="preset"]')?.addEventListener('change', () => applyHistoricalModeState(form));

    form?.addEventListener('submit', event => {
        event.preventDefault();
        handleHistoricalExport(collectHistoricalFormFilters(event.currentTarget));
    });

    applyHistoricalModeState(form);
}

async function handleHistoricalExport(filters = {}) {
    if (state.historicalExporting) return;
    if (!window.ExcelJS) {
        await notify('La libreria de Excel no esta disponible en esta vista.', 'error');
        return;
    }

    state.historicalExporting = true;
    try {
        const resolvedFilters = normalizeHistoricalFilters(filters);

        if (resolvedFilters.mode === 'filtered' && !resolvedFilters.pozo && !resolvedFilters.startDate && !resolvedFilters.endDate) {
            throw new Error('Para la exportación filtrada debes indicar al menos un pozo, una ventana rápida o un rango de fechas.');
        }

        if (resolvedFilters.mode === 'recent' && !['last7', 'last30'].includes(resolvedFilters.preset)) {
            throw new Error('Selecciona una ventana rápida válida para generar el corte reciente.');
        }

        if (resolvedFilters.startDate && resolvedFilters.endDate && resolvedFilters.startDate > resolvedFilters.endDate) {
            throw new Error('La fecha inicial no puede ser mayor que la fecha final en la exportación histórica.');
        }

        const records = await getHistoricalFieldReports(resolvedFilters);
        await exportHistoricalFieldReportsToExcel(records, resolvedFilters);
        await notify(`Se genero el Excel historico con ${records.length} registro(s).`, 'success');
        closeHistoricalModal();
    } catch (error) {
        console.error('Admin Campo historical export error:', error);
        await notify(error?.message || 'No se pudo exportar el historico de Campo.', 'error');
    } finally {
        state.historicalExporting = false;
    }
}

function downloadIncidentMessage(ticket) {
    const lines = [
        `Asunto: ${ticket.subject || 'Incidencia sin asunto'}`,
        `Fecha: ${formatDateTime(ticket.submitted_at || ticket.created_at)}`,
        `Correo: ${ticket.submitted_by_email || 'Sin correo'}`,
        `Origen: ${ticket._local ? 'Local' : 'Enviado'}`,
        '',
        String(ticket.message || 'Sin detalle adicional.')
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `incidencia-${String(ticket.subject || 'campo').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'campo'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function renderIncidentModal() {
    const ticket = state.currentDetail?.tickets?.[state.selectedIncidentIndex];
    if (!ticket || !elements.incidentModal || !elements.incidentModalBody) {
        closeIncidentModal();
        return;
    }

    const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
    const attachmentsMarkup = attachments.length > 0
        ? attachments.map(file => {
            const src = file?.url || file?.dataUrl || file?.publicUrl || '';
            const name = escapeHtml(file?.name || 'Adjunto');
            if (!src) return `<div class="campo-admin-incident-gallery-fallback">${name}</div>`;
            return `
                <button type="button" class="campo-admin-incident-gallery-item" data-ticket-src="${escapeHtml(src)}" title="Abrir ${name}">
                    <img src="${escapeHtml(src)}" alt="${name}">
                    <span>${name}</span>
                </button>
            `;
        }).join('')
        : '<div class="campo-admin-empty"><strong>Sin adjuntos</strong><p>Esta incidencia no incluye imágenes o archivos.</p></div>';

    elements.incidentModal.hidden = false;
    elements.incidentModalBody.innerHTML = `
        <div class="campo-admin-modal-head">
            <div>
                <span class="campo-admin-tag campo-admin-tag-soft">${ticket._local ? 'Ticket local' : 'Ticket enviado'}</span>
                <h3 id="campo-admin-incident-modal-title">${escapeHtml(ticket.subject || 'Incidencia sin asunto')}</h3>
                <p>${escapeHtml(formatDateTime(ticket.submitted_at || ticket.created_at))} · ${escapeHtml(ticket.submitted_by_email || 'Sin correo')}</p>
            </div>
            <button type="button" class="campo-admin-modal-close" data-incident-modal-close aria-label="Cerrar detalle de incidencia">×</button>
        </div>
        <div class="campo-admin-modal-review-strip">
            <span class="campo-admin-tag">${escapeHtml(state.currentDetail?.journey?.locacion_jornada || 'Sin locación')}</span>
            <span class="campo-admin-tag">${escapeHtml(state.currentDetail?.journey?.jornada || 'Sin jornada')}</span>
            <span class="campo-admin-tag">${escapeHtml(String(attachments.length))} adjunto(s)</span>
        </div>
        <section class="campo-admin-modal-section" open>
            <summary>Mensaje reportado</summary>
            <div class="campo-admin-incident-message">${escapeHtml(ticket.message || 'Sin detalle adicional.').replace(/\n/g, '<br>')}</div>
        </section>
        <section class="campo-admin-modal-section" open>
            <summary>Adjuntos</summary>
            <div class="campo-admin-incident-gallery">${attachmentsMarkup}</div>
        </section>
        <div class="campo-admin-modal-actions">
            <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-incident-export>Exportar mensaje</button>
            <button type="button" class="campo-admin-action-btn" data-incident-modal-close>Cerrar</button>
        </div>
    `;

    elements.incidentModalBody.querySelectorAll('[data-incident-modal-close]').forEach(button => {
        button.addEventListener('click', closeIncidentModal);
    });

    elements.incidentModalBody.querySelector('[data-incident-export]')?.addEventListener('click', () => {
        downloadIncidentMessage(ticket);
    });

    elements.incidentModalBody.querySelectorAll('[data-ticket-src]').forEach(button => {
        button.addEventListener('click', () => {
            const src = button.getAttribute('data-ticket-src');
            if (!src) return;
            window.open(src, '_blank', 'noopener,noreferrer');
        });
    });
}

function openIncidentModal(index) {
    state.selectedIncidentIndex = Number(index);
    renderIncidentModal();
}

function formatDate(value) {
    if (!value) return 'Sin fecha';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(date);
}

function formatDateTime(value) {
    if (!value) return 'Sin registro';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatTime(value) {
    if (!value) return 'Sin hora';
    return String(value).slice(0, 5);
}

function normalizeStatusLabel(status) {
    return STATUS_LABELS[String(status || '').toLowerCase()] || 'Pendiente';
}

function normalizeReviewActionLabel(action) {
    const normalized = String(action || '').trim().toLowerCase();
    return REVIEW_ACTION_LABELS[normalized] || 'Movimiento de revisión';
}

function buildStatusClass(status) {
    const normalized = String(status || 'submitted').toLowerCase();
    return `campo-admin-status-pill status-${normalized}`;
}

function summarizeJourneyWindow(journey) {
    const start = formatTime(journey.first_report_time);
    const end = formatTime(journey.last_report_time);

    if (start === 'Sin hora' && end === 'Sin hora') {
        return 'Sin ventana horaria';
    }

    return start === end ? start : `${start} - ${end}`;
}

function getRecordPayload(record) {
    return record?.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
}

function getRecordField(record, ...fieldNames) {
    const payload = getRecordPayload(record);

    for (const fieldName of fieldNames) {
        const payloadValue = payload[fieldName];
        if (payloadValue !== undefined && payloadValue !== null && payloadValue !== '') {
            return payloadValue;
        }

        const recordValue = record?.[fieldName];
        if (recordValue !== undefined && recordValue !== null && recordValue !== '') {
            return recordValue;
        }
    }

    return '';
}

function getRecordSummary(record) {
    return {
        pozo: String(getRecordField(record, 'pozo') || 'Pozo sin nombre').trim().toUpperCase(),
        campo: getRecordField(record, 'campo'),
        hora: formatTime(getRecordField(record, 'hora', 'report_time')),
        fecha: getRecordField(record, 'fecha', 'report_date'),
        estatus: getRecordField(record, 'estatus'),
        actividad: getRecordField(record, 'actividad'),
        observaciones: getRecordField(record, 'observaciones_pozo', 'comentario', 'message_text') || 'Sin observacion registrada.',
        diagnostico: getRecordField(record, 'diagnostico') || 'Sin diagnostico registrado.',
        frecuencia: getRecordField(record, 'frecuencia', 'hz'),
        thp: getRecordField(record, 'thp_psi', 'thp'),
        lf: getRecordField(record, 'lf_psi', 'lf'),
        pip: getRecordField(record, 'pip_psi'),
        pd: getRecordField(record, 'pd_psi')
    };
}

function getRecordEditorValue(record, fieldName) {
    if (fieldName === 'fecha') return getRecordField(record, 'fecha', 'report_date');
    if (fieldName === 'hora') return getRecordField(record, 'hora', 'report_time');
    return getRecordField(record, fieldName);
}

function getEditableRecord(record) {
    const payload = { ...getRecordPayload(record) };

    EDITOR_FIELD_NAMES.forEach(fieldName => {
        if (payload[fieldName] === undefined || payload[fieldName] === null || payload[fieldName] === '') {
            payload[fieldName] = getRecordEditorValue(record, fieldName);
        }
    });

    payload.id = record?.id || '';
    return payload;
}

function normalizeReviewKey(payload = {}) {
    const pozo = String(payload.pozo || '').trim().toUpperCase();
    const fecha = String(payload.fecha || '').trim();
    const hora = formatTime(payload.hora || '');
    return [pozo, fecha, hora].join('|');
}

function analyzeRecordForReview(recordPayload, records = [], journey = {}, currentRecordId = '') {
    const critical = [];
    const warnings = [];
    const validation = validateFieldReport(recordPayload);

    if (!validation.isValid) {
        critical.push(validation.message);
    }

    const currentKey = normalizeReviewKey(recordPayload);
    const duplicates = records.filter(record => {
        if (record?.id === currentRecordId) return false;
        return normalizeReviewKey(getEditableRecord(record)) === currentKey;
    });

    if (currentKey !== '||' && duplicates.length > 0) {
        critical.push('Existe otro pozo con la misma combinacion de pozo, fecha y hora dentro de esta jornada.');
    }

    NUMERIC_FIELD_NAMES.forEach(fieldName => {
        const rawValue = recordPayload[fieldName];
        if (rawValue === '' || rawValue === null || rawValue === undefined) return;
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue) && numericValue < 0) {
            critical.push(`${fieldName} no puede ser negativo.`);
        }
    });

    const hora = String(recordPayload.hora || '').trim();
    if (hora && !/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) {
        warnings.push('La hora no tiene el formato esperado HH:MM o HH:MM:SS.');
    }

    if (journey?.journey_date && recordPayload.fecha && String(recordPayload.fecha) !== String(journey.journey_date)) {
        warnings.push('La fecha del pozo no coincide con la fecha principal de la jornada.');
    }

    const estatus = String(recordPayload.estatus || '').trim().toUpperCase();
    const hasOperationalData = ['frecuencia', 'thp_psi', 'pip_psi', 'pd_psi'].some(fieldName => {
        const value = recordPayload[fieldName];
        return value !== '' && value !== null && value !== undefined && Number(value) !== 0;
    });

    if (estatus === 'RUN' && !hasOperationalData) {
        warnings.push('El pozo esta en RUN, pero no tiene parametros operacionales cargados.');
    }

    const tone = critical.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';
    const label = tone === 'blocked' ? 'Bloqueado' : tone === 'warning' ? 'Con alerta' : 'Listo';

    return { critical, warnings, tone, label };
}

function summarizeJourneyReview(records = [], journey = {}) {
    const byRecord = new Map();
    let ready = 0;
    let warning = 0;
    let blocked = 0;

    records.forEach(record => {
        const analysis = analyzeRecordForReview(getEditableRecord(record), records, journey, record.id);
        byRecord.set(record.id, analysis);
        if (analysis.tone === 'ready') ready += 1;
        if (analysis.tone === 'warning') warning += 1;
        if (analysis.tone === 'blocked') blocked += 1;
    });

    return {
        byRecord,
        ready,
        warning,
        blocked,
        canPrepareUpload: blocked === 0 && records.length > 0
    };
}

function getReviewToneClass(tone) {
    return `campo-admin-review-pill review-${tone}`;
}

function formatFieldValue(value, suffix = '') {
    if (value === undefined || value === null || value === '') return 'N/D';
    return `${value}${suffix}`;
}

function buildCompactMetric(label, value) {
    return `
        <div class="campo-admin-record-compact-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function buildRecordDiagnosticBadge(record) {
    const diagnostico = getRecordField(record, 'diagnostico');
    const observaciones = getRecordField(record, 'observaciones_pozo');
    const sourceText = diagnostico || observaciones || 'Sin falla reportada';
    const compactText = String(sourceText).trim().replace(/\s+/g, ' ');
    const finalText = compactText.length > 52 ? `${compactText.slice(0, 49)}...` : compactText;
    return `<span class="campo-admin-diagnostic-pill">${escapeHtml(finalText)}</span>`;
}

function buildPublicationRecordKey(record = {}) {
    const pozo = String(record.pozo_name || record.pozo || '').trim().toUpperCase();
    const fecha = String(record.fecha || record.report_date || '').trim();
    const hora = formatTime(record.hora || record.report_time || '');
    return [pozo, fecha, hora].join('|');
}

function formatPublicationValue(fieldName, value) {
    if (value === undefined || value === null || value === '') return '--';

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && String(value).trim() !== '') {
        return `${numericValue}${PUBLICATION_FIELD_SUFFIXES[fieldName] || ''}`;
    }

    return `${value}${PUBLICATION_FIELD_SUFFIXES[fieldName] || ''}`;
}

function buildPublicationFieldList(record = {}, fields = PUBLICATION_DETAIL_FIELDS) {
    const items = fields
        .filter(fieldName => record?.[fieldName] !== undefined && record?.[fieldName] !== null && record?.[fieldName] !== '')
        .map(fieldName => `
            <div style="padding:10px 12px;border:1px solid rgba(226,232,240,0.92);border-radius:14px;background:#fff;display:grid;gap:4px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${escapeHtml(PUBLICATION_FIELD_LABELS[fieldName] || fieldName)}</span>
                <strong style="font-size:14px;color:#0f172a;">${escapeHtml(formatPublicationValue(fieldName, record[fieldName]))}</strong>
            </div>
        `)
        .join('');

    if (!items) {
        return '<p style="margin:0;color:#64748b;">Sin parámetros operativos relevantes para mostrar.</p>';
    }

    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">${items}</div>`;
}

function buildPublicationChangesList(changedFields = []) {
    if (!changedFields.length) {
        return '<p style="margin:0;color:#64748b;">Sin cambios operativos detectados.</p>';
    }

    return `
        <div style="display:grid;gap:10px;">
            ${changedFields.map(change => `
                <div style="padding:12px;border:1px solid rgba(226,232,240,0.92);border-radius:14px;background:#fff;display:grid;gap:8px;">
                    <strong style="font-size:13px;color:#0f172a;">${escapeHtml(PUBLICATION_FIELD_LABELS[change.fieldName] || change.fieldName)}</strong>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
                        <div style="padding:10px;border-radius:12px;background:rgba(241,245,249,0.95);">
                            <span style="display:block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Actual</span>
                            <span style="display:block;font-size:14px;color:#0f172a;">${escapeHtml(formatPublicationValue(change.fieldName, change.previousValue))}</span>
                        </div>
                        <div style="padding:10px;border-radius:12px;background:rgba(236,253,245,0.95);">
                            <span style="display:block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#047857;">Nuevo</span>
                            <span style="display:block;font-size:14px;color:#0f172a;">${escapeHtml(formatPublicationValue(change.fieldName, change.nextValue))}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function buildPublicationRecordCard(title, subtitle, bodyHtml, accent = '#0f766e') {
    return `
        <article style="display:grid;gap:12px;padding:16px;border:1px solid rgba(226,232,240,0.95);border-left:4px solid ${accent};border-radius:18px;background:linear-gradient(180deg,#fff,rgba(248,250,252,0.96));">
            <div style="display:grid;gap:4px;">
                <strong style="font-size:16px;color:#0f172a;">${escapeHtml(title)}</strong>
                <span style="font-size:13px;color:#475569;">${escapeHtml(subtitle)}</span>
            </div>
            ${bodyHtml}
        </article>
    `;
}

function buildPublicationSummaryCard(label, value, tone) {
    const palette = {
        insert: ['rgba(16,185,129,0.12)', '#047857'],
        update: ['rgba(59,130,246,0.12)', '#1d4ed8'],
        skip: ['rgba(148,163,184,0.18)', '#475569'],
        blocked: ['rgba(239,68,68,0.12)', '#b91c1c'],
        warning: ['rgba(245,158,11,0.14)', '#b45309']
    };
    const [background, color] = palette[tone] || palette.skip;

    return `
        <div style="padding:14px 16px;border-radius:18px;background:${background};display:grid;gap:6px;">
            <span style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${color};">${escapeHtml(label)}</span>
            <strong style="font-size:24px;line-height:1;color:#0f172a;">${escapeHtml(String(value || 0))}</strong>
        </div>
    `;
}

function buildPublicationPreviewHtml(preview, reviewSummary, records = []) {
    const byKey = new Map(records.map(record => [normalizeReviewKey(getEditableRecord(record)), record]));
    const blockedEntries = [];
    const warningEntries = [];

    records.forEach(record => {
        const analysis = reviewSummary.byRecord.get(record.id);
        if (!analysis) return;

        const summary = getRecordSummary(record);
        const subtitle = `${summary.fecha || 'Sin fecha'} · ${summary.hora || 'Sin hora'} · ${summary.estatus || 'Sin estatus'}`;

        if (analysis.tone === 'blocked') {
            blockedEntries.push(buildPublicationRecordCard(
                summary.pozo,
                subtitle,
                `<ul style="margin:0;padding-left:18px;color:#991b1b;display:grid;gap:6px;">${analysis.critical.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
                '#dc2626'
            ));
        } else if (analysis.tone === 'warning') {
            warningEntries.push(buildPublicationRecordCard(
                summary.pozo,
                subtitle,
                `<ul style="margin:0;padding-left:18px;color:#92400e;display:grid;gap:6px;">${analysis.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
                '#f59e0b'
            ));
        }
    });

    const insertEntries = (preview.recordsToInsert || []).map(record => {
        const key = buildPublicationRecordKey(record);
        const originalRecord = byKey.get(key);
        const summary = originalRecord ? getRecordSummary(originalRecord) : {
            pozo: String(record.pozo_name || 'Pozo sin nombre').trim().toUpperCase(),
            fecha: record.fecha,
            hora: formatTime(record.hora || ''),
            estatus: record.estatus
        };

        return buildPublicationRecordCard(
            summary.pozo,
            `${summary.fecha || 'Sin fecha'} · ${summary.hora || 'Sin hora'} · ${summary.estatus || 'Sin estatus'}`,
            buildPublicationFieldList(record),
            '#10b981'
        );
    });

    const updateEntries = (preview.recordsToUpdate || []).map(item => {
        const key = buildPublicationRecordKey(item.record);
        const originalRecord = byKey.get(key);
        const summary = originalRecord ? getRecordSummary(originalRecord) : {
            pozo: String(item.record?.pozo_name || 'Pozo sin nombre').trim().toUpperCase(),
            fecha: item.record?.fecha,
            hora: formatTime(item.record?.hora || ''),
            estatus: item.record?.estatus
        };

        return buildPublicationRecordCard(
            summary.pozo,
            `${summary.fecha || 'Sin fecha'} · ${summary.hora || 'Sin hora'} · ${summary.estatus || 'Sin estatus'}`,
            buildPublicationChangesList(item.changedFields || []),
            '#2563eb'
        );
    });

    const skipEntries = (preview.recordsToSkip || []).map(item => {
        const key = buildPublicationRecordKey(item.record);
        const originalRecord = byKey.get(key);
        const summary = originalRecord ? getRecordSummary(originalRecord) : {
            pozo: String(item.record?.pozo_name || 'Pozo sin nombre').trim().toUpperCase(),
            fecha: item.record?.fecha,
            hora: formatTime(item.record?.hora || ''),
            estatus: item.record?.estatus
        };

        return buildPublicationRecordCard(
            summary.pozo,
            `${summary.fecha || 'Sin fecha'} · ${summary.hora || 'Sin hora'} · ${summary.estatus || 'Sin estatus'}`,
            '<p style="margin:0;color:#475569;">Este registro operativo ya existe igual en el dashboard. No se enviará ningún cambio.</p>',
            '#94a3b8'
        );
    });

    const buildSection = (title, description, entries, emptyMessage) => `
        <section style="display:grid;gap:12px;min-width:0;align-content:start;">
            <div style="display:grid;gap:4px;">
                <h3 style="margin:0;font-size:15px;color:#0f172a;">${escapeHtml(title)}</h3>
                <p style="margin:0;color:#64748b;font-size:13px;">${escapeHtml(description)}</p>
            </div>
            ${entries.length ? `<div style="display:grid;gap:12px;max-height:220px;overflow:auto;padding-right:6px;min-width:0;">${entries.join('')}</div>` : `<div style="padding:14px;border:1px dashed rgba(203,213,225,1);border-radius:16px;color:#64748b;">${escapeHtml(emptyMessage)}</div>`}
        </section>
    `;

    const sectionsMarkup = [
        buildSection('Nuevos registros', 'Pozos que se agregarán por primera vez al dashboard operativo.', insertEntries, 'No hay registros nuevos para insertar.'),
        buildSection('Registros actualizados', 'Pozos que ya existen y recibirán reemplazo de campos operativos.', updateEntries, 'No hay registros para actualizar.'),
        buildSection('Registros omitidos', 'Pozos que ya existen con exactamente los mismos valores operativos.', skipEntries, 'No hay registros omitidos.'),
        buildSection('Bloqueados', 'Pozos que no pueden subir hasta corregir validaciones críticas.', blockedEntries, 'No hay pozos bloqueados.'),
        buildSection('Alertas', 'Pozos que pueden subirse, pero conviene revisar antes de confirmar.', warningEntries, 'No hay alertas operativas en esta jornada.')
    ].join('');

    return `
        <div class="campo-admin-upload-preview">
            <div style="padding:16px 18px;border-radius:18px;background:rgba(15,118,110,0.08);border:1px solid rgba(15,118,110,0.16);display:grid;gap:6px;">
                <strong style="font-size:16px;color:#0f172a;">Vista previa de subida operativa</strong>
                <p style="margin:0;color:#475569;line-height:1.5;">Aquí solo se revisan parámetros operativos hacia el dashboard. La medición técnica no se toca.</p>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
                ${buildPublicationSummaryCard('Insertar', preview.inserted, 'insert')}
                ${buildPublicationSummaryCard('Actualizar', preview.updated, 'update')}
                ${buildPublicationSummaryCard('Omitir', preview.skipped, 'skip')}
                ${buildPublicationSummaryCard('Bloqueados', reviewSummary.blocked, 'blocked')}
                ${buildPublicationSummaryCard('Con alerta', reviewSummary.warning, 'warning')}
            </div>

            <div class="campo-admin-upload-sections">
                ${sectionsMarkup}
            </div>
        </div>
    `;
}

function getSelectedRecord() {
    if (!state.currentDetail || !state.selectedRecordId) return null;
    return state.currentDetail.records.find(record => record.id === state.selectedRecordId) || null;
}

function setActionButtonsBusy(isBusy) {
    state.actionInFlight = isBusy;
    elements.detailShell.querySelectorAll('[data-detail-action]').forEach(button => {
        button.disabled = isBusy;
    });
}

async function notify(message, icon = 'info') {
    if (!window.Swal) {
        if (icon === 'error') {
            window.alert(message);
        }
        return;
    }

    await window.Swal.fire({
        icon,
        title: icon === 'success' ? 'Admin Campo' : 'Campo',
        text: message,
        timer: icon === 'success' || icon === 'info' ? 2200 : undefined,
        showConfirmButton: icon !== 'success' && icon !== 'info'
    });
}

async function confirmDeleteJourney(journey) {
    const label = `${journey.locacion_jornada || 'Sin locacion'} · ${journey.jornada || 'Jornada'}`;
    const text = `Se eliminara la jornada completa y sus pozos asociados. Esta accion no se puede deshacer.\n\n${label}`;

    if (!window.Swal) {
        return window.confirm(text);
    }

    const result = await window.Swal.fire({
        icon: 'warning',
        title: 'Eliminar jornada duplicada',
        text,
        showCancelButton: true,
        confirmButtonText: 'Eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b91c1c'
    });

    return result.isConfirmed;
}

async function confirmPublicationPreview(preview, reviewSummary) {
    const lines = [
        `Insertará: ${preview.inserted || 0}`,
        `Actualizará: ${preview.updated || 0}`,
        `Omitirá: ${preview.skipped || 0}`,
        `Total evaluado: ${preview.total || 0}`
    ];

    if (!reviewSummary.canPrepareUpload) {
        lines.push('Hay bloqueos críticos en la jornada. Corrige esos pozos antes de subir al dashboard.');
    }

    if (!window.Swal) {
        return window.confirm(lines.join('\n'));
    }

    const modalHtml = buildPublicationPreviewHtml(preview, reviewSummary, state.currentDetail?.records || []);
    const result = await window.Swal.fire({
        icon: reviewSummary.canPrepareUpload ? 'info' : 'warning',
        title: reviewSummary.canPrepareUpload ? 'Preparar subida operativa' : 'Subida bloqueada',
        html: modalHtml,
        width: 'min(1180px, calc(100vw - 32px))',
        customClass: {
            popup: 'campo-admin-upload-modal',
            htmlContainer: 'campo-admin-upload-modal-html'
        },
        showCancelButton: reviewSummary.canPrepareUpload,
        showConfirmButton: true,
        confirmButtonText: reviewSummary.canPrepareUpload ? 'Confirmar subida' : 'Cerrar',
        cancelButtonText: reviewSummary.canPrepareUpload ? 'Cancelar' : 'Cerrar',
        confirmButtonColor: '#0f766e'
    });

    return reviewSummary.canPrepareUpload ? result.isConfirmed : false;
}

function renderStats() {
    const total = state.journeys.length;
    const inReview = state.journeys.filter(journey => String(journey.status).toLowerCase() === 'under_review').length;
    const reports = state.journeys.reduce((sum, journey) => sum + Number(journey.total_reports || 0), 0);

    elements.visibleCount.textContent = String(total);
    elements.reviewCount.textContent = String(inReview);
    elements.reportCount.textContent = String(reports);
    elements.listCount.textContent = `${total} jornada${total === 1 ? '' : 's'}`;
}

function renderList() {
    if (!state.journeys.length) {
        const emptyCopy = getCurrentFilterEmptyCopy();
        elements.list.innerHTML = `
            <div class="campo-admin-empty">
                <strong>${escapeHtml(emptyCopy.title)}</strong>
                <p>${escapeHtml(buildEmptyStateMessage())}</p>
            </div>
        `;
        return;
    }

    elements.list.innerHTML = state.journeys.map(journey => {
        const isSelected = journey.id === state.selectedJourneyId;
        const pozoTags = Array.isArray(journey.pozoNames) && journey.pozoNames.length > 0
            ? journey.pozoNames.slice(0, 3).map(pozo => `<span class="campo-admin-tag">${escapeHtml(pozo)}</span>`).join('')
            : '<span class="campo-admin-tag">Sin pozos</span>';
        const mainPozo = Array.isArray(journey.pozoNames) && journey.pozoNames.length > 0
            ? journey.pozoNames[0]
            : 'Sin pozo principal';

        return `
            <button type="button" class="campo-admin-ticket${isSelected ? ' is-selected' : ''}" data-journey-id="${escapeHtml(journey.id)}">
                <div class="campo-admin-ticket-top">
                    <span class="${buildStatusClass(journey.status)}">${escapeHtml(normalizeStatusLabel(journey.status))}</span>
                    <span class="campo-admin-ticket-open-hint">Abrir detalle</span>
                </div>
                <div class="campo-admin-ticket-head">
                    <div class="campo-admin-ticket-main">
                        <h3>${escapeHtml(journey.locacion_jornada || 'Sin locación')}</h3>
                        <p>${escapeHtml(journey.equipo_guardia || 'Equipo no informado')} · ${escapeHtml(journey.jornada || 'Jornada no informada')}</p>
                    </div>
                    <div class="campo-admin-ticket-highlight">
                        <span>Pozo principal</span>
                        <strong>${escapeHtml(mainPozo)}</strong>
                    </div>
                </div>
                <div class="campo-admin-ticket-summary-grid">
                    <div class="campo-admin-ticket-summary-item">
                        <span>Fecha</span>
                        <strong>${escapeHtml(formatDate(journey.journey_date))}</strong>
                    </div>
                    <div class="campo-admin-ticket-summary-item">
                        <span>Ventana</span>
                        <strong>${escapeHtml(summarizeJourneyWindow(journey))}</strong>
                    </div>
                    <div class="campo-admin-ticket-summary-item">
                        <span>Registros</span>
                        <strong>${escapeHtml(String(journey.total_reports || 0))} pozo(s)</strong>
                    </div>
                    <div class="campo-admin-ticket-summary-item campo-admin-ticket-summary-item-wide">
                        <span>Ingeniero</span>
                        <strong>${escapeHtml(journey.submitted_by_email || 'Correo no disponible')}</strong>
                    </div>
                </div>
                <div class="campo-admin-tags campo-admin-ticket-tags">${pozoTags}</div>
            </button>
        `;
    }).join('');

    elements.list.querySelectorAll('[data-journey-id]').forEach(button => {
        button.addEventListener('click', () => {
            const { journeyId } = button.dataset;
            if (!journeyId) return;
            selectJourney(journeyId);
        });
    });
}

function closeRecordModal() {
    state.selectedRecordId = '';
    state.recordPanelMode = 'view';
    state.recordSaving = false;

    if (elements.recordModal) {
        elements.recordModal.hidden = true;
    }

    if (elements.recordModalBody) {
        elements.recordModalBody.innerHTML = '';
    }
}

function openRecordModal(recordId, mode = 'view') {
    state.selectedRecordId = String(recordId || '').trim();
    state.recordPanelMode = mode === 'edit' ? 'edit' : 'view';
    renderRecordModal();
}

function buildReviewIssueList(issues = []) {
    if (!issues.length) return '<li>Sin observaciones.</li>';
    return issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('');
}

function buildRecordPreviewSections(recordPayload) {
    return RECORD_EDITOR_SECTIONS.map(section => {
        const itemsMarkup = section.fields.map(([label, fieldName]) => `
            <div class="campo-admin-modal-item${LONG_TEXT_FIELDS.has(fieldName) ? ' is-long' : ''}">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatFieldValue(recordPayload[fieldName]))}</strong>
            </div>
        `).join('');

        return `
            <details class="campo-admin-modal-section" open>
                <summary>${escapeHtml(section.title)}</summary>
                <div class="campo-admin-modal-grid">${itemsMarkup}</div>
            </details>
        `;
    }).join('');
}

function buildRecordEditorSections(recordPayload) {
    return RECORD_EDITOR_SECTIONS.map(section => {
        const fieldsMarkup = section.fields.map(([label, fieldName]) => {
            const value = recordPayload[fieldName] ?? '';
            const type = NUMERIC_FIELD_NAMES.has(fieldName) ? 'number' : 'text';

            if (LONG_TEXT_FIELDS.has(fieldName)) {
                return `
                    <label class="campo-admin-editor-field campo-admin-editor-field-long">
                        <span>${escapeHtml(label)}</span>
                        <textarea name="${escapeHtml(fieldName)}" rows="4">${escapeHtml(String(value))}</textarea>
                    </label>
                `;
            }

            return `
                <label class="campo-admin-editor-field">
                    <span>${escapeHtml(label)}</span>
                    <input type="${type}" name="${escapeHtml(fieldName)}" value="${escapeHtml(String(value))}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''}>
                </label>
            `;
        }).join('');

        return `
            <details class="campo-admin-modal-section" open>
                <summary>${escapeHtml(section.title)}</summary>
                <div class="campo-admin-editor-grid">${fieldsMarkup}</div>
            </details>
        `;
    }).join('');
}

function renderRecordModal() {
    const record = getSelectedRecord();
    if (!record || !elements.recordModal || !elements.recordModalBody) {
        closeRecordModal();
        return;
    }

    const recordPayload = getEditableRecord(record);
    const review = analyzeRecordForReview(recordPayload, state.currentDetail?.records || [], state.currentDetail?.journey || {}, record.id);
    const summary = getRecordSummary(record);
    const isEditing = state.recordPanelMode === 'edit';

    elements.recordModal.hidden = false;
    elements.recordModalBody.innerHTML = `
        <div class="campo-admin-modal-head">
            <div>
                <span class="${buildStatusClass(state.currentDetail?.journey?.status)}">${escapeHtml(normalizeStatusLabel(state.currentDetail?.journey?.status))}</span>
                <h3 id="campo-admin-record-modal-title">${escapeHtml(summary.pozo)}</h3>
                <p>${escapeHtml(summary.campo || '--')} · ${escapeHtml(recordPayload.fecha || 'Sin fecha')} · ${escapeHtml(formatTime(recordPayload.hora || ''))}</p>
            </div>
            <button type="button" class="campo-admin-modal-close" data-record-modal-close aria-label="Cerrar detalle de pozo">×</button>
        </div>
        <div class="campo-admin-modal-review-strip">
            <span class="${getReviewToneClass(review.tone)}">${escapeHtml(review.label)}</span>
            <span class="campo-admin-tag">${escapeHtml(getRecordField(record, 'actividad') || 'Sin actividad')}</span>
            <span class="campo-admin-tag">${escapeHtml(getRecordField(record, 'estatus') || 'Sin estatus')}</span>
        </div>
        <section class="campo-admin-modal-review-panel">
            <article>
                <strong>Bloqueos</strong>
                <ul>${buildReviewIssueList(review.critical)}</ul>
            </article>
            <article>
                <strong>Alertas</strong>
                <ul>${buildReviewIssueList(review.warnings)}</ul>
            </article>
        </section>
        ${isEditing ? `
            <form id="campo-admin-record-form" class="campo-admin-record-form">
                ${buildRecordEditorSections(recordPayload)}
                <div class="campo-admin-modal-actions">
                    <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-record-mode="view">Volver a vista</button>
                    <button type="submit" class="campo-admin-action-btn" ${state.recordSaving ? 'disabled' : ''}>${state.recordSaving ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
            </form>
        ` : `
            <div class="campo-admin-modal-sections">${buildRecordPreviewSections(recordPayload)}</div>
            <div class="campo-admin-modal-actions">
                <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-record-modal-close>Cerrar</button>
                <button type="button" class="campo-admin-action-btn" data-record-mode="edit">Editar pozo</button>
            </div>
        `}
    `;

    elements.recordModalBody.querySelectorAll('[data-record-modal-close]').forEach(button => {
        button.addEventListener('click', closeRecordModal);
    });

    elements.recordModalBody.querySelector('[data-record-mode="edit"]')?.addEventListener('click', () => {
        state.recordPanelMode = 'edit';
        renderRecordModal();
    });

    elements.recordModalBody.querySelector('[data-record-mode="view"]')?.addEventListener('click', () => {
        state.recordPanelMode = 'view';
        renderRecordModal();
    });

    elements.recordModalBody.querySelector('#campo-admin-record-form')?.addEventListener('submit', handleRecordFormSubmit);
}

function buildUpdatedRecordPayload(form) {
    const currentRecord = getSelectedRecord();
    const basePayload = currentRecord ? getEditableRecord(currentRecord) : {};
    const formData = new FormData(form);

    EDITOR_FIELD_NAMES.forEach(fieldName => {
        basePayload[fieldName] = String(formData.get(fieldName) ?? '').trim();
    });

    return basePayload;
}

async function handleRecordFormSubmit(event) {
    event.preventDefault();

    if (state.recordSaving || !state.currentDetail || !state.selectedRecordId) return;

    const payload = buildUpdatedRecordPayload(event.currentTarget);
    const review = analyzeRecordForReview(payload, state.currentDetail.records, state.currentDetail.journey, state.selectedRecordId);
    const validation = validateFieldReport(payload);

    if (!validation.isValid) {
        await notify(validation.message, 'error');
        return;
    }

    if (review.critical.length > 0) {
        await notify(review.critical[0], 'error');
        return;
    }

    const savedRecordId = state.selectedRecordId;

    try {
        state.recordSaving = true;
        renderRecordModal();
        await updateAdminFieldJourneyRecord(savedRecordId, payload, {
            reviewAction: 'under_review',
            reviewComment: `Pozo ${payload.pozo || 'sin nombre'} revisado y actualizado desde Admin Campo.`
        });

        await loadJourneys();
        openRecordModal(savedRecordId, 'view');
        await notify('Los parametros del pozo se guardaron correctamente.', 'success');
    } catch (error) {
        console.error('Admin Campo save record error:', error);
        await notify(error?.message || 'No se pudo guardar el pozo seleccionado.', 'error');
    } finally {
        state.recordSaving = false;
        if (state.selectedRecordId) {
            renderRecordModal();
        }
    }
}

async function showPublicationReadiness() {
    if (!state.currentDetail) return;

    const reviewSummary = summarizeJourneyReview(state.currentDetail.records, state.currentDetail.journey);
    const firstBlockedRecord = state.currentDetail.records.find(record => reviewSummary.byRecord.get(record.id)?.tone === 'blocked');
    const firstWarningRecord = state.currentDetail.records.find(record => reviewSummary.byRecord.get(record.id)?.tone === 'warning');
    const publicationPreview = await previewAdminFieldJourneyPublication(state.currentDetail.journey.id);
    const lines = [
        `Listos: ${reviewSummary.ready}`,
        `Con alerta: ${reviewSummary.warning}`,
        `Bloqueados: ${reviewSummary.blocked}`,
        `Insertará: ${publicationPreview.inserted || 0}`,
        `Actualizará: ${publicationPreview.updated || 0}`,
        `Omitirá: ${publicationPreview.skipped || 0}`,
        reviewSummary.canPrepareUpload
            ? 'La jornada puede subirse al dashboard operativo.'
            : 'Hay bloqueos criticos. Corrige los pozos marcados antes de preparar la subida.'
    ];

    if (firstBlockedRecord) {
        const blockedReview = reviewSummary.byRecord.get(firstBlockedRecord.id);
        lines.push(`Primer bloqueo: ${getRecordSummary(firstBlockedRecord).pozo} · ${blockedReview?.critical?.[0] || 'Revisar pozo.'}`);
    } else if (firstWarningRecord) {
        const warningReview = reviewSummary.byRecord.get(firstWarningRecord.id);
        lines.push(`Primera alerta: ${getRecordSummary(firstWarningRecord).pozo} · ${warningReview?.warnings?.[0] || 'Revisar pozo.'}`);
    }

    const confirmed = await confirmPublicationPreview(publicationPreview, reviewSummary);
    if (!confirmed) {
        await notify(lines.join('\n'), reviewSummary.canPrepareUpload ? 'info' : 'warning');
        return;
    }

    const publicationResult = await publishAdminFieldJourneyToDashboard(state.currentDetail.journey.id);
    await loadJourneys();
    if (state.selectedJourneyId) {
        await selectJourney(state.selectedJourneyId, { keepList: true });
    }

    await notify(
        [
            'Subida al dashboard completada.',
            `Insertados: ${publicationResult.inserted || 0}`,
            `Actualizados: ${publicationResult.updated || 0}`,
            `Omitidos: ${publicationResult.skipped || 0}`
        ].join('\n'),
        'success'
    );
}

function renderEmptyDetail(message = 'Selecciona una jornada para ver su detalle.') {
    state.currentDetail = null;
    closeRecordModal();
    elements.detailShell.innerHTML = `
        <div class="campo-admin-empty">
            <strong>Sin jornada seleccionada</strong>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

async function renderDetail(detail) {
    closeRecordModal();
    closeIncidentModal();

    const { journey, records, reviewLog } = detail;
    const [serverTickets, localTickets] = await Promise.all([
        getFieldTicketsByJourney(journey.id),
        Promise.resolve(getLocalFieldTicketsByJourney(journey.id))
    ]);
    const mergedTickets = [
        ...serverTickets.map(ticket => ({ ...ticket, _local: false })),
        ...localTickets.map(ticket => ({ ...ticket, _local: true }))
    ];
    state.currentDetail = {
        ...detail,
        tickets: mergedTickets
    };
    const reviewSummary = summarizeJourneyReview(records, journey);
    const recordsMarkup = records.length > 0
        ? records.map((record, index) => {
            const summary = getRecordSummary(record);
            const review = reviewSummary.byRecord.get(record.id) || { tone: 'warning', label: 'Con alerta' };
            const recordPosition = `${index + 1} de ${records.length}`;

            return `
                <article class="campo-admin-record-row">
                    <div class="campo-admin-record-row-main">
                        <div class="campo-admin-record-row-head">
                            <div class="campo-admin-record-row-title-block">
                                <div class="campo-admin-record-row-kickers">
                                    <span class="campo-admin-tag campo-admin-tag-soft">Pozo ${recordPosition}</span>
                                </div>
                                <h4>${escapeHtml(summary.pozo)}</h4>
                                <p>${escapeHtml(summary.campo || '--')} · ${escapeHtml(summary.fecha || 'Sin fecha')} · ${escapeHtml(getRecordField(record, 'actividad') || 'Sin actividad')}</p>
                            </div>
                            <div class="campo-admin-record-row-side">
                                <span class="campo-admin-tag">${escapeHtml(summary.hora)}</span>
                                <span class="campo-admin-tag campo-admin-tag-soft">${escapeHtml(getRecordField(record, 'estatus') || 'Sin estatus')}</span>
                                <span class="${getReviewToneClass(review.tone)}">${escapeHtml(review.label)}</span>
                            </div>
                        </div>
                        <div class="campo-admin-record-row-metrics">
                            ${buildCompactMetric('Frecuencia', formatFieldValue(summary.frecuencia, ' Hz'))}
                            ${buildCompactMetric('THP', formatFieldValue(summary.thp, ' psi'))}
                            ${buildCompactMetric('LF', formatFieldValue(summary.lf, ' psi'))}
                            ${buildCompactMetric('PIP', formatFieldValue(summary.pip, ' psi'))}
                            ${buildCompactMetric('PD', formatFieldValue(summary.pd, ' psi'))}
                        </div>
                    </div>
                    <div class="campo-admin-record-row-actions">
                        ${buildRecordDiagnosticBadge(record)}
                        <button type="button" class="campo-admin-inline-btn" data-record-open="${escapeHtml(record.id)}">Ver parametros</button>
                        <button type="button" class="campo-admin-inline-btn campo-admin-inline-btn-strong" data-record-edit="${escapeHtml(record.id)}">Editar</button>
                    </div>
                </article>
            `;
        }).join('')
        : `
            <div class="campo-admin-empty">
                <strong>Sin pozos registrados</strong>
                <p>Esta jornada todavía no muestra registros detallados en la tabla de pozos.</p>
            </div>
        `;

    const reviewLogMarkup = reviewLog.length > 0
        ? reviewLog.map(item => `
            <article class="campo-admin-log-item">
                <div class="campo-admin-log-top">
                    <span class="${buildStatusClass(item.to_status || item.action || journey.status)}">${escapeHtml(normalizeStatusLabel(item.to_status || item.action || journey.status))}</span>
                    <small>${escapeHtml(formatDateTime(item.created_at))}</small>
                </div>
                <h4>${escapeHtml(item.action_label || normalizeReviewActionLabel(item.action))}</h4>
                <p>${escapeHtml(item.comment || item.notes || 'Sin observación registrada.')}</p>
                <small>${escapeHtml(item.performed_by_email || item.created_by_email || item.created_by || 'Usuario no identificado')}</small>
            </article>
        `).join('')
        : `
            <div class="campo-admin-empty">
                <strong>Sin historial todavía</strong>
                <p>La jornada aún no tiene eventos en la bitácora de revisión.</p>
            </div>
        `;

    const ticketsMarkup = mergedTickets.length > 0
        ? mergedTickets.map((ticket, index) => buildAdminTicketMarkup(ticket, index)).join('')
        : `
            <div class="campo-admin-empty">
                <strong>Sin incidencias reportadas</strong>
                <p>Cuando Campo reporte una incidencia asociada a esta jornada, aparecerá aquí.</p>
            </div>
        `;

    elements.detailShell.innerHTML = `
        <section class="campo-admin-panel">
            <div class="campo-admin-detail-head">
                <div class="campo-admin-detail-title-block">
                    <div class="campo-admin-ticket-top">
                        <span class="${buildStatusClass(journey.status)}">${escapeHtml(normalizeStatusLabel(journey.status))}</span>
                        <span class="campo-admin-tag campo-admin-tag-soft">Recibida ${escapeHtml(formatDateTime(journey.created_at))}</span>
                    </div>
                    <h2>${escapeHtml(journey.locacion_jornada || 'Jornada sin locación')}</h2>
                    <p class="campo-admin-detail-copy">${escapeHtml(journey.equipo_guardia || 'Equipo no informado')} · ${escapeHtml(journey.jornada || 'Jornada no informada')} · ${escapeHtml(formatDate(journey.journey_date))}</p>
                </div>
            </div>
            <div class="campo-admin-detail-meta">
                <span class="campo-admin-tag">Responsable: ${escapeHtml(journey.submitted_by_email || 'No disponible')}</span>
                <span class="campo-admin-tag">Ventana: ${escapeHtml(summarizeJourneyWindow(journey))}</span>
                <span class="campo-admin-tag">${escapeHtml(String(journey.total_reports || 0))} pozo(s)</span>
            </div>
            <div class="campo-admin-detail-drawers">
                <details class="campo-admin-drawer">
                    <summary class="campo-admin-drawer-summary">
                        <span class="campo-admin-drawer-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7 12h10"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" d="M10 17h4"></path>
                            </svg>
                            Acciones
                        </span>
                        <span class="campo-admin-drawer-summary-side">
                            <span class="campo-admin-count-badge">4</span>
                            <span class="campo-admin-drawer-arrow" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"></path>
                                </svg>
                            </span>
                        </span>
                    </summary>
                    <div class="campo-admin-drawer-content">
                        <div class="campo-admin-detail-actions">
                            <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-detail-action="review-publication">Preparar subida</button>
                            <button type="button" class="campo-admin-action-btn" data-detail-action="excel">Excel consolidado</button>
                            <button type="button" class="campo-admin-action-btn campo-admin-action-btn-secondary" data-detail-action="pdf">PDF consolidado</button>
                            <button type="button" class="campo-admin-action-btn campo-admin-action-btn-danger" data-detail-action="delete">Eliminar jornada</button>
                        </div>
                    </div>
                </details>
            </div>
        </section>

        <section class="campo-admin-panel">
            <div class="campo-admin-panel-head">
                <div>
                    <h3>Detalle de pozos por jornada</h3>
                    <p>Vista compacta con scroll, revisión por pozo y acceso directo a todos los parametros.</p>
                </div>
                <span class="campo-admin-count-badge">${escapeHtml(String(records.length))} pozo(s)</span>
            </div>
            <div class="campo-admin-review-grid">
                <article class="campo-admin-review-card">
                    <span>Listos</span>
                    <strong>${escapeHtml(String(reviewSummary.ready))}</strong>
                    <p>Pozos sin bloqueos criticos.</p>
                </article>
                <article class="campo-admin-review-card">
                    <span>Con alerta</span>
                    <strong>${escapeHtml(String(reviewSummary.warning))}</strong>
                    <p>Requieren revisar coherencia antes de subir.</p>
                </article>
                <article class="campo-admin-review-card">
                    <span>Bloqueados</span>
                    <strong>${escapeHtml(String(reviewSummary.blocked))}</strong>
                    <p>No deberian pasar a Data hasta corregirse.</p>
                </article>
            </div>
            <div class="campo-admin-record-scroll">
                <div class="campo-admin-detail-sections campo-admin-detail-sections-compact">${recordsMarkup}</div>
            </div>
        </section>

        <details class="campo-admin-panel campo-admin-drawer-panel" open>
            <summary class="campo-admin-drawer-summary">
                <span class="campo-admin-drawer-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 14h5"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                    </svg>
                    Incidencias reportadas
                </span>
                <span class="campo-admin-drawer-summary-side">
                    <span class="campo-admin-count-badge">${escapeHtml(String(mergedTickets.length))} ticket(s)</span>
                    <span class="campo-admin-drawer-arrow" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"></path>
                        </svg>
                    </span>
                </span>
            </summary>
            <div class="campo-admin-drawer-content campo-admin-drawer-content-panel">
                <p class="campo-admin-drawer-copy">Incidencias generadas desde Campo para esta jornada.</p>
                <div class="campo-admin-incident-list">${ticketsMarkup}</div>
            </div>
        </details>

        <details class="campo-admin-panel campo-admin-drawer-panel">
            <summary class="campo-admin-drawer-summary">
                <span class="campo-admin-drawer-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"></path>
                    </svg>
                    Historial de revisión
                </span>
                <span class="campo-admin-drawer-summary-side">
                    <span class="campo-admin-count-badge">${escapeHtml(String(reviewLog.length))} evento(s)</span>
                    <span class="campo-admin-drawer-arrow" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"></path>
                        </svg>
                    </span>
                </span>
            </summary>
            <div class="campo-admin-drawer-content campo-admin-drawer-content-panel">
                <p class="campo-admin-drawer-copy">Bitácora asociada a esta jornada.</p>
                <div class="campo-admin-log-list">${reviewLogMarkup}</div>
            </div>
        </details>
    `;

    elements.detailShell.querySelectorAll('[data-detail-action]').forEach(button => {
        button.addEventListener('click', () => handleDetailAction(button.dataset.detailAction));
    });

    elements.detailShell.querySelectorAll('[data-record-open]').forEach(button => {
        button.addEventListener('click', () => openRecordModal(button.dataset.recordOpen, 'view'));
    });

    elements.detailShell.querySelectorAll('[data-record-edit]').forEach(button => {
        button.addEventListener('click', () => openRecordModal(button.dataset.recordEdit, 'edit'));
    });

    elements.detailShell.querySelectorAll('[data-ticket-src]').forEach(button => {
        button.addEventListener('click', () => {
            const src = button.getAttribute('data-ticket-src');
            if (!src) return;
            window.open(src, '_blank', 'noopener,noreferrer');
        });
    });

    elements.detailShell.querySelectorAll('[data-incident-open]').forEach(button => {
        button.addEventListener('click', () => openIncidentModal(button.getAttribute('data-incident-open')));
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openIncidentModal(button.getAttribute('data-incident-open'));
            }
        });
    });
}

function setToolbarStatus(message) {
    elements.toolbarStatus.textContent = message;
}

function setLoading(isLoading) {
    state.loading = isLoading;
    elements.refreshButton.disabled = isLoading;
    elements.searchInput.disabled = isLoading;
    elements.filterGroup.querySelectorAll('[data-status-filter]').forEach(button => {
        button.disabled = isLoading;
    });
}

async function fetchJourneysForFilter(filterKey) {
    return getAdminFieldJourneys({
        statuses: STATUS_FILTERS[filterKey] || STATUS_FILTERS.pending,
        searchTerm: state.searchTerm,
        limit: 120
    });
}

function syncActiveFilterButton() {
    elements.filterGroup.querySelectorAll('[data-status-filter]').forEach(item => {
        item.classList.toggle('is-active', item.dataset.statusFilter === state.filterKey);
    });
}

function getCurrentFilterEmptyCopy() {
    return FILTER_EMPTY_COPY[state.filterKey] || FILTER_EMPTY_COPY.all;
}

async function loadWorkflowDiagnostics() {
    try {
        state.diagnostics = await getFieldWorkflowDiagnostics();
    } catch (error) {
        console.error('Admin Campo diagnostics error:', error);
        state.diagnostics = null;
    }
}

function buildEmptyStateMessage() {
    const currentFilterCopy = getCurrentFilterEmptyCopy();
    const diagnostics = state.diagnostics;
    if (!diagnostics) {
        return currentFilterCopy.detail;
    }

    const frontendRole = diagnostics.frontendRole || 'sin rol';
    const dbRole = diagnostics.dbRole || 'sin rol';

    if (diagnostics.canViewManagementFromFrontend && !['admin', 'supervisor'].includes(dbRole)) {
        return `Supabase esta viendo tu sesion como ${dbRole}, aunque el frontend te muestra como ${frontendRole}. Eso hace que la base no te devuelva la bandeja administrativa.`;
    }

    if (diagnostics.visibleJourneyCount > 0) {
        return `Tu sesion puede ver ${diagnostics.visibleJourneyCount} jornada(s) en el workflow, pero ninguna coincide con ${currentFilterCopy.title.toLowerCase()}.`;
    }

    return `${currentFilterCopy.detail} Si esperabas verla aquí, revisa si la jornada todavía no fue enviada al workflow administrativo.`;
}

async function loadJourneys() {
    setLoading(true);
    state.diagnostics = null;
    setToolbarStatus('Sincronizando');
    elements.sideCopy.textContent = 'Consultando jornadas registradas desde Campo para revisión administrativa.';

    try {
        const journeys = await fetchJourneysForFilter(state.filterKey);

        state.journeys = Array.isArray(journeys) ? journeys : [];

        const hasSelected = state.journeys.some(journey => journey.id === state.selectedJourneyId);
        if (!hasSelected) {
            state.selectedJourneyId = state.journeys[0]?.id || '';
        }

        renderStats();
        renderList();

        if (state.selectedJourneyId) {
            await selectJourney(state.selectedJourneyId, { keepList: true });
        } else {
            await loadWorkflowDiagnostics();
            renderEmptyDetail(buildEmptyStateMessage());
        }

        if (state.journeys.length === 0) {
            const emptyCopy = getCurrentFilterEmptyCopy();
            setToolbarStatus(emptyCopy.title);
            elements.sideCopy.textContent = buildEmptyStateMessage();
        } else {
            setToolbarStatus(`${state.journeys.length} resultado(s)`);
            elements.sideCopy.textContent = state.journeys.length > 0
                ? `Hay ${state.journeys.length} jornada(s) visibles en la bandeja actual.`
                : buildEmptyStateMessage();
        }
    } catch (error) {
        console.error('Admin Campo loadJourneys error:', error);
        state.journeys = [];
        renderStats();
        elements.list.innerHTML = `
            <div class="campo-admin-error">${escapeHtml(error?.message || 'No se pudo consultar la bandeja de Campo.')}</div>
        `;
        renderEmptyDetail('No fue posible cargar el detalle porque la bandeja falló al sincronizar.');
        setToolbarStatus('Error de carga');
        elements.sideCopy.textContent = error?.message || 'No se pudo conectar con el workflow administrativo de Campo.';
    } finally {
        setLoading(false);
    }
}

async function selectJourney(journeyId, options = {}) {
    state.selectedJourneyId = journeyId;

    if (!options.keepList) {
        renderList();
    }

    elements.detailShell.innerHTML = `
        <div class="campo-admin-empty">
            <strong>Cargando detalle</strong>
            <p>Consultando pozos e historial de la jornada seleccionada.</p>
        </div>
    `;

    try {
        const detail = await getAdminFieldJourneyDetail(journeyId);
        await renderDetail(detail);
    } catch (error) {
        console.error('Admin Campo selectJourney error:', error);
        elements.detailShell.innerHTML = `
            <div class="campo-admin-error">${escapeHtml(error?.message || 'No se pudo cargar el detalle de la jornada.')}</div>
        `;
    }
}

async function handleDetailAction(action) {
    if (state.actionInFlight || !state.currentDetail) return;

    const { journey, records } = state.currentDetail;

    try {
        if (action === 'excel') {
            setActionButtonsBusy(true);
            await exportFieldJourneyToExcel(journey, records);
            await notify('Se genero el Excel consolidado de la jornada.', 'success');
            return;
        }

        if (action === 'pdf') {
            setActionButtonsBusy(true);
            openFieldJourneyPdf(journey, records);
            await notify('Se abrio la vista imprimible para PDF.', 'success');
            return;
        }

        if (action === 'review-publication') {
            await showPublicationReadiness();
            return;
        }

        if (action === 'delete') {
            const confirmed = await confirmDeleteJourney(journey);
            if (!confirmed) return;

            setActionButtonsBusy(true);
            const currentIndex = state.journeys.findIndex(item => item.id === journey.id);
            const nextJourneyId = state.journeys[currentIndex + 1]?.id || state.journeys[currentIndex - 1]?.id || '';
            await deleteAdminFieldJourney(journey.id);
            state.selectedJourneyId = nextJourneyId;
            await loadJourneys();
            await notify('La jornada se elimino correctamente.', 'success');
        }
    } catch (error) {
        console.error('Admin Campo action error:', error);
        await notify(error?.message || 'No se pudo completar la accion sobre la jornada.', 'error');
    } finally {
        setActionButtonsBusy(false);
    }
}

function handleSearchInput(event) {
    state.searchTerm = String(event.target.value || '').trim();
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
        loadJourneys();
    }, 220);
}

function handleFilterClick(event) {
    const button = event.target.closest('[data-status-filter]');
    if (!button) return;

    const nextFilter = String(button.dataset.statusFilter || 'pending');
    if (!STATUS_FILTERS[nextFilter] || nextFilter === state.filterKey) return;

    state.filterKey = nextFilter;
    syncActiveFilterButton();
    loadJourneys();
}

async function bootstrap() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (!accessProfile?.canViewManagement) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    elements.logoutButton?.addEventListener('click', logout);
    elements.mobileLogoutButton?.addEventListener('click', logout);
    elements.refreshButton?.addEventListener('click', loadJourneys);
    elements.historicalExportButton?.addEventListener('click', openHistoricalModal);
    elements.searchInput?.addEventListener('input', handleSearchInput);
    elements.filterGroup?.addEventListener('click', handleFilterClick);
    elements.recordModal?.addEventListener('click', event => {
        if (event.target === elements.recordModal) {
            closeRecordModal();
        }
    });
    elements.incidentModal?.addEventListener('click', event => {
        if (event.target === elements.incidentModal) {
            closeIncidentModal();
        }
    });
    elements.historicalModal?.addEventListener('click', event => {
        if (event.target === elements.historicalModal) {
            closeHistoricalModal();
        }
    });

    await loadJourneys();
}

bootstrap();
