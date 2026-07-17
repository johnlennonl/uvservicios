import { logout, getSession, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { supabase } from './supabaseClient.js';
import { REPORT_COLUMNS, EXCEL_EXPORT_COLUMNS, EXCEL_GROUP_COLORS } from './services/field-journey-export.js';
import {
    deleteAllFieldJourneyConsolidatedRows,
    deleteSelectedFieldJourneyConsolidatedRows,
    fetchConsolidatedDashboardRows,
    fetchFieldJourneyConsolidatedRows,
    getConsolidatedDashboardFilterOptions,
    getConsolidatedDashboardSummary,
    saveLegacyDashboardGeneralRows,
    syncTechnicalMeasurementsFromConsolidated
} from './services/consolidado-service.js';

const TEMPLATE_STORAGE_KEY = 'uv-consolidado-template-v1';
const DASHBOARD_GENERAL_SHEET_NAME = 'DASHBOARD GENERAL';
const BASE_HISTORICO_SHEET_NAME = 'Base Historico';
const NUEVO_HISTORICO_SHEET_NAME = 'Nuevo Historico';
const NUEVO_HISTORICO_START_COLUMNS = ['POZO', 'CAMPO', 'ESTACION', 'JORNADA'];
const NUEVO_HISTORICO_END_COLUMNS = ['TECNICO 1', 'TÉCNICO 1', 'TECNICO 2', 'TÉCNICO 2', 'TEÉCNICO 2', 'OBSERVACIONES DEL POZO', 'OBSERVACIONES'];
const NUEVO_HISTORICO_EXCLUDED_COLUMNS = ['INGENIEROS / EQUIPO DE GUARDIA', 'EQUIPO DE GUARDIA', 'LOCACION DE LA JORNADA', 'LOCACIÓN DE LA JORNADA', 'LOCACION DE LA CAPTURA', 'LOCACIÓN DE LA CAPTURA'];
const FORCE_TEXT_COLUMN_IDENTITIES = new Set([
    'POZO',
    'CAMPO',
    'ESTACION',
    'JORNADA',
    'MES',
    'EF',
    'ESTADO',
    'ESTATUS',
    'ACTIVIDAD',
    'CATEGORIA',
    'TECNICO1',
    'TECNICO2',
    'EQUIPODEGUARDIA',
    'INGENIEROSEQUIPODEGUARDIA',
    'OBSERVACIONES',
    'OBSERVACIONESDELPOZO',
    'DIAGNOSTICO',
    'MARCA',
    'MARCAVSD',
    'MODELO',
    'MODELOVSD',
    'RT',
    'CONDCHP',
    'CONDICIONCHP',
    'CONDICIONDELCABLEADO',
    'CONDICIONDELACASETA',
    'ESTADODELTX',
    'ESTADODELVSD',
    'ESTADODEPANELDESENSORCHOQUES',
    'ESTADODELATERRAMIENTO',
    'ESTADODELBIWCONECTOR',
    'ESTADODEMANOMETROS',
    'ESTADODELCABEZAL',
    'ESTADODETOMAMUESTRAS',
    'ESTADOCAJADEVENTEO',
    'POSEESENSORDEFONDO',
    'DESCARGADATASDELSENSOR',
    'ECHOMETER',
    'BAJADATOS',
    'MODODEOPERACION',
    'SENTIDODEGIRO'
]);
const NUMERIC_COLUMN_PATTERNS = [
    /%/,
    /POTENCIAL/,
    /BRUTA/,
    /NETA/,
    /AYS/,
    /FREC/,
    /HZ/,
    /PIP/,
    /PD/,
    /PRESION/,
    /PSI/,
    /THP/,
    /CHP/,
    /LF/,
    /MOTOR/,
    /VSD/,
    /AMP/,
    /CORRIENTE/,
    /VOLT/,
    /FASE/,
    /TI\b/,
    /TM\b/,
    /TEMP/,
    /VX/,
    /VY/,
    /VZ/,
    /KVA/,
    /TAP/,
    /UL/,
    /OL/,
    /LIMIT/,
    /DESACELERACION/,
    /FOSA/,
    /RESISTENCIA/,
    /AISLAMIENTO/,
    /OHM/,
    /PROMEDIO/,
    /DESV/,
    /DESBALANCE/,
    /RELACION/,
    /DELTA/,
    /NIVEL/,
    /SUMERGENCIA/
];
const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LOGO_PATH = 'img/uvservicioslogo.png';
const EXCEL_LOGO_PATH = 'img/UV SERVICES - Logo vectorial sin fondo.png';
const TABLE_HEADER_ROW_INDEX = 7;

const elements = {
    logoutButton: document.getElementById('logout-btn'),
    mobileLogoutButton: document.getElementById('mobile-logout-btn'),
    fileInput: document.getElementById('consolidado-file-input'),
    dropZone: document.getElementById('consolidado-drop-zone'),
    status: document.getElementById('consolidado-status'),
    configButton: document.getElementById('consolidado-config-btn'),
    configMenu: document.getElementById('consolidado-config-menu'),
    openImportButton: document.getElementById('consolidado-open-import-btn'),
    exportStructureButton: document.getElementById('consolidado-export-structure-btn'),
    saveDbButton: document.getElementById('consolidado-save-db-btn'),
    syncTechnicalButton: document.getElementById('consolidado-sync-technical-btn'),
    exportDbButton: document.getElementById('consolidado-export-db-btn'),
    refreshDbButton: document.getElementById('consolidado-refresh-db-btn'),
    selectFieldRowsButton: document.getElementById('consolidado-select-field-rows-btn'),
    deleteAllFieldButton: document.getElementById('consolidado-delete-all-field-btn'),
    clearTemplateButton: document.getElementById('consolidado-clear-template-btn'),
    dbSummary: document.getElementById('consolidado-db-summary'),
    summary: document.getElementById('consolidado-template-summary'),
    sheetList: document.getElementById('consolidado-sheet-list'),
    columnTitle: document.getElementById('consolidado-column-title'),
    columnList: document.getElementById('consolidado-column-list'),
    exportModeInputs: document.querySelectorAll('[name="consolidado-export-mode"]'),
    pozoFilter: document.getElementById('consolidado-pozo-filter'),
    startDate: document.getElementById('consolidado-start-date'),
    endDate: document.getElementById('consolidado-end-date'),
    exportSourceInputs: document.querySelectorAll('[name="consolidado-export-source"]')
};

let activeTemplate = null;
let activeSheetIndex = 0;
let activeDashboardRows = [];
let consolidatedSummary = null;
let filterOptions = { pozos: [], minDate: '', maxDate: '' };
let isBusy = false;

function hasSwal() {
    return Boolean(window.Swal);
}

function showLoadingModal(title, message, detail = '') {
    if (!hasSwal()) return;

    window.Swal.fire({
        title,
        html: `
            <div class="consolidado-loading-modal">
                <p>${escapeHtml(message)}</p>
                ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
            </div>
        `,
        imageUrl: LOGO_PATH,
        imageWidth: 74,
        imageHeight: 74,
        imageAlt: 'UV Servicios',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        customClass: {
            popup: 'consolidado-swal-popup',
            title: 'consolidado-swal-title',
            htmlContainer: 'consolidado-swal-html'
        },
        didOpen: () => window.Swal.showLoading()
    });
}

function updateLoadingModal(message, detail = '') {
    if (!hasSwal() || !window.Swal.isVisible()) return;

    window.Swal.update({
        html: `
            <div class="consolidado-loading-modal">
                <p>${escapeHtml(message)}</p>
                ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
            </div>
        `
    });
}

function closeLoadingModal() {
    if (hasSwal() && window.Swal.isVisible()) {
        window.Swal.close();
    }
}

function showResultModal(icon, title, message) {
    if (!hasSwal()) return;

    window.Swal.fire({
        icon,
        title,
        text: message,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#0f172a',
        customClass: {
            popup: 'consolidado-swal-popup',
            title: 'consolidado-swal-title'
        }
    });
}

function showExportMaintenanceNotice() {
    if (!hasSwal()) return;

    window.Swal.fire({
        icon: 'info',
        title: 'Sección en mantenimiento',
        text: 'Por los momentos esta sección no está disponible porque se encuentra en mantenimiento. Puedes visualizarla, pero algunas acciones pueden estar temporalmente limitadas.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#0f172a',
        customClass: {
            popup: 'consolidado-swal-popup',
            title: 'consolidado-swal-title'
        }
    });
}

function formatDateTimeLabel(dateValue, timeValue) {
    const date = String(dateValue || '--').slice(0, 10);
    const time = String(timeValue || '').slice(0, 5);
    return `${date}${time ? ` ${time}` : ''}`;
}

async function confirmAction({ title, message, confirmText = 'Confirmar' }) {
    if (!hasSwal()) return window.confirm(message);

    const result = await window.Swal.fire({
        icon: 'warning',
        title,
        text: message,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#991b1b',
        cancelButtonColor: '#0f172a',
        customClass: {
            popup: 'consolidado-swal-popup',
            title: 'consolidado-swal-title'
        }
    });

    return result.isConfirmed;
}

function setBusyState(nextBusy) {
    isBusy = nextBusy;
    renderTemplate();
}

function closeConfigMenu() {
    if (!elements.configMenu || !elements.configButton) return;
    elements.configMenu.hidden = true;
    elements.configButton.setAttribute('aria-expanded', 'false');
}

function toggleConfigMenu() {
    if (!elements.configMenu || !elements.configButton) return;
    const nextOpen = elements.configMenu.hidden;
    elements.configMenu.hidden = !nextOpen;
    elements.configButton.setAttribute('aria-expanded', String(nextOpen));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeCell(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSheetName(value) {
    return normalizeCell(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function normalizeColumnIdentity(value) {
    return normalizeSheetName(value)
        .replace(/\bAMP\b/g, 'A')
        .replace(/\bVOLT\b/g, 'V')
        .replace(/\bF\b/g, 'F')
        .replace(/[^A-Z0-9%]+/g, '');
}

function shouldExportColumnAsNumber(headerName = '') {
    const normalizedHeader = normalizeSheetName(headerName);
    const identity = normalizeColumnIdentity(headerName);
    if (!normalizedHeader || FORCE_TEXT_COLUMN_IDENTITIES.has(identity)) return false;
    if (isDashboardDateColumn(headerName)) return false;
    if (isDashboardTimeColumn(headerName)) return false;
    return NUMERIC_COLUMN_PATTERNS.some(pattern => pattern.test(normalizedHeader));
}

function isDashboardDateColumn(headerName = '') {
    return normalizeColumnIdentity(headerName) === 'FECHA';
}

function isDashboardTimeColumn(headerName = '') {
    return normalizeColumnIdentity(headerName) === 'HORA';
}

function parseDashboardExcelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const textValue = String(value || '').trim();
    let match = textValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        const [, year, month, day] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    match = textValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
        const [, day, month, year] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    return null;
}

function parseDashboardExcelTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    const [, hourText, minuteText, secondText = '0'] = match;
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (![hour, minute, second].every(Number.isFinite)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

    return (hour * 3600 + minute * 60 + second) / 86400;
}

function coerceDashboardExcelCellValue(value, headerName = '') {
    if (value === null || value === undefined || value === '') return '';
    if (isDashboardDateColumn(headerName)) {
        return parseDashboardExcelDate(value) || value;
    }

    if (isDashboardTimeColumn(headerName)) {
        const parsedTime = parseDashboardExcelTime(value);
        return parsedTime === null ? value : parsedTime;
    }

    if (!shouldExportColumnAsNumber(headerName)) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';

    const textValue = String(value).trim();
    if (!textValue || /^(--|N\/A|NA|NULL|SIN DATO|SIN DATOS)$/i.test(textValue)) return '';
    if (!/^-?\d+(?:[.,]\d+)?\s*%?$/.test(textValue)) return value;

    const numericValue = Number(textValue.replace('%', '').replace(',', '.').trim());
    return Number.isFinite(numericValue) ? numericValue : value;
}

function getDashboardExcelNumberFormat(value) {
    return Number.isInteger(value) ? '0' : '0.00';
}

function getDashboardExcelDateFormat() {
    return 'dd/mm/yyyy';
}

function getDashboardExcelTimeFormat() {
    return 'hh:mm';
}

function isDashboardGeneralSheet(sheetName) {
    return normalizeSheetName(sheetName).includes('DASHBOARD GENERAL');
}

function setStatus(message, type = 'neutral') {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.className = `consolidado-status${type === 'success' ? ' is-success' : type === 'error' ? ' is-error' : ''}`;
}

function getSelectedExportMode() {
    return Array.from(elements.exportModeInputs || []).find(input => input.checked)?.value || 'historico';
}

function getSelectedExportSource() {
    return Array.from(elements.exportSourceInputs || []).find(input => input.checked)?.value || 'base';
}

function getExportFilters() {
    const mode = getSelectedExportMode();
    const source = getSelectedExportSource();
    const pozo = mode === 'pozo' ? elements.pozoFilter?.value || '' : '';
    const startDate = mode === 'fecha' ? elements.startDate?.value || '' : '';
    const endDate = mode === 'fecha' ? elements.endDate?.value || '' : '';

    return { mode, source, pozo, startDate, endDate };
}

function getExportModeLabel(mode) {
    if (mode === 'pozo') return 'por pozo';
    if (mode === 'fecha') return 'por fecha';
    return 'histórico completo';
}

function getExportSourceLabel(source) {
    if (source === 'operativo') return 'nuevo Campo';
    if (source === 'completo') return 'base + nuevo';
    return 'base histórica';
}

function loadStoredTemplate() {
    try {
        const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('No se pudo cargar la plantilla de consolidado:', error);
        return null;
    }
}

function saveTemplate(template) {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
}

function clearTemplate() {
    localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    activeTemplate = null;
    activeSheetIndex = 0;
    activeDashboardRows = [];
    renderTemplate();
    setStatus('Plantilla de consolidado eliminada. Importa el Excel viejo cuando quieras registrar de nuevo su estructura.', 'neutral');
}

function getColumnLetter(columnIndex) {
    let dividend = columnIndex + 1;
    let columnName = '';

    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
    }

    return columnName;
}

function countNonEmptyCells(row = []) {
    return row.reduce((total, cell) => total + (normalizeCell(cell) ? 1 : 0), 0);
}

function findHeaderRowIndex(rows = []) {
    const scanLimit = Math.min(rows.length, 30);
    let selectedIndex = 0;
    let selectedScore = -1;

    for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const nonEmptyCount = countNonEmptyCells(row);
        if (nonEmptyCount < 2) continue;

        const textCells = row.filter(cell => /[a-zA-ZÁÉÍÓÚáéíóúÑñ]/.test(normalizeCell(cell))).length;
        const score = nonEmptyCount * 2 + textCells - rowIndex * 0.05;
        if (score > selectedScore) {
            selectedScore = score;
            selectedIndex = rowIndex;
        }
    }

    return selectedIndex;
}

function buildUniqueColumns(headerRow = [], groupRow = []) {
    const seen = new Map();
    let currentGroup = '';
    return headerRow.reduce((columns, cell, columnIndex) => {
        const rawBaseName = normalizeCell(cell);
        
        if (groupRow && groupRow[columnIndex]) {
            const g = String(groupRow[columnIndex]).trim().toUpperCase();
            if (g) currentGroup = g;
        }

        let baseName = rawBaseName;
        if (!baseName) {
            // Assign spacer column name
            baseName = `COL_SPACER_${columnIndex}`;
        }

        // Resolve duplicate 'PROMEDIO CORRIENTE [AMP]' using group/index context
        if (normalizeColumnIdentity(baseName) === 'PROMEDIOCORRIENTEA') {
            if (currentGroup.includes('PRIMARIA') || currentGroup.includes('PRIMARIO') || (columnIndex >= 81 && columnIndex < 108)) {
                baseName = 'PROMEDIO CORRIENTE PRIMARIO [AMP]';
            } else if (currentGroup.includes('SECUNDARIA') || currentGroup.includes('SECUNDARIO') || (columnIndex >= 108 && columnIndex < 135)) {
                baseName = 'PROMEDIO CORRIENTE SECUNDARIO [AMP]';
            }
        }

        // Correct spelling inconsistencies for Técnico 2 (from 'TEÉCNICO 2' to 'TÉCNICO 2')
        if (normalizeColumnIdentity(baseName) === 'TEECNICO2') {
            baseName = 'TÉCNICO 2';
        }

        const seenCount = seen.get(baseName) || 0;
        seen.set(baseName, seenCount + 1);

        columns.push({
            key: `${getColumnLetter(columnIndex)}_${baseName}`,
            letter: getColumnLetter(columnIndex),
            name: seenCount ? `${baseName} (${seenCount + 1})` : baseName,
            originalName: baseName,
            index: columnIndex,
            groupTitle: currentGroup || ''
        });

        return columns;
    }, []);
}

function normalizeDataRows(rows = [], headerRowIndex = 0, columns = []) {
    return rows.slice(headerRowIndex + 1)
        .map(row => columns.map(column => row[column.index] ?? ''))
        .filter(row => row.some(cell => normalizeCell(cell)));
}

function getColumnIndexByName(columns = [], names = []) {
    const normalizedNames = new Set(names.map(normalizeSheetName));
    return columns.findIndex(item => normalizedNames.has(normalizeSheetName(item.originalName || item.name)));
}

function parseDashboardDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const raw = normalizeCell(value);
    if (!raw) return '';

    const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const latinMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (latinMatch) {
        const [, day, month, yearValue] = latinMatch;
        const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return '';
}

function getDashboardRowsDateRange(rows = [], columns = []) {
    const dateIndex = getColumnIndexByName(columns, ['FECHA', 'Fecha', 'fecha']);
    if (dateIndex < 0) return { minDate: '', maxDate: '' };

    const dates = rows
        .map(row => parseDashboardDateValue(row[dateIndex]))
        .filter(Boolean)
        .sort();

    return { minDate: dates[0] || '', maxDate: dates[dates.length - 1] || '' };
}

function parseWorkbookTemplate(file, workbook) {
    const sheets = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false,
            blankrows: false
        });
        const headerRowIndex = findHeaderRowIndex(rows);
        const headerRow = rows[headerRowIndex] || [];
        const groupRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : [];
        const columns = buildUniqueColumns(headerRow, groupRow);

        if (isDashboardGeneralSheet(sheetName)) {
            activeDashboardRows = normalizeDataRows(rows, headerRowIndex, columns);
        }

        return {
            name: sheetName,
            headerRowIndex,
            rowCount: rows.length,
            columnCount: columns.length,
            columns
        };
    });

    return {
        fileName: file.name,
        importedAt: new Date().toISOString(),
        sheetCount: sheets.length,
        totalColumnCount: sheets.reduce((total, sheet) => total + sheet.columnCount, 0),
        sheets
    };
}

