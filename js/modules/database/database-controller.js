/**
 * ==============================================================================
 * CONTROLADOR PRINCIPAL DEL MÓDULO BASE DE DATOS & EXPEDIENTES DIGITALES POR POZO
 * UV SERVICIOS - LÓGICA MODULAR ES6+
 * ==============================================================================
 * Maneja la navegación por niveles (Pozos -> Carpetas -> Archivos), la seguridad por PIN,
 * los filtros en tiempo real y la subida/descarga de archivos con Supabase Storage.
 */

import { supabase } from '../../supabaseClient.js';
import { getSession, logout, applyNavigationAccessProfile, getAccessProfile } from '../../auth.js';
import { getUniquePozos } from '../../services/monitoring-service.js';
import { getFieldWellsByScope, normalizeOperationalScope } from '../../services/operational-contracts-service.js';
import { initOperationalScopeContext, renderOperationalScopeSwitcher } from '../../services/operational-scope-context.js';
import {
    getWellDocuments,
    getWellDocumentSummaryCounts,
    uploadWellDocument,
    getDocumentDownloadUrl,
    deleteWellDocument,
    updateWellDocumentMetadata,
    createFolder,
    getFolders,
    deleteFolder,
    getFolderById
} from '../../services/well-documents-service.js';

// PIN de Seguridad por defecto (Configurable)
const PIN_SECURITY_KEY = '4826';
const PIN_SESSION_STORAGE_KEY = 'uv_db_pin_verified';

// Definición de las 4 categorías temáticas oficiales por pozo
const DOCUMENT_CATEGORIES = [
    {
        key: 'SIMULACIONES',
        name: 'SIMULACIONES',
        icon: 'fa-solid fa-chart-line',
        cssClass: 'folder-simulaciones',
        description: 'Modelados de rendimiento, curvas IP y simulaciones BES.'
    },
    {
        key: 'INFORMES_TECNICOS',
        name: 'INFORMES TÉCNICOS',
        icon: 'fa-solid fa-file-contract',
        cssClass: 'folder-informes',
        description: 'Reportes de campo, evaluaciones técnicas y diagnósticos.'
    },
    {
        key: 'PRUEBAS_PRODUCCION',
        name: 'PRUEBAS DE PRODUCCIÓN',
        icon: 'fa-solid fa-gauge-high',
        cssClass: 'folder-pruebas',
        description: 'Pruebas de pozo, mediciones de caudal y registros de presión.'
    },
    {
        key: 'FICHAS_BES',
        name: 'FICHAS TÉCNICAS BES',
        icon: 'fa-solid fa-gears',
        cssClass: 'folder-fichas',
        description: 'Fichas de equipos de fondo, motor, bomba, cable y VSD.'
    },
    {
        key: 'REGISTROS_ECHOMETER',
        name: 'REGISTROS ECHOMETER (TAM)',
        icon: 'fa-solid fa-chart-area',
        cssClass: 'folder-echometer',
        description: 'Mediciones de nivel de fluido, disparos acústicos y archivos Echometer (.028, .019, .twm).'
    },
    {
        key: 'DATA_SENSOR_FONDO',
        name: 'DATA SENSOR DE FONDO',
        icon: 'fa-solid fa-microchip',
        cssClass: 'folder-sensor',
        description: 'Registros y descargas de datos de sensor de fondo (.dat, .raw, .zip, .txt).'
    },
    {
        key: 'VOLCADOS_VSD',
        name: 'DESCARGA DE DATA VSD',
        icon: 'fa-solid fa-bolt',
        cssClass: 'folder-vsd',
        description: 'Registros de memoria, descargas de data de variador (.dat, .raw, .zip) y parámetros de frecuencia.'
    },
    {
        key: 'SOPORTES',
        name: 'SOPORTES DE CAMPO',
        icon: 'fa-solid fa-camera',
        cssClass: 'folder-soportes',
        description: 'Evidencias fotográficas y soportes visuales capturados en campo (máx 20 por turno).'
    }
];

// Estado global de navegación del módulo
const state = {
    userSession: null,
    isPinVerified: false,
    operationalScopeContext: null,
    activeOperationalScope: 'ceiba_tomoporo',
    pozosList: [],
    summaryCounts: {},
    activePozo: null,
    activeCategory: null,
    activeFolderId: null,
    currentFolderPath: [],
    activeDocuments: [],
    currentFolders: [],
    currentAllDocs: [],
    currentSubfolders: []
};

/**
 * Inicialización principal al cargar el documento HTML.
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Verificar si la sesión ya fue validada con PIN en index.html
        const isPinVerified = sessionStorage.getItem(PIN_SESSION_STORAGE_KEY) === 'true';
        if (!isPinVerified) {
            // Redirigir a inicio de sesión si no se ha validado el PIN
            window.location.href = 'index.html';
            return;
        }
        state.isPinVerified = true;

        // 2. Cargar perfil de usuario
        state.userSession = await getSession();
        if (state.userSession) {
            const accessProfile = getAccessProfile(state.userSession);
            applyNavigationAccessProfile(accessProfile);
            state.operationalScopeContext = await initOperationalScopeContext(state.userSession, accessProfile);
            state.activeOperationalScope = normalizeOperationalScope(state.operationalScopeContext.activeScope);
            renderOperationalScopeSwitcher(document.getElementById('database-operational-scope-switcher'), state.operationalScopeContext, {
                onChange: () => window.location.reload()
            });
        }

        // 3. Inicializar navegación instantánea y carga en segundo plano
        loadDatabaseModule();

        // 4. Inicializar eventos del modal de carga de archivos (Upload)
        initUploadModal();

        // 5. Inicializar eventos del buscador, filtros y botones Volver
        initFiltersEvents();

        // 5b. Inicializar eventos de creación de carpetas
        initFolderEvents();

        // 6. Inicializar sistema de advertencia por inactividad (5 min + reloj)
        initInactivityTimer();

        // 7. Vincular botón de Cerrar Sesión
        document.getElementById('logout-btn')?.addEventListener('click', async () => {
            sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
            await logout();
        });

        // Ocultar el loader inicial con animación suave
        setTimeout(() => {
            const loader = document.getElementById('premium-loader');
            if (loader) loader.classList.add('hidden');
        }, 1000);

    } catch (err) {
        console.error('[database-controller] Error en inicialización del módulo:', err);
    }
});

/* ==============================================================================
 * 1. CARGA PRINCIPAL DE DATOS DEL MÓDULO (INSTANTÁNEA)
 * ============================================================================== */

/**
 * Carga la lista de pozos inmediatamente y consulta los contadores en segundo plano.
 */
async function loadDatabaseModule() {
    try {
        // Cargar pozos desde el catálogo del contrato activo. Si el catálogo no responde,
        // se conserva el fallback legacy para no bloquear la consulta de expedientes.
        let rawPozos = [];
        try {
            const scopedWells = await getFieldWellsByScope(state.activeOperationalScope);
            rawPozos = (scopedWells || []).map(well => well.pozo_name);
        } catch (scopeError) {
            console.warn('[database-controller] No se pudo cargar catálogo por contrato, usando pozos globales:', scopeError);
            rawPozos = await getUniquePozos();
        }

        state.pozosList = (rawPozos || [])
            .map(p => String(p || '').trim().toUpperCase())
            .filter(Boolean)
            .sort();

        // Poblar el selector de pozos en el modal de Cargar Documento
        populateUploadWellSelect();

        // Renderizar la vista de Pozos (Nivel 1) de forma instantánea
        renderWellsView();

        // Cargar contadores de documentos en segundo plano para no bloquear la pantalla
        getWellDocumentSummaryCounts({ operationalScope: state.activeOperationalScope }).then(counts => {
            state.summaryCounts = filterSummaryCountsByActivePozos(counts || {});
            updateWellBadgesLive();
        }).catch(err => console.warn('Error cargando conteos en segundo plano:', err));

    } catch (err) {
        console.error('[database-controller] Error cargando datos del módulo:', err);
    }
}

function filterSummaryCountsByActivePozos(counts = {}) {
    const allowedPozos = new Set(state.pozosList);
    return Object.fromEntries(Object.entries(counts).filter(([pozo]) => allowedPozos.has(String(pozo || '').trim().toUpperCase())));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCleanDocumentDescription(description = '') {
    return String(description || '').trim().replace(/^\[JORNADA_ID:[^\]]+\]\s*/i, '').trim();
}

function isGenericFieldSupportDescription(description = '') {
    const normalized = String(description || '').trim().toLowerCase();
    return !normalized
        || normalized === 'soporte de campo'
        || normalized === 'archivo de campo'
        || normalized.includes('adjunto enviado desde captura');
}

function renderDocumentDescription(doc = {}) {
    const rawDescription = String(doc.descripcion || '').trim();
    const isJourneyDocument = /^\[JORNADA_ID:[^\]]+\]/i.test(rawDescription);
    const cleanDescription = getCleanDocumentDescription(rawDescription);

    if (!isJourneyDocument) {
        return cleanDescription ? escapeHtml(cleanDescription) : '--';
    }

    const uploadDate = doc.created_at
        ? new Date(doc.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'fecha no registrada';

    const category = String(doc.categoria || '').trim().toUpperCase();
    let defaultText = 'Soporte de archivo enviado desde Campo.';
    if (category === 'SOPORTES') {
        defaultText = 'Soporte fotográfico enviado desde Campo.';
    } else if (category === 'REGISTROS_ECHOMETER') {
        defaultText = 'Registro Echometer (TAM) enviado desde Campo.';
    } else if (category === 'DATA_SENSOR_FONDO') {
        defaultText = 'Registro de Sensor de Fondo enviado desde Campo.';
    } else if (category === 'VOLCADOS_VSD') {
        defaultText = 'Descarga de Variador VSD enviado desde Campo.';
    }

    const detailText = isGenericFieldSupportDescription(cleanDescription)
        ? defaultText
        : cleanDescription;

    return `
        <div class="database-document-note">
            <span>Jornada de campo</span>
            <strong>${escapeHtml(uploadDate)} · ${escapeHtml(doc.pozo_name || state.activePozo || 'Pozo')}</strong>
            <p>${escapeHtml(detailText)}</p>
        </div>
    `;
}

