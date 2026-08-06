import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';
import { getActiveOperationalScope } from './operational-scope-context.js';

const ANNOTATIONS_TABLE = 'monitoring_point_annotations';

function wrapAnnotationError(error) {
    const message = String(error?.message || error || '');

    if (/monitoring_point_annotations|schema cache|does not exist|Could not find the table/i.test(message)) {
        return new Error('Falta crear la tabla monitoring_point_annotations en Supabase. Ejecuta supabase/monitoring_point_annotations.sql y vuelve a intentar.');
    }

    if (/row-level security|permission denied|violates row-level security/i.test(message)) {
        return new Error('Tu usuario no tiene permisos para gestionar anotaciones de ingeniería.');
    }

    return error instanceof Error ? error : new Error(message || 'Error desconocido gestionando anotaciones de ingeniería.');
}

async function ensureAnnotationSession() {
    const session = await getSession();
    const accessProfile = getAccessProfile(session);

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para gestionar anotaciones de ingeniería.');
    }

    return { session, accessProfile };
}

async function ensureAnnotationWriteAccess() {
    const { session, accessProfile } = await ensureAnnotationSession();

    if (!accessProfile.canViewManagement || accessProfile.isReadOnly || accessProfile.isFieldOperator) {
        throw new Error('Solo Administración o Supervisión puede crear anotaciones de ingeniería.');
    }

    return session;
}

function normalizeAnnotationText(value) {
    return String(value || '').trim();
}

function normalizeAnnotationTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '00:00:00';
    if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
    return raw;
}

function normalizeAnnotationPozoNames(filters = {}) {
    return [...new Set((Array.isArray(filters.pozoNames) ? filters.pozoNames : [filters.pozoName || filters.pozoNames])
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean))];
}

export function buildMonitoringAnnotationKey(annotation = {}) {
    return [
        String(annotation.operational_scope || getActiveOperationalScope() || 'ceiba_tomoporo').trim().toLowerCase(),
        String(annotation.pozo_name || '').trim().toUpperCase(),
        String(annotation.chart_key || '').trim(),
        String(annotation.variable_key || '').trim(),
        String(annotation.point_fecha || '').trim().slice(0, 10),
        normalizeAnnotationTime(annotation.point_hora).slice(0, 5)
    ].join('|');
}

export async function getMonitoringPointAnnotations(filters = {}) {
    await ensureAnnotationSession();

    const operationalScope = normalizeAnnotationText(filters.operationalScope || getActiveOperationalScope()).toLowerCase() || 'ceiba_tomoporo';
    const pozoNames = normalizeAnnotationPozoNames(filters);

    if (!pozoNames.length) return [];

    try {
        let query = supabase
            .from(ANNOTATIONS_TABLE)
            .select('*')
            .eq('operational_scope', operationalScope)
            .in('pozo_name', pozoNames)
            .is('deleted_at', null)
            .order('point_fecha', { ascending: true })
            .order('point_hora', { ascending: true });

        if (filters.startDate) query = query.gte('point_fecha', filters.startDate);
        if (filters.endDate) query = query.lte('point_fecha', filters.endDate);

        const { data, error } = await query;
        if (error) throw error;

        return Array.isArray(data) ? data : [];
    } catch (error) {
        throw wrapAnnotationError(error);
    }
}

export async function getMonitoringPointAnnotationsPage(filters = {}) {
    await ensureAnnotationSession();

    const operationalScope = normalizeAnnotationText(filters.operationalScope || getActiveOperationalScope()).toLowerCase() || 'ceiba_tomoporo';
    const pozoNames = normalizeAnnotationPozoNames(filters);
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize || 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
        let query = supabase
            .from(ANNOTATIONS_TABLE)
            .select('*', { count: 'exact' })
            .eq('operational_scope', operationalScope)
            .is('deleted_at', null)
            .order('point_fecha', { ascending: false })
            .order('point_hora', { ascending: false })
            .order('updated_at', { ascending: false, nullsFirst: false })
            .range(from, to);

        if (pozoNames.length) query = query.in('pozo_name', pozoNames);
        if (filters.startDate) query = query.gte('point_fecha', filters.startDate);
        if (filters.endDate) query = query.lte('point_fecha', filters.endDate);

        const { data, error, count } = await query;
        if (error) throw error;

        return {
            data: Array.isArray(data) ? data : [],
            count: Number(count || 0),
            page,
            pageSize
        };
    } catch (error) {
        throw wrapAnnotationError(error);
    }
}