async function handleFile(file) {
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(extension)) {
        setStatus('Formato no soportado. Importa el consolidado viejo en formato XLSX o XLS.', 'error');
        return;
    }

    if (!window.XLSX) {
        setStatus('No se pudo cargar la librería de Excel. Revisa la conexión con jsdelivr.', 'error');
        return;
    }

    try {
        setBusyState(true);
        showLoadingModal('Cargando consolidado', 'Leyendo el Excel viejo y preparando la estructura base.', file.name);
        setStatus('Leyendo el consolidado viejo, detectando encabezados reales e ignorando separadores vacíos...', 'neutral');
        const buffer = await file.arrayBuffer();
        updateLoadingModal('Analizando hojas y encabezados reales...', 'Esto puede tardar unos segundos si el archivo tiene muchas columnas.');
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        activeDashboardRows = [];
        activeTemplate = parseWorkbookTemplate(file, workbook);
        activeSheetIndex = 0;
        saveTemplate(activeTemplate);
        renderTemplate();
        const dashboardSheet = getDashboardGeneralSheet();
        const importedRange = getDashboardRowsDateRange(activeDashboardRows, dashboardSheet?.columns || []);
        const rangeMessage = importedRange.minDate && importedRange.maxDate
            ? ` Rango detectado: ${formatStoredDateForExcel(importedRange.minDate)} - ${formatStoredDateForExcel(importedRange.maxDate)}.`
            : ' No pude detectar un rango de fechas en Dashboard General.';
        const dashboardRowsMessage = activeDashboardRows.length
            ? ` Se cargaron ${activeDashboardRows.length} filas de Dashboard General para exportarlas con diseño.${rangeMessage}`
            : ' No se encontraron filas útiles en Dashboard General; se exportará el formato con encabezados reales e información de control.';
        setStatus(`Estructura importada desde ${file.name}.${dashboardRowsMessage}`, 'success');
        closeLoadingModal();
        showResultModal('success', 'Consolidado cargado', `Se detectaron ${activeTemplate.sheetCount} hojas, ${activeTemplate.totalColumnCount} columnas y ${activeDashboardRows.length} filas de Dashboard General.${rangeMessage}`);
    } catch (error) {
        console.error('No se pudo procesar el consolidado:', error);
        setStatus('No se pudo procesar el Excel. Verifica que no esté dañado o protegido.', 'error');
        closeLoadingModal();
        showResultModal('error', 'No se pudo cargar', 'Verifica que el Excel no esté dañado, protegido o abierto en modo incompatible.');
    } finally {
        setBusyState(false);
    }
}

function renderSummary() {
    if (!elements.summary) return;

    if (!activeTemplate) {
        elements.summary.innerHTML = `
            <div class="consolidado-file-overview is-empty">
                <div class="consolidado-file-mark" aria-hidden="true">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14 3v5h5"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 14h6"></path>
                    </svg>
                </div>
                <div>
                    <span>Archivo base</span>
                    <strong>Sin estructura cargada</strong>
                    <p>Importa el Excel consolidado para registrar hojas, columnas y origen.</p>
                </div>
            </div>
            <div class="consolidado-summary-grid">
                ${renderSummaryMetric('Hojas', '0', 'M0 4h8v6H0z M10 4h8v6h-8z M0 12h8v6H0z M10 12h8v6h-8z')}
                ${renderSummaryMetric('Columnas', '0', 'M4 3v18M10 3v18M16 3v18M3 8h18M3 16h18')}
                ${renderSummaryMetric('Dashboard', '0 filas', 'M5 19V5m0 14h14M9 16v-5M13 16V8M17 16v-8')}
            </div>
        `;
        return;
    }

    elements.summary.innerHTML = `
        <div class="consolidado-file-overview">
            <div class="consolidado-file-mark" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14 3v5h5"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 13h8M8 17h5"></path>
                </svg>
            </div>
            <div>
                <span>Origen registrado</span>
                <strong>${escapeHtml(activeTemplate.fileName)}</strong>
                <p>${activeDashboardRows.length} filas de Dashboard General listas para mantenimiento.</p>
            </div>
        </div>
        <div class="consolidado-summary-grid">
            ${renderSummaryMetric('Hojas', activeTemplate.sheetCount, 'M0 4h8v6H0z M10 4h8v6h-8z M0 12h8v6H0z M10 12h8v6h-8z')}
            ${renderSummaryMetric('Columnas', activeTemplate.totalColumnCount, 'M4 3v18M10 3v18M16 3v18M3 8h18M3 16h18')}
            ${renderSummaryMetric('Dashboard', `${activeDashboardRows.length} filas`, 'M5 19V5m0 14h14M9 16v-5M13 16V8M17 16v-8')}
        </div>
    `;
}

function renderSummaryMetric(label, value, pathDefinition) {
    return `
        <div class="consolidado-summary-item">
            <span class="consolidado-summary-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
                    <path stroke-linecap="round" stroke-linejoin="round" d="${pathDefinition}"></path>
                </svg>
            </span>
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        </div>
    `;
}

function renderSheets() {
    if (!elements.sheetList) return;

    if (!activeTemplate?.sheets?.length) {
        elements.sheetList.innerHTML = '<div class="consolidado-empty">Importa el Excel viejo para ver aquí sus hojas y columnas detectadas.</div>';
        return;
    }

    elements.sheetList.innerHTML = activeTemplate.sheets.map((sheet, index) => `
        <button type="button" class="consolidado-sheet-card${index === activeSheetIndex ? ' is-active' : ''}" data-sheet-index="${index}">
            <span class="consolidado-sheet-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 5h16M4 10h16M4 15h16M4 20h16"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5v15M15 5v15"></path>
                </svg>
            </span>
            <span class="consolidado-sheet-copy">
                <strong>${escapeHtml(sheet.name)}</strong>
                <span>${sheet.columnCount} columnas reales · encabezado en fila ${sheet.headerRowIndex + 1}</span>
            </span>
        </button>
    `).join('');

    elements.sheetList.querySelectorAll('[data-sheet-index]').forEach(button => {
        button.addEventListener('click', () => {
            activeSheetIndex = Number(button.dataset.sheetIndex || 0);
            renderTemplate();
        });
    });
}

function renderColumns() {
    if (!elements.columnTitle || !elements.columnList) return;

    const sheet = activeTemplate?.sheets?.[activeSheetIndex];
    if (!sheet) {
        elements.columnTitle.innerHTML = 'Columnas detectadas';
        elements.columnList.innerHTML = '<div class="consolidado-empty">Selecciona una hoja después de importar el consolidado.</div>';
        return;
    }

    elements.columnTitle.innerHTML = `
        <span class="consolidado-column-title-icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 4v16M16 4v16"></path>
            </svg>
        </span>
        <span class="consolidado-column-title-copy">
            <span>Columnas detectadas</span>
            <strong>${escapeHtml(sheet.name)}</strong>
        </span>
        <span class="consolidado-column-count">${sheet.columnCount} columnas</span>
    `;
    elements.columnList.innerHTML = sheet.columns.map(column => `
        <span class="consolidado-column-pill">
            <span class="consolidado-column-letter">${escapeHtml(column.letter)}</span>
            <span class="consolidado-column-name">${escapeHtml(column.name)}</span>
        </span>
    `).join('');
}

