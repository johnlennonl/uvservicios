function formatValue(value, fallback = '--') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function formatCurrentTriplet(payload) {
    const values = [payload?.ivsd_a, payload?.ivsd_b, payload?.ivsd_c]
        .map(value => formatValue(value, '--'));

    return `${values.join(' ')} amp`;
}

export function buildFieldWhatsappMessage(payload) {
    return [
        `Equipo de guardia: ${formatValue(payload?.equipo_guardia)}`,
        `Locacion: ${formatValue(payload?.locacion_jornada)}`,
        `Hora: ${formatValue(payload?.hora)}`,
        `Pozo: ${formatValue(payload?.pozo).toUpperCase()}`,
        `Hz: ${formatValue(payload?.hz)}`,
        formatValue(payload?.sentido_giro, 'FWD').toUpperCase(),
        `I vsd: ${formatCurrentTriplet(payload)}`,
        `V vsd: ${formatValue(payload?.v_vsd)} volt`,
        `I mot: ${formatValue(payload?.i_mot)}`,
        `V mot: ${formatValue(payload?.v_mot)}`,
        `PI: ${formatValue(payload?.pi)}`,
        `PD: ${formatValue(payload?.pd)}`,
        `TI: ${formatValue(payload?.ti)}`,
        `TM: ${formatValue(payload?.tm)}`,
        `THP: ${formatValue(payload?.thp)}`,
        `LF: ${formatValue(payload?.lf)}`,
        `CHP: ${formatValue(payload?.chp)}`,
        '',
        `Comentario: ${formatValue(payload?.comentario)}`
    ].join('\n');
}