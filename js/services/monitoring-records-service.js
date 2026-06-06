import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess, ensureMonitoringWriteAccess } from './monitoring-access.js';
import {
    buildMonitoringRecordKey,
    compareMonitoringMoments,
    fetchAllRows,
    fetchExistingMonitoringRecordsForSync,
    getOperationalAlertSignals,
    normalizeMonitoringTime
} from './monitoring-shared.js';

const MONITORING_FIELDS_TO_COMPARE = [
    'pozo_name',
    'campo',
    'fecha',
    'hora',
    'frecuencia',
    'corriente_motor',
    'presion_thp',
    'presion_chp',
    'presion_lf',
    'pip',
    'tm',
    'vsd_a',
    'vsd_b',
    'vsd_c',
    'sentido_giro',
    'estatus',
    'observaciones'
];

function normalizeMonitoringRecord(record = {}) {
    return {
        ...record,
        pozo_name: String(record.pozo_name || '').trim(),
        campo: String(record.campo || '').trim(),
        fecha: record.fecha || null,
        hora: normalizeMonitoringTime(record.hora),
        sentido_giro: String(record.sentido_giro || '').trim(),
        estatus: String(record.estatus || '').trim(),
        observaciones: String(record.observaciones || '').trim()
    };
}

function areEquivalentMonitoringRecords(left = {}, right = {}) {
    return MONITORING_FIELDS_TO_COMPARE.every(fieldName => {
        const leftValue = left?.[fieldName] ?? null;
        const rightValue = right?.[fieldName] ?? null;
        return String(leftValue) === String(rightValue);
    });
}

function getChangedMonitoringFields(nextRecord = {}, currentRecord = {}) {
    return MONITORING_FIELDS_TO_COMPARE
        .filter(fieldName => String(nextRecord?.[fieldName] ?? null) !== String(currentRecord?.[fieldName] ?? null))
        .map(fieldName => ({
            fieldName,
            previousValue: currentRecord?.[fieldName] ?? null,
            nextValue: nextRecord?.[fieldName] ?? null
        }));
}

export async function getMonitoringData(pozos = [], startDate = null, endDate = null) {
    await ensureMonitoringReadAccess();
    let query = supabase
        .from('monitoreo_pozos')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false });

    const pozoList = Array.isArray(pozos) ? pozos : [pozos];

    if (pozoList.length > 0 && !pozoList.includes('Todas')) {
        query = query.in('pozo_name', pozoList);
    }

    if (startDate) query = query.gte('fecha', startDate);
    if (endDate) query = query.lte('fecha', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getLatestMonitoringRecords(pozoName, limit = 15) {
    if (!pozoName || pozoName === 'Todas') return [];
    await ensureMonitoringReadAccess();

    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 15;
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .select('*')
        .eq('pozo_name', pozoName)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .limit(safeLimit);

    if (error) throw error;
    return data || [];
}

export async function getLatestMonitoringSnapshot() {
    const rows = await fetchAllRows('monitoreo_pozos', '*');
    const latestByPozo = new Map();

    (rows || []).forEach(record => {
        const pozoName = String(record?.pozo_name || '').trim();
        if (!pozoName) return;

        const current = latestByPozo.get(pozoName);
        if (!current || compareMonitoringMoments(record, current) > 0) {
            latestByPozo.set(pozoName, {
                ...record,
                pozo_name: pozoName,
                campo_name: String(record?.campo || '').trim() || null,
                normalized_estatus: String(record?.estatus || '').trim() || null
            });
        }
    });

    return [...latestByPozo.values()]
        .sort((left, right) => left.pozo_name.localeCompare(right.pozo_name));
}

export async function getMonitoringDailyActivity(limit = 12, referenceDate = new Date()) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 12;
    const baseDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : new Date();

    const dayStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setDate(nextDayStart.getDate() + 1);

    try {
        const [allDayRows, detailedDayRows] = await Promise.all([
            fetchAllRows('monitoreo_pozos', 'pozo_name, created_at', (query) => query
                .gte('created_at', dayStart.toISOString())
                .lt('created_at', nextDayStart.toISOString())),
            fetchAllRows(
                'monitoreo_pozos',
                'id, pozo_name, fecha, hora, estatus, created_at, frecuencia, corriente_motor, pip, tm, presion_thp, presion_chp, presion_lf, vsd_a, vsd_b, vsd_c, sentido_giro, observaciones',
                (query) => query
                    .gte('created_at', dayStart.toISOString())
                    .lt('created_at', nextDayStart.toISOString())
                    .order('created_at', { ascending: false })
            )
        ]);

        const countsByPozo = new Map();
        (allDayRows || []).forEach(record => {
            const pozoName = String(record?.pozo_name || '').trim();
            if (!pozoName) return;
            countsByPozo.set(pozoName, (countsByPozo.get(pozoName) || 0) + 1);
        });

        return {
            supported: true,
            total: allDayRows.length,
            uniquePozos: countsByPozo.size,
            pozoCounts: [...countsByPozo.entries()]
                .map(([pozo_name, count]) => ({ pozo_name, count }))
                .sort((left, right) => right.count - left.count || left.pozo_name.localeCompare(right.pozo_name)),
            records: (detailedDayRows || []).slice(0, Math.max(safeLimit, detailedDayRows?.length || 0)),
            rangeStart: dayStart.toISOString(),
            rangeEnd: nextDayStart.toISOString()
        };
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/created_at/i.test(message)) {
            return {
                supported: false,
                total: 0,
                uniquePozos: 0,
                pozoCounts: [],
                records: [],
                rangeStart: dayStart.toISOString(),
                rangeEnd: nextDayStart.toISOString(),
                error: 'Para mostrar cargas del dia hace falta la columna created_at en monitoreo_pozos.'
            };
        }

        throw error;
    }
}

