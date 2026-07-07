import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';
import { ensureMonitoringWriteAccess } from './monitoring-access.js';
import { normalizeMonitoringTime } from './monitoring-shared.js';
import { saveTechnicalMeasurement } from './technical-measurements-service.js';
import { getWellBESProfile, upsertWellBESProfile } from './bes-profile-service.js';

const CONSOLIDATED_TABLE = 'consolidated_dashboard_general';
const CONSOLIDATED_OPERATIONAL_TABLE = 'consolidated_dashboard_operational';
const POZO_KEYS = ['POZO', 'Pozo', 'pozo'];
const CAMPO_KEYS = ['CAMPO', 'Campo', 'campo'];
const EF_KEYS = ['EF', 'Ef', 'ef'];
const DATE_KEYS = ['FECHA', 'Fecha', 'fecha'];
const TIME_KEYS = ['HORA', 'Hora', 'hora'];
const MONTH_KEYS = ['MES', 'Mes', 'mes'];
const POTENTIAL_KEYS = ['POTENCIAL', 'Potencial', 'potencial'];
const BRUTA_KEYS = ['BRUTA', 'Bruta', 'bruta', 'BBPD', 'bbpd'];
const NETA_KEYS = ['NETA', 'Neta', 'neta', 'BNPD', 'bnpd'];
const AYS_KEYS = ['%AyS', '% AyS', 'AYS', 'AyS', 'ays', 'ays_percentage'];
const CATEGORY_KEYS = ['CATEGORIA', 'Categoría', 'Categoria', 'categoria', 'CAT', 'Cat', 'cat', 'cat_number'];
const BES_PROFILE_KEY_MAP = Object.freeze({
    pump_type: ['TIPO BOMBA', 'TIPO DE BOMBA', 'TIPO BES', 'PUMP TYPE'],
    pump_manufacturer: ['FABRICANTE BOMBA', 'FABRICANTE DE BOMBA', 'FABRICANTE', 'MARCA BOMBA', 'MARCA DE BOMBA', 'MARCA', 'PUMP MANUFACTURER', 'PUMP MAKER'],
    pump_model: ['BOMBA', 'BOMBA BES', 'PUMP', 'MODELO BOMBA', 'MODELO DE BOMBA', 'MODELO', 'MODELO PUMP', 'PUMP MODEL'],
    pump_serial: ['SERIAL BOMBA', 'SERIE BOMBA', 'SERIAL', 'SERIE', 'S/N BOMBA', 'SN BOMBA', 'S/N', 'SERIAL DE BOMBA', 'PUMP SERIAL'],
    suction_ft: ['SUCCION FT', 'SUCCION (FT)', 'SUCCIÓN FT', 'SUCCIÓN (FT)', 'SUCCION', 'SUCCIÓN', 'INTAKE FT', 'PUMP INTAKE'],
    multiphase_pump: ['BOMBA MULTIFASICA', 'BOMBA MULTIFÁSICA', 'MULTIFASICA', 'MULTIFÁSICA', 'MULTIPHASE PUMP'],
    gas_separator: ['SEPARADOR GAS', 'SEPARADOR DE GAS', 'GAS SEPARATOR', 'SEP GAS'],
    seal_section: ['SELLOS', 'SELLO', 'SEAL', 'SEALS', 'SEAL SECTION', 'SECCION SELLOS', 'SECCIÓN SELLOS'],
    motor_manufacturer: ['FABRICANTE MOTOR', 'FABRICANTE DE MOTOR', 'MARCA MOTOR', 'MARCA DE MOTOR', 'MOTOR MANUFACTURER', 'MOTOR MAKER'],
    motor_model: ['MOTOR', 'MOTOR BES', 'MODELO MOTOR', 'MODELO DE MOTOR', 'MOTOR MODEL'],
    motor_hp: ['HP MOTOR', 'MOTOR HP', 'POTENCIA MOTOR', 'POTENCIA DEL MOTOR', 'HP'],
    motor_voltage: ['VOLTAJE MOTOR', 'VOLT MOTOR', 'V MOTOR', 'MOTOR VOLTAGE', 'VOLT NOMINAL MOTOR', 'VOLT NOMINAL MOTOR [V]'],
    motor_current: ['CORRIENTE MOTOR', 'AMP MOTOR', 'AMPERAJE MOTOR', 'MOTOR CURRENT', 'AMP NOMINAL MOTOR', 'AMP NOMINAL MOTOR [A]'],
    sensor_model: ['MODELO SENSOR', 'SENSOR', 'SENSOR FONDO', 'SENSOR DE FONDO', 'MODELO SENSOR FONDO', 'DOWNHOLE SENSOR'],
    cable_type: ['TIPO CABLE', 'TIPO DE CABLE', 'CABLE', 'CABLE BES', 'POWER CABLE'],
    drain_valve: ['DRAINVALVE', 'DRAIN VALVE', 'VALVULA DRENAJE', 'VÁLVULA DRENAJE', 'VALVULA DE DRENAJE', 'VÁLVULA DE DRENAJE'],
    installed_at: ['FECHA INSTALACION', 'FECHA DE INSTALACION', 'FECHA INSTALACIÓN', 'FECHA DE INSTALACIÓN', 'INSTALADO', 'INSTALLED AT', 'INSTALLATION DATE'],
    profile_notes: ['OBSERVACIONES EQUIPO', 'OBSERVACIONES BES', 'NOTAS BES', 'NOTAS EQUIPO', 'COMENTARIOS BES']
});
const BES_PROFILE_FIELDS = Object.keys(BES_PROFILE_KEY_MAP);
const SOURCE_ORDER = Object.freeze({
    manual_adjustment: 0,
    legacy_excel: 1,
    field_journey: 2
});
const MANUAL_MONITORING_AUXILIARY_COLUMNS = new Set([
    'POZO',
    'POZO NAME',
    'pozo_name',
    'CAMPO',
    'campo',
    'CAMPO NAME',
    'fecha',
    'FECHA',
    'hora',
    'HORA',
    'FREC',
    'frecuencia',
    'I Motor [Amp]',
    'corriente_motor',
    'THP [psi]',
    'presion_thp',
    'CHP [psi]',
    'presion_chp',
    'LF [psi]',
    'presion_lf',
    'PIP [psi]',
    'pip',
    'Tm [°F]',
    'tm',
    'VSD A [Amp]',
    'vsd_a',
    'VSD B [Amp]',
    'vsd_b',
    'VSD C [Amp]',
    'vsd_c',
    'SENTIDO DE GIRO',
    'sentido_giro',
    'ESTATUS',
    'estatus',
    'OBSERVACIONES',
    'observaciones',
    'user_id'
].map(normalizeRowDataKey));
const MANUAL_MONITORING_FIELD_ALIASES = Object.freeze({
    POZO: ['POZO', 'POZO NAME'],
    CAMPO: ['CAMPO', 'CAMPO NAME'],
    EF: ['EF'],
    FECHA: ['FECHA'],
    MES: MONTH_KEYS,
    HORA: ['HORA'],
    ESTATUS: ['ESTATUS', 'STATUS'],
    FREC: ['FREC', 'FRECUENCIA'],
    'SENTIDO DE GIRO': ['SENTIDO DE GIRO', 'GIRO'],
    'I Motor [Amp]': ['I Motor [Amp]', 'I MOTOR', 'CORRIENTE MOTOR'],
    'PIP [psi]': ['PIP [psi]', 'PIP'],
    'Tm [°F]': ['Tm [°F]', 'TM', 'TEMP MOTOR'],
    'THP [psi]': ['THP [psi]', 'THP'],
    'CHP [psi]': ['CHP [psi]', 'CHP'],
    'LF [psi]': ['LF [psi]', 'LF'],
    'VSD A [Amp]': ['VSD A [Amp]', 'VSD A', 'I VSD A'],
    'VSD B [Amp]': ['VSD B [Amp]', 'VSD B', 'I VSD B'],
    'VSD C [Amp]': ['VSD C [Amp]', 'VSD C', 'I VSD C'],
    OBSERVACIONES: ['OBSERVACIONES', 'OBSERVACION']
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

function shouldKeepManualMonitoringSourceColumn(key) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || normalizedKey.startsWith('__')) return false;
    return !MANUAL_MONITORING_AUXILIARY_COLUMNS.has(normalizeRowDataKey(normalizedKey));
}

