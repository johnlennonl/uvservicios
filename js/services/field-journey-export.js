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
    ['CONDICION DE LA CASETA', 'condicion_caseta'],
    ['TEMPERATURA DE LA CASETA', 'temperatura_caseta'],
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
    { title: 'Sistema BES y superficie', items: [['Amp nominal motor [A]', 'amp_nominal_motor'], ['Volt nominal motor [V]', 'volt_nominal_motor'], ['Frec max [Hz]', 'frec_max_hz'], ['Low speed [Hz]', 'low_speed_hz'], ['UL [A]', 'ul_a'], ['OL [A]', 'ol_a'], ['I-Limit [A]', 'i_limit_a'], ['Tiempo de desaceleracion [seg]', 'tiempo_desaceleracion_seg'], ['Low PIP shut down [psi]', 'low_pip_shutdown_psi'], ['Max high temp. shut down [F]', 'max_high_temp_shutdown_f'], ['Baja datos', 'baja_datos'], ['VSD [KVA]', 'vsd_kva'], ['Marca VSD', 'marca_vsd'], ['Modelo VSD', 'modelo_vsd'], ['Tx [KVA]', 'tx_kva'], ['Tap [V]', 'tap_v'], ['R.T', 'rt'], ['Estado del Tx', 'estado_tx'], ['Estado del VSD', 'estado_vsd'], ['Estado panel sensor / choques', 'estado_panel_sensor_choques'], ['Estado del aterramiento', 'estado_aterramiento'], ['Condicion del cableado', 'condicion_cableado'], ['Condicion de la caseta', 'condicion_caseta'], ['Temperatura de la caseta', 'temperatura_caseta'], ['Estado de fosa [%]', 'estado_fosa_porcentaje'], ['Estado del BIW/conector', 'estado_biw_conector'], ['Estado de manometros', 'estado_manometros'], ['Estado del cabezal', 'estado_cabezal'], ['Estado de tomamuestras', 'estado_tomamuestras'], ['Estado caja de venteo', 'estado_caja_venteo']] },
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

export function openFieldJourneyPdf(journey, records) {
    const normalizedJourney = normalizeJourney(journey, records);
    const normalizedRecords = sortJourneyRecords(records.map(normalizeRecordForExport));
    if (normalizedRecords.length === 0) {
        throw new Error('La jornada no tiene pozos para exportar.');
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Consolidado Campo</title>
    <style>
        body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #0f172a; background: #f8fafc; }
        .sheet { display: grid; gap: 18px; }
        .hero { background: linear-gradient(180deg, #ffffff, #ecfeff); border: 1px solid #cbd5e1; border-radius: 22px; padding: 22px; }
        .hero h1 { margin: 0 0 6px; font-size: 24px; }
        .hero p { margin: 0; color: #475569; }
        .meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
        .tag { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: #e2e8f0; color: #0f172a; font-size: 12px; font-weight: 700; }
        .well { background: #ffffff; border: 1px solid #dbeafe; border-radius: 22px; padding: 18px; break-inside: avoid; }
        .well-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .well-head h2 { margin: 4px 0; font-size: 20px; }
        .well-head p { margin: 0; color: #64748b; }
        .section { margin-top: 14px; }
        .section h3 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #0f766e; }
        .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .item { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; }
        .item.long { grid-column: span 3; }
        .item strong { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
        .item span { font-size: 13px; color: #0f172a; line-height: 1.5; white-space: pre-wrap; }
        @media print { body { margin: 12px; background: #ffffff; } .hero, .well { box-shadow: none; } }
    </style>
</head>
<body>
    <div class="sheet">
        <section class="hero">
            <h1>Reporte de acompanamiento pozos con bombas electrosumergibles</h1>
            <p>${escapeHtml(normalizedJourney.locacion_jornada || 'Locacion no definida')} · ${escapeHtml(normalizedJourney.fecha || '--')} · ${escapeHtml(normalizedJourney.jornada || '--')}</p>
            <div class="meta">
                <span class="tag">Equipo: ${escapeHtml(normalizedJourney.equipo_guardia || '--')}</span>
                <span class="tag">Ventana: ${escapeHtml(normalizedJourney.firstHour || '--')} a ${escapeHtml(normalizedJourney.lastHour || '--')}</span>
                <span class="tag">${escapeHtml(String(normalizedJourney.reportCount || normalizedRecords.length))} pozo(s)</span>
            </div>
        </section>
        ${normalizedRecords.map(record => buildPdfWellMarkup(normalizedJourney, record)).join('')}
    </div>
    <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;

    const pdfWindow = window.open('', '_blank', 'width=1180,height=820');
    if (!pdfWindow) {
        throw new Error('El navegador bloqueo la ventana para exportar a PDF.');
    }

    pdfWindow.document.open();
    pdfWindow.document.write(html);
    pdfWindow.document.close();
    pdfWindow.focus();
}

function buildPdfWellMarkup(journey, record) {
    return `
        <article class="well">
            <div class="well-head">
                <div>
                    <span class="tag">Vista estilo PDF</span>
                    <h2>${escapeHtml(String(record.pozo || '').toUpperCase())}</h2>
                    <p>${escapeHtml(record.campo || '--')} · ${escapeHtml(record.fecha || journey.fecha || '--')} · ${escapeHtml(record.hora || '--')}</p>
                </div>
                <span class="tag">${escapeHtml(record.estatus || 'Sin estatus')}</span>
            </div>
            ${WELL_PREVIEW_SECTIONS.map(section => buildPdfSectionMarkup(section, record)).join('')}
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
        const response = await fetch('img/uvservicioslogo.png');
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