/**
 * Actualiza en tiempo real las insignias de conteo de documentos en cada tarjeta de pozo.
 */
function updateWellBadgesLive() {
    state.pozosList.forEach(pozo => {
        const counts = state.summaryCounts[pozo] || { total: 0 };
        const card = document.querySelector(`.well-card[data-pozo="${pozo}"] .well-card-badge`);
        if (card) {
            card.textContent = `${counts.total} doc${counts.total === 1 ? '' : 's'}`;
        }
    });
}

/**
 * Pobla el selector desplegable de pozos dentro del modal de subida de archivos.
 */
function populateUploadWellSelect() {
    const select = document.getElementById('upload-pozo-select');
    if (!select) return;

    select.innerHTML = '<option value="">Selecciona Pozo...</option>' + 
        state.pozosList.map(pozo => `<option value="${pozo}">${pozo}</option>`).join('');
}

/* ==============================================================================
 * 3. RENDERIZADO DE NIVELES (NIVEL 1: POZOS, NIVEL 2: CARPETAS, NIVEL 3: ARCHIVOS)
 * ============================================================================== */

/**
 * RENDERIZA NIVEL 1: Rejilla de tarjetas de pozos.
 * @param {string} [filterText] - Texto opcional para buscar pozos por nombre.
 */
function renderWellsView(filterText = '') {
    state.activePozo = null;
    state.activeCategory = null;

    document.getElementById('view-wells-container').hidden = false;
    document.getElementById('view-folders-container').hidden = true;
    document.getElementById('view-files-container').hidden = true;

    updateBreadcrumb();

    const grid = document.getElementById('wells-grid');
    const badge = document.getElementById('wells-count-badge');
    const searchInput = document.getElementById('well-search-input');
    if (!grid) return;

    const term = String(filterText || searchInput?.value || '').trim().toLowerCase();
    const filteredPozos = term 
        ? state.pozosList.filter(p => p.toLowerCase().includes(term))
        : state.pozosList;

    if (badge) {
        badge.textContent = term 
            ? `${filteredPozos.length} de ${state.pozosList.length} pozos`
            : `${state.pozosList.length} pozo${state.pozosList.length === 1 ? '' : 's'} disponible${state.pozosList.length === 1 ? '' : 's'}`;
    }

    if (filteredPozos.length === 0) {
        grid.innerHTML = `
            <div class="empty-panel" style="grid-column: 1 / -1; padding:32px; text-align:center;">
                <i class="fa-solid fa-magnifying-glass" style="font-size:2.2rem; color:#94a3b8; margin-bottom:10px;"></i>
                <strong style="display:block; font-size:1.05rem; color:#0f172a;">No se encontró ningún pozo con "${term}"</strong>
                <span style="color:#64748b; font-size:0.88rem;">Intenta con otro término de búsqueda (ej: CEI0003, TOM0010).</span>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredPozos.map(pozo => {
        const counts = state.summaryCounts[pozo] || { total: 0 };
        const totalDocs = counts.total || 0;
        return `
            <div class="well-card" data-pozo="${pozo}">
                <div class="well-card-top">
                    <div class="well-card-icon">
                        <i class="fa-solid fa-oil-well"></i>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="well-card-badge">${totalDocs} doc${totalDocs === 1 ? '' : 's'}</span>
                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV" class="card-uv-mini-logo">
                    </div>
                </div>
                <h3 class="well-card-title">${pozo}</h3>
                <div class="well-card-action">
                    <span>Dossier Técnico</span>
                    <strong>Abrir carpetas <i class="fa-solid fa-chevron-right"></i></strong>
                </div>
            </div>
        `;
    }).join('');

    // Eventos de clic en cada tarjeta de pozo
    grid.querySelectorAll('.well-card').forEach(card => {
        card.addEventListener('click', () => {
            const pozoName = card.dataset.pozo;
            openFoldersView(pozoName);
        });
    });
}

/**
 * Rellena las carpetas por defecto del sistema para un pozo si no existen aún.
 */
async function ensureDefaultFoldersExist(pozoName) {
    const cleanPozo = String(pozoName).trim().toUpperCase();
    const cleanScope = state.activeOperationalScope;
    
    try {
        const { data: existingFolders, error } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', cleanPozo)
            .is('parent_id', null);
            
        if (error) throw error;
        
        const existingNames = new Set((existingFolders || []).map(f => f.name.toUpperCase()));
        const foldersToCreate = [];
        
        DOCUMENT_CATEGORIES.forEach(cat => {
            if (!existingNames.has(cat.name.toUpperCase())) {
                foldersToCreate.push({
                    operational_scope: cleanScope,
                    pozo_name: cleanPozo,
                    parent_id: null,
                    name: cat.name
                });
            }
        });
        
        if (foldersToCreate.length > 0) {
            const { error: insertError } = await supabase
                .from('well_document_folders')
                .insert(foldersToCreate);
            if (insertError) throw insertError;
        }
    } catch (e) {
        console.error('[database-controller] Error en ensureDefaultFoldersExist:', e);
    }
}

/**
 * Mapea el nombre de una carpeta con la configuración visual (color, icono) de categorías.
 */
function getFolderConfig(folder) {
    const name = folder.name;
    const matched = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === name.toUpperCase());
    if (matched) return matched;
    return {
        key: name,
        name: name,
        icon: folder.icon || 'fa-solid fa-folder-closed',
        cssClass: 'folder-custom',
        description: folder.description || 'Carpeta personalizada de expedientes.'
    };
}

/**
 * Elimina una carpeta dinámica desde la rejilla visual.
 */
window.handleDeleteFolderClick = async function(folderId, folderName) {
    const result = await Swal.fire({
        title: '¿Eliminar Carpeta?',
        text: `¿Estás seguro de eliminar la carpeta "${folderName}"? Esta acción borrará permanentemente la carpeta, todas sus subcarpetas y toda la metadata de los archivos asociados.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });
    
    if (result.isConfirmed) {
        try {
            await deleteFolder(folderId);
            showSuccessToast('¡Carpeta Eliminada!', `La carpeta "${folderName}" y su contenido fueron borrados.`);
            
            // Recargar la vista según dónde se encuentre el usuario
            if (state.activeFolderId === folderId) {
                if (state.activePozo) openFoldersView(state.activePozo);
                else renderWellsView();
            } else if (state.activeFolderId) {
                openFolderView(state.activeFolderId, state.currentFolderPath[state.currentFolderPath.length - 1].name);
            } else if (state.activePozo) {
                openFoldersView(state.activePozo);
            }
        } catch (e) {
            Swal.fire('Error', 'No se pudo eliminar la carpeta: ' + e.message, 'error');
        }
    }
};

/**
 * RENDERIZA NIVEL 2: Vista de Carpetas temáticas y personalizadas por Pozo.
 * @param {string} pozoName - Nombre del pozo seleccionado.
 */
/**
 * RENDERIZA NIVEL 2: Vista de Carpetas temáticas y personalizadas por Pozo.
 * @param {string} pozoName - Nombre del pozo seleccionado.
 */
