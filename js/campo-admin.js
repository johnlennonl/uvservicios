import { supabase } from './supabaseClient.js';
import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { initOperationalScopeContext, renderOperationalScopeSwitcher } from './services/operational-scope-context.js';
import { getAdminFieldJourneys, getAdminFieldJourneyDetail, deleteAdminFieldJourney, getFieldWorkflowDiagnostics, updateAdminFieldJourneyRecord, deleteAdminFieldJourneyRecord, saveAdminFieldJourneyReview, previewAdminFieldJourneyPublication, publishAdminFieldJourneyToDashboard, getFieldTicketsByJourney, getHistoricalFieldReports, getHistoricalFieldReportAudit, deleteHistoricalFieldReportsByPozo, mergeAdminFieldJourneys } from './services/field-journey-service.js';
import { exportFieldJourneyToExcel, openFieldJourneyPdf, exportHistoricalFieldReportsToExcel } from './services/field-journey-export.js';
import { validateFieldReport } from './modules/field/field-validation.js';
import { animateNumber } from './ui.js';

const STATUS_FILTERS = {
    pending: ['submitted', 'under_review'],
    drafts: ['draft'],
    submitted: ['submitted'],
    under_review: ['under_review'],
    approved: ['approved', 'published'],
    all: ['submitted', 'under_review', 'approved', 'published', 'rejected', 'archived', 'draft']
};

const STATUS_LABELS = {
    draft: 'En vivo (Jornada en Curso)',
    submitted: 'Pendiente',
    under_review: 'En revisión',
    approved: 'Aprobada',
    published: 'Publicada',
    rejected: 'Rechazada',
    archived: 'Archivada'
};

const MERGE_SAFE_STATUSES = ['submitted', 'under_review', 'rejected'];

const KPI_ALERT_CONFIG_STORAGE_KEY = 'campoAdminKpiAverageAlertRules';

const DEFAULT_KPI_AVERAGE_ALERT_RULES = {
    frecuencia: { reviewAbs: 1, alertAbs: 2 },
    pip: { reviewAbs: 75, alertAbs: 150, reviewPct: 5, alertPct: 10 },
    iMotor: { reviewAbs: 3, alertAbs: 6, reviewPct: 5, alertPct: 10 },
    thp: { reviewAbs: 50, alertAbs: 100, reviewPct: 10, alertPct: 20 },
    tm: { reviewAbs: 5, alertAbs: 10 }
};

const KPI_ALERT_CONFIG_FIELDS = [
    { key: 'frecuencia', label: 'FREC', unit: 'Hz', help: 'Frecuencia de operación reportada.' },
    { key: 'pip', label: 'PIP', unit: 'psi', help: 'Presión de entrada de bomba.' },
    { key: 'iMotor', label: 'I MOTOR', unit: 'A', help: 'Corriente del motor.' },
    { key: 'thp', label: 'THP', unit: 'psi', help: 'Presión de tubing en cabezal.' },
    { key: 'tm', label: 'TM', unit: 'F', help: 'Temperatura de motor.' }
];

