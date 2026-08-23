import { supabase } from '../supabaseClient.js';

export const REPORT_COLUMNS = [
    ['POZO', 'pozo'],
    ['CAMPO', 'campo'],
    ['EF', 'ef'],
    ['ESTADO', 'estado'],
    ['CATEGORIA', 'categoria'],
    ['POTENCIAL', 'potencial'],
    ['BRUTA', 'bruta'],
    ['NETA', 'neta'],
    ['%AyS', 'ays_percentage'],
    ['FECHA', 'fecha'],
    ['MES', 'mes'],
    ['HORA', 'hora'],
    ['ACTIVIDAD', 'actividad'],
    ['ESTATUS', 'estatus'],
    ['FREC', 'frecuencia'],
    ['MODO DE OPERACIÓN', 'modo_operacion'],
    ['SENTIDO DE GIRO', 'sentido_giro'],
    ['I Motor [A]', 'i_motor'],
    ['V Motor (V)', 'v_motor'],
    ['Out VSD [V]', 'out_vsd'],
    ['I  VSD A [A]', 'i_vsd_a'],
    ['I   VSD B [A]', 'i_vsd_b'],
    ['I  VSD C  [A]', 'i_vsd_c'],
    ['PROM I VSD [A]', 'prom_i_vsd'],
    ['ABS IA PROM VSD', 'desv_fase_a'],
    ['ABS IB PROM VSD', 'desv_fase_b'],
    ['ABS IC PROM VSD', 'desv_fase_c'],
    ['MAXIMO ABS I VSD', 'max_desviacion_vsd'],
    ['% DESBALANCE CORRIENTE VSD [A]', 'desbalance_corriente_vsd'],
    ['POSEE SENSOR DE FONDO?', 'posee_sensor_fondo'],
    ['DESCARGA  DATAS DEL SENSOR', 'descarga_datas_sensor'],
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
    ['ESTADO DE PANEL DE SENSOR - CHOQUES', 'estado_panel_sensor_choques'],
    ['ESTADO DEL ATERRAMIENTO', 'estado_aterramiento'],
    ['CONDICION DEL CABLEADO', 'condicion_cableado'],
    ['CONDICION DE LA JAULA', 'condicion_caseta'],
    ['TEMPERATURA DE LA CASETA DEL VDF', 'temperatura_caseta'],
    ['ESTADO DE \nFOSA', 'estado_fosa_porcentaje'],
    ['ESTADO DEL BIW/CONECTOR', 'estado_biw_conector'],
    ['ESTADO DE MANÓMETROS', 'estado_manometros'],
    ['ESTADO DEL CABEZAL', 'estado_cabezal'],
    ['ESTADO DE TOMAMUESTRAS', 'estado_tomamuestras'],
    ['ESTADO CAJA DE VENTEO', 'estado_caja_venteo'],
    ['THP [Psi]', 'thp_psi'],
    ['CHP [psi]', 'chp_psi'],
    ['LF (psi)', 'lf_psi'],
    ['COND. CHP', 'cond_chp'],
    ['ECHOMETER?', 'echometer'],
    ['NIVEL DE FLUIDO [FT]', 'nivel_fluido_ft'],
    ['SUMERGENCIA [FT]', 'sumergencia_ft'],
    ['PIP ECHOMETER [PSI]', 'pip_echometer_psi'],
    ['DIAGNÓSTICO', 'diagnostico'],
    ['RESISTENCIA A-B            [OHM]', 'resistencia_ab_ohm'],
    ['RESISTENCIA B-C            [OHM]', 'resistencia_bc_ohm'],
    ['RESISTENCIA C-A         [OHM]', 'resistencia_ca_ohm'],
    ['AISLAMIENTO FASE-TIERRA [M OHM]', 'aislamiento_fase_tierra_mohm'],
    ['FASE-FASE            X1-X2      [VOLT]', 'ff_x1_x2_v'],
    ['FASE-FASE            X2-X3     [VOLT]', 'ff_x2_x3_v'],
    ['FASE-FASE            X3-X1      [VOLT]', 'ff_x3_x1_v'],
    ['PROMEDIO F-F PRIMARIO', 'promedio_fase_fase'],
    ['ABS X1-X2 PROM', 'desv_ff_x1_x2'],
    ['ABS X3-X2 PROM', 'desv_ff_x2_x3'],
    ['ABS X3-X1 PROM', 'desv_ff_x3_x1'],
    ['MAX ABS F-F PRIMARIO', 'max_desviacion_ff'],
    ['% DESBALANCE FASE/FASE (VOLT)', 'desbalance_fase_fase'],
    ['FASE-TIERRA            X1-X2      [VOLT]', 'ft_x1_tierra_v'],
    ['FASE-TIERRA            X2-X3      [VOLT]', 'ft_x2_tierra_v'],
    ['FASE-TIERRA            X3-X1     [VOLT]', 'ft_x3_tierra_v'],
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
    ['FASE-FASE            H1-H2      [VOLT]', 'sec_ff_h1_h2_v'],
    ['FASE-FASE            H2-H3     [VOLT]', 'sec_ff_h2_h3_v'],
    ['FASE-FASE            H3-H1      [VOLT]', 'sec_ff_h3_h1_v'],
    ['PROMEDIO FASE/FASE [VOLT]', 'sec_promedio_fase_fase'],
    ['ABS F-F H1-H2 PROMEDIO', 'sec_desv_ff_h1_h2'],
    ['ABS F-F H2-H3 PROMEDIO', 'sec_desv_ff_h2_h3'],
    ['ABS F-F H3-H1 PROMEDIO', 'sec_desv_ff_h3_h1'],
    ['MAX ABS F-F PROMEDIO SECUNDARIO', 'sec_max_desviacion_ff'],
    ['% DESBALANCE FASE/FASE [VOLT]', 'sec_desbalance_fase_fase'],
    ['FASE-TIERRA            H1-H2      [VOLT]', 'sec_ft_h1_tierra_v'],
    ['FASE-TIERRA            H2-H3      [VOLT]', 'sec_ft_h2_tierra_v'],
    ['FASE-TIERRA            H3-H1     [VOLT]', 'sec_ft_h3_tierra_v'],
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
    ['COL_SPACER_135', 'col_spacer_135'],
    ['RELACION                    A. CON / A. NOM ', 'relacion_a_con_a_nom'],
    ['% AMP', 'porcentaje_amp'],
    ['RELACION                   V. MOT / V. NOM', 'relacion_v_mot_v_nom'],
    ['% VOLT', 'porcentaje_volt'],
    ['PD MAX [PSI]', 'pd_max_psi'],
    ['D PRESIÓN [PSI]', 'delta_presion_psi'],
    ['% D PRESIÓN', 'porcentaje_delta_presion'],
    ['Tm / T MAX PERMISBLE', 'relacion_tm_t_max'],
    ['% TEMP', 'porcentaje_temp'],
    ['PIP MIN / PIP', 'relacion_pip_min_pip'],
    ['% PIP', 'porcentaje_pip'],
    ['TÉCNICO 1', 'tecnico_1'],
    ['TÉCNICO 2', 'tecnico_2'],
    ['REPORTE', 'reporte'],
    ['FABRICANTE', 'fabricante'],
    ['SUCCION (FT)', 'succion_ft'],
    ['BOMBA ', 'bomba'],
    ['MULTIFASICA', 'multifasica'],
    ['SEPARADOR DE GAS', 'separador_gas'],
    ['SELLOS', 'sellos'],
    ['MOTOR', 'motor'],
    ['SENSOR', 'sensor'],
    ['DRAIN VALVE', 'drainvalue'],
    ['OBSERVACIONES', 'observaciones_pozo']
];

