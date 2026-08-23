/**
 * ====================================================================
 * UV SERVICIOS - CONTROLADOR DEL MÓDULO DE SERVICIOS
 * ====================================================================
 * Gestiona el ciclo de vida, la bitácora hora a hora, el inventario técnico
 * de componentes de fondo y la sincronización en tiempo real con Supabase.
 */

import { supabase } from '../js/supabaseClient.js';

// Variables de estado del ticket actual en edición y datos del usuario
let currentUser = null;
let currentTicketId = null;
let currentTicketStatus = 'draft';
let userRole = 'cliente_view';
let activeTab = 'tab-dashboard';

// Estado del signature canvas interactivo
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentSignatureTarget = null; // 'uv' o 'client'
let signatureCanvas = null;
let signatureCtx = null;

// Configuración de los componentes BES de fondo para autogeneración de campos
const EQUIPMENT_SCHEMA = [
    { category: 'PUMP', label: 'Bomba', count: 3, fields: ['manufacturer', 'series', 'stages', 'type', 'length', 'serial_number', 'rotation', 'housing', 'status_condition', 'comments'] },
    { category: 'SEPARATOR', label: 'Separador de Gas / Intake', count: 1, fields: ['manufacturer', 'type', 'length', 'serial_number', 'rotation', 'housing', 'status_condition', 'comments'] },
    { category: 'PROTECTOR', label: 'Protector (Sello)', count: 2, fields: ['manufacturer', 'type', 'length', 'serial_number', 'rotation', 'housing', 'status_condition', 'comments'] },
    { category: 'MOTOR', label: 'Motor Eléctrico', count: 2, fields: ['manufacturer', 'type', 'stages', 'length', 'serial_number', 'rotation', 'housing', 'insulation_mohm', 'continuity_ohms', 'status_condition', 'comments'] },
    { category: 'SENSOR', label: 'Sensor de Fondo', count: 1, fields: ['manufacturer', 'type', 'length', 'serial_number', 'insulation_mohm', 'status_condition', 'comments'] },
    { category: 'CABLE', label: 'Cable de Potencia', count: 3, fields: ['type', 'series', 'length', 'serial_number', 'insulation_mohm', 'continuity_ohms', 'reel_number', 'status_condition', 'comments'] },
    { category: 'VALVE', label: 'Válvula', count: 4, labelNames: ['Check Valve', 'Phoenix Sub', 'Phoenix Descarga', 'Drain Valve'], fields: ['type', 'length', 'serial_number', 'status_condition', 'comments'] }
];

// Al cargar el documento, inicializamos la aplicación
document.addEventListener('DOMContentLoaded', initApp);

/**
 * Inicialización de la aplicación y chequeos de seguridad
 */
async function initApp() {
    try {
        // 1. Obtener la sesión activa del usuario
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        // Si no hay sesión, redirigir al login principal
        if (!session) {
            window.location.href = '../index.html';
            return;
        }

        currentUser = session.user;

        // 2. Obtener el perfil público del usuario para validar el rol
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, nombre, apellido')
            .eq('id', currentUser.id)
            .single();

        if (profileError) throw profileError;

        userRole = profile?.role || 'cliente_view';

        // Validar permisos: solo roles autorizados pueden usar el módulo
        const allowedRoles = ['admin', 'supervisor', 'servicios'];
        if (!allowedRoles.includes(userRole)) {
            Swal.fire({
                icon: 'error',
                title: 'Acceso Denegado',
                text: 'No tienes los permisos requeridos para ingresar al Módulo de Servicios.'
            }).then(() => {
                window.location.href = '../index.html';
            });
            return;
        }

        // 3. Renderizar metadatos de usuario en el header y en el sidebar
        const displayName = `${profile.nombre} ${profile.apellido}`;
        const displayRole = userRole === 'servicios' ? 'Técnico de Servicios' : (userRole === 'admin' ? 'Administrador' : 'Supervisor');

        document.getElementById('user-display-name').textContent = displayName;
        document.getElementById('user-display-role').textContent = displayRole;

        // Sidebar user info (desktop)
        const sidebarName = document.getElementById('sidebar-user-name');
        const sidebarRole = document.getElementById('sidebar-user-role');
        if (sidebarName) sidebarName.textContent = displayName;
        if (sidebarRole) sidebarRole.textContent = displayRole;

        // Ocultar pantalla de carga
        document.getElementById('loader-overlay').classList.add('hidden');

        // 4. Registrar escuchadores de eventos e inicializar formularios
        setupEventListeners();
        buildEquipmentForms();
        loadTicketsList();

    } catch (err) {
        console.error('Error al inicializar aplicación:', err);
        Swal.fire({ icon: 'error', title: 'Error de Inicialización', text: err.message });
    }
}

/**
 * Configura los eventos del DOM (botones, cambio de pestañas, etc.)
 */