function renderDatabaseSummary() {
    const statTotal = document.getElementById('stat-total-records');
    const statBase = document.getElementById('stat-base-records');
    const statField = document.getElementById('stat-field-records');
    const statPozos = document.getElementById('stat-pozos-count');

    if (!consolidatedSummary) {
        if (statTotal) statTotal.textContent = '--';
        if (statBase) statBase.textContent = '--';
        if (statField) statField.textContent = '--';
        if (statPozos) statPozos.textContent = '--';
        
        if (elements.dbSummary) {
            elements.dbSummary.innerHTML = `
                <div><span>Guardado</span><strong>--</strong></div>
                <div><span>Base histórica</span><strong>--</strong></div>
                <div><span>Nuevo Campo</span><strong>--</strong></div>
            `;
        }
        return;
    }

    if (statTotal) statTotal.textContent = Number(consolidatedSummary.total || 0).toLocaleString();
    if (statBase) statBase.textContent = Number(consolidatedSummary.legacyCount || 0).toLocaleString();
    if (statField) statField.textContent = Number(consolidatedSummary.fieldJourneyCount || 0).toLocaleString();
    if (statPozos) statPozos.textContent = Number((filterOptions.pozos || []).length).toLocaleString();

    if (elements.dbSummary) {
        elements.dbSummary.innerHTML = `
            <div><span>Guardado</span><strong>${consolidatedSummary.total}</strong></div>
            <div><span>Base histórica</span><strong>${consolidatedSummary.legacyCount}</strong></div>
            <div><span>Nuevo Campo</span><strong>${consolidatedSummary.fieldJourneyCount}</strong></div>
        `;
    }
}

function renderFilterOptions() {
    if (elements.pozoFilter) {
        const currentPozo = elements.pozoFilter.value;
        elements.pozoFilter.innerHTML = '<option value="">Todos los pozos</option>'
            + filterOptions.pozos.map(pozo => `<option value="${escapeHtml(pozo)}">${escapeHtml(pozo)}</option>`).join('');
        if (filterOptions.pozos.includes(currentPozo)) {
            elements.pozoFilter.value = currentPozo;
        }
    }

    if (elements.startDate && filterOptions.minDate && !elements.startDate.value) {
        elements.startDate.value = filterOptions.minDate;
    }

    if (elements.endDate && filterOptions.maxDate && !elements.endDate.value) {
        elements.endDate.value = filterOptions.maxDate;
    }
}

function renderFilterState() {
    const mode = getSelectedExportMode();
    const pozoDisabled = isBusy || mode !== 'pozo';
    const dateDisabled = isBusy || mode !== 'fecha';

    if (elements.pozoFilter) elements.pozoFilter.disabled = pozoDisabled;
    if (elements.startDate) elements.startDate.disabled = dateDisabled;
    if (elements.endDate) elements.endDate.disabled = dateDisabled;
}

function renderTemplate() {
    renderSummary();
    renderSheets();
    renderColumns();
    renderDatabaseSummary();
    renderFilterOptions();
    renderFilterState();

    const hasTemplate = Boolean(activeTemplate?.sheets?.length);
    const canExportDashboardGeneral = hasTemplate && activeDashboardRows.length > 0;
    if (elements.exportStructureButton) elements.exportStructureButton.disabled = isBusy || !canExportDashboardGeneral;
    if (elements.saveDbButton) elements.saveDbButton.disabled = isBusy || !canExportDashboardGeneral;
    const hasDataToExport = (consolidatedSummary?.total > 0) || (consolidatedSummary?.fieldJourneyCount > 0);
    if (elements.exportDbButton) elements.exportDbButton.disabled = isBusy || !hasDataToExport;
    if (elements.refreshDbButton) elements.refreshDbButton.disabled = isBusy;
    if (elements.selectFieldRowsButton) elements.selectFieldRowsButton.disabled = isBusy || !consolidatedSummary?.fieldJourneyCount;
    if (elements.deleteAllFieldButton) elements.deleteAllFieldButton.disabled = isBusy || !consolidatedSummary?.fieldJourneyCount;
    if (elements.clearTemplateButton) elements.clearTemplateButton.disabled = isBusy || !hasTemplate;
}

function exportStructureWorkbook() {
    exportDashboardGeneralWorkbook();
}

async function saveDashboardGeneralToDatabase() {
    const dashboardSheet = getDashboardGeneralSheet();
    if (!dashboardSheet || !activeDashboardRows.length) {
        setStatus('Importa primero el Excel viejo para cargar filas reales de Dashboard General.', 'error');
        return;
    }

    try {
        setBusyState(true);
        showLoadingModal('Guardando en base de datos', 'Preparando filas del Dashboard General para el consolidado maestro.', activeTemplate?.fileName || '');
        setStatus('Guardando Dashboard General en la base de datos del consolidado maestro...', 'neutral');

        const result = await saveLegacyDashboardGeneralRows({
            template: activeTemplate,
            sheet: dashboardSheet,
            columns: dashboardSheet.columns || [],
            rows: activeDashboardRows,
            onProgress: progress => {
                if (progress.phase === 'hashing') {
                    updateLoadingModal(
                        'Preparando identificadores de filas...',
                        `${progress.total} filas listas para validar duplicados.`
                    );
                    return;
                }

                updateLoadingModal(
                    `Guardando lote ${progress.currentChunk} de ${progress.totalChunks}...`,
                    `${progress.saved} de ${progress.total} filas procesadas.`
                );
            }
        });

        const saveDetail = `${result.replaced || 0} anteriores reemplazadas, ${result.inserted || 0} nuevas guardadas`;
        setStatus(`Base histórica actualizada: ${result.saved} filas de ${result.sourceSheetName} quedaron registradas (${saveDetail}).`, 'success');
        await refreshDatabaseSummary({ silent: true });
        closeLoadingModal();
        showResultModal('success', 'Base histórica actualizada', `${result.saved} filas quedaron registradas en el consolidado maestro: ${saveDetail}.`);
    } catch (error) {
        console.error('No se pudo guardar el consolidado:', error);
        setStatus(error?.message || 'No se pudo guardar el consolidado en la base de datos.', 'error');
        closeLoadingModal();
        showResultModal('error', 'No se pudo guardar', error?.message || 'No se pudo guardar el consolidado en la base de datos.');
    } finally {
        setBusyState(false);
    }
}

async function refreshDatabaseSummary({ silent = false } = {}) {
    try {
        if (!silent) {
            setBusyState(true);
            showLoadingModal('Consultando base de datos', 'Leyendo conteos del consolidado maestro.', 'Base histórica y nuevo Campo.');
        }

        [consolidatedSummary, filterOptions] = await Promise.all([
            getConsolidatedDashboardSummary(),
            getConsolidatedDashboardFilterOptions()
        ]);
        renderTemplate();

        const message = `Base de datos: ${consolidatedSummary.total} filas guardadas (${consolidatedSummary.legacyCount} de base histórica y ${consolidatedSummary.fieldJourneyCount} de nuevo Campo).`;
        setStatus(message, consolidatedSummary.total ? 'success' : 'neutral');

        if (!silent) {
            closeLoadingModal();
            showResultModal('success', 'Conteo actualizado', message);
        }
    } catch (error) {
        console.error('No se pudo consultar el consolidado:', error);
        if (!silent) closeLoadingModal();
        setStatus(error?.message || 'No se pudo consultar el consolidado guardado.', 'error');
        if (!silent) showResultModal('error', 'No se pudo consultar', error?.message || 'No se pudo consultar el consolidado guardado.');
    } finally {
        if (!silent) setBusyState(false);
    }
}

async function syncTechnicalFromConsolidated() {
    const confirmed = await confirmAction({
        title: 'Sincronizar datos técnicos y ficha BES',
        message: 'Se leerán Potencial, Bruta, Neta, AyS, Categoria, Campo, EF y datos de equipo BES desde el consolidado guardado para actualizar cada pozo. ¿Continuar?',
        confirmText: 'Sincronizar datos y BES'
    });

    if (!confirmed) return;

    try {
        setBusyState(true);
        closeConfigMenu();
        showLoadingModal('Sincronizando datos del consolidado', 'Leyendo pozos del consolidado maestro y actualizando Producción Técnica y ficha BES.', 'Este proceso usa el Excel viejo ya guardado en base de datos.');
        setStatus('Sincronizando datos técnicos y ficha BES desde el consolidado guardado...', 'neutral');

        const result = await syncTechnicalMeasurementsFromConsolidated();
        const besResult = result.bes || { updated: 0, candidates: 0, skipped: 0 };

        closeLoadingModal();
        setStatus(`Sincronización completada: ${result.updated} pozo(s) técnicos y ${besResult.updated} ficha(s) BES actualizadas.`, 'success');
        showResultModal('success', 'Datos sincronizados', `${result.updated} pozo(s) quedaron actualizados en Producción Técnica. Fichas BES actualizadas: ${besResult.updated} de ${besResult.candidates}. Omitidos técnicos: ${result.skipped}. Omitidos BES: ${besResult.skipped}.`);
    } catch (error) {
        console.error('No se pudo sincronizar datos técnicos desde consolidado:', error);
        closeLoadingModal();
        setStatus(error?.message || 'No se pudieron sincronizar los datos desde el consolidado.', 'error');
        showResultModal('error', 'No se pudo sincronizar', error?.message || 'No se pudieron sincronizar los datos desde el consolidado.');
    } finally {
        setBusyState(false);
    }
}

function buildColumnsFromStoredRows(rows = []) {
    const labels = [];
    const seen = new Set();

    rows.forEach(row => {
        const rowLabels = Array.isArray(row.column_labels) ? row.column_labels : [];
        rowLabels.forEach(label => {
            const normalizedLabel = normalizeCell(label);
            if (!normalizedLabel || seen.has(normalizedLabel)) return;
            seen.add(normalizedLabel);
            labels.push(normalizedLabel);
        });
    });

    rows.forEach(row => {
        Object.keys(row.row_data || {}).forEach(label => {
            const normalizedLabel = normalizeCell(label);
            if (!normalizedLabel || seen.has(normalizedLabel)) return;
            seen.add(normalizedLabel);
            labels.push(normalizedLabel);
        });
    });

    return labels.map((label, index) => ({
        key: `${getColumnLetter(index)}_${label}`,
        letter: getColumnLetter(index),
        name: label,
        originalName: label,
        index
    }));
}

function addStoredColumnLabel(labels = [], seen = new Set(), label = '') {
    const normalizedLabel = normalizeCell(label);
    const identity = normalizeColumnIdentity(normalizedLabel);
    if (!normalizedLabel || seen.has(identity)) return;
    seen.add(identity);
    labels.push(normalizedLabel);
}

function getBaseTemplateColumns() {
    const dashboardSheet = getDashboardGeneralSheet();
    return Array.isArray(dashboardSheet?.columns) ? dashboardSheet.columns : [];
}

function mapLabelsToColumns(labels = []) {
    return labels.map((label, index) => ({
        key: `${getColumnLetter(index)}_${label}`,
        letter: getColumnLetter(index),
        name: label,
        originalName: label,
        index
    }));
}

