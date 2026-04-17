/**
 * Data Service Module
 * Handles CRUD operations for oil well monitoring data.
 */

import { supabase } from './supabaseClient.js';

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
 * Fetches unique well names for filters.
 */
export async function getUniquePozos() {
    const [monitoringResult, technicalResult] = await Promise.all([
        supabase.from('monitoreo_pozos').select('pozo_name'),
        supabase.from('well_production').select('pozo_name')
    ]);

    if (monitoringResult.error) throw monitoringResult.error;
    if (technicalResult.error) throw technicalResult.error;

    const allPozos = [...(monitoringResult.data || []), ...(technicalResult.data || [])]
        .map(item => item?.pozo_name?.trim())
        .filter(Boolean);

    return [...new Set(allPozos)];
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

export async function getWellRibbonData(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;

    const [latestMonitoringResult, latestTechnical] = await Promise.all([
        supabase
            .from('monitoreo_pozos')
            .select('*')
            .eq('pozo_name', pozoName)
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false })
            .limit(1),
        getWellTechnicalData(pozoName)
    ]);

    if (latestMonitoringResult.error) {
        console.error('Error fetching latest monitoring data for ribbon:', latestMonitoringResult.error);
    }

    const latestMonitoring = latestMonitoringResult.data && latestMonitoringResult.data.length > 0
        ? latestMonitoringResult.data[0]
        : null;

    if (!latestMonitoring && !latestTechnical) return null;

    const firstDefined = (...values) => values.find(value => value !== undefined && value !== null && `${value}`.trim() !== '');
    const measurementDate = latestTechnical?.fecha || null;

    return {
        campo_name: firstDefined(latestMonitoring?.campo_name, latestMonitoring?.campo, latestTechnical?.campo_name),
        pozo_name: firstDefined(latestMonitoring?.pozo_name, latestTechnical?.pozo_name, pozoName),
        ef: firstDefined(latestMonitoring?.ef, latestMonitoring?.estacion, latestTechnical?.ef),
        fecha: firstDefined(latestTechnical?.fecha, latestMonitoring?.fecha),
        measurement_date: measurementDate,
        bbpd: firstDefined(latestMonitoring?.bbpd, latestTechnical?.bbpd),
        ays_percentage: firstDefined(latestMonitoring?.ays_percentage, latestMonitoring?.ays, latestTechnical?.ays_percentage),
        bnpd: firstDefined(latestMonitoring?.bnpd, latestTechnical?.bnpd),
        cat_number: firstDefined(latestMonitoring?.cat_number, latestMonitoring?.cat, latestTechnical?.cat_number)
    };
}

/**
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

/**
 * Deletes all telemetry records for a specific well name.
 * @param {string} pozoName 
 */
export async function deleteAllRecordsByPozo(pozoName) {
    if (!pozoName || pozoName === 'Todas') return 0;
    
    // 1. Borrado en la tabla de monitoreo (con búsqueda flexible para espacios o mayúsculas)
    const { count: countTele, error: errorTele } = await supabase
        .from('monitoreo_pozos')
        .delete({ count: 'exact' })
        .ilike('pozo_name', `%${pozoName.trim()}%`);
    
    // 2. Borrado en la tabla técnica (well_production)
    const { error: errorTech } = await supabase
        .from('well_production')
        .delete()
        .ilike('pozo_name', `%${pozoName.trim()}%`);
    
    if (errorTele) throw errorTele;
    if (errorTech) throw errorTech;

    return countTele || 0;
}
