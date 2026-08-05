import {
    DEFAULT_OPERATIONAL_SCOPE,
    getFieldWellsByScope,
    getOperationalContracts,
    getUserOperationalScopes,
    normalizeOperationalScope
} from './operational-contracts-service.js';

const ACTIVE_SCOPE_STORAGE_KEY = 'uv-active-operational-scope';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

export function renderOperationalScopeSwitcher(container, context, { onChange = null } = {}) {
    const target = typeof container === 'string' ? document.getElementById(container) : container;
    if (!target || !context?.contracts?.length) return;

    const activeContract = context.contracts.find(contract => contract.scope_key === context.activeScope) || context.contracts[0];
    const isBmm = activeContract?.scope_key === 'bmm';

    if (!context.canSwitch) {
        target.innerHTML = `
            <div class="operational-scope-switcher ${isBmm ? 'scope-bmm' : 'scope-ct'} is-locked">
                <span class="operational-scope-label">Contrato</span>
                <strong>${escapeHtml(activeContract.display_name)}</strong>
            </div>
        `;
        return;
    }

    target.innerHTML = `
        <label class="operational-scope-switcher ${isBmm ? 'scope-bmm' : 'scope-ct'}">
            <span class="operational-scope-label">Contrato</span>
            <select id="operational-scope-global-select" aria-label="Cambiar contrato operativo">
                ${context.contracts.map(contract => `
                    <option value="${escapeHtml(contract.scope_key)}" ${contract.scope_key === context.activeScope ? 'selected' : ''}>
                        ${escapeHtml(contract.display_name)}
                    </option>
                `).join('')}
            </select>
        </label>
    `;

    target.querySelector('select')?.addEventListener('change', event => {
        const nextScope = setActiveOperationalScope(event.target.value);
        if (typeof onChange === 'function') onChange(nextScope);
    });
}