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

const FIELD_LABELS = {
    tecnico_1: 'el técnico 1',
    tecnico_2: 'el técnico 2',
    equipo_guardia: 'el equipo de guardia',
    fecha: 'la fecha',
    hora: 'la hora',
    pozo: 'el pozo',
    actividad: 'la actividad',
    estatus: 'el estatus',
    observaciones_pozo: 'las observaciones',
    frecuencia: 'la frecuencia',
    i_motor: 'la corriente del motor',
    v_motor: 'el voltaje del motor',
    out_vsd: 'el voltaje de salida del VSD',
    pip_psi: 'el PIP',
    pd_psi: 'el PD',
    ti_f: 'la temperatura TI',
    tm_f: 'la temperatura TM',
    thp_psi: 'el THP',
    chp_psi: 'el CHP',
    lf_psi: 'el LF',
    temperatura_caseta: 'la temperatura de la caseta',
    estado_fosa_porcentaje: 'el estado de fosa',
    ays_percentage: 'el % AyS'
};

const NON_NEGATIVE_FIELDS = [
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

const HARD_LIMIT_RULES = [
    { field: 'frecuencia', max: 140, message: 'La frecuencia luce inviable para revision de campo. Revisa si hubo un cero o decimal extra.' },
    { field: 'tm_f', max: 1000, message: 'TM quedo extremadamente alta. Revisa si hubo un cero adicional.' },
    { field: 'ti_f', max: 1000, message: 'TI quedo extremadamente alta. Revisa si hubo un cero adicional.' },
    { field: 'pip_psi', max: 20000, message: 'El PIP quedo demasiado alto para un registro normal. Verifica el dato.' },
    { field: 'pd_psi', max: 20000, message: 'El PD quedo demasiado alto para un registro normal. Verifica el dato.' },
    { field: 'thp_psi', max: 20000, message: 'El THP quedo demasiado alto para un registro normal. Verifica el dato.' },
    { field: 'chp_psi', max: 20000, message: 'El CHP quedo demasiado alto para un registro normal. Verifica el dato.' },
    { field: 'lf_psi', max: 20000, message: 'El LF quedo demasiado alto para un registro normal. Verifica el dato.' },
    { field: 'i_motor', max: 1000, message: 'La corriente del motor quedo demasiado alta. Verifica el dato.' },
    { field: 'v_motor', max: 25000, message: 'El voltaje del motor quedo demasiado alto. Verifica el dato.' },
    { field: 'out_vsd', max: 25000, message: 'El voltaje de salida del VSD quedo demasiado alto. Verifica el dato.' },
    { field: 'estado_fosa_porcentaje', max: 1000, message: 'El estado de fosa supera un rango razonable. Verifica el porcentaje.' }
];

const WARNING_LIMIT_RULES = [
    { field: 'tm_f', min: 80, max: 450, message: 'TM quedo fuera del rango tipico de trabajo. Revisa si el valor era correcto.' },
    { field: 'ti_f', min: 80, max: 450, message: 'TI quedo fuera del rango tipico de trabajo. Revisa si el valor era correcto.' },
    { field: 'frecuencia', min: 20, max: 90, message: 'La frecuencia quedo fuera del rango operativo usual. Revisala antes de guardar.' },
    { field: 'pip_psi', max: 5000, message: 'El PIP esta por encima de lo usual. Confirma que no hubo un cero adicional.' },
    { field: 'pd_psi', max: 5000, message: 'El PD esta por encima de lo usual. Confirma que no hubo un cero adicional.' },
    { field: 'thp_psi', max: 5000, message: 'El THP esta por encima de lo usual. Confirma que no hubo un cero adicional.' },
    { field: 'chp_psi', max: 5000, message: 'El CHP esta por encima de lo usual. Confirma que no hubo un cero adicional.' },
    { field: 'lf_psi', max: 5000, message: 'El LF esta por encima de lo usual. Confirma que no hubo un cero adicional.' },
    { field: 'i_motor', max: 400, message: 'La corriente del motor esta alta para un monitoreo habitual. Revisala.' },
    { field: 'temperatura_caseta', max: 180, message: 'La temperatura de caseta luce alta. Revisa el dato.' },
    { field: 'estado_fosa_porcentaje', max: 100, message: 'El estado de fosa supera 100%. Revisa si el porcentaje esta bien escrito.' },
    { field: 'ays_percentage', max: 100, message: 'El % AyS supera 100%. Revisa el dato antes de guardar.' }
];

export function validateFieldReport(payload, options = {}) {
    const normalizedPayload = payload || {};
    const context = options.context || 'default';
    const blockers = [];
    const warnings = [];
    const infos = [];

    if (!hasValue(normalizedPayload.pozo)) {
        blockers.push('Selecciona el pozo antes de agregar el registro.');
    }

    if (!hasValue(normalizedPayload.fecha)) {
        blockers.push('La fecha es necesaria para ubicar el monitoreo dentro de la jornada.');
    }

    if (!hasValue(normalizedPayload.hora)) {
        blockers.push('La hora es necesaria para ordenar el monitoreo dentro de la jornada.');
    }

    for (const fieldName of NUMERIC_FIELDS) {
        const rawValue = normalizedPayload[fieldName];
        if (!hasValue(rawValue)) continue;

        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
            blockers.push(`${getFieldLabel(fieldName)} debe ser numerico.`);
        }
    }

    for (const fieldName of NON_NEGATIVE_FIELDS) {
        const numericValue = getNumericValue(normalizedPayload[fieldName]);
        if (numericValue === null) continue;
        if (numericValue < 0) {
            blockers.push(`${getFieldLabel(fieldName)} no puede ser negativo.`);
        }
    }

    HARD_LIMIT_RULES.forEach(rule => {
        const numericValue = getNumericValue(normalizedPayload[rule.field]);
        if (numericValue === null) return;
        if (numericValue > rule.max) {
            blockers.push(rule.message);
        }
    });

    WARNING_LIMIT_RULES.forEach(rule => {
        const numericValue = getNumericValue(normalizedPayload[rule.field]);
        if (numericValue === null) return;
        if (rule.min !== undefined && numericValue < rule.min) {
            warnings.push(rule.message);
            return;
        }
        if (rule.max !== undefined && numericValue > rule.max) {
            warnings.push(rule.message);
        }
    });

    const estatus = String(normalizedPayload.estatus || '').trim().toUpperCase();
    const frecuencia = getNumericValue(normalizedPayload.frecuencia);

    if (estatus === 'RUN' && frecuencia === null) {
        warnings.push('El estatus esta en RUN pero la frecuencia quedo vacia.');
    }

    if (estatus === 'OFF' && frecuencia !== null && frecuencia > 5) {
        warnings.push('El estatus esta en OFF pero la frecuencia sigue alta. Revisa si el estado era correcto.');
    }

    if (!hasValue(normalizedPayload.tecnico_1) && !hasValue(normalizedPayload.equipo_guardia)) {
        infos.push('Todavia no has indicado el técnico 1. Podras guardar el pozo, pero antes de enviar la jornada conviene completarlo.');
    }

    if (!hasValue(normalizedPayload.actividad)) {
        infos.push('La actividad esta vacia. Si fue un monitoreo normal, puedes dejar MONITOREO con un toque mas adelante.');
    }

    if (!hasValue(normalizedPayload.estatus)) {
        infos.push('El estatus quedo vacio. RUN u OFF ayudan a revisar mas rapido desde Administracion.');
    }

    if (!hasValue(normalizedPayload.observaciones_pozo)) {
        infos.push('No hay observaciones del pozo. No bloquea, pero ayuda cuando algo sale fuera de rango.');
    }

    const uniqueBlockers = [...new Set(blockers)];
    const uniqueWarnings = [...new Set(warnings)].filter(item => !uniqueBlockers.includes(item));
    const uniqueInfos = [...new Set(infos)].filter(item => !uniqueBlockers.includes(item) && !uniqueWarnings.includes(item));
    const isValid = uniqueBlockers.length === 0;

    return {
        isValid,
        blockers: uniqueBlockers,
        warnings: uniqueWarnings,
        infos: uniqueInfos,
        message: buildValidationMessage({ isValid, warnings: uniqueWarnings, blockers: uniqueBlockers, context })
    };
}