const FILTER_EMPTY_COPY = {
    pending: {
        title: 'Sin pendientes',
        detail: 'No hay jornadas pendientes o en revisión en este momento.'
    },
    drafts: {
        title: 'Sin borrador en vivo',
        detail: 'En este momento ningún operador tiene un borrador en curso activo en campo.'
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

const QUEUE_HEADER_COPY = {
    pending: {
        title: 'Listado de jornadas pendientes',
        subtitle: 'Selecciona una jornada para abrir el detalle administrativo y revisar los pozos enviados por Campo.'
    },
    drafts: {
        title: 'Listado de jornadas en vivo',
        subtitle: 'Monitorea en tiempo real los parámetros operativos de las jornadas activas en curso en el campo.'
    },
    submitted: {
        title: 'Listado de jornadas pendientes',
        subtitle: 'Revisa las jornadas recién enviadas por la cuadrilla de campo.'
    },
    under_review: {
        title: 'Listado de jornadas en revisión',
        subtitle: 'Jornadas que se encuentran actualmente bajo inspección o corrección.'
    },
    approved: {
        title: 'Listado de jornadas aprobadas',
        subtitle: 'Consulta las jornadas que ya fueron aprobadas por la supervisión o publicadas al Dashboard.'
    },
    all: {
        title: 'Listado de todas las jornadas',
        subtitle: 'Bandeja completa con el historial de todas las jornadas registradas en el sistema.'
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
            ['Técnico 1', 'tecnico_1'],
            ['Técnico 2', 'tecnico_2'],
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
            ['ABS IA PROM VSD', 'desv_fase_a'],
            ['ABS IB PROM VSD', 'desv_fase_b'],
            ['ABS IC PROM VSD', 'desv_fase_c'],
            ['MAXIMO ABS I VSD', 'max_desviacion_vsd'],
            ['% Desbalance Corriente VSD', 'desbalance_corriente_vsd'],
            ['Posee sensor de fondo', 'posee_sensor_fondo'],
            ['Descargó data del sensor', 'descarga_datas_sensor'],
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
            ['Descargó data del VDF', 'baja_datos'],
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
            ['Condicion de la jaula', 'condicion_caseta'],
            ['Temperatura de la caseta del VDF', 'temperatura_caseta'],
            ['Estado de fosa [%]', 'estado_fosa_porcentaje'],
            ['Estado del BIW/conector', 'estado_biw_conector'],
            ['Estado de manometros', 'estado_manometros'],
            ['Estado del cabezal', 'estado_cabezal'],
            ['Estado de tomamuestras', 'estado_tomamuestras'],
            ['Estado caja de venteo', 'estado_caja_venteo']
        ]
    },
    {
        title: 'Presiones de superficie',
        fields: [
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
            ['FASE-FASE X1-X2 [VOLT]', 'ff_x1_x2_v'],
            ['FASE-FASE X2-X3 [VOLT]', 'ff_x2_x3_v'],
            ['FASE-FASE X3-X1 [VOLT]', 'ff_x3_x1_v'],
            ['PROMEDIO F-F PRIMARIO', 'promedio_fase_fase'],
            ['ABS X1-X2 PROM', 'desv_ff_x1_x2'],
            ['ABS X3-X2 PROM', 'desv_ff_x2_x3'],
            ['ABS X3-X1 PROM', 'desv_ff_x3_x1'],
            ['MAX ABS F-F PRIMARIO', 'max_desviacion_ff'],
            ['% DESBALANCE FASE/FASE (VOLT)', 'desbalance_fase_fase'],
            ['FASE-TIERRA X1-X2 [VOLT]', 'ft_x1_tierra_v'],
            ['FASE-TIERRA X2-X3 [VOLT]', 'ft_x2_tierra_v'],
            ['FASE-TIERRA X3-X1 [VOLT]', 'ft_x3_tierra_v'],
            ['PROMEDIO FASE/TIERRA (VOLT)', 'promedio_fase_tierra'],
            ['ABS X1-X2 FASE TIERRA PRIMARIO', 'desv_ft_x1_tierra'],
            ['ABS X2-X3 FASE TIERRA PRIMARIO', 'desv_ft_x2_tierra'],
            ['ABS X3-X1 FASE TIERRA PRIMARIO', 'desv_ft_x3_tierra'],
            ['MAX ABS F-T PRIMARIO', 'max_desviacion_ft'],
            ['% DESBALANCE FASE/TIERRA (VOLT)', 'desbalance_fase_tierra'],
            ['CORRIENTE X1-X2 [AMP]', 'corriente_x1_x2_amp'],
            ['CORRIENTE X2-X3 [AMP]', 'corriente_x2_x3_amp'],
            ['CORRIENTE X3-X1 [AMP]', 'corriente_x3_x1_amp'],
            ['PROMEDIO CORRIENTE PRIMARIO [AMP]', 'promedio_corriente_primaria'],
            ['ABS CORRIETE X1-X2 PROMEDIO', 'desv_corriente_x1_x2'],
            ['ABS CORRIETE X2-X3 PROMEDIO', 'desv_corriente_x2_x3'],
            ['ABS CORRIETE X3-X1 PROMEDIO', 'desv_corriente_x3_x1'],
            ['MAX ABS CORRIENTE PROMEDIO PRIMARIO', 'max_desviacion_corriente_primaria'],
            ['% DESBALANCE CORRIENTE (AMP)', 'desbalance_corriente_primaria']
        ]
    },
    {
        title: 'Tx bobina secundaria',
        fields: [
            ['FASE-FASE H1-H2 [VOLT]', 'sec_ff_h1_h2_v'],
            ['FASE-FASE H2-H3 [VOLT]', 'sec_ff_h2_h3_v'],
            ['FASE-FASE H3-H1 [VOLT]', 'sec_ff_h3_h1_v'],
            ['PROMEDIO FASE/FASE [VOLT]', 'sec_promedio_fase_fase'],
            ['ABS F-F H1-H2 PROMEDIO', 'sec_desv_ff_h1_h2'],
            ['ABS F-F H2-H3 PROMEDIO', 'sec_desv_ff_h2_h3'],
            ['ABS F-F H3-H1 PROMEDIO', 'sec_desv_ff_h3_h1'],
            ['MAX ABS F-F PROMEDIO SECUNDARIO', 'sec_max_desviacion_ff'],
            ['% DESBALANCE FASE/FASE [VOLT]', 'sec_desbalance_fase_fase'],
            ['FASE-TIERRA H1-H2 [VOLT]', 'sec_ft_h1_tierra_v'],
            ['FASE-TIERRA H2-H3 [VOLT]', 'sec_ft_h2_tierra_v'],
            ['FASE-TIERRA H3-H1 [VOLT]', 'sec_ft_h3_tierra_v'],
            ['PROMEDIO FASE-TIERRA [VOLT]', 'sec_promedio_fase_tierra'],
            ['ABS F-T H1-H2 PROMEDIO', 'sec_desv_ft_h1_h2'],
            ['ABS F-T H2-H3 PROMEDIO', 'sec_desv_ft_h2_h3'],
            ['ABS F-T H3-H1 PROMEDIO', 'sec_desv_ft_h3_h1'],
            ['MAX ABS F-T PROMEDIO SECUNDARIO', 'sec_max_desviacion_ft'],
            ['% DESBALANCE FASE/TIERRA [VOLT]', 'sec_desbalance_fase_tierra'],
            ['CORRIENTE H1-H2 [AMP]', 'corriente_h1_h2_amp'],
            ['CORRIENTE H2-H3 [AMP]', 'corriente_h2_h3_amp'],
            ['CORRIENTE H3-H1 [AMP]', 'corriente_h3_h1_amp'],
            ['PROMEDIO CORRIENTE SECUNDARIO [AMP]', 'sec_promedio_corriente'],
            ['ABS CORRIENTE H1-H2 PROMEDIO', 'sec_desv_corriente_h1_h2'],
            ['ABS CORRIENTE H2-H3 PROMEDIO', 'sec_desv_corriente_h2_h3'],
            ['ABS CORRIENTE H3-H1 PROMEDIO', 'sec_desv_corriente_h3_h1'],
            ['MAXIMO ABS CORRIENTE PROMEDIO SECUNDARIO', 'sec_max_desviacion_corriente'],
            ['% DESBALANCE CORRIENTE [AMP]', 'desbalance_corriente_secundaria']
        ]
    },
    {
        title: 'Indicadores operacionales',
        fields: [
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
    'corriente_x1_x2_amp',
    'corriente_x2_x3_amp',
    'corriente_x3_x1_amp',
    'promedio_corriente_primaria',
    'desv_corriente_x1_x2',
    'desv_corriente_x2_x3',
    'desv_corriente_x3_x1',
    'max_desviacion_corriente_primaria',
    'desbalance_corriente_primaria',
    'sec_ff_h1_h2_v',
    'sec_ff_h2_h3_v',
    'sec_ff_h3_h1_v',
    'sec_promedio_fase_fase',
    'sec_desv_ff_h1_h2',
    'sec_desv_ff_h2_h3',
    'sec_desv_ff_h3_h1',
    'sec_max_desviacion_ff',
    'sec_desbalance_fase_fase',
    'sec_ft_h1_tierra_v',
    'sec_ft_h2_tierra_v',
    'sec_ft_h3_tierra_v',
    'sec_promedio_fase_tierra',
    'sec_desv_ft_h1_h2',
    'sec_desv_ft_h2_h3',
    'sec_desv_ft_h3_h1',
    'sec_max_desviacion_ft',
    'sec_desbalance_fase_tierra',
    'corriente_h1_h2_amp',
    'corriente_h2_h3_amp',
    'corriente_h3_h1_amp',
    'sec_promedio_corriente',
    'sec_desv_corriente_h1_h2',
    'sec_desv_corriente_h2_h3',
    'sec_desv_corriente_h3_h1',
    'sec_max_desviacion_corriente',
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
    profilesMap: {},
    journeys: [],
    selectedJourneyId: '',
    filterKey: 'pending',
    accessProfile: null,
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
    historicalExporting: false,
    historicalAuditLoading: false,
    historicalAuditSearch: '',
    historicalAuditItems: [],
    historicalAuditDeletingPozo: '',
    autoEditPozoName: null // NUEVO: para abrir el modal de edición automáticamente
};

const elements = {};

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
                <span class="campo-admin-tag">${escapeHtml(getSubmitterLabel(ticket.submitted_by_email))}</span>
            </div>
            ${attachmentsMarkup}
        </article>
    `;
}

let campoAdminModalScrollY = 0;

function getCampoAdminModals() {
    return [
        elements.recordModal,
        elements.incidentModal,
        elements.historicalModal,
        elements.historicalAuditModal,
        elements.alertConfigModal
    ].filter(Boolean);
}

function hasOpenCampoAdminModal() {
    return getCampoAdminModals().some(modal => !modal.hidden);
}

function syncCampoAdminModalScrollLock() {
    const shouldLock = hasOpenCampoAdminModal();
    const isLocked = document.body.classList.contains('campo-admin-modal-open');

    if (shouldLock && !isLocked) {
        campoAdminModalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.style.top = `-${campoAdminModalScrollY}px`;
        document.body.classList.add('campo-admin-modal-open');
        return;
    }

    if (!shouldLock && isLocked) {
        document.body.classList.remove('campo-admin-modal-open');
        document.body.style.top = '';
        window.scrollTo(0, campoAdminModalScrollY);
    }
}

function openCampoAdminModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    syncCampoAdminModalScrollLock();
}

function closeCampoAdminModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    syncCampoAdminModalScrollLock();
}

function closeIncidentModal() {
    state.selectedIncidentIndex = -1;
    closeCampoAdminModal(elements.incidentModal);
    if (elements.incidentModalBody) elements.incidentModalBody.innerHTML = '';
}

function closeHistoricalModal() {
    closeCampoAdminModal(elements.historicalModal);
}

function closeHistoricalAuditModal() {
    closeCampoAdminModal(elements.historicalAuditModal);
}

function closeAlertConfigModal() {
    closeCampoAdminModal(elements.alertConfigModal);
    if (elements.alertConfigModalBody) elements.alertConfigModalBody.innerHTML = '';
}

function normalizeAlertRuleNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function normalizeAlertRules(rules = {}) {
    return Object.fromEntries(KPI_ALERT_CONFIG_FIELDS.map(field => {
        const fallback = DEFAULT_KPI_AVERAGE_ALERT_RULES[field.key] || {};
        const source = rules?.[field.key] && typeof rules[field.key] === 'object' ? rules[field.key] : {};
        const normalizedRule = {};

        ['reviewAbs', 'alertAbs', 'reviewPct', 'alertPct'].forEach(ruleKey => {
            const value = normalizeAlertRuleNumber(source[ruleKey]);
            const fallbackValue = normalizeAlertRuleNumber(fallback[ruleKey]);
            if (value !== null) {
                normalizedRule[ruleKey] = value;
            } else if (fallbackValue !== null) {
                normalizedRule[ruleKey] = fallbackValue;
            }
        });

        return [field.key, normalizedRule];
    }));
}

function loadAlertRules() {
    try {
        const stored = JSON.parse(window.localStorage?.getItem(KPI_ALERT_CONFIG_STORAGE_KEY) || 'null');
        return normalizeAlertRules(stored || DEFAULT_KPI_AVERAGE_ALERT_RULES);
    } catch (error) {
        console.warn('No se pudo cargar la configuración de alertas KPI:', error);
        return normalizeAlertRules(DEFAULT_KPI_AVERAGE_ALERT_RULES);
    }
}

function saveAlertRules(rules = {}) {
    const normalizedRules = normalizeAlertRules(rules);
    window.localStorage?.setItem(KPI_ALERT_CONFIG_STORAGE_KEY, JSON.stringify(normalizedRules));
    return normalizedRules;
}

function getKpiAverageAlertRules() {
    return loadAlertRules();
}

function formatAuditUserSummary(emails = []) {
    if (!Array.isArray(emails) || emails.length === 0) return 'Sin correo asociado';
    if (emails.length === 1) return emails[0];
    return `${emails[0]} +${emails.length - 1}`;
}

function formatAuditRecentRecord(record = {}) {
    const date = record.reportDate || 'Sin fecha';
    const time = record.reportTime || '00:00:00';
    const journey = record.jornada || 'Sin jornada';
    return `${date} · ${time} · ${journey}`;
}

function buildHistoricalAuditModalMarkup() {
    const items = Array.isArray(state.historicalAuditItems) ? state.historicalAuditItems : [];
    const totalRecords = items.reduce((sum, item) => sum + Number(item.totalRecords || 0), 0);

    return `
        <div class="campo-admin-historical-audit-shell">
            <div class="campo-admin-modal-head">
                <div>
                    <span class="campo-admin-tag campo-admin-tag-soft">Auditoria historico legacy</span>
                    <h3 id="campo-admin-historical-audit-modal-title">Auditoría de pozos guardados en histórico Campo</h3>
                    <p>Este panel revisa la tabla legacy field_journey_reports. Aquí puedes auditar qué pozos se agregaron, revisar su carga y limpiar registros que ya no deban permanecer en el histórico.</p>
                </div>
                <button type="button" class="campo-admin-modal-close" data-historical-audit-close aria-label="Cerrar auditoria historica">×</button>
            </div>

            <div class="campo-admin-historical-audit-summary">
                <article class="campo-admin-historical-summary-card">
                    <span>Pozos visibles</span>
                    <strong>${escapeHtml(String(items.length))}</strong>
                </article>
                <article class="campo-admin-historical-summary-card">
                    <span>Registros legacy</span>
                    <strong>${escapeHtml(String(totalRecords))}</strong>
                </article>
                <article class="campo-admin-historical-summary-card">
                    <span>Filtro actual</span>
                    <strong>${escapeHtml(state.historicalAuditSearch || 'Todos')}</strong>
                </article>
            </div>

            <form id="campo-admin-historical-audit-search" class="campo-admin-historical-audit-toolbar">
                <label class="campo-admin-editor-field campo-admin-editor-field-long">
                    <span>Buscar pozo en histórico legacy</span>
                    <input type="search" name="pozo" value="${escapeHtml(state.historicalAuditSearch)}" placeholder="Ej: TOM012, CEI0006, UV-01" ${state.historicalAuditLoading ? 'disabled' : ''}>
                    <small class="campo-admin-field-help">Filtra por nombre o fragmento del pozo para revisar altas antiguas, duplicados, pruebas o registros que ya no deban seguir exportándose.</small>
                </label>
                <div class="campo-admin-historical-audit-toolbar-actions">
                    <button type="submit" class="campo-admin-action-btn campo-admin-action-btn-secondary" ${state.historicalAuditLoading ? 'disabled' : ''}>${state.historicalAuditLoading ? 'Buscando...' : 'Buscar'}</button>
                    <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-historical-audit-reset ${state.historicalAuditLoading ? 'disabled' : ''}>Limpiar filtro</button>
                    <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-historical-audit-refresh ${state.historicalAuditLoading ? 'disabled' : ''}>Actualizar</button>
                </div>
            </form>

            <section class="campo-admin-historical-audit-list" aria-live="polite">
                ${state.historicalAuditLoading ? `
                    <div class="campo-admin-empty campo-admin-historical-audit-empty">
                        <strong>Cargando histórico legacy</strong>
                        <p>Revisando qué pozos fueron guardados en field_journey_reports para preparar la auditoría.</p>
                    </div>
                ` : items.length === 0 ? `
                    <div class="campo-admin-empty campo-admin-historical-audit-empty">
                        <strong>Sin coincidencias</strong>
                        <p>No se encontraron pozos legacy con ese filtro. Ajusta la búsqueda o confirma si ese pozo nunca fue guardado en este histórico.</p>
                    </div>
                ` : items.map(item => `
                    <article class="campo-admin-historical-audit-card">
                        <div class="campo-admin-historical-audit-card-head">
                            <div>
                                <strong>${escapeHtml(item.pozo || 'SIN_POZO')}</strong>
                                <p>${escapeHtml(String(item.totalRecords || 0))} registro(s) legacy · ${escapeHtml(formatAuditUserSummary(item.userEmails || []))}</p>
                            </div>
                            <button type="button" class="campo-admin-action-btn campo-admin-action-btn-danger" data-historical-audit-delete="${escapeHtml(item.pozo || '')}" ${state.historicalAuditDeletingPozo === item.pozo ? 'disabled' : ''}>
                                ${state.historicalAuditDeletingPozo === item.pozo ? 'Eliminando...' : 'Eliminar del histórico'}
                            </button>
                        </div>
                        <div class="campo-admin-historical-audit-metrics">
                            <div class="campo-admin-modal-item">
                                <span>Primera fecha visible</span>
                                <strong>${escapeHtml(item.firstDate || '--')}</strong>
                            </div>
                            <div class="campo-admin-modal-item">
                                <span>Última fecha visible</span>
                                <strong>${escapeHtml(item.lastDate || '--')}</strong>
                            </div>
                            <div class="campo-admin-modal-item">
                                <span>Última hora visible</span>
                                <strong>${escapeHtml(item.lastTime || '--')}</strong>
                            </div>
                        </div>
                        <div class="campo-admin-historical-audit-recent">
                            <span class="campo-admin-historical-audit-recent-title">Muestras recientes</span>
                            <div class="campo-admin-historical-audit-recent-list">
                                ${(item.recentRecords || []).map(record => `
                                    <div class="campo-admin-historical-audit-recent-item">
                                        <strong>${escapeHtml(formatAuditRecentRecord(record))}</strong>
                                        <span>${escapeHtml(record.equipoGuardia || 'Sin equipo')} · ${escapeHtml(record.locacionJornada || 'Sin locación')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </article>
                `).join('')}
            </section>
        </div>
    `;
}

function bindHistoricalAuditModalEvents() {
    if (!elements.historicalAuditModalBody) return;

    elements.historicalAuditModalBody.querySelectorAll('[data-historical-audit-close]').forEach(button => {
        button.addEventListener('click', closeHistoricalAuditModal);
    });

    const form = elements.historicalAuditModalBody.querySelector('#campo-admin-historical-audit-search');
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        state.historicalAuditSearch = String(formData.get('pozo') || '').trim();
        await loadHistoricalAudit();
    });

    elements.historicalAuditModalBody.querySelector('[data-historical-audit-reset]')?.addEventListener('click', async () => {
        state.historicalAuditSearch = '';
        await loadHistoricalAudit();
    });

    elements.historicalAuditModalBody.querySelector('[data-historical-audit-refresh]')?.addEventListener('click', async () => {
        await loadHistoricalAudit();
    });

    elements.historicalAuditModalBody.querySelectorAll('[data-historical-audit-delete]').forEach(button => {
        button.addEventListener('click', async () => {
            const pozo = String(button.dataset.historicalAuditDelete || '').trim();
            if (!pozo) return;
            await handleHistoricalAuditDelete(pozo);
        });
    });
}

function renderHistoricalAuditModal() {
    if (!elements.historicalAuditModalBody) return;
    elements.historicalAuditModalBody.innerHTML = buildHistoricalAuditModalMarkup();
    bindHistoricalAuditModalEvents();
}

async function loadHistoricalAudit() {
    state.historicalAuditLoading = true;
    renderHistoricalAuditModal();

    try {
        state.historicalAuditItems = await getHistoricalFieldReportAudit({
            pozo: state.historicalAuditSearch,
            limit: 20000
        });
    } catch (error) {
        console.error('Admin Campo historical audit error:', error);
        state.historicalAuditItems = [];
        await notify(error?.message || 'No se pudo auditar el histórico legacy de Campo.', 'error');
    } finally {
        state.historicalAuditLoading = false;
        renderHistoricalAuditModal();
    }
}

async function openHistoricalAuditModal() {
    if (!elements.historicalAuditModal || !elements.historicalAuditModalBody) return;
    openCampoAdminModal(elements.historicalAuditModal);
    renderHistoricalAuditModal();
    await loadHistoricalAudit();
}

async function confirmHistoricalAuditDelete(pozo, totalRecords = 0) {
    const message = `Se eliminarán ${totalRecords} registro(s) legacy del pozo ${pozo}. Esta acción no toca Monitoreo ni el workflow nuevo de jornadas.`;

    if (!window.Swal) {
        return window.confirm(message);
    }

    const result = await window.Swal.fire({
        icon: 'warning',
        title: 'Eliminar histórico legacy',
        text: message,
        showCancelButton: true,
        confirmButtonText: 'Eliminar del histórico',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b91c1c'
    });

    return result.isConfirmed;
}

async function handleHistoricalAuditDelete(pozo) {
    const target = state.historicalAuditItems.find(item => item.pozo === pozo);
    const totalRecords = Number(target?.totalRecords || 0);
    const confirmed = await confirmHistoricalAuditDelete(pozo, totalRecords);
    if (!confirmed) return;

    state.historicalAuditDeletingPozo = pozo;
    renderHistoricalAuditModal();

    try {
        const result = await deleteHistoricalFieldReportsByPozo(pozo);
        await notify(`Se eliminaron ${result.deletedCount || 0} registro(s) legacy de ${pozo}.`, 'success');
        await loadHistoricalAudit();
    } catch (error) {
        console.error('Admin Campo historical audit delete error:', error);
        await notify(error?.message || 'No se pudo eliminar el pozo del histórico legacy.', 'error');
    } finally {
        state.historicalAuditDeletingPozo = '';
        renderHistoricalAuditModal();
    }
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
    openCampoAdminModal(elements.historicalModal);
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

    openCampoAdminModal(elements.incidentModal);
    elements.incidentModalBody.innerHTML = `
        <div class="campo-admin-modal-head">
            <div>
                <span class="campo-admin-tag campo-admin-tag-soft">${ticket._local ? 'Ticket local' : 'Ticket enviado'}</span>
                <h3 id="campo-admin-incident-modal-title">${escapeHtml(ticket.subject || 'Incidencia sin asunto')}</h3>
                <p>${escapeHtml(formatDateTime(ticket.submitted_at || ticket.created_at))} · ${escapeHtml(getSubmitterLabel(ticket.submitted_by_email))}</p>
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

function buildOperationalStatusClass(status) {
    const normalized = String(status || '').replace(/[^A-Z]/gi, '').toUpperCase();
    if (['OFF', 'PARADAMANUAL', 'PARADO', 'PARADA', 'DETENIDO', 'INACTIVO'].includes(normalized)) {
        return 'campo-admin-operational-status is-off';
    }
    if (['RUN', 'RUNNING', 'OPERANDO', 'OPERATIVO', 'ACTIVO'].includes(normalized)) {
        return 'campo-admin-operational-status is-run';
    }
    return 'campo-admin-operational-status is-unknown';
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

function splitGuardTeam(value = '') {
    return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function getJourneyTechnicians(journey = {}, records = []) {
    const firstRecord = Array.isArray(records) ? records.find(Boolean) : null;
    const firstPayload = getRecordPayload(firstRecord);
    const guardTeam = splitGuardTeam(journey.equipo_guardia || firstPayload.equipo_guardia || '');
    const normalizeTechName = name => (/\bSAEN\b/i.test(name) && !/\bSAENZ\b/i.test(name)) ? String(name).replace(/\bSAEN\b/gi, 'SAENZ') : name;
    const tecnico1 = normalizeTechName(journey.tecnico_1 || firstPayload.tecnico_1 || guardTeam[0] || '');
    const tecnico2 = normalizeTechName(journey.tecnico_2 || firstPayload.tecnico_2 || guardTeam[1] || '');

    return {
        tecnico1,
        tecnico2,
        equipoGuardia: [tecnico1, tecnico2].filter(Boolean).join(', ') || normalizeTechName(journey.equipo_guardia || firstPayload.equipo_guardia || '')
    };
}

function getSubmitterLabel(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const profile = state.profilesMap[cleanEmail];
    if (profile) {
        const roleLabel = profile.role === 'campo' ? 'Téc' : 'Ing';
        const nameLabel = `${profile.nombre || ''} ${profile.apellido || ''}`.trim() || profile.email;
        return `${roleLabel}: ${nameLabel}`;
    }
    return `Ing: ${email}`;
}

function getAuditActorLabel(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const profile = state.profilesMap[cleanEmail];
    if (profile) {
        const roleLabel = profile.role === 'campo' ? 'Téc.' : profile.role === 'admin' ? 'Admin' : 'Ing.';
        const nameLabel = `${profile.nombre || ''} ${profile.apellido || ''}`.trim() || profile.email || cleanEmail;
        return `${roleLabel} ${nameLabel}`;
    }

    return cleanEmail ? `Ing. ${cleanEmail.split('@')[0]}` : 'Usuario no identificado';
}

function buildReviewLogDetailMarkup(item = {}) {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
    const pozo = metadata.pozo || metadata.updated_pozo || '';
    const actor = getAuditActorLabel(item.performed_by_email || item.created_by_email || item.created_by || '');
    const actionLabel = metadata.action === 'update_record' ? 'Actualizado por' : 'Registrado por';
    const changedLabels = [...new Set(changes.map(change => change.label || change.field).filter(Boolean))];

    if (!changes.length && !pozo) {
        return `<small>${escapeHtml(actionLabel)} ${escapeHtml(actor)}</small>`;
    }

    return `
        <div class="campo-admin-log-detail">
            <span>${escapeHtml(actionLabel)} ${escapeHtml(actor)}${pozo ? ` · Pozo ${escapeHtml(pozo)}` : ''}</span>
            ${changes.length ? `
                <div class="campo-admin-log-changed-fields">
                    <strong>Parámetros modificados</strong>
                    <p>${escapeHtml(changedLabels.join(', '))}</p>
                </div>
                <ul>
                    ${changes.slice(0, 8).map(change => `
                        <li><strong>${escapeHtml(change.label || change.field || 'Campo')}</strong>: ${escapeHtml(change.previous || '--')} → ${escapeHtml(change.next || '--')}</li>
                    `).join('')}
                </ul>
                ${changes.length > 8 ? `<em>+${escapeHtml(String(changes.length - 8))} cambio(s) adicional(es)</em>` : ''}
            ` : ''}
        </div>
    `;
}

function buildJourneyPulseTimelineMarkup(journey = {}, records = [], reviewLog = []) {
    const escapeHtmlLocal = (str) => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
    const timelineItems = [];

    // 1. Eventos de la bitácora oficial (field_journey_review_log)
    reviewLog.forEach(log => {
        const action = String(log.action || '').toLowerCase();
        let nodeClass = 'node-blue';
        let tagClass = 'tag-blue';
        let tagLabel = 'EVENTO';

        if (action === 'submitted') {
            nodeClass = 'node-blue';
            tagClass = 'tag-blue';
            tagLabel = 'RECEPCIÓN CAMPO';
        } else if (action === 'recovered') {
            nodeClass = 'node-amber';
            tagClass = 'tag-amber';
            tagLabel = 'RECUPERADO';
        } else if (action === 'updated') {
            nodeClass = 'node-blue';
            tagClass = 'tag-blue';
            tagLabel = 'RE-ENVIADO';
        } else if (action === 'split' || action === 'merge') {
            nodeClass = 'node-purple';
            tagClass = 'tag-purple';
            tagLabel = action === 'split' ? 'SEPARACIÓN' : 'FUSIÓN';
        } else if (['approved', 'published'].includes(action)) {
            nodeClass = 'node-emerald';
            tagClass = 'tag-emerald';
            tagLabel = action === 'published' ? 'PUBLICADO' : 'APROBADO';
        } else if (action === 'rejected') {
            nodeClass = 'node-red';
            tagClass = 'tag-red';
            tagLabel = 'RECHAZADO';
        } else if (action === 'file_added') {
            nodeClass = 'node-purple';
            tagClass = 'tag-purple';
            tagLabel = 'ARCHIVO ADJUNTO';
        } else if (action === 'commented') {
            const isRecordUpdate = (log.metadata?.action === 'update_record') || (log.comment && log.comment.includes('se modificó'));
            nodeClass = 'node-purple';
            tagClass = 'tag-purple';
            tagLabel = isRecordUpdate ? 'EDICIÓN ADMIN' : 'COMENTARIO';
        }

        const email = log.performed_by_email || log.created_by_email || '';
        const actor = getAuditActorLabel(email);
        const metadataObj = log.metadata || {};
        const pozos = Array.isArray(metadataObj.pozos) ? metadataObj.pozos : (Array.isArray(metadataObj.pozos_originales) ? metadataObj.pozos_originales : []);

        timelineItems.push({
            timestamp: new Date(log.created_at || Date.now()).getTime(),
            timeFormatted: formatDateTime(log.created_at),
            nodeClass,
            tagClass,
            tagLabel,
            title: log.action_label || normalizeReviewActionLabel(log.action),
            text: log.comment || 'Sin observación registrada.',
            user: email ? `${actor} (${email})` : actor,
            pozos
        });
    });

    // 2. Análisis Retrospectivo para jornadas pasadas o discrepancias de registros
    if (records.length > 0) {
        const headerTechs = [journey.tecnico_1, journey.tecnico_2, journey.equipo_guardia].filter(Boolean).map(t => String(t).toUpperCase());
        const recordTechMap = new Map();
        const nightPozoList = [];

        records.forEach(r => {
            const raw = r.raw_payload || {};
            const tech = String(raw.tecnico_1 || raw.tecnico_2 || raw.equipo_guardia || r.tecnico_1 || '').trim();
            if (tech) {
                recordTechMap.set(tech, (recordTechMap.get(tech) || 0) + 1);
            }
            const timeStr = String(r.report_time || raw.hora || '');
            const hour = parseInt(timeStr.split(':')[0], 10);
            if (!isNaN(hour)) {
                const isNightTime = hour >= 18 || hour < 6;
                const journeyShift = String(journey.jornada || '').toLowerCase();
                if (journeyShift.includes('diurna') && isNightTime) {
                    nightPozoList.push(`${r.pozo} (${timeStr})`);
                } else if (journeyShift.includes('nocturna') && !isNightTime) {
                    nightPozoList.push(`${r.pozo} (${timeStr})`);
                }
            }
        });

        const techEntries = Array.from(recordTechMap.entries());
        const diffTechs = techEntries.filter(([tech]) => headerTechs.length > 0 && !headerTechs.some(ht => ht.includes(tech.toUpperCase()) || tech.toUpperCase().includes(ht)));

        if (diffTechs.length > 0 || nightPozoList.length > 0) {
            let title = 'Discrepancias detectadas en registros';
            let techMessage = '';

            if (diffTechs.length > 0) {
                const techNames = techEntries.map(([t]) => t.trim()).filter(Boolean);
                if (techNames.length > 1) {
                    title = 'Cambio de guardia detectado';
                    techMessage = `• Se detectaron múltiples técnicos operando en la misma jornada: ${techEntries.map(([t, c]) => `${t} (${c} pozos)`).join(', ')}`;
                } else {
                    title = 'Trazabilidad de cuadrilla';
                    techMessage = `• Técnico en pozo difiere de la cuadrilla oficial: ${techEntries.map(([t, c]) => `${t} (${c} pozos)`).join(', ')}`;
                }
            }

            const textLines = [
                techMessage,
                nightPozoList.length > 0 ? `• Pozos reportados fuera del turno seleccionado (${journey.jornada}): ${nightPozoList.join(', ')}` : ''
            ].filter(Boolean);

            timelineItems.push({
                timestamp: new Date(journey.created_at || Date.now()).getTime() - 500,
                timeFormatted: 'Auditoría Retrospectiva',
                nodeClass: 'node-amber',
                tagClass: 'tag-amber',
                tagLabel: 'TRAZABILIDAD',
                title: title,
                text: textLines.join('\n'),
                user: 'Sistema de Auditoría UV',
                pozos: []
            });
        }
    }

    // 3. Evento inicial de recepción si no hay submitted en el historial
    if (timelineItems.length === 0 || !reviewLog.some(l => String(l.action).toLowerCase() === 'submitted')) {
        const pozoNames = records.map(r => String(r.pozo || '').toUpperCase()).filter(Boolean);
        timelineItems.push({
            timestamp: new Date(journey.created_at || Date.now()).getTime() - 1000,
            timeFormatted: formatDateTime(journey.created_at),
            nodeClass: 'node-blue',
            tagClass: 'tag-blue',
            tagLabel: 'RECEPCIÓN CAMPO',
            title: 'Jornada recibida en servidor',
            text: `Jornada recibida con ${records.length} pozo(s) cargados por la cuadrilla.`,
            user: journey.submitted_by_email || 'Cuadrilla de Campo',
            pozos: pozoNames
        });
    }

    // 4. Creación inicial de la jornada en base de datos
    if (journey.created_at) {
        const pozoNames = records.map(r => String(r.pozo || '').toUpperCase()).filter(Boolean);
        timelineItems.push({
            timestamp: new Date(journey.created_at).getTime() - 100000,
            timeFormatted: formatDateTime(journey.created_at),
            nodeClass: 'node-blue',
            tagClass: 'tag-blue',
            tagLabel: 'CREACIÓN JORNADA',
            title: 'Creación inicial de la Jornada',
            text: `Registro creado en el sistema para la fecha ${formatDate(journey.journey_date)} y turno ${journey.jornada || 'Diurna'}.`,
            user: journey.submitted_by_email || 'Cuadrilla de Campo',
            pozos: pozoNames
        });
    }

    // Ordenar cronológicamente descendente (lo más reciente arriba)
    timelineItems.sort((a, b) => b.timestamp - a.timestamp);

    const itemsMarkup = timelineItems.map(item => `
        <article class="journey-pulse-item">
            <div class="journey-pulse-node ${escapeHtmlLocal(item.nodeClass)}"></div>
            <div class="journey-pulse-card">
                <div class="journey-pulse-card-head">
                    <span class="journey-pulse-tag ${escapeHtmlLocal(item.tagClass)}">${escapeHtmlLocal(item.tagLabel)}</span>
                    <span class="journey-pulse-time">${escapeHtmlLocal(item.timeFormatted)}</span>
                </div>
                <h4 class="journey-pulse-title">${escapeHtmlLocal(item.title)}</h4>
                <p class="journey-pulse-text">${escapeHtmlLocal(item.text).replace(/\n/g, '<br>')}</p>
                ${item.user ? `<div class="journey-pulse-user">👤 <strong>Usuario:</strong> ${escapeHtmlLocal(item.user)}</div>` : ''}
                ${item.pozos && item.pozos.length > 0 ? `
                    <div class="journey-pulse-pozo-list">
                        ${item.pozos.slice(0, 12).map(p => `<span class="journey-pulse-pozo-pill">${escapeHtmlLocal(p)}</span>`).join('')}
                        ${item.pozos.length > 12 ? `<span class="journey-pulse-pozo-pill">+${item.pozos.length - 12} más</span>` : ''}
                    </div>
                ` : ''}
            </div>
        </article>
    `).join('');

    return `
        <div class="journey-pulse-container">
            <div class="journey-pulse-track">
                ${itemsMarkup}
            </div>
        </div>
    `;
}

function buildTechnicianTags(technicians = {}) {
    const tags = [
        ['Técnico 1', technicians.tecnico1],
        ['Técnico 2', technicians.tecnico2]
    ].filter(([, value]) => value);

    if (!tags.length) {
        return '<span class="campo-admin-tag">Equipo no informado</span>';
    }

    return tags.map(([label, value]) => `<span class="campo-admin-tag">${escapeHtml(label)}: ${escapeHtml(value)}</span>`).join('');
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
        iMotor: getRecordField(record, 'i_motor', 'corriente_motor'),
        tm: getRecordField(record, 'tm_f', 'tm'),
        lf: getRecordField(record, 'lf_psi', 'lf'),
        pip: getRecordField(record, 'pip_psi'),
        pd: getRecordField(record, 'pd_psi')
    };
}

function getRecordEditorValue(record, fieldName) {
    if (fieldName === 'fecha') return getRecordField(record, 'fecha', 'report_date');
    if (fieldName === 'hora') return getRecordField(record, 'hora', 'report_time');
    if (fieldName === 'tecnico_1' || fieldName === 'tecnico_2') {
        const directValue = getRecordField(record, fieldName);
        if (directValue) return directValue;
        const guardTeam = splitGuardTeam(getRecordField(record, 'equipo_guardia'));
        return fieldName === 'tecnico_1' ? guardTeam[0] || '' : guardTeam[1] || '';
    }
    return getRecordField(record, fieldName);
}

function getEditableRecord(record) {
    const payload = { ...getRecordPayload(record) };

    EDITOR_FIELD_NAMES.forEach(fieldName => {
        if (payload[fieldName] === undefined || payload[fieldName] === null || payload[fieldName] === '') {
            payload[fieldName] = getRecordEditorValue(record, fieldName);
        }
    });

    payload.equipo_guardia = [payload.tecnico_1, payload.tecnico_2].filter(Boolean).join(', ') || payload.equipo_guardia || '';
    payload.id = record?.id || '';
    return payload;
}

function normalizeReviewKey(payload = {}) {
    const pozo = String(payload.pozo || '').trim().toUpperCase();
    const fecha = String(payload.fecha || '').trim();
    const hora = formatTime(payload.hora || '');
    return [pozo, fecha, hora].join('|');
}

function isRecordDateInsideJourneyWindow(recordPayload = {}, journey = {}) {
    const journeyDate = parseDateOnly(journey?.journey_date);
    const recordDate = parseDateOnly(recordPayload.fecha);
    if (!journeyDate || !recordDate) return true;

    const diffDays = Math.round((recordDate.getTime() - journeyDate.getTime()) / 86400000);
    if (diffDays === 0) return true;

    const jornada = String(journey?.jornada || recordPayload.jornada || '').trim().toLowerCase();
    if (!jornada.includes('nocturna')) return false;

    const hour = getHourFromTime(recordPayload.hora);
    if (diffDays === -1) return hour === null || hour >= 16; // Tolerancia: permitir desde las 4:00 PM (16:00)
    if (diffDays === 1) return hour === null || hour < 9;   // Tolerancia: permitir hasta las 8:59 AM
    return false;
}

function parseDateOnly(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function getHourFromTime(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):\d{2}/);
    if (!match) return null;
    const hour = Number(match[1]);
    return Number.isFinite(hour) ? hour : null;
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
        if (fieldName === 'delta_presion_psi') return;
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue) && numericValue < 0) {
            critical.push(`${fieldName} no puede ser negativo.`);
        }
    });

    const hora = String(recordPayload.hora || '').trim();
    if (hora && !/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) {
        warnings.push('La hora no tiene el formato esperado HH:MM o HH:MM:SS.');
    }

    if (journey?.journey_date && recordPayload.fecha && !isRecordDateInsideJourneyWindow(recordPayload, journey)) {
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

function normalizeMetricNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const normalizedValue = typeof value === 'string' ? value.replace(',', '.') : value;
    const numericValue = Number(normalizedValue);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function formatAverageValue(metric = {}, suffix = '') {
    const value = metric?.value;
    if (value === undefined || value === null || value === '') return '--';

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return `${value}${suffix}`;

    const roundedValue = Math.round(numericValue * 10) / 10;
    return `${roundedValue}${suffix}`;
}

function formatDeltaValue(delta, suffix = '') {
    if (!Number.isFinite(delta)) return '';
    const roundedDelta = Math.round(delta * 10) / 10;
    const sign = roundedDelta > 0 ? '+' : '';
    return `${sign}${roundedDelta}${suffix}`;
}

function resolveAverageTone(currentValue, metric = {}, rule = {}) {
    const currentNumber = normalizeMetricNumber(currentValue);
    const averageNumber = normalizeMetricNumber(metric?.value);

    if (currentNumber === null || averageNumber === null) {
        return { tone: 'muted', label: 'Sin comparacion', deltaLabel: '' };
    }

    const delta = currentNumber - averageNumber;
    const absoluteDelta = Math.abs(delta);
    const pctDelta = averageNumber !== 0 ? (absoluteDelta / Math.abs(averageNumber)) * 100 : null;
    const isAlert = absoluteDelta >= (rule.alertAbs ?? Infinity) || (pctDelta !== null && pctDelta >= (rule.alertPct ?? Infinity));
    const isReview = absoluteDelta >= (rule.reviewAbs ?? Infinity) || (pctDelta !== null && pctDelta >= (rule.reviewPct ?? Infinity));

    if (isAlert) return { tone: 'alert', label: 'Alerta', deltaLabel: formatDeltaValue(delta) };
    if (isReview) return { tone: 'review', label: 'Revisar', deltaLabel: formatDeltaValue(delta) };
    return { tone: 'ok', label: 'Normal', deltaLabel: formatDeltaValue(delta) };
}

function buildAverageHint(currentValue, metric = {}, suffix = '', rule = {}) {
    const count = Number(metric?.count || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return {
            label: 'Promedio publicado',
            value: '--',
            countLabel: 'Sin data publicada',
            tone: 'muted'
        };
    }

    const comparison = resolveAverageTone(currentValue, metric, rule);
    const deltaLabel = comparison.deltaLabel ? ` · Dif. ${comparison.deltaLabel}${suffix}` : '';

    return {
        label: 'Promedio publicado',
        value: formatAverageValue(metric, suffix),
        countLabel: `${count} reg${deltaLabel} · ${comparison.label}`,
        tone: comparison.tone
    };
}

const RECORD_OPERATIONAL_KPI_FIELDS = [
    { key: 'frecuencia', label: 'FREC', valueKey: 'frecuencia', suffix: ' Hz' },
    { key: 'pip', label: 'PIP', valueKey: 'pip', suffix: ' psi' },
    { key: 'iMotor', label: 'I MOTOR', valueKey: 'iMotor', suffix: ' A' },
    { key: 'thp', label: 'THP', valueKey: 'thp', suffix: ' psi' },
    { key: 'tm', label: 'TM', valueKey: 'tm', suffix: ' F' }
];

function getRecordOperationalKpiComparisons(summary = {}) {
    const averagesByPozo = state.currentDetail?.publishedAveragesByPozo || {};
    const publishedAverages = averagesByPozo[summary.pozo]?.metrics || {};
    const alertRules = getKpiAverageAlertRules();

    return RECORD_OPERATIONAL_KPI_FIELDS.map(field => {
        const currentValue = summary[field.valueKey];
        const average = buildAverageHint(currentValue, publishedAverages[field.key], field.suffix, alertRules[field.key]);

        return {
            ...field,
            currentValue,
            currentLabel: formatFieldValue(currentValue, field.suffix),
            average
        };
    });
}

function buildRecordOperationalAverageAlertList(comparisons = []) {
    return comparisons
        .filter(item => ['alert', 'review'].includes(item.average?.tone))
        .map(item => `${item.label}: ${item.currentLabel} contra promedio ${item.average.value}. ${item.average.countLabel}.`);
}

function buildRecordOperationalAveragesMarkup(comparisons = []) {
    return `
        <details class="campo-admin-modal-section campo-admin-record-operational-panel" open>
            <summary>Promedios operativos</summary>
            <div class="campo-admin-record-operational-grid">
                ${comparisons.map(item => `
                    <article class="campo-admin-record-operational-card is-${escapeHtml(item.average?.tone || 'muted')}">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.currentLabel)}</strong>
                        <div>
                            <small>Promedio publicado</small>
                            <b>${escapeHtml(item.average?.value || '--')}</b>
                        </div>
                        <em>${escapeHtml(item.average?.countLabel || 'Sin data publicada')}</em>
                    </article>
                `).join('')}
            </div>
        </details>
    `;
}

function buildCompactMetric(label, value, average = null) {
    return `
        <div class="campo-admin-record-compact-metric">
            <span class="campo-admin-record-compact-metric-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            ${average ? `
                <div class="campo-admin-record-compact-metric-average is-${escapeHtml(average.tone || 'ok')}">
                    <span>${escapeHtml(average.label)}</span>
                    <b>${escapeHtml(average.value)}</b>
                    <small>${escapeHtml(average.countLabel)}</small>
                </div>
            ` : ''}
        </div>
    `;
}

function formatConfigValue(value) {
    return value === undefined || value === null || value === '' ? '' : String(value);
}

function buildAlertConfigModalMarkup() {
    const rules = getKpiAverageAlertRules();

    return `
        <div class="campo-admin-modal-head">
            <div>
                <span class="campo-admin-tag campo-admin-tag-soft">Matriz operativa</span>
                <h3 id="campo-admin-alert-config-modal-title">Ingeniería de alertas por pozo</h3>
                <p>Define cuándo una lectura de Campo se mantiene normal, pasa a revisión o exige alerta frente al promedio publicado del mismo pozo.</p>
            </div>
            <button type="button" class="campo-admin-modal-close" data-alert-config-close aria-label="Cerrar configuración">×</button>
        </div>

        <form id="campo-admin-alert-config-form" class="campo-admin-alert-config-form">
            <div class="campo-admin-alert-config-ops">
                <article>
                    <span>Referencia</span>
                    <strong>Promedio publicado</strong>
                    <p>Últimos registros válidos en Data para el mismo pozo.</p>
                </article>
                <article>
                    <span>Nivel amarillo</span>
                    <strong>Revisar</strong>
                    <p>La desviación amerita criterio técnico antes de publicar.</p>
                </article>
                <article>
                    <span>Nivel rojo</span>
                    <strong>Alerta</strong>
                    <p>La desviación debe quedar visible para decisión operativa.</p>
                </article>
            </div>
            <div class="campo-admin-alert-config-grid">
                ${KPI_ALERT_CONFIG_FIELDS.map(field => {
                    const rule = rules[field.key] || {};
                    return `
                        <article class="campo-admin-alert-config-card">
                            <div class="campo-admin-alert-config-card-head">
                                <span class="campo-admin-alert-config-code">${escapeHtml(field.label)}</span>
                                <div>
                                    <strong>${escapeHtml(field.help)}</strong>
                                    <small>Unidad base: ${escapeHtml(field.unit)}</small>
                                </div>
                            </div>
                            <div class="campo-admin-alert-config-inputs">
                                <div class="campo-admin-alert-config-threshold-row is-review">
                                    <span>Revisión</span>
                                    <label>
                                        <small>Diferencia ${escapeHtml(field.unit)}</small>
                                        <input type="number" min="0" step="0.1" name="${escapeHtml(field.key)}__reviewAbs" value="${escapeHtml(formatConfigValue(rule.reviewAbs))}">
                                    </label>
                                    <label>
                                        <small>Diferencia %</small>
                                        <input type="number" min="0" step="0.1" name="${escapeHtml(field.key)}__reviewPct" value="${escapeHtml(formatConfigValue(rule.reviewPct))}" placeholder="Opcional">
                                    </label>
                                </div>
                                <div class="campo-admin-alert-config-threshold-row is-alert">
                                    <span>Alerta</span>
                                    <label>
                                        <small>Diferencia ${escapeHtml(field.unit)}</small>
                                        <input type="number" min="0" step="0.1" name="${escapeHtml(field.key)}__alertAbs" value="${escapeHtml(formatConfigValue(rule.alertAbs))}">
                                    </label>
                                    <label>
                                        <small>Diferencia %</small>
                                        <input type="number" min="0" step="0.1" name="${escapeHtml(field.key)}__alertPct" value="${escapeHtml(formatConfigValue(rule.alertPct))}" placeholder="Opcional">
                                    </label>
                                </div>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
            <div class="campo-admin-modal-actions campo-admin-alert-config-actions">
                <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-alert-config-reset>Restaurar valores iniciales</button>
                <button type="button" class="campo-admin-action-btn campo-admin-action-btn-secondary" data-alert-config-close>Cancelar</button>
                <button type="submit" class="campo-admin-action-btn campo-admin-action-btn-primary">Guardar configuración</button>
            </div>
        </form>
    `;
}

function collectAlertConfigFormValues(form) {
    const formData = new FormData(form);
    const nextRules = {};

    KPI_ALERT_CONFIG_FIELDS.forEach(field => {
        nextRules[field.key] = {};
        ['reviewAbs', 'alertAbs', 'reviewPct', 'alertPct'].forEach(ruleKey => {
            const value = normalizeAlertRuleNumber(formData.get(`${field.key}__${ruleKey}`));
            if (value !== null) nextRules[field.key][ruleKey] = value;
        });
    });

    return nextRules;
}

function bindAlertConfigModalEvents() {
    if (!elements.alertConfigModalBody) return;

    elements.alertConfigModalBody.querySelectorAll('[data-alert-config-close]').forEach(button => {
        button.addEventListener('click', closeAlertConfigModal);
    });

    elements.alertConfigModalBody.querySelector('[data-alert-config-reset]')?.addEventListener('click', async () => {
        saveAlertRules(DEFAULT_KPI_AVERAGE_ALERT_RULES);
        elements.alertConfigModalBody.innerHTML = buildAlertConfigModalMarkup();
        bindAlertConfigModalEvents();
        if (state.currentDetail) await renderDetail(state.currentDetail);
        await notify('Alertas restauradas a los valores iniciales.', 'success');
    });

    elements.alertConfigModalBody.querySelector('#campo-admin-alert-config-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        saveAlertRules(collectAlertConfigFormValues(event.currentTarget));
        closeAlertConfigModal();
        if (state.currentDetail) await renderDetail(state.currentDetail);
        await notify('Configuración de alertas actualizada.', 'success');
    });
}

function openAlertConfigModal() {
    if (!elements.alertConfigModal || !elements.alertConfigModalBody) return;
    openCampoAdminModal(elements.alertConfigModal);
    elements.alertConfigModalBody.innerHTML = buildAlertConfigModalMarkup();
    bindAlertConfigModalEvents();
}

function buildRecordDiagnosticBadge(record) {
    const diagnostico = getRecordField(record, 'diagnostico');
    const observaciones = getRecordField(record, 'observaciones_pozo');
    const status = getRecordField(record, 'estatus') || '';
    const normalizedStatus = String(status).replace(/[^A-Z]/gi, '').toUpperCase();
    const isOff = ['OFF', 'PARADAMANUAL', 'PARADO', 'PARADA', 'DETENIDO', 'INACTIVO'].includes(normalizedStatus);

    const sourceText = diagnostico || observaciones || 'Sin falla reportada';
    const compactText = String(sourceText).trim().replace(/\s+/g, ' ');
    const finalText = compactText.length > 52 ? `${compactText.slice(0, 49)}...` : compactText;
    
    const isOffClass = isOff ? ' is-off' : '';
    return `<span class="campo-admin-diagnostic-pill${isOffClass}">${escapeHtml(finalText)}</span>`;
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
                            <span style="display:block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">Actual en dashboard</span>
                            <span style="display:block;font-size:14px;color:#0f172a;">${escapeHtml(formatPublicationValue(change.fieldName, change.previousValue))}</span>
                        </div>
                        <div style="padding:10px;border-radius:12px;background:rgba(236,253,245,0.95);">
                            <span style="display:block;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#047857;">Nuevo desde Campo</span>
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
                <p style="margin:0;color:#475569;line-height:1.5;">Aquí se compara lo actual del dashboard contra lo nuevo enviado desde Campo. Al confirmar, Campo reemplaza esos campos operativos.</p>
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

async function promptJourneyDateEdit(journey) {
    const currentDate = String(journey?.journey_date || '').slice(0, 10);
    if (!window.Swal) {
        const fallbackValue = window.prompt('Nueva fecha de la jornada (YYYY-MM-DD):', currentDate);
        return fallbackValue ? String(fallbackValue).trim() : '';
    }

    const result = await window.Swal.fire({
        icon: 'question',
        title: 'Editar fecha de jornada',
        html: `
            <div style="text-align:left;display:grid;gap:10px;">
                <p style="margin:0;color:#475569;font-weight:600;line-height:1.45;">Solo se actualiza la cabecera de la jornada. Las fechas de cada pozo no se modifican.</p>
                <label style="display:grid;gap:6px;font-weight:800;color:#0f172a;">
                    Fecha operativa de inicio
                    <input id="campo-admin-journey-date-input" type="date" class="swal2-input" value="${escapeHtml(currentDate)}" style="width:100%;margin:0;">
                </label>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar fecha',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0052cc',
        preConfirm: () => {
            const value = document.getElementById('campo-admin-journey-date-input')?.value || '';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                window.Swal.showValidationMessage('Indica una fecha valida.');
                return false;
            }
            return value;
        }
    });

    return result.isConfirmed ? result.value : '';
}

