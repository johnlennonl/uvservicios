/**
 * Servicio para la gestión de pruebas de nivel de fluidos (Echómetro).
 * Proporciona métodos para consultar, guardar y sincronizar datos de nivel y submergencia.
 */

import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess, ensureMonitoringWriteAccess } from './monitoring-access.js';
import { fetchAllRows } from './monitoring-shared.js';

// Campos clave para comparación y verificación
const LEVEL_TEST_FIELDS_TO_COMPARE = [
    'nivel_dinamico',
    'sumergencia',
    'presion_pip'
];

/**
 * Normaliza los nombres de pozo para búsquedas
 */
function normalizePozoFilter(pozos = []) {
    return [...new Set((Array.isArray(pozos) ? pozos : [pozos])
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean)
        .filter(value => value !== 'TODAS'))];
}

/**
 * Genera la clave única compuesta para la caché y el rastreo de duplicados
 */
export function buildLevelTestKey(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    return `${pozoName}|${fecha}`;
}

/**
 * Normaliza un registro de prueba de nivel antes de guardarlo en Supabase
 */
export function normalizeLevelTestRecord(record = {}) {
    return {
        pozo_name: String(record?.pozo_name || '').trim().toUpperCase(),
        fecha: record?.fecha || null,
        nivel_dinamico: record?.nivel_dinamico !== undefined && record?.nivel_dinamico !== null ? parseFloat(record.nivel_dinamico) : 0,
        sumergencia: record?.sumergencia !== undefined && record?.sumergencia !== null ? parseFloat(record.sumergencia) : 0,
        presion_pip: record?.presion_pip !== undefined && record?.presion_pip !== null ? parseFloat(record.presion_pip) : 0,
        operational_scope: String(record?.operational_scope || '').trim().toLowerCase() || null,
        file_path: record?.file_path || null
    };
}

/**
 * Envuelve los errores específicos de la tabla de niveles para alertas amigables
 */
function wrapLevelTestError(error) {
    const message = String(error?.message || error || '');
    if (/well_level_tests/i.test(message)) {
        return new Error('La tabla de pruebas de nivel (well_level_tests) no existe en Supabase. Ejecuta el script SQL correspondiente primero.');
    }
    return error instanceof Error ? error : new Error(message || 'Error desconocido en pruebas de nivel.');
}

/**
 * Determina si dos registros de niveles de fluidos son equivalentes
 */
function areEquivalentLevelTests(left = {}, right = {}) {
    return LEVEL_TEST_FIELDS_TO_COMPARE.every(fieldName => {
        const leftValue = left?.[fieldName] ?? 0;
        const rightValue = right?.[fieldName] ?? 0;
        return Number(leftValue).toFixed(3) === Number(rightValue).toFixed(3);
    });
}

/**
 * Recupera el historial completo de pruebas de nivel para un pozo
 */
