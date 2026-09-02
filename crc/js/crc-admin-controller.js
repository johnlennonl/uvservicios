/* ==============================================================================
   CRC LAGUNILLAS LAGO - CONTROLADOR ADMINISTRATIVO (CRC LL ADMIN)
   ============================================================================== */

import { getSession, logout, getAccessProfile } from '../../js/auth.js';
import { publishAdminFieldJourneyToDashboard } from '../../js/services/field-journey-service.js';
import { initOperationalScopeContext } from '../../js/services/operational-scope-context.js';
import { supabase } from '../../js/supabaseClient.js';
import { getDocumentDownloadUrl } from '../../js/services/well-documents-service.js';

// Estado global
const state = {
    session: null,
    accessProfile: null,
    journeys: [],
    activeJourney: null,
    activeRecords: [],
    activeAttachments: [], // Soportes adjuntos de la jornada en revisión
    wellProfilesLoaded: false // Bandera de carga para la pestaña de fichas
};

export async function initCrcAdmin() {
    try {
        // 1. Obtener loader de transición premium
        const loader = document.getElementById('premium-loader');

        // 2. Validar sesión y privilegios administrativos
        const session = await getSession();
        if (!session) {
            window.location.href = '../index.html';
            return;
        }

        const accessProfile = getAccessProfile(session);
        if (!accessProfile.canViewManagement && !accessProfile.isAdmin && !accessProfile.isSupervisor) {
            Swal.fire({
                icon: 'error',
                title: 'Acceso Denegado',
                text: 'Tu usuario no tiene privilegios administrativos para acceder a este panel.'
            }).then(() => {
                window.location.href = '../dashboard.html';
            });
            return;
        }

        state.session = session;
        state.accessProfile = accessProfile;

        // Forzar el alcance operativo a 'crc_ll' para este panel
        localStorage.setItem('uv-operational-scope', 'crc_ll');
        const scopeContext = await initOperationalScopeContext(session, accessProfile);
        scopeContext.activeScope = 'crc_ll';

        // 3. Cargar listado de jornadas del contrato CRC LL
        await fetchJourneysList();

        // 4. Inicializar eventos
        initUIEvents();

        // Ocultar loader
        if (loader) loader.classList.add('hidden');

    } catch (err) {
        console.error('[crc-admin-controller] Error en inicialización:', err);
        const loader = document.getElementById('premium-loader');
        if (loader) loader.classList.add('hidden');
    }
}