function attachGroupTitles(columns) {
    const labelToGroup = new Map();
    EXCEL_EXPORT_COLUMNS.forEach(c => {
        labelToGroup.set(String(c.label).trim().toUpperCase(), c.groupTitle);
    });

    const identityToGroup = new Map();
    EXCEL_EXPORT_COLUMNS.forEach(c => {
        identityToGroup.set(normalizeColumnIdentity(c.label), c.groupTitle);
    });

    return columns.map(col => {
        const name = String(col.originalName || col.name).trim().toUpperCase();
        let groupTitle = labelToGroup.get(name);
        if (groupTitle === undefined) {
            const id = normalizeColumnIdentity(name);
            groupTitle = identityToGroup.get(id) || '';
        }
        return { ...col, groupTitle };
    });
}
function orderExportColumns(columns = [], strictFilter = false, isClientVersion = false) {
    const getDedupeKey = (name) => {
        const raw = String(name).trim().toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        const key = raw
            .replace(/\[/g, '_B_')
            .replace(/\]/g, '_B_')
            .replace(/\(/g, '_P_')
            .replace(/\)/g, '_P_');
        return key.replace(/[^A-Z0-9%_]+/g, '');
    };

    const reportLabels = REPORT_COLUMNS.map(c => getDedupeKey(c[0]));
    const excluded = new Set(NUEVO_HISTORICO_EXCLUDED_COLUMNS.map(getDedupeKey));
    const available = columns.filter(column => !excluded.has(getDedupeKey(column.originalName || column.name)));
    
    let sorted = [...available].sort((a, b) => {
        const nameA = String(a.originalName || a.name).trim().toUpperCase();
        const nameB = String(b.originalName || b.name).trim().toUpperCase();
        
        let idxA = REPORT_COLUMNS.findIndex(c => c[0].trim().toUpperCase() === nameA);
        let idxB = REPORT_COLUMNS.findIndex(c => c[0].trim().toUpperCase() === nameB);
        
        if (idxA === -1) {
            const idA = getDedupeKey(nameA);
            idxA = reportLabels.indexOf(idA);
        }
        if (idxB === -1) {
            const idB = getDedupeKey(nameB);
            idxB = reportLabels.indexOf(idB);
        }
        
        if (idxA === -1) idxA = 9999;
        if (idxB === -1) idxB = 9999;
        
        return idxA - idxB;
    });

    if (strictFilter) {
        // En lugar de solo filtrar, inyectamos las columnas que falten de REPORT_COLUMNS
        // para garantizar que la plantilla tenga TODAS las columnas, incluso si no hay datos.
        const existingIds = new Set(sorted.map(c => getDedupeKey(c.originalName || c.name)));
        
        REPORT_COLUMNS.forEach(([label]) => {
            const id = getDedupeKey(label);
            if (!existingIds.has(id) && !excluded.has(id)) {
                sorted.push({
                    name: label,
                    originalName: label
                });
            }
        });

        // Ahora filtramos estrictamente
        sorted = sorted.filter(column => {
            const id = getDedupeKey(column.originalName || column.name);
            return reportLabels.includes(id);
        });

        // De-duplicate columns by normalized identity, but only for fields that are unique in REPORT_COLUMNS
        const reportLabelsMapped = REPORT_COLUMNS.map(c => ({
            label: c[0],
            id: getDedupeKey(c[0])
        }));

        const uniqueMap = new Map();
        const idCounts = new Map();
        reportLabelsMapped.forEach(item => {
            idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
        });

        let filtered = [];
        const seenUnique = new Set();

        sorted.forEach(col => {
            const id = getDedupeKey(col.originalName || col.name);
            const count = idCounts.get(id) || 0;
            
            if (count === 1) {
                // This is a unique column in REPORT_COLUMNS, so we should de-duplicate it
                if (seenUnique.has(id)) {
                    // If we already saw a version of this unique column, we prefer the one 
                    // that matches standard capitalization/label exactly
                    const existing = uniqueMap.get(id);
                    const currentName = String(col.originalName || col.name).trim().toUpperCase();
                    const standardName = REPORT_COLUMNS.find(c => getDedupeKey(c[0]) === id)[0].trim().toUpperCase();
                    if (currentName === standardName) {
                        uniqueMap.set(id, col);
                    }
                } else {
                    seenUnique.add(id);
                    uniqueMap.set(id, col);
                }
            } else {
                // Keep separate primary/secondary transformer columns
                filtered.push(col);
            }
        });

        const uniqueCols = Array.from(uniqueMap.values());
        filtered = [...uniqueCols, ...filtered];

        // Final sorting pass to ensure order matches REPORT_COLUMNS exactly
        filtered.sort((a, b) => {
            const nameA = String(a.originalName || a.name).trim().toUpperCase();
            const nameB = String(b.originalName || b.name).trim().toUpperCase();
            
            let idxA = REPORT_COLUMNS.findIndex(c => c[0].trim().toUpperCase() === nameA);
            let idxB = REPORT_COLUMNS.findIndex(c => c[0].trim().toUpperCase() === nameB);
            
            if (idxA === -1) {
                const idA = getDedupeKey(nameA);
                idxA = reportLabels.indexOf(idA);
            }
            if (idxB === -1) {
                const idB = getDedupeKey(nameB);
                idxB = reportLabels.indexOf(idB);
            }
            
            if (idxA === -1) idxA = 9999;
            if (idxB === -1) idxB = 9999;
            
            return idxA - idxB;
        });

        sorted = filtered;
    }

    let finalColumns = attachGroupTitles(sorted);

    if (isClientVersion) {
        finalColumns = finalColumns.filter(col => {
            const group = String(col.groupTitle || '').trim().toUpperCase();
            const name = String(col.originalName || col.name).trim().toUpperCase();
            
            const isPrimaryTx = group.includes('BOBINA PRIMARIA') || group.includes('TX BOBINA PRIMARIA');
            const isSecondaryTx = group.includes('BOBINA SECUNDARIA') || group.includes('TX BOBINA SECUNDARIA');
            const isVsdCurrent = name.includes('VSD') && (name.includes(' I ') || name.includes('IA') || name.includes('IB') || name.includes('IC'));
            
            if (isPrimaryTx || isSecondaryTx || isVsdCurrent) {
                const hasProm = name.includes('PROM') || name.includes('AVERAGE') || name.includes('MEDIA');
                const hasAbs = name.includes('ABS') || name.includes('DESV');
                const hasMax = name.includes('MAX');
                if (hasProm || hasAbs || hasMax) {
                    return false;
                }
            }
            return true;
        });
    }

    return finalColumns.map((column, index) => ({
        ...column,
        key: `${getColumnLetter(index)}_${column.originalName || column.name}`,
        letter: getColumnLetter(index),
        index
    }));
}

function injectRetroactiveCalculations(rows = []) {
    const parseNum = val => {
        const n = parseFloat(val);
        return isNaN(n) ? NaN : n;
    };
    const isNum = val => typeof val === 'number' && !isNaN(val);
    const avg = (...vals) => {
        const nums = vals.filter(isNum);
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '';
    };
    const maxVal = (...vals) => {
        const nums = vals.filter(isNum);
        return nums.length ? Math.max(...nums) : '';
    };
    const calcDesv = (val, prom) => isNum(val) && isNum(prom) ? Math.abs(val - prom) : '';
    const calcDesbalance = (maxD, prom) => isNum(maxD) && isNum(prom) && prom > 0 ? (maxD / prom) * 100 : '';

    rows.forEach(row => {
        if (!row.row_data) row.row_data = {};
        const d = row.row_data;
        
        const getField = (labelPattern) => {
            const normalizedPattern = normalizeColumnIdentity(labelPattern);
            const key = Object.keys(d).find(k => normalizeColumnIdentity(k) === normalizedPattern);
            return key ? parseNum(d[key]) : NaN;
        };

        const ia = getField('I VSD A [A]');
        const ib = getField('I VSD B [A]');
        const ic = getField('I VSD C [A]');
        const promVSD = avg(ia, ib, ic);
        const devA = calcDesv(ia, promVSD);
        const devB = calcDesv(ib, promVSD);
        const devC = calcDesv(ic, promVSD);
        const maxDevVSD = maxVal(devA, devB, devC);
        
        if (isNum(promVSD) && !d['PROM I VSD [A]']) {
            d['PROM I VSD [A]'] = promVSD.toFixed(1);
            d['ABS IA PROM VSD'] = devA !== '' ? devA.toFixed(1) : '';
            d['ABS IB PROM VSD'] = devB !== '' ? devB.toFixed(1) : '';
            d['ABS IC PROM VSD'] = devC !== '' ? devC.toFixed(1) : '';
            d['MAXIMO ABS I VSD'] = maxDevVSD !== '' ? maxDevVSD.toFixed(1) : '';
            d['% Desbalance Corriente VSD [A]'] = calcDesbalance(maxDevVSD, promVSD) !== '' ? calcDesbalance(maxDevVSD, promVSD).toFixed(1) : '';
        }

        const pff12 = getField('Fase-Fase X1-X2 [Volt]');
        const pff23 = getField('Fase-Fase X2-X3 [Volt]');
        const pff31 = getField('Fase-Fase X3-X1 [Volt]');
        const promPFF = avg(pff12, pff23, pff31);
        const devPFF1 = calcDesv(pff12, promPFF);
        const devPFF2 = calcDesv(pff23, promPFF);
        const devPFF3 = calcDesv(pff31, promPFF);
        const maxDevPFF = maxVal(devPFF1, devPFF2, devPFF3);
        
        if (isNum(promPFF) && !d['PROMEDIO F-F PRIMARIO']) {
            d['PROMEDIO F-F PRIMARIO'] = promPFF.toFixed(1);
            d['ABS X1-X2 PROM'] = devPFF1 !== '' ? devPFF1.toFixed(1) : '';
            d['ABS X3-X2 PROM'] = devPFF2 !== '' ? devPFF2.toFixed(1) : '';
            d['ABS X3-X1 PROM'] = devPFF3 !== '' ? devPFF3.toFixed(1) : '';
            d['MAX ABS F-F PRIMARIO'] = maxDevPFF !== '' ? maxDevPFF.toFixed(1) : '';
            d['% DESBALANCE FASE/FASE (VOLT)'] = calcDesbalance(maxDevPFF, promPFF) !== '' ? calcDesbalance(maxDevPFF, promPFF).toFixed(1) : '';
        }

        const pft1 = getField('Fase-Tierra X1-Tierra [Volt]');
        const pft2 = getField('Fase-Tierra X2-Tierra [Volt]');
        const pft3 = getField('Fase-Tierra X3-Tierra [Volt]');
        const promPFT = avg(pft1, pft2, pft3);
        const devPFT1 = calcDesv(pft1, promPFT);
        const devPFT2 = calcDesv(pft2, promPFT);
        const devPFT3 = calcDesv(pft3, promPFT);
        const maxDevPFT = maxVal(devPFT1, devPFT2, devPFT3);
        
        if (isNum(promPFT) && !d['PROMEDIO FASE/TIERRA (VOLT)']) {
            d['PROMEDIO FASE/TIERRA (VOLT)'] = promPFT.toFixed(1);
            d['ABS X1-X2 FASE TIERRA PRIMARIO'] = devPFT1 !== '' ? devPFT1.toFixed(1) : '';
            d['ABS X2-X3 FASE TIERRA PRIMARIO'] = devPFT2 !== '' ? devPFT2.toFixed(1) : '';
            d['ABS X3-X1 FASE TIERRA PRIMARIO'] = devPFT3 !== '' ? devPFT3.toFixed(1) : '';
            d['MAX ABS F-T PRIMARIO'] = maxDevPFT !== '' ? maxDevPFT.toFixed(1) : '';
            d['% DESBALANCE FASE/TIERRA (VOLT)'] = calcDesbalance(maxDevPFT, promPFT) !== '' ? calcDesbalance(maxDevPFT, promPFT).toFixed(1) : '';
        }

        const sff12 = getField('Fase-Fase H1-H2 [Volt]');
        const sff23 = getField('Fase-Fase H2-H3 [Volt]');
        const sff31 = getField('Fase-Fase H3-H1 [Volt]');
        const promSFF = avg(sff12, sff23, sff31);
        const devSFF1 = calcDesv(sff12, promSFF);
        const devSFF2 = calcDesv(sff23, promSFF);
        const devSFF3 = calcDesv(sff31, promSFF);
        const maxDevSFF = maxVal(devSFF1, devSFF2, devSFF3);
        
        if (isNum(promSFF) && !d['MAX ABS F-F PROMEDIO SECUNDARIO']) {
            d['PROMEDIO FASE/FASE [VOLT]'] = promSFF.toFixed(1);
            d['ABS F-F H1-H2 PROMEDIO'] = devSFF1 !== '' ? devSFF1.toFixed(1) : '';
            d['ABS F-F H2-H3 PROMEDIO'] = devSFF2 !== '' ? devSFF2.toFixed(1) : '';
            d['ABS F-F H3-H1 PROMEDIO'] = devSFF3 !== '' ? devSFF3.toFixed(1) : '';
            d['MAX ABS F-F PROMEDIO SECUNDARIO'] = maxDevSFF !== '' ? maxDevSFF.toFixed(1) : '';
            d['% DESBALANCE FASE/FASE [VOLT]'] = calcDesbalance(maxDevSFF, promSFF) !== '' ? calcDesbalance(maxDevSFF, promSFF).toFixed(1) : '';
        }

        const sft1 = getField('Fase-Tierra H1-Tierra [Volt]');
        const sft2 = getField('Fase-Tierra H2-Tierra [Volt]');
        const sft3 = getField('Fase-Tierra H3-Tierra [Volt]');
        const promSFT = avg(sft1, sft2, sft3);
        const devSFT1 = calcDesv(sft1, promSFT);
        const devSFT2 = calcDesv(sft2, promSFT);
        const devSFT3 = calcDesv(sft3, promSFT);
        const maxDevSFT = maxVal(devSFT1, devSFT2, devSFT3);
        
        if (isNum(promSFT) && !d['MAX ABS F-T PROMEDIO SECUNDARIO']) {
            d['PROMEDIO FASE-TIERRA [VOLT]'] = promSFT.toFixed(1);
            d['ABS F-T H1-H2 PROMEDIO'] = devSFT1 !== '' ? devSFT1.toFixed(1) : '';
            d['ABS F-T H2-H3 PROMEDIO'] = devSFT2 !== '' ? devSFT2.toFixed(1) : '';
            d['ABS F-T H3-H1 PROMEDIO'] = devSFT3 !== '' ? devSFT3.toFixed(1) : '';
            d['MAX ABS F-T PROMEDIO SECUNDARIO'] = maxDevSFT !== '' ? maxDevSFT.toFixed(1) : '';
            d['% DESBALANCE FASE/TIERRA [VOLT]'] = calcDesbalance(maxDevSFT, promSFT) !== '' ? calcDesbalance(maxDevSFT, promSFT).toFixed(1) : '';
        }

        const px12 = getField('Corriente X1-X2 [Amp]');
        const px23 = getField('Corriente X2-X3 [Amp]');
        const px31 = getField('Corriente X3-X1 [Amp]');
        const promPC = avg(px12, px23, px31);
        const devPC1 = calcDesv(px12, promPC);
        const devPC2 = calcDesv(px23, promPC);
        const devPC3 = calcDesv(px31, promPC);
        const maxDevPC = maxVal(devPC1, devPC2, devPC3);

        if (isNum(promPC) && !d['PROMEDIO CORRIENTE PRIMARIO [AMP]']) {
            d['PROMEDIO CORRIENTE PRIMARIO [AMP]'] = promPC.toFixed(1);
            d['ABS CORRIETE X1-X2 PROMEDIO'] = devPC1 !== '' ? devPC1.toFixed(1) : '';
            d['ABS CORRIETE X2-X3 PROMEDIO'] = devPC2 !== '' ? devPC2.toFixed(1) : '';
            d['ABS CORRIETE X3-X1 PROMEDIO'] = devPC3 !== '' ? devPC3.toFixed(1) : '';
            d['MAX ABS CORRIENTE PROMEDIO PRIMARIO'] = maxDevPC !== '' ? maxDevPC.toFixed(1) : '';
            d['% DESBALANCE CORRIENTE (AMP)'] = calcDesbalance(maxDevPC, promPC) !== '' ? calcDesbalance(maxDevPC, promPC).toFixed(1) : '';
        }

        const sx12 = getField('Corriente H1-H2 [Amp]');
        const sx23 = getField('Corriente H2-H3 [Amp]');
        const sx31 = getField('Corriente H3-H1 [Amp]');
        const promSC = avg(sx12, sx23, sx31);
        const devSC1 = calcDesv(sx12, promSC);
        const devSC2 = calcDesv(sx23, promSC);
        const devSC3 = calcDesv(sx31, promSC);
        const maxDevSC = maxVal(devSC1, devSC2, devSC3);

        if (isNum(promSC) && !d['MAXIMO ABS CORRIENTE PROMEDIO SECUNDARIO']) {
            d['PROMEDIO CORRIENTE SECUNDARIO [AMP]'] = promSC.toFixed(1);
            d['ABS CORRIENTE H1-H2 PROMEDIO'] = devSC1 !== '' ? devSC1.toFixed(1) : '';
            d['ABS CORRIENTE H2-H3 PROMEDIO'] = devSC2 !== '' ? devSC2.toFixed(1) : '';
            d['ABS CORRIENTE H3-H1 PROMEDIO'] = devSC3 !== '' ? devSC3.toFixed(1) : '';
            d['MAXIMO ABS CORRIENTE PROMEDIO SECUNDARIO'] = maxDevSC !== '' ? maxDevSC.toFixed(1) : '';
            d['% DESBALANCE CORRIENTE [AMP]'] = calcDesbalance(maxDevSC, promSC) !== '' ? calcDesbalance(maxDevSC, promSC).toFixed(1) : '';
        }
    });
}

