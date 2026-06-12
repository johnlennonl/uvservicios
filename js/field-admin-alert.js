import { getSession } from './auth.js';
import { getAccessProfile } from './core/access-control.js';
import { getAdminFieldJourneys } from './services/field-journey-service.js';

const FIELD_ADMIN_ALERT_SELECTOR = 'a[href="campo-admin.html"], a[href$="/campo-admin.html"]';
const FIELD_ADMIN_ALERT_REFRESH_MS = 60000;
const FIELD_ADMIN_ALERT_STORAGE_KEY = 'uv-field-admin-alert-state-v1';

let latestPendingJourneys = [];

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
            width: min(390px, calc(100vw - 24px));
            padding: 0;
            border: 1px solid #334155;
            border-radius: 20px;
            background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%);
            box-shadow: 0 24px 48px rgba(2, 6, 23, 0.36);
            overflow: hidden;
        }

        .field-admin-toast .swal2-title,
        .field-admin-toast .swal2-html-container {
            margin: 0;
            padding: 0;
        }

        .field-admin-toast-card {
            position: relative;
            display: grid;
            gap: 12px;
            padding: 16px 18px;
            color: #E2E8F0;
        }

        .field-admin-toast-card::before {
            content: '';
            position: absolute;
            inset: 0 0 auto 0;
            height: 3px;
            background: linear-gradient(90deg, #38BDF8 0%, #1D4ED8 100%);
            pointer-events: none;
        }

        .field-admin-toast-header {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .field-admin-toast-logo-wrap {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: #1E293B;
            border: 1px solid #334155;
        }

        .field-admin-toast-logo {
            width: 32px;
            height: auto;
            display: block;
        }

        .field-admin-toast-copy {
            min-width: 0;
            display: grid;
            gap: 3px;
        }

        .field-admin-toast-kicker {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
            color: #38BDF8;
        }

        .field-admin-toast-title {
            font-size: 15px;
            line-height: 1.2;
            font-weight: 800;
            color: #F8FAFC;
        }

        .field-admin-toast-text {
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            color: #CBD5E1;
        }

        .field-admin-toast-footer {
            display: flex;
            align-items: center;
            gap: 12px;
            padding-top: 2px;
        }

        .field-admin-toast-count {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 30px;
            padding: 0 11px;
            border-radius: 999px;
            background: #1E293B;
            border: 1px solid #334155;
            font-size: 12px;
            font-weight: 800;
            color: #E2E8F0;
        }

        .field-admin-toast-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 22px;
            height: 22px;
            padding: 0 7px;
            border-radius: 999px;
            background: #38BDF8;
            color: #0F172A;
            font-size: 11px;
            font-weight: 900;
        }

        .field-admin-toast-hint {
            font-size: 12px;
            font-weight: 700;
            color: #94A3B8;
        }

        .field-admin-toast .swal2-icon {
            display: none !important;
        }

        .field-admin-toast .swal2-close {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            color: #CBD5E1;
            font-size: 24px;
            border-radius: 999px;
            top: 10px;
            right: 10px;
            transition: background 0.2s ease, color 0.2s ease;
        }

        .field-admin-toast .swal2-close:hover {
            background: #1E293B;
            color: #F8FAFC;
        }

        .field-admin-toast .swal2-timer-progress-bar {
            background: linear-gradient(90deg, #38BDF8, #1D4ED8);
            height: 4px;
        }

        @media (max-width: 640px) {
            .field-admin-toast-card {
                padding: 14px;
            }

            .field-admin-toast-title {
                font-size: 15px;
            }

            .field-admin-toast-footer {
                flex-wrap: wrap;
            }
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

function showNewJourneyToast(count) {
    if (!count || !window.Swal?.fire) return;

    ensureFieldAdminToastStyles();

    const title = count === 1
        ? 'Nueva jornada lista para revisar'
        : `${count} nuevas jornadas listas para revisar`;
    const journeyLabel = count === 1 ? 'jornada nueva' : 'jornadas nuevas';

    const toast = window.Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        showCloseButton: true,
        timer: 30000,
        timerProgressBar: true,
        customClass: {
            popup: 'field-admin-toast'
        },
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', window.Swal.stopTimer);
            toast.addEventListener('mouseleave', window.Swal.resumeTimer);
            toast.style.cursor = 'pointer';
            toast.addEventListener('click', () => window.Swal.close());
        }
    });

    toast.fire({
        html: `
            <div class="field-admin-toast-card">
                <div class="field-admin-toast-header">
                    <div class="field-admin-toast-logo-wrap">
                        <img src="img/uvservicioslogo.png" alt="UV Servicios" class="field-admin-toast-logo">
                    </div>
                    <div class="field-admin-toast-copy">
                        <span class="field-admin-toast-kicker">Campo UV Servicios</span>
                        <strong class="field-admin-toast-title">${title}</strong>
                    </div>
                </div>
                <p class="field-admin-toast-text">Se detectó ${count === 1 ? 'una jornada nueva' : 'nuevo ingreso de jornadas'} en la bandeja administrativa. El aviso se cierra con la X, con click o automáticamente en 30 segundos.</p>
                <div class="field-admin-toast-footer">
                    <span class="field-admin-toast-count"><span class="field-admin-toast-pill">${count}</span>${journeyLabel}</span>
                    <span class="field-admin-toast-hint">Pendiente de revisión.</span>
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
        const newlyNotifiedJourneys = unseenJourneys.filter(journey => {
            const journeyId = String(journey.id || '').trim();
            return state.notifiedVersions[journeyId] !== createJourneyAlertVersion(journey);
        });

        if (newlyNotifiedJourneys.length) {
            showNewJourneyToast(newlyNotifiedJourneys.length);
        }

        newlyNotifiedJourneys.forEach(journey => {
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