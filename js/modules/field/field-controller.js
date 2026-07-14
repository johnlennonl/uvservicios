import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from '../../auth.js';
import { getUniquePozos } from '../../services/monitoring-service.js';
import { autosaveFieldJourneyDraft, submitFieldJourneyWorkflow, submitFieldTicket, getFieldTicketsByJourney, getFieldSubmittedJourneys, getFieldSubmittedJourneyDetail, getLatestFieldJourneyDraft } from '../../services/field-journey-service.js';
import { getWellRibbonData } from '../../services/technical-measurements-service.js';
import { validateFieldJourneyForSubmission, validateFieldReport } from './field-validation.js';

const DRAFT_STORAGE_KEY = 'uv-field-capture-draft';
const REPORTS_STORAGE_KEY = 'uv-field-capture-reports';
const DRAFT_JOURNEY_KEY_STORAGE_KEY = 'uv-field-draft-journey-key';
const CAPTURE_STARTED_STORAGE_KEY = 'uv-field-capture-started';
const ACCORDION_PROGRESS_STORAGE_KEY = 'uv-field-accordion-progress';
const MESSAGE_HEADER_STORAGE_KEY = 'uv-field-message-header';
const JOURNEY_STARTED_STORAGE_KEY = 'uv-field-journey-started';

const GENERAL_READONLY_FIELD_NAMES = ['campo', 'ef', 'estado', 'categoria', 'potencial', 'bruta', 'neta', 'ays_percentage'];
const BES_CONFIG_FIELD_NAMES = ['amp_nominal_motor', 'volt_nominal_motor', 'frec_max_hz', 'low_speed_hz', 'ul_a', 'ol_a', 'i_limit_a', 'tiempo_desaceleracion_seg', 'low_pip_shutdown_psi', 'max_high_temp_shutdown_f'];

const DEFAULT_MESSAGE_HEADER = {
    empresaMixta: 'PQQ',
    empresaServicios: 'U. V. Servicios.',
    actividad: 'Monitoreo de Equipos BES',
    personal: 'Personal UV Servicios en conjunto con personal de Operaciones PQQ.'
};

const REPORT_COLUMNS = [
    ['TÉCNICO 1', 'tecnico_1'],
    ['TÉCNICO 2', 'tecnico_2'],
    ['INGENIEROS / EQUIPO DE GUARDIA', 'equipo_guardia'],
    ['LOCACIÓN DE LA CAPTURA', 'locacion_jornada'],
    ['TURNO', 'jornada'],
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
    ['ABS IA PROM VSD', 'desv_fase_a'],
    ['ABS IB PROM VSD', 'desv_fase_b'],
    ['ABS IC PROM VSD', 'desv_fase_c'],
    ['MAXIMO ABS I VSD', 'max_desviacion_vsd'],
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
    ['% DESBALANCE CORRIENTE (AMP)', 'desbalance_corriente_primaria'],
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
    ['% DESBALANCE CORRIENTE [AMP]', 'desbalance_corriente_secundaria'],
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
        title: 'Captura',
        fields: ['tecnico_1', 'tecnico_2', 'equipo_guardia', 'locacion_jornada', 'jornada', 'pozo', 'campo', 'fecha', 'hora']
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
        fields: [
            'ff_x1_x2_v', 'ff_x2_x3_v', 'ff_x3_x1_v', 'promedio_fase_fase', 'desv_ff_x1_x2', 'desv_ff_x2_x3', 'desv_ff_x3_x1', 'max_desviacion_ff', 'desbalance_fase_fase',
            'ft_x1_tierra_v', 'ft_x2_tierra_v', 'ft_x3_tierra_v', 'promedio_fase_tierra', 'desv_ft_x1_tierra', 'desv_ft_x2_tierra', 'desv_ft_x3_tierra', 'max_desviacion_ft', 'desbalance_fase_tierra',
            'corriente_x1_x2_amp', 'corriente_x2_x3_amp', 'corriente_x3_x1_amp', 'promedio_corriente_primaria', 'desv_corriente_x1_x2', 'desv_corriente_x2_x3', 'desv_corriente_x3_x1', 'max_desviacion_corriente_primaria', 'desbalance_corriente_primaria'
        ]
    },
    {
        title: 'Tx bobina secundaria',
        fields: [
            'sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v', 'sec_promedio_fase_fase', 'sec_desv_ff_h1_h2', 'sec_desv_ff_h2_h3', 'sec_desv_ff_h3_h1', 'sec_max_desviacion_ff', 'sec_desbalance_fase_fase',
            'sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v', 'sec_promedio_fase_tierra', 'sec_desv_ft_h1_h2', 'sec_desv_ft_h2_h3', 'sec_desv_ft_h3_h1', 'sec_max_desviacion_ft', 'sec_desbalance_fase_tierra',
            'corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp', 'sec_promedio_corriente', 'sec_desv_corriente_h1_h2', 'sec_desv_corriente_h2_h3', 'sec_desv_corriente_h3_h1', 'sec_max_desviacion_corriente', 'desbalance_corriente_secundaria'
        ]
    },
    {
        title: 'Indicadores operacionales',
        fields: ['relacion_a_con_a_nom', 'porcentaje_amp', 'relacion_v_mot_v_nom', 'porcentaje_volt', 'pd_max_psi', 'delta_presion_psi', 'porcentaje_delta_presion', 'relacion_tm_t_max', 'porcentaje_temp', 'relacion_pip_min_pip', 'porcentaje_pip']
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
            ['Técnico 1', 'tecnico_1'],
            ['Técnico 2', 'tecnico_2'],
            ['Equipo de guardia', 'equipo_guardia'],
            ['Locacion de la captura', 'locacion_jornada'],
            ['Turno', 'jornada'],
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
            ['ABS IA PROM VSD', 'desv_fase_a'],
            ['ABS IB PROM VSD', 'desv_fase_b'],
            ['ABS IC PROM VSD', 'desv_fase_c'],
            ['MAXIMO ABS I VSD', 'max_desviacion_vsd'],
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
            ['Corriente X1-X2 [Amp]', 'corriente_x1_x2_amp'],
            ['Corriente X2-X3 [Amp]', 'corriente_x2_x3_amp'],
            ['Corriente X3-X1 [Amp]', 'corriente_x3_x1_amp'],
            ['Promedio Corriente Primaria', 'promedio_corriente_primaria'],
            ['Desv. Corriente X1-X2', 'desv_corriente_x1_x2'],
            ['Desv. Corriente X2-X3', 'desv_corriente_x2_x3'],
            ['Desv. Corriente X3-X1', 'desv_corriente_x3_x1'],
            ['Max Desv. Corriente Primaria', 'max_desviacion_corriente_primaria'],
            ['% Desbalance Corriente Primaria', 'desbalance_corriente_primaria'],
            ['Fase-Fase H1-H2 [Volt]', 'sec_ff_h1_h2_v'],
            ['Fase-Fase H2-H3 [Volt]', 'sec_ff_h2_h3_v'],
            ['Fase-Fase H3-H1 [Volt]', 'sec_ff_h3_h1_v'],
            ['Promedio Fase-Fase Secundaria', 'sec_promedio_fase_fase'],
            ['Desv. H1-H2', 'sec_desv_ff_h1_h2'],
            ['Desv. H2-H3', 'sec_desv_ff_h2_h3'],
            ['Desv. H3-H1', 'sec_desv_ff_h3_h1'],
            ['Max. Desv. Fase-Fase Sec', 'sec_max_desviacion_ff'],
            ['% Desbalance Fase-Fase Sec', 'sec_desbalance_fase_fase'],
            ['Fase-Tierra H1-Tierra [Volt]', 'sec_ft_h1_tierra_v'],
            ['Fase-Tierra H2-Tierra [Volt]', 'sec_ft_h2_tierra_v'],
            ['Fase-Tierra H3-Tierra [Volt]', 'sec_ft_h3_tierra_v'],
            ['Promedio Fase-Tierra Sec', 'sec_promedio_fase_tierra'],
            ['Desv. H1-Tierra', 'sec_desv_ft_h1_h2'],
            ['Desv. H2-Tierra', 'sec_desv_ft_h2_h3'],
            ['Desv. H3-Tierra', 'sec_desv_ft_h3_h1'],
            ['Max. Desv. Fase-Tierra Sec', 'sec_max_desviacion_ft'],
            ['% Desbalance Fase-Tierra Sec', 'sec_desbalance_fase_tierra'],
            ['Corriente H1-H2 [Amp]', 'corriente_h1_h2_amp'],
            ['Corriente H2-H3 [Amp]', 'corriente_h2_h3_amp'],
            ['Corriente H3-H1 [Amp]', 'corriente_h3_h1_amp'],
            ['Promedio Corriente Secundaria', 'sec_promedio_corriente'],
            ['Desv. Corriente H1-H2', 'sec_desv_corriente_h1_h2'],
            ['Desv. Corriente H2-H3', 'sec_desv_corriente_h2_h3'],
            ['Desv. Corriente H3-H1', 'sec_desv_corriente_h3_h1'],
            ['Max Desv. Corriente Secundaria', 'sec_max_desviacion_corriente'],
            ['% Desbalance Corriente Secundaria', 'desbalance_corriente_secundaria']
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

const FIELD_REVIEW_SUMMARY_ITEMS = [
    ['Pozo', 'pozo'],
    ['Fecha', 'fecha'],
    ['Hora', 'hora'],
    ['Estatus', 'estatus'],
    ['Frecuencia', 'frecuencia'],
    ['PIP', 'pip_psi'],
    ['THP', 'thp_psi'],
    ['CHP', 'chp_psi'],
    ['LF', 'lf_psi'],
    ['TM', 'tm_f'],
    ['I Motor', 'i_motor'],
    ['Observaciones', 'observaciones_pozo']
];

const FIELD_JOURNEY_STATUS_LABELS = {
    draft: 'Borrador',
    submitted: 'Pendiente de revisión',
    under_review: 'En revisión',
    approved: 'Aprobada',
    published: 'Publicada',
    rejected: 'Rechazada',
    archived: 'Archivada'
};

let currentEditingReportId = null;
let currentEditingJourneyId = null;
let CURRENT_ACCESS_PROFILE = null;
let availablePozos = [];
let isSubmittingJourney = false;
let productionPrefillRequestId = 0;
let isCaptureStarted = localStorage.getItem(CAPTURE_STARTED_STORAGE_KEY) === 'true';
let messageComposerReports = [];
let fieldSubmittedJourneys = [];
let fieldAdminPreviewRequestId = 0;
let isAutosavingJourneyDraft = false;
let pendingAutosaveJourneyDraft = false;
let isJourneyStarted = false;
let isBesConfigEditEnabled = false;

const FIELD_PRODUCTION_MEASURE_MAP = {
    campo: 'campo_name',
    ef: 'ef',
    categoria: 'cat_number',
    potencial: 'potencial',
    bruta: 'bbpd',
    neta: 'bnpd',
    ays_percentage: 'ays_percentage',
    amp_nominal_motor: 'amp_nominal_motor',
    volt_nominal_motor: 'volt_nominal_motor',
    frec_max_hz: 'frec_max_hz',
    low_speed_hz: 'low_speed_hz',
    ul_a: 'ul_a',
    ol_a: 'ol_a',
    i_limit_a: 'i_limit_a',
    tiempo_desaceleracion_seg: 'tiempo_desaceleracion_seg',
    low_pip_shutdown_psi: 'low_pip_shutdown_psi',
    max_high_temp_shutdown_f: 'max_high_temp_shutdown_f'
};

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
    syncJourneyFromTime();
    syncJourneyStartGate();
    await hydratePozoOptions();
    wireForm();
    recalculateComputedFields();
    renderJourneyReports();
    await restoreRemoteDraftIfNeeded();
    await renderAdminPreview();
    updateSummary();
    syncAddButtonState();
    updateEditingContext();
    updateStatus('Completa el bloque mínimo y agrega el pozo a la carga.');
    syncJourneyStartGate();
    syncCaptureGateState();
});

