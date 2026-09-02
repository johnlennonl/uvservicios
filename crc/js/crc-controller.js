/* ==============================================================================
   CRC LAGUNILLAS LAGO - CONTROLADOR DE CAPTURA DE CAMPO (BM / BCP)
   ============================================================================== */

import { getSession, logout, getAccessProfile, applyNavigationAccessProfile } from '../../js/auth.js';
import { getFieldTechniciansByScope, getFieldWellsByScope, sortWellsNaturally } from '../../js/services/operational-contracts-service.js';
import { submitFieldJourneyWorkflow, autosaveFieldJourneyDraft, getFieldJourneyHistory } from '../../js/services/field-journey-service.js';
import { supabase } from '../../js/supabaseClient.js';
import { uploadWellDocument, getWellDocuments, deleteWellDocument, getDocumentDownloadUrl } from '../../js/services/well-documents-service.js';
import { getWellTechnicalData } from '../../js/services/technical-measurements-service.js';

// Claves de almacenamiento local (Local Storage)
const CRC_JORNADA_HEADER_KEY = 'uv-crc-jornada-header';
const CRC_WELL_REPORTS_KEY = 'uv-crc-well-reports';
const CRC_PENDING_SYNC_KEY = 'uv-crc-pending-sync';

// Estado global de la aplicación de captura CRC
const state = {
    session: null,
    accessProfile: null,
    catalogWells: [],
    catalogTechnicians: [],
    activeJourney: null, // Header de la jornada iniciada
    reports: [],         // Reportes de pozos capturados en la jornada activa
    currentStep: 1,      // Paso activo en el formulario de captura
    selectedWellMeta: null, // Metadata del pozo seleccionado actualmente
    tempFiles: [],        // Archivos adjuntos temporales de la jornada en memoria
    historyRecords: [],  // Historial de jornadas cargadas
    activeStatusFilter: 'all', // Filtro por estado para el historial
    currentFormPhotos: [],    // Fotos seleccionadas en el formulario activo
    currentFormEchoFiles: [], // Archivos Echometer seleccionados en el formulario activo
    serverUploadedPhotos: [], // Fotos cargadas previamente en servidor para este pozo
    serverUploadedEchoFiles: [] // Archivos Echometer cargados previamente en servidor
};

// Generador de UUID para los reportes locales
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Validar sesión y permisos del rol
        const session = await getSession();
        if (!session) {
            window.location.href = '../index.html';
            return;
        }

        const accessProfile = getAccessProfile(session);
        if (!accessProfile.canCreateFieldReports) {
            Swal.fire({
                icon: 'error',
                title: 'Acceso Denegado',
                text: 'No tienes permisos para registrar reportes de campo en este contrato.'
            }).then(() => {
                window.location.href = '../index.html';
            });
            return;
        }

        state.session = session;
        state.accessProfile = accessProfile;

        // Ocultar o mostrar links del sidebar según privilegios
        applyNavigationAccessProfile(accessProfile);

        // Mostrar email en la cabecera
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.textContent = accessProfile.email;

        // Registrar estado de conexión
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        // 2. Cargar catálogos iniciales
        await loadCatalogs();

        // 3. Restaurar jornada si ya estaba iniciada
        restoreLocalJourneyState();

        // 4. Inicializar eventos UI
        initUIEvents();

        // 5. Cargar historial de jornadas
        await loadJourneyHistory();

    } catch (err) {
        console.error('[crc-controller] Error en inicialización:', err);
    }
});

// Actualiza el indicador de conexión a internet
function updateOnlineStatus() {
    const pill = document.getElementById('online-status');
    if (pill) {
        if (navigator.onLine) {
            pill.className = 'status-indicator';
            pill.style.background = '#10b981';
            pill.style.boxShadow = '0 0 8px #10b981';
        } else {
            pill.className = 'status-indicator offline';
            pill.style.background = '#ef4444';
            pill.style.boxShadow = '0 0 8px #ef4444';
        }
    }
}

// Cargar catálogo de técnicos y pozos específicos para el alcance 'crc_ll'
async function loadCatalogs() {
    try {
        const [wells, techs] = await Promise.all([
            getFieldWellsByScope('crc_ll'),
            getFieldTechniciansByScope('crc_ll')
        ]);

        state.catalogWells = sortWellsNaturally(wells || []);
        state.catalogTechnicians = techs || [];

        // Poblar selects de técnicos en la pantalla de inicio
        const tech1Select = document.getElementById('journey-tech1');
        const tech2Select = document.getElementById('journey-tech2');

        if (tech1Select && tech2Select) {
            const optionsHtml = state.catalogTechnicians
                .filter(t => t.active)
                .map(t => `<option value="${t.full_name}">${t.full_name}</option>`)
                .join('');
            
            tech1Select.innerHTML = '<option value="">Selecciona Técnico...</option>' + optionsHtml;
            tech2Select.innerHTML = '<option value="">Ninguno</option>' + optionsHtml;
        }

        // Poblar select de pozos en el formulario de captura
        const wellSelect = document.getElementById('well-pozo');
        if (wellSelect) {
            const wellsHtml = state.catalogWells
                .filter(w => w.active)
                .map(w => `<option value="${w.pozo_name}" data-method="${w.lift_method || ''}">${w.pozo_name}</option>`)
                .join('');
            
            wellSelect.innerHTML = '<option value="">Selecciona Pozo...</option>' + wellsHtml;
        }

    } catch (err) {
        console.error('[crc-controller] Error cargando catálogos:', err);
        Swal.fire('Error de Conexión', 'No se pudieron cargar los pozos o técnicos de Supabase.', 'warning');
    }
}

// Restaura la jornada de localStorage si existía un borrador activo
function restoreLocalJourneyState() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('continue') === '1') {
        const pendingRaw = localStorage.getItem('uv-field-pending-history-continue');
        if (pendingRaw) {
            try {
                const pendingRecords = JSON.parse(pendingRaw);
                if (Array.isArray(pendingRecords) && pendingRecords.length > 0) {
                    const firstRec = pendingRecords[0];
                    
                    state.activeJourney = {
                        id: firstRec.journey_id,
                        date: firstRec.report_date || new Date().toISOString().split('T')[0],
                        shift: firstRec.jornada || 'Jornada Completa',
                        startTime: firstRec.report_time || '00:00',
                        tech1: firstRec.tecnico_1 || '',
                        tech2: firstRec.tecnico_2 || '',
                        crew: firstRec.equipo_guardia || 'Equipo CCRC',
                        created_at: firstRec.updated_at || new Date().toISOString()
                    };
                    
                    state.reports = pendingRecords.map(rec => {
                        const raw = rec.raw_payload || {};
                        return {
                            id: rec.client_report_id || rec.id || generateUUID(),
                            pozo: rec.pozo,
                            fecha: rec.report_date || state.activeJourney.date,
                            hora: String(rec.report_time || '00:00').slice(0, 5),
                            jornada: state.activeJourney.shift,
                            tecnico_1: state.activeJourney.tech1,
                            tecnico_2: state.activeJourney.tech2,
                            equipo_guardia: state.activeJourney.crew,
                            
                            lift_method: rec.lift_method || raw.lift_method || 'BM',
                            bm_marca: rec.bm_marca || raw.bm_marca || '',
                            bm_modelo: rec.bm_modelo || raw.bm_modelo || '',
                            bm_tiro: rec.bm_tiro || raw.bm_tiro || '',
                            bm_recorrido: rec.bm_recorrido || raw.bm_recorrido || null,
                            bm_spm: rec.bm_spm || raw.bm_spm || null,
                            bm_estado_unidad: rec.bm_estado_unidad || raw.bm_estado_unidad || '',
                            
                            bcp_rpm: rec.bcp_rpm || raw.bcp_rpm || null,
                            bcp_torque: rec.bcp_torque || raw.bcp_torque || null,
                            bcp_amperaje: rec.bcp_amperaje || raw.bcp_amperaje || null,
                            bcp_modelo_cabezal: rec.bcp_modelo_cabezal || raw.bcp_modelo_cabezal || '',
                            bcp_motorreductor: rec.bcp_motorreductor || raw.bcp_motorreductor || '',
                            bcp_stuffing: rec.bcp_stuffing || raw.bcp_stuffing || '',
                            
                            bruta: rec.bruta ?? raw.bruta ?? '',
                            neta: rec.neta ?? raw.neta ?? '',
                            ays_percentage: rec.ays_percentage ?? raw.ays_percentage ?? '',
                            
                            thp_psi: rec.thp_psi ?? rec.thp ?? raw.thp_psi ?? '',
                            chp_psi: rec.chp_psi ?? rec.chp ?? raw.chp_psi ?? '',
                            stuffing: rec.stuffing || raw.stuffing || '',
                            
                            well_nivel: rec.well_nivel || raw.well_nivel || '',
                            well_sumergencia: rec.well_sumergencia || raw.well_sumergencia || '',
                            well_presion_inicial: rec.well_presion_inicial || raw.well_presion_inicial || '',
                            well_presion_final: rec.well_presion_final || raw.well_presion_final || '',
                            well_tiempo_prueba: rec.well_tiempo_prueba || raw.well_tiempo_prueba || '',
                            observaciones_pozo: rec.comentario || rec.observaciones_pozo || raw.comentario || ''
                        };
                    });
                    
                    localStorage.setItem(CRC_JORNADA_HEADER_KEY, JSON.stringify(state.activeJourney));
                    localStorage.setItem(CRC_WELL_REPORTS_KEY, JSON.stringify(state.reports));
                    
                    localStorage.removeItem('uv-field-pending-history-continue');
                    
                    urlParams.delete('continue');
                    const cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
                    window.history.replaceState({}, '', cleanUrl);
                    
                    showActiveJourneyView();
                    return;
                }
            } catch (err) {
                console.error('Error restaurando jornada desde historial en CRC:', err);
            }
        }
    }

    const cachedHeader = localStorage.getItem(CRC_JORNADA_HEADER_KEY);
    const cachedReports = localStorage.getItem(CRC_WELL_REPORTS_KEY);

    if (cachedHeader) {
        state.activeJourney = JSON.parse(cachedHeader);
        state.reports = cachedReports ? JSON.parse(cachedReports) : [];
        showActiveJourneyView();
        syncDraftToSupabase().catch(e => console.warn('Error al auto-sincronizar borrador activo en CRC:', e));
    } else {
        showStartJourneyView();
    }
}

