/**
 * Servicio de mediciones y snapshot técnico.
 */

import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess, ensureMonitoringWriteAccess } from './monitoring-access.js';
import {
    buildTechnicalRecordKey,
    fetchAllRows,
    wrapTechnicalHistoryError
} from './monitoring-shared.js';
import { getWellBESProfile } from './bes-profile-service.js';

const TECHNICAL_FIELDS_TO_COMPARE = [
    'pozo_name',
    'campo_name',
    'ef',
    'fecha',
    'potencial',
    'bbpd',
    'ays_percentage',
    'bnpd',
    'cat_number'
];

function normalizeTechnicalRecord(record = {}) {
    return {
        pozo_name: String(record?.pozo_name || '').trim(),
        campo_name: String(record?.campo_name || '').trim(),
        ef: String(record?.ef || '').trim(),
        fecha: record?.fecha || null,
        potencial: record?.potencial ?? 0,
        bbpd: record?.bbpd ?? 0,
        ays_percentage: record?.ays_percentage ?? 0,
        bnpd: record?.bnpd ?? 0,
        cat_number: record?.cat_number ?? 1
    };
}

function areEquivalentTechnicalRecords(left = {}, right = {}) {
    return TECHNICAL_FIELDS_TO_COMPARE.every(fieldName => {
        const leftValue = left?.[fieldName] ?? null;
        const rightValue = right?.[fieldName] ?? null;
        return String(leftValue) === String(rightValue);
    });
}

function normalizeWellLookupKey(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function getWellTechnicalData(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;
    await ensureMonitoringReadAccess();

    const normalizedPozo = String(pozoName || '').trim().toUpperCase();

    const { data, error } = await supabase
        .from('well_production')
        .select('*')
        .eq('pozo_name', normalizedPozo)
        .order('fecha', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching well technical data:', error);
        return null;
    }

    if (data && data.length > 0) return data[0];

    const lookupKey = normalizeWellLookupKey(normalizedPozo);
    const prefix = lookupKey.slice(0, 3);
    if (!lookupKey || !prefix) return null;

    const fallback = await supabase
        .from('well_production')
        .select('*')
        .ilike('pozo_name', `%${prefix}%`)
        .order('fecha', { ascending: false })
        .limit(200);

    if (fallback.error) {
        console.error('Error fetching fallback well technical data:', fallback.error);
        return null;
    }

    return (fallback.data || []).find(record => normalizeWellLookupKey(record?.pozo_name) === lookupKey) || null;
}

export async function getLatestTechnicalSnapshot() {
    const rows = await fetchAllRows('well_production', 'pozo_name, campo_name, ef, fecha, potencial, bbpd, ays_percentage, bnpd, cat_number');
    return (rows || [])
        .map(row => ({
            ...row,
            pozo_name: String(row?.pozo_name || '').trim()
        }))
        .filter(row => row.pozo_name)
        .sort((left, right) => left.pozo_name.localeCompare(right.pozo_name));
}

export async function getRecentTechnicalMeasurements(limit = 10) {
    await ensureMonitoringReadAccess();
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;

    try {
        const { data, error } = await supabase
            .from('well_production_history')
            .select('*')
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(safeLimit);

        if (error) throw error;

        if (data && data.length > 0) {
            return data;
        }

        const fallback = await supabase
            .from('well_production')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(safeLimit);

        if (fallback.error) throw fallback.error;
        return fallback.data || [];
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/well_production_history/i.test(message)) {
            const fallback = await supabase
                .from('well_production')
                .select('*')
                .order('fecha', { ascending: false })
                .limit(safeLimit);

            if (fallback.error) throw fallback.error;
            return fallback.data || [];
        }

        throw error;
    }
}

export async function getTechnicalHistory(pozoName, startDate = null, endDate = null) {
    if (!pozoName || pozoName === 'Todas') return [];
    await ensureMonitoringReadAccess();

    try {
        let query = supabase
            .from('well_production_history')
            .select('*')
            .eq('pozo_name', pozoName)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false });

        if (startDate) query = query.gte('fecha', startDate);
        if (endDate) query = query.lte('fecha', endDate);

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
            return data;
        }

        const latestTechnical = await getWellTechnicalData(pozoName);
        if (!latestTechnical?.fecha) {
            return [];
        }

        if (startDate && latestTechnical.fecha < startDate) {
            return [];
        }

        if (endDate && latestTechnical.fecha > endDate) {
            return [];
        }

        return [latestTechnical];
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

