import { getSession } from './auth.js';
import { getAccessProfile } from './core/access-control.js';
import { getAdminFieldJourneys } from './services/field-journey-service.js';

const FIELD_ADMIN_ALERT_SELECTOR = 'a[href="campo-admin.html"], a[href$="/campo-admin.html"]';
const FIELD_ADMIN_ALERT_REFRESH_MS = 60000;
const FIELD_ADMIN_ALERT_STORAGE_KEY = 'uv-field-admin-alert-state-v1';
const FIELD_ADMIN_ALERT_SESSION_KEY = 'uv-field-admin-alert-session-v1';

let latestPendingJourneys = [];
let isFirstCheck = true;

function getSessionNotifiedIds() {
    try {
        const raw = sessionStorage.getItem(FIELD_ADMIN_ALERT_SESSION_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function markIdsAsSessionNotified(ids) {
    try {
        const current = getSessionNotifiedIds();
        const updated = Array.from(new Set([...current, ...ids]));
        sessionStorage.setItem(FIELD_ADMIN_ALERT_SESSION_KEY, JSON.stringify(updated));
    } catch {}
}

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
    // Las reglas de estilo de la alerta se cargan de forma estática en css/style.css
    // para cumplir con las políticas CSP de conexión y estilos en el servidor.
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

function markJourneysAsDismissed(session, journeys) {
    if (!session?.user || !Array.isArray(journeys) || !journeys.length) return;

    const state = loadAlertState(session);
    journeys.forEach(journey => {
        const journeyId = String(journey?.id || '').trim();
        if (!journeyId) return;

        const version = createJourneyAlertVersion(journey);
        state.seenVersions[journeyId] = version;
        state.notifiedVersions[journeyId] = version;
    });
    saveAlertState(session, state);

    const remainingUnseen = latestPendingJourneys.filter(journey => {
        const journeyId = String(journey?.id || '').trim();
        return journeyId && state.seenVersions[journeyId] !== createJourneyAlertVersion(journey);
    });
    paintFieldAdminAlert(remainingUnseen.length);
}

function attachDismissGesture(toast, dismissToast) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const begin = (clientX, clientY) => {
        startX = clientX;
        startY = clientY;
        tracking = true;
    };

    const end = (clientX, clientY) => {
        if (!tracking) return;
        tracking = false;

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;

        toast.dataset.swipeDismissed = 'true';
        dismissToast();
    };

    toast.addEventListener('pointerdown', event => begin(event.clientX, event.clientY));
    toast.addEventListener('pointerup', event => end(event.clientX, event.clientY));
    toast.addEventListener('touchstart', event => {
        const touch = event.changedTouches?.[0];
        if (touch) begin(touch.clientX, touch.clientY);
    }, { passive: true });
    toast.addEventListener('touchend', event => {
        const touch = event.changedTouches?.[0];
        if (touch) end(touch.clientX, touch.clientY);
    }, { passive: true });
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
            let dismissedByUser = false;
            const dismissToast = async () => {
                dismissedByUser = true;
                toast.classList.add('is-dismissing');
                const session = await getSession().catch(() => null);
                markJourneysAsDismissed(session, journeys);
                window.setTimeout(() => window.Swal.close(), 120);
            };

            toast.addEventListener('mouseenter', window.Swal.stopTimer);
            toast.addEventListener('mouseleave', window.Swal.resumeTimer);
            toast.style.cursor = 'pointer';
            attachDismissGesture(toast, dismissToast);
            toast.addEventListener('click', (e) => {
                if (e.target.closest('.swal2-close')) {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissToast();
                    return;
                }
                if (dismissedByUser || toast.dataset.swipeDismissed === 'true') return;
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
        if (hasAlert) {
            target.removeAttribute('title'); // Elimina el tooltip feo del navegador
            target.setAttribute('data-tooltip', `${safeCount} jornada${safeCount === 1 ? '' : 's'} pendiente${safeCount === 1 ? '' : 's'}`);
        } else {
            target.removeAttribute('data-tooltip');
            target.setAttribute('title', 'Campo');
        }
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

        // Filtrar para no notificar jornadas que ya fueron notificadas o descartadas en la sesión de navegación actual
        const sessionNotifiedIds = new Set(getSessionNotifiedIds());
        const unseenAndUnnotified = unseenJourneys.filter(journey => {
            const journeyId = String(journey.id || '').trim();
            return !sessionNotifiedIds.has(journeyId);
        });

        // Si es la primera verificación de la sesión de página, notificamos todas las no leídas.
        // En consultas automáticas posteriores en segundo plano, solo notificamos las recién llegadas.
        const journeysToNotify = isFirstCheck
            ? unseenAndUnnotified
            : unseenAndUnnotified.filter(journey => {
                const journeyId = String(journey.id || '').trim();
                return state.notifiedVersions[journeyId] !== createJourneyAlertVersion(journey);
            });

        isFirstCheck = false;

        // Se activan las alertas emergentes (Toasts) premium para notificar nuevas jornadas
        if (journeysToNotify.length) {
            showNewJourneyToast(journeysToNotify);
            // Registrar los IDs en sessionStorage para evitar que vuelvan a alertar en esta sesión de navegación
            const notifiedIds = journeysToNotify.map(j => String(j.id || '').trim()).filter(Boolean);
            markIdsAsSessionNotified(notifiedIds);
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