function bindStaticActions() {
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);
    document.getElementById('field-clear-form-btn')?.addEventListener('click', clearForm);
    document.getElementById('field-start-journey-btn')?.addEventListener('click', startFieldJourney);
    document.getElementById('field-add-report-btn')?.addEventListener('click', addCurrentReportToJourney);
    document.getElementById('field-start-capture-btn')?.addEventListener('click', handleStartCapture);
    document.getElementById('field-new-pozo-btn')?.addEventListener('click', startNewPozoCapture);
    document.getElementById('field-resume-edit-btn')?.addEventListener('click', resumeEditingCurrentPozo);
    document.getElementById('field-submit-journey-btn')?.addEventListener('click', submitJourneyForAdminPreview);
    document.getElementById('field-copy-journey-message-btn')?.addEventListener('click', copyJourneyMessageToClipboard);
    document.getElementById('field-back-to-capture-btn')?.addEventListener('click', scrollBackToCapture);
    document.getElementById('field-admin-filter-start')?.addEventListener('change', renderAdminPreview);
    document.getElementById('field-admin-filter-end')?.addEventListener('change', renderAdminPreview);
    document.getElementById('field-admin-filter-search')?.addEventListener('input', renderAdminPreview);
    document.getElementById('field-admin-filter-clear')?.addEventListener('click', clearAdminPreviewFilters);
    document.getElementById('field-report-preview-close')?.addEventListener('click', closeReportPreview);
    document.getElementById('field-message-composer-close')?.addEventListener('click', closeJourneyMessageComposer);
    document.getElementById('field-message-composer-copy')?.addEventListener('click', copyJourneyMessageFromComposer);
    document.getElementById('field-message-composer-refresh')?.addEventListener('click', syncJourneyMessageComposerText);
    document.getElementById('field-message-composer-modal')?.addEventListener('click', event => {
        if (event.target?.id === 'field-message-composer-modal') closeJourneyMessageComposer();
    });
    ['message-company-mixta', 'message-company-service', 'message-activity', 'message-personnel'].forEach(fieldId => {
        document.getElementById(fieldId)?.addEventListener('input', syncJourneyMessageComposerText);
    });
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

function preloadDefaults({ refreshDate = false, refreshTime = false } = {}) {
    const dateInput = document.getElementById('field-fecha');
    const timeInput = document.getElementById('field-hora');
    const now = new Date();

    if (dateInput && (refreshDate || !dateInput.value)) {
        dateInput.value = formatLocalDateInputValue(now);
    }

    if (timeInput && (refreshTime || !timeInput.value)) {
        timeInput.value = now.toTimeString().slice(0, 5);
    }

    syncJourneyFromTime();
}

function formatLocalDateInputValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function wireForm() {
    const form = document.getElementById('field-report-form');
    if (!form) return;

    initializeAccordionProgressControls();
    resetAccordionProgressControls();
    restoreAccordionProgressControls();

    form.querySelectorAll('input[type="number"]').forEach(input => {
        input.inputMode = 'decimal';
    });

    document.getElementById('field-diagnostico')?.addEventListener('change', syncDiagnosisCustomInputState);
    syncDiagnosisCustomInputState();

    form.addEventListener('input', () => {
        syncJourneyFromTime();
        recalculateComputedFields();
        persistDraft();
        updateSummary();
        syncCaptureGateState();
    });

    form.addEventListener('change', () => {
        syncJourneyFromTime();
        recalculateComputedFields();
        persistDraft();
        updateSummary();
        syncCaptureGateState();
    });

    const pozoDisplayField = document.getElementById('field-pozo-display');
    pozoDisplayField?.addEventListener('focus', () => openFieldPozoMenu());
    pozoDisplayField?.addEventListener('input', handlePozoDisplayInput);
    pozoDisplayField?.addEventListener('keydown', handlePozoDisplayKeydown);
    pozoDisplayField?.addEventListener('blur', handlePozoDisplayBlur);
    document.getElementById('field-pozo-toggle')?.addEventListener('click', handlePozoToggleClick);
    document.getElementById('field-jornada')?.addEventListener('change', enforceLockedJourneySelection);
    document.getElementById('field-bes-config-edit-btn')?.addEventListener('click', toggleBesConfigEditMode);
    syncReadonlyPrefilledFields();

    document.querySelectorAll('.field-accordion').forEach(details => {
        details.querySelector('summary')?.addEventListener('click', handleLockedAccordionClick);
        details.addEventListener('toggle', () => {
            if (details.classList.contains('is-locked') && details.open) {
                details.open = false;
                return;
            }

            if (details.open) {
                openOnlyAccordionSection(details);
            }
        });
    });
}

function startFieldJourney() {
    isJourneyStarted = true;
    localStorage.setItem(JOURNEY_STARTED_STORAGE_KEY, 'true');
    syncJourneyStartGate();
    updateStatus(getJourneyReports().length > 0 || localStorage.getItem(DRAFT_STORAGE_KEY)
        ? 'Jornada recuperada. Continúa la captura donde la dejaste.'
        : 'Jornada iniciada. Completa la cabecera y selecciona el pozo.', 'success');
    focusFieldById('field-tecnico-1');
}

function syncJourneyStartGate() {
    const formCard = document.querySelector('.field-form-card');
    const overlay = document.getElementById('field-journey-start-overlay');
    const startJourneyButton = document.getElementById('field-start-journey-btn');
    if (!formCard || !overlay) return;

    const hasWorkingData = getJourneyReports().length > 0 || Boolean(currentEditingReportId) || Boolean(localStorage.getItem(DRAFT_STORAGE_KEY));
    const unlocked = isJourneyStarted;
    formCard.classList.toggle('is-journey-start-locked', !unlocked);
    overlay.hidden = unlocked;
    if (startJourneyButton) {
        const label = startJourneyButton.querySelector('span');
        if (label) label.textContent = hasWorkingData ? 'Continuar jornada' : 'Iniciar jornada';
    }

    const overlayLabel = overlay.querySelector('.field-journey-start-card > span');
    const overlayTitle = overlay.querySelector('.field-journey-start-card > strong');
    const overlayCopy = overlay.querySelector('.field-journey-start-card > p');
    if (overlayLabel) overlayLabel.textContent = hasWorkingData ? 'Jornada en curso' : 'Jornada sin iniciar';
    if (overlayTitle) overlayTitle.textContent = hasWorkingData ? 'CONTINUAR JORNADA' : 'INICIAR JORNADA';
    if (overlayCopy) {
        overlayCopy.textContent = hasWorkingData
            ? 'Hay una captura recuperada. Continúa desde el punto donde quedó.'
            : 'Activa la captura para seleccionar técnico, pozo y comenzar el recorrido.';
    }
}

function initializeAccordionProgressControls() {
    getParameterSections().forEach((section, index) => {
        const summary = section.querySelector('summary');
        if (!summary || summary.dataset.progressReady === 'true') return;

        const title = summary.textContent.trim();
        summary.textContent = '';
        summary.dataset.progressReady = 'true';

        const titleElement = document.createElement('span');
        titleElement.className = 'field-accordion-title';
        titleElement.textContent = title;

        const actions = document.createElement('span');
        actions.className = 'field-accordion-actions';

        const loadedMark = document.createElement('span');
        loadedMark.className = 'field-accordion-loaded-mark';
        loadedMark.textContent = '✓';
        loadedMark.title = 'Sección cargada';
        loadedMark.hidden = true;

        const loadButton = document.createElement('button');
        loadButton.type = 'button';
        loadButton.className = 'field-accordion-action-btn field-accordion-load-btn';
        loadButton.textContent = 'Cargar';
        loadButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            markAccordionSectionLoaded(section, true);
        });

        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'field-accordion-action-btn field-accordion-update-btn';
        updateButton.textContent = 'Actualizar';
        updateButton.hidden = true;
        updateButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            markAccordionSectionLoaded(section, false);
            section.open = true;
        });

        actions.append(loadButton, updateButton, loadedMark);
        summary.append(titleElement, actions);
        section.dataset.sectionIndex = String(index);
    });
}

function markAccordionSectionLoaded(section, loaded) {
    if (!section || section.classList.contains('is-locked')) return;

    section.classList.toggle('is-loaded', loaded);
    section.open = !loaded;

    const loadButton = section.querySelector('.field-accordion-load-btn');
    const updateButton = section.querySelector('.field-accordion-update-btn');
    const loadedMark = section.querySelector('.field-accordion-loaded-mark');
    if (loadButton) loadButton.hidden = loaded;
    if (updateButton) updateButton.hidden = !loaded;
    if (loadedMark) loadedMark.hidden = !loaded;

    persistAccordionProgressControls();

    syncAccordionSequentialLocks();

    if (loaded) {
        openNextPendingAccordionSection(section);
    } else {
        openOnlyAccordionSection(section);
    }
}

function openOnlyAccordionSection(targetSection) {
    getParameterSections().forEach(section => {
        section.open = section === targetSection;
    });
}

function getFirstPendingAccordionSection() {
    return getParameterSections().find(section => !section.classList.contains('is-loaded')) || null;
}

function persistAccordionProgressControls() {
    const loadedIndexes = getParameterSections()
        .map((section, index) => section.classList.contains('is-loaded') ? index : null)
        .filter(index => index !== null);
    localStorage.setItem(ACCORDION_PROGRESS_STORAGE_KEY, JSON.stringify(loadedIndexes));
}

function restoreAccordionProgressControls() {
    let loadedIndexes = [];
    try {
        const parsed = JSON.parse(localStorage.getItem(ACCORDION_PROGRESS_STORAGE_KEY) || '[]');
        loadedIndexes = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        loadedIndexes = [];
    }

    getParameterSections().forEach((section, index) => {
        const loaded = loadedIndexes.includes(index);
        section.classList.toggle('is-loaded', loaded);
        const loadButton = section.querySelector('.field-accordion-load-btn');
        const updateButton = section.querySelector('.field-accordion-update-btn');
        const loadedMark = section.querySelector('.field-accordion-loaded-mark');
        if (loadButton) loadButton.hidden = loaded;
        if (updateButton) updateButton.hidden = !loaded;
        if (loadedMark) loadedMark.hidden = !loaded;
    });

    syncAccordionSequentialLocks();
    if (hasStartedCapture() && validateCaptureGate({ showMessage: false })) {
        openFirstPendingAccordionSection();
    }
}

function markAllAccordionSectionsLoaded() {
    getParameterSections().forEach(section => {
        section.classList.add('is-loaded');
        section.open = false;
        const loadButton = section.querySelector('.field-accordion-load-btn');
        const updateButton = section.querySelector('.field-accordion-update-btn');
        const loadedMark = section.querySelector('.field-accordion-loaded-mark');
        if (loadButton) loadButton.hidden = true;
        if (updateButton) updateButton.hidden = false;
        if (loadedMark) loadedMark.hidden = false;
    });

    persistAccordionProgressControls();
    syncAccordionSequentialLocks();
}

