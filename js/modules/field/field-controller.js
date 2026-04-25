import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from '../../auth.js';
import { buildFieldWhatsappMessage } from './field-formatters.js';
import { validateFieldReport } from './field-validation.js';
import { saveFieldJourneyReports } from '../../services/field-journey-service.js';

const DRAFT_STORAGE_KEY = 'uv-field-draft';
const JOURNEY_REPORTS_STORAGE_KEY = 'uv-field-journey-reports';
const JOURNEY_SYNC_META_STORAGE_KEY = 'uv-field-journey-sync-meta';
const PENDING_HISTORY_EDIT_STORAGE_KEY = 'uv-field-pending-history-edit';
const PENDING_HISTORY_CONTINUE_STORAGE_KEY = 'uv-field-pending-history-continue';
const CONTINUING_JOURNEY_META_STORAGE_KEY = 'uv-field-continuing-journey-meta';
let currentEditingReportId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (!accessProfile.canViewFieldModule) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    document.body.classList.toggle('access-readonly', accessProfile.isReadOnly);

    bindStaticActions();
    preloadDefaults();
    restorePendingHistoryEdit();
    restorePendingHistoryContinue();
    restoreDraft();
    wireForm();
    syncAddButtonState();
    renderJourneyReports();
    renderContinueJourneyBanner();
    updatePreview();
});

function bindStaticActions() {
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('field-clear-form-btn')?.addEventListener('click', clearForm);
    document.getElementById('field-add-report-btn')?.addEventListener('click', addCurrentReportToJourney);
    document.getElementById('field-copy-btn')?.addEventListener('click', copyMessage);
    document.getElementById('field-whatsapp-btn')?.addEventListener('click', openWhatsApp);
    document.getElementById('field-save-supabase-btn')?.addEventListener('click', saveJourneyToSupabase);
    document.getElementById('field-export-pdf-btn')?.addEventListener('click', exportJourneyToPdf);
    document.getElementById('field-export-xlsx-btn')?.addEventListener('click', exportJourneyToExcel);
}

function preloadDefaults() {
    const dateInput = document.getElementById('field-fecha');
    const timeInput = document.getElementById('field-hora');
    const now = new Date();

    if (dateInput && !dateInput.value) {
        dateInput.value = now.toISOString().slice(0, 10);
    }

    if (timeInput && !timeInput.value) {
        timeInput.value = now.toTimeString().slice(0, 5);
    }
}

function wireForm() {
    const form = document.getElementById('field-report-form');
    if (!form) return;

    form.addEventListener('input', () => {
        persistDraft();
        updatePreview();
    });

    form.addEventListener('change', () => {
        persistDraft();
        updatePreview();
    });
}

function getFormPayload() {
    const form = document.getElementById('field-report-form');
    const formData = new FormData(form);
    return Object.fromEntries(formData.entries());
}

function updatePreview() {
    const payload = getFormPayload();
    const validation = validateFieldReport(payload);
    const message = buildPreviewMessage(payload);

    const preview = document.getElementById('field-message-preview');
    const status = document.getElementById('field-form-status');

    if (preview) {
        preview.textContent = message;
    }

    if (status) {
        status.classList.toggle('is-error', !validation.isValid);
        status.classList.toggle('is-success', validation.isValid);
        status.textContent = validation.isValid
            ? 'Mensaje listo para compartir.'
            : validation.message;
    }
}

