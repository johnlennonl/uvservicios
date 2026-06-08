import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from '../../auth.js';
import { getUniquePozos } from '../../services/monitoring-service.js';
import { submitFieldJourneyWorkflow, submitFieldTicket, getFieldTicketsByJourney } from '../../services/field-journey-service.js';
import { validateFieldReport } from './field-validation.js';

const DRAFT_STORAGE_KEY = 'uv-field-capture-draft';
const REPORTS_STORAGE_KEY = 'uv-field-capture-reports';
const SUBMITTED_JOURNEYS_STORAGE_KEY = 'uv-field-submitted-journeys-preview';
const DRAFT_JOURNEY_KEY_STORAGE_KEY = 'uv-field-draft-journey-key';

const REPORT_COLUMNS = [
    ['INGENIEROS / EQUIPO DE GUARDIA', 'equipo_guardia'],
    ['LOCACIÓN DE LA JORNADA', 'locacion_jornada'],
    ['JORNADA', 'jornada'],
    ['POZO', 'pozo'],
    ['CAMPO', 'campo'],
    ['EF', 'ef'],
    ['ESTADO', 'estado'],
    ['CATEGORIA', 'categoria'],
    ['POTENCIAL', 'potencial'],
    ['BRUTA', 'bruta'],
    ['NETA', 'neta'],
    ['% AyS', 'ays_percentage'],
    ['FECHA', 'fecha'],
    ['HORA', 'hora'],
    ['ACTIVIDAD', 'actividad'],
    ['ESTATUS', 'estatus'],
    ['FREC', 'frecuencia'],
    ['MODO DE OPERACIÓN', 'modo_operacion'],
    ['SENTIDO DE GIRO', 'sentido_giro'],
    ['I Motor [A]', 'i_motor'],
    ['V Motor [V]', 'v_motor'],
    ['Out VSD [V]', 'out_vsd'],
    ['I VSD A [A]', 'i_vsd_a'],
    ['I VSD B [A]', 'i_vsd_b'],
    ['I VSD C [A]', 'i_vsd_c'],
    ['PROM I VSD [A]', 'prom_i_vsd'],
    ['Desv. Fase A', 'desv_fase_a'],
    ['Desv. Fase B', 'desv_fase_b'],
    ['Desv. Fase C', 'desv_fase_c'],
    ['Máx. Desviación', 'max_desviacion_vsd'],
    ['% Desbalance Corriente VSD [A]', 'desbalance_corriente_vsd'],
    ['PIP [psi]', 'pip_psi'],
    ['PD [psi]', 'pd_psi'],
    ['Ti [°F]', 'ti_f'],
    ['Tm [°F]', 'tm_f'],
    ['Vx [G]', 'vx_g'],
    ['Vy [G]', 'vy_g'],
    ['Vz [G]', 'vz_g'],
    ['AMP NOMINAL MOTOR [A]', 'amp_nominal_motor'],
    ['VOLT NOMINAL MOTOR [V]', 'volt_nominal_motor'],
    ['FREC MAX [Hz]', 'frec_max_hz'],
    ['LOW SPEED [Hz]', 'low_speed_hz'],
    ['UL [A]', 'ul_a'],
    ['OL [A]', 'ol_a'],
    ['I-LIMIT [A]', 'i_limit_a'],
    ['TIEMPO DE DESACELERACIÓN [SEG]', 'tiempo_desaceleracion_seg'],
    ['LOW PIP SHUT DOWN [PSI]', 'low_pip_shutdown_psi'],
    ['MAX HIGH TEMP. SHUT DOWN [°F]', 'max_high_temp_shutdown_f'],
    ['BAJA DATOS?', 'baja_datos'],
    ['VSD [KVA]', 'vsd_kva'],
    ['MARCA VSD', 'marca_vsd'],
    ['MODELO VSD', 'modelo_vsd'],
    ['Tx (KVA)', 'tx_kva'],
    ['TAP [V]', 'tap_v'],
    ['R.T', 'rt'],
    ['ESTADO DEL Tx', 'estado_tx'],
    ['ESTADO DEL VSD', 'estado_vsd'],
    ['ESTADO DE PANEL DE SENSOR / CHOQUES', 'estado_panel_sensor_choques'],
    ['ESTADO DEL ATERRAMIENTO', 'estado_aterramiento'],
    ['CONDICIÓN DEL CABLEADO', 'condicion_cableado'],
    ['CONDICIÓN DE LA CASETA', 'condicion_caseta'],
    ['TEMPERATURA DE LA CASETA', 'temperatura_caseta'],
    ['ESTADO DE FOSA [%]', 'estado_fosa_porcentaje'],
    ['ESTADO DEL BIW/CONECTOR', 'estado_biw_conector'],
    ['ESTADO DE MANÓMETROS', 'estado_manometros'],
    ['ESTADO DEL CABEZAL', 'estado_cabezal'],
    ['ESTADO DE TOMAMUESTRAS', 'estado_tomamuestras'],
    ['ESTADO CAJA DE VENTEO', 'estado_caja_venteo'],
    ['OBSERVACIONES DEL POZO', 'observaciones_pozo'],
    ['POSEE SENSOR DE FONDO?', 'posee_sensor_fondo'],
    ['DESCARGA DATAS DEL SENSOR', 'descarga_datas_sensor'],
    ['THP [psi]', 'thp_psi'],
    ['CHP [psi]', 'chp_psi'],
    ['LF [psi]', 'lf_psi'],
    ['COND. CHP', 'cond_chp'],
    ['ECHOMETER?', 'echometer'],
    ['NIVEL DE FLUIDO [ft]', 'nivel_fluido_ft'],
    ['SUMERGENCIA [ft]', 'sumergencia_ft'],
    ['PIP ECHOMETER [psi]', 'pip_echometer_psi'],
    ['DIAGNÓSTICO', 'diagnostico'],
    ['RESISTENCIA A-B [Ohm]', 'resistencia_ab_ohm'],
    ['RESISTENCIA B-C [Ohm]', 'resistencia_bc_ohm'],
    ['RESISTENCIA C-A [Ohm]', 'resistencia_ca_ohm'],
    ['AISLAMIENTO FASE-TIERRA [MOhm]', 'aislamiento_fase_tierra_mohm'],
    ['FASE-FASE X1-X2 [Volt]', 'ff_x1_x2_v'],
    ['FASE-FASE X2-X3 [Volt]', 'ff_x2_x3_v'],
    ['FASE-FASE X3-X1 [Volt]', 'ff_x3_x1_v'],
    ['Promedio Fase-Fase', 'promedio_fase_fase'],
    ['Desv. X1-X2', 'desv_ff_x1_x2'],
    ['Desv. X2-X3', 'desv_ff_x2_x3'],
    ['Desv. X3-X1', 'desv_ff_x3_x1'],
    ['Máx. Desviación Fase-Fase', 'max_desviacion_ff'],
    ['% Desbalance Fase-Fase', 'desbalance_fase_fase'],
    ['FASE-TIERRA X1-Tierra [Volt]', 'ft_x1_tierra_v'],
    ['FASE-TIERRA X2-Tierra [Volt]', 'ft_x2_tierra_v'],
    ['FASE-TIERRA X3-Tierra [Volt]', 'ft_x3_tierra_v'],
    ['Promedio Fase-Tierra', 'promedio_fase_tierra'],
    ['Desv. X1-Tierra', 'desv_ft_x1_tierra'],
    ['Desv. X2-Tierra', 'desv_ft_x2_tierra'],
    ['Desv. X3-Tierra', 'desv_ft_x3_tierra'],
    ['Máx. Desviación Fase-Tierra', 'max_desviacion_ft'],
    ['% Desbalance Fase-Tierra', 'desbalance_fase_tierra'],
    ['FASE-FASE H1-H2 [Volt]', 'sec_ff_h1_h2_v'],
    ['FASE-FASE H2-H3 [Volt]', 'sec_ff_h2_h3_v'],
    ['FASE-FASE H3-H1 [Volt]', 'sec_ff_h3_h1_v'],
    ['% Desbalance Fase/Fase Secundaria [Volt]', 'sec_desbalance_fase_fase'],
    ['FASE-TIERRA H1-Tierra [Volt]', 'sec_ft_h1_tierra_v'],
    ['FASE-TIERRA H2-Tierra [Volt]', 'sec_ft_h2_tierra_v'],
    ['FASE-TIERRA H3-Tierra [Volt]', 'sec_ft_h3_tierra_v'],
    ['% Desbalance Fase/Tierra Secundaria [Volt]', 'sec_desbalance_fase_tierra'],
    ['CORRIENTE X1-X2 [Amp]', 'corriente_x1_x2_amp'],
    ['CORRIENTE H1-H2 [Amp]', 'corriente_h1_h2_amp'],
    ['CORRIENTE H2-H3 [Amp]', 'corriente_h2_h3_amp'],
    ['CORRIENTE H3-H1 [Amp]', 'corriente_h3_h1_amp'],
    ['% Desbalance Corriente [Amp]', 'desbalance_corriente_secundaria'],
    ['RELACIÓN A. CON. / A. NOM', 'relacion_a_con_a_nom'],
    ['% AMP', 'porcentaje_amp'],
    ['RELACIÓN V. MOT / V. NOM', 'relacion_v_mot_v_nom'],
    ['% VOLT', 'porcentaje_volt'],
    ['PD MAX [psi]', 'pd_max_psi'],
    ['Δ PRESIÓN [psi]', 'delta_presion_psi'],
    ['% Δ PRESIÓN', 'porcentaje_delta_presion'],
    ['Tm / T MAX PERMISIBLE', 'relacion_tm_t_max'],
    ['% TEMP', 'porcentaje_temp'],
    ['PIP MIN / PIP', 'relacion_pip_min_pip'],
    ['% PIP', 'porcentaje_pip']
];

