const REQUIRED_FIELDS = [
    'equipo_guardia',
    'fecha',
    'hora',
    'pozo'
];

const NUMERIC_FIELDS = [
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
    'ft_x1_tierra_v',
    'ft_x2_tierra_v',
    'ft_x3_tierra_v',
    'sec_ff_h1_h2_v',
    'sec_ff_h2_h3_v',
    'sec_ff_h3_h1_v',
    'sec_ft_h1_tierra_v',
    'sec_ft_h2_tierra_v',
    'sec_ft_h3_tierra_v',
    'corriente_x1_x2_amp',
    'corriente_h1_h2_amp',
    'corriente_h2_h3_amp',
    'corriente_h3_h1_amp',
    'pd_max_psi'
];

export function validateFieldReport(payload) {
    for (const fieldName of REQUIRED_FIELDS) {
        const value = String(payload?.[fieldName] ?? '').trim();
        if (!value) {
            return {
                isValid: false,
                message: `Falta completar ${getFieldLabel(fieldName)}.`
            };
        }
    }

    for (const fieldName of NUMERIC_FIELDS) {
        const rawValue = payload?.[fieldName];
        if (rawValue === '' || rawValue === null || rawValue === undefined) continue;

        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
            return {
                isValid: false,
                message: `${getFieldLabel(fieldName)} debe ser numérico.`
            };
        }
    }

    return {
        isValid: true,
        message: 'Registro listo para agregarse a la jornada.'
    };
}

function getFieldLabel(fieldName) {
    const labels = {
        equipo_guardia: 'el equipo de guardia',
        fecha: 'la fecha',
        hora: 'la hora',
        pozo: 'el pozo'
    };

    return labels[fieldName] || fieldName;
}