import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';
import { previewMonitoringSync, syncMonitoringRecords } from './monitoring-records-service.js';
import { getWellTechnicalData } from './technical-measurements-service.js';
import { REPORT_COLUMNS } from './field-journey-export.js';

const CONSOLIDATED_OPERATIONAL_TABLE = 'consolidated_dashboard_operational';

const FIELD_PRODUCTION_MEASURE_MAP = {
    campo: 'campo_name',
    ef: 'ef',
    categoria: 'cat_number',
    potencial: 'potencial',
    bruta: 'bbpd',
    neta: 'bnpd',
    ays_percentage: 'ays_percentage'
};

async function ensureFieldSessionAccess() {
    const session = await getSession();
    const accessProfile = getAccessProfile(session);

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para acceder a jornadas de Campo.');
    }

    return { session, accessProfile };
}

async function ensureFieldWriteAccess() {
    const { session, accessProfile } = await ensureFieldSessionAccess();

    if (!accessProfile.canCreateFieldReports || accessProfile.isReadOnly) {
        throw new Error('Tu usuario no tiene permisos para guardar jornadas de Campo.');
    }

    return session;
}

async function ensureFieldAdminReadAccess() {
    const { accessProfile } = await ensureFieldSessionAccess();

    if (!accessProfile.canViewManagement) {
        throw new Error('Tu usuario no tiene permisos para consultar jornadas administrativas.');
    }
}

function wrapFieldJourneyError(error) {
    const message = String(error?.message || error || '');

    if (/row-level security|permission denied|violates row-level security/i.test(message)) {
        return new Error('Tu usuario no tiene permisos para completar una parte del workflow administrativo de Campo. La jornada puede requerir un ajuste de políticas en Supabase.');
    }

    if (/field_journey_reports/i.test(message)) {
        return new Error('Falta crear la tabla de jornadas de Campo en Supabase. Ejecuta el script supabase/field_journey_reports.sql y vuelve a intentar.');
    }

    if (/field_journeys|field_journey_records|field_journey_review_log/i.test(message)) {
        return new Error('Falta crear las tablas del workflow administrativo de Campo en Supabase. Ejecuta el script supabase/field_journey_workflow.sql y vuelve a intentar.');
    }

    return error instanceof Error ? error : new Error(message || 'Error desconocido guardando la jornada de Campo.');
}

function normalizeJourneyStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'submitted';
}

function normalizeUuid(value) {
    const raw = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
        ? raw
        : null;
}

function normalizeJourneyStatuses(statuses = []) {
    const list = Array.isArray(statuses) ? statuses : [statuses];
    const normalized = list
        .map(normalizeJourneyStatus)
        .filter(Boolean);

    return normalized.length > 0 ? [...new Set(normalized)] : ['submitted', 'under_review'];
}

function canOwnerEditJourneyStatus(status) {
    return ['draft', 'submitted', 'rejected'].includes(normalizeJourneyStatus(status));
}

function matchesJourneySearch(journey = {}, searchTerm = '') {
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
    if (!normalizedSearch) return true;

    const fields = [
        journey.locacion_jornada,
        journey.equipo_guardia,
        journey.submitted_by_email,
        journey.jornada,
        ...(Array.isArray(journey.pozoNames) ? journey.pozoNames : [])
    ];

    return fields.some(value => String(value || '').toLowerCase().includes(normalizedSearch));
}

function buildJourneyPreviewSummary(journey = {}, records = []) {
    const sortedRecords = [...records].sort((left, right) => {
        const leftTime = String(left.report_time || '');
        const rightTime = String(right.report_time || '');
        return leftTime.localeCompare(rightTime) || String(left.pozo || '').localeCompare(String(right.pozo || ''));
    });

    return {
        ...journey,
        pozoNames: sortedRecords.map(record => String(record.pozo || '').trim().toUpperCase()).filter(Boolean),
        first_report_time: journey.first_report_time || sortedRecords[0]?.report_time || null,
        last_report_time: journey.last_report_time || sortedRecords[sortedRecords.length - 1]?.report_time || null,
        total_reports: Number(journey.total_reports || sortedRecords.length || 0)
    };
}

function normalizeNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeTimeValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '00:00:00';
    if (/^\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
    return normalized;
}

function normalizeOptionalText(value, transform = value => value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    return transform(normalized);
}

function normalizeOptionalNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function hasProductionValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function mapTechnicalDataToFieldProduction(technicalData = {}) {
    return Object.entries(FIELD_PRODUCTION_MEASURE_MAP).reduce((measures, [fieldName, sourceField]) => {
        const value = technicalData?.[sourceField];
        if (hasProductionValue(value)) {
            measures[fieldName] = value;
        }
        return measures;
    }, {});
}

async function getCachedFieldProduction(pozoName, cache) {
    const normalizedPozo = String(pozoName || '').trim().toUpperCase();
    if (!normalizedPozo) return null;
    if (cache.has(normalizedPozo)) return cache.get(normalizedPozo);

    try {
        const technicalData = await getWellTechnicalData(normalizedPozo);
        const measures = technicalData ? mapTechnicalDataToFieldProduction(technicalData) : null;
        cache.set(normalizedPozo, measures);
        return measures;
    } catch (error) {
        cache.set(normalizedPozo, null);
        return null;
    }
}

async function inheritReportProductionMeasures(report = {}, cache = new Map()) {
    const pozo = String(report.pozo || report.pozo_name || '').trim().toUpperCase();
    if (!pozo) return report;

    const inheritedMeasures = await getCachedFieldProduction(pozo, cache);
    if (!inheritedMeasures) return report;

    const nextReport = { ...report, pozo };
    Object.keys(FIELD_PRODUCTION_MEASURE_MAP).forEach(fieldName => {
        if (hasProductionValue(nextReport[fieldName])) return;
        if (!hasProductionValue(inheritedMeasures[fieldName])) return;
        nextReport[fieldName] = inheritedMeasures[fieldName];
    });

    return nextReport;
}

async function inheritReportsProductionMeasures(reports = []) {
    const cache = new Map();
    return Promise.all((Array.isArray(reports) ? reports : []).map(report => inheritReportProductionMeasures(report, cache)));
}

async function inheritWorkflowRecordsProductionMeasures(records = []) {
    const cache = new Map();
    return Promise.all((Array.isArray(records) ? records : []).map(async record => {
        const payload = record?.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
        const inheritedPayload = await inheritReportProductionMeasures({ ...payload, ...record, pozo: record.pozo || payload.pozo }, cache);
        return {
            ...record,
            ...Object.fromEntries(Object.keys(FIELD_PRODUCTION_MEASURE_MAP).map(fieldName => [fieldName, inheritedPayload[fieldName] ?? record[fieldName] ?? payload[fieldName] ?? null])),
            raw_payload: {
                ...payload,
                ...Object.fromEntries(Object.keys(FIELD_PRODUCTION_MEASURE_MAP).map(fieldName => [fieldName, inheritedPayload[fieldName] ?? payload[fieldName] ?? '']))
            }
        };
    }));
}