function isMergeSafeStatus(status) {
    return MERGE_SAFE_STATUSES.includes(String(status || '').trim().toLowerCase());
}

function isMergeCandidateJourney(targetJourney = {}, candidateJourney = {}) {
    if (!candidateJourney?.id || candidateJourney.id === targetJourney.id) return false;
    if (!isMergeSafeStatus(candidateJourney.status)) return false;

    const targetDate = String(targetJourney.journey_date || '').slice(0, 10);
    const candidateDate = String(candidateJourney.journey_date || '').slice(0, 10);
    const targetTurn = String(targetJourney.jornada || '').trim();
    const candidateTurn = String(candidateJourney.jornada || '').trim();

    return targetDate === candidateDate && targetTurn === candidateTurn;
}

function buildMergeCandidateMarkup(candidate) {
    const pozos = Array.isArray(candidate.pozoNames) && candidate.pozoNames.length
        ? candidate.pozoNames.slice(0, 8).join(', ')
        : 'Sin pozos visibles';

    return `
        <article style="border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:#ffffff;display:grid;gap:6px;">
            <strong style="color:#0f172a;font-size:0.92rem;">${escapeHtml(candidate.locacion_jornada || 'Jornada sin locación')}</strong>
            <span style="color:#475569;font-size:0.82rem;font-weight:700;">${escapeHtml(normalizeStatusLabel(candidate.status))} · ${escapeHtml(String(candidate.total_reports || 0))} pozo(s) · ${escapeHtml(candidate.equipo_guardia || 'Sin equipo')}</span>
            <small style="color:#64748b;line-height:1.4;">${escapeHtml(pozos)}</small>
        </article>
    `;
}

