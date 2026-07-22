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
        canViewDashboard: true,
        canViewConsolidado: true,
        canModifyConsolidadoBase: isAdmin || isSupervisor,
        canViewManagement: isAdmin || isSupervisor,
        canEditData: isAdmin || isSupervisor,
        canCreateFieldReports: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldModule: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldHistory: true,
        canViewJourneyModule: isAdmin || isSupervisor || isFieldOperator,
        canViewJourneyHistory: true,
        canViewStats: true
    };
}

export function getDefaultRouteForAccessProfile(accessProfile) {
    if (accessProfile?.isFieldOperator) {
        return 'field.html';
    }

    return 'dashboard.html';
}

export function applyNavigationAccessProfile(accessProfile, root = document) {
    const hideLinks = hrefs => {
        hrefs.forEach(href => {
            root.querySelectorAll(`a[href="${href}"]`).forEach(link => {
                link.style.display = 'none';
                link.setAttribute('aria-hidden', 'true');
                link.tabIndex = -1;
            });
        });
    };

    const renameDataLinks = () => {
        root.querySelectorAll('a[href="data.html"]').forEach(link => {
            const label = link.querySelector('span');
            if (label) {
                label.textContent = 'Historial';
                return;
            }

            const textNode = [...link.childNodes]
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .find(node => node.textContent.trim());

            if (textNode) textNode.textContent = ' Historial';
        });
    };

    if (!accessProfile?.canViewManagement) {
        hideLinks(['dashboard-data.html', 'campo-admin.html', 'monitoring-prep.html']);
    }

    if (accessProfile?.isReadOnly) {
        document.body.classList.add('access-readonly');
        document.documentElement.classList.add('is-readonly');
        try { sessionStorage.setItem('access-readonly', 'true'); } catch(e) {}
        renameDataLinks();
        hideLinks([
            'dashboard-data.html',
            'campo-admin.html',
            'field.html',
            'jornada.html',
            'jornada-history.html',
            'notificacion.html',
            'help.html',
            'monitoring-prep.html'
        ]);
    } else {
        try { sessionStorage.setItem('access-readonly', 'false'); } catch(e) {}
    }

    document.body.classList.add('access-nav-ready');
}