export const EXCEL_SECTION_GROUPS = [
    { title: 'Informacion general', fields: ['pozo', 'campo', 'ef', 'estado', 'categoria', 'potencial', 'bruta', 'neta', 'ays_percentage'] },
    { title: 'Jornada', fields: ['fecha', 'mes', 'hora', 'actividad', 'estatus', 'frecuencia', 'modo_operacion', 'sentido_giro'] },
    { title: 'Parametros operacionales', fields: ['i_motor', 'v_motor', 'out_vsd', 'i_vsd_a', 'i_vsd_b', 'i_vsd_c', 'prom_i_vsd', 'desv_fase_a', 'desv_fase_b', 'desv_fase_c', 'max_desviacion_vsd', 'desbalance_corriente_vsd', 'posee_sensor_fondo', 'descarga_datas_sensor', 'pip_psi', 'pd_psi', 'ti_f', 'tm_f', 'vx_g', 'vy_g', 'vz_g'] },
    { title: 'Sistema BES', fields: ['amp_nominal_motor', 'volt_nominal_motor', 'frec_max_hz', 'low_speed_hz', 'ul_a', 'ol_a', 'i_limit_a', 'tiempo_desaceleracion_seg', 'low_pip_shutdown_psi', 'max_high_temp_shutdown_f'] },
    { title: 'Superficie', fields: ['baja_datos', 'vsd_kva', 'marca_vsd', 'modelo_vsd', 'tx_kva', 'tap_v', 'rt', 'estado_tx', 'estado_vsd', 'estado_panel_sensor_choques', 'estado_aterramiento', 'condicion_cableado', 'condicion_caseta', 'temperatura_caseta', 'estado_fosa_porcentaje', 'estado_biw_conector', 'estado_manometros', 'estado_cabezal', 'estado_tomamuestras', 'estado_caja_venteo'] },
    { title: 'Presiones de superficie', fields: ['thp_psi', 'chp_psi', 'lf_psi', 'cond_chp', 'echometer', 'nivel_fluido_ft', 'sumergencia_ft', 'pip_echometer_psi', 'diagnostico'] },
    { title: 'Prueba electrica', fields: ['resistencia_ab_ohm', 'resistencia_bc_ohm', 'resistencia_ca_ohm', 'aislamiento_fase_tierra_mohm'] },
    { title: 'Tx bobina primaria', fields: ['ff_x1_x2_v', 'ff_x2_x3_v', 'ff_x3_x1_v', 'promedio_fase_fase', 'desv_ff_x1_x2', 'desv_ff_x2_x3', 'desv_ff_x3_x1', 'max_desviacion_ff', 'desbalance_fase_fase', 'ft_x1_tierra_v', 'ft_x2_tierra_v', 'ft_x3_tierra_v', 'promedio_fase_tierra', 'desv_ft_x1_tierra', 'desv_ft_x2_tierra', 'desv_ft_x3_tierra', 'max_desviacion_ft', 'desbalance_fase_tierra', 'corriente_x1_x2_amp', 'corriente_x2_x3_amp', 'corriente_x3_x1_amp', 'promedio_corriente_primaria', 'desv_corriente_x1_x2', 'desv_corriente_x2_x3', 'desv_corriente_x3_x1', 'max_desviacion_corriente_primaria', 'desbalance_corriente_primaria'] },
    { title: 'Tx bobina secundaria', fields: ['sec_ff_h1_h2_v', 'sec_ff_h2_h3_v', 'sec_ff_h3_h1_v', 'sec_promedio_fase_fase', 'sec_desv_ff_h1_h2', 'sec_desv_ff_h2_h3', 'sec_desv_ff_h3_h1', 'sec_max_desviacion_ff', 'sec_desbalance_fase_fase', 'sec_ft_h1_tierra_v', 'sec_ft_h2_tierra_v', 'sec_ft_h3_tierra_v', 'sec_promedio_fase_tierra', 'sec_desv_ft_h1_h2', 'sec_desv_ft_h2_h3', 'sec_desv_ft_h3_h1', 'sec_max_desviacion_ft', 'sec_desbalance_fase_tierra', 'corriente_h1_h2_amp', 'corriente_h2_h3_amp', 'corriente_h3_h1_amp', 'sec_promedio_corriente', 'sec_desv_corriente_h1_h2', 'sec_desv_corriente_h2_h3', 'sec_desv_corriente_h3_h1', 'sec_max_desviacion_corriente', 'desbalance_corriente_secundaria', 'col_spacer_135'] },
    { title: 'Indicadores operacionales', fields: ['relacion_a_con_a_nom', 'porcentaje_amp', 'relacion_v_mot_v_nom', 'porcentaje_volt', 'pd_max_psi', 'delta_presion_psi', 'porcentaje_delta_presion', 'relacion_tm_t_max', 'porcentaje_temp', 'relacion_pip_min_pip', 'porcentaje_pip'] },
    { title: 'Tecnicos', fields: ['tecnico_1', 'tecnico_2'] },
    { title: '', fields: ['reporte', 'fabricante', 'succion_ft', 'bomba', 'multifasica', 'separador_gas', 'sellos', 'motor', 'sensor', 'drainvalue'] },
    { title: 'Observaciones', fields: ['observaciones_pozo'] }
];

export const EXCEL_GROUP_COLORS = ['1D4ED8', '7C3AED', '0F766E', 'B45309', 'BE123C', '0F766E', '475569', '1D4ED8', '7C2D12', '7F1D1D'];
const EXCEL_LOGO_PLACEMENT = { tl: { col: 0.1, row: 0.15 }, ext: { width: 118, height: 84 } };
const COMPACT_EXCEL_COLUMN_WIDTHS = {
    pozo: 14,
    campo: 18,
    fecha: 13,
    hora: 10,
    locacion_jornada: 24,
    jornada: 13,
    tecnico_1: 20,
    tecnico_2: 20
};
const REPORT_COLUMN_MAP = new Map(REPORT_COLUMNS.map(([label, fieldName]) => [fieldName, { label, fieldName }]));
export const EXCEL_EXPORT_COLUMNS = EXCEL_SECTION_GROUPS.flatMap(group => (
    group.fields.map(fieldName => {
        const column = REPORT_COLUMN_MAP.get(fieldName);
        return column ? { ...column, groupTitle: group.title } : null;
    }).filter(Boolean)
));