function openNextPendingAccordionSection(currentSection) {
    const sections = getParameterSections();
    const currentIndex = sections.indexOf(currentSection);
    const nextSection = sections.slice(currentIndex + 1).find(section => !section.classList.contains('is-loaded') && !section.classList.contains('is-locked'));
    if (!nextSection) return;

    openOnlyAccordionSection(nextSection);
    nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openFirstPendingAccordionSection() {
    const firstPendingSection = getFirstPendingAccordionSection();
    if (!firstPendingSection || firstPendingSection.classList.contains('is-locked')) {
        getParameterSections().forEach(section => {
            section.open = false;
        });
        return;
    }

    openOnlyAccordionSection(firstPendingSection);
    firstPendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncAccordionSequentialLocks() {
    const captureReady = hasStartedCapture() && validateCaptureGate({ showMessage: false });
    const firstPendingSection = captureReady ? getFirstPendingAccordionSection() : null;

    getParameterSections().forEach(section => {
        const locked = !captureReady || (!section.classList.contains('is-loaded') && section !== firstPendingSection);
        section.classList.toggle('is-locked', locked);
        if (locked) section.open = false;
        section.querySelectorAll('.field-accordion-body input, .field-accordion-body select, .field-accordion-body textarea, .field-accordion-action-btn').forEach(field => {
            field.disabled = locked;
        });
    });

    syncReadonlyPrefilledFields();
}

function toggleBesConfigEditMode(event) {
    event?.preventDefault();
    event?.stopPropagation();
    isBesConfigEditEnabled = !isBesConfigEditEnabled;
    syncReadonlyPrefilledFields();
    persistDraft();
}

function setNamedFieldsReadonly(fieldNames, readonly) {
    fieldNames.forEach(fieldName => {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (!field) return;
        field.readOnly = readonly;
        field.closest('.field-input-group')?.classList.toggle('field-input-group-readonly', readonly);
    });
}

function syncReadonlyPrefilledFields() {
    setNamedFieldsReadonly(GENERAL_READONLY_FIELD_NAMES, true);
    setNamedFieldsReadonly(BES_CONFIG_FIELD_NAMES, !isBesConfigEditEnabled);

    const button = document.getElementById('field-bes-config-edit-btn');
    if (!button) return;

    const section = button.closest('.field-accordion');
    const locked = Boolean(section?.classList.contains('is-locked'));
    button.disabled = locked;
    button.textContent = isBesConfigEditEnabled ? 'Bloquear configuración' : 'Editar configuración';
    button.classList.toggle('is-editing', isBesConfigEditEnabled);
}

function resetAccordionProgressControls() {
    getParameterSections().forEach(section => {
        section.classList.remove('is-loaded');
        section.open = false;
        const loadButton = section.querySelector('.field-accordion-load-btn');
        const updateButton = section.querySelector('.field-accordion-update-btn');
        const loadedMark = section.querySelector('.field-accordion-loaded-mark');
        if (loadButton) loadButton.hidden = false;
        if (updateButton) updateButton.hidden = true;
        if (loadedMark) loadedMark.hidden = true;
    });

    syncAccordionSequentialLocks();
}

function clearAccordionProgressControls() {
    localStorage.removeItem(ACCORDION_PROGRESS_STORAGE_KEY);
    resetAccordionProgressControls();
}

function getJourneyFromTime(timeValue) {
    const [hourText, minuteText = '0'] = String(timeValue || '').split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'Diurna';

    const minutesFromMidnight = (hour * 60) + minute;
    return minutesFromMidnight >= 360 && minutesFromMidnight < 1080 ? 'Diurna' : 'Nocturna';
}

function syncJourneyFromTime() {
    const timeField = document.getElementById('field-hora');
    const jornadaField = document.getElementById('field-jornada');
    if (!timeField || !jornadaField) return;

    const detectedJourney = getJourneyFromTime(timeField.value);
    jornadaField.value = detectedJourney;
    jornadaField.dataset.lockedValue = detectedJourney;
    jornadaField.disabled = true;
    jornadaField.title = `Turno detectado automáticamente por la hora: ${detectedJourney}.`;
}

function getParameterSections() {
    return Array.from(document.querySelectorAll('.field-accordion'));
}

function hasStartedCapture() {
    return isCaptureStarted || Boolean(currentEditingReportId);
}

function getHeaderMissingFields(payload = getFormPayload()) {
    const missing = [];
    if (!payload.tecnico_1) missing.push('selecciona el técnico 1');
    if (!payload.fecha) missing.push('elige la fecha');
    if (!payload.hora) missing.push('elige la hora');
    if (!payload.jornada) missing.push('elige la cuadrilla');
    if (!payload.pozo) missing.push('selecciona el pozo');
    return missing;
}

function getDuplicatePozoReport(pozoName, excludeReportId = currentEditingReportId) {
    const pozoKey = normalizePozoIdentity(pozoName);
    if (!pozoKey) return null;
    return getJourneyReports().find(report => report.id !== excludeReportId && normalizePozoIdentity(report.pozo) === pozoKey) || null;
}

function validateCaptureGate({ showMessage = false } = {}) {
    const payload = getFormPayload();
    const missing = getHeaderMissingFields(payload);
    if (missing.length) {
        if (showMessage) {
            const message = `Antes de empezar la captura, ${missing.join(', ')}.`;
            showAlert(message, 'warning');
            updateStatus(message, true);
            focusFieldById(!payload.tecnico_1 ? 'field-tecnico-1' : !payload.fecha ? 'field-fecha' : !payload.hora ? 'field-hora' : !payload.pozo ? 'field-pozo-display' : 'field-jornada');
        }
        return false;
    }

    return true;
}

function handleStartCapture() {
    if (!currentEditingReportId) {
        preloadDefaults({ refreshDate: true, refreshTime: true });
    }

    if (!validateCaptureGate({ showMessage: true })) {
        syncCaptureGateState();
        return;
    }

    isCaptureStarted = true;
    localStorage.setItem(CAPTURE_STARTED_STORAGE_KEY, 'true');
    syncCaptureGateState();
    openFirstPendingAccordionSection();
    updateStatus('Captura iniciada. Ya puedes abrir los bloques y llenar parámetros del pozo.', 'success');
}

function handleLockedAccordionClick(event) {
    const section = event.currentTarget?.closest?.('.field-accordion');
    if (!section) return;

    if (section.classList.contains('is-loaded')) {
        event.preventDefault();
        updateStatus('Esta sección ya quedó cargada. Usa Actualizar si necesitas corregir algo.', 'success');
        return;
    }

    if (!section.classList.contains('is-locked')) return;

    event.preventDefault();
    const payload = getFormPayload();
    const missing = getHeaderMissingFields(payload);
    const message = missing.length
        ? `Completa la cabecera antes de abrir parámetros: ${missing.join(', ')}.`
        : 'Presiona Empezar captura antes de abrir los parámetros.';
    updateStatus(message, true);
}

function setParameterSectionsLocked(locked) {
    if (locked) {
        getParameterSections().forEach(section => {
            section.classList.add('is-locked');
            section.open = false;
            section.querySelectorAll('.field-accordion-body input, .field-accordion-body select, .field-accordion-body textarea, .field-accordion-action-btn, .field-config-edit-btn').forEach(field => {
                field.disabled = true;
            });
        });
        syncReadonlyPrefilledFields();
        return;
    }

    syncAccordionSequentialLocks();
}

function syncCaptureGateState() {
    const captureReady = hasStartedCapture() && validateCaptureGate({ showMessage: false });
    const startButton = document.getElementById('field-start-capture-btn');
    setParameterSectionsLocked(!captureReady);
    if (startButton) {
        startButton.disabled = captureReady;
        startButton.textContent = captureReady
            ? 'Captura iniciada'
            : 'Iniciar captura';
    }

    const addButton = document.getElementById('field-add-report-btn');
    if (addButton) {
        addButton.disabled = !captureReady;
        addButton.title = captureReady ? '' : 'Completa cabecera, pozo y presiona Empezar captura.';
    }
}

function getFormPayload() {
    const form = document.getElementById('field-report-form');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.tecnico_1 = String(payload.tecnico_1 || '').trim();
    payload.tecnico_2 = String(payload.tecnico_2 || '').trim();
    payload.equipo_guardia = [payload.tecnico_1, payload.tecnico_2].filter(Boolean).join(', ');
    payload.pozo = String(document.getElementById('field-pozo')?.value || payload.pozo || '').trim().toUpperCase();
    payload.jornada = getJourneyFromTime(payload.hora || document.getElementById('field-hora')?.value || '');
    payload.sentido_giro = String(payload.sentido_giro || '').trim() || 'FWD';
    payload.diagnostico = resolveDiagnosisPayloadValue(payload.diagnostico);
    const guardField = document.getElementById('field-equipo-guardia');
    if (guardField) guardField.value = payload.equipo_guardia;
    return payload;
}

function resolveDiagnosisPayloadValue(selectedValue) {
    const normalizedValue = String(selectedValue || '').trim();
    if (normalizedValue !== 'OTRO') return normalizedValue;
    return String(document.getElementById('field-diagnostico-custom')?.value || '').trim() || 'OTRO';
}

function syncDiagnosisCustomInputState() {
    const diagnosisField = document.getElementById('field-diagnostico');
    const customField = document.getElementById('field-diagnostico-custom');
    if (!diagnosisField || !customField) return;

    const isCustom = diagnosisField.value === 'OTRO';
    customField.hidden = !isCustom;
    customField.disabled = !isCustom;
    if (!isCustom) customField.value = '';
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
                assignFieldValue(field, value ?? '');
            }
        });
        if (!payload.tecnico_1 && payload.equipo_guardia) {
            const [tecnico1 = '', tecnico2 = ''] = String(payload.equipo_guardia).split(',').map(item => item.trim());
            const tecnico1Field = document.querySelector('[name="tecnico_1"]');
            const tecnico2Field = document.querySelector('[name="tecnico_2"]');
            if (tecnico1Field) tecnico1Field.value = tecnico1;
            if (tecnico2Field) tecnico2Field.value = tecnico2;
        }
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
        tecnico_1: document.querySelector('[name="tecnico_1"]')?.value || '',
        tecnico_2: document.querySelector('[name="tecnico_2"]')?.value || '',
        locacion_jornada: document.querySelector('[name="locacion_jornada"]')?.value || ''
    };

    form.reset();
    currentEditingReportId = null;
    isBesConfigEditEnabled = false;
    isCaptureStarted = false;
    localStorage.removeItem(CAPTURE_STARTED_STORAGE_KEY);
    localStorage.removeItem(ACCORDION_PROGRESS_STORAGE_KEY);

    if (getJourneyReports().length === 0) {
        isJourneyStarted = false;
        localStorage.removeItem(JOURNEY_STARTED_STORAGE_KEY);
    }

    Object.entries(preserved).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) field.value = value;
    });

    preloadDefaults({ refreshDate: true, refreshTime: true });
    syncPozoDisplayFromValue();
    closeFieldPozoMenu({ commitSearch: false });
    clearAccordionProgressControls();
    recalculateComputedFields();
    persistDraft();
    updateSummary();
    updateStatus('Formulario listo para capturar otro pozo.');
    syncAddButtonState();
    syncJourneyFieldLocks();
    updateEditingContext();
    syncJourneyStartGate();
    syncCaptureGateState();
}

function startNewPozoCapture() {
    clearForm();
    scrollToPozoField();
    updateStatus('Formulario listo para capturar un pozo nuevo dentro de esta carga.');
}

function resumeEditingCurrentPozo() {
    const reports = getJourneyReports();
    const activeReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId) || null
        : null;
    const fallbackReport = reports[reports.length - 1] || null;
    const targetReport = activeReport || fallbackReport;

    if (!targetReport?.id) {
        scrollToPozoField();
        updateStatus('Todavía no hay pozos cargados. Empieza con un pozo nuevo.', true);
        return;
    }

    startEditingJourneyReport(targetReport.id);
}