const EXCEL_SECTION_GROUPS = [
    {
        title: 'Jornada',
        fields: ['equipo_guardia', 'locacion_jornada', 'jornada', 'pozo', 'campo', 'fecha', 'hora']
    },
    {
        title: 'Informacion general',
        fields: ['ef', 'estado', 'categoria', 'potencial', 'bruta', 'neta', 'ays_percentage', 'actividad', 'estatus']
    },
    {
        title: 'Parametros operacionales',
        fields: ['frecuencia', 'modo_operacion', 'sentido_giro', 'i_motor', 'v_motor', 'out_vsd', 'i_vsd_a', 'i_vsd_b', 'i_vsd_c', 'prom_i_vsd', 'desv_fase_a', 'desv_fase_b', 'desv_fase_c', 'max_desviacion_vsd', 'desbalance_corriente_vsd', 'pip_psi', 'pd_psi', 'ti_f', 'tm_f', 'vx_g', 'vy_g', 'vz_g']
    },
    {
        title: 'Sistema BES',
        fields: ['amp_nominal_motor', 'volt_nominal_motor', 'frec_max_hz', 'low_speed_hz', 'ul_a', 'ol_a', 'i_limit_a', 'tiempo_desaceleracion_seg', 'low_pip_shutdown_psi', 'max_high_temp_shutdown_f']
    },
    {
        title: 'Superficie',
        fields: ['baja_datos', 'vsd_kva', 'marca_vsd', 'modelo_vsd', 'tx_kva', 'tap_v', 'rt', 'estado_tx', 'estado_vsd', 'estado_panel_sensor_choques', 'estado_aterramiento', 'condicion_cableado', 'condicion_caseta', 'temperatura_caseta', 'estado_fosa_porcentaje', 'estado_biw_conector', 'estado_manometros', 'estado_cabezal', 'estado_tomamuestras', 'estado_caja_venteo']
    },
    {
        title: 'Sensor y presiones',
        fields: ['posee_sensor_fondo', 'descarga_datas_sensor', 'thp_psi', 'chp_psi', 'lf_psi', 'cond_chp', 'echometer', 'nivel_fluido_ft', 'sumergencia_ft', 'pip_echometer_psi', 'diagnostico']
    },
    {
        title: 'Prueba electrica',
        fields: ['resistencia_ab_ohm', 'resistencia_bc_ohm', 'resistencia_ca_ohm', 'aislamiento_fase_tierra_mohm']
    },
    {
        title: 'Tx bobina primaria',
        fields: ['ff_x1_x2_v', 'ff_x2_x3_v', 'ff_x3_x1_v', 'promedio_fase_fase', 'desv_ff_x1_x2', 'desv_ff_x2_x3', 'desv_ff_x3_x1', 'max_desviacion_ff', 'desbalance_fase_fase', 'ft_x1_tierra_v', 'ft_x2_tierra_v', 'ft_x3_tierra_v', 'promedio_fase_tierra', 'desv_ft_x1_tierra', 'desv_ft_x2_tierra', 'desv_ft_x3_tierra', 'max_desviacion_ft', 'desbalance_fase_tierra']
    },
    {
        title: 'Tx bobina secundaria',
        fields: ['sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v', 'sec_desbalance_fase_fase', 'sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v', 'sec_desbalance_fase_tierra']
    },
    {
        title: 'Corrientes e indicadores',
        fields: ['corriente_x1_x2_amp', 'corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp', 'desbalance_corriente_secundaria', 'relacion_a_con_a_nom', 'porcentaje_amp', 'relacion_v_mot_v_nom', 'porcentaje_volt', 'pd_max_psi', 'delta_presion_psi', 'porcentaje_delta_presion', 'relacion_tm_t_max', 'porcentaje_temp', 'relacion_pip_min_pip', 'porcentaje_pip']
    },
    {
        title: 'Observaciones',
        fields: ['observaciones_pozo']
    }
];

const EXCEL_GROUP_COLORS = ['1D4ED8', '7C3AED', '0F766E', 'B45309', 'BE123C', '0F766E', '475569', '1D4ED8', '7C2D12', '7F1D1D'];
const REPORT_COLUMN_MAP = new Map(REPORT_COLUMNS.map(([label, fieldName]) => [fieldName, { label, fieldName }]));
const EXCEL_EXPORT_COLUMNS = EXCEL_SECTION_GROUPS.flatMap(group => (
    group.fields
        .map(fieldName => {
            const column = REPORT_COLUMN_MAP.get(fieldName);
            return column ? { ...column, groupTitle: group.title } : null;
        })
        .filter(Boolean)
));

const WELL_PREVIEW_SECTIONS = [
    {
        title: 'Informacion general',
        items: [
            ['Equipo de guardia', 'equipo_guardia'],
            ['Locacion de la jornada', 'locacion_jornada'],
            ['Jornada', 'jornada'],
            ['Campo', 'campo'],
            ['EF', 'ef'],
            ['Estado', 'estado'],
            ['Categoria', 'categoria'],
            ['Potencial', 'potencial'],
            ['Bruta', 'bruta'],
            ['Neta', 'neta'],
            ['% AyS', 'ays_percentage'],
            ['Actividad', 'actividad'],
            ['Estatus', 'estatus'],
            ['Modo de operacion', 'modo_operacion'],
            ['Sentido de giro', 'sentido_giro']
        ]
    },
    {
        title: 'Parametros operacionales',
        items: [
            ['Frec', 'frecuencia'],
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
            ['Ti [°F]', 'ti_f'],
            ['Tm [°F]', 'tm_f'],
            ['Vx [G]', 'vx_g'],
            ['Vy [G]', 'vy_g'],
            ['Vz [G]', 'vz_g']
        ]
    },
    {
        title: 'Sistema BES y superficie',
        items: [
            ['Amp nominal motor [A]', 'amp_nominal_motor'],
            ['Volt nominal motor [V]', 'volt_nominal_motor'],
            ['Frec max [Hz]', 'frec_max_hz'],
            ['Low speed [Hz]', 'low_speed_hz'],
            ['UL [A]', 'ul_a'],
            ['OL [A]', 'ol_a'],
            ['I-Limit [A]', 'i_limit_a'],
            ['Tiempo de desaceleracion [seg]', 'tiempo_desaceleracion_seg'],
            ['Low PIP shut down [psi]', 'low_pip_shutdown_psi'],
            ['Max high temp. shut down [°F]', 'max_high_temp_shutdown_f'],
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
        items: [
            ['Posee sensor de fondo', 'posee_sensor_fondo'],
            ['Descarga datas del sensor', 'descarga_datas_sensor'],
            ['THP [psi]', 'thp_psi'],
            ['CHP [psi]', 'chp_psi'],
            ['LF [psi]', 'lf_psi'],
            ['Cond. CHP', 'cond_chp'],
            ['Echometer', 'echometer'],
            ['Nivel de fluido [ft]', 'nivel_fluido_ft'],
            ['Sumergencia [ft]', 'sumergencia_ft'],
            ['PIP Echometer [psi]', 'pip_echometer_psi'],
            ['Diagnostico', 'diagnostico']
        ]
    },
    {
        title: 'Pruebas electricas y transformador',
        items: [
            ['Resistencia A-B [Ohm]', 'resistencia_ab_ohm'],
            ['Resistencia B-C [Ohm]', 'resistencia_bc_ohm'],
            ['Resistencia C-A [Ohm]', 'resistencia_ca_ohm'],
            ['Aislamiento fase-tierra [MOhm]', 'aislamiento_fase_tierra_mohm'],
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
            ['% Desbalance Fase-Tierra', 'desbalance_fase_tierra'],
            ['Fase-Fase H1-H2 [Volt]', 'sec_ff_h1_h2_v'],
            ['Fase-Fase H2-H3 [Volt]', 'sec_ff_h2_h3_v'],
            ['Fase-Fase H3-H1 [Volt]', 'sec_ff_h3_h1_v'],
            ['% Desbalance Fase/Fase Secundaria', 'sec_desbalance_fase_fase'],
            ['Fase-Tierra H1-Tierra [Volt]', 'sec_ft_h1_tierra_v'],
            ['Fase-Tierra H2-Tierra [Volt]', 'sec_ft_h2_tierra_v'],
            ['Fase-Tierra H3-Tierra [Volt]', 'sec_ft_h3_tierra_v'],
            ['% Desbalance Fase/Tierra Secundaria', 'sec_desbalance_fase_tierra'],
            ['Corriente X1-X2 [Amp]', 'corriente_x1_x2_amp'],
            ['Corriente H1-H2 [Amp]', 'corriente_h1_h2_amp'],
            ['Corriente H2-H3 [Amp]', 'corriente_h2_h3_amp'],
            ['Corriente H3-H1 [Amp]', 'corriente_h3_h1_amp'],
            ['% Desbalance Corriente', 'desbalance_corriente_secundaria']
        ]
    },
    {
        title: 'Indicadores operacionales',
        items: [
            ['Relacion A. Con. / A. Nom', 'relacion_a_con_a_nom'],
            ['% Amp', 'porcentaje_amp'],
            ['Relacion V. Mot / V. Nom', 'relacion_v_mot_v_nom'],
            ['% Volt', 'porcentaje_volt'],
            ['PD Max [psi]', 'pd_max_psi'],
            ['Δ Presion [psi]', 'delta_presion_psi'],
            ['% Δ Presion', 'porcentaje_delta_presion'],
            ['Tm / T Max Permisible', 'relacion_tm_t_max'],
            ['% Temp', 'porcentaje_temp'],
            ['PIP Min / PIP', 'relacion_pip_min_pip'],
            ['% PIP', 'porcentaje_pip']
        ]
    },
    {
        title: 'Observaciones',
        items: [
            ['Observaciones', 'observaciones_pozo']
        ]
    }
];

let currentEditingReportId = null;
let currentEditingJourneyId = null;
let CURRENT_ACCESS_PROFILE = null;
let availablePozos = [];
let isSubmittingJourney = false;

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    CURRENT_ACCESS_PROFILE = accessProfile;
    if (!accessProfile.canViewFieldModule) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    document.body.classList.toggle('access-readonly', accessProfile.isReadOnly);

    bindStaticActions();
    preloadDefaults();
    restoreDraft();
    await hydratePozoOptions();
    wireForm();
    recalculateComputedFields();
    renderJourneyReports();
    renderAdminPreview();
    updateSummary();
    syncAddButtonState();
    updateEditingContext();
    updateStatus('Completa el bloque mínimo y agrega el pozo a la jornada.');
});

function bindStaticActions() {
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);
    document.getElementById('field-clear-form-btn')?.addEventListener('click', clearForm);
    document.getElementById('field-add-report-btn')?.addEventListener('click', addCurrentReportToJourney);
    document.getElementById('field-submit-journey-btn')?.addEventListener('click', submitJourneyForAdminPreview);
    document.getElementById('field-back-to-capture-btn')?.addEventListener('click', scrollBackToCapture);
    document.getElementById('field-report-preview-close')?.addEventListener('click', closeReportPreview);
    document.getElementById('field-send-ticket-btn')?.addEventListener('click', openTicketModal);
    document.getElementById('field-ticket-close')?.addEventListener('click', closeTicketModal);
    document.getElementById('field-ticket-cancel')?.addEventListener('click', closeTicketModal);
    document.getElementById('field-ticket-send')?.addEventListener('click', handleSendTicket);
    document.getElementById('field-ticket-viewer-close')?.addEventListener('click', closeTicketViewer);
    document.getElementById('ticket-attachments-btn')?.addEventListener('click', () => document.getElementById('ticket-attachments')?.click());
    document.getElementById('ticket-attachments')?.addEventListener('change', updateTicketAttachmentsLabel);
    document.getElementById('field-report-preview-modal')?.addEventListener('click', handlePreviewBackdropClick);
    document.getElementById('field-pozo-list-close')?.addEventListener('click', closePozoList);
    document.querySelector('.field-report-preview-dialog')?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handlePreviewKeydown);
}

function preloadDefaults() {
    const dateInput = document.getElementById('field-fecha');
    const timeInput = document.getElementById('field-hora');
    const now = new Date();

    if (dateInput && !dateInput.value) {
        dateInput.value = now.toISOString().slice(0, 10);
    }

    if (timeInput && !timeInput.value) {
        timeInput.value = now.toTimeString().slice(0, 5);
    }
}

