import { getSession } from './auth.js';
import { getAccessProfile } from './core/access-control.js';
import { getAdminFieldJourneys } from './services/field-journey-service.js';

const FIELD_ADMIN_ALERT_SELECTOR = 'a[href="campo-admin.html"], a[href$="/campo-admin.html"]';
const FIELD_ADMIN_ALERT_REFRESH_MS = 60000;
const FIELD_ADMIN_ALERT_STORAGE_KEY = 'uv-field-admin-alert-state-v1';

let latestPendingJourneys = [];
let isFirstCheck = true;

function createJourneyAlertVersion(journey) {
    const updatedAt = String(
        journey?.updated_at
        || journey?.submitted_at
        || journey?.review_started_at
        || journey?.reviewed_at
        || journey?.created_at
        || ''
    ).trim();
    const status = String(journey?.status || '').trim().toLowerCase();
    return `${updatedAt}|${status}`;
}

function normalizeAlertVersionMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    return Object.entries(raw).reduce((accumulator, [journeyId, version]) => {
        const normalizedJourneyId = String(journeyId || '').trim();
        const normalizedVersion = String(version || '').trim();
        if (normalizedJourneyId && normalizedVersion) {
            accumulator[normalizedJourneyId] = normalizedVersion;
        }
        return accumulator;
    }, {});
}

function ensureFieldAdminToastStyles() {
    if (document.getElementById('field-admin-toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'field-admin-toast-styles';
    style.textContent = `
        .field-admin-toast.swal2-popup.swal2-toast {
            width: min(380px, calc(100vw - 32px));
            padding: 14px 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            background: #181a22;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            overflow: hidden;
            animation: field-toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .field-admin-toast-container {
            z-index: 9999 !important;
        }

        @keyframes field-toast-slide-in {
            from {
                transform: translateY(-12px) scale(0.96);
                opacity: 0;
            }
            to {
                transform: translateY(0) scale(1);
                opacity: 1;
            }
        }

        .field-admin-toast .swal2-title,
        .field-admin-toast .swal2-html-container {
            margin: 0;
            padding: 0;
        }

        .field-admin-toast-card-v2 {
            display: flex;
            align-items: center;
            gap: 14px;
            width: 100%;
            color: #F8FAFC;
        }

        .field-admin-toast-logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 60px;
            height: 60px;
            border-radius: 8px;
            background: #FFFFFF;
            border: 1px solid rgba(255, 255, 255, 0.15);
            flex-shrink: 0;
            padding: 1px;
            box-sizing: border-box;
            cursor:pointer;
        }

        .field-admin-toast-logo-v2 {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .field-admin-toast-content {
            display: flex;
            flex-direction: column;
            gap: 3px;
            flex-grow: 1;
            text-align: left;
            padding-right: 20px;
            cursor:pointer;
        }

        .field-admin-toast-title-v2 {
            font-size: 14px;
            font-weight: 700;
            color: #FFFFFF;
            line-height: 1.3;
        }

        .field-admin-toast-desc-v2 {
            font-size: 12px;
            color: #94A3B8;
            line-height: 1.4;
        }

        .field-admin-toast .swal2-icon {
            display: none !important;
        }

        .field-admin-toast .swal2-close {
            position: absolute !important;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            color: #475569;
            font-size: 16px;
            border-radius: 4px;
            top: 12px;
            right: 12px;
            background: transparent;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .field-admin-toast .swal2-close:hover {
            color: #F8FAFC;
            background: rgba(255, 255, 255, 0.05);
        }

        .field-admin-toast .swal2-timer-progress-bar {
            background: #3B82F6;
            height: 2px;
        }
    `;
    document.head.appendChild(style);
}

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
            seenVersions: normalizeAlertVersionMap(parsed?.seenVersions),
            notifiedVersions: normalizeAlertVersionMap(parsed?.notifiedVersions)
        };
    } catch (error) {
        console.warn('No se pudo leer el estado local de alertas de Campo:', error);
        return { seenVersions: {}, notifiedVersions: {} };
    }
}

function saveAlertState(session, state) {
    try {
        localStorage.setItem(getUserScopedStorageKey(session), JSON.stringify({
            seenVersions: normalizeAlertVersionMap(state?.seenVersions),
            notifiedVersions: normalizeAlertVersionMap(state?.notifiedVersions)
        }));
    } catch (error) {
        console.warn('No se pudo guardar el estado local de alertas de Campo:', error);
    }
}

