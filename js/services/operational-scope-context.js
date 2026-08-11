import {
    DEFAULT_OPERATIONAL_SCOPE,
    getFieldWellsByScope,
    getOperationalContracts,
    getUserOperationalScopes,
    normalizeOperationalScope
} from './operational-contracts-service.js';

const ACTIVE_SCOPE_STORAGE_KEY = 'uv-active-operational-scope';
const SCOPE_TRANSITION_DELAY_MS = 2000;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatContractName(name) {
    return String(name || '')
        .replace(/\s*\/\s*/g, ' · ')
        .trim();
}

function canUseAllContracts(accessProfile) {
    return ['admin', 'supervisor', 'gestor_usuarios', 'base_datos'].includes(accessProfile?.role);
}

function applyOperationalScopeTheme(scopeKey) {
    const normalizedScope = normalizeOperationalScope(scopeKey);
    document.body.classList.remove('operational-scope-ct', 'operational-scope-bmm');
    document.body.dataset.operationalScope = normalizedScope;
    document.body.classList.add(normalizedScope === 'bmm' ? 'operational-scope-bmm' : 'operational-scope-ct');
}

function startOperationalScopeTransition(contract = {}) {
    let overlay = document.querySelector('.spa-navigation-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'spa-navigation-overlay';
        overlay.innerHTML = `
            <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" class="spa-loader-logo" alt="UV Servicios">
        `;
        document.body.appendChild(overlay);
    }

    document.body.classList.remove('spa-navigating');
    window.requestAnimationFrame(() => {
        document.body.classList.add('spa-navigating');
    });

    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : SCOPE_TRANSITION_DELAY_MS;
}

function finishOperationalScopeTransition() {
    document.body.classList.remove('operational-scope-transitioning');
    document.body.classList.remove('spa-navigating');
}

function runOperationalScopeChange(onChange, nextScope, transitionDelay) {
    const minDisplayPromise = new Promise(resolve => window.setTimeout(resolve, 600));

    window.setTimeout(async () => {
        if (typeof onChange !== 'function') {
            finishOperationalScopeTransition();
            return;
        }

        let didLeavePage = false;
        const markLeaving = () => { didLeavePage = true; };
        window.addEventListener('pagehide', markLeaving, { once: true });
        window.addEventListener('beforeunload', markLeaving, { once: true });

        try {
            const result = onChange(nextScope);
            if (result instanceof Promise || (result && typeof result.then === 'function')) {
                await Promise.all([result, minDisplayPromise]);
            } else {
                await minDisplayPromise;
            }
        } catch (error) {
            console.error('Error durante el cambio de contrato:', error);
        } finally {
            if (!didLeavePage) {
                finishOperationalScopeTransition();
            }
        }
    }, transitionDelay);
}

export function getActiveOperationalScope() {
    return normalizeOperationalScope(sessionStorage.getItem(ACTIVE_SCOPE_STORAGE_KEY));
}

export function setActiveOperationalScope(scopeKey) {
    const normalizedScope = normalizeOperationalScope(scopeKey);
    sessionStorage.setItem(ACTIVE_SCOPE_STORAGE_KEY, normalizedScope);
    applyOperationalScopeTheme(normalizedScope);
    window.dispatchEvent(new CustomEvent('uv-operational-scope-change', {
        detail: { scopeKey: normalizedScope }
    }));
    return normalizedScope;
}

export async function getActiveOperationalScopeWellNames() {
    const activeScope = getActiveOperationalScope();
    const wells = await getFieldWellsByScope(activeScope);
    return [...new Set((wells || [])
        .map(well => String(well.pozo_name || '').trim().toUpperCase())
        .filter(Boolean))];
}

