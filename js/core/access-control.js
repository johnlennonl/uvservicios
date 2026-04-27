export const ACCESS_ROLES = Object.freeze({
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    CAMPO: 'campo',
    CLIENTE_VIEW: 'cliente_view'
});

const ALLOWED_ACCESS_ROLES = new Set(Object.values(ACCESS_ROLES));

function normalizeRole(value) {
    const normalizedRole = String(value || '').trim().toLowerCase();
    return ALLOWED_ACCESS_ROLES.has(normalizedRole)
        ? normalizedRole
        : ACCESS_ROLES.CLIENTE_VIEW;
}

function readRoleFromClaims(user = {}) {
    return normalizeRole(
        user?.app_metadata?.role
        || user?.user_metadata?.role
        || user?.role
    );
}

export function resolveAccessRole(sessionOrUser) {
    const user = sessionOrUser?.user || sessionOrUser || null;

    return readRoleFromClaims(user);
}

export function getAccessProfile(sessionOrUser) {
    const user = sessionOrUser?.user || sessionOrUser || null;
    const email = String(user?.email || '').trim().toLowerCase();
    const role = resolveAccessRole(user);
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

    if (accessProfile?.isReadOnly) {
        return 'dashboard.html';
    }

    return 'dashboard.html';
}
