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
    upsertFieldWell
} from './services/operational-contracts-service.js';

// DOM elements
const activeUserNameEl = document.getElementById('active-user-name');
const statTotalUsersEl = document.getElementById('stat-total-users');
const statActiveSessionsEl = document.getElementById('stat-active-sessions');
const statActiveContractsEl = document.getElementById('stat-active-roles');
const formCreateUser = document.getElementById('form-create-user');
const btnSubmitUser = document.getElementById('btn-submit-user');
const usersTableBody = document.getElementById('users-table-body');
const tableShimmerLoader = document.getElementById('table-shimmer-loader');
const searchUsersInput = document.getElementById('search-users');
const btnLogout = document.getElementById('logout-btn');
const contractsStatusEl = document.getElementById('contracts-status');
const contractsListEl = document.getElementById('contracts-list');
const contractTechniciansListEl = document.getElementById('contract-technicians-list');
const contractWellsListEl = document.getElementById('contract-wells-list');
const selectedContractTitleEl = document.getElementById('selected-contract-title');
const selectedContractMetaEl = document.getElementById('selected-contract-meta');
const selectedContractPillEl = document.getElementById('selected-contract-pill');
const formContractTechnician = document.getElementById('form-contract-technician');
const formContractWell = document.getElementById('form-contract-well');
const selectOperationalScope = document.getElementById('select-operational-scope');
const editOperationalScope = document.getElementById('edit-operational-scope');

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
    }
});

const CONTRACT_FIELD_OPTIONS = Object.freeze({
    ceiba_tomoporo: ['LA CEIBA', 'TOMOPORO'],
    bmm: ['BARUA', 'MOTATAN', 'MENE GRANDE']
});

// Modal Elements
const modalOverlay = document.getElementById('user-management-modal');
const btnCloseModal = document.getElementById('close-modal-btn');
const modalUserFullName = document.getElementById('modal-user-fullname');
const modalUserEmail = document.getElementById('modal-user-email');
const tabButtons = document.querySelectorAll('.modal-tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Tab details fields
const detailEmpresa = document.getElementById('detail-empresa');
const detailRole = document.getElementById('detail-role');
const detailLastLogin = document.getElementById('detail-last-login');
const detailCreated = document.getElementById('detail-created');

// Password change fields
const formChangePassword = document.getElementById('form-change-password');
const changePassUserId = document.getElementById('change-pass-user-id');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const togglePasswordsVis = document.getElementById('toggle-passwords-vis');
const btnSubmitChangePass = document.getElementById('btn-submit-change-pass');

// Timeline fields
const logsTimeline = document.getElementById('logs-timeline');
const logsTimelineLoader = document.getElementById('logs-timeline-loader');
const logsEmptyMessage = document.getElementById('logs-empty-message');

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

    const contracts = operationalContracts.length > 0
        ? operationalContracts
        : [
            { scope_key: 'ceiba_tomoporo', display_name: 'Ceiba / Tomoporo' },
            { scope_key: 'bmm', display_name: 'Barua / Motatan / Mene Grande' }
        ];

    selectEl.innerHTML = contracts.map(contract => `
        <option value="${escapeHtml(contract.scope_key)}" ${contract.scope_key === selectedScope ? 'selected' : ''}>
            ${escapeHtml(contract.display_name)}
        </option>
    `).join('');
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
        await renderOperationalContractsControl();
    } catch (error) {
        console.error('Error loading operational contracts:', error);
        contractsStatusEl.textContent = error.message || 'No se pudieron cargar los contratos.';
        renderOperationalScopeOptions(selectOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
        renderOperationalScopeOptions(editOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
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
                        <small>${escapeHtml(well.campo_name)} · ${recordLabel} · ${well.active ? 'Activo' : 'Inactivo'}</small>
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
            });
        },
        preConfirm: () => ({
            pozoName: document.getElementById('swal-well-name')?.value || '',
            campoName: document.getElementById('swal-well-field')?.value || '',
            operationalScope: document.getElementById('swal-well-scope')?.value || well.operational_scope
        })
    });

    if (result.isConfirmed) {
        await upsertFieldWell({
            id: well.id,
            pozoName: result.value.pozoName,
            campoName: result.value.campoName,
            operationalScope: result.value.operationalScope,
            active: well.active
        });
        selectedOperationalScope = result.value.operationalScope;
        await refreshOperationalManager();
    }

    if (result.isDenied) {
        await upsertFieldWell({
            id: well.id,
            pozoName: well.pozo_name,
            campoName: well.campo_name,
            operationalScope: well.operational_scope,
            active: !well.active
        });
        await refreshOperationalManager();
    }
}

async function loadUserScopeIntoModal(userId) {
    if (!editOperationalScope || !userId) return;

    try {
        const scopes = await getUserOperationalScopes(userId);
        const defaultScope = scopes.find(scope => scope.is_default)?.operational_scope || scopes[0]?.operational_scope || DEFAULT_OPERATIONAL_SCOPE;
        renderOperationalScopeOptions(editOperationalScope, defaultScope);
    } catch (error) {
        console.warn('Could not load user operational scope:', error);
        renderOperationalScopeOptions(editOperationalScope, DEFAULT_OPERATIONAL_SCOPE);
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
        cliente_view: 'Cliente (Solo Lectura)',
        base_datos: 'Base de Datos',
        gestor_usuarios: 'Gestor de Accesos'
    };
    return labels[role] || role || 'Cliente (Solo Lectura)';
}

function getRoleBadgeClass(role) {
    const classes = {
        admin: 'badge-admin',
        supervisor: 'badge-supervisor',
        campo: 'badge-campo',
        cliente_view: 'badge-cliente',
        base_datos: 'badge-database',
        gestor_usuarios: 'badge-gestor'
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

// 5. Events binding
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    if (!session) return;

    await loadOperationalControlData();
    await loadUsers();

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
        const inferredField = inferFieldFromPozo(pozoInput?.value || '');
        if (campoInput && inferredField) campoInput.value = inferredField;

        try {
            await upsertFieldWell({
                pozoName: pozoInput?.value || '',
                campoName: campoInput?.value || '',
                operationalScope: selectedOperationalScope
            });
            pozoInput.value = '';
            campoInput.value = '';
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
            const operationalScope = editOperationalScope?.value || DEFAULT_OPERATIONAL_SCOPE;
            
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

                await setUserOperationalScopes(userId, [operationalScope], {
                    defaultScope: operationalScope,
                    canSwitch: false
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
        const operationalScope = selectOperationalScope?.value || DEFAULT_OPERATIONAL_SCOPE;

        try {
            btnSubmitUser.disabled = true;
            btnSubmitUser.textContent = 'Procesando registro...';

            const newUser = await createUser(email, password, nombre, apellido, empresa, role, operationalScope);
            await setUserOperationalScopes(newUser.id, [operationalScope], {
                defaultScope: operationalScope,
                canSwitch: false
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
});