const WELL_PREVIEW_SECTIONS = [
    { title: 'Informacion general', items: [['Tecnico 1', 'tecnico_1'], ['Tecnico 2', 'tecnico_2'], ['Equipo de guardia', 'equipo_guardia'], ['Locacion de la jornada', 'locacion_jornada'], ['Jornada', 'jornada'], ['Campo', 'campo'], ['EF', 'ef'], ['Estado', 'estado'], ['Categoria', 'categoria'], ['Potencial', 'potencial'], ['Bruta', 'bruta'], ['Neta', 'neta'], ['% AyS', 'ays_percentage'], ['Actividad', 'actividad'], ['Estatus', 'estatus'], ['Modo de operacion', 'modo_operacion'], ['Sentido de giro', 'sentido_giro']] },
    { title: 'Parametros operacionales', items: [['Frec', 'frecuencia'], ['I Motor [A]', 'i_motor'], ['V Motor [V]', 'v_motor'], ['Out VSD [V]', 'out_vsd'], ['I VSD A [A]', 'i_vsd_a'], ['I VSD B [A]', 'i_vsd_b'], ['I VSD C [A]', 'i_vsd_c'], ['Prom I VSD [A]', 'prom_i_vsd'], ['ABS IA PROM VSD', 'desv_fase_a'], ['ABS IB PROM VSD', 'desv_fase_b'], ['ABS IC PROM VSD', 'desv_fase_c'], ['MAXIMO ABS I VSD', 'max_desviacion_vsd'], ['% Desbalance Corriente VSD', 'desbalance_corriente_vsd'], ['Posee sensor de fondo', 'posee_sensor_fondo'], ['Descarga datas del sensor', 'descarga_datas_sensor'], ['PIP [psi]', 'pip_psi'], ['PD [psi]', 'pd_psi'], ['Ti [F]', 'ti_f'], ['Tm [F]', 'tm_f'], ['Vx [G]', 'vx_g'], ['Vy [G]', 'vy_g'], ['Vz [G]', 'vz_g']] },
    { title: 'Sistema BES y superficie', items: [['Amp nominal motor [A]', 'amp_nominal_motor'], ['Volt nominal motor [V]', 'volt_nominal_motor'], ['Frec max [Hz]', 'frec_max_hz'], ['Low speed [Hz]', 'low_speed_hz'], ['UL [A]', 'ul_a'], ['OL [A]', 'ol_a'], ['I-Limit [A]', 'i_limit_a'], ['Tiempo de desaceleracion [seg]', 'tiempo_desaceleracion_seg'], ['Low PIP shut down [psi]', 'low_pip_shutdown_psi'], ['Max high temp. shut down [F]', 'max_high_temp_shutdown_f'], ['Baja datos', 'baja_datos'], ['VSD [KVA]', 'vsd_kva'], ['Marca VSD', 'marca_vsd'], ['Modelo VSD', 'modelo_vsd'], ['Tx [KVA]', 'tx_kva'], ['Tap [V]', 'tap_v'], ['R.T', 'rt'], ['Estado del Tx', 'estado_tx'], ['Estado del VSD', 'estado_vsd'], ['Estado panel sensor / choques', 'estado_panel_sensor_choques'], ['Estado del aterramiento', 'estado_aterramiento'], ['Condicion del cableado', 'condicion_cableado'], ['Condicion de la jaula', 'condicion_caseta'], ['Temperatura de la caseta del VDF', 'temperatura_caseta'], ['Estado de fosa [%]', 'estado_fosa_porcentaje'], ['Estado del BIW/conector', 'estado_biw_conector'], ['Estado de manometros', 'estado_manometros'], ['Estado del cabezal', 'estado_cabezal'], ['Estado de tomamuestras', 'estado_tomamuestras'], ['Estado caja de venteo', 'estado_caja_venteo']] },
    { title: 'Presiones de superficie', items: [['THP [psi]', 'thp_psi'], ['CHP [psi]', 'chp_psi'], ['LF [psi]', 'lf_psi'], ['Cond. CHP', 'cond_chp'], ['Echometer', 'echometer'], ['Nivel de fluido [ft]', 'nivel_fluido_ft'], ['Sumergencia [ft]', 'sumergencia_ft'], ['PIP Echometer [psi]', 'pip_echometer_psi'], ['Diagnostico', 'diagnostico']] },
    { title: 'Pruebas electricas y transformador', items: [['Resistencia A-B [Ohm]', 'resistencia_ab_ohm'], ['Resistencia B-C [Ohm]', 'resistencia_bc_ohm'], ['Resistencia C-A [Ohm]', 'resistencia_ca_ohm'], ['Aislamiento fase-tierra [MOhm]', 'aislamiento_fase_tierra_mohm'], ['Fase-Fase X1-X2 [Volt]', 'ff_x1_x2_v'], ['Fase-Fase X2-X3 [Volt]', 'ff_x2_x3_v'], ['Fase-Fase X3-X1 [Volt]', 'ff_x3_x1_v'], ['Promedio Fase-Fase', 'promedio_fase_fase'], ['Desv. X1-X2', 'desv_ff_x1_x2'], ['Desv. X2-X3', 'desv_ff_x2_x3'], ['Desv. X3-X1', 'desv_ff_x3_x1'], ['Max. Desviacion Fase-Fase', 'max_desviacion_ff'], ['% Desbalance Fase-Fase', 'desbalance_fase_fase'], ['Fase-Tierra X1-Tierra [Volt]', 'ft_x1_tierra_v'], ['Fase-Tierra X2-Tierra [Volt]', 'ft_x2_tierra_v'], ['Fase-Tierra X3-Tierra [Volt]', 'ft_x3_tierra_v'], ['Promedio Fase-Tierra', 'promedio_fase_tierra'], ['Desv. X1-Tierra', 'desv_ft_x1_tierra'], ['Desv. X2-Tierra', 'desv_ft_x2_tierra'], ['Desv. X3-Tierra', 'desv_ft_x3_tierra'], ['Max. Desviacion Fase-Tierra', 'max_desviacion_ft'], ['% Desbalance Fase-Tierra', 'desbalance_fase_tierra'], ['Fase-Fase H1-H2 [Volt]', 'sec_ff_h1_h2_v'], ['Fase-Fase H2-H3 [Volt]', 'sec_ff_h2_h3_v'], ['Fase-Fase H3-H1 [Volt]', 'sec_ff_h3_h1_v'], ['% Desbalance Fase/Fase Secundaria', 'sec_desbalance_fase_fase'], ['Fase-Tierra H1-Tierra [Volt]', 'sec_ft_h1_tierra_v'], ['Fase-Tierra H2-Tierra [Volt]', 'sec_ft_h2_tierra_v'], ['Fase-Tierra H3-Tierra [Volt]', 'sec_ft_h3_tierra_v'], ['% Desbalance Fase/Tierra Secundaria', 'sec_desbalance_fase_tierra'], ['Corriente X1-X2 [Amp]', 'corriente_x1_x2_amp'], ['Corriente H1-H2 [Amp]', 'corriente_h1_h2_amp'], ['Corriente H2-H3 [Amp]', 'corriente_h2_h3_amp'], ['Corriente H3-H1 [Amp]', 'corriente_h3_h1_amp'], ['% Desbalance Corriente', 'desbalance_corriente_secundaria']] },
    { title: 'Indicadores operacionales', items: [['Relacion A. Con. / A. Nom', 'relacion_a_con_a_nom'], ['% Amp', 'porcentaje_amp'], ['Relacion V. Mot / V. Nom', 'relacion_v_mot_v_nom'], ['% Volt', 'porcentaje_volt'], ['PD Max [psi]', 'pd_max_psi'], ['Delta Presion [psi]', 'delta_presion_psi'], ['% Delta Presion', 'porcentaje_delta_presion'], ['Tm / T Max Permisible', 'relacion_tm_t_max'], ['% Temp', 'porcentaje_temp'], ['PIP Min / PIP', 'relacion_pip_min_pip'], ['% PIP', 'porcentaje_pip']] },
    { title: 'Observaciones', items: [['Observaciones', 'observaciones_pozo']] }
];

export async function exportFieldJourneyToExcel(journey, records, excelJs = window.ExcelJS) {
    if (!excelJs) {
        throw new Error('La libreria de Excel no esta disponible en esta vista.');
    }

    const normalizedJourney = normalizeJourney(journey, records);
    const normalizedRecords = sortJourneyRecords(records.map(normalizeRecordForExport));
    if (normalizedRecords.length === 0) {
        throw new Error('La jornada no tiene pozos para exportar.');
    }

    const workbook = new excelJs.Workbook();
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
        const imageId = workbook.addImage({ base64: logoDataUrl, extension: 'png' });
        summarySheet.addImage(imageId, EXCEL_LOGO_PLACEMENT);
        detailSheet.addImage(imageId, EXCEL_LOGO_PLACEMENT);
    }

    buildExcelSummarySheet(summarySheet, normalizedJourney, normalizedRecords);
    buildExcelDetailSheet(detailSheet, normalizedJourney, normalizedRecords);

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), buildJourneyExcelFileName(normalizedJourney));
}

