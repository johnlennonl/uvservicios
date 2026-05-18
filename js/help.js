import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';

const SEARCH_SELECTOR = '[data-help-card]';

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getRoleLabel(profile) {
    if (profile?.isFieldOperator) return 'Perfil activo: Campo';
    if (profile?.canViewManagement && !profile?.isReadOnly) return 'Perfil activo: Administración y supervisión';
    if (profile?.isReadOnly) return 'Perfil activo: Consulta';
    return 'Perfil activo';
}

function toggleManagementVisibility(accessProfile) {
    const canViewManagement = Boolean(accessProfile?.canViewManagement);

    document.querySelectorAll('[data-management-only]').forEach(element => {
        element.classList.toggle('is-help-hidden', !canViewManagement);
    });

    document.querySelectorAll('[data-management-link]').forEach(element => {
        element.classList.toggle('is-disabled-nav', !canViewManagement);
        if (!canViewManagement) {
            element.setAttribute('aria-disabled', 'true');
            element.setAttribute('tabindex', '-1');
        }
    });
}

function applyFilters() {
    const query = normalizeText(document.getElementById('help-search-input')?.value);
    const activeChip = document.querySelector('.help-filter-chip.active');
    const category = activeChip?.dataset.filter || 'inicio';
    const cards = Array.from(document.querySelectorAll(SEARCH_SELECTOR));

    let visibleCount = 0;

    cards.forEach(card => {
        if (card.classList.contains('is-help-hidden')) {
            return;
        }

        const keywords = normalizeText(card.dataset.keywords);
        const text = normalizeText(card.textContent);
        const matchesQuery = !query || text.includes(query) || keywords.includes(query);
        const matchesCategory = category === 'all' || card.dataset.category === category;
        const isVisible = matchesQuery && matchesCategory;

        card.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
    });

    const emptyState = document.getElementById('help-empty-state');
    if (emptyState) {
        emptyState.hidden = visibleCount > 0;
    }
}

function bindToolbar() {
    const searchInput = document.getElementById('help-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    document.querySelectorAll('.help-filter-chip').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.help-filter-chip').forEach(chip => chip.classList.remove('active'));
            button.classList.add('active');
            applyFilters();
        });
    });

    document.querySelectorAll('.help-summary-card').forEach(card => {
        card.addEventListener('click', event => {
            const link = card.querySelector('a[href]');
            if (!link) return;
            if (event.target instanceof Element && event.target.closest('a')) return;
            link.click();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    const rolePill = document.getElementById('help-role-pill');
    if (rolePill) {
        rolePill.textContent = getRoleLabel(accessProfile);
    }

    toggleManagementVisibility(accessProfile);
    bindToolbar();
    applyFilters();

    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);

    if (accessProfile?.isFieldOperator) {
        const firstNavLink = document.querySelector('.sidebar nav a[href="dashboard.html"]');
        if (firstNavLink) {
            firstNavLink.setAttribute('href', getDefaultRouteForAccessProfile(accessProfile));
        }
    }
});