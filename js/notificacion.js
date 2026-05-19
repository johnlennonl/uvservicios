import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';

function getRoleLabel(profile) {
    if (profile?.isFieldOperator) return 'Perfil activo: Campo';
    if (profile?.canViewManagement && !profile?.isReadOnly) return 'Perfil activo: Administración y supervisión';
    if (profile?.isReadOnly) return 'Perfil activo: Consulta';
    return 'Perfil activo';
}

function applyNotificationAccessProfile(accessProfile) {
    if (!accessProfile?.canViewManagement) {
        document.querySelectorAll('a[href="stats.html"]').forEach(link => {
            link.style.display = 'none';
            link.setAttribute('aria-hidden', 'true');
            link.tabIndex = -1;
        });
    }

    if (!accessProfile?.isReadOnly) return;

    document.body.classList.add('access-readonly');
    document.querySelectorAll('[data-management-link]').forEach(link => {
        link.style.display = 'none';
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (accessProfile?.isFieldOperator) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    applyNotificationAccessProfile(accessProfile);

    const rolePill = document.getElementById('notification-role-pill');
    if (rolePill) {
        rolePill.textContent = getRoleLabel(accessProfile);
    }

    document.getElementById('logout-btn')?.addEventListener('click', logout);
});