export async function exportHistoricalFieldReportsToExcel(records = [], filters = {}, excelJs = window.ExcelJS) {
    if (!excelJs) {
        throw new Error('La libreria de Excel no esta disponible en esta vista.');
    }

    const normalizedRecords = sortJourneyRecords((Array.isArray(records) ? records : []).map(normalizeRecordForExport));
    if (normalizedRecords.length === 0) {
        throw new Error('No hay registros historicos para exportar con los filtros actuales.');
    }

    const workbook = new excelJs.Workbook();
    workbook.creator = 'UV Servicios Campo';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.company = 'UV Servicios';

    const summarySheet = workbook.addWorksheet('Resumen historico', {
        views: [{ state: 'frozen', ySplit: 4 }]
    });
    const detailSheet = workbook.addWorksheet('Historico Campo', {
        views: [{ state: 'frozen', ySplit: 6, xSplit: 4 }]
    });

    const logoDataUrl = await loadLogoForExcel();
    if (logoDataUrl) {
        const imageId = workbook.addImage({ base64: logoDataUrl, extension: 'png' });
        summarySheet.addImage(imageId, EXCEL_LOGO_PLACEMENT);
        detailSheet.addImage(imageId, EXCEL_LOGO_PLACEMENT);
    }

    buildHistoricalExcelSummarySheet(summarySheet, normalizedRecords, filters);
    buildHistoricalExcelDetailSheet(detailSheet, normalizedRecords, filters);

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        buildHistoricalExcelFileName(filters)
    );
}

