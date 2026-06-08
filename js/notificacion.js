import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { getMonitoringDailyActivity, getRecentTechnicalMeasurements, getRecentWellBESProfiles } from './data-service.js';

const MONITORING_LIMIT = 12;
const TECHNICAL_LIMIT = 8;
const BES_LIMIT = 8;
let monitoringGroups = [];

function getRoleLabel(profile) {
    if (profile?.isFieldOperator) return 'Perfil activo: Campo';
    if (profile?.canViewManagement && !profile?.isReadOnly) return 'Perfil activo: Administración y supervisión';
    if (profile?.isReadOnly) return 'Perfil activo: Consulta';
    return 'Perfil activo';
}

function applyNotificationAccessProfile(accessProfile) {
    if (!accessProfile?.canViewManagement) {
        document.querySelectorAll('a[href="stats.html"]').forEach(link => {
            link.style.display = 'none';
            link.setAttribute('aria-hidden', 'true');
            link.tabIndex = -1;
        });
    }

    if (!accessProfile?.isReadOnly) return;

    document.body.classList.add('access-readonly');
    document.querySelectorAll('[data-management-link]').forEach(link => {
        link.style.display = 'none';
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
    });
}

function formatDate(value) {
    if (!value) return '--';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-CO');
}

function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short'
    });
}

