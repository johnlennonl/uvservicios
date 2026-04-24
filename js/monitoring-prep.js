import { getSession, logout } from './auth.js';

const OUTPUT_COLUMNS = [
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

const NUMERIC_COLUMNS = new Set([
    'frecuencia',
    'corriente_motor',
    'presion_thp',
    'presion_chp',
    'presion_lf',
    'pip',
    'tm',
    'vsd_a',
    'vsd_b',
    'vsd_c'
]);

const DAILY_IMPORT_FIELD_ALIASES = {
    pozo_name: ['pozo_name', 'pozo', 'well', 'well_name', 'nombre_pozo'],
    campo: ['campo', 'campo_name', 'field', 'area'],
    fecha: ['fecha', 'fecha_medicion', 'date', 'dia', 'fecha_registro'],
    hora: ['hora', 'time', 'hora_medicion'],
    frecuencia: ['frecuencia', 'frecuencia_hz', 'hz', 'freq', 'frequency', 'frec'],
    corriente_motor: ['corriente_motor', 'corriente_m', 'corriente_amp', 'i_motor_amp', 'i_motor', 'motor_amp', 'motor_current', 'amperaje_motor', 'i_motor_a'],
    pip: ['pip_psi', 'pip', 'presion_pip', 'pump_intake_pressure'],
    tm: ['tm', 'tm_f', 'temp_tm', 'temp_tm_f', 'temperatura_tm', 'temperatura_tm_f', 'temp_motor', 'motor_temp'],
    presion_thp: ['presion_thp', 'thp', 'thp_psi', 'tubing_head_pressure'],
    presion_chp: ['presion_chp', 'chp', 'chp_psi', 'casing_head_pressure'],
    presion_lf: ['presion_lf', 'lf', 'lf_psi', 'line_pressure'],
    sentido_giro: ['sentido_giro', 'sentido_de_giro', 'giro', 'direccion_giro', 'rotation_direction', 'rotation', 'sentido'],
    vsd_a: ['vsd_a', 'vsd_a_amp', 'vsd_a_amperios', 'i_vsd_a_a', 'fase_a', 'a'],
    vsd_b: ['vsd_b', 'vsd_b_amp', 'vsd_b_amperios', 'i_vsd_b_a', 'fase_b', 'b'],
    vsd_c: ['vsd_c', 'vsd_c_amp', 'vsd_c_amperios', 'i_vsd_c_a', 'fase_c', 'c'],
    estatus: ['estatus', 'status', 'estado', 'run_status'],
    observaciones: ['observaciones', 'observacion', 'obs', 'comentario', 'comentarios', 'remarks']
};

const DAILY_EXCEL_LAYOUTS = [
    {
        name: 'standard_dashboard',
        mapRow(row) {
            return {
                pozo_name: getExcelCellValue(row, 'A'),
                campo: getExcelCellValue(row, 'B'),
                fecha: getExcelCellValue(row, 'C'),
                hora: getFirstNonEmptyValue([getExcelCellValue(row, 'D'), getExcelCellValue(row, 'E')]),
                estatus: getExcelCellValue(row, 'F'),
                frecuencia: getExcelCellValue(row, 'G'),
                corriente_motor: getExcelCellValue(row, 'J'),
                vsd_a: getExcelCellValue(row, 'M'),
                vsd_b: getExcelCellValue(row, 'N'),
                vsd_c: getExcelCellValue(row, 'O'),
                pip: getLikelyPipValue(getExcelCellValue(row, 'AB'), getExcelCellValue(row, 'V'), getExcelCellValue(row, 'M')),
                tm: getExcelCellValue(row, 'Y'),
                presion_thp: getExcelCellValue(row, 'BH'),
                presion_chp: getExcelCellValue(row, 'BI'),
                observaciones: collectExcelObservationText(row, 'EW')
            };
        }
    },
    {
        name: 'tom_compacto',
        mapRow(row) {
            return {
                pozo_name: getExcelCellValue(row, 'A'),
                campo: getExcelCellValue(row, 'B'),
                fecha: getExcelCellValue(row, 'C'),
                hora: getExcelCellValue(row, 'D'),
                estatus: getExcelCellValue(row, 'E'),
                frecuencia: getExcelCellValue(row, 'F'),
                vsd_a: getExcelCellValue(row, 'H'),
                vsd_b: getExcelCellValue(row, 'I'),
                vsd_c: getExcelCellValue(row, 'J'),
                corriente_motor: getExcelCellValue(row, 'K'),
                pip: getLikelyPipValue(getExcelCellValue(row, 'AB'), getExcelCellValue(row, 'M'), getExcelCellValue(row, 'V')),
                tm: getExcelCellValue(row, 'N'),
                presion_thp: getExcelCellValue(row, 'O'),
                presion_chp: getExcelCellValue(row, 'P'),
                presion_lf: getExcelCellValue(row, 'Q'),
                observaciones: collectExcelObservationTextFromIndex(row, excelColumnToIndex('R'))
            };
        }
    }
];

function getLikelyPipValue(...values) {
    const candidates = values.filter(value => value !== undefined && value !== null && `${value}`.trim() !== '');
    if (candidates.length === 0) return undefined;

    const psiCandidate = candidates.find(value => {
        const numeric = roundNumericValue(value, 4);
        return numeric !== null && Math.abs(numeric) >= 10;
    });

    return psiCandidate ?? candidates[0];
}

let preparedRows = [];
let discardedRows = [];
let currentSheetName = '--';
let duplicateCount = 0;
let lastFileName = '';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);
    document.getElementById('download-xlsx-btn')?.addEventListener('click', () => downloadPreparedFile('xlsx'));
    document.getElementById('download-csv-btn')?.addEventListener('click', () => downloadPreparedFile('csv'));
    document.getElementById('download-template-btn')?.addEventListener('click', downloadTemplateFile);
    bindUploadZone();
});