export async function getRecordById(id) {
    await ensureMonitoringReadAccess();
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function insertRecord(record) {
    await ensureMonitoringWriteAccess();
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .insert([record]);

    if (error) throw error;
    return data;
}

export async function updateRecord(id, record) {
    await ensureMonitoringWriteAccess();
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .update(record)
        .eq('id', id);

    if (error) throw error;
    return data;
}

export async function deleteRecord(id) {
    await ensureMonitoringWriteAccess();
    if (!id || id === 'undefined') {
        throw new Error('No se puede eliminar: El registro no tiene un ID válido asociado.');
    }

    const { error } = await supabase
        .from('monitoreo_pozos')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

export async function bulkInsertRecords(records) {
    await ensureMonitoringWriteAccess();
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .insert(records);

    if (error) throw error;
    return data;
}

export async function syncMonitoringRecords(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeMonitoringRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0 };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildMonitoringRecordKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();
    const normalizedPozoNames = new Set(dedupedRecords.map(record => String(record.pozo_name || '').trim().toUpperCase()));
    const existingRecords = (await fetchExistingMonitoringRecordsForSync(fechas))
        .filter(record => normalizedPozoNames.has(String(record?.pozo_name || '').trim().toUpperCase()));

    const existingByKey = new Map();
    (existingRecords || []).forEach(record => {
        const key = buildMonitoringRecordKey(record);
        if (!existingByKey.has(key)) {
            existingByKey.set(key, record);
        }
    });

    const recordsToInsert = [];
    const recordsToUpdate = [];
    const recordsToSkip = [];

    dedupedRecords.forEach(record => {
        const existingRecord = existingByKey.get(buildMonitoringRecordKey(record));
        if (existingRecord) {
            if (areEquivalentMonitoringRecords(record, existingRecord)) {
                recordsToSkip.push({ id: existingRecord.id, record, existingRecord });
            } else {
                recordsToUpdate.push({
                    id: existingRecord.id,
                    record,
                    existingRecord,
                    changedFields: getChangedMonitoringFields(record, existingRecord)
                });
            }
        } else {
            recordsToInsert.push(record);
        }
    });

    for (const item of recordsToUpdate) {
        const { error } = await supabase
            .from('monitoreo_pozos')
            .update(item.record)
            .eq('id', item.id);

        if (error) throw error;
    }

    if (recordsToInsert.length > 0) {
        const { error } = await supabase
            .from('monitoreo_pozos')
            .insert(recordsToInsert);

        if (error) throw error;
    }

    return {
        inserted: recordsToInsert.length,
        updated: recordsToUpdate.length,
        skipped: recordsToSkip.length,
        total: dedupedRecords.length
    };
}

export async function previewMonitoringSync(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeMonitoringRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0, recordsToInsert: [], recordsToUpdate: [], recordsToSkip: [] };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildMonitoringRecordKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();
    const normalizedPozoNames = new Set(dedupedRecords.map(record => String(record.pozo_name || '').trim().toUpperCase()));
    const existingRecords = (await fetchExistingMonitoringRecordsForSync(fechas))
        .filter(record => normalizedPozoNames.has(String(record?.pozo_name || '').trim().toUpperCase()));

    const existingByKey = new Map();
    (existingRecords || []).forEach(record => {
        const key = buildMonitoringRecordKey(record);
        if (!existingByKey.has(key)) {
            existingByKey.set(key, record);
        }
    });

    const recordsToInsert = [];
    const recordsToUpdate = [];
    const recordsToSkip = [];

    dedupedRecords.forEach(record => {
        const existingRecord = existingByKey.get(buildMonitoringRecordKey(record));
        if (existingRecord) {
            if (areEquivalentMonitoringRecords(record, existingRecord)) {
                recordsToSkip.push({ id: existingRecord.id, record, existingRecord });
            } else {
                recordsToUpdate.push({
                    id: existingRecord.id,
                    record,
                    existingRecord,
                    changedFields: getChangedMonitoringFields(record, existingRecord)
                });
            }
        } else {
            recordsToInsert.push(record);
        }
    });

    return {
        inserted: recordsToInsert.length,
        updated: recordsToUpdate.length,
        skipped: recordsToSkip.length,
        total: dedupedRecords.length,
        recordsToInsert,
        recordsToUpdate,
        recordsToSkip
    };
}

