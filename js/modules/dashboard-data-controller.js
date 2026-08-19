let managementOutsideClickListener = null;
let importNavigationLockListener = null;

import { logout, getAccessProfile, getDefaultRouteForAccessProfile, getSession } from '../auth.js';
        import { getMonitoringData, getUniquePozos, getLatestDate, insertRecord, updateRecord, syncMonitoringRecords, previewMonitoringSync, saveTechnicalMeasurement, syncTechnicalMeasurements, previewTechnicalMeasurements, getRecordById, getWellTechnicalData, getRecentTechnicalMeasurements, deleteRecord, getWellBESProfile, upsertWellBESProfile, buildMonitoringRecordKey, getWellLevelTests, saveLevelTest, getRecentLevelTests, previewLevelTestsSync, syncLevelTests } from '../data-service.js';
        import { getActiveOperationalScope, getActiveOperationalScopeWellNames, initOperationalScopeContext, renderOperationalScopeSwitcher } from '../services/operational-scope-context.js';
        import { previewManualMonitoringIntoConsolidated, upsertManualMonitoringIntoConsolidated } from '../services/consolidado-service.js';

        let isEditing = false;
        let knownPozos = new Set();
        let activeOperationalScope = 'ceiba_tomoporo';
        let activeScopePozoNames = [];
        let activeScopePozoSet = new Set();
        let activeRecentHistoryMode = 'operational';
        const ACTIVE_POZO_STORAGE_KEY = 'uv-selected-pozo';
        const MANAGEMENT_POZO_SELECTORS = [
            { inputId: 'pozo_name', menuId: 'pozo_name_menu', toggleId: 'pozo_name_toggle' },
            { inputId: 'tech_pozo_name', menuId: 'tech_pozo_name_menu', toggleId: 'tech_pozo_name_toggle' },
            { inputId: 'pump_pozo_name', menuId: 'pump_pozo_name_menu', toggleId: 'pump_pozo_name_toggle' },
            { inputId: 'level_pozo_name', menuId: 'level_pozo_name_menu', toggleId: 'level_pozo_name_toggle' }
        ];
        const BES_PROFILE_FORM_FIELDS = [
            'pump_type',
            'pump_manufacturer',
            'pump_model',
            'pump_serial',
            'suction_ft',
            'multiphase_pump',
            'gas_separator',
            'seal_section',
            'motor_manufacturer',
            'motor_model',
            'motor_hp',
            'motor_voltage',
            'motor_current',
            'amp_nominal_motor',
            'volt_nominal_motor',
            'frec_max_hz',
            'low_speed_hz',
            'ul_a',
            'ol_a',
            'i_limit_a',
            'tiempo_desaceleracion_seg',
            'low_pip_shutdown_psi',
            'max_high_temp_shutdown_f',
            'sensor_model',
            'cable_type',
            'drain_valve',
            'installed_at',
            'profile_notes',
            'vsd_kva',
            'marca_vsd',
            'modelo_vsd',
            'tx_kva',
            'tap_v',
            'rt'
        ];

        function getStoredSelectedPozo() {
            return sessionStorage.getItem(ACTIVE_POZO_STORAGE_KEY) || '';
        }

        function setStoredSelectedPozo(pozoName) {
            if (pozoName) {
                sessionStorage.setItem(ACTIVE_POZO_STORAGE_KEY, pozoName);
            } else {
                sessionStorage.removeItem(ACTIVE_POZO_STORAGE_KEY);
            }
        }

        function getSortedKnownPozos() {
            return [...knownPozos].sort((a, b) => a.localeCompare(b));
        }

        function normalizePozoName(value) {
            return String(value || '').trim().toUpperCase();
        }

        function setActiveScopePozoNames(pozoNames = []) {
            activeScopePozoNames = [...new Set((Array.isArray(pozoNames) ? pozoNames : [pozoNames]).map(normalizePozoName).filter(Boolean))];
            activeScopePozoSet = new Set(activeScopePozoNames);
        }

        function isPozoAllowedByActiveScope(pozoName) {
            return activeScopePozoSet.has(normalizePozoName(pozoName));
        }

        function filterRowsByActiveScope(rows = [], pozoFieldName = 'pozo_name') {
            if (!activeScopePozoSet.size) return [];
            return (Array.isArray(rows) ? rows : []).filter(row => isPozoAllowedByActiveScope(row?.[pozoFieldName] || row?.pozo));
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function closeManagementPozoMenus(exceptMenuId = '') {
            MANAGEMENT_POZO_SELECTORS.forEach(({ menuId }) => {
                if (menuId === exceptMenuId) return;
                document.getElementById(menuId)?.classList.remove('active');
            });
        }

        function renderManagementPozoMenu({ inputId, menuId }, ignoreSearch = false) {
            const input = document.getElementById(inputId);
            const menu = document.getElementById(menuId);
            if (!input || !menu) return;

            const searchTerm = ignoreSearch ? '' : input.value.trim().toLowerCase();
            const pozos = getSortedKnownPozos().filter(pozo => !searchTerm || pozo.toLowerCase().includes(searchTerm));

            if (pozos.length === 0) {
                menu.innerHTML = '<div class="management-pozo-empty">No hay pozos para esa búsqueda.</div>';
                return;
            }

            menu.innerHTML = pozos.map(pozo => `
                <button type="button" class="management-pozo-option ${pozo === input.value.trim().toUpperCase() ? 'active' : ''}" data-pozo="${escapeHtml(pozo)}">
                    <span class="management-pozo-option-name">${escapeHtml(pozo)}</span>
                </button>
            `).join('');

            menu.querySelectorAll('.management-pozo-option').forEach(button => {
                button.addEventListener('click', () => {
                    input.value = button.dataset.pozo || '';
                    menu.classList.remove('active');
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
        }

        function openManagementPozoMenu(config, ignoreSearch = false) {
            const menu = document.getElementById(config.menuId);
            if (!menu) return;
            closeManagementPozoMenus(config.menuId);
            renderManagementPozoMenu(config, ignoreSearch);
            menu.classList.add('active');
        }

        function initializeManagementPozoSelectors() {
            MANAGEMENT_POZO_SELECTORS.forEach(config => {
                const input = document.getElementById(config.inputId);
                const toggle = document.getElementById(config.toggleId);
                const menu = document.getElementById(config.menuId);
                if (!input || !toggle || !menu) return;

                input.addEventListener('focus', () => {
                    if (input.value.trim()) {
                        input.select();
                    }
                });

                input.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openManagementPozoMenu(config, true);
                });

                input.addEventListener('input', () => {
                    openManagementPozoMenu(config, false);
                });

                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') {
                        menu.classList.remove('active');
                    }
                });

                toggle.addEventListener('click', () => {
                    const shouldOpen = !menu.classList.contains('active');
                    if (shouldOpen) {
                        openManagementPozoMenu(config, true);
                        input.focus();
                    } else {
                        menu.classList.remove('active');
                    }
                });
            });

            managementOutsideClickListener = (event) => {
                MANAGEMENT_POZO_SELECTORS.forEach(({ inputId, menuId, toggleId }) => {
                    const input = document.getElementById(inputId);
                    const menu = document.getElementById(menuId);
                    const toggle = document.getElementById(toggleId);
                    if (!input || !menu || !toggle) return;

                    const clickedInside = input.contains(event.target) || menu.contains(event.target) || toggle.contains(event.target);
                    if (!clickedInside) {
                        menu.classList.remove('active');
                    }
                });
            };
        }

        async function updatePozoRecordStatus(pozoName, prefix) {
            const statusText = document.getElementById(`${prefix}-pozo-status-text`);
            const statusDot = document.querySelector(`#${prefix}-pozo-status .pozo-record-dot`);
            if (!statusText || !statusDot) return;

            statusDot.classList.remove('active', 'inactive');

            if (!pozoName) {
                statusText.textContent = 'Selecciona un pozo para ver su estado.';
                return;
            }

            let latestDate = null;
            if (prefix === 'level') {
                try {
                    const tests = await getWellLevelTests(pozoName);
                    if (tests && tests.length > 0) {
                        latestDate = tests[0].fecha;
                    }
                } catch (e) {
                    console.error(e);
                }
            } else if (prefix === 'technical') {
                try {
                    const techData = await getWellTechnicalData(pozoName);
                    if (techData && techData.fecha) {
                        latestDate = techData.fecha;
                    }
                } catch (e) {
                    console.error(e);
                }
            } else {
                latestDate = await getLatestDate(pozoName);
            }

            if (latestDate) {
                statusDot.classList.add('active');
                statusText.textContent = prefix === 'level' 
                    ? `Pruebas registradas. Última fecha: ${latestDate}.`
                    : (prefix === 'technical' 
                        ? `Medición técnica registrada. Fecha: ${latestDate}.` 
                        : `Con registros. Ultimo dia cargado: ${latestDate}.`);
                return;
            }

            statusDot.classList.add('inactive');
            statusText.textContent = prefix === 'level'
                ? 'Sin pruebas de nivel cargadas.'
                : (prefix === 'technical' 
                    ? 'Sin medición técnica cargada.' 
                    : 'Sin registros de monitoreo cargados.');
        }

        async function updatePumpProfileStatus(pozoName) {
            const statusText = document.getElementById('pump-pozo-status-text');
            const statusDot = document.querySelector('#pump-pozo-status .pozo-record-dot');
            if (!statusText || !statusDot) return;

            statusDot.classList.remove('active', 'inactive');

            if (!pozoName) {
                statusText.textContent = 'Selecciona un pozo para consultar su configuración actual.';
                return;
            }

            try {
                const profile = await getWellBESProfile(pozoName);
                if (profile?.pump_type) {
                    statusDot.classList.add('active');
                    const maker = profile.pump_manufacturer ? ` · ${profile.pump_manufacturer}` : '';
                    statusText.textContent = `Ficha BES configurada: ${profile.pump_type}${maker}.`;
                    return;
                }

                statusDot.classList.add('inactive');
                statusText.textContent = 'Este pozo aun no tiene ficha BES registrada.';
            } catch (error) {
                statusText.textContent = error.message;
            }
        }

        export async function initDashboardData() {
            // Inyectar funciones globales para el control de modales en la SPA
            window.openGestionModal = function(modalId) {
                const modal = document.getElementById(modalId);
                if (!modal) return;
                modal.classList.add('open');
                document.body.style.overflow = 'hidden';
                const inputId = modalId === 'modal-daily-entry' ? 'pozo_name' : (modalId === 'modal-technical-entry' ? 'tech_pozo_name' : (modalId === 'modal-level-entry' ? 'level_pozo_name' : 'pump_pozo_name'));
                const input = document.getElementById(inputId);
                if (input) setTimeout(() => { input.focus(); }, 60);
            };

            window.closeGestionModal = function(modalId, forceClose = false) {
                const modal = document.getElementById(modalId);
                if (!modal) return;

                // Si no es forzado, verificar si el formulario tiene datos
                if (!forceClose) {
                    const form = modal.querySelector('form');
                    if (form && isFormDirty(form)) {
                        Swal.fire({
                            title: '¿Salir sin guardar?',
                            text: 'Tienes datos sin guardar en el formulario. Si sales, perderás la información ingresada.',
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#EF4444',
                            cancelButtonColor: '#64748B',
                            confirmButtonText: 'Sí, salir',
                            cancelButtonText: 'Continuar editando'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                modal.classList.remove('open');
                                document.body.style.overflow = '';
                            }
                        });
                        return;
                    }
                }

                modal.classList.remove('open');
                document.body.style.overflow = '';
            };

            window.closeGestionModalOnClickOutside = function(event, modalId) {
                if (event.target && event.target.classList && event.target.classList.contains('gestion-modal-overlay')) {
                    window.closeGestionModal(modalId);
                }
            };

            // Detecta si un formulario tiene campos con datos ingresados
            function isFormDirty(form) {
                const inputs = form.querySelectorAll('input, select, textarea');
                for (const input of inputs) {
                    if (input.type === 'hidden' || input.type === 'file' || input.style.display === 'none') continue;
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        if (input.checked) return true;
                    } else if (input.tagName === 'SELECT') {
                        if (input.selectedIndex > 0) return true;
                    } else {
                        if (input.value && input.value.trim() !== '') return true;
                    }
                }
                return false;
            }

            window.toggleGestionInfo = function(infoId) {
                const card = document.getElementById(infoId);
                if (!card) return;
                card.style.display = (card.style.display === 'none' || !card.style.display) ? 'block' : 'none';
            };

            const session = await getSession();
            if (!session) window.location.href = 'index.html';
            const accessProfile = getAccessProfile(session);
            if (!accessProfile.canViewManagement) {
                window.location.href = getDefaultRouteForAccessProfile(accessProfile);
                return;
            }
            const operationalScopeContext = await initOperationalScopeContext(session, accessProfile);
            renderOperationalScopeSwitcher(document.getElementById('gestion-operational-scope-switcher'), operationalScopeContext, {
                onChange: () => {
                    sessionStorage.removeItem(ACTIVE_POZO_STORAGE_KEY);
                    window.location.reload();
                }
            });
            activeOperationalScope = getActiveOperationalScope();
            setActiveScopePozoNames(await getActiveOperationalScopeWellNames().catch(error => {
                console.warn('No se pudieron cargar pozos del contrato activo en Gestion:', error);
                return [];
            }));
            await initApp();
            document.addEventListener('click', managementOutsideClickListener);
            document.addEventListener('click', importNavigationLockListener, true);
        }

        // Inicializa la pagina, recupera contexto previo y deja listos formularios y selectores.
        async function initApp() {
            document.getElementById('fecha').valueAsDate = new Date();
            resetForm();
            setManualFormVisibility(false);
            resetTechnicalForm();
            setTechnicalFormVisibility(false);
            resetPumpProfileForm();
            setPumpProfileVisibility(false);
            resetLevelForm();
            await refreshPozoLists();
            initializeManagementPozoSelectors();

            const storedPozo = getStoredSelectedPozo();
            if (storedPozo) {
                document.getElementById('pozo_name').value = storedPozo;
                document.getElementById('pump_pozo_name').value = storedPozo;
                document.getElementById('level_pozo_name').value = storedPozo;
                await syncDailyPozoContext();
                await syncPumpPozoContext();
                await syncLevelPozoContext();
            }
            await updatePozoRecordStatus(document.getElementById('pozo_name').value.trim(), 'daily');
            await updatePozoRecordStatus(document.getElementById('tech_pozo_name').value.trim(), 'technical');
            await updatePozoRecordStatus(document.getElementById('level_pozo_name').value.trim(), 'level');
            await updatePumpProfileStatus(document.getElementById('pump_pozo_name').value.trim());
            
            // Si llegamos con ?edit=..., abrimos el registro en modo edicion.
            const urlParams = new URLSearchParams(window.location.search);
            const editId = urlParams.get('edit');
            if (editId) {
                loadAndFillForm(editId);
            }

            // Recalcula BNPD en vivo a partir de BBPD y porcentaje de agua.
            const bbpdInput = document.getElementById('bbpd_tech');
            const aysInput = document.getElementById('ays_tech');
            const bnpdInput = document.getElementById('bnpd_tech');

            const calculateBNPD = () => {
                const bbpd = parseFloat(bbpdInput.value) || 0;
                const ays = parseFloat(aysInput.value) || 0;
                const bnpd = bbpd * (1 - (ays / 100));
                bnpdInput.value = bnpd.toFixed(2);
            };

            bbpdInput?.addEventListener('input', calculateBNPD);
            aysInput?.addEventListener('input', calculateBNPD);
            document.getElementById('pozo_name')?.addEventListener('change', () => syncDailyPozoContext());
            document.getElementById('tech_pozo_name')?.addEventListener('change', () => syncTechnicalPozoContext());
            document.getElementById('pump_pozo_name')?.addEventListener('change', () => syncPumpPozoContext());
            document.getElementById('level_pozo_name')?.addEventListener('change', () => syncLevelPozoContext());

            // Eventos para el soporte del echómetro
            const btnSelectLevelFile = document.getElementById('btn-select-level-file');
            const levelFileSoporte = document.getElementById('level_file_soporte');
            const levelFileName = document.getElementById('level-file-name');
            const btnClearLevelFile = document.getElementById('btn-clear-level-file');

            btnSelectLevelFile?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                levelFileSoporte?.click();
            });

            levelFileSoporte?.addEventListener('change', () => {
                if (levelFileSoporte.files && levelFileSoporte.files.length > 0) {
                    const file = levelFileSoporte.files[0];
                    if (levelFileName) levelFileName.textContent = file.name;
                    if (btnClearLevelFile) btnClearLevelFile.style.display = 'inline-block';
                } else {
                    if (levelFileName) levelFileName.textContent = 'Ningún archivo seleccionado';
                    if (btnClearLevelFile) btnClearLevelFile.style.display = 'none';
                }
            });

            btnClearLevelFile?.addEventListener('click', () => {
                if (levelFileSoporte) levelFileSoporte.value = '';
                if (levelFileName) levelFileName.textContent = 'Ningún archivo seleccionado';
                if (btnClearLevelFile) {
                    btnClearLevelFile.style.display = 'none';
                    delete btnClearLevelFile.dataset.filePath;
                }
            });
            document.getElementById('btn-new-manual-entry')?.addEventListener('click', prepareNewManualEntry);
            document.getElementById('btn-close-manual-form')?.addEventListener('click', () => {
                resetForm();
                setManualFormVisibility(false);
            });
            document.getElementById('btn-recent-operational')?.addEventListener('click', () => setRecentHistoryMode('operational'));
            document.getElementById('btn-recent-technical')?.addEventListener('click', () => setRecentHistoryMode('technical'));
            document.getElementById('btn-new-pump-profile')?.addEventListener('click', prepareNewPumpProfile);
            document.getElementById('btn-close-pump-profile')?.addEventListener('click', () => setPumpProfileVisibility(false));

            await refreshHistory();
        }

        // Alterna entre historial operativo reciente e historial tecnico reciente.
        function setRecentHistoryMode(mode) {
            activeRecentHistoryMode = mode;
            document.getElementById('btn-recent-operational').classList.toggle('active', mode === 'operational');
            document.getElementById('btn-recent-technical').classList.toggle('active', mode === 'technical');
            document.getElementById('recent-records-caption').textContent = mode === 'technical'
                ? 'Vista rápida de las mediciones técnicas más recientes cargadas en el sistema.'
                : 'Se muestra el último registro operativo cargado de cada pozo.';
            renderRecentHistoryHead();
            refreshHistory();
        }

        // Cambia las columnas del historial reciente segun el modo visible.
        function renderRecentHistoryHead() {
            const head = document.getElementById('recent-history-head');
            if (!head) return;

            if (activeRecentHistoryMode === 'technical') {
                head.innerHTML = `
                    <tr>
                        <th>Pozo</th>
                        <th>Campo</th>
                        <th>Fecha</th>
                        <th>Potencial</th>
                        <th>BBPD</th>
                        <th>AYS</th>
                        <th>BNPD</th>
                        <th>CAT</th>
                    </tr>
                `;
                return;
            }

            head.innerHTML = `
                <tr>
                    <th>Pozo</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Freq</th>
                    <th>I. Mot</th>
                    <th>PIP</th>
                    <th>LF</th>
                    <th>Giro</th>
                    <th>Estatus</th>
                    <th>Acciones</th>
                </tr>
            `;
        }

        // Refresca el catalogo comun de pozos para los tres selectores personalizados.
        async function refreshPozoLists() {
            knownPozos = new Set(activeScopePozoNames);

            MANAGEMENT_POZO_SELECTORS.forEach(config => renderManagementPozoMenu(config, true));
        }

        // Si el pozo no existe aun, ofrece abrir Produccion Tecnica para registrarlo.
        async function ensureKnownPozo(pozoName, campoName = '') {
            const normalizedPozo = pozoName.trim().toUpperCase();
            if (!normalizedPozo || knownPozos.has(normalizedPozo)) return true;

            if (!isPozoAllowedByActiveScope(normalizedPozo)) {
                Swal.fire({ icon: 'warning', title: 'Pozo fuera del contrato', text: `El pozo ${normalizedPozo} no pertenece al contrato activo.` });
                return false;
            }

            const result = await Swal.fire({
                icon: 'question',
                title: 'Hay un nuevo pozo',
                text: `El pozo ${pozoName} no existe en el catalogo. ┬┐Deseas registrarlo ahora en Produccion Tecnica?`,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: 'Registrar ahora',
                denyButtonText: 'Continuar manualmente',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                setTechnicalFormVisibility(true);
                populateTechnicalForm(null, {
                    pozo_name: pozoName,
                    campo_name: campoName
                });
                window.scrollTo({ top: document.getElementById('technical-data-form').offsetTop - 80, behavior: 'smooth' });
                document.getElementById('tech_pozo_name').focus();
                return false;
            }

            if (result.isDenied) {
                return true;
            }

            return false;
        }

        // Sincroniza el pozo del formulario operativo con el estado compartido de la sesion.
        async function syncDailyPozoContext() {
            const pozoName = document.getElementById('pozo_name').value.trim();
            setStoredSelectedPozo(pozoName);
            document.getElementById('pump_pozo_name').value = pozoName;
            await updatePozoRecordStatus(pozoName, 'daily');
        }

        // Carga la ficha tecnica actual del pozo para editarla o completarla.
        async function syncTechnicalPozoContext() {
            const pozoName = document.getElementById('tech_pozo_name').value.trim();
            setStoredSelectedPozo(pozoName);
            document.getElementById('pump_pozo_name').value = pozoName;
            await updatePozoRecordStatus(pozoName, 'technical');
            if (!pozoName) {
                populateTechnicalForm(null, { pozo_name: '', campo_name: '' });
                return;
            }

            const techData = await getWellTechnicalData(pozoName);
            populateTechnicalForm(techData, {
                pozo_name: pozoName,
                campo_name: techData?.campo_name || ''
            });
        }

        async function syncLevelPozoContext() {
            const pozoName = document.getElementById('level_pozo_name').value.trim();
            setStoredSelectedPozo(pozoName);
            document.getElementById('pozo_name').value = pozoName;
            document.getElementById('tech_pozo_name').value = pozoName;
            document.getElementById('pump_pozo_name').value = pozoName;
            
            await updatePozoRecordStatus(pozoName, 'level');
            if (!pozoName) {
                await populateLevelForm(null, { pozo_name: '' });
                return;
            }

            try {
                const tests = await getWellLevelTests(pozoName);
                const latestTest = tests && tests.length > 0 ? tests[0] : null;
                await populateLevelForm(latestTest, {
                    pozo_name: pozoName
                });
            } catch (e) {
                console.error('Error al sincronizar contexto de nivel:', e);
                await populateLevelForm(null, { pozo_name: pozoName });
            }
        }

        // Carga el perfil BES maestro del pozo seleccionado en Gestion de Pozos.
        async function syncPumpPozoContext() {
            const pozoName = document.getElementById('pump_pozo_name').value.trim();
            setStoredSelectedPozo(pozoName);
            await updatePumpProfileStatus(pozoName);

            if (!pozoName) {
                populatePumpProfileForm(null, { pozo_name: '' });
                return;
            }

            const profile = await getWellBESProfile(pozoName);
            populatePumpProfileForm(profile, { pozo_name: pozoName });
        }

        async function refreshHistory() {
            try {
                const historyBody = document.getElementById('recent-history-body');
                const historyLoading = document.getElementById('history-loading');
                if (historyLoading) historyLoading.style.display = 'inline';

                const formatTelemetryNumber = (value, maxDecimals = 2) => {
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) return '--';
                    return new Intl.NumberFormat('es-ES', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: maxDecimals
                    }).format(numeric);
                };

                if (activeRecentHistoryMode === 'technical') {
                    const technicalData = filterRowsByActiveScope(await getRecentTechnicalMeasurements(50)).slice(0, 10);
                    if (historyBody) historyBody.innerHTML = '';

                    if (technicalData && technicalData.length > 0) {
                        const latestTech = technicalData[0];
                        const lastRecordDisplay = document.getElementById('last-record-display');
                        if (lastRecordDisplay) lastRecordDisplay.innerHTML = `<b>${escapeHtml(latestTech.pozo_name)}</b> - ${escapeHtml(latestTech.fecha)}`;

                        technicalData.forEach(record => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td style="font-weight: 700;">${escapeHtml(record.pozo_name || '--')}</td>
                                <td>${escapeHtml(record.campo_name || '--')}</td>
                                <td>${escapeHtml(record.fecha || '--')}</td>
                                <td>${formatTelemetryNumber(record.potencial)}</td>
                                <td>${formatTelemetryNumber(record.bbpd)}</td>
                                <td>${formatTelemetryNumber(record.ays_percentage)}%</td>
                                <td>${formatTelemetryNumber(record.bnpd)}</td>
                                <td><span class="recent-technical-cat">CAT ${escapeHtml(record.cat_number ?? '--')}</span></td>
                            `;
                            if (historyBody) historyBody.appendChild(tr);
                        });
                    } else {
                        if (historyBody) historyBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94A3B8; padding: 20px;">No hay mediciones técnicas recientes disponibles.</td></tr>';
                    }

                    if (historyLoading) historyLoading.style.display = 'none';
                    return;
                }

                const data = activeScopePozoNames.length > 0 ? await getMonitoringData(activeScopePozoNames) : [];
                const latestByPozo = [];
                const seenPozos = new Set();

                (data || []).forEach(record => {
                    const pozoKey = String(record.pozo_name || '').trim().toUpperCase();
                    if (!pozoKey || seenPozos.has(pozoKey)) return;
                    seenPozos.add(pozoKey);
                    latestByPozo.push(record);
                });
                
                if (latestByPozo.length > 0) {
                    const latest = latestByPozo[0];
                    const lastRecordDisplay = document.getElementById('last-record-display');
                    if (lastRecordDisplay) lastRecordDisplay.innerHTML = `<b>${escapeHtml(latest.pozo_name)}</b> - ${escapeHtml(latest.fecha)} ... ${escapeHtml(latest.hora)}`;
                    
                    if (historyBody) historyBody.innerHTML = '';
                    latestByPozo.slice(0, 10).forEach(record => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-weight: 700;">${escapeHtml(record.pozo_name)}</td>
                            <td>${escapeHtml(record.fecha)}</td>
                            <td>${escapeHtml(record.hora)}</td>
                            <td>${formatTelemetryNumber(record.frecuencia)}</td>
                            <td>${formatTelemetryNumber(record.corriente_motor)}</td>
                            <td>${formatTelemetryNumber(record.pip)}</td>
                            <td>${formatTelemetryNumber(record.presion_lf)}</td>
                            <td>${escapeHtml(record.sentido_giro || '--')}</td>
                            <td><span style="color: ${record.estatus === 'RUN' ? '#059669' : '#DC2626'}">● ${escapeHtml(record.estatus || '--')}</span></td>
                            <td>
                                <button class="btn-action btn-edit" data-id="${escapeHtml(record.id)}">Editar</button>
                                <button class="btn-action btn-delete" data-id="${escapeHtml(record.id)}">Borrar</button>
                            </td>
                        `;
                        if (historyBody) historyBody.appendChild(tr);
                    });

                    // Vuelve a enlazar botones porque la tabla se reconstruye por completo.
                    document.querySelectorAll('.btn-edit').forEach(btn => {
                        btn.onclick = () => loadAndFillForm(btn.getAttribute('data-id'));
                    });
                    document.querySelectorAll('.btn-delete').forEach(btn => {
                        btn.onclick = () => handleDelete(btn.getAttribute('data-id'));
                    });

                } else {
                    if (historyBody) historyBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #94A3B8; padding: 20px;">No hay registros disponibles.</td></tr>';
                }
                if (historyLoading) historyLoading.style.display = 'none';
            } catch (err) {
                const historyLoading = document.getElementById('history-loading');
                if (historyLoading) historyLoading.style.display = 'none';
                console.error('History load error:', err);
            }
        }

        // Abre un registro operativo existente y trae tambien el contexto tecnico del pozo.
        async function loadAndFillForm(id) {
            try {
                Swal.fire({ title: 'Cargando datos...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                const record = await getRecordById(id);
                const techData = await getWellTechnicalData(record.pozo_name);
                Swal.close();
                window.openGestionModal('modal-daily-entry');
                setManualFormVisibility(true);
                setTechnicalFormVisibility(true);

                isEditing = true;
                document.getElementById('edit-id').value = id;
                document.getElementById('form-title').textContent = `Editando Pozo: ${record.pozo_name}`;
                document.getElementById('submit-btn').querySelector('.btn-text').textContent = 'Guardar Cambios';
                document.getElementById('cancel-edit').style.display = 'inline-block';

                // Asigna los campos del registro recibido a los inputs del formulario.
                const fields = ['pozo_name', 'campo', 'fecha', 'hora', 'frecuencia', 'corriente_motor', 'pip', 'tm', 'presion_thp', 'presion_chp', 'presion_lf', 'vsd_a', 'vsd_b', 'vsd_c', 'sentido_giro', 'estatus', 'observaciones'];
                fields.forEach(f => {
                    const el = document.getElementById(f);
                    if (el) el.value = record[f] ?? '';
                });

                populateTechnicalForm(techData, { pozo_name: record.pozo_name, campo_name: record.campo });

                // Lleva la vista al inicio para que el usuario vea el formulario abierto.
                window.scrollTo({ top: 0, behavior: 'smooth' });

            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el registro para editar.' });
            }
        }

        // Elimina un registro operativo despues de confirmar la accion con el usuario.
        async function handleDelete(id) {
            const result = await Swal.fire({
                title: '¿Estás seguro?',
                text: "Esta acción no se puede deshacer.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Sí, borrarlo'
            });

            if (result.isConfirmed) {
                try {
                    await deleteRecord(id);
                    Swal.fire('Borrado', 'El registro ha sido eliminado.', 'success');
                    await refreshHistory();
                } catch (err) {
                    Swal.fire('Error', err.message, 'error');
                }
            }
        }

        document.getElementById('cancel-edit')?.addEventListener('click', resetForm);

        function resetForm() {
            isEditing = false;
            document.getElementById('manual-data-form').reset();
            document.getElementById('edit-id').value = '';
            document.getElementById('fecha').valueAsDate = new Date();
            document.getElementById('form-title').textContent = 'Entrada de Parámetros';
            document.getElementById('submit-btn').querySelector('.btn-text').textContent = 'Guardar Registro';
            document.getElementById('cancel-edit').style.display = 'none';
        }

        function focusWithoutScroll(element) {
            if (!element) return;
            try {
                element.focus({ preventScroll: true });
            } catch (error) {
                element.focus();
            }
        }

        function togglePanelWithStableScroll(panel, isVisible, anchorElement) {
            if (!panel) return;

            const anchor = anchorElement || panel;
            const beforeTop = anchor.getBoundingClientRect().top;
            panel.classList.toggle('is-open', Boolean(isVisible));

            requestAnimationFrame(() => {
                const afterTop = anchor.getBoundingClientRect().top;
                const delta = afterTop - beforeTop;
                if (Math.abs(delta) > 1) {
                    window.scrollBy(0, delta);
                }
            });
        }

        function setManualFormVisibility(isVisible) {
            const panel = document.getElementById('manual-form-panel');
            const trigger = document.getElementById('btn-new-manual-entry');
            if (!panel || !trigger) return;

            togglePanelWithStableScroll(panel, isVisible, trigger);
            trigger.querySelector('.btn-text').textContent = isVisible
                ? 'Agregar Otra Entrada de Parámetros Manual'
                : 'Agregar Nueva Entrada de Parámetros Manual';
        }

        function prepareNewManualEntry() {
            const pozoName = document.getElementById('pozo_name').value.trim();
            const campoName = document.getElementById('campo').value.trim();

            resetForm();
            setManualFormVisibility(true);

            document.getElementById('pozo_name').value = pozoName;
            document.getElementById('campo').value = campoName;
            document.getElementById('fecha').valueAsDate = new Date();
            focusWithoutScroll(document.getElementById('pozo_name'));
        }

        function populateTechnicalForm(techData = null, context = {}) {
            const pozoName = context.pozo_name || techData?.pozo_name || '';
            document.getElementById('tech_pozo_name').value = context.pozo_name || techData?.pozo_name || '';
            document.getElementById('tech_campo_name').value = context.campo_name || techData?.campo_name || '';
            document.getElementById('ef_tech').value = techData?.ef || '';
            document.getElementById('fecha_tech').value = techData?.fecha || '';
            document.getElementById('potencial_tech').value = techData?.potencial ?? '';
            document.getElementById('bbpd_tech').value = techData?.bbpd ?? '';
            document.getElementById('ays_tech').value = techData?.ays_percentage ?? '';
            document.getElementById('bnpd_tech').value = techData?.bnpd ?? '';
            document.getElementById('cat_tech').value = techData?.cat_number || '1';
            setStoredSelectedPozo(pozoName);
        }

        function resetTechnicalForm() {
            document.getElementById('technical-data-form').reset();
            document.getElementById('fecha_tech').value = '';
            document.getElementById('potencial_tech').value = '';
            document.getElementById('cat_tech').value = '1';
            document.getElementById('bnpd_tech').value = '';
            document.getElementById('tech-submit-btn').querySelector('.btn-text').textContent = 'Guardar Producción Técnica';
        }

        async function populateLevelForm(levelData = null, context = {}) {
            const pozoName = context.pozo_name || levelData?.pozo_name || '';
            document.getElementById('level_pozo_name').value = pozoName;
            document.getElementById('fecha_level').value = levelData?.fecha || '';
            document.getElementById('nivel_dinamico_val').value = levelData?.nivel_dinamico ?? '';
            document.getElementById('sumergencia_val').value = levelData?.sumergencia ?? '';
            document.getElementById('presion_pip_val').value = levelData?.presion_pip ?? '';

            // Mostrar soporte existente si hay
            const fileNameSpan = document.getElementById('level-file-name');
            const clearBtn = document.getElementById('btn-clear-level-file');
            const fileInput = document.getElementById('level_file_soporte');
            if (fileInput) fileInput.value = '';

            if (levelData?.file_path) {
                try {
                    const { getDocumentDownloadUrl } = await import('../services/well-documents-service.js');
                    const url = await getDocumentDownloadUrl(levelData.file_path);
                    if (fileNameSpan) {
                        fileNameSpan.innerHTML = `<a href="${url}" target="_blank" style="color: #2563eb; font-weight: 700; text-decoration: underline;">👁️ Ver Soporte Echó.</a>`;
                    }
                    if (clearBtn) {
                        clearBtn.style.display = 'inline-block';
                        clearBtn.dataset.filePath = levelData.file_path;
                    }
                } catch (e) {
                    console.error('Error al generar enlace de soporte de nivel:', e);
                    if (fileNameSpan) fileNameSpan.textContent = 'Archivo registrado (error al enlazar)';
                }
            } else {
                if (fileNameSpan) fileNameSpan.textContent = 'Ningún archivo seleccionado';
                if (clearBtn) {
                    clearBtn.style.display = 'none';
                    delete clearBtn.dataset.filePath;
                }
            }

            setStoredSelectedPozo(pozoName);
        }

        function resetLevelForm() {
            document.getElementById('level-data-form').reset();
            document.getElementById('fecha_level').value = '';
            document.getElementById('nivel_dinamico_val').value = '';
            document.getElementById('sumergencia_val').value = '';
            document.getElementById('presion_pip_val').value = '';

            const fileInput = document.getElementById('level_file_soporte');
            if (fileInput) fileInput.value = '';
            const fileNameSpan = document.getElementById('level-file-name');
            if (fileNameSpan) fileNameSpan.textContent = 'Ningún archivo seleccionado';
            const clearBtn = document.getElementById('btn-clear-level-file');
            if (clearBtn) {
                clearBtn.style.display = 'none';
                delete clearBtn.dataset.filePath;
            }

            document.getElementById('level-submit-btn').querySelector('.btn-text').textContent = 'Guardar Pruebas de Nivel';
        }

        function populatePumpProfileForm(profile = null, context = {}) {
            const pozoName = context.pozo_name || profile?.pozo_name || '';
            document.getElementById('pump_pozo_name').value = pozoName;
            BES_PROFILE_FORM_FIELDS.forEach(fieldName => {
                const field = document.getElementById(fieldName);
                if (field) field.value = profile?.[fieldName] || '';
            });
            setStoredSelectedPozo(pozoName);
        }

        function resetPumpProfileForm() {
            document.getElementById('pump-profile-form').reset();
            document.getElementById('pump-submit-btn').querySelector('.btn-text').textContent = 'Guardar Ficha BES';
        }

        function setPumpProfileVisibility(isVisible) {
            const panel = document.getElementById('pump-profile-panel');
            const trigger = document.getElementById('btn-new-pump-profile');
            if (!panel || !trigger) return;

            togglePanelWithStableScroll(panel, isVisible, trigger);
            trigger.querySelector('.btn-text').textContent = isVisible
                ? 'Configurar Otra Ficha BES'
                : 'Configurar Ficha BES';
        }

        function prepareNewPumpProfile() {
            const pozoName = document.getElementById('pump_pozo_name').value.trim()
                || document.getElementById('tech_pozo_name').value.trim()
                || document.getElementById('pozo_name').value.trim();
            const currentProfile = BES_PROFILE_FORM_FIELDS.reduce((profile, fieldName) => {
                profile[fieldName] = document.getElementById(fieldName)?.value.trim() || '';
                return profile;
            }, {});

            resetPumpProfileForm();
            setPumpProfileVisibility(true);
            document.getElementById('pump_pozo_name').value = pozoName;
            BES_PROFILE_FORM_FIELDS.forEach(fieldName => {
                const field = document.getElementById(fieldName);
                if (field) field.value = currentProfile[fieldName] || '';
            });
            focusWithoutScroll(document.getElementById('pump_pozo_name'));
            updatePumpProfileStatus(pozoName);
        }

        function setTechnicalFormVisibility(isVisible) {
            const panel = document.getElementById('technical-form-panel');
            const trigger = document.getElementById('btn-new-technical-measurement');
            if (!panel || !trigger) return;

            togglePanelWithStableScroll(panel, isVisible, trigger);
            trigger.querySelector('.btn-text').textContent = isVisible
                ? 'Agregar Otra Medición Técnica Manual'
                : 'Agregar Nueva Medición Técnica Manual';
        }

        function prepareNewTechnicalMeasurement() {
            const pozoName = document.getElementById('tech_pozo_name').value.trim();
            const campoName = document.getElementById('tech_campo_name').value.trim();
            const ef = document.getElementById('ef_tech').value.trim();
            const cat = document.getElementById('cat_tech').value || '1';

            resetTechnicalForm();
            setTechnicalFormVisibility(true);

            document.getElementById('tech_pozo_name').value = pozoName;
            document.getElementById('tech_campo_name').value = campoName;
            document.getElementById('ef_tech').value = ef;
            document.getElementById('cat_tech').value = cat;
            document.getElementById('fecha_tech').valueAsDate = new Date();
            focusWithoutScroll(document.getElementById('bbpd_tech'));
        }

        const manualForm = document.getElementById('manual-data-form');
        manualForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const getOptionalTelemetryValue = (fieldId) => roundNumericValue(document.getElementById(fieldId).value);

            const record = {
                operational_scope: activeOperationalScope,
                pozo_name: document.getElementById('pozo_name').value,
                campo: document.getElementById('campo').value,
                fecha: document.getElementById('fecha').value,
                hora: document.getElementById('hora').value,
                frecuencia: getOptionalTelemetryValue('frecuencia'),
                corriente_motor: getOptionalTelemetryValue('corriente_motor'),
                pip: getOptionalTelemetryValue('pip'),
                tm: getOptionalTelemetryValue('tm'),
                presion_thp: getOptionalTelemetryValue('presion_thp'),
                presion_chp: getOptionalTelemetryValue('presion_chp'),
                presion_lf: getOptionalTelemetryValue('presion_lf'),
                vsd_a: getOptionalTelemetryValue('vsd_a'),
                vsd_b: getOptionalTelemetryValue('vsd_b'),
                vsd_c: getOptionalTelemetryValue('vsd_c'),
                sentido_giro: document.getElementById('sentido_giro').value.trim() || null,
                estatus: document.getElementById('estatus').value,
                observaciones: document.getElementById('observaciones').value,
            };

            try {
                if (!isPozoAllowedByActiveScope(record.pozo_name)) {
                    throw new Error(`El pozo ${record.pozo_name || '--'} no pertenece al contrato activo.`);
                }

                if (!isEditing) {
                    const canContinue = await ensureKnownPozo(record.pozo_name, record.campo);
                    if (!canContinue) return;
                }

                if (isEditing) {
                    await updateRecord(document.getElementById('edit-id').value, record);
                    await upsertManualMonitoringIntoConsolidated([record], { sourceFileName: 'gestion-manual' });
                    Swal.fire({ icon: 'success', title: 'Registro Actualizado', text: 'El registro diario fue actualizado correctamente.', timer: 2000, showConfirmButton: false });
                } else {
                    await insertRecord(record);
                    await upsertManualMonitoringIntoConsolidated([record], { sourceFileName: 'gestion-manual' });
                    Swal.fire({ icon: 'success', title: 'Registro Guardado', text: 'La telemetría diaria fue guardada exitosamente.', timer: 2200, showConfirmButton: false });
                }
                resetForm();
                setManualFormVisibility(false);
                await refreshHistory();
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Fallo de Sincronización', text: err.message });
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });

        const technicalForm = document.getElementById('technical-data-form');
        technicalForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('tech-submit-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            try {
                const techData = {
                    operational_scope: activeOperationalScope,
                    pozo_name: document.getElementById('tech_pozo_name').value.trim(),
                    campo_name: document.getElementById('tech_campo_name').value.trim(),
                    ef: document.getElementById('ef_tech').value.trim(),
                    fecha: document.getElementById('fecha_tech').value || null,
                    potencial: parseFloat(document.getElementById('potencial_tech').value) || 0,
                    bbpd: parseFloat(document.getElementById('bbpd_tech').value) || 0,
                    ays_percentage: parseFloat(document.getElementById('ays_tech').value) || 0,
                    bnpd: parseFloat(document.getElementById('bnpd_tech').value) || 0,
                    cat_number: parseInt(document.getElementById('cat_tech').value) || 1
                };

                if (!isPozoAllowedByActiveScope(techData.pozo_name)) {
                    throw new Error(`El pozo ${techData.pozo_name || '--'} no pertenece al contrato activo.`);
                }

                await saveTechnicalMeasurement(techData);
                setTechnicalFormVisibility(false);
                await refreshPozoLists();
                Swal.fire({ icon: 'success', title: 'Medición Técnica Guardada', text: 'La medición técnica fue agregada al historial y el resumen del pozo quedó actualizado.', timer: 2400, showConfirmButton: false });
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Fallo al Guardar', text: err.message });
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });

        const levelForm = document.getElementById('level-data-form');
        levelForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('level-submit-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            try {
                const levelData = {
                    operational_scope: activeOperationalScope,
                    pozo_name: document.getElementById('level_pozo_name').value.trim(),
                    fecha: document.getElementById('fecha_level').value || null,
                    nivel_dinamico: parseFloat(document.getElementById('nivel_dinamico_val').value) || 0,
                    sumergencia: parseFloat(document.getElementById('sumergencia_val').value) || 0,
                    presion_pip: parseFloat(document.getElementById('presion_pip_val').value) || 0,
                    file_path: document.getElementById('btn-clear-level-file')?.dataset.filePath || null
                };

                if (!isPozoAllowedByActiveScope(levelData.pozo_name)) {
                    throw new Error(`El pozo ${levelData.pozo_name || '--'} no pertenece al contrato activo.`);
                }

                // Subir archivo si se seleccionó uno
                const fileInput = document.getElementById('level_file_soporte');
                if (fileInput && fileInput.files && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    
                    Swal.fire({
                        title: 'Subiendo Soporte...',
                        text: 'Cargando archivo del echómetro a Supabase Storage.',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });

                    const { supabase } = await import('../supabaseClient.js');
                    const sanitizeFileName = (name) => {
                        return String(name)
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-zA-Z0-9._-]/g, '_');
                    };

                    const cleanPozo = String(levelData.pozo_name).trim().toUpperCase();
                    const cleanOperationalScope = String(levelData.operational_scope || 'ceiba_tomoporo').trim().toLowerCase();
                    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
                    const sanitizedName = sanitizeFileName(file.name);
                    const timeStamp = Date.now();
                    const filePath = `${cleanOperationalScope}/${cleanPozo}/REGISTROS_ECHOMETER/${timeStamp}_${sanitizedName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('expedientes-pozos')
                        .upload(filePath, file, {
                            cacheControl: '3600',
                            upsert: false
                        });

                    if (uploadError) {
                        throw new Error(`Error en el almacenamiento de Supabase Storage: ${uploadError.message}`);
                    }

                    levelData.file_path = filePath;
                }

                await saveLevelTest(levelData);
                await refreshPozoLists();
                
                // Cerrar modal
                window.closeGestionModal('modal-level-entry', true);

                Swal.fire({ icon: 'success', title: 'Prueba de Nivel Guardada', text: 'La medición del nivel por echómetro fue guardada exitosamente.', timer: 2400, showConfirmButton: false });
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Fallo al Guardar', text: err.message });
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });

        document.getElementById('btn-new-technical-measurement')?.addEventListener('click', prepareNewTechnicalMeasurement);
        document.getElementById('btn-close-technical-form')?.addEventListener('click', () => setTechnicalFormVisibility(false));

        const pumpProfileForm = document.getElementById('pump-profile-form');
        pumpProfileForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('pump-submit-btn');
            btn.classList.add('loading');
            btn.disabled = true;

            try {
                const profile = BES_PROFILE_FORM_FIELDS.reduce((payload, fieldName) => {
                    payload[fieldName] = document.getElementById(fieldName)?.value.trim() || '';
                    return payload;
                }, {
                    operational_scope: activeOperationalScope,
                    pozo_name: document.getElementById('pump_pozo_name').value.trim()
                });

                if (!isPozoAllowedByActiveScope(profile.pozo_name)) {
                    throw new Error(`El pozo ${profile.pozo_name || '--'} no pertenece al contrato activo.`);
                }

                await upsertWellBESProfile(profile);
                await refreshPozoLists();
                await updatePumpProfileStatus(profile.pozo_name);
                setPumpProfileVisibility(false);
                Swal.fire({ icon: 'success', title: 'Ficha BES Guardada', text: `La ficha BES del pozo ${profile.pozo_name} fue actualizada correctamente.`, timer: 2200, showConfirmButton: false });
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Fallo al Guardar', text: err.message });
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });

        const techDropZone = document.getElementById('tech-drop-zone');
        const techFileInput = document.getElementById('tech-file-input');
        const techStatusDiv = document.getElementById('tech-upload-status');
        const techStatusText = document.getElementById('tech-status-text');

        const levelDropZone = document.getElementById('level-drop-zone');
        const levelFileInput = document.getElementById('level-file-input');
        const levelStatusDiv = document.getElementById('level-upload-status');
        const levelStatusText = document.getElementById('level-status-text');

        function resetSelectedFile(input) {
            if (input) input.value = '';
        }

        let activeImportSession = null;

        function handleImportBeforeUnload(event) {
            if (!activeImportSession?.active) return undefined;
            event.preventDefault();
            event.returnValue = 'Hay una importacion en progreso. Si sales ahora, la carga puede quedar incompleta.';
            return event.returnValue;
        }

        function setImportNavigationLock(isLocked) {
            if (isLocked) {
                window.addEventListener('beforeunload', handleImportBeforeUnload);
            } else {
                window.removeEventListener('beforeunload', handleImportBeforeUnload);
            }
        }

        function getImportProgressMarkup(message, detail = '') {
            return `
                <div class="import-progress-modal">
                    <p class="import-progress-message">${message}</p>
                    <p class="import-progress-detail">${detail || 'No cierres ni abandones esta pantalla hasta finalizar la importacion.'}</p>
                </div>
            `;
        }

        function beginImportSession({ kind, fileName, recordsCount, pozoCount }) {
            activeImportSession = {
                active: true,
                kind,
                fileName,
                recordsCount,
                pozoCount
            };

            setImportNavigationLock(true);

            Swal.fire({
                title: kind === 'technical' ? 'Importando mediciones tecnicas' : 'Importando registros operativos',
                html: getImportProgressMarkup(
                    `Procesando ${recordsCount} registro(s) de ${pozoCount} pozo(s).`,
                    `Archivo: ${fileName}. No cierres ni cambies de pantalla hasta completar la carga.`
                ),
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        }

        function updateImportSession(message, detail = '') {
            if (!activeImportSession?.active || !Swal.isVisible()) return;

            const htmlContainer = Swal.getHtmlContainer();
            if (!htmlContainer) return;
            htmlContainer.innerHTML = getImportProgressMarkup(message, detail);
        }

        function finishImportSession() {
            if (!activeImportSession?.active) return;
            activeImportSession = null;
            setImportNavigationLock(false);
            if (Swal.isVisible()) {
                Swal.close();
            }
        }

        importNavigationLockListener = async (event) => {
            if (!activeImportSession?.active) return;

            const logoutButton = event.target.closest('#logout-btn, #mobile-logout-btn');
            const anchor = event.target.closest('a[href]');
            if (!logoutButton && !anchor) return;

            event.preventDefault();
            event.stopPropagation();

            if (Swal.isVisible()) return;

            await Swal.fire({
                icon: 'warning',
                title: 'Importacion en progreso',
                text: 'Espera a que termine la carga antes de salir o cambiar de pantalla.',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#1D4ED8'
            });

            if (activeImportSession?.active) {
                beginImportSession(activeImportSession);
            }
        };


        function countUniquePozos(rows = []) {
            return new Set(
                rows
                    .map(row => String(row?.pozo_name || '').trim().toUpperCase())
                    .filter(Boolean)
            ).size;
        }

        function buildImportPreviewList(items = [], kind = 'operational', limit = 200) {
            const previewItems = items.slice(0, limit).map(item => {
                const record = item?.record || item || {};
                if (kind === 'technical' || kind === 'level') {
                    return `<li><b>${escapeHtml(record.pozo_name || '--')}</b> · ${escapeHtml(record.fecha || '--')}</li>`;
                }

                return `<li><b>${escapeHtml(record.pozo_name || '--')}</b> · ${escapeHtml(record.fecha || '--')} ${escapeHtml(record.hora || '00:00:00')}</li>`;
            }).join('');

            const remaining = Math.max(items.length - limit, 0);
            const moreLine = remaining > 0
                ? `<p style="margin: 8px 0 0 0; font-size: 0.8rem; color: #64748B;">Y ${remaining} registro(s) más...</p>`
                : '';

            return previewItems
                ? `<div style="margin-top: 8px; max-height: 260px; overflow-y: auto; padding-right: 6px;"><ul style="margin: 0 0 0 18px; padding: 0;">${previewItems}</ul></div>${moreLine}`
                : '<p style="margin: 8px 0 0 0; color: #64748B;">Sin registros en esta categoría.</p>';
        }

        function getImportPreviewRecord(item) {
            return item?.record || item || {};
        }

        function filterImportPreviewItems(items = [], query = '') {
            const normalizedQuery = String(query || '').trim().toUpperCase();
            if (!normalizedQuery) return items;

            return items.filter(item => {
                const record = getImportPreviewRecord(item);
                const pozoName = String(record?.pozo_name || '').trim().toUpperCase();
                return pozoName.includes(normalizedQuery);
            });
        }

        function mapPreviewExportRows(items = [], statusLabel = 'Nuevo', kind = 'operational') {
            return items.map(item => {
                const record = getImportPreviewRecord(item);

                if (kind === 'technical') {
                    return {
                        accion: statusLabel,
                        pozo_name: record.pozo_name || '',
                        fecha: record.fecha || '',
                        campo_name: record.campo_name || '',
                        ef: record.ef || '',
                        potencial: record.potencial ?? '',
                        bbpd: record.bbpd ?? '',
                        ays_percentage: record.ays_percentage ?? '',
                        bnpd: record.bnpd ?? '',
                        cat_number: record.cat_number ?? '',
                        existing_id: item?.id || ''
                    };
                }

                return {
                    accion: statusLabel,
                    pozo_name: record.pozo_name || '',
                    fecha: record.fecha || '',
                    hora: record.hora || '00:00:00',
                    campo: record.campo || '',
                    estatus: record.estatus || '',
                    frecuencia: record.frecuencia ?? '',
                    corriente_motor: record.corriente_motor ?? '',
                    presion_thp: record.presion_thp ?? '',
                    presion_chp: record.presion_chp ?? '',
                    presion_lf: record.presion_lf ?? '',
                    pip: record.pip ?? '',
                    tm: record.tm ?? '',
                    vsd_a: record.vsd_a ?? '',
                    vsd_b: record.vsd_b ?? '',
                    vsd_c: record.vsd_c ?? '',
                    sentido_giro: record.sentido_giro || '',
                    observaciones: record.observaciones || '',
                    existing_id: item?.id || ''
                };
            });
        }

        function exportImportPreviewWorkbook({ fileName, kind = 'operational', recordsCount = 0, pozoCount = 0, recordsToInsert = [], recordsToUpdate = [] }) {
            if (typeof XLSX === 'undefined') {
                throw new Error('La libreria XLSX no esta disponible para exportar el preview.');
            }

            const workbook = XLSX.utils.book_new();
            const summaryRows = [{
                archivo: fileName || '',
                tipo: kind === 'technical' ? 'tecnico' : 'operativo',
                registros_validos: recordsCount,
                pozos_detectados: pozoCount,
                nuevos: recordsToInsert.length,
                actualizaciones: recordsToUpdate.length,
                generado_en: new Date().toISOString()
            }];

            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mapPreviewExportRows(recordsToInsert, 'Nuevo', kind)), 'Nuevos');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mapPreviewExportRows(recordsToUpdate, 'Actualizar', kind)), 'Actualizaciones');

            const safeName = String(fileName || 'preview')
                .replace(/\.[^.]+$/, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'preview';

            XLSX.writeFile(workbook, `${safeName}_preview_importacion.xlsx`);
        }

        function buildImportPreviewCard({ title, items = [], kind = 'operational', tone = 'neutral' }) {
            const palette = tone === 'warm'
                ? {
                    background: '#FFF7ED',
                    border: '#FED7AA',
                    title: '#9A3412'
                }
                : {
                    background: '#F8FAFC',
                    border: '#E2E8F0',
                    title: '#0F172A'
                };

            return `
                <div style="padding: 14px; border-radius: 14px; background: ${palette.background}; border: 1px solid ${palette.border}; min-height: 320px; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <p style="margin: 0; font-weight: 700; color: ${palette.title};">${escapeHtml(title)}</p>
                        <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; padding: 0 12px; border-radius: 999px; background: rgba(255,255,255,0.72); border: 1px solid ${palette.border}; font-size: 0.82rem; font-weight: 700; color: ${palette.title};">
                            ${items.length}
                        </span>
                    </div>
                    ${buildImportPreviewList(items, kind)}
                </div>
            `;
        }

        async function confirmImportSummary({ title, fileName, recordsCount, pozoCount, detailText, previewResult, consolidatedPreview = null, omittedCount = 0, kind = 'operational' }) {
            const recordsToInsert = previewResult?.recordsToInsert || [];
            const recordsToUpdate = previewResult?.recordsToUpdate || [];
            const skippedCount = previewResult?.skipped ?? 0;
            const dedupedTotal = previewResult?.total ?? (recordsToInsert.length + recordsToUpdate.length + skippedCount);
            const duplicateCount = Math.max(recordsCount - dedupedTotal, 0);
            const hasInsertions = recordsToInsert.length > 0;
            const hasUpdates = recordsToUpdate.length > 0;
            const defaultTab = hasInsertions && hasUpdates
                ? 'both'
                : (hasInsertions || !hasUpdates ? 'insert' : 'update');
            const supportsImportModes = kind === 'operational';
            const defaultImportMode = supportsImportModes
                ? (hasUpdates ? 'sync-all' : 'insert-only')
                : 'sync-all';
            const getImportModeCopy = (mode) => {
                if (mode === 'insert-only') {
                    return {
                        buttonText: 'Si, insertar solo nuevos',
                        summaryText: 'En Data solo se insertaran registros nuevos; el consolidado exportable se actualizara con las filas validas del archivo.'
                    };
                }

                if (mode === 'preview-only') {
                    return {
                        buttonText: 'Cerrar preview sin guardar',
                        summaryText: 'No se guardara nada. Este modo sirve solo para revisar el preview antes de salir.'
                    };
                }

                return {
                    buttonText: 'Si, insertar y actualizar',
                    summaryText: 'Se insertaran los nuevos, se actualizaran existentes en Data y tambien se refrescara el consolidado exportable.'
                };
            };
            const initialModeCopy = getImportModeCopy(defaultImportMode);

            const result = await Swal.fire({
                icon: 'question',
                title,
                width: '960px',
                html: `
                    <div style="text-align: left; line-height: 1.6; color: #475569; font-size: 0.92rem; max-height: 68vh; overflow: hidden; display: flex; flex-direction: column;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px;">
                            <div style="padding: 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #E2E8F0;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B;">Archivo</p>
                                <p style="margin: 0; font-weight: 600; color: #0F172A; word-break: break-word;">${escapeHtml(fileName)}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #E2E8F0;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B;">Registros válidos</p>
                                <p style="margin: 0; font-weight: 700; color: #0F172A;">${recordsCount}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #E2E8F0;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B;">Pozos detectados</p>
                                <p style="margin: 0; font-weight: 700; color: #0F172A;">${pozoCount}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #ECFDF5; border: 1px solid #A7F3D0;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #047857;">Nuevos</p>
                                <p style="margin: 0; font-weight: 700; color: #065F46;">${previewResult?.inserted ?? 0}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #FFF7ED; border: 1px solid #FED7AA;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #C2410C;">Se actualizarán</p>
                                <p style="margin: 0; font-weight: 700; color: #9A3412;">${previewResult?.updated ?? 0}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #CBD5E1;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B;">Sin cambios</p>
                                <p style="margin: 0; font-weight: 700; color: #334155;">${skippedCount}</p>
                            </div>
                            <div style="padding: 12px; border-radius: 12px; background: #F8FAFC; border: 1px solid #CBD5E1;">
                                <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B;">Duplicados en archivo</p>
                                <p style="margin: 0; font-weight: 700; color: #334155;">${duplicateCount}</p>
                            </div>
                            ${consolidatedPreview ? `
                                <div style="padding: 12px; border-radius: 12px; background: #EEF2FF; border: 1px solid #C7D2FE;">
                                    <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #3730A3;">Consolidado actualiza</p>
                                    <p style="margin: 0; font-weight: 700; color: #312E81;">${consolidatedPreview.updated || 0}</p>
                                </div>
                                <div style="padding: 12px; border-radius: 12px; background: #F0FDFA; border: 1px solid #99F6E4;">
                                    <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #0F766E;">Consolidado agrega</p>
                                    <p style="margin: 0; font-weight: 700; color: #115E59;">${consolidatedPreview.inserted || 0}</p>
                                </div>
                            ` : ''}
                            ${omittedCount ? `
                                <div style="padding: 12px; border-radius: 12px; background: #FEF2F2; border: 1px solid #FECACA;">
                                    <p style="margin: 0 0 4px 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #B91C1C;">Omitidas</p>
                                    <p style="margin: 0; font-weight: 700; color: #991B1B;">${omittedCount}</p>
                                </div>
                            ` : ''}
                        </div>
                        <p style="margin: 0 0 6px 0;">${escapeHtml(detailText)}</p>
                        <p style="margin: 0 0 12px 0; font-size: 0.84rem; color: #475569;">De ${recordsCount} filas validas, ${dedupedTotal} quedaron como registros unicos por pozo, fecha y hora. De esos unicos, ${recordsToInsert.length} son nuevos, ${recordsToUpdate.length} cambiaron y ${skippedCount} ya existian igual.</p>
                        ${supportsImportModes
                            ? `
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 0 0 12px 0;">
                                    <label data-import-mode-option="insert-only" style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 14px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer;">
                                        <input type="radio" name="import-mode" value="insert-only" ${defaultImportMode === 'insert-only' ? 'checked' : ''} style="margin-top: 2px;">
                                        <span>
                                            <span style="display: block; font-weight: 700; color: #0F172A;">Solo insertar nuevos</span>
                                            <span style="display: block; font-size: 0.82rem; color: #475569;">Carga solo los registros que no existen todavia.</span>
                                        </span>
                                    </label>
                                    <label data-import-mode-option="sync-all" style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 14px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer;">
                                        <input type="radio" name="import-mode" value="sync-all" ${defaultImportMode === 'sync-all' ? 'checked' : ''} style="margin-top: 2px;">
                                        <span>
                                            <span style="display: block; font-weight: 700; color: #0F172A;">Insertar y actualizar</span>
                                            <span style="display: block; font-size: 0.82rem; color: #475569;">Inserta nuevos y actualiza existentes que cambiaron.</span>
                                        </span>
                                    </label>
                                    <label data-import-mode-option="preview-only" style="display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 14px; border: 1px solid #CBD5E1; background: #FFFFFF; cursor: pointer;">
                                        <input type="radio" name="import-mode" value="preview-only" ${defaultImportMode === 'preview-only' ? 'checked' : ''} style="margin-top: 2px;">
                                        <span>
                                            <span style="display: block; font-weight: 700; color: #0F172A;">Solo previsualizar sin guardar</span>
                                            <span style="display: block; font-size: 0.82rem; color: #475569;">No guarda cambios; solo permite revisar el contenido.</span>
                                        </span>
                                    </label>
                                </div>
                                <p id="import-mode-summary" style="margin: 0 0 14px 0; font-size: 0.88rem; color: #334155;"><strong>Accion de la sincronizacion:</strong> ${escapeHtml(initialModeCopy.summaryText)}</p>
                            `
                            : `<p style="margin: 0 0 14px 0; font-size: 0.88rem; color: #334155;"><strong>Accion de la sincronizacion:</strong> ${escapeHtml(initialModeCopy.summaryText)}</p>`}
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px;">
                            <input id="import-preview-search" type="search" placeholder="Filtrar por pozo..." style="flex: 1 1 220px; min-width: 220px; border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A; border-radius: 12px; padding: 10px 14px; outline: none;">
                            <button type="button" id="import-preview-export" style="border: 1px solid #BFDBFE; background: #EFF6FF; color: #1D4ED8; border-radius: 12px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Exportar preview</button>
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                            <button type="button" data-preview-tab="insert" style="border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Ver nuevos (${recordsToInsert.length})</button>
                            <button type="button" data-preview-tab="update" style="border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Ver actualizaciones (${recordsToUpdate.length})</button>
                            <button type="button" data-preview-tab="both" style="border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer;">Ver ambos</button>
                        </div>
                        <div id="import-preview-panel" style="flex: 1; min-height: 0; overflow: hidden;">
                            ${defaultTab === 'both'
                                ? `
                                    <div style="display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start;">
                                        ${buildImportPreviewCard({ title: 'Nuevos', items: recordsToInsert, kind, tone: 'neutral' })}
                                        ${buildImportPreviewCard({ title: 'Se actualizarán', items: recordsToUpdate, kind, tone: 'warm' })}
                                    </div>
                                `
                                : defaultTab === 'update'
                                ? buildImportPreviewCard({ title: 'Se actualizarán', items: recordsToUpdate, kind, tone: 'warm' })
                                : buildImportPreviewCard({ title: 'Nuevos', items: recordsToInsert, kind, tone: 'neutral' })}
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: initialModeCopy.buttonText,
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#1D4ED8',
                reverseButtons: true,
                preConfirm: () => {
                    if (!supportsImportModes) {
                        return { confirmed: true, mode: 'sync-all' };
                    }

                    const selectedMode = document.querySelector('input[name="import-mode"]:checked')?.value || defaultImportMode;
                    return { confirmed: selectedMode !== 'preview-only', mode: selectedMode };
                },
                didOpen: (popup) => {
                    const panel = popup.querySelector('#import-preview-panel');
                    const buttons = [...popup.querySelectorAll('[data-preview-tab]')];
                    const searchInput = popup.querySelector('#import-preview-search');
                    const exportButton = popup.querySelector('#import-preview-export');
                    const importModeInputs = [...popup.querySelectorAll('input[name="import-mode"]')];
                    const importModeOptions = [...popup.querySelectorAll('[data-import-mode-option]')];
                    const importModeSummary = popup.querySelector('#import-mode-summary');
                    const confirmButton = Swal.getConfirmButton();
                    let activeTab = defaultTab;
                    let currentQuery = '';

                    const setButtonState = (button, isActive) => {
                        button.style.background = isActive ? '#0F172A' : '#FFFFFF';
                        button.style.color = isActive ? '#FFFFFF' : '#0F172A';
                        button.style.borderColor = isActive ? '#0F172A' : '#CBD5E1';
                    };

                    const setImportModeState = (mode) => {
                        importModeOptions.forEach(option => {
                            const isActive = option.dataset.importModeOption === mode;
                            option.style.borderColor = isActive ? '#1D4ED8' : '#CBD5E1';
                            option.style.background = isActive ? '#EFF6FF' : '#FFFFFF';
                            option.style.boxShadow = isActive ? '0 0 0 1px rgba(29, 78, 216, 0.08)' : 'none';
                        });

                        const modeCopy = getImportModeCopy(mode);
                        if (importModeSummary) {
                            importModeSummary.innerHTML = `<strong>Accion de la sincronizacion:</strong> ${escapeHtml(modeCopy.summaryText)}`;
                        }

                        if (confirmButton) {
                            confirmButton.textContent = modeCopy.buttonText;
                        }
                    };

                    const renderBothPreviewCards = (insertItems, updateItems) => {
                        const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
                        if (isDesktop) {
                            return `
                                <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start;">
                                    ${buildImportPreviewCard({ title: 'Nuevos', items: insertItems, kind, tone: 'neutral' })}
                                    ${buildImportPreviewCard({ title: 'Se actualizarán', items: updateItems, kind, tone: 'warm' })}
                                </div>
                            `;
                        }

                        return `
                            <div style="display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start;">
                                ${buildImportPreviewCard({ title: 'Nuevos', items: insertItems, kind, tone: 'neutral' })}
                                ${buildImportPreviewCard({ title: 'Se actualizarán', items: updateItems, kind, tone: 'warm' })}
                            </div>
                        `;
                    };

                    const renderPreviewTab = (tab) => {
                        activeTab = tab;
                        const filteredInsertItems = filterImportPreviewItems(recordsToInsert, currentQuery);
                        const filteredUpdateItems = filterImportPreviewItems(recordsToUpdate, currentQuery);

                        if (tab === 'both') {
                            panel.innerHTML = renderBothPreviewCards(filteredInsertItems, filteredUpdateItems);
                        } else if (tab === 'update') {
                            panel.innerHTML = buildImportPreviewCard({ title: 'Se actualizarán', items: filteredUpdateItems, kind, tone: 'warm' });
                        } else {
                            panel.innerHTML = buildImportPreviewCard({ title: 'Nuevos', items: filteredInsertItems, kind, tone: 'neutral' });
                        }

                        buttons.forEach(button => {
                            setButtonState(button, button.dataset.previewTab === tab);
                        });
                    };

                    buttons.forEach(button => {
                        button.addEventListener('click', () => renderPreviewTab(button.dataset.previewTab));
                    });

                    searchInput?.addEventListener('input', (event) => {
                        currentQuery = event.target.value || '';
                        renderPreviewTab(activeTab);
                    });

                    exportButton?.addEventListener('click', () => {
                        try {
                            const filteredInsertItems = filterImportPreviewItems(recordsToInsert, currentQuery);
                            const filteredUpdateItems = filterImportPreviewItems(recordsToUpdate, currentQuery);
                            exportImportPreviewWorkbook({
                                fileName,
                                kind,
                                recordsCount,
                                pozoCount,
                                recordsToInsert: filteredInsertItems,
                                recordsToUpdate: filteredUpdateItems
                            });
                            const originalLabel = exportButton.textContent;
                            exportButton.textContent = 'Preview exportado';
                            exportButton.disabled = true;
                            setTimeout(() => {
                                exportButton.textContent = originalLabel;
                                exportButton.disabled = false;
                            }, 1800);
                        } catch (error) {
                            Swal.showValidationMessage(error.message || 'No fue posible exportar el preview.');
                        }
                    });

                    const handleResize = () => {
                        if (activeTab === 'both') {
                            renderPreviewTab(activeTab);
                        }
                    };

                    window.addEventListener('resize', handleResize);
                    popup.dataset.previewResizeBound = 'true';
                    popup._previewResizeHandler = handleResize;

                    importModeInputs.forEach(input => {
                        input.addEventListener('change', () => setImportModeState(input.value));
                    });

                    renderPreviewTab(defaultTab);
                    setImportModeState(defaultImportMode);
                },
                willClose: (popup) => {
                    if (popup?._previewResizeHandler) {
                        window.removeEventListener('resize', popup._previewResizeHandler);
                    }
                }
            });

            if (!result.isConfirmed) {
                return null;
            }

            return result.value?.mode || 'sync-all';
        }

        function bindDropImport(zone, input, handler) {
            if (!zone || !input) return;

            zone.addEventListener('click', () => input.click());
            input.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                await handler(file);
                resetSelectedFile(input);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                zone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    zone.classList.add('is-dragover');
                });
            });

            ['dragleave', 'dragend'].forEach(eventName => {
                zone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    zone.classList.remove('is-dragover');
                });
            });

            zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('is-dragover');
                const file = e.dataTransfer?.files?.[0];
                await handler(file);
                resetSelectedFile(input);
            });
        }

        function waitForBrowserPaint() {
            return new Promise(resolve => setTimeout(resolve, 30));
        }

        bindDropImport(techDropZone, techFileInput, handleTechnicalFile);
        bindDropImport(levelDropZone, levelFileInput, handleLevelFile);

        function normalizeCsvKey(value) {
            return String(value || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .replace(/_+/g, '_');
        }

        const DAILY_IMPORT_FIELD_ALIASES = {
            pozo_name: ['pozo_name', 'pozo', 'well', 'well_name', 'nombre_pozo'],
            campo: ['campo', 'campo_name', 'field', 'area'],
            fecha: ['fecha', 'fecha_medicion', 'date', 'dia', 'fecha_registro'],
            hora: ['hora', 'time', 'hora_medicion'],
            frecuencia: ['frecuencia', 'frecuencia_hz', 'hz', 'freq', 'frequency', 'frec'],
            corriente_motor: ['corriente_motor', 'corriente_m', 'corriente_amp', 'i_motor_amp', 'i_motor', 'motor_amp', 'motor_current', 'amperaje_motor', 'i_motor_a'],
            pip: ['pip_psi', 'pip', 'presion_pip', 'pump_intake_pressure'],
            tm: ['tm', 'tm_f', 'temp_tm', 'temp_tm_f', 'temperatura_tm', 'temperatura_tm_f', 'temp_motor', 'motor_temp'],
            presion_thp: ['presion_thp', 'thp', 'thp_psi', 'thp_ps', 'thp_psi_', 'tubing_head_pressure'],
            presion_chp: ['presion_chp', 'chp', 'chp_psi', 'chp_ps', 'chp_psi_', 'casing_head_pressure'],
            presion_lf: ['presion_lf', 'lf', 'lf_psi', 'lf_ps', 'lf_psi_', 'line_pressure'],
            sentido_giro: ['sentido_giro', 'sentido_de_giro', 'giro', 'direccion_giro', 'rotation_direction', 'rotation', 'sentido'],
            vsd_a: ['vsd_a', 'vsd_a_amp', 'vsd_a_amperios', 'i_vsd_a', 'i_vsd_a_a', 'i_vsd_a_amp', 'ivsd_a', 'fase_a', 'a'],
            vsd_b: ['vsd_b', 'vsd_b_amp', 'vsd_b_amperios', 'i_vsd_b', 'i_vsd_b_a', 'i_vsd_b_amp', 'ivsd_b', 'fase_b', 'b'],
            vsd_c: ['vsd_c', 'vsd_c_amp', 'vsd_c_amperios', 'i_vsd_c', 'i_vsd_c_a', 'i_vsd_c_amp', 'ivsd_c', 'fase_c', 'c'],
            actividad: ['actividad', 'activity'],
            estatus: ['estatus', 'status', 'run_status'],
            observaciones: ['observaciones', 'observacion', 'obs', 'comentario', 'comentarios', 'remarks']
        };

        function getFirstAliasValue(source, aliases) {
            for (const alias of aliases) {
                if (source[alias] !== undefined && source[alias] !== null && `${source[alias]}`.trim() !== '') {
                    return source[alias];
                }
            }
            return undefined;
        }

        function getHeaderAliasValue(row = [], headerRow = [], aliases = []) {
            const normalizedAliases = new Set(aliases.map(normalizeCsvKey));
            for (let index = 0; index < headerRow.length; index += 1) {
                const headerKey = normalizeCsvKey(headerRow[index] || `column_${index + 1}`);
                if (!normalizedAliases.has(headerKey)) continue;
                const value = Array.isArray(row) ? row[index] : undefined;
                if (value !== undefined && value !== null && `${value}`.trim() !== '') return value;
            }
            return undefined;
        }

        function getDailyMatchedFields(source) {
            return Object.entries(DAILY_IMPORT_FIELD_ALIASES)
                .filter(([, aliases]) => getFirstAliasValue(source, aliases) !== undefined)
                .map(([field]) => field);
        }

        function getDailyHeaderFields(row = []) {
            const normalizedHeaderMap = Object.fromEntries(
                row
                    .map((cell, index) => [normalizeCsvKey(cell || `column_${index + 1}`), true])
                    .filter(([key]) => key && !key.startsWith('column_'))
            );

            return getDailyMatchedFields(normalizedHeaderMap);
        }

        async function parseTabularFile(file, options = {}) {
            const { dynamicTyping = false } = options;
            const extension = (file.name.split('.').pop() || '').toLowerCase();

            if (extension === 'csv') {
                return new Promise((resolve, reject) => {
                    Papa.parse(file, {
                        header: true,
                        dynamicTyping,
                        skipEmptyLines: true,
                        complete: (results) => resolve(results.data || []),
                        error: reject
                    });
                });
            }

            if (extension === 'xlsx' || extension === 'xls') {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
                const firstSheetName = workbook.SheetNames[0];
                if (!firstSheetName) return [];
                return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
            }

            throw new Error('Formato no soportado. Usa CSV, XLSX o XLS.');
        }

        function getFileExtension(fileName = '') {
            return (String(fileName).split('.').pop() || '').toLowerCase();
        }

        function excelColumnToIndex(columnLabel) {
            return String(columnLabel || '')
                .trim()
                .toUpperCase()
                .split('')
                .reduce((accumulator, character) => (accumulator * 26) + (character.charCodeAt(0) - 64), 0) - 1;
        }

        function getExcelCellValue(row, columnLabel) {
            const index = excelColumnToIndex(columnLabel);
            return Array.isArray(row) ? row[index] : undefined;
        }

        function getFirstNonEmptyValue(values = []) {
            for (const value of values) {
                if (value !== undefined && value !== null && `${value}`.trim() !== '') {
                    return value;
                }
            }
            return undefined;
        }

        function getLikelyPipValue(...values) {
            const candidates = values.filter(value => value !== undefined && value !== null && `${value}`.trim() !== '');
            if (candidates.length === 0) return undefined;

            const psiCandidate = candidates.find(value => {
                const numeric = roundNumericValue(value, 4);
                return numeric !== null && Math.abs(numeric) >= 10;
            });

            return psiCandidate ?? candidates[0];
        }

        function collectExcelObservationText(row, startColumnLabel = 'EW') {
            if (!Array.isArray(row)) return undefined;

            const startIndex = excelColumnToIndex(startColumnLabel);
            return row
                .slice(startIndex)
                .map(value => value === undefined || value === null ? '' : String(value).trim())
                .filter(Boolean)
                .join(' | ');
        }

            function collectExcelObservationTextFromIndex(row, startIndex = 0) {
                if (!Array.isArray(row)) return undefined;

                return row
                .slice(startIndex)
                .map(value => value === undefined || value === null ? '' : String(value).trim())
                .filter(Boolean)
                .join(' | ');
            }

        function normalizeOperationalStatus(value) {
            const raw = String(value ?? '').trim();
            if (!raw) return null;

            const normalized = raw
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '');

            const runValues = new Set([
                'RUN',
                'RUNNING',
                'ON',
                'OC',
                'ENCENDIDO',
                'OPERANDO',
                'OPERATIVO',
                'OPERATIVA',
                'ACTIVO',
                'ACTIVA',
                'MARCHA',
                'ENMARCHA',
                'FUNCIONANDO',
                'FUNCIONA',
                'OPERA',
                'PRODUCCION',
                'PRODUCIENDO',
                'SERVICIO',
                'LISTO',
                'NORMAL',
                'OK',
                '1'
            ]);

            const offValues = new Set([
                'OFF',
                'OFFLINE',
                'STOP',
                'STOPPED',
                'PARADO',
                'PARADA',
                'APAGADO',
                'APAGADA',
                'INACTIVO',
                'INACTIVA',
                'DETENIDO',
                'DETENIDA',
                'CAIDO',
                'FUERADESERVICIO',
                'FUERA',
                'NOOPERATIVO',
                'NOOPERATIVA',
                'NOOPERA',
                'SINOPERACION',
                'SINOPERAR',
                '0'
            ]);

            if (runValues.has(normalized)) return 'RUN';
            if (offValues.has(normalized)) return 'OFF';
            if (normalized.includes('RUN')) return 'RUN';
            if (normalized.includes('OFF') || normalized.includes('STOP') || normalized.includes('PARAD') || normalized.includes('APAG')) return 'OFF';
            if (normalized.includes('OPER') || normalized.includes('PRODUC') || normalized.includes('MARCHA') || normalized.includes('FUNCION')) return 'RUN';
            return null;
        }

        function getDailyHeaderMatchCount(row = []) {
            return getDailyHeaderFields(row).length;
        }

        function isLikelyDailyHeaderFields(fields = []) {
            const fieldSet = new Set(fields);
            return fieldSet.has('pozo_name')
                && fieldSet.has('fecha')
                && (fieldSet.has('pip') || fieldSet.has('frecuencia') || fieldSet.has('estatus') || (fieldSet.has('actividad') && fieldSet.has('estatus')));
        }

        function findDailyHeaderRowIndex(rows = []) {
            let bestIndex = -1;
            let bestScore = 0;
            let bestFields = [];

            rows.slice(0, 20).forEach((row, index) => {
                const fields = getDailyHeaderFields(row);
                const score = fields.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                    bestFields = fields;
                }
            });

            return bestScore >= 4 || isLikelyDailyHeaderFields(bestFields) ? bestIndex : -1;
        }

        function parseDailyExcelWithHeaders(rows = [], headerRowIndex = 0) {
            const headerRow = rows[headerRowIndex] || [];
            const originalHeaders = headerRow.map((cell, index) => String(cell || `column_${index + 1}`).trim() || `column_${index + 1}`);
            const headers = headerRow.map((cell, index) => normalizeCsvKey(cell || `column_${index + 1}`));

            return rows.slice(headerRowIndex + 1).map(row => {
                const mappedRow = {};
                const sourceRowData = {};
                headers.forEach((header, index) => {
                    const value = Array.isArray(row) ? row[index] : undefined;
                    sourceRowData[originalHeaders[index]] = value;
                    if (!header) return;
                    mappedRow[header] = value;
                });
                mappedRow.__sourceRowData = sourceRowData;
                return mappedRow;
            });
        }

        function buildSourceRowDataFromHeader(row = [], headerRow = []) {
            const originalHeaders = headerRow.map((cell, index) => String(cell || `column_${index + 1}`).trim() || `column_${index + 1}`);
            return Object.fromEntries(originalHeaders.map((header, index) => [header, Array.isArray(row) ? row[index] : undefined]));
        }

        function parseDailyExcelWithLayout(rows = [], headerRowIndex = 0, layout = DAILY_EXCEL_LAYOUTS[0]) {
            const headerRow = rows[headerRowIndex] || [];
            return rows.slice(headerRowIndex + 1).map(row => ({
                ...layout.mapRow(row, headerRow),
                __sourceRowData: buildSourceRowDataFromHeader(row, headerRow)
            }));
        }

        function getConsolidatedSourceRowData(row = {}) {
            if (row.__sourceRowData && typeof row.__sourceRowData === 'object') {
                return { ...row.__sourceRowData };
            }

            return Object.fromEntries(
                Object.entries(row || {})
                    .filter(([key]) => !String(key).startsWith('__'))
            );
        }

        function scoreParsedDailyRows(rows = []) {
            return rows
                .slice(0, 40)
                .reduce((score, row) => {
                    let rowScore = 0;

                    if (`${row?.pozo_name ?? ''}`.trim()) rowScore += 2;
                    if (toIsoDate(row?.fecha)) rowScore += 2;
                    if (toIsoTime(row?.hora)) rowScore += 1;
                    if (normalizeOperationalStatus(row?.estatus)) rowScore += 3;
                    if (roundNumericValue(row?.frecuencia) !== null) rowScore += 3;
                    if (roundNumericValue(row?.corriente_motor) !== null) rowScore += 2;
                    if (roundNumericValue(row?.vsd_a) !== null) rowScore += 1;
                    if (roundNumericValue(row?.vsd_b) !== null) rowScore += 1;
                    if (roundNumericValue(row?.vsd_c) !== null) rowScore += 1;
                    if (roundNumericValue(row?.pip) !== null) rowScore += 2;
                    if (roundNumericValue(row?.tm) !== null) rowScore += 2;
                    if (roundNumericValue(row?.presion_thp) !== null) rowScore += 1;
                    if (roundNumericValue(row?.presion_chp) !== null) rowScore += 1;
                    if (roundNumericValue(row?.presion_lf) !== null) rowScore += 1;

                    return score + rowScore;
                }, 0);
        }

        const DAILY_EXCEL_LAYOUTS = [
            {
                name: 'dashboard_general_consolidado',
                mapRow(row, headerRow = []) {
                    return {
                        pozo_name: getExcelCellValue(row, 'A'),
                        campo: getExcelCellValue(row, 'B'),
                        fecha: getExcelCellValue(row, 'J'),
                        hora: getExcelCellValue(row, 'L'),
                        estatus: getExcelCellValue(row, 'N'),
                        frecuencia: getExcelCellValue(row, 'O'),
                        corriente_motor: getExcelCellValue(row, 'R'),
                        pip: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.pip) ?? getExcelCellValue(row, 'AD'),
                        tm: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.tm) ?? getExcelCellValue(row, 'AG'),
                        presion_thp: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_thp) ?? getExcelCellValue(row, 'BQ'),
                        presion_chp: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_chp) ?? getExcelCellValue(row, 'BR'),
                        presion_lf: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_lf) ?? getExcelCellValue(row, 'BS'),
                        vsd_a: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.vsd_a) ?? getExcelCellValue(row, 'U'),
                        vsd_b: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.vsd_b) ?? getExcelCellValue(row, 'V'),
                        vsd_c: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.vsd_c) ?? getExcelCellValue(row, 'W'),
                        sentido_giro: getExcelCellValue(row, 'Q'),
                        observaciones: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.observaciones) || collectExcelObservationText(row, 'EW')
                    };
                }
            },
            {
                name: 'standard_dashboard',
                mapRow(row, headerRow = []) {
                    return {
                        pozo_name: getExcelCellValue(row, 'A'),
                        campo: getExcelCellValue(row, 'B'),
                        fecha: getExcelCellValue(row, 'C'),
                        hora: getFirstNonEmptyValue([getExcelCellValue(row, 'D'), getExcelCellValue(row, 'E')]),
                        estatus: getExcelCellValue(row, 'F'),
                        frecuencia: getExcelCellValue(row, 'G'),
                        corriente_motor: getExcelCellValue(row, 'J'),
                        vsd_a: getExcelCellValue(row, 'M'),
                        vsd_b: getExcelCellValue(row, 'N'),
                        vsd_c: getExcelCellValue(row, 'O'),
                        pip: getLikelyPipValue(getExcelCellValue(row, 'AB'), getExcelCellValue(row, 'V'), getExcelCellValue(row, 'M')),
                        tm: getExcelCellValue(row, 'Y'),
                        presion_thp: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_thp),
                        presion_chp: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_chp),
                        presion_lf: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.presion_lf),
                        observaciones: getHeaderAliasValue(row, headerRow, DAILY_IMPORT_FIELD_ALIASES.observaciones) || collectExcelObservationText(row, 'EW')
                    };
                }
            },
            {
                name: 'tom_compacto',
                mapRow(row) {
                    return {
                        pozo_name: getExcelCellValue(row, 'A'),
                        campo: getExcelCellValue(row, 'B'),
                        fecha: getExcelCellValue(row, 'C'),
                        hora: getExcelCellValue(row, 'D'),
                        estatus: getExcelCellValue(row, 'E'),
                        frecuencia: getExcelCellValue(row, 'F'),
                        vsd_a: getExcelCellValue(row, 'H'),
                        vsd_b: getExcelCellValue(row, 'I'),
                        vsd_c: getExcelCellValue(row, 'J'),
                        corriente_motor: getExcelCellValue(row, 'K'),
                        pip: getLikelyPipValue(getExcelCellValue(row, 'AB'), getExcelCellValue(row, 'M'), getExcelCellValue(row, 'V')),
                        tm: getExcelCellValue(row, 'N'),
                        presion_thp: getExcelCellValue(row, 'O'),
                        presion_chp: getExcelCellValue(row, 'P'),
                        presion_lf: getExcelCellValue(row, 'Q'),
                        observaciones: collectExcelObservationTextFromIndex(row, excelColumnToIndex('R'))
                    };
                }
            }
        ];

        function scoreDailyExcelLayout(rows = [], layout) {
            return rows
                .filter(row => Array.isArray(row) && row.some(value => `${value ?? ''}`.trim() !== ''))
                .slice(0, 25)
                .reduce((score, row) => {
                    const mappedRow = layout.mapRow(row);
                    let rowScore = 0;

                    if (`${mappedRow.pozo_name ?? ''}`.trim()) rowScore += 2;
                    if (toIsoDate(mappedRow.fecha)) rowScore += 2;
                    if (toIsoTime(mappedRow.hora)) rowScore += 1;
                    if (normalizeOperationalStatus(mappedRow.estatus)) rowScore += 3;
                    if (roundNumericValue(mappedRow.frecuencia) !== null) rowScore += 2;
                    if (roundNumericValue(mappedRow.pip) !== null) rowScore += 1;
                    if (roundNumericValue(mappedRow.tm) !== null) rowScore += 1;

                    return score + rowScore;
                }, 0);
        }

        function detectDailyExcelLayout(rows = []) {
            const scoredLayouts = DAILY_EXCEL_LAYOUTS
                .map(layout => ({ layout, score: scoreDailyExcelLayout(rows, layout) }))
                .sort((a, b) => b.score - a.score);

            return scoredLayouts[0]?.layout || DAILY_EXCEL_LAYOUTS[0];
        }

        async function parseDailyExcelFile(file) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            if (!workbook.SheetNames.length) return [];

            const dashboardSheetName = workbook.SheetNames.find(sheetName => normalizeCsvKey(sheetName) === 'dashboard_general');
            if (!dashboardSheetName) {
                throw new Error('No encontré la hoja Dashboard General en este Excel. Verifica el nombre de la hoja antes de importar desde Gestión.');
            }

            const candidates = [dashboardSheetName].map(sheetName => {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                    header: 1,
                    defval: '',
                    raw: true
                });

                const headerRowIndex = findDailyHeaderRowIndex(rows);
                const layoutHeaderIndex = headerRowIndex >= 0 ? headerRowIndex : 0;
                const detectedLayout = DAILY_EXCEL_LAYOUTS.find(layout => layout.name === 'dashboard_general_consolidado') || DAILY_EXCEL_LAYOUTS[0];
                const layoutRows = parseDailyExcelWithLayout(rows, layoutHeaderIndex, detectedLayout);
                const layoutScore = scoreParsedDailyRows(layoutRows);

                if (headerRowIndex >= 0) {
                    const headerFields = getDailyHeaderFields(rows[headerRowIndex] || []);
                    const headerRows = parseDailyExcelWithHeaders(rows, headerRowIndex);
                    const headerBonus = ['pip', 'tm', 'presion_thp', 'presion_chp', 'presion_lf', 'vsd_a', 'vsd_b', 'vsd_c']
                        .filter(field => headerFields.includes(field))
                        .length * 20;
                    const headerScore = scoreParsedDailyRows(headerRows) + headerBonus;
                    return {
                        sheetName,
                        rows: headerScore >= layoutScore ? headerRows : layoutRows,
                        score: Math.max(headerScore, layoutScore)
                    };
                }

                return { sheetName, rows: layoutRows, score: layoutScore };
            }).sort((left, right) => right.score - left.score);

            return candidates[0]?.rows || [];
        }

        function normalizeImportedRow(row) {
            const normalizedRow = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                if (String(key).startsWith('__')) return;
                normalizedRow[normalizeCsvKey(key)] = value;
            });

            Object.entries(DAILY_IMPORT_FIELD_ALIASES).forEach(([field, aliases]) => {
                const aliasValue = getFirstAliasValue(normalizedRow, aliases);
                if (aliasValue !== undefined) normalizedRow[field] = aliasValue;
            });

            normalizedRow.fecha = toIsoDate(normalizedRow.fecha) || normalizedRow.fecha;
            normalizedRow.fecha_tech = toIsoDate(normalizedRow.fecha_tech) || normalizedRow.fecha_tech;
            normalizedRow.fecha_medicion = toIsoDate(normalizedRow.fecha_medicion) || normalizedRow.fecha_medicion;
            normalizedRow.hora = toIsoTime(normalizedRow.hora) || '00:00:00';
            normalizedRow.estatus_original = normalizedRow.estatus;
            normalizedRow.estatus = normalizeOperationalStatus(normalizedRow.estatus);

            return normalizedRow;
        }

        function hasDailyTelemetryData(row) {
            const telemetryFields = [
                'frecuencia',
                'corriente_motor',
                'pip',
                'tm',
                'presion_thp',
                'presion_chp',
                'presion_lf',
                'vsd_a',
                'vsd_b',
                'vsd_c',
                'sentido_giro'
            ];

            const hasTelemetry = telemetryFields.some(field => {
                const value = row[field];
                return value !== undefined && value !== null && `${value}`.trim() !== '';
            });

            if (hasTelemetry) {
                return true;
            }

            return normalizeOperationalStatus(row?.estatus) === 'OFF';
        }

        function parseFlexibleNumber(value) {
            if (value === undefined || value === null || value === '') return null;
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : null;
            }

            let normalized = String(value).trim().replace(/\s+/g, '');
            if (!normalized) return null;

            const hasComma = normalized.includes(',');
            const hasDot = normalized.includes('.');

            if (hasComma && hasDot) {
                if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
                    normalized = normalized.replace(/\./g, '').replace(',', '.');
                } else {
                    normalized = normalized.replace(/,/g, '');
                }
            } else if (hasComma) {
                if (/^-?\d{1,3}(,\d{3})+$/.test(normalized)) {
                    normalized = normalized.replace(/,/g, '');
                } else {
                    normalized = normalized.replace(',', '.');
                }
            } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(normalized)) {
                normalized = normalized.replace(/\./g, '');
            }

            const parsed = parseFloat(normalized);
            return Number.isFinite(parsed) ? parsed : null;
        }

        function parseCsvNumber(value) {
            const parsed = parseFlexibleNumber(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function parseCsvInteger(value, fallback = 1) {
            if (value === undefined || value === null || value === '') return fallback;
            const normalized = String(value).replace(/[^\d-]/g, '');
            const parsed = parseInt(normalized, 10);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function roundNumericValue(value, decimals = 2) {
            const numeric = parseFlexibleNumber(value);
            if (!Number.isFinite(numeric)) return null;
            const factor = 10 ** decimals;
            return Math.round(numeric * factor) / factor;
        }

        function formatLocalDateParts(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function toIsoDate(value) {
            if (value === undefined || value === null || value === '') return null;

            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                return formatLocalDateParts(value);
            }

            if (typeof value === 'number' && Number.isFinite(value)) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const date = new Date(excelEpoch.getTime() + (value * 86400000));
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }

            const raw = String(value).trim();
            if (!raw) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

            const monthMap = {
                jan: 1, ene: 1,
                feb: 2,
                mar: 3,
                apr: 4, abr: 4,
                may: 5,
                jun: 6,
                jul: 7,
                aug: 8, ago: 8,
                sep: 9,
                oct: 10,
                nov: 11,
                dec: 12, dic: 12
            };

            const compact = raw.replace(/\//g, '-').replace(/\./g, '-').toLowerCase();

            let match = compact.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                const yearNum = parseInt(match[3], 10);
                const year = match[3].length === 2 ? (yearNum >= 50 ? `19${match[3]}` : `20${match[3]}`) : `${yearNum}`;
                return `${year}-${month}-${day}`;
            }

            match = compact.match(/^(\d{1,2})-([a-z]{3})-(\d{2,4})$/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const monthNum = monthMap[match[2]];
                if (!monthNum) return null;
                const month = String(monthNum).padStart(2, '0');
                const yearNum = parseInt(match[3], 10);
                const year = match[3].length === 2 ? (yearNum >= 50 ? `19${match[3]}` : `20${match[3]}`) : `${yearNum}`;
                return `${year}-${month}-${day}`;
            }

            return null;
        }

        function toIsoTime(value) {
            if (value === undefined || value === null || value === '') return null;

            if (value instanceof Date && !Number.isNaN(value.getTime())) {
                const hours = String(value.getHours()).padStart(2, '0');
                const minutes = String(value.getMinutes()).padStart(2, '0');
                const seconds = String(value.getSeconds()).padStart(2, '0');
                return `${hours}:${minutes}:${seconds}`;
            }

            if (typeof value === 'number' && Number.isFinite(value)) {
                const totalSeconds = Math.round(value * 86400);
                const hours = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
                const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
                const seconds = String(totalSeconds % 60).padStart(2, '0');
                return `${hours}:${minutes}:${seconds}`;
            }

            const raw = String(value).trim();
            if (!raw) return null;

            let match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (match) {
                const hours = match[1].padStart(2, '0');
                const minutes = match[2];
                const seconds = match[3] || '00';
                return `${hours}:${minutes}:${seconds}`;
            }

            match = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
            if (match) {
                let hours = parseInt(match[1], 10);
                const minutes = match[2];
                const meridiem = match[3].toLowerCase();
                if (meridiem === 'pm' && hours < 12) hours += 12;
                if (meridiem === 'am' && hours === 12) hours = 0;
                return `${String(hours).padStart(2, '0')}:${minutes}:00`;
            }

            return null;
        }

        function mapTechnicalCsvRow(row) {
            const normalizedRow = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                normalizedRow[normalizeCsvKey(key)] = value;
            });

            const pozoName = normalizedRow.pozo || normalizedRow.pozo_name;
            if (!pozoName) return null;

            return {
                pozo_name: String(pozoName).trim(),
                campo_name: String(normalizedRow.campo || normalizedRow.campo_name || '').trim(),
                ef: String(normalizedRow.ef || normalizedRow.estacion || '').trim(),
                fecha: toIsoDate(normalizedRow.fecha_ultima_medicion || normalizedRow.fecha_medicion || normalizedRow.fecha),
                potencial: parseCsvNumber(normalizedRow.potencial),
                bbpd: parseCsvNumber(normalizedRow.bbpd),
                ays_percentage: parseCsvNumber(normalizedRow.ays || normalizedRow.ays_percentage),
                bnpd: parseCsvNumber(normalizedRow.bnpd),
                cat_number: parseCsvInteger(normalizedRow.cat || normalizedRow.cat_number, 1)
            };
        }

        async function handleTechnicalFile(file) {
            if (!file) return;

            try {
                const parsedRows = await parseTabularFile(file);
                const allRows = parsedRows
                    .map(mapTechnicalCsvRow)
                    .filter(row => row && row.pozo_name);
                const rows = filterRowsByActiveScope(allRows);
                const omittedByScopeCount = allRows.length - rows.length;

                if (rows.length === 0) {
                    techStatusDiv.style.display = 'block';
                    techStatusText.textContent = omittedByScopeCount > 0
                        ? 'El archivo no contiene pozos del contrato activo.'
                        : 'No se encontraron filas válidas para Producción Técnica.';
                    return;
                }

                const previewResult = await previewTechnicalMeasurements(rows);
                const confirmed = await confirmImportSummary({
                    title: 'Confirmar carga técnica',
                    fileName: file.name,
                    recordsCount: rows.length,
                    pozoCount: countUniquePozos(rows),
                    detailText: 'Se sincronizarán las mediciones técnicas detectadas y se actualizará el historial por pozo y fecha.',
                    previewResult,
                    kind: 'technical'
                });

                if (!confirmed) {
                    techStatusDiv.style.display = 'block';
                    techStatusText.textContent = 'Carga técnica cancelada por el usuario.';
                    return;
                }

                beginImportSession({
                    kind: 'technical',
                    fileName: file.name,
                    recordsCount: rows.length,
                    pozoCount: countUniquePozos(rows)
                });

                techStatusDiv.style.display = 'block';
                techStatusText.textContent = `Subiendo ${rows.length} pozos técnicos...`;
                updateImportSession(`Sincronizando ${rows.length} medicion(es) tecnica(s)...`, 'No cierres ni abandones esta pantalla hasta finalizar la carga.');

                const syncResult = await syncTechnicalMeasurements(rows);

                updateImportSession('Actualizando catalogos y formularios...', 'La importacion ya casi termina.');
                await refreshPozoLists();
                setTechnicalFormVisibility(false);
                techStatusText.textContent = `✅ Historial técnico sincronizado. Nuevas: ${syncResult.inserted}. Actualizadas: ${syncResult.updated}.`;
                populateTechnicalForm(rows[0]);
                finishImportSession();
                Swal.fire({
                    icon: 'success',
                    title: 'Importación Técnica Exitosa',
                    text: `Historial técnico sincronizado. Nuevas: ${syncResult.inserted}. Actualizadas: ${syncResult.updated}.`
                });
            } catch (err) {
                finishImportSession();
                techStatusDiv.style.display = 'block';
                techStatusText.textContent = `Error al cargar archivo técnico: ${err.message}`;
                Swal.fire({ icon: 'error', title: 'Error de Importación', text: err.message });
            }
        }

        function mapLevelCsvRow(row) {
            const normalizedRow = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                normalizedRow[normalizeCsvKey(key)] = value;
            });

            const pozoName = normalizedRow.pozo || normalizedRow.pozo_name || normalizedRow.well || normalizedRow.well_name;
            if (!pozoName) return null;

            const nivel = normalizedRow.nivel_dinamico_ft || normalizedRow.nivel_dinamico || normalizedRow.nivel || normalizedRow.nivel_dinamico_ft_ || normalizedRow.nivel_dinamico_f;
            const sumergencia = normalizedRow.sumergencia_ft || normalizedRow.sumergencia || normalizedRow.sumergencia_ft_ || normalizedRow.sumergencia_f;
            const presionPip = normalizedRow.presion_de_fondo_pip_psi || normalizedRow.presion_pip || normalizedRow.presion_de_fondo_pip || normalizedRow.presion_pip_psi || normalizedRow.pip || normalizedRow.pip_psi || normalizedRow.presion_fondo_pip || normalizedRow.presion_de_fondo_pip_psi_;

            return {
                pozo_name: String(pozoName).trim(),
                fecha: toIsoDate(normalizedRow.fecha || normalizedRow.date || normalizedRow.fecha_medicion || normalizedRow.fecha_prueba),
                nivel_dinamico: parseCsvNumber(nivel),
                sumergencia: parseCsvNumber(sumergencia),
                presion_pip: parseCsvNumber(presionPip),
                operational_scope: activeOperationalScope
            };
        }

        async function handleLevelFile(file) {
            if (!file) return;

            try {
                const parsedRows = await parseTabularFile(file);
                const allRows = parsedRows
                    .map(mapLevelCsvRow)
                    .filter(row => row && row.pozo_name);
                const rows = filterRowsByActiveScope(allRows);
                const omittedByScopeCount = allRows.length - rows.length;

                if (rows.length === 0) {
                    levelStatusDiv.style.display = 'block';
                    if (omittedByScopeCount > 0) {
                        levelStatusText.textContent = 'El archivo no contiene pozos del contrato activo.';
                    } else {
                        const detectedHeaders = parsedRows.length > 0 ? Object.keys(parsedRows[0]).join(', ') : 'Ninguna';
                        levelStatusText.textContent = `No se encontraron filas válidas. Columnas detectadas: [ ${detectedHeaders} ]. Asegúrate de que incluyan 'Pozo' y 'Fecha'.`;
                    }
                    return;
                }

                const previewResult = await previewLevelTestsSync(rows);

                const confirmed = await confirmImportSummary({
                    title: 'Confirmar carga de niveles',
                    fileName: file.name,
                    recordsCount: rows.length,
                    pozoCount: countUniquePozos(rows),
                    detailText: 'Se sincronizarán las pruebas de nivel detectadas y se actualizará el historial por pozo y fecha.',
                    previewResult,
                    kind: 'level'
                });

                if (!confirmed) {
                    levelStatusDiv.style.display = 'block';
                    levelStatusText.textContent = 'Carga de niveles cancelada por el usuario.';
                    return;
                }

                beginImportSession({
                    kind: 'level',
                    fileName: file.name,
                    recordsCount: rows.length,
                    pozoCount: countUniquePozos(rows)
                });

                levelStatusDiv.style.display = 'block';
                levelStatusText.textContent = `Subiendo ${rows.length} pruebas de nivel...`;
                updateImportSession(`Sincronizando ${rows.length} prueba(s) de nivel...`, 'No cierres ni abandones esta pantalla hasta finalizar la carga.');

                const syncResult = await syncLevelTests(rows);

                updateImportSession('Actualizando catálogos y formularios...', 'La importación ya casi termina.');
                await refreshPozoLists();
                setStoredSelectedPozo(rows[0].pozo_name);
                document.getElementById('level_pozo_name').value = rows[0].pozo_name;
                await syncLevelPozoContext();
                
                // Cerrar modal
                window.closeGestionModal('modal-level-entry', true);

                levelStatusText.textContent = `✅ Historial de niveles sincronizado. Nuevas: ${syncResult.inserted}. Actualizadas: ${syncResult.updated}.`;
                finishImportSession();
                Swal.fire({
                    icon: 'success',
                    title: 'Importación de Niveles Exitosa',
                    text: `Historial de niveles sincronizado. Nuevas: ${syncResult.inserted}. Actualizadas: ${syncResult.updated}.`
                });
            } catch (err) {
                finishImportSession();
                levelStatusDiv.style.display = 'block';
                levelStatusText.textContent = `Error al cargar archivo de niveles: ${err.message}`;
                Swal.fire({ icon: 'error', title: 'Error de Importación', text: err.message });
            }
        }

        // Cierre de sesion desde Gestion.
        document.getElementById('logout-btn')?.addEventListener('click', logout);
        document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);

        // Flujo de importacion de archivos operativos.
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const statusDiv = document.getElementById('upload-status');
        const statusText = document.getElementById('status-text');
        bindDropImport(dropZone, fileInput, handleFile);
        async function handleFile(file) {
            if (!file) return;

            try {
                statusDiv.style.display = 'block';
                statusText.textContent = 'Leyendo archivo Excel...';
                Swal.fire({
                    title: 'Leyendo Excel',
                    text: 'Buscando la hoja Dashboard General y preparando los registros.',
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => { Swal.showLoading(); }
                });
                await waitForBrowserPaint();

                const extension = getFileExtension(file.name);
                const parsedRows = extension === 'xlsx' || extension === 'xls'
                    ? await parseDailyExcelFile(file)
                    : await parseTabularFile(file, { dynamicTyping: true });
                statusDiv.style.display = 'block';
                statusText.textContent = 'Subiendo...';
                if (Swal.isVisible()) Swal.close();

                const firstRow = parsedRows[0] || {};
                const normalizedHeaderKeys = Object.keys(firstRow).map(normalizeCsvKey).filter(Boolean);
                const detectedDailyFields = getDailyMatchedFields(Object.fromEntries(normalizedHeaderKeys.map(key => [key, true])));

                const cleanData = parsedRows
                    .map(row => ({
                        ...normalizeImportedRow(row),
                        __consolidated_row_data: getConsolidatedSourceRowData(row)
                    }))
                    .filter(r => r.pozo_name && r.fecha);

                const telemetryCandidates = cleanData.filter(hasDailyTelemetryData);
                const invalidStatusRows = telemetryCandidates.filter(row => !row.estatus);
                const telemetryRows = telemetryCandidates.filter(row => row.estatus && isPozoAllowedByActiveScope(row.pozo_name));
                const omittedByScopeCount = telemetryCandidates.filter(row => row.estatus && !isPozoAllowedByActiveScope(row.pozo_name)).length;

                if (telemetryCandidates.length === 0) {
                    const looksTechnicalFile = cleanData.some(row => row.ef || row.potencial !== undefined || row.bbpd !== undefined || row.ays !== undefined || row.bnpd !== undefined || row.cat !== undefined || row.cat_number !== undefined);
                    throw new Error(looksTechnicalFile
                        ? 'Este archivo parece corresponder a Produccion Tecnica. Cargalo en la seccion tecnica, no en Entrada de Parametros.'
                        : `No se encontraron columnas validas para monitoreo diario en el archivo importado. Detectadas: ${detectedDailyFields.join(', ') || 'ninguna'}.`);
                }

                if (telemetryRows.length === 0 && invalidStatusRows.length > 0) {
                    const invalidExamples = invalidStatusRows
                        .slice(0, 3)
                        .map(row => String(row.estatus_original || row.estatus || row.estado || '').trim())
                        .filter(Boolean);
                    const detail = invalidExamples.length > 0
                        ? ` Valores detectados: ${invalidExamples.join(', ')}.`
                        : '';
                    throw new Error(`No pude interpretar la columna ESTATUS operativo en ${invalidStatusRows.length} fila(s). Verifica que Gestion este leyendo ESTATUS y no ESTADO/CATEGORIA.${detail}`);
                }

                const invalidStatusWarning = invalidStatusRows.length > 0
                    ? `${invalidStatusRows.length} fila(s) se omitieron porque no tienen ESTATUS operativo interpretable.`
                    : '';

                if (telemetryRows.length === 0 && omittedByScopeCount > 0) {
                    throw new Error(`El archivo contiene ${omittedByScopeCount} registro(s), pero ninguno pertenece al contrato activo.`);
                }

                const telemetryColumns = ['pozo_name', 'campo', 'fecha', 'hora', 'frecuencia', 'corriente_motor', 'presion_thp', 'presion_chp', 'presion_lf', 'pip', 'tm', 'vsd_a', 'vsd_b', 'vsd_c', 'sentido_giro', 'estatus', 'observaciones', 'user_id'];

                const telemetryData = telemetryRows.map(r => {
                    let obj = {};
                    telemetryColumns.forEach(col => {
                        if (r[col] !== undefined) obj[col] = r[col] === '' ? null : r[col];
                    });

                    ['frecuencia', 'corriente_motor', 'presion_thp', 'presion_chp', 'presion_lf', 'pip', 'tm', 'vsd_a', 'vsd_b', 'vsd_c'].forEach(col => {
                        if (obj[col] !== undefined) obj[col] = roundNumericValue(obj[col]);
                    });

                    return obj;
                });

                const consolidatedSourceByKey = new Map();
                telemetryRows.forEach(row => {
                    consolidatedSourceByKey.set(buildMonitoringRecordKey(row), row.__consolidated_row_data || {});
                });

                const consolidatedPreviewRecords = telemetryData.map(record => ({
                    ...record,
                    __consolidated_row_data: consolidatedSourceByKey.get(buildMonitoringRecordKey(record)) || {}
                }));

                const [previewResult, consolidatedPreview] = await Promise.all([
                    previewMonitoringSync(telemetryData),
                    previewManualMonitoringIntoConsolidated(consolidatedPreviewRecords)
                ]);

                const importMode = await confirmImportSummary({
                    title: 'Confirmar carga operativa',
                    fileName: file.name,
                    recordsCount: telemetryRows.length,
                    pozoCount: countUniquePozos(telemetryRows),
                    detailText: 'Se sincronizarán los registros diarios válidos detectados en el archivo antes de guardarlos en la plataforma.',
                    previewResult,
                    consolidatedPreview,
                    omittedCount: invalidStatusRows.length + omittedByScopeCount,
                    kind: 'operational'
                });

                if (!importMode) {
                    statusDiv.style.display = 'block';
                    statusText.textContent = 'Carga operativa cancelada por el usuario.';
                    return;
                }

                if (importMode === 'preview-only') {
                    statusDiv.style.display = 'block';
                    statusText.textContent = 'Preview revisado. No se guardaron cambios en la plataforma.';
                    return;
                }

                const recordsToSync = importMode === 'insert-only'
                    ? (previewResult?.recordsToInsert || [])
                    : telemetryData;
                recordsToSync.forEach(record => {
                    record.operational_scope = activeOperationalScope;
                });
                const shouldSyncOperationalRecords = recordsToSync.length > 0;

                beginImportSession({
                    kind: 'operational',
                    fileName: file.name,
                    recordsCount: shouldSyncOperationalRecords ? recordsToSync.length : telemetryRows.length,
                    pozoCount: countUniquePozos(telemetryRows)
                });

                updateImportSession(
                    !shouldSyncOperationalRecords
                        ? 'Actualizando solo el consolidado maestro...'
                        : importMode === 'insert-only'
                        ? `Insertando ${recordsToSync.length} registro(s) nuevos...`
                        : `Sincronizando ${recordsToSync.length} registro(s) operativos...`,
                    !shouldSyncOperationalRecords
                        ? 'Los registros ya existen en Data; se usaran para actualizar el historico exportable.'
                        : importMode === 'insert-only'
                        ? 'Guardando solo las mediciones nuevas detectadas en el preview.'
                        : 'Guardando mediciones diarias en la plataforma.'
                );
                const syncResult = shouldSyncOperationalRecords
                    ? await syncMonitoringRecords(recordsToSync)
                    : { inserted: 0, updated: 0, skipped: 0, total: 0 };

                let consolidatedSaved = 0;
                let consolidatedUpdated = 0;
                let consolidatedInserted = 0;
                let consolidatedWarning = '';
                try {
                    updateImportSession('Actualizando consolidado maestro...', 'Registrando la carga operativa para que aparezca en la descarga del consolidado.');
                    const consolidatedResult = await upsertManualMonitoringIntoConsolidated(consolidatedPreviewRecords, { sourceFileName: file.name });
                    consolidatedSaved = consolidatedResult.saved || 0;
                    consolidatedUpdated = consolidatedResult.updated || 0;
                    consolidatedInserted = consolidatedResult.inserted || 0;
                } catch (consolidatedError) {
                    consolidatedWarning = consolidatedError?.message || 'No se pudo actualizar el consolidado maestro.';
                    console.warn('No se pudo sincronizar la carga operativa con el consolidado:', consolidatedError);
                }

                const syncedTelemetryRows = importMode === 'insert-only'
                    ? telemetryRows.filter(row => recordsToSync.some(record => buildMonitoringRecordKey(record) === buildMonitoringRecordKey(row)))
                    : telemetryRows;

                const uniquePozos = [...new Set(syncedTelemetryRows.map(r => r.pozo_name))];

                updateImportSession('Actualizando resumen tecnico por pozo...', 'Consolidando informacion relacionada antes de cerrar la carga.');
                for (const pozo of uniquePozos) {
                    const pozoRecords = syncedTelemetryRows.filter(r => r.pozo_name === pozo);
                    const latest = pozoRecords[0];

                    if (latest.potencial !== undefined || latest.bbpd !== undefined || latest.ef !== undefined) {
                        const techData = {
                            operational_scope: activeOperationalScope,
                            pozo_name: latest.pozo_name,
                            campo_name: latest.campo || latest.campo_name,
                            ef: latest.ef || 'N/A',
                            fecha: latest.fecha_tech || latest.fecha_medicion || latest.fecha,
                            potencial: parseFloat(latest.potencial) || 0,
                            bbpd: parseFloat(latest.bbpd) || 0,
                            ays_percentage: parseFloat(latest.ays) || parseFloat(latest.ays_percentage) || 0,
                            bnpd: parseFloat(latest.bnpd) || 0,
                            cat_number: parseInt(latest.cat) || parseInt(latest.cat_number) || 1
                        };
                        await saveTechnicalMeasurement(techData);
                    }
                }

                const consolidatedSummaryText = `Consolidado: ${consolidatedUpdated} historicas actualizadas, ${consolidatedInserted} nuevas.`;
                const omittedSummaryText = invalidStatusWarning ? ` Omitidas: ${invalidStatusRows.length}.` : '';
                statusText.textContent = `✅ Sincronizacion finalizada. Nuevos: ${syncResult.inserted}. Actualizados: ${syncResult.updated}. ${consolidatedSummaryText}${omittedSummaryText}`;
                updateImportSession('Refrescando vistas y estado final...', 'La importacion ya casi termina.');
                await refreshPozoLists();
                finishImportSession();
                Swal.fire({
                    icon: consolidatedWarning || invalidStatusWarning ? 'warning' : 'success',
                    title: 'Importación Exitosa',
                    text: consolidatedWarning
                        ? `Monitoreo diario sincronizado. Nuevos: ${syncResult.inserted}. Actualizados: ${syncResult.updated}. No se pudo actualizar el consolidado: ${consolidatedWarning}`
                        : `Monitoreo diario sincronizado. Nuevos: ${syncResult.inserted}. Actualizados: ${syncResult.updated}. ${consolidatedSummaryText} Total procesado: ${consolidatedSaved}.${invalidStatusWarning ? ` ${invalidStatusWarning}` : ''}`
                });
                await refreshHistory();
            } catch (err) {
                finishImportSession();
                statusText.textContent = '❌ Error: ' + err.message;
                Swal.fire({ icon: 'error', title: 'Error de Importación', text: err.message });
                console.error('File Upload Error:', err);
            }
        }

export function destroyDashboardData() {
    delete window.openGestionModal;
    delete window.closeGestionModal;
    delete window.closeGestionModalOnClickOutside;
    delete window.toggleGestionInfo;

    if (managementOutsideClickListener) {
        document.removeEventListener('click', managementOutsideClickListener);
        managementOutsideClickListener = null;
    }
    if (importNavigationLockListener) {
        document.removeEventListener('click', importNavigationLockListener, true);
        importNavigationLockListener = null;
    }
}
