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
    getFolderById,
    restoreWellDocument,
    permanentlyDeleteWellDocument,
    getDeletedWellDocuments
} from '../../services/well-documents-service.js';

// Instancias globales de Chart.js para el control de almacenamiento
let categoryChartInstance = null;
let wellsChartInstance = null;

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

// Definición de categorías virtuales para Información General
const GENERAL_CATEGORIES = [
    {
        key: 'NOVEDADES',
        name: 'NOVEDADES',
        icon: 'fa-solid fa-bullhorn',
        cssClass: 'folder-novedades',
        description: 'Informes de novedades de personal, minutas y eventos generales.'
    },
    {
        key: 'CONTRATOS',
        name: 'CONTRATOS',
        icon: 'fa-solid fa-file-signature',
        cssClass: 'folder-contratos',
        description: 'Documentos contractuales, anexos y actas de inicio/cierre.'
    },
    {
        key: 'FORMATOS',
        name: 'FORMATOS',
        icon: 'fa-solid fa-paste',
        cssClass: 'folder-formatos',
        description: 'Plantillas oficiales de informes, reportes diarios y control operacional.'
    },
    {
        key: 'MINUTAS',
        name: 'MINUTAS',
        icon: 'fa-solid fa-clock-rotate-left',
        cssClass: 'folder-minutas',
        description: 'Minutas de reuniones con clientes y acuerdos operativos.'
    }
];

// Definición de categorías virtuales para Gerencial
const GERENCIAL_CATEGORIES = [
    {
        key: 'SIAHO',
        name: 'SIAHO',
        icon: 'fa-solid fa-shield-halved',
        cssClass: 'folder-siaho',
        description: 'Documentación de seguridad, higiene y ambiente ocupacional.'
    },
    {
        key: 'FORMATOS_ADMINISTRATIVOS',
        name: 'FORMATOS ADMINISTRATIVOS',
        icon: 'fa-solid fa-file-invoice-dollar',
        cssClass: 'folder-formatos-admin',
        description: 'Plantillas y formatos administrativos, reportes de viáticos y vales.'
    },
    {
        key: 'INVENTARIO',
        name: 'INVENTARIO',
        icon: 'fa-solid fa-boxes-stacked',
        cssClass: 'folder-inventario',
        description: 'Control de inventario de equipos BES, herramientas y consumibles.'
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
    currentSubfolders: [],
    allFoldersList: []
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

        // 5c. Inicializar eventos del cuadro de mando de almacenamiento y papelera
        initStorageAndTrashEvents();

        // 6. Inicializar sistema de advertencia por inactividad (5 min + reloj)
        initInactivityTimer();
        // 7. Vincular botón de Cerrar Sesión (Escritorio y Móvil)
        const handleLogout = async () => {
            sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY);
            await logout();
        };
        document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
        document.getElementById('mobile-logout-btn')?.addEventListener('click', handleLogout);

        // 7b. Vincular botones de navegación por secciones (Pozos, General, Gerencial)
        const setupSectionNavigation = () => {
            const btnPozos = document.getElementById('sidebar-link-pozos');
            const btnGeneral = document.getElementById('sidebar-link-general');
            const btnGerencial = document.getElementById('sidebar-link-gerencial');
            const btnStorage = document.getElementById('sidebar-link-storage');

            const mobBtnPozos = document.getElementById('mobile-link-pozos');
            const mobBtnGeneral = document.getElementById('mobile-link-general');
            const mobBtnGerencial = document.getElementById('mobile-link-gerencial');
            const mobBtnStorage = document.getElementById('mobile-link-storage');

            const activateTab = (activeId) => {
                // Barra lateral
                [btnPozos, btnGeneral, btnGerencial, btnStorage].forEach(btn => {
                    if (btn) btn.classList.toggle('active', btn.id === activeId);
                });
                // Móvil
                const activeMobId = activeId.replace('sidebar-link-', 'mobile-link-');
                [mobBtnPozos, mobBtnGeneral, mobBtnGerencial, mobBtnStorage].forEach(btn => {
                    if (btn) btn.classList.toggle('active', btn.id === activeMobId);
                });
            };

            const goPozos = () => {
                activateTab('sidebar-link-pozos');
                const storageContainer = document.getElementById('view-storage-dashboard-container');
                const trashContainer = document.getElementById('view-trash-container');
                if (storageContainer) storageContainer.hidden = true;
                if (trashContainer) trashContainer.hidden = true;
                renderWellsView();
            };

            const goGeneral = () => {
                activateTab('sidebar-link-general');
                const storageContainer = document.getElementById('view-storage-dashboard-container');
                const trashContainer = document.getElementById('view-trash-container');
                if (storageContainer) storageContainer.hidden = true;
                if (trashContainer) trashContainer.hidden = true;
                openFoldersView('_GENERAL');
            };

            const goGerencial = () => {
                activateTab('sidebar-link-gerencial');
                const storageContainer = document.getElementById('view-storage-dashboard-container');
                const trashContainer = document.getElementById('view-trash-container');
                if (storageContainer) storageContainer.hidden = true;
                if (trashContainer) trashContainer.hidden = true;
                openFoldersView('_GERENCIAL');
            };

            const goStorage = async () => {
                activateTab('sidebar-link-storage');
                // Ocultar las demás vistas
                document.getElementById('view-wells-container').hidden = true;
                document.getElementById('view-folders-container').hidden = true;
                document.getElementById('view-files-container').hidden = true;
                document.getElementById('view-search-results-container').hidden = true;
                document.getElementById('view-trash-container').hidden = true;

                // Ocultar botón Nueva Carpeta
                const btnCreateFolder = document.getElementById('btn-create-folder');
                if (btnCreateFolder) btnCreateFolder.style.display = 'none';

                // Mostrar el dashboard
                document.getElementById('view-storage-dashboard-container').hidden = false;

                // Cargar datos y renderizar gráficos
                await loadAndRenderStorageStats();
            };

            btnPozos?.addEventListener('click', goPozos);
            mobBtnPozos?.addEventListener('click', goPozos);

            btnGeneral?.addEventListener('click', goGeneral);
            mobBtnGeneral?.addEventListener('click', goGeneral);

            btnGerencial?.addEventListener('click', goGerencial);
            mobBtnGerencial?.addEventListener('click', goGerencial);

            btnStorage?.addEventListener('click', goStorage);
            mobBtnStorage?.addEventListener('click', goStorage);
        };
        setupSectionNavigation();
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
            .filter(p => p !== '_GENERAL' && p !== '_GERENCIAL')
            .filter(Boolean)
            .sort();

        // Poblar el selector de pozos en el modal de Cargar Documento
        populateUploadWellSelect();

        // Poblar el conmutador rápido de pozos
        populateQuickWellSwitcher();

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

    let extraOptions = '';
    if (state.activePozo === '_GENERAL') {
        extraOptions = '<option value="_GENERAL">Información General</option>';
    } else if (state.activePozo === '_GERENCIAL') {
        extraOptions = '<option value="_GERENCIAL">Gerencial</option>';
    }

    select.innerHTML = '<option value="">Selecciona Pozo...</option>' + 
        extraOptions +
        state.pozosList.map(pozo => `<option value="${pozo}">${pozo}</option>`).join('');
}

/**
 * Popula y gestiona el conmutador rápido de pozos con soporte para autocompletado y teclado.
 */