function showStartJourneyView() {
    document.body.classList.remove('capture-open');
    const pStart = document.getElementById('panel-capture-form');
    if (pStart) { pStart.classList.remove('active'); pStart.style.display = 'none'; }
    document.getElementById('panel-start-journey').style.display = 'block';
    document.getElementById('panel-active-journey').style.display = 'none';
    
    const historyPanel = document.getElementById('panel-crc-history');
    if (historyPanel) historyPanel.style.display = 'block';

    // Set default date to today
    const dateInput = document.getElementById('journey-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Set default start time to now
    const timeInput = document.getElementById('journey-start-time');
    if (timeInput) {
        const now = new Date();
        timeInput.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    // Mostrar u ocultar el banner de jornada activa en curso
    const activeWarningBanner = document.getElementById('crc-active-warning-banner');
    if (activeWarningBanner) {
        if (state.activeJourney) {
            activeWarningBanner.style.display = 'block';
        } else {
            activeWarningBanner.style.display = 'none';
        }
    }
}

function showActiveJourneyView() {
    document.body.classList.remove('capture-open');
    const pActive = document.getElementById('panel-capture-form');
    if (pActive) { pActive.classList.remove('active'); pActive.style.display = 'none'; }
    document.getElementById('panel-start-journey').style.display = 'none';
    document.getElementById('panel-active-journey').style.display = 'block';
    
    const historyPanel = document.getElementById('panel-crc-history');
    if (historyPanel) historyPanel.style.display = 'none';

    // Rellenar etiquetas de cabecera de jornada
    document.getElementById('lbl-active-date').textContent = state.activeJourney.date;
    document.getElementById('lbl-active-time').textContent = state.activeJourney.startTime || '--:--';

    renderJourneyWellsList();
}

function renderJourneyWellsList() {
    const container = document.getElementById('journey-wells-container');
    const submitBtn = document.getElementById('btn-submit-journey');
    const countWells = document.getElementById('count-wells');

    if (countWells) countWells.textContent = state.reports.length;

    if (state.reports.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 24px; color:var(--text-light);">
                <i class="fa-solid fa-oil-well" style="font-size:2rem; margin-bottom:8px; display:block;"></i>
                Aún no has registrado ningún pozo en este turno.
            </div>
        `;
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    if (submitBtn) submitBtn.disabled = false;

    container.innerHTML = state.reports.map((rep, idx) => {
        const methodColor = rep.lift_method === 'BM' ? '#3b82f6' : '#10b981';
        const methodClass = (rep.lift_method || '').toLowerCase();

        /* ── Color dinámico para %AyS ── */
        const aysVal = parseFloat(rep.ays_percentage) || 0;
        let aysColorClass = 'ays-good';       // ≤ 30% → verde
        if (aysVal > 60) aysColorClass = 'ays-danger';   // > 60% → rojo
        else if (aysVal > 30) aysColorClass = 'ays-warning'; // 30-60% → amarillo

        return `
            <div class="crc-well-row" data-id="${rep.id}" data-method="${rep.lift_method || ''}">
                <div class="crc-well-name">
                    <div class="crc-well-icon ${methodClass}">
                        <i class="fa-solid fa-oil-well"></i>
                    </div>
                    <div>
                        <span style="display:block; font-weight:700;">${rep.pozo}</span>
                        <div class="crc-well-metrics">
                            <span class="crc-well-metric-badge"><i class="fa-solid fa-clock"></i> ${rep.hora}</span>
                            <span class="crc-well-metric-badge"><i class="fa-solid fa-arrow-up"></i> B: ${rep.bruta}</span>
                            <span class="crc-well-metric-badge"><i class="fa-solid fa-arrow-down"></i> N: ${rep.neta}</span>
                            <span class="crc-well-metric-badge ${aysColorClass}"><i class="fa-solid fa-percent"></i> ${aysVal.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <span class="crc-well-type-tag" style="background:${methodColor};">${rep.lift_method || '—'}</span>
                    <div class="crc-well-actions">
                        <button type="button" class="crc-action-icon btn-edit-well" data-idx="${idx}" title="Editar pozo">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="crc-action-icon delete btn-delete-well" data-idx="${idx}" title="Eliminar de la jornada">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Eventos para editar o eliminar pozo
    container.querySelectorAll('.btn-edit-well').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            openCaptureFormForEdit(idx);
        });
    });

    container.querySelectorAll('.btn-delete-well').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            confirmDeleteWell(idx);
        });
    });
}

