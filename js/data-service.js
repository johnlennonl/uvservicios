/**
 * Data Service Module
 * Handles CRUD operations for oil well monitoring data.
 */

import { supabase } from './supabaseClient.js';

// Lee una tabla grande por paginas para evitar topes de 1000 filas en Supabase.
async function fetchAllRows(tableName, selectClause, configureQuery) {
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

function buildMonitoringRecordKey(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    const hora = String(record.hora || '00:00:00').trim() || '00:00:00';
    return `${pozoName}|${fecha}|${hora}`;
}

function buildTechnicalRecordKey(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    return `${pozoName}|${fecha}`;
}

// Convierte errores tecnicos en mensajes que se entienden rapido desde la UI.
function wrapTechnicalHistoryError(error) {
    const message = String(error?.message || error || '');
    if (/well_production_history/i.test(message)) {
        return new Error('Falta crear la tabla de historial técnico en Supabase. Ejecuta el script supabase/well_production_history.sql y vuelve a intentar.');
    }
    return error instanceof Error ? error : new Error(message || 'Error desconocido en historial técnico.');
}

function wrapBESProfileError(error) {
    const message = String(error?.message || error || '');
    if (/well_bes_profile/i.test(message)) {
        return new Error('Falta crear la tabla de perfil BES en Supabase. Ejecuta el script supabase/well_bes_profile.sql y vuelve a intentar.');
    }
    return error instanceof Error ? error : new Error(message || 'Error desconocido en perfil BES.');
}

/**
 * Fetches monitoring data with optional filters for Pozo and Date.
 * @param {string} pozoName 
 * @param {string} startDate 
 * @param {string} endDate 
 */
export async function getMonitoringData(pozos = [], startDate = null, endDate = null) {
    let query = supabase
        .from('monitoreo_pozos')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false });

    // Handle both single string (fallback) and array of pozo names
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

/**
 * Fetches a single record by its ID.
 * @param {string} id 
 */
export async function getRecordById(id) {
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error) throw error;
    return data;
}


/**
 * Inserts a single record into the database.
 * @param {object} record 
 */
export async function insertRecord(record) {
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .insert([record]);
    
    if (error) throw error;
    return data;
}

/**
 * Updates an existing record.
 * @param {string} id 
 * @param {object} record 
 */
export async function updateRecord(id, record) {
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .update(record)
        .eq('id', id);
    
    if (error) throw error;
    return data;
}

/**
 * Deletes a record.
 * @param {string} id 
 */
export async function deleteRecord(id) {
    if (!id || id === 'undefined') {
        throw new Error('No se puede eliminar: El registro no tiene un ID válido asociado.');
    }
    const { error } = await supabase
        .from('monitoreo_pozos')
        .delete()
        .eq('id', id);
    
    if (error) throw error;
}

/**
 * Bulk inserts multiple records (useful for CSV upload).
 * @param {Array} records 
 */
export async function bulkInsertRecords(records) {
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .insert(records);
    
    if (error) throw error;
    return data;
}

/**
 * Synchronizes daily monitoring records by pozo + fecha + hora.
 * Matching records are updated and new records are inserted.
 * @param {Array} records
 */