async function openFoldersView(pozoName) {
    state.activePozo = pozoName;
    state.activeCategory = null;
    state.activeFolderId = null;
    state.currentFolderPath = [{ id: null, name: pozoName }];

    document.getElementById('view-wells-container').hidden = true;
    document.getElementById('view-folders-container').hidden = false;
    document.getElementById('view-files-container').hidden = true;

    // Ocultar la sección de archivos coincidentes por defecto
    const filesResultsContainer = document.getElementById('folders-search-files-results');
    if (filesResultsContainer) filesResultsContainer.style.display = 'none';

    // Mostrar el botón de Nueva Carpeta
    const btnCreateFolder = document.getElementById('btn-create-folder');
    if (btnCreateFolder) btnCreateFolder.style.display = 'inline-flex';

    updateBreadcrumb();

    const titleEl = document.getElementById('folder-well-title');
    if (titleEl) titleEl.textContent = `Expediente del Pozo ${pozoName}`;

    const grid = document.getElementById('folders-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="text-align:center; padding:32px; grid-column:span 4; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando expedientes...</div>';

    try {
        await ensureDefaultFoldersExist(pozoName);
        const folders = await getFolders({
            pozoName,
            parentId: null,
            operationalScope: state.activeOperationalScope
        });

        // Cargar todos los documentos de este pozo para calcular los contadores
        const allDocs = await getWellDocuments({
            pozoName,
            operationalScope: state.activeOperationalScope
        });

        state.currentFolders = folders;
        state.currentAllDocs = allDocs;

        // Leer valor del buscador si ya hay algo
        const searchInput = document.getElementById('db-search-input');
        const term = searchInput ? searchInput.value : '';
        renderFoldersGrid(term);

    } catch (err) {
        console.error('[database-controller] Error cargando vista de carpetas:', err);
        grid.innerHTML = `<div style="text-align:center; padding:20px; grid-column:span 4; color:#ef4444;"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
    }
}

/**
 * Renderiza la rejilla de carpetas del pozo actual aplicando filtros de búsqueda en tiempo real.
 */
function renderFoldersGrid(searchTerm = '') {
    const grid = document.getElementById('folders-grid');
    if (!grid) return;

    const term = String(searchTerm || '').trim().toLowerCase();
    const filteredFolders = term
        ? state.currentFolders.filter(folder => 
            folder.name.toLowerCase().includes(term) || 
            (folder.description && folder.description.toLowerCase().includes(term))
          )
        : state.currentFolders;

    if (filteredFolders.length === 0) {
        grid.innerHTML = `
            <div class="empty-panel" style="grid-column:1 / -1; padding:32px; text-align:center;">
                <i class="fa-regular fa-folder" style="font-size:2.2rem; color:#94a3b8; margin-bottom:10px;"></i>
                <strong style="display:block; font-size:1.05rem; color:#0f172a;">No se encontraron carpetas coincidentes</strong>
                <span style="color:#64748b; font-size:0.88rem;">Intenta con otro término de búsqueda.</span>
            </div>
        `;
    } else {
        grid.innerHTML = filteredFolders.map(folder => {
            const config = getFolderConfig(folder);
            const isDefault = DOCUMENT_CATEGORIES.some(c => c.name.toUpperCase() === folder.name.toUpperCase());
            
            let count = 0;
            if (isDefault) {
                const matchedCategory = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === folder.name.toUpperCase());
                count = state.currentAllDocs.filter(d => d.folder_id === folder.id || (d.folder_id === null && d.categoria === matchedCategory.key)).length;
            } else {
                count = state.currentAllDocs.filter(d => d.folder_id === folder.id).length;
            }

            return `
                <div class="folder-card ${config.cssClass}" data-folder-id="${folder.id}" data-folder-name="${escapeHtml(folder.name)}">
                    <div class="folder-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="folder-card-icon">
                            <i class="${config.icon}"></i>
                        </div>
                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV" class="card-uv-mini-logo" style="margin-left:auto;">
                        ${!isDefault ? `
                        <button type="button" class="btn-delete-folder" onclick="event.stopPropagation(); handleDeleteFolderClick('${folder.id}', '${escapeHtml(folder.name)}')" title="Eliminar Carpeta" style="background:none; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer; margin-left:10px; display:flex; align-items:center;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        ` : ''}
                    </div>
                    <h3 class="folder-card-title" style="margin-top:14px;">${escapeHtml(folder.name)}</h3>
                    <p class="folder-card-desc">${escapeHtml(config.description)}</p>
                    <div class="folder-card-footer">
                        <span class="folder-card-count"><strong>${count}</strong> archivo${count === 1 ? '' : 's'}</span>
                        <strong style="color:#1d4ed8; font-weight:700;">Ver archivos <i class="fa-solid fa-arrow-right"></i></strong>
                    </div>
                </div>
            `;
        }).join('');

        // Vincular eventos de clic
        grid.querySelectorAll('.folder-card').forEach(card => {
            card.addEventListener('click', () => {
                const folderId = card.dataset.folderId;
                const folderName = card.dataset.folderName;
                openFolderView(folderId, folderName);
            });
        });
    }

    // Buscar archivos coincidentes en este pozo en general
    const filesResultsContainer = document.getElementById('folders-search-files-results');
    const filesResultsGrid = document.getElementById('folders-search-files-grid');

    if (filesResultsContainer && filesResultsGrid) {
        const startDate = document.getElementById('db-start-date')?.value || null;
        const endDate = document.getElementById('db-end-date')?.value || null;

        if (term || startDate || endDate) {
            let filteredDocs = state.currentAllDocs || [];
            
            if (term) {
                filteredDocs = filteredDocs.filter(doc => 
                    (doc.nombre_archivo && doc.nombre_archivo.toLowerCase().includes(term)) ||
                    (doc.descripcion && doc.descripcion.toLowerCase().includes(term)) ||
                    (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(term))
                );
            }
            if (startDate) {
                filteredDocs = filteredDocs.filter(doc => doc.created_at && doc.created_at >= `${startDate}T00:00:00.000Z`);
            }
            if (endDate) {
                filteredDocs = filteredDocs.filter(doc => doc.created_at && doc.created_at <= `${endDate}T23:59:59.999Z`);
            }

            if (filteredDocs.length > 0) {
                filesResultsContainer.style.display = 'block';
                filesResultsGrid.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando enlaces de descarga...</div>';
                
                // Helper para formato de tamaño de archivo (bytes a MB/KB)
                const formatFileSize = (bytes) => {
                    const num = Number(bytes || 0);
                    if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
                    if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
                    return `${num} bytes`;
                };

                const getFileBadgeClass = (ext) => {
                    const clean = String(ext || '').toLowerCase();
                    if (clean === 'pdf') return 'doc-type-pdf';
                    if (['xlsx', 'xls', 'csv'].includes(clean)) return 'doc-type-xlsx';
                    if (['docx', 'doc'].includes(clean)) return 'doc-type-docx';
                    if (['png', 'jpg', 'jpeg', 'webp'].includes(clean)) return 'doc-type-img';
                    return 'doc-type-other';
                };

                // Cargar urls de descarga asíncronas
                Promise.all(filteredDocs.map(async (doc) => {
                    try {
                        const downloadUrl = await getDocumentDownloadUrl(doc.file_path);
                        return { ...doc, downloadUrl };
                    } catch {
                        return { ...doc, downloadUrl: '#' };
                    }
                })).then(docsWithUrls => {
                    filesResultsGrid.innerHTML = `
                        <table class="stats-table stats-table-enhanced" style="width:100%; border-collapse:collapse; margin:0;">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Nombre del Archivo</th>
                                    <th>Descripción</th>
                                    <th>Tamaño</th>
                                    <th>Subido por</th>
                                    <th>Fecha</th>
                                    <th style="text-align:right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${docsWithUrls.map(doc => {
                                    const badgeClass = getFileBadgeClass(doc.file_type);
                                    let docDate = '--';
                                    if (doc.fecha_documento) {
                                        const parts = doc.fecha_documento.split('-');
                                        docDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date(doc.fecha_documento).toLocaleDateString('es-ES');
                                    } else if (doc.created_at) {
                                        docDate = new Date(doc.created_at).toLocaleDateString('es-ES');
                                    }

                                    return `
                                        <tr>
                                            <td><span class="document-file-icon ${badgeClass}">${String(doc.file_type || 'DOC').toUpperCase().slice(0, 4)}</span></td>
                                            <td><strong style="color:#0f172a; font-size:0.88rem;">${escapeHtml(doc.nombre_archivo || 'Documento sin nombre')}</strong></td>
                                            <td style="color:#64748b; font-size:0.82rem; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(doc.descripcion || '')}">${escapeHtml(doc.descripcion || '--')}</td>
                                            <td><span class="stats-muted-cell">${formatFileSize(doc.file_size)}</span></td>
                                            <td><span class="stats-muted-cell">${escapeHtml(doc.uploaded_by || 'Sistema')}</span></td>
                                            <td><span class="stats-date-cell">${docDate}</span></td>
                                            <td style="text-align:right;">
                                                <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:6px;">
                                                    <button type="button" class="btn-preview-doc" data-url="${escapeHtml(doc.downloadUrl)}" data-name="${escapeHtml(doc.nombre_archivo || 'Documento')}" data-type="${escapeHtml(doc.file_type || '')}" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:0.75rem; font-weight:700; color:#334155;" title="Previsualizar">
                                                        <i class="fa-solid fa-eye"></i>
                                                    </button>
                                                    <a href="${escapeHtml(doc.downloadUrl)}" target="_blank" download style="padding:4px 8px; border-radius:6px; background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;" title="Descargar">
                                                        <i class="fa-solid fa-download"></i>
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `;

                    // Vincular eventos de previsualización
                    filesResultsGrid.querySelectorAll('.btn-preview-doc').forEach(btn => {
                        btn.addEventListener('click', () => {
                            openDocumentPreview(btn.dataset.url, btn.dataset.name, btn.dataset.type);
                        });
                    });
                });
            } else {
                filesResultsGrid.innerHTML = `
                    <div style="text-align:center; padding:20px; color:#64748b; font-size:0.85rem;">
                        <i class="fa-regular fa-file" style="margin-right:6px;"></i> No se encontraron documentos que coincidan con la búsqueda en este pozo.
                    </div>
                `;
                filesResultsContainer.style.display = 'block';
            }
        } else {
            filesResultsContainer.style.display = 'none';
            filesResultsGrid.innerHTML = '';
        }
    }
}

/**
 * Renderiza la rejilla de subcarpetas en tiempo real.
 */
function renderSubfoldersGrid(searchTerm = '') {
    const subGrid = document.getElementById('subfolders-grid');
    const subSection = document.getElementById('subfolders-section');
    if (!subGrid || !subSection) return;

    const term = String(searchTerm || '').trim().toLowerCase();
    const filtered = term
        ? state.currentSubfolders.filter(sub => 
            sub.name.toLowerCase().includes(term) ||
            (sub.description && sub.description.toLowerCase().includes(term))
          )
        : state.currentSubfolders;

    if (filtered.length > 0) {
        subSection.style.display = 'block';
        subGrid.innerHTML = filtered.map(sub => {
            return `
                <div class="folder-mini-card" data-folder-id="${sub.id}" data-folder-name="${escapeHtml(sub.name)}" title="${escapeHtml(sub.description || 'Sin descripción')}" style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:12px; background:#f8fafc; border:1px solid #e2e8f0; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <i class="${sub.icon || 'fa-solid fa-folder'}" style="color:#2563eb; font-size:1.15rem;"></i>
                    <span style="font-weight:700; color:#1e293b; font-size:0.88rem; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(sub.name)}</span>
                    <button onclick="event.stopPropagation(); handleDeleteFolderClick('${sub.id}', '${escapeHtml(sub.name)}')" style="background:none; border:none; color:#ef4444; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:4px;">
                        <i class="fa-solid fa-trash-can" style="font-size:0.85rem;"></i>
                    </button>
                </div>
            `;
        }).join('');

        subGrid.querySelectorAll('.folder-mini-card').forEach(card => {
            card.addEventListener('click', () => {
                openFolderView(card.dataset.folderId, card.dataset.folderName);
            });
        });
    } else {
        subSection.style.display = 'none';
        subGrid.innerHTML = '';
    }
}

/**
 * Realiza una búsqueda global inteligente en todos los documentos del contrato.
 * Detecta automáticamente si se menciona un pozo y filtra los documentos por pozo y palabra clave.
 */
