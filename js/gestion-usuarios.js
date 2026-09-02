import { supabase } from './supabaseClient.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { CONFIG } from './config.js';
import { getSession, logout, getAccessProfile } from './auth.js';
import {
    DEFAULT_OPERATIONAL_SCOPE,
    deleteFieldWell,
    getFieldTechniciansByScope,
    getFieldWellRecordStatus,
    getFieldWellsByScope,
    getOperationalContracts,
    getUserOperationalScopes,
    setUserOperationalScopes,
    upsertFieldTechnician,
    upsertFieldWell,
    clearOperationalContractsCache
} from './services/operational-contracts-service.js';

// DOM elements — se capturan en initGestionUsuarios() para compatibilidad SPA
let activeUserNameEl = null;
let statTotalUsersEl = null;
let statActiveSessionsEl = null;
let statActiveContractsEl = null;
let formCreateUser = null;
let btnSubmitUser = null;
let usersTableBody = null;
let tableShimmerLoader = null;
let searchUsersInput = null;
let btnLogout = null;
let contractsStatusEl = null;
let contractsListEl = null;
let contractTechniciansListEl = null;
let contractWellsListEl = null;
let selectedContractTitleEl = null;
let selectedContractMetaEl = null;
let selectedContractPillEl = null;
let formContractTechnician = null;
let formContractWell = null;
let selectOperationalScope = null;
let editOperationalScope = null;
let selectRole = null;
let editRole = null;
let selectOperationalScopeHelp = null;
let editOperationalScopeHelp = null;

const CONTRACT_PLACEHOLDERS = Object.freeze({
    ceiba_tomoporo: {
        technician: 'Ej: Juan Perez',
        pozo: 'Ej: CEI0003 / TOM0010',
        campo: 'LA CEIBA / TOMOPORO'
    },
    bmm: {
        technician: 'Ej: Tecnico BMM',
        pozo: 'Ej: BAR-001 / MOT-001 / MG-001',
        campo: 'BARUA / MOTATAN / MENE GRANDE'
    },
    crc_ll: {
        technician: 'Ej: Tecnico CRC',
        pozo: 'Ej: CRC-BM-01 / CRC-BCP-01',
        campo: 'LAGUNILLAS LAGO'
    }
});

const CONTRACT_FIELD_OPTIONS = Object.freeze({
    ceiba_tomoporo: ['LA CEIBA', 'TOMOPORO'],
    bmm: ['BARUA', 'MOTATAN', 'MENE GRANDE'],
    crc_ll: ['LAGUNILLAS LAGO']
});

const ALL_OPERATIONAL_SCOPES_VALUE = '__all_contracts__';

// Modal Elements — se capturan en initGestionUsuarios()
let modalOverlay = null;
let btnCloseModal = null;
let modalUserFullName = null;
let modalUserEmail = null;
let tabButtons = null;
let tabContents = null;

// Tab details fields
let detailEmpresa = null;
let detailRole = null;
let detailLastLogin = null;
let detailCreated = null;

// Password change fields
let formChangePassword = null;
let changePassUserId = null;
let newPasswordInput = null;
let confirmPasswordInput = null;
let togglePasswordsVis = null;
let btnSubmitChangePass = null;
let btnAdminResetPin = null;

// Timeline fields
let logsTimeline = null;
let logsTimelineLoader = null;
let logsEmptyMessage = null;

// Referencia al AbortController para limpiar subscripciones al salir
let _gestionAbortController = null;

let allProfiles = [];
let operationalContracts = [];
let operationalContractStats = new Map();
let selectedOperationalScope = DEFAULT_OPERATIONAL_SCOPE;
let currentSortCol = null;
let isAscending = true;

// Helper to escape HTML safely
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getContractLabel(scopeKey) {
    const contract = operationalContracts.find(item => item.scope_key === scopeKey);
    return contract?.display_name || scopeKey || 'Contrato';
}

function getSelectedContract() {
    return operationalContracts.find(contract => contract.scope_key === selectedOperationalScope) || null;
}

function getContractStats(scopeKey) {
    return operationalContractStats.get(scopeKey) || { technicians: 0, wells: 0 };
}

function getSelectedContractPlaceholders() {
    return CONTRACT_PLACEHOLDERS[selectedOperationalScope] || CONTRACT_PLACEHOLDERS.ceiba_tomoporo;
}

function updateContractInputPlaceholders() {
    const placeholders = getSelectedContractPlaceholders();
    const technicianInput = document.getElementById('contract-technician-name');
    const wellInput = document.getElementById('contract-well-name');
    const fieldInput = document.getElementById('contract-well-field');

    if (technicianInput) technicianInput.placeholder = placeholders.technician;
    if (wellInput) wellInput.placeholder = placeholders.pozo;
    if (fieldInput) fieldInput.placeholder = placeholders.campo;
    syncContractFieldControl();
}

