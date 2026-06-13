import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';
import { ensureMonitoringWriteAccess } from './monitoring-access.js';
import { normalizeMonitoringTime } from './monitoring-shared.js';
import { saveTechnicalMeasurement } from './technical-measurements-service.js';

const CONSOLIDATED_TABLE = 'consolidated_dashboard_general';
const POZO_KEYS = ['POZO', 'Pozo', 'pozo'];
const CAMPO_KEYS = ['CAMPO', 'Campo', 'campo'];
const EF_KEYS = ['EF', 'Ef', 'ef'];
const DATE_KEYS = ['FECHA', 'Fecha', 'fecha'];
const TIME_KEYS = ['HORA', 'Hora', 'hora'];
const POTENTIAL_KEYS = ['POTENCIAL', 'Potencial', 'potencial'];
const BRUTA_KEYS = ['BRUTA', 'Bruta', 'bruta', 'BBPD', 'bbpd'];
const NETA_KEYS = ['NETA', 'Neta', 'neta', 'BNPD', 'bnpd'];
const AYS_KEYS = ['%AyS', '% AyS', 'AYS', 'AyS', 'ays', 'ays_percentage'];
const CATEGORY_KEYS = ['CATEGORIA', 'Categoría', 'Categoria', 'categoria', 'CAT', 'Cat', 'cat', 'cat_number'];
const SOURCE_ORDER = Object.freeze({
    legacy_excel: 0,
    manual_adjustment: 1,
    field_journey: 2
});

async function ensureConsolidadoManagementAccess() {
    const session = await getSession();
    const accessProfile = getAccessProfile(session);

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para guardar el consolidado.');
    }

    if (!accessProfile?.canViewManagement) {
        throw new Error('Tu usuario no tiene permisos para guardar el consolidado maestro.');
    }

    return session;
}

async function ensureConsolidadoReadAccess() {
    const session = await getSession();

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para consultar el consolidado.');
    }

    return session;
}

function getFirstValue(rowData = {}, keys = []) {
    for (const key of keys) {
        const value = rowData[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
}

function normalizeRowDataKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9%]+/g, '')
        .toUpperCase();
}

function getFirstValueByNormalizedKey(rowData = {}, keys = []) {
    const normalizedKeys = new Set(keys.map(normalizeRowDataKey));
    for (const [key, value] of Object.entries(rowData || {})) {
        if (!normalizedKeys.has(normalizeRowDataKey(key))) continue;
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
}

function parseConsolidatedNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const rawValue = String(value).trim();
    const normalized = rawValue.includes(',')
        ? rawValue.replace(/\./g, '').replace(',', '.')
        : rawValue.replace(/\s+/g, '');
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeText(value, transform = value => value) {
    const normalized = String(value ?? '').trim();
    return normalized ? transform(normalized) : null;
}

function normalizeDate(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;

    const isoMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const latinMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (latinMatch) {
        const [, day, month, yearValue] = latinMatch;
        const fullYear = yearValue.length === 2 ? `20${yearValue}` : yearValue;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsedDate = new Date(normalized);
    if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().slice(0, 10);
    }

    return null;
}

function getTodayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function compareDateValues(left, right) {
    return String(left || '').localeCompare(String(right || ''));
}

function normalizeTime(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;

    const timeMatch = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
        const [, hour, minute, second = '00'] = timeMatch;
        return `${hour.padStart(2, '0')}:${minute}:${second}`;
    }

    return null;
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value ?? null);
}

function fallbackHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function createStableHash(value) {
    if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) {
        return fallbackHash(value);
    }

    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function buildRowHashSeed({ sourceType, sourceFileName, sourceSheetName, sourceRowNumber, rowData }) {
    return [
        sourceType,
        sourceFileName || '',
        sourceSheetName || '',
        sourceRowNumber || '',
        stableStringify(rowData)
    ].join('|');
}

function buildRowData(columns = [], row = []) {
    return columns.reduce((rowData, column, index) => {
        const label = String(column?.originalName || column?.name || '').trim();
        if (!label) return rowData;
        rowData[label] = row[index] ?? '';
        return rowData;
    }, {});
}