async function confirmDeleteWell(idx) {
    const report = state.reports[idx];
    if (!report) return;

    const res = await Swal.fire({
        title: `¿Eliminar pozo ${report.pozo}?`,
        text: `Se eliminará el pozo ${report.pozo} de esta jornada. ¿Deseas proceder?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar pozo',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
    });

    if (!res.isConfirmed) return;

    state.reports.splice(idx, 1);
    localStorage.setItem(CRC_WELL_REPORTS_KEY, JSON.stringify(state.reports));
    renderJourneyWellsList();
    syncDraftToSupabase();
    Swal.fire({
        icon: 'success',
        title: 'Pozo eliminado',
        text: `El pozo ${report.pozo} fue removido de la jornada.`,
        timer: 1500,
        showConfirmButton: false
    });
}

function initUIEvents() {
    // 1. Iniciar Jornada
    const startForm = document.getElementById('form-start-journey');
    if (startForm) {
        startForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = document.getElementById('journey-date').value;
            const startTime = document.getElementById('journey-start-time').value;
            const tech1 = document.getElementById('journey-tech1').value;
            const tech2 = document.getElementById('journey-tech2').value;

            const session = await getSession();
            const activeUser = session?.user || state.session?.user;

            const journeyId = generateUUID();
            state.activeJourney = {
                id: journeyId,
                date,
                shift: 'Jornada Completa',
                startTime,
                tech1,
                tech2,
                crew: 'Equipo CCRC',
                created_at: new Date().toISOString()
            };
            state.reports = [];

            localStorage.setItem(CRC_JORNADA_HEADER_KEY, JSON.stringify(state.activeJourney));
            localStorage.setItem(CRC_WELL_REPORTS_KEY, JSON.stringify(state.reports));

            showActiveJourneyView();
            
            Swal.fire({
                title: 'Iniciando Jornada...',
                html: '<p style="color:#64748b;">Creando borrador en la base de datos...</p>',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Registrar la jornada en Supabase
            supabase
                .from('field_journeys')
                .insert({
                    id: journeyId,
                    operational_scope: 'crc_ll',
                    submitted_by_user_id: activeUser?.id || null,
                    submitted_by_email: activeUser?.email || null,
                    journey_date: date,
                    jornada: 'Diurna',
                    equipo_guardia: 'Equipo CCRC',
                    locacion_jornada: 'Lagunillas Lago',
                    status: 'draft',
                    submission_source: 'field-web'
                })
                .then(({ error: dbErr }) => {
                    if (dbErr) {
                        console.error('Error al insertar jornada en Supabase:', dbErr);
                        Swal.fire({
                            icon: 'warning',
                            title: 'Jornada Iniciada Localmente',
                            text: 'Se guardó en el navegador. Se sincronizará automáticamente cuando haya conexión.',
                            confirmButtonText: 'Entendido'
                        });
                    } else {
                        loadJourneyHistory().catch(e => console.warn('History load error:', e));
                        Swal.fire({
                            icon: 'success',
                            title: '¡Jornada Iniciada!',
                            text: 'La jornada ya se encuentra activa y visible en vivo para administración.',
                            confirmButtonText: 'Comenzar captura'
                        });
                    }
                })
                .catch(err => {
                    console.error('Excepción al insertar jornada en Supabase:', err);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Jornada Iniciada!',
                        text: 'La captura de pozos está lista.',
                        confirmButtonText: 'Comenzar captura'
                    });
                });
        });
    }

    // Salir al Inicio (Pausar sin borrar datos locales)
    const pauseExitBtn = document.getElementById('btn-pause-exit');
    if (pauseExitBtn) {
        pauseExitBtn.addEventListener('click', async () => {
            // Sincronizar el borrador actual con Supabase antes de salir
            await syncDraftToSupabase();
            showStartJourneyView();
            // Actualizar historial
            await loadJourneyHistory();
        });
    }

    // Continuar Jornada Activa desde Inicio
    const resumeBtn = document.getElementById('btn-resume-active-journey');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (state.activeJourney) {
                showActiveJourneyView();
            }
        });
    }

    // Terminar Guardia / Cancelar
    const cancelJourneyBtn = document.getElementById('btn-cancel-journey');
    if (cancelJourneyBtn) {
        cancelJourneyBtn.addEventListener('click', async () => {
            const result = await Swal.fire({
                title: '¿Terminar y Descartar Jornada?',
                text: '¿Estás seguro? Se borrarán todos los reportes de pozo capturados en este turno localmente y no podrás recuperarlos.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, terminar y descartar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444'
            });

            if (result.isConfirmed) {
                localStorage.removeItem(CRC_JORNADA_HEADER_KEY);
                localStorage.removeItem(CRC_WELL_REPORTS_KEY);
                state.activeJourney = null;
                state.reports = [];
                showStartJourneyView();
            }
        });
    }

    // 2. Lógica del Formulario de Captura
    const openCaptureBtn = document.getElementById('btn-open-capture');
    if (openCaptureBtn) {
        openCaptureBtn.addEventListener('click', () => {
            openCaptureFormForAdd();
        });
    }

    // Detectar teclado virtual o foco en campos de texto para ocultar la barra de navegación móvil
    document.addEventListener('focusin', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            document.body.classList.add('hide-nav-keyboard');
        }
    });
    document.addEventListener('focusout', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
            document.body.classList.remove('hide-nav-keyboard');
        }
    });

    const closeCaptureBtn = document.getElementById('btn-close-capture');
    const captureFormPanel = document.getElementById('panel-capture-form');

    function closeCaptureModal() {
        document.body.classList.remove('capture-open');
        if (captureFormPanel) captureFormPanel.style.display = 'none';
        if (state.activeJourney) {
            showActiveJourneyView();
        } else {
            showStartJourneyView();
        }
    }

    if (closeCaptureBtn) {
        closeCaptureBtn.addEventListener('click', closeCaptureModal);
    }

    if (captureFormPanel) {
        captureFormPanel.addEventListener('click', (e) => {
            if (e.target === captureFormPanel) {
                closeCaptureModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && captureFormPanel && captureFormPanel.style.display !== 'none') {
            closeCaptureModal();
        }
    });

    // Buscador en tiempo real para filtrar pozos mientras el operador escribe
    const wellSearchInput = document.getElementById('well-pozo-search');
    const wellSelect = document.getElementById('well-pozo');

    if (wellSearchInput && wellSelect) {
        wellSearchInput.addEventListener('input', () => {
            const query = String(wellSearchInput.value || '').trim().toLowerCase();
            const activeWells = state.catalogWells ? state.catalogWells.filter(w => w.active) : [];
            const filteredWells = activeWells.filter(w => {
                if (!query) return true;
                const pozoName = String(w.pozo_name || '').toLowerCase();
                const method = String(w.lift_method || '').toLowerCase();
                const campo = String(w.campo_name || '').toLowerCase();
                return pozoName.includes(query) || method.includes(query) || campo.includes(query);
            });

            const wellsHtml = filteredWells
                .map(w => `<option value="${w.pozo_name}" data-method="${w.lift_method || ''}">${w.pozo_name} ${w.lift_method ? `(${w.lift_method})` : ''}</option>`)
                .join('');

            wellSelect.innerHTML = `<option value="">${filteredWells.length > 0 ? `Selecciona Pozo (${filteredWells.length} coincidencia${filteredWells.length > 1 ? 's' : ''})...` : 'Sin coincidencias'}</option>` + wellsHtml;

            // Si hay exactamente 1 coincidencia filtrada, seleccionar automáticamente
            if (filteredWells.length === 1) {
                wellSelect.value = filteredWells[0].pozo_name;
                wellSelect.dispatchEvent(new Event('change'));
            }
        });
    }

    // Eventos de selección dinámica de pozo en la captura
    if (wellSelect) {
        wellSelect.addEventListener('change', async () => {
            const selectedPozo = wellSelect.value;
            if (wellSearchInput && selectedPozo) {
                wellSearchInput.value = selectedPozo;
            }
            const wellMeta = state.catalogWells.find(w => w.pozo_name === selectedPozo);
            
            if (wellMeta) {
                state.selectedWellMeta = wellMeta;
                document.getElementById('well-lift-method-read').value = wellMeta.lift_method || 'No definido';
                document.getElementById('well-campo').value = wellMeta.campo_name || '';
                document.getElementById('well-ef').value = wellMeta.estacion_flujo || wellMeta.ef || '';
                document.getElementById('well-estado').value = wellMeta.lift_method || '';

                // Activar campos específicos según el método
                toggleTechnicalFields(wellMeta.lift_method);

                // Pre-llenado de datos de producción desde well_production
                try {
                    const latestProd = await getWellTechnicalData(selectedPozo);
                    if (latestProd) {
                        if (latestProd.bbpd !== null && latestProd.bbpd !== undefined) {
                            document.getElementById('well-bruta').value = latestProd.bbpd;
                        }
                        if (latestProd.bnpd !== null && latestProd.bnpd !== undefined) {
                            document.getElementById('well-neta').value = latestProd.bnpd;
                        }
                        if (latestProd.ays_percentage !== null && latestProd.ays_percentage !== undefined) {
                            document.getElementById('well-ays').value = Number(latestProd.ays_percentage).toFixed(2) + ' %';
                        }
                        if (latestProd.ef) {
                            document.getElementById('well-ef').value = latestProd.ef;
                        }
                        if (latestProd.campo_name) {
                            document.getElementById('well-campo').value = latestProd.campo_name;
                        }
                        // Disparar recálculo de %AyS local para aplicar el color de la alerta
                        calculateAyS();
                    }
                } catch (err) {
                    console.error('Error al intentar pre-llenar datos de producción:', err);
                }
            } else {
                state.selectedWellMeta = null;
                document.getElementById('well-lift-method-read').value = 'No definido';
                document.getElementById('well-campo').value = '';
                document.getElementById('well-ef').value = '';
                document.getElementById('well-estado').value = '';
                toggleTechnicalFields(null);
            }
        });
    }

    // Cálculo automático de %AyS
    const brutaInput = document.getElementById('well-bruta');
    const netaInput = document.getElementById('well-neta');
    const aysInput = document.getElementById('well-ays');

    function calculateAyS() {
        const bruta = parseFloat(brutaInput.value) || 0;
        const neta = parseFloat(netaInput.value) || 0;
        
        if (bruta <= 0) {
            aysInput.value = '0.00 %';
            aysInput.className = 'crc-input';
            return;
        }

        const ays = ((bruta - neta) / bruta) * 100;
        // Limitar entre 0 y 100%
        const normalizedAyS = Math.min(Math.max(ays, 0), 100);
        aysInput.value = normalizedAyS.toFixed(2) + ' %';

        /* ── Color dinámico según el rango de %AyS ── */
        aysInput.classList.remove('crc-ays-good', 'crc-ays-warning', 'crc-ays-danger');
        if (normalizedAyS > 60) aysInput.classList.add('crc-ays-danger');
        else if (normalizedAyS > 30) aysInput.classList.add('crc-ays-warning');
        else aysInput.classList.add('crc-ays-good');
    }

    if (brutaInput && netaInput) {
        brutaInput.addEventListener('input', calculateAyS);
        netaInput.addEventListener('input', calculateAyS);
    }

    // Navegación de Pasos
    const btnPrev = document.getElementById('btn-step-prev');
    const btnNext = document.getElementById('btn-step-next');
    const btnAdd = document.getElementById('btn-add-well');

    btnPrev.addEventListener('click', () => {
        if (state.currentStep > 1) {
            goToStep(state.currentStep - 1);
        }
    });

    btnNext.addEventListener('click', () => {
        if (validateCurrentStep(state.currentStep)) {
            goToStep(state.currentStep + 1);
        }
    });

    // Envío del Pozo al listado
    const formCapture = document.getElementById('form-well-capture');
    formCapture.addEventListener('submit', (e) => {
        e.preventDefault();
        saveWellReport();
    });

    btnAdd.addEventListener('click', () => {
        saveWellReport();
    });

    // 3. Transmisión final de la jornada completa a la base de datos
    const submitJourneyBtn = document.getElementById('btn-submit-journey');
    if (submitJourneyBtn) {
        submitJourneyBtn.addEventListener('click', () => {
            transmitJourneyToServer();
        });
    }

    // Copiar / Previsualizar resumen de jornada para WhatsApp
    const copySummaryBtn = document.getElementById('btn-copy-journey-summary');
    if (copySummaryBtn) {
        copySummaryBtn.addEventListener('click', () => {
            const baseSummary = generateJourneySummaryText();
            if (!baseSummary) {
                Swal.fire('Atención', 'No hay datos de jornada activa para generar el resumen.', 'warning');
                return;
            }

            Swal.fire({
                title: '💬 Resumen de Jornada WhatsApp',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 0.82rem; color: #64748b; margin-bottom: 8px;">
                            Revisa o agrega anotaciones adicionales al resumen antes de copiarlo o enviarlo:
                        </p>
                        <textarea id="swal-wa-text" class="crc-textarea" rows="12" style="font-size: 0.85rem; font-family: monospace; text-transform: none; margin-bottom: 14px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#0f172a; border-radius: 8px;">${baseSummary}</textarea>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button type="button" id="swal-btn-copy-wa" class="crc-btn" style="flex: 1; background: #2563eb; color: #fff; padding: 12px; font-size: 0.88rem; border-radius: 8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
                                <i class="fa-solid fa-copy"></i> Copiar Texto
                            </button>
                            <button type="button" id="swal-btn-open-wa" class="crc-btn" style="flex: 1; background: #25d366; color: #fff; padding: 12px; font-size: 0.88rem; border-radius: 8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
                                <i class="fa-brands fa-whatsapp"></i> Abrir en WhatsApp
                            </button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true,
                width: '600px',
                didOpen: () => {
                    const textarea = document.getElementById('swal-wa-text');
                    const btnCopy = document.getElementById('swal-btn-copy-wa');
                    const btnOpenWA = document.getElementById('swal-btn-open-wa');

                    btnCopy?.addEventListener('click', () => {
                        const textToCopy = textarea.value;
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            Swal.fire({
                                toast: true,
                                position: 'top-end',
                                icon: 'success',
                                title: '¡Resumen copiado al portapapeles!',
                                showConfirmButton: false,
                                timer: 2000
                            });
                        }).catch(err => {
                            textarea.select();
                            document.execCommand('copy');
                            Swal.fire({
                                toast: true,
                                position: 'top-end',
                                icon: 'success',
                                title: '¡Resumen copiado al portapapeles!',
                                showConfirmButton: false,
                                timer: 2000
                            });
                        });
                    });

                    btnOpenWA?.addEventListener('click', () => {
                        const textToSend = encodeURIComponent(textarea.value);
                        window.open(`https://api.whatsapp.com/send?text=${textToSend}`, '_blank');
                    });
                }
            });
        });
    }

    // Navegación Inferior (PWA / Mobile)
    document.getElementById('nav-capture-btn')?.addEventListener('click', () => {
        const historyPanel = document.getElementById('panel-crc-history');
        if (historyPanel) historyPanel.style.display = 'none';

        document.querySelectorAll('.crc-nav-action').forEach(n => n.classList.remove('active'));
        document.getElementById('nav-capture-btn')?.classList.add('active');

        if (state.activeJourney) {
            showActiveJourneyView();
        } else {
            showStartJourneyView();
        }
    });

    const handleLogout = async () => {
        const res = await Swal.fire({
            title: '¿Cerrar Sesión?',
            text: 'Saldrás del sistema de captura.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, salir',
            cancelButtonText: 'Cancelar'
        });

        if (res.isConfirmed) {
            await logout();
            window.location.href = '../index.html';
        }
    };

    document.getElementById('nav-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('sidebar-logout-btn-desktop')?.addEventListener('click', handleLogout);

    // 5. Manejo de archivos adjuntos (Fotos vs Echometer con Vista Previa)
    const photosInput = document.getElementById('well-attachments-photos');
    if (photosInput) {
        photosInput.addEventListener('change', () => {
            if (photosInput.files && photosInput.files.length > 0) {
                for (let i = 0; i < photosInput.files.length; i++) {
                    state.currentFormPhotos.push(photosInput.files[i]);
                }
                photosInput.value = '';
                renderPhotoPreviews();
            }
        });
    }

    const echoInput = document.getElementById('well-attachments-echometer');
    if (echoInput) {
        echoInput.addEventListener('change', () => {
            if (echoInput.files && echoInput.files.length > 0) {
                for (let i = 0; i < echoInput.files.length; i++) {
                    state.currentFormEchoFiles.push(echoInput.files[i]);
                }
                echoInput.value = '';
                renderEchoPreviews();
            }
        });
    }

    // 6. Botón de actualizar historial
    document.getElementById('btn-refresh-history')?.addEventListener('click', async () => {
        const refreshBtn = document.getElementById('btn-refresh-history');
        if (refreshBtn) refreshBtn.disabled = true;
        await loadJourneyHistory();
        if (refreshBtn) refreshBtn.disabled = false;
    });

    // 7. Chips de filtros del historial
    document.querySelectorAll('.crc-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.crc-filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeStatusFilter = chip.dataset.status;
            renderHistoryView();
        });
    });

    // 8. Cambio de pestaña al historial (Aislamiento de vista completa)
    const handleHistoryScroll = (e) => {
        if (e) e.preventDefault();
        
        // Ocultar paneles de captura para no apilar las vistas
        document.getElementById('panel-start-journey').style.display = 'none';
        document.getElementById('panel-active-journey').style.display = 'none';
        document.getElementById('panel-capture-form').style.display = 'none';

        const historyPanel = document.getElementById('panel-crc-history');
        if (historyPanel) {
            historyPanel.style.display = 'block';
            historyPanel.scrollIntoView({ behavior: 'smooth' });
        }
        document.querySelectorAll('.crc-nav-action').forEach(n => n.classList.remove('active'));
        document.getElementById('mobile-nav-history')?.classList.add('active');
    };
    document.getElementById('nav-link-history')?.addEventListener('click', handleHistoryScroll);
    document.getElementById('mobile-nav-history')?.addEventListener('click', handleHistoryScroll);
}

