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
    const { data, error } = await supabase
        .from('monitoreo_pozos')
        .select('pozo_name');
    
    if (error) throw error;
    
// ... (getUniquePozos)
    return [...new Set(data.map(item => item.pozo_name))];
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