export async function initOperationalScopeContext(session, accessProfile = {}) {
    let contracts = [];
    let userScopes = [];

    try {
        contracts = await getOperationalContracts({ includeInactive: false });
    } catch (error) {
        console.warn('No se pudieron cargar contratos operativos:', error);
    }

    try {
        userScopes = await getUserOperationalScopes(session?.user?.id);
    } catch (error) {
        console.warn('No se pudieron cargar contratos asignados al usuario:', error);
    }

    const availableContracts = canUseAllContracts(accessProfile)
        ? contracts
        : contracts.filter(contract => userScopes.some(scope => scope.operational_scope === contract.scope_key));

    const fallbackContracts = availableContracts.length > 0
        ? availableContracts
        : contracts.filter(contract => contract.scope_key === DEFAULT_OPERATIONAL_SCOPE);

    const scopedContracts = fallbackContracts.length > 0
        ? fallbackContracts
        : [{ scope_key: DEFAULT_OPERATIONAL_SCOPE, display_name: 'Ceiba / Tomoporo', short_name: 'CT', active: true }];

    const defaultScope = userScopes.find(scope => scope.is_default)?.operational_scope
        || userScopes[0]?.operational_scope
        || scopedContracts[0]?.scope_key
        || DEFAULT_OPERATIONAL_SCOPE;
    const storedScope = normalizeOperationalScope(sessionStorage.getItem(ACTIVE_SCOPE_STORAGE_KEY));
    const allowedScopeKeys = new Set(scopedContracts.map(contract => contract.scope_key));
    const activeScope = allowedScopeKeys.has(storedScope) ? storedScope : normalizeOperationalScope(defaultScope);

    setActiveOperationalScope(activeScope);

    return {
        activeScope,
        contracts: scopedContracts,
        canSwitch: scopedContracts.length > 1
    };
}

function renderMobileOperationalScopeMirror(target, context, onChange) {
    if (!target?.id || target.id.includes('-mobile-')) return;

    if (document.querySelector('.mobile-operational-scope-bar')) {
        document.body.classList.add('has-mobile-operational-scope');
        return;
    }

    const topBar = document.querySelector('.mobile-top-app-bar');
    if (!topBar) return;

    const mobileBar = document.createElement('div');
    mobileBar.className = 'mobile-operational-scope-bar';
    mobileBar.innerHTML = `<div id="${escapeHtml(target.id)}-mobile"></div>`;
    topBar.insertAdjacentElement('afterend', mobileBar);
    document.body.classList.add('has-mobile-operational-scope');
    renderOperationalScopeSwitcher(mobileBar.firstElementChild, context, { onChange, renderMobileMirror: false });
}

