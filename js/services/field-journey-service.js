import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';

async function ensureFieldWriteAccess() {
    const session = await getSession();
    const accessProfile = getAccessProfile(session);

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para guardar la jornada en Supabase.');
    }

    if (!accessProfile.canCreateFieldReports || accessProfile.isReadOnly) {
        throw new Error('Tu usuario no tiene permisos para guardar jornadas de Campo.');
    }

    return session;
}

function wrapFieldJourneyError(error) {
    const message = String(error?.message || error || '');

    if (/field_journey_reports/i.test(message)) {
        return new Error('Falta crear la tabla de jornadas de Campo en Supabase. Ejecuta el script supabase/field_journey_reports.sql y vuelve a intentar.');
    }

    return error instanceof Error ? error : new Error(message || 'Error desconocido guardando la jornada de Campo.');
}

function normalizeNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
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