function bindUploadZone() {
    const dropZone = document.getElementById('prep-drop-zone');
    const fileInput = document.getElementById('prep-file-input');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        await handleSourceFile(file);
        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.add('is-dragover');
        });
    });

    ['dragleave', 'dragend'].forEach(eventName => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove('is-dragover');
        });
    });

    dropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('is-dragover');
        const file = event.dataTransfer?.files?.[0];
        await handleSourceFile(file);
    });
}

async function handleSourceFile(file) {
    if (!file) return;

    setStatus(`Procesando ${file.name}...`, 'processing');

    try {
        lastFileName = file.name;
        const { rows, sheetName } = await parseMonitoringSourceFile(file);
        currentSheetName = sheetName || '--';

        const normalizedRows = (rows || []).map(normalizeImportedRow);
        const { validRows, issues, duplicates } = buildPreparedRows(normalizedRows);

        preparedRows = validRows;
        discardedRows = issues;
        duplicateCount = duplicates;

        renderMetrics(normalizedRows.length, preparedRows, discardedRows, duplicateCount);
        renderPreview(preparedRows);
        renderIssues(discardedRows);
        toggleExportButtons(preparedRows.length > 0);

        if (preparedRows.length === 0) {
            setStatus('No se detectaron filas válidas para exportar. Revisa el archivo o ajusta sus encabezados.', 'error');
            return;
        }

        const duplicatesMessage = duplicateCount > 0
            ? ` Se consolidaron ${duplicateCount} duplicado(s) por pozo + fecha + hora.`
            : '';

        setStatus(`Archivo listo. ${preparedRows.length} fila(s) quedaron preparadas para exportación.${duplicatesMessage}`, 'success');
    } catch (error) {
        preparedRows = [];
        discardedRows = [];
        duplicateCount = 0;
        toggleExportButtons(false);
        renderMetrics(0, [], [], 0);
        renderPreview([]);
        renderIssues([]);
        setStatus(error.message || 'No se pudo procesar el archivo.', 'error');
        Swal.fire({ icon: 'error', title: 'Error de preparación', text: error.message || 'No se pudo procesar el archivo.' });
    }
}