function wireForm() {
    const form = document.getElementById('field-report-form');
    if (!form) return;

    form.addEventListener('input', () => {
        recalculateComputedFields();
        persistDraft();
        updateSummary();
    });

    form.addEventListener('change', () => {
        recalculateComputedFields();
        persistDraft();
        updateSummary();
    });

    const pozoDisplayField = document.getElementById('field-pozo-display');
    pozoDisplayField?.addEventListener('focus', () => openFieldPozoMenu());
    pozoDisplayField?.addEventListener('input', handlePozoDisplayInput);
    pozoDisplayField?.addEventListener('keydown', handlePozoDisplayKeydown);
    pozoDisplayField?.addEventListener('blur', handlePozoDisplayBlur);
    document.getElementById('field-pozo-toggle')?.addEventListener('click', handlePozoToggleClick);
    document.getElementById('field-jornada')?.addEventListener('change', enforceLockedJourneySelection);
}

function getFormPayload() {
    const form = document.getElementById('field-report-form');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.pozo = String(document.getElementById('field-pozo')?.value || payload.pozo || '').trim().toUpperCase();
    payload.jornada = String(document.getElementById('field-jornada')?.value || payload.jornada || '').trim() || 'Diurna';
    payload.sentido_giro = String(payload.sentido_giro || '').trim() || 'FWD';
    return payload;
}

function persistDraft() {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(getFormPayload()));
}

function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
        const payload = JSON.parse(raw);
        Object.entries(payload).forEach(([key, value]) => {
            const field = document.querySelector(`[name="${key}"]`);
            if (field) {
                field.value = value ?? '';
            }
        });
        syncPozoDisplayFromValue();
    } catch (error) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
}

function clearForm() {
    const form = document.getElementById('field-report-form');
    if (!form) return;

    const preserved = {
        equipo_guardia: document.querySelector('[name="equipo_guardia"]')?.value || '',
        locacion_jornada: document.querySelector('[name="locacion_jornada"]')?.value || '',
        fecha: document.querySelector('[name="fecha"]')?.value || '',
        jornada: document.querySelector('[name="jornada"]')?.value || 'Diurna'
    };

    form.reset();
    currentEditingReportId = null;

    Object.entries(preserved).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) field.value = value;
    });

    preloadDefaults();
    syncPozoDisplayFromValue();
    closeFieldPozoMenu({ commitSearch: false });
    recalculateComputedFields();
    persistDraft();
    updateSummary();
    updateStatus('Formulario listo para capturar otro pozo.');
    syncAddButtonState();
    syncJourneyFieldLocks();
    updateEditingContext();
}

async function addCurrentReportToJourney() {
    const payload = getFormPayload();
    const validation = validateFieldReport(payload);

    if (!validation.isValid) {
        showAlert(validation.message, 'warning');
        updateStatus(validation.message, true);
        return;
    }

    const reports = getJourneyReports();
    const wasEditingReport = Boolean(currentEditingReportId);
    const reportRecord = {
        id: currentEditingReportId || crypto.randomUUID(),
        ...payload,
        createdAt: currentEditingReportId
            ? reports.find(report => report.id === currentEditingReportId)?.createdAt || new Date().toISOString()
            : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (currentEditingReportId) {
        const reportIndex = reports.findIndex(report => report.id === currentEditingReportId);
        if (reportIndex !== -1) {
            reports[reportIndex] = reportRecord;
        }
    } else {
        reports.push(reportRecord);
    }

    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
    renderJourneyReports();
    updateSummary();

    await handleSavedReportFlow(wasEditingReport);
}

function getJourneyReports() {
    const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        localStorage.removeItem(REPORTS_STORAGE_KEY);
        return [];
    }
}

function getSubmittedJourneys() {
    const raw = localStorage.getItem(SUBMITTED_JOURNEYS_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        localStorage.removeItem(SUBMITTED_JOURNEYS_STORAGE_KEY);
        return [];
    }
}

function normalizeJourneyIdentityPart(value) {
    return String(value || '').trim().toLowerCase();
}

function buildJourneyIdentityFromRecord(record = {}) {
    return [
        normalizeJourneyIdentityPart(record.fecha),
        normalizeJourneyIdentityPart(record.jornada),
        normalizeJourneyIdentityPart(record.locacion_jornada),
        normalizeJourneyIdentityPart(record.equipo_guardia)
    ].join('|');
}

function findMatchingSubmittedJourney(reports = [], journeys = getSubmittedJourneys()) {
    const firstReport = Array.isArray(reports) ? reports[0] : null;
    if (!firstReport) return null;

    const identity = buildJourneyIdentityFromRecord(firstReport);
    if (!identity.replace(/\|/g, '')) return null;

    return journeys.find(journey => {
        const source = Array.isArray(journey.records) && journey.records.length > 0
            ? journey.records[0]
            : journey;
        return buildJourneyIdentityFromRecord(source) === identity;
    }) || null;
}

function mergeJourneyRecords(existingRecords = [], draftRecords = []) {
    const merged = new Map();

    (Array.isArray(existingRecords) ? existingRecords : []).forEach(record => {
        if (!record?.id) return;
        merged.set(record.id, record);
    });

    (Array.isArray(draftRecords) ? draftRecords : []).forEach(record => {
        if (!record?.id) return;
        merged.set(record.id, {
            ...(merged.get(record.id) || {}),
            ...record,
            updatedAt: new Date().toISOString()
        });
    });

    return Array.from(merged.values()).sort((left, right) => {
        const leftTime = String(left?.hora || '');
        const rightTime = String(right?.hora || '');
        if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
        return String(left?.pozo || '').localeCompare(String(right?.pozo || ''));
    });
}

function renderJourneyReports() {
    const list = document.getElementById('field-journey-list');
    const count = document.getElementById('field-journey-count');
    if (!list || !count) return;

    const reports = getJourneyReports();
    const currentJourneyTicketKey = getCurrentJourneyTicketKey();
    const currentJourneyTicketCount = getLocalTicketCountForJourney(currentJourneyTicketKey);
    count.innerHTML = `${reports.length} ${reports.length === 1 ? 'pozo' : 'pozos'}${currentJourneyTicketCount > 0 ? ` <span class="field-journey-ticket-badge">${escapeHtml(String(currentJourneyTicketCount))} ticket${currentJourneyTicketCount === 1 ? '' : 's'}</span>` : ''}`;
    syncJourneyFieldLocks(reports);
    updateEditingContext(reports);

    if (reports.length === 0) {
        list.innerHTML = '<div class="field-journey-empty">Todavía no has agregado pozos a esta jornada.</div>';
        return;
    }

    list.innerHTML = reports.map(report => `
        <article class="field-journey-item">
            <div class="field-journey-item-top">
                <div>
                    <div class="field-journey-item-title">${escapeHtml(String(report.pozo || '').toUpperCase())}</div>
                    <div class="field-journey-item-meta">${escapeHtml(report.fecha || '--')} | ${escapeHtml(report.hora || '--')}</div>
                </div>
                <div class="field-journey-actions">
                    ${currentJourneyTicketCount > 0 && currentJourneyTicketKey ? `<button type="button" class="field-journey-ticket" data-ticket-journey-id="${escapeHtml(String(currentJourneyTicketKey))}"><i class="fa-solid fa-envelope"></i> ${currentJourneyTicketCount}</button>` : ''}
                    <button type="button" class="field-journey-edit" data-report-id="${report.id}">Editar</button>
                    <button type="button" class="field-journey-remove" data-report-id="${report.id}">Quitar</button>
                </div>
            </div>
        </article>
    `).join('');

    list.querySelectorAll('.field-journey-edit').forEach(button => {
        button.addEventListener('click', () => startEditingJourneyReport(button.dataset.reportId));
    });

    list.querySelectorAll('.field-journey-remove').forEach(button => {
        button.addEventListener('click', () => removeJourneyReport(button.dataset.reportId));
    });

    list.querySelectorAll('.field-journey-ticket').forEach(button => {
        button.addEventListener('click', () => openTicketViewer(button.dataset.ticketJourneyId));
    });
}

function startEditingJourneyReport(reportId) {
    const report = getJourneyReports().find(item => item.id === reportId);
    if (!report) {
        showAlert('No se encontró el registro seleccionado.', 'error');
        return;
    }

    loadReportIntoForm(report);

    currentEditingReportId = reportId;
    recalculateComputedFields();
    persistDraft();
    syncAddButtonState();
    updateSummary();
    scrollToCaptureStart();
    updateEditingContext();
    updateStatus(`Editando ${String(report.pozo || '').toUpperCase()}.`);
    showAlert(`Editando ${String(report.pozo || '').toUpperCase()}.`, 'info');
}

function removeJourneyReport(reportId) {
    const reports = getJourneyReports().filter(report => report.id !== reportId);
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
    if (currentEditingReportId === reportId) {
        currentEditingReportId = null;
    }
    renderJourneyReports();
    updateSummary();
    updateStatus('Registro eliminado de la jornada.');
}

function syncAddButtonState() {
    const addButton = document.getElementById('field-add-report-btn');
    if (!addButton) return;
    addButton.textContent = currentEditingReportId ? 'Actualizar registro' : 'Agregar registro a la jornada';
}

function updateEditingContext(reports = getJourneyReports()) {
    const banner = document.getElementById('field-editing-context');
    if (!banner) return;

    banner.classList.remove('is-editing', 'is-building');

    const currentReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId)
        : null;
    const journeyLabel = reports[0]?.jornada || document.getElementById('field-jornada')?.value || 'Diurna';

    if (currentReport) {
        banner.hidden = false;
        banner.classList.add('is-editing');
        banner.innerHTML = `
            <span class="field-continue-banner-label">Editando pozo</span>
            <div class="field-continue-banner-title">${escapeHtml(String(currentReport.pozo || '').toUpperCase())}</div>
            <div class="field-continue-banner-meta">Jornada ${escapeHtml(journeyLabel)} · ${escapeHtml(String(reports.length))} ${reports.length === 1 ? 'pozo cargado' : 'pozos cargados'} · Los cambios que guardes actualizarán este registro.</div>
        `;
        return;
    }

    if (currentEditingJourneyId || reports.length > 0) {
        banner.hidden = false;
        banner.classList.add('is-building');
        banner.innerHTML = `
            <span class="field-continue-banner-label">Jornada en construcción</span>
            <div class="field-continue-banner-title">${escapeHtml(journeyLabel)}</div>
            <div class="field-continue-banner-meta">${escapeHtml(String(reports.length))} ${reports.length === 1 ? 'pozo cargado' : 'pozos cargados'} · Sigue agregando pozos o entra a editar uno de los ya registrados.</div>
        `;
        return;
    }

    banner.hidden = true;
    banner.innerHTML = '';
}