function getUsableManualMonitoringSourceEntries(source = {}) {
    return Object.entries(source || {})
        .filter(([key]) => shouldKeepManualMonitoringSourceColumn(key));
}

function hasCompleteConsolidatedSourceRow(source = {}) {
    const sourceEntries = Object.entries(source || {})
        .filter(([key]) => {
            const normalizedKey = String(key || '').trim();
            return normalizedKey && !normalizedKey.startsWith('__');
        });
    const usableEntries = getUsableManualMonitoringSourceEntries(source);
    const normalizedKeys = new Set(sourceEntries.map(([key]) => normalizeRowDataKey(key)));
    const hasIdentity = POZO_KEYS.some(key => normalizedKeys.has(normalizeRowDataKey(key)))
        && DATE_KEYS.some(key => normalizedKeys.has(normalizeRowDataKey(key)))
        && TIME_KEYS.some(key => normalizedKeys.has(normalizeRowDataKey(key)));
    const hasOperationalColumns = ['FREC', 'PIPPSI', 'IMOTORAMP', 'THPPSI', 'CHPPSI', 'LFPSI', 'ESTATUS']
        .some(key => normalizedKeys.has(key));

    return hasIdentity && hasOperationalColumns && usableEntries.length >= 10;
}

function hasManualMonitoringValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function findConsolidatedFieldLabel(rowData = {}, columnLabels = [], canonicalLabel = '') {
    const aliases = MANUAL_MONITORING_FIELD_ALIASES[canonicalLabel] || [canonicalLabel];
    const normalizedAliases = new Set(aliases.map(normalizeRowDataKey));
    const labels = [...(Array.isArray(columnLabels) ? columnLabels : []), ...Object.keys(rowData || {})];

    return labels.find(label => normalizedAliases.has(normalizeRowDataKey(label))) || canonicalLabel;
}

