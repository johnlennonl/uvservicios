import { getSession } from './auth.js';
import { getAccessProfile } from './core/access-control.js';
import { getAdminFieldJourneys } from './services/field-journey-service.js';

const FIELD_ADMIN_ALERT_SELECTOR = 'a[href="campo-admin.html"], a[href$="/campo-admin.html"]';
const FIELD_ADMIN_ALERT_REFRESH_MS = 60000;
const FIELD_ADMIN_ALERT_STORAGE_KEY = 'uv-field-admin-alert-state-v1';

let latestPendingJourneyIds = [];

function isCampoAdminPage() {
    return String(window.location.pathname || '').toLowerCase().endsWith('/campo-admin.html')
        || String(window.location.pathname || '').toLowerCase() === 'campo-admin.html';
}

function getUserScopedStorageKey(session) {
    const userId = String(session?.user?.id || session?.user?.email || 'anon').trim().toLowerCase();
    return `${FIELD_ADMIN_ALERT_STORAGE_KEY}:${userId}`;
}

function loadAlertState(session) {
    try {
        const raw = localStorage.getItem(getUserScopedStorageKey(session));
        const parsed = raw ? JSON.parse(raw) : null;
        return {
            seenIds: Array.isArray(parsed?.seenIds) ? parsed.seenIds.map(String) : [],
            notifiedIds: Array.isArray(parsed?.notifiedIds) ? parsed.notifiedIds.map(String) : []
        };
    } catch (error) {
        console.warn('No se pudo leer el estado local de alertas de Campo:', error);
        return { seenIds: [], notifiedIds: [] };
    }
}

function saveAlertState(session, state) {
    try {
        localStorage.setItem(getUserScopedStorageKey(session), JSON.stringify({
            seenIds: Array.isArray(state?.seenIds) ? [...new Set(state.seenIds.map(String))] : [],
            notifiedIds: Array.isArray(state?.notifiedIds) ? [...new Set(state.notifiedIds.map(String))] : []
        }));
    } catch (error) {
        console.warn('No se pudo guardar el estado local de alertas de Campo:', error);
    }
}

function showNewJourneyToast(count) {
    if (!count || !window.Swal?.fire) return;

    const title = count === 1
        ? 'Hay una nueva jornada de Campo por revisar'
        : `Hay ${count} nuevas jornadas de Campo por revisar`;

    window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title,
        text: 'Abre Campo para revisar la bandeja administrativa.',
        showConfirmButton: false,
        timer: 9000,
        timerProgressBar: true
    });
}

function markCurrentJourneysAsSeen(session) {
    if (!session?.user || !latestPendingJourneyIds.length) return;

    const state = loadAlertState(session);
    state.seenIds = [...new Set([...state.seenIds, ...latestPendingJourneyIds])];
    state.notifiedIds = [...new Set([...state.notifiedIds, ...latestPendingJourneyIds])];
    saveAlertState(session, state);
    paintFieldAdminAlert(0);
}

function getAlertTargets() {
    return Array.from(document.querySelectorAll(FIELD_ADMIN_ALERT_SELECTOR));
}

function ensureBadge(target) {
    let badge = target.querySelector('.field-admin-alert-badge');
    if (badge) return badge;

    badge = document.createElement('span');
    badge.className = 'field-admin-alert-badge';
    badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true');
    target.appendChild(badge);
    return badge;
}

function formatBadgeCount(count) {
    return count > 9 ? '9+' : String(count);
}

function paintFieldAdminAlert(count) {
    const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
    const hasAlert = safeCount > 0;
    const label = hasAlert
        ? `Campo (${safeCount} jornada${safeCount === 1 ? '' : 's'} pendiente${safeCount === 1 ? '' : 's'} por revisar)`
        : 'Campo';

    getAlertTargets().forEach(target => {
        const badge = ensureBadge(target);
        badge.hidden = !hasAlert;
        badge.textContent = formatBadgeCount(safeCount);
        target.classList.toggle('field-admin-has-alert', hasAlert);
        target.setAttribute('title', hasAlert
            ? `${safeCount} jornada${safeCount === 1 ? '' : 's'} pendiente${safeCount === 1 ? '' : 's'} por revisar en Campo`
            : 'Campo');
        target.setAttribute('aria-label', label);
    });
}

async function refreshFieldAdminAlert() {
    try {
        const session = await getSession();
        const accessProfile = getAccessProfile(session);
        if (!session?.user || !accessProfile?.canViewManagement) {
            latestPendingJourneyIds = [];
            paintFieldAdminAlert(0);
            return;
        }

        const journeys = await getAdminFieldJourneys({
            statuses: ['submitted', 'under_review'],
            limit: 120
        });
        const journeyIds = (Array.isArray(journeys) ? journeys : [])
            .map(journey => String(journey?.id || '').trim())
            .filter(Boolean);

        latestPendingJourneyIds = journeyIds;

        const state = loadAlertState(session);
        const activeIds = new Set(journeyIds);
        state.seenIds = state.seenIds.filter(id => activeIds.has(id));
        state.notifiedIds = state.notifiedIds.filter(id => activeIds.has(id));

        if (isCampoAdminPage()) {
            state.seenIds = [...new Set([...state.seenIds, ...journeyIds])];
            state.notifiedIds = [...new Set([...state.notifiedIds, ...journeyIds])];
            saveAlertState(session, state);
            paintFieldAdminAlert(0);
            return;
        }

        const unseenIds = journeyIds.filter(id => !state.seenIds.includes(id));
        const newlyNotifiedIds = unseenIds.filter(id => !state.notifiedIds.includes(id));

        if (newlyNotifiedIds.length) {
            showNewJourneyToast(newlyNotifiedIds.length);
        }

        state.notifiedIds = [...new Set([...state.notifiedIds, ...newlyNotifiedIds])];
        saveAlertState(session, state);
        paintFieldAdminAlert(unseenIds.length);
    } catch (error) {
        console.warn('No se pudo actualizar la alerta de Campo:', error);
        latestPendingJourneyIds = [];
        paintFieldAdminAlert(0);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!getAlertTargets().length) return;

    getAlertTargets().forEach(target => {
        target.addEventListener('click', async () => {
            const session = await getSession().catch(() => null);
            if (session?.user) {
                markCurrentJourneysAsSeen(session);
            }
        });
    });

    await refreshFieldAdminAlert();
    window.setInterval(refreshFieldAdminAlert, FIELD_ADMIN_ALERT_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshFieldAdminAlert();
        }
    });
    window.addEventListener('focus', refreshFieldAdminAlert);
});