function populateQuickWellSwitcher() {
    const input = document.getElementById('well-switcher-search');
    const dropdown = document.getElementById('well-switcher-dropdown');
    if (!input || !dropdown) return;

    const list = state.pozosList || [];
    let activeIndex = -1;

    // Renderizar opciones filtradas
    function renderFilteredDropdown(filterText = '') {
        const text = String(filterText).trim().toLowerCase();
        const filtered = list.filter(pozo => pozo.toLowerCase().includes(text));

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div style="padding:8px 12px; font-size:0.8rem; color:#94a3b8; font-style:italic;">No hay coincidencias</div>';
            activeIndex = -1;
            return;
        }

        dropdown.innerHTML = filtered.map((pozo, idx) => `
            <div class="autocomplete-option" data-value="${pozo}" data-index="${idx}">
                <i class="fa-solid fa-oil-well"></i>
                <span>${pozo}</span>
            </div>
        `).join('');

        dropdown.querySelectorAll('.autocomplete-option').forEach(opt => {
            opt.addEventListener('click', () => {
                selectWellOption(opt.dataset.value);
            });
        });
        
        activeIndex = -1;
    }

    // Ejecutar conmutación al seleccionar pozo
    async function selectWellOption(newPozo) {
        input.value = newPozo;
        dropdown.style.display = 'none';
        
        const isVirtual = state.activePozo === '_GENERAL' || state.activePozo === '_GERENCIAL';
        if (isVirtual) return;

        if (state.activeFolderId) {
            const currentFolderName = state.currentFolderPath[state.currentFolderPath.length - 1].name;
            
            Swal.fire({
                title: 'Buscando Carpeta...',
                html: `<p style="color:#64748b;">Localizando carpeta <strong>${escapeHtml(currentFolderName)}</strong> en el pozo <strong>${newPozo}</strong>...</p>`,
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                const { data: destFolders, error: fetchErr } = await supabase
                    .from('well_document_folders')
                    .select('id, parent_id, name')
                    .eq('pozo_name', newPozo);

                Swal.close();

                if (fetchErr) throw fetchErr;

                const matchedFolder = (destFolders || []).find(f => f.name.toUpperCase() === currentFolderName.toUpperCase());

                if (matchedFolder) {
                    state.activePozo = newPozo;
                    state.currentFolderPath = buildFolderPathArray(destFolders, matchedFolder.id, newPozo);
                    await openFolderView(matchedFolder.id, currentFolderName);
                } else {
                    showSuccessToast('Carpeta no encontrada', `La carpeta "${currentFolderName}" no existe en el pozo ${newPozo}. Redirigiendo a carpetas.`);
                    await openFoldersView(newPozo);
                }
            } catch (err) {
                console.error('[well-switcher] Error al conmutar pozo:', err);
                Swal.close();
                await openFoldersView(newPozo);
            }
        } else {
            await openFoldersView(newPozo);
        }
    }

    // Registrar eventos una sola vez
    if (!input.dataset.listenerBound) {
        input.addEventListener('focus', () => {
            renderFilteredDropdown(input.value);
            dropdown.style.display = 'block';
        });

        input.addEventListener('input', (e) => {
            renderFilteredDropdown(e.target.value);
            dropdown.style.display = 'block';
        });

        input.addEventListener('keydown', (e) => {
            const options = dropdown.querySelectorAll('.autocomplete-option');
            if (options.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex++;
                if (activeIndex >= options.length) activeIndex = 0;
                highlightOption(options);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex--;
                if (activeIndex < 0) activeIndex = options.length - 1;
                highlightOption(options);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < options.length) {
                    selectWellOption(options[activeIndex].dataset.value);
                } else if (options.length > 0) {
                    selectWellOption(options[0].dataset.value);
                }
            } else if (e.key === 'Escape') {
                dropdown.style.display = 'none';
                input.blur();
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        input.dataset.listenerBound = 'true';
    }

    function highlightOption(options) {
        options.forEach(opt => opt.classList.remove('active'));
        if (activeIndex >= 0 && activeIndex < options.length) {
            const activeOpt = options[activeIndex];
            activeOpt.classList.add('active');
            activeOpt.scrollIntoView({ block: 'nearest' });
        }
    }
}

/* ==============================================================================
 * 3. RENDERIZADO DE NIVELES (NIVEL 1: POZOS, NIVEL 2: CARPETAS, NIVEL 3: ARCHIVOS)
 * ============================================================================== */

/**
 * RENDERIZA NIVEL 1: Rejilla de tarjetas de pozos.
 * @param {string} [filterText] - Texto opcional para buscar pozos por nombre.
 */
function renderWellsView(filterText = '') {
    window.scrollTo({ top: 0, behavior: 'instant' });
    state.activePozo = null;
    state.activeCategory = null;
    state.activeFolderId = null;
    const wellsContainer = document.getElementById('view-wells-container');
    if (wellsContainer) wellsContainer.hidden = false;
    document.getElementById('view-folders-container').hidden = true;
    document.getElementById('view-files-container').hidden = true;

    // Asegurar que el botón Nueva Carpeta esté oculto en la vista general de pozos
    const btnCreateFolder = document.getElementById('btn-create-folder');
    if (btnCreateFolder) btnCreateFolder.style.display = 'none';

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
        // Obtener todas las carpetas del pozo (tanto padres como subcarpetas)
        const { data: existingFolders, error } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', cleanPozo);
            
        if (error) throw error;
        
        const existingNames = new Set((existingFolders || []).filter(f => f.parent_id === null).map(f => f.name.toUpperCase()));
        const foldersToCreate = [];
        
        let categories = DOCUMENT_CATEGORIES;
        if (cleanPozo === '_GENERAL') {
            categories = GENERAL_CATEGORIES;
        } else if (cleanPozo === '_GERENCIAL') {
            categories = GERENCIAL_CATEGORIES;
        }

        categories.forEach(cat => {
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

        // Si es Información General o Gerencial, no requerimos subcarpetas Echometer ni migración de niveles
        if (cleanPozo === '_GENERAL' || cleanPozo === '_GERENCIAL') {
            return;
        }

        // Volver a consultar para obtener la lista actualizada con IDs
        const { data: allFolders } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', cleanPozo);

        // Encontrar la carpeta padre "REGISTROS ECHOMETER (TAM)"
        const echometerParent = (allFolders || []).find(f => f.name.toUpperCase() === 'REGISTROS ECHOMETER (TAM)' && f.parent_id === null);
        
        if (echometerParent) {
            const existingSubNames = new Set(
                (allFolders || [])
                    .filter(f => f.parent_id === echometerParent.id)
                    .map(f => f.name.toUpperCase())
            );

            const subsToCreate = [];
            const requiredSubs = [
                { name: 'INFORMES DE PRUEBAS (PDF)', icon: 'fa-solid fa-file-pdf' },
                { name: 'ARCHIVOS DE DATOS (.028, .TWM)', icon: 'fa-solid fa-file-code' }
            ];

            requiredSubs.forEach(sub => {
                if (!existingSubNames.has(sub.name.toUpperCase())) {
                    subsToCreate.push({
                        operational_scope: cleanScope,
                        pozo_name: cleanPozo,
                        parent_id: echometerParent.id,
                        name: sub.name,
                        icon: sub.icon,
                        description: sub.name === 'INFORMES DE PRUEBAS (PDF)'
                            ? 'Reportes e informes técnicos de pruebas de nivel en formato PDF.'
                            : 'Archivos crudos de telemetría y disparos acústicos Echometer.'
                    });
                }
            });

            if (subsToCreate.length > 0) {
                const { error: subInsertError } = await supabase
                    .from('well_document_folders')
                    .insert(subsToCreate);
                if (subInsertError) throw subInsertError;
            }

            // Volver a consultar para obtener la lista final de carpetas y subcarpetas con sus IDs correctos
            const { data: finalFolders } = await supabase
                .from('well_document_folders')
                .select('*')
                .eq('pozo_name', cleanPozo);

            // Migrar documentos preexistentes de Echometer a sus respectivas subcarpetas
            const { data: echoDocs } = await supabase
                .from('well_historical_documents')
                .select('id, nombre_archivo, folder_id, file_type')
                .eq('pozo_name', cleanPozo)
                .eq('categoria', 'REGISTROS_ECHOMETER');

            const pdfSubFolder = (finalFolders || []).find(f => f.name.toUpperCase() === 'INFORMES DE PRUEBAS (PDF)' && f.parent_id === echometerParent.id);
            const dataSubFolder = (finalFolders || []).find(f => f.name.toUpperCase() === 'ARCHIVOS DE DATOS (.028, .TWM)' && f.parent_id === echometerParent.id);

            if (echoDocs && echoDocs.length > 0 && pdfSubFolder && dataSubFolder) {
                for (const doc of echoDocs) {
                    const fileExt = String(doc.file_type || doc.nombre_archivo.split('.').pop() || '').toLowerCase();
                    const isPdfReport = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(fileExt);
                    const targetSubFolderId = isPdfReport ? pdfSubFolder.id : dataSubFolder.id;

                    if (doc.folder_id !== targetSubFolderId) {
                        await supabase
                            .from('well_historical_documents')
                            .update({ folder_id: targetSubFolderId })
                            .eq('id', doc.id);
                    }
                }
            }

            // --- NUEVA AUTO-MIGRACIÓN DESDE GESTIÓN DE NIVELES ---
            // Buscar pruebas de nivel guardadas que contengan archivos de soporte (file_path)
            const { data: levelTests } = await supabase
                .from('well_level_tests')
                .select('*')
                .eq('pozo_name', cleanPozo)
                .not('file_path', 'is', null)
                .neq('file_path', '');

            if (levelTests && levelTests.length > 0 && pdfSubFolder) {
                // Obtener todos los documentos del pozo que ya están registrados para evitar duplicados
                const { data: existingHistoricalDocs } = await supabase
                    .from('well_historical_documents')
                    .select('file_path')
                    .eq('pozo_name', cleanPozo);
                
                const existingFilePaths = new Set(
                    (existingHistoricalDocs || []).map(d => d.file_path)
                );

                for (const test of levelTests) {
                    if (test.file_path && !existingFilePaths.has(test.file_path)) {
                        const fileName = test.file_path.split('/').pop() || 'Soporte_Prueba_Nivel.pdf';
                        const fileExt = fileName.split('.').pop()?.toLowerCase() || 'pdf';
                        
                        const docPayload = {
                            operational_scope: test.operational_scope || cleanScope,
                            pozo_name: cleanPozo,
                            categoria: 'REGISTROS_ECHOMETER',
                            nombre_archivo: fileName,
                            file_path: test.file_path,
                            file_size: 0,
                            file_type: fileExt,
                            descripcion: `Soporte de Prueba de Nivel - Fecha: ${test.fecha}`,
                            uploaded_by: 'Gestión de Pozos',
                            fecha_documento: test.fecha,
                            folder_id: pdfSubFolder.id
                        };

                        const { error: insertErr } = await supabase
                            .from('well_historical_documents')
                            .insert([docPayload]);

                        if (insertErr) {
                            console.warn('[ensureDefaultFoldersExist] Error registrando nivel histórico:', insertErr);
                        }
                    }
                }
            }
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
    const matched = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === name.toUpperCase())
        || GENERAL_CATEGORIES.find(c => c.name.toUpperCase() === name.toUpperCase())
        || GERENCIAL_CATEGORIES.find(c => c.name.toUpperCase() === name.toUpperCase());
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
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    if (titleEl) {
        if (pozoName === '_GENERAL') titleEl.textContent = 'Información General';
        else if (pozoName === '_GERENCIAL') titleEl.textContent = 'Expediente Gerencial';
        else titleEl.textContent = `Expediente del Pozo ${pozoName}`;
    }

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

        // Obtener la lista completa de carpetas (incluyendo subcarpetas) del pozo para contar subcarpetas en la vista principal
        const { data: allFoldersList, error: allFoldersError } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', String(pozoName).trim().toUpperCase());

        if (allFoldersError) {
            console.error('[openFoldersView] Error al obtener todas las carpetas:', allFoldersError);
        } else {
            console.log('[openFoldersView] Lista completa de carpetas cargadas de la DB:', allFoldersList);
        }

        state.currentFolders = folders;
        state.currentAllDocs = allDocs;
        state.allFoldersList = allFoldersList || [];

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
            const isDefault = DOCUMENT_CATEGORIES.some(c => c.name.toUpperCase() === folder.name.toUpperCase())
                || GENERAL_CATEGORIES.some(c => c.name.toUpperCase() === folder.name.toUpperCase())
                || GERENCIAL_CATEGORIES.some(c => c.name.toUpperCase() === folder.name.toUpperCase());
            
            let count = 0;
            if (isDefault) {
                const matchedCategory = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === folder.name.toUpperCase())
                    || GENERAL_CATEGORIES.find(c => c.name.toUpperCase() === folder.name.toUpperCase())
                    || GERENCIAL_CATEGORIES.find(c => c.name.toUpperCase() === folder.name.toUpperCase());
                count = state.currentAllDocs.filter(d => d.folder_id === folder.id || (d.folder_id === null && d.categoria === matchedCategory.key)).length;
            } else {
                count = state.currentAllDocs.filter(d => d.folder_id === folder.id).length;
            }

            const subfoldersCount = state.allFoldersList.filter(f => f.parent_id === folder.id).length;
            let countText = '';
            if (subfoldersCount > 0) {
                countText = `<strong>${subfoldersCount}</strong> subcarpeta${subfoldersCount === 1 ? '' : 's'}`;
            } else {
                countText = `<strong>${count}</strong> archivo${count === 1 ? '' : 's'}`;
            }

            return `
                <div class="folder-card ${config.cssClass}" data-folder-id="${folder.id}" data-folder-name="${escapeHtml(folder.name)}">
                    <div class="folder-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="folder-card-icon">
                            <i class="${config.icon}"></i>
                        </div>
                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV" class="card-uv-mini-logo" style="margin-left:auto;">
                        ${!isDefault ? `
                        <button type="button" class="btn-folder-actions" onclick="event.stopPropagation(); showFolderActions('${folder.id}', '${escapeHtml(folder.name)}')" title="Opciones" style="background:none; border:none; color:#64748b; font-size:1.15rem; cursor:pointer; margin-left:10px; display:flex; align-items:center; width:28px; height:28px; border-radius:50%; justify-content:center; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0';" onmouseout="this.style.background='none';">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        ` : ''}
                    </div>
                    <h3 class="folder-card-title" style="margin-top:14px;">${escapeHtml(folder.name)}</h3>
                    <p class="folder-card-desc">${escapeHtml(config.description)}</p>
                    <div class="folder-card-footer">
                        <span class="folder-card-count">${countText}</span>
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
            const count = state.currentAllDocs.filter(d => d.folder_id === sub.id).length;            // Colores correspondientes a las subcarpetas
            const colorClass = sub.name.toUpperCase().includes('INFORMES') 
                ? 'folder-informes' 
                : 'folder-sensor';
                
            const isSubDefault = ['INFORMES DE PRUEBAS (PDF)', 'ARCHIVOS DE DATOS (.028, .TWM)'].includes(sub.name.toUpperCase());
            const iconClass = sub.icon || 'fa-solid fa-folder-closed';

            return `
                <div class="folder-card ${colorClass}" data-folder-id="${sub.id}" data-folder-name="${escapeHtml(sub.name)}" style="margin: 0; min-height: 190px;">
                    <div class="folder-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="folder-card-icon" style="background:#eff6ff; color:#2563eb;">
                            <i class="${iconClass}"></i>
                        </div>
                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" alt="UV" class="card-uv-mini-logo" style="margin-left:auto; max-height:22px;">
                        ${!isSubDefault ? `
                        <button type="button" class="btn-folder-actions" onclick="event.stopPropagation(); showFolderActions('${sub.id}', '${escapeHtml(sub.name)}')" title="Opciones" style="background:none; border:none; color:#64748b; font-size:1.15rem; cursor:pointer; margin-left:10px; display:flex; align-items:center; width:28px; height:28px; border-radius:50%; justify-content:center; transition:background 0.2s;" onmouseover="this.style.background='#e2e8f0';" onmouseout="this.style.background='none';">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        ` : ''}
                    </div>
                    <h3 class="folder-card-title" style="margin-top:14px; font-size:1.02rem; font-weight:800; color:#0f172a;">${escapeHtml(sub.name)}</h3>
                    <p class="folder-card-desc" style="font-size:0.78rem; margin-top:4px; line-height:1.35;">${escapeHtml(sub.description || 'Carpeta de expedientes.')}</p>
                    <div class="folder-card-footer" style="margin-top:auto; padding-top:10px; display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <span class="folder-card-count" style="font-size:0.8rem; color:#64748b;"><strong>${count}</strong> archivo${count === 1 ? '' : 's'}</span>
                        <strong style="color:#2563eb; font-weight:700; font-size:0.82rem;">Ver archivos <i class="fa-solid fa-arrow-right"></i></strong>
                    </div>
                </div>
            `;
        }).join('');

        subGrid.querySelectorAll('.folder-card').forEach(card => {
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
            results = results.filter(doc => {
                const folderName = doc.well_document_folders?.name || '';
                const categoryClean = String(doc.categoria || '').replace(/_/g, ' ').toLowerCase();
                return (doc.nombre_archivo && doc.nombre_archivo.toLowerCase().includes(kw)) ||
                       (doc.descripcion && doc.descripcion.toLowerCase().includes(kw)) ||
                       (doc.uploaded_by && doc.uploaded_by.toLowerCase().includes(kw)) ||
                       (doc.categoria && doc.categoria.toLowerCase().includes(kw.replace(/\s+/g, '_'))) ||
                       (categoryClean && categoryClean.includes(kw)) ||
                       (folderName && folderName.toLowerCase().includes(kw));
            });
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
    window.scrollTo({ top: 0, behavior: 'instant' });
    const storageContainer = document.getElementById('view-storage-dashboard-container');
    const trashContainer = document.getElementById('view-trash-container');
    if (storageContainer) storageContainer.hidden = true;
    if (trashContainer) trashContainer.hidden = true;

    // Sincronizar botones de la barra lateral tras volver
    const btnPozos = document.getElementById('sidebar-link-pozos');
    const btnGeneral = document.getElementById('sidebar-link-general');
    const btnGerencial = document.getElementById('sidebar-link-gerencial');
    const btnStorage = document.getElementById('sidebar-link-storage');

    const mobBtnPozos = document.getElementById('mobile-link-pozos');
    const mobBtnGeneral = document.getElementById('mobile-link-general');
    const mobBtnGerencial = document.getElementById('mobile-link-gerencial');
    const mobBtnStorage = document.getElementById('mobile-link-storage');

    const syncSidebar = (activeId) => {
        [btnPozos, btnGeneral, btnGerencial, btnStorage].forEach(btn => {
            if (btn) btn.classList.toggle('active', btn.id === activeId);
        });
        const activeMobId = activeId.replace('sidebar-link-', 'mobile-link-');
        [mobBtnPozos, mobBtnGeneral, mobBtnGerencial, mobBtnStorage].forEach(btn => {
            if (btn) btn.classList.toggle('active', btn.id === activeMobId);
        });
    };

    if (!state.activePozo) {
        document.getElementById('view-wells-container').hidden = false;
        document.getElementById('view-folders-container').hidden = true;
        document.getElementById('view-files-container').hidden = true;
        const wellSearchInput = document.getElementById('well-search-input');
        renderWellsView(wellSearchInput ? wellSearchInput.value : '');
        syncSidebar('sidebar-link-pozos');
    } else if (state.activePozo && !state.activeFolderId) {
        document.getElementById('view-wells-container').hidden = true;
        document.getElementById('view-folders-container').hidden = false;
        document.getElementById('view-files-container').hidden = true;
        renderFoldersGrid('');
        if (state.activePozo === '_GENERAL') syncSidebar('sidebar-link-general');
        else if (state.activePozo === '_GERENCIAL') syncSidebar('sidebar-link-gerencial');
        else syncSidebar('sidebar-link-pozos');
    } else {
        document.getElementById('view-wells-container').hidden = true;
        document.getElementById('view-folders-container').hidden = true;
        document.getElementById('view-files-container').hidden = false;
        renderSubfoldersGrid('');
        fetchAndRenderFiles();
        if (state.activePozo === '_GENERAL') syncSidebar('sidebar-link-general');
        else if (state.activePozo === '_GERENCIAL') syncSidebar('sidebar-link-gerencial');
        else syncSidebar('sidebar-link-pozos');
    }
}

async function openFolderView(folderId, folderName) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const container = document.getElementById('files-table-container');
    if (container) container.innerHTML = '';
    state.activePozo = state.activePozo;
    state.activeFolderId = folderId;
    
    // Buscar si coincide con alguna categoría por defecto del sistema
    const matchedCategory = DOCUMENT_CATEGORIES.find(c => c.name.toUpperCase() === folderName.toUpperCase())
        || GENERAL_CATEGORIES.find(c => c.name.toUpperCase() === folderName.toUpperCase())
        || GERENCIAL_CATEGORIES.find(c => c.name.toUpperCase() === folderName.toUpperCase());
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

    if (titleEl) {
        const readablePozo = state.activePozo === '_GENERAL' ? 'Información General' : state.activePozo === '_GERENCIAL' ? 'Gerencial' : state.activePozo;
        titleEl.textContent = `Carpeta: ${folderName} (${readablePozo})`;
    }
    
    // Obtener descripción de la base de datos
    const targetEntityName = state.activePozo === '_GENERAL' ? 'Información General' : state.activePozo === '_GERENCIAL' ? 'Gerencial' : `el pozo ${state.activePozo}`;
    let folderDescription = `Visualizando carpeta "${folderName}" para ${targetEntityName}.`;
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
    const filesTableContainer = document.getElementById('files-table-container');
    
    let hasSubfolders = false;
    if (subGrid && subSection) {
        try {
            const subfolders = await getFolders({
                pozoName: state.activePozo,
                parentId: folderId,
                operationalScope: state.activeOperationalScope
            });

            state.currentSubfolders = subfolders || [];
            hasSubfolders = state.currentSubfolders.length > 0;
            
            const searchInput = document.getElementById('db-search-input');
            const term = searchInput ? searchInput.value : '';
            renderSubfoldersGrid(term);

        } catch (subErr) {
            console.error('Error fetching subfolders:', subErr);
            subSection.style.display = 'none';
        }
    }

    const searchInput = document.getElementById('db-search-input');
    const term = searchInput ? searchInput.value.trim() : '';

    if (hasSubfolders) {
        // Si hay subcarpetas y NO hay término de búsqueda activo, ocultamos la tabla de archivos
        if (!term) {
            if (filesTableContainer) filesTableContainer.style.display = 'none';
        } else {
            if (filesTableContainer) filesTableContainer.style.display = 'block';
            await fetchAndRenderFiles();
        }
    } else {
        if (filesTableContainer) filesTableContainer.style.display = 'block';
        await fetchAndRenderFiles();
    }
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

        // Eventos para eliminar archivos (Soft Delete)
        container.querySelectorAll('.btn-delete-doc').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.dataset.id;
                const docName = btn.dataset.name;

                const result = await Swal.fire({
                    title: '¿Enviar a la Papelera?',
                    html: `<p style="color:#64748b;">¿Estás seguro de eliminar el archivo <strong>${escapeHtml(docName)}</strong>?<br>Se enviará a la papelera y podrá ser restaurado posteriormente.</p>`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, mover a papelera',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#64748b'
                });

                if (result.isConfirmed) {
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                        await deleteWellDocument(docId);
                        showSuccessToast('¡Movido a Papelera!', `El archivo "${docName}" fue enviado a la papelera de reciclaje.`);
                        state.summaryCounts = filterSummaryCountsByActivePozos(await getWellDocumentSummaryCounts({ operationalScope: state.activeOperationalScope }));
                        fetchAndRenderFiles();
                    } catch (err) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error al eliminar',
                            text: err.message || 'No se pudo mover el archivo a la papelera.'
                        });
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
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

    const isGeneral = state.activePozo === '_GENERAL';
    const isGerencial = state.activePozo === '_GERENCIAL';
    const isVirtualWell = isGeneral || isGerencial;

    let html = '';
    if (isVirtualWell) {
        html += `
            <div class="db-breadcrumb-item ${state.currentFolderPath.length === 0 || (state.currentFolderPath.length === 1 && state.currentFolderPath[0].id === null) ? 'is-active' : ''}" id="bc-virtual-root" style="cursor:pointer;">
                <i class="${isGeneral ? 'fa-solid fa-folder-open' : 'fa-solid fa-briefcase'}"></i>
                <span>${isGeneral ? 'Información General' : 'Gerencial'}</span>
            </div>
        `;
    } else {
        html += `
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

    const breadcrumbList = document.getElementById('db-breadcrumb-list');
    if (breadcrumbList) {
        breadcrumbList.innerHTML = html;
    } else {
        breadcrumb.innerHTML = html;
    }

    // Gestionar visibilidad y sincronización del conmutador rápido integrado
    const switcherContainer = document.getElementById('well-quick-switcher-container');
    const switcherSelect = document.getElementById('well-switcher-select');
    const shouldShowSwitcher = state.activePozo && !isVirtualWell;

    if (switcherContainer && switcherSelect) {
        if (shouldShowSwitcher) {
            switcherContainer.style.display = 'flex';
            switcherSelect.value = state.activePozo;
        } else {
            switcherContainer.style.display = 'none';
            switcherSelect.value = '';
        }
    }

    // Vincular clics en la miga de pan
    if (isVirtualWell) {
        document.getElementById('bc-virtual-root')?.addEventListener('click', () => {
            openFoldersView(state.activePozo);
        });
    } else {
        document.getElementById('bc-root')?.addEventListener('click', () => {
            const btnCreateFolder = document.getElementById('btn-create-folder');
            if (btnCreateFolder) btnCreateFolder.style.display = 'none';
            renderWellsView();
        });
        
        document.getElementById('bc-pozo')?.addEventListener('click', () => {
            if (state.activePozo) openFoldersView(state.activePozo);
        });
    }

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
            const val = String(e.target.value || '').trim();
            if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
            
            searchDebounceTimeout = setTimeout(async () => {
                if (state.activeFolderId) {
                    // Nivel 3: Archivos de la Carpeta (búsqueda dentro de esta carpeta específica)
                    renderSubfoldersGrid(val);
                    
                    const filesTableContainer = document.getElementById('files-table-container');
                    const hasSubfolders = state.currentSubfolders && state.currentSubfolders.length > 0;
                    
                    if (hasSubfolders) {
                        if (!val) {
                            if (filesTableContainer) filesTableContainer.style.display = 'none';
                        } else {
                            if (filesTableContainer) filesTableContainer.style.display = 'block';
                            await fetchAndRenderFiles();
                        }
                    } else {
                        if (filesTableContainer) filesTableContainer.style.display = 'block';
                        await fetchAndRenderFiles();
                    }
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

const FONT_AWESOME_LIST = [
    // Carpetas y Documentos
    'fa-solid fa-folder', 'fa-solid fa-folder-open', 'fa-solid fa-folder-closed', 'fa-solid fa-file', 'fa-solid fa-file-lines', 'fa-solid fa-file-pdf', 'fa-solid fa-file-excel', 'fa-solid fa-file-word',
    // Técnicos y Operaciones
    'fa-solid fa-oil-well', 'fa-solid fa-screwdriver-wrench', 'fa-solid fa-gauge-high', 'fa-solid fa-gears', 'fa-solid fa-microchip', 'fa-solid fa-bolt', 'fa-solid fa-chart-line', 'fa-solid fa-hard-drive',
'fa-solid fa-industry', 'fa-solid fa-plug', 'fa-solid fa-satellite', 'fa-solid fa-network-wired', 'fa-solid fa-shield-halved', 'fa-solid fa-user-gear'
];

function getDescendantIds(folders, folderId) {
    const ids = [];
    const children = folders.filter(f => f.parent_id === folderId);
    for (const child of children) {
        ids.push(child.id);
        ids.push(...getDescendantIds(folders, child.id));
    }
    return ids;
}

function getFolderPathNames(folders, targetFolderId) {
    const path = [];
    let current = folders.find(f => f.id === targetFolderId);
    while (current) {
        path.unshift(current.name);
        if (current.parent_id) {
            current = folders.find(f => f.id === current.parent_id);
        } else {
            current = null;
        }
    }
    return path;
}

function buildFolderPathArray(folders, targetFolderId, pozoName) {
    const path = [{ id: null, name: pozoName }];
    let current = folders.find(f => f.id === targetFolderId);
    const temp = [];
    while (current) {
        temp.unshift({ id: current.id, name: current.name });
        if (current.parent_id) {
            current = folders.find(f => f.id === current.parent_id);
        } else {
            current = null;
        }
    }
    return path.concat(temp);
}

function initFolderEvents() {
    const btnCreateFolder = document.getElementById('btn-create-folder');
    if (btnCreateFolder) {
        btnCreateFolder.addEventListener('click', async () => {
            if (!state.activePozo) return;

            const isVirtualWell = state.activePozo === '_GENERAL' || state.activePozo === '_GERENCIAL';
            const allWells = state.pozosList || [];
            
            // Obtener todas las carpetas del pozo activo para listarlas en el selector de carpeta padre
            const { data: siblingFolders, error: fetchErr } = await supabase
                .from('well_document_folders')
                .select('*')
                .eq('pozo_name', String(state.activePozo).trim().toUpperCase());

            if (fetchErr) {
                console.error('Error fetching sibling folders:', fetchErr);
                return;
            }

            const folders = siblingFolders || [];

            // Construir jerarquía
            const rootFolders = folders.filter(f => f.parent_id === null);
            const subFoldersMap = {};
            folders.forEach(f => {
                if (f.parent_id !== null) {
                    if (!subFoldersMap[f.parent_id]) subFoldersMap[f.parent_id] = [];
                    subFoldersMap[f.parent_id].push(f);
                }
            });

            let parentOptions = '';
            rootFolders.forEach(root => {
                parentOptions += `<option value="${root.id}">📁 ${escapeHtml(root.name)}</option>`;
                
                const level1 = subFoldersMap[root.id] || [];
                level1.forEach(sub1 => {
                    parentOptions += `<option value="${sub1.id}">&nbsp;&nbsp;&nbsp;&nbsp;└─ 📁 ${escapeHtml(sub1.name)}</option>`;
                    
                    const level2 = subFoldersMap[sub1.id] || [];
                    level2.forEach(sub2 => {
                        parentOptions += `<option value="${sub2.id}">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ 📁 ${escapeHtml(sub2.name)}</option>`;
                    });
                });
            });

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
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">Carpeta Padre (Ubicación):</label>
                            <select id="swal-parent-folder" style="margin:0; width:100%; box-sizing:border-box; border-radius:10px; font-size:0.9rem; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit; background:#fff;">
                                <option value="">[ Carpeta Raíz / Ninguna ]</option>
                                ${parentOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:700; color:#475569; font-size:0.82rem; display:block; margin-bottom:5px;">Icono:</label>
                            <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;" id="swal-icon-picker">
                                <button type="button" class="swal-icon-btn active" data-icon="fa-solid fa-folder" style="padding:8px; border-radius:8px; border:1.5px solid #2563eb; background:#eff6ff; cursor:pointer; font-size:1.15rem; color:#2563eb; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-folder"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-chart-line" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-chart-line"></i></button>
                                <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-file-contract" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-file-contract"></i></button>
                                
                                <button type="button" class="swal-icon-btn" id="swal-active-custom-icon" data-icon="fa-solid fa-gauge-high" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">
                                    <i id="swal-active-custom-icon-i" class="fa-solid fa-gauge-high"></i>
                                </button>
                                
                                <button type="button" id="swal-more-icons-btn" style="padding:8px; border-radius:8px; border:1.5px dashed #cbd5e1; background:#f8fafc; cursor:pointer; font-size:1.15rem; color:#64748b; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;" title="Más Iconos">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>

                            <div id="swal-extra-icons-wrapper" style="display:none; margin-top:10px; border-top:1.5px dashed #cbd5e1; padding-top:10px; display:none; flex-direction:column; gap:10px; grid-column: span 5;">
                                <div style="display:flex; gap:6px;">
                                    <input id="swal-custom-icon-input" placeholder="Escribir clase (ej: droplet, industry)" style="flex:1; margin:0; box-sizing:border-box; border-radius:10px; font-size:0.85rem; padding:8px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit;">
                                    <button type="button" id="swal-apply-manual-icon" style="padding:0 12px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">Aplicar</button>
                                </div>
                                <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; max-height:120px; overflow-y:auto; padding:6px; border:1.5px solid #e2e8f0; border-radius:10px; background:#f8fafc;" id="swal-extra-icons-grid">
                                    ${FONT_AWESOME_LIST.map(ic => `
                                        <button type="button" class="swal-grid-icon-btn" data-icon="${ic}" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.1rem; color:#475569; display:flex; align-items:center; justify-content:center; transition:all 0.15s; outline:none;">
                                            <i class="${ic}"></i>
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        ${isVirtualWell ? `
                        <div style="display:none;">
                            <input type="checkbox" value="${state.activePozo}" class="swal-well-cb" checked>
                        </div>
                        ` : `
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
                        `}

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

                    // Evento del botón de buscar más iconos (expandible inline)
                    const moreBtn = document.getElementById('swal-more-icons-btn');
                    if (moreBtn) {
                        moreBtn.addEventListener('click', () => {
                            const wrapper = document.getElementById('swal-extra-icons-wrapper');
                            if (wrapper) {
                                if (wrapper.style.display === 'none' || wrapper.style.display === '') {
                                    wrapper.style.display = 'flex';
                                    moreBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                                    moreBtn.style.borderColor = '#2563eb';
                                    moreBtn.style.color = '#2563eb';
                                } else {
                                    wrapper.style.display = 'none';
                                    moreBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                                    moreBtn.style.borderColor = '#cbd5e1';
                                    moreBtn.style.color = '#64748b';
                                }
                            }
                        });
                    }

                    // Eventos de click en los iconos de la grilla extra inline
                    const gridBtns = document.querySelectorAll('#swal-extra-icons-grid .swal-grid-icon-btn');
                    gridBtns.forEach(btn => {
                        btn.addEventListener('click', () => {
                            const newIcon = btn.dataset.icon;
                            const customBtn = document.getElementById('swal-active-custom-icon');
                            const customIconI = document.getElementById('swal-active-custom-icon-i');
                            if (customBtn && customIconI) {
                                customBtn.dataset.icon = newIcon;
                                customIconI.className = newIcon;
                                customBtn.click(); // seleccionar automáticamente
                            }
                        });
                    });

                    // Botón de aplicar manualmente
                    const applyBtn = document.getElementById('swal-apply-manual-icon');
                    const manualInput = document.getElementById('swal-custom-icon-input');
                    if (applyBtn && manualInput) {
                        applyBtn.addEventListener('click', () => {
                            let newIcon = manualInput.value.trim();
                            if (!newIcon) return;
                            if (!newIcon.startsWith('fa-')) {
                                newIcon = `fa-solid fa-${newIcon}`;
                            }
                            const customBtn = document.getElementById('swal-active-custom-icon');
                            const customIconI = document.getElementById('swal-active-custom-icon-i');
                            if (customBtn && customIconI) {
                                customBtn.dataset.icon = newIcon;
                                customIconI.className = newIcon;
                                customBtn.click(); // seleccionar automáticamente
                            }
                        });
                    }

                    const selectAllCb = document.getElementById('swal-select-all-wells');
                    if (selectAllCb) {
                        selectAllCb.addEventListener('change', () => {
                            document.querySelectorAll('.swal-well-cb:not(:disabled)').forEach(cb => {
                                cb.checked = selectAllCb.checked;
                            });
                        });
                    }

                    // Pre-seleccionar la carpeta actual si aplica
                    const parentSelect = document.getElementById('swal-parent-folder');
                    if (parentSelect && state.activeFolderId) {
                        parentSelect.value = state.activeFolderId;
                    }
                },
                preConfirm: () => {
                    const name = document.getElementById('swal-folder-name').value;
                    const desc = document.getElementById('swal-folder-desc').value;
                    const activeBtn = document.querySelector('.swal-icon-btn.active');
                    const icon = activeBtn ? activeBtn.dataset.icon : 'fa-solid fa-folder';
                    const selectedWells = Array.from(document.querySelectorAll('.swal-well-cb:checked')).map(el => el.value);
                    const parentId = document.getElementById('swal-parent-folder').value;

                    if (!name || !name.trim()) {
                        Swal.showValidationMessage('¡El nombre de la carpeta es obligatorio!');
                        return false;
                    }
                    if (selectedWells.length === 0) {
                        Swal.showValidationMessage('Debes seleccionar al menos un pozo.');
                        return false;
                    }

                    let parentNamePath = [];
                    if (parentId) {
                        parentNamePath = getFolderPathNames(folders, parentId);
                    }

                    return { name: name.trim().toUpperCase(), desc: desc.trim(), icon, wells: selectedWells, parentNamePath };
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
                const createPromises = formValues.wells.map(async (pozo) => {
                    let targetParentId = null;

                    if (formValues.parentNamePath && formValues.parentNamePath.length > 0) {
                        let currentParentId = null;
                        for (const name of formValues.parentNamePath) {
                            let matchedQuery = supabase
                                .from('well_document_folders')
                                .select('id')
                                .eq('pozo_name', pozo)
                                .ilike('name', name);
                            
                            if (currentParentId) {
                                matchedQuery = matchedQuery.eq('parent_id', currentParentId);
                            } else {
                                matchedQuery = matchedQuery.is('parent_id', null);
                            }

                            const { data: matchedFolder } = await matchedQuery.limit(1);

                            if (matchedFolder && matchedFolder.length > 0) {
                                currentParentId = matchedFolder[0].id;
                            } else {
                                // Crear padre intermedio
                                const orig = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
                                try {
                                    const newParent = await createFolder({
                                        pozoName: pozo,
                                        name: name.toUpperCase(),
                                        description: orig?.description || '',
                                        icon: orig?.icon || 'fa-solid fa-folder',
                                        parentId: currentParentId,
                                        operationalScope: state.activeOperationalScope
                                    });
                                    if (newParent && newParent.id) {
                                        currentParentId = newParent.id;
                                    }
                                } catch (createParentErr) {
                                    console.error('[initFolderEvents] Error creando carpeta padre automática:', createParentErr);
                                }
                            }
                        }
                        targetParentId = currentParentId;
                    }

                    // Verificar duplicados
                    let dupQuery = supabase.from('well_document_folders').select('id').eq('pozo_name', pozo).ilike('name', formValues.name);
                    if (targetParentId) dupQuery = dupQuery.eq('parent_id', targetParentId);
                    else dupQuery = dupQuery.is('parent_id', null);

                    const { data: dupData } = await dupQuery;
                    if (dupData && dupData.length > 0) {
                        return 'skipped';
                    }

                    await createFolder({
                        pozoName: pozo,
                        name: formValues.name,
                        description: formValues.desc,
                        icon: formValues.icon,
                        parentId: targetParentId,
                        operationalScope: state.activeOperationalScope
                    });
                    return 'created';
                });

                const results = await Promise.all(createPromises);
                const createdCount = results.filter(r => r === 'created').length;
                const skippedCount = results.filter(r => r === 'skipped').length;

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

// Cache local para almacenar las carpetas y subcarpetas cargadas del pozo seleccionado en el modal
let uploadModalFoldersCache = {
    rootFolders: [],
    subFolders: []
};

/**
 * Carga de forma asíncrona todas las carpetas de un pozo específico y llena en cascada
 * los selectores de "Carpeta Principal" y "Subcarpeta" en el modal de carga.
 * @param {string} pozoName - Nombre del pozo seleccionado.
 * @returns {Promise<void>}
 */
async function loadFoldersForUploadModal(pozoName) {
    const categorySelect = document.getElementById('upload-category-select');
    const subfolderSelect = document.getElementById('upload-subfolder-select');
    if (!categorySelect || !subfolderSelect) return;

    // Mostrar estado de carga en el selector
    categorySelect.innerHTML = '<option value="">Cargando carpetas...</option>';
    subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Raíz)</option>';
    subfolderSelect.disabled = true;

    if (!pozoName) {
        categorySelect.innerHTML = '<option value="">Selecciona Pozo primero...</option>';
        return;
    }

    try {
        // Consultar de forma unificada todas las carpetas asignadas a este pozo en la base de datos
        const { data: foldersList, error } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', String(pozoName).trim().toUpperCase())
            .order('name', { ascending: true });

        if (error) throw error;

        // Clasificar carpetas según si son principales (parent_id es nulo) o subcarpetas
        uploadModalFoldersCache.rootFolders = (foldersList || []).filter(f => f.parent_id === null);
        uploadModalFoldersCache.subFolders = (foldersList || []).filter(f => f.parent_id !== null);

        // Rellenar el dropdown de la Carpeta Principal
        if (uploadModalFoldersCache.rootFolders.length === 0) {
            categorySelect.innerHTML = '<option value="">Sin carpetas raíz registradas</option>';
        } else {
            categorySelect.innerHTML = '<option value="">Selecciona Carpeta...</option>' + 
                uploadModalFoldersCache.rootFolders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        }

    } catch (e) {
        console.error('[loadFoldersForUploadModal] Error cargando carpetas para el modal de carga:', e);
        categorySelect.innerHTML = '<option value="">Error al cargar carpetas</option>';
    }
}

/**
 * Filtra y rellena el selector de subcarpetas en base a la carpeta principal seleccionada.
 * @param {string} parentFolderId - UUID de la carpeta padre seleccionada.
 * @param {string} [preselectedSubId] - UUID de la subcarpeta que se debe pre-seleccionar.
 */
function updateSubfolderSelector(parentFolderId, preselectedSubId = '') {
    const subfolderSelect = document.getElementById('upload-subfolder-select');
    if (!subfolderSelect) return;

    if (!parentFolderId) {
        subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Raíz)</option>';
        subfolderSelect.disabled = true;
        return;
    }

    // Función recursiva para construir opciones con indentación jerárquica
    const allSubs = uploadModalFoldersCache.subFolders;
    let optionsHtml = '';

    function buildSubOptions(currentParentId, depth, pathPrefix) {
        const children = allSubs.filter(f => f.parent_id === currentParentId);
        children.forEach(child => {
            const indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth);
            const label = pathPrefix ? `${pathPrefix} > 📁 ${child.name}` : `📁 ${child.name}`;
            optionsHtml += `<option value="${child.id}">${indent}${label}</option>`;
            // Recursivamente agregar los hijos de esta subcarpeta
            buildSubOptions(child.id, depth + 1, label);
        });
    }

    buildSubOptions(parentFolderId, 0, '');

    if (optionsHtml === '') {
        subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Raíz)</option>';
        subfolderSelect.disabled = true;
    } else {
        subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Carpeta Principal)</option>' + optionsHtml;
        subfolderSelect.disabled = false;

        if (preselectedSubId) {
            subfolderSelect.value = preselectedSubId;
        }
    }
}

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

    const selectPozo = document.getElementById('upload-pozo-select');
    const categorySelect = document.getElementById('upload-category-select');
    const subfolderSelect = document.getElementById('upload-subfolder-select');

    let selectedFilesArray = [];
    const filesContainer = document.getElementById('selected-files-container');
    const filesList = document.getElementById('selected-files-list');
    const filesCount = document.getElementById('selected-files-count');

    if (btnOpen) {
        btnOpen.addEventListener('click', async () => {
            if (modal) {
                modal.hidden = false;
                modal.style.display = 'flex';
            }
            
            // Re-poblar el selector de pozos para inyectar pozos virtuales si corresponde
            populateUploadWellSelect();

            // Limpiar selección de archivos al abrir el modal para empezar limpio
            selectedFilesArray = [];
            renderSelectedFilesList();
            
            // Poner por defecto la fecha de hoy local en el input de fecha del documento
            const dateInput = document.getElementById('upload-date-input');
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }

            // Contexto de Pozo
            if (selectPozo) {
                if (state.activePozo) {
                    selectPozo.value = state.activePozo;
                    selectPozo.disabled = true;
                    // Forzar carga de carpetas del pozo activo
                    await loadFoldersForUploadModal(state.activePozo);
                    
                    // Pre-selecciones inteligentes basadas en el contexto actual
                    if (state.activeFolderId) {
                        // Si estamos en un path de navegación
                        if (state.currentFolderPath && state.currentFolderPath.length >= 2) {
                            const rootFolder = state.currentFolderPath[1]; // Carpeta raíz
                            const rootId = rootFolder.id;
                            
                            if (rootId) {
                                categorySelect.value = rootId;
                                // Cargar subcarpetas de esta raíz
                                if (state.activeFolderId !== rootId) {
                                    // Estamos en una subcarpeta
                                    updateSubfolderSelector(rootId, state.activeFolderId);
                                } else {
                                    // Estamos en la carpeta raíz misma
                                    updateSubfolderSelector(rootId, '');
                                }
                            }
                        }
                    } else {
                        // Estamos en la lista de carpetas del pozo
                        if (categorySelect) categorySelect.value = '';
                        if (subfolderSelect) {
                            subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Raíz)</option>';
                            subfolderSelect.disabled = true;
                        }
                    }
                } else {
                    selectPozo.value = '';
                    selectPozo.disabled = false;
                    if (categorySelect) categorySelect.innerHTML = '<option value="">Selecciona Pozo primero...</option>';
                    if (subfolderSelect) {
                        subfolderSelect.innerHTML = '<option value="">Ninguna (Guardar en Raíz)</option>';
                        subfolderSelect.disabled = true;
                    }
                }
            }
        });
    }

    // Listener para cuando el usuario cambia manualmente de pozo (solo cuando no está bloqueado)
    if (selectPozo) {
        selectPozo.addEventListener('change', async () => {
            const selectedPozo = selectPozo.value;
            await loadFoldersForUploadModal(selectedPozo);
        });
    }

    // Listener para cuando el usuario cambia manualmente de Carpeta Principal
    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            const parentId = categorySelect.value;
            updateSubfolderSelector(parentId);
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
                addFiles(e.dataTransfer.files);
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files?.length) {
                addFiles(fileInput.files);
                fileInput.value = ''; // Limpiar para permitir volver a elegir los mismos archivos si se desea
            }
        });
    }

    function addFiles(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Evitar duplicados exactos en el mismo lote
            const alreadyExists = selectedFilesArray.some(f => f.file.name === file.name && f.file.size === file.size);
            if (!alreadyExists) {
                selectedFilesArray.push({ file, date: '' });
            }
        }
        renderSelectedFilesList();
    }

    function removeFile(index) {
        selectedFilesArray.splice(index, 1);
        renderSelectedFilesList();
    }

    function getFileIconStyle(fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let iconClass = 'fa-solid fa-file-lines';
        let color = '#64748b'; // default slate

        switch (ext) {
            case 'pdf':
                iconClass = 'fa-solid fa-file-pdf';
                color = '#ef4444';
                break;
            case 'xlsx':
            case 'xls':
            case 'csv':
                iconClass = 'fa-solid fa-file-excel';
                color = '#16a34a';
                break;
            case 'docx':
            case 'doc':
                iconClass = 'fa-solid fa-file-word';
                color = '#2563eb';
                break;
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'webp':
                iconClass = 'fa-solid fa-file-image';
                color = '#a855f7';
                break;
            default:
                iconClass = 'fa-solid fa-file-lines';
                color = '#64748b';
        }
        return { iconClass, color };
    }

    function renderSelectedFilesList() {
        if (!filesList || !filesContainer || !filesCount) return;

        if (selectedFilesArray.length === 0) {
            filesContainer.hidden = true;
            filesContainer.style.display = 'none';
            filesCount.textContent = '0';
            filesList.innerHTML = '';
            return;
        }

        filesCount.textContent = selectedFilesArray.length;
        filesContainer.hidden = false;
        filesContainer.style.display = 'block';

        filesList.innerHTML = selectedFilesArray.map((fileObj, idx) => {
            const file = fileObj.file;
            const { iconClass, color } = getFileIconStyle(file.name);
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            return `
                <div class="selected-file-item" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; font-size:0.8rem; margin-bottom: 6px; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                        <i class="${iconClass}" style="color:${color}; font-size:1.1rem; flex-shrink:0;"></i>
                        <span style="font-weight:600; color:#1e293b; text-overflow:ellipsis; white-space:nowrap; overflow:hidden;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                        <span style="color:#64748b; font-size:0.75rem; flex-shrink:0;">(${sizeMB} MB)</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <label style="font-weight:700; color:#475569; font-size:0.75rem; margin:0;">Fecha:</label>
                        <input type="date" class="file-individual-date" data-index="${idx}" value="${fileObj.date}" style="border:1px solid #cbd5e1; border-radius:6px; padding:3px 6px; font-size:0.78rem; outline:none; color:#334155; font-family:inherit;">
                        <button type="button" class="btn-remove-file" data-index="${idx}" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:1rem; padding:4px; transition:color 0.2s; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Vincular eventos de cambio a los inputs de fecha individual para actualizar el array de estado
        filesList.querySelectorAll('.file-individual-date').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(input.getAttribute('data-index'), 10);
                if (selectedFilesArray[idx]) {
                    selectedFilesArray[idx].date = e.target.value;
                }
            });
        });

        filesList.querySelectorAll('.btn-remove-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                removeFile(idx);
            });
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pozoName = (selectPozo?.disabled ? state.activePozo : selectPozo?.value);
            const parentFolderId = categorySelect?.value;
            const subfolderId = subfolderSelect?.value;
            const description = document.getElementById('upload-description-input')?.value || '';
            const documentDate = document.getElementById('upload-date-input')?.value || new Date().toISOString().split('T')[0];
            const submitBtn = document.getElementById('btn-submit-upload');

            if (selectedFilesArray.length === 0) {
                window.Swal.fire({
                    icon: 'warning',
                    title: 'Sin archivos',
                    text: 'Debes arrastrar o seleccionar al menos un archivo para subir.'
                });
                return;
            }
            if (!pozoName) { alert('Selecciona un pozo.'); return; }
            if (!parentFolderId) { alert('Selecciona una carpeta principal.'); return; }

            // El destino final será la subcarpeta seleccionada, o si no hay, la carpeta principal
            const targetFolderId = subfolderId || parentFolderId;

            // Resolver la categoría del documento (nombre de la carpeta principal en mayúsculas sanitizadas)
            const parentFolderRecord = uploadModalFoldersCache.rootFolders.find(f => f.id === parentFolderId);
            if (!parentFolderRecord) { alert('No se pudo determinar la carpeta de destino.'); return; }
            const finalCategory = parentFolderRecord.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

            const totalFiles = selectedFilesArray.length;
            let successCount = 0;
            const failedFiles = [];
            const uploaderName = state.userSession?.user?.email || 'Técnico UV';

            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    // Desactivar temporalmente los inputs del modal para evitar ediciones mientras se sube
                    selectPozo.disabled = true;
                    if (categorySelect) categorySelect.disabled = true;
                    if (subfolderSelect) subfolderSelect.disabled = true;
                    const dateInput = document.getElementById('upload-date-input');
                    if (dateInput) dateInput.disabled = true;
                    const descInput = document.getElementById('upload-description-input');
                    if (descInput) descInput.disabled = true;
                    if (btnClose) btnClose.disabled = true;
                }

                // Carga secuencial de archivos en el lote
                for (let i = 0; i < totalFiles; i++) {
                    const currentFileObj = selectedFilesArray[i];
                    const currentFile = currentFileObj.file;
                    const fileDocDate = currentFileObj.date || documentDate; // Fallback a la fecha global

                    if (submitBtn) {
                        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Subiendo (${i + 1}/${totalFiles}): ${escapeHtml(currentFile.name)}...</span>`;
                    }

                    try {
                        await uploadWellDocument({
                            file: currentFile,
                            pozoName,
                            category: finalCategory,
                            description,
                            uploadedBy: uploaderName,
                            operationalScope: state.activeOperationalScope,
                            documentDate: fileDocDate,
                            folderId: targetFolderId
                        });
                        successCount++;
                    } catch (fileErr) {
                        console.error(`[initUploadModal] Error subiendo archivo "${currentFile.name}":`, fileErr);
                        failedFiles.push({ file: currentFile, date: currentFileObj.date, error: fileErr.message || 'Error desconocido' });
                    }
                }

                if (failedFiles.length === 0) {
                    showSuccessToast('¡Documentos Cargados!', `Se subieron con éxito los ${successCount} expedientes.`);
                    if (modal) {
                        modal.hidden = true;
                        modal.style.display = 'none';
                    }
                    form.reset();
                    selectedFilesArray = [];
                    renderSelectedFilesList();
                } else {
                    const failedNames = failedFiles.map(f => `• ${f.file.name}: ${f.error}`).join('\n');
                    
                    if (successCount > 0) {
                        window.Swal.fire({
                            icon: 'warning',
                            title: 'Carga Parcial',
                            html: `<div style="text-align: left;">
                                <p>Se subieron <strong>${successCount}</strong> de <strong>${totalFiles}</strong> archivos.</p>
                                <p style="color:#ef4444; font-weight:700;">Fallaron los siguientes archivos:</p>
                                <pre style="font-size: 0.8rem; background: #f8fafc; padding: 10px; border-radius: 8px; max-height: 120px; overflow-y: auto;">${escapeHtml(failedNames)}</pre>
                                <p>Los archivos fallidos quedan en la lista para que puedas reintentar subirlos.</p>
                            </div>`
                        });
                    } else {
                        window.Swal.fire({
                            icon: 'error',
                            title: 'Error de Carga',
                            html: `<div style="text-align: left;">
                                <p>No se pudo subir ninguno de los <strong>${totalFiles}</strong> archivos.</p>
                                <pre style="font-size: 0.8rem; background: #f8fafc; padding: 10px; border-radius: 8px; max-height: 120px; overflow-y: auto;">${escapeHtml(failedNames)}</pre>
                            </div>`
                        });
                    }

                    // Dejar en la lista únicamente los que fallaron, conservando sus fechas individuales
                    selectedFilesArray = failedFiles.map(f => ({ file: f.file, date: f.date || '' }));
                    renderSelectedFilesList();
                }

                // Recargar contadores y vista correspondiente
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
                showSuccessToast('Error al Procesar Lote', err.message);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>Guardar y Subir Expediente</span>';
                }
                selectPozo.disabled = !!state.activePozo; // Mantener deshabilitado si ya había un pozo activo en el contexto
                if (categorySelect) categorySelect.disabled = false;
                if (subfolderSelect) subfolderSelect.disabled = false;
                const dateInput = document.getElementById('upload-date-input');
                if (dateInput) dateInput.disabled = false;
                const descInput = document.getElementById('upload-description-input');
                if (descInput) descInput.disabled = false;
                if (btnClose) btnClose.disabled = false;
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
window.showFolderActions = async function(folderId, folderName) {
    if (!window.Swal) {
        alert('Error: SweetAlert2 no está cargado.');
        return;
    }

    let selectedAction = null;
    await window.Swal.fire({
        title: 'Opciones de Carpeta',
        html: `
            <div style="display:flex; flex-direction:column; gap:10px; font-family:'Outfit', sans-serif; text-align:left;">
                <p style="font-size:0.85rem; color:#64748b; margin:0 0 5px 0;">Selecciona una acción para la carpeta <strong>"${escapeHtml(folderName)}"</strong>:</p>
                <button type="button" id="swal-opt-edit" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border:1.5px solid #e2e8f0; background:#fff; border-radius:10px; font-size:0.92rem; font-weight:600; color:#334155; cursor:pointer; text-align:left; transition:all 0.15s; outline:none;" onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#2563eb'; this.style.color='#2563eb';" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0'; this.style.color='#334155';">
                    <i class="fa-solid fa-pen" style="font-size:1.1rem; width:20px; color:#2563eb;"></i> Renombrar / Editar Detalles
                </button>
                <button type="button" id="swal-opt-move" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border:1.5px solid #e2e8f0; background:#fff; border-radius:10px; font-size:0.92rem; font-weight:600; color:#334155; cursor:pointer; text-align:left; transition:all 0.15s; outline:none;" onmouseover="this.style.background='#f0fdf4'; this.style.borderColor='#22c55e'; this.style.color='#15803d';" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0'; this.style.color='#334155';">
                    <i class="fa-solid fa-arrow-right-to-bracket" style="font-size:1.1rem; width:20px; color:#16a34a;"></i> Mover / Transferir Carpeta (Organizar)
                </button>
                <button type="button" id="swal-opt-delete" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border:1.5px solid #e2e8f0; background:#fff; border-radius:10px; font-size:0.92rem; font-weight:600; color:#ef4444; cursor:pointer; text-align:left; transition:all 0.15s; outline:none;" onmouseover="this.style.background='#fef2f2'; this.style.borderColor='#ef4444';" onmouseout="this.style.background='#fff'; this.style.borderColor='#e2e8f0';">
                    <i class="fa-solid fa-trash-can" style="font-size:1.1rem; width:20px; color:#ef4444;"></i> Eliminar Carpeta
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        cancelButtonColor: '#64748b',
        didOpen: () => {
            document.getElementById('swal-opt-edit').addEventListener('click', () => {
                selectedAction = 'edit';
                window.Swal.clickConfirm();
            });
            document.getElementById('swal-opt-move').addEventListener('click', () => {
                selectedAction = 'move';
                window.Swal.clickConfirm();
            });
            document.getElementById('swal-opt-delete').addEventListener('click', () => {
                selectedAction = 'delete';
                window.Swal.clickConfirm();
            });
        }
    });

    if (selectedAction === 'edit') {
        window.handleEditFolderClick(folderId, folderName);
    } else if (selectedAction === 'move') {
        window.handleMoveFolderClick(folderId, folderName);
    } else if (selectedAction === 'delete') {
        window.handleDeleteFolderClick(folderId, folderName);
    }
}

window.handleMoveFolderClick = async function(folderId, folderName) {
    if (!window.Swal) return;

    try {
        const folderDetails = await getFolderById(folderId);
        
        // Obtener todas las carpetas del pozo actual
        const { data: siblingFolders, error: fetchErr } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', String(state.activePozo).trim().toUpperCase());

        if (fetchErr) throw fetchErr;

        const folders = siblingFolders || [];
        const excludedIds = [folderId, ...getDescendantIds(folders, folderId)];
        const possibleParents = folders.filter(f => !excludedIds.includes(f.id));

        // Construir jerarquía
        const rootFolders = possibleParents.filter(f => f.parent_id === null);
        const subFoldersMap = {};
        possibleParents.forEach(f => {
            if (f.parent_id !== null) {
                if (!subFoldersMap[f.parent_id]) subFoldersMap[f.parent_id] = [];
                subFoldersMap[f.parent_id].push(f);
            }
        });

        let parentOptionsHtml = '';
        rootFolders.forEach(root => {
            parentOptionsHtml += `<option value="${root.id}" ${folderDetails?.parent_id === root.id ? 'selected' : ''}>📁 ${escapeHtml(root.name)}</option>`;
            
            const level1 = subFoldersMap[root.id] || [];
            level1.forEach(sub1 => {
                parentOptionsHtml += `<option value="${sub1.id}" ${folderDetails?.parent_id === sub1.id ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;&nbsp;📁 ${escapeHtml(root.name)} &gt; 📁 ${escapeHtml(sub1.name)}</option>`;
                
                const level2 = subFoldersMap[sub1.id] || [];
                level2.forEach(sub2 => {
                    parentOptionsHtml += `<option value="${sub2.id}" ${folderDetails?.parent_id === sub2.id ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 ${escapeHtml(root.name)} &gt; 📁 ${escapeHtml(sub1.name)} &gt; 📁 ${escapeHtml(sub2.name)}</option>`;
                });
            });
        });

        const { value: formValues } = await window.Swal.fire({
            title: 'Mover / Transferir Carpeta',
            html: `
                <div style="text-align: left; font-family: 'Outfit', sans-serif; display:flex; flex-direction:column; gap:14px;">
                    <p style="font-size:0.85rem; color:#64748b; margin:0; line-height:1.4;">
                        Estás organizando la carpeta <strong>"${escapeHtml(folderName)}"</strong>. Selecciona su nueva ubicación:
                    </p>
                    
                    <div>
                        <label style="font-weight: 700; color: #475569; font-size: 0.82rem; display: block; margin-bottom: 5px;">Nueva Ubicación / Carpeta Padre</label>
                        <select id="move-parent-id" style="width:100%; box-sizing:border-box; border-radius:10px; font-size:0.9rem; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit; background:#fff;">
                            <option value="">[ Convertir en Carpeta Raíz / Ninguna ]</option>
                            ${parentOptionsHtml}
                        </select>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; padding:7px 12px; background:#eff6ff; border-radius:8px; border:1px solid #bfdbfe;">
                        <input type="checkbox" id="move-apply-all-wells" style="width:16px; height:16px; cursor:pointer; accent-color:#2563eb;" checked>
                        <label for="move-apply-all-wells" style="font-weight:700; font-size:0.82rem; color:#1e40af; cursor:pointer; margin:0;">Aplicar cambio de ubicación en todos los pozos</label>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Confirmar Traslado',
            confirmButtonColor: '#2563eb',
            preConfirm: () => {
                const parentId = document.getElementById('move-parent-id').value;
                const applyToAll = document.getElementById('move-apply-all-wells')?.checked || false;
                
                let parentNamePath = [];
                if (parentId) {
                    parentNamePath = getFolderPathNames(folders, parentId);
                }
                
                return { parentId, parentNamePath, applyToAll };
            }
        });

        if (formValues) {
            window.Swal.fire({
                title: 'Trasladando carpeta...',
                allowOutsideClick: false,
                didOpen: () => { window.Swal.showLoading(); }
            });
            if (formValues.applyToAll) {
                const allWells = state.pozosList || [];
                const movePromises = allWells.map(async (pozo) => {
                    const { data: targetFolderData } = await supabase
                        .from('well_document_folders')
                        .select('*')
                        .eq('pozo_name', pozo)
                        .ilike('name', folderName)
                        .limit(1);

                    if (targetFolderData && targetFolderData.length > 0) {
                        const targetFolder = targetFolderData[0];
                        let targetParentId = null;

                        if (formValues.parentNamePath && formValues.parentNamePath.length > 0) {
                            let currentParentId = null;
                            for (const name of formValues.parentNamePath) {
                                let matchedQuery = supabase
                                    .from('well_document_folders')
                                    .select('id')
                                    .eq('pozo_name', pozo)
                                    .ilike('name', name);
                                
                                if (currentParentId) {
                                    matchedQuery = matchedQuery.eq('parent_id', currentParentId);
                                } else {
                                    matchedQuery = matchedQuery.is('parent_id', null);
                                }

                                const { data: matchedFolder } = await matchedQuery.limit(1);

                                if (matchedFolder && matchedFolder.length > 0) {
                                    currentParentId = matchedFolder[0].id;
                                } else {
                                    // Crear el padre intermedio si no existe en ese pozo
                                    const orig = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
                                    try {
                                        const newParent = await createFolder({
                                            pozoName: pozo,
                                            name: name.toUpperCase(),
                                            description: orig?.description || '',
                                            icon: orig?.icon || 'fa-solid fa-folder',
                                            parentId: currentParentId,
                                            operationalScope: state.activeOperationalScope
                                        });
                                        if (newParent && newParent.id) {
                                            currentParentId = newParent.id;
                                        }
                                    } catch (createParentErr) {
                                        console.error('[handleMoveFolderClick] Error creando carpeta padre automática:', createParentErr);
                                    }
                                }
                            }
                            targetParentId = currentParentId;
                        }

                        await supabase
                            .from('well_document_folders')
                            .update({ parent_id: targetParentId })
                            .eq('id', targetFolder.id);
                    }
                });

                await Promise.all(movePromises);
            } else {
                // Solo para el pozo local
                const { error: updateErr } = await supabase
                    .from('well_document_folders')
                    .update({ parent_id: formValues.parentId ? formValues.parentId : null })
                    .eq('id', folderId);

                if (updateErr) throw updateErr;
            }

            // Recargar datos y refrescar la vista activa
            await refreshActiveFoldersView();

            window.Swal.fire({
                icon: 'success',
                title: 'Traslado Completado',
                text: 'La carpeta ha sido reubicada de forma exitosa.',
                timer: 2000,
                showConfirmButton: false
            });
        }
    } catch (err) {
        console.error('Error al mover carpeta:', err);
        window.Swal.fire({
            icon: 'error',
            title: 'Error al trasladar',
            text: err.message || 'No se pudo mover la carpeta.'
        });
    }
};
window.handleEditFolderClick = async function(folderId, folderName) {
    if (!window.Swal) return;

    try {
        const folderDetails = await getFolderById(folderId);
        const currentIcon = folderDetails?.icon || 'fa-solid fa-folder';
        
        const { value: formValues } = await window.Swal.fire({
            title: 'Editar Carpeta',
            html: `
                <div style="text-align: left; font-family: 'Outfit', sans-serif; display:flex; flex-direction:column; gap:14px;">
                    <div>
                        <label style="font-weight: 700; color: #475569; font-size: 0.82rem; display: block; margin-bottom: 5px;">Nombre de la Carpeta</label>
                        <input id="edit-folder-name" class="swal2-input" value="${escapeHtml(folderName)}" style="width: 100%; margin: 0; box-sizing: border-box; border-radius:10px; font-size:0.9rem; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit;">
                    </div>
                    
                    <div>
                        <label style="font-weight: 700; color: #475569; font-size: 0.82rem; display: block; margin-bottom: 5px;">Descripción / Notas (Opcional)</label>
                        <textarea id="edit-folder-desc" class="swal2-textarea" style="width: 100%; margin: 0; min-height: 70px; box-sizing: border-box; border-radius:10px; padding:10px; border:1.5px solid #cbd5e1; outline:none; font-size:0.9rem; resize:none; font-family:inherit;">${escapeHtml(folderDetails?.description || '')}</textarea>
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; font-size: 0.82rem; display: block; margin-bottom: 5px;">Icono:</label>
                        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px;" id="edit-icon-picker">
                            <button type="button" class="swal-icon-btn active" id="edit-active-custom-icon" data-icon="${currentIcon}" style="padding:8px; border-radius:8px; border:1.5px solid #2563eb; background:#eff6ff; cursor:pointer; font-size:1.15rem; color:#2563eb; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">
                                <i id="edit-active-custom-icon-i" class="${currentIcon}"></i>
                            </button>
                            <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-chart-line" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-chart-line"></i></button>
                            <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-file-contract" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-file-contract"></i></button>
                            <button type="button" class="swal-icon-btn" data-icon="fa-solid fa-folder" style="padding:8px; border-radius:8px; border:1.5px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.15rem; color:#475569; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;"><i class="fa-solid fa-folder"></i></button>
                            
                            <button type="button" id="edit-more-icons-btn" style="padding:8px; border-radius:8px; border:1.5px dashed #cbd5e1; background:#f8fafc; cursor:pointer; font-size:1.15rem; color:#64748b; outline:none; display:flex; align-items:center; justify-content:center; transition:all 0.15s;" title="Más Iconos">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>

                        <div id="edit-extra-icons-wrapper" style="display:none; margin-top:10px; border-top:1.5px dashed #cbd5e1; padding-top:10px; display:none; flex-direction:column; gap:10px; grid-column: span 5;">
                            <div style="display:flex; gap:6px;">
                                <input id="edit-custom-icon-input" placeholder="Escribir clase (ej: droplet, industry)" style="flex:1; margin:0; box-sizing:border-box; border-radius:10px; font-size:0.85rem; padding:8px; border:1.5px solid #cbd5e1; outline:none; font-family:inherit;">
                                <button type="button" id="edit-apply-manual-icon" style="padding:0 12px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">Aplicar</button>
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; max-height:120px; overflow-y:auto; padding:6px; border:1.5px solid #e2e8f0; border-radius:10px; background:#f8fafc;" id="edit-extra-icons-grid">
                                ${FONT_AWESOME_LIST.map(ic => `
                                    <button type="button" class="swal-grid-icon-btn" data-icon="${ic}" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-size:1.1rem; color:#475569; display:flex; align-items:center; justify-content:center; transition:all 0.15s; outline:none;">
                                        <i class="${ic}"></i>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; padding:7px 12px; background:#eff6ff; border-radius:8px; border:1px solid #bfdbfe;">
                        <input type="checkbox" id="edit-apply-all-wells" style="width:16px; height:16px; cursor:pointer; accent-color:#2563eb;">
                        <label for="edit-apply-all-wells" style="font-weight:700; font-size:0.82rem; color:#1e40af; cursor:pointer; margin:0;">Aplicar cambios en todos los pozos</label>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Guardar Cambios',
            confirmButtonColor: '#2563eb',
            didOpen: () => {
                // Eventos del icon picker
                const picker = document.getElementById('edit-icon-picker');
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

                // Evento del botón de buscar más iconos (expandible inline)
                const moreBtn = document.getElementById('edit-more-icons-btn');
                if (moreBtn) {
                    moreBtn.addEventListener('click', () => {
                        const wrapper = document.getElementById('edit-extra-icons-wrapper');
                        if (wrapper) {
                            if (wrapper.style.display === 'none' || wrapper.style.display === '') {
                                wrapper.style.display = 'flex';
                                moreBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                                moreBtn.style.borderColor = '#2563eb';
                                moreBtn.style.color = '#2563eb';
                            } else {
                                wrapper.style.display = 'none';
                                moreBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                                moreBtn.style.borderColor = '#cbd5e1';
                                moreBtn.style.color = '#64748b';
                            }
                        }
                    });
                }

                // Eventos de click en los iconos de la grilla extra inline
                const gridBtns = document.querySelectorAll('#edit-extra-icons-grid .swal-grid-icon-btn');
                gridBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const newIcon = btn.dataset.icon;
                        const customBtn = document.getElementById('edit-active-custom-icon');
                        const customIconI = document.getElementById('edit-active-custom-icon-i');
                        if (customBtn && customIconI) {
                            customBtn.dataset.icon = newIcon;
                            customIconI.className = newIcon;
                            customBtn.click(); // seleccionar automáticamente
                        }
                    });
                });

                // Botón de aplicar manualmente
                const applyBtn = document.getElementById('edit-apply-manual-icon');
                const manualInput = document.getElementById('edit-custom-icon-input');
                if (applyBtn && manualInput) {
                    applyBtn.addEventListener('click', () => {
                        let newIcon = manualInput.value.trim();
                        if (!newIcon) return;
                        if (!newIcon.startsWith('fa-')) {
                            newIcon = `fa-solid fa-${newIcon}`;
                        }
                        const customBtn = document.getElementById('edit-active-custom-icon');
                        const customIconI = document.getElementById('edit-active-custom-icon-i');
                        if (customBtn && customIconI) {
                            customBtn.dataset.icon = newIcon;
                            customIconI.className = newIcon;
                            customBtn.click(); // seleccionar automáticamente
                        }
                    });
                }
            },
            preConfirm: () => {
                const name = document.getElementById('edit-folder-name').value.trim();
                const description = document.getElementById('edit-folder-desc').value.trim();
                const activeBtn = document.querySelector('#edit-icon-picker .swal-icon-btn.active');
                const icon = activeBtn ? activeBtn.dataset.icon : 'fa-solid fa-folder';
                const applyToAll = document.getElementById('edit-apply-all-wells')?.checked || false;
                if (!name) {
                    window.Swal.showValidationMessage('El nombre de la carpeta es obligatorio.');
                    return false;
                }
                return { name: name.toUpperCase(), description, icon, applyToAll };
            }
        });

        if (formValues) {
            window.Swal.fire({
                title: 'Guardando cambios...',
                allowOutsideClick: false,
                didOpen: () => { window.Swal.showLoading(); }
            });

            const oldName = folderDetails?.name || folderName;

            let updateQuery = supabase
                .from('well_document_folders')
                .update({
                    name: formValues.name,
                    description: formValues.description,
                    icon: formValues.icon
                });

            if (formValues.applyToAll) {
                updateQuery = updateQuery.ilike('name', oldName);
                if (folderDetails && folderDetails.parent_id === null) {
                    updateQuery = updateQuery.is('parent_id', null);
                } else {
                    updateQuery = updateQuery.not('parent_id', 'is', null);
                }
            } else {
                updateQuery = updateQuery.eq('id', folderId);
            }

            const { error } = await updateQuery;

            if (error) throw error;

            // Si es carpeta raíz (parent_id es null) y cambió el nombre, actualizamos la columna categoria de documentos asociados
            if (folderDetails && folderDetails.parent_id === null) {
                const oldCat = oldName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                const newCat = formValues.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                
                if (oldCat !== newCat) {
                    let docUpdateQuery = supabase
                        .from('well_historical_documents')
                        .update({ categoria: newCat });

                    if (formValues.applyToAll) {
                        docUpdateQuery = docUpdateQuery.eq('categoria', oldCat);
                    } else {
                        docUpdateQuery = docUpdateQuery.eq('folder_id', folderId);
                    }
                    
                    const { error: docErr } = await docUpdateQuery;
                    if (docErr) console.warn('[handleEditFolderClick] Error actualizando categoria de documentos:', docErr);
                }
            }

            // Recargar datos y refrescar la vista activa
            await refreshActiveFoldersView();

            window.Swal.fire({
                icon: 'success',
                title: 'Carpeta Actualizada',
                text: 'Los cambios se han guardado exitosamente.',
                timer: 2000,
                showConfirmButton: false
            });
        }
    } catch (err) {
        console.error('Error al editar carpeta:', err);
        window.Swal.fire({
            icon: 'error',
            title: 'Error al actualizar',
            text: err.message || 'No se pudo guardar la edición de la carpeta.'
        });
    }
};

async function refreshActiveFoldersView() {
    if (state.activePozo) {
        const folders = await getFolders({
            pozoName: state.activePozo,
            parentId: null,
            operationalScope: state.activeOperationalScope
        });
        state.currentFolders = folders || [];
        
        const { data: allFoldersList } = await supabase
            .from('well_document_folders')
            .select('*')
            .eq('pozo_name', String(state.activePozo).trim().toUpperCase());
        state.allFoldersList = allFoldersList || [];

        const allDocs = await getWellDocuments({
            pozoName: state.activePozo,
            operationalScope: state.activeOperationalScope
        });
        state.currentAllDocs = allDocs || [];
    }
    if (state.activeFolderId) {
        const pathFolder = state.currentFolderPath.find(p => p.id === state.activeFolderId);
        if (pathFolder) {
            const updatedFolderObj = state.currentFolders.find(f => f.id === state.activeFolderId);
            if (updatedFolderObj) {
                pathFolder.name = updatedFolderObj.name;
            }
        }
        const currentFolder = state.currentFolderPath[state.currentFolderPath.length - 1];
        await openFolderView(state.activeFolderId, currentFolder.name);
    } else if (state.activePozo) {
        openFoldersView(state.activePozo);
    }
}

/**
 * Inicializa los eventos de la papelera de reciclaje y el dashboard de almacenamiento.
 */
function initStorageAndTrashEvents() {
    const btnOpenStorage = document.getElementById('btn-open-storage-dashboard');
    const btnBackFromStorage = document.getElementById('btn-back-from-storage');
    const btnOpenTrash = document.getElementById('btn-open-trash');
    const btnBackFromTrash = document.getElementById('btn-back-from-trash');

    if (btnOpenStorage) {
        btnOpenStorage.addEventListener('click', async () => {
            // Ocultar las demás vistas
            document.getElementById('view-wells-container').hidden = true;
            document.getElementById('view-folders-container').hidden = true;
            document.getElementById('view-files-container').hidden = true;
            document.getElementById('view-search-results-container').hidden = true;
            document.getElementById('view-trash-container').hidden = true;

            // Mostrar el dashboard
            document.getElementById('view-storage-dashboard-container').hidden = false;

            // Cargar datos y renderizar gráficos
            await loadAndRenderStorageStats();
        });
    }

    if (btnBackFromStorage) {
        btnBackFromStorage.addEventListener('click', () => {
            document.getElementById('view-storage-dashboard-container').hidden = true;
            restoreActiveView();
        });
    }

    if (btnOpenTrash) {
        btnOpenTrash.addEventListener('click', async () => {
            document.getElementById('view-storage-dashboard-container').hidden = true;
            document.getElementById('view-trash-container').hidden = false;
            await loadAndRenderTrashTable();
        });
    }

    if (btnBackFromTrash) {
        btnBackFromTrash.addEventListener('click', async () => {
            document.getElementById('view-trash-container').hidden = true;
            document.getElementById('view-storage-dashboard-container').hidden = false;
            await loadAndRenderStorageStats(); // refrescar estadísticas tras vaciar papelera
        });
    }
}

/**
 * Recupera todos los archivos activos del contrato y genera las métricas y gráficos (Chart.js)
 */
async function loadAndRenderStorageStats() {
    try {
        // Cargar contador de la papelera en segundo plano para actualizar el botón
        getDeletedWellDocuments({ operationalScope: state.activeOperationalScope }).then(docs => {
            const badge = document.getElementById('trash-badge-count');
            if (badge) badge.innerText = docs.length;
        }).catch(err => console.warn('Error al obtener conteo de papelera:', err));

        // 1. Obtener peso total y datos de la base de datos (solo campos necesarios)
        let dbQuery = supabase
            .from('well_historical_documents')
            .select('pozo_name, categoria, file_size')
            .is('deleted_at', null);

        if (state.activeOperationalScope) {
            dbQuery = dbQuery.or(`operational_scope.eq.${state.activeOperationalScope},operational_scope.is.null`);
        }

        let { data: allDocs, error } = await dbQuery;
        if (error && String(error.message || error).includes('deleted_at')) {
            console.warn('[storage-stats] La columna deleted_at no existe; reintentando sin filtro de borrado lógico.');
            let fallbackQuery = supabase
                .from('well_historical_documents')
                .select('pozo_name, categoria, file_size');
            if (state.activeOperationalScope && !String(error.message || error).includes('operational_scope')) {
                fallbackQuery = fallbackQuery.or(`operational_scope.eq.${state.activeOperationalScope},operational_scope.is.null`);
            }
            const fallbackResult = await fallbackQuery;
            allDocs = fallbackResult.data;
            error = fallbackResult.error;
        }
        if (error) throw error;

        const docs = allDocs || [];
        const totalFiles = docs.length;
        const totalSize = docs.reduce((acc, d) => acc + (d.file_size || 0), 0);
        const avgSize = totalFiles > 0 ? (totalSize / totalFiles) : 0;

        // Quota: 100 GB = 100 * 1024 * 1024 * 1024 bytes
        const quotaBytes = 100 * 1024 * 1024 * 1024;
        const percent = Math.min((totalSize / quotaBytes) * 100, 100);

        // Actualizar UI
        const formatSize = (bytes) => {
            if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
            if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${bytes} Bytes`;
        };

        const storageUsedVal = document.getElementById('storage-used-val');
        if (storageUsedVal) storageUsedVal.innerText = formatSize(totalSize);

        const storageProgressBar = document.getElementById('storage-progress-bar');
        if (storageProgressBar) {
            storageProgressBar.style.width = `${percent}%`;
            // Cambiar colores dinámicos
            if (percent > 85) {
                storageProgressBar.style.background = '#ef4444'; // Rojo crítico
            } else if (percent > 60) {
                storageProgressBar.style.background = '#f59e0b'; // Naranja preventivo
            } else {
                storageProgressBar.style.background = 'linear-gradient(90deg, #3b82f6, #10b981)'; // Azul a verde
            }
        }

        const storagePercentDesc = document.getElementById('storage-percent-desc');
        if (storagePercentDesc) {
            storagePercentDesc.innerText = `Utilizando ${percent.toFixed(2)}% de la capacidad de almacenamiento asignada.`;
        }

        const storageFilesCount = document.getElementById('storage-files-count');
        if (storageFilesCount) storageFilesCount.innerText = totalFiles.toLocaleString();

        const storageAvgSize = document.getElementById('storage-avg-size');
        if (storageAvgSize) storageAvgSize.innerText = formatSize(avgSize);

        // 1.5 Obtener y renderizar los últimos 5 archivos subidos
        try {
            let recentQuery = supabase
                .from('well_historical_documents')
                .select('pozo_name, categoria, nombre_archivo, file_size, uploaded_by, created_at, well_document_folders(name)')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5);

            if (state.activeOperationalScope) {
                recentQuery = recentQuery.or(`operational_scope.eq.${state.activeOperationalScope},operational_scope.is.null`);
            }

            let { data: recentDocs, error: recentErr } = await recentQuery;
            if (recentErr && String(recentErr.message || recentErr).includes('deleted_at')) {
                let fallbackRecent = supabase
                    .from('well_historical_documents')
                    .select('pozo_name, categoria, nombre_archivo, file_size, uploaded_by, created_at, well_document_folders(name)')
                    .order('created_at', { ascending: false })
                    .limit(5);
                if (state.activeOperationalScope && !String(recentErr.message || recentErr).includes('operational_scope')) {
                    fallbackRecent = fallbackRecent.or(`operational_scope.eq.${state.activeOperationalScope},operational_scope.is.null`);
                }
                const fallbackRes = await fallbackRecent;
                recentDocs = fallbackRes.data;
                recentErr = fallbackRes.error;
            }

            const recentTbody = document.getElementById('storage-recent-table-body');
            if (recentTbody) {
                if (recentErr || !recentDocs || recentDocs.length === 0) {
                    recentTbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align:center; padding:24px; color:#64748b;">
                                <i class="fa-solid fa-folder-open" style="font-size:1.4rem; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
                                <span>No hay archivos cargados recientemente.</span>
                            </td>
                        </tr>
                    `;
                } else {
                    const getFriendlyCategory = (catKey, folderObj) => {
                        if (folderObj && folderObj.name) return folderObj.name;
                        const catMap = {
                            'SIMULACIONES': 'Simulaciones',
                            'INFORMES_TECNICOS': 'Informes Técnicos',
                            'PRUEBAS_PRODUCCION': 'Pruebas de Producción',
                            'FICHAS_BES': 'Fichas Técnicas BES',
                            'REGISTROS_ECHOMETER': 'Registros Echometer',
                            'DATA_SENSOR': 'Data Sensor Fondo',
                            'DESCARGA_DATA': 'Descarga Data VSD',
                            'SOPORTES_DE_CAMPO': 'Soportes de Campo',
                            'NOVEDADES': 'Novedades',
                            'CONTRATOS': 'Contratos',
                            'FORMATOS': 'Formatos',
                            'MINUTAS': 'Minutas',
                            'SIAHO': 'SIAHO',
                            'FORMATOS_ADMIN': 'Formatos Admin',
                            'INVENTARIO': 'Inventario'
                        };
                        return catMap[catKey] || catKey;
                    };

                    recentTbody.innerHTML = recentDocs.map(doc => {
                        const pozoClean = doc.pozo_name === '_GENERAL' ? 'Información General' : (doc.pozo_name === '_GERENCIAL' ? 'Gerencial' : doc.pozo_name);
                        return `
                            <tr style="font-weight:600; color:#334155;">
                                <td><span class="badge" style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:6px;">${pozoClean}</span></td>
                                <td><span style="font-size:0.82rem; color:#64748b;"><i class="fa-solid fa-folder" style="margin-right:4px;color:#94a3b8;"></i>${getFriendlyCategory(doc.categoria, doc.well_document_folders)}</span></td>
                                <td style="max-width:240px; word-break:break-all;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <i class="fa-solid fa-file" style="color:#2563eb;"></i>
                                        <span title="${escapeHtml(doc.nombre_archivo)}">${escapeHtml(doc.nombre_archivo)}</span>
                                    </div>
                                </td>
                                <td>${formatSize(doc.file_size)}</td>
                                <td><span style="font-size:0.82rem; color:#64748b;">${escapeHtml(doc.uploaded_by || 'Admin')}</span></td>
                                <td><span style="font-size:0.82rem; color:#64748b;"><i class="fa-solid fa-calendar" style="margin-right:4px;color:#94a3b8;"></i>${new Date(doc.created_at).toLocaleDateString('es-ES')}</span></td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        } catch (recentFetchErr) {
            console.error('Error al cargar archivos recientes para el dashboard:', recentFetchErr);
        }

        // 2. Gráfico 1: Espacio por Categoría (Doughnut)
        const categoriesMap = {
            'SIMULACIONES': 'Simulaciones',
            'INFORMES': 'Informes', 'INFORMES_TECNICOS': 'Informes',
            'PRUEBAS': 'Pruebas', 'PRUEBAS_PRODUCCION': 'Pruebas',
            'FICHAS': 'Fichas BES', 'FICHAS_BES': 'Fichas BES',
            'ECHOMETER': 'Echometer', 'REGISTROS_ECHOMETER': 'Echometer',
            'SENSOR': 'Sensor Fondo', 'DATA_SENSOR': 'Sensor Fondo',
            'VSD': 'Variador VSD', 'DESCARGA_DATA': 'Variador VSD',
            'SOPORTES': 'Soportes de Campo', 'SOPORTES_DE_CAMPO': 'Soportes de Campo',
            'NOVEDADES': 'Novedades',
            'CONTRATOS': 'Contratos',
            'FORMATOS': 'Formatos',
            'MINUTAS': 'Minutas',
            'SIAHO': 'SIAHO',
            'FORMATOS_ADMIN': 'Formatos Admin',
            'INVENTARIO': 'Inventario'
        };

        const sizeByCategory = {};
        docs.forEach(d => {
            const catKey = d.categoria || 'OTROS';
            const catName = categoriesMap[catKey] || catKey;
            sizeByCategory[catName] = (sizeByCategory[catName] || 0) + (d.file_size || 0);
        });

        // Convertir bytes a MB para el gráfico
        const categoryLabels = [];
        const categoryValues = [];
        Object.entries(sizeByCategory).forEach(([label, bytes]) => {
            categoryLabels.push(label);
            categoryValues.push((bytes / 1048576).toFixed(2)); // MBs
        });

        // Destruir instancia anterior para evitar leaks
        if (categoryChartInstance) categoryChartInstance.destroy();

        const ctxCategory = document.getElementById('storage-category-chart')?.getContext('2d');
        if (ctxCategory && categoryLabels.length > 0) {
            categoryChartInstance = new Chart(ctxCategory, {
                type: 'doughnut',
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        data: categoryValues,
                        backgroundColor: [
                            '#0284c7', '#16a34a', '#d97706', '#9333ea', 
                            '#2563eb', '#0d9488', '#b45309', '#ef4444', 
                            '#db2777', '#4338ca', '#0891b2', '#ea580c', 
                            '#a21caf', '#4d7c0f', '#64748b'
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                font: { size: 9, weight: '700' },
                                boxWidth: 10
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.label}: ${context.raw} MB`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 3. Gráfico 2: Top 5 Pozos más Pesados (Horizontal Bar)
        const sizeByWell = {};
        docs.forEach(d => {
            const pozo = d.pozo_name || 'SIN POZO';
            if (pozo !== '_GENERAL' && pozo !== '_GERENCIAL') {
                sizeByWell[pozo] = (sizeByWell[pozo] || 0) + (d.file_size || 0);
            }
        });

        const sortedWells = Object.entries(sizeByWell)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const wellLabels = sortedWells.map(([pozo]) => pozo);
        const wellValues = sortedWells.map(([, bytes]) => (bytes / 1048576).toFixed(2)); // MBs

        if (wellsChartInstance) wellsChartInstance.destroy();

        const ctxWells = document.getElementById('storage-wells-chart')?.getContext('2d');
        if (ctxWells && wellLabels.length > 0) {
            wellsChartInstance = new Chart(ctxWells, {
                type: 'bar',
                data: {
                    labels: wellLabels,
                    datasets: [{
                        label: 'Espacio (MB)',
                        data: wellValues,
                        backgroundColor: 'rgba(37, 99, 235, 0.85)',
                        hoverBackgroundColor: 'rgba(37, 99, 235, 1)',
                        borderRadius: 6,
                        borderWidth: 0
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.raw} MB`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 9, weight: '600' }
                            }
                        },
                        y: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 9, weight: '700' }
                            }
                        }
                    }
                }
            });
        }

    } catch (err) {
        console.error('Error cargando estadísticas de almacenamiento:', err);
    }
}

/**
 * Carga los documentos en la papelera de reciclaje y renderiza la tabla.
 */
async function loadAndRenderTrashTable() {
    const tbody = document.getElementById('trash-table-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:30px; color:#64748b;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:1.4rem; color:#2563eb; margin-bottom:8px;"></i>
                <p style="margin:0; font-weight:600;">Cargando papelera de reciclaje...</p>
            </td>
        </tr>
    `;

    try {
        const docs = await getDeletedWellDocuments({ operationalScope: state.activeOperationalScope });
        
        // Actualizar el contador en la cabecera
        const badge = document.getElementById('trash-badge-count');
        if (badge) badge.innerText = docs.length;

        if (docs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:48px; color:#64748b;">
                        <i class="fa-solid fa-trash-arrow-up" style="font-size:2rem; color:#cbd5e1; margin-bottom:10px;"></i>
                        <p style="margin:0; font-weight:700; font-size:0.95rem;">La papelera está vacía</p>
                        <span style="font-size:0.82rem;">Los archivos eliminados aparecerán aquí para su restauración o eliminación definitiva.</span>
                    </td>
                </tr>
            `;
            return;
        }

        const formatFileSize = (bytes) => {
            const num = Number(bytes || 0);
            if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
            if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
            return `${num} Bytes`;
        };

        const formatShortDate = (isoString) => {
            if (!isoString) return '--';
            const d = new Date(isoString);
            return d.toLocaleString('es-ES', { 
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        };

        const getFriendlyCategory = (catKey, folderObj) => {
            if (folderObj && folderObj.name) return folderObj.name;
            const catMap = {
                'SIMULACIONES': 'Simulaciones',
                'INFORMES_TECNICOS': 'Informes Técnicos',
                'PRUEBAS_PRODUCCION': 'Pruebas de Producción',
                'FICHAS_BES': 'Fichas Técnicas BES',
                'REGISTROS_ECHOMETER': 'Registros Echometer',
                'DATA_SENSOR': 'Data Sensor Fondo',
                'DESCARGA_DATA': 'Descarga Data VSD',
                'SOPORTES_DE_CAMPO': 'Soportes de Campo',
                'NOVEDADES': 'Novedades',
                'CONTRATOS': 'Contratos',
                'FORMATOS': 'Formatos',
                'MINUTAS': 'Minutas',
                'SIAHO': 'SIAHO',
                'FORMATOS_ADMIN': 'Formatos Admin',
                'INVENTARIO': 'Inventario'
            };
            return catMap[catKey] || catKey;
        };

        tbody.innerHTML = docs.map((doc, idx) => {
            const pozoClean = doc.pozo_name === '_GENERAL' ? 'Información General' : (doc.pozo_name === '_GERENCIAL' ? 'Gerencial' : doc.pozo_name);
            return `
                <tr style="font-weight:600; color:#334155;">
                    <td><span class="badge" style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:6px;">${pozoClean}</span></td>
                    <td><span style="font-size:0.82rem; color:#64748b;"><i class="fa-solid fa-folder" style="margin-right:4px;color:#94a3b8;"></i>${getFriendlyCategory(doc.categoria, doc.well_document_folders)}</span></td>
                    <td style="max-width:240px; word-break:break-all;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-file" style="color:#2563eb;"></i>
                            <span title="${escapeHtml(doc.nombre_archivo)}">${escapeHtml(doc.nombre_archivo)}</span>
                        </div>
                    </td>
                    <td>${formatFileSize(doc.file_size)}</td>
                    <td><span style="font-size:0.82rem; color:#64748b;">${escapeHtml(doc.uploaded_by || 'Admin')}</span></td>
                    <td><span style="font-size:0.82rem; color:#ef4444;"><i class="fa-solid fa-calendar-xmark" style="margin-right:4px;"></i>${formatShortDate(doc.deleted_at)}</span></td>
                    <td style="text-align:center;">
                        <div style="display:inline-flex; gap:6px;">
                            <button type="button" class="btn-restore" data-id="${doc.id}" data-name="${escapeHtml(doc.nombre_archivo)}" style="padding:6px 10px; background:#e6f4ea; border:none; border-radius:6px; color:#137333; cursor:pointer; font-weight:700; display:flex; align-items:center; gap:4px; transition:all 0.15s;" title="Restaurar archivo">
                                <i class="fa-solid fa-trash-arrow-up"></i>
                                <span>Restaurar</span>
                            </button>
                            <button type="button" class="btn-hard-delete" data-id="${doc.id}" data-path="${escapeHtml(doc.file_path)}" data-name="${escapeHtml(doc.nombre_archivo)}" style="padding:6px 10px; background:#fce8e6; border:none; border-radius:6px; color:#c5221f; cursor:pointer; font-weight:700; display:flex; align-items:center; gap:4px; transition:all 0.15s;" title="Borrar físicamente del almacenamiento">
                                <i class="fa-solid fa-dumpster-fire"></i>
                                <span>Eliminar</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Vincular acciones de Restauración
        tbody.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.dataset.id;
                const docName = btn.dataset.name;

                const result = await Swal.fire({
                    title: '¿Restaurar Archivo?',
                    html: `<p style="color:#64748b;">¿Deseas restaurar el archivo <strong>${docName}</strong>? Volverá a aparecer en su pozo y carpeta originales.</p>`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, restaurar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#059669',
                    cancelButtonColor: '#64748b'
                });

                if (result.isConfirmed) {
                    Swal.fire({
                        title: 'Restaurando archivo...',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });

                    try {
                        await restoreWellDocument(docId);
                        Swal.close();
                        showSuccessToast('Archivo Restaurado', `El documento "${docName}" se ha recuperado con éxito.`);
                        await loadAndRenderTrashTable();
                    } catch (err) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error al restaurar',
                            text: err.message || 'No se pudo recuperar el archivo.'
                        });
                    }
                }
            });
        });

        // Vincular acciones de Eliminación Definitiva
        tbody.querySelectorAll('.btn-hard-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const docId = btn.dataset.id;
                const docPath = btn.dataset.path;
                const docName = btn.dataset.name;

                const result = await Swal.fire({
                    title: '¿ELIMINAR DEFINITIVAMENTE?',
                    html: `
                        <div style="color:#64748b; text-align:left;">
                            <p>Estás a punto de borrar <strong>${docName}</strong> de forma permanente.</p>
                            <p style="color:#ef4444; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Esta acción es irreversible y liberará espacio en el servidor de disco.</p>
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, borrar del disco',
                    cancelButtonText: 'Conservar',
                    confirmButtonColor: '#dc2626',
                    cancelButtonColor: '#64748b'
                });

                if (result.isConfirmed) {
                    Swal.fire({
                        title: 'Borrando del disco físico...',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });

                    try {
                        await permanentlyDeleteWellDocument(docId, docPath);
                        Swal.close();
                        showSuccessToast('Archivo Borrado', `El documento "${docName}" ha sido eliminado del Storage y la base de datos.`);
                        await loadAndRenderTrashTable();
                    } catch (err) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error al eliminar',
                            text: err.message || 'No se pudo vaciar el archivo de forma física.'
                        });
                    }
                }
            });
        });

    } catch (err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:30px; color:#ef4444;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem; margin-bottom:8px;"></i>
                    <p style="margin:0; font-weight:700;">Error al obtener papelera</p>
                    <span style="font-size:0.82rem;">${err.message || 'Error de conexión con base de datos.'}</span>
                </td>
            </tr>
        `;
    }
}