export function renderOperationalScopeSwitcher(container, context, { onChange = null, renderMobileMirror = true } = {}) {
    const target = typeof container === 'string' ? document.getElementById(container) : container;
    if (!target || !context?.contracts?.length) return;
    target.classList.add('operational-scope-switcher-host');

    const activeContract = context.contracts.find(contract => contract.scope_key === context.activeScope) || context.contracts[0];
    const isBmm = activeContract?.scope_key === 'bmm';
    const switcherId = `${target.id || 'operational-scope'}-global-menu`;

    if (!context.canSwitch) {
        target.innerHTML = `
            <div class="operational-scope-switcher ${isBmm ? 'scope-bmm' : 'scope-ct'} is-locked">
                <span class="operational-scope-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11z"></path>
                        <circle cx="12" cy="10" r="2.5"></circle>
                    </svg>
                </span>
                <span class="operational-scope-label">Contrato</span>
                <strong>${escapeHtml(formatContractName(activeContract.display_name))}</strong>
            </div>
        `;
        if (renderMobileMirror) renderMobileOperationalScopeMirror(target, context, onChange);
        return;
    }

    document.getElementById(switcherId)?.remove();

    target.innerHTML = `
        <div class="operational-scope-switcher ${isBmm ? 'scope-bmm' : 'scope-ct'} is-custom-select">
            <span class="operational-scope-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11z"></path>
                    <circle cx="12" cy="10" r="2.5"></circle>
                </svg>
            </span>
            <span class="operational-scope-label">Contrato</span>
            <button type="button" class="operational-scope-trigger" aria-label="Cambiar contrato operativo" aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeHtml(switcherId)}">
                <span>${escapeHtml(formatContractName(activeContract.display_name))}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6"></path>
                </svg>
            </button>
            <div id="${escapeHtml(switcherId)}" class="operational-scope-menu" role="listbox" aria-label="Contratos operativos">
                ${context.contracts.map(contract => `
                    <button type="button" class="operational-scope-option${contract.scope_key === context.activeScope ? ' is-selected' : ''}" role="option" aria-selected="${contract.scope_key === context.activeScope ? 'true' : 'false'}" data-scope-key="${escapeHtml(contract.scope_key)}">
                        ${escapeHtml(formatContractName(contract.display_name))}
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    const switcher = target.querySelector('.operational-scope-switcher');
    const trigger = target.querySelector('.operational-scope-trigger');
    const triggerLabel = target.querySelector('.operational-scope-trigger span');
    const menu = target.querySelector('.operational-scope-menu');
    if (menu) document.body.appendChild(menu);

    const syncSwitcherValue = scopeKey => {
        const normalizedScope = normalizeOperationalScope(scopeKey);
        const selectedContract = context.contracts.find(contract => contract.scope_key === normalizedScope) || context.contracts[0];
        if (!selectedContract) return;

        context.activeScope = selectedContract.scope_key;
        if (triggerLabel) triggerLabel.textContent = formatContractName(selectedContract.display_name);
        switcher?.classList.toggle('scope-bmm', selectedContract.scope_key === 'bmm');
        switcher?.classList.toggle('scope-ct', selectedContract.scope_key !== 'bmm');
        menu?.querySelectorAll('[data-scope-key]').forEach(option => {
            const isSelected = option.dataset.scopeKey === selectedContract.scope_key;
            option.classList.toggle('is-selected', isSelected);
            option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    };

    const closeMenu = () => {
        switcher?.classList.remove('is-open');
        trigger?.setAttribute('aria-expanded', 'false');
        menu?.classList.remove('is-open');
        menu?.removeAttribute('style');
        menu?.classList.remove('opens-up');
    };

    const positionMenu = () => {
        if (!switcher || !menu) return;
        const rect = switcher.getBoundingClientRect();
        const menuWidth = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
        const left = Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12);
        const spaceBelow = window.innerHeight - rect.bottom;
        const opensUp = spaceBelow < 150 && rect.top > spaceBelow;
        const top = opensUp
            ? Math.max(12, rect.top - menu.offsetHeight - 8)
            : Math.min(window.innerHeight - 12, rect.bottom + 8);

        menu.classList.toggle('opens-up', opensUp);
        menu.style.width = `${menuWidth}px`;
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    };

    trigger?.addEventListener('click', event => {
        event.stopPropagation();
        const willOpen = !switcher?.classList.contains('is-open');
        document.querySelectorAll('.operational-scope-switcher.is-open').forEach(openSwitcher => {
            openSwitcher.classList.remove('is-open');
            openSwitcher.querySelector('.operational-scope-trigger')?.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.operational-scope-menu.is-open').forEach(openMenu => {
            openMenu.classList.remove('is-open', 'opens-up');
            openMenu.removeAttribute('style');
        });
        if (willOpen) {
            positionMenu();
        }
        switcher?.classList.toggle('is-open', willOpen);
        menu?.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
    });

    menu?.querySelectorAll('[data-scope-key]').forEach(option => {
        option.addEventListener('click', event => {
            event.stopPropagation();
            closeMenu();
            const nextScope = setActiveOperationalScope(option.dataset.scopeKey);
            syncSwitcherValue(nextScope);
            const selectedContract = context.contracts.find(contract => contract.scope_key === nextScope) || context.contracts[0];
            const transitionDelay = startOperationalScopeTransition(selectedContract);
            runOperationalScopeChange(onChange, nextScope, transitionDelay);
        });
    });

    window.addEventListener('uv-operational-scope-change', event => {
        syncSwitcherValue(event.detail?.scopeKey);
    });

    target.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        closeMenu();
        trigger?.focus();
    });
    window.addEventListener('resize', closeMenu, { passive: true });
    window.addEventListener('scroll', closeMenu, { passive: true });

    if (renderMobileMirror) renderMobileOperationalScopeMirror(target, context, onChange);
}