function renderMetrics(totalRows, validRows, issues, duplicates) {
    const validCount = validRows.length;

    document.getElementById('metric-total').textContent = String(totalRows);
    document.getElementById('metric-valid').textContent = String(validCount);
    document.getElementById('metric-discarded').textContent = String(issues.length + duplicates);
}

function renderPreview(rows) {
    const head = document.getElementById('prep-table-head');
    const body = document.getElementById('prep-table-body');
    if (!head || !body) return;

    head.innerHTML = `<tr>${OUTPUT_COLUMNS.map(column => `<th>${column}</th>`).join('')}</tr>`;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="17" class="prep-table-empty">Todavía no hay datos preparados.</td></tr>';
        return;
    }

    body.innerHTML = rows.slice(0, 30).map(row => `
        <tr class="${row.__offOnlyIncluded ? 'prep-row-off-only' : ''}">
            ${OUTPUT_COLUMNS.map(column => `<td>${formatPreviewCell(row[column], column, row)}</td>`).join('')}
        </tr>
    `).join('');
}

function formatPreviewCell(value, columnName = '', row = null) {
    if (value === undefined || value === null || value === '') return '--';

    if (columnName === 'estatus' && row?.__offOnlyIncluded) {
        return `${String(value)} <span class="prep-cell-flag">OFF sin telemetría</span>`;
    }

    return String(value);
}

function isOffOnlyIncludedRow(row) {
    if (row?.estatus !== 'OFF') return false;

    const hasExtraTelemetry = [...NUMERIC_COLUMNS, 'sentido_giro']
        .some(field => row[field] !== undefined && row[field] !== null && `${row[field]}`.trim() !== '');

    return !hasExtraTelemetry;
}

function renderIssues(issues) {
    const list = document.getElementById('prep-issues-list');
    if (!list) return;

    if (!issues.length) {
        list.innerHTML = '<li>No hubo descartes relevantes en el archivo procesado.</li>';
        return;
    }

    list.innerHTML = issues
        .slice(0, 8)
        .map(issue => `<li>Fila ${issue.rowNumber}: ${issue.reason}</li>`)
        .join('');
}

function toggleExportButtons(enabled) {
    document.getElementById('download-xlsx-btn').disabled = !enabled;
    document.getElementById('download-csv-btn').disabled = !enabled;
}

function setStatus(message, type = 'neutral') {
    const status = document.getElementById('prep-status');
    if (!status) return;

    status.textContent = message;
    status.className = `prep-status prep-status-${type}`;
}

async function parseMonitoringSourceFile(file) {
    const extension = getFileExtension(file.name);
    if (extension === 'csv') {
        return {
            rows: await parseTabularFile(file),
            sheetName: 'CSV'
        };
    }

    if (extension !== 'xlsx' && extension !== 'xls') {
        throw new Error('Formato no soportado. Usa CSV, XLSX o XLS.');
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return { rows: [], sheetName: '--' };
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        header: 1,
        defval: '',
        raw: true
    });

    const headerRowIndex = findDailyHeaderRowIndex(rows);
    if (headerRowIndex >= 0) {
        const headerFields = getDailyHeaderFields(rows[headerRowIndex] || []);
        const headerRows = parseDailyExcelWithHeaders(rows, headerRowIndex);
        return {
            rows: headerRows,
            sheetName: headerFields.includes('pip') ? `${firstSheetName} · encabezados` : firstSheetName
        };
    }

    const dataRows = rows.slice(1);
    const detectedLayout = detectDailyExcelLayout(dataRows);
    return {
        rows: dataRows.map(row => detectedLayout.mapRow(row)),
        sheetName: `${firstSheetName} · ${detectedLayout.name}`
    };
}

