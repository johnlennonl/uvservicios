let pozoOutsideClickListener = null;

import { applyNavigationAccessProfile, logout, getAccessProfile, getSession } from '../auth.js';
        import { getPozosHistorySummary, getMonitoringData, getTechnicalHistory, deleteRecord, getWellBESProfile, getWellLevelTests, deleteLevelTest } from '../data-service.js';
        import { getActiveOperationalScope, getActiveOperationalScopeWellNames, initOperationalScopeContext, renderOperationalScopeSwitcher } from '../services/operational-scope-context.js';
        import { supabase } from '../supabaseClient.js';
        import { openFieldJourneyPdf } from '../services/field-journey-export.js';

        let activePozo = null;
        let currentRecordData = [];
        let currentTicketGroups = [];
        let currentTicketShiftGroups = [];
        let pozoSummaries = [];
        let activeHistoryMode = 'operational';
        let activeDataView = 'history';
        let activeScopePozoNames = [];
        let activeScopePozoSet = new Set();
        let currentAccessProfile = { isReadOnly: false, canViewManagement: true, canEditData: true };

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

        function getSelectedTicketShift() {
            return document.getElementById('ticket-shift')?.value === 'night' ? 'night' : 'day';
        }

        function applyDataAccessProfile() {
            applyNavigationAccessProfile(currentAccessProfile);
        }

        // Muestra la ficha rapida del pozo activo y trae el tipo de bomba maestro.
        async function updateSelectedPozoProfile(pozoName) {
            const profileSection = document.getElementById('selected-pozo-profile');
            const pozoLabel = document.getElementById('selected-pozo-profile-pozo');
            const pumpLabel = document.getElementById('selected-pozo-profile-pump');
            const pumpMakerLabel = document.getElementById('selected-pozo-profile-pump-maker');
            const pumpMakerSummaryLabel = document.getElementById('selected-pozo-profile-maker-summary');
            const pumpSummaryLabel = document.getElementById('selected-pozo-profile-pump-summary');
            const pumpModelLabel = document.getElementById('selected-pozo-profile-pump-model');
            const suctionLabel = document.getElementById('selected-pozo-profile-suction');
            const multiphaseLabel = document.getElementById('selected-pozo-profile-multiphase');
            const gasSeparatorLabel = document.getElementById('selected-pozo-profile-gas-separator');
            const sealsLabel = document.getElementById('selected-pozo-profile-seals');
            const motorLabel = document.getElementById('selected-pozo-profile-motor');
            const sensorLabel = document.getElementById('selected-pozo-profile-sensor');
            const drainValveLabel = document.getElementById('selected-pozo-profile-drain-valve');
            const installedLabel = document.getElementById('selected-pozo-profile-installed');
            const title = document.getElementById('selected-pozo-profile-title');

            if (!profileSection || !pozoLabel || !pumpLabel || !title) return;

            const cleanBESValue = value => {
                const normalized = String(value ?? '').trim();
                return normalized && !/^(0+|--|n\/a|na|s\/n|sin dato|sin datos)$/i.test(normalized) ? normalized : '';
            };
            const joinBESValues = values => values.map(cleanBESValue).filter(Boolean).join(' · ');

            const resetProfileLabels = () => {
                pumpLabel.textContent = 'Pendiente por configurar';
                if (pumpMakerSummaryLabel) pumpMakerSummaryLabel.textContent = '--';
                if (pumpSummaryLabel) pumpSummaryLabel.textContent = '--';
                if (pumpMakerLabel) pumpMakerLabel.textContent = '--';
                if (pumpModelLabel) pumpModelLabel.textContent = '--';
                if (suctionLabel) suctionLabel.textContent = '--';
                if (multiphaseLabel) multiphaseLabel.textContent = '--';
                if (gasSeparatorLabel) gasSeparatorLabel.textContent = '--';
                if (sealsLabel) sealsLabel.textContent = '--';
                if (motorLabel) motorLabel.textContent = '--';
                if (sensorLabel) sensorLabel.textContent = '--';
                if (drainValveLabel) drainValveLabel.textContent = '--';
                if (installedLabel) installedLabel.textContent = '--';
            };

            if (!pozoName) {
                profileSection.style.display = 'none';
                pozoLabel.textContent = '--';
                resetProfileLabels();
                return;
            }

            profileSection.style.display = 'block';
            title.textContent = `Pozo ${pozoName}`;
            pozoLabel.textContent = pozoName;

            // Ocultar tarjetas exclusivas de BES si el contrato activo es CCRC (BM / BCP)
            const isCrc = getActiveOperationalScope() === 'crc_ll';
            const espPillIds = [
                'selected-pozo-profile-multiphase',
                'selected-pozo-profile-gas-separator',
                'selected-pozo-profile-seals',
                'selected-pozo-profile-motor',
                'selected-pozo-profile-sensor',
                'selected-pozo-profile-drain-valve',
                'selected-pozo-profile-installed'
            ];
            espPillIds.forEach(id => {
                const el = document.getElementById(id);
                const pill = el ? el.closest('.selected-pozo-profile-pill') : null;
                if (pill) {
                    if (isCrc) {
                        pill.classList.add('hidden-esp-pill');
                        pill.style.setProperty('display', 'none', 'important');
                    } else {
                        pill.classList.remove('hidden-esp-pill');
                        pill.style.removeProperty('display');
                    }
                }
            });

            const summarySubtitle = document.getElementById('selected-pozo-profile-summary');
            if (summarySubtitle) {
                summarySubtitle.textContent = isCrc
                    ? 'Consulta rápida de la ficha de completación BM / BCP configurada para este pozo.'
                    : 'Consulta rápida de la ficha BES configurada para este pozo.';
            }

            try {
                const profile = await getWellBESProfile(pozoName);
                const pumpValue = cleanBESValue(profile?.pump_model) || cleanBESValue(profile?.pump_type) || cleanBESValue(profile?.multiphase_pump) || 'Pendiente por configurar';
                const makerValue = cleanBESValue(profile?.pump_manufacturer) || '--';
                pumpLabel.textContent = pumpValue;
                if (pumpMakerSummaryLabel) pumpMakerSummaryLabel.textContent = makerValue;
                if (pumpSummaryLabel) pumpSummaryLabel.textContent = pumpValue;
                if (pumpMakerLabel) pumpMakerLabel.textContent = makerValue;
                if (pumpModelLabel) pumpModelLabel.textContent = joinBESValues([profile?.pump_model, profile?.pump_serial]) || '--';
                if (suctionLabel) suctionLabel.textContent = cleanBESValue(profile?.suction_ft) || '--';
                if (multiphaseLabel) multiphaseLabel.textContent = cleanBESValue(profile?.multiphase_pump) || '--';
                if (gasSeparatorLabel) gasSeparatorLabel.textContent = cleanBESValue(profile?.gas_separator) || '--';
                if (sealsLabel) sealsLabel.textContent = cleanBESValue(profile?.seal_section) || '--';
                if (motorLabel) motorLabel.textContent = cleanBESValue(profile?.motor_model) || '--';
                if (sensorLabel) sensorLabel.textContent = cleanBESValue(profile?.sensor_model) || '--';
                if (drainValveLabel) drainValveLabel.textContent = cleanBESValue(profile?.drain_valve) || '--';
                if (installedLabel) installedLabel.textContent = cleanBESValue(profile?.installed_at) || '--';
            } catch (error) {
                pumpLabel.textContent = error.message;
                if (pumpMakerSummaryLabel) pumpMakerSummaryLabel.textContent = '--';
                if (pumpSummaryLabel) pumpSummaryLabel.textContent = '--';
                if (pumpMakerLabel) pumpMakerLabel.textContent = '--';
                if (pumpModelLabel) pumpModelLabel.textContent = '--';
                if (suctionLabel) suctionLabel.textContent = '--';
                if (multiphaseLabel) multiphaseLabel.textContent = '--';
                if (gasSeparatorLabel) gasSeparatorLabel.textContent = '--';
                if (sealsLabel) sealsLabel.textContent = '--';
                if (motorLabel) motorLabel.textContent = '--';
                if (sensorLabel) sensorLabel.textContent = '--';
                if (drainValveLabel) drainValveLabel.textContent = '--';
                if (installedLabel) installedLabel.textContent = '--';
            }
        }

        // Traduce el filtro visual a un texto util para el encabezado del reporte.
        function getActiveFilterLabel() {
            const filterSelect = document.getElementById('filter-date');
            const specificDate = document.getElementById('input-specific-date')?.value;
            if (!filterSelect) return 'Todos los tiempos';

            if (filterSelect.value === 'SPECIFIC' && specificDate) {
                return `Fecha especifica: ${specificDate}`;
            }

            return filterSelect.options[filterSelect.selectedIndex]?.text || 'Todos los tiempos';
        }

        // Prepara el resumen ejecutivo que se imprime/exporta en modo reporte.
        function updateReportExportHeader() {
            const ticketDate = document.getElementById('ticket-date')?.value || '';
            const ticketShiftLabel = getTicketShiftLabel();
            const activeModeLabel = activeHistoryMode === 'technical'
                ? 'Historial de medicion tecnica'
                : 'Historial operativo';
            const reportTitle = activeDataView === 'daily-ticket'
                ? `Ticket Diario de Monitoreo · ${ticketShiftLabel}`
                : 'Reporte Historico BES';
            const filterLabel = activeDataView === 'daily-ticket'
                ? (ticketDate ? `Fecha operativa: ${ticketDate} · ${ticketShiftLabel}` : 'Fecha del ticket pendiente')
                : getActiveFilterLabel();
            const recordCount = activeDataView === 'daily-ticket'
                ? `${currentRecordData.length} monitoreos / ${currentTicketGroups.length} pozos`
                : (document.getElementById('record-count')?.textContent?.trim() || `${currentRecordData.length} Registros`);
            const pumpType = document.getElementById('selected-pozo-profile-pump')?.textContent?.trim() || 'Pendiente por configurar';
            const pumpMaker = document.getElementById('selected-pozo-profile-pump-maker')?.textContent?.trim();
            const pumpModel = document.getElementById('selected-pozo-profile-pump-model')?.textContent?.trim();
            const pumpSummary = [pumpType, pumpMaker, pumpModel]
                .filter(value => value && value !== '--' && value !== 'Pendiente por configurar')
                .join(' · ') || pumpType;
            const summary = activeDataView === 'daily-ticket'
                ? (ticketDate
                    ? `${ticketShiftLabel} del ${ticketDate} con monitoreos ejecutados en ${currentTicketGroups.length} pozo(s).`
                    : 'Ticket diario pendiente por fecha.')
                : (activePozo
                    ? `${activeModeLabel} del pozo ${activePozo}. Filtro aplicado: ${filterLabel.toLowerCase()}.`
                    : 'Resumen curado de registros historicos para auditoria y seguimiento operativo.');

            document.getElementById('report-data-pozo').textContent = activeDataView === 'daily-ticket' ? 'Todos los pozos' : (activePozo || 'Sin seleccion');
            document.getElementById('report-data-pump').textContent = activeDataView === 'daily-ticket' ? 'Ticket multipozo' : pumpSummary;
            document.getElementById('report-data-mode').textContent = activeDataView === 'daily-ticket' ? ticketShiftLabel : activeModeLabel;
            document.getElementById('report-data-filter').textContent = filterLabel;
            document.getElementById('report-data-count').textContent = recordCount;
            document.getElementById('report-data-classification').textContent = activeDataView === 'daily-ticket'
                ? 'Uso interno · Seguimiento operativo'
                : 'Uso interno UV Servicios';
            document.getElementById('report-data-generated').textContent = new Date().toLocaleString();
            document.getElementById('report-export-title').textContent = reportTitle;
            document.getElementById('report-export-summary').textContent = summary;
        }

        function printDataReport() {
            const originalTitle = document.title;
            const printTitle = activeDataView === 'daily-ticket'
                ? 'Ticket diario de monitoreo'
                : 'Reporte historico BES';

            document.title = printTitle;
            const restoreTitle = () => {
                document.title = originalTitle;
                window.removeEventListener('afterprint', restoreTitle);
            };

            window.addEventListener('afterprint', restoreTitle);
            window.print();
            setTimeout(restoreTitle, 1500);
        }

        function setDataViewMode(mode) {
            activeDataView = mode === 'daily-ticket' ? 'daily-ticket' : 'history';
            const reportToggleLabel = document.getElementById('main-view-toggle')?.querySelector('span');

            if (reportToggleLabel) {
                reportToggleLabel.textContent = 'EXPORTAR REPORTE';
            }

            const pozoField = document.getElementById('pozo-selector-primary-field');
            const activityField = document.getElementById('pozo-selector-activity-field');
            const selectedProfile = document.getElementById('selected-pozo-profile');
            const toolsSection = document.getElementById('tools-section');
            const historyContainer = document.getElementById('history-container');
            const ticketToolsSection = document.getElementById('ticket-tools-section');
            const ticketContainer = document.getElementById('daily-ticket-container');
            const emptyState = document.getElementById('empty-state');

            if (activeDataView === 'daily-ticket') {
                if (pozoField) pozoField.style.display = 'none';
                if (activityField) activityField.style.display = 'none';
                if (selectedProfile) selectedProfile.style.display = 'none';
                if (toolsSection) toolsSection.style.display = 'none';
                if (historyContainer) historyContainer.style.display = 'none';
                if (emptyState) emptyState.style.display = 'none';
                if (ticketToolsSection) ticketToolsSection.style.display = 'block';
                if (ticketContainer) ticketContainer.style.display = 'block';

                const ticketDateEl = document.getElementById('ticket-date');
                if (ticketDateEl && !ticketDateEl.value) {
                    ticketDateEl.value = new Date().toISOString().slice(0, 10);
                }
                loadDailyTicketData();
                return;
            }

            if (pozoField) pozoField.style.display = 'block';
            if (activityField) activityField.style.display = 'block';
            if (ticketToolsSection) ticketToolsSection.style.display = 'none';
            if (ticketContainer) ticketContainer.style.display = 'none';

            if (activePozo) {
                if (selectedProfile) selectedProfile.style.display = 'block';
                if (toolsSection) toolsSection.style.display = 'flex';
                if (historyContainer) historyContainer.style.display = 'block';
                if (emptyState) emptyState.style.display = 'none';
                loadPozoData();
                return;
            }

            if (selectedProfile) selectedProfile.style.display = 'none';
            if (toolsSection) toolsSection.style.display = 'none';
            if (historyContainer) historyContainer.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        }

        function groupMonitoringRecordsByPozo(records = []) {
            const grouped = new Map();

            records.forEach(record => {
                const pozoName = String(record?.pozo_name || '').trim() || 'POZO SIN IDENTIFICAR';
                if (!grouped.has(pozoName)) {
                    grouped.set(pozoName, []);
                }
                grouped.get(pozoName).push(record);
            });

            return [...grouped.entries()]
                .map(([pozoName, recordsByPozo]) => ({
                    pozoName,
                    records: recordsByPozo.sort((left, right) => {
                        const leftKey = `${left?.fecha || ''} ${left?.hora || ''}`;
                        const rightKey = `${right?.fecha || ''} ${right?.hora || ''}`;
                        return rightKey.localeCompare(leftKey);
                    })
                }))
                .sort((left, right) => left.pozoName.localeCompare(right.pozoName, undefined, { numeric: true, sensitivity: 'base' }));
        }

        function addDaysToIsoDate(dateValue, days = 1) {
            const date = new Date(`${dateValue}T00:00:00`);
            date.setDate(date.getDate() + days);
            return date.toISOString().slice(0, 10);
        }

        function getTicketShiftLabel(shift = getSelectedTicketShift()) {
            if (getActiveOperationalScope() === 'crc_ll') {
                return 'Jornada Completa';
            }
            return shift === 'night' ? 'Jornada Nocturna' : 'Jornada Diurna';
        }

        function getOperationalShiftForRecord(record = {}, journeyMap = null) {
            const rawDate = String(record.fecha || '').slice(0, 10);
            const rawTime = String(record.hora || '00:00').slice(0, 5);
            const [hourText = '0', minuteText = '0'] = rawTime.split(':');
            const minutes = (Number(hourText) * 60) + Number(minuteText);
            if (!rawDate || !Number.isFinite(minutes)) return null;

            if (getActiveOperationalScope() === 'crc_ll' || record.operational_scope === 'crc_ll') {
                return { operationalDate: rawDate, shift: 'day' };
            }

            // Respect explicitly defined shift value (e.g. Diurna/Nocturna)
            let shiftVal = record.jornada;
            if (!shiftVal && journeyMap) {
                const key = `${String(record.pozo_name || '').trim().toUpperCase()}@${rawTime}`;
                shiftVal = journeyMap.get(key);
            }

            if (shiftVal) {
                const cleanJornada = String(shiftVal).toLowerCase();
                if (cleanJornada.includes('completa')) {
                    return { operationalDate: rawDate, shift: 'day' };
                } else if (cleanJornada.includes('diurna')) {
                    return { operationalDate: rawDate, shift: 'day' };
                } else if (cleanJornada.includes('nocturna')) {
                    return {
                        operationalDate: minutes < 360 ? addDaysToIsoDate(rawDate, -1) : rawDate,
                        shift: 'night'
                    };
                }
            }

            // Fallback to strict hour-based calculation if not defined
            if (minutes >= 360 && minutes < 1080) {
                return { operationalDate: rawDate, shift: 'day' };
            }

            return {
                operationalDate: minutes < 360 ? addDaysToIsoDate(rawDate, -1) : rawDate,
                shift: 'night'
            };
        }

        async function getJornadaMapForDate(ticketDate) {
            const map = new Map();
            try {
                // 1. Fetch journeys for the date
                const { data: journeys, error: journeysError } = await supabase
                    .from('field_journeys')
                    .select('id, jornada')
                    .eq('journey_date', ticketDate);

                if (journeysError) throw journeysError;

                if (journeys && journeys.length > 0) {
                    const journeyIds = journeys.map(j => j.id);
                    const journeyShiftMap = new Map(journeys.map(j => [j.id, j.jornada]));

                    // 2. Fetch records for those journeys
                    const { data: records, error: recordsError } = await supabase
                        .from('field_journey_records')
                        .select('pozo, report_time, journey_id')
                        .in('journey_id', journeyIds);

                    if (recordsError) throw recordsError;

                    if (records && records.length > 0) {
                        records.forEach(r => {
                            const shiftVal = journeyShiftMap.get(r.journey_id);
                            if (shiftVal) {
                                const cleanTime = String(r.report_time || '00:00').slice(0, 5);
                                const key = `${String(r.pozo || '').trim().toUpperCase()}@${cleanTime}`;
                                map.set(key, shiftVal);
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn('Error fetching journeys and records for shift mapping:', err);
            }
            return map;
        }

        function filterRecordsByOperationalDate(records = [], ticketDate, journeyMap = null) {
            return records
                .map(record => ({ ...record, _operationalShift: getOperationalShiftForRecord(record, journeyMap) }))
                .filter(record => record._operationalShift?.operationalDate === ticketDate);
        }

        function groupTicketRecordsByShift(records = []) {
            const shiftDefinitions = [
                {
                    id: 'day',
                    title: 'Jornada Diurna',
                    windowLabel: 'Pozos reportados oficialmente en la Guardia Diurna'
                },
                {
                    id: 'night',
                    title: 'Jornada Nocturna',
                    windowLabel: 'Pozos reportados oficialmente en la Guardia Nocturna'
                }
            ];

            return shiftDefinitions.map(shiftDefinition => {
                const shiftRecords = records.filter(record => record._operationalShift?.shift === shiftDefinition.id);
                return {
                    ...shiftDefinition,
                    records: shiftRecords,
                    groups: groupMonitoringRecordsByPozo(shiftRecords)
                };
            });
        }

        function getSelectedTicketShiftGroup(records = []) {
            const selectedShift = getSelectedTicketShift();
            return groupTicketRecordsByShift(records).find(group => group.id === selectedShift) || groupTicketRecordsByShift([])[0];
        }

        function collectGroupObservations(records = []) {
            const observations = [];

            records.forEach(record => {
                const observationText = String(record?.observaciones || '').trim();
                if (!observationText) return;

                const timeLabel = [record?.fecha, record?.hora].filter(Boolean).join(' ');
                observations.push({
                    text: observationText,
                    timeLabel: timeLabel || 'Registro sin fecha visible'
                });
            });

            return observations;
        }

        function formatMonitoringNumberCell(value, decimals = 1) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric.toFixed(decimals) : '--';
        }

        function formatMonitoringTextCell(value, fallback = '--') {
            return escapeHtml(value === undefined || value === null || value === '' ? fallback : value);
        }

        function getFieldValueFromRecord(record, ...fieldNames) {
            if (!record) return null;
            
            // 1. Check nested JSON containers first if present
            const containers = [
                record.raw_payload,
                record.payload,
                record.row_data,
                record.datos_tecnicos,
                record.payload_json,
                record.datos_medicion
            ];

            for (let raw of containers) {
                if (!raw) continue;
                if (typeof raw === 'string') {
                    try { raw = JSON.parse(raw); } catch (e) { continue; }
                }
                if (raw && typeof raw === 'object') {
                    for (const name of fieldNames) {
                        if (raw[name] !== undefined && raw[name] !== null && raw[name] !== '') {
                            return raw[name];
                        }
                    }
                }
            }

            // 2. Check direct properties
            for (const name of fieldNames) {
                if (record[name] !== undefined && record[name] !== null && record[name] !== '') {
                    return record[name];
                }
            }
            
            return null;
        }

        function getWellLiftMethod(pozoName, record = null) {
            const targetRecord = record || (currentRecordData && currentRecordData.length > 0 ? currentRecordData[0] : null);
            if (targetRecord) {
                const liftMeth = getFieldValueFromRecord(targetRecord, 'lift_method', 'metodo', 'metodo_profesional');
                if (liftMeth) {
                    const normMeth = String(liftMeth).toUpperCase();
                    if (normMeth.includes('BCP') || normMeth.includes('PCP') || normMeth.includes('CAVIDAD') || normMeth.includes('PROGRESIVA')) return 'BCP';
                    if (normMeth.includes('BM') || normMeth.includes('BALANCIN') || normMeth.includes('MECANICO')) return 'BM';
                }
                const bcpTorque = getFieldValueFromRecord(targetRecord, 'bcp_torque', 'torque');
                const bcpAmp = getFieldValueFromRecord(targetRecord, 'bcp_amperaje', 'amperaje');
                const bcpRpm = getFieldValueFromRecord(targetRecord, 'bcp_rpm', 'rpm');
                if (bcpTorque || bcpAmp || bcpRpm) return 'BCP';

                const bmSpm = getFieldValueFromRecord(targetRecord, 'bm_spm', 'spm');
                const bmTiro = getFieldValueFromRecord(targetRecord, 'bm_tiro', 'tiro', 'tiro_in', 'longitud_tiro');
                const bmRecorrido = getFieldValueFromRecord(targetRecord, 'bm_recorrido', 'recorrido', 'recorrido_in', 'longitud_carrera', 'carrera');
                if (bmSpm || bmTiro || bmRecorrido) return 'BM';
            }
            const normPozo = String(pozoName || activePozo || '').trim().toUpperCase();
            const wellMeta = activeScopeWellCatalog.find(w => String(w.pozo_name || '').trim().toUpperCase() === normPozo);
            const methodStr = String(wellMeta?.lift_method || wellMeta?.pump_type || wellMeta?.pump_model || '').toUpperCase();
            if (methodStr.includes('BCP') || methodStr.includes('PCP') || methodStr.includes('CAVIDAD') || methodStr.includes('PROGRESIVA')) {
                return 'BCP';
            }
            return 'BM';
        }

        function buildOperationalRowHtml(record, includeActions = false) {
            const recordId = record.id || record.ID || null;
            const activeScope = getActiveOperationalScope();

            if (activeScope === 'crc_ll') {
                const pozoName = String(record.pozo_name || record.pozo || activePozo || '').trim().toUpperCase();
                const liftMethod = getWellLiftMethod(pozoName, record);
                const isBcp = liftMethod === 'BCP';

                const fechaVal = getFieldValueFromRecord(record, 'fecha', 'report_date');
                const horaVal = getFieldValueFromRecord(record, 'hora', 'report_time');
                const thpVal = getFieldValueFromRecord(record, 'presion_thp', 'thp', 'thp_psi');
                const chpVal = getFieldValueFromRecord(record, 'presion_chp', 'chp', 'chp_psi');
                const actividadVal = getFieldValueFromRecord(record, 'sentido_giro', 'actividad', 'observaciones_pozo', 'observaciones', 'estatus', 'diagnostico');

                if (isBcp) {
                    // BCP Columns: FECHA/HORA | RPM | TORQUE | AMPERAJE | THP | CHP | ACTIVIDAD
                    const rpmVal = getFieldValueFromRecord(record, 'bcp_rpm', 'rpm', 'velocidad_rpm');
                    const torqueVal = getFieldValueFromRecord(record, 'bcp_torque', 'torque', 'torque_ftlbs', 'bcp_torque_ftlbs');
                    const ampVal = getFieldValueFromRecord(record, 'bcp_amperaje', 'amperaje', 'corriente_bcp', 'corriente_motor_bcp');

                    return `
                        <tr>
                            <td class="cell-date">
                                <span class="date-main">${formatMonitoringTextCell(fechaVal)}</span>
                                <span class="time-sub">${formatMonitoringTextCell(horaVal)}</span>
                            </td>
                            <td class="cell-freq">
                                <span class="value-highlight">${formatMonitoringTextCell(rpmVal, '--')}</span>
                                <span class="unit-label">RPM</span>
                            </td>
                            <td class="cell-giro">
                                <span class="value-highlight">${formatMonitoringTextCell(torqueVal, '--')}</span>
                                <span class="unit-label">ft-lbs</span>
                            </td>
                            <td class="cell-current">
                                <span class="value-highlight">${formatMonitoringTextCell(ampVal, '--')}</span>
                                <span class="unit-label">A</span>
                            </td>
                            <td class="cell-presion">
                                <span class="value-highlight">${formatMonitoringTextCell(thpVal, '--')}</span>
                                <span class="unit-label">PSI</span>
                            </td>
                            <td class="cell-presion">
                                <span class="value-highlight">${formatMonitoringTextCell(chpVal, '--')}</span>
                                <span class="unit-label">PSI</span>
                            </td>
                            <td class="cell-status">
                                <span class="value-badge-plain">${formatMonitoringTextCell(actividadVal, '--')}</span>
                            </td>
                            <td class="cell-actions" style="text-align: right; white-space: nowrap;">
                                <button class="btn-action btn-view-premium" onclick="openFullDataModal('${escapeHtml(recordId)}')" aria-label="Ver detalles">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                    <span>Ver</span>
                                </button>
                                ${includeActions && currentAccessProfile.canEditData ? `
                                <button class="btn-action btn-edit-premium" data-id="${escapeHtml(recordId)}">Editar</button>
                                <button class="btn-action btn-delete-premium" data-id="${escapeHtml(recordId)}">Borrar</button>` : ''}
                            </td>
                        </tr>
                    `;
                } else {
                    // BM Columns: FECHA/HORA | SPM | TIRO | RECORRIDO | THP | CHP | ACTIVIDAD
                    const spmVal = getFieldValueFromRecord(record, 'bm_spm', 'spm', 'velocidad_spm');
                    const tiroVal = getFieldValueFromRecord(record, 'bm_tiro', 'tiro', 'tiro_in', 'longitud_tiro');
                    const recorridoVal = getFieldValueFromRecord(record, 'bm_recorrido', 'recorrido', 'recorrido_in', 'longitud_carrera', 'carrera');

                    return `
                        <tr>
                            <td class="cell-date">
                                <span class="date-main">${formatMonitoringTextCell(fechaVal)}</span>
                                <span class="time-sub">${formatMonitoringTextCell(horaVal)}</span>
                            </td>
                            <td class="cell-freq">
                                <span class="value-highlight">${formatMonitoringTextCell(spmVal, '--')}</span>
                                <span class="unit-label">SPM</span>
                            </td>
                            <td class="cell-giro">
                                <span class="value-highlight">${formatMonitoringTextCell(tiroVal, '--')}</span>
                            </td>
                            <td class="cell-current">
                                <span class="value-highlight">${formatMonitoringTextCell(recorridoVal, '--')}</span>
                                <span class="unit-label">in</span>
                            </td>
                            <td class="cell-presion">
                                <span class="value-highlight">${formatMonitoringTextCell(thpVal, '--')}</span>
                                <span class="unit-label">PSI</span>
                            </td>
                            <td class="cell-presion">
                                <span class="value-highlight">${formatMonitoringTextCell(chpVal, '--')}</span>
                                <span class="unit-label">PSI</span>
                            </td>
                            <td class="cell-status">
                                <span class="value-badge-plain">${formatMonitoringTextCell(actividadVal, '--')}</span>
                            </td>
                            <td class="cell-actions" style="text-align: right; white-space: nowrap;">
                                <button class="btn-action btn-view-premium" onclick="openFullDataModal('${escapeHtml(recordId)}')" aria-label="Ver detalles">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                    <span>Ver</span>
                                </button>
                                ${includeActions && currentAccessProfile.canEditData ? `
                                <button class="btn-action btn-edit-premium" data-id="${escapeHtml(recordId)}">Editar</button>
                                <button class="btn-action btn-delete-premium" data-id="${escapeHtml(recordId)}">Borrar</button>` : ''}
                            </td>
                        </tr>
                    `;
                }
            }

            return `
                <tr>
                    <td class="cell-date">
                        <span class="date-main">${formatMonitoringTextCell(record.fecha)}</span>
                        <span class="time-sub">${formatMonitoringTextCell(record.hora)}</span>
                    </td>
                    <td class="cell-freq">
                        <span class="value-highlight">${formatMonitoringNumberCell(record.frecuencia)}</span>
                        <span class="unit-label">Hz</span>
                    </td>
                    <td class="cell-giro">
                        <span class="value-badge-plain">${formatMonitoringTextCell(record.sentido_giro ?? record.giro, '--')}</span>
                    </td>
                    <td class="cell-current">
                        <span class="value-highlight">${formatMonitoringNumberCell(record.corriente_motor)}</span>
                        <span class="unit-label">Amp</span>
                    </td>
                    <td class="cell-pip-tm">
                        <div class="telemetry-block-group">
                            <div class="telemetry-item pip">
                                <span class="lbl">PIP</span>
                                <span class="val">${formatMonitoringTextCell(record.pip, '--')}</span>
                                <span class="uni">PSI</span>
                            </div>
                            <div class="telemetry-item tm">
                                <span class="lbl">TM</span>
                                <span class="val">${formatMonitoringTextCell(record.tm, '--')}</span>
                                <span class="uni">°F</span>
                            </div>
                        </div>
                    </td>
                    <td class="cell-presion">
                        <div class="telemetry-block-group horizontal">
                            <div class="telemetry-item thp">
                                <span class="lbl">THP</span>
                                <span class="val">${formatMonitoringTextCell(record.presion_thp, '--')}</span>
                                <span class="uni">PSI</span>
                            </div>
                            <div class="telemetry-item chp">
                                <span class="lbl">CHP</span>
                                <span class="val">${formatMonitoringTextCell(record.presion_chp, '--')}</span>
                                <span class="uni">PSI</span>
                            </div>
                            <div class="telemetry-item lf">
                                <span class="lbl">LF</span>
                                <span class="val">${formatMonitoringTextCell(record.presion_lf ?? record.lf, '--')}</span>
                                <span class="uni">PSI</span>
                            </div>
                        </div>
                    </td>
                    <td class="cell-vsd">
                        <div class="vsd-grid-block">
                            <div class="vsd-phase a">
                                <span class="lbl">A</span>
                                <span class="val">${formatMonitoringTextCell(record.vsd_a, '0')}</span>
                            </div>
                            <div class="vsd-phase b">
                                <span class="lbl">B</span>
                                <span class="val">${formatMonitoringTextCell(record.vsd_b, '0')}</span>
                            </div>
                            <div class="vsd-phase c">
                                <span class="lbl">C</span>
                                <span class="val">${formatMonitoringTextCell(record.vsd_c, '0')}</span>
                            </div>
                        </div>
                    </td>
                    <td class="cell-status">
                        ${(() => {
                            const normEst = String(record.estatus || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                            const isRun = normEst.includes('RUN') || normEst.includes('OPERANDO') || normEst.includes('ACTIVO');
                            const statusClass = isRun ? 'status-run' : 'status-off';
                            return `
                                <span class="status-badge-premium ${statusClass}">
                                    <span class="status-dot"></span>
                                    <span>${formatMonitoringTextCell(record.estatus)}</span>
                                </span>
                            `;
                        })()}
                    </td>
                    <td class="cell-actions" style="text-align: right; white-space: nowrap;">
                        <button class="btn-action btn-view-premium" onclick="openFullDataModal('${escapeHtml(recordId)}')" aria-label="Ver detalles">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>Ver</span>
                        </button>
                        ${includeActions && currentAccessProfile.canEditData ? `
                        <button class="btn-action btn-edit-premium" data-id="${escapeHtml(recordId)}">Editar</button>
                        <button class="btn-action btn-delete-premium" data-id="${escapeHtml(recordId)}">Borrar</button>` : ''}
                    </td>
                </tr>
            `;
        }

        function renderDailyTicket() {
            const ticketDate = document.getElementById('ticket-date')?.value || '';
            const ticketShiftLabel = getTicketShiftLabel();
            const title = document.getElementById('daily-ticket-title');
            const summary = document.getElementById('daily-ticket-summary');
            const count = document.getElementById('daily-ticket-count');
            const groupsContainer = document.getElementById('daily-ticket-groups');

            if (!title || !summary || !count || !groupsContainer) return;

            if (!ticketDate) {
                title.textContent = 'Ticket diario de monitoreo';
                summary.textContent = 'Selecciona una fecha para consolidar los monitoreos realizados en todos los pozos.';
                count.textContent = '0 pozos';
                groupsContainer.innerHTML = '<div class="daily-ticket-empty">Selecciona una fecha y genera el ticket diario para ver los monitoreos agrupados por pozo.</div>';
                return;
            }

            title.textContent = `Ticket diario de monitoreo · ${ticketDate} · ${ticketShiftLabel}`;
            summary.textContent = currentRecordData.length > 0
                ? `Se detectaron ${currentRecordData.length} monitoreo(s) distribuidos en ${currentTicketGroups.length} pozo(s) para esta jornada.`
                : `No se encontraron monitoreos operativos para ${ticketShiftLabel.toLowerCase()} en la fecha seleccionada.`;
            count.textContent = `${currentTicketGroups.length} pozos`;

            if (currentTicketGroups.length === 0) {
                groupsContainer.innerHTML = '<div class="daily-ticket-empty">No hay monitoreos operativos registrados para esta fecha operativa.</div>';
                return;
            }

            groupsContainer.innerHTML = currentTicketShiftGroups.map(shiftGroup => {
                return `
                <section class="daily-ticket-shift-section daily-ticket-shift-${escapeHtml(shiftGroup.id)}">
                    <div class="daily-ticket-shift-head">
                        <div>
                            <h3>${escapeHtml(shiftGroup.title)}</h3>
                            <p>${escapeHtml(shiftGroup.windowLabel)}</p>
                        </div>
                        <span class="daily-ticket-group-count">${shiftGroup.records.length} registros</span>
                    </div>
                    <div class="daily-ticket-shift-body">
                        ${shiftGroup.groups.length === 0
                            ? '<div class="daily-ticket-empty">No hay monitoreos en esta jornada.</div>'
                            : shiftGroup.groups.map(group => {
                                const activeScope = getActiveOperationalScope();
                                const pozoName = group.pozoName;
                                const wellMeta = activeScopeWellCatalog.find(w => w.pozo_name === pozoName);
                                const liftMethod = wellMeta?.lift_method || 'BM';

                                const methodBadge = activeScope === 'crc_ll'
                                    ? `<span style="font-size: 0.68rem; font-weight: 800; background: #fef3c7; color: #d97706; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;">⚙️ ${liftMethod}</span>`
                                    : `<span style="font-size: 0.68rem; font-weight: 800; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #bae6fd; display: inline-flex; align-items: center; gap: 4px;">⚡ BES</span>`;

                                const tableHeaders = activeScope === 'crc_ll'
                                    ? `
                                        <th>Fecha/Hora</th>
                                        <th>Caudal Bruto</th>
                                        <th>Caudal Neto</th>
                                        <th>Contenido Agua</th>
                                        <th>SPM / RPM</th>
                                        <th>Presiones (THP/CHP)</th>
                                        <th>Actividad</th>
                                        <th>Estatus</th>
                                        <th style="text-align: right;"></th>
                                    `
                                    : `
                                        <th>Fecha/Hora</th>
                                        <th>Frecuencia</th>
                                        <th>Giro</th>
                                        <th>Corriente M.</th>
                                        <th>PIP / TM</th>
                                        <th>Presiones (THP/CHP/LF)</th>
                                        <th>VSD A/B/C</th>
                                        <th>Estatus</th>
                                        <th style="text-align: right;"></th>
                                    `;

                                return `
                                <article class="history-card daily-ticket-history-card">
                                    <div class="daily-ticket-history-topbar">
                                        <div>
                                            <h3 style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: #0f766e; flex-shrink: 0;">
                                                    <rect x="9" y="1" width="6" height="2.5" rx="0.5" />
                                                    <line x1="12" y1="3.5" x2="12" y2="5" />
                                                    <line x1="9" y1="5" x2="15" y2="5" />
                                                    <line x1="10" y1="5" x2="10" y2="16" />
                                                    <line x1="14" y1="5" x2="14" y2="16" />
                                                    <path d="M11.2 5 Q11.8 9 11.2 12 Q10.6 15 11.2 16" stroke-dasharray="1.5 1" stroke-width="0.9" />
                                                    <rect x="9.5" y="16" width="5" height="6" rx="1.2" fill="currentColor" opacity="0.12" />
                                                    <line x1="10.5" y1="17.2" x2="10.5" y2="21" stroke-width="0.7" />
                                                    <line x1="12" y1="17.2" x2="12" y2="21" stroke-width="0.7" />
                                                    <line x1="13.5" y1="17.2" x2="13.5" y2="21" stroke-width="0.7" />
                                                </svg>
                                                <span>${escapeHtml(group.pozoName)}</span>
                                                ${methodBadge}
                                            </h3>
                                            <p>Historial operativo consolidado del pozo para esta jornada.</p>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                            <button class="btn-well-detail-tab" data-pozo="${escapeHtml(group.pozoName)}" style="display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: 10px; border: 1.5px solid #0f766e; background: linear-gradient(135deg, #f0fdfa, #ccfbf1); color: #0f766e; font-weight: 700; font-size: 0.72rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em; transition: all 0.2s; font-family: inherit;">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                Ver Detalles
                                            </button>
                                            <span class="daily-ticket-group-count">${group.records.length} registros</span>
                                        </div>
                                    </div>
                                    <div style="overflow-x: auto;">
                                        <table class="history-table daily-ticket-history-table">
                                            <thead>
                                                <tr>
                                                    ${tableHeaders}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${group.records.map(record => buildOperationalRowHtml(record, false)).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div id="photos-${escapeHtml(group.pozoName)}"></div>
                                </article>
                            `}).join('')}
                    </div>
                </section>
            `;
            }).join('');

            // Attach event delegation for "Ver Detalles" buttons
            document.querySelectorAll('.btn-well-detail-tab').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    const pozoName = btn.getAttribute('data-pozo');
                    const group = currentTicketGroups.find(g => g.pozoName === pozoName);
                    if (group) openWellDetailTab(pozoName, group.records);
                };
            });
        }

        async function openWellDetailTab(pozoName, records) {
            const activeScope = getActiveOperationalScope();
            const isCrc = activeScope === 'crc_ll' || activeScope === 'ccrc_ll';
            // Open tab synchronously to avoid popup blocker
            const detailWindow = window.open('', '_blank');
            if (!detailWindow) {
                Swal.fire({ icon: 'warning', title: 'Popup Bloqueado', text: 'Por favor permite ventanas emergentes para ver la ficha técnica.' });
                return;
            }

            const ticketDate = document.getElementById('ticket-date')?.value || '';
            const ticketShiftLabel = getTicketShiftLabel();
            const escHtml = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const formatVal = (v) => (v !== null && v !== undefined && v !== '') ? v : '--';

            // Show loading state
            detailWindow.document.write('<html><head><title>Cargando ficha...</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#334155;}</style></head><body><div style="text-align:center;"><div style="width:40px;height:40px;border:3px solid #e2e8f0;border-top:3px solid #0f766e;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div><p style="font-weight:600;">Cargando ficha técnica de ' + escHtml(pozoName) + '...</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>');

            try {
                // Fetch extended data for all records
                let allExtendedRecords = [];
                for (const record of records) {
                    let extraData = {};
                    const cleanTime = String(record.hora || '').substring(0, 5);

                    const { data: fieldData } = await supabase
                        .from('field_journey_records')
                        .select('report_time, raw_payload')
                        .eq('pozo', pozoName)
                        .eq('report_date', record.fecha);

                    if (fieldData && fieldData.length > 0) {
                        const match = fieldData.find(f => String(f.report_time || '').substring(0, 5) === cleanTime) || fieldData[0];
                        extraData = match.raw_payload || {};
                    } else {
                        const { data: excelData } = await supabase
                            .from('consolidated_dashboard_operational')
                            .select('row_data, report_time')
                            .eq('pozo', pozoName)
                            .eq('report_date', record.fecha);

                        if (excelData && excelData.length > 0) {
                            const exactMatch = excelData.find(r => String(r.report_time || '').substring(0, 5) === cleanTime) || excelData[0];
                            extraData = exactMatch.row_data || {};
                        }
                    }
                    const extendedRecord = { ...extraData, ...record };
                    const activeScope = getActiveOperationalScope();
                    if (activeScope === 'crc_ll' && !extendedRecord.locacion_jornada) {
                        extendedRecord.locacion_jornada = 'Lagunillas Lago';
                    }
                    allExtendedRecords.push(extendedRecord);
                }

                // Fetch all documents for this pozo on this date
                let photosHtml = '';
                let attachmentsHtml = '';
                try {
                    const { data: allDocs } = await supabase
                        .from('well_historical_documents')
                        .select('*')
                        .is('deleted_at', null)
                        .eq('fecha_documento', ticketDate)
                        .eq('pozo_name', pozoName.toUpperCase());

                    if (Array.isArray(allDocs) && allDocs.length > 0) {
                        const { getDocumentDownloadUrls } = await import('../services/well-documents-service.js');
                        const filePaths = allDocs.map(p => p.file_path).filter(Boolean);
                        const urlsMap = await getDocumentDownloadUrls(filePaths);

                        // Classify documents
                        const photos = allDocs.filter(d => d.categoria === 'SOPORTES');
                        const echometerDocs = allDocs.filter(d => d.categoria === 'REGISTROS_ECHOMETER');
                        const sensorDocs = allDocs.filter(d => d.categoria === 'DATA_SENSOR_FONDO');
                        const vsdDocs = allDocs.filter(d => d.categoria === 'VOLCADOS_VSD');

                        // 1. Build Photos section
                        if (photos.length > 0) {
                            const photoCards = photos.map(p => {
                                const url = urlsMap[p.file_path];
                                if (!url) return '';
                                return `<div class="photo-card"><img src="${url}" alt="${escHtml(p.nombre_archivo)}" loading="lazy"><span class="photo-label">${escHtml(p.nombre_archivo)}</span></div>`;
                            }).filter(Boolean).join('');

                            if (photoCards) {
                                photosHtml = `
                                <section class="detail-section" style="background: #f0fdfa; border-color: #99f6e4;">
                                    <h3 style="color: #0f766e;">📸 Soportes Fotográficos de Campo (${photos.length})</h3>
                                    <div class="photo-grid">${photoCards}</div>
                                </section>`;
                            }
                        }

                        // 2. Build Attachments section
                        let attachmentCards = '';

                        // Render Echometer
                        echometerDocs.forEach(d => {
                            const url = urlsMap[d.file_path] || '#';
                            attachmentCards += `
                                <div class="attachment-card cat-echometer">
                                    <div class="attachment-icon">📈</div>
                                    <div class="attachment-info">
                                        <span class="attachment-type">Registro Echometer / Nivel</span>
                                        <strong class="attachment-name" title="${escHtml(d.nombre_archivo)}">${escHtml(d.nombre_archivo)}</strong>
                                    </div>
                                    <a href="${url}" target="_blank" download class="btn-download">Descargar</a>
                                </div>
                            `;
                        });

                        // Render Sensor de Fondo
                        sensorDocs.forEach(d => {
                            const url = urlsMap[d.file_path] || '#';
                            attachmentCards += `
                                <div class="attachment-card cat-sensor">
                                    <div class="attachment-icon">💾</div>
                                    <div class="attachment-info">
                                        <span class="attachment-type">Data Sensor de Fondo</span>
                                        <strong class="attachment-name" title="${escHtml(d.nombre_archivo)}">${escHtml(d.nombre_archivo)}</strong>
                                    </div>
                                    <a href="${url}" target="_blank" download class="btn-download">Descargar</a>
                                </div>
                            `;
                        });

                        // Render VSD Dumps
                        vsdDocs.forEach(d => {
                            const url = urlsMap[d.file_path] || '#';
                            attachmentCards += `
                                <div class="attachment-card cat-vsd">
                                    <div class="attachment-icon">⚡</div>
                                    <div class="attachment-info">
                                        <span class="attachment-type">Volcado de Variador VSD</span>
                                        <strong class="attachment-name" title="${escHtml(d.nombre_archivo)}">${escHtml(d.nombre_archivo)}</strong>
                                    </div>
                                    <a href="${url}" target="_blank" download class="btn-download">Descargar</a>
                                </div>
                            `;
                        });

                        if (attachmentCards) {
                            attachmentsHtml = `
                            <section class="detail-section attachments-section" style="background: #f8fafc; border-color: #e2e8f0;">
                                        <h3 style="color: #475569;">📁 Archivos Técnicos de Campo del Día</h3>
                                <div class="attachments-grid">${attachmentCards}</div>
                            </section>`;
                        }
                    }
                } catch (e) { console.warn('Documents fetch error:', e); }

                // PARAM_SECTIONS reuse
                let SECTIONS;
                if (isCrc) {
                    const pozoNameUpper = String(pozoName || '').trim().toUpperCase();
                    const wellMeta = activeScopeWellCatalog.find(w => w.pozo_name === pozoNameUpper);
                    const liftMethod = wellMeta?.lift_method || (records && records[0] ? (records[0].lift_method || records[0].raw_payload?.lift_method) : '') || 'BM';

                    const liftMethodFields = liftMethod === 'BCP'
                        ? [
                            { key: 'bcp_rpm', label: 'RPM', unit: '' },
                            { key: 'bcp_torque', label: 'Torque', unit: 'LBF-IN' },
                            { key: 'bcp_amperaje', label: 'Corriente Motor BCP', unit: 'A' },
                            { key: 'bcp_modelo_cabezal', label: 'Modelo Cabezal', unit: '' },
                            { key: 'bcp_motorreductor', label: 'Motorreductor', unit: '' },
                            { key: 'bcp_stuffing', label: 'Stuffing Box', unit: '' }
                          ]
                        : [
                            { key: 'bm_marca', label: 'Marca Unidad', unit: '' },
                            { key: 'bm_modelo', label: 'Modelo Unidad', unit: '' },
                            { key: 'bm_tiro', label: 'Tiro', unit: '' },
                            { key: 'bm_recorrido', label: 'Recorrido', unit: 'IN' },
                            { key: 'bm_spm', label: 'Velocidad (SPM)', unit: 'SPM' },
                            { key: 'bm_estado_unidad', label: 'Estado Unidad', unit: '' }
                          ];

                    SECTIONS = [
                        {
                            id: 'jornada',
                            title: '📋 Identificación & Guardia',
                            color: '#1E3A8A',
                            bg: '#EFF6FF',
                            border: '#BFDBFE',
                            fields: [
                                { key: 'tecnico_1', label: 'Técnico 1' },
                                { key: 'tecnico_2', label: 'Técnico 2' },
                                { key: 'equipo_guardia', label: 'Equipo de Guardia' },
                                { key: 'locacion_jornada', label: 'Locación' },
                                { key: 'jornada', label: 'Jornada' },
                                { key: 'pozo', label: 'Pozo' },
                                { key: 'campo', label: 'Campo' },
                                { key: 'fecha', label: 'Fecha' },
                                { key: 'hora', label: 'Hora' }
                            ]
                        },
                        {
                            id: 'info_general',
                            title: '🛢️ Producción & Flujos',
                            color: '#0F766E',
                            bg: '#F0FDF4',
                            border: '#99F6E4',
                            fields: [
                                { key: 'ef', label: 'EF' },
                                { key: 'estado', label: 'Estado' },
                                { key: 'categoria', label: 'Categoría' },
                                { key: 'potencial', label: 'Potencial', unit: 'BPD' },
                                { key: 'frecuencia', label: 'Caudal Bruto', unit: 'BPD' },
                                { key: 'bruta', label: 'Caudal Bruto', unit: 'BPD' },
                                { key: 'corriente_motor', label: 'Caudal Neto', unit: 'BPD' },
                                { key: 'neta', label: 'Caudal Neto', unit: 'BPD' },
                                { key: 'pip', label: 'Contenido de Agua (% AyS)', unit: '%' },
                                { key: 'ays_percentage', label: 'Contenido de Agua (% AyS)', unit: '%' },
                                { key: 'actividad', label: 'Actividad' },
                                { key: 'estatus', label: 'Estatus' }
                            ]
                        },
                        {
                            id: 'parametros_levantamiento',
                            title: `⚙️ Parámetros de Levantamiento (${liftMethod})`,
                            color: '#D97706',
                            bg: '#FFFBEB',
                            border: '#FDE68A',
                            fields: liftMethodFields
                        },
                        {
                            id: 'presiones_superficie',
                            title: '📈 Parámetros Operativos (Presiones)',
                            color: '#0D9488',
                            bg: '#F0FDF4',
                            border: '#BBF7D0',
                            fields: [
                                { key: 'echometer', label: 'Echometer' },
                                { key: 'presion_thp', label: 'Presión THP', unit: 'psi' },
                                { key: 'thp_psi', label: 'Presión THP', unit: 'psi' },
                                { key: 'presion_chp', label: 'Presión CHP', unit: 'psi' },
                                { key: 'chp_psi', label: 'Presión CHP', unit: 'psi' },
                                { key: 'stuffing', label: 'Presión Stuffing Box', unit: 'psi' },
                                { key: 'nivel_fluido_ft', label: 'Nivel de Fluido', unit: 'ft' },
                                { key: 'sumergencia_ft', label: 'Sumergencia', unit: 'ft' }
                            ]
                        },
                        {
                            id: 'pruebas_nivel',
                            title: '📏 Pruebas de Nivel & Presión',
                            color: '#7C3AED',
                            bg: '#F5F3FF',
                            border: '#DDD6FE',
                            fields: [
                                { key: 'well_nivel', label: 'Nivel del Fluido', unit: 'ft' },
                                { key: 'well_sumergencia', label: 'Sumergencia', unit: 'ft' },
                                { key: 'well_presion_inicial', label: 'Presión Inicial', unit: 'psi' },
                                { key: 'presion_inicial', label: 'Presión Inicial', unit: 'psi' },
                                { key: 'well_presion_final', label: 'Presión Final', unit: 'psi' },
                                { key: 'presion_final', label: 'Presión Final', unit: 'psi' },
                                { key: 'well_tiempo_prueba', label: 'Tiempo de Prueba' },
                                { key: 'tiempo_prueba_presion', label: 'Tiempo de Prueba (min)' }
                            ]
                        },
                        {
                            id: 'observaciones_sec',
                            title: '🩺 Observaciones & Actividad',
                            color: '#334155',
                            bg: '#F8FAFC',
                            border: '#E2E8F0',
                            fields: [
                                { key: 'sentido_giro', label: 'Actividad' },
                                { key: 'actividad', label: 'Actividad' },
                                { key: 'observaciones_pozo', label: 'Observaciones Pozo' },
                                { key: 'observaciones', label: 'Observaciones' }
                            ]
                        }
                    ];
                } else {
                    SECTIONS = [
                        { id: 'jornada', title: '📋 Jornada', color: '#1E3A8A', bg: '#EFF6FF', border: '#BFDBFE', fields: [
                            { key: 'tecnico_1', label: 'Técnico 1' },
                            { key: 'tecnico_2', label: 'Técnico 2' },
                            { key: 'equipo_guardia', label: 'Equipo de Guardia' },
                            { key: 'locacion_jornada', label: 'Locación de la Jornada' },
                            { key: 'jornada', label: 'Jornada' },
                            { key: 'pozo', label: 'Pozo' },
                            { key: 'campo', label: 'Campo' },
                            { key: 'fecha', label: 'Fecha' },
                            { key: 'hora', label: 'Hora' }
                        ]},
                        { id: 'info_general', title: '📍 Información General', color: '#0F766E', bg: '#F0FDF4', border: '#99F6E4', fields: [
                            { key: 'ef', label: 'EF' },
                            { key: 'estado', label: 'Estado' },
                            { key: 'categoria', label: 'Categoría' },
                            { key: 'potencial', label: 'Potencial', unit: 'BPD' },
                            { key: 'bruta', label: 'Bruta', unit: 'BPD' },
                            { key: 'neta', label: 'Neta', unit: 'BPD' },
                            { key: 'ays_percentage', label: '% AyS', unit: '%' },
                            { key: 'actividad', label: 'Actividad' },
                            { key: 'estatus', label: 'Estatus' }
                        ]},
                        { id: 'parametros_operacionales', title: '⚙️ Parámetros Operacionales', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', fields: [
                            { key: 'frecuencia', label: 'Frecuencia', unit: 'Hz' },
                            { key: 'modo_operacion', label: 'Modo de Operación' },
                            { key: 'sentido_giro', label: 'Sentido de Giro' },
                            { key: 'i_motor', label: 'I Motor', unit: 'A' },
                            { key: 'v_motor', label: 'V Motor', unit: 'V' },
                            { key: 'out_vsd', label: 'Out VSD', unit: 'V' },
                            { key: 'i_vsd_a', label: 'I VSD A', unit: 'A' },
                            { key: 'i_vsd_b', label: 'I VSD B', unit: 'A' },
                            { key: 'i_vsd_c', label: 'I VSD C', unit: 'A' },
                            { key: 'prom_i_vsd', label: 'Prom I VSD', unit: 'A' },
                            { key: 'desv_fase_a', label: 'ABS IA PROM VSD', unit: '%' },
                            { key: 'desv_fase_b', label: 'ABS IB PROM VSD', unit: '%' },
                            { key: 'desv_fase_c', label: 'ABS IC PROM VSD', unit: '%' },
                            { key: 'max_desviacion_vsd', label: 'MAXIMO ABS I VSD', unit: '%' },
                            { key: 'desbalance_corriente_vsd', label: '% Desbalance Corriente VSD', unit: '%' },
                            { key: 'posee_sensor_fondo', label: 'Posee Sensor de Fondo' },
                            { key: 'descarga_datas_sensor', label: 'Descargó Data del Sensor' },
                            { key: 'pip_psi', label: 'PIP', unit: 'psi' },
                            { key: 'pd_psi', label: 'PD', unit: 'psi' },
                            { key: 'ti_f', label: 'Ti', unit: '°F' },
                            { key: 'tm_f', label: 'Tm', unit: '°F' },
                            { key: 'vx_g', label: 'Vx', unit: 'G' },
                            { key: 'vy_g', label: 'Vy', unit: 'G' },
                            { key: 'vz_g', label: 'Vz', unit: 'G' }
                        ]},
                        { id: 'sistema_bes', title: '🔌 Sistema BES', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', fields: [
                            { key: 'amp_nominal_motor', label: 'Amp Nominal Motor', unit: 'A' },
                            { key: 'volt_nominal_motor', label: 'Volt Nominal Motor', unit: 'V' },
                            { key: 'frec_max_hz', label: 'Frec Max', unit: 'Hz' },
                            { key: 'low_speed_hz', label: 'Low Speed', unit: 'Hz' },
                            { key: 'ul_a', label: 'UL', unit: 'A' },
                            { key: 'ol_a', label: 'OL', unit: 'A' },
                            { key: 'i_limit_a', label: 'I-Limit', unit: 'A' },
                            { key: 'tiempo_desaceleracion_seg', label: 'Tiempo de Desaceleración', unit: 'seg' },
                            { key: 'low_pip_shutdown_psi', label: 'Low PIP Shutdown', unit: 'psi' },
                            { key: 'max_high_temp_shutdown_f', label: 'Max High Temp. Shutdown', unit: '°F' }
                        ]},
                        { id: 'superficie', title: '🏗️ Superficie & Equipamiento', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1', fields: [
                            { key: 'baja_datos', label: 'Descargó Data del VDF' },
                            { key: 'vsd_kva', label: 'VSD', unit: 'kVA' },
                            { key: 'marca_vsd', label: 'Marca VSD' },
                            { key: 'modelo_vsd', label: 'Modelo VSD' },
                            { key: 'tx_kva', label: 'Tx', unit: 'kVA' },
                            { key: 'tap_v', label: 'Tap', unit: 'V' },
                            { key: 'rt', label: 'R.T' },
                            { key: 'estado_tx', label: 'Estado del Tx' },
                            { key: 'estado_vsd', label: 'Estado del VSD' },
                            { key: 'estado_panel_sensor_choques', label: 'Estado Panel Sensor / Choques' },
                            { key: 'estado_aterramiento', label: 'Estado del Aterramiento' },
                            { key: 'condicion_cableado', label: 'Condición del Cableado' },
                            { key: 'condicion_caseta', label: 'Condición de la Jaula' },
                            { key: 'temperatura_caseta', label: 'Temperatura de la Caseta del VDF', unit: '°C' },
                            { key: 'estado_fosa_porcentaje', label: 'Estado de Fosa', unit: '%' },
                            { key: 'estado_biw_conector', label: 'Estado del BIW/Conector' },
                            { key: 'estado_manometros', label: 'Estado de Manómetros' },
                            { key: 'estado_cabezal', label: 'Estado del Cabezal' },
                            { key: 'estado_tomamuestras', label: 'Estado de Tomamuestras' },
                            { key: 'estado_caja_venteo', label: 'Estado Caja de Venteo' }
                        ]},
                        { id: 'presiones_superficie', title: '📈 Presiones de Superficie & Echometer', color: '#0D9488', bg: '#F0FDF4', border: '#BBF7D0', fields: [
                            { key: 'echometer', label: 'Echometer' },
                            { key: 'thp_psi', label: 'THP', unit: 'psi' },
                            { key: 'chp_psi', label: 'CHP', unit: 'psi' },
                            { key: 'lf_psi', label: 'LF', unit: 'psi' },
                            { key: 'cond_chp', label: 'Cond. CHP' },
                            { key: 'nivel_fluido_ft', label: 'Nivel de Fluido', unit: 'ft' },
                            { key: 'sumergencia_ft', label: 'Sumergencia', unit: 'ft' },
                            { key: 'pip_echometer_psi', label: 'PIP Echometer', unit: 'psi' },
                            { key: 'diagnostico', label: 'Diagnóstico' }
                        ]},
                        { id: 'prueba_electrica', title: '⚡ Prueba Eléctrica', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', fields: [
                            { key: 'resistencia_ab_ohm', label: 'Resistencia A-B', unit: 'Ohm' },
                            { key: 'resistencia_bc_ohm', label: 'Resistencia B-C', unit: 'Ohm' },
                            { key: 'resistencia_ca_ohm', label: 'Resistencia C-A', unit: 'Ohm' },
                            { key: 'aislamiento_fase_tierra_mohm', label: 'Aislamiento Fase-Tierra', unit: 'MOhm' }
                        ]},
                    { id: 'tx_bobina_primaria', title: '🌀 Tx Bobina Primaria', color: '#4F46E5', bg: '#E0E7FF', border: '#C7D2FE', fields: [
                        { key: 'ff_x1_x2_v', label: 'FASE-FASE X1-X2', unit: 'V' },
                        { key: 'ff_x2_x3_v', label: 'FASE-FASE X2-X3', unit: 'V' },
                        { key: 'ff_x3_x1_v', label: 'FASE-FASE X3-X1', unit: 'V' },
                        { key: 'promedio_fase_fase', label: 'PROMEDIO F-F PRIMARIO', unit: 'V' },
                        { key: 'desv_ff_x1_x2', label: 'ABS X1-X2 PROM', unit: 'V' },
                        { key: 'desv_ff_x2_x3', label: 'ABS X3-X2 PROM', unit: 'V' },
                        { key: 'desv_ff_x3_x1', label: 'ABS X3-X1 PROM', unit: 'V' },
                        { key: 'max_desviacion_ff', label: 'MAX ABS F-F PRIMARIO', unit: 'V' },
                        { key: 'desbalance_fase_fase', label: '% DESBALANCE FASE/FASE', unit: '%' },
                        { key: 'ft_x1_tierra_v', label: 'FASE-TIERRA X1-X2', unit: 'V' },
                        { key: 'ft_x2_tierra_v', label: 'FASE-TIERRA X2-X3', unit: 'V' },
                        { key: 'ft_x3_tierra_v', label: 'FASE-TIERRA X3-X1', unit: 'V' },
                        { key: 'promedio_fase_tierra', label: 'PROMEDIO FASE/TIERRA', unit: 'V' },
                        { key: 'desv_ft_x1_tierra', label: 'ABS X1-X2 FASE TIERRA PRIMARIO', unit: 'V' },
                        { key: 'desv_ft_x2_tierra', label: 'ABS X2-X3 FASE TIERRA PRIMARIO', unit: 'V' },
                        { key: 'desv_ft_x3_tierra', label: 'ABS X3-X1 FASE TIERRA PRIMARIO', unit: 'V' },
                        { key: 'max_desviacion_ft', label: 'MAX ABS F-T PRIMARIO', unit: 'V' },
                        { key: 'desbalance_fase_tierra', label: '% DESBALANCE FASE/TIERRA', unit: '%' },
                        { key: 'corriente_x1_x2_amp', label: 'CORRIENTE X1-X2', unit: 'A' },
                        { key: 'corriente_x2_x3_amp', label: 'CORRIENTE X2-X3', unit: 'A' },
                        { key: 'corriente_x3_x1_amp', label: 'CORRIENTE X3-X1', unit: 'A' },
                        { key: 'promedio_corriente_primaria', label: 'PROMEDIO CORRIENTE PRIMARIO', unit: 'A' },
                        { key: 'desv_corriente_x1_x2', label: 'ABS CORRIENTE X1-X2 PROMEDIO', unit: 'A' },
                        { key: 'desv_corriente_x2_x3', label: 'ABS CORRIENTE X2-X3 PROMEDIO', unit: 'A' },
                        { key: 'desv_corriente_x3_x1', label: 'ABS CORRIENTE X3-X1 PROMEDIO', unit: 'A' },
                        { key: 'max_desviacion_corriente_primaria', label: 'MAX ABS CORRIENTE PROMEDIO PRIMARIO', unit: 'A' },
                        { key: 'desbalance_corriente_primaria', label: '% DESBALANCE CORRIENTE', unit: '%' }
                    ]},
                    { id: 'tx_bobina_secundaria', title: '🌀 Tx Bobina Secundaria', color: '#0891B2', bg: '#ECFEFF', border: '#C5F2F7', fields: [
                        { key: 'sec_ff_h1_h2_v', label: 'FASE-FASE H1-H2', unit: 'V' },
                        { key: 'sec_ff_h2_h3_v', label: 'FASE-FASE H2-H3', unit: 'V' },
                        { key: 'sec_ff_h3_h1_v', label: 'FASE-FASE H3-H1', unit: 'V' },
                        { key: 'sec_promedio_fase_fase', label: 'PROMEDIO FASE/FASE', unit: 'V' },
                        { key: 'sec_desv_ff_h1_h2', label: 'ABS F-F H1-H2 PROMEDIO', unit: 'V' },
                        { key: 'sec_desv_ff_h2_h3', label: 'ABS F-F H2-H3 PROMEDIO', unit: 'V' },
                        { key: 'sec_desv_ff_h3_h1', label: 'ABS F-F H3-H1 PROMEDIO', unit: 'V' },
                        { key: 'sec_max_desviacion_ff', label: 'MAX ABS F-F PROMEDIO SECUNDARIO', unit: 'V' },
                        { key: 'sec_desbalance_fase_fase', label: '% DESBALANCE FASE/FASE', unit: '%' },
                        { key: 'sec_ft_h1_tierra_v', label: 'FASE-TIERRA H1-H2', unit: 'V' },
                        { key: 'sec_ft_h2_tierra_v', label: 'FASE-TIERRA H2-H3', unit: 'V' },
                        { key: 'sec_ft_h3_tierra_v', label: 'FASE-TIERRA H3-H1', unit: 'V' },
                        { key: 'sec_promedio_fase_tierra', label: 'PROMEDIO FASE-TIERRA', unit: 'V' },
                        { key: 'sec_desv_ft_h1_h2', label: 'ABS F-T H1-H2 PROMEDIO', unit: 'V' },
                        { key: 'sec_desv_ft_h2_h3', label: 'ABS F-T H2-H3 PROMEDIO', unit: 'V' },
                        { key: 'sec_desv_ft_h3_h1', label: 'ABS F-T H3-H1 PROMEDIO', unit: 'V' },
                        { key: 'sec_max_desviacion_ft', label: 'MAX ABS F-T PROMEDIO SECUNDARIO', unit: 'V' },
                        { key: 'sec_desbalance_fase_tierra', label: '% DESBALANCE FASE/TIERRA', unit: '%' },
                        { key: 'corriente_h1_h2_amp', label: 'CORRIENTE H1-H2', unit: 'A' },
                        { key: 'corriente_h2_h3_amp', label: 'CORRIENTE H2-H3', unit: 'A' },
                        { key: 'corriente_h3_h1_amp', label: 'CORRIENTE H3-H1', unit: 'A' },
                        { key: 'sec_promedio_corriente', label: 'PROMEDIO CORRIENTE SECUNDARIO', unit: 'A' },
                        { key: 'sec_desv_corriente_h1_h2', label: 'ABS CORRIENTE H1-H2 PROMEDIO', unit: 'A' },
                        { key: 'sec_desv_corriente_h2_h3', label: 'ABS CORRIENTE H2-H3 PROMEDIO', unit: 'A' },
                        { key: 'sec_desv_corriente_h3_h1', label: 'ABS CORRIENTE H3-H1 PROMEDIO', unit: 'A' },
                        { key: 'sec_max_desviacion_corriente', label: 'MAXIMO ABS CORRIENTE PROMEDIO SECUNDARIO', unit: 'A' },
                        { key: 'desbalance_corriente_secundaria', label: '% DESBALANCE CORRIENTE', unit: '%' }
                    ]},
                    { id: 'indicadores_operacionales', title: '📊 Indicadores Operacionales', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', fields: [
                        { key: 'relacion_a_con_a_nom', label: 'Relación A. Con. / A. Nom' },
                        { key: 'porcentaje_amp', label: '% Amp', unit: '%' },
                        { key: 'relacion_v_mot_v_nom', label: 'Relación V. Mot / V. Nom' },
                        { key: 'porcentaje_volt', label: '% Volt', unit: '%' },
                        { key: 'pd_max_psi', label: 'PD Max', unit: 'psi' },
                        { key: 'delta_presion_psi', label: 'Delta Presión', unit: 'psi' },
                        { key: 'porcentaje_delta_presion', label: '% Delta Presión', unit: '%' },
                        { key: 'relacion_tm_t_max', label: 'Tm / T Max Permisible' },
                        { key: 'porcentaje_temp', label: '% Temp', unit: '%' },
                        { key: 'relacion_pip_min_pip', label: 'PIP Min / PIP' },
                        { key: 'porcentaje_pip', label: '% PIP', unit: '%' }
                    ]},
                    { id: 'observaciones_sec', title: '📝 Observaciones', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', fields: [
                        { key: 'observaciones_pozo', label: 'Observaciones del Pozo' }
                    ]}
                ];
                }

                const excludeKeys = new Set(['id', 'ID', 'deleted_at', 'user_id', 'is_historical', 'pozo_id', 'row_data', 'raw_payload', 'created_at', 'updated_at', 'synced_at', 'operational_scope']);
                const cleanStr = str => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                function renderRecordSections(dataObj, isWellRun = true) {
                    const processedCleanKeys = new Set();
                    let sectionsHtml = '';

                    const normalizeMap = {};
                    for (const [k, v] of Object.entries(dataObj)) {
                        if (v !== null && v !== undefined && v !== '') {
                            const ck = cleanStr(k);
                            if (!normalizeMap[ck]) normalizeMap[ck] = { origKey: k, value: v };
                        }
                    }

                    SECTIONS.forEach(sec => {
                        // If well is OFF, only show allowed sections
                        if (!isWellRun && !['jornada', 'info_general', 'presiones_superficie', 'observaciones_sec'].includes(sec.id)) {
                            return;
                        }

                        let cardsHtml = '';
                        sec.fields.forEach(f => {
                            // If well is OFF, only allow diagnostico field in presiones_superficie section
                            if (!isWellRun && sec.id === 'presiones_superficie' && f.key !== 'diagnostico') {
                                return;
                            }

                            const targetCk = cleanStr(f.key);
                            const match = normalizeMap[targetCk];
                            if (match && !processedCleanKeys.has(targetCk)) {
                                processedCleanKeys.add(targetCk);
                                const rawVal = match.value;
                                let valStr = String(rawVal);
                                let badgeHtml = '';

                                if (targetCk === 'estatus') {
                                    const normSt = String(rawVal).toUpperCase().trim();
                                    if (normSt === 'RUN' || normSt === 'RUN / ATENCION AL CLIENTE') {
                                        badgeHtml = '<span class="status-badge run">🟢 RUN</span>';
                                    } else if (normSt === 'OFF' || normSt === 'OFF / ATENCION AL CLIENTE' || normSt === 'PARADA MANUAL') {
                                        badgeHtml = '<span class="status-badge off">🔴 OFF</span>';
                                    } else {
                                        badgeHtml = '<span class="status-badge other">' + escHtml(valStr) + '</span>';
                                    }
                                    valStr = '';
                                } else if (f.unit) {
                                    const num = Number(rawVal);
                                    if (!isNaN(num)) {
                                        valStr = (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)) + ' <small class="unit">' + f.unit + '</small>';
                                    } else {
                                        valStr += ' <small class="unit">' + f.unit + '</small>';
                                    }
                                }

                                const isLongText = ['observacionespozo', 'observaciones', 'diagnostico', 'actividad'].includes(targetCk);
                                cardsHtml += '<div class="param-card" style="' + (isLongText ? 'grid-column: 1 / -1;' : '') + '">' +
                                    '<span class="param-label">' + escHtml(f.label) + '</span>' +
                                    (badgeHtml ? badgeHtml : '<strong class="param-value" style="' + (isLongText ? 'font-size: 0.98rem; font-weight: 600; line-height: 1.5; display: block; margin-top: 4px;' : '') + '">' + valStr + '</strong>') +
                                    '</div>';
                            }
                        });

                        if (cardsHtml) {
                            let secTitle = sec.title;
                            let secColor = sec.color;
                            let secBg = sec.bg;
                            let secBorder = sec.border;
                            if (!isWellRun && sec.id === 'presiones_superficie') {
                                secTitle = '🩺 Diagnóstico';
                                secColor = '#15803D';
                                secBg = '#F0FDF4';
                                secBorder = '#86EFAC';
                            }
                            sectionsHtml += '<div class="detail-section" style="background: ' + secBg + '; border-color: ' + secBorder + ';">' +
                                '<h3 style="color: ' + secColor + ';">' + secTitle + '</h3>' +
                                '<div class="param-grid">' + cardsHtml + '</div>' +
                                '</div>';
                        }
                    });

                    return sectionsHtml;
                }

                // Build records HTML
                let recordsBodyHtml = '';
                allExtendedRecords.forEach((rec, idx) => {
                    const isRun = ['RUN', 'RUN / ATENCION AL CLIENTE'].includes(String(rec.estatus || '').toUpperCase().trim());
                    recordsBodyHtml += `
                        <div class="record-block">
                            <div class="record-header">
                                <div class="record-header-left">
                                    <span class="record-time">${formatVal(rec.fecha)} · ${formatVal(rec.hora)}</span>
                                    <span class="record-badge ${isRun ? 'run' : 'off'}">${isRun ? '🟢 RUN' : '🔴 OFF'}</span>
                                </div>
                                <span class="record-index">Registro ${idx + 1} de ${allExtendedRecords.length}</span>
                            </div>
                            ${renderRecordSections(rec, isRun)}
                        </div>
                    `;
                });

                // Generate full HTML
                const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ficha Técnica · ${escHtml(pozoName)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: #f1f5f9;
            color: #0f172a;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .sheet { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding-bottom: 80px; }

        /* Hero Header */
        .hero {
            background: linear-gradient(135deg, #1e3a8a 0%, #0f766e 100%);
            border-radius: 20px;
            padding: 28px 32px;
            color: #ffffff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            position: relative;
            overflow: hidden;
        }
        .hero::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -20%;
            width: 350px;
            height: 350px;
            border-radius: 50%;
            background: rgba(255,255,255,0.04);
        }
        .hero-kicker { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #99f6e4; margin-bottom: 4px; }
        .hero h1 { font-family: 'Outfit', sans-serif; font-size: 1.6rem; font-weight: 900; margin-bottom: 4px; }
        .hero p { font-size: 0.82rem; color: #ccfbf1; font-weight: 500; }
        .hero-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .hero-tag { font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff; backdrop-filter: blur(6px); text-transform: uppercase; letter-spacing: 0.04em; }
        .hero-logo { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; filter: brightness(0) invert(1); opacity: 0.9; }

        /* Record blocks */
        .record-block { background: #ffffff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .record-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2px solid #e2e8f0; flex-wrap: wrap; gap: 8px; }
        .record-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .record-time { font-weight: 800; font-size: 1rem; color: #1e293b; }
        .record-badge { font-size: 0.7rem; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.04em; }
        .record-badge.run { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .record-badge.off { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .record-index { font-size: 0.75rem; color: #94a3b8; font-weight: 600; }

        /* Sections */
        .detail-section { border-radius: 14px; padding: 16px; border: 1px solid; margin-bottom: 14px; }
        .detail-section h3 { font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
        .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
        .param-card { background: #ffffff; padding: 10px 12px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .param-label { display: block; font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 3px; }
        .param-value { color: #0f172a; font-size: 0.95rem; font-weight: 800; word-break: break-word; }
        .unit { font-size: 0.72rem; color: #94a3b8; font-weight: 600; }
        .status-badge { font-size: 0.78rem; font-weight: 800; padding: 3px 10px; border-radius: 12px; display: inline-block; }
        .status-badge.run { background: #dcfce7; color: #15803d; }
        .status-badge.off { background: #fee2e2; color: #b91c1c; }
        .status-badge.other { background: #f1f5f9; color: #475569; }

        /* Photos */
        .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
        .photo-card { border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background: #fff; }
        .photo-card img { width: 100%; height: 160px; object-fit: cover; display: block; }
        .photo-label { display: block; padding: 6px 10px; font-size: 0.7rem; font-weight: 600; color: #64748b; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Attachments */
        .attachments-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .attachment-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .attachment-icon {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: rgba(255,255,255,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
            border: 1px solid rgba(0,0,0,0.05);
        }
        .attachment-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .attachment-type { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; color: #64748b; }
        .attachment-name { font-size: 0.82rem; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-download {
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 0.72rem;
            font-weight: 800;
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            background: #0f766e;
            color: #fff;
            text-align: center;
            transition: all 0.2s;
        }
        .btn-download:hover { background: #0d9488; }

        /* Categorized colors */
        .cat-echometer { background: #f0fdf4; border-color: #bbf7d0; }
        .cat-echometer .attachment-icon { background: #dcfce7; color: #15803d; }
        .cat-sensor { background: #f5f3ff; border-color: #ddd6fe; }
        .cat-sensor .attachment-icon { background: #e0e7ff; color: #7c3aed; }
        .cat-vsd { background: #fffbeb; border-color: #fde68a; }
        .cat-vsd .attachment-icon { background: #fef3c7; color: #d97706; }

        /* Buttons */
        .floating-actions { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 99999; }
        .btn-float { padding: 12px 24px; border-radius: 50px; font-weight: 800; font-size: 0.8rem; cursor: pointer; border: none; text-transform: uppercase; letter-spacing: 0.04em; font-family: 'Inter', system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,0.2); transition: all 0.2s; }
        .btn-float:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
        .btn-back { background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fff; }
        .btn-print { background: linear-gradient(135deg, #0f766e, #0d9488); color: #fff; }

        @media print {
            @page { size: landscape; margin: 8mm; }
            body { padding: 0; background: #fff; }
            .floating-actions { display: none !important; }
            .sheet { padding-bottom: 0; }
            .hero { border-radius: 0; }
            .record-block { box-shadow: none; page-break-inside: avoid; }
            .detail-section { page-break-inside: avoid; }
            .photo-card img { height: 120px; }
            .attachments-section { display: none !important; }
        }
        @media (max-width: 768px) {
            body { padding: 12px; }
            .hero { flex-direction: column; text-align: center; padding: 20px; border-radius: 16px; }
            .hero-logo { width: 50px; height: 50px; }
            .hero h1 { font-size: 1.1rem; }
            .param-grid { grid-template-columns: repeat(2, 1fr); }
            .photo-grid { grid-template-columns: repeat(2, 1fr); }
            .attachments-grid { grid-template-columns: repeat(2, 1fr); }
            .floating-actions { flex-direction: column; width: calc(100% - 32px); }
            .btn-float { text-align: center; }
        }
        @media (max-width: 480px) {
            .param-grid { grid-template-columns: 1fr; }
            .photo-grid { grid-template-columns: 1fr; }
            .attachments-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="sheet">
        <section class="hero">
            <div>
                <div class="hero-kicker">UV SERVICES · Ficha Técnica Individual</div>
                <h1>POZO: ${escHtml(pozoName.toUpperCase())}</h1>
                <p>Reporte operativo detallado con todos los parámetros BES registrados.</p>
                <div class="hero-meta">
                    <span class="hero-tag">⚡ BES</span>
                    <span class="hero-tag">📅 ${escHtml(ticketDate)}</span>
                    <span class="hero-tag">☀️ ${escHtml(ticketShiftLabel)}</span>
                    <span class="hero-tag">${allExtendedRecords.length} registro(s)</span>
                </div>
            </div>
            <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" class="hero-logo" alt="UV Servicios">
        </section>

        ${recordsBodyHtml}
        ${photosHtml}
        ${attachmentsHtml}
    </div>

    <div class="floating-actions">
        <button class="btn-float btn-back" onclick="window.close()">← Volver a Data</button>
    </div>
</body>
</html>`;

                detailWindow.document.open();
                detailWindow.document.write(html);
                detailWindow.document.close();
            } catch (err) {
                console.error('Error generating well detail tab:', err);
                detailWindow.document.open();
                detailWindow.document.write('<html><body style="font-family:system-ui;padding:40px;text-align:center;"><h2>Error</h2><p>' + escHtml(err.message) + '</p><button onclick="window.close()" style="margin-top:20px;padding:10px 20px;cursor:pointer;">Cerrar</button></body></html>');
                detailWindow.document.close();
            }
        }

        async function loadDailyTicketData() {
            let ticketDate = document.getElementById('ticket-date')?.value;
            if (!ticketDate) {
                const todayIso = new Date().toISOString().slice(0, 10);
                const dateInput = document.getElementById('ticket-date');
                if (dateInput) {
                    dateInput.value = todayIso;
                    ticketDate = todayIso;
                }
            }

            if (!ticketDate) {
                currentRecordData = [];
                currentTicketGroups = [];
                currentTicketShiftGroups = [];
                renderDailyTicket();
                return;
            }

            const groupsContainer = document.getElementById('daily-ticket-groups');
            if (groupsContainer) {
                groupsContainer.innerHTML = '<div class="daily-ticket-empty">Cargando ticket diario...</div>';
            }

            try {
                let targetPozoNames = activeScopePozoNames;
                if (!Array.isArray(targetPozoNames) || targetPozoNames.length === 0) {
                    if (Array.isArray(activeScopeWellCatalog) && activeScopeWellCatalog.length > 0) {
                        targetPozoNames = activeScopeWellCatalog.map(w => w.pozo_name).filter(Boolean);
                    }
                }
                if (!Array.isArray(targetPozoNames) || targetPozoNames.length === 0) {
                    targetPozoNames = await getActiveOperationalScopeWellNames().catch(() => []);
                }

                const nextDate = addDaysToIsoDate(ticketDate, 1);
                const data = await getMonitoringData(targetPozoNames, ticketDate, nextDate);
                const journeyMap = await getJornadaMapForDate(ticketDate);
                const operationalRecords = filterRecordsByOperationalDate(data, ticketDate, journeyMap);
                const selectedShiftGroup = getSelectedTicketShiftGroup(operationalRecords);
                currentRecordData = selectedShiftGroup.records;
                currentTicketGroups = groupMonitoringRecordsByPozo(currentRecordData);
                currentTicketShiftGroups = [{
                    ...selectedShiftGroup,
                    groups: currentTicketGroups
                }];
                renderDailyTicket();
                loadAndRenderDailyTicketPhotos(ticketDate);
            } catch (err) {
                currentRecordData = [];
                currentTicketGroups = [];
                currentTicketShiftGroups = [];
                Swal.fire({ icon: 'error', title: 'Error BD', text: err.message });
                renderDailyTicket();
            }
        }

        async function loadAndRenderDailyTicketPhotos(ticketDate) {
            const activeWellNames = [...new Set(currentRecordData.map(r => String(r.pozo_name || r.pozo || '').trim().toUpperCase()).filter(Boolean))];
            if (activeWellNames.length === 0) return;

            // Inyectar estilos CSS para animación de spinner y placeholder si no existen
            if (!document.getElementById('watermark-spinner-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'watermark-spinner-styles';
                styleEl.textContent = `
                    @keyframes watermark-loader-rotate {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .watermark-loader-spinner {
                        width: 20px;
                        height: 20px;
                        border: 2px.5 solid #e2e8f0;
                        border-top: 2.5px solid #0f766e;
                        border-radius: 50%;
                        animation: watermark-loader-rotate 0.8s linear infinite;
                    }
                `;
                document.head.appendChild(styleEl);
            }

            try {
                const { data: photos } = await supabase
                    .from('well_historical_documents')
                    .select('*')
                    .eq('categoria', 'SOPORTES')
                    .is('deleted_at', null)
                    .eq('fecha_documento', ticketDate)
                    .in('pozo_name', activeWellNames);

                if (Array.isArray(photos) && photos.length > 0) {
                    const { getDocumentDownloadUrls } = await import('../services/well-documents-service.js');
                    
                    const filePaths = photos.map(p => p.file_path).filter(Boolean);
                    const urlsMap = await getDocumentDownloadUrls(filePaths);

                    const photosByWell = {};
                    for (const photo of photos) {
                        const wName = String(photo.pozo_name || '').trim().toUpperCase();
                        if (wName) {
                            if (!photosByWell[wName]) photosByWell[wName] = [];
                            photosByWell[wName].push(photo);
                        }
                    }

                    for (const [wellName, wellPhotos] of Object.entries(photosByWell)) {
                        const container = document.getElementById(`photos-${wellName}`);
                        if (container) {
                            container.innerHTML = `
                                <div style="margin-top: 8px; padding: 12px 18px 18px 18px; border-top: 1px dashed #cbd5e1;">
                                    <h4 style="margin: 0 0 10px; font-size: 0.82rem; color: #0f766e; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
                                        📸 Soportes de Campo del Día (${wellPhotos.length})
                                    </h4>
                                    <div class="daily-ticket-photo-thumbnails" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                    </div>
                                </div>
                            `;
                            const thumbnailsDiv = container.querySelector('.daily-ticket-photo-thumbnails');
                            
                            for (const photo of wellPhotos) {
                                if (photo.file_path && urlsMap[photo.file_path]) {
                                    const rawUrl = urlsMap[photo.file_path];
                                    
                                    const wrapper = document.createElement('div');
                                    wrapper.style = 'width: 76px; height: 76px; position: relative; border-radius: 12px; border: 1px solid #cbd5e1; background: #f1f5f9; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;';
                                    
                                    wrapper.onmouseenter = () => { wrapper.style.transform = 'scale(1.05)'; wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; };
                                    wrapper.onmouseleave = () => { wrapper.style.transform = 'scale(1)'; wrapper.style.boxShadow = 'none'; };
                                    
                                    // 1. Spinner de carga individual
                                    const spinner = document.createElement('div');
                                    spinner.className = 'watermark-loader-spinner';
                                    wrapper.appendChild(spinner);
                                    
                                    // 2. Imagen real con carga asíncrona nativa
                                    const img = document.createElement('img');
                                    img.src = rawUrl;
                                    img.alt = photo.nombre_archivo;
                                    img.title = `Haga clic para ver: ${photo.nombre_archivo}`;
                                    img.style = 'width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s; position: absolute; top: 0; left: 0; display: block;';
                                    
                                    img.onload = () => {
                                        img.style.opacity = '1';
                                        spinner.style.display = 'none';
                                    };
                                    
                                    img.onclick = () => {
                                        Swal.fire({
                                            title: photo.nombre_archivo || 'Foto Soporte',
                                            html: `
                                                <div style="position: relative; display: inline-block; max-width: 100%; overflow: hidden; border-radius: 16px; border: 1px solid #cbd5e1; background: #f1f5f9; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                                                    <img src="${rawUrl}" style="max-width: 100%; max-height: 70vh; display: block; border-radius: 16px;">
                                                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; display: flex; align-items: center; justify-content: center;">
                                                        <!-- Logo corporativo centrado sin rotar -->
                                                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" style="width: 32%; opacity: 0.16; filter: grayscale(100%);">
                                                        <!-- Badge en esquina inferior derecha -->
                                                        <span style="position: absolute; bottom: 12px; right: 12px; font-size: 0.7rem; font-weight: 800; color: rgba(255,255,255,0.92); background: rgba(15, 118, 110, 0.78); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 6px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 4px 12px rgba(0,0,0,0.15); line-height: 1;">UV SERVICIOS</span>
                                                    </div>
                                                </div>
                                            `,
                                            showCloseButton: true,
                                            showConfirmButton: false,
                                            width: 'auto',
                                            maxWidth: '95%'
                                        });
                                    };
                                    wrapper.appendChild(img);
                                    
                                    // 3. Marca de agua visual por CSS overlay
                                    const overlay = document.createElement('div');
                                    overlay.style = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; display: flex; align-items: center; justify-content: center;';
                                    overlay.innerHTML = `
                                        <!-- Logo corporativo centrado sin rotar -->
                                        <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" style="width: 38%; opacity: 0.16; filter: grayscale(100%); pointer-events: none;">
                                        <!-- Badge UV en miniatura -->
                                        <span style="position: absolute; bottom: 4px; right: 4px; font-size: 8px; font-weight: 800; color: rgba(255,255,255,0.9); background: rgba(15, 118, 110, 0.75); padding: 1px 4px; border-radius: 4px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; border: 0.5px solid rgba(255,255,255,0.2); line-height: 1;">UV</span>
                                    `;
                                    wrapper.appendChild(overlay);
                                    
                                    thumbnailsDiv.appendChild(wrapper);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('[daily-ticket-photos] Error fetching photos:', err);
            }
        }

        // Cambia la vista entre historial operativo, medicion tecnica, archivos echometer y descarga VSD.
        function setHistoryMode(mode) {
            activeHistoryMode = mode;

            document.getElementById('btn-operational-history')?.classList.toggle('active', mode === 'operational');
            document.getElementById('btn-technical-history')?.classList.toggle('active', mode === 'technical');
            document.getElementById('btn-level-history')?.classList.toggle('active', mode === 'level');
            document.getElementById('btn-echometer-history')?.classList.toggle('active', mode === 'echometer');
            document.getElementById('btn-sensor-history')?.classList.toggle('active', mode === 'sensor');
            document.getElementById('btn-vsd-history')?.classList.toggle('active', mode === 'vsd');
            document.getElementById('btn-soportes-history')?.classList.toggle('active', mode === 'soportes');
            renderHistoryHead();
            if (activePozo) {
                loadPozoData();
            }
        }

        // Cambia las columnas de la tabla segun el modo activo para no mezclar estructuras.
        function renderHistoryHead() {
            const thead = document.getElementById('history-table-head');
            const table = document.getElementById('history-table');
            if (!thead) return;

            table?.classList.toggle('technical-history-table', activeHistoryMode === 'technical');

            if (activeHistoryMode === 'echometer' || activeHistoryMode === 'sensor' || activeHistoryMode === 'vsd' || activeHistoryMode === 'soportes') {
                thead.innerHTML = `
                    <tr>
                        <th>Fecha de Carga</th>
                        <th>Categoría</th>
                        <th>Nombre del Archivo</th>
                        <th>Usuario / Técnico</th>
                        <th style="text-align: center;">Tamaño</th>
                        <th style="text-align: right;">Acción</th>
                    </tr>
                `;
                return;
            }

            if (activeHistoryMode === 'level') {
                thead.innerHTML = `
                    <tr>
                        <th>Fecha Prueba</th>
                        <th>Nivel Dinámico</th>
                        <th>Sumergencia</th>
                        <th>Presión PIP Echometer</th>
                        <th>Soporte</th>
                        ${currentAccessProfile.canEditData ? '<th style="text-align: right;">Acciones</th>' : '<th style="text-align: right;"></th>'}
                    </tr>
                `;
                return;
            }

            if (activeHistoryMode === 'technical') {
                const activeScope = getActiveOperationalScope();
                const isCrc = activeScope === 'crc_ll';
                if (isCrc) {
                    thead.innerHTML = `
                        <tr>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                                            <path d="M16 2v4M8 2v4M3 10h18"></path>
                                        </svg>
                                    </span>
                                    <span>Fecha Medición</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon barrel">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <ellipse cx="12" cy="5" rx="6" ry="2.5"></ellipse>
                                            <path d="M6 5v14c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V5"></path>
                                            <path d="M6 12c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"></path>
                                        </svg>
                                    </span>
                                    <span>Barril Bruto</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon water">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 3C9 7 6 10.2 6 14a6 6 0 0012 0c0-3.8-3-7-6-11z"></path>
                                        </svg>
                                    </span>
                                    <span>% Agua</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon net">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M4 15l4-4 4 4 8-8"></path>
                                            <path d="M14 7h6v6"></path>
                                        </svg>
                                    </span>
                                    <span>Barriles Netos</span>
                                </span>
                            </th>
                        </tr>
                    `;
                } else {
                    thead.innerHTML = `
                        <tr>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                                            <path d="M16 2v4M8 2v4M3 10h18"></path>
                                        </svg>
                                    </span>
                                    <span>Fecha Medición</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon barrel">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 3v18"></path>
                                            <path d="M7 8h7a3 3 0 010 6H7"></path>
                                        </svg>
                                    </span>
                                    <span>Potencial</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon barrel">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <ellipse cx="12" cy="5" rx="6" ry="2.5"></ellipse>
                                            <path d="M6 5v14c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V5"></path>
                                            <path d="M6 12c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"></path>
                                        </svg>
                                    </span>
                                    <span>Barril Bruto</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon water">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 3C9 7 6 10.2 6 14a6 6 0 0012 0c0-3.8-3-7-6-11z"></path>
                                        </svg>
                                    </span>
                                    <span>% Agua</span>
                                </span>
                            </th>
                            <th>
                                <span class="technical-history-head">
                                    <span class="technical-history-head-icon net">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M4 15l4-4 4 4 8-8"></path>
                                            <path d="M14 7h6v6"></path>
                                        </svg>
                                    </span>
                                    <span>Barriles Netos</span>
                                </span>
                            </th>
                        </tr>
                    `;
                }
                return;
            }
            // Carga el catalogo de pozos una sola vez y prepara el selector principal.

            const activeScope = getActiveOperationalScope();
            if (activeScope === 'crc_ll') {
                const isBcp = getWellLiftMethod(activePozo) === 'BCP';
                if (isBcp) {
                    thead.innerHTML = `
                        <tr>
                            <th>Fecha/Hora</th>
                            <th>RPM</th>
                            <th>Torque</th>
                            <th>Amperaje</th>
                            <th>THP</th>
                            <th>CHP</th>
                            <th>Actividad</th>
                            ${currentAccessProfile.canEditData ? '<th style="text-align: right;">Acciones</th>' : '<th style="text-align: right;"></th>'}
                        </tr>
                    `;
                } else {
                    thead.innerHTML = `
                        <tr>
                            <th>Fecha/Hora</th>
                            <th>SPM</th>
                            <th>Tiro</th>
                            <th>Recorrido</th>
                            <th>THP</th>
                            <th>CHP</th>
                            <th>Actividad</th>
                            ${currentAccessProfile.canEditData ? '<th style="text-align: right;">Acciones</th>' : '<th style="text-align: right;"></th>'}
                        </tr>
                    `;
                }
                return;
            }

            thead.innerHTML = `
                <tr>
                    <th>Fecha/Hora</th>
                    <th>Frecuencia</th>
                    <th>Giro</th>
                    <th>Corriente M.</th>
                    <th>PIP / TM</th>
                    <th>Presiones (THP/CHP/LF)</th>
                    <th>VSD A/B/C</th>
                    <th>Estatus</th>
                    ${currentAccessProfile.canEditData ? '<th style="text-align: right;">Acciones</th>' : '<th style="text-align: right;"></th>'}
                </tr>
            `;
        }

        export async function initData() {
            const session = await getSession();
            if (!session) { window.location.href = 'index.html'; return; }
            currentAccessProfile = getAccessProfile(session);
            if (currentAccessProfile.isFieldOperator) {
                window.location.href = 'jornada-history.html';
                return;
            }
            const operationalScopeContext = await initOperationalScopeContext(session, currentAccessProfile);
            renderOperationalScopeSwitcher(document.getElementById('data-operational-scope-switcher'), operationalScopeContext, {
                onChange: () => window.location.reload()
            });
            setActiveScopePozoNames(await getActiveOperationalScopeWellNames().catch(error => {
                console.warn('No se pudieron cargar pozos del contrato activo en Data:', error);
                return [];
            }));

            applyDataAccessProfile();
            renderHistoryHead();

            // Adaptar pestañas del historial según el contrato (CCRC LL)
            const isCrc = getActiveOperationalScope() === 'crc_ll';
            const btnSensor = document.getElementById('btn-sensor-history');
            const btnVsd = document.getElementById('btn-vsd-history');
            if (isCrc) {
                if (btnSensor) btnSensor.style.display = 'none';
                if (btnVsd) btnVsd.style.display = 'none';
                if (activeHistoryMode === 'sensor' || activeHistoryMode === 'vsd') {
                    activeHistoryMode = 'operational';
                }
            } else {
                if (btnSensor) btnSensor.style.display = 'inline-flex';
                if (btnVsd) btnVsd.style.display = 'inline-flex';
            }

            document.getElementById('logout-btn').addEventListener('click', logout);
            document.getElementById('mobile-logout-btn').addEventListener('click', logout);
            document.getElementById('btn-operational-history').addEventListener('click', () => setHistoryMode('operational'));
            document.getElementById('btn-technical-history').addEventListener('click', () => setHistoryMode('technical'));
            document.getElementById('btn-level-history')?.addEventListener('click', () => setHistoryMode('level'));
            document.getElementById('btn-echometer-history').addEventListener('click', () => setHistoryMode('echometer'));
            document.getElementById('btn-sensor-history').addEventListener('click', () => setHistoryMode('sensor'));
            document.getElementById('btn-vsd-history').addEventListener('click', () => setHistoryMode('vsd'));
            document.getElementById('btn-soportes-history').addEventListener('click', () => setHistoryMode('soportes'));
            document.getElementById('data-view-mode').addEventListener('change', (event) => setDataViewMode(event.target.value));
            document.getElementById('ticket-date').addEventListener('change', loadDailyTicketData);
            document.getElementById('ticket-shift').addEventListener('change', loadDailyTicketData);
            document.getElementById('btn-generate-daily-ticket').addEventListener('click', loadDailyTicketData);

            setupDataPageEventListeners();
            await initPozos();
        }

        let activeScopeWellCatalog = [];

        async function initPozos() {
            try {
                const activeScope = getActiveOperationalScope();
                const ticketShiftSelect = document.getElementById('ticket-shift');
                if (ticketShiftSelect) {
                    if (activeScope === 'crc_ll') {
                        ticketShiftSelect.innerHTML = '<option value="day" selected>Jornada Completa</option>';
                    } else {
                        ticketShiftSelect.innerHTML = '<option value="day">Jornada Diurna</option><option value="night">Jornada Nocturna</option>';
                    }
                }

                const { data: wellsData } = await supabase
                    .from('field_well_catalog')
                    .select('pozo_name, lift_method, campo_name')
                    .eq('operational_scope', activeScope);
                activeScopeWellCatalog = wellsData || [];

                // Optimización crítica de rendimiento: en lugar de descargar y procesar las más de 12,000 filas de
                // la tabla monitoreo_pozos mediante getPozosHistorySummary, consultamos de forma súper rápida e
                // indexada el último registro de estado de cada uno de los pozos pertenecientes al catálogo activo.
                const pozoNames = activeScopeWellCatalog.map(w => w.pozo_name).filter(Boolean);
                
                const normalizeEstatus = (val) => {
                    const norm = String(val || '').trim().toUpperCase();
                    if (['RUN', 'OPERANDO', 'ARRANCADO', 'ENCENDIDO', 'MARCHA'].includes(norm)) return 'RUN';
                    if (['OFF', 'PARADO', 'DETENIDO', 'APAGADO', 'DETENCION'].includes(norm)) return 'OFF';
                    return norm || null;
                };

                const promises = pozoNames.map(async (pozoName) => {
                    const { data, error } = await supabase
                        .from('monitoreo_pozos')
                        .select('pozo_name, fecha, hora, estatus')
                        .eq('pozo_name', pozoName)
                        .order('fecha', { ascending: false })
                        .order('hora', { ascending: false })
                        .limit(1);
                    
                    if (error) {
                        console.warn(`No se pudo obtener último registro para pozo ${pozoName} en Data:`, error);
                    }
                    
                    const latest = data?.[0];
                    return {
                        pozo_name: pozoName,
                        latest_fecha: latest?.fecha || null,
                        latest_hora: latest?.hora || null,
                        latest_estatus: latest?.estatus ? normalizeEstatus(latest.estatus) : null,
                        has_records: !!latest
                    };
                });
                
                pozoSummaries = await Promise.all(promises);
                renderPozoOptions();

                const input = document.getElementById('pozo-selector-input');
                if (input) {
                    input.placeholder = "Busca o selecciona un pozo";
                }

                if (!pozoSummaries || pozoSummaries.length === 0) {
                    document.getElementById('pozo-selector-menu').innerHTML = '<div class="pozo-selector-empty">No hay pozos registrados para el contrato activo.</div>';
                    return;
                }
            } catch (err) {
                console.error("Error loading pozos:", err);
                Swal.fire({ icon: 'error', title: 'Error de Lectura', text: 'No se pudieron cargar los pozos.' });
                const input = document.getElementById('pozo-selector-input');
                if (input) {
                    input.placeholder = "Error al cargar pozos";
                }
            }
        }

        function isPozoRecent(latestFecha, days) {
            if (!latestFecha) return false;
            const cutoff = new Date();
            cutoff.setHours(0, 0, 0, 0);
            cutoff.setDate(cutoff.getDate() - Number(days));
            return new Date(`${latestFecha}T00:00:00`) >= cutoff;
        }

        function getFilteredPozoSummaries(ignoreSearch = false) {
            const searchTerm = ignoreSearch ? '' : document.getElementById('pozo-selector-input').value.trim().toLowerCase();
            const activityFilter = document.getElementById('pozo-activity-filter').value;

            return pozoSummaries.filter(item => {
                const matchesSearch = !searchTerm || item.pozo_name.toLowerCase().includes(searchTerm);
                if (!matchesSearch) return false;

                if (activityFilter === 'ALL') return true;
                if (activityFilter === 'WITH_HISTORY') return item.has_records;
                return isPozoRecent(item.latest_fecha, activityFilter);
            });
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Renderiza el menu personalizado del selector de pozos con estado y actividad reciente.
        function renderPozoOptions(ignoreSearch = false) {
            const menu = document.getElementById('pozo-selector-menu');
            const filteredPozos = getFilteredPozoSummaries(ignoreSearch);

            if (filteredPozos.length === 0) {
                menu.innerHTML = '<div class="pozo-selector-empty">No hay pozos para ese filtro.</div>';
                return;
            }

            menu.innerHTML = filteredPozos.map(item => {
                let dotClass = 'inactive';
                let stateClass = 'inactive';
                let stateText = item.has_records ? 'Con registros' : 'Sin registros';

                if (item.latest_estatus === 'RUN') {
                    dotClass = 'active';
                    stateClass = 'active-run';
                    stateText = 'RUN';
                } else if (item.latest_estatus === 'OFF') {
                    dotClass = 'inactive-off';
                    stateClass = 'inactive-off';
                    stateText = 'OFF';
                } else if (item.has_records) {
                    dotClass = 'active';
                    stateClass = 'active';
                    stateText = 'Con registros';
                }

                return `
                    <button type="button" class="pozo-selector-option ${item.pozo_name === activePozo ? 'active' : ''}" data-pozo="${escapeHtml(item.pozo_name)}">
                        <span class="pozo-status-dot ${dotClass}"></span>
                        <span class="pozo-option-name">${escapeHtml(item.pozo_name)}</span>
                        <span class="pozo-option-state ${stateClass}">${stateText}</span>
                    </button>
                `;
            }).join('');

            menu.querySelectorAll('.pozo-selector-option').forEach(button => {
                button.addEventListener('click', () => selectPozo(button.dataset.pozo));
            });
        }

        function openPozoMenu(ignoreSearch = false) {
            document.getElementById('pozo-selector-menu').classList.add('active');
            renderPozoOptions(ignoreSearch);
        }

        function setupDataPageEventListeners() {
            if (pozoOutsideClickListener) {
                document.removeEventListener('click', pozoOutsideClickListener);
            }
            pozoOutsideClickListener = (event) => {
                const wrapper = document.querySelector('.pozo-selector-input-wrap');
                if (wrapper && !wrapper.contains(event.target)) {
                    const menu = document.getElementById('pozo-selector-menu');
                    if (menu) {
                        menu.classList.remove('active');
                    }
                    const input = document.getElementById('pozo-selector-input');
                    if (activePozo && input && !input.value.trim()) {
                        input.value = activePozo;
                    }
                }
            };
            document.addEventListener('click', pozoOutsideClickListener);

            const filterDateEl = document.getElementById('filter-date');
            if (filterDateEl) {
                filterDateEl.addEventListener('change', (e) => {
                    const specDateInput = document.getElementById('input-specific-date');
                    if (e.target.value === 'SPECIFIC') {
                        specDateInput.style.display = 'inline-block';
                    } else {
                        specDateInput.style.display = 'none';
                        specDateInput.value = '';
                        loadPozoData();
                    }
                });
            }

            const inputSpecDateEl = document.getElementById('input-specific-date');
            if (inputSpecDateEl) {
                inputSpecDateEl.addEventListener('change', () => loadPozoData());
            }

            const pozoSelectorInputEl = document.getElementById('pozo-selector-input');
            if (pozoSelectorInputEl) {
                pozoSelectorInputEl.addEventListener('focus', () => {
                    const input = document.getElementById('pozo-selector-input');
                    if (activePozo && input.value.trim() === activePozo) {
                        input.select();
                    }
                    openPozoMenu(activePozo && input.value.trim() === activePozo);
                });
                pozoSelectorInputEl.addEventListener('input', () => {
                    openPozoMenu(false);
                });
                pozoSelectorInputEl.addEventListener('click', () => {
                    const menu = document.getElementById('pozo-selector-menu');
                    if (menu && !menu.classList.contains('active')) {
                        openPozoMenu(true);
                    }
                });
            }

            const pozoSelectorToggleEl = document.getElementById('pozo-selector-toggle');
            if (pozoSelectorToggleEl) {
                pozoSelectorToggleEl.addEventListener('click', () => {
                    const menu = document.getElementById('pozo-selector-menu');
                    const shouldOpen = !menu.classList.contains('active');
                    if (shouldOpen) {
                        openPozoMenu(true);
                    } else {
                        menu.classList.remove('active');
                    }
                });
            }

            const pozoActivityFilterEl = document.getElementById('pozo-activity-filter');
            if (pozoActivityFilterEl) {
                pozoActivityFilterEl.addEventListener('change', renderPozoOptions);
            }

            const mainViewToggleEl = document.getElementById('main-view-toggle');
            if (mainViewToggleEl) {
                mainViewToggleEl.addEventListener('click', async () => {
                    const ticketDate = document.getElementById('ticket-date')?.value;
                    if (activeDataView === 'daily-ticket' && !ticketDate) {
                        Swal.fire({ icon: 'info', title: 'Fecha requerida', text: 'Selecciona una fecha antes de exportar el ticket diario.' });
                        return;
                    }

                    if (activeDataView === 'daily-ticket' && currentTicketGroups.length === 0) {
                        Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay monitoreos para exportar en la fecha seleccionada.' });
                        return;
                    }

                    if (activeDataView === 'history' && !activePozo) {
                        Swal.fire({ icon: 'info', title: 'Selecciona un pozo', text: 'Primero selecciona un pozo o cambia al modo ticket diario.' });
                        return;
                    }

                    // --- EXPORTACIÓN TICKET DIARIO A PDF COMPILADO ---
                    if (activeDataView === 'daily-ticket') {
                        // Open the window synchronously on user click to prevent popup blockers
                        const pdfWindow = window.open('', '_blank', 'width=1180,height=820');
                        if (!pdfWindow) {
                            Swal.fire({
                                icon: 'warning',
                                title: 'Ventana emergente bloqueada',
                                text: 'El navegador bloqueó la ventana del PDF. Por favor, permite los popups y ventanas emergentes para este sitio en tu barra de direcciones.'
                            });
                            return;
                        }

                        // Write initial loading state in the popup
                        pdfWindow.document.open();
                        pdfWindow.document.write('<html><head><title>Generando Reporte...</title><style>body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; } .loader-card { padding: 40px; border-radius: 24px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; } .spinner { width: 50px; height: 50px; border: 5px solid #cbd5e1; border-top-color: #0f766e; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; } @keyframes spin { to { transform: rotate(360deg); } }</style></head><body><div class="loader-card"><div class="spinner"></div><h2 style="margin:0 0 8px; color:#0f172a; font-weight:800;">Generando reporte...</h2><p style="margin:0; color:#64748b; font-size:14px; font-weight:500;">Consolidando datos e imágenes de Supabase.</p></div></body></html>');
                        pdfWindow.document.close();

                        Swal.fire({
                            title: 'Preparando reporte consolidado...',
                            text: 'Procesando datos y adjuntos fotográficos de la jornada.',
                            allowOutsideClick: false,
                            didOpen: () => { Swal.showLoading(); }
                        });

                        try {
                            const ticketDateStr = String(ticketDate || '').trim();
                            const ticketShiftLabel = getTicketShiftLabel();
                            const shiftKey = ticketShiftLabel.toLowerCase().includes('diurna') ? 'Diurna' : 'Nocturna';

                            // 1. Obtener la locación activa del switcher de la UI
                            const activeContractName = document.getElementById('data-operational-scope-switcher')?.textContent?.trim() || 'Consolidado General';

                            // 2. Construir la jornada virtual para la consolidación
                             const virtualJourney = {
                                 id: 'virtual_' + ticketDateStr + '_' + shiftKey,
                                 locacion_jornada: activeContractName,
                                 journey_date: ticketDateStr,
                                 jornada: shiftKey,
                                 equipo_guardia: 'Telemetría / Consolidado',
                                 first_report_time: currentRecordData[0]?.hora || '',
                                 last_report_time: currentRecordData[currentRecordData.length - 1]?.hora || ''
                             };

                            // 3. Mapear los registros operativos de la pantalla al formato que consume el PDF
                            const virtualRecords = currentRecordData.map(r => {
                                const pozoName = r.pozo_name || r.pozo || '';
                                const payload = {
                                    pozo: pozoName,
                                    fecha: r.fecha || ticketDateStr,
                                    hora: r.hora || '',
                                    estatus: r.estatus || 'Sin estatus',
                                    frecuencia: r.frecuencia || '',
                                    i_motor: r.corriente_motor || '',
                                    v_motor: r.voltaje_motor || r.v_motor || '',
                                    out_vsd: r.voltaje_salida_vsd || r.out_vsd || '',
                                    pip_psi: r.pip || '',
                                    tm_f: r.tm || '',
                                    thp_psi: r.presion_thp || '',
                                    chp_psi: r.presion_chp || '',
                                    lf_psi: r.presion_lf || r.lf || '',
                                    i_vsd_a: r.vsd_a || '',
                                    i_vsd_b: r.vsd_b || '',
                                    i_vsd_c: r.vsd_c || '',
                                    sentido_giro: r.sentido_giro || r.giro || ''
                                };
                                return {
                                    id: r.id || r.ID || '',
                                    journey_id: virtualJourney.id,
                                    pozo: pozoName,
                                    report_date: r.fecha || ticketDateStr,
                                    report_time: r.hora || '',
                                    raw_payload: payload
                                };
                            });

                            // 4. Generar y abrir el PDF limpio
                            await openFieldJourneyPdf(virtualJourney, virtualRecords, [], pdfWindow);
                            Swal.close();
                        } catch (err) {
                            if (pdfWindow) pdfWindow.close();
                            console.error('[pdf-data-export] Error:', err);
                            Swal.fire({
                                icon: 'error',
                                title: 'Error al generar reporte',
                                text: 'No se pudo generar el reporte PDF: ' + (err.message || err)
                            });
                        }
                        return;
                    }

                    const isStandard = !document.body.classList.contains('view-mode-report');
                    if (isStandard) {
                        if (activeDataView === 'history') {
                            Swal.fire({
                                title: 'Preparando reporte detallado...',
                                text: 'Descargando parámetros extendidos para cada registro.',
                                allowOutsideClick: false,
                                didOpen: () => { Swal.showLoading(); }
                            });

                            try {
                                const printContainer = document.getElementById('print-detailed-cards-container');
                                printContainer.innerHTML = '';
                                
                                const excludeKeys = ['id', 'ID', 'created_at', 'updated_at', 'deleted_at', 'user_id', 'is_historical', 'synced_at', 'pozo_id', 'row_data', 'raw_payload'];
                                const formatVal = (v) => (v !== null && v !== undefined && v !== '') ? v : '--';

                                const [ {data: fieldData}, {data: excelData} ] = await Promise.all([
                                    supabase.from('field_journey_records').select('report_date, report_time, raw_payload').eq('pozo', activePozo),
                                    supabase.from('consolidated_dashboard_operational').select('report_date, report_time, row_data').eq('pozo', activePozo)
                                ]);

                                let cardsHtml = '<div style="display: flex; flex-direction: column; gap: 40px;">';

                                currentRecordData.forEach(record => {
                                    let extraData = {};
                                    
                                    if (fieldData) {
                                        const fMatch = fieldData.find(f => f.report_date === record.fecha && f.report_time === record.hora);
                                        if (fMatch) extraData = { ...fMatch.raw_payload };
                                    }
                                    if (Object.keys(extraData).length === 0 && excelData) {
                                        const eMatch = excelData.find(e => e.report_date === record.fecha && e.report_time === record.hora) 
                                                    || excelData.find(e => e.report_date === record.fecha);
                                        if (eMatch) extraData = { ...eMatch.row_data };
                                    }

                                    const mergedData = { ...extraData, ...record };
                                    
                                    cardsHtml += `
                                        <div class="print-detailed-card" style="page-break-inside: avoid; border: 1px solid #E2E8F0; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                                            <h3 style="margin-top: 0; color: #1E293B; border-bottom: 2px solid #3B82F6; padding-bottom: 10px; margin-bottom: 15px;">
                                                Registro: ${formatVal(record.fecha)} ${formatVal(record.hora)}
                                            </h3>
                                            <div class="print-detailed-card-grid">
                                    `;

                                    for (const [key, value] of Object.entries(mergedData)) {
                                        if (excludeKeys.includes(key)) continue;
                                        if (value === null || value === '' || value === undefined) continue;
                                        
                                        let cleanKey = key.replace(/_/g, ' ').toUpperCase();
                                        cardsHtml += `
                                            <div style="background: #F8FAFC; padding: 8px; border-radius: 6px; border: 1px solid #F1F5F9;">
                                                <span style="display:block; font-size: 0.65rem; font-weight: 800; color: #64748B; margin-bottom: 2px;">${cleanKey}</span>
                                                <strong style="color: #0F172A; font-size: 0.85rem; word-break: break-word;">${value}</strong>
                                            </div>
                                        `;
                                    }

                                    cardsHtml += `</div></div>`;
                                });
                                
                                cardsHtml += '</div>';
                                printContainer.innerHTML = cardsHtml;
                                Swal.close();
                            } catch (error) {
                                console.error('Error preparando reporte detallado:', error);
                                Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un error armando el reporte detallado. Se imprimirá el resumen estándar.' });
                            }
                        }

                        updateReportExportHeader();
                        document.body.classList.add('view-mode-report');
                        if (activeDataView === 'history') document.body.classList.add('view-mode-report-history');

                        document.getElementById('main-view-toggle').querySelector('span').textContent = 'VOLVER A DATA';

                        setTimeout(printDataReport, 500);
                    } else {
                        document.body.classList.remove('view-mode-report');
                        document.body.classList.remove('view-mode-report-history');
                        document.getElementById('main-view-toggle').querySelector('span').textContent = 'EXPORTAR REPORTE';
                        document.getElementById('print-detailed-cards-container').innerHTML = '';
                    }
                });
            }
        }

        async function selectPozo(pozo) {
            if (activeDataView !== 'history') return;
            if (!isPozoAllowedByActiveScope(pozo)) {
                Swal.fire({ icon: 'warning', title: 'Pozo fuera del contrato', text: 'Ese pozo no pertenece al contrato activo.' });
                return;
            }
            activePozo = pozo;
            document.getElementById('pozo-selector-input').value = pozo;
            document.getElementById('pozo-selector-menu').classList.remove('active');

            // Cambia la interfaz del estado vacio a la vista de historial activo.
            document.getElementById('empty-state').style.display = 'none';
            document.getElementById('history-container').style.display = 'block';
            document.getElementById('tools-section').style.display = 'flex';
            renderPozoOptions();

            document.getElementById('table-title').textContent = activeHistoryMode === 'technical'
                ? `Historial de Medición Técnica: ${pozo}`
                : `Historial Operativo: ${pozo}`;
            document.getElementById('history-body').innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px;">Cargando datos...</td></tr>';

            await updateSelectedPozoProfile(pozo);

            await loadPozoData();
        }

        // Resuelve filtros, consulta Supabase y refresca la tabla activa del pozo.
        async function loadPozoData() {
            if (!activePozo) return;

            const loader = document.getElementById('history-premium-loader');
            const table = document.getElementById('history-table');
            const tbody = document.getElementById('history-body');
            
            if (tbody) tbody.innerHTML = ''; // Limpiar filas previas inmediatamente

            loader?.classList.add('active');
            table?.classList.add('loading-fade');

            const minTimePromise = new Promise(resolve => setTimeout(resolve, 600));

            if (activeHistoryMode === 'echometer' || activeHistoryMode === 'sensor' || activeHistoryMode === 'vsd' || activeHistoryMode === 'soportes') {
                document.getElementById('table-title').textContent = activeHistoryMode === 'echometer'
                    ? `Archivos Echometer: ${activePozo}`
                    : activeHistoryMode === 'sensor'
                    ? `Data Sensor de Fondo: ${activePozo}`
                    : activeHistoryMode === 'vsd'
                    ? `Descarga de Data VSD: ${activePozo}`
                    : `Soportes Fotográficos de Campo: ${activePozo}`;
                
                try {
                    await Promise.all([
                        loadPozoDocumentFiles(activePozo, activeHistoryMode),
                        minTimePromise
                    ]);
                } finally {
                    loader?.classList.remove('active');
                    table?.classList.remove('loading-fade');
                }
                return;
            }

            try {
                // Traduce el filtro visible en rangos de fecha para la consulta.
                const filterVal = document.getElementById('filter-date').value;
                const specificDate = document.getElementById('input-specific-date').value;

                let startStr = null;
                let endStr = null;

                if (filterVal === 'SPECIFIC' && specificDate) {
                    startStr = specificDate;
                    endStr = specificDate;
                } else if (filterVal !== 'ALL' && filterVal !== 'SPECIFIC') {
                    const d = new Date();
                    d.setDate(d.getDate() - parseInt(filterVal));
                    startStr = d.toISOString().split('T')[0];
                }

                let fetchPromise;
                if (activeHistoryMode === 'technical') {
                    fetchPromise = getTechnicalHistory(activePozo, startStr, endStr);
                } else if (activeHistoryMode === 'level') {
                    fetchPromise = (async () => {
                        const rawTests = await getWellLevelTests(activePozo);
                        return (rawTests || []).filter(t => {
                            if (startStr && t.fecha < startStr) return false;
                            if (endStr && t.fecha > endStr) return false;
                            return true;
                        });
                    })();
                } else {
                    fetchPromise = getMonitoringData([activePozo], startStr, endStr);
                }

                const [data] = await Promise.all([fetchPromise, minTimePromise]);

                const activeScope = getActiveOperationalScope();
                if (activeScope === 'crc_ll' && activeHistoryMode === 'operational' && data && data.length > 0) {
                    try {
                        const pozoName = activePozo;
                        const [ { data: fieldData }, { data: excelData } ] = await Promise.all([
                            supabase
                                .from('field_journey_records')
                                .select('report_date, report_time, raw_payload')
                                .eq('pozo', pozoName),
                            supabase
                                .from('consolidated_dashboard_operational')
                                .select('report_date, report_time, row_data')
                                .eq('pozo', pozoName)
                        ]);

                        data.forEach(rec => {
                            let extraData = {};
                            const cleanTime = String(rec.hora || '').substring(0, 5);

                            if (fieldData && fieldData.length > 0) {
                                const match = fieldData.find(f => f.report_date === rec.fecha && String(f.report_time || '').substring(0, 5) === cleanTime) || fieldData[0];
                                if (match && match.raw_payload) extraData = match.raw_payload;
                            }
                            if (Object.keys(extraData).length === 0 && excelData && excelData.length > 0) {
                                const match = excelData.find(r => r.report_date === rec.fecha && String(r.report_time || '').substring(0, 5) === cleanTime) || excelData[0];
                                if (match && match.row_data) extraData = match.row_data;
                            }

                            if (extraData && typeof extraData === 'object') {
                                rec.raw_payload = { ...(typeof rec.raw_payload === 'object' ? rec.raw_payload : {}), ...extraData };
                                for (const [k, v] of Object.entries(extraData)) {
                                    if (v !== undefined && v !== null && v !== '' && (rec[k] === undefined || rec[k] === null || rec[k] === '')) {
                                        rec[k] = v;
                                    }
                                }
                            }
                        });
                    } catch (e) {
                        console.warn('Field/Consolidated records enrichment warning:', e);
                    }
                }

                currentRecordData = data;
                renderHistoryHead();

                document.getElementById('record-count').textContent = `${data.length} Registros`;
                document.getElementById('table-title').textContent = activeHistoryMode === 'technical'
                    ? `Historial de Medición Técnica: ${activePozo}`
                    : (activeHistoryMode === 'level'
                        ? `Historial de Pruebas de Nivel (Echometer): ${activePozo}`
                        : `Historial Operativo: ${activePozo}`);
                renderTable();
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Error BD', text: err.message });
            } finally {
                loader?.classList.remove('active');
                table?.classList.remove('loading-fade');
            }
        }

        async function loadPozoDocumentFiles(pozoName, mode) {
            const tbody = document.getElementById('history-body');
            const countLabel = document.getElementById('record-count');
            if (!tbody) return;
            const modeText = mode === 'echometer' ? 'Echometer' : mode === 'sensor' ? 'Sensor de Fondo' : mode === 'vsd' ? 'Data VSD' : 'Soportes de Campo';
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 40px;">Cargando archivos de ${modeText}...</td></tr>`;

            try {
                const { getWellDocuments, getDocumentDownloadUrl } = await import('../services/well-documents-service.js');
                const categoryFilter = mode === 'echometer' 
                    ? 'REGISTROS_ECHOMETER' 
                    : mode === 'sensor' 
                    ? 'DATA_SENSOR_FONDO' 
                    : mode === 'vsd'
                    ? 'VOLCADOS_VSD'
                    : 'SOPORTES';
                let docs = await getWellDocuments({ pozoName, category: categoryFilter });

                if (mode === 'echometer') {
                    // Filtrar para mostrar ÚNICAMENTE archivos de medición Echómetro (.028, .twm, .029, etc.) y no soportes PDF/imágenes
                    docs = (docs || []).filter(doc => {
                        const name = doc.nombre_archivo || doc.file_name || '';
                        const ext = name.split('.').pop()?.toLowerCase() || '';
                        return !['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext);
                    });
                }

                if (countLabel) {
                    countLabel.textContent = `${docs?.length || 0} Archivo(s)`;
                }

                if (!docs || docs.length === 0) {
                    const emptyText = mode === 'echometer' ? 'Echometer' : mode === 'sensor' ? 'Sensor de Fondo' : mode === 'vsd' ? 'Descarga VSD' : 'Soportes de Campo';
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #9CA3AF; padding: 40px;">No hay archivos de ${emptyText} registrados para el pozo ${escapeHtml(pozoName)}</td></tr>`;
                    return;
                }

                tbody.innerHTML = '';
                for (const doc of docs) {
                    const tr = document.createElement('tr');
                    const createdDate = doc.created_at ? new Date(doc.created_at).toLocaleString('es-VE') : '--';
                    const fileName = doc.nombre_archivo || doc.file_name || 'Archivo_Adjunto';
                    
                    const badgeBg = mode === 'echometer' 
                        ? 'rgba(37, 99, 235, 0.12)' 
                        : mode === 'sensor' 
                        ? 'rgba(13, 148, 136, 0.12)' 
                        : mode === 'vsd'
                        ? 'rgba(217, 119, 6, 0.12)'
                        : 'rgba(71, 85, 105, 0.12)';
                    const badgeColor = mode === 'echometer' 
                        ? '#2563eb' 
                        : mode === 'sensor' 
                        ? '#0d9488' 
                        : mode === 'vsd'
                        ? '#d97706'
                        : '#475569';
                    const badgeLabel = mode === 'echometer' 
                        ? '📈 Echometer' 
                        : mode === 'sensor' 
                        ? '📊 Data Sensor' 
                        : mode === 'vsd'
                        ? '⚡ Data VSD'
                        : '📸 Soporte Foto';

                    const desc = String(doc.descripcion || '').trim();
                    let userComment = desc;
                    userComment = userComment.replace(/^\[JORNADA_ID:[^\]]+\]\s*/i, '');
                    if (userComment === 'Soporte de campo' || userComment === 'Archivo de campo' || userComment.includes('Adjunto enviado desde captura')) {
                        userComment = '';
                    }
                    const commentHtml = userComment 
                        ? `<div style="margin-top: 4px; font-size: 0.78rem; color: #475569; font-style: italic;">💬 ${escapeHtml(userComment)}</div>` 
                        : '';

                    const userEmail = doc.uploaded_by_email || doc.usuario || 'Técnico de Campo';
                    const sizeMb = doc.tamaño_bytes ? `${(doc.tamaño_bytes / (1024 * 1024)).toFixed(2)} MB` : '--';

                    tr.innerHTML = `
                        <td style="padding: 12px 16px;"><strong>${escapeHtml(createdDate)}</strong></td>
                        <td style="padding: 12px 16px;"><span style="display:inline-block; padding:4px 12px; border-radius:12px; font-weight:800; font-size:0.78rem; background:${badgeBg}; color:${badgeColor};">${escapeHtml(badgeLabel)}</span></td>
                        <td style="padding: 12px 16px;">
                            <strong style="color:#0f172a; font-size:0.92rem;">${escapeHtml(fileName)}</strong>
                            ${commentHtml}
                        </td>
                        <td style="padding: 12px 16px;"><span style="font-size:0.85rem; color:#475569;">${escapeHtml(userEmail)}</span></td>
                        <td style="text-align:center; padding: 12px 16px;"><small style="color:#64748b; font-weight:700;">${escapeHtml(sizeMb)}</small></td>
                        <td style="text-align:right; padding: 12px 16px;">
                            <div style="display:inline-flex; gap:6px; justify-content:flex-end;">
                                <button type="button" class="btn-preview-doc-inline" data-file-path="${escapeHtml(doc.file_path || doc.ruta_storage || '')}" data-file-name="${escapeHtml(fileName)}" style="padding:7px 12px; border-radius:8px; background:#2563eb; color:#fff; font-weight:800; font-size:0.8rem; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition: background 0.2s;">
                                    👁️ Ver
                                </button>
                                <button type="button" class="btn-download-doc-inline" data-file-path="${escapeHtml(doc.file_path || doc.ruta_storage || '')}" style="padding:7px 12px; border-radius:8px; background:#10b981; color:#fff; font-weight:800; font-size:0.8rem; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition: background 0.2s;">
                                    ⬇️ Descargar
                                </button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }

                // Handlers para botones de Previsualización (Ver en pestaña nativa sin forzar descarga)
                tbody.querySelectorAll('.btn-preview-doc-inline').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const path = e.currentTarget.dataset.filePath;
                        if (!path) return;
                        try {
                            btn.disabled = true;
                            btn.innerHTML = 'Cargando...';
                            const { getDocumentInlineUrl } = await import('../services/well-documents-service.js');
                            const url = await getDocumentInlineUrl(path);
                            if (url && url !== '#') {
                                window.open(url, '_blank', 'noopener,noreferrer');
                            }
                        } catch (err) {
                            console.error('Error al abrir archivo:', err);
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '👁️ Ver';
                        }
                    });
                });

                // Handlers para botones de Descarga Directa
                tbody.querySelectorAll('.btn-download-doc-inline').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const path = e.currentTarget.dataset.filePath;
                        if (!path) return;
                        try {
                            btn.disabled = true;
                            btn.innerHTML = 'Descargando...';
                            const { getDocumentDownloadUrl } = await import('../services/well-documents-service.js');
                            const url = await getDocumentDownloadUrl(path);
                            if (url && url !== '#') {
                                const a = document.createElement('a');
                                a.href = url;
                                a.target = '_blank';
                                a.download = '';
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                            }
                        } catch (err) {
                            console.error('Error al descargar archivo:', err);
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = '⬇️ Descargar';
                        }
                    });
                });
            } catch (err) {
                console.error('Error cargando documentos de pozo:', err);
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:30px;">Error al consultar archivos: ${escapeHtml(err.message || err)}</td></tr>`;
            }
        }

        function openTechnicalRecordDetail(record) {
            const formatNumberCell = (value, decimals = 2, suffix = '') => {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? `${numeric.toFixed(decimals)}${suffix}` : '--';
            };

            const formatTextCell = (value, fallback = 'No disponible') => {
                return escapeHtml(value === undefined || value === null || value === '' ? fallback : value);
            };

            const isCrc = getActiveOperationalScope() === 'crc_ll';
            const potencialCardHtml = isCrc ? '' : `
                            <div class="technical-detail-card emphasis gross">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon gross">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M4 18V8"></path>
                                            <path d="M10 18V4"></path>
                                            <path d="M16 18v-7"></path>
                                            <path d="M22 18H2"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">Potencial</span>
                                </div>
                                <strong>${formatNumberCell(record.potencial)}</strong>
                            </div>
            `;

            Swal.fire({
                title: `Medición Técnica · ${formatTextCell(record.pozo_name, activePozo || 'Pozo')}`,
                html: `
                    <div class="technical-detail-modal">
                        <div class="technical-detail-hero">
                            <div class="technical-detail-hero-main">
                                <div class="technical-detail-date">${formatTextCell(record.fecha)}</div>
                                <div class="technical-detail-subtitle">Resumen completo de la medición técnica seleccionada</div>
                            </div>
                            <span class="technical-detail-cat">CAT ${formatTextCell(record.cat_number, '--')}</span>
                        </div>

                        <div class="technical-detail-grid">
                            <div class="technical-detail-card">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon pozo">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"></path>
                                            <path d="M9 12h6"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">Pozo</span>
                                </div>
                                <strong>${formatTextCell(record.pozo_name, activePozo || '--')}</strong>
                            </div>
                            <div class="technical-detail-card">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon campo">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M3 20h18"></path>
                                            <path d="M6 20V9l6-4 6 4v11"></path>
                                            <path d="M9 20v-4h6v4"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">Campo</span>
                                </div>
                                <strong>${formatTextCell(record.campo_name)}</strong>
                            </div>
                            <div class="technical-detail-card">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon ef">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 2v20"></path>
                                            <path d="M7 6h10"></path>
                                            <path d="M7 12h8"></path>
                                            <path d="M7 18h10"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">EF</span>
                                </div>
                                <strong>${formatTextCell(record.ef)}</strong>
                            </div>
                            ${potencialCardHtml}
                            <div class="technical-detail-card emphasis gross">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon gross">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <ellipse cx="12" cy="5" rx="6" ry="2.5"></ellipse>
                                            <path d="M6 5v14c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V5"></path>
                                            <path d="M6 12c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">Barril Bruto</span>
                                </div>
                                <strong>${formatNumberCell(record.bbpd)}</strong>
                            </div>
                            <div class="technical-detail-card emphasis water">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon water">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M12 3C9 7 6 10.2 6 14a6 6 0 0012 0c0-3.8-3-7-6-11z"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">% Agua</span>
                                </div>
                                <strong>${formatNumberCell(record.ays_percentage, 2, '%')}</strong>
                            </div>
                            <div class="technical-detail-card emphasis net">
                                <div class="technical-detail-card-head">
                                    <span class="technical-detail-icon net">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                            <path d="M4 15l4-4 4 4 8-8"></path>
                                            <path d="M14 7h6v6"></path>
                                        </svg>
                                    </span>
                                    <span class="technical-detail-label">Barriles Netos</span>
                                </div>
                                <strong>${formatNumberCell(record.bnpd)}</strong>
                            </div>
                        </div>
                    </div>
                `,
                width: 760,
                confirmButtonText: 'Cerrar resumen',
                confirmButtonColor: '#1D4ED8',
                customClass: {
                    popup: 'technical-detail-popup'
                }
            });
        }

        function renderTable() {
            const tbody = document.getElementById('history-body');
            tbody.innerHTML = '';

            const formatNumberCell = (value, decimals = 1) => formatMonitoringNumberCell(value, decimals);

            const formatTextCell = (value, fallback = '--') => formatMonitoringTextCell(value, fallback);

            if (currentRecordData.length === 0) {
                const emptyColumns = activeHistoryMode === 'technical' ? 5 : (activeHistoryMode === 'level' ? 6 : 9);
                tbody.innerHTML = `<tr><td colspan="${emptyColumns}" style="text-align: center; color: #9CA3AF; padding: 40px;">No hay registros históricos</td></tr>`;
                return;
            }

            if (activeHistoryMode === 'level') {
                currentRecordData.forEach(record => {
                    const tr = document.createElement('tr');
                    tr.className = 'level-history-row';

                    let soporteHtml = '<span style="color:#9ca3af; font-size: 0.85rem;">--</span>';
                    if (record.file_path) {
                        soporteHtml = `
                            <button type="button" class="btn-view-soporte-level" data-file-path="${escapeHtml(record.file_path)}" style="padding:6px 12px; border-radius:8px; background:#2563eb; color:#fff; font-weight:700; font-size:0.8rem; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition: background 0.2s;">
                                👁️ Ver Soporte
                            </button>
                        `;
                    }

                    tr.innerHTML = `
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background: rgba(13, 148, 136, 0.1); color: #0d9488; padding: 6px; border-radius: 8px;">📅</span>
                                <b>${formatTextCell(record.fecha)}</b>
                            </div>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;">${formatNumberCell(record.nivel_dinamico, 0)} ft</div>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;">${formatNumberCell(record.sumergencia, 0)} ft</div>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;">${formatNumberCell(record.presion_pip, 0)} psi</div>
                        </td>
                        <td>
                            ${soporteHtml}
                        </td>
                        <td style="text-align: right;">
                            ${currentAccessProfile.canEditData ? `
                                <button type="button" class="btn-action-delete btn-delete-level" data-id="${record.id}" style="background:none; border:none; color:#EF4444; font-weight:700; cursor:pointer; padding:6px 10px;">🗑️ Eliminar</button>
                            ` : ''}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Handler para abrir soporte de prueba de nivel en pestaña nativa (entrega INLINE)
                tbody.querySelectorAll('.btn-view-soporte-level').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const path = e.currentTarget.dataset.filePath;
                        if (!path) return;
                        try {
                            btn.disabled = true;
                            const originalHtml = btn.innerHTML;
                            btn.innerHTML = 'Abriendo...';
                            const { getDocumentInlineUrl } = await import('../services/well-documents-service.js');
                            const url = await getDocumentInlineUrl(path);
                            if (url && url !== '#') {
                                window.open(url, '_blank', 'noopener,noreferrer');
                            } else {
                                if (window.Swal) Swal.fire({ icon: 'warning', title: 'Soporte', text: 'No se encontró el enlace del soporte.' });
                            }
                            btn.innerHTML = originalHtml;
                            btn.disabled = false;
                        } catch (err) {
                            console.error('Error al obtener URL del soporte:', err);
                            if (window.Swal) Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo abrir el soporte de nivel.' });
                            btn.disabled = false;
                        }
                    });
                });

                if (currentAccessProfile.canEditData) {
                    tbody.querySelectorAll('.btn-delete-level').forEach(btn => {
                        btn.onclick = async function(e) {
                            e.stopPropagation();
                            const id = this.getAttribute('data-id');
                            await handleDeleteLevelTest(id);
                        };
                    });
                }
                return;
            }

            if (activeHistoryMode === 'technical') {
                const activeScope = getActiveOperationalScope();
                const isCrc = activeScope === 'crc_ll';
                currentRecordData.forEach(record => {
                    const tr = document.createElement('tr');
                    tr.className = 'technical-history-row';
                    tr.tabIndex = 0;
                    tr.setAttribute('role', 'button');
                    tr.setAttribute('aria-label', `Ver detalle de medicion tecnica ${formatTextCell(record.fecha)}`);
                    
                    const potencialCell = isCrc ? '' : `
                        <td>
                            <div class="technical-history-metric">
                                <span class="technical-history-badge barrel">PT</span>
                                <div>
                                    <div class="technical-history-metric-value">${formatNumberCell(record.potencial, 2)}</div>
                                    <div class="technical-history-metric-label">Potencial</div>
                                </div>
                            </div>
                        </td>
                    `;

                    tr.innerHTML = `
                        <td>
                            <div class="technical-history-date-cell">
                                <span class="technical-history-date-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                        <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                                        <path d="M16 2v4M8 2v4M3 10h18"></path>
                                    </svg>
                                </span>
                                <div>
                                    <div class="technical-history-date-value">${formatTextCell(record.fecha)}</div>
                                    <div class="technical-history-date-subtitle">Registro técnico</div>
                                </div>
                            </div>
                        </td>
                        ${potencialCell}
                        <td>
                            <div class="technical-history-metric">
                                <span class="technical-history-badge barrel">BB</span>
                                <div>
                                    <div class="technical-history-metric-value">${formatNumberCell(record.bbpd, 2)}</div>
                                    <div class="technical-history-metric-label">Barril bruto</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="technical-history-metric">
                                <span class="technical-history-badge water" aria-label="Contenido de agua" title="Contenido de agua">
                                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M12 3.8C9.4 6.9 7 9.9 7 13.2C7 16 9.24 18.2 12 18.2C14.76 18.2 17 16 17 13.2C17 9.9 14.6 6.9 12 3.8Z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                                        <path d="M14.9 13.9C14.45 15.05 13.39 15.88 12.15 16.05" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                                        <circle cx="15.65" cy="12.35" r="0.85" fill="currentColor"/>
                                    </svg>
                                </span>
                                <div>
                                    <div class="technical-history-metric-value water">${formatNumberCell(record.ays_percentage, 2)}%</div>
                                    <div class="technical-history-metric-label">Contenido de agua</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="technical-history-metric">
                                <span class="technical-history-badge net">BN</span>
                                <div>
                                    <div class="technical-history-metric-value">${formatNumberCell(record.bnpd, 2)}</div>
                                    <div class="technical-history-metric-label">Barriles netos</div>
                                </div>
                            </div>
                        </td>
                    `;
                    tr.addEventListener('click', () => openTechnicalRecordDetail(record));
                    tr.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTechnicalRecordDetail(record);
                        }
                    });
                    tbody.appendChild(tr);
                });
                return;
            }

            currentRecordData.forEach(record => {
                const tr = document.createElement('tr');
                // El identificador confirmado del registro es 'id'.
                const recordId = record.id || record.ID || null;

                if (!recordId) {
                    console.warn("ALERTA: Registro sin ID detectado. Campos:", Object.keys(record));
                }

                tr.innerHTML = buildOperationalRowHtml({ ...record, id: recordId }, true);
                tbody.appendChild(tr);
            });

            if (!currentAccessProfile.canEditData) {
                return;
            }

            // Enlaza las acciones de edicion fila por fila.
            document.querySelectorAll('.btn-edit').forEach(btn => {
                btn.onclick = function() {
                    const id = this.getAttribute('data-id');
                    window.location.href = `dashboard-data.html?edit=${id}`;
                };
            });

            // Enlaza la eliminacion con confirmacion visual.
            document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.onclick = async function () {
                    const id = this.getAttribute('data-id');

                    if (!id || id === 'null') {
                        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo leer el ID de este registro.' });
                        return;
                    }
                    const result = await Swal.fire({
                        title: '¿Confirmar eliminación?',
                        text: "Esta acción borrará el registro permanentemente.",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#EF4444',
                        cancelButtonColor: '#6B7280',
                        confirmButtonText: 'Sí, borrar',
                        cancelButtonText: 'Cancelar'
                    });

                    if (result.isConfirmed) {
                        try {
                            await deleteRecord(id);
                            Swal.fire({ icon: 'success', title: 'Borrado', showConfirmButton: false, timer: 1500 });
                            await loadPozoData();
                        } catch (err) {
                            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
                        }
                    }
                };
            });
        }



        // Abre el modal con todos los parametros del registro
        window.openFullDataModal = async function(recordId) {
            let record = currentRecordData.find(r => String(r.id || r.ID || '') === String(recordId || ''));
            if (!record) return;

            const activeScope = getActiveOperationalScope();
            const isCrc = activeScope === 'crc_ll' || activeScope === 'ccrc_ll';
            
            // Cargar los campos de raw_payload originales si es CCRC para tener los parámetros específicos
            if (isCrc) {
                try {
                    const normalizedPozo = String(record.pozo_name || record.pozo || '').trim().toUpperCase();
                    const { data: recordsData } = await supabase
                        .from('field_journey_records')
                        .select('raw_payload')
                        .eq('pozo', normalizedPozo)
                        .eq('report_date', record.fecha)
                        .limit(1);

                    if (recordsData && recordsData.length > 0 && recordsData[0].raw_payload) {
                        const payload = recordsData[0].raw_payload;
                        record = {
                            ...record,
                            ...payload,
                            raw_payload: payload
                        };
                    }
                    if (!record.locacion_jornada) {
                        record.locacion_jornada = 'Lagunillas Lago';
                    }
                } catch (e) {
                    console.error('Error al cargar raw_payload de field_journey_records:', e);
                }
            }

            const formatVal = (v) => (v !== null && v !== undefined && v !== '') ? v : '--';
            const pozo = record.pozo_name || record.pozo;

            document.getElementById('modal-full-data-subtitle').textContent = `Pozo: ${formatVal(pozo)} | Fecha: ${formatVal(record.fecha)} ${formatVal(record.hora)}`;

            let PARAM_SECTIONS;

            if (isCrc) {
                const pozoName = String(record.pozo_name || record.pozo || '').trim().toUpperCase();
                const wellMeta = activeScopeWellCatalog.find(w => w.pozo_name === pozoName);
                const liftMethod = wellMeta?.lift_method || record.lift_method || 'BM';

                const liftMethodFields = liftMethod === 'BCP'
                    ? [
                        { key: 'bcp_rpm', label: 'RPM', unit: '' },
                        { key: 'bcp_torque', label: 'Torque', unit: 'LBF-IN' },
                        { key: 'bcp_amperaje', label: 'Corriente Motor BCP', unit: 'A' },
                        { key: 'bcp_modelo_cabezal', label: 'Modelo Cabezal', unit: '' },
                        { key: 'bcp_motorreductor', label: 'Motorreductor', unit: '' },
                        { key: 'bcp_stuffing', label: 'Stuffing Box', unit: '' }
                      ]
                    : [
                        { key: 'bm_marca', label: 'Marca Unidad', unit: '' },
                        { key: 'bm_modelo', label: 'Modelo Unidad', unit: '' },
                        { key: 'bm_tiro', label: 'Tiro', unit: '' },
                        { key: 'bm_recorrido', label: 'Recorrido', unit: 'IN' },
                        { key: 'bm_spm', label: 'Velocidad (SPM)', unit: 'SPM' },
                        { key: 'bm_estado_unidad', label: 'Estado Unidad', unit: '' }
                      ];

                PARAM_SECTIONS = [
                    {
                        id: 'general',
                        title: '📍 Identificación, Ubicación & Personal de Guardia',
                        color: '#2563EB',
                        bg: '#EFF6FF',
                        border: '#BFDBFE',
                        fields: [
                            { key: 'pozo_name', label: 'Pozo' },
                            { key: 'pozo', label: 'Pozo' },
                            { key: 'campo', label: 'Campo' },
                            { key: 'ef', label: 'Estación / Fila (EF)' },
                            { key: 'fecha', label: 'Fecha Lectura' },
                            { key: 'report_date', label: 'Fecha Lectura' },
                            { key: 'hora', label: 'Hora Lectura' },
                            { key: 'report_time', label: 'Hora Lectura' },
                            { key: 'locacion_jornada', label: 'Locación Jornada' },
                            { key: 'estatus', label: 'Estatus Operativo' },
                            { key: 'categoria', label: 'Categoría' },
                            { key: 'jornada', label: 'Jornada' },
                            { key: 'lift_method', label: 'Método Levantamiento' },
                            { key: 'tecnico_1', label: 'Técnico 1' },
                            { key: 'tecnico_2', label: 'Técnico 2' },
                            { key: 'equipo_guardia', label: 'Equipo Guardia' }
                        ]
                    },
                    {
                        id: 'produccion',
                        title: '🛢️ Producción & Flujos',
                        color: '#0284C7',
                        bg: '#F0F9FF',
                        border: '#BAE6FD',
                        fields: [
                            { key: 'frecuencia', label: 'Caudal Bruto', unit: 'BPD' },
                            { key: 'bruta', label: 'Caudal Bruto', unit: 'BPD' },
                            { key: 'corriente_motor', label: 'Caudal Neto', unit: 'BPD' },
                            { key: 'neta', label: 'Caudal Neto', unit: 'BPD' },
                            { key: 'pip', label: 'Contenido de Agua (% AyS)', unit: '%' },
                            { key: 'ays_percentage', label: 'Contenido de Agua (% AyS)', unit: '%' }
                        ]
                    },
                    {
                        id: 'parametros_levantamiento',
                        title: `⚙️ Parámetros de Levantamiento (${liftMethod})`,
                        color: '#D97706',
                        bg: '#FFFBEB',
                        border: '#FDE68A',
                        fields: liftMethodFields
                    },
                    {
                        id: 'presiones',
                        title: '📈 Parámetros Operativos (Presiones)',
                        color: '#0D9488',
                        bg: '#F0FDF4',
                        border: '#BBF7D0',
                        fields: [
                            { key: 'presion_thp', label: 'Presión THP', unit: 'psi' },
                            { key: 'thp_psi', label: 'Presión THP', unit: 'psi' },
                            { key: 'thp', label: 'Presión THP', unit: 'psi' },
                            { key: 'presion_chp', label: 'Presión CHP', unit: 'psi' },
                            { key: 'chp_psi', label: 'Presión CHP', unit: 'psi' },
                            { key: 'chp', label: 'Presión CHP', unit: 'psi' },
                            { key: 'stuffing', label: 'Presión Stuffing Box', unit: 'psi' }
                        ]
                    },
                    {
                        id: 'pruebas_nivel',
                        title: '📏 Pruebas de Nivel (Echometer)',
                        color: '#7C3AED',
                        bg: '#F5F3FF',
                        border: '#DDD6FE',
                        fields: [
                            { key: 'well_nivel', label: 'Nivel del Fluido', unit: 'ft' },
                            { key: 'well_sumergencia', label: 'Sumergencia', unit: 'ft' },
                            { key: 'well_presion_inicial', label: 'Presión Inicial', unit: 'psi' },
                            { key: 'well_presion_final', label: 'Presión Final', unit: 'psi' },
                            { key: 'well_tiempo_prueba', label: 'Tiempo de Prueba' }
                        ]
                    },
                    {
                        id: 'diagnostico',
                        title: '🩺 Actividad & Observaciones',
                        color: '#15803D',
                        bg: '#F0FDF4',
                        border: '#86EFAC',
                        fields: [
                            { key: 'sentido_giro', label: 'Actividad' },
                            { key: 'actividad', label: 'Actividad' },
                            { key: 'observaciones', label: 'Observaciones' },
                            { key: 'observaciones_pozo', label: 'Observaciones Pozo' }
                        ]
                    }
                ];
            } else {
                PARAM_SECTIONS = [
                    {
                        id: 'general',
                        title: '📍 Identificación, Ubicación & Personal de Guardia',
                        color: '#2563EB',
                        bg: '#EFF6FF',
                        border: '#BFDBFE',
                        fields: [
                            { key: 'pozo_name', label: 'Pozo' },
                            { key: 'pozo', label: 'Pozo' },
                            { key: 'POZO', label: 'Pozo' },
                            { key: 'campo', label: 'Campo' },
                            { key: 'CAMPO', label: 'Campo' },
                            { key: 'locacion_jornada', label: 'Locación Jornada' },
                            { key: 'LOCACION JORNADA', label: 'Locación Jornada' },
                            { key: 'ef', label: 'Estación / Fila (EF)' },
                            { key: 'EF', label: 'Estación / Fila (EF)' },
                            { key: 'estacion', label: 'Estación' },
                            { key: 'fecha', label: 'Fecha Lectura' },
                            { key: 'FECHA', label: 'Fecha Lectura' },
                            { key: 'report_date', label: 'Fecha Lectura' },
                            { key: 'hora', label: 'Hora Lectura' },
                            { key: 'HORA', label: 'Hora Lectura' },
                            { key: 'report_time', label: 'Hora Lectura' },
                            { key: 'estatus', label: 'Estatus Operativo' },
                            { key: 'ESTATUS', label: 'Estatus Operativo' },
                            { key: 'actividad', label: 'Actividad' },
                            { key: 'ACTIVIDAD', label: 'Actividad' },
                            { key: 'categoria', label: 'Categoría' },
                            { key: 'CATEGORIA', label: 'Categoría' },
                            { key: 'jornada', label: 'Jornada' },
                            { key: 'estado', label: 'Estado Pozo' },
                            { key: 'modo_operacion', label: 'Modo de Operación' },
                            { key: 'MODO OPERACION', label: 'Modo de Operación' },
                            { key: 'tecnico_1', label: 'Técnico 1' },
                            { key: 'TECNICO 1', label: 'Técnico 1' },
                            { key: 'tecnico1', label: 'Técnico 1' },
                            { key: 'tecnico_2', label: 'Técnico 2' },
                            { key: 'TECNICO 2', label: 'Técnico 2' },
                            { key: 'tecnico2', label: 'Técnico 2' },
                            { key: 'equipo_guardia', label: 'Equipo Guardia' },
                            { key: 'EQUIPO GUARDIA', label: 'Equipo Guardia' }
                        ]
                    },
                    {
                        id: 'inspeccion',
                        title: '🛡️ Inspección de Superficie & Estado de Instalaciones',
                        color: '#334155',
                        bg: '#F8FAFC',
                        border: '#E2E8F0',
                        fields: [
                            { key: 'condicion_caseta', label: 'Condición de la Jaula' },
                            { key: 'CONDICION CASETA', label: 'Condición de la Jaula' },
                            { key: 'temperatura_caseta', label: 'Temperatura de la Caseta del VDF', unit: '°C' },
                            { key: 'TEMPERATURA CASETA', label: 'Temperatura de la Caseta del VDF', unit: '°C' },
                            { key: 'estado_manometros', label: 'Estado Manómetros' },
                            { key: 'ESTADO MANOMETROS', label: 'Estado Manómetros' },
                            { key: 'condicion_cableado', label: 'Condición Cableado' },
                            { key: 'CONDICION CABLEADO', label: 'Condición Cableado' },
                            { key: 'estado_caja_venteo', label: 'Estado Caja Venteo' },
                            { key: 'ESTADO CAJA VENTEO', label: 'Estado Caja Venteo' },
                            { key: 'estado_aterramiento', label: 'Estado Aterramiento' },
                            { key: 'ESTADO ATERRAMIENTO', label: 'Estado Aterramiento' },
                            { key: 'estado_biw_conector', label: 'Estado BIW / Conector' },
                            { key: 'ESTADO BIW CONECTOR', label: 'Estado BIW / Conector' },
                            { key: 'estado_tomamuestras', label: 'Estado Tomamuestras' },
                            { key: 'ESTADO TOMAMUESTRAS', label: 'Estado Tomamuestras' },
                            { key: 'estado_fosa_porcentaje', label: 'Estado Fosa', unit: '%' },
                            { key: 'ESTADO FOSA PORCENTAJE', label: 'Estado Fosa', unit: '%' },
                            { key: 'estado_panel_sensor_choques', label: 'Estado Panel Sensor Choques' },
                            { key: 'ESTADO PANEL SENSOR CHOQUES', label: 'Estado Panel Sensor Choques' },
                            { key: 'estado_cabezal', label: 'Estado Cabezal' },
                            { key: 'ESTADO CABEZAL', label: 'Estado Cabezal' },
                            { key: 'estado_tx', label: 'Estado Transformador (TX)' },
                            { key: 'ESTADO TX', label: 'Estado Transformador (TX)' },
                            { key: 'estado_vsd', label: 'Estado Variador VSD' },
                            { key: 'ESTADO VSD', label: 'Estado Variador VSD' },
                            { key: 'cond_chp', label: 'Condición CHP' },
                            { key: 'COND CHP', label: 'Condición CHP' },
                            { key: 'echometer', label: 'Echometer' },
                            { key: 'ECHOMETER', label: 'Echometer' },
                            { key: 'baja_datos', label: 'Baja Datos' },
                            { key: 'BAJA DATOS', label: 'Baja Datos' },
                            { key: 'descarga_datas_sensor', label: 'Descarga Datas Sensor' },
                            { key: 'DESCARGA DATAS SENSOR', label: 'Descarga Datas Sensor' },
                            { key: 'posee_sensor_fondo', label: 'Posee Sensor de Fondo' },
                            { key: 'POSEE SENSOR FONDO', label: 'Posee Sensor de Fondo' }
                        ]
                    },
                    {
                        id: 'especificaciones_placa',
                        title: '⚙️ Especificaciones de Placa & Equipos VSD / TX / BES',
                        color: '#475569',
                        bg: '#F1F5F9',
                        border: '#CBD5E1',
                        fields: [
                            { key: 'marca_vsd', label: 'Marca VSD' },
                            { key: 'MARCA VSD', label: 'Marca VSD' },
                            { key: 'modelo_vsd', label: 'Modelo VSD' },
                            { key: 'MODELO VSD', label: 'Modelo VSD' },
                            { key: 'vsd_kva', label: 'Potencia VSD', unit: 'kVA' },
                            { key: 'VSD KVA', label: 'Potencia VSD', unit: 'kVA' },
                            { key: 'amp_nominal_motor', label: 'Amperaje Nominal Motor', unit: 'A' },
                            { key: 'AMP NOMINAL MOTOR', label: 'Amperaje Nominal Motor', unit: 'A' },
                            { key: 'volt_nominal_motor', label: 'Voltaje Nominal Motor', unit: 'V' },
                            { key: 'VOLT NOMINAL MOTOR', label: 'Voltaje Nominal Motor', unit: 'V' },
                            { key: 'tx_kva', label: 'Capacidad Transformador TX', unit: 'kVA' },
                            { key: 'TX KVA', label: 'Capacidad Transformador TX', unit: 'kVA' },
                            { key: 'tap_v', label: 'Tap Transformador', unit: 'V' },
                            { key: 'TAP [V]', label: 'Tap Transformador', unit: 'V' },
                            { key: 'TAP V', label: 'Tap Transformador', unit: 'V' },
                            { key: 'motor', label: 'Modelo Motor BES' },
                            { key: 'MOTOR', label: 'Modelo Motor BES' },
                            { key: 'bomba', label: 'Modelo Bomba BES' },
                            { key: 'BOMBA', label: 'Modelo Bomba BES' },
                            { key: 'sellos', label: 'Sección Sellos / Protector' },
                            { key: 'SELLOS', label: 'Sección Sellos / Protector' },
                            { key: 'sensor', label: 'Sensor de Fondo' },
                            { key: 'SENSOR', label: 'Sensor de Fondo' },
                            { key: 'sentido_giro', label: 'Sentido de Giro' },
                            { key: 'SENTIDO GIRO', label: 'Sentido de Giro' },
                            { key: 'potencial', label: 'Potencial' },
                            { key: 'POTENCIAL', label: 'Potencial' }
                        ]
                    },
                    {
                        id: 'presiones',
                        title: '📈 Parámetros Operativos (Presiones)',
                        color: '#0D9488',
                        bg: '#F0FDF4',
                        border: '#BBF7D0',
                        fields: [
                            { key: 'presion_chp', label: 'Presión CHP', unit: 'psi' },
                            { key: 'chp_psi', label: 'Presión CHP', unit: 'psi' },
                            { key: 'chp', label: 'Presión CHP', unit: 'psi' },
                            { key: 'CHP (PSI)', label: 'Presión CHP', unit: 'psi' },
                            { key: 'CHP PSI', label: 'Presión CHP', unit: 'psi' },
                            { key: 'presion_thp', label: 'Presión THP', unit: 'psi' },
                            { key: 'thp_psi', label: 'Presión THP', unit: 'psi' },
                            { key: 'thp', label: 'Presión THP', unit: 'psi' },
                            { key: 'THP (PSI)', label: 'Presión THP', unit: 'psi' },
                            { key: 'THP PSI', label: 'Presión THP', unit: 'psi' },
                            { key: 'presion_lf', label: 'Presión LF', unit: 'psi' },
                            { key: 'lf_psi', label: 'Presión LF', unit: 'psi' },
                            { key: 'lf', label: 'Presión LF', unit: 'psi' },
                            { key: 'LF (PSI)', label: 'Presión LF', unit: 'psi' },
                            { key: 'LF PSI', label: 'Presión LF', unit: 'psi' },
                            { key: 'pip', label: 'Presión PIP (Intake)', unit: 'psi' },
                            { key: 'pip_psi', label: 'Presión PIP (Intake)', unit: 'psi' },
                            { key: 'PIP (PSI)', label: 'Presión PIP (Intake)', unit: 'psi' },
                            { key: 'PIP PSI', label: 'Presión PIP (Intake)', unit: 'psi' },
                            { key: 'PIP', label: 'Presión PIP (Intake)', unit: 'psi' },
                            { key: 'pd_psi', label: 'Presión PD (Descarga)', unit: 'psi' },
                            { key: 'pd', label: 'Presión PD (Descarga)', unit: 'psi' },
                            { key: 'PD (PSI)', label: 'Presión PD (Descarga)', unit: 'psi' },
                            { key: 'PD PSI', label: 'Presión PD (Descarga)', unit: 'psi' },
                            { key: 'pd_max_psi', label: 'Presión PD Máxima', unit: 'psi' },
                            { key: 'PD MAX PSI', label: 'Presión PD Máxima', unit: 'psi' },
                            { key: 'pct_pip', label: 'Nivel Presión (% PIP)', unit: '%' },
                            { key: '% PIP', label: 'Nivel Presión (% PIP)', unit: '%' },
                            { key: '%PIP', label: 'Nivel Presión (% PIP)', unit: '%' }
                        ]
                    },
                    {
                        id: 'electricos',
                        title: '⚡ Parámetros Eléctricos & Mediciones VSD',
                        color: '#D97706',
                        bg: '#FFFBEB',
                        border: '#FDE68A',
                        fields: [
                            { key: 'frecuencia', label: 'Frecuencia / Speed', unit: 'Hz' },
                            { key: 'frec', label: 'Frecuencia / Speed', unit: 'Hz' },
                            { key: 'FREC', label: 'Frecuencia / Speed', unit: 'Hz' },
                            { key: 'hz', label: 'Frecuencia / Speed', unit: 'Hz' },
                            { key: 'out_vsd', label: 'Salida VSD', unit: 'Hz' },
                            { key: 'frec_max_hz', label: 'Frecuencia Máxima', unit: 'Hz' },
                            { key: 'FREC MAX HZ', label: 'Frecuencia Máxima', unit: 'Hz' },
                            { key: 'low_speed_hz', label: 'Velocidad Mínima (Low Speed)', unit: 'Hz' },
                            { key: 'v_motor', label: 'Voltaje Motor', unit: 'V' },
                            { key: 'V MOTOR', label: 'Voltaje Motor', unit: 'V' },
                            { key: 'corriente_motor', label: 'Corriente Motor', unit: 'A' },
                            { key: 'i_motor', label: 'Corriente Motor', unit: 'A' },
                            { key: 'corriente_vsd_a', label: 'Corriente VSD Fase A', unit: 'A' },
                            { key: 'vsd_a', label: 'Corriente VSD Fase A', unit: 'A' },
                            { key: 'i_vsd_a', label: 'Corriente VSD Fase A', unit: 'A' },
                            { key: 'corriente_vsd_b', label: 'Corriente VSD Fase B', unit: 'A' },
                            { key: 'vsd_b', label: 'Corriente VSD Fase B', unit: 'A' },
                            { key: 'i_vsd_b', label: 'Corriente VSD Fase B', unit: 'A' },
                            { key: 'corriente_vsd_c', label: 'Corriente VSD Fase C', unit: 'A' },
                            { key: 'vsd_c', label: 'Corriente VSD Fase C', unit: 'A' },
                            { key: 'i_vsd_c', label: 'Corriente VSD Fase C', unit: 'A' },
                            { key: 'prom_i_vsd', label: 'Promedio Corriente VSD', unit: 'A' },
                            { key: 'PROM I VSD', label: 'Promedio Corriente VSD', unit: 'A' },
                            { key: 'desbalance_corriente_vsd', label: 'Desbalance Corriente VSD', unit: '%' },
                            { key: 'DESBALANCE CORRIENTE VSD', label: 'Desbalance Corriente VSD', unit: '%' },
                            { key: 'desv_fase_a', label: 'Desviación Fase A', unit: '%' },
                            { key: 'DESV FASE A', label: 'Desviación Fase A', unit: '%' },
                            { key: 'desv_fase_b', label: 'Desviación Fase B', unit: '%' },
                            { key: 'DESV FASE B', label: 'Desviación Fase B', unit: '%' },
                            { key: 'desv_fase_c', label: 'Desviación Fase C', unit: '%' },
                            { key: 'DESV FASE C', label: 'Desviación Fase C', unit: '%' },
                            { key: 'max_desviacion_vsd', label: 'Máxima Desviación VSD', unit: '%' },
                            { key: 'MAX DESVIACION VSD', label: 'Máxima Desviación VSD', unit: '%' },
                            { key: 'ul_a', label: 'Voltaje UL A', unit: 'V' },
                            { key: 'UL [A]', label: 'Voltaje UL A', unit: 'V' },
                            { key: 'UL A', label: 'Voltaje UL A', unit: 'V' },
                            { key: 'ol_a', label: 'Corriente Límite OL A', unit: 'A' },
                            { key: 'OL [A]', label: 'Corriente Límite OL A', unit: 'A' },
                            { key: 'OL A', label: 'Corriente Límite OL A', unit: 'A' },
                            { key: 'i_limit_a', label: 'Límite Corriente (I-Limit)', unit: 'A' },
                            { key: 'pct_amp', label: 'Carga Motor (% AMP)', unit: '%' },
                            { key: '% AMP', label: 'Carga Motor (% AMP)', unit: '%' },
                            { key: '%AMP', label: 'Carga Motor (% AMP)', unit: '%' },
                            { key: 'amp', label: 'Carga Motor (% AMP)', unit: '%' },
                            { key: 'pct_volt', label: 'Voltaje Motor (% VOLT)', unit: '%' },
                            { key: '% VOLT', label: 'Voltaje Motor (% VOLT)', unit: '%' },
                            { key: '%VOLT', label: 'Voltaje Motor (% VOLT)', unit: '%' },
                            { key: 'volt', label: 'Voltaje Motor (% VOLT)', unit: '%' }
                        ]
                    },
                    {
                        id: 'protecciones',
                        title: '🚨 Ajustes de Protección & Shutdowns (Límites de Seguridad)',
                        color: '#DC2626',
                        bg: '#FEF2F2',
                        border: '#FECACA',
                        fields: [
                            { key: 'low_pip_shutdown_psi', label: 'Límite Parada PIP (Low PIP Shutdown)', unit: 'psi' },
                            { key: 'LOW PIP SHUTDOWN PSI', label: 'Límite Parada PIP (Low PIP Shutdown)', unit: 'psi' },
                            { key: 'max_high_temp_shutdown_f', label: 'Límite Parada Temp (High Temp Shutdown)', unit: '°F' },
                            { key: 'MAX HIGH TEMP SHUTDOWN F', label: 'Límite Parada Temp (High Temp Shutdown)', unit: '°F' },
                            { key: 'delta_presion_psi', label: 'Diferencial Presión (Delta Presión)', unit: 'psi' },
                            { key: 'DELTA PRESION PSI', label: 'Diferencial Presión (Delta Presión)', unit: 'psi' },
                            { key: 'porcentaje_delta_presion', label: 'Porcentaje Delta Presión', unit: '%' },
                            { key: 'PORCENTAJE DELTA PRESION', label: 'Porcentaje Delta Presión', unit: '%' }
                        ]
                    },
                    {
                        id: 'sensores',
                        title: '🌡️ Temperatura & Sensórica (Fondo / Motor / Caseta del VDF)',
                        color: '#7C3AED',
                        bg: '#F5F3FF',
                        border: '#DDD6FE',
                        fields: [
                            { key: 'tm', label: 'Temperatura Motor (TM)', unit: '°F' },
                            { key: 'tm_f', label: 'Temperatura Motor (TM)', unit: '°F' },
                            { key: 'TM (°F)', label: 'Temperatura Motor (TM)', unit: '°F' },
                            { key: 'TM F', label: 'Temperatura Motor (TM)', unit: '°F' },
                            { key: 'tif', label: 'Temperatura Intake (TIF)', unit: '°F' },
                            { key: 'ti_f', label: 'Temperatura Intake (TIF)', unit: '°F' },
                            { key: 'TI (°F)', label: 'Temperatura Intake (TIF)', unit: '°F' },
                            { key: 'TIF (°F)', label: 'Temperatura Intake (TIF)', unit: '°F' },
                            { key: 'TI F', label: 'Temperatura Intake (TIF)', unit: '°F' },
                            { key: 'vx_g', label: 'Vibración X', unit: 'G' },
                            { key: 'VX [G]', label: 'Vibración X', unit: 'G' },
                            { key: 'vy_g', label: 'Vibración Y', unit: 'G' },
                            { key: 'VY [G]', label: 'Vibración Y', unit: 'G' },
                            { key: 'vz_g', label: 'Vibración Z', unit: 'G' },
                            { key: 'VZ [G]', label: 'Vibración Z', unit: 'G' },
                            { key: 'pct_temp', label: 'Temperatura Motor (% TEMP)', unit: '%' },
                            { key: '% TEMP', label: 'Temperatura Motor (% TEMP)', unit: '%' },
                            { key: '%TEMP', label: 'Temperatura Motor (% TEMP)', unit: '%' },
                            { key: 'temp', label: 'Temperatura Motor (% TEMP)', unit: '%' }
                        ]
                    },
                    {
                        id: 'produccion',
                        title: '🛢️ Producción & Flujos',
                        color: '#0284C7',
                        bg: '#F0F9FF',
                        border: '#BAE6FD',
                        fields: [
                            { key: 'bruta', label: 'Producción Bruta', unit: 'BPD' },
                            { key: 'BRUTA', label: 'Producción Bruta', unit: 'BPD' },
                            { key: 'neta', label: 'Producción Neta', unit: 'BPD' },
                            { key: 'NETA', label: 'Producción Neta', unit: 'BPD' },
                            { key: 'ol_a', label: 'Corte de Agua (BSW / OL)', unit: '%' },
                            { key: 'bsw', label: 'Corte de Agua (BSW)', unit: '%' },
                            { key: 'rt', label: 'Relación Gas / RT', unit: '' },
                            { key: 'R.T', label: 'Relación Gas / RT', unit: '' },
                            { key: 'ays', label: '% AYS', unit: '%' },
                            { key: '%AYS', label: '% AYS', unit: '%' },
                            { key: '% AYS', label: '% AYS', unit: '%' },
                            { key: 'ays_percentage', label: '% AYS', unit: '%' },
                            { key: 'AYS PERCENTAGE', label: '% AYS', unit: '%' }
                        ]
                    },
                    {
                        id: 'diagnostico',
                        title: '🩺 Diagnóstico Operativo & Observaciones',
                        color: '#15803D',
                        bg: '#F0FDF4',
                        border: '#86EFAC',
                        fields: [
                            { key: 'diagnostico', label: 'Diagnóstico Operativo' },
                            { key: 'DIAGNOSTICO', label: 'Diagnóstico Operativo' },
                            { key: 'observaciones', label: 'Observaciones' },
                            { key: 'OBSERVACIONES', label: 'Observaciones' },
                            { key: 'observaciones_pozo', label: 'Observaciones Pozo' },
                            { key: 'OBSERVACIONES DEL POZO', label: 'Observaciones Pozo' }
                        ]
                    },
                    {
                        id: 'auditoria',
                        title: '🕒 Trazabilidad & Registro de Sistema',
                        color: '#64748B',
                        bg: '#F8FAFC',
                        border: '#E2E8F0',
                        fields: [
                            { key: 'created_at', label: 'Fecha de Creación' },
                            { key: 'CREATEDAT', label: 'Fecha de Creación' },
                            { key: 'updated_at', label: 'Última Actualización' },
                            { key: 'UPDATEDAT', label: 'Última Actualización' },
                            { key: 'synced_at', label: 'Fecha de Sincronización' }
                        ]
                    }
                ];
            }

            const excludeKeys = new Set(['id', 'ID', 'deleted_at', 'user_id', 'is_historical', 'pozo_id', 'row_data', 'raw_payload']);

            const cleanStr = str => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

            const renderData = (dataObj) => {
                const processedCleanKeys = new Set();
                let sectionsHtml = '';

                const normalizeMap = {};
                for (const [k, v] of Object.entries(dataObj)) {
                    if (v !== null && v !== undefined && v !== '') {
                        const ck = cleanStr(k);
                        if (!normalizeMap[ck]) {
                            normalizeMap[ck] = { origKey: k, value: v };
                        }
                    }
                }

                PARAM_SECTIONS.forEach(sec => {
                    let cardsHtml = '';

                    sec.fields.forEach(f => {
                        const targetCk = cleanStr(f.key);
                        const match = normalizeMap[targetCk];
                        if (match && !processedCleanKeys.has(targetCk)) {
                            processedCleanKeys.add(targetCk);
                            const rawVal = match.value;
                            let valStr = String(rawVal);
                            let badgeHtml = '';

                            if (targetCk === 'estatus') {
                                const normSt = String(rawVal).toUpperCase().trim();
                                if (normSt === 'RUN' || normSt === 'RUN / ATENCION AL CLIENTE') {
                                    badgeHtml = `<span style="background:#dcfce7; color:#15803d; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:12px; display:inline-block;">🟢 RUN</span>`;
                                } else if (normSt === 'OFF' || normSt === 'OFF / ATENCION AL CLIENTE' || normSt === 'PARADA MANUAL') {
                                    badgeHtml = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:12px; display:inline-block;">🔴 OFF</span>`;
                                } else {
                                    badgeHtml = `<span style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:12px; display:inline-block;">${valStr}</span>`;
                                }
                                valStr = '';
                            } else if (f.unit) {
                                const num = Number(rawVal);
                                if (!isNaN(num)) {
                                    valStr = (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)) + ` <small style="font-size:0.75rem; color:#64748b; font-weight:600;">${f.unit}</small>`;
                                } else {
                                    valStr += ` <small style="font-size:0.75rem; color:#64748b; font-weight:600;">${f.unit}</small>`;
                                }
                            }

                            cardsHtml += `
                                <div style="background: #ffffff; padding: 12px 14px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                                    <span style="display:block; font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing:0.02em; margin-bottom: 4px;">${f.label}</span>
                                    ${badgeHtml ? badgeHtml : `<strong style="color: #0f172a; font-size: 1.02rem; font-weight: 800; word-break: break-word;">${valStr}</strong>`}
                                </div>
                            `;
                        }
                    });

                    if (cardsHtml) {
                        sectionsHtml += `
                            <div style="margin-bottom: 18px; background: ${sec.bg}; border: 1px solid ${sec.border}; border-radius: 16px; padding: 16px;">
                                <h4 style="margin: 0 0 12px 0; font-size: 0.88rem; font-weight: 800; color: ${sec.color}; text-transform: uppercase; letter-spacing:0.04em;">${sec.title}</h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
                                    ${cardsHtml}
                                </div>
                            </div>
                        `;
                    }
                });

                let extraCardsHtml = '';
                for (const [k, v] of Object.entries(dataObj)) {
                    const ck = cleanStr(k);
                    if (excludeKeys.has(k) || excludeKeys.has(ck) || processedCleanKeys.has(ck)) continue;
                    if (v === null || v === '' || v === undefined) continue;

                    let cleanKeyLabel = k.replace(/_/g, ' ').toUpperCase();
                    extraCardsHtml += `
                        <div style="background: #ffffff; padding: 12px 14px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <span style="display:block; font-size: 0.72rem; font-weight: 700; color: #64748b; margin-bottom: 4px;">${cleanKeyLabel}</span>
                            <strong style="color: #0f172a; font-size: 0.95rem; font-weight: 800; word-break: break-word;">${v}</strong>
                        </div>
                    `;
                }

                if (extraCardsHtml) {
                    sectionsHtml += `
                        <div style="margin-bottom: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px;">
                            <h4 style="margin: 0 0 12px 0; font-size: 0.88rem; font-weight: 800; color: #475569; text-transform: uppercase;">📌 Datos Adicionales del Reporte</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">
                                ${extraCardsHtml}
                            </div>
                        </div>
                    `;
                }

                return sectionsHtml || '<p style="text-align:center; color:#64748b;">Sin parámetros para mostrar.</p>';
            };

            // Mostrar primero lo basico mientras carga
            document.getElementById('modal-full-data-content').innerHTML = renderData(record) + '<p id="modal-loading-extra" style="margin-top:20px; font-size:0.8rem; color:#64748B; text-align:center;">Buscando parámetros extendidos del histórico...</p>';
            document.getElementById('full-data-modal').style.display = 'flex';

            try {
                let extraData = {};
                const cleanTime = String(record.hora || '').substring(0, 5); // Obtiene "HH:MM"
                
                // 1. Intentar buscar en App de Campo (raw_payload)
                const { data: fieldData } = await supabase
                    .from('field_journey_records')
                    .select('report_time, raw_payload')
                    .eq('pozo', pozo)
                    .eq('report_date', record.fecha);

                if (fieldData && fieldData.length > 0) {
                    const match = fieldData.find(f => String(f.report_time || '').substring(0, 5) === cleanTime) || fieldData[0];
                    extraData = match.raw_payload || {};
                } else {
                    // 2. Intentar buscar en Excel Historico (row_data)
                    const { data: excelData } = await supabase
                        .from('consolidated_dashboard_operational')
                        .select('row_data, report_time')
                        .eq('pozo', pozo)
                        .eq('report_date', record.fecha);
                        
                    if (excelData && excelData.length > 0) {
                        const exactMatch = excelData.find(r => String(r.report_time || '').substring(0, 5) === cleanTime) || excelData[0];
                        extraData = exactMatch.row_data || {};
                    }
                }

                if (Object.keys(extraData).length > 0) {
                    // Combinar datos extra (Excel/App) con los basicos (Tabla)
                    const mergedData = { ...extraData, ...record };
                    document.getElementById('modal-full-data-content').innerHTML = renderData(mergedData);
                } else {
                    const loadingMsg = document.getElementById('modal-loading-extra');
                    if(loadingMsg) loadingMsg.style.display = 'none';
                }
            } catch (err) {
                console.error("Error fetching extended data:", err);
                const loadingMsg = document.getElementById('modal-loading-extra');
                if(loadingMsg) loadingMsg.style.display = 'none';
            }
        };

        async function handleDeleteLevelTest(id) {
            const result = await Swal.fire({
                title: '¿Confirmar eliminación?',
                text: "Esta acción borrará esta prueba de nivel de Echometer permanentemente.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#EF4444',
                cancelButtonColor: '#6B7280',
                confirmButtonText: 'Sí, borrar',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                try {
                    await deleteLevelTest(id);
                    Swal.fire({ icon: 'success', title: 'Borrado', showConfirmButton: false, timer: 1500 });
                    await loadPozoData();
                } catch (err) {
                    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
                }
            }
        }

export function destroyData() {
    if (pozoOutsideClickListener) {
        document.removeEventListener('click', pozoOutsideClickListener);
        pozoOutsideClickListener = null;
    }
}
