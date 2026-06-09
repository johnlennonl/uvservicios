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
            width: min(420px, calc(100vw - 24px));
            padding: 0;
            border-radius: 22px;
            border: 1px solid rgba(191, 219, 254, 0.95);
            background: linear-gradient(180deg, rgba(255,255,255,0.99), rgba(239,246,255,0.97));
            box-shadow: 0 24px 46px rgba(15, 23, 42, 0.18);
            overflow: hidden;
        }

        .field-admin-toast .swal2-html-container {
            margin: 0;
            padding: 0;
        }

        .field-admin-toast-card {
            position: relative;
            display: grid;
            gap: 14px;
            padding: 18px 18px 16px 18px;
        }

        .field-admin-toast-card::before {
            content: '';
            position: absolute;
            inset: 0 auto 0 0;
            width: 5px;
            background: linear-gradient(180deg, #0ea5e9, #2563eb);
        }

        .field-admin-toast-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .field-admin-toast-kicker {
            display: inline-flex;
            align-items: center;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.1);
            color: #1d4ed8;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: .08em;
            text-transform: uppercase;
        }

        .field-admin-toast-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 34px;
            height: 34px;
            padding: 0 10px;
            border-radius: 999px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: #fff;
            font-size: 14px;
            font-weight: 900;
            box-shadow: 0 10px 18px rgba(37, 99, 235, 0.22);
        }

        .field-admin-toast-main {
            display: grid;
            grid-template-columns: 46px minmax(0, 1fr);
            gap: 14px;
            align-items: start;
        }

        .field-admin-toast-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            border-radius: 50%;
            background: rgba(14, 165, 233, 0.08);
            border: 2px solid rgba(14, 165, 233, 0.6);
            color: #0ea5e9;
            font-size: 24px;
            font-weight: 800;
            line-height: 1;
        }

        .field-admin-toast-copy strong {
            display: block;
            color: #0f172a;
            font-size: 15px;
            line-height: 1.2;
            font-weight: 900;
            margin: 0 0 6px;
        }

        .field-admin-toast-copy p {
            margin: 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.5;
        }

        .field-admin-toast-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding-left: 60px;
        }

        .field-admin-toast-hint {
            color: #64748b;
            font-size: 12px;
            font-weight: 700;
        }

        .field-admin-toast-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 9px 12px;
            border-radius: 12px;
            background: #eff6ff;
            color: #1d4ed8;
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: .05em;
            text-decoration: none;
            border: 1px solid rgba(59, 130, 246, 0.18);
        }

        .field-admin-toast.swal2-icon-show,
        .field-admin-toast .swal2-timer-progress-bar {
            display: none !important;
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
        ? 'Hay una nueva jornada de Campo por revisar'
        : `Hay ${count} nuevas jornadas de Campo por revisar`;

    window.Swal.fire({
        toast: true,
        position: 'top-end',
        customClass: {
            popup: 'field-admin-toast'
        },
        html: `
            <article class="field-admin-toast-card">
                <div class="field-admin-toast-top">
                    <span class="field-admin-toast-kicker">Campo</span>
                    <span class="field-admin-toast-count">${count > 9 ? '9+' : count}</span>
                </div>
                <div class="field-admin-toast-main">
                    <span class="field-admin-toast-icon">i</span>
                    <div class="field-admin-toast-copy">
                        <strong>${title}</strong>
                        <p>Abre Campo para revisar la bandeja administrativa y procesar la jornada cuanto antes.</p>
                    </div>
                </div>
                <div class="field-admin-toast-footer">
                    <span class="field-admin-toast-hint">Notificación operativa</span>
                    <a class="field-admin-toast-link" href="campo-admin.html">Abrir Campo</a>
                </div>
            </article>
        `,
        showConfirmButton: false,
        timer: 9000,
        timerProgressBar: true
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