function setupEventListeners() {
    // Manejo de cambio de pestañas (Tabs móvil)
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // Manejo de navegación del Sidebar (Desktop)
    const sidebarLinks = document.querySelectorAll('.svc-nav-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetTab = link.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // Agregar fila en la bitácora hora a hora
    document.getElementById('btn-add-ops-row').addEventListener('click', () => addOpsRow());

    // Botón para guardar solo la bitácora del día
    const btnSaveOpsDay = document.getElementById('btn-save-ops-day');
    if (btnSaveOpsDay) {
        btnSaveOpsDay.addEventListener('click', () => saveOperationsLogOnly());
    }

    // Drag & Drop para fotos de soporte
    const dragArea = document.getElementById('photo-drag-drop-area');
    const fileInput = document.getElementById('photo-file-input');

    if (dragArea && fileInput) {
        dragArea.addEventListener('click', () => fileInput.click());
        dragArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragArea.style.borderColor = 'var(--primary-color)';
            dragArea.style.background = '#eff6ff';
        });
        dragArea.addEventListener('dragleave', () => {
            dragArea.style.borderColor = 'var(--border-color)';
            dragArea.style.background = '#f8fafc';
        });
        dragArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragArea.style.borderColor = 'var(--border-color)';
            dragArea.style.background = '#f8fafc';
            if (e.dataTransfer.files.length > 0) {
                handlePhotoUploads(e.dataTransfer.files);
            }
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handlePhotoUploads(e.target.files);
            }
        });
    }



    // Botón de deslogueo (header móvil)
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '../index.html';
    });

    // Botón de deslogueo (sidebar desktop)
    const sidebarLogout = document.getElementById('sidebar-btn-logout');
    if (sidebarLogout) {
        sidebarLogout.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = '../index.html';
        });
    }

    // Botón de cancelar / volver a la bandeja
    document.getElementById('btn-cancel-ticket').addEventListener('click', () => switchTab('tab-dashboard'));

    // Botones de guardado de ticket
    document.getElementById('btn-save-draft').addEventListener('click', () => saveTicket('draft'));
    document.getElementById('btn-submit-ticket').addEventListener('click', () => saveTicket('completed'));

    // Filtros del buscador
    document.getElementById('search-tickets').addEventListener('input', filterTickets);
    document.getElementById('filter-type').addEventListener('change', filterTickets);

    // Evento para cambiar la fecha de la bitácora del día
    document.getElementById('pull-ops-date').addEventListener('change', async (e) => {
        const selectedDate = e.target.value;
        if (currentTicketId && selectedDate) {
            await loadOperationsForDate(currentTicketId, selectedDate);
        }
    });

    // Eventos para firma digital (lienzo canvas)
    document.getElementById('btn-draw-sig-uv').addEventListener('click', () => openSignatureModal('uv'));
    document.getElementById('btn-draw-sig-client').addEventListener('click', () => openSignatureModal('client'));
    document.getElementById('btn-clear-sig-uv').addEventListener('click', () => clearSavedSignature('uv'));
    document.getElementById('btn-clear-sig-client').addEventListener('click', () => clearSavedSignature('client'));

    // Eventos del modal de firma
    document.getElementById('btn-modal-clear').addEventListener('click', () => clearSignatureCanvas());
    document.getElementById('btn-modal-cancel').addEventListener('click', () => closeSignatureModal());
    document.getElementById('btn-modal-save').addEventListener('click', () => saveSignatureFromCanvas());

    // Inicializar canvas de dibujo
    initSignatureCanvas();
}

/**
 * Cambia la pestaña activa
 */
function switchTab(tabId) {
    activeTab = tabId;
    // Sincronizar tabs móvil
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    // Sincronizar nav links del sidebar desktop
    document.querySelectorAll('.svc-nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-tab') === tabId);
    });
    // Sincronizar paneles de contenido
    document.querySelectorAll('.tab-content-panel').forEach(panel => {
        panel.classList.toggle('active', panel.getAttribute('id') === tabId);
    });

    // Si salimos del formulario, reseteamos el ID del ticket actual
    if (tabId === 'tab-dashboard') {
        currentTicketId = null;
        currentTicketStatus = 'draft';
        document.getElementById('pull-ticket-form').reset();
        document.getElementById('ops-tbody-rows').innerHTML = '';
        document.getElementById('pull-total-hours-display').textContent = '0.00 HRS';
        
        // Limpiar firmas del DOM
        clearSavedSignature('uv');
        clearSavedSignature('client');
        
        loadTicketsList();
    } else if (tabId === 'tab-pull-ticket' && !currentTicketId) {
        // Inicializar fecha por defecto en la bitácora
        const todayStr = new Date().toISOString().slice(0, 10);
        document.getElementById('pull-ops-date').value = todayStr;
        document.getElementById('pull-date-start').value = todayStr;
        
        // Limpiar registro fotográfico en ticket nuevo
        const previewGrid = document.getElementById('photo-preview-grid');
        if (previewGrid) previewGrid.innerHTML = '';
        
        // Limpiar firmas del DOM para nuevo ticket
        clearSavedSignature('uv');
        clearSavedSignature('client');
        
        addOpsRow(); // Iniciar con una fila operativa vacía
    }
}

/**
 * Autogenera los formularios para los componentes BES de fondo
 */