async function copyMessage() {
    const message = buildJourneyShareMessage();
    if (!message) {
        showValidationAlert('Agrega al menos un pozo a la jornada antes de copiar el mensaje.', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(message);
        showValidationAlert('Mensaje consolidado de la jornada copiado al portapapeles.', 'success');
    } catch (error) {
        showValidationAlert('No se pudo copiar el mensaje automáticamente.', 'error');
    }
}

function openWhatsApp() {
    const message = buildJourneyShareMessage();
    if (!message) {
        showValidationAlert('Agrega al menos un pozo a la jornada antes de abrir WhatsApp.', 'warning');
        return;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
}

function persistDraft() {
    const payload = getFormPayload();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
        const payload = JSON.parse(raw);
        Object.entries(payload).forEach(([key, value]) => {
            const field = document.querySelector(`[name="${key}"]`);
            if (field) {
                field.value = value;
            }
        });
    } catch (error) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
}

function restorePendingHistoryEdit() {
    const raw = localStorage.getItem(PENDING_HISTORY_EDIT_STORAGE_KEY);
    if (!raw) return;

    try {
        const report = JSON.parse(raw);
        const normalizedReport = normalizeHistoryReportForField(report);
        if (!normalizedReport?.id) {
            localStorage.removeItem(PENDING_HISTORY_EDIT_STORAGE_KEY);
            return;
        }

        currentEditingReportId = normalizedReport.id;
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(normalizedReport));
        localStorage.setItem(JOURNEY_REPORTS_STORAGE_KEY, JSON.stringify([normalizedReport]));
        localStorage.removeItem(JOURNEY_SYNC_META_STORAGE_KEY);
        localStorage.removeItem(CONTINUING_JOURNEY_META_STORAGE_KEY);
        localStorage.removeItem(PENDING_HISTORY_EDIT_STORAGE_KEY);
    } catch (error) {
        localStorage.removeItem(PENDING_HISTORY_EDIT_STORAGE_KEY);
    }
}

function restorePendingHistoryContinue() {
    const raw = localStorage.getItem(PENDING_HISTORY_CONTINUE_STORAGE_KEY);
    if (!raw) return;

    try {
        const reports = JSON.parse(raw);
        const normalizedReports = (Array.isArray(reports) ? reports : [])
            .map(normalizeHistoryReportForField)
            .filter(report => report?.id);

        if (normalizedReports.length === 0) {
            localStorage.removeItem(PENDING_HISTORY_CONTINUE_STORAGE_KEY);
            return;
        }

        const baseReport = normalizedReports[0];
        const nextDraft = buildNextDraftFromJourney(baseReport);

        currentEditingReportId = null;
        localStorage.setItem(JOURNEY_REPORTS_STORAGE_KEY, JSON.stringify(normalizedReports));
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
        localStorage.setItem(CONTINUING_JOURNEY_META_STORAGE_KEY, JSON.stringify({
            locacion_jornada: baseReport.locacion_jornada || '',
            jornada: baseReport.jornada || '',
            fecha: baseReport.fecha || '',
            pozoCount: normalizedReports.length
        }));
        localStorage.removeItem(JOURNEY_SYNC_META_STORAGE_KEY);
        localStorage.removeItem(PENDING_HISTORY_CONTINUE_STORAGE_KEY);
        showValidationAlert(`Jornada ${String(baseReport.jornada || '--')} cargada. Ya puedes agregar otro pozo.`, 'success');
    } catch (error) {
        localStorage.removeItem(PENDING_HISTORY_CONTINUE_STORAGE_KEY);
    }
}

function clearForm() {
    const form = document.getElementById('field-report-form');
    if (!form) return;

    form.reset();
    currentEditingReportId = null;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    preloadDefaults();
    syncAddButtonState();
    syncSaveButtonState(getJourneyReports());
    renderContinueJourneyBanner();
    updatePreview();
}

function clearPozoFieldsForNextCapture() {
    const fieldNames = [
        'hora',
        'pozo',
        'hz',
        'sentido_giro',
        'v_vsd',
        'i_mot',
        'v_mot',
        'thp',
        'lf',
        'chp',
        'pi',
        'pd',
        'ti',
        'tm',
        'ivsd_a',
        'ivsd_b',
        'ivsd_c',
        'comentario'
    ];

    fieldNames.forEach(name => {
        const field = document.querySelector(`[name="${name}"]`);
        if (!field) return;

        if (field.tagName === 'SELECT') {
            field.selectedIndex = 0;
        } else {
            field.value = '';
        }
    });

    const now = new Date();
    const timeInput = document.getElementById('field-hora');
    if (timeInput) {
        timeInput.value = now.toTimeString().slice(0, 5);
    }

    persistDraft();
}

function buildNextDraftFromJourney(report = {}) {
    const now = new Date();

    return {
        equipo_guardia: report.equipo_guardia || '',
        locacion_jornada: report.locacion_jornada || '',
        fecha: report.fecha || now.toISOString().slice(0, 10),
        jornada: report.jornada || 'Diurna',
        hora: now.toTimeString().slice(0, 5),
        pozo: '',
        hz: '',
        sentido_giro: 'FWD',
        v_vsd: '',
        i_mot: '',
        v_mot: '',
        thp: '',
        lf: '',
        chp: '',
        pi: '',
        pd: '',
        ti: '',
        tm: '',
        ivsd_a: '',
        ivsd_b: '',
        ivsd_c: '',
        comentario: ''
    };
}