export async function syncMonitoringRecords(records = []) {
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => ({
            ...record,
            pozo_name: String(record.pozo_name).trim(),
            hora: String(record.hora || '00:00:00').trim() || '00:00:00'
        }));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, total: 0 };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildMonitoringRecordKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const pozoNames = [...new Set(dedupedRecords.map(record => record.pozo_name))];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();

    let existingQuery = supabase
        .from('monitoreo_pozos')
        .select('id, pozo_name, fecha, hora')
        .in('pozo_name', pozoNames);

    if (fechas[0]) existingQuery = existingQuery.gte('fecha', fechas[0]);
    if (fechas[fechas.length - 1]) existingQuery = existingQuery.lte('fecha', fechas[fechas.length - 1]);

    const { data: existingRecords, error: existingError } = await existingQuery;
    if (existingError) throw existingError;

    const existingByKey = new Map();
    (existingRecords || []).forEach(record => {
        const key = buildMonitoringRecordKey(record);
        if (!existingByKey.has(key)) {
            existingByKey.set(key, record.id);
        }
    });

    const recordsToInsert = [];
    const recordsToUpdate = [];

    dedupedRecords.forEach(record => {
        const existingId = existingByKey.get(buildMonitoringRecordKey(record));
        if (existingId) {
            recordsToUpdate.push({ id: existingId, record });
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
        total: dedupedRecords.length
    };
}

/**
 * Fetches unique well names for filters.
 */
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

// Resume por pozo si existe historial y cual fue su fecha mas reciente.
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

/**
 * Finds the latest recorded date for a specific well or the entire project.
 */
export async function getLatestDate(pozoName = null) {
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

/**
 * Fetches the record immediately before and after a specific date for a well.
 */
export async function getNeighborRecords(pozoName, startDate, endDate) {
    if (!pozoName || pozoName === 'Todas') return [];

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

/**
 * Fetches specific technical production data for the Data Ribbon.
 * @param {string} pozoName 
 */
export async function getWellTechnicalData(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;

    const { data, error } = await supabase
        .from('well_production')
        .select('*')
        .eq('pozo_name', pozoName)
        .order('fecha', { ascending: false })
        .limit(1);
    
    if (error) {
        console.error('Error fetching well technical data:', error);
        return null;
    }
    
    return data && data.length > 0 ? data[0] : null;
}

export async function getRecentTechnicalMeasurements(limit = 10) {
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

    try {
        const { data, error } = await supabase
            .from('well_production_history')
            .select('pozo_name, campo_name, ef, fecha, bbpd, ays_percentage, bnpd, cat_number')
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
    const normalized = {
        pozo_name: String(data?.pozo_name || '').trim(),
        campo_name: String(data?.campo_name || '').trim(),
        ef: String(data?.ef || '').trim(),
        fecha: data?.fecha || null,
        bbpd: data?.bbpd ?? 0,
        ays_percentage: data?.ays_percentage ?? 0,
        bnpd: data?.bnpd ?? 0,
        cat_number: data?.cat_number ?? 1
    };

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
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => ({
            pozo_name: String(record.pozo_name).trim(),
            campo_name: String(record.campo_name || '').trim(),
            ef: String(record.ef || '').trim(),
            fecha: record.fecha,
            bbpd: record.bbpd ?? 0,
            ays_percentage: record.ays_percentage ?? 0,
            bnpd: record.bnpd ?? 0,
            cat_number: record.cat_number ?? 1
        }));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, total: 0 };
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
            .select('id, pozo_name, fecha')
            .in('pozo_name', pozoNames);

        if (fechas[0]) existingQuery = existingQuery.gte('fecha', fechas[0]);
        if (fechas[fechas.length - 1]) existingQuery = existingQuery.lte('fecha', fechas[fechas.length - 1]);

        const { data: existingRecords, error: existingError } = await existingQuery;
        if (existingError) throw existingError;

        const existingByKey = new Map();
        (existingRecords || []).forEach(record => {
            existingByKey.set(buildTechnicalRecordKey(record), record.id);
        });

        const recordsToInsert = [];
        const recordsToUpdate = [];

        dedupedRecords.forEach(record => {
            const existingId = existingByKey.get(buildTechnicalRecordKey(record));
            if (existingId) {
                recordsToUpdate.push({ id: existingId, record });
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
            total: dedupedRecords.length
        };
    } catch (error) {
        throw wrapTechnicalHistoryError(error);
    }
}

export async function getWellRibbonData(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;

    const [latestMonitoringResult, latestTechnical, besProfile] = await Promise.all([
        supabase
            .from('monitoreo_pozos')
            .select('*')
            .eq('pozo_name', pozoName)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(1),
        getWellTechnicalData(pozoName),
        getWellBESProfile(pozoName)
    ]);

    if (latestMonitoringResult.error) {
        console.error('Error fetching latest monitoring data for ribbon:', latestMonitoringResult.error);
    }

    const latestMonitoring = latestMonitoringResult.data && latestMonitoringResult.data.length > 0
        ? latestMonitoringResult.data[0]
        : null;

    if (!latestMonitoring && !latestTechnical) return null;

    const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && `${value}`.trim() !== '');
    const technicalDate = latestTechnical?.fecha || null;
    const measurementDate = technicalDate || null;

    return {
        campo_name: firstDefined(latestMonitoring?.campo_name, latestMonitoring?.campo, latestTechnical?.campo_name),
        pozo_name: firstDefined(latestMonitoring?.pozo_name, latestTechnical?.pozo_name, pozoName),
        ef: firstDefined(latestMonitoring?.ef, latestMonitoring?.estacion, latestTechnical?.ef),
        pump_type: firstDefined(besProfile?.pump_type),
        fecha: firstDefined(latestTechnical?.fecha, latestMonitoring?.fecha),
        measurement_date: measurementDate,
        bbpd: firstDefined(latestMonitoring?.bbpd, latestTechnical?.bbpd),
        ays_percentage: firstDefined(latestMonitoring?.ays_percentage, latestMonitoring?.ays, latestTechnical?.ays_percentage),
        bnpd: firstDefined(latestMonitoring?.bnpd, latestTechnical?.bnpd),
        cat_number: firstDefined(latestMonitoring?.cat_number, latestMonitoring?.cat, latestTechnical?.cat_number)
    };
}

/**
// Consulta el perfil maestro BES del pozo sin romper si la tabla aun no existe.
 * Inserts or updates technical production data for a well.
 * @param {object} data 
 */
export async function upsertWellTechnicalData(data) {
    const { pozo_name } = data;
    if (!pozo_name) throw new Error('Nombre del pozo es requerido para sincronizar datos técnicos.');

    const { data: result, error } = await supabase
        .from('well_production')
        .upsert(data, { onConflict: 'pozo_name' });
    
    if (error) throw error;
    return result;
}

export async function getWellBESProfile(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;

    try {
        const { data, error } = await supabase
            .from('well_bes_profile')
            .select('*')
            .eq('pozo_name', pozoName)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/well_bes_profile/i.test(message)) {
            console.warn('Tabla well_bes_profile no disponible todavía.');
            return null;
        }
        throw wrapBESProfileError(error);
    }
}

// Inserta o actualiza el tipo de bomba por pozo usando pozo_name como clave natural.
export async function upsertWellBESProfile(data) {
    const normalized = {
        pozo_name: String(data?.pozo_name || '').trim(),
        pump_type: String(data?.pump_type || '').trim(),
        updated_at: new Date().toISOString()
    };

    if (!normalized.pozo_name) {
        throw new Error('Nombre del pozo es requerido para guardar el tipo de bomba.');
    }

    if (!normalized.pump_type) {
        throw new Error('El tipo de bomba es requerido.');
    }

    try {
        const { data: result, error } = await supabase
            .from('well_bes_profile')
            .upsert(normalized, { onConflict: 'pozo_name' })
            .select()
            .maybeSingle();

        if (error) throw error;
        return result || normalized;
    } catch (error) {
        throw wrapBESProfileError(error);
    }
}

/**
 * Deletes all telemetry records for a specific well name.
 * @param {string} pozoName 
 */
export async function deleteAllRecordsByPozo(pozoName) {
    if (!pozoName || pozoName === 'Todas') return 0;
    
    // Solo se elimina el historial operativo de monitoreo.
    // La ficha técnica actual y el historial técnico se preservan.
    const { count: countTele, error: errorTele } = await supabase
        .from('monitoreo_pozos')
        .delete({ count: 'exact' })
        .ilike('pozo_name', `%${pozoName.trim()}%`);

    if (errorTele) throw errorTele;

    return countTele || 0;
}