function buildConsolidatedMonitoringKey({ pozo, fecha, hora }) {
    const pozoName = String(pozo || '').trim().toUpperCase();
    const reportDate = normalizeDate(fecha) || String(fecha || '').trim().slice(0, 10);
    const reportTime = normalizeMonitoringTime(normalizeTime(hora) || hora || '');
    if (!pozoName || !reportDate || !reportTime) return null;
    return `${pozoName}|${reportDate}|${reportTime}`;
}

function buildConsolidatedMonitoringKeyCandidates({ pozoValues = [], fechaValues = [], horaValues = [] } = {}) {
    const keys = new Set();

    pozoValues.filter(hasManualMonitoringValue).forEach(pozo => {
        fechaValues.filter(hasManualMonitoringValue).forEach(fecha => {
            horaValues.filter(hasManualMonitoringValue).forEach(hora => {
                const key = buildConsolidatedMonitoringKey({ pozo, fecha, hora });
                if (key) keys.add(key);
            });
        });
    });

    return keys;
}

function buildConsolidatedRowMonitoringKey(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    return [...buildConsolidatedRowMonitoringKeyCandidates(row)][0] || null;
}

function buildConsolidatedRowDateKey(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const pozoName = String(row.pozo || getFirstValueByNormalizedKey(rowData, POZO_KEYS) || '').trim().toUpperCase();
    const reportDate = normalizeDate(row.report_date || getFirstValueByNormalizedKey(rowData, DATE_KEYS)) || '';
    return pozoName && reportDate ? `${pozoName}|${reportDate}` : null;
}

function buildConsolidatedRowMonitoringKeyCandidates(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    return buildConsolidatedMonitoringKeyCandidates({
        pozoValues: [getFirstValueByNormalizedKey(rowData, POZO_KEYS), row.pozo],
        fechaValues: [getFirstValueByNormalizedKey(rowData, DATE_KEYS), row.report_date],
        horaValues: [getFirstValueByNormalizedKey(rowData, TIME_KEYS), row.report_time]
    });
}

function getConsolidatedRowPozo(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    return String(row.pozo || getFirstValueByNormalizedKey(rowData, POZO_KEYS) || '').trim().toUpperCase();
}

function compareConsolidatedRowMoment(left = {}, right = {}) {
    const leftData = left.row_data && typeof left.row_data === 'object' ? left.row_data : {};
    const rightData = right.row_data && typeof right.row_data === 'object' ? right.row_data : {};
    const leftDate = normalizeDate(left.report_date || getFirstValueByNormalizedKey(leftData, DATE_KEYS)) || '';
    const rightDate = normalizeDate(right.report_date || getFirstValueByNormalizedKey(rightData, DATE_KEYS)) || '';
    const leftTime = normalizeTime(left.report_time || getFirstValueByNormalizedKey(leftData, TIME_KEYS)) || '';
    const rightTime = normalizeTime(right.report_time || getFirstValueByNormalizedKey(rightData, TIME_KEYS)) || '';

    return leftDate.localeCompare(rightDate) || leftTime.localeCompare(rightTime);
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
    if (/^(0+|--|n\/a|na|s\/n|sin dato|sin datos)$/i.test(normalized)) return null;
    return normalized ? transform(normalized) : null;
}