function showNewJourneyToast(journeysOrCount) {
    if (!journeysOrCount || !window.Swal?.fire) return;

    ensureFieldAdminToastStyles();

    let journeys = [];
    if (Array.isArray(journeysOrCount)) {
        journeys = journeysOrCount;
    } else if (typeof journeysOrCount === 'number') {
        journeys = Array.from({ length: journeysOrCount }, () => ({
            jornada: 'Diurna',
            total_reports: 0
        }));
    } else {
        return;
    }

    const count = journeys.length;
    if (count === 0) return;

    let title = '';
    let desc = '';

    if (count === 1) {
        title = 'Tienes una nueva Jornada Recibida';
        const journey = journeys[0];
        const shift = journey.jornada || 'Diurna';
        const wellsCount = journey.total_reports || 0;
        desc = `${shift}: ${wellsCount} pozo${wellsCount === 1 ? '' : 's'} con monitoreos.`;
    } else {
        title = `Tienes ${count} jornadas recibidas`;

        const shiftsMap = new Map();
        journeys.forEach(j => {
            const shift = j.jornada || 'Diurna';
            const countWells = j.total_reports || 0;
            shiftsMap.set(shift, (shiftsMap.get(shift) || 0) + countWells);
        });

        const descParts = [];
        shiftsMap.forEach((wellsCount, shift) => {
            descParts.push(`Jornada ${shift} (${wellsCount} pozo${wellsCount === 1 ? '' : 's'})`);
        });

        if (descParts.length === 1) {
            desc = descParts[0] + ' con monitoreos.';
        } else {
            const last = descParts.pop();
            desc = descParts.join(', ') + ' y ' + last + ' con monitoreos.';
        }
    }

    const toast = window.Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        showCloseButton: true,
        timer: 30000,
        timerProgressBar: false,
        customClass: {
            container: 'field-admin-toast-container',
            popup: 'field-admin-toast'
        },
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', window.Swal.stopTimer);
            toast.addEventListener('mouseleave', window.Swal.resumeTimer);
            toast.style.cursor = 'pointer';
            toast.addEventListener('click', (e) => {
                if (e.target.closest('.swal2-close')) {
                    window.Swal.close();
                    return;
                }
                window.location.href = 'campo-admin.html';
            });
        }
    });

    toast.fire({
        html: `
            <div class="field-admin-toast-card-v2">
                <div class="field-admin-toast-logo-container">
                    <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV Logo" class="field-admin-toast-logo-v2">
                </div>
                <div class="field-admin-toast-content">
                    <div class="field-admin-toast-title-v2">${title}</div>
                    <div class="field-admin-toast-desc-v2">${desc}</div>
                </div>
            </div>
        `
    });
}

function markCurrentJourneysAsSeen(session) {
    if (!session?.user || !latestPendingJourneys.length) return;

    const state = loadAlertState(session);
    latestPendingJourneys.forEach(journey => {
        const journeyId = String(journey?.id || '').trim();
        if (!journeyId) return;

        const version = createJourneyAlertVersion(journey);
        state.seenVersions[journeyId] = version;
        state.notifiedVersions[journeyId] = version;
    });
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
            latestPendingJourneys = [];
            paintFieldAdminAlert(0);
            return;
        }

        const journeys = await getAdminFieldJourneys({
            statuses: ['submitted', 'under_review'],
            limit: 120
        });
        const journeyList = (Array.isArray(journeys) ? journeys : []).filter(journey => String(journey?.id || '').trim());
        const journeyIds = journeyList.map(journey => String(journey.id || '').trim());

        latestPendingJourneys = journeyList;

        const state = loadAlertState(session);
        const activeIds = new Set(journeyIds);
        state.seenVersions = Object.fromEntries(
            Object.entries(state.seenVersions).filter(([journeyId]) => activeIds.has(journeyId))
        );
        state.notifiedVersions = Object.fromEntries(
            Object.entries(state.notifiedVersions).filter(([journeyId]) => activeIds.has(journeyId))
        );

        if (isCampoAdminPage()) {
            journeyList.forEach(journey => {
                const journeyId = String(journey.id || '').trim();
                const version = createJourneyAlertVersion(journey);
                state.seenVersions[journeyId] = version;
                state.notifiedVersions[journeyId] = version;
            });
            saveAlertState(session, state);
            paintFieldAdminAlert(0);
            return;
        }

        const unseenJourneys = journeyList.filter(journey => {
            const journeyId = String(journey.id || '').trim();
            return state.seenVersions[journeyId] !== createJourneyAlertVersion(journey);
        });

        // Si es la primera verificación de la sesión de página, notificamos todas las no leídas.
        // En consultas automáticas posteriores en segundo plano, solo notificamos las recién llegadas.
        const journeysToNotify = isFirstCheck
            ? unseenJourneys
            : unseenJourneys.filter(journey => {
                const journeyId = String(journey.id || '').trim();
                return state.notifiedVersions[journeyId] !== createJourneyAlertVersion(journey);
            });

        isFirstCheck = false;

        if (journeysToNotify.length) {
            showNewJourneyToast(journeysToNotify);
        }

        unseenJourneys.forEach(journey => {
            const journeyId = String(journey.id || '').trim();
            state.notifiedVersions[journeyId] = createJourneyAlertVersion(journey);
        });
        saveAlertState(session, state);
        paintFieldAdminAlert(unseenJourneys.length);
    } catch (error) {
        console.warn('No se pudo actualizar la alerta de Campo:', error);
        latestPendingJourneys = [];
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