export async function openFieldJourneyPdf(journey, records, reviewLog = [], targetWindow = null) {
    const pdfWindow = targetWindow || window.open('', '_blank', 'width=1180,height=820');
    if (!pdfWindow) {
        throw new Error('El navegador bloqueó la ventana para exportar a PDF. Habilita los pop-ups para esta página.');
    }
    
    if (!targetWindow) {
        pdfWindow.document.open();
        pdfWindow.document.write('<html><head><title>Generando Reporte...</title><style>body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; } .loader-card { padding: 40px; border-radius: 24px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; } .spinner { width: 50px; height: 50px; border: 5px solid #cbd5e1; border-top-color: #0f766e; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; } @keyframes spin { to { transform: rotate(360deg); } }</style></head><body><div class="loader-card"><div class="spinner"></div><h2 style="margin:0 0 8px; color:#0f172a; font-weight:800;">Generando reporte...</h2><p style="margin:0; color:#64748b; font-size:14px; font-weight:500;">Consolidando datos e imágenes de Supabase.</p></div></body></html>');
        pdfWindow.document.close();
    }

    try {
        const normalizedJourney = normalizeJourney(journey, records);
        const normalizedRecords = sortJourneyRecords(records.map(normalizeRecordForExport));
        if (normalizedRecords.length === 0) {
            throw new Error('La jornada no tiene pozos para exportar.');
        }

    const isVirtual = String(journey.id || '').startsWith('virtual_');
    const reportTitle = isVirtual ? 'Ticket Diario de Monitoreo' : 'Reporte de acompañamiento pozos con bombas electrosumergibles';
    const documentTitle = isVirtual ? 'Ticket Diario' : 'Consolidado Campo';
    const logoUrl = window.location.origin + '/img/UV-SERVICES-Logo-vectorial-sin-fondo.webp';

    // 1. Obtener documentos de soporte vinculados a esta jornada en Supabase
    let soportesDocs = [];
    try {
        const journeyIdStr = String(journey.id || '');
        const activeWellNames = [...new Set(normalizedRecords.map(r => String(r.pozo || '').trim().toUpperCase()).filter(Boolean))];

        let query = supabase
            .from('well_historical_documents')
            .select('*')
            .eq('categoria', 'SOPORTES');

        if (journeyIdStr && !journeyIdStr.startsWith('virtual_')) {
            query = query.like('descripcion', `%[JORNADA_ID:${journeyIdStr}]%`);
        } else if (normalizedJourney.fecha && activeWellNames.length > 0) {
            query = query.eq('fecha_documento', normalizedJourney.fecha).in('pozo_name', activeWellNames);
        } else {
            query = null;
        }

        if (query) {
            const { data: allDocs, error: queryErr } = await query;
            if (Array.isArray(allDocs) && allDocs.length > 0) {
                soportesDocs = allDocs;
                
                // 2. Obtener URLs firmadas en lote (batch)
                const { getDocumentDownloadUrls } = await import('./well-documents-service.js');
                const filePaths = soportesDocs.map(d => d.file_path).filter(Boolean);
                const urlsMap = await getDocumentDownloadUrls(filePaths);
                
                for (const doc of soportesDocs) {
                    if (doc.file_path && urlsMap[doc.file_path]) {
                        doc.signedUrl = urlsMap[doc.file_path];
                    }
                }
            }
        }
    } catch (docErr) {
        console.warn('[pdf-export] Error consultando soportes fotográficos:', docErr);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(documentTitle)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Inter', sans-serif; 
            margin: 0; 
            padding: 30px; 
            color: #0f172a; 
            background: #f8fafc; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }
        .sheet { 
            display: flex; 
            flex-direction: column; 
            gap: 20px; 
            max-width: 1100px; 
            margin: 0 auto; 
        }
        
        /* Encabezado Corporativo Premium */
        .hero { 
            background: linear-gradient(135deg, #1e3a8a, #0f766e); 
            border-radius: 24px; 
            padding: 32px; 
            color: #ffffff; 
            box-shadow: 0 10px 25px -5px rgba(15, 118, 110, 0.2); 
            border: none;
            position: relative;
            overflow: hidden;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
        }
        .hero-text {
            flex: 1;
        }
        .hero-logo {
            width: 100px;
            height: 100px;
            object-fit: contain;
            background: rgba(255, 255, 255, 0.15);
            padding: 10px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15);
            backdrop-filter: blur(4px);
        }
        .hero::before {
            content: '';
            position: absolute;
            top: 0; right: 0; bottom: 0; left: 0;
            background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 60%);
            pointer-events: none;
        }
        .hero h1 { 
            margin: 0 0 10px; 
            font-family: 'Outfit', sans-serif; 
            font-size: 28px; 
            font-weight: 800; 
            letter-spacing: -0.02em; 
            text-transform: uppercase; 
        }
        .hero p { 
            margin: 0; 
            color: #ccfbf1; 
            font-size: 15px; 
            font-weight: 500; 
            opacity: 0.95; 
        }
        .meta { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 12px; 
            margin-top: 20px; 
        }
        .tag { 
            display: inline-flex; 
            align-items: center; 
            padding: 8px 16px; 
            border-radius: 999px; 
            background: rgba(255, 255, 255, 0.15); 
            color: #ffffff; 
            font-size: 12px; 
            font-weight: 600; 
            backdrop-filter: blur(4px); 
            border: 1px solid rgba(255, 255, 255, 0.1); 
        }
        
        /* Tarjeta de Pozo */
        .well { 
            position: relative;
            background: #ffffff; 
            border: 1.5px solid #cbd5e1; 
            border-radius: 20px; 
            padding: 24px; 
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); 
            page-break-inside: avoid; 
            break-inside: avoid; 
        }
        .well:nth-of-type(even) {
            background: #f8fafc; /* Fondo gris suave */
        }
        .well::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 220px;
            height: 220px;
            background-image: url('img/UV-SERVICES-Logo-vectorial-sin-fondo.webp');
            background-repeat: no-repeat;
            background-position: center;
            background-size: contain;
            opacity: 0.032; /* Muy sutil para que no afecte la lectura de los números */
            pointer-events: none;
            z-index: 0;
        }
        .well-head, .well-table, .soportes-container {
            position: relative;
            z-index: 1;
        }
        .well-head { 
            margin-bottom: 16px; 
            background: #f1f5f9; /* Fondo gris para la cabecera impar */
            padding: 10px 14px;
            border-radius: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .well:nth-of-type(even) .well-head {
            background: #e0f2fe; /* Fondo azul suave para la cabecera par */
        }
        .well-head h3 { 
            margin: 0; 
            font-family: 'Outfit', sans-serif; 
            font-size: 18px; 
            color: #1e3a8a; 
            font-weight: 800; 
            letter-spacing: -0.01em; 
        }
        
        /* Tabla de Parámetros */
        .well-table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0; 
            margin-bottom: 16px; 
            font-size: 12px; 
            text-align: left; 
            border-radius: 12px; 
            overflow: hidden; 
            border: 1px solid #cbd5e1; 
        }
        .well-table th { 
            background: #f8fafc; 
            padding: 12px 14px; 
            font-weight: 700; 
            color: #475569; 
            border-bottom: 2px solid #cbd5e1; 
            text-transform: uppercase; 
            font-size: 10px; 
            letter-spacing: 0.05em; 
        }
        .well-table td { 
            padding: 12px 14px; 
            color: #0f172a; 
            border-bottom: 1px solid #e2e8f0; 
            vertical-align: middle; 
        }
        .well-table tr:last-child td { 
            border-bottom: none; 
        }
        
        /* Fotos de Soporte */
        .soportes-container { 
            break-inside: avoid; 
            page-break-inside: avoid; 
            margin-top: 18px; 
            padding-top: 16px; 
            border-top: 1px dashed #cbd5e1; 
        }
        .soportes-title { 
            color: #0f766e; 
            font-family: 'Outfit', sans-serif; 
            font-size: 12px; 
            font-weight: 700; 
            text-transform: uppercase; 
            letter-spacing: 0.06em; 
            margin: 0 0 12px; 
            text-align: left; 
        }
        .soportes-grid { 
            display: flex; 
            gap: 16px; 
            flex-wrap: wrap; 
        }
        .foto-card { 
            flex: 1; 
            min-width: 130px; 
            max-width: 180px; 
            border: 1px solid #cbd5e1; 
            border-radius: 14px; 
            overflow: hidden; 
            background: #ffffff; 
            padding: 6px; 
            box-sizing: border-box; 
            text-align: center; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.02); 
        }
        .foto-card img { 
            width: 100%; 
            height: 110px; 
            object-fit: cover; 
            border-radius: 10px; 
            display: block; 
            margin-bottom: 6px; 
        }
        .foto-card span { 
            font-size: 9px; 
            color: #475569; 
            font-weight: 600; 
            display: block; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            white-space: nowrap; 
        }

        /* Bitácora / Audit trail */
        .pulse-section { 
            margin-top: 24px; 
            border: 1px solid #cbd5e1; 
            border-radius: 24px; 
            padding: 24px; 
            background: #ffffff; 
            break-inside: avoid; 
            page-break-inside: avoid; 
        }
        .pulse-section h2 { 
            margin: 0 0 6px; 
            font-family: 'Outfit', sans-serif; 
            font-size: 18px; 
            color: #1e3a8a; 
            font-weight: 800; 
        }
        .pulse-section p.subtitle { 
            margin: 0 0 20px; 
            color: #64748b; 
            font-size: 13px; 
        }
        .pulse-timeline { 
            display: flex; 
            flex-direction: column; 
            gap: 16px; 
            position: relative; 
            padding-left: 20px; 
            border-left: 2px solid #cbd5e1; 
            margin-left: 10px; 
        }
        .pulse-item { 
            position: relative; 
            font-size: 13px; 
            line-height: 1.5; 
        }
        .pulse-node { 
            position: absolute; 
            left: -27px; 
            top: 4px; 
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            background: #3b82f6; 
            border: 2px solid #ffffff; 
            box-shadow: 0 0 0 2px #cbd5e1; 
        }
        .pulse-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 4px; 
        }
        .pulse-tag { 
            font-weight: 700; 
            text-transform: uppercase; 
            font-size: 10px; 
            padding: 4px 10px; 
            border-radius: 999px; 
        }
        .pulse-tag.tag-blue { background: #e0f2fe; color: #0369a1; }
        .pulse-tag.tag-amber { background: #fef3c7; color: #d97706; }
        .pulse-tag.tag-emerald { background: #d1fae5; color: #059669; }
        .pulse-tag.tag-purple { background: #f3e8ff; color: #7c3aed; }
        .pulse-tag.tag-red { background: #fee2e2; color: #dc2626; }
        .pulse-time { color: #64748b; font-size: 11px; }
        .pulse-comment { font-weight: 600; color: #0f172a; margin-top: 2px; }
        .pulse-user { font-size: 11px; color: #64748b; margin-top: 2px; }

        @media print { 
            @page {
                size: landscape;
                margin: 10mm;
            }
            body { 
                padding: 0; 
                background: #ffffff; 
            } 
            .hero { 
                box-shadow: none; 
                border-radius: 0; 
            } 
            .well { 
                border-radius: 12px; 
                box-shadow: none; 
                margin-bottom: 16px; 
                padding: 12px 16px;
                border: 1px solid #cbd5e1;
            } 
            .well-head {
                margin-bottom: 10px;
                padding: 6px 10px;
            }
            .well-table th,
            .well-table td {
                padding: 8px 10px;
            }
            .well-table {
                margin-bottom: 8px;
            }
            .soportes-container {
                margin-top: 8px;
                padding-top: 8px;
            }
            .soportes-title {
                margin-bottom: 6px;
            }
            .foto-card img {
                height: 75px;
            }
            .btn-back-to-data {
                display: none !important;
            }
        }
        /* Floating back button (visible on screen, hidden on print) */
        .btn-back-to-data {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #dc2626, #b91c1c);
            color: #ffffff;
            border: none;
            padding: 14px 28px;
            border-radius: 50px;
            font-weight: 800;
            font-size: 0.85rem;
            cursor: pointer;
            z-index: 99999;
            box-shadow: 0 8px 24px rgba(185, 28, 28, 0.45);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-family: 'Inter', system-ui, sans-serif;
            transition: all 0.2s;
        }
        .btn-back-to-data:hover {
            transform: translateX(-50%) translateY(-3px);
            box-shadow: 0 12px 30px rgba(185, 28, 28, 0.55);
        }
        /* Mobile responsive overrides for on-screen viewing */
        @media (max-width: 768px) {
            body { padding: 10px; }
            .hero { padding: 18px; border-radius: 16px; flex-direction: row; text-align: left; align-items: center; justify-content: space-between; gap: 12px; }
            .hero-logo { width: 70px; height: 70px; padding: 6px; border-radius: 14px; flex-shrink: 0; }
            .hero-text h1 { font-size: 1.15rem; line-height: 1.25; margin-bottom: 6px; }
            .hero-text p { font-size: 0.75rem; }
            .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .meta .tag { font-size: 8.5px; padding: 3px 8px; margin: 0; }
            .well-table { font-size: 10px; }
            .well-table th, .well-table td { padding: 6px 5px; }
            .well-head h3 span { font-size: 0.85rem; }
            .soportes-grid { gap: 6px; }
            .foto-card { min-width: 80px; }
        }
    </style>
</head>
<body>
    <button class="btn-back-to-data" onclick="window.close()">← VOLVER A DATA</button>
    <div class="sheet">
        <section class="hero">
            <div class="hero-text">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #ccfbf1; margin-bottom: 6px;">
                    UV SERVICES
                </div>
                <h1>${escapeHtml(reportTitle)}</h1>
                <p>${escapeHtml(normalizedJourney.locacion_jornada || 'Locacion no definida')} · ${escapeHtml(normalizedJourney.fecha || '--')} · ${escapeHtml(normalizedJourney.jornada || '--')}</p>
                <div class="meta">
                    <span class="tag">Equipo: ${escapeHtml(normalizedJourney.equipo_guardia || '--')}</span>
                    <span class="tag">Ventana: ${escapeHtml(normalizedJourney.firstHour || '--')} a ${escapeHtml(normalizedJourney.lastHour || '--')}</span>
                    <span class="tag">${escapeHtml(String(normalizedJourney.reportCount || normalizedRecords.length))} pozo(s)</span>
                </div>
            </div>
            <img src="${logoUrl}" alt="UV SERVICES" class="hero-logo" onerror="this.style.display='none'">
        </section>
        ${(() => {
            const grouped = {};
            for (const record of normalizedRecords) {
                const pName = String(record.pozo || '').trim().toUpperCase();
                if (pName) {
                    if (!grouped[pName]) grouped[pName] = [];
                    grouped[pName].push(record);
                }
            }
            return Object.keys(grouped).sort().map(pozoName => {
                return buildPdfWellMarkup(normalizedJourney, pozoName, grouped[pozoName], soportesDocs);
            }).join('');
        })()}
        
        <!-- PULSO DE LA JORNADA (AUDIT TRAIL / BITÁCORA) -->
        ${reviewLog && reviewLog.length > 0 ? `
        <section class="pulse-section">
            <h2>⚡ Pulso de la Jornada (Historial de Auditoría y Trazabilidad)</h2>
            <p class="subtitle">Trazabilidad oficial de eventos de transmisión, recuperaciones, cargas y modificaciones.</p>
            <div class="pulse-timeline">
                ${reviewLog.map(log => {
                    const action = String(log.action || '').toLowerCase();
                    let tagClass = 'tag-blue';
                    let tagLabel = 'EVENTO';

                    if (action === 'submitted') {
                        tagClass = 'tag-blue';
                        tagLabel = 'RECEPCIÓN CAMPO';
                    } else if (action === 'recovered') {
                        tagClass = 'tag-amber';
                        tagLabel = 'RECUPERADO';
                    } else if (action === 'updated') {
                        tagClass = 'tag-blue';
                        tagLabel = 'RE-ENVIADO';
                    } else if (action === 'split' || action === 'merge') {
                        tagClass = 'tag-purple';
                        tagLabel = action === 'split' ? 'SEPARACIÓN' : 'FUSIÓN';
                    } else if (['approved', 'published'].includes(action)) {
                        tagClass = 'tag-emerald';
                        tagLabel = action === 'published' ? 'PUBLICADO' : 'APROBADO';
                    } else if (action === 'rejected') {
                        tagClass = 'tag-red';
                        tagLabel = 'RECHAZADO';
                    } else if (action === 'file_added') {
                        tagClass = 'tag-purple';
                        tagLabel = 'ARCHIVO ADJUNTO';
                    }

                    const dateFormatted = new Date(log.created_at || Date.now()).toLocaleString('es-ES', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    const email = log.performed_by_email || 'Sistema de Auditoría';
                    return `
                    <div class="pulse-item">
                        <div class="pulse-node"></div>
                        <div class="pulse-header">
                            <span class="pulse-tag ${tagClass}">
                                ${tagLabel}
                            </span>
                            <span class="pulse-time">${dateFormatted}</span>
                        </div>
                        <div class="pulse-comment">
                            ${escapeHtml(log.comment || 'Sin observación registrada.')}
                        </div>
                        <div class="pulse-user">
                            👤 <strong>Usuario:</strong> ${escapeHtml(email)}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </section>
        ` : ''}
    </div>
    <script>
        window.addEventListener('load', () => {
            // Only auto-print on desktop; on mobile let the user review first
            if (window.innerWidth > 768) {
                window.print();
            }
        });
    </script>
</body>
</html>`;

    pdfWindow.document.open();
    pdfWindow.document.write(html);
    pdfWindow.document.close();
    pdfWindow.focus();
    } catch (err) {
        console.error('[pdf-export] Error:', err);
        pdfWindow.document.open();
        pdfWindow.document.write(`<html><head><title>Error al Generar Reporte</title><style>body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #dc2626; text-align: center; } .error-card { padding: 40px; border-radius: 24px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #fee2e2; max-width: 500px; } .btn-close { padding: 10px 24px; background: #ef4444; color: #fff; border: none; border-radius: 12px; font-weight:700; cursor:pointer; font-size:14px; transition: background 0.2s; margin-top:20px; } .btn-close:hover { background: #dc2626; }</style></head><body><div class="error-card"><h2 style="margin:0 0 12px; font-weight:800;">❌ Error al generar el reporte</h2><p style="margin:0; color:#475569; font-size:14px; line-height:1.5;">${escapeHtml(err.message || err)}</p><button class="btn-close" onclick="window.close()">Cerrar Ventana</button></div></body></html>`);
        pdfWindow.document.close();
        throw err;
    }
}

function buildPdfWellMarkup(journey, pozoName, recordsList = [], soportesDocs = []) {
    const wellSoportes = soportesDocs.filter(d => 
        String(d.pozo_name || '').trim().toUpperCase() === String(pozoName || '').trim().toUpperCase()
    );

    // Deduplicate photos by file_path to prevent rendering identical uploads multiple times
    const uniqueSoportes = [];
    const seenPaths = new Set();
    for (const doc of wellSoportes) {
        const path = String(doc.file_path || '').trim();
        if (path && !seenPaths.has(path)) {
            seenPaths.add(path);
            uniqueSoportes.push(doc);
        }
    }

    let soportesHtml = '';
    if (uniqueSoportes.length > 0) {
        soportesHtml = `
            <div class="soportes-container">
                <h4 class="soportes-title">Soportes Fotográficos</h4>
                <div class="soportes-grid">
                    ${uniqueSoportes.map(doc => `
                        <div class="foto-card" style="page-break-inside: avoid; break-inside: avoid;">
                            <div style="position: relative; width: 100%; height: 110px; border-radius: 10px; overflow: hidden; margin-bottom: 6px;">
                                <img src="${doc.signedUrl || '#'}" alt="Soporte ${escapeHtml(doc.nombre_archivo)}" onerror="this.src='img/placeholder-image.png'" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0; display: block; margin: 0 !important;">
                                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                                    <!-- Logo corporativo centrado sin rotar -->
                                    <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" style="width: 38%; opacity: 0.16; filter: grayscale(100%); pointer-events: none; height: auto !important; margin: 0 !important;">
                                    <!-- Badge UV en miniatura -->
                                    <span style="position: absolute; bottom: 4px; right: 4px; font-size: 8px; font-weight: 800; color: rgba(255,255,255,0.9); background: rgba(15, 118, 110, 0.75); padding: 1px 4px; border-radius: 4px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; border: 0.5px solid rgba(255,255,255,0.2); line-height: 1;">UV</span>
                                </div>
                            </div>
                            <span title="${escapeHtml(doc.nombre_archivo)}">
                                ${escapeHtml(doc.nombre_archivo || 'Foto Soporte')}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        soportesHtml = `
            <div class="soportes-container" style="padding-top: 10px; border-top: 1px dashed #e2e8f0; margin-top: 14px;">
                <span style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
                    📸 Soportes Fotográficos: No se registraron evidencias visuales para este pozo.
                </span>
            </div>
        `;
    }

    // Render each reading as a separate row in the same table
    const rowsHtml = recordsList.map(record => {
        const FreqVal = record.frecuencia ? `${record.frecuencia} Hz` : '--';
        const GiroVal = record.sentido_giro || record.giro || '--';
        const CurrentVal = record.i_motor || record.corriente_motor ? `${record.i_motor || record.corriente_motor} Amp` : '--';
        
        const PipStr = record.pip_psi || record.pip ? String(record.pip_psi || record.pip).trim() : '--';
        const TmStr = record.tm_f || record.tm ? String(record.tm_f || record.tm).trim() : '--';
        
        const ThpStr = record.thp_psi || record.presion_thp ? String(record.thp_psi || record.presion_thp).trim() : '--';
        const ChpStr = record.chp_psi || record.presion_chp ? String(record.chp_psi || record.presion_chp).trim() : '--';
        const LfStr = record.lf_psi || record.presion_lf || record.lf ? String(record.lf_psi || record.presion_lf || record.lf).trim() : '--';

        const VsdA = record.i_vsd_a || record.vsd_a || '0';
        const VsdB = record.i_vsd_b || record.vsd_b || '0';
        const VsdC = record.i_vsd_c || record.vsd_c || '0';

        const isRun = ['RUN', 'RUN / ATENCION AL CLIENTE'].includes(String(record.estatus).toUpperCase().trim());

        return `
            <tr>
                <td style="font-weight: 700;">${escapeHtml(record.fecha || journey.fecha || '--')}<br><span style="font-size: 10px; color: #64748b; font-weight: 500;">${escapeHtml(record.hora || '--')}</span></td>
                <td style="font-weight: 700;">${escapeHtml(FreqVal)}</td>
                <td style="font-weight: 700;">${escapeHtml(GiroVal)}</td>
                <td style="font-weight: 700;">${escapeHtml(CurrentVal)}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px; font-size: 11px; line-height: 1.2;">
                        <div><span style="color: #64748b; font-weight: 600; margin-right: 2px;">PIP:</span><span style="font-weight: 700;">${escapeHtml(PipStr)}</span> <span style="font-size: 9px; color: #94a3b8;">PSI</span></div>
                        <div><span style="color: #be123c; font-weight: 600; margin-right: 2px;">TM:</span><span style="font-weight: 700; color: #e11d48;">${escapeHtml(TmStr)}</span> <span style="font-size: 9px; color: #f43f5e;">°F</span></div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px; font-size: 11px; line-height: 1.2;">
                        <div><span style="color: #2563eb; font-weight: 600; margin-right: 2px;">THP:</span><span style="font-weight: 700; color: #1e40af;">${escapeHtml(ThpStr)}</span> <span style="font-size: 9px; color: #94a3b8;">PSI</span></div>
                        <div><span style="color: #0d9488; font-weight: 600; margin-right: 2px;">CHP:</span><span style="font-weight: 700; color: #0f766e;">${escapeHtml(ChpStr)}</span> <span style="font-size: 9px; color: #94a3b8;">PSI</span></div>
                        <div><span style="color: #ea580c; font-weight: 600; margin-right: 2px;">LF:</span><span style="font-weight: 700; color: #c2410c;">${escapeHtml(LfStr)}</span> <span style="font-size: 9px; color: #94a3b8;">PSI</span></div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px; font-family: monospace; font-size: 11px; line-height: 1.2;">
                        <div><span style="color: #64748b; font-weight: 600; margin-right: 2px;">A:</span><span style="font-weight: 700;">${escapeHtml(VsdA)}</span> <span style="font-size: 9px; color: #94a3b8;">Amp</span></div>
                        <div><span style="color: #64748b; font-weight: 600; margin-right: 2px;">B:</span><span style="font-weight: 700;">${escapeHtml(VsdB)}</span> <span style="font-size: 9px; color: #94a3b8;">Amp</span></div>
                        <div><span style="color: #64748b; font-weight: 600; margin-right: 2px;">C:</span><span style="font-weight: 700;">${escapeHtml(VsdC)}</span> <span style="font-size: 9px; color: #94a3b8;">Amp</span></div>
                    </div>
                </td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: ${isRun ? '#dcfce7' : '#fee2e2'}; color: ${isRun ? '#15803d' : '#b91c1c'}; padding: 3px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; text-transform: uppercase; border: 1px solid ${isRun ? '#bbf7d0' : '#fecaca'}; letter-spacing: 0.05em; line-height: 1; white-space: nowrap;">
                        <span style="width: 5px; height: 5px; border-radius: 50%; background: ${isRun ? '#22c55e' : '#ef4444'}; display: inline-block;"></span>
                        ${escapeHtml(record.estatus || '--')}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <article class="well">
            <div class="well-head">
                <h3 style="display: flex; align-items: center; gap: 8px; margin: 0;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: #0f766e; flex-shrink: 0; margin-top: -1px;">
                        <rect x="9" y="1" width="6" height="2.5" rx="0.5" />
                        <line x1="12" y1="3.5" x2="12" y2="5" />
                        <line x1="9" y1="5" x2="15" y2="5" />
                        <line x1="10" y1="5" x2="10" y2="16" />
                        <line x1="14" y1="5" x2="14" y2="16" />
                        <path d="M11.2 5 Q11.8 9 11.2 12 Q10.6 15 11.2 16" stroke-dasharray="1.5 1" stroke-width="0.9" />
                        <rect x="9.5" y="16" width="5" height="6" rx="1.2" fill="currentColor" opacity="0.12" />
                        <line x1="10.5" y1="17.2" x2="10.5" y2="21" stroke-width="0.7" />
                        <line x1="12" y1="17.2" x2="12" y2="21" stroke-width="0.7" />
                        <line x1="13.5" y1="17.2" x2="13.5" y2="21" stroke-width="0.7" />
                    </svg>
                    <span>POZO: ${escapeHtml(String(pozoName).toUpperCase())}</span>
                    <span style="font-size: 9px; font-weight: 800; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #bae6fd; margin-left: 6px; display: inline-flex; align-items: center; gap: 2px; line-height: 1;">⚡ BES</span>
                </h3>
                <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="Logo UV" style="height: 20px; width: auto; margin: 0; opacity: 0.85;">
            </div>
            <table class="well-table">
                <thead>
                    <tr>
                        <th>FECHA/HORA</th>
                        <th>FRECUENCIA</th>
                        <th>GIRO</th>
                        <th>CORRIENTE M.</th>
                        <th>PIP/TM</th>
                        <th>PRESIONES (THP/CHP/LF)</th>
                        <th>VSD A/B/C</th>
                        <th>ESTATUS</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            ${soportesHtml}
        </article>
    `;
}

function buildPdfSectionMarkup(section, record) {
    return `
        <section class="section">
            <h3>${escapeHtml(section.title)}</h3>
            <div class="grid">
                ${section.items.map(([label, fieldName]) => `
                    <div class="item ${isLongPreviewField(fieldName) ? 'long' : ''}">
                        <strong>${escapeHtml(label)}</strong>
                        <span>${escapeHtml(formatPreviewValue(record[fieldName], fieldName))}</span>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function normalizeJourney(journey = {}, records = []) {
    const normalizedRecords = sortJourneyRecords((Array.isArray(records) ? records : []).map(normalizeRecordForExport));
    return {
        ...journey,
        fecha: journey.fecha || journey.journey_date || normalizedRecords[0]?.fecha || '',
        reportCount: journey.reportCount || journey.total_reports || normalizedRecords.length,
        firstHour: journey.firstHour || formatTime(journey.first_report_time) || normalizedRecords[0]?.hora || '',
        lastHour: journey.lastHour || formatTime(journey.last_report_time) || normalizedRecords[normalizedRecords.length - 1]?.hora || ''
    };
}

function normalizeRecordForExport(record = {}) {
    const payload = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
    return {
        ...record,
        ...payload,
        pozo: String(payload.pozo || record.pozo || '').trim().toUpperCase(),
        fecha: payload.fecha || record.report_date || '',
        hora: payload.hora || formatTime(record.report_time),
        observaciones_pozo: payload.observaciones_pozo || record.observaciones_pozo || '',
        diagnostico: payload.diagnostico || record.diagnostico || '',
        frecuencia: payload.frecuencia || record.frecuencia || '',
        i_motor: payload.i_motor || record.i_motor || '',
        v_motor: payload.v_motor || record.v_motor || '',
        out_vsd: payload.out_vsd || record.out_vsd || '',
        pip_psi: payload.pip_psi || record.pip_psi || '',
        pd_psi: payload.pd_psi || record.pd_psi || '',
        thp_psi: payload.thp_psi || record.thp_psi || '',
        chp_psi: payload.chp_psi || record.chp_psi || '',
        lf_psi: payload.lf_psi || record.lf_psi || ''
    };
}

function summarizeRecordValues(records, fieldName) {
    const values = [...new Set(records.map(record => String(record[fieldName] || '').trim()).filter(Boolean))];
    return values.join(', ') || '--';
}

function buildExcelSummarySheet(worksheet, journey, records) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CReporte de acompanamiento BES&RGenerado &D &T';
    worksheet.mergeCells('C1:J1');
    worksheet.mergeCells('C2:J2');
    worksheet.mergeCells('C3:J3');
    worksheet.getCell('C1').value = 'UV SERVICIOS CAMPO';
    worksheet.getCell('C2').value = 'REPORTE DE ACOMPANAMIENTO POZOS CON BOMBAS ELECTROSUMERGIBLES';
    worksheet.getCell('C3').value = `${journey.locacion_jornada || 'Locacion no definida'} · ${journey.fecha || '--'} · ${journey.jornada || '--'}`;

    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    const summaryRows = [
        ['Tecnico 1', summarizeRecordValues(records, 'tecnico_1')],
        ['Tecnico 2', summarizeRecordValues(records, 'tecnico_2')],
        ['Locacion', journey.locacion_jornada || '--'],
        ['Fecha', journey.fecha || '--'],
        ['Jornada', journey.jornada || '--'],
        ['Pozos monitoreados', records.length],
        ['Ventana', `${journey.firstHour || '--'} a ${journey.lastHour || '--'}`],
        ['Pozos', records.map(record => String(record.pozo || '').toUpperCase()).join(', ') || '--']
    ];

    let rowNumber = 7;
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

    worksheet.columns = [{ width: 6 }, { width: 28 }, { width: 84 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }];
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 42;
    worksheet.getRow(3).height = 24;
    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 12;
    worksheet.getRow(6).height = 10;
}

function buildExcelDetailSheet(worksheet, journey, records) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CReporte de acompanamiento BES&RPagina &P de &N';
    const totalColumns = EXCEL_EXPORT_COLUMNS.length;
    const lastColumnLetter = getExcelColumnLetter(totalColumns);

    worksheet.mergeCells(`C1:${lastColumnLetter}1`);
    worksheet.mergeCells(`C2:${lastColumnLetter}2`);
    worksheet.mergeCells(`C3:${lastColumnLetter}3`);
    worksheet.getCell('C1').value = 'UV SERVICIOS';
    worksheet.getCell('C2').value = 'REPORTE DE ACOMPANAMIENTO POZOS CON BOMBAS ELECTROSUMERGIBLES';
    worksheet.getCell('C3').value = `${journey.locacion_jornada || '--'} · ${journey.fecha || '--'} · ${journey.jornada || '--'} · ${records.length} pozo(s)`;
    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    worksheet.columns = EXCEL_EXPORT_COLUMNS.map(({ label, fieldName }) => ({
        width: calculateExcelColumnWidth(label, fieldName, records)
    }));

    const groupRowIndex = 6;
    const headerRowIndex = 7;
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
    });

    worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: EXCEL_EXPORT_COLUMNS.length }
    };
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 54;
    worksheet.getRow(3).height = 24;
    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 12;
    worksheet.getRow(6).height = 28;
}

function buildHistoricalExcelSummarySheet(worksheet, records, filters = {}) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CHistorico consolidado&RGenerado &D &T';
    worksheet.mergeCells('C1:J1');
    worksheet.mergeCells('C2:J2');
    worksheet.mergeCells('C3:J3');
    worksheet.getCell('C1').value = 'UV SERVICIOS CAMPO';
    worksheet.getCell('C2').value = 'EXPORTACION HISTORICA DE MONITOREOS BES';
    worksheet.getCell('C3').value = buildHistoricalSummarySubtitle(records, filters);

    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    const pozos = [...new Set(records.map(record => String(record.pozo || '').toUpperCase()).filter(Boolean))];
    const summaryRows = [
        ['Fecha inicial', filters.startDate || '--'],
        ['Fecha final', filters.endDate || '--'],
        ['Filtro por pozo', String(filters.pozo || '').trim().toUpperCase() || 'Todos'],
        ['Registros exportados', records.length],
        ['Pozos incluidos', pozos.length],
        ['Lista de pozos', pozos.join(', ') || '--']
    ];

    let rowNumber = 7;
    summaryRows.forEach(([label, value]) => {
        const row = worksheet.getRow(rowNumber);
        row.getCell(2).value = label;
        row.getCell(3).value = value;
        row.getCell(2).font = { bold: true, color: { argb: '1D4ED8' } };
        row.getCell(3).font = { color: { argb: '0F172A' } };
        row.getCell(2).fill = solidFill('DBEAFE');
        row.getCell(3).fill = solidFill('FFFFFF');
        row.getCell(2).border = borderedCell();
        row.getCell(3).border = borderedCell();
        row.height = label === 'Lista de pozos' ? 40 : 24;
        rowNumber += 1;
    });

    worksheet.columns = [{ width: 6 }, { width: 28 }, { width: 84 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }];
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 42;
    worksheet.getRow(3).height = 24;
    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 12;
    worksheet.getRow(6).height = 10;
}

function buildHistoricalExcelDetailSheet(worksheet, records, filters = {}) {
    worksheet.headerFooter.oddFooter = '&LUV Servicios Campo&CHistorico consolidado&RPagina &P de &N';
    const totalColumns = EXCEL_EXPORT_COLUMNS.length;
    const lastColumnLetter = getExcelColumnLetter(totalColumns);

    worksheet.mergeCells(`C1:${lastColumnLetter}1`);
    worksheet.mergeCells(`C2:${lastColumnLetter}2`);
    worksheet.mergeCells(`C3:${lastColumnLetter}3`);
    worksheet.getCell('C1').value = 'UV SERVICIOS';
    worksheet.getCell('C2').value = 'HISTORICO CONSOLIDADO DE MONITOREOS BES';
    worksheet.getCell('C3').value = buildHistoricalSummarySubtitle(records, filters);
    styleExcelTitleBlock(worksheet, ['C1', 'C2', 'C3']);

    worksheet.columns = EXCEL_EXPORT_COLUMNS.map(({ label, fieldName }) => ({
        width: calculateExcelColumnWidth(label, fieldName, records)
    }));

    const groupRowIndex = 6;
    const headerRowIndex = 7;
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
    });

    worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: EXCEL_EXPORT_COLUMNS.length }
    };
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 54;
    worksheet.getRow(3).height = 24;
    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 12;
    worksheet.getRow(6).height = 28;
}