async function promptJourneyMergeSource(targetJourney) {
    const candidates = (await getAdminFieldJourneys({
        statuses: MERGE_SAFE_STATUSES,
        limit: 160
    })).filter(candidate => isMergeCandidateJourney(targetJourney, candidate));

    if (!candidates.length) {
        await notify('No encontré otra jornada pendiente del mismo día y turno para fusionar con esta.', 'info');
        return null;
    }

    if (!window.Swal) {
        const selectedId = window.prompt(`ID de jornada origen para fusionar:\n\n${candidates.map(item => `${item.id} - ${item.locacion_jornada || 'Sin locación'} (${item.total_reports || 0} pozos)`).join('\n')}`);
        return candidates.find(item => item.id === String(selectedId || '').trim()) || null;
    }

    const optionsMarkup = candidates.map((candidate, index) => `
        <option value="${escapeHtml(candidate.id)}" ${index === 0 ? 'selected' : ''}>
            ${escapeHtml(candidate.locacion_jornada || 'Sin locación')} · ${escapeHtml(String(candidate.total_reports || 0))} pozo(s) · ${escapeHtml(normalizeStatusLabel(candidate.status))}
        </option>
    `).join('');

    const result = await window.Swal.fire({
        icon: 'question',
        title: 'Fusionar jornada dividida',
        html: `
            <div style="text-align:left;display:grid;gap:14px;">
                <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px;padding:12px;color:#1e3a8a;font-weight:700;line-height:1.45;">
                    Destino: ${escapeHtml(targetJourney.locacion_jornada || 'Jornada seleccionada')} · ${escapeHtml(String(targetJourney.total_reports || 0))} pozo(s)
                </div>
                <label style="display:grid;gap:8px;color:#0f172a;font-weight:800;">
                    Jornada origen a fusionar
                    <select id="campo-admin-merge-source" class="swal2-select" style="width:100%;margin:0;">
                        ${optionsMarkup}
                    </select>
                </label>
                <div style="display:grid;gap:8px;max-height:260px;overflow:auto;padding-right:4px;">
                    ${candidates.map(buildMergeCandidateMarkup).join('')}
                </div>
                <p style="margin:0;color:#64748b;font-size:0.84rem;line-height:1.45;">
                    Se moverán solo pozos que no estén duplicados en el destino. Si hay duplicados, la jornada origen quedará en revisión para resolverlos manualmente.
                </p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Revisar fusión',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => document.getElementById('campo-admin-merge-source')?.value || ''
    });

    if (!result.isConfirmed || !result.value) return null;
    return candidates.find(item => item.id === result.value) || null;
}

async function confirmJourneyMerge(targetJourney, sourceJourney) {
    const text = `Se moverán los pozos no duplicados desde "${sourceJourney.locacion_jornada || 'jornada origen'}" hacia "${targetJourney.locacion_jornada || 'jornada destino'}". La jornada origen se archivará si no quedan conflictos.`;

    if (!window.Swal) {
        return window.confirm(text);
    }

    const result = await window.Swal.fire({
        icon: 'warning',
        title: 'Confirmar fusión segura',
        text,
        showCancelButton: true,
        confirmButtonText: 'Fusionar jornadas',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0f766e'
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
        lines.push('Hay bloqueos o faltantes en la jornada. ¿Deseas subir omitiendo estas advertencias?');
    }

    if (!window.Swal) {
        return window.confirm(lines.join('\n'));
    }

    const modalHtml = buildPublicationPreviewHtml(preview, reviewSummary, state.currentDetail?.records || []);
    const result = await window.Swal.fire({
        icon: reviewSummary.canPrepareUpload ? 'info' : 'warning',
        title: reviewSummary.canPrepareUpload ? 'Preparar subida operativa' : 'Subida con bloqueos / advertencias',
        html: modalHtml,
        width: 'min(1180px, calc(100vw - 32px))',
        customClass: {
            popup: 'campo-admin-upload-modal',
            htmlContainer: 'campo-admin-upload-modal-html'
        },
        showCancelButton: true,
        showConfirmButton: true,
        confirmButtonText: reviewSummary.canPrepareUpload ? 'Confirmar subida' : 'Subir omitiendo bloqueos',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: reviewSummary.canPrepareUpload ? '#0f766e' : '#d97706'
    });

    return result.isConfirmed;
}

function renderStats() {
    const total = state.journeys.length;
    const inReview = state.journeys.filter(journey => String(journey.status).toLowerCase() === 'under_review').length;
    const reports = state.journeys.reduce((sum, journey) => sum + Number(journey.total_reports || 0), 0);

    animateNumber(elements.visibleCount, total, { duration: 620, locale: false });
    animateNumber(elements.reviewCount, inReview, { duration: 620, locale: false });
    animateNumber(elements.reportCount, reports, { duration: 720, locale: false });
    elements.listCount.textContent = `${total} jornada${total === 1 ? '' : 's'}`;
}

function renderList() {
    // Buscar si hay coincidencias individuales de pozo si se ingresó un término de búsqueda
    let pozoMatches = [];
    if (state.searchTerm) {
        const searchKey = state.searchTerm.trim().toUpperCase();
        state.journeys.forEach(journey => {
            const matchingPozos = (journey.pozoNames || []).filter(name =>
                String(name).trim().toUpperCase().includes(searchKey)
            );
            matchingPozos.forEach(pozoName => {
                pozoMatches.push({
                    pozo: pozoName,
                    journey: journey
                });
            });
        });
        // Ordenar las coincidencias de pozo por fecha descendente
        pozoMatches.sort((a, b) => b.journey.journey_date.localeCompare(a.journey.journey_date));
    }

    // Si se buscó un pozo y hay coincidencias, mostramos el listado a nivel de pozo individual
    if (state.searchTerm && pozoMatches.length > 0) {
        elements.list.innerHTML = pozoMatches.map(match => {
            const isSelected = match.journey.id === state.selectedJourneyId;
            
            const getAuditLabel = (email, labelPrefix) => {
                const cleanEmail = String(email || '').trim().toLowerCase();
                const profile = state.profilesMap[cleanEmail];
                if (profile) {
                    const title = profile.role === 'campo' ? 'Téc.' : 'Ing.';
                    const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
                    return ` · ${labelPrefix}: ${title} ${fullName}`;
                }
                return ` · ${labelPrefix}: Ing. ${cleanEmail.split('@')[0]}`;
            };

            const publisherLabel = (match.journey.status === 'published' && match.journey.published_by_email)
                ? getAuditLabel(match.journey.published_by_email, 'Publicada')
                : (match.journey.status === 'approved' && match.journey.reviewed_by_email)
                    ? getAuditLabel(match.journey.reviewed_by_email, 'Aprobada')
                    : '';
            return `
                <button type="button" class="campo-admin-ticket${isSelected ? ' is-selected' : ''}" data-pozo-match-name="${escapeHtml(match.pozo)}" data-journey-id="${escapeHtml(match.journey.id)}">
                    <div class="campo-admin-ticket-row-header">
                        <span class="campo-admin-ticket-loc">
                            <svg class="ticket-icon" viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 44 L42 44 M32 44 L32 18 M26 44 L32 18 L38 44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                                <g>
                                    <circle cx="12" cy="38" r="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4" />
                                    <g>
                                        <rect x="10" y="32" width="4" height="12" rx="2" fill="currentColor" stroke="none" />
                                        <circle cx="12" cy="38" r="1.5" fill="#f0fdfa" stroke="none" />
                                    </g>
                                </g>
                                <g>
                                    <path d="M8 16 L52 16 L52 20 L8 20 Z" fill="currentColor" stroke="none" />
                                    <path d="M52 14 L58 14 C63 14 64 20 64 34 C64 35 62 35 61 34 L52 20 Z" fill="currentColor" stroke="none" />
                                    <line x1="62" y1="34" x2="62" y2="46" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.5,1.5" />
                                    <line x1="12" y1="20" x2="12" y2="34" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                                    <circle cx="32" cy="18" r="2.8" fill="#f0fdfa" stroke="currentColor" stroke-width="1" />
                                </g>
                            </svg>
                            Pozo: ${escapeHtml(match.pozo)}
                        </span>
                        <span class="${buildStatusClass(match.journey.status)}">${escapeHtml(normalizeStatusLabel(match.journey.status))}</span>
                    </div>
                    
                    <div class="campo-admin-ticket-row-crew crew-names-container">
                        <svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        <div class="crew-names-wrapper">
                            <span class="crew-names">Jornada: ${escapeHtml(match.journey.locacion_jornada || 'Sin locación')}</span>
                        </div>
                    </div>
                    
                    <div class="campo-admin-ticket-row-footer">
                        <div class="footer-meta-left">
                            <span class="date-text">
                                <svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                ${escapeHtml(formatDate(match.journey.journey_date))}
                            </span>
                        </div>
                        <div class="footer-meta-right">
                            <span class="well-count-pill accent">Editar pozo</span>
                        </div>
                    </div>

                    <div class="campo-admin-ticket-row-submitter">
                        <span class="submitter-label">${escapeHtml(getSubmitterLabel(match.journey.submitted_by_email))}${escapeHtml(publisherLabel)}</span>
                    </div>
                </button>
            `;
        }).join('');

        elements.list.querySelectorAll('[data-journey-id]').forEach(button => {
            button.addEventListener('click', async () => {
                const { journeyId, pozoMatchName } = button.dataset;
                if (!journeyId) return;
                state.autoEditPozoName = pozoMatchName;
                await selectJourney(journeyId);
            });
        });
        applyCrewMarquees();
        return;
    }

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
        const technicians = getJourneyTechnicians(journey);
        
        const getAuditLabel = (email, labelPrefix) => {
            const cleanEmail = String(email || '').trim().toLowerCase();
            const profile = state.profilesMap[cleanEmail];
            if (profile) {
                const title = profile.role === 'campo' ? 'Téc.' : 'Ing.';
                const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
                return ` · ${labelPrefix}: ${title} ${fullName}`;
            }
            return ` · ${labelPrefix}: Ing. ${cleanEmail.split('@')[0]}`;
        };

        const publisherLabel = (journey.status === 'published' && journey.published_by_email)
            ? getAuditLabel(journey.published_by_email, 'Publicada')
            : (journey.status === 'approved' && journey.reviewed_by_email)
                ? getAuditLabel(journey.reviewed_by_email, 'Aprobada')
                : '';

        const isDayShift = journey.jornada && String(journey.jornada).toLowerCase() === 'diurna';
        const shiftIcon = isDayShift
            ? `<svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
            : `<svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

        return `
            <button type="button" class="campo-admin-ticket${isSelected ? ' is-selected' : ''}" data-journey-id="${escapeHtml(journey.id)}">
                <div class="campo-admin-ticket-row-header">
                    <span class="campo-admin-ticket-loc">
                        <svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${escapeHtml(journey.locacion_jornada || 'Sin locación')}
                    </span>
                    <span class="${buildStatusClass(journey.status)}">${escapeHtml(normalizeStatusLabel(journey.status))}</span>
                </div>
                
                <div class="campo-admin-ticket-row-crew crew-names-container">
                    <svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <div class="crew-names-wrapper">
                        <span class="crew-names" title="${escapeHtml(technicians.equipoGuardia)}">${escapeHtml(technicians.equipoGuardia || 'Equipo no informado')}</span>
                    </div>
                </div>
                
                <div class="campo-admin-ticket-row-footer">
                    <div class="footer-meta-left">
                        <span class="shift-badge shift-${String(journey.jornada || 'day').toLowerCase()}">
                            ${shiftIcon} ${escapeHtml(journey.jornada || 'Diurna')}
                        </span>
                        <span class="date-text">
                            <svg class="ticket-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${escapeHtml(formatDate(journey.journey_date))}
                        </span>
                    </div>
                        <span class="well-count-pill">
                            <svg class="ticket-icon" viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 44 L42 44 M32 44 L32 18 M26 44 L32 18 L38 44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                                <g>
                                    <circle cx="12" cy="38" r="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4" />
                                    <g>
                                        <rect x="10" y="32" width="4" height="12" rx="2" fill="currentColor" stroke="none" />
                                        <circle cx="12" cy="38" r="1.5" fill="#f0fdfa" stroke="none" />
                                    </g>
                                </g>
                                <g>
                                    <path d="M8 16 L52 16 L52 20 L8 20 Z" fill="currentColor" stroke="none" />
                                    <path d="M52 14 L58 14 C63 14 64 20 64 34 C64 35 62 35 61 34 L52 20 Z" fill="currentColor" stroke="none" />
                                    <line x1="62" y1="34" x2="62" y2="46" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.5,1.5" />
                                    <line x1="12" y1="20" x2="12" y2="34" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                                    <circle cx="32" cy="18" r="2.8" fill="#f0fdfa" stroke="currentColor" stroke-width="1" />
                                </g>
                            </svg>
                            ${escapeHtml(String(journey.total_reports || 0))} pozo(s)
                        </span>
                </div>

                <div class="campo-admin-ticket-row-submitter">
                    <span class="submitter-label">${escapeHtml(getSubmitterLabel(journey.submitted_by_email))}${escapeHtml(publisherLabel)}</span>
                </div>
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

    applyCrewMarquees();
}

function applyCrewMarquees() {
    const wrappers = document.querySelectorAll('.crew-names-wrapper');
    wrappers.forEach(wrapper => {
        const textSpan = wrapper.querySelector('.crew-names');
        if (!textSpan) return;
        
        // Reset state
        textSpan.classList.remove('animate-marquee');
        textSpan.style.removeProperty('--scroll-dist');
        
        // requestAnimationFrame yields clean layout sizes
        requestAnimationFrame(() => {
            const scrollW = textSpan.scrollWidth;
            const clientW = wrapper.clientWidth;
            
            if (scrollW > clientW) {
                const scrollDist = clientW - scrollW - 16; // Leaving 16px safe spacing at the end
                textSpan.style.setProperty('--scroll-dist', `${scrollDist}px`);
                textSpan.classList.add('animate-marquee');
            }
        });
    });
}

function closeRecordModal() {
    state.selectedRecordId = '';
    state.recordPanelMode = 'view';
    state.recordSaving = false;

    if (elements.recordModal) {
        closeCampoAdminModal(elements.recordModal);
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

function checkUnsavedChangesAndConfirm(onConfirm) {
    if (state.recordPanelMode !== 'edit') {
        onConfirm();
        return;
    }

    const form = document.getElementById('campo-admin-record-form');
    if (!form) {
        onConfirm();
        return;
    }

    const original = getEditableRecord(getSelectedRecord());
    const formData = new FormData(form);
    let changed = false;

    for (const fieldName of EDITOR_FIELD_NAMES) {
        const currentVal = String(formData.get(fieldName) ?? '').trim();
        const originalVal = String(original[fieldName] ?? '').trim();
        if (currentVal !== originalVal) {
            changed = true;
            break;
        }
    }

    if (changed) {
        if (window.Swal) {
            window.Swal.fire({
                icon: 'warning',
                title: 'Cambios sin guardar',
                text: 'Tienes modificaciones pendientes en este pozo. ¿Deseas descartar los cambios?',
                showCancelButton: true,
                confirmButtonText: 'Sí, descartar',
                cancelButtonText: 'Seguir editando',
                confirmButtonColor: '#b91c1c'
            }).then(result => {
                if (result.isConfirmed) {
                    onConfirm();
                }
            });
        } else {
            if (confirm('Tienes cambios sin guardar. ¿Deseas descartarlos?')) {
                onConfirm();
            }
        }
    } else {
        onConfirm();
    }
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
    const operationalKpiComparisons = getRecordOperationalKpiComparisons(summary);
    const operationalKpiAlerts = buildRecordOperationalAverageAlertList(operationalKpiComparisons);
    const modalReview = {
        ...review,
        warnings: [...review.warnings, ...operationalKpiAlerts],
        tone: review.tone === 'blocked' ? 'blocked' : operationalKpiAlerts.length || review.warnings.length ? 'warning' : review.tone,
        label: review.tone === 'blocked' ? review.label : operationalKpiAlerts.length || review.warnings.length ? 'Con alerta' : review.label
    };
    const isEditing = state.recordPanelMode === 'edit';

    openCampoAdminModal(elements.recordModal);
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
            <span class="${getReviewToneClass(modalReview.tone)}">${escapeHtml(modalReview.label)}</span>
            <span class="campo-admin-tag">${escapeHtml(getRecordField(record, 'actividad') || 'Sin actividad')}</span>
            <span class="campo-admin-tag">${escapeHtml(getRecordField(record, 'estatus') || 'Sin estatus')}</span>
        </div>
        <section class="campo-admin-modal-review-panel">
            <article>
                <strong>Bloqueos</strong>
                <ul>${buildReviewIssueList(modalReview.critical)}</ul>
            </article>
            <article>
                <strong>Alertas</strong>
                <ul>${buildReviewIssueList(modalReview.warnings)}</ul>
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
            ${buildRecordOperationalAveragesMarkup(operationalKpiComparisons)}
            <div class="campo-admin-modal-sections">${buildRecordPreviewSections(recordPayload)}</div>
            <div class="campo-admin-modal-actions">
                <button type="button" class="campo-admin-action-btn campo-admin-action-btn-ghost" data-record-modal-close>Cerrar</button>
                ${state.accessProfile?.isReadOnly ? '' : `<button type="button" class="campo-admin-action-btn" data-record-mode="edit">Editar pozo</button>`}
            </div>
        `}
    `;

    elements.recordModalBody.querySelectorAll('[data-record-modal-close]').forEach(button => {
        button.addEventListener('click', () => {
            checkUnsavedChangesAndConfirm(closeRecordModal);
        });
    });

    elements.recordModalBody.querySelector('[data-record-mode="edit"]')?.addEventListener('click', () => {
        state.recordPanelMode = 'edit';
        renderRecordModal();
    });

    elements.recordModalBody.querySelector('[data-record-mode="view"]')?.addEventListener('click', () => {
        checkUnsavedChangesAndConfirm(() => {
            state.recordPanelMode = 'view';
            renderRecordModal();
        });
    });

    const form = elements.recordModalBody.querySelector('#campo-admin-record-form');
    if (form) {
        form.addEventListener('submit', handleRecordFormSubmit);
        form.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', () => attachRealTimeCalculations(form));
        });
    }
}

function buildUpdatedRecordPayload(form) {
    const currentRecord = getSelectedRecord();
    const basePayload = currentRecord ? getEditableRecord(currentRecord) : {};
    const formData = new FormData(form);

    EDITOR_FIELD_NAMES.forEach(fieldName => {
        basePayload[fieldName] = String(formData.get(fieldName) ?? '').trim();
    });

    basePayload.equipo_guardia = [basePayload.tecnico_1, basePayload.tecnico_2].filter(Boolean).join(', ') || basePayload.equipo_guardia || '';

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
            reviewAction: 'under_review'
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

async function confirmDeleteRecord(recordId) {
    if (!window.Swal) {
        if (!window.confirm('¿Eliminar este pozo de la jornada?')) return;
    } else {
        const result = await window.Swal.fire({
            icon: 'warning',
            title: 'Eliminar pozo',
            text: 'Se eliminará este pozo de la revisión de la jornada. Si la jornada está publicada, también se eliminará de Data y Consolidado. Esta acción no se puede deshacer.',
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#b91c1c'
        });
        if (!result.isConfirmed) return;
    }

    try {
        setActionButtonsBusy(true);
        await deleteAdminFieldJourneyRecord(recordId);
        await loadJourneys();
        if (state.selectedJourneyId) {
            await selectJourney(state.selectedJourneyId, { keepList: true });
        }
        await notify('Pozo eliminado correctamente.', 'success');
    } catch (error) {
        console.error('Admin Campo delete record error:', error);
        await notify(error?.message || 'No se pudo eliminar el pozo.', 'error');
    } finally {
        setActionButtonsBusy(false);
    }
}

function attachRealTimeCalculations(form) {
    if (!form) return;

    const getVal = (name) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (!el) return NaN;
        const v = parseFloat(el.value);
        return v;
    };
    const setVal = (name, val) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) el.value = val;
    };
    const fmt1 = (n) => Number.isInteger(n) ? n.toString() : n.toFixed(1);
    const fmt2 = (n) => Number.isInteger(n) ? n.toString() : n.toFixed(2);

    function calcGroup(srcA, srcB, srcC, targets) {
        const a = getVal(srcA), b = getVal(srcB), c = getVal(srcC);
        if (isNaN(a) || isNaN(b) || isNaN(c) || (a === 0 && b === 0 && c === 0)) {
            [targets.avg, ...targets.devs, targets.maxDev, targets.unbal].forEach(n => setVal(n, ''));
            return;
        }
        const avg = (a + b + c) / 3;
        const dA = Math.abs(a - avg), dB = Math.abs(b - avg), dC = Math.abs(c - avg);
        const maxD = Math.max(dA, dB, dC);
        const unb = avg > 0 ? (maxD / avg) * 100 : 0;
        setVal(targets.avg, fmt1(avg));
        setVal(targets.devs[0], fmt1(dA));
        setVal(targets.devs[1], fmt1(dB));
        setVal(targets.devs[2], fmt1(dC));
        setVal(targets.maxDev, fmt1(maxD));
        setVal(targets.unbal, fmt2(unb));
    }

    // 1. VSD Currents (I VSD A/B/C)
    calcGroup('i_vsd_a', 'i_vsd_b', 'i_vsd_c', {
        avg: 'prom_i_vsd', devs: ['desv_fase_a', 'desv_fase_b', 'desv_fase_c'],
        maxDev: 'max_desviacion_vsd', unbal: 'desbalance_corriente_vsd'
    });

    // 2. Primary Fase-Fase Voltage
    calcGroup('ff_x1_x2_v', 'ff_x2_x3_v', 'ff_x3_x1_v', {
        avg: 'promedio_fase_fase', devs: ['desv_ff_x1_x2', 'desv_ff_x2_x3', 'desv_ff_x3_x1'],
        maxDev: 'max_desviacion_ff', unbal: 'desbalance_fase_fase'
    });

    // 3. Primary Fase-Tierra Voltage
    calcGroup('ft_x1_tierra_v', 'ft_x2_tierra_v', 'ft_x3_tierra_v', {
        avg: 'promedio_fase_tierra', devs: ['desv_ft_x1_tierra', 'desv_ft_x2_tierra', 'desv_ft_x3_tierra'],
        maxDev: 'max_desviacion_ft', unbal: 'desbalance_fase_tierra'
    });

    // 4. Primary Current
    calcGroup('corriente_x1_x2_amp', 'corriente_x2_x3_amp', 'corriente_x3_x1_amp', {
        avg: 'promedio_corriente_primaria', devs: ['desv_corriente_x1_x2', 'desv_corriente_x2_x3', 'desv_corriente_x3_x1'],
        maxDev: 'max_desviacion_corriente_primaria', unbal: 'desbalance_corriente_primaria'
    });

    // 5. Secondary Fase-Fase Voltage
    calcGroup('sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v', {
        avg: 'sec_promedio_fase_fase', devs: ['sec_desv_ff_h1_h2', 'sec_desv_ff_h2_h3', 'sec_desv_ff_h3_h1'],
        maxDev: 'sec_max_desviacion_ff', unbal: 'sec_desbalance_fase_fase'
    });

    // 6. Secondary Fase-Tierra Voltage
    calcGroup('sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v', {
        avg: 'sec_promedio_fase_tierra', devs: ['sec_desv_ft_h1_h2', 'sec_desv_ft_h2_h3', 'sec_desv_ft_h3_h1'],
        maxDev: 'sec_max_desviacion_ft', unbal: 'sec_desbalance_fase_tierra'
    });

    // 7. Secondary Current
    calcGroup('corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp', {
        avg: 'sec_promedio_corriente', devs: ['sec_desv_corriente_h1_h2', 'sec_desv_corriente_h2_h3', 'sec_desv_corriente_h3_h1'],
        maxDev: 'sec_max_desviacion_corriente', unbal: 'desbalance_corriente_secundaria'
    });
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
            `Omitidos: ${publicationResult.skipped || 0}`,
            publicationResult.consolidatedError
                ? `Consolidado: pendiente (${publicationResult.consolidatedError})`
                : `Consolidado: ${publicationResult.consolidatedSaved || 0} filas agregadas`
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
    if (elements.sidebarIncidentsPanel) {
        elements.sidebarIncidentsPanel.hidden = true;
    }
}

