import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';

export async function ensureMonitoringReadAccess() {
    const session = await getSession();

    if (!session?.user) {
        throw new Error('Debes iniciar sesión para consultar información de monitoreo.');
    }

    return {
        session,
        accessProfile: getAccessProfile(session)
    };
}

export async function ensureMonitoringWriteAccess() {
    const { session, accessProfile } = await ensureMonitoringReadAccess();

    if (!accessProfile.canEditData) {
        throw new Error('Tu usuario no tiene permisos para modificar información técnica.');
    }

    return {
        session,
        accessProfile
    };
}