async function triggerGlobalSearch(queryText = '') {
    const term = String(queryText || '').trim();
    const startDate = document.getElementById('db-start-date')?.value || null;
    const endDate = document.getElementById('db-end-date')?.value || null;

    const resultsContainer = document.getElementById('view-search-results-container');
    const gridResults = document.getElementById('search-results-table-grid');
    if (!resultsContainer || !gridResults) return;

    if (!term && !startDate && !endDate) {
        // Si no hay término, volver a la vista que corresponda
        resultsContainer.hidden = true;
        restoreActiveView();
        return;
    }

    // Ocultar las vistas normales y mostrar resultados globales
    document.getElementById('view-wells-container').hidden = true;
    document.getElementById('view-folders-container').hidden = true;
    document.getElementById('view-files-container').hidden = true;
    resultsContainer.hidden = false;

    gridResults.innerHTML = `
        <div style="text-align:center; padding:40px; color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem; color:#2563eb; margin-bottom:10px;"></i>
            <p style="font-weight:600; margin:0;">Buscando en todos los expedientes...</p>
        </div>
    `;

    try {
        // Analizar la consulta para extraer si mencionan algún pozo específico
        let targetPozo = 'TODOS';
        let searchKeyword = term;

        const words = term.toUpperCase().split(/\s+/);
        // Buscar si alguna palabra coincide con un pozo en state.pozosList
        for (const word of words) {
            const matched = state.pozosList.find(p => p.toUpperCase() === word);
            if (matched) {
                targetPozo = matched;
                // Remover el pozo del término de búsqueda
                searchKeyword = term.replace(new RegExp(word, 'gi'), '').trim();
                break;
            }
        }

        // Si no se extrajo ningún pozo pero ya estábamos dentro de un pozo, buscar en ese por defecto
        if (targetPozo === 'TODOS' && state.activePozo) {
            targetPozo = state.activePozo;
        }

        // Realizar consulta en Supabase
        let dbQuery = supabase
            .from('well_historical_documents')
            .select('*, well_document_folders(id, name)')
            .order('created_at', { ascending: false });

        if (state.activeOperationalScope) {
            dbQuery = dbQuery.or(`operational_scope.eq.${state.activeOperationalScope},operational_scope.is.null`);
        }

        if (targetPozo !== 'TODOS') {
            dbQuery = dbQuery.eq('pozo_name', targetPozo);
        }

        if (startDate) {
            dbQuery = dbQuery.gte('created_at', `${startDate}T00:00:00.000Z`);
        }
        if (endDate) {
            dbQuery = dbQuery.lte('created_at', `${endDate}T23:59:59.999Z`);
        }

        const { data, error } = await dbQuery;
        if (error) throw error;

        let results = data || [];

        // Filtrar localmente por palabra clave si queda algo después de quitar el pozo
        if (searchKeyword) {
            const kw = searchKeyword.toLowerCase();
            results = results.filter(doc => 
                (doc.nombre_archivo && doc.nombre_archivo.toLowerCase().includes(kw)) ||
                (doc.descripcion && doc.descripcion.toLowerCase().includes(kw)) ||
                (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(kw))
            );
        }

        if (results.length === 0) {
            gridResults.innerHTML = `
                <div class="empty-panel" style="padding:48px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size:2.5rem; color:#94a3b8; margin-bottom:12px;"></i>
                    <strong>No se encontraron documentos coincidentes</strong>
                    <span>Intenta con términos más simples (ej: "simulación", "ficha", "CEI0003").</span>
                </div>
            `;
            return;
        }

        // Cargar URLs de descarga temporales
        const docsWithUrls = await Promise.all(results.map(async (doc) => {
            try {
                const downloadUrl = await getDocumentDownloadUrl(doc.file_path);
                return { ...doc, downloadUrl };
            } catch {
                return { ...doc, downloadUrl: '#' };
            }
        }));

        // Helper para formato de tamaño de archivo (bytes a MB/KB)
        const formatFileSize = (bytes) => {
            const num = Number(bytes || 0);
            if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
            if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
            return `${num} bytes`;
        };

        const getFileBadgeClass = (ext) => {
            const clean = String(ext || '').toLowerCase();
            if (clean === 'pdf') return 'doc-type-pdf';
            if (['xlsx', 'xls', 'csv'].includes(clean)) return 'doc-type-xlsx';
            if (['docx', 'doc'].includes(clean)) return 'doc-type-docx';
            if (['png', 'jpg', 'jpeg', 'webp'].includes(clean)) return 'doc-type-img';
            return 'doc-type-other';
        };

        gridResults.innerHTML = `
            <div class="stats-table-wrap">
                <table class="stats-table stats-table-enhanced">
                    <thead>
                        <tr>
                            <th>Pozo</th>
                            <th>Ubicación / Carpeta</th>
                            <th>Archivo</th>
                            <th>Descripción / Nota</th>
                            <th>Tamaño</th>
                            <th>Fecha</th>
                            <th style="text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${docsWithUrls.map(doc => {
                            const badgeClass = getFileBadgeClass(doc.file_type);
                            const folderName = doc.well_document_folders?.name || doc.categoria || 'General';
                            const folderId = doc.well_document_folders?.id || null;
                            let docDate = '--';
                            if (doc.fecha_documento) {
                                const parts = doc.fecha_documento.split('-');
                                docDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date(doc.fecha_documento).toLocaleDateString('es-ES');
                            } else if (doc.created_at) {
                                docDate = new Date(doc.created_at).toLocaleDateString('es-ES');
                            }

                            return `
                                <tr>
                                    <td>
                                        <span style="font-weight:800; color:#1e40af; background:#eff6ff; padding:4px 8px; border-radius:6px; font-size:0.82rem; border:1px solid #bfdbfe;">
                                            <i class="fa-solid fa-oil-well" style="margin-right:4px;"></i> ${escapeHtml(doc.pozo_name)}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="font-weight:600; color:#475569; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                                            <i class="fa-solid fa-folder" style="color:#b4c6fc; font-size:0.95rem;"></i> ${escapeHtml(folderName)}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="document-file-icon ${badgeClass}" style="margin-bottom:4px; display:inline-block; font-size:0.68rem; padding:1px 5px;">
                                            ${String(doc.file_type || 'DOC').toUpperCase().slice(0, 4)}
                                        </span><br>
                                        <strong style="color:#0f172a; font-size:0.9rem;">${escapeHtml(doc.nombre_archivo || 'Sin nombre')}</strong>
                                    </td>
                                    <td style="color:#64748b; font-size:0.82rem; max-width:200px;" title="${escapeHtml(doc.descripcion || '')}">
                                        ${escapeHtml(doc.descripcion || '--')}
                                    </td>
                                    <td><span class="stats-muted-cell">${formatFileSize(doc.file_size)}</span></td>
                                    <td><span class="stats-date-cell">${docDate}</span></td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:6px;">
                                            <button type="button" class="btn-preview-doc" data-url="${escapeHtml(doc.downloadUrl)}" data-name="${escapeHtml(doc.nombre_archivo || 'Documento')}" data-type="${escapeHtml(doc.file_type || '')}" style="padding:5px 8px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:0.75rem; font-weight:700; color:#334155; display:inline-flex; align-items:center; gap:4px;" title="Ver Previsualización">
                                                <i class="fa-solid fa-eye"></i> <span>VER</span>
                                            </button>
                                            <a href="${escapeHtml(doc.downloadUrl)}" target="_blank" download style="padding:5px 8px; border-radius:6px; background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; justify-content:center; text-decoration:none; gap:4px;" title="Descargar">
                                                <i class="fa-solid fa-download"></i> <span>DESCARGAR</span>
                                            </a>
                                            ${folderId ? `
                                            <button type="button" class="btn-goto-folder" data-pozo="${escapeHtml(doc.pozo_name)}" data-folder-id="${folderId}" data-folder-name="${escapeHtml(folderName)}" style="padding:5px 8px; border-radius:6px; background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Ir a la carpeta de origen">
                                                <i class="fa-solid fa-arrow-right-to-bracket"></i> <span>IR A CARPETA</span>
                                            </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Eventos de previsualización
        gridResults.querySelectorAll('.btn-preview-doc').forEach(btn => {
            btn.addEventListener('click', () => {
                openDocumentPreview(btn.dataset.url, btn.dataset.name, btn.dataset.type);
            });
        });

        // Evento especial de "Ir a Carpeta"
        gridResults.querySelectorAll('.btn-goto-folder').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pozo = btn.dataset.pozo;
                const folderId = btn.dataset.folderId;
                const folderName = btn.dataset.folderName;

                // Limpiar el buscador general al navegar
                const searchInput = document.getElementById('db-search-input');
                if (searchInput) searchInput.value = '';

                // Ocultar resultados globales
                resultsContainer.hidden = true;

                // Establecer estado de navegación
                state.activePozo = pozo;
                state.currentFolderPath = [{ id: null, name: pozo }];
                
                await openFolderView(folderId, folderName);
            });
        });

    } catch (e) {
        console.error('Error in global search:', e);
        gridResults.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;"><strong>Error de búsqueda:</strong> ${escapeHtml(e.message)}</div>`;
    }
}

/**
 * Restaura la vista que estaba activa antes de realizar la búsqueda global.
 */
function restoreActiveView() {
    if (!state.activePozo) {
        document.getElementById('view-wells-container').hidden = false;
        document.getElementById('view-folders-container').hidden = true;
        document.getElementById('view-files-container').hidden = true;
        const wellSearchInput = document.getElementById('well-search-input');
        renderWellsView(wellSearchInput ? wellSearchInput.value : '');
    } else if (state.activePozo && !state.activeFolderId) {
        document.getElementById('view-wells-container').hidden = true;
        document.getElementById('view-folders-container').hidden = false;
        document.getElementById('view-files-container').hidden = true;
        renderFoldersGrid('');
    } else {
        document.getElementById('view-wells-container').hidden = true;
        document.getElementById('view-folders-container').hidden = true;
        document.getElementById('view-files-container').hidden = false;
        renderSubfoldersGrid('');
        fetchAndRenderFiles();
    }
}

async function openFolderView(folderId, folderName) {
    // Limpiar la tabla de archivos inmediatamente al iniciar la navegación para evitar que se vean archivos anteriores
    const container = document.getElementById('files-table-container');
    if (container) container.innerHTML = '';

    state.activePozo = state.activePozo;
    state.activeFolderId = folderId;
    
    // Buscar si coincide con alguna categoría por defecto del sistema
    const matchedCategory = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === folderName.toUpperCase());
    state.activeCategory = matchedCategory ? matchedCategory.key : null;

    // Actualizar el path de navegación
    const idx = state.currentFolderPath.findIndex(p => p.id === folderId);
    if (idx !== -1) {
        state.currentFolderPath = state.currentFolderPath.slice(0, idx + 1);
    } else {
        state.currentFolderPath.push({ id: folderId, name: folderName });
    }

    document.getElementById('view-wells-container').hidden = true;
    document.getElementById('view-folders-container').hidden = true;
    document.getElementById('view-files-container').hidden = false;

    // Asegurar visibilidad del botón Nueva Carpeta
    const btnCreateFolder = document.getElementById('btn-create-folder');
    if (btnCreateFolder) btnCreateFolder.style.display = 'inline-flex';

    updateBreadcrumb();

    const titleEl = document.getElementById('files-section-title');
    const subtitleEl = document.getElementById('files-section-subtitle');

    if (titleEl) titleEl.textContent = `Carpeta: ${folderName} (${state.activePozo})`;
    
    // Obtener descripción de la base de datos
    let folderDescription = `Visualizando carpeta "${folderName}" para el pozo ${state.activePozo}.`;
    try {
        const folderDetails = await getFolderById(folderId);
        if (folderDetails && folderDetails.description) {
            folderDescription = folderDetails.description;
        }
    } catch (e) {
        console.warn('Error fetching folder description:', e);
    }
    if (subtitleEl) subtitleEl.textContent = folderDescription;

    // 1. Renderizar Subcarpetas si existen
    const subGrid = document.getElementById('subfolders-grid');
    const subSection = document.getElementById('subfolders-section');
    if (subGrid && subSection) {
        try {
            const subfolders = await getFolders({
                pozoName: state.activePozo,
                parentId: folderId,
                operationalScope: state.activeOperationalScope
            });

            state.currentSubfolders = subfolders;
            
            const searchInput = document.getElementById('db-search-input');
            const term = searchInput ? searchInput.value : '';
            renderSubfoldersGrid(term);

        } catch (subErr) {
            console.error('Error fetching subfolders:', subErr);
            subSection.style.display = 'none';
        }
    }

    // 2. Renderizar los archivos
    await fetchAndRenderFiles();
}

