import { logout, getSession, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
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

function buildUniqueColumns(headerRow = []) {
    const seen = new Map();
    return headerRow.reduce((columns, cell, columnIndex) => {
        const baseName = normalizeCell(cell);
        if (!baseName) return columns;

        const seenCount = seen.get(baseName) || 0;
        seen.set(baseName, seenCount + 1);

        columns.push({
            key: `${getColumnLetter(columnIndex)}_${baseName}`,
            letter: getColumnLetter(columnIndex),
            name: seenCount ? `${baseName} (${seenCount + 1})` : baseName,
            originalName: baseName,
            index: columnIndex
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
        const columns = buildUniqueColumns(headerRow);

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
    if (!elements.dbSummary) return;

    if (!consolidatedSummary) {
        elements.dbSummary.innerHTML = `
            <div><span>Guardado</span><strong>--</strong></div>
            <div><span>Base histórica</span><strong>--</strong></div>
            <div><span>Nuevo Campo</span><strong>--</strong></div>
        `;
        return;
    }

    elements.dbSummary.innerHTML = `
        <div><span>Guardado</span><strong>${consolidatedSummary.total}</strong></div>
        <div><span>Base histórica</span><strong>${consolidatedSummary.legacyCount}</strong></div>
        <div><span>Nuevo Campo</span><strong>${consolidatedSummary.fieldJourneyCount}</strong></div>
    `;
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
    if (elements.exportDbButton) elements.exportDbButton.disabled = isBusy || !consolidatedSummary?.total;
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

function buildExportColumnsFromStoredRows(rows = [], source = 'base') {
    const labels = [];
    const seen = new Set();
    const baseColumns = getBaseTemplateColumns();

    baseColumns.forEach(column => addStoredColumnLabel(labels, seen, column.originalName || column.name));

    if ((source === 'base' || source === 'completo') && labels.length > 0) {
        return mapLabelsToColumns(labels);
    }

    rows.forEach(row => {
        const rowLabels = Array.isArray(row.column_labels) ? row.column_labels : [];
        rowLabels.forEach(label => addStoredColumnLabel(labels, seen, label));
    });

    rows.forEach(row => {
        Object.keys(row.row_data || {}).forEach(label => addStoredColumnLabel(labels, seen, label));
    });

    return mapLabelsToColumns(labels);
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

function getStoredRowExportValue(storedRow = {}, label = '') {
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
    if (rowData[label] !== undefined) return rowData[label];

    const normalizedIdentity = normalizeColumnIdentity(label);
    const matchingKey = Object.keys(rowData).find(key => normalizeColumnIdentity(key) === normalizedIdentity || normalizeSheetName(key) === normalizedLabel);
    return matchingKey ? rowData[matchingKey] : '';
}

function buildRowsFromStoredRows(storedRows = [], columns = []) {
    return storedRows.map(storedRow => columns.map(column => getStoredRowExportValue(storedRow, column.originalName)));
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

        setBusyState(true);
        showLoadingModal('Exportando consolidado guardado', 'Leyendo filas desde Supabase para generar el Dashboard General.', `Origen: ${getExportSourceLabel(filters.source)} · Modo: ${getExportModeLabel(filters.mode)}.`);
        setStatus('Consultando filas guardadas del consolidado maestro...', 'neutral');

        const storedRows = await fetchConsolidatedDashboardRows(filters);
        if (!storedRows.length) {
            throw new Error('No hay filas guardadas que coincidan con los filtros seleccionados.');
        }

        updateLoadingModal('Preparando columnas y filas...', `${storedRows.length} filas recuperadas desde Supabase.`);
        const columns = buildExportColumnsFromStoredRows(storedRows, filters.source);
        const rows = buildRowsFromStoredRows(storedRows, columns);
        const sourceSheet = { name: DASHBOARD_GENERAL_SHEET_NAME, columns };

        await exportDashboardWorkbook({
            columns,
            rows,
            sourceSheet,
            filePrefix: 'UV_CONSOLIDADO_DB_DASHBOARD_GENERAL',
            sourceLabel: `Origen: ${getExportSourceLabel(filters.source)} · Modo: ${getExportModeLabel(filters.mode)} · Filas: ${rows.length} · Generado: ${new Date().toLocaleString('es-ES')}`,
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
        setBusyState(true);
        showLoadingModal('Generando Excel', 'Armando el Dashboard General con logo, colores y columnas detectadas.', `${activeDashboardRows.length} filas en memoria.`);
        setStatus('Generando Dashboard General con logo, colores y estructura empresarial...', 'neutral');
        const columns = dashboardSheet.columns || [];
        await exportDashboardWorkbook({
            columns,
            rows: activeDashboardRows,
            sourceSheet: dashboardSheet,
            filePrefix: 'UV_CONSOLIDADO_DASHBOARD_GENERAL',
            sourceLabel: `Origen: ${activeTemplate?.fileName || '--'} · Hoja base: ${dashboardSheet?.name || '--'} · Generado: ${new Date().toLocaleString('es-ES')}`,
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

    const worksheet = workbook.addWorksheet(DASHBOARD_GENERAL_SHEET_NAME, {
        views: [{ state: 'frozen', ySplit: TABLE_HEADER_ROW_INDEX, xSplit: 4, topLeftCell: `E${TABLE_HEADER_ROW_INDEX + 1}`, activeCell: `E${TABLE_HEADER_ROW_INDEX + 1}` }]
    });

    const totalColumns = Math.max(columns.length, 12);
    const lastColumn = Math.min(totalColumns, 16384);

    updateLoadingModal('Insertando logo y encabezado empresarial...', 'Preparando el diseño del archivo.');
    await addLogoToWorksheet(workbook, worksheet);
    buildWorkbookHeader(worksheet, lastColumn, sourceSheet, sourceLabel, rows.length, columns.length);
    updateLoadingModal('Pintando tabla y aplicando filtros...', `${columns.length} columnas detectadas.`);
    buildDashboardTable(worksheet, columns, rows, emptyMessage);
    finishWorksheetLayout(worksheet, columns);

    updateLoadingModal('Creando archivo descargable...', 'La descarga iniciará automáticamente.');
    const buffer = await workbook.xlsx.writeBuffer();
    const fileDate = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([buffer], { type: EXCEL_MIME_TYPE }), `${filePrefix}_${fileDate}.xlsx`);
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
    const headerRow = worksheet.getRow(TABLE_HEADER_ROW_INDEX);
    headerRow.height = 34;

    columns.forEach((column, columnIndex) => {
        const cell = headerRow.getCell(columnIndex + 1);
        cell.value = column.originalName || column.name;
        cell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${getHeaderFillColor(cell.value, columnIndex)}` } };
        cell.border = buildThinBorder('FF1E293B');
    });

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
            cell.value = row[columnIndex] ?? '';
            cell.font = { name: 'Calibri', size: 8, color: { argb: 'FF0F172A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${getBodyFillColor(column.originalName || column.name, rowIndex)}` } };
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

async function init() {
    if (!(await ensureAccess())) return;
    bindEvents();
    activeTemplate = loadStoredTemplate();
    renderTemplate();
    window.setTimeout(showExportMaintenanceNotice, 120);
    refreshDatabaseSummary({ silent: true });

    if (activeTemplate?.sheets?.length) {
        setStatus(`Estructura activa cargada desde ${activeTemplate.fileName}. Importa nuevamente el Excel viejo para cargar las filas de Dashboard General y habilitar el exportador diseñado.`, 'success');
    }
}

init();