async function parseTabularFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: false,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data || []),
            error: reject
        });
    });
}

function buildPreparedRows(rows) {
    const issues = [];
    const uniqueRows = new Map();
    let duplicates = 0;

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        if (!String(row.pozo_name || '').trim()) {
            issues.push({ rowNumber, reason: 'Sin pozo identificado.' });
            return;
        }

        if (!toIsoDate(row.fecha)) {
            issues.push({ rowNumber, reason: 'Sin fecha válida para monitoreo.' });
            return;
        }

        if (!hasDailyTelemetryData(row)) {
            issues.push({ rowNumber, reason: 'No contiene telemetría útil para importar.' });
            return;
        }

        const prepared = serializePreparedRow(row);
        prepared.__offOnlyIncluded = isOffOnlyIncludedRow(prepared);
        const key = `${prepared.pozo_name}|${prepared.fecha}|${prepared.hora}`;

        if (uniqueRows.has(key)) {
            duplicates += 1;
        }

        uniqueRows.set(key, prepared);
    });

    const validRows = [...uniqueRows.values()].sort((left, right) => {
        const pozoCompare = left.pozo_name.localeCompare(right.pozo_name);
        if (pozoCompare !== 0) return pozoCompare;

        const leftStamp = `${left.fecha}T${left.hora}`;
        const rightStamp = `${right.fecha}T${right.hora}`;
        return leftStamp.localeCompare(rightStamp);
    });

    return { validRows, issues, duplicates };
}

function serializePreparedRow(row) {
    const prepared = {};

    OUTPUT_COLUMNS.forEach(column => {
        if (NUMERIC_COLUMNS.has(column)) {
            prepared[column] = roundNumericValue(row[column]);
            return;
        }

        if (column === 'pozo_name' || column === 'campo' || column === 'observaciones') {
            const value = String(row[column] || '').trim();
            prepared[column] = value || null;
            return;
        }

        if (column === 'fecha') {
            prepared[column] = toIsoDate(row.fecha);
            return;
        }

        if (column === 'hora') {
            prepared[column] = toIsoTime(row.hora) || '00:00:00';
            return;
        }

        if (column === 'estatus') {
            prepared[column] = normalizeOperationalStatus(row.estatus);
            return;
        }

        if (column === 'sentido_giro') {
            prepared[column] = normalizeRotationDirection(row.sentido_giro);
        }
    });

    return prepared;
}

function downloadPreparedFile(format) {
    if (!preparedRows.length) return;

    const exportRows = buildExportRows(preparedRows);
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: OUTPUT_COLUMNS });
    worksheet['!cols'] = OUTPUT_COLUMNS.map(column => ({ wch: Math.max(column.length + 2, 14) }));

    forceWorksheetTextColumn(worksheet, 'fecha');
    forceWorksheetTextColumn(worksheet, 'hora');

    if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), buildExportFileName('csv'));
        return;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'monitoreo_limpio');
    XLSX.writeFile(workbook, buildExportFileName('xlsx'));
}

function downloadTemplateFile() {
    const worksheet = XLSX.utils.json_to_sheet([], { header: OUTPUT_COLUMNS });
    worksheet['!cols'] = OUTPUT_COLUMNS.map(column => ({ wch: Math.max(column.length + 2, 14) }));

    forceWorksheetTextColumn(worksheet, 'fecha');
    forceWorksheetTextColumn(worksheet, 'hora');

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'plantilla_monitoreo');
    XLSX.writeFile(workbook, 'plantilla_monitoreo_uv.xlsx');
}

function buildExportRows(rows = []) {
    return rows.map(row => {
        const exportRow = {};

        OUTPUT_COLUMNS.forEach(column => {
            if (column === 'fecha') {
                exportRow[column] = formatExportDate(row[column]);
                return;
            }

            if (column === 'hora') {
                exportRow[column] = formatExportTime(row[column]);
                return;
            }

            exportRow[column] = row[column];
        });

        return exportRow;
    });
}