async function renderPhotoPreviews() {
    const container = document.getElementById('photos-preview-container');
    const badge = document.getElementById('photos-count-badge');
    const textSpan = document.getElementById('lbl-photos-text');
    if (!container) return;

    container.innerHTML = '';

    const localCount = state.currentFormPhotos ? state.currentFormPhotos.length : 0;
    const serverCount = state.serverUploadedPhotos ? state.serverUploadedPhotos.length : 0;
    const totalCount = localCount + serverCount;

    if (badge) {
        if (totalCount > 0) {
            badge.textContent = `(${totalCount} cargada${totalCount > 1 ? 's' : ''})`;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (textSpan) {
        textSpan.textContent = totalCount > 0 ? '+ Toca para agregar más fotos' : 'Toca para agregar fotos';
    }

    // 1. Renderizar fotos del servidor ya subidas
    for (const doc of (state.serverUploadedPhotos || [])) {
        const card = document.createElement('div');
        card.className = 'crc-preview-thumb-card';
        card.style.position = 'relative';

        const img = document.createElement('img');
        try {
            img.src = await getDocumentDownloadUrl(doc.file_path);
        } catch (e) {
            img.src = '';
        }
        card.appendChild(img);

        const badgeSpan = document.createElement('span');
        badgeSpan.style.cssText = 'position:absolute; bottom:2px; left:2px; background:#059669; color:#fff; font-size:0.6rem; padding:1px 4px; border-radius:3px; font-weight:600; z-index:2;';
        badgeSpan.textContent = 'Guardada';
        card.appendChild(badgeSpan);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'crc-preview-remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Eliminar esta foto del servidor';
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                await deleteWellDocument(doc.id);
                state.serverUploadedPhotos = state.serverUploadedPhotos.filter(d => d.id !== doc.id);
                renderPhotoPreviews();
            } catch (err) {
                console.error('Error eliminando foto del servidor:', err);
            }
        };
        card.appendChild(removeBtn);

        container.appendChild(card);
    }

    // 2. Renderizar fotos locales seleccionadas en este formulario
    (state.currentFormPhotos || []).forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'crc-preview-thumb-card';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        card.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'crc-preview-remove-btn';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Eliminar esta foto';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            state.currentFormPhotos.splice(index, 1);
            renderPhotoPreviews();
        };
        card.appendChild(removeBtn);

        container.appendChild(card);
    });
}

function renderEchoPreviews() {
    const container = document.getElementById('echometer-preview-container');
    const badge = document.getElementById('echometer-count-badge');
    const textSpan = document.getElementById('lbl-echometer-text');
    if (!container) return;

    container.innerHTML = '';

    const localCount = state.currentFormEchoFiles ? state.currentFormEchoFiles.length : 0;
    const serverCount = state.serverUploadedEchoFiles ? state.serverUploadedEchoFiles.length : 0;
    const totalCount = localCount + serverCount;

    if (badge) {
        if (totalCount > 0) {
            badge.textContent = `(${totalCount} cargado${totalCount > 1 ? 's' : ''})`;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (textSpan) {
        textSpan.textContent = totalCount > 0 ? '+ Toca para agregar más archivos' : 'Toca para agregar archivo';
    }

    // 1. Renderizar archivos de Echometer del servidor ya subidos
    (state.serverUploadedEchoFiles || []).forEach((doc) => {
        const card = document.createElement('div');
        card.className = 'crc-preview-file-card';

        const info = document.createElement('div');
        info.className = 'crc-preview-file-info';
        info.innerHTML = `<i class="fa-solid fa-file-waveform" style="color:#2563eb;"></i> <span class="crc-preview-file-name" title="${doc.nombre_archivo}">${doc.nombre_archivo}</span> <span style="background:#059669; color:#fff; font-size:0.65rem; padding:1px 5px; border-radius:3px; margin-left:4px; font-weight:600;">Guardado</span>`;
        card.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'crc-preview-remove-btn';
        removeBtn.style.position = 'static';
        removeBtn.style.width = '22px';
        removeBtn.style.height = '22px';
        removeBtn.style.fontSize = '0.7rem';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Eliminar este archivo del servidor';
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                await deleteWellDocument(doc.id);
                state.serverUploadedEchoFiles = state.serverUploadedEchoFiles.filter(d => d.id !== doc.id);
                renderEchoPreviews();
            } catch (err) {
                console.error('Error eliminando archivo Echometer del servidor:', err);
            }
        };
        card.appendChild(removeBtn);

        container.appendChild(card);
    });

    // 2. Renderizar archivos de Echometer locales seleccionados
    (state.currentFormEchoFiles || []).forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'crc-preview-file-card';

        const info = document.createElement('div');
        info.className = 'crc-preview-file-info';
        info.innerHTML = `<i class="fa-solid fa-file-waveform" style="color:#2563eb;"></i> <span class="crc-preview-file-name" title="${file.name}">${file.name}</span> <small style="color:#64748b; font-weight:400;">(${Math.round((file.size || 0) / 1024)} KB)</small>`;
        card.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'crc-preview-remove-btn';
        removeBtn.style.position = 'static';
        removeBtn.style.width = '22px';
        removeBtn.style.height = '22px';
        removeBtn.style.fontSize = '0.7rem';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.title = 'Eliminar este archivo';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            state.currentFormEchoFiles.splice(index, 1);
            renderEchoPreviews();
        };
        card.appendChild(removeBtn);

        container.appendChild(card);
    });
}

