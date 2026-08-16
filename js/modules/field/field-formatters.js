function formatValue(value, fallback = '--') {
    let normalized = String(value ?? '').trim();
    if (/\bSAEN\b/i.test(normalized) && !/\bSAENZ\b/i.test(normalized)) {
        normalized = normalized.replace(/\bSAEN\b/gi, 'SAENZ');
    }
    return normalized || fallback;
}

function formatCurrentTriplet(payload) {
    const values = [payload?.ivsd_a, payload?.ivsd_b, payload?.ivsd_c]
        .map(value => formatValue(value, '--'));

    return `${values.join(' ')} amp`;
}

export function buildFieldWhatsappMessage(payload) {
    const est = String(payload?.estatus || '').trim().toUpperCase();
    const estNorm = est.replace(/[^A-Z]/g, '');
    const isOff = ['OFF', 'PARADAMANUAL', 'RUNATENCIONALCLIENTE', 'OFFATENCIONALCLIENTE'].includes(estNorm);

    const lines = [
        `Técnico 1: ${formatValue(payload?.tecnico_1)}`,
        `Técnico 2: ${formatValue(payload?.tecnico_2)}`,
        `Equipo de guardia: ${formatValue(payload?.equipo_guardia)}`,
        `Locacion: ${formatValue(payload?.locacion_jornada)}`,
        `Hora: ${formatValue(payload?.hora)}`,
        `Pozo: ${formatValue(payload?.pozo).toUpperCase()}`,
        ['OFF', 'PARADA MANUAL', 'RUN / ATENCION AL CLIENTE', 'OFF / ATENCION AL CLIENTE'].includes(est) ? `Estatus: ${est}` : null,
        `Hz: ${formatValue(payload?.hz)}`,
        isOff ? null : `Sentido: ${formatValue(payload?.sentido_giro, 'FWD').toUpperCase()}`,
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
    ].filter(line => line !== null);

    return lines.join('\n');
}