function addCurrentReportToJourney() {
    const payload = getFormPayload();
    const validation = validateFieldReport(payload);

    if (!validation.isValid) {
        showValidationAlert(validation.message, 'warning');
        return;
    }

    const reports = getJourneyReports();
    const reportRecord = {
        id: currentEditingReportId || crypto.randomUUID(),
        ...payload,
        message: buildFieldWhatsappMessage(payload),
        createdAt: currentEditingReportId
            ? reports.find(report => report.id === currentEditingReportId)?.createdAt || new Date().toISOString()
            : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (currentEditingReportId) {
        const reportIndex = reports.findIndex(report => report.id === currentEditingReportId);
        if (reportIndex !== -1) {
            reports[reportIndex] = reportRecord;
        }
    } else {
        reports.push(reportRecord);
    }

    localStorage.setItem(JOURNEY_REPORTS_STORAGE_KEY, JSON.stringify(reports));
    const wasEditing = Boolean(currentEditingReportId);
    currentEditingReportId = null;
    clearPozoFieldsForNextCapture();
    syncAddButtonState();
    renderJourneyReports();
    renderContinueJourneyBanner();
    updatePreview();
    document.getElementById('field-pozo')?.focus();
    showValidationAlert(wasEditing ? 'Pozo actualizado dentro de la jornada.' : 'Pozo agregado a la jornada. Ya puedes cargar el siguiente.', 'success');
}

function getJourneyReports() {
    const raw = localStorage.getItem(JOURNEY_REPORTS_STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        localStorage.removeItem(JOURNEY_REPORTS_STORAGE_KEY);
        return [];
    }
}

function renderJourneyReports() {
    const list = document.getElementById('field-journey-list');
    const count = document.getElementById('field-journey-count');
    if (!list || !count) return;

    const reports = getJourneyReports();
    syncSaveButtonState(reports);
    count.textContent = `${reports.length} ${reports.length === 1 ? 'pozo' : 'pozos'}`;

    if (reports.length === 0) {
        list.innerHTML = '<div class="field-journey-empty">Todavía no has agregado pozos a esta jornada.</div>';
        return;
    }

    list.innerHTML = reports.map(report => `
        <article class="field-journey-item">
            <div class="field-journey-item-top">
                <div>
                    <div class="field-journey-item-title">${escapeHtml(String(report.pozo || '').toUpperCase())}</div>
                    <div class="field-journey-item-meta">${escapeHtml(report.equipo_guardia || '--')} | ${escapeHtml(report.locacion_jornada || '--')} | ${escapeHtml(report.hora || '--')}</div>
                </div>
                <div class="field-journey-actions">
                    <button type="button" class="field-journey-edit" data-report-id="${report.id}">Editar</button>
                    <button type="button" class="field-journey-remove" data-report-id="${report.id}">Quitar</button>
                </div>
            </div>
            <div class="field-journey-item-summary">Hz ${escapeHtml(report.hz || '--')} | ${escapeHtml((report.sentido_giro || '--').toUpperCase())} | THP ${escapeHtml(report.thp || '--')} | LF ${escapeHtml(report.lf || '--')} | CHP ${escapeHtml(report.chp || '--')}</div>
        </article>
    `).join('');

    list.querySelectorAll('.field-journey-edit').forEach(button => {
        button.addEventListener('click', () => startEditingJourneyReport(button.dataset.reportId));
    });

    list.querySelectorAll('.field-journey-remove').forEach(button => {
        button.addEventListener('click', () => removeJourneyReport(button.dataset.reportId));
    });
}

function startEditingJourneyReport(reportId) {
    const report = getJourneyReports().find(item => item.id === reportId);
    if (!report) {
        showValidationAlert('No se encontró el pozo seleccionado para editar.', 'error');
        return;
    }

    Object.entries(report).forEach(([key, value]) => {
        const field = document.querySelector(`[name="${key}"]`);
        if (field) {
            field.value = value ?? '';
        }
    });

    currentEditingReportId = reportId;
    persistDraft();
    syncAddButtonState();
    updatePreview();
    document.getElementById('field-report-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showValidationAlert(`Editando el pozo ${String(report.pozo || '').toUpperCase()}. Guarda para actualizar la jornada.`, 'info');
}

function removeJourneyReport(reportId) {
    const reports = getJourneyReports().filter(report => report.id !== reportId);
    localStorage.setItem(JOURNEY_REPORTS_STORAGE_KEY, JSON.stringify(reports));

    if (currentEditingReportId === reportId) {
        currentEditingReportId = null;
    }

    syncAddButtonState();
    renderJourneyReports();
    renderContinueJourneyBanner();
    updatePreview();
}

function syncAddButtonState() {
    const addButton = document.getElementById('field-add-report-btn');
    const clearButton = document.getElementById('field-clear-form-btn');
    if (!addButton) return;

    addButton.textContent = currentEditingReportId ? 'Guardar cambios del pozo' : 'Agregar pozo a la jornada';

    if (clearButton) {
        clearButton.hidden = false;
    }
}

function buildPreviewMessage(payload) {
    const reports = getJourneyReports();
    if (hasCurrentDraftContent(payload)) {
        return buildFieldWhatsappMessage(payload);
    }

    if (reports.length === 0) {
        return buildFieldWhatsappMessage(payload);
    }

    return buildJourneyMessageFromReports(reports);
}

function hasCurrentDraftContent(payload = {}) {
    const meaningfulFields = [
        'pozo',
        'hz',
        'v_vsd',
        'i_mot',
        'v_mot',
        'thp',
        'lf',
        'chp',
        'pi',
        'pd',
        'ti',
        'tm',
        'ivsd_a',
        'ivsd_b',
        'ivsd_c',
        'comentario'
    ];

    return meaningfulFields.some(fieldName => String(payload?.[fieldName] ?? '').trim() !== '');
}

function buildJourneyShareMessage() {
    const reports = getJourneyReports();
    if (reports.length === 0) return '';
    return buildJourneyMessageFromReports(reports);
}

function buildJourneyMessageFromReports(reports = []) {
    const orderedReports = [...reports].sort((left, right) => String(left.hora || '').localeCompare(String(right.hora || '')));
    const firstReport = orderedReports[0] || {};
    const header = [
        `Equipo de guardia: ${String(firstReport.equipo_guardia || '--')}`,
        `Locacion: ${String(firstReport.locacion_jornada || '--')}`,
        `Fecha: ${String(firstReport.fecha || '--')}`,
        `Jornada: ${String(firstReport.jornada || '--')}`,
        `Pozos monitoreados: ${orderedReports.length}`,
        ''
    ];

    const body = orderedReports.flatMap((report, index) => {
        return [
            `Pozo ${index + 1}`,
            `Hora: ${formatMessageValue(report.hora)}`,
            `Pozo: ${formatMessageValue(report.pozo).toUpperCase()}`,
            `Hz: ${formatMessageValue(report.hz)}`,
            formatMessageValue(report.sentido_giro, 'FWD').toUpperCase(),
            `I vsd: ${[
                formatMessageValue(report.ivsd_a),
                formatMessageValue(report.ivsd_b),
                formatMessageValue(report.ivsd_c)
            ].join(' ')} amp`,
            `V vsd: ${formatMessageValue(report.v_vsd)} volt`,
            `I mot: ${formatMessageValue(report.i_mot)}`,
            `V mot: ${formatMessageValue(report.v_mot)}`,
            `PI: ${formatMessageValue(report.pi)}`,
            `PD: ${formatMessageValue(report.pd)}`,
            `TI: ${formatMessageValue(report.ti)}`,
            `TM: ${formatMessageValue(report.tm)}`,
            `THP: ${formatMessageValue(report.thp)}`,
            `LF: ${formatMessageValue(report.lf)}`,
            `CHP: ${formatMessageValue(report.chp)}`,
            '',
            `Comentario: ${formatMessageValue(report.comentario)}`,
            ''
        ];
    });

    return [...header, ...body].join('\n').trim();
}

function formatMessageValue(value, fallback = '--') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function syncSaveButtonState(reportsOrHasReports) {
    const saveButton = document.getElementById('field-save-supabase-btn');
    if (!saveButton) return;

    const reports = Array.isArray(reportsOrHasReports) ? reportsOrHasReports : getJourneyReports();
    const hasReports = Array.isArray(reportsOrHasReports) ? reports.length > 0 : Boolean(reportsOrHasReports);

    saveButton.disabled = !hasReports;
    const syncMeta = getJourneySyncMeta();
    const currentSignature = buildJourneySyncSignature(reports);

    if (syncMeta?.syncedAt && syncMeta?.signature === currentSignature && hasReports) {
        saveButton.textContent = `Sincronizado ${formatSyncTimestamp(syncMeta.syncedAt)}`;
        return;
    }

    saveButton.textContent = 'Guardar Jornada';
}

async function saveJourneyToSupabase() {
    const reports = getJourneyReports();
    if (reports.length === 0) {
        showValidationAlert('No hay pozos en la jornada para guardar en Supabase.', 'warning');
        return;
    }

    const saveButton = document.getElementById('field-save-supabase-btn');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Guardando Jornada...';
    }

    try {
        const result = await saveFieldJourneyReports(reports);
        const syncMeta = {
            syncedAt: result.syncedAt,
            reportCount: reports.length,
            signature: buildJourneySyncSignature(reports)
        };
        localStorage.setItem(JOURNEY_SYNC_META_STORAGE_KEY, JSON.stringify(syncMeta));
        syncSaveButtonState(reports);
        resetJourneyWorkspace();
        window.location.href = 'jornada-history.html?saved=1';
    } catch (error) {
        syncSaveButtonState(reports);
        showValidationAlert(error.message || 'No se pudo guardar la jornada en Supabase.', 'error');
    }
}

function resetJourneyWorkspace() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(JOURNEY_REPORTS_STORAGE_KEY);
    localStorage.removeItem(JOURNEY_SYNC_META_STORAGE_KEY);
    localStorage.removeItem(PENDING_HISTORY_EDIT_STORAGE_KEY);
    localStorage.removeItem(CONTINUING_JOURNEY_META_STORAGE_KEY);
    currentEditingReportId = null;

    const form = document.getElementById('field-report-form');
    if (form) {
        form.reset();
    }

    preloadDefaults();
    syncAddButtonState();
    renderJourneyReports();
    renderContinueJourneyBanner();
    updatePreview();
}