/**
 * Mantiene compatibilidad de llamadas legacy (abrir archivos por categoría directa).
 */
async function openFilesView(pozoName, categoryKey) {
    // Limpiar la tabla de archivos inmediatamente al iniciar la navegación para evitar fugas visuales de contenido anterior
    const container = document.getElementById('files-table-container');
    if (container) container.innerHTML = '';

    try {
        const folders = await getFolders({ pozoName, parentId: null, operationalScope: state.activeOperationalScope });
        const matched = folders.find(f => f.name.toUpperCase() === categoryKey.toUpperCase());
        if (matched) {
            await openFolderView(matched.id, matched.name);
        } else {
            state.activePozo = pozoName;
            state.activeCategory = categoryKey;
            state.activeFolderId = null;
            document.getElementById('view-wells-container').hidden = true;
            document.getElementById('view-folders-container').hidden = true;
            document.getElementById('view-files-container').hidden = false;
            updateBreadcrumb();
            await fetchAndRenderFiles();
        }
    } catch (e) {
        console.error('[database-controller] Error en openFilesView compatible:', e);
    }
}

/**
 * Consulta los archivos a Supabase con los filtros activos y renderiza la tabla.
 */
async function fetchAndRenderFiles() {
    const container = document.getElementById('files-table-container');
    if (!container) return;

    // Limpiar contenido anterior inmediatamente para evitar que se muestren archivos de carpetas previas
    container.innerHTML = '';

    // Retrasar la aparición del loader para evitar parpadeos en consultas ultra rápidas
    let showLoader = true;
    const loaderTimeout = setTimeout(() => {
        if (showLoader) {
            container.innerHTML = `
                <div class="empty-panel compact" style="padding:20px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.4rem; color: #2563eb; margin-bottom: 8px;"></i>
                    <strong>Consultando base de datos...</strong>
                    <span>Cargando documentos del expediente.</span>
                </div>
            `;
        }
    }, 220); // 220ms de tolerancia

    const searchKeyword = document.getElementById('db-search-input')?.value || '';
    const startDate = document.getElementById('db-start-date')?.value || null;
    const endDate = document.getElementById('db-end-date')?.value || null;

    try {
        const documents = await getWellDocuments({
            pozoName: state.activePozo,
            category: state.activeCategory,
            startDate,
            endDate,
            searchKeyword,
            operationalScope: state.activeOperationalScope,
            folderId: state.activeFolderId
        });

        showLoader = false;
        clearTimeout(loaderTimeout);

        state.activeDocuments = documents;


        if (state.activeDocuments.length === 0) {
            container.innerHTML = `
                <div class="empty-panel" style="padding:32px;">
                    <i class="fa-regular fa-folder-open" style="font-size:2.5rem; color:#94a3b8; margin-bottom:10px;"></i>
                    <strong>No hay documentos registrados en esta carpeta</strong>
                    <span>Utiliza el botón "Cargar Documento" para agregar archivos a esta categoría del contrato activo.</span>
                </div>
            `;
            return;
        }

        // Helper para formato de tamaño de archivo (bytes a MB/KB)
        const formatFileSize = (bytes) => {
            const num = Number(bytes || 0);
            if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
            if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
            return `${num} bytes`;
        };

        // Helper para badge de extensión de archivo
        const getFileBadgeClass = (ext) => {
            const clean = String(ext || '').toLowerCase();
            if (clean === 'pdf') return 'doc-type-pdf';
            if (['xlsx', 'xls', 'csv'].includes(clean)) return 'doc-type-xlsx';
            if (['docx', 'doc'].includes(clean)) return 'doc-type-docx';
            if (['png', 'jpg', 'jpeg', 'webp'].includes(clean)) return 'doc-type-img';
            return 'doc-type-other';
        };

        const docsWithUrls = await Promise.all(state.activeDocuments.map(async (doc) => {
            try {
                const downloadUrl = await getDocumentDownloadUrl(doc.file_path);
                return { ...doc, downloadUrl };
            } catch (err) {
                console.error('[database-controller] Error resolviendo URL de descarga:', err);
                return { ...doc, downloadUrl: '#' };
            }
        }));

        container.innerHTML = `
            <div class="stats-table-wrap">
                <table class="stats-table stats-table-enhanced">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Nombre del Archivo</th>
                            <th>Descripción / Nota</th>
                            <th>Tamaño</th>
                            <th>Cargado por</th>
                            <th>Fecha del Doc.</th>
                            <th style="text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${docsWithUrls.map(doc => {
                            const badgeClass = getFileBadgeClass(doc.file_type);
                            let docDate = '--';
                            if (doc.fecha_documento) {
                                const parts = doc.fecha_documento.split('-');
                                docDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date(doc.fecha_documento).toLocaleDateString('es-ES');
                            } else if (doc.created_at) {
                                docDate = new Date(doc.created_at).toLocaleDateString('es-ES');
                            }

                            const initialDate = doc.fecha_documento || (doc.created_at ? new Date(doc.created_at).toISOString().split('T')[0] : '');

                            return `
                                <tr>
                                    <td>
                                        <span class="document-file-icon ${badgeClass}">
                                            ${String(doc.file_type || 'DOC').toUpperCase().slice(0, 4)}
                                        </span>
                                    </td>
                                    <td>
                                        <strong style="color:#0f172a; font-size:0.92rem;">${escapeHtml(doc.nombre_archivo || 'Documento sin nombre')}</strong>
                                    </td>
                                    <td style="color:#64748b; font-size:0.85rem; max-width:240px;">
                                        ${renderDocumentDescription(doc)}
                                    </td>
                                    <td><span class="stats-muted-cell">${formatFileSize(doc.file_size)}</span></td>
                                    <td><span class="stats-muted-cell">${escapeHtml(doc.uploaded_by || 'Sistema')}</span></td>
                                    <td><span class="stats-date-cell">${docDate}</span></td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:8px;">
                                            <button type="button" class="btn-preview-doc" data-url="${escapeHtml(doc.downloadUrl)}" data-name="${escapeHtml(doc.nombre_archivo || 'Documento')}" data-type="${escapeHtml(doc.file_type || '')}" title="Previsualizar documento">
                                                <i class="fa-solid fa-eye"></i>
                                                <span>VER</span>
                                            </button>
                                            <a href="${escapeHtml(doc.downloadUrl)}" target="_blank" download class="btn-download-doc" rel="noopener noreferrer">
                                                <i class="fa-solid fa-download"></i>
                                                <span>DESCARGAR</span>
                                            </a>
                                            <button type="button" class="btn-edit-doc" data-id="${escapeHtml(doc.id)}" data-name="${escapeHtml(doc.nombre_archivo || 'Documento')}" data-date="${escapeHtml(initialDate)}" data-description="${escapeHtml(doc.descripcion || '')}" title="Editar documento">
                                                <i class="fa-solid fa-pen"></i>
                                                <span>EDITAR</span>
                                            </button>
                                            <button type="button" class="btn-delete-doc" data-id="${escapeHtml(doc.id)}" data-path="${escapeHtml(doc.file_path)}" data-name="${escapeHtml(doc.nombre_archivo || 'Documento')}" title="Eliminar documento">
                                                <i class="fa-solid fa-trash-can"></i>
                                                <span>ELIMINAR</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Eventos para previsualizar archivos
        container.querySelectorAll('.btn-preview-doc').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                const name = btn.dataset.name;
                const type = btn.dataset.type;
                openDocumentPreview(url, name, type);
            });
        });

        // Eventos para eliminar archivos
        container.querySelectorAll('.btn-delete-doc').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.dataset.id;
                const filePath = btn.dataset.path;
                const docName = btn.dataset.name;

                if (confirm(`¿Estás seguro de eliminar el archivo "${docName}"?\n\nEsta acción lo borra de Supabase Storage y del expediente.`)) {
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                        await deleteWellDocument(docId, filePath);
                        showSuccessToast('¡Documento Eliminado!', `El archivo "${docName}" fue borrado de Supabase Storage.`);
                        state.summaryCounts = filterSummaryCountsByActivePozos(await getWellDocumentSummaryCounts({ operationalScope: state.activeOperationalScope }));
                        fetchAndRenderFiles();
                    } catch (err) {
                        showSuccessToast('Error al Eliminar', err.message);
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>ELIMINAR</span>';
                    }
                }
            });
        });

        // Eventos para editar archivos
        container.querySelectorAll('.btn-edit-doc').forEach(btn => {
            btn.addEventListener('click', () => {
                const docId = btn.dataset.id;
                const docName = btn.dataset.name;
                const docDate = btn.dataset.date;
                const docDescription = btn.dataset.description;
                openEditDocumentMetadataModal(docId, docName, docDate, docDescription);
            });
        });

    } catch (err) {
        showLoader = false;
        clearTimeout(loaderTimeout);
        console.error('[database-controller] Error en fetchAndRenderFiles:', err);
        container.innerHTML = `<div class="empty-panel" style="color:#dc2626;"><strong>Error cargando documentos:</strong> <span>${err.message}</span></div>`;
    }
}

