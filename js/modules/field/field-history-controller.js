import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from '../../auth.js';
import { getFieldJourneyHistory } from '../../services/field-journey-service.js';

const PENDING_HISTORY_CONTINUE_STORAGE_KEY = 'uv-field-pending-history-continue';
let historyRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (!accessProfile.canViewJourneyHistory) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('field-history-search')?.addEventListener('input', renderHistoryView);
    await loadJourneyHistory();
    maybeShowSavedMessage();
});

async function loadJourneyHistory() {
    const status = document.getElementById('field-history-status');
    const list = document.getElementById('field-history-list');
    if (!status || !list) return;

    try {
        const reports = await getFieldJourneyHistory();

        if (reports.length === 0) {
            renderLocalFallback(status, list);
            return;
        }

        historyRecords = reports.map(mapHistoryRecord);
        renderHistoryView();
    } catch (error) {
        const fallbackRendered = renderLocalFallback(status, list, error.message || 'No se pudo cargar el historial de jornadas.');
        if (!fallbackRendered) {
            historyRecords = [];
            status.textContent = error.message || 'No se pudo cargar el historial de jornadas.';
            list.innerHTML = '';
        }
    }
}

function renderLocalFallback(status, list, prefixMessage = 'No hay jornadas guardadas todavía.') {
    const localReports = getLocalJourneyReports();

    if (localReports.length === 0) {
        status.textContent = prefixMessage;
        list.innerHTML = `
            <div class="field-history-group field-history-empty">
                <div class="field-history-empty-icon">J</div>
                <h3>Aún no hay jornadas disponibles</h3>
                <p>Ve a Captura y Envío, agrega los pozos de la jornada y pulsa Guardar Jornada.</p>
                <a href="field.html" class="btn-submit field-inline-action">Crear nueva jornada</a>
            </div>
        `;
        return false;
    }

    historyRecords = localReports.map(mapLocalReportToHistoryShape).map(mapHistoryRecord);
    status.textContent = `${prefixMessage} Mostrando ${historyRecords.length} registro(s) encontrados solo en este navegador.`;
    renderHistoryView();
    return true;
}

