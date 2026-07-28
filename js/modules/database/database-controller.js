/**
 * ==============================================================================
 * CONTROLADOR PRINCIPAL DEL MÓDULO BASE DE DATOS & EXPEDIENTES DIGITALES POR POZO
 * UV SERVICIOS - LÓGICA MODULAR ES6+
 * ==============================================================================
 * Maneja la navegación por niveles (Pozos -> Carpetas -> Archivos), la seguridad por PIN,
 * los filtros en tiempo real y la subida/descarga de archivos con Supabase Storage.
 */

import { getSession, logout, applyNavigationAccessProfile } from '../../auth.js';
import { getUniquePozos } from '../../services/monitoring-service.js';
import {
    getWellDocuments,
    getWellDocumentSummaryCounts,
    uploadWellDocument,
    getDocumentDownloadUrl,
    deleteWellDocument
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
    }
];

// Estado global de navegación del módulo
const state = {
    userSession: null,
    isPinVerified: false,
    pozosList: [],
    summaryCounts: {},
    activePozo: null,
    activeCategory: null,
    activeDocuments: []
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
            applyNavigationAccessProfile(state.userSession.accessProfile);
        }

        // 3. Inicializar navegación instantánea y carga en segundo plano
        loadDatabaseModule();

        // 4. Inicializar eventos del modal de carga de archivos (Upload)
        initUploadModal();

        // 5. Inicializar eventos del buscador, filtros y botones Volver
        initFiltersEvents();

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
        // Cargar pozos desde el servicio de monitoreo
        const rawPozos = await getUniquePozos();
        state.pozosList = (rawPozos || [])
            .map(p => String(p || '').trim().toUpperCase())
            .filter(Boolean)
            .sort();

        // Poblar el selector de pozos en el modal de Cargar Documento
        populateUploadWellSelect();

        // Renderizar la vista de Pozos (Nivel 1) de forma instantánea
        renderWellsView();

        // Cargar contadores de documentos en segundo plano para no bloquear la pantalla
        getWellDocumentSummaryCounts().then(counts => {
            state.summaryCounts = counts || {};
            updateWellBadgesLive();
        }).catch(err => console.warn('Error cargando conteos en segundo plano:', err));

    } catch (err) {
        console.error('[database-controller] Error cargando datos del módulo:', err);
    }
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
 * RENDERIZA NIVEL 2: Vista de Carpetas temáticas por Pozo.
 * @param {string} pozoName - Nombre del pozo seleccionado.
 */
function openFoldersView(pozoName) {
    state.activePozo = pozoName;
    state.activeCategory = null;

    document.getElementById('view-wells-container').hidden = true;
    document.getElementById('view-folders-container').hidden = false;
    document.getElementById('view-files-container').hidden = true;

    updateBreadcrumb();

    const titleEl = document.getElementById('folder-well-title');
    if (titleEl) titleEl.textContent = `Expediente del Pozo ${pozoName}`;

    const grid = document.getElementById('folders-grid');
    if (!grid) return;

    const pozoCounts = state.summaryCounts[pozoName]?.categories || {};

    grid.innerHTML = DOCUMENT_CATEGORIES.map(cat => {
        const count = pozoCounts[cat.key] || 0;
        return `
            <div class="folder-card ${cat.cssClass}" data-category="${cat.key}">
                <div class="folder-card-header">
                    <div class="folder-card-icon">
                        <i class="${cat.icon}"></i>
                    </div>
                    <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV" class="card-uv-mini-logo">
                </div>
                <h3 class="folder-card-title">${cat.name}</h3>
                <p class="folder-card-desc">${cat.description}</p>
                <div class="folder-card-footer">
                    <span class="folder-card-count"><strong>${count}</strong> archivo${count === 1 ? '' : 's'}</span>
                    <strong style="color:#1d4ed8; font-weight:700;">Ver archivos <i class="fa-solid fa-arrow-right"></i></strong>
                </div>
            </div>
        `;
    }).join('');

    // Eventos de clic en cada carpeta
    grid.querySelectorAll('.folder-card').forEach(card => {
        card.addEventListener('click', () => {
            const categoryKey = card.dataset.category;
            openFilesView(pozoName, categoryKey);
        });
    });
}