function normalizePozoIdentity(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function inferFieldFromPozo(pozoName, scopeKey = selectedOperationalScope) {
    const rawPozo = String(pozoName || '').trim().toUpperCase();
    const compactPozo = normalizePozoIdentity(rawPozo);
    if (!rawPozo) return '';

    if (scopeKey === 'bmm') {
        if (compactPozo.startsWith('MG') || rawPozo.includes('MENE')) return 'MENE GRANDE';
        if (compactPozo.startsWith('MOT') || rawPozo.includes('MOTATAN')) return 'MOTATAN';
        if (compactPozo.startsWith('BAR') || rawPozo.includes('BARUA')) return 'BARUA';
        return '';
    }

    if (compactPozo.startsWith('CEI')) return 'LA CEIBA';
    if (compactPozo.startsWith('TOM')) return 'TOMOPORO';
    return '';
}

function buildFieldOptionsMarkup(scopeKey, selectedValue = '') {
    const options = CONTRACT_FIELD_OPTIONS[scopeKey] || [];
    const normalizedSelected = String(selectedValue || '').trim().toUpperCase();
    return [
        '<option value="">Selecciona campo</option>',
        ...options.map(option => `<option value="${escapeHtml(option)}" ${option === normalizedSelected ? 'selected' : ''}>${escapeHtml(option)}</option>`)
    ].join('');
}

function syncContractFieldControl() {
    const currentField = document.getElementById('contract-well-field');
    const liftGroup = document.getElementById('contract-well-lift-group');

    if (liftGroup) {
        liftGroup.style.display = selectedOperationalScope === 'crc_ll' ? 'flex' : 'none';
    }

    if (!currentField) return;

    const wrapper = currentField.parentElement;
    const currentValue = currentField.value || '';
    const placeholders = getSelectedContractPlaceholders();

    if (CONTRACT_FIELD_OPTIONS[selectedOperationalScope]?.length) {
        if (currentField.tagName !== 'SELECT') {
            const select = document.createElement('select');
            select.id = 'contract-well-field';
            select.name = currentField.name || 'contract-well-field';
            select.required = currentField.required;
            select.className = currentField.className;
            select.innerHTML = buildFieldOptionsMarkup(selectedOperationalScope, currentValue);
            wrapper.replaceChild(select, currentField);
        } else {
            currentField.innerHTML = buildFieldOptionsMarkup(selectedOperationalScope, currentValue);
        }
        return;
    }

    if (currentField.tagName === 'SELECT') {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'contract-well-field';
        input.name = currentField.name || 'contract-well-field';
        input.value = currentValue;
        input.placeholder = placeholders.campo;
        input.required = currentField.required;
        input.className = currentField.className;
        wrapper.replaceChild(input, currentField);
    }
}

function syncFieldFromWellName() {
    const pozoInput = document.getElementById('contract-well-name');
    const campoInput = document.getElementById('contract-well-field');
    if (!pozoInput || !campoInput) return;

    const inferredField = inferFieldFromPozo(pozoInput.value);
    if (inferredField) campoInput.value = inferredField;
}

async function refreshOperationalContractStats() {
    const pairs = await Promise.all(operationalContracts.map(async contract => {
        const [technicians, wells] = await Promise.all([
            getFieldTechniciansByScope(contract.scope_key, { includeInactive: true }).catch(() => []),
            getFieldWellsByScope(contract.scope_key, { includeInactive: true }).catch(() => [])
        ]);

        return [contract.scope_key, { technicians: technicians.length, wells: wells.length }];
    }));

    operationalContractStats = new Map(pairs);
}

function renderOperationalScopeOptions(selectEl, selectedScope = DEFAULT_OPERATIONAL_SCOPE) {
    if (!selectEl) return;

    const selectedScopes = new Set((Array.isArray(selectedScope) ? selectedScope : [selectedScope])
        .map(scope => String(scope || '').trim())
        .filter(Boolean));

    const hasBmm = selectedScopes.has('bmm');
    const hasCeiba = selectedScopes.has('ceiba_tomoporo') || selectedScopes.has('ct') || selectedScopes.has('cei') || selectedScopes.has('tom');
    const hasCrc = selectedScopes.has('crc_ll') || selectedScopes.has('ccrc_ll');

    let activeValue = 'bmm';
    if (hasBmm && hasCeiba && hasCrc) {
        activeValue = 'todos';
    } else if (hasBmm && hasCeiba) {
        activeValue = 'bmm_ceiba_tomoporo';
    } else if (hasCrc) {
        activeValue = 'crc_ll';
    } else if (hasCeiba) {
        activeValue = 'ceiba_tomoporo';
    } else if (hasBmm) {
        activeValue = 'bmm';
    } else if (selectedScopes.size > 0) {
        activeValue = Array.from(selectedScopes)[0];
    }

    const options = [
        { value: 'bmm', label: 'BMM' },
        { value: 'ceiba_tomoporo', label: 'CEI/TOM' },
        { value: 'crc_ll', label: 'CCRC' },
        { value: 'bmm_ceiba_tomoporo', label: 'BMM + CEIBA / TOM' },
        { value: 'todos', label: 'BMM + CEIBA / TOM + CCRC' }
    ];

    selectEl.innerHTML = options.map(opt => `
        <option value="${opt.value}" ${opt.value === activeValue ? 'selected' : ''}>
            ${escapeHtml(opt.label)}
        </option>
    `).join('');
}

function getAvailableOperationalContracts() {
    return operationalContracts.length > 0
        ? operationalContracts
        : [
            { scope_key: 'bmm', display_name: 'BMM' },
            { scope_key: 'ceiba_tomoporo', display_name: 'CEI/TOM' },
            { scope_key: 'crc_ll', display_name: 'CCRC' }
        ];
}

function getContractDisplayName(contract = {}) {
    const key = contract.scope_key || '';
    if (key === 'bmm') return 'BMM';
    if (key === 'ceiba_tomoporo' || key === 'ct') return 'CEI/TOM';
    if (key === 'crc_ll' || key === 'ccrc_ll') return 'CCRC';
    return contract.display_name || key || 'Contrato';
}

function getSelectedOperationalScopes(selectEl) {
    if (!selectEl) return [DEFAULT_OPERATIONAL_SCOPE];
    const val = String(selectEl.value || '').trim();

    if (val === 'todos' || val === 'all' || val === ALL_OPERATIONAL_SCOPES_VALUE) {
        return ['bmm', 'ceiba_tomoporo', 'crc_ll'];
    }
    if (val === 'bmm_ceiba_tomoporo' || val === 'ambos') {
        return ['bmm', 'ceiba_tomoporo'];
    }
    if (val === 'crc_ll' || val === 'ccrc_ll') {
        return ['crc_ll'];
    }
    if (val === 'ceiba_tomoporo' || val === 'ct') {
        return ['ceiba_tomoporo'];
    }
    if (val === 'bmm') {
        return ['bmm'];
    }
    return [val || DEFAULT_OPERATIONAL_SCOPE];
}

function syncUserScopeSelectMode(roleSelect, scopeSelect, helpEl) {
    if (!roleSelect || !scopeSelect) return;

    // Ocultar la selección de contrato para roles que tienen acceso global por defecto
    const isGlobalRole = ['admin', 'supervisor', 'base_datos', 'gestor_usuarios', 'gerencial', 'seguridad'].includes(roleSelect.value);
    const scopeContainer = scopeSelect.closest('label');
    if (scopeContainer) {
        scopeContainer.style.display = isGlobalRole ? 'none' : 'block';
    }

    let selectedScopes = [];
    if (scopeSelect.dataset.selectedScopes) {
        try {
            const parsedScopes = JSON.parse(scopeSelect.dataset.selectedScopes);
            if (Array.isArray(parsedScopes) && parsedScopes.length > 0) {
                selectedScopes = parsedScopes;
            }
        } catch (error) {
            selectedScopes = getSelectedOperationalScopes(scopeSelect);
        }
        delete scopeSelect.dataset.selectedScopes;
    } else {
        selectedScopes = getSelectedOperationalScopes(scopeSelect);
    }

    renderOperationalScopeOptions(scopeSelect, selectedScopes);

    if (helpEl) {
        helpEl.textContent = 'Selecciona el contrato principal o la combinación de contratos para el acceso del cliente.';
    }
}

async function loadOperationalControlData() {
    if (!contractsStatusEl) return;

    contractsStatusEl.textContent = 'Cargando contratos...';
    try {
        operationalContracts = await getOperationalContracts({ includeInactive: true });
        if (operationalContracts.length === 0) {
            contractsStatusEl.textContent = 'Sin contratos configurados.';
        } else {
            selectedOperationalScope = operationalContracts.some(contract => contract.scope_key === selectedOperationalScope)
                ? selectedOperationalScope
                : operationalContracts[0].scope_key;
            contractsStatusEl.textContent = `${operationalContracts.length} contratos configurados.`;
        }

        await refreshOperationalContractStats();
        updateActiveContractsStat();

        renderOperationalScopeOptions(selectOperationalScope, selectedOperationalScope);
        renderOperationalScopeOptions(editOperationalScope, selectedOperationalScope);
        syncUserScopeSelectMode(selectRole, selectOperationalScope, selectOperationalScopeHelp);
        syncUserScopeSelectMode(editRole, editOperationalScope, editOperationalScopeHelp);
        await renderOperationalContractsControl();
    } catch (error) {
        console.error('Error loading operational contracts:', error);
        contractsStatusEl.textContent = error.message || 'No se pudieron cargar los contratos.';
        renderOperationalScopeOptions(selectOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
        renderOperationalScopeOptions(editOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
        syncUserScopeSelectMode(selectRole, selectOperationalScope, selectOperationalScopeHelp);
        syncUserScopeSelectMode(editRole, editOperationalScope, editOperationalScopeHelp);
    }
}

async function renderOperationalContractsControl() {
    if (!contractsListEl) return;

    if (operationalContracts.length === 0) {
        contractsListEl.innerHTML = '<div class="contract-empty-state">Ejecuta el script de contratos para iniciar el catalogo.</div>';
        contractTechniciansListEl.innerHTML = '';
        contractWellsListEl.innerHTML = '';
        if (selectedContractTitleEl) selectedContractTitleEl.textContent = 'Sin contratos configurados';
        if (selectedContractMetaEl) selectedContractMetaEl.textContent = 'Ejecuta el script SQL y recarga esta pagina.';
        if (selectedContractPillEl) selectedContractPillEl.textContent = 'Pendiente';
        return;
    }

    contractsListEl.innerHTML = operationalContracts.map(contract => `
        <button type="button" class="contract-option-btn ${contract.scope_key === selectedOperationalScope ? 'active' : ''}" data-scope="${escapeHtml(contract.scope_key)}">
            <div class="contract-option-top">
                <div class="contract-option-title">
                    <strong>${escapeHtml(contract.display_name)}</strong>
                    <span>${escapeHtml(contract.short_name || contract.scope_key)} · ${contract.active ? 'Activo' : 'Inactivo'}</span>
                </div>
                <div class="contract-option-badge">${escapeHtml(contract.short_name || contract.scope_key.slice(0, 3).toUpperCase())}</div>
            </div>
            <div class="contract-option-metrics">
                <div class="contract-option-metric">
                    <span>Tecnicos</span>
                    <strong>${getContractStats(contract.scope_key).technicians}</strong>
                </div>
                <div class="contract-option-metric">
                    <span>Pozos</span>
                    <strong>${getContractStats(contract.scope_key).wells}</strong>
                </div>
            </div>
        </button>
    `).join('');

    contractsListEl.querySelectorAll('[data-scope]').forEach(button => {
        button.addEventListener('click', async () => {
            selectedOperationalScope = button.dataset.scope || DEFAULT_OPERATIONAL_SCOPE;
            await renderOperationalContractsControl();
        });
    });

    await renderSelectedContractCatalogs();
}

function renderSelectedContractSummary(technicians = [], wells = []) {
    const contract = getSelectedContract();
    if (!contract) return;

    const uniqueFields = [...new Set(wells.map(well => String(well.campo_name || '').trim()).filter(Boolean))];
    if (selectedContractTitleEl) selectedContractTitleEl.textContent = contract.display_name;
    if (selectedContractMetaEl) {
        selectedContractMetaEl.textContent = `${technicians.length} tecnicos · ${wells.length} pozos${uniqueFields.length ? ` · Campos: ${uniqueFields.join(', ')}` : ''}`;
    }
    if (selectedContractPillEl) selectedContractPillEl.textContent = contract.active ? 'Contrato activo' : 'Contrato inactivo';
    updateContractInputPlaceholders();
}

function renderCatalogRows(container, rows, emptyMessage, renderRow) {
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = `<div class="contract-empty-state">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    container.innerHTML = rows.map(renderRow).join('');
}

async function renderSelectedContractCatalogs() {
    if (!selectedOperationalScope) return;

    try {
        const [technicians, wells] = await Promise.all([
            getFieldTechniciansByScope(selectedOperationalScope, { includeInactive: true }),
            getFieldWellsByScope(selectedOperationalScope, { includeInactive: true })
        ]);
        const recordStatusByPozo = await getFieldWellRecordStatus(wells.map(well => well.pozo_name)).catch(() => new Map());

        operationalContractStats.set(selectedOperationalScope, { technicians: technicians.length, wells: wells.length });
        renderSelectedContractSummary(technicians, wells);

        renderCatalogRows(
            contractTechniciansListEl,
            technicians,
            'No hay tecnicos cargados para este contrato.',
            technician => `
                <div class="contract-item-row">
                    <span>${escapeHtml(technician.full_name)}</span>
                    <div class="contract-item-actions">
                        <small>${technician.active ? 'Activo' : 'Inactivo'}</small>
                        <button type="button" class="contract-manage-btn" data-technician-id="${escapeHtml(technician.id)}">Gestionar</button>
                    </div>
                </div>
            `
        );

        renderCatalogRows(
            contractWellsListEl,
            wells,
            'No hay pozos cargados para este contrato.',
            well => {
                const status = recordStatusByPozo.get(String(well.pozo_name || '').trim().toUpperCase()) || {};
                const recordLabel = status.hasMonitoringRecords
                    ? 'Con registros'
                    : status.hasTechnicalRecord
                        ? 'Solo ficha tecnica'
                        : 'Sin registros';
                return `
                <div class="contract-item-row">
                    <span>${escapeHtml(well.pozo_name)}</span>
                    <div class="contract-item-actions">
                        <small>${escapeHtml(well.campo_name)}${well.lift_method ? ` (${escapeHtml(well.lift_method)})` : ''} · ${recordLabel} · ${well.active ? 'Activo' : 'Inactivo'}</small>
                        <button type="button" class="contract-manage-btn" data-well-id="${escapeHtml(well.id)}">Gestionar</button>
                        <button type="button" class="contract-delete-btn" data-delete-well-id="${escapeHtml(well.id)}">Eliminar</button>
                    </div>
                </div>
            `;
            }
        );

        contractTechniciansListEl?.querySelectorAll('[data-technician-id]').forEach(button => {
            button.addEventListener('click', () => {
                const technician = technicians.find(item => item.id === button.dataset.technicianId);
                if (technician) openTechnicianManager(technician);
            });
        });

        contractWellsListEl?.querySelectorAll('[data-well-id]').forEach(button => {
            button.addEventListener('click', () => {
                const well = wells.find(item => item.id === button.dataset.wellId);
                if (well) openWellManager(well);
            });
        });

        contractWellsListEl?.querySelectorAll('[data-delete-well-id]').forEach(button => {
            button.addEventListener('click', () => {
                const well = wells.find(item => item.id === button.dataset.deleteWellId);
                if (well) confirmDeleteWell(well);
            });
        });
    } catch (error) {
        console.error('Error rendering selected contract catalogs:', error);
        if (contractTechniciansListEl) contractTechniciansListEl.innerHTML = `<div class="contract-status-text">${escapeHtml(error.message)}</div>`;
        if (contractWellsListEl) contractWellsListEl.innerHTML = '';
    }
}

async function confirmDeleteWell(well) {
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Eliminar pozo del catalogo',
        html: `
            <div style="text-align:left; line-height:1.5;">
                <p>Vas a eliminar <strong>${escapeHtml(well.pozo_name)}</strong> del catalogo de <strong>${escapeHtml(getContractLabel(well.operational_scope))}</strong>.</p>
                <p>Los registros historicos no se borran, pero este pozo dejara de aparecer en Campo, Gestion, Dashboard y Estadisticas hasta que lo vuelvas a agregar.</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Si, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b'
    });

    if (!result.isConfirmed) return;

    try {
        await deleteFieldWell(well.id);
        await refreshOperationalManager();
        if (contractsStatusEl) contractsStatusEl.textContent = `Pozo ${well.pozo_name} eliminado del catalogo.`;
        Swal.fire({ icon: 'success', title: 'Pozo eliminado', timer: 1500, showConfirmButton: false });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'No se pudo eliminar el pozo', text: error.message, confirmButtonColor: '#ef4444' });
    }
}