async function addCurrentReportToJourney() {
    if (!hasStartedCapture() || !validateCaptureGate({ showMessage: true })) {
        syncCaptureGateState();
        return;
    }

    const payload = await resolveReportProductionMeasures(getFormPayload(), { writeToForm: true });
    const validation = validateFieldReport(payload, { context: 'field' });

    const confirmed = await reviewFieldReportBeforeSave(payload, validation, {
        isEditing: Boolean(currentEditingReportId)
    });

    if (!confirmed) {
        updateStatus(validation.message, !validation.isValid);
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
    syncJourneyStartGate();
    syncCaptureGateState();
    scheduleJourneyDraftAutosave();

    await handleSavedReportFlow(wasEditingReport, reportRecord);
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

function normalizeWorkflowRecordForDraft(record = {}) {
    const payload = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
    return {
        id: record.source_client_report_id || record.id || crypto.randomUUID(),
        ...payload,
        pozo: record.pozo ?? payload.pozo ?? '',
        campo: record.campo ?? payload.campo ?? '',
        ef: record.ef ?? payload.ef ?? '',
        estado: record.estado ?? payload.estado ?? '',
        categoria: record.categoria ?? payload.categoria ?? '',
        fecha: record.report_date ?? payload.fecha ?? '',
        hora: String(record.report_time ?? payload.hora ?? '').slice(0, 5),
        jornada: payload.jornada || getJourneyFromTime(record.report_time ?? payload.hora ?? ''),
        updatedAt: record.updated_at || payload.updatedAt || new Date().toISOString()
    };
}

async function restoreRemoteDraftIfNeeded() {
    if (getJourneyReports().length > 0 || localStorage.getItem(DRAFT_STORAGE_KEY)) return;

    try {
        const draft = await getLatestFieldJourneyDraft();
        const records = (draft?.records || []).map(normalizeWorkflowRecordForDraft);
        if (!draft?.journey?.id || records.length === 0) return;

        localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(records));
        localStorage.setItem(DRAFT_JOURNEY_KEY_STORAGE_KEY, draft.journey.id);
        currentEditingJourneyId = draft.journey.id;
        isJourneyStarted = false;
        localStorage.removeItem(JOURNEY_STARTED_STORAGE_KEY);
        renderJourneyReports();
        updateSummary();
        syncJourneyStartGate();
        syncCaptureGateState();
        updateStatus(`Borrador remoto recuperado: ${records.length} ${records.length === 1 ? 'pozo' : 'pozos'} en curso.`, 'success');
    } catch (error) {
        console.warn('No se pudo recuperar el borrador remoto de Campo:', error);
    }
}

async function autosaveJourneyDraftRemote() {
    const reports = getJourneyReports();
    const existingJourneyId = currentEditingJourneyId || localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY) || null;
    if ((reports.length === 0 && !existingJourneyId) || isSubmittingJourney) return;

    if (isAutosavingJourneyDraft) {
        pendingAutosaveJourneyDraft = true;
        return;
    }

    isAutosavingJourneyDraft = true;
    pendingAutosaveJourneyDraft = false;

    try {
        const result = await autosaveFieldJourneyDraft(reports, {
            journeyId: existingJourneyId
        });
        if (result?.journeyId) {
            currentEditingJourneyId = result.journeyId;
            localStorage.setItem(DRAFT_JOURNEY_KEY_STORAGE_KEY, result.journeyId);
        } else if (reports.length === 0) {
            currentEditingJourneyId = null;
            localStorage.removeItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
        }
        if (reports.length > 0) {
            updateStatus(`Respaldo automático guardado: ${reports.length} ${reports.length === 1 ? 'pozo' : 'pozos'} en la nube.`, 'success');
        }
    } catch (error) {
        console.warn('No se pudo guardar el borrador remoto de Campo:', error);
        updateStatus('Captura guardada localmente. Sin respaldo en nube por ahora; revisa la conexión antes de cerrar.', true);
    } finally {
        isAutosavingJourneyDraft = false;
        if (pendingAutosaveJourneyDraft) {
            pendingAutosaveJourneyDraft = false;
            autosaveJourneyDraftRemote();
        }
    }
}

function scheduleJourneyDraftAutosave() {
    autosaveJourneyDraftRemote();
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
    const currentEditingReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId) || null
        : null;
    const currentJourneyTicketKey = getCurrentJourneyTicketKey();
    const currentJourneyTicketCount = getLocalTicketCountForJourney(currentJourneyTicketKey);
    count.innerHTML = `${reports.length} ${reports.length === 1 ? 'pozo' : 'pozos'}${currentJourneyTicketCount > 0 ? ` <span class="field-journey-ticket-badge">${escapeHtml(String(currentJourneyTicketCount))} ticket${currentJourneyTicketCount === 1 ? '' : 's'}</span>` : ''}`;
    syncJourneyFieldLocks(reports);
    updateEditingContext(reports);

    if (reports.length === 0) {
        list.innerHTML = `
            <div class="field-journey-empty">
                <strong>Todavía no has agregado pozos a esta carga.</strong>
                <p>Empieza con el primer pozo y luego usa esta bandeja para continuar, corregir o quitar registros antes del envío.</p>
                <div class="field-journey-empty-steps">
                    <span>1. Completa la cabecera</span>
                    <span>2. Agrega el pozo</span>
                    <span>3. Sigue con el siguiente</span>
                </div>
            </div>`;
        return;
    }

    list.innerHTML = reports.map((report, index) => {
        const isEditing = report.id === currentEditingReportId;
        const isLast = index === reports.length - 1;

        return `
        <article class="field-journey-item${isEditing ? ' is-editing' : ''}">
            <div class="field-journey-item-top">
                <div>
                    <span class="field-journey-item-index">${index + 1}</span>
                    <div class="field-journey-item-title">${escapeHtml(String(report.pozo || '').toUpperCase())}</div>
                    <div class="field-journey-item-meta">${escapeHtml(report.fecha || '--')} | ${escapeHtml(report.hora || '--')} | ${escapeHtml(report.jornada || '--')}</div>
                </div>
                <div class="field-journey-actions">
                    ${currentJourneyTicketCount > 0 && currentJourneyTicketKey ? `<button type="button" class="field-journey-ticket" data-ticket-journey-id="${escapeHtml(String(currentJourneyTicketKey))}"><i class="fa-solid fa-envelope"></i> ${currentJourneyTicketCount}</button>` : ''}
                    <button type="button" class="field-journey-edit" data-report-id="${report.id}">${isEditing ? 'Sigues aquí' : 'Continuar'}</button>
                    <button type="button" class="field-journey-remove" data-report-id="${report.id}">Quitar</button>
                </div>
            </div>
            <div class="field-journey-item-progress">
                <span class="field-journey-pill${isEditing ? ' is-editing' : ''}">${isEditing ? 'En edición' : 'Listo para editar'}</span>
                ${isLast ? '<span class="field-journey-pill is-last">Último agregado</span>' : ''}
                ${report.locacion_jornada ? `<span class="field-journey-pill">${escapeHtml(report.locacion_jornada)}</span>` : ''}
            </div>
        </article>
    `;
    }).join('');

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

    currentEditingReportId = reportId;
    loadReportIntoForm(report);

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
    syncJourneyStartGate();
    syncCaptureGateState();
    scheduleJourneyDraftAutosave();
    updateStatus('Registro eliminado de la carga.');
}

function syncAddButtonState() {
    const addButton = document.getElementById('field-add-report-btn');
    if (!addButton) return;
    addButton.textContent = currentEditingReportId ? 'Actualizar registro' : 'Agregar registro a la carga';
}

function syncQuickActionButtons(reports = getJourneyReports()) {
    const quickActions = document.querySelector('.field-quick-actions');
    const newPozoButton = document.getElementById('field-new-pozo-btn');
    const resumeButton = document.getElementById('field-resume-edit-btn');
    const title = document.getElementById('field-quick-actions-title');
    const copy = document.getElementById('field-quick-actions-copy');
    const currentReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId) || null
        : null;
    const fallbackReport = reports[reports.length - 1] || null;

    if (quickActions) {
        quickActions.hidden = reports.length > 0 && !currentEditingReportId;
    }

    if (newPozoButton) {
        newPozoButton.textContent = currentEditingReportId ? 'Cambiar a nuevo pozo' : 'Nuevo pozo';
    }

    if (resumeButton) {
        resumeButton.disabled = !currentReport && !fallbackReport;
        resumeButton.textContent = currentReport
            ? `Seguir editando ${String(currentReport.pozo || '').toUpperCase() || 'pozo'}`
            : fallbackReport
                ? `Retomar ${String(fallbackReport.pozo || '').toUpperCase() || 'ultimo pozo'}`
                : 'Seguir editando';
    }

    if (title) {
        title.textContent = currentReport
            ? `Estas editando ${String(currentReport.pozo || '').toUpperCase() || 'un pozo'}.`
            : fallbackReport
                ? 'Ya tienes una carga armándose; puedes abrir el ultimo pozo o empezar uno nuevo.'
                : 'Arranca con un pozo nuevo o retoma el que estabas trabajando.';
    }

    if (copy) {
        copy.textContent = currentReport
            ? 'Si terminaste este ajuste, guarda y luego usa “Nuevo pozo” para seguir capturando otro dentro del mismo turno.'
            : fallbackReport
                ? '“Seguir editando” abre el ultimo pozo cargado. “Nuevo pozo” limpia el formulario pero conserva la cabecera de captura.'
                : 'Usa estos accesos para acelerar captura sin perder la carga que ya llevas armada.';
    }
}

