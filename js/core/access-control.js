export const ACCESS_ROLES = Object.freeze({
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    CAMPO: 'campo',
    SERVICIOS: 'servicios',
    CLIENTE_VIEW: 'cliente_view',
    BASE_DATOS: 'base_datos',
    GESTOR_USUARIOS: 'gestor_usuarios',
    GERENCIAL: 'gerencial', // Nuevo Rol Gerencial
    SEGURIDAD: 'seguridad', // Nuevo Rol de Seguridad/SIAHO
    CRC: 'crc' // Rol de captura de parámetros CRC LL
});

const ALLOWED_ACCESS_ROLES = new Set(Object.values(ACCESS_ROLES));

function normalizeRole(value) {
    const normalizedRole = String(value || '').trim().toLowerCase();
    // Soporte para alias de rol 'siaho' mapeándolo a 'seguridad'
    if (normalizedRole === 'siaho') return ACCESS_ROLES.SEGURIDAD;
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
    const isServicesOperator = role === ACCESS_ROLES.SERVICIOS;
    const isSupervisor = role === ACCESS_ROLES.SUPERVISOR;
    const isAdmin = role === ACCESS_ROLES.ADMIN;
    const isBaseDatos = role === ACCESS_ROLES.BASE_DATOS || email.includes('baseuv');
    const isGestorUsuarios = role === ACCESS_ROLES.GESTOR_USUARIOS;
    const isGerencial = role === ACCESS_ROLES.GERENCIAL; // Nuevo
    const isSeguridad = role === ACCESS_ROLES.SEGURIDAD; // Nuevo
    const isCrcOperator = role === ACCESS_ROLES.CRC; // Nuevo

    return {
        email,
        role,
        isReadOnly,
        isFieldOperator,
        isServicesOperator,
        isBaseDatos,
        isGestorUsuarios,
        isGerencial, // Nuevo
        isSeguridad, // Nuevo
        isCrcOperator, // Nuevo
        isAdmin,
        isSupervisor,
        canViewDashboard: !isGestorUsuarios && !isServicesOperator && !isSeguridad && !isCrcOperator,
        canViewConsolidado: !isGestorUsuarios && !isServicesOperator && !isSeguridad && !isCrcOperator,
        canModifyConsolidadoBase: isAdmin || isSupervisor,
        canViewManagement: isAdmin || isSupervisor || isGerencial, // Gerencial puede ver gestión/jornadas
        canEditData: isAdmin || isSupervisor,
        canCreateFieldReports: isAdmin || isSupervisor || isFieldOperator || isCrcOperator,
        canViewFieldModule: isAdmin || isSupervisor || isFieldOperator || isCrcOperator,
        canViewFieldHistory: !isGestorUsuarios && !isServicesOperator && !isSeguridad,
        canViewJourneyModule: isAdmin || isSupervisor || isFieldOperator || isCrcOperator,
        canViewJourneyHistory: !isGestorUsuarios && !isServicesOperator && !isSeguridad,
        canViewStats: !isGestorUsuarios && !isServicesOperator && !isSeguridad && !isCrcOperator,
        canViewBaseDatos: isBaseDatos || isGerencial || isAdmin || isSupervisor || isSeguridad, // Gerencial, Admin, Supervisor y Seguridad pueden ver base-datos.html
        canManageUsers: isGestorUsuarios || isAdmin
    };
}

export function getDefaultRouteForAccessProfile(accessProfile) {
    if (accessProfile?.isBaseDatos || accessProfile?.email?.includes('baseuv')) {
        return 'base-datos.html';
    }

    if (accessProfile?.isSeguridad) {
        return 'base-datos.html'; // Seguridad va directo a Base de Datos
    }

    if (accessProfile?.isFieldOperator) {
        return 'field.html';
    }

    if (accessProfile?.isCrcOperator) {
        return 'crc/field-crc.html'; // Redirección para el capturador CRC LL
    }

    if (accessProfile?.isGestorUsuarios) {
        return 'gestion-usuarios.html';
    }

    if (accessProfile?.role === ACCESS_ROLES.SERVICIOS) {
        return 'SERVICIOSUV/servicios.html';
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

    if (accessProfile?.isBaseDatos || accessProfile?.isGerencial || accessProfile?.isAdmin || accessProfile?.isSupervisor || accessProfile?.isSeguridad) {
        showLinks(['base-datos.html']);
        document.body.classList.add('is-role-base-datos');
    } else {
        hideLinks(['base-datos.html']);
        document.body.classList.remove('is-role-base-datos');
    }

    if (accessProfile?.isBaseDatos || accessProfile?.isSeguridad) {
        hideLinks([
            'dashboard.html',
            'consolidado.html',
            'data.html',
            'stats.html',
            'help.html',
            'notificacion.html',
            'monitoring-prep.html',
            'dashboard-data.html',
            'campo-admin.html'
        ]);
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

    if (accessProfile?.role === ACCESS_ROLES.SERVICIOS) {
        document.body.classList.add('access-servicios');
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
    }

    document.body.classList.add('access-nav-ready');
}