function buildContractOptionsMarkup(selectedScope) {
    return operationalContracts.map(contract => `
        <option value="${escapeHtml(contract.scope_key)}" ${contract.scope_key === selectedScope ? 'selected' : ''}>
            ${escapeHtml(contract.display_name)}
        </option>
    `).join('');
}

function buildWellFieldControlMarkup(scopeKey, selectedValue = '') {
    if (CONTRACT_FIELD_OPTIONS[scopeKey]?.length) {
        return `
            <select id="swal-well-field" class="swal2-select" style="margin:0; width:100%; box-sizing:border-box;">
                ${buildFieldOptionsMarkup(scopeKey, selectedValue)}
            </select>
        `;
    }

    return `<input id="swal-well-field" class="swal2-input" value="${escapeHtml(selectedValue)}" style="margin:0; width:100%; box-sizing:border-box;">`;
}

async function refreshOperationalManager() {
    await refreshOperationalContractStats();
    await renderOperationalContractsControl();
}

async function openTechnicianManager(technician) {
    const result = await Swal.fire({
        title: 'Gestionar tecnico',
        html: `
            <div style="display:grid; gap:12px; text-align:left;">
                <label class="input-group-manager">
                    <span>Nombre</span>
                    <input id="swal-technician-name" class="swal2-input" value="${escapeHtml(technician.full_name)}" style="margin:0; width:100%; box-sizing:border-box;">
                </label>
                <label class="input-group-manager">
                    <span>Contrato</span>
                    <select id="swal-technician-scope" class="swal2-select" style="margin:0; width:100%; box-sizing:border-box;">
                        ${buildContractOptionsMarkup(technician.operational_scope)}
                    </select>
                </label>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Guardar cambios',
        denyButtonText: technician.active ? 'Desactivar' : 'Activar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: technician.active ? '#ef4444' : '#10b981',
        preConfirm: () => ({
            fullName: document.getElementById('swal-technician-name')?.value || '',
            operationalScope: document.getElementById('swal-technician-scope')?.value || technician.operational_scope
        })
    });

    if (result.isConfirmed) {
        await upsertFieldTechnician({
            id: technician.id,
            fullName: result.value.fullName,
            operationalScope: result.value.operationalScope,
            active: technician.active
        });
        selectedOperationalScope = result.value.operationalScope;
        await refreshOperationalManager();
    }

    if (result.isDenied) {
        await upsertFieldTechnician({
            id: technician.id,
            fullName: technician.full_name,
            operationalScope: technician.operational_scope,
            active: !technician.active
        });
        await refreshOperationalManager();
    }
}

async function openWellManager(well) {
    const result = await Swal.fire({
        title: 'Gestionar pozo',
        html: `
            <div style="display:grid; gap:12px; text-align:left;">
                <label class="input-group-manager">
                    <span>Pozo</span>
                    <input id="swal-well-name" class="swal2-input" value="${escapeHtml(well.pozo_name)}" style="margin:0; width:100%; box-sizing:border-box;">
                </label>
                <label class="input-group-manager">
                    <span>Campo</span>
                    ${buildWellFieldControlMarkup(well.operational_scope, well.campo_name)}
                </label>
                <label class="input-group-manager">
                    <span>Contrato</span>
                    <select id="swal-well-scope" class="swal2-select" style="margin:0; width:100%; box-sizing:border-box;">
                        ${buildContractOptionsMarkup(well.operational_scope)}
                    </select>
                </label>
                <label class="input-group-manager" id="swal-well-lift-group" style="display: ${well.operational_scope === 'crc_ll' ? 'flex' : 'none'};">
                    <span>Método de Levantamiento</span>
                    <select id="swal-well-lift" class="swal2-select" style="margin:0; width:100%; box-sizing:border-box;">
                        <option value="BM" ${well.lift_method !== 'BCP' ? 'selected' : ''}>Bombeo Mecánico (BM)</option>
                        <option value="BCP" ${well.lift_method === 'BCP' ? 'selected' : ''}>Cavidades Progresivas (BCP)</option>
                    </select>
                </label>
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Guardar cambios',
        denyButtonText: well.active ? 'Desactivar' : 'Activar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        denyButtonColor: well.active ? '#ef4444' : '#10b981',
        didOpen: () => {
            const pozoField = document.getElementById('swal-well-name');
            const scopeField = document.getElementById('swal-well-scope');
            const syncModalField = () => {
                const inferredField = inferFieldFromPozo(pozoField?.value || '', scopeField?.value || well.operational_scope);
                const fieldControl = document.getElementById('swal-well-field');
                if (fieldControl && inferredField) fieldControl.value = inferredField;
            };

            pozoField?.addEventListener('input', syncModalField);
            scopeField?.addEventListener('change', () => {
                const fieldLabel = document.getElementById('swal-well-field')?.closest('label');
                const fieldControl = document.getElementById('swal-well-field');
                if (!fieldLabel || !fieldControl) return;

                const nextControl = document.createElement('div');
                nextControl.innerHTML = buildWellFieldControlMarkup(scopeField.value, fieldControl.value).trim();
                fieldControl.replaceWith(nextControl.firstElementChild);
                syncModalField();

                const liftGroup = document.getElementById('swal-well-lift-group');
                if (liftGroup) {
                    liftGroup.style.display = scopeField.value === 'crc_ll' ? 'flex' : 'none';
                }
            });
        },
        preConfirm: () => ({
            pozoName: document.getElementById('swal-well-name')?.value || '',
            campoName: document.getElementById('swal-well-field')?.value || '',
            operationalScope: document.getElementById('swal-well-scope')?.value || well.operational_scope,
            liftMethod: document.getElementById('swal-well-scope')?.value === 'crc_ll' ? (document.getElementById('swal-well-lift')?.value || 'BM') : null
        })
    });

    if (result.isConfirmed) {
        try {
            await upsertFieldWell({
                id: well.id,
                pozoName: result.value.pozoName,
                campoName: result.value.campoName,
                operationalScope: result.value.operationalScope,
                liftMethod: result.value.liftMethod,
                active: well.active
            });
            selectedOperationalScope = result.value.operationalScope;
            await refreshOperationalManager();
            Swal.fire({ icon: 'success', title: 'Pozo actualizado', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error('Error al guardar cambios del pozo:', err);
            const msg = err?.message || 'Error desconocido al guardar.';
            Swal.fire({
                icon: 'error',
                title: 'No se pudo guardar',
                html: `<p style="text-align:left;font-size:0.9rem;">${escapeHtml(msg)}</p>
                       <p style="text-align:left;font-size:0.82rem;color:#64748b;margin-top:8px;">Si el nombre del pozo ya existe en otro registro, primero elimina o renombra el pozo duplicado.</p>`,
                confirmButtonColor: '#ef4444'
            });
        }
    }

    if (result.isDenied) {
        try {
            await upsertFieldWell({
                id: well.id,
                pozoName: well.pozo_name,
                campoName: well.campo_name,
                operationalScope: well.operational_scope,
                liftMethod: well.lift_method,
                active: !well.active
            });
            await refreshOperationalManager();
            Swal.fire({ icon: 'success', title: well.active ? 'Pozo desactivado' : 'Pozo activado', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error('Error al cambiar estado del pozo:', err);
            Swal.fire({ icon: 'error', title: 'No se pudo cambiar el estado', text: err?.message || 'Error desconocido.', confirmButtonColor: '#ef4444' });
        }
    }
}

async function loadUserScopeIntoModal(userId) {
    if (!editOperationalScope || !userId) return;

    try {
        const scopes = await getUserOperationalScopes(userId);
        const defaultScope = scopes.find(scope => scope.is_default)?.operational_scope || scopes[0]?.operational_scope || DEFAULT_OPERATIONAL_SCOPE;
        const scopeKeys = scopes.length > 0 ? scopes.map(scope => scope.operational_scope) : [defaultScope];
        renderOperationalScopeOptions(editOperationalScope, scopeKeys);
        editOperationalScope.dataset.selectedScopes = JSON.stringify(scopeKeys);
        syncUserScopeSelectMode(editRole, editOperationalScope, editOperationalScopeHelp);
    } catch (error) {
        console.warn('Could not load user operational scope:', error);
        renderOperationalScopeOptions(editOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
        syncUserScopeSelectMode(editRole, editOperationalScope, editOperationalScopeHelp);
    }
}

// 1. Session Verification
async function checkAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    const profile = getAccessProfile(session);
    if (!profile.canManageUsers) {
        window.location.href = 'dashboard.html';
        return null;
    }

    // Show active user name in header
    activeUserNameEl.textContent = profile.email;
    
    // Fetch profile info for display if it exists
    try {
        const { data: userProf } = await supabase
            .from('profiles')
            .select('nombre, apellido')
            .eq('id', session.user.id)
            .single();
        if (userProf?.nombre) {
            activeUserNameEl.textContent = `${userProf.nombre} ${userProf.apellido}`;
        }
    } catch (e) {
        console.warn('Could not load current user profile:', e);
    }

    return session;
}

// Helper to filter and sort profiles in memory
function getProcessedProfiles() {
    let list = [...allProfiles];
    
    // 1. Filter
    const query = (searchUsersInput?.value || '').toLowerCase().trim();
    if (query) {
        list = list.filter(p => {
            const fullName = `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase();
            const email = String(p.email || '').toLowerCase();
            const empresa = String(p.empresa || '').toLowerCase();
            return fullName.includes(query) || email.includes(query) || empresa.includes(query);
        });
    }
    
    // 2. Sort
    if (currentSortCol) {
        list.sort((a, b) => {
            let valA = '';
            let valB = '';
            
            if (currentSortCol === 'nombre') {
                valA = `${a.nombre || ''} ${a.apellido || ''}`.trim().toLowerCase();
                valB = `${b.nombre || ''} ${b.apellido || ''}`.trim().toLowerCase();
            } else if (currentSortCol === 'email') {
                valA = String(a.email || '').toLowerCase();
                valB = String(b.email || '').toLowerCase();
            } else if (currentSortCol === 'empresa') {
                valA = String(a.empresa || 'UV Servicios').toLowerCase();
                valB = String(b.empresa || 'UV Servicios').toLowerCase();
            } else if (currentSortCol === 'role') {
                valA = getRoleLabel(a.role).toLowerCase();
                valB = getRoleLabel(b.role).toLowerCase();
            } else if (currentSortCol === 'last_login') {
                valA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
                valB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
            } else if (currentSortCol === 'status') {
                valA = a.last_login_at ? 1 : 0;
                valB = b.last_login_at ? 1 : 0;
            }
            
            if (valA < valB) return isAscending ? -1 : 1;
            if (valA > valB) return isAscending ? 1 : -1;
            return 0;
        });
    }
    
    return list;
}

// 2. Fetch and render user list
async function loadUsers() {
    tableShimmerLoader.style.display = 'block';
    usersTableBody.innerHTML = '';
    
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        allProfiles = profiles || [];
        renderUsers(getProcessedProfiles());
        updateStats(allProfiles);
    } catch (err) {
        console.error('Error fetching profiles:', err);
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">
                    ⚠️ Error al cargar los usuarios: ${escapeHtml(err.message)}
                </td>
            </tr>
        `;
    } finally {
        tableShimmerLoader.style.display = 'none';
    }
}

function renderUsers(profiles) {
    if (profiles.length === 0) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #64748b; padding: 30px;">
                    Sin resultados.
                </td>
            </tr>
        `;
        return;
    }

    usersTableBody.innerHTML = profiles.map(profile => {
        const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
        const roleLabel = getRoleLabel(profile.role);
        const roleBadgeClass = getRoleBadgeClass(profile.role);
        
        let lastLoginText = 'Nunca';
        if (profile.last_login_at) {
            lastLoginText = new Date(profile.last_login_at).toLocaleString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }

        const isUserActive = profile.last_login_at ? 'Activo' : 'Creado';
        const statusBadgeStyle = profile.last_login_at
            ? 'background: #ecfdf5; color: #047857;'
            : 'background: #f1f5f9; color: #475569;';

        return `
            <tr>
                <td style="font-weight: 700; color: #0f172a;">${escapeHtml(fullName)}</td>
                <td style="color: #475569;">${escapeHtml(profile.email)}</td>
                <td>${escapeHtml(profile.empresa || 'UV Servicios')}</td>
                <td>
                    <span class="role-badge-premium ${roleBadgeClass}">${escapeHtml(roleLabel)}</span>
                </td>
                <td style="font-size: 0.8rem; color: #64748b;">${escapeHtml(lastLoginText)}</td>
                <td style="text-align: center;">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 0.72rem; font-weight: 700; ${statusBadgeStyle}">
                        ${isUserActive}
                    </span>
                </td>
                <td style="text-align: center;">
                    <button type="button" class="btn-manage-user" data-user-id="${escapeHtml(profile.id)}">
                        Gestionar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStats(profiles) {
    statTotalUsersEl.textContent = String(profiles.length);
    
    // Count active sessions (users who logged in within the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeCount = profiles.filter(p => p.last_login_at && new Date(p.last_login_at) > thirtyDaysAgo).length;
    statActiveSessionsEl.textContent = String(activeCount);

    updateActiveContractsStat();
}

function updateActiveContractsStat() {
    if (!statActiveContractsEl) return;
    const activeContracts = operationalContracts.filter(contract => contract.active !== false).length;
    statActiveContractsEl.textContent = String(activeContracts);
}

function getRoleLabel(role) {
    const labels = {
        admin: 'Administrador',
        supervisor: 'Supervisor',
        campo: 'Técnico de Campo',
        servicios: 'Técnico de Servicios',
        cliente_view: 'Cliente',
        base_datos: 'Base de Datos',
        gestor_usuarios: 'Gestor de Accesos',
        gerencial: 'Gerencial / Dirección'
    };
    return labels[role] || role || 'Cliente';
}

function getRoleBadgeClass(role) {
    const classes = {
        admin: 'badge-admin',
        supervisor: 'badge-supervisor',
        campo: 'badge-campo',
        servicios: 'badge-servicios',
        cliente_view: 'badge-cliente',
        base_datos: 'badge-database',
        gestor_usuarios: 'badge-gestor',
        gerencial: 'badge-gerencial'
    };
    return classes[role] || 'badge-cliente';
}

// 3. User Onboarding (using temporary client to bypass local session override)
async function createUser(email, password, nombre, apellido, empresa, role, operationalScope = DEFAULT_OPERATIONAL_SCOPE) {
    // Initialize temporary non-persist client
    const tempClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    // 1. Sign up the new user
    const { data: authData, error: authError } = await tempClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                nombre,
                apellido,
                empresa,
                role
            }
        }
    });

    if (authError) throw authError;

    const newUser = authData.user;
    if (!newUser) throw new Error('No se pudo inicializar la cuenta de autenticación.');

    // 2. Insert profile directly in public.profiles to guarantee immediate display (in case trigger takes a second)
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{
            id: newUser.id,
            email: email.trim().toLowerCase(),
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            empresa: empresa.trim(),
            role: role,
            operational_scope: operationalScope,
            clave_plana: password
        }]);

    if (profileError) {
        console.warn('Profile direct insert failed, relying on DB trigger:', profileError);
    }

    return newUser;
}

function syncPinResetVisibility(role) {
    const pinResetSection = document.getElementById('btn-admin-reset-pin')?.closest('div');
    if (pinResetSection) {
        const rolesWithDbAccess = ['admin', 'supervisor', 'base_datos', 'seguridad'];
        if (rolesWithDbAccess.includes(role)) {
            pinResetSection.style.display = 'block';
        } else {
            pinResetSection.style.display = 'none';
        }
    }
}

// 4. Modal management functions
function openUserModal(profile) {
    const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
    modalUserFullName.textContent = fullName || 'Sin Nombre';
    modalUserEmail.textContent = profile.email;
    
    document.getElementById('edit-profile-user-id').value = profile.id;
    document.getElementById('edit-profile-clave-plana').value = profile.clave_plana || '';
    document.getElementById('edit-nombre').value = profile.nombre || '';
    document.getElementById('edit-apellido').value = profile.apellido || '';
    document.getElementById('edit-empresa').value = profile.empresa || 'UV Servicios';
    document.getElementById('edit-role').value = profile.role || 'cliente_view';
    renderOperationalScopeOptions(editOperationalScope, profile.operational_scope || DEFAULT_OPERATIONAL_SCOPE);
    loadUserScopeIntoModal(profile.id);
    
    detailLastLogin.textContent = profile.last_login_at
        ? new Date(profile.last_login_at).toLocaleString('es-VE', { hour12: true })
        : 'Nunca';
        
    detailCreated.textContent = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('es-VE')
        : 'Desconocida';
        
    changePassUserId.value = profile.id;
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    
    // Sincronizar visibilidad del botón de restablecer PIN según el rol del usuario
    syncPinResetVisibility(profile.role);
    
    // Activate Details Tab by default
    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'tab-info'));
    tabContents.forEach(tab => tab.classList.toggle('active', tab.id === 'tab-info'));
    
    modalOverlay.style.display = 'flex';
    setTimeout(() => {
        modalOverlay.classList.add('active');
    }, 10);
}