function syncJourneyFieldLocks(reports = getJourneyReports()) {
    const jornadaField = document.getElementById('field-jornada');
    if (!jornadaField) return;

    const shouldLock = reports.length > 0;
    const lockedValue = reports[0]?.jornada || jornadaField.value || 'Diurna';
    jornadaField.value = lockedValue;
    jornadaField.disabled = shouldLock;
    jornadaField.dataset.lockedValue = lockedValue;
    jornadaField.title = shouldLock ? 'La jornada queda fija mientras existan pozos cargados en esta jornada.' : '';
}

function enforceLockedJourneySelection() {
    const jornadaField = document.getElementById('field-jornada');
    if (!jornadaField || !jornadaField.disabled) return;
    jornadaField.value = jornadaField.dataset.lockedValue || jornadaField.value;
}

async function submitJourneyForAdminPreview() {
    if (isSubmittingJourney) {
        updateStatus('La jornada ya se esta enviando a Admin Campo. Espera a que termine la sincronizacion.');
        return;
    }

    const reports = getJourneyReports();
    if (reports.length === 0) {
        showAlert('Primero agrega al menos un pozo a la jornada.', 'warning');
        updateStatus('No hay pozos en la jornada para enviar a revisión.', true);
        return;
    }

    const submittedJourneys = getSubmittedJourneys();
    const matchedJourney = currentEditingJourneyId
        ? submittedJourneys.find(journey => journey.id === currentEditingJourneyId) || null
        : findMatchingSubmittedJourney(reports, submittedJourneys);
    const resolvedJourneyId = currentEditingJourneyId || matchedJourney?.id || null;
    const existingJourneyIndex = resolvedJourneyId
        ? submittedJourneys.findIndex(journey => journey.id === resolvedJourneyId)
        : -1;
    const previousJourney = existingJourneyIndex >= 0 ? submittedJourneys[existingJourneyIndex] : null;
    const mergedReports = previousJourney?.records?.length
        ? mergeJourneyRecords(previousJourney.records, reports)
        : reports;
    const isUpdatingExistingJourney = Boolean(previousJourney);
    let workflowResult;
    const submitButton = document.getElementById('field-submit-journey-btn');

    // show processing modal with steps
    showProcessingModal();
    isSubmittingJourney = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando jornada...';
    }
    updateStatus('Sincronizando jornada con Admin Campo...');

    try {
        // step 1 - ensure visible at least 5s
        setProcessingStep(1, 'Generando jornada');
        const s1 = Date.now();
        await ensureStepMinDuration(s1, 5000);
        // execute server workflow (step 2 visible during network call)
        setProcessingStep(2, isUpdatingExistingJourney ? 'Actualizando jornada en el servidor' : 'Cargando jornada al servidor');
        const s2 = Date.now();
        workflowResult = await submitFieldJourneyWorkflow(mergedReports, {
            journeyId: resolvedJourneyId
        });
        await ensureStepMinDuration(s2, 5000);
        // step 3
        setProcessingStep(3, isUpdatingExistingJourney ? 'Finalizando actualizacion de jornada' : 'Finalizando y marcando como enviada');
        const s3 = Date.now();
        await ensureStepMinDuration(s3, 5000);
        setProcessingStep(3, isUpdatingExistingJourney ? 'Jornada actualizada exitosamente' : 'Jornada enviada exitosamente');
    } catch (error) {
        showAlert(error?.message || 'No se pudo enviar la jornada al workflow de Admin Campo.', 'error');
        updateStatus(error?.message || 'La jornada no pudo sincronizarse con Admin Campo.', true);
        isSubmittingJourney = false;
        hideProcessingModal();
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar jornada a revisión';
        }
        return;
    }

    const journeyRecord = buildSubmittedJourneyRecord({
        ...(previousJourney || {}),
        id: workflowResult.journeyId,
        createdAt: previousJourney?.createdAt || workflowResult.submittedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'Pendiente de revisión',
        workflowStatus: workflowResult.status || 'submitted',
        syncedAt: new Date().toISOString(),
        records: mergedReports
    });

    if (existingJourneyIndex >= 0) {
        submittedJourneys[existingJourneyIndex] = journeyRecord;
    } else {
        submittedJourneys.unshift(journeyRecord);
    }

    relinkDraftTicketsToJourney(workflowResult.journeyId);
    localStorage.setItem(SUBMITTED_JOURNEYS_STORAGE_KEY, JSON.stringify(submittedJourneys));
    renderAdminPreview();
    resetJourneyWorkspace();
    showAlert(isUpdatingExistingJourney ? 'Jornada actualizada en Admin Campo.' : 'Jornada enviada a Admin Campo.', 'success');
    updateStatus(isUpdatingExistingJourney ? 'Han actualizado la jornada y se sincronizó con Admin Campo.' : 'Jornada enviada y sincronizada con Admin Campo.');

    isSubmittingJourney = false;
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar jornada a revisión';
    }
    hideProcessingModal();
}

function updateSummary() {
    const reports = getJourneyReports();
    const payload = getFormPayload();
    const currentJourney = document.getElementById('field-summary-journey');
    const count = document.getElementById('field-summary-count');
    const last = document.getElementById('field-summary-last');

    if (currentJourney) currentJourney.textContent = payload.jornada || 'Diurna';
    if (count) count.textContent = String(reports.length);
    if (last) {
        const lastReport = reports[reports.length - 1];
        last.textContent = lastReport?.pozo ? String(lastReport.pozo).toUpperCase() : '--';
    }
}

function renderAdminPreview() {
    const count = document.getElementById('field-admin-preview-count');
    const list = document.getElementById('field-admin-preview-list');
    if (!count || !list) return;

    const journeys = getSubmittedJourneys();
    count.textContent = `${journeys.length} ${journeys.length === 1 ? 'jornada pendiente' : 'jornadas pendientes'}`;

    if (journeys.length === 0) {
        list.innerHTML = '<div class="field-admin-preview-empty">Todavía no has enviado ninguna jornada a revisión.</div>';
        return;
    }

    list.innerHTML = journeys.map(journey => `
        <article class="field-admin-ticket">
            <div class="field-admin-ticket-top">
                <div>
                    <span class="field-admin-ticket-kicker">${escapeHtml(journey.status || 'Pendiente de revisión')}</span>
                    <h3>${escapeHtml(journey.locacion_jornada || 'Locación sin definir')}</h3>
                    <p>${escapeHtml(journey.equipo_guardia || '--')} | ${escapeHtml(journey.fecha || '--')} | ${escapeHtml(journey.jornada || '--')}</p>
                </div>
                <div style="display:flex; align-items:flex-start; gap:12px;">
                    <button type="button" class="field-admin-ticket-count-btn" data-journey-id="${journey.id}">${escapeHtml(String(journey.reportCount || 0))} ${Number(journey.reportCount || 0) === 1 ? 'pozo' : 'pozos'}</button>
                    <div class="field-admin-ticket-actions">
                        ${(hasLocalTicketForJourney(journey.id) || Number(journey.reportCount || 0) > 0) ? `<button type="button" class="field-admin-ticket-action field-admin-ticket-viewticket" data-journey-id="${journey.id}" title="Ver tickets"><i class="fa-solid fa-envelope-circle-check"></i></button>` : ''}
                        <button type="button" class="field-admin-ticket-action" data-preview-mode="journey" data-journey-id="${journey.id}" title="Ver jornada"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="field-admin-ticket-action" data-preview-mode="well" data-journey-id="${journey.id}" title="Ver por pozo"><i class="fa-solid fa-list"></i></button>
                        ${!CURRENT_ACCESS_PROFILE?.isFieldOperator ? `<button type="button" class="field-admin-ticket-action field-admin-ticket-excel" data-journey-id="${journey.id}" title="Obtener Excel"><i class="fa-solid fa-file-excel"></i></button>` : ''}
                        <button type="button" class="field-admin-ticket-action field-admin-ticket-recover" data-journey-id="${journey.id}" title="Recuperar"><i class="fa-solid fa-rotate-left"></i></button>
                        <button type="button" class="field-admin-ticket-action field-admin-ticket-delete" data-journey-id="${journey.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
            <div class="field-admin-ticket-meta">
                <span>Ventana monitoreada: ${escapeHtml(journey.firstHour || '--')} a ${escapeHtml(journey.lastHour || '--')}</span>
                <span>Recibido: ${escapeHtml(formatSubmittedTimestamp(journey.createdAt))}</span>
            </div>
            <div class="field-admin-ticket-tags">
                ${journey.pozoNames.map(pozo => `<span class="field-admin-ticket-tag">${escapeHtml(pozo)}</span>`).join('')}
            </div>
        </article>
    `).join('');

    list.querySelectorAll('.field-admin-ticket-action[data-preview-mode]').forEach(button => {
        button.addEventListener('click', () => openReportPreview(button.dataset.journeyId, button.dataset.previewMode));
    });

    list.querySelectorAll('.field-admin-ticket-viewticket').forEach(btn => {
        btn.addEventListener('click', () => openTicketViewer(btn.dataset.journeyId));
    });
    list.querySelectorAll('.field-admin-ticket-count-btn').forEach(btn => {
        btn.addEventListener('click', () => openPozoList(btn.dataset.journeyId));
    });

    list.querySelectorAll('.field-admin-ticket-recover').forEach(button => {
        button.addEventListener('click', () => restoreSubmittedJourneyToWorkspace(button.dataset.journeyId));
    });

    list.querySelectorAll('.field-admin-ticket-excel').forEach(button => {
        button.addEventListener('click', () => exportJourneyToExcel(button.dataset.journeyId));
    });

    list.querySelectorAll('.field-admin-ticket-delete').forEach(button => {
        button.addEventListener('click', () => removeSubmittedJourney(button.dataset.journeyId));
    });
}

function updateStatus(message, isError = false) {
    const status = document.getElementById('field-form-status');
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.classList.toggle('is-success', !isError && /agregado|actualizado|listo|exportado/i.test(message));
}

function recalculateComputedFields() {
    syncThreePhaseMetrics(
        ['i_vsd_a', 'i_vsd_b', 'i_vsd_c'],
        {
            average: 'prom_i_vsd',
            deviations: ['desv_fase_a', 'desv_fase_b', 'desv_fase_c'],
            maxDeviation: 'max_desviacion_vsd',
            unbalance: 'desbalance_corriente_vsd'
        }
    );

    syncThreePhaseMetrics(
        ['ff_x1_x2_v', 'ff_x2_x3_v', 'ff_x3_x1_v'],
        {
            average: 'promedio_fase_fase',
            deviations: ['desv_ff_x1_x2', 'desv_ff_x2_x3', 'desv_ff_x3_x1'],
            maxDeviation: 'max_desviacion_ff',
            unbalance: 'desbalance_fase_fase'
        }
    );

    syncThreePhaseMetrics(
        ['ft_x1_tierra_v', 'ft_x2_tierra_v', 'ft_x3_tierra_v'],
        {
            average: 'promedio_fase_tierra',
            deviations: ['desv_ft_x1_tierra', 'desv_ft_x2_tierra', 'desv_ft_x3_tierra'],
            maxDeviation: 'max_desviacion_ft',
            unbalance: 'desbalance_fase_tierra'
        }
    );

    syncThreePhaseUnbalanceOnly(
        ['sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v'],
        'sec_desbalance_fase_fase'
    );

    syncThreePhaseUnbalanceOnly(
        ['sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v'],
        'sec_desbalance_fase_tierra'
    );

    syncThreePhaseUnbalanceOnly(
        ['corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp'],
        'desbalance_corriente_secundaria'
    );

    syncOperationalIndicators();
}

