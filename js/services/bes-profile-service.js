/**
 * Servicio de perfil BES.
 */

import { supabase } from '../supabaseClient.js';
import { ensureMonitoringReadAccess, ensureMonitoringWriteAccess } from './monitoring-access.js';
import { wrapBESProfileError } from './monitoring-shared.js';

const BES_PROFILE_TEXT_FIELDS = [
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
    'profile_notes'
];

function normalizeOptionalText(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized || /^(0+|--|n\/a|na|s\/n|sin dato|sin datos)$/i.test(normalized)) return null;
    return normalized || null;
}

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
        pump_type: String(data?.pump_type || data?.multiphase_pump || data?.pump_model || '').trim(),
        installed_at: String(data?.installed_at || '').trim() || null,
        updated_at: new Date().toISOString()
    };

    BES_PROFILE_TEXT_FIELDS.forEach(fieldName => {
        normalized[fieldName] = normalizeOptionalText(data?.[fieldName]);
    });

    if (!normalized.pozo_name) {
        throw new Error('Nombre del pozo es requerido para guardar la ficha BES.');
    }

    if (!normalized.pump_type) {
        throw new Error('El tipo de bomba o bomba multifásica es requerido.');
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