function formatExportDate(value) {
    const isoDate = toIsoDate(value);
    if (!isoDate) return '';

    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
}

function formatExportTime(value) {
    return toIsoTime(value) || '';
}

function forceWorksheetTextColumn(worksheet, columnName) {
    const columnIndex = OUTPUT_COLUMNS.indexOf(columnName);
    if (columnIndex === -1) return;

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const cell = worksheet[address];
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;
        cell.t = 's';
        cell.z = '@';
        cell.v = String(cell.v);
        delete cell.w;
    }
}

function buildExportFileName(extension) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const baseName = String(lastFileName || 'monitoreo').replace(/\.[^.]+$/, '');
    return `${baseName}_limpio_${stamp}.${extension}`;
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function normalizeCsvKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function getFileExtension(fileName = '') {
    return (String(fileName).split('.').pop() || '').toLowerCase();
}

function getFirstAliasValue(source, aliases) {
    for (const alias of aliases) {
        if (source[alias] !== undefined && source[alias] !== null && `${source[alias]}`.trim() !== '') {
            return source[alias];
        }
    }
    return undefined;
}

function getDailyMatchedFields(source) {
    return Object.entries(DAILY_IMPORT_FIELD_ALIASES)
        .filter(([, aliases]) => getFirstAliasValue(source, aliases) !== undefined)
        .map(([field]) => field);
}

function getDailyHeaderFields(row = []) {
    const normalizedHeaderMap = Object.fromEntries(
        row
            .map((cell, index) => [normalizeCsvKey(cell || `column_${index + 1}`), true])
            .filter(([key]) => key && !key.startsWith('column_'))
    );

    return getDailyMatchedFields(normalizedHeaderMap);
}

function getDailyHeaderMatchCount(row = []) {
    return getDailyHeaderFields(row).length;
}

function isLikelyDailyHeaderFields(fields = []) {
    const fieldSet = new Set(fields);
    return fieldSet.has('pozo_name')
        && fieldSet.has('fecha')
        && (fieldSet.has('pip') || fieldSet.has('frecuencia') || fieldSet.has('estatus'));
}

function findDailyHeaderRowIndex(rows = []) {
    let bestIndex = -1;
    let bestScore = 0;
    let bestFields = [];

    rows.slice(0, 20).forEach((row, index) => {
        const fields = getDailyHeaderFields(row);
        const score = fields.length;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
            bestFields = fields;
        }
    });

    return bestScore >= 4 || isLikelyDailyHeaderFields(bestFields) ? bestIndex : -1;
}

function parseDailyExcelWithHeaders(rows = [], headerRowIndex = 0) {
    const headerRow = rows[headerRowIndex] || [];
    const headers = headerRow.map((cell, index) => normalizeCsvKey(cell || `column_${index + 1}`));

    return rows.slice(headerRowIndex + 1).map(row => {
        const mappedRow = {};
        headers.forEach((header, index) => {
            if (!header) return;
            mappedRow[header] = Array.isArray(row) ? row[index] : undefined;
        });
        return mappedRow;
    });
}

function scoreParsedDailyRows(rows = []) {
    return rows
        .slice(0, 40)
        .reduce((score, row) => {
            let rowScore = 0;

            if (`${row?.pozo_name ?? ''}`.trim()) rowScore += 2;
            if (toIsoDate(row?.fecha)) rowScore += 2;
            if (toIsoTime(row?.hora)) rowScore += 1;
            if (normalizeOperationalStatus(row?.estatus)) rowScore += 3;
            if (roundNumericValue(row?.frecuencia) !== null) rowScore += 3;
            if (roundNumericValue(row?.corriente_motor) !== null) rowScore += 2;
            if (roundNumericValue(row?.vsd_a) !== null) rowScore += 1;
            if (roundNumericValue(row?.vsd_b) !== null) rowScore += 1;
            if (roundNumericValue(row?.vsd_c) !== null) rowScore += 1;
            if (roundNumericValue(row?.pip) !== null) rowScore += 2;
            if (roundNumericValue(row?.tm) !== null) rowScore += 2;
            if (roundNumericValue(row?.presion_thp) !== null) rowScore += 1;
            if (roundNumericValue(row?.presion_chp) !== null) rowScore += 1;
            if (roundNumericValue(row?.presion_lf) !== null) rowScore += 1;
            if (`${row?.sentido_giro ?? ''}`.trim()) rowScore += 1;

            return score + rowScore;
        }, 0);
}