export async function upsertMonitoringPointAnnotation(point = {}, comment = '') {
    const session = await ensureAnnotationWriteAccess();
    const cleanedComment = normalizeAnnotationText(comment);

    if (!cleanedComment) {
        throw new Error('Escribe un comentario técnico para guardar la anotación.');
    }

    const operationalScope = normalizeAnnotationText(point.operationalScope || getActiveOperationalScope()).toLowerCase() || 'ceiba_tomoporo';
    const pozoName = String(point.pozoName || '').trim().toUpperCase();
    const chartKey = normalizeAnnotationText(point.chartKey);
    const variableKey = normalizeAnnotationText(point.variableKey);
    const variableLabel = normalizeAnnotationText(point.variableLabel || variableKey);
    const pointFecha = normalizeAnnotationText(point.fecha).slice(0, 10);
    const pointHora = normalizeAnnotationTime(point.hora);
    const pointValue = point.value === '' || point.value === null || point.value === undefined ? null : Number(point.value);

    if (!pozoName || !chartKey || !variableKey || !pointFecha || !pointHora) {
        throw new Error('No se pudo identificar completamente el punto de la gráfica.');
    }

    try {
        const { data: existing, error: existingError } = await supabase
            .from(ANNOTATIONS_TABLE)
            .select('id')
            .eq('operational_scope', operationalScope)
            .eq('pozo_name', pozoName)
            .eq('chart_key', chartKey)
            .eq('variable_key', variableKey)
            .eq('point_fecha', pointFecha)
            .eq('point_hora', pointHora)
            .is('deleted_at', null)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing?.id) {
            const { data, error } = await supabase
                .from(ANNOTATIONS_TABLE)
                .update({
                    point_value: Number.isFinite(pointValue) ? pointValue : null,
                    comment: cleanedComment,
                    updated_by_user_id: session.user.id,
                    updated_by_email: session.user.email,
                    updated_at: new Date().toISOString(),
                    metadata: {
                        source: 'dashboard-chart',
                        last_action: 'update'
                    }
                })
                .eq('id', existing.id)
                .select('*')
                .single();

            if (error) throw error;
            return data;
        }

        const { data, error } = await supabase
            .from(ANNOTATIONS_TABLE)
            .insert({
                operational_scope: operationalScope,
                pozo_name: pozoName,
                chart_key: chartKey,
                variable_key: variableKey,
                variable_label: variableLabel,
                point_fecha: pointFecha,
                point_hora: pointHora,
                point_value: Number.isFinite(pointValue) ? pointValue : null,
                comment: cleanedComment,
                created_by_user_id: session.user.id,
                created_by_email: session.user.email,
                metadata: {
                    source: 'dashboard-chart',
                    initial_value: Number.isFinite(pointValue) ? pointValue : null
                }
            })
            .select('*')
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        throw wrapAnnotationError(error);
    }
}

export async function deleteMonitoringPointAnnotation(annotationId, reason = '') {
    const session = await ensureAnnotationWriteAccess();
    const id = normalizeAnnotationText(annotationId);

    if (!id) {
        throw new Error('No se pudo identificar la anotación a eliminar.');
    }

    try {
        const { data, error } = await supabase
            .from(ANNOTATIONS_TABLE)
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by_user_id: session.user.id,
                deleted_by_email: session.user.email,
                delete_reason: normalizeAnnotationText(reason) || 'Eliminada desde panel de anotaciones',
                updated_by_user_id: session.user.id,
                updated_by_email: session.user.email,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .is('deleted_at', null)
            .select('*')
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        throw wrapAnnotationError(error);
    }
}