/**
 * RENDERIZA NIVEL 3: Visor y Listado de Archivos en Carpeta.
 * @param {string} pozoName - Nombre del pozo.
 * @param {string} categoryKey - Clave de la categoría seleccionada.
 */
async function openFilesView(pozoName, categoryKey) {
    state.activePozo = pozoName;
    state.activeCategory = categoryKey;

    document.getElementById('view-wells-container').hidden = true;
    document.getElementById('view-folders-container').hidden = true;
    document.getElementById('view-files-container').hidden = false;

    updateBreadcrumb();

    const categoryObj = DOCUMENT_CATEGORIES.find(c => c.key === categoryKey) || { name: categoryKey };
    const titleEl = document.getElementById('files-section-title');
    const subtitleEl = document.getElementById('files-section-subtitle');

    if (titleEl) titleEl.textContent = `Carpeta: ${categoryObj.name} (${pozoName})`;
    if (subtitleEl) subtitleEl.textContent = `Documentos guardados en ${categoryObj.name} para el pozo ${pozoName}.`;

    await fetchAndRenderFiles();
}

/**
 * Consulta los archivos a Supabase con los filtros activos y renderiza la tabla.
 */
async function fetchAndRenderFiles() {
    const container = document.getElementById('files-table-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-panel compact" style="padding:20px;"><strong>Consultando Supabase Storage...</strong><span>Cargando documentos del expediente.</span></div>';

    const searchKeyword = document.getElementById('db-search-input')?.value || '';
    const startDate = document.getElementById('db-start-date')?.value || null;
    const endDate = document.getElementById('db-end-date')?.value || null;

    try {
        state.activeDocuments = await getWellDocuments({
            pozoName: state.activePozo,
            category: state.activeCategory,
            startDate,
            endDate,
            searchKeyword
        });

        if (state.activeDocuments.length === 0) {
            container.innerHTML = `
                <div class="empty-panel" style="padding:32px;">
                    <i class="fa-regular fa-folder-open" style="font-size:2.5rem; color:#94a3b8; margin-bottom:10px;"></i>
                    <strong>No hay documentos registrados en esta carpeta</strong>
                    <span>Utiliza el botón "Cargar Documento" para agregar archivos a esta categoría.</span>
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
                            <th>Fecha de Carga</th>
                            <th style="text-align:right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.activeDocuments.map(doc => {
                            const downloadUrl = getDocumentDownloadUrl(doc.file_path);
                            const badgeClass = getFileBadgeClass(doc.file_type);
                            const uploadDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES') : '--';

                            return `
                                <tr>
                                    <td>
                                        <span class="document-file-icon ${badgeClass}">
                                            ${String(doc.file_type || 'DOC').toUpperCase().slice(0, 4)}
                                        </span>
                                    </td>
                                    <td>
                                        <strong style="color:#0f172a; font-size:0.92rem;">${doc.nombre_archivo}</strong>
                                    </td>
                                    <td style="color:#64748b; font-size:0.85rem; max-width:240px;">
                                        ${doc.descripcion || '--'}
                                    </td>
                                    <td><span class="stats-muted-cell">${formatFileSize(doc.file_size)}</span></td>
                                    <td><span class="stats-muted-cell">${doc.uploaded_by || 'Sistema'}</span></td>
                                    <td><span class="stats-date-cell">${uploadDate}</span></td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:8px;">
                                            <button type="button" class="btn-preview-doc" data-url="${downloadUrl}" data-name="${doc.nombre_archivo}" data-type="${doc.file_type}" title="Previsualizar documento">
                                                <i class="fa-solid fa-eye"></i>
                                                <span>VER</span>
                                            </button>
                                            <a href="${downloadUrl}" target="_blank" download class="btn-download-doc" rel="noopener noreferrer">
                                                <i class="fa-solid fa-download"></i>
                                                <span>DESCARGAR</span>
                                            </a>
                                            <button type="button" class="btn-delete-doc" data-id="${doc.id}" data-path="${doc.file_path}" data-name="${doc.nombre_archivo}" title="Eliminar documento">
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
                        state.summaryCounts = await getWellDocumentSummaryCounts();
                        fetchAndRenderFiles();
                    } catch (err) {
                        showSuccessToast('Error al Eliminar', err.message);
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>ELIMINAR</span>';
                    }
                }
            });
        });

    } catch (err) {
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
        <div class="db-breadcrumb-item ${!state.activePozo ? 'is-active' : ''}" id="bc-root">
            <i class="fa-solid fa-database"></i>
            <span>Pozos Registrados</span>
        </div>
    `;

    if (state.activePozo) {
        html += `
            <span class="db-breadcrumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
            <div class="db-breadcrumb-item ${!state.activeCategory ? 'is-active' : ''}" id="bc-pozo">
                <i class="fa-solid fa-oil-well"></i>
                <span>${state.activePozo}</span>
            </div>
        `;
    }

    if (state.activeCategory) {
        const categoryObj = DOCUMENT_CATEGORIES.find(c => c.key === state.activeCategory);
        html += `
            <span class="db-breadcrumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
            <div class="db-breadcrumb-item is-active" id="bc-category">
                <i class="${categoryObj?.icon || 'fa-solid fa-folder'}"></i>
                <span>${categoryObj?.name || state.activeCategory}</span>
            </div>
        `;
    }

    breadcrumb.innerHTML = html;

    // Vincular clics en la miga de pan
    document.getElementById('bc-root')?.addEventListener('click', () => renderWellsView());
    document.getElementById('bc-pozo')?.addEventListener('click', () => {
        if (state.activePozo) openFoldersView(state.activePozo);
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

    // Botones de retorno (Volver a Pozos / Volver a Carpetas)
    if (btnBackToWells) {
        btnBackToWells.addEventListener('click', () => renderWellsView());
    }

    if (btnBackToFolders) {
        btnBackToFolders.addEventListener('click', () => {
            if (state.activePozo) openFoldersView(state.activePozo);
            else renderWellsView();
        });
    }

    // Buscador en tiempo real de pozos en el Nivel 1 (Debounced para evitar delay)
    let searchDebounceTimeout = null;
    if (wellSearchInput) {
        wellSearchInput.addEventListener('input', (e) => {
            if (!state.activePozo) {
                if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
                searchDebounceTimeout = setTimeout(() => {
                    renderWellsView(e.target.value);
                }, 120);
            }
        });
    }

    if (btnFilter) {
        btnFilter.addEventListener('click', () => {
            if (state.activeCategory) {
                fetchAndRenderFiles();
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && state.activeCategory) {
                fetchAndRenderFiles();
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
            if (modal) modal.hidden = false;
            if (state.activePozo) {
                const selectPozo = document.getElementById('upload-pozo-select');
                if (selectPozo) selectPozo.value = state.activePozo;
            }
            if (state.activeCategory) {
                const selectCat = document.getElementById('upload-category-select');
                if (selectCat) selectCat.value = state.activeCategory;
            }
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => { modal.hidden = true; });
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
                    uploadedBy: uploaderName
                });

                showSuccessToast('¡Documento Cargado con Éxito!', `El archivo "${file.name}" se guardó correctamente en el expediente.`);
                if (modal) {
                    modal.hidden = true;
                    modal.style.display = 'none';
                }
                form.reset();
                if (fileBadge) fileBadge.hidden = true;

                // Recargar contadores y vista si aplica
                state.summaryCounts = await getWellDocumentSummaryCounts();
                if (state.activeCategory) {
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