/* ==============================================================================
 * 4. ACTUALIZACIÓN DE MIGA DE PAN (BREADCRUMB)
 * ============================================================================== */

/**
 * Actualiza la barra superior de navegación (*Breadcrumb*) según el nivel activo.
 */
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('db-breadcrumb');
    if (!breadcrumb) return;

    let html = `
        <div class="db-breadcrumb-item ${!state.activePozo ? 'is-active' : ''}" id="bc-root" style="cursor:pointer;">
            <i class="fa-solid fa-database"></i>
            <span>Pozos Registrados</span>
        </div>
    `;

    if (state.activePozo) {
        html += `
            <span class="db-breadcrumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
            <div class="db-breadcrumb-item ${state.currentFolderPath.length === 0 ? 'is-active' : ''}" id="bc-pozo" style="cursor:pointer;">
                <i class="fa-solid fa-oil-well"></i>
                <span>${state.activePozo}</span>
            </div>
        `;
    }

    state.currentFolderPath.forEach((folder, index) => {
        if (index === 0 && folder.id === null) return;
        const isLast = index === state.currentFolderPath.length - 1;
        html += `
            <span class="db-breadcrumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
            <div class="db-breadcrumb-item ${isLast ? 'is-active' : ''}" id="bc-folder-${folder.id || 'root'}" data-folder-id="${folder.id}" data-folder-name="${escapeHtml(folder.name)}" style="cursor:pointer;">
                <i class="fa-solid fa-folder"></i>
                <span>${escapeHtml(folder.name)}</span>
            </div>
        `;
    });

    breadcrumb.innerHTML = html;

    // Vincular clics en la miga de pan
    document.getElementById('bc-root')?.addEventListener('click', () => {
        const btnCreateFolder = document.getElementById('btn-create-folder');
        if (btnCreateFolder) btnCreateFolder.style.display = 'none';
        renderWellsView();
    });
    
    document.getElementById('bc-pozo')?.addEventListener('click', () => {
        if (state.activePozo) openFoldersView(state.activePozo);
    });

    state.currentFolderPath.forEach((folder, index) => {
        if (index === 0 && folder.id === null) return;
        const el = document.getElementById(`bc-folder-${folder.id || 'root'}`);
        el?.addEventListener('click', () => {
            if (folder.id === null) {
                openFoldersView(state.activePozo);
            } else {
                openFolderView(folder.id, folder.name);
            }
        });
    });
}

/* ==============================================================================
 * 5. FILTROS Y BÚSQUEDA EN TIEMPO REAL
 * ============================================================================== */

/**
 * Inicializa los eventos de filtrado por búsqueda y fecha.
 */
function initFiltersEvents() {
    const btnFilter = document.getElementById('btn-db-filter');
    const searchInput = document.getElementById('db-search-input');
    const wellSearchInput = document.getElementById('well-search-input');
    const btnBackToWells = document.getElementById('btn-back-to-wells');
    const btnBackToFolders = document.getElementById('btn-back-to-folders');
    const btnCloseSearch = document.getElementById('btn-close-search');
    const startDateInput = document.getElementById('db-start-date');
    const endDateInput = document.getElementById('db-end-date');

    // Botones de retorno (Volver a Pozos / Volver a Carpetas)
    if (btnBackToWells) {
        btnBackToWells.addEventListener('click', () => {
            const btnCreateFolder = document.getElementById('btn-create-folder');
            if (btnCreateFolder) btnCreateFolder.style.display = 'none';
            // Limpiar buscador al salir del pozo
            if (searchInput) searchInput.value = '';
            if (wellSearchInput) wellSearchInput.value = '';
            
            // Ocultar resultados globales
            const resultsContainer = document.getElementById('view-search-results-container');
            if (resultsContainer) resultsContainer.hidden = true;

            renderWellsView();
        });
    }

    if (btnBackToFolders) {
        btnBackToFolders.addEventListener('click', () => {
            if (state.activeFolderId) {
                const idx = state.currentFolderPath.findIndex(p => p.id === state.activeFolderId);
                if (idx > 1) {
                    const parentFolder = state.currentFolderPath[idx - 1];
                    openFolderView(parentFolder.id, parentFolder.name);
                } else {
                    openFoldersView(state.activePozo);
                }
            } else {
                openFoldersView(state.activePozo);
            }
        });
    }

    if (btnCloseSearch) {
        btnCloseSearch.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            const resultsContainer = document.getElementById('view-search-results-container');
            if (resultsContainer) resultsContainer.hidden = true;
            restoreActiveView();
        });
    }

    // Buscador en tiempo real de pozos en el Nivel 1 (Debounced para evitar delay)
    let searchDebounceTimeout = null;
    if (wellSearchInput) {
        wellSearchInput.addEventListener('input', (e) => {
            if (!state.activePozo) {
                // Sincronizar el buscador general
                if (searchInput) searchInput.value = e.target.value;
                if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
                searchDebounceTimeout = setTimeout(() => {
                    renderWellsView(e.target.value);
                }, 120);
            }
        });
    }

    // Buscador general (db-search-input) en tiempo real para todos los niveles
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
            
            searchDebounceTimeout = setTimeout(() => {
                if (state.activeFolderId) {
                    // Nivel 3: Archivos de la Carpeta (búsqueda dentro de esta carpeta específica)
                    renderSubfoldersGrid(val);
                    fetchAndRenderFiles();
                } else {
                    // Nivel 1 o 2: Búsqueda global o del pozo completo
                    if (!val && !startDateInput?.value && !endDateInput?.value) {
                        const resultsContainer = document.getElementById('view-search-results-container');
                        if (resultsContainer) resultsContainer.hidden = true;
                        restoreActiveView();
                    } else {
                        triggerGlobalSearch(val);
                    }
                }
            }, 180);
        });
    }

    // Eventos de filtros por fecha en tiempo real
    const handleDateFilterChange = () => {
        const val = searchInput ? searchInput.value : '';
        if (state.activeFolderId || state.activeCategory) {
            // Nivel 3: Re-filtrar documentos
            fetchAndRenderFiles();
        } else {
            // Nivel 1 o 2: Re-filtrar resultados globales
            triggerGlobalSearch(val);
        }
    };

    if (startDateInput) {
        startDateInput.addEventListener('change', handleDateFilterChange);
    }
    if (endDateInput) {
        endDateInput.addEventListener('change', handleDateFilterChange);
    }

    if (btnFilter) {
        btnFilter.addEventListener('click', () => {
            const val = searchInput ? searchInput.value : '';
            if (state.activeFolderId || state.activeCategory) {
                fetchAndRenderFiles();
            } else {
                triggerGlobalSearch(val);
            }
        });
    }
}

/**
 * Inicializa los eventos relacionados a la creación de carpetas.
 */