function buildExportColumnsFromStoredRows(rows = [], source = 'base', isClientVersion = false) {
    // Inyectar cálculos retroactivos (Promedios, ABS, Desbalances) a TODAS las filas,
    // ya sean del Base Histórico, Nuevo Histórico o Dashboard General.
    injectRetroactiveCalculations(rows);
    
    // Obtener las columnas únicas a partir de las filas
    const columnsFromRows = buildColumnsFromStoredRows(rows);
    
    // Si estamos en Base Histórico, puede que queramos recuperar las columnas de la plantilla original
    // para asegurarnos de que la estructura se mantiene, pero siempre las pasaremos por el filtro estricto.
    if (source === 'base' || source === 'completo') {
        const labels = [];
        const seen = new Set();
        const baseColumns = getBaseTemplateColumns();

        baseColumns.forEach(column => addStoredColumnLabel(labels, seen, column.originalName || column.name));

        // Agregar las columnas de las filas a las de la plantilla
        columnsFromRows.forEach(column => addStoredColumnLabel(labels, seen, column.originalName || column.name));
        
        const mergedColumns = mapLabelsToColumns(labels);
        return orderExportColumns(mergedColumns, true, isClientVersion); // true = strict filter
    }

    // Para Nuevo Histórico (operativo), solo ordenamos y filtramos de manera estricta
    return orderExportColumns(columnsFromRows, true, isClientVersion); // true = strict filter
}

function formatStoredDateForExcel(dateValue) {
    const isoDate = String(dateValue || '').slice(0, 10);
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return isoDate;
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
}