export function validateFieldJourneyForSubmission(reports = []) {
    const list = Array.isArray(reports) ? reports : [];
    if (list.length === 0) {
        return {
            isValid: false,
            message: 'Primero agrega al menos un pozo a la jornada.',
            focusField: 'field-pozo-display'
        };
    }

    const firstReport = list[0] || {};
    if (!hasValue(firstReport.tecnico_1) && !hasValue(firstReport.equipo_guardia)) {
        return {
            isValid: false,
            message: 'Antes de enviar la jornada completa el Técnico 1.',
            focusField: 'field-tecnico-1'
        };
    }

    if (!hasValue(firstReport.fecha)) {
        return {
            isValid: false,
            message: 'Antes de enviar la jornada completa la fecha del turno.',
            focusField: 'field-fecha'
        };
    }

    const missingPozo = list.find(report => !hasValue(report?.pozo));
    if (missingPozo) {
        return {
            isValid: false,
            message: 'Hay un registro sin pozo y eso impediria sincronizar la jornada.',
            focusField: 'field-pozo-display'
        };
    }

    return {
        isValid: true,
        message: 'La jornada tiene el minimo necesario para enviarse.'
    };
}

function getNumericValue(value) {
    if (!hasValue(value)) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function hasValue(value) {
    return String(value ?? '').trim() !== '';
}

function buildValidationMessage({ isValid, warnings = [], blockers = [], context = 'default' }) {
    if (!isValid) {
        return blockers[0] || 'Corrige los datos marcados antes de guardar.';
    }

    if (warnings.length > 0) {
        return context === 'field'
            ? 'El registro puede guardarse, pero conviene revisar las alertas primero.'
            : 'El registro es valido, aunque contiene alertas para revisar.';
    }

    return 'Registro listo para agregarse a la jornada.';
}

function getFieldLabel(fieldName) {
    return FIELD_LABELS[fieldName] || fieldName;
}