function syncThreePhaseUnbalanceOnly(sourceFields, targetField) {
    const values = sourceFields.map(getNumericFieldValue);
    const numericValues = values.filter(value => value !== null);

    if (numericValues.length === 0) {
        setFieldValue(targetField, '');
        return;
    }

    const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const deviations = values.map(value => (value === null ? null : Math.abs(value - average)));
    const maxDeviation = deviations.reduce((max, value) => (value === null ? max : Math.max(max, value)), 0);
    const unbalance = average === 0 ? null : (maxDeviation / average) * 100;
    setFieldValue(targetField, unbalance === null ? '' : formatNumber(unbalance));
}

function syncOperationalIndicators() {
    syncRatioAndPercent('i_motor', 'amp_nominal_motor', 'relacion_a_con_a_nom', 'porcentaje_amp');
    syncRatioAndPercent('v_motor', 'volt_nominal_motor', 'relacion_v_mot_v_nom', 'porcentaje_volt');
    syncRatioAndPercent('tm_f', 'max_high_temp_shutdown_f', 'relacion_tm_t_max', 'porcentaje_temp');
    syncRatioAndPercent('low_pip_shutdown_psi', 'pip_psi', 'relacion_pip_min_pip', 'porcentaje_pip');

    const pdMax = getNumericFieldValue('pd_max_psi');
    const pd = getNumericFieldValue('pd_psi');
    if (pdMax === null || pd === null) {
        setFieldValue('delta_presion_psi', '');
        setFieldValue('porcentaje_delta_presion', '');
    } else {
        const delta = pdMax - pd;
        setFieldValue('delta_presion_psi', formatNumber(delta));
        setFieldValue('porcentaje_delta_presion', pdMax === 0 ? '' : formatNumber((delta / pdMax) * 100));
    }
}

function syncRatioAndPercent(numeratorField, denominatorField, ratioField, percentField) {
    const numerator = getNumericFieldValue(numeratorField);
    const denominator = getNumericFieldValue(denominatorField);

    if (numerator === null || denominator === null || denominator === 0) {
        setFieldValue(ratioField, '');
        setFieldValue(percentField, '');
        return;
    }

    const ratio = numerator / denominator;
    setFieldValue(ratioField, formatNumber(ratio));
    setFieldValue(percentField, formatNumber(ratio * 100));
}

function syncThreePhaseMetrics(sourceFields, targetFields) {
    const values = sourceFields.map(getNumericFieldValue);
    const numericValues = values.filter(value => value !== null);

    if (numericValues.length === 0) {
        setFieldValue(targetFields.average, '');
        targetFields.deviations.forEach(field => setFieldValue(field, ''));
        setFieldValue(targetFields.maxDeviation, '');
        setFieldValue(targetFields.unbalance, '');
        return;
    }

    const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const deviations = values.map(value => (value === null ? null : Math.abs(value - average)));
    const maxDeviation = deviations.reduce((max, value) => (value === null ? max : Math.max(max, value)), 0);
    const unbalance = average === 0 ? null : (maxDeviation / average) * 100;

    setFieldValue(targetFields.average, formatNumber(average));
    targetFields.deviations.forEach((field, index) => {
        setFieldValue(field, deviations[index] === null ? '' : formatNumber(deviations[index]));
    });
    setFieldValue(targetFields.maxDeviation, formatNumber(maxDeviation));
    setFieldValue(targetFields.unbalance, unbalance === null ? '' : formatNumber(unbalance));
}

function getNumericFieldValue(fieldName) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) return null;
    const rawValue = String(field.value || '').trim();
    if (!rawValue) return null;
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function setFieldValue(fieldName, value) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (field) field.value = value;
}

function formatNumber(value) {
    return Number(value).toFixed(2);
}