async function fetchJourneysList() {
    try {
        const { data: journeys, error } = await supabase
            .from('field_journeys')
            .select('*')
            .eq('operational_scope', 'crc_ll')
            .order('journey_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        state.journeys = journeys || [];
        renderJourneysTable();

    } catch (err) {
        console.error('[crc-admin-controller] Error cargando jornadas:', err);
        Swal.fire('Error', 'No se pudieron recuperar las jornadas del servidor.', 'error');
    }
}

function renderJourneysTable() {
    const tbody = document.getElementById('tbody-journeys');
    const countLbl = document.getElementById('lbl-total-journeys');

    if (countLbl) {
        countLbl.textContent = `${state.journeys.length} jornada${state.journeys.length === 1 ? '' : 's'}`;
    }

    if (state.journeys.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:24px; text-align:center; color:var(--text-light);">
                    <i class="fa-solid fa-folder-open" style="font-size:1.8rem; margin-bottom:8px; display:block;"></i>
                    No se encontraron jornadas subidas para el contrato CRC Lagunillas Lago.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = state.journeys.map(j => {
        let badgeClass = 'background:#fef3c7; color:#d97706;'; // submitted
        let label = 'Revisión';

        if (j.status === 'published' || j.status === 'approved') {
            badgeClass = 'background:#d1fae5; color:#059669;';
            label = 'Publicada';
        } else if (j.status === 'rejected') {
            badgeClass = 'background:#fee2e2; color:#dc2626;';
            label = 'Rechazada';
        } else if (j.status === 'draft') {
            badgeClass = 'background:#e2e8f0; color:#475569;';
            label = 'Borrador';
        }

        const dateStr = j.journey_date || 'Sin fecha';
        const technicians = [j.submitted_by_email, j.equipo_guardia].filter(Boolean).join(' / ');

        return `
            <tr style="border-bottom:1px solid #f1f5f9; hover:background:#f8fafc;" data-id="${j.id}">
                <td style="padding:12px; font-weight:700;">${dateStr}</td>
                <td style="padding:12px;">${j.jornada || 'Diurna'}</td>
                <td style="padding:12px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${technicians}</td>
                <td style="padding:12px;">${j.equipo_guardia || 'N/A'}</td>
                <td style="padding:12px;">
                    <span style="font-size:0.7rem; font-weight:800; padding:4px 8px; border-radius:50px; ${badgeClass}">
                        ${label}
                    </span>
                </td>
                <td style="padding:12px; text-align:right;">
                    <button type="button" class="crc-btn crc-btn-primary btn-view-detail" data-id="${j.id}" style="padding:6px 12px; font-size:0.75rem;">
                        <i class="fa-solid fa-magnifying-glass"></i> Auditar
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Eventos del botón de Auditar
    tbody.querySelectorAll('.btn-view-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            loadJourneyDetails(id);
        });
    });
}

async function loadJourneyDetails(journeyId) {
    const loader = document.getElementById('premium-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        const journey = state.journeys.find(j => j.id === journeyId);
        if (!journey) throw new Error('Jornada no localizada en memoria.');

        state.activeJourney = journey;

        const [recordsRes, attachmentsRes] = await Promise.allSettled([
            supabase
                .from('field_journey_records')
                .select('*')
                .eq('journey_id', journeyId)
                .order('report_time', { ascending: true }),
            supabase
                .from('well_historical_documents')
                .select('*')
                .is('deleted_at', null)
                .like('descripcion', `%[JORNADA_ID:${journeyId}]%`)
        ]);

        if (recordsRes.status === 'rejected') throw recordsRes.reason;

        state.activeRecords = recordsRes.value.data || [];
        state.activeAttachments = attachmentsRes.status === 'fulfilled' ? (attachmentsRes.value.data || []) : [];

        showJourneyDetailsView();

        if (loader) loader.classList.add('hidden');

    } catch (err) {
        console.error('[crc-admin-controller] Error cargando detalles:', err);
        if (loader) loader.classList.add('hidden');
        Swal.fire('Error', 'No se pudieron recuperar los registros del pozo.', 'error');
    }
}

function showJourneyDetailsView() {
    const detailPanel = document.getElementById('panel-journey-detail');
    detailPanel.style.display = 'block';
    
    // Auto-scroll al detalle
    detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Cabecera del detalle
    document.getElementById('det-user').textContent = state.activeJourney.submitted_by_email || 'Técnico';
    document.getElementById('det-created').textContent = state.activeJourney.created_at ? new Date(state.activeJourney.created_at).toLocaleString() : 'N/A';

    // Rellenar registros
    const tbody = document.getElementById('tbody-records');
    tbody.innerHTML = state.activeRecords.map(r => {
        const payload = r.raw_payload || {};
        const method = payload.lift_method || 'N/A';
        const methodColor = method === 'BM' ? '#2563eb' : '#10b981';

        // Estructurar parámetros técnicos específicos
        let technicalHTML = '';
        if (method === 'BM') {
            technicalHTML = `
                <div style="font-size:0.75rem;">
                    <strong>UB:</strong> ${payload.bm_marca || ''} ${payload.bm_modelo || ''}<br>
                    <strong>Tiro/Recorrido:</strong> ${payload.bm_tiro || ''} (${payload.bm_recorrido || ''} IN)<br>
                    <strong>SPM / Frecuencia:</strong> ${payload.bm_spm || ''} SPM<br>
                    <strong>Estado UB:</strong> ${payload.bm_estado_unidad || ''}
                </div>
            `;
        } else if (method === 'BCP') {
            technicalHTML = `
                <div style="font-size:0.75rem;">
                    <strong>Velocidad:</strong> ${payload.bcp_rpm || ''} RPM<br>
                    <strong>Torque:</strong> ${payload.bcp_torque || ''} LBF-IN<br>
                    <strong>Corriente Motor:</strong> ${payload.bcp_amperaje || ''} A<br>
                    <strong>Cabezal/Reductor:</strong> ${payload.bcp_modelo_cabezal || ''} (${payload.bcp_motorreductor || ''})<br>
                    <strong>Stuffing:</strong> ${payload.bcp_stuffing || ''}
                </div>
            `;
        } else {
            technicalHTML = '<span style="color:var(--text-light);">No aplica</span>';
        }

        // Filtrar adjuntos de este pozo
        const wellDocs = state.activeAttachments.filter(d => d.pozo_name?.toUpperCase() === r.pozo?.toUpperCase());
        let attachmentsHTML = '';
        if (wellDocs.length > 0) {
            attachmentsHTML = wellDocs.map(doc => `
                <div style="margin-bottom: 4px;">
                    <a href="javascript:void(0)" onclick="downloadCrcDoc('${doc.file_path}')" style="color: #2563eb; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="${doc.descripcion || ''}">
                        <i class="fa-solid fa-file-arrow-down"></i> ${doc.nombre_archivo}
                    </a>
                </div>
            `).join('');
        } else {
            attachmentsHTML = '<span style="color: var(--text-light); font-size: 0.75rem; font-style: italic;">Sin soportes</span>';
        }

        // Caudales consolidado: Bruta / Neta / %AyS
        const aysStr = r.ays_percentage !== null ? r.ays_percentage.toFixed(2) + '%' : '-';
        const caudalesHTML = `
            <div style="font-size: 0.78rem;">
                <strong>Bruta:</strong> ${r.bruta !== null ? r.bruta : '-'} BBPD<br>
                <strong>Neta:</strong> ${r.neta !== null ? r.neta : '-'} BNPD<br>
                <strong>%AyS:</strong> <span style="font-weight: 700; color: #1e40af;">${aysStr}</span>
            </div>
        `;

        return `
            <tr style="border-bottom:1px solid #e2e8f0; hover:background:#f8fafc;">
                <td style="padding:10px; font-weight:700; color:#1e293b;">${r.pozo}</td>
                <td style="padding:10px;">
                    <span class="crc-well-type-tag" style="background:${methodColor};">${method}</span>
                </td>
                <td style="padding:10px;">${r.report_time || ''}</td>
                <td style="padding:10px;">${caudalesHTML}</td>
                <td style="padding:10px;">THP: ${r.thp_psi !== null ? r.thp_psi : '-'} · CHP: ${r.chp_psi !== null ? r.chp_psi : '-'}</td>
                <td style="padding:10px; background:#f8fafc;">${technicalHTML}</td>
                <td style="padding:10px; max-width:200px; font-size:0.75rem;">${r.observaciones_pozo || '<span style="color:var(--text-light);">Sin comentarios</span>'}</td>
                <td style="padding:10px; vertical-align:middle;">${attachmentsHTML}</td>
            </tr>
        `;
    }).join('');

    // Ajustar visibilidad de botones según estatus
    const actionsWrapper = document.getElementById('journey-admin-actions');
    if (state.activeJourney.status === 'published' || state.activeJourney.status === 'approved') {
        actionsWrapper.style.display = 'none';
    } else {
        actionsWrapper.style.display = 'flex';
    }
}

function initUIEvents() {
    // Cerrar detalle
    document.getElementById('btn-close-detail').addEventListener('click', () => {
        document.getElementById('panel-journey-detail').style.display = 'none';
        state.activeJourney = null;
        state.activeRecords = [];
    });

    // Manejo de pestañas (Tabs)
    document.querySelectorAll('.crc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Alternar clase active en los botones de pestañas
            document.querySelectorAll('.crc-tab-btn').forEach(b => {
                b.classList.toggle('active', b === btn);
                if (b === btn) {
                    b.style.borderBottom = '3px solid #2563eb';
                    b.style.color = '#2563eb';
                    b.style.fontWeight = '800';
                } else {
                    b.style.borderBottom = 'none';
                    b.style.color = '#64748b';
                    b.style.fontWeight = '600';
                }
            });

            // Alternar visibilidad de los paneles de contenido
            document.querySelectorAll('.crc-tab-content-pane').forEach(pane => {
                pane.style.display = pane.id === `tab-content-${tabName}` ? 'block' : 'none';
            });

            // Si se activa la pestaña de fichas de pozos, cargar datos actualizados
            if (tabName === 'wells') {
                loadWellProfiles();
            }
        });
    });

    // Rechazar Jornada
    document.getElementById('btn-reject-journey').addEventListener('click', async () => {
        if (!state.activeJourney) return;

        const { value: reason } = await Swal.fire({
            title: 'Rechazar Guardia',
            input: 'textarea',
            inputLabel: 'Indica el motivo del rechazo para que el técnico lo corrija:',
            inputPlaceholder: 'Ej: Caudales incorrectos en pozo CRC-BM-01...',
            inputAttributes: {
                'aria-label': 'Escribe el comentario de rechazo'
            },
            showCancelButton: true,
            confirmButtonText: 'Sí, rechazar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });

        if (reason === undefined) return; // Canceló

        if (reason.trim() === '') {
            Swal.fire('Comentario Obligatorio', 'Debes ingresar un motivo para rechazar la jornada.', 'warning');
            return;
        }

        const loader = document.getElementById('premium-loader');
        if (loader) loader.classList.remove('hidden');

        try {
            // Actualizar estado en Supabase
            const { error: journeyError } = await supabase
                .from('field_journeys')
                .update({ status: 'rejected' })
                .eq('id', state.activeJourney.id);

            if (journeyError) throw journeyError;

            // Registrar en la bitácora
            await supabase.from('field_journey_review_log').insert({
                journey_id: state.activeJourney.id,
                reviewed_by: state.session?.user?.email || 'Administrador',
                decision: 'rejected',
                comments: reason,
                reviewed_at: new Date().toISOString()
            });

            Swal.fire('Guardia Rechazada', 'El reporte se ha marcado como rechazado y el técnico de campo podrá modificarlo.', 'info');
            
            // Ocultar detalle y recargar lista
            document.getElementById('panel-journey-detail').style.display = 'none';
            await fetchJourneysList();

            if (loader) loader.classList.add('hidden');

        } catch (err) {
            console.error('Error al rechazar jornada:', err);
            if (loader) loader.classList.add('hidden');
            Swal.fire('Error', 'No se pudo registrar la decisión en el servidor.', 'error');
        }
    });

    // Aprobar y Publicar Jornada
    document.getElementById('btn-publish-journey').addEventListener('click', async () => {
        if (!state.activeJourney || state.activeRecords.length === 0) return;

        const res = await Swal.fire({
            title: '¿Aprobar y Publicar?',
            text: 'La jornada se publicará en el consolidado general de producción y los parámetros se sincronizarán con los perfiles históricos de los pozos.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aprobar y publicar',
            cancelButtonText: 'Cancelar'
        });

        if (!res.isConfirmed) return;

        const loader = document.getElementById('premium-loader');
        if (loader) loader.classList.remove('hidden');

        try {
            // Sincronizar y publicar utilizando el servicio global de la plataforma
            await publishAdminFieldJourneyToDashboard(state.activeJourney.id, state.activeRecords, state.session);

            Swal.fire('¡Jornada Publicada!', 'La jornada fue aprobada con éxito. Se consolidaron los volúmenes y se actualizaron los parámetros de pozos.', 'success');
            
            // Ocultar detalle y recargar lista
            document.getElementById('panel-journey-detail').style.display = 'none';
            await fetchJourneysList();

            if (loader) loader.classList.add('hidden');

        } catch (err) {
            console.error('Error al publicar jornada:', err);
            if (loader) loader.classList.add('hidden');
            Swal.fire('Error de Publicación', err.message || 'No se pudo publicar la jornada en el panel general.', 'error');
        }
    });

    // Logout
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', async () => {
        const res = await Swal.fire({
            title: '¿Cerrar Sesión?',
            text: 'Saldrás del panel administrativo.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, salir',
            cancelButtonText: 'Cancelar'
        });

        if (res.isConfirmed) {
            await logout();
            window.location.href = '../index.html';
        }
    });
}

// Handler global para la descarga temporal y segura de archivos de soporte
window.downloadCrcDoc = async function(filePath, customName = '') {
    if (!filePath) return;
    try {
        Swal.fire({
            title: 'Descargando documento...',
            html: '<p style="color:#64748b;">Preparando archivo con nombre técnico seguro...</p>',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const rawBase = String(filePath).split('/').pop() || '';
        const cleanSegment = rawBase.replace(/^[a-f0-9-]{36}_?/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
        const ext = filePath.split('.').pop() || 'file';
        const cleanFileName = customName || (cleanSegment.length > 3 ? cleanSegment.toUpperCase() : `DOCUMENTO_SOPORTE_CCRC_${new Date().toISOString().slice(0, 10)}.${ext}`);

        const downloadUrl = await getDocumentDownloadUrl(filePath, 3600, cleanFileName);
        
        if (downloadUrl && downloadUrl !== '#') {
            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = cleanFileName.endsWith(`.${ext}`) ? cleanFileName : `${cleanFileName}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(blobUrl);
            Swal.close();
        } else {
            Swal.close();
            Swal.fire('Error', 'No se pudo generar el enlace del archivo.', 'error');
        }
    } catch (e) {
        console.error('Error descargando archivo:', e);
        Swal.close();
        Swal.fire('Error', 'Ocurrió un error inesperado al descargar el archivo.', 'error');
    }
};

// Función asíncrona para cargar dinámicamente las fichas técnicas y el monitoreo de pozos
async function loadWellProfiles() {
    const gridBM = document.getElementById('grid-wells-bm');
    const gridBCP = document.getElementById('grid-wells-bcp');

    if (!gridBM || !gridBCP) return;

    gridBM.innerHTML = `
        <div style="grid-column:1/-1; padding:32px; text-align:center; color:var(--text-light);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem; margin-bottom:10px; display:block; color:#2563eb;"></i>
            Cargando fichas de Bombeo Mecánico...
        </div>
    `;
    gridBCP.innerHTML = `
        <div style="grid-column:1/-1; padding:32px; text-align:center; color:var(--text-light);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem; margin-bottom:10px; display:block; color:#0d9488;"></i>
            Cargando fichas de Cavidades Progresivas...
        </div>
    `;

    try {
        // 1. Obtener catálogo de pozos activos del contrato CRC
        const { data: wells, error: wellsErr } = await supabase
            .from('field_wells')
            .select('*')
            .eq('operational_scope', 'crc_ll')
            .eq('active', true)
            .order('pozo_name', { ascending: true });

        if (wellsErr) throw wellsErr;

        if (!wells || wells.length === 0) {
            gridBM.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:#64748b; font-style:italic;">No hay pozos BM en catálogo.</div>`;
            gridBCP.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:#64748b; font-style:italic;">No hay pozos BCP en catálogo.</div>`;
            return;
        }

        // 2. Obtener todos los registros del contrato CRC ordenados cronológicamente
        const { data: records, error: recsErr } = await supabase
            .from('field_journey_records')
            .select('*')
            .eq('operational_scope', 'crc_ll')
            .order('fecha', { ascending: false })
            .order('hora', { ascending: false });

        if (recsErr) throw recsErr;

        // 3. Obtener el listado de documentos del contrato CRC LL
        const { data: documents, error: docsErr } = await supabase
            .from('well_historical_documents')
            .select('*')
            .eq('operational_scope', 'crc_ll')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (docsErr) throw docsErr;

        // Construir mapas para acceso O(1) rápido
        const latestRecordMap = new Map();
        if (records) {
            records.forEach(rec => {
                const pUpper = String(rec.pozo || '').toUpperCase();
                if (!latestRecordMap.has(pUpper)) {
                    latestRecordMap.set(pUpper, rec);
                }
            });
        }

        const documentsMap = new Map();
        if (documents) {
            documents.forEach(doc => {
                const pUpper = String(doc.pozo_name || '').toUpperCase();
                if (!documentsMap.has(pUpper)) {
                    documentsMap.set(pUpper, []);
                }
                if (documentsMap.get(pUpper).length < 3) { // Mostrar sólo los 3 más recientes
                    documentsMap.get(pUpper).push(doc);
                }
            });
        }

        let bmHtml = '';
        let bcpHtml = '';

        wells.forEach(well => {
            const pUpper = String(well.pozo_name || '').toUpperCase();
            const lastRec = latestRecordMap.get(pUpper);
            const wellDocs = documentsMap.get(pUpper) || [];

            const method = well.lift_method || 'BM';
            const methodColor = method === 'BM' ? '#2563eb' : '#0d9488';

            const payload = lastRec?.raw_payload || {};
            const thp = lastRec?.thp_psi !== null && lastRec?.thp_psi !== undefined ? `${lastRec.thp_psi} PSI` : 'N/D';
            const chp = lastRec?.chp_psi !== null && lastRec?.chp_psi !== undefined ? `${lastRec.chp_psi} PSI` : 'N/D';
            const bruta = lastRec?.bruta !== null && lastRec?.bruta !== undefined ? `${lastRec.bruta.toFixed(1)} BBPD` : 'N/D';
            const neta = lastRec?.neta !== null && lastRec?.neta !== undefined ? `${lastRec.neta.toFixed(1)} BNPD` : 'N/D';
            
            let aysStr = 'N/D';
            let aysVal = 0;
            if (lastRec?.ays_percentage !== null && lastRec?.ays_percentage !== undefined) {
                aysVal = lastRec.ays_percentage;
                aysStr = `${aysVal.toFixed(2)} %`;
            }

            let aysBadgeColor = 'background:#f1f5f9; color:#475569; border: 1px solid #cbd5e1;';
            if (aysStr !== 'N/D') {
                aysBadgeColor = aysVal > 80
                    ? 'background:#fef2f2; color:#ef4444; border: 1px solid #fee2e2;'
                    : 'background:#ecfdf5; color:#10b981; border: 1px solid #d1fae5;';
            }

            let docsListHtml = '';
            if (wellDocs.length > 0) {
                docsListHtml = wellDocs.map(doc => `
                    <div style="margin-top: 5px; display:flex; align-items:center; gap:6px; font-size:0.75rem; overflow:hidden; text-overflow:ellipsis;">
                        <i class="fa-solid fa-file-pdf" style="color:#ef4444; flex-shrink:0;"></i>
                        <a href="javascript:void(0)" onclick="downloadCrcDoc('${doc.file_path}')" style="color:#2563eb; text-decoration:none; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${doc.nombre_archivo}">
                            ${doc.nombre_archivo}
                        </a>
                    </div>
                `).join('');
            } else {
                docsListHtml = `<span style="font-size:0.72rem; color:#94a3b8; font-style:italic;">Sin reportes cargados</span>`;
            }

            let techHtml = '';
            if (method === 'BM') {
                techHtml = `
                    <div style="font-size:0.76rem; display:grid; grid-template-columns: 1fr 1fr; gap:6px; padding:8px 10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; color:var(--text-main);">
                        <div><span style="color:#64748b;">Marca UB:</span> <strong>${payload.bm_marca || '-'}</strong></div>
                        <div><span style="color:#64748b;">SPM / Frec:</span> <strong>${payload.bm_spm || '-'}</strong></div>
                        <div><span style="color:#64748b;">Modelo UB:</span> <strong>${payload.bm_modelo || '-'}</strong></div>
                        <div><span style="color:#64748b;">Recorrido:</span> <strong>${payload.bm_recorrido ? payload.bm_recorrido + ' IN' : '-'}</strong></div>
                        <div><span style="color:#64748b;">Tiro:</span> <strong>${payload.bm_tiro || '-'}</strong></div>
                        <div><span style="color:#64748b;">Estado:</span> <strong>${payload.bm_estado_unidad || '-'}</strong></div>
                    </div>
                `;
            } else {
                techHtml = `
                    <div style="font-size:0.76rem; display:grid; grid-template-columns: 1fr 1fr; gap:6px; padding:8px 10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; color:var(--text-main);">
                        <div><span style="color:#64748b;">RPM:</span> <strong>${payload.bcp_rpm || '-'}</strong></div>
                        <div><span style="color:#64748b;">Stuffing:</span> <strong>${payload.bcp_stuffing || '-'}</strong></div>
                        <div><span style="color:#64748b;">Torque:</span> <strong>${payload.bcp_torque ? payload.bcp_torque + ' LBF' : '-'}</strong></div>
                        <div><span style="color:#64748b;">Amperaje:</span> <strong>${payload.bcp_amperaje ? payload.bcp_amperaje + ' A' : '-'}</strong></div>
                        <div style="grid-column:1/-1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span style="color:#64748b;">Cabezal:</span> <strong>${payload.bcp_modelo_cabezal || '-'}</strong></div>
                    </div>
                `;
            }

            const wellCard = `
                <div class="crc-well-card" style="background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; padding:18px; box-shadow:0 4px 15px rgba(0,0,0,0.02); display:flex; flex-direction:column; gap:12px;">
                    <!-- Cabecera de la Tarjeta -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom:8px;">
                        <h4 style="margin:0; font-size:1.02rem; font-weight:800; color:#0f172a; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-circle" style="font-size:0.58rem; color:${lastRec ? '#10b981' : '#cbd5e1'};"></i>
                            ${well.pozo_name}
                        </h4>
                        <span style="font-size:0.7rem; font-weight:800; color:#ffffff; background:${methodColor}; padding:3px 8px; border-radius:6px;">
                            ${method}
                        </span>
                    </div>

                    <!-- Cuadrícula de Caudales -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; text-align:center;">
                        <div style="background:#f8fafc; padding:6px; border-radius:8px; border:1px solid #f1f5f9;">
                            <span style="font-size:0.68rem; color:#64748b; display:block;">Bruta</span>
                            <strong style="font-size:0.83rem; color:#0f172a; font-weight:700;">${bruta}</strong>
                        </div>
                        <div style="background:#f8fafc; padding:6px; border-radius:8px; border:1px solid #f1f5f9;">
                            <span style="font-size:0.68rem; color:#64748b; display:block;">Neta</span>
                            <strong style="font-size:0.83rem; color:#0f172a; font-weight:700;">${neta}</strong>
                        </div>
                        <div style="${aysBadgeColor} padding:6px; border-radius:8px;">
                            <span style="font-size:0.68rem; display:block; opacity:0.85;">%AyS</span>
                            <strong style="font-size:0.83rem; font-weight:800;">${aysStr}</strong>
                        </div>
                    </div>

                    <!-- Presiones THP / CHP -->
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; border-top:1px dashed #e2e8f0; border-bottom:1px dashed #e2e8f0; padding:6px 0; color:var(--text-main);">
                        <div><i class="fa-solid fa-gauge" style="color:#64748b; margin-right:4px;"></i> Presión THP: <strong>${thp}</strong></div>
                        <div>Presión CHP: <strong>${chp}</strong></div>
                    </div>

                    <!-- Parámetros del Método -->
                    ${techHtml}

                    <!-- Documentos / Evidencias -->
                    <div style="border-top:1px solid #f1f5f9; padding-top:8px;">
                        <span style="font-size:0.7rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:4px;">Reportes de Campo Recientes</span>
                        ${docsListHtml}
                    </div>
                </div>
            `;

            if (method === 'BM') {
                bmHtml += wellCard;
            } else {
                bcpHtml += wellCard;
            }
        });

        gridBM.innerHTML = bmHtml || `<div style="grid-column:1/-1; padding:16px; color:#64748b; font-style:italic;">No hay pozos BM registrados.</div>`;
        gridBCP.innerHTML = bcpHtml || `<div style="grid-column:1/-1; padding:16px; color:#64748b; font-style:italic;">No hay pozos BCP registrados.</div>`;

    } catch (err) {
        console.error('Error cargando fichas de monitoreo:', err);
        gridBM.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:#ef4444; text-align:center;">No se pudieron cargar las fichas.</div>`;
        gridBCP.innerHTML = `<div style="grid-column:1/-1; padding:16px; color:#ef4444; text-align:center;">No se pudieron cargar las fichas.</div>`;
    }
}

export function destroyCrcAdmin() {
    console.log('[CrcAdmin] Destruyendo bandeja y limpiando recursos...');
    state.session = null;
    state.accessProfile = null;
    state.journeys = [];
    state.activeJourney = null;
    state.activeRecords = [];
}