function buildEquipmentForms() {
    EQUIPMENT_SCHEMA.forEach(schema => {
        let container = null;
        if (schema.category === 'PUMP') container = document.getElementById('eq-group-pumps');
        else if (schema.category === 'SEPARATOR') container = document.getElementById('eq-group-intakes');
        else if (schema.category === 'PROTECTOR') container = document.getElementById('eq-group-protectors');
        else if (schema.category === 'MOTOR') container = document.getElementById('eq-group-motors');
        else if (schema.category === 'SENSOR') container = document.getElementById('eq-group-sensors');
        else if (schema.category === 'CABLE') container = document.getElementById('eq-group-cables');
        else if (schema.category === 'VALVE') container = document.getElementById('eq-group-valves');

        if (!container) return;

        container.innerHTML = '';

        for (let i = 1; i <= schema.count; i++) {
            const compCard = document.createElement('div');
            compCard.className = 'eq-component-card';

            const titleText = schema.labelNames ? schema.labelNames[i - 1] : `${schema.label} #${i}`;
            compCard.innerHTML = `<div class="eq-component-title">${titleText}</div>`;

            // Construir inputs según los campos requeridos
            schema.fields.forEach(field => {
                const inputWrapper = document.createElement('div');
                inputWrapper.className = 'eq-input-field';
                
                // Mapeo básico de nombres amigables de inputs
                const labelsMap = {
                    manufacturer: 'Manufactura',
                    series: 'Serie',
                    stages: 'Etapas',
                    type: 'Tipo',
                    length: 'Longitud (ft)',
                    serial_number: 'Nro de Serie',
                    rotation: 'Rotación',
                    housing: 'Housing (Camisa)',
                    status_condition: 'Condición',
                    insulation_mohm: 'Aislamiento (Mohms)',
                    continuity_ohms: 'Continuidad (Ohms)',
                    reel_number: 'Nro de Carrete',
                    comments: 'Comentarios'
                };

                const labelHtml = `<span>${labelsMap[field] || field}</span>`;
                let inputHtml = '';

                // Tipos específicos de inputs
                if (field === 'status_condition') {
                    inputHtml = `
                        <select data-category="${schema.category}" data-index="${i}" data-field="${field}">
                            <option value="USADO">USADO</option>
                            <option value="REPARABLE">REPARABLE</option>
                            <option value="CHATARRA">CHATARRA</option>
                        </select>
                    `;
                } else if (field === 'rotation') {
                    inputHtml = `
                        <select data-category="${schema.category}" data-index="${i}" data-field="${field}">
                            <option value="GIRO LIBRE">GIRO LIBRE</option>
                            <option value="NORMAL">NORMAL</option>
                            <option value="TRABADO">TRABADO</option>
                        </select>
                    `;
                } else if (field === 'comments') {
                    inputHtml = `<input type="text" data-category="${schema.category}" data-index="${i}" data-field="${field}" placeholder="Notas...">`;
                } else if (['length', 'stages', 'insulation_mohm', 'continuity_ohms'].includes(field)) {
                    inputHtml = `<input type="number" step="any" data-category="${schema.category}" data-index="${i}" data-field="${field}" placeholder="0.0">`;
                } else {
                    inputHtml = `<input type="text" data-category="${schema.category}" data-index="${i}" data-field="${field}" placeholder="...">`;
                }

                inputWrapper.innerHTML = labelHtml + inputHtml;
                compCard.appendChild(inputWrapper);
            });

            container.appendChild(compCard);
        }
    });
}

/**
 * Agrega una fila interactiva a la bitácora hora a hora
 */
function addOpsRow(data = {}) {
    const tbody = document.getElementById('ops-tbody-rows');
    const tr = document.createElement('tr');

    const startVal = data.time_start || '';
    const endVal = data.time_end || '';
    const descVal = data.description || '';

    tr.innerHTML = `
        <td data-label="Empezó (Hora)">
            <input type="time" class="ops-time-start" value="${startVal}" required>
        </td>
        <td data-label="Terminó (Hora)">
            <input type="time" class="ops-time-end" value="${endVal}" required>
        </td>
        <td data-label="Descripción">
            <textarea rows="2" class="ops-desc" required placeholder="Describa la maniobra o actividad realizada en este bloque...">${descVal}</textarea>
        </td>
        <td data-label="Acción" style="text-align: center;">
            <button type="button" class="btn-delete-row">🗑️</button>
        </td>
    `;

    // Escuchadores para recalcular el tiempo total de guardia
    tr.querySelector('.ops-time-start').addEventListener('change', calculateTotalOpsHours);
    tr.querySelector('.ops-time-end').addEventListener('change', calculateTotalOpsHours);
    tr.querySelector('.btn-delete-row').addEventListener('click', () => {
        tr.remove();
        calculateTotalOpsHours();
    });

    tbody.appendChild(tr);
    calculateTotalOpsHours();
}

/**
 * Calcula la sumatoria total de horas de la bitácora operativa
 */
function calculateTotalOpsHours() {
    let totalMinutes = 0;
    const startInputs = document.querySelectorAll('.ops-time-start');
    const endInputs = document.querySelectorAll('.ops-time-end');

    for (let i = 0; i < startInputs.length; i++) {
        const startVal = startInputs[i].value;
        const endVal = endInputs[i].value;

        if (startVal && endVal) {
            const [sh, sm] = startVal.split(':').map(Number);
            const [eh, em] = endVal.split(':').map(Number);

            const startTotal = (sh * 60) + sm;
            const endTotal = (eh * 60) + em;

            if (endTotal > startTotal) {
                totalMinutes += (endTotal - startTotal);
            } else {
                // Si la hora de término cruza la medianoche (ej: de 23:00 a 01:00)
                totalMinutes += ((1440 - startTotal) + endTotal);
            }
        }
    }

    const totalHours = totalMinutes / 60;
    document.getElementById('pull-total-hours-display').textContent = `${totalHours.toFixed(2)} HRS`;
}

/**
 * Consulta y renderiza el listado de tickets creados
 */