export async function getUniquePozos() {
    const [monitoringRows, technicalRows, besRows] = await Promise.all([
        fetchAllRows('monitoreo_pozos', 'pozo_name'),
        fetchAllRows('well_production', 'pozo_name'),
        fetchAllRows('well_bes_profile', 'pozo_name').catch(() => [])
    ]);

    const allPozos = [...monitoringRows, ...technicalRows, ...besRows]
        .map(item => item?.pozo_name?.trim())
        .filter(Boolean);

    return [...new Set(allPozos)];
}

export async function getPozosHistorySummary() {
    const [pozos, monitoringRows] = await Promise.all([
        getUniquePozos(),
        fetchAllRows('monitoreo_pozos', 'pozo_name, fecha')
    ]);

    const latestByPozo = new Map();
    (monitoringRows || []).forEach(record => {
        const pozoName = record?.pozo_name?.trim();
        const fecha = record?.fecha || null;
        if (!pozoName) return;

        const currentLatest = latestByPozo.get(pozoName);
        if (!currentLatest || (fecha && fecha > currentLatest)) {
            latestByPozo.set(pozoName, fecha);
        }
    });

    return pozos
        .map(pozoName => ({
            pozo_name: pozoName,
            latest_fecha: latestByPozo.get(pozoName) || null,
            has_records: latestByPozo.has(pozoName)
        }))
        .sort((a, b) => a.pozo_name.localeCompare(b.pozo_name));
}

export async function getLatestDate(pozoName = null) {
    await ensureMonitoringReadAccess();
    let query = supabase
        .from('monitoreo_pozos')
        .select('fecha')
        .order('fecha', { ascending: false })
        .limit(1);

    if (pozoName && pozoName !== 'Todas') {
        query = query.eq('pozo_name', pozoName);
    }

    const { data, error } = await query;
    if (error) return null;
    return data && data.length > 0 ? data[0].fecha : null;
}

export async function getPozoRecordDates(pozoName) {
    if (!pozoName || pozoName === 'Todas') return [];

    return fetchAllRows('monitoreo_pozos', 'fecha, hora', (query) => query
        .eq('pozo_name', pozoName)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
    );
}

export async function getNeighborRecords(pozoName, startDate, endDate) {
    if (!pozoName || pozoName === 'Todas') return [];
    await ensureMonitoringReadAccess();

    const prev = await supabase
        .from('monitoreo_pozos')
        .select('*')
        .eq('pozo_name', pozoName)
        .lt('fecha', startDate)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
        .limit(1);

    const next = await supabase
        .from('monitoreo_pozos')
        .select('*')
        .eq('pozo_name', pozoName)
        .gt('fecha', endDate)
        .order('fecha', { ascending: true })
        .order('hora', { ascending: true })
        .limit(1);

    const results = [];
    if (prev.data && prev.data[0]) results.push(prev.data[0]);
    if (next.data && next.data[0]) results.push(next.data[0]);
    return results;
}

export async function getMonitoringAlertSummary(days = 7) {
    const safeDays = Number.isFinite(Number(days)) ? Math.max(Number(days), 1) : 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - safeDays + 1);
    const sinceKey = sinceDate.toISOString().slice(0, 10);

    const rows = await fetchAllRows(
        'monitoreo_pozos',
        'pozo_name, fecha, hora, estatus, observaciones',
        (query) => query.gte('fecha', sinceKey)
    );

    const grouped = new Map();
    (rows || []).forEach(record => {
        const pozoName = String(record?.pozo_name || '').trim();
        if (!pozoName) return;

        const signals = getOperationalAlertSignals(record);
        if (!signals.length) return;

        const current = grouped.get(pozoName) || {
            pozo_name: pozoName,
            count: 0,
            latest_fecha: null,
            latest_hora: null,
            latest_estatus: null,
            signals: new Set()
        };

        current.count += 1;
        current.latest_estatus = record?.estatus || current.latest_estatus;

        if (!current.latest_fecha || compareMonitoringMoments(record, { fecha: current.latest_fecha, hora: current.latest_hora }) > 0) {
            current.latest_fecha = record?.fecha || current.latest_fecha;
            current.latest_hora = record?.hora || current.latest_hora;
            current.latest_estatus = record?.estatus || current.latest_estatus;
        }

        signals.forEach(signal => current.signals.add(signal));
        grouped.set(pozoName, current);
    });

    return [...grouped.values()]
        .map(item => ({
            ...item,
            signals: [...item.signals]
        }))
        .sort((left, right) => right.count - left.count || left.pozo_name.localeCompare(right.pozo_name));
}

export async function deleteAllRecordsByPozo(pozoName) {
    await ensureMonitoringWriteAccess();
    if (!pozoName || pozoName === 'Todas') return 0;

    const { count: countTele, error: errorTele } = await supabase
        .from('monitoreo_pozos')
        .delete({ count: 'exact' })
        .ilike('pozo_name', `%${pozoName.trim()}%`);

    if (errorTele) throw errorTele;

    return countTele || 0;
}