function formatHour(value) {
    return String(value || '--').slice(0, 5) || '--';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setLastRefreshLabel() {
    const label = document.getElementById('notification-last-refresh');
    if (!label) return;
    label.textContent = `Última actualización: ${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function setRefreshLoadingState(isLoading) {
    const button = document.getElementById('notification-refresh-btn');
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle('loading', isLoading);
    button.textContent = isLoading ? 'Actualizando...' : 'Actualizar';
}

function groupMonitoringRecords(records = []) {
    const groups = new Map();

    records.forEach(record => {
        const pozoName = String(record?.pozo_name || 'Pozo sin nombre').trim() || 'Pozo sin nombre';
        if (!groups.has(pozoName)) {
            groups.set(pozoName, []);
        }
        groups.get(pozoName).push(record);
    });

    return [...groups.entries()]
        .map(([pozoName, groupRecords]) => {
            const sortedRecords = [...groupRecords].sort((left, right) => {
                return String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
                    || String(right?.fecha || '').localeCompare(String(left?.fecha || ''))
                    || String(right?.hora || '').localeCompare(String(left?.hora || ''));
            });

            const latestRecord = sortedRecords[0] || null;
            return {
                pozoName,
                total: sortedRecords.length,
                latestRecord,
                records: sortedRecords
            };
        })
        .sort((left, right) => String(right.latestRecord?.created_at || '').localeCompare(String(left.latestRecord?.created_at || '')));
}

function renderSummary(monitoringActivity, technicalRows, besRows) {
    document.getElementById('summary-monitoring-total').textContent = `${monitoringActivity?.total || 0}`;
    document.getElementById('summary-monitoring-note').textContent = monitoringActivity?.supported === false
        ? 'La tabla actual no expone created_at para documentar cargas del día.'
        : `${monitoringActivity?.uniquePozos || 0} pozos con actividad visible hoy.`;

    document.getElementById('summary-technical-total').textContent = `${technicalRows.length}`;
    document.getElementById('summary-technical-note').textContent = technicalRows.length
        ? 'Últimas mediciones técnicas detectadas en la base histórica.'
        : 'No se detectaron mediciones técnicas recientes.';

    document.getElementById('summary-bes-total').textContent = `${besRows.length}`;
    document.getElementById('summary-bes-note').textContent = besRows.length
        ? 'Últimas configuraciones BES con marca de actualización.'
        : 'No se detectaron cambios recientes en perfil BES.';
}

function buildNotificationMoments(monitoringActivity, technicalRows = [], besRows = []) {
    const moments = [];

    if (monitoringActivity?.supported) {
        const monitoringRecords = Array.isArray(monitoringActivity?.records) ? monitoringActivity.records : [];
        monitoringRecords.forEach(record => {
            if (!record?.created_at) return;
            moments.push({
                source: 'Monitoreo diario',
                title: `Último registro cargado para ${record.pozo_name || 'pozo sin nombre'}`,
                detail: `Monitoreo operativo ${formatDate(record.fecha)} a las ${formatHour(record.hora)}.` ,
                moment: String(record.created_at)
            });
        });
    }

    technicalRows.forEach(row => {
        const moment = row?.created_at || row?.updated_at || row?.fecha;
        if (!moment) return;
        moments.push({
            source: 'Medición técnica',
            title: `Última medición visible para ${row.pozo_name || 'pozo sin nombre'}`,
            detail: `BBPD ${row.bbpd ?? 0} · BNPD ${row.bnpd ?? 0} · AYS ${row.ays_percentage ?? 0}% · CAT ${row.cat_number ?? 0}.`,
            moment: String(moment)
        });
    });

    besRows.forEach(row => {
        if (!row?.updated_at) return;
        moments.push({
            source: 'Perfil BES',
            title: `Última configuración visible para ${row.pozo_name || 'pozo sin nombre'}`,
            detail: `Tipo de bomba registrado: ${row.pump_type || '--'}.`,
            moment: String(row.updated_at)
        });
    });

    return moments.sort((left, right) => String(right.moment || '').localeCompare(String(left.moment || '')));
}

function renderLastEventPanel(monitoringActivity, technicalRows = [], besRows = []) {
    const title = document.getElementById('notification-last-event-title');
    const detail = document.getElementById('notification-last-event-detail');
    const source = document.getElementById('notification-last-event-source');
    const sourceCopy = document.getElementById('notification-last-event-source-copy');
    const date = document.getElementById('notification-last-event-date');
    if (!title || !detail || !source || !sourceCopy || !date) return;

    const latest = buildNotificationMoments(monitoringActivity, technicalRows, besRows)[0] || null;
    if (!latest) {
        title.textContent = 'No hay movimientos recientes visibles';
        detail.textContent = 'Cuando vuelva a existir actividad documentada, aquí verás el último registro detectado aunque la bandeja del día esté vacía.';
        source.textContent = 'Fuente';
        sourceCopy.textContent = 'Sin actividad visible en monitoreo, técnica o perfil BES.';
        date.textContent = '--';
        return;
    }

    title.textContent = latest.title;
    detail.textContent = latest.detail;
    source.textContent = latest.source;
    sourceCopy.textContent = `Último movimiento documentado dentro de ${latest.source.toLowerCase()}.`;
    date.textContent = formatDateTime(latest.moment);
}

function renderMonitoringFeed(activity) {
    const container = document.getElementById('notification-feed-list');
    const count = document.getElementById('notification-feed-count');
    if (!container || !count) return;

    if (!activity?.supported) {
        count.textContent = '0';
        container.innerHTML = '<p class="notification-empty-state error">No fue posible documentar la hora de las importaciones de monitoreo porque la tabla actual no expone created_at.</p>';
        monitoringGroups = [];
        return;
    }

    const records = Array.isArray(activity?.records) ? activity.records : [];
    monitoringGroups = groupMonitoringRecords(records);
    count.textContent = `${monitoringGroups.length}`;

    if (!monitoringGroups.length) {
        container.innerHTML = '<p class="notification-empty-state">No hay registros de monitoreo documentados para hoy.</p>';
        return;
    }

    container.innerHTML = monitoringGroups.map(group => `
        <button type="button" class="notification-feed-card" data-monitoring-pozo="${escapeHtml(group.pozoName)}">
            <div class="notification-feed-main">
                <strong>${escapeHtml(group.pozoName)}</strong>
                <span class="notification-feed-meta">${group.total} registro(s) documentado(s) hoy · Último monitoreo operativo ${formatDate(group.latestRecord?.fecha)} a las ${formatHour(group.latestRecord?.hora)}</span>
            </div>
            <span class="notification-feed-time">${formatDateTime(group.latestRecord?.created_at)}</span>
        </button>
    `).join('');
}

function renderTechnicalFeed(rows = []) {
    const container = document.getElementById('notification-technical-list');
    const count = document.getElementById('notification-technical-count');
    if (!container || !count) return;

    count.textContent = `${rows.length}`;
    if (!rows.length) {
        container.innerHTML = '<p class="notification-empty-state">No hay cambios técnicos recientes para documentar.</p>';
        return;
    }

    container.innerHTML = rows.map(row => `
        <article class="notification-pozo-item">
            <div class="notification-pozo-main">
                <strong>${escapeHtml(row.pozo_name || 'Pozo sin nombre')}</strong>
                <span class="notification-pozo-meta">Fecha de medición: ${escapeHtml(formatDate(row.fecha))} · BBPD ${escapeHtml(row.bbpd ?? 0)} · AYS ${escapeHtml(row.ays_percentage ?? 0)}% · BNPD ${escapeHtml(row.bnpd ?? 0)} · CAT ${escapeHtml(row.cat_number ?? 0)}</span>
            </div>
            <span class="notification-pozo-count">${escapeHtml(formatDateTime(row.created_at || row.updated_at || row.fecha))}</span>
        </article>
    `).join('');
}

function renderBESFeed(rows = []) {
    const container = document.getElementById('notification-bes-list');
    const count = document.getElementById('notification-bes-count');
    if (!container || !count) return;

    count.textContent = `${rows.length}`;
    if (!rows.length) {
        container.innerHTML = '<p class="notification-empty-state">No hay actualizaciones BES recientes para documentar.</p>';
        return;
    }

    container.innerHTML = rows.map(row => `
        <article class="notification-pozo-item">
            <div class="notification-pozo-main">
                <strong>${escapeHtml(row.pozo_name || 'Pozo sin nombre')}</strong>
                <span class="notification-pozo-meta">Tipo de bomba registrado: ${escapeHtml(row.pump_type || '--')}</span>
            </div>
            <span class="notification-pozo-count">${escapeHtml(formatDateTime(row.updated_at))}</span>
        </article>
    `).join('');
}

function openMonitoringModal(pozoName) {
    const modal = document.getElementById('notification-modal');
    const title = document.getElementById('notification-modal-title');
    const summary = document.getElementById('notification-modal-summary');
    const body = document.getElementById('notification-modal-body');
    if (!modal || !title || !summary || !body) return;

    const group = monitoringGroups.find(item => item.pozoName === pozoName);
    if (!group) return;

    title.textContent = pozoName;
    summary.textContent = `${group.total} registro(s) documentado(s) para este pozo en la actividad más reciente.`;
    body.innerHTML = group.records.map(record => `
        <article class="notification-modal-item">
            <div class="notification-modal-item-header">
                <strong>${formatDate(record.fecha)} · ${formatHour(record.hora)}</strong>
                <span class="notification-pozo-count">${formatDateTime(record.created_at)}</span>
            </div>
            <div class="notification-modal-grid">
                <span>Estatus: ${escapeHtml(record.estatus || '--')}</span>
                <span>Frecuencia: ${escapeHtml(record.frecuencia ?? '--')}</span>
                <span>PIP: ${escapeHtml(record.pip ?? '--')}</span>
                <span>THP/CHP/LF: ${escapeHtml(record.presion_thp ?? '--')} / ${escapeHtml(record.presion_chp ?? '--')} / ${escapeHtml(record.presion_lf ?? '--')}</span>
            </div>
            <p class="notification-modal-note">Observaciones: ${escapeHtml(record.observaciones || 'Sin observaciones registradas.')}</p>
        </article>
    `).join('');

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('notification-modal-open');
}

function closeMonitoringModal() {
    const modal = document.getElementById('notification-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('notification-modal-open');
}

function bindNotificationInteractions() {
    document.getElementById('notification-feed-list')?.addEventListener('click', event => {
        const trigger = event.target.closest('[data-monitoring-pozo]');
        if (!trigger) return;
        openMonitoringModal(trigger.getAttribute('data-monitoring-pozo') || '');
    });

    document.getElementById('notification-modal-close')?.addEventListener('click', closeMonitoringModal);
    document.querySelectorAll('[data-modal-close]').forEach(element => {
        element.addEventListener('click', closeMonitoringModal);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMonitoringModal();
        }
    });
}

async function loadNotificationCenter() {
    setRefreshLoadingState(true);

    try {
        const [monitoringActivity, technicalRows, besRows] = await Promise.all([
            getMonitoringDailyActivity(MONITORING_LIMIT),
            getRecentTechnicalMeasurements(TECHNICAL_LIMIT),
            getRecentWellBESProfiles(BES_LIMIT)
        ]);

        renderSummary(monitoringActivity, technicalRows || [], besRows || []);
        renderMonitoringFeed(monitoringActivity);
        renderTechnicalFeed(technicalRows || []);
        renderBESFeed(besRows || []);
        renderLastEventPanel(monitoringActivity, technicalRows || [], besRows || []);
        setLastRefreshLabel();
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        renderMonitoringFeed({ supported: true, records: [], total: 0, uniquePozos: 0 });
        renderTechnicalFeed([]);
        renderBESFeed([]);
        renderLastEventPanel({ supported: true, records: [] }, [], []);
        document.getElementById('summary-monitoring-note').textContent = error?.message || 'No fue posible cargar la actividad reciente.';
    } finally {
        setRefreshLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (accessProfile?.isFieldOperator) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    applyNotificationAccessProfile(accessProfile);

    const rolePill = document.getElementById('notification-role-pill');
    if (rolePill) {
        rolePill.textContent = getRoleLabel(accessProfile);
    }

    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('notification-refresh-btn')?.addEventListener('click', loadNotificationCenter);
    bindNotificationInteractions();
    await loadNotificationCenter();
});