function initFolderEvents() {
    const btnCreateFolder = document.getElementById('btn-create-folder');
    if (btnCreateFolder) {
        btnCreateFolder.addEventListener('click', async () => {
            if (!state.activePozo) return;

            const allWells = state.pozosList || [];

            const { value: formValues } = await Swal.fire({
                title: '<i class="fa-solid fa-folder-plus" style="color:#2563eb;margin-right:6px;"></i> Crear Nueva Carpeta',
                html: `
                    <div style="text-align:left; display:flex; flex-direction:column; gap:14px; font-family:inherit;">

                        <div>
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">Nombre de la Carpeta:</label>
                            <input id="swal-folder-name" placeholder="Ej: Caseta VDF, Simulaciones 2026..." style="margin:0; width:100%; box-sizing:border-box; border-radius:10px; font-size:0.9rem; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit;">
                        </div>

                        <div>
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">Descripción (opcional):</label>
                            <textarea id="swal-folder-desc" placeholder="Ej: Historial de volcados BES..." style="margin:0; width:100%; box-sizing:border-box; border-radius:10px; height:55px; font-family:inherit; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-size:0.9rem; resize:none;"></textarea>
                        </div>

                        <div>
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">Icono:</label>
                            <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;" id="swal-icon-picker">
                                <button type="button" class="swal-icon-btn active" data-icon="fa-solid fa-folder" style="padding:8px; border-radius:8px; border:1.5px solid #2563eb; background:#eff6ff; cursor:pointer; font-size:1.15rem; color:#2563eb; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-folder"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-chart-line" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-chart-line"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-file-contract" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-file-contract"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-gauge-high" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-gauge-high"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-gears" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-gears"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-microchip" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-microchip"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-bolt" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-bolt"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-camera" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-camera"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-screwdriver-wrench" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-screwdriver-wrench"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-hard-drive" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-hard-drive"></i></button>
                            </div>
                        </div>

                        <div>
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">¿En qué pozos crear la carpeta?</label>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:7px 12px; background:#eff6ff; border-radius:8px; border:1px solid #bfdbfe;">
                                <input type="checkbox" id="swal-select-all-wells" style="width:16px; height:16px; cursor:pointer; accent-color:#2563eb;">
                                <label for="swal-select-all-wells" style="font-weight:700; font-size:0.82rem; color:#1e40af; cursor:pointer; margin:0;">Seleccionar todos los pozos</label>
                            </div>
                            <div style="max-height:160px; overflow-y:auto; padding:8px; border:1.5px solid #cbd5e1; border-radius:10px; display:grid; grid-template-columns:repeat(2,1fr); gap:4px;" id="swal-wells-list">
                                ${allWells.map(w => {
                                    const isCurrent = w === state.activePozo;
                                    return '<label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:0.82rem;color:#334155;cursor:pointer;padding:5px 7px;border-radius:7px;transition:background 0.12s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'transparent\'">'
                                        + '<input type="checkbox" value="' + w + '" class="swal-well-cb" ' + (isCurrent ? 'checked disabled' : '') + ' style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;">'
                                        + '<span>' + w + '</span>'
                                        + (isCurrent ? '<span style="font-size:0.68rem;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:5px;font-weight:700;margin-left:auto;">ACTUAL</span>' : '')
                                        + '</label>';
                                }).join('')}
                            </div>
                            <p style="color:#94a3b8; font-size:0.75rem; margin-top:5px;"><i class="fa-solid fa-circle-info"></i> El pozo actual siempre se incluye.</p>
                        </div>

                    </div>
                `,
                width: 540,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fa-solid fa-folder-plus"></i> Crear Carpeta',
                cancelButtonText: 'Cancelar',
                didOpen: () => {
                    // Eventos del icon picker
                    const picker = document.getElementById('swal-icon-picker');
                    picker.querySelectorAll('.swal-icon-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            picker.querySelectorAll('.swal-icon-btn').forEach(b => {
                                b.style.borderColor = '#cbd5e1';
                                b.style.background = '#fff';
                                b.style.color = '#475569';
                                b.classList.remove('active');
                            });
                            btn.style.borderColor = '#2563eb';
                            btn.style.background = '#eff6ff';
                            btn.style.color = '#2563eb';
                            btn.classList.add('active');
                        });
                    });

                    // Evento de seleccionar todos los pozos
                    const selectAllCb = document.getElementById('swal-select-all-wells');
                    if (selectAllCb) {
                        selectAllCb.addEventListener('change', () => {
                            document.querySelectorAll('.swal-well-cb:not(:disabled)').forEach(cb => {
                                cb.checked = selectAllCb.checked;
                            });
                        });
                    }
                },
                preConfirm: () => {
                    const name = document.getElementById('swal-folder-name').value;
                    const desc = document.getElementById('swal-folder-desc').value;
                    const activeBtn = document.querySelector('.swal-icon-btn.active');
                    const icon = activeBtn ? activeBtn.dataset.icon : 'fa-solid fa-folder';
                    const selectedWells = Array.from(document.querySelectorAll('.swal-well-cb:checked')).map(el => el.value);

                    if (!name || !name.trim()) {
                        Swal.showValidationMessage('¡El nombre de la carpeta es obligatorio!');
                        return false;
                    }
                    if (selectedWells.length === 0) {
                        Swal.showValidationMessage('Debes seleccionar al menos un pozo.');
                        return false;
                    }

                    return { name: name.trim(), desc: desc.trim(), icon, wells: selectedWells };
                }
            });

            if (!formValues) return;

            // Mostrar loader
            Swal.fire({
                title: 'Creando carpetas...',
                html: '<p style="color:#64748b;">Procesando <strong>' + formValues.wells.length + '</strong> pozo' + (formValues.wells.length === 1 ? '' : 's') + '. Espere un momento.</p>',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                let parentFolderName = null;
                if (state.activeFolderId) {
                    const currentFolder = state.currentFolderPath.find(p => p.id === state.activeFolderId);
                    if (currentFolder) parentFolderName = currentFolder.name;
                }

                let createdCount = 0;
                let skippedCount = 0;

                for (const pozo of formValues.wells) {
                    let targetParentId = null;

                    if (state.activeFolderId && parentFolderName) {
                        const { data: matchedParent } = await supabase
                            .from('well_document_folders')
                            .select('id')
                            .eq('pozo_name', pozo)
                            .eq('name', parentFolderName)
                            .limit(1);

                        if (matchedParent && matchedParent.length > 0) {
                            targetParentId = matchedParent[0].id;
                        }
                    }

                    // Verificar duplicados
                    let dupQuery = supabase.from('well_document_folders').select('id').eq('pozo_name', pozo).eq('name', formValues.name);
                    if (targetParentId) dupQuery = dupQuery.eq('parent_id', targetParentId);
                    else dupQuery = dupQuery.is('parent_id', null);

                    const { data: dupData } = await dupQuery;
                    if (dupData && dupData.length > 0) { skippedCount++; continue; }

                    await createFolder({
                        pozoName: pozo,
                        name: formValues.name,
                        description: formValues.desc,
                        icon: formValues.icon,
                        parentId: targetParentId,
                        operationalScope: state.activeOperationalScope
                    });
                    createdCount++;
                }

                Swal.close();

                let msg = 'Carpeta creada en ' + createdCount + ' pozo' + (createdCount === 1 ? '' : 's') + '.';
                if (skippedCount > 0) msg += ' (' + skippedCount + ' omitido' + (skippedCount === 1 ? '' : 's') + ' por duplicado)';
                showSuccessToast('¡Listo!', msg);

                if (state.activeFolderId) {
                    await openFolderView(state.activeFolderId, state.currentFolderPath[state.currentFolderPath.length - 1].name);
                } else {
                    await openFoldersView(state.activePozo);
                }
            } catch (e) {
                Swal.fire('Error', 'No se pudo crear la carpeta: ' + e.message, 'error');
            }
        });
    }
}





let inactivityTimer = null;
let countdownInterval = null;

/**
 * Inicializa el sistema de aviso por inactividad (5 minutos sin actividad + 60s cuenta regresiva).
 */
function initInactivityTimer() {
    const INACTIVITY_TIME = 5 * 60 * 1000; // 5 minutos
    const modal = document.getElementById('inactivity-warning-modal');
    const countdownEl = document.getElementById('inactivity-countdown');
    const btnExtend = document.getElementById('btn-extend-session');
    const btnLogout = document.getElementById('btn-logout-inactivity');

    function resetTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        if (countdownInterval) clearInterval(countdownInterval);

        if (modal) {
            modal.hidden = true;
            modal.style.display = 'none';
        }

        inactivityTimer = setTimeout(triggerInactivityWarning, INACTIVITY_TIME);
    }

    function triggerInactivityWarning() {
        if (!modal) return;

        let secondsRemaining = 60;
        if (countdownEl) countdownEl.textContent = secondsRemaining;

        modal.hidden = false;
        modal.style.display = 'flex';

        countdownInterval = setInterval(() => {
            secondsRemaining--;
            if (countdownEl) countdownEl.textContent = secondsRemaining;

            if (secondsRemaining <= 0) {
                clearInterval(countdownInterval);
                sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
                logout();
            }
        }, 1000);
    }

    if (btnExtend) {
        btnExtend.onclick = () => resetTimer();
    }

    if (btnLogout) {
        btnLogout.onclick = async () => {
            sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
            await logout();
        };
    }

    // Monitorear actividad del usuario (mouse, teclado, toques, scroll)
    // Throttled para garantizar 0% de lag al escribir en teclados/inputs
    let lastActivityReset = Date.now();
    const activityEvents = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
        window.addEventListener(evt, () => {
            const now = Date.now();
            if (now - lastActivityReset > 15000) {
                lastActivityReset = now;
                if (modal && (modal.hidden || modal.style.display === 'none')) {
                    resetTimer();
                }
            }
        }, { passive: true });
    });

    resetTimer();
}

/* ==============================================================================
 * 6. MODAL Y EVENTOS DE CARGA DE ARCHIVOS (UPLOAD TO SUPABASE STORAGE)
 * ============================================================================== */

/**
 * Inicializa la funcionalidad del modal de carga de archivos (Drag & Drop + Formulario).
 */