function scrollBackToCapture() {
    document.getElementById('field-capture-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToCaptureStart() {
    document.querySelector('.field-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToPozoField() {
    const pozoField = document.getElementById('field-pozo-display');
    if (!pozoField) return;
    pozoField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pozoField.focus();
    pozoField.select?.();
    openFieldPozoMenu(true);
}

function openReportPreview(journeyId, mode = 'journey') {
    const journeys = getSubmittedJourneys();
    const journey = journeys.find(item => item.id === journeyId);
    if (!journey) {
        showAlert('No se encontró la jornada seleccionada para la vista previa.', 'error');
        return;
    }

    const modal = document.getElementById('field-report-preview-modal');
    const title = document.getElementById('field-report-preview-title');
    const body = document.getElementById('field-report-preview-body');
    if (!modal || !title || !body) return;

    if (mode === 'well') {
        title.textContent = `Vista por pozo · ${journey.locacion_jornada || 'Jornada'}`;
        body.innerHTML = buildWellPreviewMarkup(journey);
    } else {
        title.textContent = `Vista jornada · ${journey.locacion_jornada || 'Jornada'}`;
        body.innerHTML = buildJourneyPreviewMarkup(journey);
    }

    body.querySelectorAll('[data-edit-journey-id][data-edit-report-id]').forEach(button => {
        button.addEventListener('click', () => {
            restoreSubmittedJourneyToWorkspace(button.dataset.editJourneyId, button.dataset.editReportId);
            closeReportPreview();
        });
    });

    body.querySelectorAll('[data-delete-journey-id][data-delete-report-id]').forEach(button => {
        button.addEventListener('click', () => removeSubmittedJourneyReport(button.dataset.deleteJourneyId, button.dataset.deleteReportId, mode));
    });

    modal.hidden = false;
    document.body.classList.add('field-preview-open');
}

function closeReportPreview() {
    const modal = document.getElementById('field-report-preview-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('field-preview-open');
}

function buildJourneyPreviewMarkup(journey) {
    if (!Array.isArray(journey.records) || journey.records.length === 0) {
        return `
            <div class="field-report-empty-state">
                <h3>Sin registros en la jornada</h3>
                <p>Esta vista previa no tiene pozos cargados todavía o corresponde a un borrador anterior.</p>
            </div>
        `;
    }

    const rows = (journey.records || []).map(record => `
        <tr>
            <td>${escapeHtml(record.hora || '--')}</td>
            <td>${escapeHtml(String(record.pozo || '').toUpperCase())}</td>
            <td>${escapeHtml(record.campo || '--')}</td>
            <td>${escapeHtml(record.estatus || '--')}</td>
            <td>${escapeHtml(record.frecuencia || '--')}</td>
            <td>${escapeHtml(record.i_motor || '--')}</td>
            <td>${escapeHtml(record.pip_psi || '--')}</td>
            <td>${escapeHtml(record.tm_f || '--')}</td>
            <td>${escapeHtml(record.observaciones_pozo || '--')}</td>
        </tr>
    `).join('');

    return `
        <div class="field-report-sheet">
            <div class="field-report-sheet-head">
                <div>
                    <span class="field-report-sheet-kicker">Vista estilo Excel</span>
                    <h3>${escapeHtml(journey.locacion_jornada || 'Jornada sin locación')}</h3>
                    <p>${escapeHtml(journey.equipo_guardia || '--')} | ${escapeHtml(journey.fecha || '--')} | ${escapeHtml(journey.jornada || '--')}</p>
                </div>
                <span class="field-report-sheet-badge">${escapeHtml(String(journey.reportCount || 0))} pozos</span>
            </div>
            <div class="field-report-table-wrap">
                <table class="field-report-table">
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Pozo</th>
                            <th>Campo</th>
                            <th>Estatus</th>
                            <th>Frec</th>
                            <th>I Motor</th>
                            <th>PIP</th>
                            <th>Tm</th>
                            <th>Observaciones</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function buildWellPreviewMarkup(journey) {
    if (!Array.isArray(journey.records) || journey.records.length === 0) {
        return `
            <div class="field-report-empty-state">
                <h3>Sin pozos para mostrar</h3>
                <p>Guarda al menos un pozo dentro de la jornada para ver esta presentación por ficha.</p>
            </div>
        `;
    }

    const cards = (journey.records || []).map(record => `
        <article class="field-report-well-card">
            <div class="field-report-well-header">
                <div>
                    <span class="field-report-well-kicker">Vista estilo PDF</span>
                    <h3>${escapeHtml(String(record.pozo || '').toUpperCase())}</h3>
                    <p>${escapeHtml(record.campo || '--')} | ${escapeHtml(record.fecha || '--')} | ${escapeHtml(record.hora || '--')}</p>
                </div>
                <div class="field-report-well-header-actions">
                    <span class="field-report-well-status">${escapeHtml(record.estatus || '--')}</span>
                    <div class="field-report-well-action-group">
                        <button type="button" class="field-report-well-edit" data-edit-journey-id="${journey.id}" data-edit-report-id="${record.id}">Editar pozo</button>
                        <button type="button" class="field-report-well-delete" data-delete-journey-id="${journey.id}" data-delete-report-id="${record.id}">Eliminar pozo</button>
                    </div>
                </div>
            </div>
            <div class="field-report-well-sections">
                ${WELL_PREVIEW_SECTIONS.map(section => buildWellSectionMarkup(section, record)).join('')}
            </div>
        </article>
    `).join('');

    return `<div class="field-report-well-stack">${cards}</div>`;
}

function buildWellSectionMarkup(section, record) {
    const items = section.items.map(([label, fieldName]) => `
        <div class="field-report-well-item ${isLongPreviewField(fieldName) ? 'field-report-well-item-long' : ''}">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(formatPreviewValue(record[fieldName], fieldName))}</span>
        </div>
    `).join('');

    return `
        <section class="field-report-well-section">
            <div class="field-report-well-section-head">
                <h4>${escapeHtml(section.title)}</h4>
            </div>
            <div class="field-report-well-grid">
                ${items}
            </div>
        </section>
    `;
}

function isLongPreviewField(fieldName) {
    return fieldName === 'diagnostico' || fieldName === 'observaciones_pozo';
}

function formatPreviewValue(value, fieldName) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        if (fieldName === 'observaciones_pozo') return 'Sin observaciones registradas.';
        if (fieldName === 'diagnostico') return 'Sin diagnostico registrado.';
        return '--';
    }

    if (fieldName === 'estado_fosa_porcentaje') {
        return `${normalized} %`;
    }

    return normalized;
}

function restoreSubmittedJourneyToWorkspace(journeyId, reportId = null) {
    const journey = getSubmittedJourneys().find(item => item.id === journeyId);
    if (!journey || !Array.isArray(journey.records) || journey.records.length === 0) {
        showAlert('No se encontro una jornada valida para recuperar.', 'error');
        return;
    }

    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(journey.records));
    currentEditingJourneyId = journey.id;
    renderJourneyReports();
    updateSummary();

    const targetReport = journey.records.find(record => record.id === reportId) || journey.records[0];
    if (targetReport) {
        loadReportIntoForm(targetReport);
        currentEditingReportId = targetReport.id;
    }

    closeReportPreview();
    persistDraft();
    recalculateComputedFields();
    syncAddButtonState();
    updateEditingContext();
    scrollToCaptureStart();
    updateStatus(`Editando ${String(targetReport?.pozo || '').toUpperCase()} desde una jornada recuperada.`);
    showAlert('Jornada recuperada para seguir editando en Campo.', 'success');
}

function buildSubmittedJourneyRecord(baseJourney) {
    const records = Array.isArray(baseJourney.records) ? baseJourney.records : [];
    const firstReport = records[0] || {};
    const sortedReports = [...records].sort((left, right) => String(left.hora || '').localeCompare(String(right.hora || '')));

    return {
        ...baseJourney,
        jornada: baseJourney.jornada || firstReport.jornada || 'Diurna',
        fecha: baseJourney.fecha || firstReport.fecha || '',
        equipo_guardia: baseJourney.equipo_guardia || firstReport.equipo_guardia || '',
        locacion_jornada: baseJourney.locacion_jornada || firstReport.locacion_jornada || '',
        reportCount: records.length,
        firstHour: sortedReports[0]?.hora || '',
        lastHour: sortedReports[sortedReports.length - 1]?.hora || '',
        pozoNames: sortedReports.map(report => String(report.pozo || '').toUpperCase()).filter(Boolean),
        records
    };
}

function removeSubmittedJourney(journeyId) {
    const journeys = getSubmittedJourneys();
    const nextJourneys = journeys.filter(journey => journey.id !== journeyId);
    if (nextJourneys.length === journeys.length) {
        showAlert('No se encontro la jornada que querias eliminar.', 'error');
        return;
    }

    localStorage.setItem(SUBMITTED_JOURNEYS_STORAGE_KEY, JSON.stringify(nextJourneys));
    if (currentEditingJourneyId === journeyId) {
        currentEditingJourneyId = null;
    }
    renderAdminPreview();
    updateStatus('Jornada de prueba eliminada de la bandeja simulada.');
    showAlert('Jornada eliminada.', 'success');
}

function removeSubmittedJourneyReport(journeyId, reportId, mode = 'well') {
    const journeys = getSubmittedJourneys();
    const journeyIndex = journeys.findIndex(journey => journey.id === journeyId);
    if (journeyIndex === -1) {
        showAlert('No se encontro la jornada para eliminar el pozo.', 'error');
        return;
    }

    const journey = journeys[journeyIndex];
    const remainingRecords = (journey.records || []).filter(record => record.id !== reportId);
    if (remainingRecords.length === (journey.records || []).length) {
        showAlert('No se encontro el pozo seleccionado.', 'error');
        return;
    }

    if (remainingRecords.length === 0) {
        journeys.splice(journeyIndex, 1);
        localStorage.setItem(SUBMITTED_JOURNEYS_STORAGE_KEY, JSON.stringify(journeys));
        if (currentEditingJourneyId === journeyId) {
            currentEditingJourneyId = null;
        }
        renderAdminPreview();
        closeReportPreview();
        updateStatus('La jornada quedo vacia y fue eliminada de la bandeja simulada.');
        showAlert('Pozo eliminado. La jornada de prueba quedo vacia y se removio.', 'success');
        return;
    }

    journeys[journeyIndex] = buildSubmittedJourneyRecord({
        ...journey,
        records: remainingRecords
    });

    localStorage.setItem(SUBMITTED_JOURNEYS_STORAGE_KEY, JSON.stringify(journeys));
    renderAdminPreview();
    openReportPreview(journeyId, mode);
    updateStatus('Pozo eliminado de la jornada de prueba.');
    showAlert('Pozo eliminado de la vista de prueba.', 'success');
}

async function exportJourneyToExcel(journeyId) {
    if (CURRENT_ACCESS_PROFILE?.isFieldOperator) {
        showAlert('No tienes permisos para exportar jornadas.', 'error');
        return;
    }
    if (!window.ExcelJS) {
        showAlert('La libreria de Excel no esta disponible en esta vista.', 'error');
        return;
    }

    const journey = getSubmittedJourneys().find(item => item.id === journeyId);
    if (!journey) {
        showAlert('No se encontro la jornada para exportar.', 'error');
        return;
    }

    const sortedRecords = sortJourneyRecords(journey.records || []);
    if (sortedRecords.length === 0) {
        showAlert('La jornada no tiene pozos para exportar.', 'warning');
        return;
    }

    updateStatus('Generando Excel de la jornada...');

    try {
        const workbook = new window.ExcelJS.Workbook();
        workbook.creator = 'UV Servicios Campo';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.company = 'UV Servicios';

        const summarySheet = workbook.addWorksheet('Resumen', {
            views: [{ state: 'frozen', ySplit: 4 }]
        });
        const detailSheet = workbook.addWorksheet('Jornada Campo', {
            views: [{ state: 'frozen', ySplit: 6, xSplit: 4 }]
        });

        const logoDataUrl = await loadLogoForExcel();
        if (logoDataUrl) {
            const imageId = workbook.addImage({
                base64: logoDataUrl,
                extension: 'png'
            });
            summarySheet.addImage(imageId, { tl: { col: 0.2, row: 0.15 }, ext: { width: 160, height: 116 } });
            detailSheet.addImage(imageId, { tl: { col: 0.2, row: 0.15 }, ext: { width: 160, height: 116 } });
        }

        buildExcelSummarySheet(summarySheet, journey, sortedRecords);
        buildExcelDetailSheet(detailSheet, journey, sortedRecords);

        const buffer = await workbook.xlsx.writeBuffer();
        downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), buildJourneyExcelFileName(journey));

        showAlert('Excel generado correctamente.', 'success');
        updateStatus('Excel exportado con la jornada ordenada por pozo y hora.');
    } catch (error) {
        showAlert('No se pudo generar el Excel de la jornada.', 'error');
        updateStatus('Fallo la exportacion Excel de la jornada.', true);
    }
}

function buildExcelSummarySheet(worksheet, journey, records) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CReporte de acompañamiento BES&RGenerado &D &T';
    worksheet.mergeCells('C1:J1');
    worksheet.mergeCells('C2:J2');
    worksheet.mergeCells('C3:J3');
    worksheet.getCell('C1').value = 'UV SERVICIOS CAMPO';
    worksheet.getCell('C2').value = 'REPORTE DE ACOMPAÑAMIENTO POZOS CON BOMBAS ELECTROSUMERGIBLES';
    worksheet.getCell('C3').value = `${journey.locacion_jornada || 'Locacion no definida'} · ${journey.fecha || '--'} · ${journey.jornada || '--'}`;

    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    const summaryRows = [
        ['Equipo de guardia', journey.equipo_guardia || '--'],
        ['Locacion', journey.locacion_jornada || '--'],
        ['Fecha', journey.fecha || '--'],
        ['Jornada', journey.jornada || '--'],
        ['Pozos monitoreados', records.length],
        ['Ventana', `${journey.firstHour || '--'} a ${journey.lastHour || '--'}`],
        ['Pozos', records.map(record => String(record.pozo || '').toUpperCase()).join(', ') || '--']
    ];

    let rowNumber = 6;
    summaryRows.forEach(([label, value]) => {
        const row = worksheet.getRow(rowNumber);
        row.getCell(2).value = label;
        row.getCell(3).value = value;
        row.getCell(2).font = { bold: true, color: { argb: '7F1D1D' } };
        row.getCell(3).font = { color: { argb: '0F172A' } };
        row.getCell(2).fill = solidFill('FDECEC');
        row.getCell(3).fill = solidFill('FFFFFF');
        row.getCell(2).border = borderedCell();
        row.getCell(3).border = borderedCell();
        row.height = label === 'Pozos' ? 34 : 24;
        rowNumber += 1;
    });

    worksheet.columns = [
        { width: 6 },
        { width: 28 },
        { width: 84 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 18 },
        { width: 18 },
        { width: 18 }
    ];
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 42;
    worksheet.getRow(3).height = 24;
}

function buildExcelDetailSheet(worksheet, journey, records) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CReporte de acompañamiento BES&RPagina &P de &N';
    const totalColumns = EXCEL_EXPORT_COLUMNS.length;
    const lastColumnLetter = getExcelColumnLetter(totalColumns);

    worksheet.mergeCells(`C1:${lastColumnLetter}1`);
    worksheet.mergeCells(`C2:${lastColumnLetter}2`);
    worksheet.mergeCells(`C3:${lastColumnLetter}3`);
    worksheet.getCell('C1').value = 'UV SERVICIOS';
    worksheet.getCell('C2').value = 'REPORTE DE ACOMPAÑAMIENTO POZOS CON BOMBAS ELECTROSUMERGIBLES';
    worksheet.getCell('C3').value = `${journey.locacion_jornada || '--'} · ${journey.fecha || '--'} · ${journey.jornada || '--'} · ${records.length} pozo(s)`;
    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    worksheet.columns = EXCEL_EXPORT_COLUMNS.map(({ label, fieldName }) => ({
        width: calculateExcelColumnWidth(label, fieldName, records)
    }));

    const groupRowIndex = 5;
    const headerRowIndex = 6;
    let currentColumn = 1;

    EXCEL_SECTION_GROUPS.forEach((group, index) => {
        const columnsForGroup = EXCEL_EXPORT_COLUMNS.filter(column => column.groupTitle === group.title);
        if (columnsForGroup.length === 0) return;

        const startColumn = currentColumn;
        const endColumn = currentColumn + columnsForGroup.length - 1;
        worksheet.mergeCells(groupRowIndex, startColumn, groupRowIndex, endColumn);
        const groupCell = worksheet.getCell(groupRowIndex, startColumn);
        groupCell.value = group.title;
        groupCell.alignment = { vertical: 'middle', horizontal: 'center' };
        groupCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        groupCell.fill = solidFill(EXCEL_GROUP_COLORS[index % EXCEL_GROUP_COLORS.length]);
        groupCell.border = borderedCell();

        columnsForGroup.forEach(({ label }, groupIndex) => {
            const headerCell = worksheet.getCell(headerRowIndex, currentColumn + groupIndex);
            headerCell.value = label;
            headerCell.font = { bold: true, color: { argb: '0F172A' }, size: 10 };
            headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            headerCell.fill = solidFill('F8FAFC');
            headerCell.border = borderedCell();
        });

        currentColumn = endColumn + 1;
    });

    records.forEach((record, recordIndex) => {
        const rowIndex = headerRowIndex + 1 + recordIndex;
        const row = worksheet.getRow(rowIndex);

        EXCEL_EXPORT_COLUMNS.forEach(({ fieldName }, columnIndex) => {
            const cell = row.getCell(columnIndex + 1);
            cell.value = formatExcelCellValue(record[fieldName], fieldName);
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
            cell.border = borderedCell('E2E8F0');
            cell.fill = solidFill(recordIndex % 2 === 0 ? 'FFFFFF' : 'FCFCFD');
            cell.font = { color: { argb: '111827' }, size: 10 };
        });

        row.commit?.();
    });

    worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: EXCEL_EXPORT_COLUMNS.length }
    };

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= headerRowIndex) {
            row.height = rowNumber === headerRowIndex ? 34 : 24;
        }
    });
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 54;
    worksheet.getRow(3).height = 24;
}

function styleExcelTitleBlock(worksheet, cellAddresses) {
    cellAddresses.forEach(address => {
        const cell = worksheet.getCell(address);
        cell.fill = solidFill(address.endsWith('2') ? 'FFFFFF' : '0D215E');
        cell.font = {
            bold: true,
            color: { argb: address.endsWith('2') ? '000000' : 'FFFFFFFF' },
            size: address.endsWith('2') ? 24 : (address.endsWith('1') ? 16 : 11)
        };
        cell.alignment = { vertical: 'middle', horizontal: address.endsWith('2') ? 'center' : 'left', wrapText: true };
        if (address.endsWith('2')) {
            cell.border = {
                top: { style: 'thin', color: { argb: '16A34A' } },
                bottom: { style: 'thin', color: { argb: '16A34A' } }
            };
        }
    });
}

function solidFill(color) {
    return {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color }
    };
}

function borderedCell(color = 'CBD5E1') {
    return {
        top: { style: 'thin', color: { argb: color } },
        left: { style: 'thin', color: { argb: color } },
        bottom: { style: 'thin', color: { argb: color } },
        right: { style: 'thin', color: { argb: color } }
    };
}

function sortJourneyRecords(records = []) {
    return [...records].sort((left, right) => {
        const byTime = String(left.hora || '').localeCompare(String(right.hora || ''));
        if (byTime !== 0) return byTime;
        return String(left.pozo || '').localeCompare(String(right.pozo || ''));
    });
}

function calculateExcelColumnWidth(label, fieldName, records) {
    const isLongTextField = fieldName === 'observaciones_pozo' || fieldName === 'diagnostico';
    const isObservationField = fieldName === 'observaciones_pozo';
    const baseWidth = Math.max(label.length + 2, isObservationField ? 36 : (isLongTextField ? 24 : 14));
    const longestValue = records.reduce((max, record) => {
        const valueLength = String(formatExcelCellValue(record[fieldName], fieldName) || '').length;
        return Math.max(max, valueLength);
    }, 0);
    if (isObservationField) {
        return Math.min(Math.max(baseWidth, Math.min(longestValue + 4, 52)), 72);
    }

    if (isLongTextField) {
        return Math.min(Math.max(baseWidth, Math.min(longestValue + 2, 42)), 56);
    }

    return Math.min(Math.max(baseWidth, Math.min(longestValue + 2, 34)), 42);
}

function formatExcelCellValue(value, fieldName) {
    if (value === undefined || value === null || value === '') return '';
    if (fieldName === 'estado_fosa_porcentaje') return `${value} %`;
    return value;
}

function getExcelColumnLetter(columnNumber) {
    let value = columnNumber;
    let result = '';

    while (value > 0) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        value = Math.floor((value - 1) / 26);
    }

    return result || 'A';
}

function buildJourneyExcelFileName(journey) {
    const parts = [
        'uvs-campo',
        sanitizeFileNameSegment(journey.locacion_jornada || 'jornada'),
        sanitizeFileNameSegment(journey.fecha || new Date().toISOString().slice(0, 10)),
        sanitizeFileNameSegment(journey.jornada || 'turno')
    ].filter(Boolean);

    return `${parts.join('_')}.xlsx`;
}

function sanitizeFileNameSegment(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

async function loadLogoForExcel() {
    const logoPath = 'img/uvservicioslogo.png';

    try {
        const response = await fetch(logoPath);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await imageBlobToDataUrl(blob);
    } catch (error) {
        return null;
    }
}

function imageBlobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function loadReportIntoForm(report) {
    Object.entries(report).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) field.value = value ?? '';
    });

    syncPozoDisplayFromValue();
}

function showAlert(message, icon = 'info') {
    if (!window.Swal) return;

    const isPassiveInfo = icon === 'info';
    const isSuccess = icon === 'success';

    window.Swal.fire({
        icon,
        title: isSuccess ? 'Campo' : 'Revisión',
        text: message,
        timer: isSuccess ? 1800 : (isPassiveInfo ? 1600 : undefined),
        showConfirmButton: !isSuccess && !isPassiveInfo
    });
}

async function handleSavedReportFlow(wasEditingReport) {
    const savedMessage = wasEditingReport ? 'Registro actualizado exitosamente.' : 'Registro guardado exitosamente.';
    updateStatus(wasEditingReport ? 'Registro actualizado dentro de la jornada.' : 'Registro guardado dentro de la jornada.');

    if (!window.Swal) {
        clearForm();
        return;
    }

    await window.Swal.fire({
        icon: 'success',
        title: 'Campo',
        text: savedMessage,
        timer: 1700,
        showConfirmButton: false
    });

    const promptResult = await window.Swal.fire({
        icon: 'question',
        title: 'Agregar nuevo registro en esta jornada?',
        text: 'Puedes continuar cargando otro pozo o dejar la jornada lista para revisión.',
        confirmButtonText: 'Si, agregar otro',
        cancelButtonText: 'No, dejar esta jornada',
        showCancelButton: true,
        reverseButtons: true
    });

    clearForm();

    if (promptResult.isConfirmed) {
        updateStatus('Formulario listo para capturar otro pozo dentro de esta jornada.');
        scrollToPozoField();
        return;
    }

    updateStatus('Registro guardado. Puedes seguir revisando o enviar la jornada a revisión.');
    scrollBackToCapture();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resetJourneyWorkspace() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(REPORTS_STORAGE_KEY);
    localStorage.removeItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
    currentEditingReportId = null;
    currentEditingJourneyId = null;

    const form = document.getElementById('field-report-form');
    if (form) {
        form.reset();
    }

    preloadDefaults();
    recalculateComputedFields();
    renderJourneyReports();
    updateSummary();
    syncAddButtonState();
    syncJourneyFieldLocks([]);
    updateEditingContext([]);
}

async function hydratePozoOptions() {
    const menu = document.getElementById('field-pozo-menu');
    if (!menu) return;

    try {
        const pozos = await getUniquePozos();
        availablePozos = Array.isArray(pozos)
            ? pozos.map(pozo => String(pozo || '').trim().toUpperCase()).filter(Boolean).sort((left, right) => left.localeCompare(right))
            : [];
    } catch (error) {
        availablePozos = [];
    }

    syncPozoDisplayFromValue();
    renderFieldPozoOptions(true);
}

function handlePozoDisplayInput(event) {
    const displayField = event?.target;
    const hiddenField = document.getElementById('field-pozo');
    if (!(displayField instanceof HTMLInputElement) || !hiddenField) return;

    displayField.value = normalizePozoValue(displayField.value);
    if (displayField.value !== String(hiddenField.value || '').trim().toUpperCase()) {
        hiddenField.value = '';
    }

    renderFieldPozoOptions();
    openFieldPozoMenu();
}

function handlePozoDisplayKeydown(event) {
    if (event.key === 'Escape') {
        closeFieldPozoMenu();
        return;
    }

    if (event.key !== 'Enter') return;

    const displayField = document.getElementById('field-pozo-display');
    const firstOption = document.querySelector('#field-pozo-menu .pozo-selector-option');
    event.preventDefault();

    if (firstOption instanceof HTMLButtonElement) {
        selectFieldPozo(firstOption.dataset.pozo || '');
        return;
    }

    commitTypedPozoSelection();
}

function handlePozoDisplayBlur() {
    window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (document.getElementById('field-pozo-selector')?.contains(activeElement)) return;
        closeFieldPozoMenu();
    }, 120);
}

function handlePozoToggleClick(event) {
    event.preventDefault();
    const menu = document.getElementById('field-pozo-menu');
    if (!menu) return;

    if (menu.classList.contains('active')) {
        closeFieldPozoMenu();
        return;
    }

    document.getElementById('field-pozo-display')?.focus();
    openFieldPozoMenu(true);
}

function renderFieldPozoOptions(ignoreSearch = false) {
    const menu = document.getElementById('field-pozo-menu');
    const displayField = document.getElementById('field-pozo-display');
    const hiddenField = document.getElementById('field-pozo');
    if (!menu || !displayField || !hiddenField) return;

    if (availablePozos.length === 0) {
        menu.innerHTML = '<div class="pozo-selector-empty">No se pudo cargar el catálogo. Puedes escribir el código exacto del pozo.</div>';
        return;
    }

    const searchTerm = ignoreSearch ? '' : normalizePozoValue(displayField.value);
    const filteredPozos = availablePozos.filter(pozo => !searchTerm || pozo.includes(searchTerm));

    if (filteredPozos.length === 0) {
        menu.innerHTML = '<div class="pozo-selector-empty">No hay pozos para esa búsqueda.</div>';
        return;
    }

    menu.innerHTML = filteredPozos.map(pozo => `
        <button type="button" class="pozo-selector-option ${pozo === hiddenField.value ? 'active' : ''}" data-pozo="${escapeHtml(pozo)}">
            <span class="pozo-status-dot"></span>
            <span class="pozo-option-name">${escapeHtml(pozo)}</span>
            <span class="pozo-option-state ${pozo === hiddenField.value ? 'active' : ''}">${pozo === hiddenField.value ? 'Seleccionado' : 'Disponible'}</span>
        </button>
    `).join('');

    menu.querySelectorAll('.pozo-selector-option').forEach(button => {
        button.addEventListener('click', () => selectFieldPozo(button.dataset.pozo || ''));
    });
}

function openFieldPozoMenu(ignoreSearch = false) {
    const menu = document.getElementById('field-pozo-menu');
    const wrap = document.querySelector('.field-pozo-selector-wrap');
    const toggle = document.getElementById('field-pozo-toggle');
    if (!menu || !wrap || availablePozos.length === 0) return;

    renderFieldPozoOptions(ignoreSearch);
    menu.classList.add('active');
    wrap.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
}

function closeFieldPozoMenu({ commitSearch = true } = {}) {
    const menu = document.getElementById('field-pozo-menu');
    const wrap = document.querySelector('.field-pozo-selector-wrap');
    const toggle = document.getElementById('field-pozo-toggle');

    if (commitSearch) {
        commitTypedPozoSelection();
    }

    menu?.classList.remove('active');
    wrap?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
}

function selectFieldPozo(pozoName) {
    const normalizedPozo = normalizePozoValue(pozoName);
    const hiddenField = document.getElementById('field-pozo');
    const displayField = document.getElementById('field-pozo-display');
    if (!hiddenField || !displayField) return;

    hiddenField.value = normalizedPozo;
    displayField.value = normalizedPozo;
    closeFieldPozoMenu({ commitSearch: false });
    persistDraft();
    updateSummary();
}

function syncPozoDisplayFromValue() {
    const hiddenField = document.getElementById('field-pozo');
    const displayField = document.getElementById('field-pozo-display');
    if (!hiddenField || !displayField) return;

    const normalizedPozo = normalizePozoValue(hiddenField.value);
    hiddenField.value = normalizedPozo;
    displayField.value = normalizedPozo;
}

function commitTypedPozoSelection() {
    const hiddenField = document.getElementById('field-pozo');
    const displayField = document.getElementById('field-pozo-display');
    if (!hiddenField || !displayField) return;

    const normalizedPozo = normalizePozoValue(displayField.value);
    if (!normalizedPozo) {
        hiddenField.value = '';
        displayField.value = '';
        return;
    }

    if (availablePozos.length === 0) {
        hiddenField.value = normalizedPozo;
        displayField.value = normalizedPozo;
        persistDraft();
        updateSummary();
        return;
    }

    const exactMatch = availablePozos.find(pozo => pozo === normalizedPozo);
    hiddenField.value = exactMatch || '';
    displayField.value = exactMatch || normalizedPozo;
    persistDraft();
    updateSummary();
}

function normalizePozoValue(value) {
    return String(value || '').trim().toUpperCase();
}

function handleDocumentClick(event) {
    const selector = document.getElementById('field-pozo-selector');
    if (!selector || selector.contains(event.target)) return;
    closeFieldPozoMenu();
}

function formatSubmittedTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function handlePreviewBackdropClick(event) {
    if (event.target?.id === 'field-report-preview-modal') {
        closeReportPreview();
    }
}

function handlePreviewKeydown(event) {
    if (event.key !== 'Escape') return;

    const pozoMenu = document.getElementById('field-pozo-menu');
    if (pozoMenu?.classList.contains('active')) {
        closeFieldPozoMenu();
        return;
    }

    const modal = document.getElementById('field-report-preview-modal');
    if (!modal || modal.hidden) return;
    closeReportPreview();
}

function openTicketModal() {
    const modal = document.getElementById('field-ticket-modal');
    if (!modal) return;
    modal.hidden = false;
    try { document.getElementById('ticket-subject').value = ''; } catch(e) {}
    try { document.getElementById('ticket-message').value = ''; } catch(e) {}
    try { document.getElementById('ticket-include-journey').checked = true; } catch(e) {}
    try { const att = document.getElementById('ticket-attachments'); if (att) att.value = ''; } catch(e) {}
    try { updateTicketAttachmentsLabel(); } catch(e) {}
}

function updateTicketAttachmentsLabel() {
    const input = document.getElementById('ticket-attachments');
    const label = document.getElementById('ticket-attachments-label');
    if (!label) return;
    if (!input || !input.files || input.files.length === 0) {
        label.textContent = 'No hay archivos';
        return;
    }
    if (input.files.length === 1) label.textContent = input.files[0].name;
    else label.textContent = `${input.files.length} archivos seleccionados`;
}

function closeTicketModal() {
    const modal = document.getElementById('field-ticket-modal');
    if (!modal) return;
    modal.hidden = true;
}

async function handleSendTicket() {
    const subjectEl = document.getElementById('ticket-subject');
    const messageEl = document.getElementById('ticket-message');
    const includeEl = document.getElementById('ticket-include-journey');
    if (!subjectEl || !messageEl) {
        showAlert('Formulario de ticket no disponible.', 'error');
        return;
    }

    const subject = String(subjectEl.value || '').trim();
    const message = String(messageEl.value || '').trim();
    const includeJourney = Boolean(includeEl?.checked);

    if (!subject || !message) {
        showAlert('Por favor completa asunto y mensaje del ticket.', 'error');
        return;
    }

    const journeyKey = includeJourney ? ensureDraftJourneyKey() : null;

    try {
        // collect attachments (images) and convert to data URLs
        const attachmentsInput = document.getElementById('ticket-attachments');
        let attachments = [];
        if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
            attachments = await readFilesAsDataURLs(Array.from(attachmentsInput.files));
        }

        await submitFieldTicket(journeyKey, subject, message, attachments);
        showAlert('Ticket enviado al equipo administrativo.', 'success');
        closeTicketModal();
        // refresh preview so ticket pill appears
        renderAdminPreview();
    } catch (err) {
        console.error('Error enviando ticket', err);
        showAlert(String(err?.message || err) || 'No se pudo enviar el ticket.', 'error');
    }
}

function getLocalTickets() {
    try {
        const raw = localStorage.getItem('uv-field-tickets');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function getCurrentJourneyTicketKey() {
    if (currentEditingJourneyId) return currentEditingJourneyId;
    return localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY) || null;
}

function getLocalTicketCountForJourney(journeyId) {
    if (journeyId === null || journeyId === undefined) return 0;
    return getLocalTickets().filter(ticket => String(ticket?.journey_key) === String(journeyId)).length;
}

function hasLocalTicketForJourney(journeyId) {
    if (journeyId === null || journeyId === undefined) return false;
    return getLocalTicketCountForJourney(journeyId) > 0;
}

function showProcessingModal() {
    const modal = document.getElementById('field-processing-modal');
    if (!modal) return;
    modal.hidden = false;
    const steps = document.querySelectorAll('#field-processing-steps [data-step]');
    steps.forEach(el => el.style.opacity = '0.6');
}

function hideProcessingModal() {
    const modal = document.getElementById('field-processing-modal');
    if (!modal) return;
    modal.hidden = true;
}

function setProcessingStep(stepNumber, text) {
    const el = document.querySelector(`#field-processing-steps [data-step="${stepNumber}"]`);
    if (!el) return;
    el.textContent = `✓ ${text}`;
    el.style.color = '#0f172a';
    el.style.fontWeight = '800';
    el.style.opacity = '1';
}

function pause(ms = 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureStepMinDuration(startTime, minMs = 5000) {
    const elapsed = Date.now() - startTime;
    if (elapsed < minMs) {
        await pause(minMs - elapsed);
    }
}

function readFilesAsDataURLs(files) {
    const tasks = files.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    }));
    return Promise.all(tasks).then(results => results.filter(Boolean));
}

