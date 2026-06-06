/**
 * Servicio de perfil BES.
 */

import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess, ensureMonitoringWriteAccess } from './monitoring-access.js';
import { wrapBESProfileError } from './monitoring-shared.js';

export async function getWellBESProfile(pozoName) {
    if (!pozoName || pozoName === 'Todas') return null;
    await ensureMonitoringReadAccess();

    try {
        const { data, error } = await supabase
            .from('well_bes_profile')
            .select('*')
            .eq('pozo_name', pozoName)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/well_bes_profile/i.test(message)) {
            console.warn('Tabla well_bes_profile no disponible todavía.');
            return null;
        }
        throw wrapBESProfileError(error);
    }
}

export async function getRecentWellBESProfiles(limit = 10) {
    await ensureMonitoringReadAccess();
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;

    try {
        const { data, error } = await supabase
            .from('well_bes_profile')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(safeLimit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/well_bes_profile/i.test(message) || /updated_at/i.test(message)) {
            return [];
        }
        throw wrapBESProfileError(error);
    }
}

export async function upsertWellBESProfile(data) {
    await ensureMonitoringWriteAccess();
    const normalized = {
        pozo_name: String(data?.pozo_name || '').trim(),
        pump_type: String(data?.pump_type || '').trim(),
        updated_at: new Date().toISOString()
    };

    if (!normalized.pozo_name) {
        throw new Error('Nombre del pozo es requerido para guardar el tipo de bomba.');
    }

    if (!normalized.pump_type) {
        throw new Error('El tipo de bomba es requerido.');
    }

    try {
        const { data: result, error } = await supabase
            .from('well_bes_profile')
            .upsert(normalized, { onConflict: 'pozo_name' })
            .select()
            .maybeSingle();

        if (error) throw error;
        return result || normalized;
    } catch (error) {
        throw wrapBESProfileError(error);
    }
}
