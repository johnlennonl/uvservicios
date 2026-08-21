import { supabase } from '../supabaseClient.js';

const CONTRACTS_TABLE = 'operational_contracts';
const TECHNICIANS_TABLE = 'field_technicians';
const WELLS_TABLE = 'field_well_catalog';
const USER_SCOPES_TABLE = 'user_operational_scopes';

export const DEFAULT_OPERATIONAL_SCOPE = 'ceiba_tomoporo';

export function normalizeOperationalScope(value) {
    return String(value || '').trim().toLowerCase() || DEFAULT_OPERATIONAL_SCOPE;
}

function buildOperationalCatalogError(error) {
    const message = String(error?.message || error || '');
    if (/operational_contracts|field_technicians|field_well_catalog|user_operational_scopes/i.test(message)) {
        return new Error('Falta crear las tablas de contratos operativos. Ejecuta supabase/operational_contracts.sql en Supabase y recarga la pagina.');
    }

    return error instanceof Error ? error : new Error(message || 'Error consultando contratos operativos.');
}

export async function getOperationalContracts({ includeInactive = false } = {}) {
    try {
        let query = supabase
            .from(CONTRACTS_TABLE)
            .select('*')
            .order('display_name', { ascending: true });

        if (!includeInactive) query = query.eq('active', true);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function getFieldTechniciansByScope(scopeKey, { includeInactive = false } = {}) {
    try {
        let query = supabase
            .from(TECHNICIANS_TABLE)
            .select('*')
            .eq('operational_scope', normalizeOperationalScope(scopeKey))
            .order('full_name', { ascending: true });

        if (!includeInactive) query = query.eq('active', true);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function getFieldWellsByScope(scopeKey, { includeInactive = false } = {}) {
    try {
        let query = supabase
            .from(WELLS_TABLE)
            .select('*')
            .eq('operational_scope', normalizeOperationalScope(scopeKey))
            .order('campo_name', { ascending: true })
            .order('pozo_name', { ascending: true });

        if (!includeInactive) query = query.eq('active', true);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function getFieldWellRecordStatus(pozoNames = []) {
    const names = [...new Set((Array.isArray(pozoNames) ? pozoNames : [pozoNames])
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean))];

    if (names.length === 0) return new Map();

    try {
        const [monitoringResult, technicalResult] = await Promise.all([
            supabase
                .from('monitoreo_pozos')
                .select('pozo_name')
                .in('pozo_name', names),
            supabase
                .from('well_production')
                .select('pozo_name')
                .in('pozo_name', names)
        ]);

        if (monitoringResult.error) throw monitoringResult.error;
        if (technicalResult.error) throw technicalResult.error;

        const statusByPozo = new Map(names.map(name => [name, { hasMonitoringRecords: false, hasTechnicalRecord: false }]));

        (monitoringResult.data || []).forEach(row => {
            const pozoName = String(row?.pozo_name || '').trim().toUpperCase();
            if (!statusByPozo.has(pozoName)) return;
            statusByPozo.get(pozoName).hasMonitoringRecords = true;
        });

        (technicalResult.data || []).forEach(row => {
            const pozoName = String(row?.pozo_name || '').trim().toUpperCase();
            if (!statusByPozo.has(pozoName)) return;
            statusByPozo.get(pozoName).hasTechnicalRecord = true;
        });

        return statusByPozo;
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function upsertFieldTechnician({ id = null, fullName, operationalScope, active = true }) {
    const payload = {
        full_name: String(fullName || '').trim().toUpperCase(),
        operational_scope: normalizeOperationalScope(operationalScope),
        active: Boolean(active),
        updated_at: new Date().toISOString()
    };

    if (!payload.full_name) throw new Error('Indica el nombre del tecnico.');
    if (id) payload.id = id;

    try {
        const { data, error } = await supabase
            .from(TECHNICIANS_TABLE)
            .upsert(payload, { onConflict: id ? 'id' : 'full_name,operational_scope' })
            .select('*')
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function upsertFieldWell({ id = null, pozoName, campoName, operationalScope, active = true }) {
    const payload = {
        pozo_name: String(pozoName || '').trim().toUpperCase(),
        campo_name: String(campoName || '').trim().toUpperCase(),
        operational_scope: normalizeOperationalScope(operationalScope),
        active: Boolean(active),
        updated_at: new Date().toISOString()
    };

    if (!payload.pozo_name) throw new Error('Indica el nombre del pozo.');
    if (!payload.campo_name) throw new Error('Indica el campo del pozo.');
    if (id) payload.id = id;

    try {
        const { data, error } = await supabase
            .from(WELLS_TABLE)
            .upsert(payload, { onConflict: id ? 'id' : 'pozo_name' })
            .select('*')
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function deleteFieldWell(id) {
    const wellId = String(id || '').trim();
    if (!wellId) throw new Error('No se pudo identificar el pozo a eliminar.');

    try {
        const { data, error } = await supabase
            .from(WELLS_TABLE)
            .delete()
            .eq('id', wellId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('No tienes permisos suficientes en la base de datos (RLS) para eliminar este pozo, o el pozo ya fue eliminado por otro usuario.');
        }
        return true;
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function getUserOperationalScopes(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from(USER_SCOPES_TABLE)
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function setUserOperationalScopes(userId, scopeKeys = [], { defaultScope = '', canSwitch = false } = {}) {
    const userScopes = [...new Set((Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys])
        .map(normalizeOperationalScope)
        .filter(Boolean))];

    if (!userId || userScopes.length === 0) return [];

    const selectedDefault = userScopes.includes(normalizeOperationalScope(defaultScope))
        ? normalizeOperationalScope(defaultScope)
        : userScopes[0];

    try {
        const { error: deleteError } = await supabase
            .from(USER_SCOPES_TABLE)
            .delete()
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        const payload = userScopes.map(scopeKey => ({
            user_id: userId,
            operational_scope: scopeKey,
            is_default: scopeKey === selectedDefault,
            can_switch: Boolean(canSwitch && userScopes.length > 1),
            updated_at: new Date().toISOString()
        }));

        const { data, error } = await supabase
            .from(USER_SCOPES_TABLE)
            .insert(payload)
            .select('*');

        if (error) throw error;
        return data || [];
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}

export async function syncDiscoveredWellsToCatalog(targetScope = DEFAULT_OPERATIONAL_SCOPE) {
    try {
        const normalizedTargetScope = normalizeOperationalScope(targetScope);
        
        const { data: catalogWells, error: catalogError } = await supabase
            .from(WELLS_TABLE)
            .select('pozo_name');
        if (catalogError) throw catalogError;
        
        const existingNames = new Set((catalogWells || []).map(w => String(w.pozo_name || '').trim().toUpperCase()).filter(Boolean));
        
        const [monitoringRes, productionRes] = await Promise.all([
            supabase.from('monitoreo_pozos').select('pozo_name, campo_name'),
            supabase.from('well_production').select('pozo_name, campo_name')
        ]);
        
        const discoveredMap = new Map();
        
        (monitoringRes.data || []).forEach(row => {
            const name = String(row?.pozo_name || '').trim().toUpperCase();
            if (name && !existingNames.has(name) && !discoveredMap.has(name)) {
                discoveredMap.set(name, String(row?.campo_name || '').trim().toUpperCase());
            }
        });
        
        (productionRes.data || []).forEach(row => {
            const name = String(row?.pozo_name || '').trim().toUpperCase();
            if (name && !existingNames.has(name) && !discoveredMap.has(name)) {
                discoveredMap.set(name, String(row?.campo_name || '').trim().toUpperCase());
            }
        });
        
        if (discoveredMap.size === 0) {
            return { added: 0, totalDiscovered: 0 };
        }
        
        function inferScopeAndField(pozoName, rawField) {
            const cleanPozo = String(pozoName).trim().toUpperCase();
            let scope = normalizedTargetScope;
            let field = rawField || '';
            
            if (cleanPozo.startsWith('MG') || cleanPozo.includes('MENE')) {
                scope = 'bmm';
                if (!field) field = 'MENE GRANDE';
            } else if (cleanPozo.startsWith('MOT') || cleanPozo.includes('MOTATAN')) {
                scope = 'bmm';
                if (!field) field = 'MOTATAN';
            } else if (cleanPozo.startsWith('BAR') || cleanPozo.includes('BARUA')) {
                scope = 'bmm';
                if (!field) field = 'BARUA';
            } else if (cleanPozo.startsWith('CEI') || cleanPozo.includes('CEIBA')) {
                scope = 'ceiba_tomoporo';
                if (!field) field = 'LA CEIBA';
            } else if (cleanPozo.startsWith('TOM') || cleanPozo.includes('TOMOPORO')) {
                scope = 'ceiba_tomoporo';
                if (!field) field = 'TOMOPORO';
            }
            
            if (!field) field = scope === 'bmm' ? 'BARUA' : 'LA CEIBA';
            return { scope, field };
        }
        
        const payload = Array.from(discoveredMap.entries()).map(([pozoName, rawField]) => {
            const { scope, field } = inferScopeAndField(pozoName, rawField);
            return {
                pozo_name: pozoName,
                campo_name: field,
                operational_scope: scope,
                active: true,
                updated_at: new Date().toISOString()
            };
        });
        
        const { data: inserted, error: insertError } = await supabase
            .from(WELLS_TABLE)
            .upsert(payload, { onConflict: 'pozo_name' })
            .select('*');
            
        if (insertError) throw insertError;
        return { added: inserted?.length || 0, totalDiscovered: discoveredMap.size };
    } catch (error) {
        throw buildOperationalCatalogError(error);
    }
}