async function openTicketViewer(journeyId) {
    const modal = document.getElementById('field-ticket-viewer-modal');
    if (!modal) return;
    await renderTicketViewer(journeyId);
    modal.hidden = false;
}

function closeTicketViewer() {
    const modal = document.getElementById('field-ticket-viewer-modal');
    if (!modal) return;
    modal.hidden = true;
}

function openPozoList(journeyId) {
    const modal = document.getElementById('field-pozo-list-modal');
    if (!modal) return;
    renderPozoList(journeyId);
    modal.hidden = false;
}

function closePozoList() {
    const modal = document.getElementById('field-pozo-list-modal');
    if (!modal) return;
    modal.hidden = true;
}

function renderPozoList(journeyId) {
    const listEl = document.getElementById('field-pozo-list');
    if (!listEl) return;
    const journeys = getSubmittedJourneys();
    const journey = journeys.find(j => String(j.id) === String(journeyId));
    if (!journey) {
        listEl.innerHTML = '<li>No se encontraron pozos para esta jornada.</li>';
        return;
    }
    const pozos = Array.isArray(journey.pozoNames) ? journey.pozoNames : [];
    if (pozos.length === 0) {
        listEl.innerHTML = '<li>No hay pozos registrados en esta jornada.</li>';
        return;
    }
    listEl.innerHTML = pozos.map(p => `<li style="margin:6px 0;">• ${escapeHtml(p)}</li>`).join('');
}