function renderContinueJourneyBanner() {
    const banner = document.getElementById('field-continue-banner');
    if (!banner) return;

    const raw = localStorage.getItem(CONTINUING_JOURNEY_META_STORAGE_KEY);
    const reports = getJourneyReports();
    if (!raw || reports.length === 0) {
        banner.hidden = true;
        banner.textContent = '';
        if (reports.length === 0) {
            localStorage.removeItem(CONTINUING_JOURNEY_META_STORAGE_KEY);
        }
        return;
    }

    try {
        const meta = JSON.parse(raw);
        const pozoCount = Number(meta.pozoCount || reports.length);
        banner.hidden = false;
        banner.innerHTML = `<strong>Continuando jornada:</strong> ${escapeHtml(String(meta.locacion_jornada || '--'))} · ${escapeHtml(String(meta.jornada || '--'))} · ${escapeHtml(formatBannerDate(meta.fecha))} · ${escapeHtml(String(pozoCount))} ${pozoCount === 1 ? 'pozo cargado' : 'pozos cargados'}`;
    } catch (error) {
        banner.hidden = true;
        banner.textContent = '';
        localStorage.removeItem(CONTINUING_JOURNEY_META_STORAGE_KEY);
    }
}

function formatBannerDate(value) {
    if (!value) return '--';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getJourneySyncMeta() {
    const raw = localStorage.getItem(JOURNEY_SYNC_META_STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        localStorage.removeItem(JOURNEY_SYNC_META_STORAGE_KEY);
        return null;
    }
}

function formatSyncTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'reciente';
    }

    return date.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function buildJourneySyncSignature(reports = []) {
    return (Array.isArray(reports) ? reports : [])
        .map(report => [
            String(report.id || ''),
            String(report.updatedAt || report.createdAt || ''),
            String(report.pozo || ''),
            String(report.hora || ''),
            String(report.hz || '')
        ].join('|'))
        .sort()
        .join('||');
}