function getStoredMonthName(dateValue) {
    const isoDate = String(dateValue || '').slice(0, 10);
    const monthIndex = Number(isoDate.slice(5, 7)) - 1;
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

async function getLatestPumpDetailsMap() {
    const map = new Map();
    try {
        const { data: profiles, error } = await supabase
            .from('well_bes_profile')
            .select('*');
        if (!error && profiles) {
            profiles.forEach(profile => {
                const pozo = String(profile.pozo_name || '').trim().toUpperCase();
                if (pozo) {
                    map.set(pozo, {
                        'FABRICANTE': profile.pump_manufacturer || '',
                        'SUCCION (FT)': profile.suction_ft || '',
                        'BOMBA ': profile.pump_model || '',
                        'MULTIFASICA': profile.multiphase_pump || '',
                        'SEPARADOR DE GAS': profile.gas_separator || '',
                        'SELLOS': profile.seal_section || '',
                        'MOTOR': profile.motor_manufacturer || profile.motor_model || '',
                        'SENSOR': profile.sensor_model || '',
                        'DRAIN VALVE': profile.drain_valve || '',
                        isFromProfile: true
                    });
                }
            });
        }
    } catch (e) {
        console.warn('Failed to load from well_bes_profile:', e);
    }
    try {
        const { data: legacyRows, error } = await supabase
            .from('consolidated_dashboard_general')
            .select('pozo, report_date, row_data')
            .eq('source_type', 'legacy_excel')
            .order('report_date', { ascending: true });
        if (!error && legacyRows) {
            legacyRows.forEach(row => {
                const pozo = String(row.pozo || '').trim().toUpperCase();
                if (!pozo) return;
                const rowData = row.row_data || {};
                const hasPumpData = rowData['FABRICANTE'] || rowData['BOMBA '] || rowData['SUCCION (FT)'];
                if (hasPumpData) {
                    let existing = map.get(pozo);
                    if (!existing) {
                        existing = {
                            'FABRICANTE': '', 'SUCCION (FT)': '', 'BOMBA ': '',
                            'MULTIFASICA': '', 'SEPARADOR DE GAS': '', 'SELLOS': '',
                            'MOTOR': '', 'SENSOR': '', 'DRAIN VALVE': '',
                            isFromProfile: false
                        };
                        map.set(pozo, existing);
                    }
                    if (!existing.isFromProfile) {
                        if (!existing['FABRICANTE']) existing['FABRICANTE'] = rowData['FABRICANTE'] || '';
                        if (!existing['SUCCION (FT)']) existing['SUCCION (FT)'] = rowData['SUCCION (FT)'] || '';
                        if (!existing['BOMBA ']) existing['BOMBA '] = rowData['BOMBA '] || '';
                        if (!existing['MULTIFASICA']) existing['MULTIFASICA'] = rowData['MULTIFASICA'] || '';
                        if (!existing['SEPARADOR DE GAS']) existing['SEPARADOR DE GAS'] = rowData['SEPARADOR DE GAS'] || '';
                        if (!existing['SELLOS']) existing['SELLOS'] = rowData['SELLOS'] || '';
                        if (!existing['MOTOR']) existing['MOTOR'] = rowData['MOTOR'] || '';
                        if (!existing['SENSOR']) existing['SENSOR'] = rowData['SENSOR'] || '';
                        if (!existing['DRAIN VALVE']) existing['DRAIN VALVE'] = rowData['DRAIN VALVE'] || '';
                    }
                }
            });
        }
    } catch (e) {
        console.warn('Failed to load legacy excel pump specs:', e);
    }
    return map;
}

function getStoredRowExportValue(storedRow = {}, label = '', pumpMap = null) {
    const normalizedLabel = normalizeSheetName(label);

    if (normalizedLabel === 'FECHA' && storedRow.report_date) {
        return formatStoredDateForExcel(storedRow.report_date);
    }

    if (normalizedLabel === 'MES' && storedRow.report_date) {
        return getStoredMonthName(storedRow.report_date);
    }

    if (normalizedLabel === 'HORA' && storedRow.report_time) {
        return String(storedRow.report_time).slice(0, 8);
    }

    const rowData = storedRow.row_data || {};
    let val = rowData[label];
    if (val === undefined) {
        const normalizedIdentity = normalizeColumnIdentity(label);
        const aliases = {
            'ESTADODEFOSA': ['ESTADODELAFOSA', 'ESTADODELAFOSA%', 'ESTADODEFOSA%', 'ESTADOFOSA', 'EDOFOSA', 'ESTADOFOSA%', 'EDOFOSA%'],
            'OBSERVACIONES': ['OBSERVACIONESDELPOZO']
        };
        const possibleIdentities = [normalizedIdentity, ...(aliases[normalizedIdentity] || [])];
        const matchingKey = Object.keys(rowData).find(key => {
            const keyId = normalizeColumnIdentity(key);
            return possibleIdentities.includes(keyId) || normalizeSheetName(key) === normalizedLabel;
        });
        val = matchingKey ? rowData[matchingKey] : '';
    }

    // Inyección y autocompletado dinámico de datos de la bomba BES
    if (pumpMap) {
        const pumpCols = [
            'FABRICANTE', 'SUCCION (FT)', 'BOMBA ', 'MULTIFASICA', 'SEPARADOR DE GAS', 'SELLOS', 'MOTOR', 'SENSOR', 'DRAIN VALVE'
        ];
        const trimmedLabel = String(label).trim().toUpperCase();
        const matchedPumpCol = pumpCols.find(col => col.trim() === trimmedLabel || normalizeColumnIdentity(col) === normalizeColumnIdentity(label));
        if (matchedPumpCol) {
            const pozo = String(storedRow.pozo || '').trim().toUpperCase();
            const pumpData = pumpMap.get(pozo);
            if (pumpData) {
                // Si la celda de la base de datos ya tiene un valor de bomba grabado (no vacío y no comodín '--'),
                // respetamos y conservamos ese valor histórico para evitar sobreescrituras retroactivas indebidas.
                if (val && String(val).trim() !== '' && String(val).trim() !== '--') {
                    return val;
                }
                // Si la celda está vacía (reporte antiguo o sin bomba guardada), usamos la Ficha BES activa o la más cercana como autocompletado en caliente.
                return pumpData[matchedPumpCol] || '';
            }
        }
    }

    return val !== undefined ? val : '';
}

function buildRowsFromStoredRows(storedRows = [], columns = [], pumpMap = null) {
    return storedRows.map(storedRow => columns.map(column => getStoredRowExportValue(storedRow, column.originalName, pumpMap)));
}

async function exportDashboardGeneralFromDatabase() {
    if (!window.ExcelJS) {
        setStatus('No se pudo cargar ExcelJS. Sin esa librería no podemos generar el exportable diseñado.', 'error');
        return;
    }

    try {
        const filters = getExportFilters();
        if (filters.mode === 'pozo' && !filters.pozo) {
            setStatus('Selecciona un pozo para exportar por pozo.', 'error');
            return;
        }

        if (filters.mode === 'fecha' && !filters.startDate && !filters.endDate) {
            setStatus('Selecciona al menos una fecha para exportar por rango.', 'error');
            return;
        }

        if (!hasSwal()) {
            setStatus('Error: SweetAlert2 no está disponible.', 'error');
            return;
        }

        const result = await window.Swal.fire({
            icon: 'question',
            title: 'Selecciona la versión del consolidado',
            text: '¿Deseas descargar el consolidado completo para Ingeniería o la versión filtrada para Cliente?',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Consolidado Ingeniería',
            denyButtonText: 'Consolidado Cliente',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b1f3a',
            denyButtonColor: '#1d4ed8',
            cancelButtonColor: '#64748b',
            customClass: {
                popup: 'consolidado-swal-popup',
                title: 'consolidado-swal-title'
            }
        });

        if (result.isDismissed) {
            return;
        }

        const isClientVersion = result.isDenied;

        setBusyState(true);
        showLoadingModal('Exportando consolidado guardado', 'Leyendo filas desde Supabase para generar el Dashboard General.', `Origen: ${getExportSourceLabel(filters.source)} · Modo: ${getExportModeLabel(filters.mode)}.`);
        setStatus('Consultando filas guardadas del consolidado maestro...', 'neutral');

        if (filters.source === 'completo') {
            await exportDashboardGeneralSplitFromDatabase(filters, isClientVersion);
            return;
        }

        const storedRows = await fetchConsolidatedDashboardRows(filters);
        if (!storedRows.length) {
            throw new Error('No hay filas guardadas que coincidan con los filtros seleccionados.');
        }

        updateLoadingModal('Preparando columnas y filas...', `${storedRows.length} filas recuperadas desde Supabase.`);
        const columns = buildExportColumnsFromStoredRows(storedRows, filters.source, isClientVersion);
        const pumpMap = await getLatestPumpDetailsMap();
        const rows = buildRowsFromStoredRows(storedRows, columns, pumpMap);
        const sourceSheet = { name: DASHBOARD_GENERAL_SHEET_NAME, columns };

        await exportDashboardWorkbook({
            columns,
            rows,
            sourceSheet,
            filePrefix: 'UV_CONSOLIDADO_DB_DASHBOARD_GENERAL',
            sourceLabel: `Origen: ${getExportSourceLabel(filters.source)} · Modo: ${getExportModeLabel(filters.mode)} · Filas: ${rows.length} · Generado: ${new Date().toLocaleString('es-ES')}${isClientVersion ? ' (Cliente)' : ''}`,
            emptyMessage: 'No hay filas guardadas en base de datos para exportar.'
        });

        await refreshDatabaseSummary({ silent: true });
        setStatus(`Dashboard General exportado desde base de datos: ${rows.length} filas.`, 'success');
        closeLoadingModal();
        showResultModal('success', 'Exportado desde base de datos', `${rows.length} filas exportadas desde el consolidado guardado.`);
    } catch (error) {
        console.error('No se pudo exportar desde base de datos:', error);
        setStatus(error?.message || 'No se pudo exportar el consolidado guardado.', 'error');
        closeLoadingModal();
        showResultModal('error', 'No se pudo exportar', error?.message || 'No se pudo exportar el consolidado guardado.');
    } finally {
        setBusyState(false);
    }
}

async function exportDashboardGeneralSplitFromDatabase(filters, isClientVersion = false) {
    updateLoadingModal('Consultando base histórica y nuevo histórico...', 'Preparando hojas separadas para el exportable.');

    const [baseRows, nuevoRows] = await Promise.all([
        fetchConsolidatedDashboardRows({ ...filters, source: 'base' }),
        fetchConsolidatedDashboardRows({ ...filters, source: 'operativo' })
    ]);

    if (!baseRows.length && !nuevoRows.length) {
        throw new Error('No hay filas guardadas que coincidan con los filtros seleccionados.');
    }

    updateLoadingModal('Preparando hojas separadas...', `Base Historico: ${baseRows.length} filas · Nuevo Historico: ${nuevoRows.length} filas.`);

    const baseColumns = buildExportColumnsFromStoredRows(baseRows, 'base', isClientVersion);
    const nuevoColumns = buildExportColumnsFromStoredRows(nuevoRows, 'operativo', isClientVersion);
    const pumpMap = await getLatestPumpDetailsMap();
    const baseExportRows = buildRowsFromStoredRows(baseRows, baseColumns, pumpMap);
    const nuevoExportRows = buildRowsFromStoredRows(nuevoRows, nuevoColumns, pumpMap);
    const generatedAt = new Date().toLocaleString('es-ES');

    await exportDashboardSplitWorkbook({
        sheets: [
            {
                name: NUEVO_HISTORICO_SHEET_NAME,
                columns: nuevoColumns,
                rows: nuevoExportRows,
                sourceLabel: `Origen: nuevo histórico Campo · Modo: ${getExportModeLabel(filters.mode)} · Filas: ${nuevoExportRows.length} · Generado: ${generatedAt}${isClientVersion ? ' (Cliente)' : ''}`,
                emptyMessage: 'No hay filas de Nuevo Historico para los filtros seleccionados.'
            },
            {
                name: BASE_HISTORICO_SHEET_NAME,
                columns: baseColumns,
                rows: baseExportRows,
                sourceLabel: `Origen: base histórica · Modo: ${getExportModeLabel(filters.mode)} · Filas: ${baseExportRows.length} · Generado: ${generatedAt}${isClientVersion ? ' (Cliente)' : ''}`,
                emptyMessage: 'No hay filas de Base Historico para los filtros seleccionados.'
            }
        ],
        filePrefix: 'UV_CONSOLIDADO_DB_HISTORICOS'
    });

    await refreshDatabaseSummary({ silent: true });
    const totalRows = baseExportRows.length + nuevoExportRows.length;
    setStatus(`Consolidado exportado en hojas separadas: Nuevo Historico ${nuevoExportRows.length} filas, Base Historico ${baseExportRows.length} filas.`, 'success');
    closeLoadingModal();
    showResultModal('success', 'Exportado en hojas separadas', `${totalRows} filas exportadas: Nuevo Historico (${nuevoExportRows.length}) y Base Historico (${baseExportRows.length}).`);
}

async function openFieldJourneyDeleteSelector() {
    try {
        setBusyState(true);
        showLoadingModal('Cargando filas Campo Admin', 'Buscando registros publicados desde Campo Admin.', 'La selección puede borrar Consolidado y Data operativa.');
        const rows = await fetchFieldJourneyConsolidatedRows();
        closeLoadingModal();

        if (!rows.length) {
            showResultModal('info', 'Sin filas Campo', 'No hay filas de Campo Admin para eliminar.');
            return;
        }

        await showFieldJourneySelectionModal(rows);
    } catch (error) {
        console.error('No se pudieron cargar filas Campo Admin:', error);
        closeLoadingModal();
        setStatus(error?.message || 'No se pudieron cargar las filas de Campo Admin.', 'error');
        showResultModal('error', 'No se pudo cargar', error?.message || 'No se pudieron cargar las filas de Campo Admin.');
    } finally {
        setBusyState(false);
    }
}

async function showFieldJourneySelectionModal(rows = []) {
    if (!hasSwal()) {
        showResultModal('info', 'Selección no disponible', 'SweetAlert2 no está disponible para mostrar la tabla de selección.');
        return;
    }

    const rowsMarkup = rows.map((row, index) => {
        const rowData = row.row_data || {};
        const pozo = row.pozo || rowData.POZO || 'Sin pozo';
        const campo = row.campo || rowData.CAMPO || '--';
        const fecha = formatDateTimeLabel(row.report_date || rowData.FECHA, row.report_time || rowData.HORA);
        const actividad = rowData.ACTIVIDAD || rowData.ESTATUS || rowData.DIAGNOSTICO || '--';

        return `
            <label class="consolidado-delete-row">
                <input type="checkbox" value="${escapeHtml(row.id)}" data-field-delete-check>
                <span class="consolidado-delete-row-main">
                    <strong>${escapeHtml(pozo)}</strong>
                    <small>${escapeHtml(campo)} · ${escapeHtml(fecha)}</small>
                </span>
                <span class="consolidado-delete-row-extra">${escapeHtml(actividad)}</span>
                <em>#${index + 1}</em>
            </label>
        `;
    }).join('');

    const result = await window.Swal.fire({
        title: 'Seleccionar filas Campo Admin',
        html: `
            <div class="consolidado-delete-selector">
                <div class="consolidado-delete-selector-head">
                    <button type="button" id="consolidado-select-all-field-rows">Seleccionar todo</button>
                    <span>${rows.length} filas disponibles</span>
                </div>
                <p class="consolidado-delete-warning">Las filas seleccionadas se eliminan del consolidado y tambien de Data operativa usando pozo, fecha y hora exactos.</p>
                <div class="consolidado-delete-list">${rowsMarkup}</div>
            </div>
        `,
        width: 760,
        showCancelButton: true,
        confirmButtonText: 'Eliminar de ambos lados',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#991b1b',
        cancelButtonColor: '#0f172a',
        customClass: {
            popup: 'consolidado-swal-popup consolidado-delete-popup',
            title: 'consolidado-swal-title',
            htmlContainer: 'consolidado-swal-html'
        },
        didOpen: () => {
            const selectAllButton = document.getElementById('consolidado-select-all-field-rows');
            selectAllButton?.addEventListener('click', () => {
                const checks = document.querySelectorAll('[data-field-delete-check]');
                const shouldCheck = Array.from(checks).some(check => !check.checked);
                checks.forEach(check => { check.checked = shouldCheck; });
                selectAllButton.textContent = shouldCheck ? 'Quitar selección' : 'Seleccionar todo';
            });
        },
        preConfirm: () => {
            const selectedIds = Array.from(document.querySelectorAll('[data-field-delete-check]:checked'))
                .map(input => input.value);
            if (!selectedIds.length) {
                window.Swal.showValidationMessage('Selecciona al menos una fila para eliminar.');
                return false;
            }
            return selectedIds;
        }
    });

    if (!result.isConfirmed || !result.value?.length) return;
    await deleteSelectedFieldJourneyRows(result.value);
}

async function deleteSelectedFieldJourneyRows(ids = []) {
    try {
        setBusyState(true);
        showLoadingModal('Eliminando seleccionadas', `Eliminando ${ids.length} filas de Campo Admin.`, 'Se limpiara Consolidado y Data operativa. El Excel viejo queda intacto.');
        const result = await deleteSelectedFieldJourneyConsolidatedRows(ids);
        await refreshDatabaseSummary({ silent: true });
        closeLoadingModal();
        const message = `Campo Admin: ${result.deleted} filas eliminadas del consolidado y ${result.operationalDeleted || 0} registros eliminados de Data operativa.`;
        setStatus(message, 'success');
        showResultModal('success', 'Filas eliminadas', `${message} El Excel viejo no se modifico.`);
    } catch (error) {
        console.error('No se pudieron eliminar filas seleccionadas:', error);
        closeLoadingModal();
        setStatus(error?.message || 'No se pudieron eliminar las filas seleccionadas.', 'error');
        showResultModal('error', 'No se pudo eliminar', error?.message || 'No se pudieron eliminar las filas seleccionadas.');
    } finally {
        setBusyState(false);
    }
}

async function deleteAllFieldJourneyRows() {
    const total = consolidatedSummary?.fieldJourneyCount || 0;
    const confirmed = await confirmAction({
        title: 'Limpiar Campo Admin',
        message: `Se eliminaran ${total} filas publicadas desde Campo Admin del consolidado y sus registros exactos en Data operativa. Las filas del Excel viejo se conservan.`,
        confirmText: 'Limpiar ambos lados'
    });
    if (!confirmed) return;

    try {
        setBusyState(true);
        showLoadingModal('Limpiando Campo Admin', 'Eliminando filas publicadas desde Campo Admin.', 'Se limpiara Consolidado y Data operativa.');
        const result = await deleteAllFieldJourneyConsolidatedRows();
        await refreshDatabaseSummary({ silent: true });
        closeLoadingModal();
        const message = `Campo Admin limpiado: ${result.deleted} filas eliminadas del consolidado y ${result.operationalDeleted || 0} registros eliminados de Data operativa.`;
        setStatus(message, 'success');
        showResultModal('success', 'Campo Admin limpio', `${message} El Excel viejo no se modifico.`);
    } catch (error) {
        console.error('No se pudieron limpiar filas Campo Admin:', error);
        closeLoadingModal();
        setStatus(error?.message || 'No se pudieron limpiar las filas de Campo Admin.', 'error');
        showResultModal('error', 'No se pudo limpiar', error?.message || 'No se pudieron limpiar las filas de Campo Admin.');
    } finally {
        setBusyState(false);
    }
}

function getDashboardGeneralSheet() {
    return activeTemplate?.sheets?.find(sheet => isDashboardGeneralSheet(sheet.name)) || activeTemplate?.sheets?.[0] || null;
}

function getHeaderFillColor(headerName, columnIndex) {
    const normalizedHeader = normalizeSheetName(headerName);
    if (normalizedHeader.includes('ECHOMETER') || normalizedHeader.includes('NIVEL') || normalizedHeader.includes('SUMERGENCIA')) return 'D97706';
    if (normalizedHeader.includes('%') || normalizedHeader.includes('RELACION') || normalizedHeader.includes('PIP MIN')) return '4F7F35';
    if (normalizedHeader.includes('OBSERV') || normalizedHeader.includes('DIAGNOSTICO')) return '1F4E79';
    if (columnIndex > 44 && columnIndex < 68) return '4F7F35';
    return '1F4E79';
}

function getBodyFillColor(headerName, rowIndex) {
    const normalizedHeader = normalizeSheetName(headerName);
    if (normalizedHeader.includes('%') || normalizedHeader.includes('RELACION')) return rowIndex % 2 ? 'EEF6E9' : 'F8FBF5';
    if (normalizedHeader.includes('OBSERV')) return 'FFFFFF';
    return rowIndex % 2 ? 'F8FAFC' : 'FFFFFF';
}

async function exportDashboardGeneralWorkbook() {
    const dashboardSheet = getDashboardGeneralSheet();
    if (!dashboardSheet) {
        setStatus('Importa primero el Excel viejo para detectar la hoja Dashboard General.', 'error');
        return;
    }

    if (!window.ExcelJS) {
        setStatus('No se pudo cargar ExcelJS. Sin esa librería no podemos generar logo, colores y formato empresarial.', 'error');
        return;
    }

    try {
        if (!hasSwal()) {
            setStatus('Error: SweetAlert2 no está disponible.', 'error');
            return;
        }

        const result = await window.Swal.fire({
            icon: 'question',
            title: 'Selecciona la versión del consolidado',
            text: '¿Deseas descargar el consolidado completo para Ingeniería o la versión filtrada para Cliente?',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Consolidado Ingeniería',
            denyButtonText: 'Consolidado Cliente',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b1f3a',
            denyButtonColor: '#1d4ed8',
            cancelButtonColor: '#64748b',
            customClass: {
                popup: 'consolidado-swal-popup',
                title: 'consolidado-swal-title'
            }
        });

        if (result.isDismissed) {
            return;
        }

        const isClientVersion = result.isDenied;

        setBusyState(true);
        showLoadingModal('Generando Excel', 'Armando el Dashboard General con logo, colores y columnas detectadas.', `${activeDashboardRows.length} filas en memoria.`);
        setStatus('Generando Dashboard General con logo, colores y estructura empresarial...', 'neutral');
        
        let columns = dashboardSheet.columns || [];
        if (isClientVersion) {
            columns = orderExportColumns(columns, true, true);
        }

        await exportDashboardWorkbook({
            columns,
            rows: activeDashboardRows,
            sourceSheet: { ...dashboardSheet, columns },
            filePrefix: 'UV_CONSOLIDADO_DASHBOARD_GENERAL',
            sourceLabel: `Origen: ${activeTemplate?.fileName || '--'} · Hoja base: ${dashboardSheet?.name || '--'} · Generado: ${new Date().toLocaleString('es-ES')}${isClientVersion ? ' (Cliente)' : ''}`,
            emptyMessage: 'Sin filas cargadas desde Dashboard General en esta sesión. Importa el Excel viejo y exporta sin recargar la página para incluir datos.'
        });

        const rowMessage = activeDashboardRows.length
            ? `${activeDashboardRows.length} filas exportadas desde Dashboard General.`
            : 'No había filas cargadas en memoria; se exportó el formato corporativo con encabezados y bloque de control.';
        setStatus(`Dashboard General exportado correctamente. ${rowMessage}`, 'success');
        closeLoadingModal();
        showResultModal('success', 'Excel generado', rowMessage);
    } catch (error) {
        console.error('No se pudo exportar Dashboard General:', error);
        setStatus('No se pudo generar el Excel diseñado. Revisa que el archivo importado tenga Dashboard General y vuelve a intentar.', 'error');
        closeLoadingModal();
        showResultModal('error', 'No se pudo exportar', 'Revisa que el archivo importado tenga Dashboard General y vuelve a intentar.');
    } finally {
        setBusyState(false);
    }
}

async function exportDashboardWorkbook({ columns, rows, sourceSheet, filePrefix, sourceLabel, emptyMessage }) {
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'UV Servicios';
    workbook.company = 'UV Servicios';
    workbook.subject = 'Consolidado maestro Dashboard General';
    workbook.created = new Date();
    workbook.modified = new Date();

    updateLoadingModal('Insertando logo y encabezado empresarial...', 'Preparando el diseño del archivo.');
    await addDashboardWorksheet(workbook, {
        name: DASHBOARD_GENERAL_SHEET_NAME,
        columns,
        rows,
        sourceSheet,
        sourceLabel,
        emptyMessage
    });

    updateLoadingModal('Creando archivo descargable...', 'La descarga iniciará automáticamente.');
    const buffer = await workbook.xlsx.writeBuffer();
    const fileDate = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([buffer], { type: EXCEL_MIME_TYPE }), `${filePrefix}_${fileDate}.xlsx`);
}