export async function getWellLevelTests(pozoName) {
    if (!pozoName || pozoName === 'Todas') return [];
    await ensureMonitoringReadAccess();

    const normalizedPozo = String(pozoName || '').trim().toUpperCase();

    try {
        const { data, error } = await supabase
            .from('well_level_tests')
            .select('*')
            .eq('pozo_name', normalizedPozo)
            .order('fecha', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        throw wrapLevelTestError(error);
    }
}

/**
 * Guarda o actualiza un registro individual de prueba de nivel
 */
export async function saveLevelTest(data) {
    await ensureMonitoringWriteAccess();
    const normalized = normalizeLevelTestRecord(data);

    if (!normalized.pozo_name) {
        throw new Error('El nombre del pozo es requerido para guardar la prueba de nivel.');
    }

    if (!normalized.fecha) {
        throw new Error('La fecha de la prueba de nivel es requerida.');
    }

    try {
        const { data: result, error } = await supabase
            .from('well_level_tests')
            .upsert(normalized, { onConflict: 'pozo_name,fecha' })
            .select();

        if (error) {
            // Si el error es porque la columna file_path no existe aún, reintentar sin ella
            const msg = String(error?.message || '');
            if (/file_path/i.test(msg) && /column|schema|cache|could not find/i.test(msg)) {
                console.warn('[level-tests-service] La columna file_path no existe aún; reintentando sin ella.');
                const { file_path, ...withoutFilePath } = normalized;
                const { data: retryResult, error: retryError } = await supabase
                    .from('well_level_tests')
                    .upsert(withoutFilePath, { onConflict: 'pozo_name,fecha' })
                    .select();
                if (retryError) throw retryError;
                return retryResult?.[0] || withoutFilePath;
            }
            throw error;
        }
        return result?.[0] || normalized;
    } catch (error) {
        throw wrapLevelTestError(error);
    }
}

/**
 * Obtiene los registros de niveles de fluidos más recientes (para la bitácora)
 */
export async function getRecentLevelTests(limit = 10, pozos = []) {
    await ensureMonitoringReadAccess();
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    const pozoFilter = normalizePozoFilter(pozos);

    try {
        let query = supabase
            .from('well_level_tests')
            .select('*')
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(safeLimit);

        if (pozoFilter.length) query = query.in('pozo_name', pozoFilter);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw wrapLevelTestError(error);
    }
}

/**
 * Compara los registros entrantes con la base de datos para generar una vista previa de la sincronización
 */
export async function previewLevelTestsSync(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeLevelTestRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0, recordsToInsert: [], recordsToUpdate: [], recordsToSkip: [] };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildLevelTestKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const pozoNames = [...new Set(dedupedRecords.map(record => record.pozo_name))];
    const fechas = dedupedRecords.map(record => record.fecha).filter(Boolean).sort();

    try {
        let existingQuery = supabase
            .from('well_level_tests')
            .select('*')
            .in('pozo_name', pozoNames);

        if (fechas[0]) existingQuery = existingQuery.gte('fecha', fechas[0]);
        if (fechas[fechas.length - 1]) existingQuery = existingQuery.lte('fecha', fechas[fechas.length - 1]);

        const { data: existingRecords, error: existingError } = await existingQuery;
        if (existingError) throw existingError;

        const existingByKey = new Map();
        (existingRecords || []).forEach(record => {
            existingByKey.set(buildLevelTestKey(record), record);
        });

        const recordsToInsert = [];
        const recordsToUpdate = [];
        const recordsToSkip = [];

        dedupedRecords.forEach(record => {
            const existingRecord = existingByKey.get(buildLevelTestKey(record));
            if (existingRecord) {
                if (areEquivalentLevelTests(record, existingRecord)) {
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
        throw wrapLevelTestError(error);
    }
}

/**
 * Ejecuta la sincronización masiva de niveles de fluidos
 */
export async function syncLevelTests(records = []) {
    await ensureMonitoringWriteAccess();
    const normalizedRecords = (Array.isArray(records) ? records : [])
        .filter(record => record?.pozo_name && record?.fecha)
        .map(record => normalizeLevelTestRecord(record));

    if (normalizedRecords.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0, total: 0 };
    }

    const uniqueIncomingRecords = new Map();
    normalizedRecords.forEach(record => {
        uniqueIncomingRecords.set(buildLevelTestKey(record), record);
    });

    const dedupedRecords = [...uniqueIncomingRecords.values()];
    const preview = await previewLevelTestsSync(dedupedRecords);

    const recordsToUpsert = [...preview.recordsToInsert, ...preview.recordsToUpdate.map(r => r.record)];

    if (recordsToUpsert.length === 0) {
        return {
            inserted: 0,
            updated: 0,
            skipped: preview.skipped,
            total: preview.total
        };
    }

    try {
        const { error } = await supabase
            .from('well_level_tests')
            .upsert(recordsToUpsert, { onConflict: 'pozo_name,fecha' });

        if (error) throw error;

        return {
            inserted: preview.inserted,
            updated: preview.updated,
            skipped: preview.skipped,
            total: preview.total
        };
    } catch (error) {
        throw wrapLevelTestError(error);
    }
}

/**
 * Elimina una prueba de nivel por su ID.
 */
export async function deleteLevelTest(id) {
    await ensureMonitoringWriteAccess();
    try {
        const { data, error } = await supabase
            .from('well_level_tests')
            .delete()
            .eq('id', id)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('No tienes permisos suficientes en la base de datos (RLS) para eliminar esta prueba de nivel, o el registro ya fue eliminado.');
        }
        return true;
    } catch (error) {
        throw wrapLevelTestError(error);
    }
}