function exportJourneyToExcel() {
    const reports = getJourneyReports();
    if (reports.length === 0) {
        showValidationAlert('No hay pozos en la jornada para exportar.', 'warning');
        return;
    }

    if (!window.XLSX) {
        showValidationAlert('La librería de Excel no está disponible en esta vista.', 'error');
        return;
    }

    const exportRows = reports.map(report => ({
        Fecha: report.fecha || '',
        Hora: report.hora || '',
        Jornada: report.jornada || '',
        'Equipo de guardia': report.equipo_guardia || '',
        Locacion: report.locacion_jornada || '',
        Pozo: report.pozo || '',
        Hz: report.hz || '',
        Sentido: report.sentido_giro || '',
        'V VSD': report.v_vsd || '',
        'I Motor': report.i_mot || '',
        'V Motor': report.v_mot || '',
        THP: report.thp || '',
        LF: report.lf || '',
        CHP: report.chp || '',
        PI: report.pi || '',
        PD: report.pd || '',
        TI: report.ti || '',
        TM: report.tm || '',
        'I VSD A': report.ivsd_a || '',
        'I VSD B': report.ivsd_b || '',
        'I VSD C': report.ivsd_c || '',
        Comentario: report.comentario || ''
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'jornada_campo');
    window.XLSX.writeFile(workbook, buildJourneyFileName('xlsx'));
}

async function exportJourneyToPdf() {
    const reports = getJourneyReports();
    if (reports.length === 0) {
        showValidationAlert('No hay pozos en la jornada para exportar.', 'warning');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        showValidationAlert('La librería de PDF no está disponible en esta vista.', 'error');
        return;
    }

    const firstReport = reports[0] || {};
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 32;
    const logoDataUrl = await loadLogoForPdf();

    const drawHeader = () => {
        pdf.setFillColor(13, 33, 94);
        pdf.rect(0, 0, pageWidth, 112, 'F');
        pdf.setFillColor(227, 33, 78);
        pdf.rect(0, 112, pageWidth, 8, 'F');

        if (logoDataUrl) {
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(marginX, 24, 84, 84, 18, 18, 'F');
            pdf.addImage(logoDataUrl, 'PNG', marginX + 10, 34, 64, 64);
        }

        const titleOffsetX = logoDataUrl ? marginX + 104 : marginX;
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(28);
        pdf.text('UV Servicios Campo', titleOffsetX, 50);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Monitoreo BES - Reporte operativo de jornada', titleOffsetX, 76);

        drawPdfBadge(pdf, pageWidth - 170, 28, 138, 28, '#FFFFFF', '#0D215E', `${reports.length} ${reports.length === 1 ? 'pozo' : 'pozos'} monitoreados`);

        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(marginX, 142, pageWidth - (marginX * 2), 124, 20, 20, 'F');
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(1);
        pdf.roundedRect(marginX, 142, pageWidth - (marginX * 2), 124, 20, 20, 'S');

        drawMetaColumn(pdf, marginX + 22, 164, 248, [
            ['Fecha', formatPdfDate(firstReport.fecha)],
            ['Locación', String(firstReport.locacion_jornada || '--')],
            ['Jornada', String(firstReport.jornada || '--')]
        ]);

        drawMetaColumn(pdf, marginX + 318, 164, 236, [
            ['Equipo de guardia', String(firstReport.equipo_guardia || '--')],
            ['Resumen', 'Monitoreo de parámetros BES'],
            ['Generado', formatPdfDateTime(new Date().toISOString())]
        ]);

        drawPdfBadge(pdf, pageWidth - 226, 168, 176, 30, '#FDF2F8', '#BE123C', buildPdfBadgeText(firstReport));
    };

    const drawFooter = () => {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.8);
        pdf.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text('UV Servicios - Reporte generado automáticamente desde Campo', marginX, pageHeight - 18);
        pdf.text(`Página ${pdf.getNumberOfPages()}`, pageWidth - marginX - 42, pageHeight - 18);
    };

    drawHeader();
    drawFooter();

    const tableRows = reports.map(report => ([
        String(report.hora || '--'),
        String(report.pozo || '').toUpperCase() || '--',
        'RUN',
        String(report.sentido_giro || '--').toUpperCase(),
        String(report.hz || '--'),
        String(report.i_mot || '--'),
        String(report.v_vsd || '--'),
        String(report.pi || '--'),
        String(report.pd || '--'),
        String(report.ti || '--'),
        String(report.tm || '--'),
        String(report.thp || '--'),
        String(report.lf || '--'),
        String(report.chp || '--'),
        String(report.comentario || 'Sin novedad reportada.')
    ]));

    pdf.autoTable({
        startY: 286,
        margin: { left: marginX, right: marginX, bottom: 48 },
        head: [[
            'Hora',
            'Pozo',
            'Estado',
            'Giro',
            'Hz',
            'I Mot',
            'V VSD',
            'PI',
            'PD',
            'TI',
            'TM',
            'THP',
            'LF',
            'CHP',
            'Comentario'
        ]],
        body: tableRows,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 8.5,
            cellPadding: 5,
            textColor: [31, 41, 55],
            lineColor: [226, 232, 240],
            lineWidth: 0.6,
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [26, 35, 126],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 40, halign: 'center' },
            1: { cellWidth: 58, halign: 'left' },
            2: { cellWidth: 38, halign: 'center' },
            3: { cellWidth: 38, halign: 'center' },
            4: { cellWidth: 32, halign: 'center' },
            5: { cellWidth: 40, halign: 'center' },
            6: { cellWidth: 44, halign: 'center' },
            7: { cellWidth: 34, halign: 'center' },
            8: { cellWidth: 34, halign: 'center' },
            9: { cellWidth: 34, halign: 'center' },
            10: { cellWidth: 34, halign: 'center' },
            11: { cellWidth: 34, halign: 'center' },
            12: { cellWidth: 34, halign: 'center' },
            13: { cellWidth: 34, halign: 'center' },
            14: { halign: 'left', cellWidth: 250 }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        didDrawPage: () => {
            drawHeader();
            drawFooter();
        }
    });

    const tableEndY = pdf.lastAutoTable?.finalY || 320;
    const notesTop = tableEndY + 18;
    const generalNotes = buildGeneralNotes(reports);

    if (notesTop > pageHeight - 120) {
        pdf.addPage();
        drawHeader();
        drawFooter();
    }

    const notesY = pdf.getCurrentPageInfo().pageNumber === pdf.getNumberOfPages() && notesTop <= pageHeight - 120 ? notesTop : 150;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(marginX, notesY, pageWidth - (marginX * 2), 72, 16, 16, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(marginX, notesY, pageWidth - (marginX * 2), 72, 16, 16, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Notas generales', marginX + 18, notesY + 24);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(generalNotes.summary, marginX + 18, notesY + 46, {
        maxWidth: pageWidth - (marginX * 2) - 36
    });

    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(71, 85, 105);
    pdf.text(generalNotes.detail, marginX + 18, notesY + 64, {
        maxWidth: pageWidth - (marginX * 2) - 36
    });

    pdf.save(buildJourneyFileName('pdf'));
}

