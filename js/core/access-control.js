const READ_ONLY_EMAILS = new Set([
    'ingeniero@uvservicios.com'
]);

const FIELD_EMAILS = new Set([
    'ingcampo@uvservicios.com'
]);

export const ACCESS_ROLES = Object.freeze({
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    CAMPO: 'campo',
    CLIENTE_VIEW: 'cliente_view'
});

export function resolveAccessRole(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (READ_ONLY_EMAILS.has(normalizedEmail)) {
        return ACCESS_ROLES.CLIENTE_VIEW;
    }

    if (FIELD_EMAILS.has(normalizedEmail)) {
        return ACCESS_ROLES.CAMPO;
    }

    return ACCESS_ROLES.ADMIN;
}

export function getAccessProfile(sessionOrUser) {
    const user = sessionOrUser?.user || sessionOrUser || null;
    const email = String(user?.email || '').trim().toLowerCase();
    const role = resolveAccessRole(email);
    const isReadOnly = role === ACCESS_ROLES.CLIENTE_VIEW;
    const isFieldOperator = role === ACCESS_ROLES.CAMPO;
    const isSupervisor = role === ACCESS_ROLES.SUPERVISOR;
    const isAdmin = role === ACCESS_ROLES.ADMIN;

    return {
        email,
        role,
        isReadOnly,
        isFieldOperator,
        canViewDashboard: !isReadOnly,
        canViewManagement: isAdmin || isSupervisor,
        canEditData: isAdmin || isSupervisor,
        canCreateFieldReports: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldModule: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldHistory: isAdmin || isSupervisor || isFieldOperator,
        canViewJourneyModule: isAdmin || isSupervisor || isFieldOperator,
        canViewJourneyHistory: isAdmin || isSupervisor || isFieldOperator
    };
}

export function getDefaultRouteForAccessProfile(accessProfile) {
    if (accessProfile?.isFieldOperator) {
        return 'jornada.html';
    }

    return 'dashboard.html';
}