function normalizeDate(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const parsedDate = new Date(excelEpoch + Math.round(value) * 86400000);
        return parsedDate.toISOString().slice(0, 10);
    }

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
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
        const totalSeconds = Math.round(value * 86400);
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    const normalized = String(value ?? '').trim();
    if (!normalized) return null;

    const amPmMatch = normalized.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*$/i);
    if (amPmMatch) {
        const [, hourValue, minute, second = '00', period] = amPmMatch;
        let hour = Number(hourValue);
        if (/p/i.test(period) && hour < 12) hour += 12;
        if (/a/i.test(period) && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:${minute}:${second}`;
    }

    const timeMatch = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
        const [, hour, minute, second = '00'] = timeMatch;
        return `${hour.padStart(2, '0')}:${minute}:${second}`;
    }

    return null;
}

function getSpanishMonthNameFromDate(value) {
    const normalizedDate = normalizeDate(value);
    if (!normalizedDate) return '';

    const monthIndex = Number(normalizedDate.slice(5, 7)) - 1;
    return [
        'ENERO',
        'FEBRERO',
        'MARZO',
        'ABRIL',
        'MAYO',
        'JUNIO',
        'JULIO',
        'AGOSTO',
        'SEPTIEMBRE',
        'OCTUBRE',
        'NOVIEMBRE',
        'DICIEMBRE'
    ][monthIndex] || '';
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

function buildLegacyDashboardRowHashSeed({ sourceType, sourceFileName, sourceSheetName, sourceRowNumber, rowData }) {
    const pozoName = normalizeText(getFirstValue(rowData, POZO_KEYS), value => value.toUpperCase());
    const reportDate = normalizeDate(getFirstValue(rowData, DATE_KEYS));
    const reportTime = normalizeTime(getFirstValue(rowData, TIME_KEYS));

    if (pozoName && reportDate && reportTime) {
        return [sourceType, pozoName, reportDate, reportTime].join('|');
    }

    return buildRowHashSeed({ sourceType, sourceFileName, sourceSheetName, sourceRowNumber, rowData });
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
        const rowHashSeed = buildLegacyDashboardRowHashSeed({ sourceType, sourceFileName, sourceSheetName, sourceRowNumber, rowData });

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
    || (/(consolidated_dashboard_general|consolidated_dashboard_operational)/i.test(message) && /does not exist|not found|no existe/i.test(message));
}

function buildConsolidadoDatabaseError(error) {
    if (isConsolidadoSchemaCacheError(error)) {
        return new Error('La tabla consolidated_dashboard_general ya puede existir, pero el API de Supabase aun no actualizo su cache. Ejecuta: notify pgrst, \'reload schema\'; en Supabase, espera unos segundos, recarga con Ctrl + F5 y vuelve a guardar.');
    }

    if (isConsolidadoMissingRelationError(error)) {
        return new Error('No se encontro una tabla del consolidado en Supabase. Verifica que ejecutaste supabase/consolidated_dashboard_general.sql y supabase/consolidated_dashboard_operational.sql en el proyecto ktfiglhhsqinvqvqynhg.');
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
        .from(CONSOLIDATED_OPERATIONAL_TABLE)
        .select('id, source_journey_id, source_record_id, pozo, campo, ef, report_date, report_time, row_data, created_at')
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

async function countRowsFromTable(tableName) {
    const { count, error } = await supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true });

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
        countRowsFromTable(CONSOLIDATED_OPERATIONAL_TABLE),
        countConsolidatedRowsBySource('manual_adjustment')
    ]);

    const { data: latestRows, error: latestError } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('source_type, source_file_name, source_sheet_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    if (latestError) throw buildConsolidadoDatabaseError(latestError);

    return {
        total: legacyCount + fieldJourneyCount,
        legacyCount,
        fieldJourneyCount,
        manualCount,
        latest: latestRows?.[0] || null
    };
}

export async function getConsolidatedDashboardFilterOptions() {
    await ensureConsolidadoReadAccess();

    const rows = [
        ...await fetchConsolidatedRowsPage(CONSOLIDATED_TABLE, { select: 'pozo, report_date', sourceType: 'legacy_excel' }),
        ...await fetchConsolidatedRowsPage(CONSOLIDATED_OPERATIONAL_TABLE, { select: 'pozo, report_date' })
    ];

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

async function fetchConsolidatedRowsPage(tableName, { limit = 10000, pozo = '', startDate = '', endDate = '', select = 'source_type, source_file_name, source_sheet_name, source_row_number, pozo, campo, ef, report_date, report_time, row_data, column_labels, created_at, updated_at', sourceType = '' } = {}) {
    const pageSize = 1000;
    const rows = [];
    const normalizedPozo = String(pozo || '').trim().toUpperCase();

    for (let startIndex = 0; startIndex < limit; startIndex += pageSize) {
        const endIndex = Math.min(startIndex + pageSize - 1, limit - 1);
        let query = supabase
            .from(tableName)
            .select(select)
            .order('created_at', { ascending: true });

        if (sourceType) query = query.eq('source_type', sourceType);
        if (normalizedPozo) query = query.eq('pozo', normalizedPozo);
        if (startDate) query = query.gte('report_date', startDate);
        if (endDate) query = query.lte('report_date', endDate);

        const { data, error } = await query.range(startIndex, endIndex);

        if (error) throw buildConsolidadoDatabaseError(error);
        rows.push(...(data || []));

        if (!data || data.length < pageSize) break;
    }

    return rows;
}

export async function fetchConsolidatedDashboardRows({ limit = 10000, pozo = '', startDate = '', endDate = '', source = 'base' } = {}) {
    await ensureConsolidadoReadAccess();

    const rows = [];

    if (source === 'base' || source === 'completo') {
        rows.push(...await fetchConsolidatedRowsPage(CONSOLIDATED_TABLE, { limit, pozo, startDate, endDate, sourceType: 'legacy_excel' }));
    }

    if (source === 'operativo' || source === 'completo') {
        rows.push(...await fetchConsolidatedRowsPage(CONSOLIDATED_OPERATIONAL_TABLE, { limit, pozo, startDate, endDate }));
    }

    return dedupeConsolidatedRowsForExport(rows).sort(sortConsolidatedRows);
}

function shouldPreferConsolidatedExportRow(candidate = {}, current = {}) {
    const candidateSourceOrder = SOURCE_ORDER[candidate.source_type] ?? 99;
    const currentSourceOrder = SOURCE_ORDER[current.source_type] ?? 99;
    if (candidateSourceOrder !== currentSourceOrder) return candidateSourceOrder > currentSourceOrder;

    const candidateUpdatedAt = String(candidate.updated_at || candidate.created_at || '');
    const currentUpdatedAt = String(current.updated_at || current.created_at || '');
    return candidateUpdatedAt > currentUpdatedAt;
}

function dedupeConsolidatedRowsForExport(rows = []) {
    const rowsByKey = new Map();
    const looseRows = [];
    const legacyDateKeys = new Set(rows
        .filter(row => row.source_type === 'legacy_excel')
        .map(buildConsolidatedRowDateKey)
        .filter(Boolean));

    rows.forEach(row => {
        if (row.source_type === 'manual_adjustment' && legacyDateKeys.has(buildConsolidatedRowDateKey(row))) {
            return;
        }

        const key = buildConsolidatedRowMonitoringKey(row);
        if (!key) {
            looseRows.push(row);
            return;
        }

        const current = rowsByKey.get(key);
        if (!current || shouldPreferConsolidatedExportRow(row, current)) {
            rowsByKey.set(key, row);
        }
    });

    return [...rowsByKey.values(), ...looseRows];
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

function buildBESProfileCandidateFromConsolidatedRow(row = {}) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const pozoName = normalizeText(row.pozo || getFirstValueByNormalizedKey(rowData, POZO_KEYS), value => value.toUpperCase());
    if (!pozoName) return null;

    const candidate = { pozo_name: pozoName };
    BES_PROFILE_FIELDS.forEach(fieldName => {
        const rawValue = getFirstValueByNormalizedKey(rowData, BES_PROFILE_KEY_MAP[fieldName]);
        candidate[fieldName] = fieldName === 'installed_at'
            ? normalizeDate(rawValue)
            : normalizeText(rawValue);
    });

    const hasBESValue = BES_PROFILE_FIELDS.some(fieldName => Boolean(candidate[fieldName]));
    if (!hasBESValue) return null;

    if (!candidate.pump_type) {
        candidate.pump_type = candidate.multiphase_pump || [candidate.pump_manufacturer, candidate.pump_model].filter(Boolean).join(' ') || candidate.pump_model || candidate.pump_manufacturer || '';
    }

    return candidate.pump_type ? candidate : null;
}

function buildManualMonitoringCanonicalRowData(record = {}) {
    const normalizedDate = normalizeDate(record.fecha) || record.fecha || '';
    return {
        POZO: String(record.pozo_name || '').trim().toUpperCase(),
        CAMPO: String(record.campo || record.campo_name || '').trim(),
        EF: String(record.ef || '').trim(),
        FECHA: normalizedDate,
        MES: getSpanishMonthNameFromDate(normalizedDate),
        HORA: normalizeMonitoringTime(record.hora || ''),
        ESTATUS: String(record.estatus || '').trim(),
        FREC: record.frecuencia ?? '',
        'SENTIDO DE GIRO': String(record.sentido_giro || '').trim(),
        'I Motor [Amp]': record.corriente_motor ?? '',
        'PIP [psi]': record.pip ?? '',
        'Tm [°F]': record.tm ?? '',
        'THP [psi]': record.presion_thp ?? '',
        'CHP [psi]': record.presion_chp ?? '',
        'LF [psi]': record.presion_lf ?? '',
        'VSD A [Amp]': record.vsd_a ?? '',
        'VSD B [Amp]': record.vsd_b ?? '',
        'VSD C [Amp]': record.vsd_c ?? '',
        OBSERVACIONES: String(record.observaciones || '').trim()
    };
}

function buildManualMonitoringRowData(record = {}) {
    const rawSourceRowData = record.__consolidated_row_data && typeof record.__consolidated_row_data === 'object'
        ? record.__consolidated_row_data
        : {};
    const sourceRowData = hasCompleteConsolidatedSourceRow(rawSourceRowData)
        ? Object.fromEntries(getUsableManualMonitoringSourceEntries(rawSourceRowData))
        : {};

    const rowData = buildManualMonitoringCanonicalRowData(record);

    Object.entries(rowData).forEach(([key, value]) => {
        const targetKey = findConsolidatedFieldLabel(sourceRowData, Object.keys(sourceRowData), key);
        sourceRowData[targetKey] = value;
    });

    return sourceRowData;
}

function mergeManualMonitoringIntoConsolidatedRow(row = {}, manualRowData = {}) {
    const currentRowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const nextRowData = { ...currentRowData };
    const nextColumnLabels = Array.isArray(row.column_labels) ? [...row.column_labels] : Object.keys(currentRowData);
    const normalizedColumnLabels = new Set(nextColumnLabels.map(normalizeRowDataKey));
    let changed = false;

    Object.entries(manualRowData).forEach(([canonicalLabel, value]) => {
        if (!hasManualMonitoringValue(value)) return;
        const targetLabel = findConsolidatedFieldLabel(nextRowData, nextColumnLabels, canonicalLabel);
        if (String(nextRowData[targetLabel] ?? '') === String(value ?? '')) return;

        nextRowData[targetLabel] = value;
        const normalizedTargetLabel = normalizeRowDataKey(targetLabel);
        if (!normalizedColumnLabels.has(normalizedTargetLabel)) {
            nextColumnLabels.push(targetLabel);
            normalizedColumnLabels.add(normalizedTargetLabel);
        }
        changed = true;
    });

    return { rowData: nextRowData, columnLabels: nextColumnLabels, changed };
}

function pickManualMonitoringPatchRowData(rowData = {}) {
    return Object.keys(MANUAL_MONITORING_FIELD_ALIASES).reduce((patch, canonicalLabel) => {
        const value = getFirstValueByNormalizedKey(rowData, MANUAL_MONITORING_FIELD_ALIASES[canonicalLabel]);
        if (hasManualMonitoringValue(value)) patch[canonicalLabel] = value;
        return patch;
    }, {});
}

function buildManualMonitoringRowHashSeed(record = {}) {
    const pozoName = String(record.pozo_name || '').trim().toUpperCase();
    const fecha = String(record.fecha || '').trim();
    const hora = normalizeMonitoringTime(record.hora || '');
    return ['manual_adjustment', pozoName, fecha, hora].join('|');
}

async function buildManualMonitoringConsolidatedRows(records = [], sourceFileName = '') {
    const usableRecords = (Array.isArray(records) ? records : [])
        .filter(record => String(record?.pozo_name || '').trim() && String(record?.fecha || '').trim());

    return Promise.all(usableRecords.map(async record => {
        const rowData = buildManualMonitoringRowData(record);
        const rowHashSeed = buildManualMonitoringRowHashSeed(record);

        return {
            source_type: 'manual_adjustment',
            source_file_name: sourceFileName || null,
            source_sheet_name: 'DASHBOARD GENERAL',
            source_row_number: null,
            row_hash: await createStableHash(rowHashSeed),
            pozo: normalizeText(getFirstValueByNormalizedKey(rowData, POZO_KEYS) || record.pozo_name, value => value.toUpperCase()),
            campo: normalizeText(getFirstValueByNormalizedKey(rowData, CAMPO_KEYS) || record.campo || record.campo_name),
            ef: normalizeText(getFirstValueByNormalizedKey(rowData, EF_KEYS) || record.ef),
            report_date: normalizeDate(getFirstValueByNormalizedKey(rowData, DATE_KEYS) || record.fecha),
            report_time: normalizeTime(getFirstValueByNormalizedKey(rowData, TIME_KEYS) || record.hora),
            row_data: rowData,
            column_labels: Object.keys(rowData)
        };
    }));
}

function dedupeConsolidatedRowsByHash(rows = []) {
    return [...new Map(rows.map(row => [row.row_hash, row])).values()];
}

async function fetchLegacyRowsForDashboardImport(rows = []) {
    const pozoList = [...new Set(rows.map(row => String(row.pozo || '').trim().toUpperCase()).filter(Boolean))];
    if (!pozoList.length) return [];

    const { data, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id, row_hash, pozo, campo, ef, report_date, report_time, row_data, column_labels')
        .eq('source_type', 'legacy_excel')
        .in('pozo', pozoList);

    if (error) throw buildConsolidadoDatabaseError(error);
    return data || [];
}

async function splitLegacyDashboardPayloadForSave(payload = []) {
    const legacyRows = await fetchLegacyRowsForDashboardImport(payload);
    const legacyByKey = new Map();

    legacyRows.forEach(row => {
        buildConsolidatedRowMonitoringKeyCandidates(row).forEach(key => {
            if (!key) return;
            const rowsForKey = legacyByKey.get(key) || [];
            rowsForKey.push(row);
            legacyByKey.set(key, rowsForKey);
        });
    });

    const updatesById = new Map();
    const rowsToInsert = [];

    payload.forEach(row => {
        const rowKeys = buildConsolidatedRowMonitoringKeyCandidates(row);
        const key = [...rowKeys].find(candidateKey => legacyByKey.has(candidateKey));
        const legacyRowsForKey = key ? legacyByKey.get(key) || [] : [];
        const legacyRow = legacyRowsForKey.find(candidate => candidate.row_hash === row.row_hash) || legacyRowsForKey[0] || null;

        if (legacyRow?.id) {
            updatesById.set(legacyRow.id, row);
            return;
        }

        rowsToInsert.push(row);
    });

    return { updatesById, rowsToInsert };
}

async function fetchLegacyRowsForManualMonitoringMerge(rows = []) {
    const pozoList = [...new Set(rows.map(row => String(row.pozo || '').trim().toUpperCase()).filter(Boolean))];

    if (!pozoList.length) return [];

    const { data, error } = await supabase
        .from(CONSOLIDATED_TABLE)
        .select('id, pozo, campo, ef, report_date, report_time, row_data, column_labels')
        .eq('source_type', 'legacy_excel')
        .in('pozo', pozoList);

    if (error) throw buildConsolidadoDatabaseError(error);
    return data || [];
}

async function updateLegacyRowsWithManualMonitoringRows(rows = []) {
    const legacyRows = await fetchLegacyRowsForManualMonitoringMerge(rows);
    if (!legacyRows.length) return { updated: 0, matchedKeys: new Set(), templateByPozo: new Map() };

    const legacyByKey = new Map();
    const templateByPozo = new Map();
    legacyRows.forEach(row => {
        buildConsolidatedRowMonitoringKeyCandidates(row).forEach(key => {
            if (key && !legacyByKey.has(key)) legacyByKey.set(key, row);
        });

        const pozoName = getConsolidatedRowPozo(row);
        const currentTemplate = templateByPozo.get(pozoName);
        if (pozoName && (!currentTemplate || compareConsolidatedRowMoment(row, currentTemplate) > 0)) {
            templateByPozo.set(pozoName, row);
        }
    });

    const updatesById = new Map();
    const matchedKeys = new Set();

    rows.forEach(row => {
        const rowKeys = buildConsolidatedRowMonitoringKeyCandidates(row);
        const key = [...rowKeys].find(candidateKey => legacyByKey.has(candidateKey));
        const legacyRow = key ? legacyByKey.get(key) : null;
        if (!legacyRow) return;

        rowKeys.forEach(candidateKey => matchedKeys.add(candidateKey));
        const latestLegacyRow = updatesById.get(legacyRow.id)?.workingRow || legacyRow;
        const merged = mergeManualMonitoringIntoConsolidatedRow(latestLegacyRow, row.row_data || {});
        if (!merged.changed) return;

        const rowData = merged.rowData;
        updatesById.set(legacyRow.id, {
            workingRow: { ...latestLegacyRow, row_data: rowData, column_labels: merged.columnLabels },
            payload: {
                row_data: rowData,
                column_labels: merged.columnLabels,
                pozo: normalizeText(getFirstValueByNormalizedKey(rowData, POZO_KEYS), value => value.toUpperCase()),
                campo: normalizeText(getFirstValueByNormalizedKey(rowData, CAMPO_KEYS)),
                ef: normalizeText(getFirstValueByNormalizedKey(rowData, EF_KEYS)),
                report_date: normalizeDate(getFirstValueByNormalizedKey(rowData, DATE_KEYS)),
                report_time: normalizeTime(getFirstValueByNormalizedKey(rowData, TIME_KEYS))
            }
        });
    });

    let updated = 0;
    for (const [id, update] of updatesById.entries()) {
        const { error } = await supabase
            .from(CONSOLIDATED_TABLE)
            .update(update.payload)
            .eq('id', id);

        if (error) throw buildConsolidadoDatabaseError(error);
        updated += 1;
    }

    return { updated, matchedKeys, templateByPozo };
}

async function previewLegacyRowsWithManualMonitoringRows(rows = []) {
    const legacyRows = await fetchLegacyRowsForManualMonitoringMerge(rows);
    if (!legacyRows.length) return { updateCount: 0, insertCount: rows.length, matchedKeys: new Set() };

    const legacyByKey = new Map();
    legacyRows.forEach(row => {
        buildConsolidatedRowMonitoringKeyCandidates(row).forEach(key => {
            if (key && !legacyByKey.has(key)) legacyByKey.set(key, row);
        });
    });

    const updateIds = new Set();
    const matchedKeys = new Set();

    rows.forEach(row => {
        const rowKeys = buildConsolidatedRowMonitoringKeyCandidates(row);
        const key = [...rowKeys].find(candidateKey => legacyByKey.has(candidateKey));
        const legacyRow = key ? legacyByKey.get(key) : null;
        if (!legacyRow) return;

        rowKeys.forEach(candidateKey => matchedKeys.add(candidateKey));
        const merged = mergeManualMonitoringIntoConsolidatedRow(legacyRow, row.row_data || {});
        if (merged.changed) updateIds.add(legacyRow.id);
    });

    const insertCount = rows.filter(row => ![...buildConsolidatedRowMonitoringKeyCandidates(row)].some(key => matchedKeys.has(key))).length;
    return { updateCount: updateIds.size, insertCount, matchedKeys };
}

function buildManualMonitoringRowFromTemplate(row = {}, template = null) {
    if (!template) return row;

    const templateRowData = template.row_data && typeof template.row_data === 'object' ? template.row_data : {};
    const templateColumnLabels = Array.isArray(template.column_labels) ? template.column_labels : Object.keys(templateRowData);
    const patchRowData = pickManualMonitoringPatchRowData(row.row_data || {});
    const merged = mergeManualMonitoringIntoConsolidatedRow(
        { ...template, row_data: { ...templateRowData }, column_labels: [...templateColumnLabels] },
        patchRowData
    );
    const rowData = merged.rowData;

    return {
        ...row,
        campo: normalizeText(getFirstValueByNormalizedKey(rowData, CAMPO_KEYS)) || row.campo,
        ef: normalizeText(getFirstValueByNormalizedKey(rowData, EF_KEYS)) || row.ef,
        row_data: rowData,
        column_labels: merged.columnLabels
    };
}

export async function upsertManualMonitoringIntoConsolidated(records = [], { sourceFileName = '' } = {}) {
    await ensureConsolidadoManagementAccess();
    return { saved: 0, updated: 0, inserted: 0, skipped: Array.isArray(records) ? records.length : 0, sourceFileName };
}

export async function previewManualMonitoringIntoConsolidated(records = []) {
    await ensureConsolidadoReadAccess();
    return { total: Array.isArray(records) ? records.length : 0, updated: 0, inserted: 0 };
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

function mergeBESProfileCandidateWithExisting(candidate = {}, existing = {}) {
    const payload = {
        pozo_name: candidate.pozo_name,
        pump_type: candidate.pump_type || existing.pump_type || ''
    };

    BES_PROFILE_FIELDS.forEach(fieldName => {
        payload[fieldName] = candidate[fieldName] || existing[fieldName] || '';
    });

    return payload;
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
    const besResult = await syncBESProfilesFromConsolidatedRows(consolidatedRows);
    if (!candidates.length) {
        return { updated: 0, candidates: 0, skipped: 0, bes: besResult };
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

    return { updated, candidates: candidates.length, skipped, bes: besResult };
}

async function syncBESProfilesFromConsolidatedRows(consolidatedRows = []) {
    const candidateByPozo = new Map();

    consolidatedRows
        .filter(row => row.source_type !== 'field_journey')
        .forEach(row => {
            const candidate = buildBESProfileCandidateFromConsolidatedRow(row);
            if (!candidate) return;

            const current = candidateByPozo.get(candidate.pozo_name);
            const candidateDate = row.report_date || normalizeDate(getFirstValueByNormalizedKey(row.row_data || {}, DATE_KEYS)) || '';
            const currentDate = current?._sourceDate || '';
            if (!current || compareDateValues(candidateDate, currentDate) >= 0) {
                candidateByPozo.set(candidate.pozo_name, { ...candidate, _sourceDate: candidateDate });
            }
        });

    const candidates = [...candidateByPozo.values()];
    if (!candidates.length) {
        return { updated: 0, candidates: 0, skipped: 0 };
    }

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const candidate of candidates) {
        try {
            const existing = await getWellBESProfile(candidate.pozo_name).catch(() => null);
            const payload = mergeBESProfileCandidateWithExisting(candidate, existing || {});
            if (!payload.pump_type) {
                skipped += 1;
                continue;
            }
            await upsertWellBESProfile(payload);
            updated += 1;
        } catch (error) {
            skipped += 1;
            errors.push(error?.message || String(error));
        }
    }

    if (updated === 0 && skipped > 0) {
        console.warn('No se pudieron sincronizar fichas BES desde consolidado:', errors);
    }

    return { updated, candidates: candidates.length, skipped };
}

export async function syncBESProfilesFromConsolidated({ limit = 10000 } = {}) {
    await ensureConsolidadoManagementAccess();
    await ensureMonitoringWriteAccess();

    const consolidatedRows = await fetchConsolidatedDashboardRows({ limit });
    return syncBESProfilesFromConsolidatedRows(consolidatedRows);
}

export async function fetchFieldJourneyConsolidatedRows({ limit = 200 } = {}) {
    await ensureConsolidadoReadAccess();

    const { data, error } = await supabase
        .from(CONSOLIDATED_OPERATIONAL_TABLE)
        .select('id, source_journey_id, source_record_id, pozo, campo, ef, report_date, report_time, row_data, created_at')
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
        .from(CONSOLIDATED_OPERATIONAL_TABLE)
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
        .from(CONSOLIDATED_OPERATIONAL_TABLE)
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
    const payload = dedupeConsolidatedRowsByHash(await buildDashboardPayload({ template, sheet, columns, rows }));
    const { updatesById, rowsToInsert } = await splitLegacyDashboardPayloadForSave(payload);
    const chunkSize = 400;
    const totalChunks = Math.max(1, Math.ceil(rowsToInsert.length / chunkSize));
    let saved = 0;

    for (const [id, row] of updatesById.entries()) {
        const { error } = await supabase
            .from(CONSOLIDATED_TABLE)
            .update({
                source_type: row.source_type,
                source_file_name: row.source_file_name,
                source_sheet_name: row.source_sheet_name,
                source_row_number: row.source_row_number,
                row_hash: row.row_hash,
                pozo: row.pozo,
                campo: row.campo,
                ef: row.ef,
                report_date: row.report_date,
                report_time: row.report_time,
                row_data: row.row_data,
                column_labels: row.column_labels
            })
            .eq('id', id);

        if (error) {
            throw buildConsolidadoDatabaseError(error);
        }

        saved += 1;
    }

    for (let startIndex = 0; startIndex < rowsToInsert.length; startIndex += chunkSize) {
        const chunk = rowsToInsert.slice(startIndex, startIndex + chunkSize);
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
        updated: updatesById.size,
        inserted: rowsToInsert.length,
        total: payload.length,
        sourceFileName: template.fileName,
        sourceSheetName: sheet.name
    };
}