async function buildDashboardPayload({ template, sheet, columns, rows }) {
    const sourceFileName = template?.fileName || null;
    const sourceSheetName = sheet?.name || 'DASHBOARD GENERAL';
    const headerRowIndex = Number(sheet?.headerRowIndex || 0);
    const columnLabels = columns.map(column => column.originalName || column.name).filter(Boolean);

    return Promise.all(rows.map(async (row, rowIndex) => {
        const rowData = buildRowData(columns, row);
        const sourceRowNumber = headerRowIndex + 2 + rowIndex;
        const sourceType = 'legacy_excel';
        const rowHashSeed = buildRowHashSeed({ sourceType, sourceFileName, sourceSheetName, sourceRowNumber, rowData });

        return {
            source_type: sourceType,
            source_file_name: sourceFileName,
            source_sheet_name: sourceSheetName,
            source_row_number: sourceRowNumber,
            row_hash: await createStableHash(rowHashSeed),
            pozo: normalizeText(getFirstValue(rowData, POZO_KEYS), value => value.toUpperCase()),
            campo: normalizeText(getFirstValue(rowData, CAMPO_KEYS)),
            ef: normalizeText(getFirstValue(rowData, EF_KEYS)),
            report_date: normalizeDate(getFirstValue(rowData, DATE_KEYS)),
            report_time: normalizeTime(getFirstValue(rowData, TIME_KEYS)),
            row_data: rowData,
            column_labels: columnLabels
        };
    }));
}

function isConsolidadoSchemaCacheError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'PGRST205'
        || code === 'PGRST204'
        || (/consolidated_dashboard_general/i.test(message) && /schema cache/i.test(message));
}

function isConsolidadoMissingRelationError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || (/consolidated_dashboard_general/i.test(message) && /does not exist|not found|no existe/i.test(message));
}

function buildConsolidadoDatabaseError(error) {
    if (isConsolidadoSchemaCacheError(error)) {
        return new Error('La tabla consolidated_dashboard_general ya puede existir, pero el API de Supabase aun no actualizo su cache. Ejecuta: notify pgrst, \'reload schema\'; en Supabase, espera unos segundos, recarga con Ctrl + F5 y vuelve a guardar.');
    }

    if (isConsolidadoMissingRelationError(error)) {
        return new Error('No se encontro la tabla consolidated_dashboard_general en el proyecto Supabase conectado a la app. Verifica que ejecutaste supabase/consolidated_dashboard_general.sql en el proyecto ktfiglhhsqinvqvqynhg.');
    }

    return error;
}

function compareNullableText(left, right) {
    return String(left || '').localeCompare(String(right || ''));
}

function sortConsolidatedRows(left, right) {
    const leftSourceOrder = SOURCE_ORDER[left.source_type] ?? 99;
    const rightSourceOrder = SOURCE_ORDER[right.source_type] ?? 99;
    if (leftSourceOrder !== rightSourceOrder) return leftSourceOrder - rightSourceOrder;

    const leftRowNumber = Number(left.source_row_number || Number.MAX_SAFE_INTEGER);
    const rightRowNumber = Number(right.source_row_number || Number.MAX_SAFE_INTEGER);
    if (leftRowNumber !== rightRowNumber) return leftRowNumber - rightRowNumber;

    return compareNullableText(left.report_date, right.report_date)
        || compareNullableText(left.report_time, right.report_time)
        || compareNullableText(left.created_at, right.created_at)
        || compareNullableText(left.pozo, right.pozo);
}

function buildOperationalDeleteKey(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const pozoName = String(row.pozo || rowData.POZO || rowData.Pozo || rowData.pozo || '').trim().toUpperCase();
    const fecha = String(row.report_date || rowData.FECHA || rowData.Fecha || rowData.fecha || '').trim().slice(0, 10);
    const hora = normalizeMonitoringTime(row.report_time || rowData.HORA || rowData.Hora || rowData.hora || '');

    if (!pozoName || !fecha || !hora) return null;

    return {
        key: `${pozoName}|${fecha}|${hora}`,
        pozoName,
        fecha,
        hora
    };
}