function getLocalJourneyReports() {
    try {
        const raw = localStorage.getItem('uv-field-journey-reports');
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function mapLocalReportToHistoryShape(report) {
    return {
        ...report,
        report_date: report.fecha,
        report_time: report.hora,
        updated_at: report.updatedAt || report.createdAt || new Date().toISOString(),
        client_report_id: report.id
    };
}

function mapHistoryRecord(report) {
    return {
        ...report,
        journey_key: report.journey_key || buildJourneyKey(report),
        report_date: report.report_date || report.fecha,
        report_time: report.report_time || report.hora,
        updated_at: report.updated_at || report.updatedAt || report.createdAt || new Date().toISOString(),
        client_report_id: report.client_report_id || report.id
    };
}

function renderHistoryView() {
    const status = document.getElementById('field-history-status');
    const list = document.getElementById('field-history-list');
    if (!status || !list) return;

    const query = String(document.getElementById('field-history-search')?.value || '').trim().toLowerCase();
    const groups = groupHistoryRecords(historyRecords);
    const filteredGroups = groups.filter(group => matchesJourneySearch(group, query));

    if (historyRecords.length === 0) {
        status.textContent = 'No hay jornadas guardadas todavía.';
        list.innerHTML = '';
        return;
    }

    status.textContent = query
        ? `Se encontraron ${filteredGroups.length} jornada(s) que coinciden con la búsqueda.`
        : `Se cargaron ${groups.length} jornada(s) guardadas.`;

    if (filteredGroups.length === 0) {
        list.innerHTML = `
            <div class="field-history-group field-history-empty">
                <div class="field-history-empty-icon">J</div>
                <h3>No hay resultados para esa búsqueda</h3>
                <p>Prueba con otra fecha, locación, jornada, equipo o nombre de pozo.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = filteredGroups.map(renderHistoryTable).join('');
    bindHistoryActions(filteredGroups);
}

function renderHistoryTable(group) {
    const firstRecord = group.records[0] || {};

    return `
        <section class="field-history-group" data-journey-key="${escapeHtml(group.key)}">
            <div class="field-history-group-header">
                <div>
                    <h3 class="field-history-group-title">Jornada ${escapeHtml(firstRecord.jornada || '--')} · ${escapeHtml(formatDate(firstRecord.report_date))}</h3>
                    <p class="field-history-group-meta">${escapeHtml(firstRecord.locacion_jornada || '--')} · ${escapeHtml(firstRecord.equipo_guardia || '--')} · ${group.records.length} ${group.records.length === 1 ? 'pozo' : 'pozos'} monitoreados.</p>
                </div>
                <div class="field-history-group-tools">
                    <button type="button" class="field-history-continue-btn" data-journey-key="${escapeHtml(group.key)}">Continuar jornada</button>
                    <button type="button" class="field-history-export-btn" data-export-type="pdf" data-journey-key="${escapeHtml(group.key)}">Obtener PDF</button>
                    <button type="button" class="field-history-export-btn" data-export-type="xlsx" data-journey-key="${escapeHtml(group.key)}">Obtener Excel</button>
                    <span class="field-history-group-pill">${group.records.length} ${group.records.length === 1 ? 'registro' : 'registros'}</span>
                </div>
            </div>
            <table class="field-history-group-table">
                <thead>
                    <tr>
                        <th>Locación</th>
                        <th>Pozo</th>
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Jornada</th>
                        <th>Equipo</th>
                        <th>Última actualización</th>
                    </tr>
                </thead>
                <tbody>
                    ${group.records.map(record => `
                        <tr>
                            <td>${escapeHtml(record.locacion_jornada || '--')}</td>
                            <td>${escapeHtml(String(record.pozo || '').toUpperCase())}</td>
                            <td>${escapeHtml(formatDate(record.report_date))}</td>
                            <td>${escapeHtml(formatTime(record.report_time))}</td>
                            <td>${escapeHtml(record.jornada || '--')}</td>
                            <td>${escapeHtml(record.equipo_guardia || '--')}</td>
                            <td>${escapeHtml(formatDateTime(record.updated_at))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </section>
    `;
}

function bindHistoryActions(groups) {
    const groupsByKey = new Map(groups.map(group => [group.key, group]));

    document.querySelectorAll('.field-history-export-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const group = groupsByKey.get(String(button.dataset.journeyKey || ''));
            if (!group) return;

            if (button.dataset.exportType === 'pdf') {
                await exportJourneyGroupToPdf(group);
                return;
            }

            exportJourneyGroupToExcel(group);
        });
    });

    document.querySelectorAll('.field-history-continue-btn').forEach(button => {
        button.addEventListener('click', () => {
            const group = groupsByKey.get(String(button.dataset.journeyKey || ''));
            if (!group) return;

            localStorage.setItem(PENDING_HISTORY_CONTINUE_STORAGE_KEY, JSON.stringify(group.records));
            window.location.href = 'field.html?continue=1';
        });
    });
}

function groupHistoryRecords(records = []) {
    const groups = new Map();

    records.forEach(record => {
        const key = String(record.journey_key || buildJourneyKey(record));
        if (!groups.has(key)) {
            groups.set(key, { key, records: [] });
        }

        groups.get(key).records.push(record);
    });

    return [...groups.values()]
        .map(group => ({
            ...group,
            records: [...group.records].sort((left, right) => String(left.report_time || '').localeCompare(String(right.report_time || '')))
        }))
        .sort((left, right) => {
            const leftTime = new Date(left.records[0]?.updated_at || 0).getTime();
            const rightTime = new Date(right.records[0]?.updated_at || 0).getTime();
            return rightTime - leftTime;
        });
}

function matchesJourneySearch(group, query) {
    if (!query) return true;

    const haystack = [
        group.key,
        ...group.records.flatMap(record => [
            record.locacion_jornada,
            record.pozo,
            record.jornada,
            record.equipo_guardia,
            record.report_date,
            record.report_time
        ])
    ].join(' ').toLowerCase();

    return haystack.includes(query);
}

function buildJourneyKey(record = {}) {
    return [
        String(record.report_date || record.fecha || '').trim(),
        String(record.jornada || '').trim().toLowerCase(),
        String(record.locacion_jornada || '').trim().toLowerCase(),
        String(record.equipo_guardia || '').trim().toLowerCase()
    ].join('|');
}

function exportJourneyGroupToExcel(group) {
    if (!window.XLSX) {
        showStatusMessage('La librería de Excel no está disponible en esta vista.', 'error');
        return;
    }

    const exportRows = group.records.map(record => ({
        Fecha: record.report_date || '',
        Hora: record.report_time || '',
        Jornada: record.jornada || '',
        'Equipo de guardia': record.equipo_guardia || '',
        Locacion: record.locacion_jornada || '',
        Pozo: record.pozo || '',
        Hz: record.hz || '',
        Sentido: record.sentido_giro || '',
        'V VSD': record.v_vsd || '',
        'I Motor': record.i_mot || '',
        'V Motor': record.v_mot || '',
        THP: record.thp || '',
        LF: record.lf || '',
        CHP: record.chp || '',
        PI: record.pi || '',
        PD: record.pd || '',
        TI: record.ti || '',
        TM: record.tm || '',
        'I VSD A': record.ivsd_a || '',
        'I VSD B': record.ivsd_b || '',
        'I VSD C': record.ivsd_c || '',
        Comentario: record.comentario || ''
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'jornada_campo');
    window.XLSX.writeFile(workbook, buildJourneyExportFileName(group.records[0], 'xlsx'));
}

async function exportJourneyGroupToPdf(group) {
    if (!window.jspdf?.jsPDF) {
        showStatusMessage('La librería de PDF no está disponible en esta vista.', 'error');
        return;
    }

    const firstRecord = group.records[0] || {};
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
        pdf.text('Historial operativo de jornada', titleOffsetX, 76);

        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(marginX, 142, pageWidth - (marginX * 2), 124, 20, 20, 'F');
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(1);
        pdf.roundedRect(marginX, 142, pageWidth - (marginX * 2), 124, 20, 20, 'S');

        drawMetaColumn(pdf, marginX + 22, 164, 248, [
            ['Fecha', formatDate(firstRecord.report_date)],
            ['Locación', String(firstRecord.locacion_jornada || '--')],
            ['Jornada', String(firstRecord.jornada || '--')]
        ]);

        drawMetaColumn(pdf, marginX + 318, 164, 236, [
            ['Equipo de guardia', String(firstRecord.equipo_guardia || '--')],
            ['Pozos', `${group.records.length}`],
            ['Generado', formatDateTime(new Date().toISOString())]
        ]);
    };

    const drawFooter = () => {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.8);
        pdf.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text('UV Servicios - Historial de jornada exportado automáticamente', marginX, pageHeight - 18);
        pdf.text(`Página ${pdf.getNumberOfPages()}`, pageWidth - marginX - 42, pageHeight - 18);
    };

    drawHeader();
    drawFooter();

    const rows = group.records.map(record => ([
        String(record.report_time || '--'),
        String(record.pozo || '').toUpperCase() || '--',
        String(record.sentido_giro || '--').toUpperCase(),
        String(record.hz || '--'),
        String(record.i_mot || '--'),
        String(record.v_vsd || '--'),
        String(record.pi || '--'),
        String(record.pd || '--'),
        String(record.ti || '--'),
        String(record.tm || '--'),
        String(record.thp || '--'),
        String(record.lf || '--'),
        String(record.chp || '--'),
        String(record.comentario || 'Sin novedad reportada.')
    ]));

    pdf.autoTable({
        startY: 286,
        margin: { left: marginX, right: marginX, bottom: 48 },
        head: [['Hora', 'Pozo', 'Giro', 'Hz', 'I Mot', 'V VSD', 'PI', 'PD', 'TI', 'TM', 'THP', 'LF', 'CHP', 'Comentario']],
        body: rows,
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
            3: { cellWidth: 32, halign: 'center' },
            4: { cellWidth: 40, halign: 'center' },
            5: { cellWidth: 44, halign: 'center' },
            6: { cellWidth: 34, halign: 'center' },
            7: { cellWidth: 34, halign: 'center' },
            8: { cellWidth: 34, halign: 'center' },
            9: { cellWidth: 34, halign: 'center' },
            10: { cellWidth: 34, halign: 'center' },
            11: { cellWidth: 34, halign: 'center' },
            12: { cellWidth: 34, halign: 'center' },
            13: { halign: 'left', cellWidth: 286 }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        didDrawPage: () => {
            drawHeader();
            drawFooter();
        }
    });

    pdf.save(buildJourneyExportFileName(firstRecord, 'pdf'));
}

function buildJourneyExportFileName(record = {}, extension) {
    const datePart = String(record.report_date || record.fecha || new Date().toISOString().slice(0, 10)).replaceAll('-', '');
    const locationPart = String(record.locacion_jornada || 'campo')
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'campo';

    return `jornada_${locationPart}_${datePart}.${extension}`;
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

async function loadLogoForPdf() {
    const logoPath = 'img/uvservicioslogo.png';

    try {
        const response = await fetch(logoPath);
        if (!response.ok) {
            return null;
        }

        const blob = await response.blob();
        return await imageElementToDataUrl(blob);
    } catch (error) {
        return null;
    }
}

function imageElementToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function showStatusMessage(message, type = 'info') {
    const status = document.getElementById('field-history-status');
    if (status) {
        status.textContent = message;
    }

    if (!window.Swal || type === 'info') {
        return;
    }

    window.Swal.fire({
        icon: type,
        text: message,
        confirmButtonColor: '#991b1b'
    });
}

function maybeShowSavedMessage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('saved') !== '1') return;

    if (window.Swal) {
        window.Swal.fire({
            icon: 'success',
            text: 'La jornada se guardó correctamente y quedó lista para revisión.',
            confirmButtonColor: '#991b1b'
        });
    }

    params.delete('saved');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
}

function formatDate(value) {
    if (!value) return '--';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(value) {
    if (!value) return '--';
    return String(value).slice(0, 5);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}