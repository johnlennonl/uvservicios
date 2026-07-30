export const ACCESS_ROLES = Object.freeze({
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    CAMPO: 'campo',
    CLIENTE_VIEW: 'cliente_view',
    BASE_DATOS: 'base_datos',
    GESTOR_USUARIOS: 'gestor_usuarios'
});

const ALLOWED_ACCESS_ROLES = new Set(Object.values(ACCESS_ROLES));

function normalizeRole(value) {
    const normalizedRole = String(value || '').trim().toLowerCase();
    return ALLOWED_ACCESS_ROLES.has(normalizedRole)
        ? normalizedRole
        : ACCESS_ROLES.CLIENTE_VIEW;
}

function readRoleFromClaims(user = {}) {
    const email = String(user?.email || '').trim().toLowerCase();
    if (email === 'baseuv@uvservicios.com' || email.includes('baseuv')) {
        return ACCESS_ROLES.BASE_DATOS;
    }

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
    const isBaseDatos = role === ACCESS_ROLES.BASE_DATOS || email.includes('baseuv');
    const isGestorUsuarios = role === ACCESS_ROLES.GESTOR_USUARIOS;

    return {
        email,
        role,
        isReadOnly,
        isFieldOperator,
        isBaseDatos,
        isGestorUsuarios,
        canViewDashboard: !isGestorUsuarios,
        canViewConsolidado: !isGestorUsuarios,
        canModifyConsolidadoBase: isAdmin || isSupervisor,
        canViewManagement: isAdmin || isSupervisor,
        canEditData: isAdmin || isSupervisor,
        canCreateFieldReports: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldModule: isAdmin || isSupervisor || isFieldOperator,
        canViewFieldHistory: !isGestorUsuarios,
        canViewJourneyModule: isAdmin || isSupervisor || isFieldOperator,
        canViewJourneyHistory: !isGestorUsuarios,
        canViewStats: !isGestorUsuarios,
        canViewBaseDatos: isBaseDatos,
        canManageUsers: isGestorUsuarios || isAdmin
    };
}

export function getDefaultRouteForAccessProfile(accessProfile) {
    if (accessProfile?.isBaseDatos || accessProfile?.email?.includes('baseuv')) {
        return 'base-datos.html';
    }

    if (accessProfile?.isFieldOperator) {
        return 'field.html';
    }

    if (accessProfile?.isGestorUsuarios) {
        return 'gestion-usuarios.html';
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

    const showLinks = hrefs => {
        hrefs.forEach(href => {
            root.querySelectorAll(`a[href="${href}"]`).forEach(link => {
                link.style.display = '';
                link.removeAttribute('aria-hidden');
                link.removeAttribute('tabindex');
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

    const renameCampoLinks = () => {
        root.querySelectorAll('a[href="campo-admin.html"]').forEach(link => {
            const label = link.querySelector('span');
            if (label) {
                label.textContent = 'Jornadas en Vivo';
                return;
            }

            const textNode = [...link.childNodes]
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .find(node => node.textContent.trim());

            if (textNode) textNode.textContent = ' Jornadas en Vivo';
        });
    };

    if (accessProfile?.isBaseDatos) {
        document.body.classList.add('is-role-base-datos');
        showLinks(['base-datos.html']);
    } else {
        document.body.classList.remove('is-role-base-datos');
        hideLinks(['base-datos.html']);
    }

    if (!accessProfile?.canViewManagement && !accessProfile?.isReadOnly) {
        hideLinks(['dashboard-data.html', 'campo-admin.html', 'monitoring-prep.html']);
    } else if (accessProfile?.isReadOnly) {
        hideLinks(['dashboard-data.html', 'monitoring-prep.html']);
    }

    if (accessProfile?.isReadOnly) {
        document.body.classList.add('access-readonly');
        document.documentElement.classList.add('is-readonly');
        try { sessionStorage.setItem('access-readonly', 'true'); } catch(e) {}
        renameDataLinks();
        renameCampoLinks();
        hideLinks([
            'dashboard-data.html',
            'field.html',
            'jornada.html',
            'jornada-history.html',
            'notificacion.html',
            'help.html',
            'monitoring-prep.html',
            'base-datos.html'
        ]);
        showLinks(['campo-admin.html']);
    } else {
        try { sessionStorage.setItem('access-readonly', 'false'); } catch(e) {}
    }

    if (accessProfile?.isGestorUsuarios) {
        document.body.classList.add('access-gestor-usuarios');
        hideLinks([
            'dashboard.html',
            'consolidado.html',
            'data.html',
            'stats.html',
            'dashboard-data.html',
            'campo-admin.html',
            'field.html',
            'jornada.html',
            'jornada-history.html',
            'notificacion.html',
            'help.html',
            'monitoring-prep.html',
            'base-datos.html'
        ]);
        showLinks(['gestion-usuarios.html']);
    } else {
        document.body.classList.remove('access-gestor-usuarios');
        hideLinks(['gestion-usuarios.html']);
    }

    document.body.classList.add('access-nav-ready');
}