function mapWorkflowRecordEditableFields(report = {}) {
    return {
        pozo: normalizeOptionalText(report.pozo, value => value.toUpperCase()),
        report_date: normalizeOptionalText(report.fecha),
        report_time: normalizeTimeValue(report.hora),
        campo: normalizeOptionalText(report.campo),
        ef: normalizeOptionalText(report.ef),
        estado: normalizeOptionalText(report.estado),
        categoria: normalizeOptionalText(report.categoria),
        actividad: normalizeOptionalText(report.actividad),
        estatus: normalizeOptionalText(report.estatus),
        modo_operacion: normalizeOptionalText(report.modo_operacion),
        sentido_giro: normalizeOptionalText(report.sentido_giro),
        potencial: normalizeOptionalNumber(report.potencial),
        bruta: normalizeOptionalNumber(report.bruta),
        neta: normalizeOptionalNumber(report.neta),
        ays_percentage: normalizeOptionalNumber(report.ays_percentage),
        frecuencia: normalizeOptionalNumber(report.frecuencia),
        i_motor: normalizeOptionalNumber(report.i_motor),
        v_motor: normalizeOptionalNumber(report.v_motor),
        out_vsd: normalizeOptionalNumber(report.out_vsd),
        pip_psi: normalizeOptionalNumber(report.pip_psi),
        pd_psi: normalizeOptionalNumber(report.pd_psi),
        ti_f: normalizeOptionalNumber(report.ti_f),
        tm_f: normalizeOptionalNumber(report.tm_f),
        thp_psi: normalizeOptionalNumber(report.thp_psi),
        chp_psi: normalizeOptionalNumber(report.chp_psi),
        lf_psi: normalizeOptionalNumber(report.lf_psi),
        observaciones_pozo: normalizeOptionalText(report.observaciones_pozo),
        diagnostico: normalizeOptionalText(report.diagnostico)
    };
}

function sanitizeReviewAction(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['under_review', 'approved', 'rejected', 'published', 'reopened', 'commented'].includes(normalized)
        ? normalized
        : 'commented';
}

function buildJourneyKey(report = {}, userEmail = '') {
    const parts = [
        String(userEmail || '').trim().toLowerCase(),
        String(report.fecha || '').trim(),
        String(report.jornada || '').trim().toLowerCase(),
        String(report.locacion_jornada || '').trim().toLowerCase(),
        String(report.equipo_guardia || '').trim().toLowerCase()
    ];

    return parts.join('|');
}

function buildJourneyLocationLabel(reports = []) {
    const locations = [...new Set((Array.isArray(reports) ? reports : [])
        .map(report => String(report?.locacion_jornada || '').trim())
        .filter(Boolean))];

    return locations.join(' / ');
}

function mapFieldReportToRow(report, session) {
    return {
        user_id: session.user.id,
        user_email: session.user.email,
        client_report_id: String(report.id || '').trim(),
        journey_key: buildJourneyKey(report, session.user.email),
        report_date: report.fecha,
        report_time: report.hora || '00:00:00',
        jornada: report.jornada || 'Diurna',
        equipo_guardia: String(report.equipo_guardia || '').trim(),
        locacion_jornada: String(report.locacion_jornada || '').trim(),
        pozo: String(report.pozo || '').trim().toUpperCase(),
        hz: normalizeNumber(report.hz),
        sentido_giro: String(report.sentido_giro || '').trim().toUpperCase(),
        v_vsd: normalizeNumber(report.v_vsd),
        i_mot: normalizeNumber(report.i_mot),
        v_mot: normalizeNumber(report.v_mot),
        thp: normalizeNumber(report.thp),
        lf: normalizeNumber(report.lf),
        chp: normalizeNumber(report.chp),
        pi: normalizeNumber(report.pi),
        pd: normalizeNumber(report.pd),
        ti: normalizeNumber(report.ti),
        tm: normalizeNumber(report.tm),
        ivsd_a: normalizeNumber(report.ivsd_a),
        ivsd_b: normalizeNumber(report.ivsd_b),
        ivsd_c: normalizeNumber(report.ivsd_c),
        comentario: String(report.comentario || '').trim(),
        message_text: String(report.message || '').trim(),
        saved_from: 'field-web'
    };
}

function buildWorkflowJourneyRow(reports, session, journeyId) {
    const firstReport = reports[0] || {};
    const submittedAt = new Date().toISOString();
    const locationLabel = buildJourneyLocationLabel(reports);

    return {
        id: journeyId || undefined,
        submitted_by_user_id: session.user.id,
        submitted_by_email: session.user.email,
        journey_date: firstReport.fecha,
        jornada: firstReport.jornada || 'Diurna',
        equipo_guardia: String(firstReport.equipo_guardia || '').trim(),
        locacion_jornada: locationLabel || String(firstReport.locacion_jornada || '').trim() || null,
        status: 'submitted',
        submission_source: 'field-web',
        submitted_at: submittedAt
    };
}

function buildWorkflowDraftJourneyRow(reports, session, journeyId) {
    const firstReport = reports[0] || {};
    const locationLabel = buildJourneyLocationLabel(reports);

    return {
        id: journeyId || undefined,
        submitted_by_user_id: session.user.id,
        submitted_by_email: session.user.email,
        journey_date: firstReport.fecha,
        jornada: firstReport.jornada || 'Diurna',
        equipo_guardia: String(firstReport.equipo_guardia || '').trim() || 'Sin definir',
        locacion_jornada: locationLabel || String(firstReport.locacion_jornada || '').trim() || null,
        status: 'draft',
        submission_source: 'field-web',
        submitted_at: null
    };
}