async function refreshTechnicalSnapshot(pozoName) {
    if (!pozoName) return null;
    await ensureMonitoringReadAccess();

    try {
        const { data, error } = await supabase
            .from('well_production_history')
            .select('pozo_name, campo_name, ef, fecha, potencial, bbpd, ays_percentage, bnpd, cat_number')
            .eq('pozo_name', pozoName)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        const latestRecord = data && data.length > 0 ? data[0] : null;
        if (!latestRecord) return null;

        await upsertWellTechnicalData(latestRecord);
        return latestRecord;
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

export async function saveTechnicalMeasurement(data) {
    await ensureMonitoringWriteAccess();
    const normalized = normalizeTechnicalRecord(data);

    if (!normalized.pozo_name) {
        throw new Error('Nombre del pozo es requerido para guardar la medición técnica.');
    }

    if (!normalized.fecha) {
        throw new Error('La fecha de la medición técnica es requerida.');
    }

    try {
        const { error } = await supabase
            .from('well_production_history')
            .upsert(normalized, { onConflict: 'pozo_name,fecha' });

        if (error) throw error;

        await refreshTechnicalSnapshot(normalized.pozo_name);
        return normalized;
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

export async function syncTechnicalMeasurements(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeTechnicalRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0 };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildTechnicalRecordKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const pozoNames = [...new Set(dedupedRecords.map(record => record.pozo_name))];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();

    try {
        let existingQuery = supabase
            .from('well_production_history')
            .select('id, pozo_name, campo_name, ef, fecha, potencial, bbpd, ays_percentage, bnpd, cat_number')
            .in('pozo_name', pozoNames);

        if (fechas[0]) existingQuery = existingQuery.gte('fecha', fechas[0]);
        if (fechas[fechas.length - 1]) existingQuery = existingQuery.lte('fecha', fechas[fechas.length - 1]);

        const { data: existingRecords, error: existingError } = await existingQuery;
        if (existingError) throw existingError;

        const existingByKey = new Map();
        (existingRecords || []).forEach(record => {
            existingByKey.set(buildTechnicalRecordKey(record), record);
        });

        const recordsToInsert = [];
        const recordsToUpdate = [];
        const recordsToSkip = [];

        dedupedRecords.forEach(record => {
            const existingRecord = existingByKey.get(buildTechnicalRecordKey(record));
            if (existingRecord) {
                if (areEquivalentTechnicalRecords(record, existingRecord)) {
                    recordsToSkip.push({ id: existingRecord.id, record });
                } else {
                    recordsToUpdate.push({ id: existingRecord.id, record });
                }
            } else {
                recordsToInsert.push(record);
            }
        });

        for (const item of recordsToUpdate) {
            const { error } = await supabase
                .from('well_production_history')
                .update(item.record)
                .eq('id', item.id);

            if (error) throw error;
        }

        if (recordsToInsert.length > 0) {
            const { error } = await supabase
                .from('well_production_history')
                .insert(recordsToInsert);

            if (error) throw error;
        }

        for (const pozoName of pozoNames) {
            await refreshTechnicalSnapshot(pozoName);
        }

        return {
            inserted: recordsToInsert.length,
            updated: recordsToUpdate.length,
            skipped: recordsToSkip.length,
            total: dedupedRecords.length
        };
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

export async function previewTechnicalMeasurements(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeTechnicalRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0, recordsToInsert: [], recordsToUpdate: [], recordsToSkip: [] };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildTechnicalRecordKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const pozoNames = [...new Set(dedupedRecords.map(record => record.pozo_name))];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();

    try {
        let existingQuery = supabase
            .from('well_production_history')
            .select('id, pozo_name, campo_name, ef, fecha, potencial, bbpd, ays_percentage, bnpd, cat_number')
            .in('pozo_name', pozoNames);

        if (fechas[0]) existingQuery = existingQuery.gte('fecha', fechas[0]);
        if (fechas[fechas.length - 1]) existingQuery = existingQuery.lte('fecha', fechas[fechas.length - 1]);

        const { data: existingRecords, error: existingError } = await existingQuery;
        if (existingError) throw existingError;

        const existingByKey = new Map();
        (existingRecords || []).forEach(record => {
            existingByKey.set(buildTechnicalRecordKey(record), record);
        });

        const recordsToInsert = [];
        const recordsToUpdate = [];
        const recordsToSkip = [];

        dedupedRecords.forEach(record => {
            const existingRecord = existingByKey.get(buildTechnicalRecordKey(record));
            if (existingRecord) {
                if (areEquivalentTechnicalRecords(record, existingRecord)) {
                    recordsToSkip.push({ id: existingRecord.id, record });
                } else {
                    recordsToUpdate.push({ id: existingRecord.id, record });
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
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

export async function getWellRibbonData(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;
    await ensureMonitoringReadAccess();

    const normalizedPozo = String(pozoName || '').trim().toUpperCase();

    const [latestMonitoringResult, latestTechnical, besProfile] = await Promise.all([
        supabase
            .from('monitoreo_pozos')
            .select('*')
            .eq('pozo_name', normalizedPozo)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(1),
        getWellTechnicalData(normalizedPozo),
        getWellBESProfile(normalizedPozo)
    ]);

    if (latestMonitoringResult.error) {
        console.error('Error fetching latest monitoring data for ribbon:', latestMonitoringResult.error);
    }

    let latestMonitoring = latestMonitoringResult.data && latestMonitoringResult.data.length > 0
        ? latestMonitoringResult.data[0]
        : null;

    if (!latestMonitoring) {
        const lookupKey = normalizeWellLookupKey(normalizedPozo);
        const prefix = lookupKey.slice(0, 3);
        if (lookupKey && prefix) {
            const fallbackMonitoring = await supabase
                .from('monitoreo_pozos')
                .select('*')
                .ilike('pozo_name', `%${prefix}%`)
                .order('fecha', { ascending: false })
                .order('hora', { ascending: false })
                .limit(200);

            if (fallbackMonitoring.error) {
                console.error('Error fetching fallback monitoring data for ribbon:', fallbackMonitoring.error);
            } else {
                latestMonitoring = (fallbackMonitoring.data || []).find(record => normalizeWellLookupKey(record?.pozo_name) === lookupKey) || null;
            }
        }
    }

    if (!latestMonitoring && !latestTechnical) return null;

    const hasUsableBESValue = value => value !== undefined
        && value !== null
        && `${value}`.trim() !== ''
        && !/^(0+|--|n\/a|na|s\/n|sin dato|sin datos)$/i.test(`${value}`.trim());
    const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && `${value}`.trim() !== '');
    const firstUsableBESValue = (...values) => values.find(hasUsableBESValue);
    const technicalDate = latestTechnical?.fecha || null;
    const measurementDate = technicalDate || null;
    const pumpSummary = [besProfile?.pump_manufacturer, besProfile?.pump_model, besProfile?.multiphase_pump]
        .filter(hasUsableBESValue)
        .join(' · ');

    return {
        campo_name: firstDefined(latestMonitoring?.campo_name, latestMonitoring?.campo, latestTechnical?.campo_name),
        pozo_name: firstDefined(latestMonitoring?.pozo_name, latestTechnical?.pozo_name, pozoName),
        ef: firstDefined(latestMonitoring?.ef, latestMonitoring?.estacion, latestTechnical?.ef),
        pump_type: firstUsableBESValue(pumpSummary, besProfile?.pump_model, besProfile?.multiphase_pump, besProfile?.pump_type),
        pump_manufacturer: firstUsableBESValue(besProfile?.pump_manufacturer),
        pump_model: firstUsableBESValue(besProfile?.pump_model),
        pump_serial: firstUsableBESValue(besProfile?.pump_serial),
        multiphase_pump: firstUsableBESValue(besProfile?.multiphase_pump),
        gas_separator: firstUsableBESValue(besProfile?.gas_separator),
        seal_section: firstUsableBESValue(besProfile?.seal_section),
        drain_valve: firstUsableBESValue(besProfile?.drain_valve),
        fecha: firstDefined(latestTechnical?.fecha, latestMonitoring?.fecha),
        measurement_date: measurementDate,
        potencial: firstDefined(latestMonitoring?.potencial, latestTechnical?.potencial),
        bbpd: firstDefined(latestMonitoring?.bbpd, latestTechnical?.bbpd),
        ays_percentage: firstDefined(latestMonitoring?.ays_percentage, latestMonitoring?.ays, latestTechnical?.ays_percentage),
        bnpd: firstDefined(latestMonitoring?.bnpd, latestTechnical?.bnpd),
        cat_number: firstDefined(latestMonitoring?.cat_number, latestMonitoring?.cat, latestTechnical?.cat_number)
    };
}

export async function upsertWellTechnicalData(data) {
    await ensureMonitoringWriteAccess();
    const { pozo_name } = data;
    if (!pozo_name) throw new Error('Nombre del pozo es requerido para sincronizar datos técnicos.');

    const { data: result, error } = await supabase
        .from('well_production')
        .upsert(data, { onConflict: 'pozo_name' });

    if (error) throw error;
    return result;
}