function updateEditingContext(reports = getJourneyReports()) {
    const banner = document.getElementById('field-editing-context');
    const captureCard = document.querySelector('.field-form-card');
    if (!banner) return;

    banner.classList.remove('is-editing', 'is-building');
    captureCard?.classList.remove('is-journey-context', 'is-report-context');

    const currentReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId)
        : null;
    const journeyLabel = reports[0]?.jornada || document.getElementById('field-jornada')?.value || 'Diurna';

    if (currentReport) {
        banner.hidden = false;
        banner.classList.add('is-editing');
        captureCard?.classList.add('is-journey-context', 'is-report-context');
        banner.innerHTML = `
            <span class="field-continue-banner-label">Editando pozo</span>
            <div class="field-continue-banner-title">${escapeHtml(String(currentReport.pozo || '').toUpperCase())}</div>
            <div class="field-continue-banner-meta">Turno ${escapeHtml(journeyLabel)} · ${escapeHtml(String(reports.length))} ${reports.length === 1 ? 'pozo cargado' : 'pozos cargados'} · Los cambios que guardes actualizarán este registro.</div>
        `;
        return;
    }

    const draftJourneyId = currentEditingJourneyId || localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY);
    if (draftJourneyId || reports.length > 0) {
        banner.hidden = false;
        banner.classList.add('is-building');
        if (draftJourneyId) {
            captureCard?.classList.add('is-journey-context');
        }
        banner.innerHTML = `
            <span class="field-continue-banner-label">Carga en construcción</span>
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

    syncJourneyFromTime();
}

function enforceLockedJourneySelection() {
    const jornadaField = document.getElementById('field-jornada');
    if (!jornadaField || !jornadaField.disabled) return;
    jornadaField.value = jornadaField.dataset.lockedValue || jornadaField.value;
}

async function copyJourneyMessageToClipboard() {
    const reports = getJourneyReports();
    if (reports.length === 0) {
        const message = 'Agrega al menos un pozo para generar el mensaje de jornada.';
        showAlert(message, 'warning');
        updateStatus(message, true);
        return;
    }

    openJourneyMessageComposer(reports);
}

async function copySubmittedJourneyMessageToClipboard(journeyId) {
    const journey = await fetchSubmittedJourneyForField(journeyId);
    const reports = Array.isArray(journey?.records) ? journey.records : [];
    if (!journey || reports.length === 0) {
        showAlert('No hay registros disponibles para generar el mensaje de esta carga.', 'warning');
        return;
    }

    openJourneyMessageComposer(reports);
}

function openJourneyMessageComposer(reports = []) {
    messageComposerReports = Array.isArray(reports) ? [...reports] : [];
    const modal = document.getElementById('field-message-composer-modal');
    if (!modal || messageComposerReports.length === 0) return;

    const header = getStoredMessageHeader();
    setMessageInputValue('message-company-mixta', header.empresaMixta);
    setMessageInputValue('message-company-service', header.empresaServicios);
    setMessageInputValue('message-activity', header.actividad);
    setMessageInputValue('message-personnel', header.personal);
    syncJourneyMessageComposerText();
    modal.hidden = false;
    document.body.classList.add('field-preview-open');
    document.getElementById('field-message-composer-text')?.focus();
}

function closeJourneyMessageComposer() {
    const modal = document.getElementById('field-message-composer-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('field-preview-open');
}

function syncJourneyMessageComposerText() {
    const textArea = document.getElementById('field-message-composer-text');
    if (!textArea || messageComposerReports.length === 0) return;

    const header = getMessageHeaderFromInputs();
    textArea.value = buildJourneyShareMessage(messageComposerReports, header);
}

async function copyJourneyMessageFromComposer() {
    const textArea = document.getElementById('field-message-composer-text');
    if (!textArea) return;

    saveMessageHeader(getMessageHeaderFromInputs());
    await copyJourneyTextToClipboard(textArea.value);
    closeJourneyMessageComposer();
}

function getStoredMessageHeader() {
    try {
        const storedHeader = JSON.parse(localStorage.getItem(MESSAGE_HEADER_STORAGE_KEY) || '{}');
        return { ...DEFAULT_MESSAGE_HEADER, ...(storedHeader || {}) };
    } catch (error) {
        localStorage.removeItem(MESSAGE_HEADER_STORAGE_KEY);
        return { ...DEFAULT_MESSAGE_HEADER };
    }
}

function saveMessageHeader(header) {
    localStorage.setItem(MESSAGE_HEADER_STORAGE_KEY, JSON.stringify({
        ...DEFAULT_MESSAGE_HEADER,
        ...header
    }));
}

function getMessageHeaderFromInputs() {
    return {
        empresaMixta: getMessageInputValue('message-company-mixta'),
        empresaServicios: getMessageInputValue('message-company-service'),
        actividad: getMessageInputValue('message-activity'),
        personal: getMessageInputValue('message-personnel')
    };
}

function getMessageInputValue(fieldId) {
    return String(document.getElementById(fieldId)?.value || '').trim();
}

function setMessageInputValue(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field) field.value = value || '';
}

async function copyJourneyTextToClipboard(journeyMessage) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(journeyMessage);
        } else {
            copyTextWithFallback(journeyMessage);
        }

        showAlert('Mensaje de jornada copiado.', 'success');
        updateStatus('Mensaje de jornada copiado. Ya puedes pegarlo en WhatsApp o correo.');
    } catch (error) {
        copyTextWithFallback(journeyMessage);
        showAlert('Mensaje preparado. Si no se copió automáticamente, selecciona y copia el texto mostrado.', 'info');
    }
}

function buildJourneyShareMessage(reports = getJourneyReports(), messageHeader = DEFAULT_MESSAGE_HEADER) {
    const sortedReports = reports
        .map((report, index) => ({ report, index }))
        .sort((left, right) => {
            const leftDateTime = `${left.report.fecha || ''} ${left.report.hora || ''}`.trim();
            const rightDateTime = `${right.report.fecha || ''} ${right.report.hora || ''}`.trim();
            if (leftDateTime && rightDateTime && leftDateTime !== rightDateTime) {
                return leftDateTime.localeCompare(rightDateTime);
            }
            return left.index - right.index;
        })
        .map(item => item.report);
    const firstReport = sortedReports[0] || {};
    const journey = firstReport.jornada || document.getElementById('field-jornada')?.value || 'Diurna';
    const technicians = formatTechnicianCrew(firstReport);
    const date = formatShareDate(firstReport.fecha || document.getElementById('field-fecha')?.value || '');
    const headerConfig = { ...DEFAULT_MESSAGE_HEADER, ...(messageHeader || {}) };
    const header = [
        'Servicio de Monitoreo y Toma de Nivel.',
        headerConfig.empresaMixta ? `Empresa Mixta: ${headerConfig.empresaMixta}` : '',
        headerConfig.empresaServicios ? `Empresa de Servicios: ${headerConfig.empresaServicios}` : '',
        `Fecha ${date || '--'}`,
        `Cuadrilla ${journey}: ${technicians || '--'}`,
        headerConfig.actividad ? `Actividad Realizada: ${headerConfig.actividad}` : '',
        '',
        headerConfig.personal || ''
    ].filter((line, index, lines) => line || lines[index - 1] !== '');

    const wellBlocks = sortedReports.map(buildJourneyWellMessageBlock).filter(Boolean);
    return `${header.join('\n')}\n\n${wellBlocks.join('\n\n\n')}`;
}

function buildJourneyWellMessageBlock(report) {
    const lines = [
        `Pozo: ${String(report.pozo || '').toUpperCase() || '--'}`,
        `Hora ${formatShareValue(report.hora)}`
    ];

    const measurementLines = [
        ['Hz', report.frecuencia, 'Hz'],
        ['Sentido', report.sentido_giro],
        ['Modo de operación', report.modo_operacion],
        ['I VSD', formatSlashValues([report.i_vsd_a, report.i_vsd_b, report.i_vsd_c]), 'Amp'],
        ['V VSD', report.out_vsd, 'Volt'],
        ['I Mot', report.i_motor, 'Amp'],
        ['V Mot', report.v_motor, 'Volt'],
        ['PIP', report.pip_psi, 'psi'],
        ['PD', report.pd_psi, 'psi'],
        ['TI', report.ti_f, '°F'],
        ['TM', report.tm_f, '°F'],
        ['Vx', report.vx_g, 'G'],
        ['Vy', report.vy_g, 'G'],
        ['Vz', report.vz_g, 'G'],
        ['THP', report.thp_psi, 'psi'],
        ['CHP', report.chp_psi, 'psi'],
        ['LF', report.lf_psi, 'psi']
    ];

    measurementLines.forEach(([label, value, unit]) => {
        const formattedValue = formatShareValueWithUnit(value, unit);
        if (formattedValue) lines.push(`${label}: ${formattedValue}`);
    });

    lines.push(`Observaciones: ${formatShareValue(report.observaciones_pozo || 'Sin observaciones.')}`);
    return lines.join('\n');
}

function formatTechnicianCrew(report = {}) {
    const technicians = [report.tecnico_1, report.tecnico_2]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    if (technicians.length > 0) return technicians.join(' / ');
    return String(report.equipo_guardia || '').trim();
}

function formatShareDate(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';
    const [year, month, day] = rawValue.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return rawValue;
}

function formatSlashValues(values = []) {
    const formattedValues = values.map(formatShareValue).filter(value => value !== '');
    return formattedValues.length ? formattedValues.join(' /') : '';
}

function formatShareValue(value) {
    if (isBlankValue(value)) return '';
    return String(value).trim();
}

function formatShareValueWithUnit(value, unit = '') {
    const formattedValue = formatShareValue(value);
    if (!formattedValue) return '';
    return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function copyTextWithFallback(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
}

async function submitJourneyForAdminPreview() {
    if (isSubmittingJourney) {
        updateStatus('La captura ya se esta enviando a Admin Campo. Espera a que termine la sincronizacion.');
        return;
    }

    const reports = getJourneyReports();
    const journeyValidation = validateFieldJourneyForSubmission(reports);
    if (!journeyValidation.isValid) {
        showAlert(journeyValidation.message, 'warning');
        updateStatus(journeyValidation.message, true);
        focusFieldById(journeyValidation.focusField);
        return;
    }

    const resolvedJourneyId = currentEditingJourneyId || localStorage.getItem(DRAFT_JOURNEY_KEY_STORAGE_KEY) || null;
    if (resolvedJourneyId) {
        currentEditingJourneyId = resolvedJourneyId;
    }
    let mergedReports = reports;
    const isUpdatingExistingJourney = Boolean(resolvedJourneyId);
    let workflowResult;
    const submitButton = document.getElementById('field-submit-journey-btn');

    // show processing modal with steps
    showProcessingModal();
    isSubmittingJourney = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando captura...';
    }
    updateStatus('Sincronizando captura con Admin Campo...');

    try {
        // step 1 - ensure visible at least 5s
        setProcessingStep(1, 'Generando captura');
        const s1 = Date.now();
        await ensureStepMinDuration(s1, 5000);
        // execute server workflow (step 2 visible during network call)
        setProcessingStep(2, isUpdatingExistingJourney ? 'Actualizando captura en el servidor' : 'Cargando captura al servidor');
        const s2 = Date.now();
        mergedReports = await resolveJourneyProductionMeasures(mergedReports);
        workflowResult = await submitFieldJourneyWorkflow(mergedReports, {
            journeyId: resolvedJourneyId
        });
        await ensureStepMinDuration(s2, 5000);
        // step 3
        setProcessingStep(3, isUpdatingExistingJourney ? 'Finalizando actualizacion de captura' : 'Finalizando y marcando como enviada');
        const s3 = Date.now();
        await ensureStepMinDuration(s3, 5000);
        setProcessingStep(3, isUpdatingExistingJourney ? 'Captura actualizada exitosamente' : 'Captura enviada exitosamente');
    } catch (error) {
        showAlert(error?.message || 'No se pudo enviar la captura al workflow de Admin Campo.', 'error');
        updateStatus(error?.message || 'La captura no pudo sincronizarse con Admin Campo.', true);
        isSubmittingJourney = false;
        hideProcessingModal();
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar captura a revisión';
        }
        return;
    }

    relinkDraftTicketsToJourney(workflowResult.journeyId);
    await renderAdminPreview();
    resetJourneyWorkspace();
    showAlert(isUpdatingExistingJourney ? 'Captura actualizada en Admin Campo.' : 'Captura enviada a Admin Campo.', 'success');
    updateStatus(isUpdatingExistingJourney ? 'Han actualizado la captura y se sincronizó con Admin Campo.' : 'Captura enviada y sincronizada con Admin Campo.');

    isSubmittingJourney = false;
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar captura a revisión';
    }
    hideProcessingModal();
}

function updateSummary() {
    const reports = getJourneyReports();
    const payload = getFormPayload();
    const currentJourney = document.getElementById('field-summary-journey');
    const count = document.getElementById('field-summary-count');
    const last = document.getElementById('field-summary-last');
    const focus = document.getElementById('field-summary-focus');
    const focusCopy = document.getElementById('field-summary-focus-copy');
    const focusState = document.getElementById('field-summary-focus-state');
    const modeTitle = document.getElementById('field-summary-mode-title');
    const modeCopy = document.getElementById('field-summary-mode-copy');
    const submitCopy = document.getElementById('field-summary-submit-copy');
    const copyMessageButton = document.getElementById('field-copy-journey-message-btn');
    const guideSteps = Array.from(document.querySelectorAll('.field-journey-guide-steps span'));
    const currentEditingReport = currentEditingReportId
        ? reports.find(report => report.id === currentEditingReportId) || null
        : null;
    const lastReport = reports[reports.length - 1] || null;

    syncQuickActionButtons(reports);

    if (copyMessageButton) {
        copyMessageButton.disabled = reports.length === 0;
        copyMessageButton.title = reports.length === 0 ? 'Agrega pozos para generar el mensaje.' : 'Copiar mensaje operativo de la jornada.';
    }

    if (currentJourney) currentJourney.textContent = payload.jornada || 'Diurna';
    if (count) count.textContent = String(reports.length);
    if (last) {
        last.textContent = lastReport?.pozo ? String(lastReport.pozo).toUpperCase() : '--';
    }

    guideSteps.forEach((step, index) => {
        const shouldBeActive = (reports.length === 0 && index === 0)
            || (reports.length > 0 && !currentEditingReport && index === 1)
            || (reports.length > 0 && index === 2);
        step.classList.toggle('is-active', shouldBeActive);
    });

    if (reports.length === 0) {
        if (modeTitle) modeTitle.textContent = 'Construyendo carga';
        if (modeCopy) modeCopy.textContent = 'Empieza cargando el primer pozo. Cada registro queda guardado en esta captura mientras completas el turno.';
        if (focus) focus.textContent = 'Listo para empezar';
        if (focusCopy) focusCopy.textContent = 'Cuando selecciones un pozo para editar o agregues el primero, lo verás resaltado aquí.';
        if (focusState) {
            focusState.textContent = 'Nuevo';
            focusState.classList.remove('is-editing');
        }
        if (submitCopy) submitCopy.textContent = 'Cuando la lista esté completa, envía la captura para que administración la reciba como un solo paquete operativo.';
        return;
    }

    if (currentEditingReport) {
        if (modeTitle) modeTitle.textContent = 'Editando pozo en carga';
        if (modeCopy) modeCopy.textContent = 'Estás corrigiendo un registro ya cargado. Guarda los cambios y vuelve a la bandeja para continuar con el siguiente.';
        if (focus) focus.textContent = String(currentEditingReport.pozo || '').toUpperCase() || 'Pozo en edición';
        if (focusCopy) focusCopy.textContent = `Se conservará dentro del turno ${payload.jornada || currentEditingReport.jornada || 'Diurna'} cuando actualices el registro.`;
        if (focusState) {
            focusState.textContent = 'Editando';
            focusState.classList.add('is-editing');
        }
    } else {
        if (modeTitle) modeTitle.textContent = 'Carga lista para seguir';
        if (modeCopy) modeCopy.textContent = 'Ya tienes pozos cargados. Puedes continuar con otro pozo o abrir cualquiera de la bandeja para corregirlo.';
        if (focus) focus.textContent = lastReport?.pozo ? String(lastReport.pozo).toUpperCase() : 'Carga en curso';
        if (focusCopy) focusCopy.textContent = lastReport ? `Último registro agregado a las ${lastReport.hora || '--'}. Usa “Continuar” para editar cualquier pozo cargado.` : 'Revisa la bandeja y continúa con el siguiente pozo.';
        if (focusState) {
            focusState.textContent = 'En curso';
            focusState.classList.remove('is-editing');
        }
    }

    if (submitCopy) {
        submitCopy.textContent = reports.length === 1
            ? 'Ya tienes 1 pozo cargado. Si falta más del turno, sigue agregando; si ya terminaste, puedes enviar la captura.'
            : `Ya tienes ${reports.length} pozos cargados. Revisa la bandeja y envía la captura cuando el turno esté completo.`;
    }
}

function clearAdminPreviewFilters() {
    const startField = document.getElementById('field-admin-filter-start');
    const endField = document.getElementById('field-admin-filter-end');
    const searchField = document.getElementById('field-admin-filter-search');
    if (startField) startField.value = '';
    if (endField) endField.value = '';
    if (searchField) searchField.value = '';
    renderAdminPreview();
}

function getAdminPreviewFilters() {
    return {
        startDate: String(document.getElementById('field-admin-filter-start')?.value || '').trim(),
        endDate: String(document.getElementById('field-admin-filter-end')?.value || '').trim(),
        searchTerm: String(document.getElementById('field-admin-filter-search')?.value || '').trim()
    };
}

function normalizeJourneyStatusLabel(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return FIELD_JOURNEY_STATUS_LABELS[normalizedStatus] || status || 'Pendiente de revisión';
}

async function renderAdminPreview() {
    const count = document.getElementById('field-admin-preview-count');
    const list = document.getElementById('field-admin-preview-list');
    if (!count || !list) return;

    const requestId = ++fieldAdminPreviewRequestId;
    list.innerHTML = '<div class="field-admin-preview-empty">Cargando jornadas enviadas...</div>';

    try {
        fieldSubmittedJourneys = await getFieldSubmittedJourneys({
            ...getAdminPreviewFilters(),
            limit: 120
        });
    } catch (error) {
        if (requestId !== fieldAdminPreviewRequestId) return;
        count.textContent = 'Bandeja no disponible';
        list.innerHTML = `<div class="field-admin-preview-empty">${escapeHtml(error?.message || 'No se pudo cargar la bandeja real de Campo.')}</div>`;
        return;
    }

    if (requestId !== fieldAdminPreviewRequestId) return;

    const journeys = fieldSubmittedJourneys;
    count.textContent = `${journeys.length} ${journeys.length === 1 ? 'carga pendiente' : 'cargas pendientes'}`;

    if (journeys.length === 0) {
        list.innerHTML = '<div class="field-admin-preview-empty">No hay cargas enviadas con esos filtros.</div>';
        return;
    }

    list.innerHTML = journeys.map(journey => `
        <article class="field-admin-ticket">
            <div class="field-admin-ticket-top">
                <div>
                    <span class="field-admin-ticket-kicker">${escapeHtml(normalizeJourneyStatusLabel(journey.status))}</span>
                    <h3>${escapeHtml(journey.locacion_jornada || 'Locación sin definir')}</h3>
                    <p>${escapeHtml(journey.equipo_guardia || '--')} | ${escapeHtml(journey.journey_date || '--')} | ${escapeHtml(journey.jornada || '--')}</p>
                </div>
                <div style="display:flex; align-items:flex-start; gap:12px;">
                    <button type="button" class="field-admin-ticket-count-btn" data-journey-id="${journey.id}">${escapeHtml(String(journey.total_reports || 0))} ${Number(journey.total_reports || 0) === 1 ? 'pozo' : 'pozos'}</button>
                    <div class="field-admin-ticket-actions">
                        ${(hasLocalTicketForJourney(journey.id) || Number(journey.total_reports || 0) > 0) ? `<button type="button" class="field-admin-ticket-action field-admin-ticket-viewticket" data-journey-id="${journey.id}" title="Ver tickets"><i class="fa-solid fa-envelope-circle-check"></i></button>` : ''}
                        <button type="button" class="field-admin-ticket-action field-admin-ticket-copy-message" data-journey-id="${journey.id}" title="Copiar mensaje de jornada"><i class="fa-solid fa-copy"></i></button>
                        <button type="button" class="field-admin-ticket-action" data-preview-mode="journey" data-journey-id="${journey.id}" title="Ver carga"><i class="fa-solid fa-eye"></i></button>
                        <button type="button" class="field-admin-ticket-action" data-preview-mode="well" data-journey-id="${journey.id}" title="Ver por pozo"><i class="fa-solid fa-list"></i></button>
                        ${!CURRENT_ACCESS_PROFILE?.isFieldOperator ? `<button type="button" class="field-admin-ticket-action field-admin-ticket-excel" data-journey-id="${journey.id}" title="Obtener Excel"><i class="fa-solid fa-file-excel"></i></button>` : ''}
                        <button type="button" class="field-admin-ticket-action field-admin-ticket-recover" data-journey-id="${journey.id}" title="Recuperar"><i class="fa-solid fa-rotate-left"></i></button>
                    </div>
                </div>
            </div>
            <div class="field-admin-ticket-meta">
                <span>Ventana monitoreada: ${escapeHtml(journey.first_report_time || '--')} a ${escapeHtml(journey.last_report_time || '--')}</span>
                <span>Recibido: ${escapeHtml(formatSubmittedTimestamp(journey.submitted_at || journey.created_at))}</span>
            </div>
            <div class="field-admin-ticket-tags">
                ${(journey.pozoNames || []).map(pozo => `<span class="field-admin-ticket-tag">${escapeHtml(pozo)}</span>`).join('')}
            </div>
        </article>
    `).join('');

    list.querySelectorAll('.field-admin-ticket-action[data-preview-mode]').forEach(button => {
        button.addEventListener('click', () => openReportPreview(button.dataset.journeyId, button.dataset.previewMode));
    });

    list.querySelectorAll('.field-admin-ticket-viewticket').forEach(btn => {
        btn.addEventListener('click', () => openTicketViewer(btn.dataset.journeyId));
    });

    list.querySelectorAll('.field-admin-ticket-copy-message').forEach(button => {
        button.addEventListener('click', () => copySubmittedJourneyMessageToClipboard(button.dataset.journeyId));
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

    syncThreePhaseMetrics(
        ['sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v'],
        {
            average: 'sec_promedio_fase_fase',
            deviations: ['sec_desv_ff_h1_h2', 'sec_desv_ff_h2_h3', 'sec_desv_ff_h3_h1'],
            maxDeviation: 'sec_max_desviacion_ff',
            unbalance: 'sec_desbalance_fase_fase'
        }
    );

    syncThreePhaseMetrics(
        ['sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v'],
        {
            average: 'sec_promedio_fase_tierra',
            deviations: ['sec_desv_ft_h1_h2', 'sec_desv_ft_h2_h3', 'sec_desv_ft_h3_h1'],
            maxDeviation: 'sec_max_desviacion_ft',
            unbalance: 'sec_desbalance_fase_tierra'
        }
    );

    syncThreePhaseMetrics(
        ['corriente_x1_x2_amp', 'corriente_x2_x3_amp', 'corriente_x3_x1_amp'],
        {
            average: 'promedio_corriente_primaria',
            deviations: ['desv_corriente_x1_x2', 'desv_corriente_x2_x3', 'desv_corriente_x3_x1'],
            maxDeviation: 'max_desviacion_corriente_primaria',
            unbalance: 'desbalance_corriente_primaria'
        }
    );

    syncThreePhaseMetrics(
        ['corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp'],
        {
            average: 'sec_promedio_corriente',
            deviations: ['sec_desv_corriente_h1_h2', 'sec_desv_corriente_h2_h3', 'sec_desv_corriente_h3_h1'],
            maxDeviation: 'sec_max_desviacion_corriente',
            unbalance: 'desbalance_corriente_secundaria'
        }
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
        setFieldValue('porcentaje_delta_presion', pdMax === 0 ? '' : formatNumber((pd / pdMax) * 100));
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

function assignFieldValue(field, value) {
    const normalizedValue = String(value ?? '');
    if (field instanceof HTMLSelectElement && field.name === 'diagnostico') {
        assignDiagnosisFieldValue(field, normalizedValue);
        return;
    }
    if (field instanceof HTMLSelectElement && normalizedValue && !Array.from(field.options).some(option => option.value === normalizedValue)) {
        field.append(new Option(normalizedValue, normalizedValue));
    }
    field.value = normalizedValue;
}

function assignDiagnosisFieldValue(field, value) {
    const customField = document.getElementById('field-diagnostico-custom');
    const hasOption = Array.from(field.options).some(option => option.value === value);
    if (value && !hasOption) {
        field.value = 'OTRO';
        if (customField) customField.value = value;
        syncDiagnosisCustomInputState();
        return;
    }

    field.value = value;
    if (customField && value !== 'OTRO') customField.value = '';
    syncDiagnosisCustomInputState();
}

function isBlankValue(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

function normalizeMeasureValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function mapTechnicalDataToFieldMeasures(technicalData = {}) {
    return Object.entries(FIELD_PRODUCTION_MEASURE_MAP).reduce((measures, [fieldName, sourceField]) => {
        const value = technicalData?.[sourceField];
        if (!isBlankValue(value)) {
            measures[fieldName] = normalizeMeasureValue(value);
        }
        return measures;
    }, {});
}

async function fetchFieldProductionMeasures(pozoName) {
    const normalizedPozo = normalizePozoValue(pozoName);
    if (!normalizedPozo) return null;

    try {
        const technicalData = await getWellRibbonData(normalizedPozo);
        if (!technicalData) return null;
        return mapTechnicalDataToFieldMeasures(technicalData);
    } catch (error) {
        return null;
    }
}

async function resolveReportProductionMeasures(report = {}, options = {}) {
    const normalizedPozo = normalizePozoValue(report.pozo);
    if (!normalizedPozo) return report;

    const inheritedMeasures = await fetchFieldProductionMeasures(normalizedPozo);
    if (!inheritedMeasures) return report;

    const nextReport = { ...report, pozo: normalizedPozo };
    let inheritedCount = 0;

    Object.keys(FIELD_PRODUCTION_MEASURE_MAP).forEach(fieldName => {
        if (!isBlankValue(nextReport[fieldName])) return;
        if (isBlankValue(inheritedMeasures[fieldName])) return;

        nextReport[fieldName] = inheritedMeasures[fieldName];
        inheritedCount += 1;

        if (options.writeToForm) {
            setFieldValue(fieldName, inheritedMeasures[fieldName]);
        }
    });

    if (inheritedCount > 0 && options.writeToForm) {
        persistDraft();
        updateSummary();
    }

    return nextReport;
}

async function resolveJourneyProductionMeasures(reports = []) {
    return Promise.all((Array.isArray(reports) ? reports : []).map(report => resolveReportProductionMeasures(report)));
}

async function prefillProductionMeasuresForSelectedPozo(pozoName) {
    const requestId = ++productionPrefillRequestId;
    const inheritedMeasures = await fetchFieldProductionMeasures(pozoName);
    if (requestId !== productionPrefillRequestId) return;

    const locationField = document.getElementById('field-locacion-jornada');
    let loadedCount = 0;
    Object.keys(FIELD_PRODUCTION_MEASURE_MAP).forEach(fieldName => {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (!field) return;

        const inheritedValue = inheritedMeasures?.[fieldName] || '';
        field.value = fieldName === 'campo' && !inheritedValue ? (locationField?.value || '') : inheritedValue;
        if (!isBlankValue(inheritedValue)) loadedCount += 1;
    });

    const estadoField = document.querySelector('[name="estado"]');
    const estatusField = document.querySelector('[name="estatus"]');
    const actividadField = document.querySelector('[name="actividad"]');
    const sentidoGiroField = document.querySelector('[name="sentido_giro"]');
    if (estadoField && isBlankValue(estadoField.value)) estadoField.value = 'PC';
    if (estatusField && isBlankValue(estatusField.value)) estatusField.value = 'RUN';
    if (actividadField && isBlankValue(actividadField.value)) actividadField.value = 'MONITOREO';
    if (sentidoGiroField && isBlankValue(sentidoGiroField.value)) sentidoGiroField.value = 'FWD';

    persistDraft();
    recalculateComputedFields();
    updateSummary();
    updateStatus(loadedCount > 0
        ? `Información general cargada para ${normalizePozoValue(pozoName)} desde la ficha vigente.`
        : `No encontré ficha técnica para ${normalizePozoValue(pozoName)}. Revisa que tenga potencial, bruta, neta y AyS cargados en la base técnica.`);
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

async function openReportPreview(journeyId, mode = 'journey') {
    const journey = await fetchSubmittedJourneyForField(journeyId);
    if (!journey) {
        showAlert('No se encontró la carga seleccionada para la vista previa.', 'error');
        return;
    }

    const modal = document.getElementById('field-report-preview-modal');
    const title = document.getElementById('field-report-preview-title');
    const body = document.getElementById('field-report-preview-body');
    if (!modal || !title || !body) return;

    if (mode === 'well') {
        title.textContent = `Vista por pozo · ${journey.locacion_jornada || 'Carga'}`;
        body.innerHTML = buildWellPreviewMarkup(journey);
    } else {
        title.textContent = `Vista carga · ${journey.locacion_jornada || 'Carga'}`;
        body.innerHTML = buildJourneyPreviewMarkup(journey);
    }

    body.querySelectorAll('[data-edit-journey-id][data-edit-report-id]').forEach(button => {
        button.addEventListener('click', () => {
            restoreSubmittedJourneyToWorkspace(button.dataset.editJourneyId, button.dataset.editReportId);
            closeReportPreview();
        });
    });

    body.querySelectorAll('[data-delete-journey-id][data-delete-report-id]').forEach(button => {
        button.disabled = true;
        button.title = 'La bandeja real no elimina pozos desde Campo. Recupera la carga si necesitas corregirla.';
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
                <h3>Sin registros en la carga</h3>
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
                    <h3>${escapeHtml(journey.locacion_jornada || 'Carga sin locación')}</h3>
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
                <p>Guarda al menos un pozo dentro de la carga para ver esta presentación por ficha.</p>
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

function normalizeWorkflowTimeForField(value) {
    const normalized = String(value || '').trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized.slice(0, 5);
    return normalized;
}

function normalizeWorkflowRecordForField(record = {}) {
    const payload = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
    return {
        ...payload,
        id: payload.id || record.source_client_report_id || record.id || crypto.randomUUID(),
        pozo: String(record.pozo || payload.pozo || '').trim().toUpperCase(),
        fecha: record.report_date || payload.fecha || '',
        hora: normalizeWorkflowTimeForField(record.report_time || payload.hora || ''),
        campo: record.campo ?? payload.campo ?? '',
        ef: record.ef ?? payload.ef ?? '',
        estado: record.estado ?? payload.estado ?? '',
        categoria: record.categoria ?? payload.categoria ?? '',
        actividad: record.actividad ?? payload.actividad ?? '',
        estatus: record.estatus ?? payload.estatus ?? '',
        modo_operacion: record.modo_operacion ?? payload.modo_operacion ?? '',
        sentido_giro: record.sentido_giro ?? payload.sentido_giro ?? 'FWD',
        potencial: record.potencial ?? payload.potencial ?? '',
        bruta: record.bruta ?? payload.bruta ?? '',
        neta: record.neta ?? payload.neta ?? '',
        ays_percentage: record.ays_percentage ?? payload.ays_percentage ?? '',
        frecuencia: record.frecuencia ?? payload.frecuencia ?? '',
        i_motor: record.i_motor ?? payload.i_motor ?? '',
        v_motor: record.v_motor ?? payload.v_motor ?? '',
        out_vsd: record.out_vsd ?? payload.out_vsd ?? '',
        pip_psi: record.pip_psi ?? payload.pip_psi ?? '',
        pd_psi: record.pd_psi ?? payload.pd_psi ?? '',
        ti_f: record.ti_f ?? payload.ti_f ?? '',
        tm_f: record.tm_f ?? payload.tm_f ?? '',
        thp_psi: record.thp_psi ?? payload.thp_psi ?? '',
        chp_psi: record.chp_psi ?? payload.chp_psi ?? '',
        lf_psi: record.lf_psi ?? payload.lf_psi ?? '',
        observaciones_pozo: record.observaciones_pozo ?? payload.observaciones_pozo ?? '',
        diagnostico: record.diagnostico ?? payload.diagnostico ?? ''
    };
}

async function fetchSubmittedJourneyForField(journeyId) {
    try {
        const detail = await getFieldSubmittedJourneyDetail(journeyId);
        const records = (detail.records || []).map(normalizeWorkflowRecordForField);
        return buildSubmittedJourneyRecord({
            ...detail.journey,
            id: detail.journey.id,
            fecha: detail.journey.journey_date || '',
            createdAt: detail.journey.submitted_at || detail.journey.created_at || '',
            updatedAt: detail.journey.updated_at || '',
            status: normalizeJourneyStatusLabel(detail.journey.status),
            workflowStatus: detail.journey.status,
            records
        });
    } catch (error) {
        showAlert(error?.message || 'No se pudo abrir la jornada enviada.', 'error');
        return null;
    }
}

async function restoreSubmittedJourneyToWorkspace(journeyId, reportId = null) {
    const journey = await fetchSubmittedJourneyForField(journeyId);
    if (!journey || !Array.isArray(journey.records) || journey.records.length === 0) {
        showAlert('No se encontro una carga valida para recuperar.', 'error');
        return;
    }

    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(journey.records));
    currentEditingJourneyId = journey.id;
    isJourneyStarted = true;
    localStorage.setItem(JOURNEY_STARTED_STORAGE_KEY, 'true');
    renderJourneyReports();
    updateSummary();

    const targetReport = journey.records.find(record => record.id === reportId) || journey.records[0];
    if (targetReport) {
        currentEditingReportId = targetReport.id;
        loadReportIntoForm(targetReport);
        markAllAccordionSectionsLoaded();
    }

    closeReportPreview();
    persistDraft();
    recalculateComputedFields();
    syncAddButtonState();
    syncJourneyStartGate();
    syncCaptureGateState();
    updateEditingContext();
    scrollToCaptureStart();
    updateStatus(`Editando ${String(targetReport?.pozo || '').toUpperCase()} desde una carga recuperada.`);
    showAlert('Carga recuperada para seguir editando en Campo.', 'success');
}

function buildSubmittedJourneyRecord(baseJourney) {
    const records = Array.isArray(baseJourney.records) ? baseJourney.records : [];
    const firstReport = records[0] || {};
    const sortedReports = [...records].sort((left, right) => String(left.hora || '').localeCompare(String(right.hora || '')));

    return {
        ...baseJourney,
        jornada: baseJourney.jornada || firstReport.jornada || 'Diurna',
        fecha: baseJourney.fecha || firstReport.fecha || '',
        tecnico_1: baseJourney.tecnico_1 || firstReport.tecnico_1 || '',
        tecnico_2: baseJourney.tecnico_2 || firstReport.tecnico_2 || '',
        equipo_guardia: baseJourney.equipo_guardia || firstReport.equipo_guardia || '',
        locacion_jornada: baseJourney.locacion_jornada || firstReport.locacion_jornada || '',
        reportCount: records.length,
        firstHour: sortedReports[0]?.hora || '',
        lastHour: sortedReports[sortedReports.length - 1]?.hora || '',
        pozoNames: sortedReports.map(report => String(report.pozo || '').toUpperCase()).filter(Boolean),
        records
    };
}

async function exportJourneyToExcel(journeyId) {
    if (CURRENT_ACCESS_PROFILE?.isFieldOperator) {
        showAlert('No tienes permisos para exportar cargas.', 'error');
        return;
    }
    if (!window.ExcelJS) {
        showAlert('La libreria de Excel no esta disponible en esta vista.', 'error');
        return;
    }

    const journey = await fetchSubmittedJourneyForField(journeyId);
    if (!journey) {
        showAlert('No se encontro la carga para exportar.', 'error');
        return;
    }

    const sortedRecords = sortJourneyRecords(journey.records || []);
    if (sortedRecords.length === 0) {
        showAlert('La carga no tiene pozos para exportar.', 'warning');
        return;
    }

    updateStatus('Generando Excel de la captura...');

    try {
        const workbook = new window.ExcelJS.Workbook();
        workbook.creator = 'UV Servicios Campo';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.company = 'UV Servicios';

        const summarySheet = workbook.addWorksheet('Resumen', {
            views: [{ state: 'frozen', ySplit: 4 }]
        });
        const detailSheet = workbook.addWorksheet('Captura Campo', {
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
        updateStatus('Excel exportado con la captura ordenada por pozo y hora.');
    } catch (error) {
        showAlert('No se pudo generar el Excel de la captura.', 'error');
        updateStatus('Fallo la exportacion Excel de la captura.', true);
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
        ['Técnico 1', journey.tecnico_1 || '--'],
        ['Técnico 2', journey.tecnico_2 || '--'],
        ['Equipo de guardia', journey.equipo_guardia || '--'],
        ['Locacion', journey.locacion_jornada || '--'],
        ['Fecha', journey.fecha || '--'],
        ['Turno', journey.jornada || '--'],
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
        
        if (group.title) {
            worksheet.mergeCells(groupRowIndex, startColumn, groupRowIndex, endColumn);
            const groupCell = worksheet.getCell(groupRowIndex, startColumn);
            groupCell.value = group.title;
            groupCell.alignment = { vertical: 'middle', horizontal: 'center' };
            groupCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            groupCell.fill = solidFill(EXCEL_GROUP_COLORS[index % EXCEL_GROUP_COLORS.length]);
            groupCell.border = borderedCell();
        }

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
    isCaptureStarted = true;
    isBesConfigEditEnabled = false;
    localStorage.setItem(CAPTURE_STARTED_STORAGE_KEY, 'true');
    Object.entries(report).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) assignFieldValue(field, value ?? '');
    });

    syncJourneyFromTime();
    syncPozoDisplayFromValue();
    syncCaptureGateState();
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

async function handleSavedReportFlow(wasEditingReport, savedReport) {
    const savedMessage = wasEditingReport ? 'Registro actualizado exitosamente.' : 'Registro guardado exitosamente.';
    updateStatus(wasEditingReport ? 'Registro actualizado dentro de la carga.' : 'Registro guardado dentro de la carga.');

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
        title: 'Qué quieres hacer ahora?',
        text: 'Puedes seguir con otro pozo, continuar ajustando este mismo registro o dejar la carga lista por ahora.',
        confirmButtonText: 'Agregar otro pozo',
        denyButtonText: 'Seguir con este pozo',
        cancelButtonText: 'Dejar carga lista',
        showCancelButton: true,
        showDenyButton: true,
        reverseButtons: true
    });

    if (promptResult.isConfirmed) {
        clearForm();
        updateStatus('Formulario listo para capturar otro pozo dentro de esta carga.');
        scrollToPozoField();
        return;
    }

    if (promptResult.isDenied && savedReport) {
        currentEditingReportId = savedReport.id;
        loadReportIntoForm(savedReport);
        recalculateComputedFields();
        persistDraft();
        syncAddButtonState();
        updateSummary();
        updateEditingContext();
        updateStatus('Sigues trabajando sobre este pozo. Ajusta lo necesario y vuelve a guardar.');
        scrollToCaptureStart();
        return;
    }

    clearForm();
    updateStatus('Registro guardado. Puedes seguir revisando o enviar la captura a revisión.');
    scrollBackToCapture();
}

async function reviewFieldReportBeforeSave(payload, validation, options = {}) {
    if (!window.Swal) {
        if (!validation.isValid) {
            showAlert(validation.message, 'warning');
        }
        return validation.isValid;
    }

    const blockers = Array.isArray(validation.blockers) ? validation.blockers : [];
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    const infos = Array.isArray(validation.infos) ? validation.infos : [];
    const hasBlockers = blockers.length > 0;
    const isEditing = Boolean(options.isEditing);

    const result = await window.Swal.fire({
        icon: hasBlockers ? 'warning' : (warnings.length > 0 ? 'warning' : 'info'),
        title: isEditing ? 'Revisión antes de actualizar' : 'Revisión antes de agregar',
        html: buildFieldReviewModalHtml(payload, validation),
        width: 960,
        showCancelButton: true,
        showConfirmButton: !hasBlockers,
        confirmButtonText: warnings.length > 0 ? 'Guardar con alertas' : (isEditing ? 'Actualizar registro' : 'Agregar registro'),
        cancelButtonText: hasBlockers ? 'Corregir ahora' : 'Volver a editar',
        focusConfirm: false
    });

    if (hasBlockers && !result.isConfirmed) {
        const targetFieldId = resolveReviewFocusField(blockers, payload);
        focusFieldById(targetFieldId);
    }

    if (!hasBlockers && !result.isConfirmed && warnings.length === 0 && infos.length > 0) {
        focusFieldById('field-pozo-display');
    }

    return result.isConfirmed;
}

function buildFieldReviewModalHtml(payload, validation) {
    const summaryMarkup = FIELD_REVIEW_SUMMARY_ITEMS.map(([label, fieldName]) => `
        <div style="padding:12px; border:1px solid #e2e8f0; border-radius:14px; background:#fff; text-align:left;">
            <span style="display:block; color:#64748b; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">${escapeHtml(label)}</span>
            <strong style="display:block; margin-top:6px; color:#0f172a; font-size:14px; line-height:1.45;">${escapeHtml(formatFieldReviewValue(payload[fieldName], fieldName))}</strong>
        </div>
    `).join('');

    const blockers = Array.isArray(validation.blockers) ? validation.blockers : [];
    const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    const infos = Array.isArray(validation.infos) ? validation.infos : [];

    return `
        <div style="display:grid; gap:18px; text-align:left;">
            <div style="padding:14px 16px; border-radius:16px; background:${blockers.length ? '#fff7ed' : '#eff6ff'}; border:1px solid ${blockers.length ? '#fdba74' : '#bfdbfe'}; color:#334155; line-height:1.6;">
                ${escapeHtml(validation.message)}
            </div>
            <div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
                    <strong style="color:#0f172a; font-size:15px;">Resumen del registro</strong>
                    <span style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#f8fafc; border:1px solid #e2e8f0; color:#334155; font-size:12px; font-weight:800;">${countFilledFields(payload)} campo(s) con dato</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
                    ${summaryMarkup}
                </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
                <section style="padding:16px; border:1px solid #fecaca; border-radius:16px; background:#fff5f5;">
                    <strong style="display:block; color:#991b1b; margin-bottom:10px;">Bloqueos</strong>
                    ${buildFieldReviewIssueList(blockers, 'Sin bloqueos críticos. Puedes seguir.')}
                </section>
                <section style="padding:16px; border:1px solid #fde68a; border-radius:16px; background:#fffbeb;">
                    <strong style="display:block; color:#92400e; margin-bottom:10px;">Alertas</strong>
                    ${buildFieldReviewIssueList(warnings, 'Sin alertas relevantes en este registro.')}
                </section>
                <section style="padding:16px; border:1px solid #cbd5e1; border-radius:16px; background:#f8fafc;">
                    <strong style="display:block; color:#0f172a; margin-bottom:10px;">Ayudas</strong>
                    ${buildFieldReviewIssueList(infos, 'El registro ya trae contexto suficiente para guardarse.')}
                </section>
            </div>
        </div>
    `;
}

function buildFieldReviewIssueList(items = [], emptyCopy) {
    if (!items.length) {
        return `<p style="margin:0; color:#475569; line-height:1.6;">${escapeHtml(emptyCopy)}</p>`;
    }

    return `
        <ul style="margin:0; padding-left:18px; color:#334155; line-height:1.65; display:grid; gap:8px;">
            ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
    `;
}

function formatFieldReviewValue(value, fieldName) {
    const normalized = formatPreviewValue(value, fieldName);
    if (normalized === '--') return 'Sin dato';
    return normalized;
}

function countFilledFields(payload = {}) {
    return Object.entries(payload).filter(([fieldName, value]) => {
        if (fieldName === 'jornada' || fieldName === 'sentido_giro') return false;
        return String(value ?? '').trim() !== '';
    }).length;
}

function resolveReviewFocusField(blockers = [], payload = {}) {
    if (blockers.some(item => /pozo/i.test(item))) return 'field-pozo-display';
    if (blockers.some(item => /fecha/i.test(item))) return 'field-fecha';
    if (blockers.some(item => /hora/i.test(item))) return 'field-hora';
    if (!String(payload?.pozo || '').trim()) return 'field-pozo-display';
    return 'field-pozo-display';
}

function focusFieldById(fieldId) {
    if (!fieldId) return;
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
    field.select?.();
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
    localStorage.removeItem(CAPTURE_STARTED_STORAGE_KEY);
    localStorage.removeItem(ACCORDION_PROGRESS_STORAGE_KEY);
    localStorage.removeItem(JOURNEY_STARTED_STORAGE_KEY);
    currentEditingReportId = null;
    currentEditingJourneyId = null;
    isCaptureStarted = false;
    isJourneyStarted = false;

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
    clearAccordionProgressControls();
    syncJourneyStartGate();
    syncCaptureGateState();
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
    const searchKey = normalizePozoIdentity(searchTerm);
    const filteredPozos = availablePozos.filter(pozo => !searchTerm || pozo.includes(searchTerm) || normalizePozoIdentity(pozo).includes(searchKey));

    if (filteredPozos.length === 0) {
        menu.innerHTML = '<div class="pozo-selector-empty">No hay pozos para esa búsqueda.</div>';
        return;
    }

    menu.innerHTML = filteredPozos.map(pozo => {
        const isSelected = pozo === hiddenField.value;
        return `
        <button type="button" class="pozo-selector-option ${isSelected ? 'active' : ''}" data-pozo="${escapeHtml(pozo)}">
            <span class="pozo-status-dot"></span>
            <span class="pozo-option-name">${escapeHtml(pozo)}</span>
        </button>
    `;
    }).join('');

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
    syncLocationFromPozo(normalizedPozo);
    closeFieldPozoMenu({ commitSearch: false });
    persistDraft();
    updateSummary();
    syncCaptureGateState();
    prefillProductionMeasuresForSelectedPozo(normalizedPozo);
}

function syncPozoDisplayFromValue() {
    const hiddenField = document.getElementById('field-pozo');
    const displayField = document.getElementById('field-pozo-display');
    if (!hiddenField || !displayField) return;

    const normalizedPozo = normalizePozoValue(hiddenField.value);
    hiddenField.value = normalizedPozo;
    displayField.value = normalizedPozo;
    syncLocationFromPozo(normalizedPozo);
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
        syncLocationFromPozo(normalizedPozo);
        persistDraft();
        updateSummary();
        syncCaptureGateState();
        prefillProductionMeasuresForSelectedPozo(normalizedPozo);
        return;
    }

    const exactMatch = availablePozos.find(pozo => pozo === normalizedPozo)
        || availablePozos.find(pozo => normalizePozoIdentity(pozo) === normalizePozoIdentity(normalizedPozo));

    if (!exactMatch) {
        hiddenField.value = '';
        displayField.value = normalizedPozo;
        syncLocationFromPozo('');
        persistDraft();
        updateSummary();
        syncCaptureGateState();
        updateStatus(`Selecciona ${normalizedPozo} desde la lista de pozos para cargar sus medidas.`, true);
        return;
    }

    hiddenField.value = exactMatch;
    displayField.value = exactMatch;
    syncLocationFromPozo(exactMatch);
    persistDraft();
    updateSummary();
    syncCaptureGateState();
    prefillProductionMeasuresForSelectedPozo(exactMatch);
}

function normalizePozoValue(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizePozoIdentity(value) {
    return normalizePozoValue(value).replace(/[^A-Z0-9]/g, '');
}

function inferLocationFromPozo(pozoName) {
    const normalizedPozo = normalizePozoValue(pozoName);
    if (normalizedPozo.startsWith('CEI')) return 'LA CEIBA';
    if (normalizedPozo.startsWith('TOM')) return 'TOMOPORO';
    return '';
}

function syncLocationFromPozo(pozoName) {
    const inferredLocation = inferLocationFromPozo(pozoName);
    const locationField = document.getElementById('field-locacion-jornada');
    if (!inferredLocation || !locationField) return;

    locationField.value = inferredLocation;
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
    const messageModal = document.getElementById('field-message-composer-modal');
    if (messageModal && !messageModal.hidden) {
        closeJourneyMessageComposer();
        return;
    }

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
    const defaultLabels = {
        1: 'Generando captura...',
        2: 'Cargando captura al servidor...',
        3: 'Finalizando y marcando como enviada...'
    };
    steps.forEach(el => {
        el.classList.remove('is-active');
        el.textContent = defaultLabels[el.dataset.step] || el.textContent;
    });
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
    el.classList.add('is-active');
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

async function openPozoList(journeyId) {
    const modal = document.getElementById('field-pozo-list-modal');
    if (!modal) return;
    await renderPozoList(journeyId);
    modal.hidden = false;
}

function closePozoList() {
    const modal = document.getElementById('field-pozo-list-modal');
    if (!modal) return;
    modal.hidden = true;
}

async function renderPozoList(journeyId) {
    const listEl = document.getElementById('field-pozo-list');
    if (!listEl) return;
    listEl.innerHTML = '<li>Cargando pozos...</li>';
    const journey = await fetchSubmittedJourneyForField(journeyId);
    if (!journey) {
        listEl.innerHTML = '<li>No se encontraron pozos para esta carga.</li>';
        return;
    }
    const pozos = Array.isArray(journey.pozoNames) ? journey.pozoNames : [];
    if (pozos.length === 0) {
        listEl.innerHTML = '<li>No hay pozos registrados en esta carga.</li>';
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
        container.innerHTML = '<div class="field-ticket-empty">No hay tickets vinculados a esta captura.</div>';
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