function mapFieldReportToWorkflowRecord(report, journeyId) {
    return {
        journey_id: journeyId,
        source_client_report_id: String(report.id || '').trim() || null,
        pozo: String(report.pozo || '').trim().toUpperCase(),
        report_date: report.fecha,
        report_time: normalizeTimeValue(report.hora),
        campo: String(report.campo || '').trim() || null,
        ef: String(report.ef || '').trim() || null,
        estado: String(report.estado || '').trim() || null,
        categoria: String(report.categoria || '').trim() || null,
        actividad: String(report.actividad || '').trim() || null,
        estatus: String(report.estatus || '').trim() || null,
        modo_operacion: String(report.modo_operacion || '').trim() || null,
        sentido_giro: String(report.sentido_giro || '').trim() || null,
        potencial: normalizeNumber(report.potencial),
        bruta: normalizeNumber(report.bruta),
        neta: normalizeNumber(report.neta),
        ays_percentage: normalizeNumber(report.ays_percentage),
        frecuencia: normalizeNumber(report.frecuencia),
        i_motor: normalizeNumber(report.i_motor),
        v_motor: normalizeNumber(report.v_motor),
        out_vsd: normalizeNumber(report.out_vsd),
        pip_psi: normalizeNumber(report.pip_psi),
        pd_psi: normalizeNumber(report.pd_psi),
        ti_f: normalizeNumber(report.ti_f),
        tm_f: normalizeNumber(report.tm_f),
        thp_psi: normalizeNumber(report.thp_psi),
        chp_psi: normalizeNumber(report.chp_psi),
        lf_psi: normalizeNumber(report.lf_psi),
        observaciones_pozo: String(report.observaciones_pozo || '').trim() || null,
        diagnostico: String(report.diagnostico || '').trim() || null,
        raw_payload: report
    };
}