function buildHistoricalSummarySubtitle(records, filters = {}) {
    const from = filters.startDate || 'sin inicio';
    const to = filters.endDate || 'sin fin';
    const pozo = String(filters.pozo || '').trim().toUpperCase() || 'TODOS LOS POZOS';
    return `${pozo} · ${from} a ${to} · ${records.length} registro(s)`;
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
    });
}

function solidFill(color) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
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
    const baseWidth = Math.max(label.length + 2, isLongTextField ? 24 : 14);
    const longestValue = records.reduce((max, record) => Math.max(max, String(formatExcelCellValue(record[fieldName], fieldName) || '').length), 0);
    return Math.min(Math.max(baseWidth, Math.min(longestValue + 2, 34)), isLongTextField ? 56 : 42);
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
    const parts = ['uvs-campo', sanitizeFileNameSegment(journey.locacion_jornada || 'jornada'), sanitizeFileNameSegment(journey.fecha || new Date().toISOString().slice(0, 10)), sanitizeFileNameSegment(journey.jornada || 'turno')].filter(Boolean);
    return `${parts.join('_')}.xlsx`;
}

function buildHistoricalExcelFileName(filters = {}) {
    const parts = [
        'uvs-campo-historico',
        sanitizeFileNameSegment(filters.pozo || 'todos-los-pozos'),
        sanitizeFileNameSegment(filters.startDate || 'sin-inicio'),
        sanitizeFileNameSegment(filters.endDate || 'sin-fin')
    ].filter(Boolean);
    return `${parts.join('_')}.xlsx`;
}

function sanitizeFileNameSegment(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function loadLogoForExcel() {
    try {
        const response = await fetch('img/UV-SERVICES-Logo-vectorial-sin-fondo.webp');
        if (!response.ok) return null;
        const blob = await response.blob();
        return await imageBlobToDataUrl(blob);
    } catch {
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

function formatTime(value) {
    if (!value) return '';
    return String(value).slice(0, 5);
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
    if (fieldName === 'estado_fosa_porcentaje') return `${normalized} %`;
    return normalized;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