function scoreDailyExcelLayout(rows = [], layout) {
    return rows
        .filter(row => Array.isArray(row) && row.some(value => `${value ?? ''}`.trim() !== ''))
        .slice(0, 25)
        .reduce((score, row) => {
            const mappedRow = layout.mapRow(row);
            let rowScore = 0;

            if (`${mappedRow.pozo_name ?? ''}`.trim()) rowScore += 2;
            if (toIsoDate(mappedRow.fecha)) rowScore += 2;
            if (toIsoTime(mappedRow.hora)) rowScore += 1;
            if (normalizeOperationalStatus(mappedRow.estatus)) rowScore += 3;
            if (roundNumericValue(mappedRow.frecuencia) !== null) rowScore += 2;
            if (roundNumericValue(mappedRow.pip) !== null) rowScore += 1;
            if (roundNumericValue(mappedRow.tm) !== null) rowScore += 1;

            return score + rowScore;
        }, 0);
}

function detectDailyExcelLayout(rows = []) {
    const layoutRows = rows.slice(1);
    const scoredLayouts = DAILY_EXCEL_LAYOUTS
        .map(layout => ({ layout, score: scoreDailyExcelLayout(layoutRows, layout) }))
        .sort((a, b) => b.score - a.score);

    return scoredLayouts[0]?.layout || DAILY_EXCEL_LAYOUTS[0];
}

function normalizeImportedRow(row) {
    const normalizedRow = {};

    Object.entries(row || {}).forEach(([key, value]) => {
        normalizedRow[normalizeCsvKey(key)] = value;
    });

    Object.entries(DAILY_IMPORT_FIELD_ALIASES).forEach(([field, aliases]) => {
        const aliasValue = getFirstAliasValue(normalizedRow, aliases);
        if (aliasValue !== undefined) normalizedRow[field] = aliasValue;
    });

    normalizedRow.pozo_name = String(normalizedRow.pozo_name || '').trim();
    normalizedRow.campo = String(normalizedRow.campo || '').trim();
    normalizedRow.fecha = toIsoDate(normalizedRow.fecha) || normalizedRow.fecha;
    normalizedRow.hora = toIsoTime(normalizedRow.hora) || '00:00:00';
    normalizedRow.estatus = normalizeOperationalStatus(normalizedRow.estatus);
    normalizedRow.sentido_giro = normalizeRotationDirection(normalizedRow.sentido_giro);

    return normalizedRow;
}

function hasDailyTelemetryData(row) {
    const telemetryFields = [
        'frecuencia',
        'corriente_motor',
        'pip',
        'tm',
        'presion_thp',
        'presion_chp',
        'presion_lf',
        'vsd_a',
        'vsd_b',
        'vsd_c',
        'sentido_giro'
    ];

    const hasNumericOrCategoricalTelemetry = telemetryFields.some(field => {
        const value = row[field];
        return value !== undefined && value !== null && `${value}`.trim() !== '';
    });

    if (hasNumericOrCategoricalTelemetry) {
        return true;
    }

    return normalizeOperationalStatus(row?.estatus) === 'OFF';
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

function normalizeRotationDirection(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '');

    const forwardValues = new Set(['FWD', 'FORWARD', 'ADELANTE', 'NORMAL', 'CW', 'HORARIO']);
    const reverseValues = new Set(['REV', 'REVERSE', 'REVERSA', 'ATRAS', 'BACKWARD', 'CCW', 'ANTIHORARIO']);

    if (forwardValues.has(normalized)) return 'FWD';
    if (reverseValues.has(normalized)) return 'REV';
    return raw.toUpperCase();
}

function parseFlexibleNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    let normalized = String(value).trim().replace(/\s+/g, '');
    if (!normalized) return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        if (/^-?\d{1,3}(,\d{3})+$/.test(normalized)) {
            normalized = normalized.replace(/,/g, '');
        } else {
            normalized = normalized.replace(',', '.');
        }
    } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(normalized)) {
        normalized = normalized.replace(/\./g, '');
    }

    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundNumericValue(value, decimals = 2) {
    const numeric = parseFlexibleNumber(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** decimals;
    return Math.round(numeric * factor) / factor;
}

function toIsoDate(value) {
    if (value === undefined || value === null || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const date = new Date(excelEpoch.getTime() + (value * 86400000));
        return date.toISOString().slice(0, 10);
    }

    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const monthMap = {
        jan: 1, ene: 1,
        feb: 2,
        mar: 3,
        apr: 4, abr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8, ago: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12, dic: 12
    };

    const compact = raw.replace(/\//g, '-').replace(/\./g, '-').toLowerCase();

    let match = compact.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const yearNum = parseInt(match[3], 10);
        const year = match[3].length === 2 ? (yearNum >= 50 ? `19${match[3]}` : `20${match[3]}`) : `${yearNum}`;
        return `${year}-${month}-${day}`;
    }

    match = compact.match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthNum = monthMap[match[2]];
        if (!monthNum) return null;
        const month = String(monthNum).padStart(2, '0');
        const yearNum = parseInt(match[3], 10);
        const year = match[3].length === 2 ? (yearNum >= 50 ? `19${match[3]}` : `20${match[3]}`) : `${yearNum}`;
        return `${year}-${month}-${day}`;
    }

    return null;
}

function toIsoTime(value) {
    if (value === undefined || value === null || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const hours = String(value.getHours()).padStart(2, '0');
        const minutes = String(value.getMinutes()).padStart(2, '0');
        const seconds = String(value.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const totalSeconds = Math.round(value * 86400);
        const hours = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    let match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
        const hours = match[1].padStart(2, '0');
        const minutes = match[2];
        const seconds = match[3] || '00';
        return `${hours}:${minutes}:${seconds}`;
    }

    match = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const meridiem = match[3].toLowerCase();
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}:00`;
    }

    return null;
}

function excelColumnToIndex(columnLabel) {
    return String(columnLabel || '')
        .trim()
        .toUpperCase()
        .split('')
        .reduce((accumulator, character) => (accumulator * 26) + (character.charCodeAt(0) - 64), 0) - 1;
}

function getExcelCellValue(row, columnLabel) {
    const index = excelColumnToIndex(columnLabel);
    return Array.isArray(row) ? row[index] : undefined;
}

function getFirstNonEmptyValue(values = []) {
    for (const value of values) {
        if (value !== undefined && value !== null && `${value}`.trim() !== '') {
            return value;
        }
    }
    return undefined;
}

function collectExcelObservationText(row, startColumnLabel = 'EW') {
    if (!Array.isArray(row)) return undefined;

    const startIndex = excelColumnToIndex(startColumnLabel);
    return row
        .slice(startIndex)
        .map(value => value === undefined || value === null ? '' : String(value).trim())
        .filter(Boolean)
        .join(' | ');
}

function collectExcelObservationTextFromIndex(row, startIndex = 0) {
    if (!Array.isArray(row)) return undefined;

    return row
        .slice(startIndex)
        .map(value => value === undefined || value === null ? '' : String(value).trim())
        .filter(Boolean)
        .join(' | ');
}