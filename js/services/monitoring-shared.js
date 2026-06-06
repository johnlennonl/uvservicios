import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess } from './monitoring-access.js';

export async function fetchAllRows(tableName, selectClause, configureQuery) {
    await ensureMonitoringReadAccess();
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        let query = supabase
            .from(tableName)
            .select(selectClause)
            .range(from, from + pageSize - 1);

        if (typeof configureQuery === 'function') {
            query = configureQuery(query) || query;
        }

        const { data, error } = await query;
        if (error) throw error;

        const batch = data || [];
        rows = rows.concat(batch);

        if (batch.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return rows;
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeOperationalStatus(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '');

    const runValues = new Set(['RUN', 'RUNNING', 'ON', 'ENCENDIDO', 'OPERANDO', 'OPERATIVO', 'ACTIVO', 'MARCHA', '1']);
    const offValues = new Set(['OFF', 'OFFLINE', 'STOP', 'STOPPED', 'PARADO', 'APAGADO', 'INACTIVO', 'DETENIDO', '0']);

    if (runValues.has(normalized)) return 'RUN';
    if (offValues.has(normalized)) return 'OFF';
    if (normalized.includes('RUN')) return 'RUN';
    if (normalized.includes('OFF') || normalized.includes('STOP')) return 'OFF';
    return raw.toUpperCase();
}

export function normalizeMonitoringTime(value) {
    const raw = String(value || '00:00:00').trim() || '00:00:00';
    const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return raw;

    const hours = match[1].padStart(2, '0');
    const minutes = match[2];
    const seconds = match[3] || '00';
    return `${hours}:${minutes}:${seconds}`;
}

export function compareMonitoringMoments(left = {}, right = {}) {
    return String(left?.fecha || '').localeCompare(String(right?.fecha || ''))
        || normalizeMonitoringTime(left?.hora).localeCompare(normalizeMonitoringTime(right?.hora))
        || String(left?.created_at || '').localeCompare(String(right?.created_at || ''));
}

export function getOperationalAlertSignals(record = {}) {
    const normalizedStatus = normalizeOperationalStatus(record?.estatus);
    const normalizedNotes = normalizeSearchText(record?.observaciones);
    const signals = [];

    if (normalizedStatus && !['RUN', 'OFF'].includes(normalizedStatus)) {
        signals.push(`estatus ${normalizedStatus}`);
    }

    const keywordSignals = [
        ['alarma', 'alarma reportada'],
        ['alerta', 'alerta reportada'],
        ['falla', 'falla reportada'],
        ['trip', 'trip reportado'],
        ['proteccion', 'proteccion reportada'],
        ['sobrecorr', 'sobrecorriente reportada'],
        ['sobrecarga', 'sobrecarga reportada'],
        ['temperatura alta', 'temperatura alta reportada'],
        ['vibracion', 'vibracion reportada']
    ];

    keywordSignals.forEach(([needle, label]) => {
        if (normalizedNotes.includes(needle)) {
            signals.push(label);
        }
    });

    return [...new Set(signals)];
}

export function buildMonitoringRecordKey(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    const hora = normalizeMonitoringTime(record.hora);
    return `${pozoName}|${fecha}|${hora}`;
}

export async function fetchExistingMonitoringRecordsForSync(fechas = []) {
    const sortedDates = (Array.isArray(fechas) ? fechas : []).filter(Boolean).sort();

    return fetchAllRows('monitoreo_pozos', 'id, pozo_name, campo, fecha, hora, frecuencia, corriente_motor, presion_thp, presion_chp, presion_lf, pip, tm, vsd_a, vsd_b, vsd_c, sentido_giro, estatus, observaciones', (query) => {
        let configured = query;
        if (sortedDates[0]) configured = configured.gte('fecha', sortedDates[0]);
        if (sortedDates[sortedDates.length - 1]) configured = configured.lte('fecha', sortedDates[sortedDates.length - 1]);
        return configured;
    });
}

export function buildTechnicalRecordKey(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    return `${pozoName}|${fecha}`;
}

export function wrapTechnicalHistoryError(error) {
    const message = String(error?.message || error || '');
    if (/well_production_history/i.test(message)) {
        return new Error('Falta crear la tabla de historial técnico en Supabase. Ejecuta el script supabase/well_production_history.sql y vuelve a intentar.');
    }
    return error instanceof Error ? error : new Error(message || 'Error desconocido en historial técnico.');
}

export function wrapBESProfileError(error) {
    const message = String(error?.message || error || '');
    if (/well_bes_profile/i.test(message)) {
        return new Error('Falta crear la tabla de perfil BES en Supabase. Ejecuta el script supabase/well_bes_profile.sql y vuelve a intentar.');
    }
    return error instanceof Error ? error : new Error(message || 'Error desconocido en perfil BES.');
}
