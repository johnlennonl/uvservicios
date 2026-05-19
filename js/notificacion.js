import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import { getMonitoringDailyActivity } from './data-service.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatClock(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateRangeLabel(startIso, endIso) {
    const start = new Date(startIso || '');
    const end = new Date(endIso || '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 'Ventana del día actual.';
    }

    const displayDate = start.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
    const endTime = new Date(end.getTime() - 1000).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    return `Actividad del ${displayDate} hasta ${endTime}.`;
}

function formatRefreshStamp(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Actualizado recientemente.';
    return `Actualizado a las ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}.`;
}

function buildFeedItem(record = {}) {
    const pozoName = escapeHtml(record.pozo_name || '--');
    const measurementDate = escapeHtml(record.fecha || '--');
    const measurementTime = escapeHtml(record.hora || '00:00:00');
    const statusLabel = escapeHtml(record.estatus || 'Sin estatus');
    const createdTime = escapeHtml(formatClock(record.created_at));

    return `
        <article class="notification-feed-item">
            <div class="notification-feed-main">
                <strong>${pozoName}</strong>
                <span class="notification-feed-meta">${measurementDate} ${measurementTime} · ${statusLabel}</span>
            </div>
            <span class="notification-feed-time">${createdTime}</span>
        </article>
    `;
}

function buildPozoItem(item = {}) {
    return `
        <article class="notification-pozo-item">
            <div class="notification-pozo-main">
                <strong>${escapeHtml(item.pozo_name || '--')}</strong>
                <span class="notification-pozo-meta">Registros detectados hoy para este pozo.</span>
            </div>
            <span class="notification-pozo-count">${escapeHtml(item.count ?? 0)}</span>
        </article>
    `;
}

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

function setWarning(message = '', visible = false) {
    const warning = document.getElementById('notification-warning');
    const warningText = document.getElementById('notification-warning-text');
    if (!warning || !warningText) return;

    warning.hidden = !visible;
    warningText.textContent = message || 'La auditoría diaria no está disponible todavía.';
}

function renderActivity(summary = {}) {
    const totalEl = document.getElementById('notification-total');
    const pozosEl = document.getElementById('notification-pozos');
    const visibleEl = document.getElementById('notification-visible-count');
    const refreshEl = document.getElementById('notification-last-refresh');
    const latestEl = document.getElementById('notification-latest-record');
    const feedCountEl = document.getElementById('notification-feed-count');
    const feedListEl = document.getElementById('notification-feed-list');
    const pozoListEl = document.getElementById('notification-pozo-list');
    const heroSubtitle = document.getElementById('notification-hero-subtitle');
    const rangeLabel = document.getElementById('notification-range-label');

    if (!totalEl || !pozosEl || !visibleEl || !refreshEl || !latestEl || !feedCountEl || !feedListEl || !pozoListEl || !heroSubtitle || !rangeLabel) {
        return;
    }

    const records = Array.isArray(summary.records) ? summary.records : [];
    const pozoCounts = Array.isArray(summary.pozoCounts) ? summary.pozoCounts : [];
    const latestRecord = records[0] || null;

    totalEl.textContent = String(summary.total ?? 0);
    pozosEl.textContent = String(summary.uniquePozos ?? 0);
    visibleEl.textContent = String(records.length);
    feedCountEl.textContent = String(records.length);
    refreshEl.textContent = formatRefreshStamp(new Date());
    rangeLabel.textContent = formatDateRangeLabel(summary.rangeStart, summary.rangeEnd);

    if (summary.supported === false) {
        setWarning(summary.error || 'La tabla de monitoreo todavía no tiene created_at.', true);
        heroSubtitle.textContent = 'Este módulo necesita created_at para auditar qué registros se cargaron hoy.';
        latestEl.textContent = 'No hay última carga visible porque falta el sello temporal de creación.';
        feedListEl.innerHTML = '<p class="notification-empty-state error">No puedo listar cargas del día sin la columna created_at en monitoreo_pozos.</p>';
        pozoListEl.innerHTML = '<p class="notification-empty-state error">No puedo consolidar pozos impactados sin la columna created_at.</p>';
        return;
    }

    setWarning('', false);
    heroSubtitle.textContent = summary.total > 0
        ? 'Consulta cuántos registros se cargaron hoy, qué pozos fueron impactados y cuáles son las últimas altas visibles en la plataforma.'
        : 'Hoy no se han detectado nuevas cargas operativas en la plataforma.';
    latestEl.textContent = latestRecord
        ? `Última carga visible: ${latestRecord.pozo_name || '--'} a las ${formatClock(latestRecord.created_at)}.`
        : 'Sin actividad visible durante el día.';
    feedListEl.innerHTML = records.length > 0
        ? records.map(buildFeedItem).join('')
        : '<p class="notification-empty-state">Todavía no hay registros cargados hoy para mostrar.</p>';
    pozoListEl.innerHTML = pozoCounts.length > 0
        ? pozoCounts.slice(0, 8).map(buildPozoItem).join('')
        : '<p class="notification-empty-state">Todavía no hay pozos con actividad visible hoy.</p>';
}

async function loadActivity() {
    const refreshButton = document.getElementById('notification-refresh-btn');
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add('loading');
        refreshButton.textContent = 'Cargando...';
    }

    try {
        const summary = await getMonitoringDailyActivity(18);
        renderActivity(summary);
    } catch (error) {
        renderActivity({
            supported: false,
            total: 0,
            uniquePozos: 0,
            pozoCounts: [],
            records: [],
            error: error?.message || 'No pude cargar las notificaciones operativas.'
        });
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove('loading');
            refreshButton.textContent = 'Refrescar';
        }
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
    document.getElementById('notification-refresh-btn')?.addEventListener('click', loadActivity);

    loadActivity();
});