async function loadTicketsList() {
    try {
        const container = document.getElementById('tickets-list-container');
        container.innerHTML = '<div class="empty-state-message"><p>Buscando registros en la base de datos...</p></div>';

        // Consultar los tickets ordenados por fecha de creación descendente
        let query = supabase
            .from('service_tickets')
            .select('id, well_name, campo, date_start, rig, report_type, status, company')
            .order('created_at', { ascending: false });

        // Obtenemos todos los tickets (el RLS de la base de datos permite lectura de todos a usuarios autenticados)

        const { data: tickets, error } = await query;
        if (error) throw error;

        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<div class="empty-state-message"><p>No se encontraron tickets de servicios registrados.</p></div>';
            return;
        }

        container.innerHTML = tickets.map(ticket => {
            const isPull = ticket.report_type === 'PULL';
            const statusClass = ticket.status === 'completed' ? 'status-completed' : 'status-draft';
            const statusLabel = ticket.status === 'completed' ? 'Completado' : 'Servicio en Curso';

            return `
                <div class="ticket-dashboard-card" data-well="${escapeHtml(ticket.well_name)}" data-campo="${escapeHtml(ticket.campo)}" data-rig="${escapeHtml(ticket.rig)}" data-type="${ticket.report_type}">
                    <div class="card-type-banner ${isPull ? 'pull' : 'arranque'}">
                        <span>Reporte ${ticket.report_type}</span>
                        <span class="card-status-pill ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="card-body-details">
                        <h4 class="card-well-title">${escapeHtml(ticket.well_name)}</h4>
                        <div class="card-info-row">
                            <span>Campo:</span>
                            <strong>${escapeHtml(ticket.campo || '--')}</strong>
                        </div>
                        <div class="card-info-row">
                            <span>Taladro:</span>
                            <strong>${escapeHtml(ticket.rig || '--')}</strong>
                        </div>
                        <div class="card-info-row">
                            <span>Fecha Inicio:</span>
                            <strong>${ticket.date_start}</strong>
                        </div>
                        <div class="card-info-row">
                            <span>Compañía:</span>
                            <strong>${escapeHtml(ticket.company || '--')}</strong>
                        </div>
                    </div>
                    <div class="card-actions-row">
                        ${ticket.status === 'draft' ? `
                            <button class="btn-edit-card" onclick="editTicket('${ticket.id}')">✏️ Editar Progreso</button>
                        ` : `
                            <button class="btn-edit-card" onclick="editTicket('${ticket.id}')">👁️ Ver Detalles</button>
                        `}
                        <button class="btn-export-card" onclick="exportTicketPDF('${ticket.id}')">📄 Exportar PDF</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error al listar tickets:', err);
    }
}

/**
 * Carga las operaciones diarias del ticket para una fecha específica en la grilla
 */
async function loadOperationsForDate(ticketId, reportDate) {
    try {
        // 1. Cargar metadatos del día (Técnicos y Spoolers)
        const { data: dailySheet, error: sheetError } = await supabase
            .from('service_ticket_daily_sheets')
            .select('*')
            .eq('ticket_id', ticketId)
            .eq('report_date', reportDate)
            .maybeSingle();

        if (sheetError) throw sheetError;

        let techs = '';
        let spools = '';

        if (dailySheet) {
            techs = (dailySheet.technicians || []).join(', ');
            spools = (dailySheet.spooler_band || []).join(', ');
        } else {
            // Fallback: Si no hay hoja diaria guardada, intentar traer del ticket padre
            const { data: parentTicket } = await supabase
                .from('service_tickets')
                .select('technicians, spooler_band')
                .eq('id', ticketId)
                .single();
            
            techs = (parentTicket?.technicians || []).join(', ');
            spools = (parentTicket?.spooler_band || []).join(', ');
        }

        document.getElementById('pull-technicians').value = techs;
        document.getElementById('pull-spoolers').value = spools;

        // 2. Cargar operaciones
        const { data: operations, error } = await supabase
            .from('service_ticket_operations')
            .select('*')
            .eq('ticket_id', ticketId)
            .eq('report_date', reportDate)
            .order('time_start', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('ops-tbody-rows');
        tbody.innerHTML = '';

        if (operations && operations.length > 0) {
            operations.forEach(op => {
                // Normalizar horas (TIME de postgres a HH:MM)
                const normStart = String(op.time_start).slice(0, 5);
                const normEnd = String(op.time_end).slice(0, 5);
                addOpsRow({
                    time_start: normStart,
                    time_end: normEnd,
                    description: op.description
                });
            });
        } else {
            addOpsRow(); // Iniciar con una vacía si no hay registros ese día
        }

    } catch (err) {
        console.error('Error al cargar operaciones del día:', err);
    }
}

/**
 * Carga un ticket en el formulario para edición
 */
window.editTicket = async function(ticketId) {
    try {
        document.getElementById('loader-overlay').classList.remove('hidden');

        // 1. Obtener cabecera del ticket
        const { data: ticket, error } = await supabase
            .from('service_tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (error) throw error;

        currentTicketId = ticket.id;
        currentTicketStatus = ticket.status;

        // Llenar campos de cabecera
        document.getElementById('pull-ticket-id').value = ticket.id;
        document.getElementById('pull-well-name').value = ticket.well_name;
        document.getElementById('pull-campo').value = ticket.campo || '';
        document.getElementById('pull-rig').value = ticket.rig || '';
        document.getElementById('pull-company').value = ticket.company || 'PETROQUIRIQUIRE S.A.';
        document.getElementById('pull-date-start').value = ticket.date_start;
        document.getElementById('pull-date-end').value = ticket.date_end || '';
        document.getElementById('pull-failure-cause').value = ticket.failure_cause || '';
        document.getElementById('pull-additional-comments').value = ticket.additional_comments || '';
        
        // Cargar firmas
        const sigs = ticket.signatures || {};
        document.getElementById('pull-sig-uv').value = sigs.uv_name || sigs.uv || '';
        document.getElementById('pull-sig-client').value = sigs.client_name || sigs.client || '';

        // Cargar imágenes de firma
        const uvImg = document.getElementById('sig-uv-img');
        const uvPreview = document.getElementById('sig-uv-preview-box');
        if (sigs.uv_signature) {
            uvImg.src = sigs.uv_signature;
            uvImg.style.display = 'block';
            uvPreview.querySelector('.no-sig-text').style.display = 'none';
            document.getElementById('btn-clear-sig-uv').style.display = 'inline-block';
        } else {
            uvImg.src = '';
            uvImg.style.display = 'none';
            uvPreview.querySelector('.no-sig-text').style.display = 'block';
            document.getElementById('btn-clear-sig-uv').style.display = 'none';
        }

        const clientImg = document.getElementById('sig-client-img');
        const clientPreview = document.getElementById('sig-client-preview-box');
        if (sigs.client_signature) {
            clientImg.src = sigs.client_signature;
            clientImg.style.display = 'block';
            clientPreview.querySelector('.no-sig-text').style.display = 'none';
            document.getElementById('btn-clear-sig-client').style.display = 'inline-block';
        } else {
            clientImg.src = '';
            clientImg.style.display = 'none';
            clientPreview.querySelector('.no-sig-text').style.display = 'block';
            document.getElementById('btn-clear-sig-client').style.display = 'none';
        }

        // 2. Cargar bitácora diaria para la fecha de inicio por defecto
        document.getElementById('pull-ops-date').value = ticket.date_start;
        await loadOperationsForDate(ticketId, ticket.date_start);

        // 3. Cargar inventario de equipos de fondo
        const { data: equipment, error: eqError } = await supabase
            .from('service_ticket_equipment_pull')
            .select('*')
            .eq('ticket_id', ticketId);

        if (eqError) throw eqError;

        // Resetear todos los inputs del acordeón primero
        document.querySelectorAll('.equipment-grid-fields input, .equipment-grid-fields select').forEach(el => {
            el.value = el.tagName === 'SELECT' ? 'USADO' : '';
        });

        // Llenar los campos con los registros de la base de datos
        if (equipment && equipment.length > 0) {
            equipment.forEach(item => {
                const category = item.category;
                const index = item.item_index;

                Object.keys(item).forEach(col => {
                    const selector = `.equipment-grid-fields [data-category="${category}"][data-index="${index}"][data-field="${col}"]`;
                    const inputEl = document.querySelector(selector);
                    if (inputEl) {
                        inputEl.value = item[col] !== null ? item[col] : '';
                    }
                });
            });
        }

        // Habilitar o deshabilitar campos según si ya fue completado
        const isCompleted = ticket.status === 'completed';
        document.getElementById('btn-save-draft').disabled = isCompleted;
        document.getElementById('btn-submit-ticket').disabled = isCompleted;
        document.querySelectorAll('#pull-ticket-form input, #pull-ticket-form select, #pull-ticket-form textarea').forEach(el => {
            if (el.id !== 'pull-ops-date') {
                el.disabled = isCompleted;
            }
        });

        // Cargar soportes fotográficos del ticket
        await loadUploadedPhotos(ticketId);

        // Cambiar a la pestaña del formulario
        switchTab('tab-pull-ticket');
        document.getElementById('loader-overlay').classList.add('hidden');

    } catch (err) {
        document.getElementById('loader-overlay').classList.add('hidden');
        Swal.fire({ icon: 'error', title: 'Error al Cargar Ticket', text: err.message });
    }
};

/**
 * Guarda o finaliza el ticket de servicios en la base de datos
 */
async function saveTicket(targetStatus, isSilent = false) {
    try {
        // Validar campos obligatorios
        const wellName = document.getElementById('pull-well-name').value.trim();
        const dateStart = document.getElementById('pull-date-start').value;
        const reportDate = document.getElementById('pull-ops-date').value;

        if (!wellName || !dateStart || !reportDate) {
            if (!isSilent) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Pozo, Fecha de Inicio y Fecha de Operación diaria son obligatorios.' });
            }
            return;
        }

        if (!isSilent) {
            document.getElementById('loader-overlay').classList.remove('hidden');
        }

        // 1. Preparar payload de cabecera
        const technicians = document.getElementById('pull-technicians').value.split(',').map(s => s.trim()).filter(Boolean);
        const spoolers = document.getElementById('pull-spoolers').value.split(',').map(s => s.trim()).filter(Boolean);
        const signatures = {
            uv: document.getElementById('pull-sig-uv').value.trim(),
            uv_name: document.getElementById('pull-sig-uv').value.trim(),
            uv_signature: document.getElementById('sig-uv-img').style.display === 'block' ? document.getElementById('sig-uv-img').src : null,
            client: document.getElementById('pull-sig-client').value.trim(),
            client_name: document.getElementById('pull-sig-client').value.trim(),
            client_signature: document.getElementById('sig-client-img').style.display === 'block' ? document.getElementById('sig-client-img').src : null
        };

        const headerData = {
            report_type: 'PULL',
            service_type: document.getElementById('pull-service-type').value,
            well_name: wellName.toUpperCase(),
            campo: document.getElementById('pull-campo').value.trim().toUpperCase(),
            rig: document.getElementById('pull-rig').value.trim().toUpperCase(),
            company: document.getElementById('pull-company').value.trim(),
            date_start: dateStart,
            date_end: document.getElementById('pull-date-end').value || null,
            failure_cause: document.getElementById('pull-failure-cause').value.trim(),
            additional_comments: document.getElementById('pull-additional-comments').value.trim(),
            signatures: signatures,
            status: targetStatus
        };

        let ticketId = currentTicketId;

        // Upsert del registro de cabecera
        if (ticketId) {
            const { error: updateError } = await supabase
                .from('service_tickets')
                .update(headerData)
                .eq('id', ticketId);
            if (updateError) throw updateError;
        } else {
            headerData.created_by = currentUser.id;
            const { data: newTicket, error: insertError } = await supabase
                .from('service_tickets')
                .insert(headerData)
                .select('id')
                .single();
            if (insertError) throw insertError;
            ticketId = newTicket.id;
            currentTicketId = ticketId;
        }

        // Upsert de los metadatos diarios en service_ticket_daily_sheets
        const { error: dailySheetError } = await supabase
            .from('service_ticket_daily_sheets')
            .upsert([{
                ticket_id: ticketId,
                report_date: reportDate,
                technicians: technicians,
                spooler_band: spoolers
            }], { onConflict: 'ticket_id, report_date' });

        if (dailySheetError) throw dailySheetError;

        // 2. Guardar bitácora diaria hora a hora
        // Primero eliminar las operaciones guardadas anteriormente en la fecha operativa actual
        const { error: deleteOpsError } = await supabase
            .from('service_ticket_operations')
            .delete()
            .eq('ticket_id', ticketId)
            .eq('report_date', reportDate);
        if (deleteOpsError) throw deleteOpsError;

        // Recompilar filas activas del DOM
        const rows = document.querySelectorAll('#ops-tbody-rows tr');
        const operationsPayload = [];

        rows.forEach(row => {
            const startVal = row.querySelector('.ops-time-start').value;
            const endVal = row.querySelector('.ops-time-end').value;
            const descVal = row.querySelector('.ops-desc').value.trim();

            if (startVal && endVal && descVal) {
                operationsPayload.push({
                    ticket_id: ticketId,
                    report_date: reportDate,
                    time_start: startVal + ':00',
                    time_end: endVal + ':00',
                    description: descVal
                });
            }
        });

        if (operationsPayload.length > 0) {
            const { error: insertOpsError } = await supabase
                .from('service_ticket_operations')
                .insert(operationsPayload);
            if (insertOpsError) throw insertOpsError;
        }

        // 3. Guardar equipos de fondo (BES PULL)
        // Agrupar todos los inputs rellenados del acordeón
        const eqInputs = document.querySelectorAll('.equipment-grid-fields input, .equipment-grid-fields select');
        const eqDataMap = {}; // Clave: 'CATEGORIA_INDEX'

        eqInputs.forEach(input => {
            const category = input.getAttribute('data-category');
            const index = input.getAttribute('data-index');
            const field = input.getAttribute('data-field');
            const rawVal = input.value.trim();

            if (category && index && field) {
                const key = `${category}_${index}`;
                if (!eqDataMap[key]) {
                    eqDataMap[key] = {
                        ticket_id: ticketId,
                        category: category,
                        item_index: Number(index)
                    };
                }

                // Casteo dinámico para campos numéricos en BD
                if (['length', 'stages', 'insulation_mohm', 'continuity_ohms'].includes(field)) {
                    eqDataMap[key][field] = rawVal ? Number(rawVal) : null;
                } else {
                    eqDataMap[key][field] = rawVal || null;
                }
            }
        });

        // Filtrar y convertir objeto en array de payloads
        const equipmentPayload = Object.values(eqDataMap).filter(item => {
            // Guardar solo si al menos tiene un campo técnico lleno (aparte del id y categoría)
            const filledKeys = Object.keys(item).filter(k => !['ticket_id', 'category', 'item_index'].includes(k) && item[k] !== null && item[k] !== '');
            return filledKeys.length > 0;
        });

        // Eliminar registros anteriores y re-insertar
        const { error: deleteEqError } = await supabase
            .from('service_ticket_equipment_pull')
            .delete()
            .eq('ticket_id', ticketId);
        if (deleteEqError) throw deleteEqError;

        if (equipmentPayload.length > 0) {
            const { error: insertEqError } = await supabase
                .from('service_ticket_equipment_pull')
                .insert(equipmentPayload);
            if (insertEqError) throw insertEqError;
        }

        if (!isSilent) {
            document.getElementById('loader-overlay').classList.add('hidden');

            // Mensaje de éxito final
            if (targetStatus === 'completed') {
                Swal.fire({
                    icon: 'success',
                    title: 'Ticket Completado',
                    text: 'El reporte de servicio ha sido cerrado con éxito y se ha programado su despacho.',
                    confirmButtonText: 'Aceptar'
                }).then(() => {
                    switchTab('tab-dashboard');
                });
            } else {
                Swal.fire({ icon: 'success', title: 'Progreso Guardado', text: 'Los cambios se almacenaron de forma segura en la base de datos.' });
            }
        }

    } catch (err) {
        if (!isSilent) {
            document.getElementById('loader-overlay').classList.add('hidden');
            console.error('Error al guardar ticket:', err);
            Swal.fire({ icon: 'error', title: 'Error al Guardar', text: err.message });
        } else {
            throw err;
        }
    }
}

/**
 * Filtra el listado de tickets en tiempo real
 */
function filterTickets() {
    const searchVal = document.getElementById('search-tickets').value.toLowerCase().trim();
    const typeVal = document.getElementById('filter-type').value;

    const cards = document.querySelectorAll('.ticket-dashboard-card');
    cards.forEach(card => {
        const well = card.getAttribute('data-well').toLowerCase();
        const campo = card.getAttribute('data-campo').toLowerCase();
        const rig = card.getAttribute('data-rig').toLowerCase();
        const type = card.getAttribute('data-type');

        const matchesSearch = !searchVal || well.includes(searchVal) || campo.includes(searchVal) || rig.includes(searchVal);
        const matchesType = typeVal === 'all' || type === typeVal;

        card.style.display = (matchesSearch && matchesType) ? 'flex' : 'none';
    });
}

/**
 * Simulación de exportación de reporte final en formato PDF
 */
window.exportTicketPDF = function(ticketId) {
    Swal.fire({
        icon: 'info',
        title: 'Generando Reporte Final',
        text: 'Procesando el documento técnico en PDF para descargas...',
        timer: 1500,
        showConfirmButton: false
    });
};

/**
 * Escapes HTML characters to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Guarda exclusivamente la bitácora hora a hora del día actual
 */
async function saveOperationsLogOnly() {
    try {
        const reportDate = document.getElementById('pull-ops-date').value;
        const wellName = document.getElementById('pull-well-name').value.trim();
        const dateStart = document.getElementById('pull-date-start').value;

        if (!wellName || !dateStart || !reportDate) {
            Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Debe ingresar al menos Pozo y Fecha de Inicio para guardar la bitácora.' });
            return;
        }

        // Si es un ticket nuevo, primero guardamos la cabecera silenciosamente
        if (!currentTicketId) {
            await saveTicket('draft', true); // Silent save
        }

        if (!currentTicketId) return;

        document.getElementById('loader-overlay').classList.remove('hidden');

        // 1. Guardar metadatos de técnicos y spoolers del día
        const technicians = document.getElementById('pull-technicians').value.split(',').map(s => s.trim()).filter(Boolean);
        const spoolers = document.getElementById('pull-spoolers').value.split(',').map(s => s.trim()).filter(Boolean);

        const { error: dailySheetError } = await supabase
            .from('service_ticket_daily_sheets')
            .upsert([{
                ticket_id: currentTicketId,
                report_date: reportDate,
                technicians: technicians,
                spooler_band: spoolers
            }], { onConflict: 'ticket_id, report_date' });

        if (dailySheetError) throw dailySheetError;

        // 2. Eliminar las operaciones guardadas anteriormente en la fecha operativa actual
        const { error: deleteOpsError } = await supabase
            .from('service_ticket_operations')
            .delete()
            .eq('ticket_id', currentTicketId)
            .eq('report_date', reportDate);

        if (deleteOpsError) throw deleteOpsError;

        // Recompilar filas activas del DOM
        const rows = document.querySelectorAll('#ops-tbody-rows tr');
        const operationsPayload = [];

        rows.forEach(row => {
            const startVal = row.querySelector('.ops-time-start').value;
            const endVal = row.querySelector('.ops-time-end').value;
            const descVal = row.querySelector('.ops-desc').value.trim();

            if (startVal && endVal && descVal) {
                operationsPayload.push({
                    ticket_id: currentTicketId,
                    report_date: reportDate,
                    time_start: startVal + ':00',
                    time_end: endVal + ':00',
                    description: descVal
                });
            }
        });

        if (operationsPayload.length > 0) {
            const { error: insertOpsError } = await supabase
                .from('service_ticket_operations')
                .insert(operationsPayload);
            if (insertOpsError) throw insertOpsError;
        }

        document.getElementById('loader-overlay').classList.add('hidden');
        Swal.fire({ icon: 'success', title: 'Bitácora Guardada', text: `Bitácora del día ${reportDate} guardada exitosamente.` });

    } catch (err) {
        document.getElementById('loader-overlay').classList.add('hidden');
        console.error('Error al guardar bitácora diaria:', err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

/**
 * Gestiona la carga de soportes fotográficos del servicio
 */
async function handlePhotoUploads(files) {
    try {
        const wellName = document.getElementById('pull-well-name').value.trim();
        const dateStart = document.getElementById('pull-date-start').value;

        if (!wellName || !dateStart) {
            Swal.fire({ icon: 'warning', title: 'Datos requeridos', text: 'Complete al menos el Pozo y Fecha de Inicio antes de subir fotos.' });
            return;
        }

        // Si es un ticket nuevo, primero guardamos la cabecera silenciosamente
        if (!currentTicketId) {
            await saveTicket('draft', true); // Silent save
        }

        if (!currentTicketId) return;

        document.getElementById('loader-overlay').classList.remove('hidden');

        for (let file of files) {
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `services/${currentTicketId}/${Date.now()}_${cleanName}`;

            // 1. Subir archivo a Supabase Storage Bucket 'expedientes-pozos'
            const { error: uploadErr } = await supabase.storage
                .from('expedientes-pozos')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

            if (uploadErr) throw uploadErr;

            // 2. Insertar metadatos en la tabla service_ticket_documents
            const { error: dbErr } = await supabase
                .from('service_ticket_documents')
                .insert([{
                    ticket_id: currentTicketId,
                    file_name: file.name,
                    file_path: filePath,
                    file_size: file.size
                }]);

            if (dbErr) throw dbErr;
        }

        Swal.fire({ icon: 'success', title: 'Fotos subidas', text: 'Las imágenes de soporte se cargaron con éxito.' });
        await loadUploadedPhotos(currentTicketId);

    } catch (err) {
        console.error('Error al subir fotos:', err);
        Swal.fire({ icon: 'error', title: 'Error de carga', text: err.message });
    } finally {
        document.getElementById('loader-overlay').classList.add('hidden');
    }
}

/**
 * Consulta y renderiza las fotos cargadas en el ticket de servicio
 */
async function loadUploadedPhotos(ticketId) {
    const previewGrid = document.getElementById('photo-preview-grid');
    if (!previewGrid) return;

    previewGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Cargando soportes fotográficos...</p>';

    try {
        const { data: docs, error } = await supabase
            .from('service_ticket_documents')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!docs || docs.length === 0) {
            previewGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No hay fotos de soporte cargadas en este servicio.</p>';
            return;
        }

        previewGrid.innerHTML = '';

        for (let doc of docs) {
            // Obtener URL firmado temporal
            const { data, error: urlErr } = await supabase.storage
                .from('expedientes-pozos')
                .createSignedUrl(doc.file_path, 3600);

            const imgUrl = urlErr ? '../img/placeholder-error.png' : data.signedUrl;

            const card = document.createElement('div');
            card.className = 'photo-preview-card';
            card.style.cssText = 'position: relative; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: #ffffff; display: flex; flex-direction: column;';
            card.innerHTML = `
                <img src="${imgUrl}" alt="${escapeHtml(doc.file_name)}" style="width: 100%; height: 120px; object-fit: cover; border-bottom: 1px solid var(--border-color);">
                <div style="padding: 8px;">
                    <input type="text" class="photo-description-input" data-doc-id="${doc.id}" value="${escapeHtml(doc.description || '')}" placeholder="Añadir descripción..." style="width: 100%; font-size: 0.78rem; padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; outline: none;">
                    <button type="button" class="btn-delete-photo" style="margin-top: 6px; width: 100%; font-size: 0.75rem; padding: 4px; border: none; background: #fee2e2; color: #ef4444; border-radius: 4px; font-weight: 700; cursor: pointer; transition: all 0.2s;">Eliminar</button>
                </div>
            `;

            // Escuchadores de eventos para la foto
            card.querySelector('.photo-description-input').addEventListener('change', (e) => {
                updatePhotoDescription(doc.id, e.target.value);
            });
            card.querySelector('.btn-delete-photo').addEventListener('click', () => {
                deletePhoto(doc.id, doc.file_path);
            });

            previewGrid.appendChild(card);
        }

    } catch (err) {
        console.error('Error al cargar fotos de soporte:', err);
        previewGrid.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem;">Error al cargar fotos de soporte.</p>';
    }
}

/**
 * Actualiza la descripción de una foto de soporte
 */
async function updatePhotoDescription(docId, newDesc) {
    try {
        const { error } = await supabase
            .from('service_ticket_documents')
            .update({ description: newDesc.trim() })
            .eq('id', docId);

        if (error) throw error;
    } catch (err) {
        console.error('Error al actualizar descripción de foto:', err);
    }
}

/**
 * Elimina una foto de soporte técnico (Storage + Metadatos)
 */
async function deletePhoto(docId, filePath) {
    const confirm = await Swal.fire({
        title: '¿Eliminar foto?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    document.getElementById('loader-overlay').classList.remove('hidden');

    try {
        // 1. Borrar de Storage
        await supabase.storage
            .from('expedientes-pozos')
            .remove([filePath]);

        // 2. Borrar de la tabla de metadatos
        const { error } = await supabase
            .from('service_ticket_documents')
            .delete()
            .eq('id', docId);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'Foto eliminada', text: 'El soporte fotográfico fue borrado.' });
        if (currentTicketId) {
            await loadUploadedPhotos(currentTicketId);
        }

    } catch (err) {
        console.error('Error al borrar foto:', err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        document.getElementById('loader-overlay').classList.add('hidden');
    }
}

/**
 * ====================================================================
 * GESTIÓN DE FIRMAS DIGITALES (HTML5 CANVAS)
 * ====================================================================
 */
function initSignatureCanvas() {
    signatureCanvas = document.getElementById('signature-canvas');
    if (!signatureCanvas) return;
    signatureCtx = signatureCanvas.getContext('2d');
    
    // Configurar estilo de trazo (línea suave)
    signatureCtx.strokeStyle = '#0F172A'; // Slate-900
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';

    // Obtener coordenadas adaptadas al escalado CSS (max-width)
    function getCoords(e) {
        const rect = signatureCanvas.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        
        return {
            x: (clientX - rect.left) * (signatureCanvas.width / rect.width),
            y: (clientY - rect.top) * (signatureCanvas.height / rect.height)
        };
    }

    function startDrawing(e) {
        e.preventDefault();
        isDrawing = true;
        const coords = getCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const coords = getCoords(e);
        signatureCtx.beginPath();
        signatureCtx.moveTo(lastX, lastY);
        signatureCtx.lineTo(coords.x, coords.y);
        signatureCtx.stroke();
        lastX = coords.x;
        lastY = coords.y;
    }

    function stopDrawing() {
        isDrawing = false;
    }

    // Eventos Mouse
    signatureCanvas.addEventListener('mousedown', startDrawing);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDrawing);
    signatureCanvas.addEventListener('mouseleave', stopDrawing);

    // Eventos Touch para móvil y tablet
    signatureCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    signatureCanvas.addEventListener('touchmove', draw, { passive: false });
    signatureCanvas.addEventListener('touchend', stopDrawing);
}

function openSignatureModal(target) {
    currentSignatureTarget = target;
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Limpiar el lienzo cada vez que se abre
        clearSignatureCanvas();
    }
}

function closeSignatureModal() {
    const modal = document.getElementById('signature-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentSignatureTarget = null;
}

function clearSignatureCanvas() {
    if (signatureCtx && signatureCanvas) {
        signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    }
}

function saveSignatureFromCanvas() {
    if (!signatureCanvas || !currentSignatureTarget) return;
    
    // Obtener la imagen base64
    const dataUrl = signatureCanvas.toDataURL();
    
    // Renderizar previsualización en el DOM
    if (currentSignatureTarget === 'uv') {
        const img = document.getElementById('sig-uv-img');
        img.src = dataUrl;
        img.style.display = 'block';
        document.getElementById('sig-uv-preview-box').querySelector('.no-sig-text').style.display = 'none';
        document.getElementById('btn-clear-sig-uv').style.display = 'inline-block';
    } else if (currentSignatureTarget === 'client') {
        const img = document.getElementById('sig-client-img');
        img.src = dataUrl;
        img.style.display = 'block';
        document.getElementById('sig-client-preview-box').querySelector('.no-sig-text').style.display = 'none';
        document.getElementById('btn-clear-sig-client').style.display = 'inline-block';
    }
    
    closeSignatureModal();
}

function clearSavedSignature(target) {
    if (target === 'uv') {
        const img = document.getElementById('sig-uv-img');
        if (img) {
            img.src = '';
            img.style.display = 'none';
        }
        const box = document.getElementById('sig-uv-preview-box');
        if (box) {
            const txt = box.querySelector('.no-sig-text');
            if (txt) txt.style.display = 'block';
        }
        const btn = document.getElementById('btn-clear-sig-uv');
        if (btn) btn.style.display = 'none';
    } else if (target === 'client') {
        const img = document.getElementById('sig-client-img');
        if (img) {
            img.src = '';
            img.style.display = 'none';
        }
        const box = document.getElementById('sig-client-preview-box');
        if (box) {
            const txt = box.querySelector('.no-sig-text');
            if (txt) txt.style.display = 'block';
        }
        const btn = document.getElementById('btn-clear-sig-client');
        if (btn) btn.style.display = 'none';
    }
}
