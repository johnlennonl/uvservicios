import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from '../../auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    if (!(accessProfile.canViewJourneyModule || accessProfile.canViewJourneyHistory || accessProfile.canViewFieldModule)) {
        window.location.href = getDefaultRouteForAccessProfile(accessProfile);
        return;
    }

    document.getElementById('logout-btn')?.addEventListener('click', logout);
});