function setInputValue(id, val = '') {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function toggleTechnicalFields(method) {
    const bmSection = document.getElementById('section-bm-params');
    const bcpSection = document.getElementById('section-bcp-params');

    if (method === 'BM') {
        if (bmSection) bmSection.style.display = 'grid';
        if (bcpSection) bcpSection.style.display = 'none';
        
        // Reset BCP inputs
        setInputValue('bcp-rpm');
        setInputValue('bcp-torque');
        setInputValue('bcp-amperaje');
        setInputValue('bcp-modelo-cabezal');
        setInputValue('bcp-motorreductor');
        setInputValue('bcp-stuffing');
    } else if (method === 'BCP') {
        if (bmSection) bmSection.style.display = 'none';
        if (bcpSection) bcpSection.style.display = 'grid';
        
        // Reset BM inputs
        setInputValue('bm-marca');
        setInputValue('bm-modelo');
        setInputValue('bm-tiro');
        setInputValue('bm-recorrido');
        setInputValue('bm-spm');
        setInputValue('bm-estado-unidad');
    } else {
        if (bmSection) bmSection.style.display = 'none';
        if (bcpSection) bcpSection.style.display = 'none';
    }
}

function goToStep(step) {
    state.currentStep = step;
    
    // Auto-scroll al inicio del formulario para comenzar siempre desde arriba
    const captureFormPanel = document.getElementById('panel-capture-form');
    if (captureFormPanel) {
        captureFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Sincronizar clases de pestañas
    document.querySelectorAll('.crc-form-step-content').forEach((content, idx) => {
        if (idx + 1 === step) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });

    // Sincronizar círculos indicadores
    document.querySelectorAll('.crc-step-node').forEach((node) => {
        const stepNum = parseInt(node.dataset.step);
        if (stepNum === step) {
            node.className = 'crc-step-node active';
        } else if (stepNum < step) {
            node.className = 'crc-step-node completed';
        } else {
            node.className = 'crc-step-node';
        }
    });

    // Animar la barra (con límites exactos entre el nodo 1 y el nodo 4)
    const progressLine = document.getElementById('step-progress-line');
    const pct = (step - 1) / 3;
    progressLine.style.width = `calc((100% - 40px) * ${pct})`;

    // Botones de navegación
    const btnPrev = document.getElementById('btn-step-prev');
    const btnNext = document.getElementById('btn-step-next');
    const btnAdd = document.getElementById('btn-add-well');

    btnPrev.style.visibility = step === 1 ? 'hidden' : 'visible';
    
    if (step === 4) {
        btnNext.style.display = 'none';
        btnAdd.style.display = 'inline-flex';
        renderStepSummary();
    } else {
        btnNext.style.display = 'inline-flex';
        btnAdd.style.display = 'none';
    }
}

function validateCurrentStep(step) {
    if (step === 1) {
        const well = document.getElementById('well-pozo').value;
        const estado = document.getElementById('well-estado').value;
        const categoria = document.getElementById('well-categoria').value;
        const estatus = document.getElementById('well-estatus').value;
        const actividad = document.getElementById('well-actividad').value;
        const hora = document.getElementById('well-time').value;

        if (!well || !estado || !categoria || !estatus || !actividad || !hora) {
            Swal.fire('Campos requeridos', 'Por favor completa todos los campos del Paso 1.', 'warning');
            return false;
        }

        // Si ya se registró este pozo y no lo estamos editando
        const editingId = document.getElementById('form-well-capture').dataset.editingId;
        const duplicate = state.reports.find(r => r.pozo === well && r.id !== editingId);
        if (duplicate) {
            Swal.fire('Pozo ya agregado', `El pozo ${well} ya fue registrado en esta jornada. Edita el registro existente si deseas cambiar parámetros.`, 'warning');
            return false;
        }
    }
    
    if (step === 3) {
        const thpVal = document.getElementById('well-thp').value;
        const chpVal = document.getElementById('well-chp').value;

        if (thpVal === '' || chpVal === '') {
            Swal.fire('Campos requeridos', 'Las presiones THP y CHP son obligatorias en este paso.', 'warning');
            return false;
        }

        const brutaVal = document.getElementById('well-bruta').value;
        const netaVal = document.getElementById('well-neta').value;

        if (brutaVal !== '' && netaVal !== '') {
            const bruta = parseFloat(brutaVal) || 0;
            const neta = parseFloat(netaVal) || 0;
            if (neta > bruta) {
                Swal.fire('Inconsistencia en Producción', 'El caudal Neto (petróleo) no puede ser mayor que el caudal Bruto (fluido total).', 'warning');
                return false;
            }
        }
    }
    return true;
}

// Rellena la pestaña 4 con el resumen ordenado de los campos
function renderStepSummary() {
    const well = document.getElementById('well-pozo').value;
    const method = String(state.selectedWellMeta?.lift_method || document.getElementById('well-lift-method-read')?.value || document.getElementById('well-estado')?.value || 'No definido').trim().toUpperCase();
    const ef = document.getElementById('well-ef').value || 'No definida';
    const hora = document.getElementById('well-time').value;
    const estatus = document.getElementById('well-estatus').value;
    const actividad = document.getElementById('well-actividad').value;
    
    const bruta = parseFloat(document.getElementById('well-bruta').value) || 0;
    const neta = parseFloat(document.getElementById('well-neta').value) || 0;
    const ays = document.getElementById('well-ays').value;
    
    const thp = parseFloat(document.getElementById('well-thp').value) || 0;
    const chp = parseFloat(document.getElementById('well-chp').value) || 0;

    document.getElementById('sum-pozo').textContent = well;
    document.getElementById('sum-ef').textContent = ef;
    document.getElementById('sum-method').textContent = method;
    document.getElementById('sum-hora').textContent = `${state.activeJourney?.date || ''} ${hora}`;
    document.getElementById('sum-estatus').textContent = `${estatus} (${actividad})`;
    document.getElementById('sum-produccion').textContent = `Bruta: ${bruta.toFixed(1)} BBPD · Neta: ${neta.toFixed(1)} BNPD`;
    document.getElementById('sum-ays').textContent = ays;
    document.getElementById('sum-presiones').textContent = `THP: ${thp.toFixed(0)} PSI · CHP: ${chp.toFixed(0)} PSI`;
    
    document.getElementById('sum-observaciones').textContent = document.getElementById('well-observaciones').value || 'Sin observaciones';

    const techGrid = document.getElementById('sum-grid-technical');
    if (!techGrid) return;
    
    if (method === 'BM') {
        const marca = document.getElementById('bm-marca')?.value || '-';
        const modelo = document.getElementById('bm-modelo')?.value || '-';
        const tiro = document.getElementById('bm-tiro')?.value || '-';
        const recorrido = document.getElementById('bm-recorrido')?.value || '-';
        const spm = document.getElementById('bm-spm')?.value || '-';
        const estado = document.getElementById('bm-estado-unidad')?.value || '-';

        techGrid.innerHTML = `
            <div class="crc-summary-item"><span class="crc-summary-label">Marca UB</span><strong class="crc-summary-value">${marca}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Modelo UB</span><strong class="crc-summary-value">${modelo}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Tiro</span><strong class="crc-summary-value">${tiro}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Recorrido</span><strong class="crc-summary-value">${recorrido} IN</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Frecuencia / SPM</span><strong class="crc-summary-value">${spm} SPM</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Estado UB</span><strong class="crc-summary-value">${estado}</strong></div>
        `;
    } else if (method === 'BCP') {
        const rpm = document.getElementById('bcp-rpm')?.value || '-';
        const torque = document.getElementById('bcp-torque')?.value || '-';
        const amperaje = document.getElementById('bcp-amperaje')?.value || '-';
        const cabezal = document.getElementById('bcp-modelo-cabezal')?.value || '-';
        const reductor = document.getElementById('bcp-motorreductor')?.value || '-';
        const stuffing = document.getElementById('well-stuffing')?.value || '-';

        techGrid.innerHTML = `
            <div class="crc-summary-item"><span class="crc-summary-label">RPM</span><strong class="crc-summary-value">${rpm}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Torque</span><strong class="crc-summary-value">${torque} LBF-IN</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Corriente Motor</span><strong class="crc-summary-value">${amperaje} A</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Modelo Cabezal</span><strong class="crc-summary-value">${cabezal}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Motorreductor</span><strong class="crc-summary-value">${reductor}</strong></div>
            <div class="crc-summary-item"><span class="crc-summary-label">Stuffing Box</span><strong class="crc-summary-value">${stuffing}</strong></div>
        `;
    } else {
        techGrid.innerHTML = `<div style="grid-column:1/-1; color:var(--text-light); font-size:0.85rem;">No aplica parámetros de levantamiento.</div>`;
    }
}

function openCaptureFormForAdd() {
    document.body.classList.add('capture-open');
    const panelCapture = document.getElementById('panel-capture-form');
    if (panelCapture) panelCapture.classList.add('active');
    document.getElementById('panel-active-journey').style.display = 'none';
    document.getElementById('panel-capture-form').style.display = 'flex';
    
    // Resetear formulario y buscador de pozo
    const form = document.getElementById('form-well-capture');
    form.reset();
    form.dataset.editingId = '';

    const wellSearchInput = document.getElementById('well-pozo-search');
    if (wellSearchInput) wellSearchInput.value = '';
    const wellSelect = document.getElementById('well-pozo');
    if (wellSelect && state.catalogWells) {
        const wellsHtml = state.catalogWells
            .filter(w => w.active)
            .map(w => `<option value="${w.pozo_name}" data-method="${w.lift_method || ''}">${w.pozo_name}</option>`)
            .join('');
        wellSelect.innerHTML = '<option value="">Selecciona Pozo...</option>' + wellsHtml;
        wellSelect.value = '';
    }

    // Colocar la hora actual por defecto
    const now = new Date();
    const timeVal = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    document.getElementById('well-time').value = timeVal;

    state.selectedWellMeta = null;
    document.getElementById('well-lift-method-read').value = 'No definido';
    document.getElementById('well-campo').value = '';
    document.getElementById('well-ef').value = '';
    document.getElementById('well-ays').value = '0.00 %';
    toggleTechnicalFields(null);

    state.currentFormPhotos = [];
    state.currentFormEchoFiles = [];
    state.serverUploadedPhotos = [];
    state.serverUploadedEchoFiles = [];
    renderPhotoPreviews();
    renderEchoPreviews();

    const photosInput = document.getElementById('well-attachments-photos');
    if (photosInput) photosInput.value = '';

    const echoInput = document.getElementById('well-attachments-echometer');
    if (echoInput) echoInput.value = '';

    goToStep(1);
}

async function openCaptureFormForEdit(index) {
    const report = state.reports[index];
    if (!report) return;

    document.body.classList.add('capture-open');
    const panelCapture = document.getElementById('panel-capture-form');
    if (panelCapture) panelCapture.classList.add('active');
    document.getElementById('panel-active-journey').style.display = 'none';
    document.getElementById('panel-capture-form').style.display = 'flex';

    const form = document.getElementById('form-well-capture');
    form.dataset.editingId = report.id;

    // Cargar archivos adjuntos locales pendientes en memoria
    const existingPhotos = state.tempFiles
        .filter(item => item.pozo === report.pozo && item.category === 'SOPORTES' && (item.file instanceof File || item.file instanceof Blob))
        .map(item => item.file);
    const existingEcho = state.tempFiles
        .filter(item => item.pozo === report.pozo && item.category === 'REGISTROS_ECHOMETER' && (item.file instanceof File || item.file instanceof Blob))
        .map(item => item.file);

    state.currentFormPhotos = [...existingPhotos];
    state.currentFormEchoFiles = [...existingEcho];
    state.serverUploadedPhotos = [];
    state.serverUploadedEchoFiles = [];

    // Consultar archivos ya subidos a Supabase para este pozo en esta jornada
    if (report.pozo && state.activeJourney) {
        try {
            const docs = await getWellDocuments({ pozoName: report.pozo, operationalScope: 'crc_ll' });
            const journeyIdStr = String(state.activeJourney.id || '');
            const journeyDateStr = String(state.activeJourney.date || '');

            const journeyDocs = (docs || []).filter(d => 
                (d.descripcion && d.descripcion.includes(journeyIdStr)) ||
                (d.fecha_documento && String(d.fecha_documento).split('T')[0] === journeyDateStr)
            );

            state.serverUploadedPhotos = journeyDocs.filter(d => d.categoria === 'SOPORTES');
            state.serverUploadedEchoFiles = journeyDocs.filter(d => d.categoria === 'REGISTROS_ECHOMETER');
        } catch (err) {
            console.error('Error cargando adjuntos guardados del servidor:', err);
        }
    }

    renderPhotoPreviews();
    renderEchoPreviews();

    // Rellenar campos comunes
    const wellSearchInput = document.getElementById('well-pozo-search');
    if (wellSearchInput) wellSearchInput.value = report.pozo || '';
    document.getElementById('well-pozo').value = report.pozo;
    document.getElementById('well-lift-method-read').value = report.lift_method || '';
    document.getElementById('well-campo').value = report.campo || '';
    document.getElementById('well-ef').value = report.ef || '';
    document.getElementById('well-estado').value = report.lift_method || '';
    document.getElementById('well-categoria').value = report.categoria || '1';
    document.getElementById('well-estatus').value = report.estatus || 'RUN';
    document.getElementById('well-actividad').value = report.actividad || 'NIVEL';
    document.getElementById('well-time').value = report.hora;
    
    document.getElementById('well-bruta').value = report.bruta;
    document.getElementById('well-neta').value = report.neta;
    
    const ays = report.ays_percentage !== undefined ? report.ays_percentage : 0;
    document.getElementById('well-ays').value = ays.toFixed(2) + ' %';
    
    document.getElementById('well-thp').value = report.thp_psi;
    document.getElementById('well-chp').value = report.chp_psi;
    document.getElementById('well-stuffing').value = report.stuffing || '';
    
    document.getElementById('well-nivel').value = report.well_nivel || '';
    document.getElementById('well-sumergencia').value = report.well_sumergencia || '';
    document.getElementById('well-presion-inicial').value = report.well_presion_inicial || '';
    document.getElementById('well-presion-final').value = report.well_presion_final || '';
    const rawTime = String(report.well_tiempo_prueba || '').trim();
    const timeParts = rawTime.split(' ');
    if (timeParts.length >= 2) {
        document.getElementById('well-tiempo-prueba-num').value = timeParts[0];
        document.getElementById('well-tiempo-prueba-unit').value = timeParts[1].toUpperCase();
    } else if (timeParts.length === 1 && !isNaN(timeParts[0]) && timeParts[0] !== '') {
        document.getElementById('well-tiempo-prueba-num').value = timeParts[0];
        document.getElementById('well-tiempo-prueba-unit').value = 'MIN';
    } else {
        document.getElementById('well-tiempo-prueba-num').value = '';
        document.getElementById('well-tiempo-prueba-unit').value = 'MIN';
    }

    document.getElementById('well-observaciones').value = report.observaciones_pozo || '';

    state.selectedWellMeta = state.catalogWells.find(w => w.pozo_name === report.pozo);

    // Rellenar campos del método de levantamiento
    toggleTechnicalFields(report.lift_method);
    
    if (report.lift_method === 'BM') {
        const marca = document.getElementById('bm-marca'); if (marca) marca.value = report.bm_marca || '';
        const modelo = document.getElementById('bm-modelo'); if (modelo) modelo.value = report.bm_modelo || '';
        const tiro = document.getElementById('bm-tiro'); if (tiro) tiro.value = report.bm_tiro || '';
        const rec = document.getElementById('bm-recorrido'); if (rec) rec.value = report.bm_recorrido || '';
        const spm = document.getElementById('bm-spm'); if (spm) spm.value = report.bm_spm || '';
        const est = document.getElementById('bm-estado-unidad'); if (est) est.value = report.bm_estado_unidad || '';
    } else if (report.lift_method === 'BCP') {
        const rpm = document.getElementById('bcp-rpm'); if (rpm) rpm.value = report.bcp_rpm || '';
        const torque = document.getElementById('bcp-torque'); if (torque) torque.value = report.bcp_torque || '';
        const amp = document.getElementById('bcp-amperaje'); if (amp) amp.value = report.bcp_amperaje || '';
        const mod = document.getElementById('bcp-modelo-cabezal'); if (mod) mod.value = report.bcp_modelo_cabezal || '';
        const mot = document.getElementById('bcp-motorreductor'); if (mot) mot.value = report.bcp_motorreductor || '';
    }

    goToStep(1);
}

function saveWellReport() {
    const well = String(document.getElementById('well-pozo').value || '').trim().toUpperCase();
    const method = state.selectedWellMeta?.lift_method || null;
    const ef = String(document.getElementById('well-ef').value || '').trim().toUpperCase();
    const campo = String(document.getElementById('well-campo').value || '').trim().toUpperCase();
    const estado = document.getElementById('well-estado').value;
    const categoria = document.getElementById('well-categoria').value;
    const estatus = document.getElementById('well-estatus').value;
    const actividad = document.getElementById('well-actividad').value;
    const hora = document.getElementById('well-time').value;

    const bruta = parseFloat(document.getElementById('well-bruta').value) || 0;
    const neta = parseFloat(document.getElementById('well-neta').value) || 0;
    const ays = parseFloat(document.getElementById('well-ays').value.replace('%', '').trim()) || 0;

    const thp = parseFloat(document.getElementById('well-thp').value) || 0;
    const chp = parseFloat(document.getElementById('well-chp').value) || 0;
    const stuffing = document.getElementById('well-stuffing').value;

    const level = parseFloat(document.getElementById('well-nivel').value) || null;
    const sumergence = parseFloat(document.getElementById('well-sumergencia').value) || null;
    const presIni = parseFloat(document.getElementById('well-presion-inicial').value) || null;
    const presFin = parseFloat(document.getElementById('well-presion-final').value) || null;
    
    const testNum = document.getElementById('well-tiempo-prueba-num')?.value || '';
    const testUnit = document.getElementById('well-tiempo-prueba-unit')?.value || 'MIN';
    const testTime = testNum ? `${testNum} ${testUnit}`.toUpperCase() : '';

    const obs = String(document.getElementById('well-observaciones').value || '').trim().toUpperCase();

    const form = document.getElementById('form-well-capture');
    let reportId = form.dataset.editingId;

    const reportData = {
        id: reportId || generateUUID(),
        pozo: well,
        fecha: state.activeJourney?.date || new Date().toISOString().split('T')[0],
        hora: hora,
        campo: campo,
        ef: ef,
        estado: estado,
        categoria: categoria,
        estatus: estatus,
        actividad: actividad,
        bruta: bruta,
        neta: neta,
        ays_percentage: ays,
        thp_psi: thp,
        chp_psi: chp,
        stuffing: stuffing,
        well_nivel: level,
        well_sumergencia: sumergence,
        well_presion_inicial: presIni,
        well_presion_final: presFin,
        well_tiempo_prueba: testTime,
        observaciones_pozo: obs,
        lift_method: method,
        jornada: state.activeJourney.shift,
        equipo_guardia: state.activeJourney.crew,
        tecnico_1: state.activeJourney.tech1,
        tecnico_2: state.activeJourney.tech2
    };

    if (method === 'BM') {
        reportData.bm_marca = String(document.getElementById('bm-marca').value || '').trim().toUpperCase();
        reportData.bm_modelo = String(document.getElementById('bm-modelo').value || '').trim().toUpperCase();
        reportData.bm_tiro = String(document.getElementById('bm-tiro').value || '').trim().toUpperCase();
        reportData.bm_recorrido = parseFloat(document.getElementById('bm-recorrido').value) || null;
        reportData.bm_spm = parseFloat(document.getElementById('bm-spm').value) || null;
        reportData.bm_estado_unidad = String(document.getElementById('bm-estado-unidad').value || '').trim().toUpperCase();
    } else if (method === 'BCP') {
        reportData.bcp_rpm = parseFloat(document.getElementById('bcp-rpm').value) || null;
        reportData.bcp_torque = parseFloat(document.getElementById('bcp-torque').value) || null;
        reportData.bcp_amperaje = parseFloat(document.getElementById('bcp-amperaje').value) || null;
        reportData.bcp_modelo_cabezal = String(document.getElementById('bcp-modelo-cabezal').value || '').trim().toUpperCase();
        reportData.bcp_motorreductor = String(document.getElementById('bcp-motorreductor').value || '').trim().toUpperCase();
    }

    if (reportId) {
        // Reemplazar reporte editado
        const idx = state.reports.findIndex(r => r.id === reportId);
        if (idx !== -1) state.reports[idx] = reportData;
    } else {
        // Añadir nuevo reporte
        state.reports.push(reportData);
    }

    // Eliminar archivos anteriores cargados para este pozo en la sesión (para soportar reediciones)
    state.tempFiles = state.tempFiles.filter(item => item.pozo !== well);

    // Guardar fotos seleccionadas desde state.currentFormPhotos
    if (state.currentFormPhotos && state.currentFormPhotos.length > 0) {
        for (const file of state.currentFormPhotos) {
            state.tempFiles.push({
                pozo: well,
                file: file,
                category: 'SOPORTES',
                reportId: reportData.id
            });
        }
    }

    // Guardar archivos Echometer seleccionados desde state.currentFormEchoFiles
    if (state.currentFormEchoFiles && state.currentFormEchoFiles.length > 0) {
        for (const file of state.currentFormEchoFiles) {
            state.tempFiles.push({
                pozo: well,
                file: file,
                category: 'REGISTROS_ECHOMETER',
                reportId: reportData.id
            });
        }
    }

    // Resetear formulario
    state.currentFormPhotos = [];
    state.currentFormEchoFiles = [];
    renderPhotoPreviews();
    renderEchoPreviews();

    const formWellCapture = document.getElementById('form-well-capture');
    if (formWellCapture) {
        formWellCapture.reset();
        formWellCapture.dataset.editingId = '';
    }

    document.body.classList.remove('capture-open');
    document.getElementById('panel-capture-form').style.display = 'none';

    // Persistir localmente
    localStorage.setItem(CRC_WELL_REPORTS_KEY, JSON.stringify(state.reports));

    showActiveJourneyView();
    Swal.fire('¡Guardado!', `Pozo ${well} guardado correctamente en la lista.`, 'success');
    syncDraftToSupabase();
}

// Transmitir la jornada entera a Supabase
async function transmitJourneyToServer() {
    if (state.reports.length === 0) {
        Swal.fire('Jornada Vacía', 'No has registrado ningún pozo para transmitir.', 'warning');
        return;
    }

    const confirmSend = await Swal.fire({
        title: '¿Enviar jornada a revisión?',
        text: `Se enviará la jornada con ${state.reports.length} pozo(s) capturado(s). Una vez enviada, pasará a revisión administrativa y no se podrán agregar más pozos. ¿Deseas proceder?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, enviar jornada',
        cancelButtonText: 'Continuar capturando',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b'
    });

    if (!confirmSend.isConfirmed) return;

    Swal.fire({
        title: 'Enviando Jornada a Revisión',
        html: '<p style="color:#64748b;">Subiendo registros a Supabase y registrando bitácora de auditoría...</p>',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const payloadReports = state.reports.map(r => ({
            ...r,
            id: r.id,
            pozo: r.pozo,
            fecha: r.fecha,
            hora: r.hora,
            campo: r.campo,
            ef: r.ef,
            estado: r.estado,
            categoria: r.categoria,
            actividad: r.actividad,
            estatus: r.estatus,
            bruta: r.bruta,
            neta: r.neta,
            ays_percentage: r.ays_percentage,
            thp_psi: r.thp_psi !== undefined ? r.thp_psi : r.presion_thp,
            chp_psi: r.chp_psi !== undefined ? r.chp_psi : r.presion_chp,
            observaciones_pozo: r.observaciones_pozo,
            jornada: r.jornada,
            equipo_guardia: r.equipo_guardia,

            // Parámetros técnicos de CCRC BM / BCP
            lift_method: r.lift_method || (r.bm_spm ? 'BM' : r.bcp_rpm ? 'BCP' : 'BM'),
            bm_marca: r.bm_marca || '',
            bm_modelo: r.bm_modelo || '',
            bm_tiro: r.bm_tiro || '',
            bm_recorrido: r.bm_recorrido || '',
            bm_spm: r.bm_spm || '',
            bm_estado_unidad: r.bm_estado_unidad || '',
            bcp_rpm: r.bcp_rpm || '',
            bcp_torque: r.bcp_torque || '',
            bcp_amperaje: r.bcp_amperaje || '',
            bcp_modelo_cabezal: r.bcp_modelo_cabezal || '',
            bcp_motorreductor: r.bcp_motorreductor || '',
            bcp_stuffing: r.bcp_stuffing || r.stuffing || '',
            stuffing: r.stuffing || r.bcp_stuffing || '',
            well_nivel: r.well_nivel || r.nivel_fluido_ft || '',
            well_sumergencia: r.well_sumergencia || r.sumergencia_ft || '',
            well_presion_inicial: r.well_presion_inicial || r.presion_inicial || '',
            well_presion_final: r.well_presion_final || r.presion_final || '',
            well_tiempo_prueba: r.well_tiempo_prueba || r.tiempo_prueba_presion || '',

            operational_scope: 'crc_ll',
            raw_payload: r
        }));

        const result = await submitFieldJourneyWorkflow(payloadReports, {
            journeyId: state.activeJourney.id,
            operationalScope: 'crc_ll'
        });

        // Subir archivos adjuntos si existen en state.tempFiles
        const validTempFiles = state.tempFiles.filter(item => item.file instanceof File || item.file instanceof Blob);
        if (validTempFiles.length > 0) {
            Swal.update({
                title: 'Subiendo archivos de soporte...',
                html: `<p style="color:#64748b;">Subiendo <strong>${validTempFiles.length}</strong> archivo(s) a Supabase Storage...</p>`
            });

            for (const item of validTempFiles) {
                try {
                    await uploadWellDocument({
                        file: item.file,
                        pozoName: item.pozo,
                        category: item.category,
                        description: `[JORNADA_ID:${state.activeJourney.id}][TICKET_ID:${item.reportId || ''}] Adjunto enviado desde captura CCRC para el pozo ${item.pozo}`,
                        uploadedBy: state.session?.user?.email || 'Técnico CCRC Campo',
                        operationalScope: 'crc_ll',
                        documentDate: state.activeJourney.date
                    });
                } catch (uploadErr) {
                    console.error(`Error subiendo archivo para ${item.pozo}:`, uploadErr);
                }
            }
        }

        // Limpiar estados locales tras éxito
        localStorage.removeItem(CRC_JORNADA_HEADER_KEY);
        localStorage.removeItem(CRC_WELL_REPORTS_KEY);
        state.activeJourney = null;
        state.reports = [];
        state.tempFiles = [];

        showStartJourneyView();
        
        Swal.fire({
            icon: 'success',
            title: '¡Jornada Enviada a Revisión!',
            text: `Se cargaron ${result.saved} registros bajo el contrato CCRC LL correctamente. La jornada pasará a revisión por administración.`,
            confirmButtonText: 'Entendido'
        });

    } catch (err) {
        console.error('[crc-controller] Error transmitiendo jornada:', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al Enviar Jornada',
            text: err.message || 'No se pudo enviar la jornada a revisión. Se conserva la copia local.'
        });
    }
}

// Sincronizar el borrador actual en tiempo real con Supabase
async function syncDraftToSupabase() {
    if (!state.activeJourney) return;
    try {
        const payloadReports = state.reports.map(r => ({
            ...r,
            id: r.id,
            pozo: r.pozo,
            fecha: r.fecha,
            hora: r.hora,
            campo: r.campo,
            ef: r.ef,
            estado: r.estado,
            categoria: r.categoria,
            actividad: r.actividad,
            estatus: r.estatus,
            bruta: r.bruta,
            neta: r.neta,
            ays_percentage: r.ays_percentage,
            thp_psi: r.thp_psi !== undefined ? r.thp_psi : r.presion_thp,
            chp_psi: r.chp_psi !== undefined ? r.chp_psi : r.presion_chp,
            observaciones_pozo: r.observaciones_pozo,
            jornada: r.jornada,
            equipo_guardia: r.equipo_guardia,

            // Parámetros técnicos de CCRC BM / BCP
            lift_method: r.lift_method || (r.bm_spm ? 'BM' : r.bcp_rpm ? 'BCP' : 'BM'),
            bm_marca: r.bm_marca || '',
            bm_modelo: r.bm_modelo || '',
            bm_tiro: r.bm_tiro || '',
            bm_recorrido: r.bm_recorrido || '',
            bm_spm: r.bm_spm || '',
            bm_estado_unidad: r.bm_estado_unidad || '',
            bcp_rpm: r.bcp_rpm || '',
            bcp_torque: r.bcp_torque || '',
            bcp_amperaje: r.bcp_amperaje || '',
            bcp_modelo_cabezal: r.bcp_modelo_cabezal || '',
            bcp_motorreductor: r.bcp_motorreductor || '',
            bcp_stuffing: r.bcp_stuffing || r.stuffing || '',
            stuffing: r.stuffing || r.bcp_stuffing || '',
            well_nivel: r.well_nivel || r.nivel_fluido_ft || '',
            well_sumergencia: r.well_sumergencia || r.sumergencia_ft || '',
            well_presion_inicial: r.well_presion_inicial || r.presion_inicial || '',
            well_presion_final: r.well_presion_final || r.presion_final || '',
            well_tiempo_prueba: r.well_tiempo_prueba || r.tiempo_prueba_presion || '',

            operational_scope: 'crc_ll',
            raw_payload: r
        }));

        if (payloadReports.length === 0) {
            // Si no hay reportes, solo borramos los registros del borrador previo pero conservamos la cabecera
            await supabase
                .from('field_journey_records')
                .delete()
                .eq('journey_id', state.activeJourney.id);
            console.log('Registros de borrador limpiados (0 pozos), cabecera conservada.');
        } else {
            await autosaveFieldJourneyDraft(payloadReports, {
                journeyId: state.activeJourney.id,
                operationalScope: 'crc_ll'
            });
            console.log('Borrador de jornada sincronizado con Supabase.');
            loadJourneyHistory().catch(e => console.warn('History refresh error:', e));
        }

        // Subir archivos adjuntos inmediatamente en tiempo real para el monitoreo en vivo
        const pendingFiles = state.tempFiles.filter(item => item.file instanceof File || item.file instanceof Blob);
        if (pendingFiles.length > 0) {
            for (const item of pendingFiles) {
                try {
                    await uploadWellDocument({
                        file: item.file,
                        pozoName: item.pozo,
                        category: item.category,
                        description: `[JORNADA_ID:${state.activeJourney.id}][TICKET_ID:${item.reportId || ''}] Adjunto enviado desde captura CCRC para el pozo ${item.pozo}`,
                        uploadedBy: state.session?.user?.email || 'Técnico CCRC Campo',
                        operationalScope: 'crc_ll',
                        documentDate: state.activeJourney.date
                    });
                    console.log(`[crc-controller] Archivo subido en tiempo real para pozo ${item.pozo}`);
                    state.tempFiles = state.tempFiles.filter(t => t !== item);
                } catch (uploadErr) {
                    console.error(`Error subiendo archivo para ${item.pozo}:`, uploadErr);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error al Subir Adjunto a Supabase',
                        text: `Ocurrió un problema subiendo el archivo (${item.file?.name || 'documento'}) para el pozo ${item.pozo}: ${uploadErr.message || uploadErr}`,
                        confirmButtonColor: '#2563eb'
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error al sincronizar borrador con Supabase:', err);
    }
}

/* ==============================================================================
   CCRC LL - EMBEDDED HISTORY VIEWER & UTILITIES
   ============================================================================== */

async function loadJourneyHistory() {
    const status = document.getElementById('crc-history-status');
    const list = document.getElementById('crc-history-list');
    if (!status || !list) return;

    status.textContent = 'Cargando historial de jornadas...';
    try {
        const reports = await getFieldJourneyHistory();
        state.historyRecords = reports;
        renderHistoryView();
    } catch (error) {
        status.textContent = 'Error al cargar historial: ' + error.message;
        list.innerHTML = '';
    }
}

function renderHistoryView() {
    const status = document.getElementById('crc-history-status');
    const list = document.getElementById('crc-history-list');
    if (!status || !list) return;

    let groups = groupHistoryRecords(state.historyRecords);

    // Filtrar por estado si aplica
    if (state.activeStatusFilter !== 'all') {
        groups = groups.filter(group => {
            const firstRec = group.records[0] || {};
            const groupStatus = String(firstRec.status || 'draft').toLowerCase();
            if (state.activeStatusFilter === 'submitted') {
                return ['submitted', 'under_review'].includes(groupStatus);
            }
            if (state.activeStatusFilter === 'approved') {
                return ['approved', 'published'].includes(groupStatus);
            }
            return groupStatus === state.activeStatusFilter;
        });
    }

    if (state.historyRecords.length === 0) {
        status.textContent = 'No hay jornadas registradas para este usuario.';
        list.innerHTML = '';
        return;
    }

    status.textContent = `Se encontraron ${groups.length} jornada(s).`;

    if (groups.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding: 24px; color:var(--text-light); border: 1px dashed rgba(226, 232, 240, 0.9); border-radius: 14px;">
                No hay resultados para este filtro.
            </div>
        `;
        return;
    }

    list.innerHTML = groups.map(renderHistoryTable).join('');
    bindHistoryActions(groups);
}

function groupHistoryRecords(records = []) {
    const groups = new Map();

    records.forEach(record => {
        const key = record.journey_id || 'legacy';
        if (!groups.has(key)) {
            groups.set(key, { key, records: [] });
        }
        groups.get(key).records.push(record);
    });

    return [...groups.values()]
        .map(group => ({
            ...group,
            records: [...group.records].sort((left, right) => String(left.report_time || '').localeCompare(String(right.report_time || '')))
        }))
        .sort((left, right) => {
            const leftTime = new Date(left.records[0]?.updated_at || 0).getTime();
            const rightTime = new Date(right.records[0]?.updated_at || 0).getTime();
            return rightTime - leftTime;
        });
}

function renderHistoryTable(group) {
    const firstRecord = group.records[0] || {};
    const status = String(firstRecord.status || 'draft').toLowerCase();
    const canContinue = ['draft', 'rejected'].includes(status);

    return `
        <div class="crc-journey-item" style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #ffffff; box-shadow: 0 2px 8px rgba(15,23,42,0.04); margin-bottom: 12px;">
            <div class="crc-history-item-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9;">
                <div>
                    <h3 style="margin:0; font-size:0.92rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px; flex-wrap: wrap;">
                        Jornada ${escapeHtml(formatDate(firstRecord.report_date))}
                        <span class="${normalizeStatusClass(firstRecord.status)}">${normalizeStatusLabel(firstRecord.status)}</span>
                    </h3>
                    <p style="margin: 2px 0 0; font-size: 0.75rem; color: #64748b; font-weight: 500;">
                        ${escapeHtml(firstRecord.locacion_jornada || 'Lagunillas Lago')} · ${escapeHtml(firstRecord.equipo_guardia || 'Equipo CCRC')}
                    </p>
                </div>
                <div class="crc-history-item-actions" style="display:flex; gap:6px; flex-shrink:0;">
                    ${canContinue ? `
                        <button type="button" class="field-history-continue-btn" data-journey-key="${escapeHtml(group.key)}" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Recuperar Jornada">
                            <i class="fa-solid fa-rotate-left"></i> Recuperar
                        </button>
                        <button type="button" class="field-history-delete-btn" data-journey-key="${escapeHtml(group.key)}" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Eliminar Jornada">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <div class="crc-history-table-container">
                <table class="crc-history-table" style="width:100%; border-collapse:collapse; font-size:0.78rem; text-align:left;">
                    <thead>
                        <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b;">
                            <th style="padding:4px 6px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.5px;">Pozo</th>
                            <th style="padding:4px 6px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.5px;">Hora</th>
                            <th style="padding:4px 6px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.5px;">Método</th>
                            <th style="padding:4px 6px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.5px;">Estatus</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${group.records.map(rec => {
                            if (rec.isEmptyJourney) {
                                return `
                                    <tr>
                                        <td colspan="4" style="padding:12px 6px; text-align:center; color:#94a3b8; font-style:italic; font-size:0.75rem;">
                                            <i class="fa-solid fa-circle-info"></i> Sin pozos visitados en esta jornada
                                        </td>
                                    </tr>
                                `;
                            }
                            const method = rec.lift_method || 'BM';
                            return `
                                <tr style="border-bottom: 1px solid #f8fafc;">
                                    <td data-label="Pozo" style="padding:6px 6px; font-weight:800; color:#0f172a;">${escapeHtml(rec.pozo)}</td>
                                    <td data-label="Hora" style="padding:6px 6px; color: #64748b; font-weight:500;">${escapeHtml(String(rec.report_time || '').slice(0, 5))}</td>
                                    <td data-label="Método" style="padding:6px 6px;"><span class="crc-well-type-tag ${method.toLowerCase()}">${method}</span></td>
                                    <td data-label="Estatus" style="padding:6px 6px;"><span style="color: ${rec.estatus === 'RUN' ? '#059669' : '#dc2626'}; font-weight:800; font-size:0.75rem;">${escapeHtml(rec.estatus || 'RUN')}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function bindHistoryActions(groups) {
    const groupsByKey = new Map(groups.map(group => [group.key, group]));

    // Eventos para eliminar jornada
    document.querySelectorAll('.field-history-delete-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const journeyId = String(button.dataset.journeyKey || '');
            if (!journeyId) return;

            const res = await Swal.fire({
                title: '¿Eliminar esta jornada?',
                text: 'Se eliminará de forma permanente de la base de datos con todas sus visitas de pozo asociadas y no se podrá recuperar. ¿Deseas proceder?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b'
            });

            if (!res.isConfirmed) return;

            Swal.fire({
                title: 'Eliminando jornada...',
                html: '<p style="color:#64748b;">Borrando registros de Supabase...</p>',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            try {
                // Si la jornada eliminada era la activa en local, la limpiamos
                if (state.activeJourney && state.activeJourney.id === journeyId) {
                    localStorage.removeItem(CRC_JORNADA_HEADER_KEY);
                    localStorage.removeItem(CRC_WELL_REPORTS_KEY);
                    state.activeJourney = null;
                    state.reports = [];
                    showStartJourneyView();
                }

                // Borrar registros del consolidado operativo primero
                await supabase
                    .from('consolidated_operational')
                    .delete()
                    .eq('source_journey_id', journeyId);

                // Borrar registros de la jornada en Supabase (cascada borra los registros de pozo)
                const { error } = await supabase
                    .from('field_journeys')
                    .delete()
                    .eq('id', journeyId);

                if (error) throw error;

                Swal.fire({
                    icon: 'success',
                    title: 'Jornada eliminada',
                    text: 'La jornada fue eliminada correctamente.',
                    confirmButtonColor: '#10b981',
                    timer: 2000,
                    showConfirmButton: false
                });

                await loadJourneyHistory();
            } catch (err) {
                console.error('Error al eliminar jornada:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error al eliminar',
                    text: err.message || 'No se pudo eliminar la jornada de la base de datos.'
                });
            }
        });
    });

    document.querySelectorAll('.field-history-continue-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const group = groupsByKey.get(String(button.dataset.journeyKey || ''));
            if (!group) return;

            if (state.activeJourney) {
                const res = await Swal.fire({
                    title: '¿Continuar esta jornada?',
                    text: 'Actualmente tienes una jornada activa en curso. Si continúas esta jornada histórica, se descartará el borrador actual. ¿Deseas proceder?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, continuar',
                    cancelButtonText: 'Cancelar'
                });
                if (!res.isConfirmed) return;
            }

            const firstRec = group.records[0] || {};
            state.activeJourney = {
                id: group.key,
                date: firstRec.report_date || new Date().toISOString().split('T')[0],
                shift: firstRec.jornada || 'Diurna',
                startTime: firstRec.report_time || '00:00',
                tech1: firstRec.tecnico_1 || '',
                tech2: firstRec.tecnico_2 || '',
                crew: firstRec.equipo_guardia || 'Equipo CCRC',
                created_at: firstRec.updated_at || new Date().toISOString()
            };

            state.reports = group.records
                .filter(rec => !rec.isEmptyJourney)
                .map(rec => {
                    const raw = rec.raw_payload || {};
                    return {
                        id: rec.client_report_id || rec.id || generateUUID(),
                    pozo: rec.pozo,
                    fecha: rec.report_date || state.activeJourney.date,
                    hora: String(rec.report_time || '00:00').slice(0, 5),
                    jornada: state.activeJourney.shift,
                    tecnico_1: state.activeJourney.tech1,
                    tecnico_2: state.activeJourney.tech2,
                    equipo_guardia: state.activeJourney.crew,
                    
                    lift_method: rec.lift_method || raw.lift_method || 'BM',
                    bm_marca: rec.bm_marca || raw.bm_marca || '',
                    bm_modelo: rec.bm_modelo || raw.bm_modelo || '',
                    bm_tiro: rec.bm_tiro || raw.bm_tiro || '',
                    bm_recorrido: rec.bm_recorrido || raw.bm_recorrido || null,
                    bm_spm: rec.bm_spm || raw.bm_spm || null,
                    bm_estado_unidad: rec.bm_estado_unidad || raw.bm_estado_unidad || '',
                    
                    bcp_rpm: rec.bcp_rpm || raw.bcp_rpm || null,
                    bcp_torque: rec.bcp_torque || raw.bcp_torque || null,
                    bcp_amperaje: rec.bcp_amperaje || raw.bcp_amperaje || null,
                    bcp_modelo_cabezal: rec.bcp_modelo_cabezal || raw.bcp_modelo_cabezal || '',
                    bcp_motorreductor: rec.bcp_motorreductor || raw.bcp_motorreductor || '',
                    bcp_stuffing: rec.bcp_stuffing || raw.bcp_stuffing || '',
                    
                    bruta: rec.bruta ?? raw.bruta ?? '',
                    neta: rec.neta ?? raw.neta ?? '',
                    ays_percentage: rec.ays_percentage ?? raw.ays_percentage ?? '',
                    
                    thp_psi: rec.thp_psi ?? rec.thp ?? raw.thp_psi ?? '',
                    chp_psi: rec.chp_psi ?? rec.chp ?? raw.chp_psi ?? '',
                    stuffing: rec.stuffing || raw.stuffing || '',
                    
                    well_nivel: rec.well_nivel || raw.well_nivel || '',
                    well_sumergencia: rec.well_sumergencia || raw.well_sumergencia || '',
                    well_presion_inicial: rec.well_presion_inicial || raw.well_presion_inicial || '',
                    well_presion_final: rec.well_presion_final || raw.well_presion_final || '',
                    well_tiempo_prueba: rec.well_tiempo_prueba || raw.well_tiempo_prueba || '',
                    observaciones_pozo: rec.comentario || rec.observaciones_pozo || raw.comentario || ''
                };
            });

            // Guardar localmente
            localStorage.setItem(CRC_JORNADA_HEADER_KEY, JSON.stringify(state.activeJourney));
            localStorage.setItem(CRC_WELL_REPORTS_KEY, JSON.stringify(state.reports));

            showActiveJourneyView();
            document.getElementById('panel-active-journey')?.scrollIntoView({ behavior: 'smooth' });

            Swal.fire('Jornada recuperada', `Se cargó la jornada en modo edición.`, 'success');
        });
    });
}

function escapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatDate(value) {
    if (!value) return '--';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function normalizeStatusClass(status) {
    const s = String(status || 'draft').toLowerCase();
    if (s === 'draft') return 'field-history-status-badge status-draft';
    if (s === 'submitted') return 'field-history-status-badge status-submitted';
    if (s === 'under_review') return 'field-history-status-badge status-review';
    if (s === 'approved' || s === 'published') return 'field-history-status-badge status-approved';
    if (s === 'rejected') return 'field-history-status-badge status-rejected';
    return 'field-history-status-badge';
}

function normalizeStatusLabel(status) {
    const s = String(status || 'draft').toLowerCase();
    if (s === 'draft') return 'En curso';
    if (s === 'submitted') return 'Pendiente';
    if (s === 'under_review') return 'En Revisión';
    if (s === 'approved' || s === 'published') return 'Aprobada';
    if (s === 'rejected') return 'Rechazada';
    return status;
}

function generateJourneySummaryText() {
    if (!state.activeJourney) return '';

    let text = `📋 *RESUMEN DE JORNADA - CCRC LAGUNILLAS LAGO*\n`;
    text += `📅 *Fecha:* ${state.activeJourney.date}\n`;
    text += `👥 *Técnico(s):* ${[state.activeJourney.tech1, state.activeJourney.tech2].filter(Boolean).join(' y ')}\n`;
    text += `📍 *Ubicación:* Lagunillas Lago\n`;
    text += `------------------------------------------\n`;

    if (state.reports.length === 0) {
        text += `⚠️ No se han registrado pozos visitados aún.`;
    } else {
        state.reports.forEach((rep, idx) => {
            text += `🔹 *Pozo:* ${rep.pozo} (${rep.hora})\n`;
            text += `  • *Método:* ${rep.lift_method}\n`;
            text += `  • *Actividad:* ${rep.actividad || 'NIVEL'}\n`;
            text += `  • *Estatus:* ${rep.estatus || 'RUN'}\n`;
            
            if (rep.lift_method === 'BM') {
                text += `  • *SPM:* ${rep.bm_spm || '--'} | *Tiro:* ${rep.bm_tiro || '--'}\n`;
                text += `  • *Estado Unidad:* ${rep.bm_estado_unidad || '--'}\n`;
            } else if (rep.lift_method === 'BCP') {
                text += `  • *RPM:* ${rep.bcp_rpm || '--'} | *Torque:* ${rep.bcp_torque || '--'}\n`;
            }
            
            text += `  • *THP:* ${rep.thp_psi !== undefined && rep.thp_psi !== '' ? rep.thp_psi + ' PSI' : '--'}\n`;
            text += `  • *CHP:* ${rep.chp_psi !== undefined && rep.chp_psi !== '' ? rep.chp_psi + ' PSI' : '--'}\n`;
            
            if (rep.observaciones_pozo) {
                text += `  • *Obs:* ${rep.observaciones_pozo}\n`;
            }
            text += `\n`;
        });
    }
    
    text += `------------------------------------------\n`;
    text += `*Enviado desde UV Servicios Movil* 📱`;
    return text;
}