async function renderTicketViewer(journeyId) {
    const container = document.getElementById('field-ticket-list');
    if (!container) return;

    // local tickets
    const local = getLocalTickets().filter(t => String(t.journey_key) === String(journeyId));

    // server tickets (if any)
    let server = [];
    try {
        server = await getFieldTicketsByJourney(journeyId);
    } catch (e) {
        server = [];
    }

    const combined = [
        ...server.map(s => ({ ...s, _source: 'server' })),
        ...local.map(l => ({ ...l, _source: 'local' }))
    ];

    if (!combined || combined.length === 0) {
        container.innerHTML = '<div class="field-ticket-empty">No hay tickets vinculados a esta jornada.</div>';
        return;
    }

    container.innerHTML = combined.map(t => {
        const submitted = escapeHtml(t.submitted_at || t.createdAt || '');
        const subject = escapeHtml(t.subject || 'Sin asunto');
        const body = escapeHtml(t.message || '');

        const attsHtml = Array.isArray(t.attachments) && t.attachments.length ? `<div class="field-ticket-attachments">${t.attachments.map(a => {
            const src = a.url || a.dataUrl || a.publicUrl || '';
            const name = escapeHtml(a.name || 'archivo');
            return `<button class="ticket-thumb-btn" data-src="${src}"><img src="${src}" alt="${name}"/></button>`;
        }).join('')}</div>` : '';

        const badge = t._source === 'server' ? '<small style="color:#0f172a; opacity:0.7; margin-left:8px;">(enviado)</small>' : '<small style="color:#2563EB; opacity:0.9; margin-left:8px;">(local)</small>';

        return `
        <div class="field-ticket-card">
            <div class="field-ticket-card-header">
                <strong>${subject}${badge}</strong>
                <small>${submitted}</small>
            </div>
            <div class="field-ticket-card-body">
                <p>${body}</p>
                ${attsHtml}
            </div>
        </div>`;
    }).join('');

    // bind thumbnails to open in new tab/window
    container.querySelectorAll('.ticket-thumb-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const src = btn.dataset.src;
            if (!src) return;
            const w = window.open();
            w.document.write(`<img src="${src}" style="max-width:100%; height:auto; display:block; margin:20px auto;"/>`);
        });
    });
}

function createDraftJourneyKey() {
    return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDraftJourneyKey() {
    if (currentEditingJourneyId) return currentEditingJourneyId;
    const current = localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
    if (current) return current;
    const nextKey = createDraftJourneyKey();
    localStorage.setItem(DRAFT_JOURNEY_KEY_STORAGE_KEY, nextKey);
    return nextKey;
}

function getStoredLocalTickets() {
    try {
        const raw = localStorage.getItem('uv-field-tickets');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveStoredLocalTickets(tickets) {
    localStorage.setItem('uv-field-tickets', JSON.stringify(Array.isArray(tickets) ? tickets : []));
}

function relinkDraftTicketsToJourney(finalJourneyId) {
    const draftKey = localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
    if (!draftKey || !finalJourneyId) return;
    const tickets = getStoredLocalTickets();
    let changed = false;
    const nextTickets = tickets.map(ticket => {
        if (String(ticket?.journey_key) !== String(draftKey)) return ticket;
        changed = true;
        return {
            ...ticket,
            journey_key: finalJourneyId
        };
    });
    if (changed) saveStoredLocalTickets(nextTickets);
    localStorage.removeItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
}