async function fetchFieldJourneyRowsByIds(ids = []) {
    const selectedIds = [...new Set((Array.isArray(ids) ? ids : [])
        .map(id => String(id || '').trim())
        .filter(Boolean))];

    if (!selectedIds.length) return [];

    const { data, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id, source_journey_id, source_record_id, pozo, campo, ef, report_date, report_time, row_data, created_at')
        .eq('source_type', 'field_journey')
        .in('id', selectedIds);

    if (error) throw buildConsolidadoDatabaseError(error);
    return data || [];
}

async function deleteOperationalRowsForConsolidatedRows(rows = []) {
    await ensureMonitoringWriteAccess();

    const keys = new Map();
    rows.forEach(row => {
        const deleteKey = buildOperationalDeleteKey(row);
        if (deleteKey) keys.set(deleteKey.key, deleteKey);
    });

    let deleted = 0;
    const missed = [];

    for (const deleteKey of keys.values()) {
        const { count, error } = await supabase
            .from('monitoreo_pozos')
            .delete({ count: 'exact' })
            .eq('pozo_name', deleteKey.pozoName)
            .eq('fecha', deleteKey.fecha)
            .eq('hora', deleteKey.hora);

        if (error) throw error;

        if (count) {
            deleted += count;
        } else {
            missed.push(deleteKey);
        }
    }

    return { deleted, missed, attempted: keys.size };
}

async function countConsolidatedRowsBySource(sourceType) {
    const { count, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('source_type', sourceType);

    if (error) throw buildConsolidadoDatabaseError(error);
    return count || 0;
}

export async function getConsolidatedDashboardSummary() {
    await ensureConsolidadoReadAccess();

    const { count, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id', { count: 'exact', head: true });

    if (error) throw buildConsolidadoDatabaseError(error);

    const [legacyCount, fieldJourneyCount, manualCount] = await Promise.all([
        countConsolidatedRowsBySource('legacy_excel'),
        countConsolidatedRowsBySource('field_journey'),
        countConsolidatedRowsBySource('manual_adjustment')
    ]);

    const { data: latestRows, error: latestError } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('source_type, source_file_name, source_sheet_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    if (latestError) throw buildConsolidadoDatabaseError(latestError);

    return {
        total: count || 0,
        legacyCount,
        fieldJourneyCount,
        manualCount,
        latest: latestRows?.[0] || null
    };
}

export async function getConsolidatedDashboardFilterOptions() {
    await ensureConsolidadoReadAccess();

    const rows = [];
    const pageSize = 1000;

    for (let startIndex = 0; startIndex < 10000; startIndex += pageSize) {
        const { data, error } = await supabase
            .from(CONSOLIDATED_TABLE)
            .select('pozo, report_date')
            .range(startIndex, startIndex + pageSize - 1);

        if (error) throw buildConsolidadoDatabaseError(error);
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }

    const pozos = [...new Set(rows
        .map(row => String(row.pozo || '').trim().toUpperCase())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));

    const dates = rows
        .map(row => String(row.report_date || '').slice(0, 10))
        .filter(Boolean)
        .sort();

    return {
        pozos,
        minDate: dates[0] || '',
        maxDate: dates[dates.length - 1] || ''
    };
}

export async function fetchConsolidatedDashboardRows({ limit = 10000, pozo = '', startDate = '', endDate = '' } = {}) {
    await ensureConsolidadoReadAccess();

    const pageSize = 1000;
    const rows = [];
    const normalizedPozo = String(pozo || '').trim().toUpperCase();

    for (let startIndex = 0; startIndex < limit; startIndex += pageSize) {
        const endIndex = Math.min(startIndex + pageSize - 1, limit - 1);
        let query = supabase
            .from(CONSOLIDATED_TABLE)
            .select('source_type, source_file_name, source_sheet_name, source_row_number, pozo, campo, ef, report_date, report_time, row_data, column_labels, created_at')
            .order('created_at', { ascending: true });

        if (normalizedPozo) query = query.eq('pozo', normalizedPozo);
        if (startDate) query = query.gte('report_date', startDate);
        if (endDate) query = query.lte('report_date', endDate);

        const { data, error } = await query.range(startIndex, endIndex);

        if (error) throw buildConsolidadoDatabaseError(error);
        rows.push(...(data || []));

        if (!data || data.length < pageSize) break;
    }

    return rows.sort(sortConsolidatedRows);
}

function buildTechnicalCandidateFromConsolidatedRow(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const pozoName = normalizeText(row.pozo || getFirstValueByNormalizedKey(rowData, POZO_KEYS), value => value.toUpperCase());
    const potencial = parseConsolidatedNumber(getFirstValueByNormalizedKey(rowData, POTENTIAL_KEYS));
    const bbpd = parseConsolidatedNumber(getFirstValueByNormalizedKey(rowData, BRUTA_KEYS));
    const aysPercentage = parseConsolidatedNumber(getFirstValueByNormalizedKey(rowData, AYS_KEYS));
    const bnpd = parseConsolidatedNumber(getFirstValueByNormalizedKey(rowData, NETA_KEYS));
    const catNumber = parseConsolidatedNumber(getFirstValueByNormalizedKey(rowData, CATEGORY_KEYS));
    const campoName = normalizeText(row.campo || getFirstValueByNormalizedKey(rowData, CAMPO_KEYS)) || '';
    const ef = normalizeText(row.ef || getFirstValueByNormalizedKey(rowData, EF_KEYS)) || '';

    const hasTechnicalValue = [potencial, bbpd, aysPercentage, bnpd, catNumber].some(value => value !== null) || Boolean(campoName || ef);
    if (!pozoName || !hasTechnicalValue) return null;

    return {
        pozo_name: pozoName,
        campo_name: campoName,
        ef,
        fecha: row.report_date || normalizeDate(getFirstValueByNormalizedKey(rowData, DATE_KEYS)) || null,
        potencial,
        bbpd,
        ays_percentage: aysPercentage,
        bnpd,
        cat_number: catNumber
    };
}

async function fetchExistingTechnicalRows(pozoNames = []) {
    if (!pozoNames.length) return new Map();

    const { data, error } = await supabase
        .from('well_production')
        .select('*')
        .in('pozo_name', pozoNames);

    if (error) throw error;

    const rowsByPozo = new Map();
    (data || []).forEach(row => {
        const pozoName = String(row?.pozo_name || '').trim().toUpperCase();
        if (pozoName) rowsByPozo.set(pozoName, row);
    });

    return rowsByPozo;
}

function mergeTechnicalCandidateWithExisting(candidate = {}, existing = {}) {
    return {
        pozo_name: candidate.pozo_name,
        campo_name: candidate.campo_name || existing.campo_name || '',
        ef: candidate.ef || existing.ef || '',
        fecha: candidate.fecha || existing.fecha || getTodayIsoDate(),
        potencial: candidate.potencial ?? existing.potencial ?? 0,
        bbpd: candidate.bbpd ?? existing.bbpd ?? 0,
        ays_percentage: candidate.ays_percentage ?? existing.ays_percentage ?? 0,
        bnpd: candidate.bnpd ?? existing.bnpd ?? 0,
        cat_number: candidate.cat_number ?? existing.cat_number ?? 1
    };
}

export async function syncTechnicalPotentialFromConsolidated({ limit = 10000 } = {}) {
    return syncTechnicalMeasurementsFromConsolidated({ limit });
}

export async function syncTechnicalMeasurementsFromConsolidated({ limit = 10000 } = {}) {
    await ensureConsolidadoManagementAccess();
    await ensureMonitoringWriteAccess();

    const consolidatedRows = await fetchConsolidatedDashboardRows({ limit });
    const candidateByPozo = new Map();

    consolidatedRows
        .filter(row => row.source_type !== 'field_journey')
        .forEach(row => {
            const candidate = buildTechnicalCandidateFromConsolidatedRow(row);
            if (!candidate) return;

            const current = candidateByPozo.get(candidate.pozo_name);
            if (!current || compareDateValues(candidate.fecha, current.fecha) >= 0) {
                candidateByPozo.set(candidate.pozo_name, candidate);
            }
        });

    const candidates = [...candidateByPozo.values()];
    if (!candidates.length) {
        return { updated: 0, candidates: 0, skipped: 0 };
    }

    const existingByPozo = await fetchExistingTechnicalRows(candidates.map(candidate => candidate.pozo_name));
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const candidate of candidates) {
        try {
            const payload = mergeTechnicalCandidateWithExisting(candidate, existingByPozo.get(candidate.pozo_name) || {});
            await saveTechnicalMeasurement(payload);
            updated += 1;
        } catch (error) {
            skipped += 1;
            errors.push(error?.message || String(error));
        }
    }

    if (updated === 0 && skipped > 0) {
        const detail = errors.find(Boolean) || 'No se pudo guardar ningun dato tecnico en Produccion Tecnica.';
        throw new Error(`No se pudieron sincronizar los datos tecnicos. ${detail}`);
    }

    return { updated, candidates: candidates.length, skipped };
}

export async function fetchFieldJourneyConsolidatedRows({ limit = 200 } = {}) {
    await ensureConsolidadoReadAccess();

    const { data, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id, source_journey_id, source_record_id, pozo, campo, ef, report_date, report_time, row_data, created_at')
        .eq('source_type', 'field_journey')
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) throw buildConsolidadoDatabaseError(error);
    return data || [];
}

export async function deleteAllFieldJourneyConsolidatedRows() {
    await ensureConsolidadoManagementAccess();

    const rows = await fetchFieldJourneyConsolidatedRows({ limit: 10000 });
    const existingCount = rows.length;
    if (!existingCount) return { deleted: 0, operationalDeleted: 0, operationalMissed: 0 };

    const operationalResult = await deleteOperationalRowsForConsolidatedRows(rows);

    const { error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .delete()
        .eq('source_type', 'field_journey');

    if (error) throw buildConsolidadoDatabaseError(error);

    return {
        deleted: existingCount,
        operationalDeleted: operationalResult.deleted,
        operationalMissed: operationalResult.missed.length
    };
}

export async function deleteSelectedFieldJourneyConsolidatedRows(ids = []) {
    await ensureConsolidadoManagementAccess();

    const selectedIds = [...new Set((Array.isArray(ids) ? ids : [])
        .map(id => String(id || '').trim())
        .filter(Boolean))];

    if (!selectedIds.length) {
        throw new Error('Selecciona al menos una fila de Campo Admin para eliminar.');
    }

    const selectedRows = await fetchFieldJourneyRowsByIds(selectedIds);
    if (!selectedRows.length) {
        return { deleted: 0, operationalDeleted: 0, operationalMissed: 0 };
    }

    const operationalResult = await deleteOperationalRowsForConsolidatedRows(selectedRows);

    const { error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .delete()
        .eq('source_type', 'field_journey')
        .in('id', selectedRows.map(row => row.id));

    if (error) throw buildConsolidadoDatabaseError(error);

    return {
        deleted: selectedRows.length,
        operationalDeleted: operationalResult.deleted,
        operationalMissed: operationalResult.missed.length
    };
}

export async function saveLegacyDashboardGeneralRows({ template, sheet, columns, rows, onProgress }) {
    await ensureConsolidadoManagementAccess();

    if (!template || !sheet || !Array.isArray(columns) || !columns.length) {
        throw new Error('Importa primero el Dashboard General para registrar su estructura.');
    }

    if (!Array.isArray(rows) || !rows.length) {
        throw new Error('No hay filas de Dashboard General para guardar en la base de datos.');
    }

    onProgress?.({ currentChunk: 0, totalChunks: 1, saved: 0, total: rows.length, phase: 'hashing' });
    const payload = await buildDashboardPayload({ template, sheet, columns, rows });
    const chunkSize = 400;
    const totalChunks = Math.max(1, Math.ceil(payload.length / chunkSize));
    let saved = 0;

    for (let startIndex = 0; startIndex < payload.length; startIndex += chunkSize) {
        const chunk = payload.slice(startIndex, startIndex + chunkSize);
        const currentChunk = Math.floor(startIndex / chunkSize) + 1;
        onProgress?.({ currentChunk, totalChunks, saved, total: payload.length });

        const { error } = await supabase
            .from(CONSOLIDATED_TABLE)
            .upsert(chunk, { onConflict: 'row_hash' });

        if (error) {
            throw buildConsolidadoDatabaseError(error);
        }

        saved += chunk.length;
        onProgress?.({ currentChunk, totalChunks, saved, total: payload.length });
    }

    return {
        saved,
        total: payload.length,
        sourceFileName: template.fileName,
        sourceSheetName: sheet.name
    };
}