async function renderDetail(detail) {
    closeRecordModal();
    closeIncidentModal();

    const { journey, records, reviewLog, publishedAveragesByPozo = {} } = detail;
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
    const isDraftJourney = journey.status === 'draft';
    const technicians = getJourneyTechnicians(journey, records);
    const reviewSummary = summarizeJourneyReview(records, journey);
    const alertRules = getKpiAverageAlertRules();
    const recordsMarkup = records.length > 0
        ? records.map((record, index) => {
            const summary = getRecordSummary(record);
            const publishedAverages = publishedAveragesByPozo[summary.pozo]?.metrics || {};
            const review = reviewSummary.byRecord.get(record.id) || { tone: 'warning', label: 'Con alerta' };
            const recordPosition = `${index + 1} de ${records.length}`;
            const recordStatus = getRecordField(record, 'estatus') || 'Sin estatus';

            const rowActionsMarkup = (isDraftJourney || state.accessProfile?.isReadOnly)
                ? `
                    ${buildRecordDiagnosticBadge(record)}
                    <button type="button" class="campo-admin-inline-btn" data-record-open="${escapeHtml(record.id)}">Ver parámetros</button>
                `
                : `
                    ${buildRecordDiagnosticBadge(record)}
                    <button type="button" class="campo-admin-inline-btn" data-record-open="${escapeHtml(record.id)}">Ver parámetros</button>
                    <button type="button" class="campo-admin-inline-btn campo-admin-inline-btn-strong" data-record-edit="${escapeHtml(record.id)}">Editar</button>
                    <button type="button" class="campo-admin-inline-btn" style="color:#b91c1c;border-color:rgba(185,28,28,0.2);background:rgba(185,28,28,0.05);" data-record-delete="${escapeHtml(record.id)}">Eliminar</button>
                `;

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
                                <span class="${buildOperationalStatusClass(recordStatus)}">${escapeHtml(recordStatus)}</span>
                                <span class="${getReviewToneClass(review.tone)}">${escapeHtml(review.label)}</span>
                            </div>
                        </div>
                        <div class="campo-admin-record-row-metrics">
                            ${buildCompactMetric('FREC', formatFieldValue(summary.frecuencia, ' Hz'), buildAverageHint(summary.frecuencia, publishedAverages.frecuencia, ' Hz', alertRules.frecuencia))}
                            ${buildCompactMetric('PIP', formatFieldValue(summary.pip, ' psi'), buildAverageHint(summary.pip, publishedAverages.pip, ' psi', alertRules.pip))}
                            ${buildCompactMetric('I MOTOR', formatFieldValue(summary.iMotor, ' A'), buildAverageHint(summary.iMotor, publishedAverages.iMotor, ' A', alertRules.iMotor))}
                            ${buildCompactMetric('THP', formatFieldValue(summary.thp, ' psi'), buildAverageHint(summary.thp, publishedAverages.thp, ' psi', alertRules.thp))}
                            ${buildCompactMetric('TM', formatFieldValue(summary.tm, ' F'), buildAverageHint(summary.tm, publishedAverages.tm, ' F', alertRules.tm))}
                        </div>
                    </div>
                    <div class="campo-admin-record-row-actions">
                        ${rowActionsMarkup}
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
                ${buildReviewLogDetailMarkup(item)}
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

    const journeyActionsSectionMarkup = isDraftJourney
        ? `
            <div style="padding: 16px 20px; border-radius: 16px; background: linear-gradient(135deg, rgba(236, 253, 245, 0.95), rgba(255, 255, 255, 0.98)); border: 1px solid rgba(167, 243, 208, 0.9); display: flex; align-items: center; gap: 12px; color: #047857; margin-top: 10px;">
                <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#10b981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.5); flex-shrink:0;"></span>
                <span style="font-size: 0.88rem; font-weight: 700;">
                    ${state.accessProfile?.isReadOnly 
                        ? '📡 Monitoreo en Vivo de Jornada en Curso: Estás visualizando los parámetros operativos reportados en tiempo real por la cuadrilla en Campo.'
                        : '📡 Monitoreo en Vivo de Jornada en Curso: Las acciones de edición de pozos, exportación Excel/PDF y transmisión al Dashboard se habilitarán en cuanto la cuadrilla envíe la jornada desde Campo.'
                    }
                </span>
            </div>
          `
        : `
            <div class="campo-admin-actions-section">
                <h3 class="campo-admin-actions-title">Acciones de la Jornada</h3>
                <div class="campo-admin-actions-grid-v2">
                    <button type="button" class="campo-admin-action-card-btn-v2" data-detail-action="review-publication">
                        <div class="action-card-icon-v2 cloud-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/>
                            </svg>
                        </div>
                        <div class="action-card-label-v2">Preparar subida</div>
                    </button>
                    <button type="button" class="campo-admin-action-card-btn-v2" data-detail-action="excel">
                        <div class="action-card-icon-v2 excel-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <div class="action-card-label-v2">Excel consolidado</div>
                    </button>
                    <button type="button" class="campo-admin-action-card-btn-v2" data-detail-action="pdf">
                        <div class="action-card-icon-v2 pdf-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5-3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <div class="action-card-label-v2">PDF consolidado</div>
                    </button>
                    <button type="button" class="campo-admin-action-card-btn-v2" data-detail-action="merge-journey">
                        <div class="action-card-icon-v2 merge-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h6a4 4 0 0 1 4 4v6"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14 14 3 3 3-3"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 7h-6a4 4 0 0 0-4 4v6"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" d="m10 14-3 3-3-3"></path>
                            </svg>
                        </div>
                        <div class="action-card-label-v2">Fusionar jornadas</div>
                    </button>
                    <button type="button" class="campo-admin-action-card-btn-v2 action-danger-v2" data-detail-action="delete">
                        <div class="action-card-icon-v2 delete-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.34 9m-4.72 0l-.34-9m11.13-2.87c.048-.655-.38-1.228-1.025-1.228h-.064M18.75 7.5a2.25 2.25 0 00-2.25-2.25h-9a2.25 2.25 0 00-2.25 2.25m12 0V18a2.25 2.25 0 01-2.25 2.25h-9A2.25 2.25 0 015.75 18V7.5m12.456-2.87a48.574 48.574 0 00-3.456-.135m-9.3 0c1.139-.082 2.29-.135 3.456-.135m0 0V4.5a2.25 2.25 0 00-2.25-2.25h-3a2.25 2.25 0 00-2.25 2.25v.38m9 0V4.5M10.5 8.25h.008v.008H10.5V8.25z" />
                            </svg>
                        </div>
                        <div class="action-card-label-v2">Eliminar jornada</div>
                    </button>
                </div>
            </div>
          `;

    const pulseTimelineHtml = buildJourneyPulseTimelineMarkup(journey, records, reviewLog);

    elements.detailShell.innerHTML = `
        <section class="campo-admin-panel">
            <div class="campo-admin-detail-head">
                <div class="campo-admin-detail-title-block">
                    <div class="campo-admin-ticket-top">
                        <span class="${buildStatusClass(journey.status)}">${escapeHtml(normalizeStatusLabel(journey.status))}</span>
                        <span class="campo-admin-tag campo-admin-tag-soft">Recibida ${escapeHtml(formatDateTime(journey.created_at))}</span>
                    </div>
                    <h2>${escapeHtml(journey.locacion_jornada || 'Jornada sin locación')}</h2>
                </div>
            </div>
            <div class="campo-admin-detail-metadata-grid-v2">
                <div class="metadata-card-v2">
                    <span class="metadata-card-label-v2">Equipo de Guardia</span>
                    <strong class="metadata-card-value-v2">${escapeHtml(technicians.equipoGuardia || 'Sin personal asignado')}</strong>
                </div>
                <div class="metadata-card-v2">
                    <span class="metadata-card-label-v2">Turno y Fecha</span>
                    <strong class="metadata-card-value-v2">${escapeHtml(journey.jornada || 'No especificada')} · ${escapeHtml(formatDate(journey.journey_date))}</strong>
                    ${state.accessProfile?.canViewManagement ? `<button type="button" class="campo-admin-inline-btn" style="margin-top:8px;justify-content:center;" data-detail-action="edit-journey-date">Editar fecha</button>` : ''}
                </div>
                <div class="metadata-card-v2">
                    <span class="metadata-card-label-v2">Responsable de Envío</span>
                    <strong class="metadata-card-value-v2">${escapeHtml(getSubmitterLabel(journey.submitted_by_email))}</strong>
                </div>
                <div class="metadata-card-v2">
                    <span class="metadata-card-label-v2">Ventana y Pozos</span>
                    <strong class="metadata-card-value-v2">${escapeHtml(summarizeJourneyWindow(journey))} · ${escapeHtml(String(journey.total_reports || 0))} pozo(s)</strong>
                </div>
                ${journey.reviewed_by_email ? `
                    <div class="metadata-card-v2">
                        <span class="metadata-card-label-v2">Revisado por</span>
                        <strong class="metadata-card-value-v2">${escapeHtml(getSubmitterLabel(journey.reviewed_by_email))}</strong>
                    </div>
                ` : ''}
                ${journey.published_by_email ? `
                    <div class="metadata-card-v2">
                        <span class="metadata-card-label-v2">Publicado por</span>
                        <strong class="metadata-card-value-v2">${escapeHtml(getSubmitterLabel(journey.published_by_email))}</strong>
                    </div>
                ` : ''}
            </div>
            ${journeyActionsSectionMarkup}
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
    `;

    let echometerDocs = [];
    let sensorDocs = [];
    let vsdDocs = [];
    let soportesDocs = [];

    try {
        const journeyIdStr = String(journey.id || '');
        if (journeyIdStr) {
            const { data: allDocs, error: docsError } = await supabase
                .from('well_historical_documents')
                .select('*')
                .like('descripcion', `%[JORNADA_ID:${journeyIdStr}]%`);

            if (docsError) throw docsError;

            if (allDocs && allDocs.length > 0) {
                echometerDocs = allDocs.filter(d => d.categoria === 'REGISTROS_ECHOMETER');
                sensorDocs = allDocs.filter(d => d.categoria === 'DATA_SENSOR_FONDO');
                vsdDocs = allDocs.filter(d => d.categoria === 'VOLCADOS_VSD');
                soportesDocs = allDocs.filter(d => d.categoria === 'SOPORTES');

                // Pre-fetch signed download URLs for image thumbnails in admin sidebar
                await Promise.all(soportesDocs.map(async (doc) => {
                    if (doc.file_path) {
                        try {
                            const { getDocumentDownloadUrl } = await import('./services/well-documents-service.js');
                            doc.downloadUrl = await getDocumentDownloadUrl(doc.file_path);
                        } catch (e) {
                            console.warn(`Error getting admin thumbnail url for doc ${doc.id}:`, e);
                        }
                    }
                }));
            }
        }
    } catch (err) {
        console.warn('Error al consultar archivos adjuntos de pozos:', err);
    }

    // Renderizar incidencias e informes en el sidebar izquierdo
    if (elements.sidebarIncidentsPanel) {
        elements.sidebarIncidentsPanel.hidden = false;
        if (elements.sidebarIncidentsCount) elements.sidebarIncidentsCount.textContent = String(mergedTickets.length);
        if (elements.sidebarIncidentsList) elements.sidebarIncidentsList.innerHTML = ticketsMarkup;

        const echometerCountEl = document.getElementById('campo-admin-sidebar-echometer-count');
        const echometerListEl = document.getElementById('campo-admin-sidebar-echometer-list');
        const sensorCountEl = document.getElementById('campo-admin-sidebar-sensor-count');
        const sensorListEl = document.getElementById('campo-admin-sidebar-sensor-list');
        const vsdCountEl = document.getElementById('campo-admin-sidebar-vsd-count');
        const vsdListEl = document.getElementById('campo-admin-sidebar-vsd-list');
        const soportesCountEl = document.getElementById('campo-admin-sidebar-soportes-count');
        const soportesListEl = document.getElementById('campo-admin-sidebar-soportes-list');
        const sidebarReviewCountEl = document.getElementById('campo-admin-sidebar-review-count');
        const sidebarReviewListEl = document.getElementById('campo-admin-sidebar-review-list');

        if (echometerCountEl) echometerCountEl.textContent = String(echometerDocs.length);
        if (sensorCountEl) sensorCountEl.textContent = String(sensorDocs.length);
        if (vsdCountEl) vsdCountEl.textContent = String(vsdDocs.length);
        if (soportesCountEl) soportesCountEl.textContent = String(soportesDocs.length);
        if (sidebarReviewCountEl) sidebarReviewCountEl.textContent = `${escapeHtml(String(reviewLog.length || (records.length ? 1 : 0)))} evento(s)`;
        if (sidebarReviewListEl) sidebarReviewListEl.innerHTML = pulseTimelineHtml;

        if (echometerListEl) {
            echometerListEl.innerHTML = echometerDocs.length > 0 ? echometerDocs.map(doc => `
                <div style="padding:12px; border-radius:12px; background:#fff; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                        <strong style="font-size:0.88rem; color:#0f172a; display:block;">${escapeHtml(doc.nombre_archivo || 'Archivo Echometer')}</strong>
                        <span style="font-size:0.78rem; color:#64748b;">Pozo: ${escapeHtml(doc.pozo_name)} · ${escapeHtml(doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-VE') : '')}</span>
                    </div>
                    <button type="button" class="btn-download-sidebar-doc" data-file-path="${escapeHtml(doc.file_path)}" style="padding:6px 12px; border-radius:8px; background:#2563eb; color:#fff; font-weight:700; font-size:0.78rem; border:none; cursor:pointer;">
                        ⬇️ Descargar
                    </button>
                </div>
            `).join('') : '<div class="campo-admin-empty"><strong>Sin archivos Echometer</strong><p>No se adjuntaron mediciones Echometer en esta jornada.</p></div>';
        }

        if (sensorListEl) {
            sensorListEl.innerHTML = sensorDocs.length > 0 ? sensorDocs.map(doc => `
                <div style="padding:12px; border-radius:12px; background:#fff; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                        <strong style="font-size:0.88rem; color:#0f172a; display:block;">${escapeHtml(doc.nombre_archivo || 'Data Sensor Fondo')}</strong>
                        <span style="font-size:0.78rem; color:#64748b;">Pozo: ${escapeHtml(doc.pozo_name)} · ${escapeHtml(doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-VE') : '')}</span>
                    </div>
                    <button type="button" class="btn-download-sidebar-doc" data-file-path="${escapeHtml(doc.file_path)}" style="padding:6px 12px; border-radius:8px; background:#0d9488; color:#fff; font-weight:700; font-size:0.78rem; border:none; cursor:pointer;">
                        ⬇️ Descargar
                    </button>
                </div>
            `).join('') : '<div class="campo-admin-empty"><strong>Sin data de sensor</strong><p>No se adjuntaron descargas de sensor de fondo en esta jornada.</p></div>';
        }

        if (vsdListEl) {
            vsdListEl.innerHTML = vsdDocs.length > 0 ? vsdDocs.map(doc => `
                <div style="padding:12px; border-radius:12px; background:#fff; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                        <strong style="font-size:0.88rem; color:#0f172a; display:block;">${escapeHtml(doc.nombre_archivo || 'Data VSD')}</strong>
                        <span style="font-size:0.78rem; color:#64748b;">Pozo: ${escapeHtml(doc.pozo_name)} · ${escapeHtml(doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-VE') : '')}</span>
                    </div>
                    <button type="button" class="btn-download-sidebar-doc" data-file-path="${escapeHtml(doc.file_path)}" style="padding:6px 12px; border-radius:8px; background:#d97706; color:#fff; font-weight:700; font-size:0.78rem; border:none; cursor:pointer;">
                        ⬇️ Descargar
                    </button>
                </div>
            `).join('') : '<div class="campo-admin-empty"><strong>Sin descargas VSD</strong><p>No se adjuntaron descargas VSD en esta jornada.</p></div>';
        }

        if (soportesListEl) {
            soportesListEl.innerHTML = soportesDocs.length > 0 ? soportesDocs.map(doc => {
                const desc = String(doc.descripcion || '').trim();
                let userComment = desc
                    .replace(/\[JORNADA_ID:[^\]]+\]/gi, '')
                    .replace(/\[TICKET_ID:[^\]]+\]/gi, '')
                    .trim();

                if (userComment === 'Soporte de campo' || userComment === 'Archivo de campo' || userComment.includes('Adjunto enviado desde captura') || !userComment) {
                    userComment = '';
                }

                const commentHtml = userComment 
                    ? `<div style="margin-top: 6px; padding: 6px 10px; background: #f8fafc; border-left: 3px solid #64748b; border-radius: 4px; font-size: 0.78rem; color: #334155; font-style: italic; text-align: left;">💬 ${escapeHtml(userComment)}</div>` 
                    : '';

                return `
                    <div style="padding:12px; border-radius:12px; background:#fff; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:10px; margin-bottom:8px;">
                        <div style="display:flex; gap:12px; align-items:center;">
                            ${doc.downloadUrl ? `
                                <div style="width:50px; height:50px; border-radius:8px; overflow:hidden; border:1px solid #e2e8f0; background:#f1f5f9; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                    <img src="${doc.downloadUrl}" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                            ` : ''}
                            <div style="flex:1; min-width:0;">
                                <strong style="font-size:0.88rem; color:#0f172a; display:block; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(doc.nombre_archivo)}">${escapeHtml(doc.nombre_archivo || 'Foto Soporte')}</strong>
                                <span style="font-size:0.78rem; color:#64748b; display:block; text-align:left;">Pozo: ${escapeHtml(doc.pozo_name)} · ${escapeHtml(doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-VE') : '')}</span>
                            </div>
                        </div>
                        ${commentHtml}
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="btn-download-sidebar-doc" data-file-path="${escapeHtml(doc.file_path)}" style="flex:1; padding:6px 12px; border-radius:8px; background:#475569; color:#fff; font-weight:700; font-size:0.78rem; border:none; cursor:pointer;">
                                ⬇️ Descargar
                            </button>
                            <button type="button" class="btn-preview-sidebar-image" data-file-path="${escapeHtml(doc.file_path)}" style="flex:1; padding:6px 12px; border-radius:8px; background:#1e40af; color:#fff; font-weight:700; font-size:0.78rem; border:none; cursor:pointer;">
                                👁️ Ver Imagen
                            </button>
                        </div>
                    </div>
                `;
            }).join('') : '<div class="campo-admin-empty"><strong>Sin soportes de campo</strong><p>No se adjuntaron imágenes de soporte en esta jornada.</p></div>';
        }

        document.querySelectorAll('.btn-download-sidebar-doc').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const path = e.currentTarget.dataset.filePath;
                if (!path) return;
                try {
                    btn.disabled = true;
                    btn.innerText = 'Generando link...';
                    const { getDocumentDownloadUrl } = await import('./services/well-documents-service.js');
                    const url = await getDocumentDownloadUrl(path);
                    if (url) {
                        window.open(url, '_blank');
                    } else {
                        alert('No se pudo obtener el enlace de descarga.');
                    }
                } catch (err) {
                    console.error('Error al descargar documento:', err);
                    alert(err.message || 'Error al obtener archivo');
                } finally {
                    btn.disabled = false;
                    btn.innerText = '⬇️ Descargar';
                }
            });
        });

        document.querySelectorAll('.btn-preview-sidebar-image').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const path = e.currentTarget.dataset.filePath;
                if (!path) return;
                try {
                    btn.disabled = true;
                    btn.innerText = 'Abriendo...';
                    const { getDocumentDownloadUrl } = await import('./services/well-documents-service.js');
                    const url = await getDocumentDownloadUrl(path);
                    if (url) {
                        window.open(url, '_blank');
                    } else {
                        alert('No se pudo obtener la imagen.');
                    }
                } catch (err) {
                    console.error('Error al abrir imagen:', err);
                    alert(err.message || 'Error al obtener imagen');
                } finally {
                    btn.disabled = false;
                    btn.innerText = '👁️ Ver Imagen';
                }
            });
        });
    }

    elements.detailShell.querySelectorAll('[data-detail-action]').forEach(button => {
        button.addEventListener('click', () => handleDetailAction(button.dataset.detailAction));
    });

    elements.detailShell.querySelectorAll('[data-record-open]').forEach(button => {
        button.addEventListener('click', () => openRecordModal(button.dataset.recordOpen, 'view'));
    });

    elements.detailShell.querySelectorAll('[data-record-edit]').forEach(button => {
        button.addEventListener('click', () => openRecordModal(button.dataset.recordEdit, 'edit'));
    });

    elements.detailShell.querySelectorAll('[data-record-delete]').forEach(button => {
        button.addEventListener('click', () => confirmDeleteRecord(button.dataset.recordDelete));
    });

    document.querySelectorAll('[data-ticket-src]').forEach(button => {
        button.addEventListener('click', () => {
            const src = button.getAttribute('data-ticket-src');
            if (!src) return;
            window.open(src, '_blank', 'noopener,noreferrer');
        });
    });

    document.querySelectorAll('[data-incident-open]').forEach(button => {
        button.addEventListener('click', () => openIncidentModal(button.getAttribute('data-incident-open')));
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openIncidentModal(button.getAttribute('data-incident-open'));
            }
        });
    });

    // Auto-editar pozo si venimos de la búsqueda directa de pozo
    if (state.autoEditPozoName) {
        const targetPozo = state.autoEditPozoName;
        state.autoEditPozoName = null; // Limpiar inmediatamente
        const recordToEdit = records.find(r => String(r.pozo).trim().toUpperCase() === targetPozo.toUpperCase());
        if (recordToEdit) {
            openRecordModal(recordToEdit.id, 'edit');
        }
    }
}

function setToolbarStatus(message) {
    elements.toolbarStatus.textContent = message;
}

function setLoading(isLoading) {
    state.loading = isLoading;
    elements.refreshButton.disabled = isLoading;
    // No inhabilitar el input de búsqueda para evitar pérdida de foco al escribir
    // elements.searchInput.disabled = isLoading;
    elements.filterGroup.querySelectorAll('[data-status-filter]').forEach(button => {
        button.disabled = isLoading;
    });
}

async function fetchJourneysForFilter(filterKey) {
    if (state.accessProfile?.isReadOnly) {
        return getAdminFieldJourneys({
            statuses: ['draft'],
            searchTerm: state.searchTerm,
            limit: 120
        });
    }

    // Consultar los estados correspondientes a la pestaña activa respetando el filtro de la pestaña actual
    const statuses = STATUS_FILTERS[filterKey] || STATUS_FILTERS.pending;

    return getAdminFieldJourneys({
        statuses: statuses,
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

function updateQueueHeader() {
    const copy = QUEUE_HEADER_COPY[state.filterKey] || QUEUE_HEADER_COPY.all;
    if (elements.queueTitle) {
        elements.queueTitle.textContent = copy.title;
    }
    if (elements.queueSubtitle) {
        elements.queueSubtitle.textContent = copy.subtitle;
    }
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
        updateQueueHeader();

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

    if (elements.sidebarIncidentsPanel) {
        elements.sidebarIncidentsPanel.hidden = true;
    }

    // Toggle master-detail view in mobile responsive layout
    const isMobile = window.innerWidth <= 1180;
    const shouldShowDetailView = !isMobile || !options.keepList;

    if (shouldShowDetailView) {
        const shell = document.querySelector('.campo-admin-shell');
        if (shell) {
            shell.classList.remove('show-queue');
            shell.classList.add('show-detail');
        }
        if (isMobile) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
            // Open window synchronously to bypass Brave/Chrome popup blockers
            const pdfWindow = window.open('', '_blank', 'width=1180,height=820');
            if (!pdfWindow) {
                await notify('El navegador bloqueó la ventana del PDF. Por favor, habilita las ventanas emergentes en tu navegador.', 'error');
                return;
            }

            // Write initial loading state in the popup
            pdfWindow.document.open();
            pdfWindow.document.write('<html><head><title>Generando Reporte...</title><style>body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; } .loader-card { padding: 40px; border-radius: 24px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; } .spinner { width: 50px; height: 50px; border: 5px solid #cbd5e1; border-top-color: #0f766e; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; } @keyframes spin { to { transform: rotate(360deg); } }</style></head><body><div class="loader-card"><div class="spinner"></div><h2 style="margin:0 0 8px; color:#0f172a; font-weight:800;">Generando reporte...</h2><p style="margin:0; color:#64748b; font-size:14px; font-weight:500;">Consolidando datos e imágenes de Supabase.</p></div></body></html>');
            pdfWindow.document.close();

            setActionButtonsBusy(true);
            try {
                await openFieldJourneyPdf(journey, records, state.currentDetail?.reviewLog || [], pdfWindow);
                await notify('Se abrio la vista imprimible para PDF.', 'success');
            } catch (err) {
                if (pdfWindow) pdfWindow.close();
                console.error(err);
                await notify(err.message || 'No se pudo generar el consolidado PDF.', 'error');
            } finally {
                setActionButtonsBusy(false);
            }
            return;
        }

        if (action === 'review-publication') {
            await showPublicationReadiness();
            return;
        }

        if (action === 'edit-journey-date') {
            const nextDate = await promptJourneyDateEdit(journey);
            if (!nextDate || nextDate === String(journey.journey_date || '').slice(0, 10)) return;

            setActionButtonsBusy(true);
            await saveAdminFieldJourneyReview(journey.id, {
                status: 'commented',
                journeyDate: nextDate,
                comment: `Fecha de jornada corregida de ${formatDate(journey.journey_date)} a ${formatDate(nextDate)}.`,
                metadata: {
                    previous_journey_date: String(journey.journey_date || '').slice(0, 10),
                    new_journey_date: nextDate,
                    source: 'campo-admin-date-correction'
                }
            });
            await loadJourneys();
            await selectJourney(journey.id, { keepList: true });
            await notify('Fecha de jornada actualizada. Los pozos no fueron modificados.', 'success');
            return;
        }

        if (action === 'merge-journey') {
            if (!isMergeSafeStatus(journey.status)) {
                await notify('Esta jornada no está en un estado seguro para fusionar. Solo aplica a pendientes, en revisión o rechazadas.', 'error');
                return;
            }

            const sourceJourney = await promptJourneyMergeSource(journey);
            if (!sourceJourney) return;

            const confirmed = await confirmJourneyMerge(journey, sourceJourney);
            if (!confirmed) return;

            setActionButtonsBusy(true);
            const result = await mergeAdminFieldJourneys(journey.id, sourceJourney.id);
            state.selectedJourneyId = journey.id;
            await loadJourneys();
            await selectJourney(journey.id, { keepList: true });

            const conflictText = result.conflictCount
                ? ` Quedaron ${result.conflictCount} pozo(s) duplicado(s) en revisión.`
                : '';
            await notify(`Se fusionaron ${result.movedCount} pozo(s) en la jornada principal.${conflictText}`, 'success');
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

    // Limpiar buscador al cambiar de pestaña para evitar cruces
    state.searchTerm = '';
    if (elements.searchInput) {
        elements.searchInput.value = '';
    }

    state.filterKey = nextFilter;
    syncActiveFilterButton();
    loadJourneys();
}

export async function initCampoAdmin() {
    elements.refreshButton = document.getElementById('campo-admin-refresh-btn');
    elements.alertConfigButton = document.getElementById('campo-admin-alert-config-btn');
    elements.searchInput = document.getElementById('campo-admin-search');
    elements.historicalExportButton = document.getElementById('campo-admin-historical-export-btn');
    elements.historicalAuditButton = document.getElementById('campo-admin-historical-audit-btn');
    elements.filterGroup = document.getElementById('campo-admin-filter-group');
    elements.toolbarStatus = document.getElementById('campo-admin-toolbar-status');
    elements.sideCopy = document.getElementById('campo-admin-side-copy');
    elements.visibleCount = document.getElementById('campo-admin-visible-count');
    elements.reviewCount = document.getElementById('campo-admin-review-count');
    elements.reportCount = document.getElementById('campo-admin-report-count');
    elements.listCount = document.getElementById('campo-admin-list-count');
    elements.list = document.getElementById('campo-admin-list');
    elements.queueTitle = document.getElementById('campo-admin-queue-title');
    elements.queueSubtitle = document.getElementById('campo-admin-queue-subtitle');
    elements.detailShell = document.getElementById('campo-admin-detail-shell');
    elements.sidebarIncidentsPanel = document.getElementById('campo-admin-sidebar-incidents-panel');
    elements.sidebarIncidentsCount = document.getElementById('campo-admin-sidebar-incidents-count');
    elements.sidebarIncidentsList = document.getElementById('campo-admin-sidebar-incidents-list');
    elements.recordModal = document.getElementById('campo-admin-record-modal');
    elements.recordModalBody = document.getElementById('campo-admin-record-modal-body');
    elements.incidentModal = document.getElementById('campo-admin-incident-modal');
    elements.incidentModalBody = document.getElementById('campo-admin-incident-modal-body');
    elements.historicalModal = document.getElementById('campo-admin-historical-modal');
    elements.historicalModalBody = document.getElementById('campo-admin-historical-modal-body');
    elements.historicalAuditModal = document.getElementById('campo-admin-historical-audit-modal');
    elements.historicalAuditModalBody = document.getElementById('campo-admin-historical-audit-modal-body');
    elements.alertConfigModal = document.getElementById('campo-admin-alert-config-modal');
    elements.alertConfigModalBody = document.getElementById('campo-admin-alert-config-modal-body');
    elements.logoutButton = document.getElementById('logout-btn');
    elements.mobileLogoutButton = document.getElementById('mobile-logout-btn');

    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    state.accessProfile = accessProfile;
    if (!accessProfile?.canViewManagement && !accessProfile?.isReadOnly) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    const operationalScopeContext = await initOperationalScopeContext(session, accessProfile);
    renderOperationalScopeSwitcher(document.getElementById('campo-admin-operational-scope-switcher'), operationalScopeContext, {
        onChange: () => {
            state.selectedJourneyId = '';
            state.currentDetail = null;
            loadJourneys();
        }
    });

    if (accessProfile?.isReadOnly) {
        state.filterKey = 'drafts';
        
        // Ocultar barra de pestañas/filtros
        if (elements.filterGroup) {
            elements.filterGroup.style.display = 'none';
        }
        
        // Ocultar estadísticas generales de bandejas administrativas
        const statsSec = document.querySelector('.campo-admin-stats');
        if (statsSec) {
            statsSec.style.display = 'none';
        }
        
        // Adaptar textos corporativos para el cliente
        const kickerEl = document.querySelector('.campo-admin-kicker');
        if (kickerEl) kickerEl.textContent = 'Monitoreo en Vivo';
        
        const titleEl = document.querySelector('.campo-admin-opsbar h1');
        if (titleEl) titleEl.textContent = 'Jornadas en Curso';
        
        const listTitle = document.querySelector('.campo-admin-panel-head h2');
        if (listTitle) listTitle.textContent = 'Jornadas en Curso en Vivo';
        
        const listDesc = document.querySelector('.campo-admin-panel-head p');
        if (listDesc) listDesc.textContent = 'Monitoreo de parámetros y pozos capturados en tiempo real por el equipo de campo.';
    }

    elements.logoutButton?.addEventListener('click', logout);
    elements.mobileLogoutButton?.addEventListener('click', logout);
    elements.refreshButton?.addEventListener('click', loadJourneys);
    elements.alertConfigButton?.addEventListener('click', openAlertConfigModal);
    elements.historicalExportButton?.addEventListener('click', openHistoricalModal);
    elements.historicalAuditButton?.addEventListener('click', openHistoricalAuditModal);
    elements.searchInput?.addEventListener('input', handleSearchInput);
    elements.filterGroup?.addEventListener('click', handleFilterClick);
    elements.recordModal?.addEventListener('click', event => {
        if (event.target === elements.recordModal) {
            checkUnsavedChangesAndConfirm(closeRecordModal);
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
    elements.historicalAuditModal?.addEventListener('click', event => {
        if (event.target === elements.historicalAuditModal) {
            closeHistoricalAuditModal();
        }
    });
    elements.alertConfigModal?.addEventListener('click', event => {
        if (event.target === elements.alertConfigModal) {
            closeAlertConfigModal();
        }
    });

    document.addEventListener('click', event => {
        const tabBtn = event.target.closest('.sidebar-tab-btn');
        if (!tabBtn) return;

        const parent = tabBtn.closest('#campo-admin-sidebar-incidents-panel');
        if (!parent) return;

        parent.querySelectorAll('.sidebar-tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');

        const tab = tabBtn.dataset.tab;
        const echometerContent = document.getElementById('sidebar-echometer-content');
        const sensorContent = document.getElementById('sidebar-sensor-content');
        const vsdContent = document.getElementById('sidebar-vsd-content');
        const soportesContent = document.getElementById('sidebar-soportes-content');
        const incidentsContent = document.getElementById('sidebar-incidents-content');

        if (echometerContent) echometerContent.style.display = (tab === 'echometer') ? 'block' : 'none';
        if (sensorContent) sensorContent.style.display = (tab === 'sensor') ? 'block' : 'none';
        if (vsdContent) vsdContent.style.display = (tab === 'vsd') ? 'block' : 'none';
        if (soportesContent) soportesContent.style.display = (tab === 'soportes') ? 'block' : 'none';
        if (incidentsContent) incidentsContent.style.display = (tab === 'incidents') ? 'block' : 'none';
    });

    // Mobile responsive master-detail view back action
    const handleGoBackToList = () => {
        const shell = document.querySelector('.campo-admin-shell');
        if (shell) {
            shell.classList.remove('show-detail');
            shell.classList.add('show-queue');
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
    };

    document.getElementById('mobile-back-to-list-btn')?.addEventListener('click', handleGoBackToList);
    document.getElementById('mobile-floating-back-btn')?.addEventListener('click', handleGoBackToList);

    try {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('email, nombre, apellido, role');
        state.profilesMap = {};
        if (Array.isArray(profiles)) {
            profiles.forEach(p => {
                state.profilesMap[String(p.email || '').trim().toLowerCase()] = p;
            });
        }
    } catch (err) {
        console.error('Error loading profiles in bootstrap:', err);
    }

    syncActiveFilterButton();
    await loadJourneys();

    // Hide loader overlay
    const loader = document.getElementById('premium-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

export function destroyCampoAdmin() {
    console.log('[CampoAdmin] Destruyendo bandeja y limpiando recursos...');
    state.journeys = [];
    state.selectedJourneyId = '';
    state.filterKey = 'pending';
    state.searchTerm = '';
    state.currentDetail = null;
    state.autoEditPozoName = null;
    if (state.searchTimer) {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = null;
    }
}
