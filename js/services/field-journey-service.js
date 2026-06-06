import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';
import { previewMonitoringSync, syncMonitoringRecords } from './monitoring-records-service.js';

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

function normalizeJourneyStatuses(statuses = []) {
    const list = Array.isArray(statuses) ? statuses : [statuses];
    const normalized = list
        .map(normalizeJourneyStatus)
        .filter(Boolean);

    return normalized.length > 0 ? [...new Set(normalized)] : ['submitted', 'under_review'];
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

    return {
        id: journeyId || undefined,
        submitted_by_user_id: session.user.id,
        submitted_by_email: session.user.email,
        journey_date: firstReport.fecha,
        jornada: firstReport.jornada || 'Diurna',
        equipo_guardia: String(firstReport.equipo_guardia || '').trim(),
        locacion_jornada: String(firstReport.locacion_jornada || '').trim() || null,
        status: 'submitted',
        submission_source: 'field-web',
        submitted_at: submittedAt
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

    try {
        const { data, error } = await supabase
            .from('field_journey_reports')
            .select('*')
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

export async function submitFieldJourneyWorkflow(reports = [], options = {}) {
    const { session, accessProfile } = await ensureFieldSessionAccess();
    if (!accessProfile.canCreateFieldReports || accessProfile.isReadOnly) {
        throw new Error('Tu usuario no tiene permisos para guardar jornadas de Campo.');
    }

    const normalizedReports = (Array.isArray(reports) ? reports : []).filter(report => report?.id && report?.pozo && report?.fecha);

    if (normalizedReports.length === 0) {
        throw new Error('No hay pozos válidos para enviar al workflow administrativo de Campo.');
    }

    const requestedJourneyId = String(options.journeyId || '').trim() || null;

    try {
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
        vsd_a: null,
        vsd_b: null,
        vsd_c: null,
        sentido_giro: String(record.sentido_giro || payload.sentido_giro || '').trim(),
        estatus: String(record.estatus || payload.estatus || '').trim(),
        observaciones: String(record.observaciones_pozo || payload.observaciones_pozo || payload.diagnostico || '').trim()
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

        const monitoringRecords = (records || []).map(mapWorkflowRecordToMonitoringRecord);
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

        const monitoringRecords = (records || []).map(mapWorkflowRecordToMonitoringRecord);
        const syncSummary = await syncMonitoringRecords(monitoringRecords);

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
                    total: syncSummary.total || monitoringRecords.length
                }
            });

        if (reviewError) throw reviewError;

        return {
            journeyId: normalizedJourneyId,
            totalRecords: monitoringRecords.length,
            ...syncSummary
        };
    } catch (error) {
        throw wrapFieldJourneyError(error);
    }
}