function initUploadModal() {
    const modal = document.getElementById('upload-document-modal');
    const btnOpen = document.getElementById('btn-open-upload-modal');
    const btnClose = document.getElementById('btn-close-upload-modal');
    const dropzone = document.getElementById('dropzone-area');
    const fileInput = document.getElementById('upload-file-input');
    const fileBadge = document.getElementById('selected-file-badge');
    const form = document.getElementById('upload-document-form');

    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            if (modal) {
                modal.hidden = false;
                modal.style.display = 'flex';
            }
            
            // Poner por defecto la fecha de hoy local en el input de fecha del documento
            const dateInput = document.getElementById('upload-date-input');
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }

            if (state.activePozo) {
                const selectPozo = document.getElementById('upload-pozo-select');
                if (selectPozo) selectPozo.value = state.activePozo;
            }
            
            // Pre-seleccionar la categoría según el contexto de carpetas actual
            let selectCategoryVal = state.activeCategory;
            if (!selectCategoryVal && state.currentFolderPath && state.currentFolderPath.length >= 2) {
                const rootFolder = state.currentFolderPath[1]; // El primer nivel bajo el pozo
                if (rootFolder) {
                    const matched = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === rootFolder.name.toUpperCase());
                    if (matched) selectCategoryVal = matched.key;
                }
            }
            if (selectCategoryVal) {
                const selectCat = document.getElementById('upload-category-select');
                if (selectCat) selectCat.value = selectCategoryVal;
            }
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.hidden = true;
            modal.style.display = 'none';
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
        });

        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
            if (e.dataTransfer.files?.length) {
                fileInput.files = e.dataTransfer.files;
                updateSelectedFileBadge();
            }
        });

        fileInput.addEventListener('change', () => updateSelectedFileBadge());
    }

    function updateSelectedFileBadge() {
        if (!fileBadge || !fileInput) return;
        const file = fileInput.files?.[0];
        if (file) {
            fileBadge.textContent = `Archivo seleccionado: ${file.name} (${(file.size / 1048576).toFixed(2)} MB)`;
            fileBadge.hidden = false;
        } else {
            fileBadge.hidden = true;
        }
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput?.files?.[0];
            const pozoName = document.getElementById('upload-pozo-select')?.value;
            const category = document.getElementById('upload-category-select')?.value;
            const description = document.getElementById('upload-description-input')?.value || '';
            const documentDate = document.getElementById('upload-date-input')?.value || new Date().toISOString().split('T')[0];
            const submitBtn = document.getElementById('btn-submit-upload');

            if (!file) { alert('Selecciona un archivo para subir.'); return; }
            if (!pozoName) { alert('Selecciona un pozo.'); return; }
            if (!category) { alert('Selecciona una categoría.'); return; }

            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Subiendo expediente...</span>';
                }

                const uploaderName = state.userSession?.user?.email || 'Técnico UV';

                await uploadWellDocument({
                    file,
                    pozoName,
                    category,
                    description,
                    uploadedBy: uploaderName,
                    operationalScope: state.activeOperationalScope,
                    documentDate: documentDate,
                    folderId: state.activeFolderId
                });

                showSuccessToast('¡Documento Cargado con Éxito!', `El archivo "${file.name}" se guardó correctamente en el expediente.`);
                if (modal) {
                    modal.hidden = true;
                    modal.style.display = 'none';
                }
                form.reset();
                if (fileBadge) fileBadge.hidden = true;

                // Recargar contadores y vista si aplica
                state.summaryCounts = filterSummaryCountsByActivePozos(await getWellDocumentSummaryCounts({ operationalScope: state.activeOperationalScope }));
                if (state.activeFolderId) {
                    await openFolderView(state.activeFolderId, state.currentFolderPath[state.currentFolderPath.length - 1].name);
                } else if (state.activeCategory) {
                    fetchAndRenderFiles();
                } else if (state.activePozo) {
                    openFoldersView(state.activePozo);
                } else {
                    renderWellsView();
                }

            } catch (err) {
                showSuccessToast('Error al Subir', err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>Guardar y Subir Expediente</span>';
                }
            }
        });
    }
}

/**
 * Muestra una notificación Toast animada con un check verde de éxito.
 * @param {string} title - Título de la notificación.
 * @param {string} message - Descripción o detalle.
 */
function showSuccessToast(title = '¡Operación Exitosa!', message = '') {
    const existing = document.getElementById('db-success-toast');
    if (existing) existing.remove();

    const isError = title.toLowerCase().includes('error');

    const toast = document.createElement('div');
    toast.id = 'db-success-toast';
    toast.className = 'db-toast-notification';
    if (isError) {
        toast.style.borderLeftColor = '#dc2626';
    }

    toast.innerHTML = `
        <div class="db-toast-icon" style="${isError ? 'background:#fee2e2; color:#dc2626; box-shadow:0 4px 12px rgba(220,38,38,0.25);' : ''}">
            <i class="${isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'}"></i>
        </div>
        <div>
            <strong style="display:block; color:#0f172a; font-size:0.95rem; font-weight:800; margin-bottom:2px;">${title}</strong>
            <span style="color:#64748b; font-size:0.82rem; line-height:1.3; display:block;">${message}</span>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 3800);
}

/**
 * Abre el previsualizador de documentos nativo en una pestaña limpia de alta velocidad.
 * Evita errores net::ERR_FAILED producidos por bloqueos de iframe en localhost/servidores.
 * @param {string} url - URL pública del archivo en Supabase Storage.
 * @param {string} name - Nombre del archivo.
 * @param {string} type - Tipo o extensión del archivo.
 */
function openDocumentPreview(url, name, type) {
    if (!url || url === '#') {
        showSuccessToast('Error', 'La dirección del documento no es válida.');
        return;
    }

    // Abrir directamente en una pestaña limpia del navegador (Lector Nativo PDF/Imagen)
    // Esto resuelve al 100% el error ERR_FAILED y bloqueos de seguridad del navegador
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');

    const modal = document.getElementById('document-preview-modal');
    const titleEl = document.getElementById('preview-modal-title');
    const subtitleEl = document.getElementById('preview-modal-subtitle');
    const downloadBtn = document.getElementById('btn-preview-download');
    const bodyContainer = document.getElementById('preview-modal-body');
    const closeBtn = document.getElementById('btn-close-preview-modal');

    if (!modal || !bodyContainer) return;

    const cleanType = String(type || '').toUpperCase();
    if (titleEl) titleEl.textContent = name;
    if (subtitleEl) subtitleEl.textContent = `Archivo ${cleanType} • Supabase Storage`;
    if (downloadBtn) downloadBtn.href = url;

    modal.hidden = false;
    modal.style.display = 'flex';

    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.hidden = true;
            modal.style.display = 'none';
            bodyContainer.innerHTML = '';
        };
    }

    bodyContainer.innerHTML = `
        <div style="text-align:center; padding:36px 20px;">
            <div style="width:64px; height:64px; border-radius:20px; background:#eff6ff; color:#1d4ed8; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:1.8rem;">
                <i class="${cleanType === 'PDF' ? 'fa-solid fa-file-pdf' : 'fa-solid fa-file-lines'}"></i>
            </div>
            <h3 style="margin:0 0 6px; color:#0f172a; font-size:1.15rem; font-weight:800;">${name}</h3>
            <p style="margin:0 0 20px; color:#64748b; font-size:0.88rem; max-width:420px; margin-left:auto; margin-right:auto;">
                El visor nativo se ha abierto en una pestaña separada para brindarte máxima velocidad de navegación y herramientas de zoom/impresión.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-download-doc" style="padding:10px 20px; background:linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); color:#fff;">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    <span>Volver a Abrir Documento</span>
                </a>
            </div>
        </div>
    `;
}

/**
 * Abre un modal de SweetAlert2 para editar la fecha del documento y su descripción/nota.
 */
async function openEditDocumentMetadataModal(docId, docName, docDate, docDescription) {
    if (!window.Swal) {
        alert('Error: SweetAlert2 no está cargado.');
        return;
    }

    const cleanDesc = getCleanDocumentDescription(docDescription);
    const match = String(docDescription || '').match(/^\[JORNADA_ID:[^\]]+\]/i);
    const journeyTag = match ? match[0] : '';

    const { value: formValues } = await window.Swal.fire({
        title: 'Editar Metadatos del Documento',
        html: `
            <div style="text-align: left; font-family: 'Outfit', sans-serif;">
                <p style="font-size:0.85rem; color:#64748b; margin-bottom:12px;">Archivo: <strong>${escapeHtml(docName)}</strong></p>
                <div style="margin-bottom: 12px;">
                    <label style="display:block; font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:4px;">Fecha del Documento:</label>
                    <input type="date" id="swal-doc-date" class="swal2-input" value="${escapeHtml(docDate)}" style="margin: 0; width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid #cbd5e1; font-family: inherit; font-weight: 600;">
                </div>
                <div>
                    <label style="display:block; font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:4px;">Descripción o Notas Técnicas (Opcional):</label>
                    <textarea id="swal-doc-desc" class="swal2-textarea" style="margin: 0; width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid #cbd5e1; font-family: inherit; height: 80px;">${escapeHtml(cleanDesc)}</textarea>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b',
        preConfirm: () => {
            const dateVal = document.getElementById('swal-doc-date').value;
            const descVal = document.getElementById('swal-doc-desc').value;
            if (!dateVal) {
                window.Swal.showValidationMessage('La fecha del documento es obligatoria.');
                return false;
            }
            return { dateVal, descVal };
        }
    });

    if (formValues) {
        const { dateVal, descVal } = formValues;
        const finalDescription = journeyTag ? `${journeyTag} ${descVal}`.trim() : descVal.trim();

        try {
            // Mostrar cargando
            window.Swal.fire({
                title: 'Actualizando metadatos...',
                allowOutsideClick: false,
                didOpen: () => {
                    window.Swal.showLoading();
                }
            });

            await updateWellDocumentMetadata(docId, {
                description: finalDescription,
                documentDate: dateVal
            });

            window.Swal.close();
            showSuccessToast('¡Documento Actualizado!', 'Los metadatos se guardaron correctamente.');

            // Recargar contadores y vista
            state.summaryCounts = filterSummaryCountsByActivePozos(await getWellDocumentSummaryCounts({ operationalScope: state.activeOperationalScope }));
            if (state.activeCategory) {
                fetchAndRenderFiles();
            } else if (state.activePozo) {
                openFoldersView(state.activePozo);
            } else {
                renderWellsView();
            }

        } catch (err) {
            console.error('Error al actualizar metadatos del documento:', err);
            window.Swal.fire('Error al Actualizar', err.message, 'error');
        }
    }
}