export async function saveFieldJourneyReports(reports = []) {
    const session = await ensureFieldWriteAccess();
    const normalizedReports = (Array.isArray(reports) ? reports : []).filter(report => report?.id && report?.pozo && report?.fecha);

    if (normalizedReports.length === 0) {
        return { saved: 0 };
    }

    const rows = normalizedReports.map(report => mapFieldReportToRow(report, session));

    try {
        const { data, error } = await supabase
            .from('field_journey_reports')
            .upsert(rows, { onConflict: 'user_email,client_report_id' })
            .select('id, client_report_id, updated_at');

        if (error) throw error;

        return {
            saved: data?.length || rows.length,
            syncedAt: new Date().toISOString(),
            rows: data || []
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getFieldJourneyHistory(limit = 150) {
    const session = await ensureFieldWriteAccess();
    const accessProfile = getAccessProfile(session);

    try {
        // If the current user is a field operator, only return a limited set of columns
        // to avoid exposing sensitive measurement fields. Administrators and supervisors
        // continue receiving the full record set.
        const selectColumns = accessProfile?.isFieldOperator
            ? 'id, client_report_id, report_date, report_time, jornada, equipo_guardia, locacion_jornada, pozo, updated_at'
            : '*';

        const { data, error } = await supabase
            .from('field_journey_reports')
            .select(selectColumns)
            .eq('user_email', session.user.email)
            .order('report_date', { ascending: false })
            .order('report_time', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getFieldJourneyReportsRange(startDate, endDate, limit = 5000) {
    await ensureFieldAdminReadAccess();

    let query = supabase
        .from('field_journey_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .order('report_time', { ascending: false });

    if (startDate) {
        query = query.gte('report_date', startDate);
    }

    if (endDate) {
        query = query.lte('report_date', endDate);
    }

    const safeLimit = Number(limit);
    if (Number.isFinite(safeLimit) && safeLimit > 0) {
        query = query.limit(safeLimit);
    }

    try {
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getHistoricalFieldReports(filters = {}) {
    await ensureFieldAdminReadAccess();

    const {
        startDate = '',
        endDate = '',
        pozo = '',
        limit = 10000
    } = filters || {};

    let query = supabase
        .from('field_journey_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .order('report_time', { ascending: false });

    if (startDate) {
        query = query.gte('report_date', startDate);
    }

    if (endDate) {
        query = query.lte('report_date', endDate);
    }

    const normalizedPozo = String(pozo || '').trim().toUpperCase();
    if (normalizedPozo) {
        query = query.ilike('pozo', `%${normalizedPozo}%`);
    }

    const safeLimit = Number(limit);
    if (Number.isFinite(safeLimit) && safeLimit > 0) {
        query = query.limit(safeLimit);
    }

    try {
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getHistoricalFieldReportAudit(filters = {}) {
    await ensureFieldAdminReadAccess();

    const {
        pozo = '',
        limit = 20000
    } = filters || {};

    let query = supabase
        .from('field_journey_reports')
        .select('id, client_report_id, user_email, pozo, report_date, report_time, jornada, equipo_guardia, locacion_jornada, created_at, updated_at')
        .order('pozo', { ascending: true })
        .order('report_date', { ascending: false })
        .order('report_time', { ascending: false });

    const normalizedPozo = String(pozo || '').trim().toUpperCase();
    if (normalizedPozo) {
        query = query.ilike('pozo', `%${normalizedPozo}%`);
    }

    const safeLimit = Number(limit);
    if (Number.isFinite(safeLimit) && safeLimit > 0) {
        query = query.limit(Math.min(Math.trunc(safeLimit), 30000));
    }

    try {
        const { data, error } = await query;
        if (error) throw error;

        const grouped = new Map();

        (data || []).forEach(record => {
            const key = String(record?.pozo || '').trim().toUpperCase() || 'SIN_POZO';
            const current = grouped.get(key) || {
                pozo: key,
                totalRecords: 0,
                firstDate: null,
                lastDate: null,
                lastTime: null,
                userEmails: new Set(),
                recentRecords: []
            };

            current.totalRecords += 1;
            if (record?.user_email) current.userEmails.add(String(record.user_email).trim().toLowerCase());

            const reportDate = record?.report_date || null;
            const reportTime = record?.report_time || null;

            if (!current.firstDate || (reportDate && reportDate < current.firstDate)) {
                current.firstDate = reportDate;
            }

            if (!current.lastDate || (reportDate && reportDate > current.lastDate)) {
                current.lastDate = reportDate;
                current.lastTime = reportTime;
            } else if (reportDate && reportDate === current.lastDate && reportTime && (!current.lastTime || reportTime > current.lastTime)) {
                current.lastTime = reportTime;
            }

            if (current.recentRecords.length < 3) {
                current.recentRecords.push({
                    id: record.id,
                    clientReportId: record.client_report_id,
                    userEmail: record.user_email,
                    reportDate,
                    reportTime,
                    jornada: record.jornada,
                    equipoGuardia: record.equipo_guardia,
                    locacionJornada: record.locacion_jornada,
                    createdAt: record.created_at,
                    updatedAt: record.updated_at
                });
            }

            grouped.set(key, current);
        });

        return [...grouped.values()]
            .map(item => ({
                ...item,
                userEmails: [...item.userEmails].sort()
            }))
            .sort((left, right) => left.pozo.localeCompare(right.pozo));
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function deleteHistoricalFieldReportsByPozo(pozo) {
    await ensureFieldAdminReadAccess();

    const normalizedPozo = String(pozo || '').trim().toUpperCase();
    if (!normalizedPozo) {
        throw new Error('No se recibió un pozo válido para limpiar el histórico legado.');
    }

    try {
        const { data, error } = await supabase
            .from('field_journey_reports')
            .delete()
            .ilike('pozo', normalizedPozo)
            .select('id');

        if (error) throw error;

        return {
            deleted: true,
            pozo: normalizedPozo,
            deletedCount: Array.isArray(data) ? data.length : 0
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export const getFieldJourneyReportsRangePublic = getFieldJourneyReportsRange;

export async function getAdminFieldJourneys(options = {}) {
    await ensureFieldAdminReadAccess();

    const statuses = normalizeJourneyStatuses(options.statuses);
    const limit = Number(options.limit);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 120;

    let query = supabase
        .from('field_journeys')
        .select('*')
        .in('status', statuses)
        .order('journey_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (options.startDate) {
        query = query.gte('journey_date', options.startDate);
    }

    if (options.endDate) {
        query = query.lte('journey_date', options.endDate);
    }

    try {
        const { data: journeys, error } = await query;
        if (error) throw error;

        const journeyList = Array.isArray(journeys) ? journeys : [];
        if (journeyList.length === 0) return [];

        const journeyIds = journeyList.map(journey => journey.id).filter(Boolean);
        const { data: records, error: recordsError } = await supabase
            .from('field_journey_records')
            .select('journey_id, pozo, report_time')
            .in('journey_id', journeyIds)
            .order('report_time', { ascending: true })
            .order('pozo', { ascending: true });

        if (recordsError) throw recordsError;

        const recordsByJourney = new Map();
        (records || []).forEach(record => {
            const key = record.journey_id;
            if (!recordsByJourney.has(key)) {
                recordsByJourney.set(key, []);
            }
            recordsByJourney.get(key).push(record);
        });

        return journeyList
            .map(journey => buildJourneyPreviewSummary(journey, recordsByJourney.get(journey.id) || []))
            .filter(journey => matchesJourneySearch(journey, options.searchTerm));
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getAdminFieldJourneyPendingCount(statuses = ['submitted', 'under_review']) {
    await ensureFieldAdminReadAccess();

    try {
        const { count, error } = await supabase
            .from('field_journeys')
            .select('id', { count: 'exact', head: true })
            .in('status', normalizeJourneyStatuses(statuses));

        if (error) throw error;

        return Number.isFinite(count) ? count : 0;
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getFieldWorkflowDiagnostics() {
    const { session, accessProfile } = await ensureFieldSessionAccess();

    try {
        const [{ data: dbRole, error: roleError }, { count, error: countError }] = await Promise.all([
            supabase.rpc('get_access_role'),
            supabase
                .from('field_journeys')
                .select('id', { count: 'exact', head: true })
        ]);

        if (roleError) throw roleError;
        if (countError) throw countError;

        return {
            email: session.user.email,
            frontendRole: accessProfile.role,
            dbRole: String(dbRole || '').trim().toLowerCase() || 'cliente_view',
            visibleJourneyCount: Number.isFinite(count) ? count : 0,
            canViewManagementFromFrontend: Boolean(accessProfile.canViewManagement)
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getAdminFieldJourneyDetail(journeyId) {
    await ensureFieldAdminReadAccess();

    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibió un identificador válido para consultar la jornada.');
    }

    try {
        const [{ data: journey, error: journeyError }, { data: records, error: recordsError }, { data: reviewLog, error: reviewLogError }] = await Promise.all([
            supabase
                .from('field_journeys')
                .select('*')
                .eq('id', normalizedJourneyId)
                .maybeSingle(),
            supabase
                .from('field_journey_records')
                .select('*')
                .eq('journey_id', normalizedJourneyId)
                .order('report_time', { ascending: true })
                .order('pozo', { ascending: true }),
            supabase
                .from('field_journey_review_log')
                .select('*')
                .eq('journey_id', normalizedJourneyId)
                .order('created_at', { ascending: false })
        ]);

        if (journeyError) throw journeyError;
        if (recordsError) throw recordsError;
        if (reviewLogError) throw reviewLogError;
        if (!journey) {
            throw new Error('La jornada solicitada no existe o ya no está disponible.');
        }

        return {
            journey: buildJourneyPreviewSummary(journey, records || []),
            records: records || [],
            reviewLog: reviewLog || []
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getFieldSubmittedJourneys(options = {}) {
    const { session } = await ensureFieldSessionAccess();
    const limit = Number(options.limit);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 80;

    let query = supabase
        .from('field_journeys')
        .select('*')
        .eq('submitted_by_user_id', session.user.id)
        .order('journey_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (options.startDate) {
        query = query.gte('journey_date', options.startDate);
    }

    if (options.endDate) {
        query = query.lte('journey_date', options.endDate);
    }

    try {
        const { data: journeys, error } = await query;
        if (error) throw error;

        const journeyList = Array.isArray(journeys) ? journeys : [];
        if (journeyList.length === 0) return [];

        const journeyIds = journeyList.map(journey => journey.id).filter(Boolean);
        const { data: records, error: recordsError } = await supabase
            .from('field_journey_records')
            .select('journey_id, pozo, report_time')
            .in('journey_id', journeyIds)
            .order('report_time', { ascending: true })
            .order('pozo', { ascending: true });

        if (recordsError) throw recordsError;

        const recordsByJourney = new Map();
        (records || []).forEach(record => {
            const key = record.journey_id;
            if (!recordsByJourney.has(key)) {
                recordsByJourney.set(key, []);
            }
            recordsByJourney.get(key).push(record);
        });

        return journeyList
            .map(journey => buildJourneyPreviewSummary(journey, recordsByJourney.get(journey.id) || []))
            .filter(journey => matchesJourneySearch(journey, options.searchTerm));
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getFieldSubmittedJourneyDetail(journeyId) {
    const { session } = await ensureFieldSessionAccess();
    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibió un identificador válido para consultar la jornada enviada.');
    }

    try {
        const [{ data: journey, error: journeyError }, { data: records, error: recordsError }] = await Promise.all([
            supabase
                .from('field_journeys')
                .select('*')
                .eq('id', normalizedJourneyId)
                .eq('submitted_by_user_id', session.user.id)
                .maybeSingle(),
            supabase
                .from('field_journey_records')
                .select('*')
                .eq('journey_id', normalizedJourneyId)
                .order('report_time', { ascending: true })
                .order('pozo', { ascending: true })
        ]);

        if (journeyError) throw journeyError;
        if (recordsError) throw recordsError;
        if (!journey) {
            throw new Error('La jornada enviada no existe o no pertenece a tu usuario.');
        }

        return {
            journey: buildJourneyPreviewSummary(journey, records || []),
            records: records || []
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function deleteAdminFieldJourney(journeyId) {
    await ensureFieldAdminReadAccess();

    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibio un identificador valido para eliminar la jornada.');
    }

    try {
        const { error } = await supabase
            .from('field_journeys')
            .delete()
            .eq('id', normalizedJourneyId);

        if (error) throw error;

        return {
            deleted: true,
            journeyId: normalizedJourneyId
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function deleteFieldJourneyReport(clientReportId) {
    const session = await ensureFieldWriteAccess();
    const normalizedId = String(clientReportId || '').trim();

    if (!normalizedId) {
        throw new Error('No se recibió un identificador válido para eliminar el registro.');
    }

    try {
        const { error } = await supabase
            .from('field_journey_reports')
            .delete()
            .eq('user_email', session.user.email)
            .eq('client_report_id', normalizedId);

        if (error) throw error;
        return { deleted: true, clientReportId: normalizedId };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function getLatestFieldJourneyDraft() {
    const { session } = await ensureFieldSessionAccess();

    try {
        const { data: journey, error: journeyError } = await supabase
            .from('field_journeys')
            .select('*')
            .eq('submitted_by_user_id', session.user.id)
            .eq('status', 'draft')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (journeyError) throw journeyError;
        if (!journey?.id) return null;

        const { data: records, error: recordsError } = await supabase
            .from('field_journey_records')
            .select('*')
            .eq('journey_id', journey.id)
            .order('report_time', { ascending: true })
            .order('pozo', { ascending: true });

        if (recordsError) throw recordsError;

        return { journey, records: records || [] };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function autosaveFieldJourneyDraft(reports = [], options = {}) {
    const { session, accessProfile } = await ensureFieldSessionAccess();
    if (!accessProfile.canCreateFieldReports || accessProfile.isReadOnly) {
        return { saved: 0, journeyId: String(options.journeyId || '').trim() || null };
    }

    const requestedJourneyId = normalizeUuid(options.journeyId);
    let normalizedReports = (Array.isArray(reports) ? reports : []).filter(report => report?.id && report?.pozo && report?.fecha);
    if (normalizedReports.length === 0) {
        if (requestedJourneyId) {
            const { error } = await supabase
                .from('field_journeys')
                .delete()
                .eq('id', requestedJourneyId)
                .eq('status', 'draft');

            if (error) throw wrapFieldJourneyError(error);
        }

        return { saved: 0, journeyId: null };
    }

    normalizedReports = await inheritReportsProductionMeasures(normalizedReports);

    try {
        const journeyRow = buildWorkflowDraftJourneyRow(normalizedReports, session, requestedJourneyId);
        const { data: journey, error: journeyError } = await supabase
            .from('field_journeys')
            .upsert(journeyRow, { onConflict: 'id' })
            .select('id, status, updated_at')
            .single();

        if (journeyError) throw journeyError;

        const journeyId = journey?.id;
        if (!journeyId) throw new Error('Supabase no devolvió el identificador del borrador de jornada.');

        const { error: deleteRecordsError } = await supabase
            .from('field_journey_records')
            .delete()
            .eq('journey_id', journeyId);

        if (deleteRecordsError) throw deleteRecordsError;

        const recordRows = normalizedReports.map(report => mapFieldReportToWorkflowRecord(report, journeyId));
        const { error: recordsError } = await supabase
            .from('field_journey_records')
            .insert(recordRows);

        if (recordsError) throw recordsError;

        return { saved: recordRows.length, journeyId, syncedAt: new Date().toISOString() };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function submitFieldJourneyWorkflow(reports = [], options = {}) {
    const { session, accessProfile } = await ensureFieldSessionAccess();
    if (!accessProfile.canCreateFieldReports || accessProfile.isReadOnly) {
        throw new Error('Tu usuario no tiene permisos para guardar jornadas de Campo.');
    }

    let normalizedReports = (Array.isArray(reports) ? reports : []).filter(report => report?.id && report?.pozo && report?.fecha);

    if (normalizedReports.length === 0) {
        throw new Error('No hay pozos válidos para enviar al workflow administrativo de Campo.');
    }

    normalizedReports = await inheritReportsProductionMeasures(normalizedReports);

    const requestedJourneyId = normalizeUuid(options.journeyId);

    try {
        if (requestedJourneyId && !accessProfile.canViewManagement) {
            const { data: existingJourney, error: existingJourneyError } = await supabase
                .from('field_journeys')
                .select('id, status, reviewed_at, published_at')
                .eq('id', requestedJourneyId)
                .maybeSingle();

            if (existingJourneyError) throw existingJourneyError;

            if (existingJourney && !canOwnerEditJourneyStatus(existingJourney.status)) {
                throw new Error('Esta jornada ya fue tomada por Admin Campo y no puede reenviarse desde Campo en su estado actual. Crea una jornada nueva o pide que la regresen a rechazado para volver a editarla.');
            }
        }

        const journeyRow = buildWorkflowJourneyRow(normalizedReports, session, requestedJourneyId);
        const { data: journey, error: journeyError } = await supabase
            .from('field_journeys')
            .upsert(journeyRow, { onConflict: 'id' })
            .select('*')
            .single();

        if (journeyError) throw journeyError;

        const journeyId = journey?.id;
        if (!journeyId) {
            throw new Error('Supabase no devolvió el identificador de la jornada enviada.');
        }

        const { error: deleteRecordsError } = await supabase
            .from('field_journey_records')
            .delete()
            .eq('journey_id', journeyId);

        if (deleteRecordsError) throw deleteRecordsError;

        const recordRows = normalizedReports.map(report => mapFieldReportToWorkflowRecord(report, journeyId));
        const { error: recordsError } = await supabase
            .from('field_journey_records')
            .insert(recordRows);

        if (recordsError) throw recordsError;

        if (accessProfile.canViewManagement) {
            const { error: logError } = await supabase
                .from('field_journey_review_log')
                .insert({
                    journey_id: journeyId,
                    action: 'submitted',
                    comment: requestedJourneyId ? 'Jornada actualizada desde Campo.' : 'Jornada enviada desde Campo.',
                    performed_by_user_id: session.user.id,
                    performed_by_email: session.user.email,
                    metadata: {
                        report_count: recordRows.length,
                        source: 'field-web'
                    }
                });

            if (logError) throw logError;
        }

        return {
            journeyId,
            reportCount: recordRows.length,
            status: journey.status || 'submitted',
            submittedAt: journey.submitted_at || new Date().toISOString()
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function updateAdminFieldJourneyRecord(recordId, report = {}, options = {}) {
    const session = await ensureFieldWriteAccess();
    await ensureFieldAdminReadAccess();

    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedRecordId) {
        throw new Error('No se recibió un identificador válido para actualizar el pozo.');
    }

    try {
        const { data: existingRecord, error: existingError } = await supabase
            .from('field_journey_records')
            .select('*')
            .eq('id', normalizedRecordId)
            .maybeSingle();

        if (existingError) throw existingError;
        if (!existingRecord) {
            throw new Error('El pozo solicitado ya no existe dentro de la jornada.');
        }

        const editableFields = mapWorkflowRecordEditableFields(report);
        const nextRawPayload = {
            ...(existingRecord.raw_payload && typeof existingRecord.raw_payload === 'object' ? existingRecord.raw_payload : {}),
            ...report,
            pozo: editableFields.pozo || report.pozo || existingRecord.pozo,
            fecha: editableFields.report_date || report.fecha || existingRecord.report_date,
            hora: editableFields.report_time || report.hora || existingRecord.report_time,
            campo: editableFields.campo,
            actividad: editableFields.actividad,
            estatus: editableFields.estatus,
            frecuencia: editableFields.frecuencia,
            i_motor: editableFields.i_motor,
            v_motor: editableFields.v_motor,
            out_vsd: editableFields.out_vsd,
            pip_psi: editableFields.pip_psi,
            pd_psi: editableFields.pd_psi,
            ti_f: editableFields.ti_f,
            tm_f: editableFields.tm_f,
            thp_psi: editableFields.thp_psi,
            chp_psi: editableFields.chp_psi,
            lf_psi: editableFields.lf_psi,
            observaciones_pozo: editableFields.observaciones_pozo,
            diagnostico: editableFields.diagnostico
        };

        const updatePayload = {
            ...editableFields,
            raw_payload: nextRawPayload
        };

        const { data: updatedRecord, error: updateError } = await supabase
            .from('field_journey_records')
            .update(updatePayload)
            .eq('id', normalizedRecordId)
            .select('*')
            .single();

        if (updateError) throw updateError;

        const reviewAction = sanitizeReviewAction(options.reviewAction || 'commented');
        const reviewComment = String(options.reviewComment || `Pozo ${updatedRecord.pozo || existingRecord.pozo} actualizado desde Admin Campo.`).trim();
        const metadata = {
            record_id: updatedRecord.id,
            pozo: updatedRecord.pozo,
            source: 'campo-admin',
            changed_fields: Object.keys(report || {}).filter(fieldName => fieldName !== 'id')
        };

        const { error: reviewError } = await supabase
            .from('field_journey_review_log')
            .insert({
                journey_id: updatedRecord.journey_id,
                action: reviewAction,
                comment: reviewComment,
                performed_by_user_id: session.user.id,
                performed_by_email: session.user.email,
                metadata
            });

        if (reviewError) throw reviewError;

        return updatedRecord;
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function saveAdminFieldJourneyReview(journeyId, options = {}) {
    const { session } = await ensureFieldSessionAccess();
    await ensureFieldAdminReadAccess();

    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibió un identificador válido para guardar la revisión.');
    }

    const nextStatus = sanitizeReviewAction(options.status || 'under_review');
    const comment = String(options.comment || '').trim();
    const adminNotes = String(options.adminNotes || '').trim();
    const metadata = options.metadata && typeof options.metadata === 'object' ? options.metadata : {};

    try {
        const journeyUpdate = {
            admin_notes: adminNotes || null
        };

        if (nextStatus !== 'commented') {
            journeyUpdate.status = nextStatus;
            if (nextStatus === 'under_review') {
                journeyUpdate.review_started_at = new Date().toISOString();
            }
            if (['approved', 'rejected', 'published'].includes(nextStatus)) {
                journeyUpdate.reviewed_at = new Date().toISOString();
                journeyUpdate.reviewed_by_user_id = session.user.id;
                journeyUpdate.reviewed_by_email = session.user.email;
            }
            if (nextStatus === 'published') {
                journeyUpdate.published_at = new Date().toISOString();
                journeyUpdate.published_by_user_id = session.user.id;
                journeyUpdate.published_by_email = session.user.email;
            }
        }

        const { data: updatedJourney, error: journeyError } = await supabase
            .from('field_journeys')
            .update(journeyUpdate)
            .eq('id', normalizedJourneyId)
            .select('*')
            .single();

        if (journeyError) throw journeyError;

        const { error: reviewError } = await supabase
            .from('field_journey_review_log')
            .insert({
                journey_id: normalizedJourneyId,
                action: nextStatus,
                comment: comment || 'Revisión guardada desde Admin Campo.',
                performed_by_user_id: session.user.id,
                performed_by_email: session.user.email,
                metadata: {
                    source: 'campo-admin',
                    ...metadata
                }
            });

        if (reviewError) throw reviewError;

        return updatedJourney;
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

function mapWorkflowRecordToMonitoringRecord(record = {}) {
    const payload = record?.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};

    return {
        pozo_name: String(record.pozo || payload.pozo || '').trim().toUpperCase(),
        campo: String(record.campo || payload.campo || '').trim(),
        fecha: record.report_date || payload.fecha || null,
        hora: record.report_time || payload.hora || '00:00:00',
        frecuencia: normalizeOptionalNumber(record.frecuencia ?? payload.frecuencia),
        corriente_motor: normalizeOptionalNumber(record.i_motor ?? payload.i_motor),
        presion_thp: normalizeOptionalNumber(record.thp_psi ?? payload.thp_psi),
        presion_chp: normalizeOptionalNumber(record.chp_psi ?? payload.chp_psi),
        presion_lf: normalizeOptionalNumber(record.lf_psi ?? payload.lf_psi),
        pip: normalizeOptionalNumber(record.pip_psi ?? payload.pip_psi),
        tm: normalizeOptionalNumber(record.tm_f ?? payload.tm_f),
        vsd_a: normalizeOptionalNumber(record.i_vsd_a ?? payload.i_vsd_a ?? record.vsd_a ?? payload.vsd_a),
        vsd_b: normalizeOptionalNumber(record.i_vsd_b ?? payload.i_vsd_b ?? record.vsd_b ?? payload.vsd_b),
        vsd_c: normalizeOptionalNumber(record.i_vsd_c ?? payload.i_vsd_c ?? record.vsd_c ?? payload.vsd_c),
        sentido_giro: String(record.sentido_giro || payload.sentido_giro || '').trim(),
        estatus: String(record.estatus || payload.estatus || '').trim(),
        observaciones: String(record.observaciones_pozo || payload.observaciones_pozo || '').trim()
    };
}

function buildFieldPublicationComment(summary = {}) {
    return [
        `Subida operativa ejecutada desde Admin Campo.`,
        `Insertados: ${summary.inserted || 0}.`,
        `Actualizados: ${summary.updated || 0}.`,
        `Omitidos: ${summary.skipped || 0}.`
    ].join(' ');
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value ?? null);
}

function fallbackHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function createStableHash(value) {
    if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) {
        return fallbackHash(value);
    }

    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function getConsolidatedFieldValue(record = {}, payload = {}, fieldName = '') {
    if (fieldName === 'fecha') return record.report_date ?? payload.fecha ?? '';
    if (fieldName === 'hora') return record.report_time ?? payload.hora ?? '';
    if (fieldName === 'pozo') return String(record.pozo ?? payload.pozo ?? '').trim().toUpperCase();
    if (fieldName === 'campo') return String(record.campo ?? payload.campo ?? '').trim();
    if (fieldName === 'ef') return String(record.ef ?? payload.ef ?? '').trim();
    if (fieldName === 'estado') return String(record.estado ?? payload.estado ?? '').trim();
    if (fieldName === 'actividad') return String(record.actividad ?? payload.actividad ?? '').trim();
    if (fieldName === 'estatus') return String(record.estatus ?? payload.estatus ?? '').trim();
    return record[fieldName] ?? payload[fieldName] ?? '';
}

function buildConsolidatedFieldRowData(record = {}) {
    const payload = record.raw_payload && typeof record.raw_payload === 'object' ? record.raw_payload : {};
    return Object.fromEntries(REPORT_COLUMNS.map(([label, fieldName]) => [
        label,
        getConsolidatedFieldValue(record, payload, fieldName)
    ]));
}

function buildConsolidatedFieldRowHashSeed({ rowData, journeyId, record, index }) {
    return [
        'field_journey',
        journeyId,
        record.id || record.source_client_report_id || index,
        stableStringify(rowData)
    ].join('|');
}

async function buildConsolidatedFieldRows(records = [], journeyId = '') {
    return Promise.all((Array.isArray(records) ? records : []).map(async (record, index) => {
        const rowData = buildConsolidatedFieldRowData(record);
        const rowHashSeed = buildConsolidatedFieldRowHashSeed({ rowData, journeyId, record, index });

        return {
            source_type: 'field_journey',
            source_file_name: null,
            source_sheet_name: 'DASHBOARD GENERAL',
            source_row_number: null,
            source_journey_id: journeyId,
            source_record_id: record.id || null,
            row_hash: await createStableHash(rowHashSeed),
            pozo: rowData.POZO || null,
            campo: rowData.CAMPO || null,
            ef: rowData.EF || null,
            report_date: record.report_date || null,
            report_time: record.report_time || null,
            row_data: rowData,
            column_labels: Object.keys(rowData)
        };
    }));
}

async function upsertFieldJourneyIntoConsolidatedDashboard(records = [], journeyId = '') {
    const rows = await buildConsolidatedFieldRows(records, journeyId);
    if (!rows.length) return { saved: 0, error: null };

    const { error } = await supabase
        .from(CONSOLIDATED_OPERATIONAL_TABLE)
        .upsert(rows, { onConflict: 'row_hash' });

    if (error) {
        return { saved: 0, error };
    }

    return { saved: rows.length, error: null };
}

export async function previewAdminFieldJourneyPublication(journeyId) {
    await ensureFieldAdminReadAccess();

    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibió un identificador válido para preparar la subida.');
    }

    try {
        const { data: records, error } = await supabase
            .from('field_journey_records')
            .select('*')
            .eq('journey_id', normalizedJourneyId)
            .order('report_time', { ascending: true })
            .order('pozo', { ascending: true });

        if (error) throw error;

        const inheritedRecords = await inheritWorkflowRecordsProductionMeasures(records || []);
        const monitoringRecords = inheritedRecords.map(mapWorkflowRecordToMonitoringRecord);
        const preview = await previewMonitoringSync(monitoringRecords);

        return {
            journeyId: normalizedJourneyId,
            totalRecords: monitoringRecords.length,
            ...preview
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function publishAdminFieldJourneyToDashboard(journeyId) {
    const { session } = await ensureFieldSessionAccess();
    await ensureFieldAdminReadAccess();

    const normalizedJourneyId = String(journeyId || '').trim();
    if (!normalizedJourneyId) {
        throw new Error('No se recibió un identificador válido para publicar la jornada.');
    }

    try {
        const { data: records, error } = await supabase
            .from('field_journey_records')
            .select('*')
            .eq('journey_id', normalizedJourneyId)
            .order('report_time', { ascending: true })
            .order('pozo', { ascending: true });

        if (error) throw error;

        const inheritedRecords = await inheritWorkflowRecordsProductionMeasures(records || []);
        const monitoringRecords = inheritedRecords.map(mapWorkflowRecordToMonitoringRecord);
        const syncSummary = await syncMonitoringRecords(monitoringRecords);
        const consolidatedSummary = await upsertFieldJourneyIntoConsolidatedDashboard(inheritedRecords, normalizedJourneyId);

        const journeyUpdate = {
            status: 'published',
            published_at: new Date().toISOString(),
            published_by_user_id: session.user.id,
            published_by_email: session.user.email,
            reviewed_at: new Date().toISOString(),
            reviewed_by_user_id: session.user.id,
            reviewed_by_email: session.user.email
        };

        const { error: journeyError } = await supabase
            .from('field_journeys')
            .update(journeyUpdate)
            .eq('id', normalizedJourneyId);

        if (journeyError) throw journeyError;

        const { error: reviewError } = await supabase
            .from('field_journey_review_log')
            .insert({
                journey_id: normalizedJourneyId,
                action: 'published',
                comment: buildFieldPublicationComment(syncSummary),
                performed_by_user_id: session.user.id,
                performed_by_email: session.user.email,
                metadata: {
                    source: 'campo-admin',
                    target: 'monitoreo_pozos',
                    inserted: syncSummary.inserted || 0,
                    updated: syncSummary.updated || 0,
                    skipped: syncSummary.skipped || 0,
                    total: syncSummary.total || monitoringRecords.length,
                    consolidated_dashboard_saved: consolidatedSummary.saved || 0,
                    consolidated_dashboard_error: consolidatedSummary.error?.message || null
                }
            });

        if (reviewError) throw reviewError;

        return {
            journeyId: normalizedJourneyId,
            totalRecords: monitoringRecords.length,
            consolidatedSaved: consolidatedSummary.saved || 0,
            consolidatedError: consolidatedSummary.error?.message || null,
            ...syncSummary
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}

export async function submitFieldTicket(journeyKey = null, subject = '', message = '', attachments = []) {
    const { session } = await ensureFieldSessionAccess();

    if (!subject || !message) {
        throw new Error('Asunto y mensaje son obligatorios para enviar un ticket.');
    }

    // If attachments come as data URLs or the readFilesAsDataURLs shape, try uploading them
    let processedAttachments = Array.isArray(attachments) ? attachments : [];
    try {
        // detect objects from readFilesAsDataURLs: have .dataUrl property
        const hasDataUrls = processedAttachments.some(a => a && (a.dataUrl || (typeof a === 'string' && a.startsWith('data:'))));
        if (hasDataUrls) {
            processedAttachments = await uploadAttachments(processedAttachments);
        }
    } catch (uploadErr) {
        // If upload fails, continue with original attachments so fallback to localStorage still works
        console.warn('uploadAttachments failed', uploadErr);
    }

    const row = {
        journey_key: journeyKey || null,
        subject: String(subject).slice(0, 200),
        message: String(message).slice(0, 4000),
        attachments: processedAttachments,
        submitted_by_user_id: session.user.id,
        submitted_by_email: session.user.email,
        submitted_at: new Date().toISOString(),
        source: 'field-web'
    };

    try {
        const { data, error } = await supabase
            .from('field_tickets')
            .insert(row)
            .select('*')
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        // If insert fails for any reason, try to recover: detect missing columns and retry without them,
        // but ultimately always persist locally so user workflow is not blocked.
        const messageText = String(error?.message || error || '');
        try {
            const missingCols = [];
            const m1 = messageText.match(/column\s+(?:\S+\.)?([a-z0-9_]+)\s+does not exist/i);
            if (m1 && m1[1]) missingCols.push(m1[1]);
            const m2 = messageText.match(/could not find the '?([a-z0-9_]+)'? column of '?field_tickets'? in the schema cache/i);
            if (m2 && m2[1]) missingCols.push(m2[1]);

            if (missingCols.length > 0) {
                const cleanedRow = { ...row };
                missingCols.forEach(col => delete cleanedRow[col]);
                try {
                    const { data: retryData, error: retryErr } = await supabase
                        .from('field_tickets')
                        .insert(cleanedRow)
                        .select('*')
                        .single();
                    if (!retryErr) return retryData;
                    console.warn('Retry insert without missing columns failed', retryErr);
                } catch (retryCatch) {
                    console.warn('Retry insert error', retryCatch);
                }
            }
        } catch (e) {
            console.warn('Error parsing missing-columns from insert error', e);
        }

        // Always attempt local fallback so UX continues working.
        try {
            const localKey = 'uv-field-tickets';
            const raw = localStorage.getItem(localKey);
            const existing = raw ? JSON.parse(raw) : [];
            const localId = (Date.now()).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            const saved = {
                id: localId,
                journey_key: row.journey_key,
                subject: row.subject,
                message: row.message,
                attachments: row.attachments || [],
                submitted_by_user_id: row.submitted_by_user_id,
                submitted_by_email: row.submitted_by_email,
                submitted_at: row.submitted_at,
                source: row.source,
                status: 'open',
                _local: true,
                _error: messageText
            };
            existing.push(saved);
            localStorage.setItem(localKey, JSON.stringify(existing));
            console.warn('Ticket saved locally due to insert error:', messageText);
            return saved;
        } catch (innerErr) {
            console.error('Failed to save ticket locally after insert error', innerErr);
            throw wrapFieldJourneyError(innerErr);
        }
    }
}

// --- Attachments upload helpers ---
const FIELD_TICKET_BUCKET = 'field-ticket-attachments';

function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const matches = parts[0].match(/data:([^;]+);base64/);
    const mime = matches ? matches[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function safeFileName(name = '') {
    return String(name).replace(/[^a-z0-9_.-]/gi, '_').slice(0, 120);
}

async function uploadAttachments(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];

    const uploaded = [];
    for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];

        // support objects from readFilesAsDataURLs: {name,type,size,dataUrl}
        if (att && att.dataUrl) {
            const blob = dataUrlToBlob(att.dataUrl);
            const extName = (att.name && att.name.split('.').pop()) || (blob.type.split('/').pop()) || 'bin';
            const name = safeFileName(att.name || `attachment_${i}.${extName}`);
            const path = `tickets/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${name}`;

            try {
                const { data: upData, error: upErr } = await supabase.storage
                    .from(FIELD_TICKET_BUCKET)
                    .upload(path, blob, { cacheControl: '3600', upsert: false });

                if (upErr) throw upErr;

                let url = null;
                try {
                    const pub = supabase.storage.from(FIELD_TICKET_BUCKET).getPublicUrl(path);
                    if (pub && pub.data && pub.data.publicUrl) url = pub.data.publicUrl;
                } catch (e) {
                    // ignore
                }

                if (!url) {
                    try {
                        const { data: signed, error: signErr } = await supabase.storage
                            .from(FIELD_TICKET_BUCKET)
                            .createSignedUrl(path, 60 * 60);
                        if (!signErr && signed && signed.signedURL) url = signed.signedURL;
                    } catch (e) {
                        // ignore
                    }
                }

                uploaded.push({ name: att.name || name, type: att.type || blob.type, size: att.size || blob.size, path, url });
            } catch (err) {
                // upload failed: include inline dataUrl fallback so admin still sees image
                uploaded.push({ name: att.name || `attachment_${i}`, type: att.type || 'application/octet-stream', size: att.size || 0, url: att.dataUrl, _local_fallback: true });
            }
        } else if (att && typeof att === 'string' && att.startsWith('data:')) {
            // simple dataUrl string
            const blob = dataUrlToBlob(att);
            const name = safeFileName(`attachment_${i}`);
            const path = `tickets/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${name}`;
            try {
                const { data: upData, error: upErr } = await supabase.storage
                    .from(FIELD_TICKET_BUCKET)
                    .upload(path, blob, { cacheControl: '3600', upsert: false });
                if (upErr) throw upErr;

                let url = null;
                try {
                    const pub = supabase.storage.from(FIELD_TICKET_BUCKET).getPublicUrl(path);
                    if (pub && pub.data && pub.data.publicUrl) url = pub.data.publicUrl;
                } catch (e) {}

                if (!url) {
                    try {
                        const { data: signed, error: signErr } = await supabase.storage
                            .from(FIELD_TICKET_BUCKET)
                            .createSignedUrl(path, 60 * 60);
                        if (!signErr && signed && signed.signedURL) url = signed.signedURL;
                    } catch (e) {}
                }

                uploaded.push({ name, type: blob.type, size: blob.size, path, url });
            } catch (err) {
                uploaded.push({ name: `attachment_${i}`, type: blob.type, size: blob.size, url: att, _local_fallback: true });
            }
        } else if (att && att.url) {
            // already uploaded
            uploaded.push(att);
        }
    }

    return uploaded;
}

export async function getFieldTicketsByJourney(journeyKey = null) {
    try {
        if (!journeyKey) return [];
        // try ordering by submitted_at, but some schemas may not have that column
        try {
            const { data, error } = await supabase
                .from('field_tickets')
                .select('*')
                .eq('journey_key', journeyKey)
                .order('submitted_at', { ascending: false });
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        } catch (err) {
            // retry without ordering if column missing
            const { data, error } = await supabase
                .from('field_tickets')
                .select('*')
                .eq('journey_key', journeyKey);
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        }
    } catch (err) {
        // on errors (table missing, RLS) return empty and let client fallback to local
        console.warn('getFieldTicketsByJourney error', err?.message || err);
        return [];
    }
}