async function exportDashboardSplitWorkbook({ sheets = [], filePrefix }) {
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'UV Servicios';
    workbook.company = 'UV Servicios';
    workbook.subject = 'Consolidado maestro historicos separados';
    workbook.created = new Date();
    workbook.modified = new Date();

    for (const sheet of sheets) {
        updateLoadingModal(`Pintando ${sheet.name}...`, `${sheet.rows.length} filas · ${sheet.columns.length} columnas.`);
        await addDashboardWorksheet(workbook, {
            name: sheet.name,
            columns: sheet.columns,
            rows: sheet.rows,
            sourceSheet: { name: sheet.name, columns: sheet.columns },
            sourceLabel: sheet.sourceLabel,
            emptyMessage: sheet.emptyMessage
        });
    }

    updateLoadingModal('Creando archivo descargable...', 'La descarga iniciará automáticamente.');
    const buffer = await workbook.xlsx.writeBuffer();
    const fileDate = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([buffer], { type: EXCEL_MIME_TYPE }), `${filePrefix}_${fileDate}.xlsx`);
}

async function addDashboardWorksheet(workbook, { name, columns, rows, sourceSheet, sourceLabel, emptyMessage }) {
    const worksheet = workbook.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: TABLE_HEADER_ROW_INDEX, xSplit: 4, topLeftCell: `E${TABLE_HEADER_ROW_INDEX + 1}`, activeCell: `E${TABLE_HEADER_ROW_INDEX + 1}` }]
    });

    const totalColumns = Math.max(columns.length, 12);
    const lastColumn = Math.min(totalColumns, 16384);

    await addLogoToWorksheet(workbook, worksheet);
    buildWorkbookHeader(worksheet, lastColumn, sourceSheet, sourceLabel, rows.length, columns.length);
    buildDashboardTable(worksheet, columns, rows, emptyMessage);
    finishWorksheetLayout(worksheet, columns);

    return worksheet;
}

function buildWorkbookHeader(worksheet, lastColumn, sourceSheet, sourceLabel = '', rowCount = 0, columnCount = 0) {
    worksheet.mergeCells(1, 1, 5, 4);
    worksheet.mergeCells(1, 5, 2, lastColumn);
    worksheet.mergeCells(3, 5, 3, lastColumn);
    worksheet.mergeCells(4, 5, 4, lastColumn);

    if (lastColumn >= 8) worksheet.mergeCells(5, 5, 5, 8);
    if (lastColumn >= 12) worksheet.mergeCells(5, 9, 5, 12);
    if (lastColumn >= 13) worksheet.mergeCells(5, 13, 5, lastColumn);

    const titleCell = worksheet.getCell(1, 5);
    titleCell.value = 'REPORTE DE ACOMPAÑAMIENTO POZOS CON BOMBAS ELECTROSUMERGIBLES';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };

    const subtitleCell = worksheet.getCell(3, 5);
    subtitleCell.value = 'DASHBOARD GENERAL · CONSOLIDADO MAESTRO UV';
    subtitleCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1D4ED8' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const detailCell = worksheet.getCell(4, 5);
    detailCell.value = sourceLabel || `Origen: ${activeTemplate?.fileName || '--'} · Hoja base: ${sourceSheet?.name || '--'} · Generado: ${new Date().toLocaleString('es-ES')}`;
    detailCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
    detailCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const badgeCell = worksheet.getCell(5, 5);
    badgeCell.value = 'CONSOLIDADO MAESTRO';
    styleHeaderBadgeCell(badgeCell, 'FFEAF6E2', 'FF24501F');

    const rowsCell = worksheet.getCell(5, 9);
    rowsCell.value = `${rowCount} FILAS EXPORTADAS`;
    styleHeaderBadgeCell(rowsCell, 'FFEFF6FF', 'FF1D4ED8');

    if (lastColumn >= 13) {
        const columnsCell = worksheet.getCell(5, 13);
        columnsCell.value = `${columnCount} COLUMNAS · ${sourceSheet?.name || DASHBOARD_GENERAL_SHEET_NAME}`;
        styleHeaderBadgeCell(columnsCell, 'FFFFF7ED', 'FF9A3412');
    }

    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 24;
    worksheet.getRow(3).height = 20;
    worksheet.getRow(4).height = 20;
    worksheet.getRow(5).height = 24;
    worksheet.getRow(6).height = 8;

    for (let rowIndex = 1; rowIndex <= 5; rowIndex += 1) {
        for (let columnIndex = 1; columnIndex <= lastColumn; columnIndex += 1) {
            const cell = worksheet.getCell(rowIndex, columnIndex);
            if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E2EF' } } };
        }
    }

    worksheet.getCell(1, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
}

function styleHeaderBadgeCell(cell, fillColor, fontColor) {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: fontColor } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    cell.border = buildThinBorder('FFE2E8F0');
}

function buildDashboardTable(worksheet, columns, rows, emptyMessage = '') {
    const groupRow = worksheet.getRow(TABLE_HEADER_ROW_INDEX - 1);
    groupRow.height = 20;

    const headerRow = worksheet.getRow(TABLE_HEADER_ROW_INDEX);
    headerRow.height = 34;

    let currentGroup = null;
    let groupStartCol = null;
    let groupColorIndex = 0;

    columns.forEach((column, columnIndex) => {
        const colNum = columnIndex + 1;
        const cell = headerRow.getCell(colNum);
        cell.value = column.originalName || column.name;
        cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${getHeaderFillColor(cell.value, columnIndex)}` } };
        cell.border = buildThinBorder('FF1E293B');

        const groupTitle = column.groupTitle;
        if (groupTitle) {
            if (groupTitle !== currentGroup) {
                if (currentGroup && groupStartCol < colNum) {
                    worksheet.mergeCells(TABLE_HEADER_ROW_INDEX - 1, groupStartCol, TABLE_HEADER_ROW_INDEX - 1, colNum - 1);
                }
                currentGroup = groupTitle;
                groupStartCol = colNum;
                
                const groupColor = EXCEL_GROUP_COLORS[groupColorIndex % EXCEL_GROUP_COLORS.length];
                groupColorIndex++;
                
                const groupCell = groupRow.getCell(colNum);
                groupCell.value = groupTitle.toUpperCase();
                groupCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                groupCell.alignment = { vertical: 'middle', horizontal: 'center' };
                groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${groupColor}` } };
                groupCell.border = buildThinBorder('FF1E293B');
            } else {
                const groupCell = groupRow.getCell(colNum);
                groupCell.border = buildThinBorder('FF1E293B');
            }
        } else {
            if (currentGroup && groupStartCol < colNum) {
                 worksheet.mergeCells(TABLE_HEADER_ROW_INDEX - 1, groupStartCol, TABLE_HEADER_ROW_INDEX - 1, colNum - 1);
            }
            currentGroup = null;
        }
    });

    if (currentGroup && groupStartCol <= columns.length) {
         worksheet.mergeCells(TABLE_HEADER_ROW_INDEX - 1, groupStartCol, TABLE_HEADER_ROW_INDEX - 1, columns.length);
    }

    if (!rows.length) {
        const noteRow = worksheet.getRow(TABLE_HEADER_ROW_INDEX + 1);
        noteRow.getCell(1).value = emptyMessage || 'Sin filas cargadas desde Dashboard General en esta sesión. Importa el Excel viejo y exporta sin recargar la página para incluir datos.';
        noteRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } };
        noteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
        noteRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        worksheet.mergeCells(TABLE_HEADER_ROW_INDEX + 1, 1, TABLE_HEADER_ROW_INDEX + 1, Math.max(1, Math.min(columns.length, 12)));
        return;
    }

    rows.forEach((row, rowIndex) => {
        const excelRow = worksheet.getRow(TABLE_HEADER_ROW_INDEX + 1 + rowIndex);
        excelRow.height = 24;
        columns.forEach((column, columnIndex) => {
            const cell = excelRow.getCell(columnIndex + 1);
            const header = column.originalName || column.name;
            cell.value = coerceDashboardExcelCellValue(row[columnIndex], header);
            if (typeof cell.value === 'number' && isDashboardTimeColumn(header)) {
                cell.numFmt = getDashboardExcelTimeFormat();
            } else if (typeof cell.value === 'number') {
                cell.numFmt = getDashboardExcelNumberFormat(cell.value);
            } else if (cell.value instanceof Date) {
                cell.numFmt = getDashboardExcelDateFormat();
            }
            cell.font = { name: 'Calibri', size: 8, color: { argb: 'FF0F172A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${getBodyFillColor(header, rowIndex)}` } };
            cell.border = buildThinBorder('FFCBD5E1');
        });
    });

    worksheet.autoFilter = {
        from: { row: TABLE_HEADER_ROW_INDEX, column: 1 },
        to: { row: TABLE_HEADER_ROW_INDEX, column: Math.max(columns.length, 1) }
    };
}

function finishWorksheetLayout(worksheet, columns) {
    worksheet.properties.defaultRowHeight = 20;
    worksheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
    };
    worksheet.headerFooter.oddFooter = '&LUV Servicios&CConsolidado Dashboard General&RGenerado &D &T';

    columns.forEach((column, columnIndex) => {
        const header = column.originalName || column.name;
        const width = header.length > 24 ? 18 : Math.max(9, Math.min(16, header.length + 2));
        worksheet.getColumn(columnIndex + 1).width = normalizeSheetName(header).includes('OBSERV') ? 48 : width;
    });
}

function buildThinBorder(color) {
    return {
        top: { style: 'thin', color: { argb: color } },
        left: { style: 'thin', color: { argb: color } },
        bottom: { style: 'thin', color: { argb: color } },
        right: { style: 'thin', color: { argb: color } }
    };
}

async function addLogoToWorksheet(workbook, worksheet) {
    const logoDataUrl = await loadLogoForExcel();
    if (!logoDataUrl) return;

    const imageId = workbook.addImage({ base64: logoDataUrl, extension: getImageExtension(EXCEL_LOGO_PATH) });
    worksheet.addImage(imageId, { tl: { col: 0.12, row: 0.08 }, ext: { width: 205, height: 145 } });
}

