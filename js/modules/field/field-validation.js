const REQUIRED_FIELDS = [
    'equipo_guardia',
    'locacion_jornada',
    'fecha',
    'hora',
    'pozo',
    'hz',
    'sentido_giro',
    'v_vsd',
    'i_mot',
    'v_mot',
    'thp',
    'lf',
    'chp',
    'pi',
    'pd',
    'ti',
    'tm',
    'ivsd_a',
    'ivsd_b',
    'ivsd_c',
    'comentario'
];

const NUMERIC_FIELDS = [
    'hz',
    'v_vsd',
    'i_mot',
    'v_mot',
    'thp',
    'lf',
    'chp',
    'pi',
    'pd',
    'ti',
    'tm',
    'ivsd_a',
    'ivsd_b',
    'ivsd_c'
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
        message: 'Mensaje listo para compartir.'
    };
}

function getFieldLabel(fieldName) {
    const labels = {
        equipo_guardia: 'el equipo de guardia',
        locacion_jornada: 'la locacion de la jornada',
        fecha: 'la fecha',
        hora: 'la hora',
        pozo: 'el pozo',
        hz: 'Hz',
        sentido_giro: 'el sentido de giro',
        comentario: 'el comentario',
        v_vsd: 'V VSD',
        i_mot: 'I Motor',
        v_mot: 'V Motor',
        thp: 'THP',
        lf: 'LF',
        chp: 'CHP',
        pi: 'PI',
        pd: 'PD',
        ti: 'TI',
        tm: 'TM',
        ivsd_a: 'I VSD fase A',
        ivsd_b: 'I VSD fase B',
        ivsd_c: 'I VSD fase C'
    };

    return labels[fieldName] || fieldName;
}