function closeUserModal() {
    modalOverlay.classList.remove('active');
    setTimeout(() => {
        modalOverlay.style.display = 'none';
    }, 150);
}

async function loadAccessLogs(userId) {
    logsTimelineLoader.style.display = 'block';
    logsTimeline.innerHTML = '';
    logsEmptyMessage.style.display = 'none';
    
    try {
        const { data: logs, error } = await supabase
            .from('user_access_logs')
            .select('*')
            .eq('user_id', userId)
            .order('login_time', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        if (!logs || logs.length === 0) {
            logsEmptyMessage.style.display = 'block';
            return;
        }
        
        logsTimeline.innerHTML = logs.map(log => {
            const dateStr = new Date(log.login_time).toLocaleString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            return `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <span class="timeline-time">${escapeHtml(dateStr)}</span>
                        <span class="timeline-label">Inicio de sesión registrado</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading logs:', err);
        logsTimeline.innerHTML = `
            <div style="color: #ef4444; font-weight: 600; padding: 10px; text-align: center;">
                ⚠️ Error al cargar el historial: ${escapeHtml(err.message)}
            </div>
        `;
    } finally {
        logsTimelineLoader.style.display = 'none';
    }
}

// ====================================================================
// SPA V3.0 — Ciclo de vida: init / destroy
// ====================================================================

/**
 * Captura todos los elementos del DOM del contenido SPA inyectado.
 * Debe llamarse DESPUÉS de que el router haya insertado el HTML.
 */
function _captureDomRefs() {
    activeUserNameEl        = document.getElementById('active-user-name');
    statTotalUsersEl        = document.getElementById('stat-total-users');
    statActiveSessionsEl    = document.getElementById('stat-active-sessions');
    statActiveContractsEl   = document.getElementById('stat-active-roles');
    formCreateUser          = document.getElementById('form-create-user');
    btnSubmitUser           = document.getElementById('btn-submit-user');
    usersTableBody          = document.getElementById('users-table-body');
    tableShimmerLoader      = document.getElementById('table-shimmer-loader');
    searchUsersInput        = document.getElementById('search-users');
    btnLogout               = document.getElementById('logout-btn');
    contractsStatusEl       = document.getElementById('contracts-status');
    contractsListEl         = document.getElementById('contracts-list');
    contractTechniciansListEl = document.getElementById('contract-technicians-list');
    contractWellsListEl     = document.getElementById('contract-wells-list');
    selectedContractTitleEl = document.getElementById('selected-contract-title');
    selectedContractMetaEl  = document.getElementById('selected-contract-meta');
    selectedContractPillEl  = document.getElementById('selected-contract-pill');
    formContractTechnician  = document.getElementById('form-contract-technician');
    formContractWell        = document.getElementById('form-contract-well');
    selectOperationalScope  = document.getElementById('select-operational-scope');
    editOperationalScope    = document.getElementById('edit-operational-scope');
    selectRole              = document.getElementById('select-role');
    editRole                = document.getElementById('edit-role');
    selectOperationalScopeHelp = document.getElementById('select-operational-scope-help');
    editOperationalScopeHelp   = document.getElementById('edit-operational-scope-help');

    modalOverlay        = document.getElementById('user-management-modal');
    btnCloseModal       = document.getElementById('close-modal-btn');
    modalUserFullName   = document.getElementById('modal-user-fullname');
    modalUserEmail      = document.getElementById('modal-user-email');
    tabButtons          = document.querySelectorAll('.modal-tab-btn');
    tabContents         = document.querySelectorAll('.tab-content');

    detailEmpresa   = document.getElementById('detail-empresa');
    detailRole      = document.getElementById('detail-role');
    detailLastLogin = document.getElementById('detail-last-login');
    detailCreated   = document.getElementById('detail-created');

    formChangePassword  = document.getElementById('form-change-password');
    changePassUserId    = document.getElementById('change-pass-user-id');
    newPasswordInput    = document.getElementById('new-password');
    confirmPasswordInput= document.getElementById('confirm-password');
    togglePasswordsVis  = document.getElementById('toggle-passwords-vis');
    btnSubmitChangePass = document.getElementById('btn-submit-change-pass');
    btnAdminResetPin    = document.getElementById('btn-admin-reset-pin');

    logsTimeline        = document.getElementById('logs-timeline');
    logsTimelineLoader  = document.getElementById('logs-timeline-loader');
    logsEmptyMessage    = document.getElementById('logs-empty-message');
}

/**
 * Punto de entrada SPA para Gestión de Usuarios.
 * El router llama a esta función después de inyectar el HTML.
 */
export async function initGestionUsuarios() {
    // Resetear estado de sesión anterior
    allProfiles = [];
    operationalContracts = [];
    operationalContractStats = new Map();
    selectedOperationalScope = DEFAULT_OPERATIONAL_SCOPE;
    currentSortCol = null;
    isAscending = true;
    _gestionAbortController = new AbortController();

    // Capturar referencias al DOM recién inyectado
    _captureDomRefs();

    const session = await checkAuth();
    if (!session) return;

    await loadOperationalControlData();
    await loadUsers();

    selectRole?.addEventListener('change', () => syncUserScopeSelectMode(selectRole, selectOperationalScope, selectOperationalScopeHelp));
    editRole?.addEventListener('change', () => {
        syncUserScopeSelectMode(editRole, editOperationalScope, editOperationalScopeHelp);
        syncPinResetVisibility(editRole.value);
    });

    formContractTechnician?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('contract-technician-name');
        const fullName = input?.value || '';

        try {
            await upsertFieldTechnician({ fullName, operationalScope: selectedOperationalScope });
            input.value = '';
            await refreshOperationalContractStats();
            await renderOperationalContractsControl();
            contractsStatusEl.textContent = `Tecnico agregado a ${getContractLabel(selectedOperationalScope)}.`;
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'No se pudo guardar el tecnico', text: error.message, confirmButtonColor: '#ef4444' });
        }
    });

    formContractWell?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const pozoInput = document.getElementById('contract-well-name');
        const campoInput = document.getElementById('contract-well-field');
        const liftInput = document.getElementById('contract-well-lift');
        const inferredField = inferFieldFromPozo(pozoInput?.value || '');
        if (campoInput && inferredField) campoInput.value = inferredField;

        const liftMethodVal = selectedOperationalScope === 'crc_ll' ? (liftInput?.value || 'BM') : null;

        try {
            await upsertFieldWell({
                pozoName: pozoInput?.value || '',
                campoName: campoInput?.value || '',
                operationalScope: selectedOperationalScope,
                liftMethod: liftMethodVal
            });
            pozoInput.value = '';
            if (campoInput && campoInput.tagName === 'INPUT') campoInput.value = '';
            await refreshOperationalContractStats();
            await renderOperationalContractsControl();
            contractsStatusEl.textContent = `Pozo agregado a ${getContractLabel(selectedOperationalScope)}.`;
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'No se pudo guardar el pozo', text: error.message, confirmButtonColor: '#ef4444' });
        }
    });

    formContractWell?.addEventListener('input', (event) => {
        if (event.target?.id === 'contract-well-name') syncFieldFromWellName();
    });

    // Importación de pozos masiva desde Excel
    document.getElementById('btn-import-wells-xlsx')?.addEventListener('click', () => {
        document.getElementById('import-wells-xlsx-file')?.click();
    });

    document.getElementById('import-wells-xlsx-file')?.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleImportWellsXlsx(file);
            event.target.value = '';
        }
    });

    // Table Header Sorting listeners
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const sortCol = th.dataset.sort;
            if (currentSortCol === sortCol) {
                isAscending = !isAscending;
            } else {
                currentSortCol = sortCol;
                isAscending = true;
            }
            
            document.querySelectorAll('th[data-sort]').forEach(item => {
                item.classList.remove('th-sorted-asc', 'th-sorted-desc');
            });
            th.classList.add(isAscending ? 'th-sorted-asc' : 'th-sorted-desc');
            
            renderUsers(getProcessedProfiles());
        });
    });

    // Search filter listener
    searchUsersInput.addEventListener('input', () => {
        renderUsers(getProcessedProfiles());
    });

    // Event delegation for "Gestionar" buttons in the table
    usersTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-manage-user');
        if (btn) {
            const userId = btn.dataset.userId;
            const profile = allProfiles.find(p => p.id === userId);
            if (profile) {
                openUserModal(profile);
            }
        }
    });

    // Close modal triggers
    btnCloseModal.addEventListener('click', closeUserModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeUserModal();
        }
    });

    // Modal Tabs Navigation
    tabButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetTabId = btn.dataset.tab;
            
            tabButtons.forEach(b => b.classList.toggle('active', b === btn));
            tabContents.forEach(tab => tab.classList.toggle('active', tab.id === targetTabId));
            
            if (targetTabId === 'tab-logs') {
                await loadAccessLogs(changePassUserId.value);
            }
        });
    });

    // Password fields visibility toggle
    togglePasswordsVis.addEventListener('change', () => {
        const type = togglePasswordsVis.checked ? 'text' : 'password';
        newPasswordInput.type = type;
        confirmPasswordInput.type = type;
    });

    // Password change submit handler
    formChangePassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = changePassUserId.value;
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        if (password.length < 6) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseña muy corta',
                text: 'La contraseña debe tener al menos 6 caracteres.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }
        
        if (password !== confirmPassword) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseñas no coinciden',
                text: 'Por favor, asegúrate de que ambas contraseñas escritas sean iguales.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }
        
        btnSubmitChangePass.disabled = true;
        btnSubmitChangePass.textContent = 'Actualizando...';
        
        try {
            const { data, error } = await supabase.rpc('admin_change_user_password', {
                target_user_id: userId,
                new_password: password
            });
            
            if (error) throw error;
            
            const email = document.getElementById('modal-user-email').textContent.trim();
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const accessLink = 'https://uvservicios.vercel.app/';
            
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Se ha actualizado tu contraseña de ingreso. Aquí tienes tus credenciales:

📧 *Correo:* ${email}
🔒 *Nueva Contraseña:* ${password}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: '¡Contraseña Actualizada!',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar las nuevas credenciales listas para enviar al usuario:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Se ha actualizado tu contraseña.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${password}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Credenciales',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'Las credenciales actualizadas han sido copiadas al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'Las credenciales actualizadas han sido copiadas al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }
            
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            closeUserModal();
        } catch (err) {
            console.error('Error changing password:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error al cambiar contraseña',
                text: err.message || 'Ocurrió un error inesperado al intentar cambiar la contraseña.',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            btnSubmitChangePass.disabled = false;
            btnSubmitChangePass.textContent = 'Actualizar Contraseña';
        }
    });

    // Admin Reset PIN click handler
    if (btnAdminResetPin) {
        btnAdminResetPin.addEventListener('click', async () => {
            const userId = changePassUserId.value;
            if (!userId) return;

            const confirmResult = await Swal.fire({
                title: '¿Restablecer PIN?',
                text: 'El PIN de seguridad de este usuario volverá a ser 0000. Al ingresar a la base de datos se le obligará a definir uno nuevo.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, restablecer',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#64748b'
            });

            if (!confirmResult.isConfirmed) return;

            btnAdminResetPin.disabled = true;
            const origHtml = btnAdminResetPin.innerHTML;
            btnAdminResetPin.innerHTML = 'Restableciendo...';

            try {
                const { data: success, error } = await supabase.rpc('admin_reset_user_pin', {
                    p_target_user_id: userId
                });

                if (error) throw error;

                if (success === true) {
                    Swal.fire({
                        icon: 'success',
                        title: 'PIN Restablecido',
                        text: 'El PIN del usuario ha sido restablecido a 0000 correctamente.',
                        confirmButtonColor: '#2563eb',
                        timer: 2500
                    });
                    closeUserModal();
                } else {
                    throw new Error('La base de datos no pudo restablecer el PIN.');
                }
            } catch (err) {
                console.error('Error restableciendo PIN:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: err.message || 'Ocurrió un error inesperado al restablecer el PIN.',
                    confirmButtonColor: '#ef4444'
                });
            } finally {
                btnAdminResetPin.disabled = false;
                btnAdminResetPin.innerHTML = origHtml;
            }
        });
    }

    // Profile Edit submit handler
    const formEditProfile = document.getElementById('form-edit-profile');
    const btnSubmitEditProfile = document.getElementById('btn-submit-edit-profile');
    if (formEditProfile) {
        formEditProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const userId = document.getElementById('edit-profile-user-id').value;
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const empresa = document.getElementById('edit-empresa').value.trim();
            const role = document.getElementById('edit-role').value;
            const operationalScopes = getSelectedOperationalScopes(editOperationalScope);
            const operationalScope = operationalScopes[0] || DEFAULT_OPERATIONAL_SCOPE;
            
            btnSubmitEditProfile.disabled = true;
            btnSubmitEditProfile.textContent = 'Guardando...';
            
            try {
                const { data, error } = await supabase.rpc('admin_update_user_profile', {
                    target_user_id: userId,
                    new_nombre: nombre,
                    new_apellido: apellido,
                    new_empresa: empresa,
                    new_role: role
                });
                
                if (error) throw error;

                await setUserOperationalScopes(userId, operationalScopes, {
                    defaultScope: operationalScope,
                    canSwitch: role === 'cliente_view' && operationalScopes.length > 1
                }).catch(error => console.warn('Could not update user operational scope:', error));
                
                Swal.fire({
                    icon: 'success',
                    title: 'Perfil actualizado',
                    text: 'Los datos del usuario se han actualizado con éxito.',
                    confirmButtonColor: '#2563eb'
                });
                
                closeUserModal();
                await loadUsers();
            } catch (err) {
                console.error('Error updating user profile:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error al actualizar',
                    text: err.message || 'No se pudieron guardar los cambios del perfil.',
                    confirmButtonColor: '#ef4444'
                });
            } finally {
                btnSubmitEditProfile.disabled = false;
                btnSubmitEditProfile.textContent = 'Guardar Cambios';
            }
        });
    }

    // Delete User handler
    const btnDeleteUser = document.getElementById('btn-delete-user');
    if (btnDeleteUser) {
        btnDeleteUser.addEventListener('click', async () => {
            const userId = document.getElementById('edit-profile-user-id').value;
            const currentSession = await getSession();
            
            if (userId === currentSession?.user?.id) {
                Swal.fire({
                    icon: 'error',
                    title: 'Operación no permitida',
                    text: 'No puedes eliminar tu propia cuenta de usuario en esta sesión.',
                    confirmButtonColor: '#ef4444'
                });
                return;
            }
            
            const result = await Swal.fire({
                title: '¿Estás seguro?',
                text: 'Esta acción eliminará de forma permanente al usuario y todos sus accesos. No se puede deshacer.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            });
            
            if (result.isConfirmed) {
                btnDeleteUser.disabled = true;
                btnDeleteUser.textContent = 'Eliminando...';
                
                try {
                    const { data, error } = await supabase.rpc('admin_delete_user', {
                        target_user_id: userId
                    });
                    
                    if (error) throw error;
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Usuario eliminado',
                        text: 'El usuario se ha eliminado de forma permanente.',
                        confirmButtonColor: '#2563eb'
                    });
                    
                    closeUserModal();
                    await loadUsers();
                } catch (err) {
                    console.error('Error deleting user:', err);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error al eliminar',
                        text: err.message || 'No se pudo eliminar al usuario de la base de datos.',
                        confirmButtonColor: '#ef4444'
                    });
                } finally {
                    btnDeleteUser.disabled = false;
                    btnDeleteUser.textContent = 'Eliminar Usuario';
                }
            }
        });
    }

    // Share Credentials handler
    const btnShareCredentials = document.getElementById('btn-share-credentials');
    if (btnShareCredentials) {
        btnShareCredentials.addEventListener('click', async () => {
            const email = document.getElementById('modal-user-email').textContent.trim();
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const accessLink = 'https://uvservicios.vercel.app/';
            const clavePlana = document.getElementById('edit-profile-clave-plana').value;
            const passwordToShow = clavePlana || '(Tu contraseña de acceso)';
            
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Aquí tienes tus datos de ingreso para la plataforma:

📧 *Correo:* ${email}
🔒 *Contraseña:* ${passwordToShow}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: 'Compartir Acceso',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar este mensaje con el enlace y correo de ingreso del usuario:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Aquí tienes tus datos de ingreso.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${passwordToShow}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Mensaje',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de acceso ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de acceso ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }
        });
    }

    // Logout trigger
    btnLogout.addEventListener('click', async () => {
        await logout();
    });

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', async () => {
            await logout();
        });
    }

    // Toggle password visibility for user creation
    const toggleCreatePasswordBtn = document.getElementById('toggle-create-password');
    const inputPassword = document.getElementById('input-password');
    if (toggleCreatePasswordBtn && inputPassword) {
        toggleCreatePasswordBtn.addEventListener('click', () => {
            const isPassword = inputPassword.type === 'password';
            inputPassword.type = isPassword ? 'text' : 'password';
            
            toggleCreatePasswordBtn.innerHTML = isPassword 
                ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                   </svg>`
                : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                   </svg>`;
        });
    }

    // Form user creation submit handler
    formCreateUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nombre = document.getElementById('input-nombre').value.trim();
        const apellido = document.getElementById('input-apellido').value.trim();
        const email = document.getElementById('input-email').value.trim();
        const password = document.getElementById('input-password').value;
        const empresa = document.getElementById('input-empresa').value.trim();
        const role = document.getElementById('select-role').value;
        const operationalScopes = getSelectedOperationalScopes(selectOperationalScope);
        const operationalScope = operationalScopes[0] || DEFAULT_OPERATIONAL_SCOPE;

        try {
            btnSubmitUser.disabled = true;
            btnSubmitUser.textContent = 'Procesando registro...';

            const newUser = await createUser(email, password, nombre, apellido, empresa, role, operationalScope);
            await setUserOperationalScopes(newUser.id, operationalScopes, {
                defaultScope: operationalScope,
                canSwitch: role === 'cliente_view' && operationalScopes.length > 1
            }).catch(error => console.warn('Could not assign user operational scope:', error));

            const accessLink = 'https://uvservicios.vercel.app/';
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Se ha creado tu cuenta con éxito. Aquí tienes tus credenciales de ingreso:

📧 *Correo:* ${email}
🔒 *Contraseña:* ${password}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: '¡Usuario Creado con Éxito!',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar este mensaje de bienvenida listo para enviar por WhatsApp o correo:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Se ha creado tu cuenta.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${password}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Credenciales',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de bienvenida ha sido copiado al portapapeles. Ya puedes pegarlo en WhatsApp o Correo.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de bienvenida ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }

            formCreateUser.reset();
            syncUserScopeSelectMode(selectRole, selectOperationalScope, selectOperationalScopeHelp);
            if (inputPassword) {
                inputPassword.type = 'password';
                toggleCreatePasswordBtn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                   </svg>`;
            }
            await loadUsers();
        } catch (err) {
            console.error('Error creating user:', err);
            await Swal.fire({
                title: 'Error de Registro',
                text: err.message || 'No se pudo crear la cuenta de usuario.',
                icon: 'error',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            btnSubmitUser.disabled = false;
            btnSubmitUser.textContent = 'Crear Cuenta Confirmada';
        }
    });
}

/**
 * Limpieza SPA al salir de Gestión de Usuarios.
 * El router llama a esta función antes de navegar a otra página.
 */
export function destroyGestionUsuarios() {
    if (_gestionAbortController) {
        _gestionAbortController.abort();
        _gestionAbortController = null;
    }
    // Nullificar referencias para evitar memory leaks
    activeUserNameEl = statTotalUsersEl = statActiveSessionsEl = statActiveContractsEl = null;
    formCreateUser = btnSubmitUser = usersTableBody = tableShimmerLoader = null;
    searchUsersInput = btnLogout = contractsStatusEl = contractsListEl = null;
    contractTechniciansListEl = contractWellsListEl = selectedContractTitleEl = null;
    selectedContractMetaEl = selectedContractPillEl = null;
    formContractTechnician = formContractWell = null;
    selectOperationalScope = editOperationalScope = null;
    selectRole = editRole = null;
    selectOperationalScopeHelp = editOperationalScopeHelp = null;
    modalOverlay = btnCloseModal = modalUserFullName = modalUserEmail = null;
    tabButtons = tabContents = null;
    detailEmpresa = detailRole = detailLastLogin = detailCreated = null;
    formChangePassword = changePassUserId = null;
    newPasswordInput = confirmPasswordInput = togglePasswordsVis = btnSubmitChangePass = btnAdminResetPin = null;
    logsTimeline = logsTimelineLoader = logsEmptyMessage = null;
}

async function handleImportWellsXlsx(file) {
    if (!file) return;

    try {
        Swal.fire({
            title: 'Procesando archivo...',
            html: '<p style="color:#64748b;">Cargando la librería de Excel e importando pozos...</p>',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Cargar XLSX si no está presente
        if (!window.XLSX) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (rows.length < 2) {
                    Swal.fire('Error', 'El archivo de Excel no contiene suficientes filas (cabecera + datos).', 'error');
                    return;
                }

                // Detectar cabecera y columnas
                const rawHeaders = rows[0].map(h => String(h || '').trim().toLowerCase());
                
                const colIndexes = {
                    pozo: -1, metodo: -1, campo: -1, estacion: -1, bbpd: -1, bnpd: -1, ays: -1
                };

                const headersMap = {
                    pozo: ['pozo', 'well', 'nombre', 'name', 'pozos'],
                    metodo: ['método', 'metodo', 'levantamiento', 'tipo', 'lift_method', 'method', 'sistema'],
                    campo: ['campo', 'field'],
                    estacion: ['estación', 'estacion', 'ef', 'estacion_flujo', 'flow_station', 'flow station', 'estación de flujo'],
                    bbpd: ['bbpd', 'bruta', 'produccion bruta', 'producción bruta', 'gross', 'crudo bruto', 'bruto'],
                    bnpd: ['bnpd', 'neta', 'produccion neta', 'producción neta', 'net', 'crudo neto', 'neto'],
                    ays: ['ays', '%ays', 'ays%', '% ays', '% agua y sedimento', 'agua y sedimento', 'water cut', 'agua']
                };

                rawHeaders.forEach((header, index) => {
                    for (const [key, aliases] of Object.entries(headersMap)) {
                        if (aliases.includes(header) || aliases.some(alias => header.includes(alias))) {
                            if (colIndexes[key] === -1) {
                                colIndexes[key] = index;
                            }
                        }
                    }
                });

                if (colIndexes.pozo === -1) {
                    Swal.fire('Error', 'No se pudo identificar la columna de "Pozo" en la cabecera del Excel.', 'error');
                    return;
                }

                const wellsToUpsert = [];
                const prodToInsert = [];
                const todayStr = new Date().toISOString().split('T')[0];

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length === 0) continue;

                    const pozoVal = colIndexes.pozo !== -1 ? String(row[colIndexes.pozo] || '').trim().toUpperCase() : '';
                    if (!pozoVal) continue; // Salta si no hay nombre de pozo

                    // Resolver Método (BM / BCP)
                    const rawMetodo = colIndexes.metodo !== -1 ? String(row[colIndexes.metodo] || '').trim().toUpperCase() : '';
                    const liftMethod = rawMetodo.includes('BCP') ? 'BCP' : 'BM';

                    // Resolver Campo
                    const campoVal = colIndexes.campo !== -1 ? String(row[colIndexes.campo] || '').trim().toUpperCase() : 'LAGUNILLAS LAGO';

                    // Resolver Estacion
                    const estacionVal = colIndexes.estacion !== -1 ? String(row[colIndexes.estacion] || '').trim().toUpperCase() : 'NINGUNO';

                    // Resolver Producción
                    const bbpdVal = colIndexes.bbpd !== -1 ? parseFloat(row[colIndexes.bbpd]) || 0 : 0;
                    const bnpdVal = colIndexes.bnpd !== -1 ? parseFloat(row[colIndexes.bnpd]) || 0 : 0;
                    
                    let aysVal = 0;
                    const rawAysCell = colIndexes.ays !== -1 ? row[colIndexes.ays] : null;
                    const parsedAys = rawAysCell !== undefined && rawAysCell !== null && rawAysCell !== '' ? parseFloat(rawAysCell) : NaN;
                    
                    if (!isNaN(parsedAys) && parsedAys > 0) {
                        aysVal = parsedAys;
                        if (aysVal <= 1 && String(rawAysCell).includes('.')) {
                            aysVal = aysVal * 100;
                        }
                    } else {
                        aysVal = bbpdVal > 0 ? ((bbpdVal - bnpdVal) / bbpdVal) * 100 : 0;
                    }

                    wellsToUpsert.push({
                        pozo_name: pozoVal,
                        campo_name: campoVal,
                        operational_scope: selectedOperationalScope,
                        lift_method: selectedOperationalScope === 'crc_ll' ? liftMethod : null,
                        active: true,
                        updated_at: new Date().toISOString()
                    });

                    // Añadir producción si tiene valores o estación definida
                    if (bbpdVal > 0 || bnpdVal > 0 || (estacionVal && estacionVal !== 'NINGUNO')) {
                        prodToInsert.push({
                            pozo_name: pozoVal,
                            campo_name: campoVal,
                            ef: estacionVal,
                            bbpd: bbpdVal,
                            bnpd: bnpdVal,
                            ays_percentage: parseFloat(aysVal.toFixed(2)),
                            fecha: todayStr,
                            operational_scope: selectedOperationalScope
                        });
                    }
                }

                if (wellsToUpsert.length === 0) {
                    Swal.fire('Atención', 'No se encontraron pozos válidos para importar.', 'warning');
                    return;
                }

                // Generar tabla HTML de vista previa
                let previewHtml = `
                    <p style="text-align: left; margin-bottom: 10px; color: #475569; font-size: 0.85rem;">
                        A continuación se presenta el listado de los pozos detectados en el archivo Excel con sus datos de configuración y producción.
                    </p>
                    <div style="max-height: 280px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 10px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left; white-space: nowrap;">
                            <thead>
                                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; position: sticky; top: 0; z-index: 10;">
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">Pozo</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">Campo</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">Método</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">Estación (EF)</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">BBPD</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">BNPD</th>
                                    <th style="padding: 10px 8px; font-weight: 700; color: #1e293b;">%AyS</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                for (let i = 0; i < wellsToUpsert.length; i++) {
                    const w = wellsToUpsert[i];
                    const p = prodToInsert.find(prod => prod.pozo_name === w.pozo_name) || {};
                    
                    const methodTag = w.lift_method 
                        ? `<span style="padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; background-color: ${w.lift_method === 'BCP' ? '#e0f2fe' : '#fef3c7'}; color: ${w.lift_method === 'BCP' ? '#0369a1' : '#b45309'};">${w.lift_method}</span>`
                        : '<span style="color: #94a3b8;">—</span>';
                    
                    const efVal = p.ef || '—';
                    const bbpdVal = p.bbpd !== undefined ? p.bbpd : '—';
                    const bnpdVal = p.bnpd !== undefined ? p.bnpd : '—';
                    const aysVal = p.ays_percentage !== undefined ? `${p.ays_percentage}%` : '—';

                    previewHtml += `
                        <tr style="border-bottom: 1px solid #f1f5f9; background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                            <td style="padding: 8px; font-weight: 700; color: #0f172a;">${escapeHtml(w.pozo_name)}</td>
                            <td style="padding: 8px; color: #475569;">${escapeHtml(w.campo_name)}</td>
                            <td style="padding: 8px;">${methodTag}</td>
                            <td style="padding: 8px; color: #0f172a; font-weight: 600;">${escapeHtml(efVal)}</td>
                            <td style="padding: 8px; color: #1e293b;">${bbpdVal}</td>
                            <td style="padding: 8px; color: #1e293b;">${bnpdVal}</td>
                            <td style="padding: 8px; color: #0f766e; font-weight: 600;">${aysVal}</td>
                        </tr>
                    `;
                }

                previewHtml += `
                            </tbody>
                        </table>
                    </div>
                    <p style="margin-top: 15px; font-size: 0.875rem; color: #1e293b; text-align: center;">
                        ¿Confirmas la importación de estos <strong>${wellsToUpsert.length}</strong> pozos con su configuración de producción y estaciones a Supabase?
                    </p>
                `;

                const result = await Swal.fire({
                    title: 'Vista Previa de Importación',
                    html: previewHtml,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, importar catálogo y producción',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#ef4444',
                    width: '650px'
                });

                if (result.isConfirmed) {
                    Swal.fire({
                        title: 'Importando datos...',
                        html: '<p style="color:#64748b;">Guardando pozos y registros de producción...</p>',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    // 1. Subir a Supabase (catálogo de pozos)
                    const { error: wellsError } = await supabase
                        .from('field_well_catalog')
                        .upsert(wellsToUpsert, { onConflict: 'pozo_name' });

                    if (wellsError) throw wellsError;

                    let productionImported = false;
                    let rlsErrorOccurred = false;

                    // 2. Subir a Supabase (datos de producción e historial si hay registros)
                    if (prodToInsert.length > 0) {
                        try {
                            // 2.1 Tabla de instantánea actual
                            const { error: prodError } = await supabase
                                .from('well_production')
                                .upsert(prodToInsert, { onConflict: 'pozo_name' });

                            if (prodError) throw prodError;

                            // 2.2 Tabla de historial técnico
                            const { error: histError } = await supabase
                                .from('well_production_history')
                                .upsert(prodToInsert, { onConflict: 'pozo_name,fecha' });

                            if (histError) throw histError;

                            productionImported = true;
                        } catch (prodErr) {
                            console.warn('Advertencia: No se pudo guardar la producción técnica debido a políticas RLS:', prodErr);
                            rlsErrorOccurred = true;
                        }
                    }

                    clearOperationalContractsCache();
                    await refreshOperationalContractStats();
                    await renderOperationalContractsControl();

                    if (rlsErrorOccurred) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Catálogo cargado (Sin producción)',
                            text: `Se importaron ${wellsToUpsert.length} pozo(s) correctamente, pero los datos de producción/estación requieren un rol con privilegios de Monitoreo Técnico (Admin, Supervisor, Gerencial).`,
                            confirmButtonColor: '#f59e0b'
                        });
                    } else {
                        Swal.fire({
                            icon: 'success',
                            title: '¡Importación Completa!',
                            text: productionImported 
                                ? `Se importaron ${wellsToUpsert.length} pozo(s) correctamente con sus estaciones y datos de producción.`
                                : `Se importaron ${wellsToUpsert.length} pozo(s) correctamente al catálogo activo.`,
                            confirmButtonColor: '#10b981'
                        });
                    }
                }

            } catch (err) {
                console.error('Error importando datos de Excel:', err);
                Swal.fire('Error al procesar el Excel', err.message || 'Ocurrió un error inesperado.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);

    } catch (e) {
        console.error('Error al iniciar importación:', e);
        Swal.fire('Error', 'No se pudo leer el archivo.', 'error');
    }
}