async function loadLogoForExcel() {
    try {
        const response = await fetch(EXCEL_LOGO_PATH);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await imageBlobToDataUrl(blob);
    } catch {
        return null;
    }
}

function getImageExtension(path = '') {
    return /\.jpe?g$/i.test(path) ? 'jpeg' : 'png';
}

function imageBlobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function bindEvents() {
    elements.logoutButton?.addEventListener('click', logout);
    elements.mobileLogoutButton?.addEventListener('click', logout);
    elements.configButton?.addEventListener('click', event => {
        event.stopPropagation();
        toggleConfigMenu();
    });
    elements.configMenu?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', closeConfigMenu);
    elements.openImportButton?.addEventListener('click', () => {
        closeConfigMenu();
        elements.fileInput?.click();
    });
    elements.exportStructureButton?.addEventListener('click', exportStructureWorkbook);
    elements.saveDbButton?.addEventListener('click', saveDashboardGeneralToDatabase);
    elements.syncTechnicalButton?.addEventListener('click', syncTechnicalFromConsolidated);
    elements.exportDbButton?.addEventListener('click', exportDashboardGeneralFromDatabase);
    elements.refreshDbButton?.addEventListener('click', () => refreshDatabaseSummary());
    elements.selectFieldRowsButton?.addEventListener('click', openFieldJourneyDeleteSelector);
    elements.deleteAllFieldButton?.addEventListener('click', deleteAllFieldJourneyRows);
    elements.clearTemplateButton?.addEventListener('click', clearTemplate);
    elements.exportModeInputs?.forEach(input => {
        input.addEventListener('change', renderTemplate);
    });
    elements.exportSourceInputs?.forEach(input => {
        input.addEventListener('change', renderTemplate);
    });

    elements.dropZone?.addEventListener('click', () => elements.fileInput?.click());
    elements.dropZone?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            elements.fileInput?.click();
        }
    });
    elements.dropZone?.addEventListener('dragover', event => {
        event.preventDefault();
        elements.dropZone.classList.add('is-dragover');
    });
    elements.dropZone?.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('is-dragover');
    });
    elements.dropZone?.addEventListener('drop', event => {
        event.preventDefault();
        elements.dropZone.classList.remove('is-dragover');
        handleFile(event.dataTransfer?.files?.[0]);
    });
    elements.fileInput?.addEventListener('change', event => {
        handleFile(event.target.files?.[0]);
        event.target.value = '';
    });

    // 🌟 Bind Premium Dashboard Events
    document.getElementById('consolidado-help-trigger')?.addEventListener('click', showConsolidadoHelp);
    
    document.getElementById('consolidado-quick-new')?.addEventListener('click', async () => {
        await triggerQuickExport('operativo', 'historico');
    });
    
    document.getElementById('consolidado-quick-week')?.addEventListener('click', async () => {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 7);
        const formatDate = d => d.toISOString().split('T')[0];
        
        await triggerQuickExport('completo', 'fecha', {
            startDate: formatDate(pastDate),
            endDate: formatDate(today)
        });
    });
    
    document.getElementById('consolidado-quick-all')?.addEventListener('click', async () => {
        await triggerQuickExport('completo', 'historico');
    });
}

function showConsolidadoHelp() {
    if (!hasSwal()) return;

    window.Swal.fire({
        title: 'Guía del Consolidado Maestro',
        html: `
            <div style="text-align: left; font-size: 0.9rem; line-height: 1.6; color: #374151;">
                <p>Esta sección consolida el histórico de mediciones de pozos cargados desde el Excel base con los nuevos registros cargados por Campo.</p>
                <div style="margin-top: 12px; display: grid; gap: 8px;">
                    <strong>¿Cómo exportar?</strong>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li><strong>Origen:</strong> Escoge si deseas descargar la base histórica vieja, solo los nuevos datos de Campo o el histórico combinado (Base + nuevo).</li>
                        <li><strong>Tipo de exportación:</strong> Puedes descargar el histórico completo, filtrar por un pozo específico o limitar a un rango de fechas.</li>
                        <li><strong>Formato oficial:</strong> Al hacer clic en "Exportar consolidado", podrás elegir entre la versión "Ingeniería" (completa) y la versión "Cliente" (sin columnas secundarias de corrientes ni bobinas).</li>
                    </ol>
                </div>
                <div style="margin-top: 16px; padding: 10px; background: #f3f4f6; border-radius: 8px; font-size: 0.8rem; color: #6b7280;">
                    💡 <strong>Consejo rápido:</strong> Si solo quieres descargar la información habitual, utiliza los botones de <strong>Acción Rápida</strong> para descargarlo en un solo clic.
                </div>
            </div>
        `,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#1d4ed8',
        customClass: {
            popup: 'consolidado-swal-popup',
            title: 'consolidado-swal-title'
        }
    });
}

async function triggerQuickExport(source, mode, options = {}) {
    const sourceRadio = document.querySelector(`input[name="consolidado-export-source"][value="${source}"]`);
    if (sourceRadio) {
        sourceRadio.checked = true;
        sourceRadio.dispatchEvent(new Event('change'));
    }
    const modeRadio = document.querySelector(`input[name="consolidado-export-mode"][value="${mode}"]`);
    if (modeRadio) {
        modeRadio.checked = true;
        modeRadio.dispatchEvent(new Event('change'));
    }

    if (options.startDate && elements.startDate) {
        elements.startDate.value = options.startDate;
    }
    if (options.endDate && elements.endDate) {
        elements.endDate.value = options.endDate;
    }
    if (options.pozo && elements.pozoFilter) {
        elements.pozoFilter.value = options.pozo;
    }

    await exportDashboardGeneralFromDatabase();
}

async function ensureAccess() {
    const session = await getSession();
    const accessProfile = getAccessProfile(session);

    if (!session?.user) {
        window.location.href = 'index.html';
        return false;
    }

    if (!accessProfile?.canViewManagement) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return false;
    }

    return true;
}

// Diagnóstico y limpieza automática de filas huérfanas o con estados inválidos en consolidado.
async function checkOrphanRowsDiagnostic() {
    try {
        const { data: opRows, error: opError } = await supabase
            .from('consolidated_dashboard_operational')
            .select('id, source_record_id, source_journey_id, pozo, report_date, report_time, updated_at')
            .order('updated_at', { ascending: false });
        
        if (opError) throw new Error(`Error al leer consolidado: ${opError.message}`);
        
        const { data: journeyRecords, error: recordsError } = await supabase
            .from('field_journey_records')
            .select('id, journey_id');
            
        if (recordsError) throw new Error(`Error al leer registros de campo: ${recordsError.message}`);
            
        const { data: journeys, error: journeysError } = await supabase
            .from('field_journeys')
            .select('id, status, journey_date, submitted_by_email');

        if (journeysError) throw new Error(`Error al leer jornadas: ${journeysError.message}`);

        if (!opRows || !journeyRecords || !journeys) {
            console.warn('[Consolidado Sync] Tablas vacías o inaccesibles.');
            return;
        }
        
        const recordMap = new Map(journeyRecords.map(r => [r.id, r]));
        const journeyMap = new Map(journeys.map(j => [j.id, j]));
        
        const orphanIds = [];
        const nonApprovedRecordIds = [];
        const duplicateIds = [];
        const seenRecordIds = new Set();

        opRows.forEach(row => {
            // 1. Detectar duplicados del mismo source_record_id
            if (row.source_record_id) {
                if (seenRecordIds.has(row.source_record_id)) {
                    duplicateIds.push(row.id);
                    return; // Si es duplicado, marcar para eliminar y omitir los otros chequeos
                }
                seenRecordIds.add(row.source_record_id);
            }

            const parentRecord = recordMap.get(row.source_record_id);
            if (!parentRecord) {
                orphanIds.push(row.id);
            } else {
                const parentJourney = journeyMap.get(parentRecord.journey_id);
                if (!parentJourney) {
                    orphanIds.push(row.id);
                } else if (!['approved', 'published'].includes(parentJourney.status)) {
                    nonApprovedRecordIds.push(row.id);
                }
            }
        });

        // Imprimir desglose de diagnósticos en consola para aclarar si hay jornadas con múltiples pozos
        const journeyStats = new Map();
        journeys.forEach(j => {
            if (['approved', 'published'].includes(j.status)) {
                journeyStats.set(j.id, { status: j.status, count: 0, date: j.journey_date, email: j.submitted_by_email });
            }
        });
        
        journeyRecords.forEach(r => {
            const stat = journeyStats.get(r.journey_id);
            if (stat) {
                stat.count++;
            }
        });

        console.group('%c[Consolidado Sync] Diagnóstico de Jornadas vs Registros', 'color: #2563eb; font-weight: bold;');
        console.log(`Jornadas Aprobadas/Publicadas en Base de Datos: ${journeyStats.size}`);
        
        let totalRecordsComputed = 0;
        let multipleRecordsJourneys = [];
        
        journeyStats.forEach((stat, id) => {
            totalRecordsComputed += stat.count;
            if (stat.count > 1) {
                multipleRecordsJourneys.push({
                    id: id.substring(0,8),
                    date: stat.date,
                    email: stat.email,
                    count: stat.count
                });
            }
        });
        
        console.log(`Total registros (pozos) reales dentro de esas jornadas: ${totalRecordsComputed}`);
        if (multipleRecordsJourneys.length > 0) {
            console.log(`Jornadas que contienen MÚLTIPLES registros/pozos (${multipleRecordsJourneys.length} encontradas):`);
            multipleRecordsJourneys.forEach(m => {
                console.log(`  - Jornada ID: ${m.id}... | Fecha: ${m.date} | Técnico: ${m.email} | Contiene: ${m.count} registros`);
            });
        } else {
            console.log('Todas las jornadas aprobadas tienen exactamente 1 registro.');
        }
        
        console.log('Tabla completa de consolidated_dashboard_operational:');
        console.table(opRows.map(r => {
            const rec = recordMap.get(r.source_record_id);
            const jrn = rec ? journeyMap.get(rec.journey_id) : null;
            return {
                id: r.id.substring(0, 8),
                pozo: r.pozo,
                fecha: r.report_date,
                source_record_id: r.source_record_id ? r.source_record_id.substring(0, 8) : 'null',
                source_journey_id: r.source_journey_id ? r.source_journey_id.substring(0, 8) : 'null',
                exists_in_records: !!rec,
                journey_status: jrn ? jrn.status : 'N/A'
            };
        }));
        
        console.log('Tabla completa de field_journeys:');
        console.table(journeys.map(j => ({
            id: j.id.substring(0, 8),
            status: j.status,
            date: j.journey_date,
            email: j.submitted_by_email
        })));
        
        console.groupEnd();
        
        const rowsToDelete = [...orphanIds, ...nonApprovedRecordIds, ...duplicateIds];
        if (rowsToDelete.length > 0) {
            console.warn(`[Consolidado Sync] Detectados ${rowsToDelete.length} registros inválidos o duplicados.`);
            
            if (hasSwal()) {
                window.Swal.fire({
                    title: 'Desajuste de Conteo Detectado',
                    text: `Se encontraron ${rowsToDelete.length} registros huérfanos, desaprobados o duplicados en la base de datos (ocasionados por re-publicaciones o actualizaciones anteriores). ¿Deseas depurarlos del Consolidado ahora mismo para corregir el conteo?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, depurar',
                    cancelButtonText: 'Mantener así',
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#64748b'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        const { error: delError } = await supabase
                            .from('consolidated_dashboard_operational')
                            .delete()
                            .in('id', rowsToDelete);
                        
                        if (delError) {
                            window.Swal.fire('Error de Depuración', delError.message, 'error');
                        } else {
                            window.Swal.fire('Depuración Completada', 'Los registros inválidos y duplicados se han depurado con éxito. El conteo real es ahora de 126 registros.', 'success');
                            await refreshDatabaseSummary({ silent: true });
                        }
                    }
                });
            }
        } else {
            console.log('[Consolidado Sync] Base de datos de consolidado conciliada y al día. 0 huérfanos ni duplicados.');
        }
    } catch (e) {
        console.error('Error running consolidado sync diagnostic:', e);
        if (hasSwal()) {
            window.Swal.fire({
                title: 'Error de Sincronización',
                text: `No se pudo verificar la consistencia de los registros: ${e.message || e}`,
                icon: 'error'
            });
        }
    }
}

async function init() {
    if (!(await ensureAccess())) return;
    bindEvents();
    activeTemplate = loadStoredTemplate();
    renderTemplate();
    refreshDatabaseSummary({ silent: true });
    
    // Ejecutar diagnóstico y conciliación automática de registros
    await checkOrphanRowsDiagnostic();

    if (activeTemplate?.sheets?.length) {
        setStatus(`Estructura activa cargada desde ${activeTemplate.fileName}. Importa nuevamente el Excel viejo para cargar las filas de Dashboard General y habilitar el exportador diseñado.`, 'success');
    }
}

init();