function buildJourneyFileName(extension) {
    const firstReport = getJourneyReports()[0] || {};
    const datePart = String(firstReport.fecha || new Date().toISOString().slice(0, 10)).replaceAll('-', '');
    const locationPart = String(firstReport.locacion_jornada || 'campo')
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'campo';

    return `jornada_${locationPart}_${datePart}.${extension}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function showValidationAlert(message, icon) {
    if (window.Swal) {
        window.Swal.fire({
            icon,
            toast: false,
            text: message,
            confirmButtonColor: '#991b1b',
            background: '#fff7f7',
            color: '#0f172a'
        });
        return;
    }

    window.alert(message);
}

function formatPdfDate(value) {
    if (!value) return '--';

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function buildGeneralNotes(reports = []) {
    const comments = reports
        .map(report => String(report.comentario || '').trim())
        .filter(Boolean);

    const uniqueComments = [...new Set(comments)];
    const withCommentCount = comments.length;
    const withoutCommentCount = Math.max(reports.length - withCommentCount, 0);

    return {
        summary: `${reports.length} ${reports.length === 1 ? 'pozo monitoreado' : 'pozos monitoreados'} durante la jornada. ${withCommentCount > 0 ? `${withCommentCount} con observaciones operativas registradas.` : 'Sin observaciones particulares registradas.'}`,
        detail: uniqueComments.length <= 1
            ? (uniqueComments[0] || (withoutCommentCount > 0 ? 'Los registros sin comentario conservan condición operativa normal.' : 'Monitoreo de Pozos BES.'))
            : `${uniqueComments.length} novedades distintas detectadas. Cada comentario queda relacionado en la columna de comentario del reporte.`
    };
}

async function loadLogoForPdf() {
    const existingLogo = document.querySelector('.sidebar-logo');
    if (!existingLogo) return null;

    try {
        return await imageElementToDataUrl(existingLogo);
    } catch (error) {
        return null;
    }
}

function imageElementToDataUrl(imageElement) {
    return new Promise((resolve, reject) => {
        const source = imageElement.currentSrc || imageElement.src;
        if (!source) {
            reject(new Error('Logo no disponible.'));
            return;
        }

        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const context = canvas.getContext('2d');

            if (!context) {
                reject(new Error('No se pudo preparar el logo para el PDF.'));
                return;
            }

            context.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error('No se pudo cargar el logo para el PDF.'));
        image.src = source;
    });
}

function drawMetaColumn(pdf, originX, originY, valueMaxWidth, rows) {
    let currentY = originY;

    rows.forEach(([label, value]) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 41, 59);
        pdf.text(`${label}:`, originX, currentY);
        pdf.setFont('helvetica', 'normal');
        pdf.text(String(value || '--'), originX, currentY + 15, {
            maxWidth: valueMaxWidth
        });
        currentY += 36;
    });
}

function drawPdfBadge(pdf, x, y, width, height, fillColor, textColor, text) {
    const fillRgb = hexToRgb(fillColor);
    const textRgb = hexToRgb(textColor);

    pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    pdf.roundedRect(x, y, width, height, 12, 12, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(textRgb.r, textRgb.g, textRgb.b);
    pdf.text(String(text || ''), x + (width / 2), y + 18, {
        align: 'center',
        maxWidth: width - 16
    });
}

function hexToRgb(hexColor) {
    const hex = String(hexColor || '#000000').replace('#', '');
    const normalized = hex.length === 3
        ? hex.split('').map(char => char + char).join('')
        : hex.padEnd(6, '0').slice(0, 6);

    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
    };
}

function formatPdfDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--';
    }

    return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function buildPdfBadgeText(report = {}) {
    const location = String(report.locacion_jornada || 'campo')
        .trim()
        .toUpperCase()
        .replaceAll(/\s+/g, ' ')
        .slice(0, 18);
    const date = String(report.fecha || '').replaceAll('-', '/');
    return `${location || 'CAMPO'} | ${date || '--/--/----'}`;
}

function normalizeHistoryReportForField(report = {}) {
    return {
        id: String(report.client_report_id || report.id || crypto.randomUUID()),
        fecha: report.report_date || report.fecha || '',
        hora: formatTimeValue(report.report_time || report.hora || ''),
        jornada: report.jornada || 'Diurna',
        equipo_guardia: report.equipo_guardia || '',
        locacion_jornada: report.locacion_jornada || '',
        pozo: report.pozo || '',
        hz: toFieldString(report.hz),
        sentido_giro: report.sentido_giro || 'FWD',
        v_vsd: toFieldString(report.v_vsd),
        i_mot: toFieldString(report.i_mot),
        v_mot: toFieldString(report.v_mot),
        thp: toFieldString(report.thp),
        lf: toFieldString(report.lf),
        chp: toFieldString(report.chp),
        pi: toFieldString(report.pi),
        pd: toFieldString(report.pd),
        ti: toFieldString(report.ti),
        tm: toFieldString(report.tm),
        ivsd_a: toFieldString(report.ivsd_a),
        ivsd_b: toFieldString(report.ivsd_b),
        ivsd_c: toFieldString(report.ivsd_c),
        comentario: report.comentario || '',
        createdAt: report.created_at || report.createdAt || new Date().toISOString(),
        updatedAt: report.updated_at || report.updatedAt || new Date().toISOString()
    };
}

function toFieldString(value) {
    return value === null || value === undefined ? '' : String(value);
}

function formatTimeValue(value) {
    return String(value || '').slice(0, 5);
}