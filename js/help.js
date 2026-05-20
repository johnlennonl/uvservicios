import { getSession, logout, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';

const SEARCH_SELECTOR = '[data-help-card]';
const ASSISTANT_TYPING_DELAY = 14;
const ASSISTANT_NAME_KEY = 'uvito-session-name';
const HELP_ONBOARDING_KEY = 'uvito-help-onboarding-v2';
const ASSISTANT_LABEL = 'UVITO';
let currentAccessProfile = null;
let currentAssistantContext = {
    id: 'general',
    label: 'General',
    description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
};

const ASSISTANT_KNOWLEDGE_ENTRIES = [
    {
        type: 'module',
        title: 'Notificaciones',
        sourceId: 'notificaciones',
        keywords: 'notificaciones actividad cambios importaciones mediciones bes monitoreo reciente trazabilidad',
        summary: 'Sirve para revisar la actividad reciente del sistema: monitoreos del dia, mediciones tecnicas, actualizaciones BES y detalle agrupado por pozo.',
        steps: [
            'Abre Notificaciones para revisar primero el resumen del dia.',
            'Entra al bloque de monitoreo para ver los pozos agrupados.',
            'Haz clic en un pozo si necesitas abrir el detalle completo del registro.',
            'Usa los paneles tecnico y BES para confirmar que cambios recientes quedaron documentados.'
        ],
        quickChecks: [
            'El detalle por pozo muestra variables operativas completas del monitoreo del dia.',
            'Las actualizaciones dependen de la trazabilidad real guardada en la base.',
            'Es la vista mas rapida para confirmar actividad reciente antes de escalar una duda.'
        ],
        action: { href: 'notificacion.html', label: 'Abrir Notificaciones' }
    },
    {
        type: 'module',
        title: 'Jornada',
        sourceId: 'jornada',
        keywords: 'jornada turno campo cuadrilla panel diario locacion resumen operativo',
        summary: 'Es el panel diario del equipo de campo para entender el turno activo y el flujo de captura sin entrar al stack administrativo.',
        steps: [
            'Entra a Jornada para ubicar el turno y la meta operativa del dia.',
            'Desde ahi abre Captura y Envio cuando ya vayas a registrar un pozo.',
            'Usa Historial de Jornada si quieres revisar lo que la cuadrilla ya reporto.',
            'Mantente en este flujo si tu rol es Campo y no necesitas analisis administrativo.'
        ],
        quickChecks: [
            'Jornada es una vista de orientacion operativa, no de analisis tecnico.',
            'Esta pensada para rol Campo.',
            'Te evita pasar por Dashboard o Gestion para tareas de turno.'
        ],
        action: { href: 'jornada.html', label: 'Abrir Jornada' }
    },
    {
        type: 'module',
        title: 'Historial de Jornada',
        sourceId: 'jornada-historial',
        keywords: 'historial jornada campo busqueda reportes enviados cuadrilla seguimiento operativo',
        summary: 'Sirve para consultar rapidamente lo que la cuadrilla ya envio durante la jornada, con filtros por fecha, locacion, equipo o pozo.',
        steps: [
            'Abre Historial de Jornada cuando necesites revisar lo ya reportado por Campo.',
            'Busca por fecha, jornada, locacion, equipo o pozo.',
            'Revisa la ultima actualizacion del registro para confirmar si el reporte ya fue enviado.',
            'Si falta informacion, vuelve a Captura y Envio para completar el reporte.'
        ],
        quickChecks: [
            'No reemplaza el historial tecnico global de Data.',
            'Su foco es seguimiento operativo de Campo.',
            'Es ideal para saber que ya salio durante el turno.'
        ],
        action: { href: 'jornada-history.html', label: 'Abrir Historial de Jornada' }
    },
    {
        type: 'module',
        title: 'Captura y Envio',
        sourceId: 'captura-envio',
        keywords: 'captura envio whatsapp mensaje operativo formulario campo pozo jornada reporte',
        summary: 'Es la vista de Campo para registrar un pozo, armar el mensaje operativo y dejarlo listo para compartir por WhatsApp.',
        steps: [
            'Completa equipo de guardia, locacion, fecha, hora y pozo.',
            'Llena las variables operativas y el comentario del monitoreo.',
            'Agrega el pozo a la jornada para armar el mensaje automaticamente.',
            'Copia, comparte o exporta el resultado cuando el reporte quede validado.'
        ],
        quickChecks: [
            'Esta pantalla evita usar Excel manual o Dashboard para capturar reportes de campo.',
            'El foco es compartir y exportar rapidamente.',
            'Es la ruta principal cuando el operador solo necesita reportar la jornada.'
        ],
        action: { href: 'field.html', label: 'Abrir Captura y Envio' }
    },
    {
        type: 'module',
        title: 'Centro de Ayuda',
        sourceId: 'ayuda',
        keywords: 'ayuda uvito guias pasos faq bloques buscar modulo',
        summary: 'Aqui UVITO encuentra rutas de trabajo, preguntas frecuentes y bloques por modulo para orientar al usuario segun su contexto.',
        steps: [
            'Busca una palabra clave o formula la duda como si hablaras con soporte.',
            'Revisa la respuesta tipeada y usa Ir al bloque cuando quieras el detalle.',
            'Filtra por inicio rapido, modulos o preguntas frecuentes si quieres acotar la ayuda.',
            'Usa este centro cuando necesites entender el flujo antes de ejecutar la tarea.'
        ],
        quickChecks: [
            'UVITO puede responder dudas conversacionales y tambien guiar por pasos.',
            'La ayuda prioriza el modulo visible en pantalla.',
            'Sirve como capa de orientacion sin interferir con botones operativos.'
        ],
        action: { href: 'help.html', label: 'Seguir en Ayuda' }
    }
];

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

    updateAssistantContextFromViewport();
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

function sanitizeAssistantName(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 24);
}

function getAssistantUserName() {
    return sanitizeAssistantName(sessionStorage.getItem(ASSISTANT_NAME_KEY) || '');
}

function setAssistantUserName(value) {
    const normalized = sanitizeAssistantName(value);
    if (!normalized) {
        sessionStorage.removeItem(ASSISTANT_NAME_KEY);
        return '';
    }
    sessionStorage.setItem(ASSISTANT_NAME_KEY, normalized);
    return normalized;
}

function getAssistantGreetingName() {
    const userName = getAssistantUserName();
    return userName || 'equipo';
}

function includesAny(query, phrases) {
    return phrases.some(phrase => query.includes(phrase));
}

function getAssistantKnowledgeEntries() {
    return ASSISTANT_KNOWLEDGE_ENTRIES.map(entry => ({
        ...entry,
        anchor: entry.action?.href || null,
        keywords: normalizeText(entry.keywords),
        text: normalizeText(`${entry.title} ${entry.summary} ${(entry.steps || []).join(' ')} ${(entry.quickChecks || []).join(' ')}`)
    }));
}

function getAssistantDirectResponse(rawQuery) {
    const query = normalizeText(rawQuery);
    const greetingName = getAssistantGreetingName();

    if (!query) return null;

    if (includesAny(query, ['hola como estas', 'como estas', 'que tal', 'como te va'])) {
        return {
            text: `${greetingName}, estoy listo para orientarte dentro de UV Servicios. Soy fuerte en rutas de trabajo, pasos por modulo, dudas rapidas y ubicacion de funciones dentro de la app.`
        };
    }

    if (includesAny(query, ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'saludos'])) {
        return {
            text: `Hola, ${greetingName}. Puedo decirte que hace cada modulo, que pasos seguir y donde resolver una tarea dentro de la app.`
        };
    }

    if (includesAny(query, ['en que eres bueno', 'para que sirves', 'que puedes hacer', 'que sabes hacer', 'quien eres', 'que haces'])) {
        return {
            text: `${greetingName}, soy ${ASSISTANT_LABEL} y te ayudo a ubicarte dentro de UV Servicios.\n\nPuedo ayudarte con esto:\n- Explicarte para que sirve cada modulo.\n- Decirte los pasos para importar, corregir, revisar o generar.\n- Guiarte entre Dashboard, Gestion, Data, Estadisticas, Preparador Excel y Notificaciones.\n- Orientarte en el flujo de Campo: Jornada, Captura y Envio e Historial de Jornada.\n- Llevarte al bloque o a la pantalla mas util segun tu duda.`
        };
    }

    if (includesAny(query, ['que modulos conoces', 'que hay en la app', 'cada rincon', 'que tiene la app', 'que areas tiene'])) {
        return {
            text: `${greetingName}, conozco estos rincones de la app:\n- Dashboard: analisis operativo y reporte tecnico.\n- Gestion: importacion, carga manual y correccion de datos.\n- Preparador Excel: limpieza previa antes de importar.\n- Data: historial por pozo y ticket diario por fecha.\n- Estadisticas: cobertura, actividad y seguimiento por rango.\n- Notificaciones: actividad reciente y trazabilidad visible.\n- Jornada: orientacion del turno para Campo.\n- Captura y Envio: registro y mensaje operativo listo para compartir.\n- Historial de Jornada: seguimiento de lo enviado por la cuadrilla.\n- Ayuda: guias, FAQs y rutas de trabajo.`
        };
    }

    if (includesAny(query, ['gracias', 'muchas gracias', 'ok gracias'])) {
        return {
            text: `Listo, ${greetingName}. Si quieres, ahora dime la tarea y te respondo con la ruta exacta dentro de la app.`
        };
    }

    return null;
}

function updateAssistantIdentityUi() {
    const userName = getAssistantUserName();
    const launcherStatus = document.getElementById('help-assistant-launcher-status');
    const subtitle = document.getElementById('help-assistant-subtitle');
    const welcome = document.getElementById('help-assistant-welcome');
    const nameInput = document.getElementById('help-assistant-name-input');
    const identityForm = document.getElementById('help-assistant-identity-form');
    const identitySummary = document.getElementById('help-assistant-identity-summary');
    const identityName = document.getElementById('help-assistant-identity-name');

    if (launcherStatus) {
        launcherStatus.textContent = userName
            ? `Listo para ayudarte, ${userName}`
            : 'Busca por palabras clave';
    }

    if (subtitle) {
        subtitle.textContent = userName
            ? `${userName}, escribe una palabra clave y te llevaré al bloque más útil con respuesta tipeada.`
            : 'Escribe una palabra clave y te llevaré al bloque más útil con respuesta tipeada.';
    }

    if (welcome) {
        welcome.textContent = userName
            ? `${userName}, soy ${ASSISTANT_LABEL}. Pregúntame algo como importar Excel, historial, ticket diario o estadísticas.`
            : `Soy ${ASSISTANT_LABEL}. Pregúntame algo como importar Excel, historial, ticket diario o estadísticas.`;
    }

    if (nameInput) {
        nameInput.value = userName;
    }

    if (identityForm) {
        identityForm.hidden = Boolean(userName);
    }

    if (identitySummary) {
        identitySummary.hidden = !userName;
    }

    if (identityName) {
        identityName.textContent = userName
            ? `${ASSISTANT_LABEL} te llamará ${userName}.`
            : `${ASSISTANT_LABEL} te llamará por tu nombre de sesión.`;
    }

    const contextValue = document.getElementById('help-assistant-context-value');
    const contextCopy = document.getElementById('help-assistant-context-copy');
    if (contextValue) {
        contextValue.textContent = currentAssistantContext.label;
    }
    if (contextCopy) {
        contextCopy.textContent = currentAssistantContext.description;
    }
}

function buildSectionContext(section) {
    const id = section?.id || section?.dataset?.category || 'general';
    const title = section?.querySelector('h2')?.textContent?.trim();

    if (id === 'dashboard') {
        return { id, label: 'Dashboard', description: 'UVITO priorizará respuestas sobre análisis de pozo, filtros históricos y reporte técnico.' };
    }

    if (id === 'gestion') {
        return { id, label: 'Gestión', description: 'UVITO priorizará respuestas sobre importación, carga manual, deduplicación y corrección de registros.' };
    }

    if (id === 'data') {
        return { id, label: 'Data', description: 'UVITO priorizará respuestas sobre historial por pozo, ticket diario por fecha y auditoría operativa.' };
    }

    if (id === 'estadisticas') {
        return { id, label: 'Estadísticas', description: 'UVITO priorizará respuestas sobre cobertura, pozos monitoreados, drilldown y rango de fechas.' };
    }

    if (id === 'preparador') {
        return { id, label: 'Preparador Excel', description: 'UVITO priorizará respuestas sobre limpieza de archivos, vista previa y exportación lista para Gestión.' };
    }

    if (section?.classList?.contains('help-section-faq')) {
        return { id: 'faq', label: 'Preguntas frecuentes', description: 'UVITO priorizará respuestas rápidas a dudas comunes y errores recurrentes.' };
    }

    return {
        id,
        label: title || 'General',
        description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
    };
}

function setAssistantContext(context) {
    currentAssistantContext = context || currentAssistantContext;
    updateAssistantIdentityUi();
}

function updateAssistantContextFromViewport() {
    const sections = Array.from(document.querySelectorAll(SEARCH_SELECTOR)).filter(section => !section.hidden && !section.classList.contains('is-help-hidden'));
    if (!sections.length) {
        setAssistantContext({
            id: 'general',
            label: 'General',
            description: 'UVITO priorizará respuestas del bloque que estás leyendo en este momento.'
        });
        return;
    }

    const viewportAnchor = Math.max(120, window.innerHeight * 0.22);
    let bestSection = sections[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top - viewportAnchor);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSection = section;
        }
    });

    setAssistantContext(buildSectionContext(bestSection));
}

function getAssistantEntries() {
    const sectionEntries = Array.from(document.querySelectorAll(SEARCH_SELECTOR)).map(section => {
        const title = section.querySelector('h2')?.textContent?.trim()
            || section.querySelector('h3')?.textContent?.trim()
            || 'Ayuda UV';
        const anchorSource = section.id ? `#${section.id}` : section.querySelector('a[href^="#"]')?.getAttribute('href') || null;
        const summaryNode = section.querySelector('p, li');
        const summary = summaryNode?.textContent?.trim() || section.textContent.trim();
        const steps = Array.from(section.querySelectorAll('ol li'))
            .map(item => item.textContent?.trim())
            .filter(Boolean)
            .slice(0, 4);
        const quickChecks = Array.from(section.querySelectorAll('ul li'))
            .map(item => item.textContent?.trim())
            .filter(Boolean)
            .slice(0, 3);
        return {
            type: 'section',
            title,
            anchor: anchorSource,
            sourceId: section.id || section.dataset.category || 'general',
            keywords: normalizeText(section.dataset.keywords),
            text: normalizeText(section.textContent),
            summary,
            steps,
            quickChecks
        };
    });

    const faqEntries = Array.from(document.querySelectorAll('.help-faq-item')).map((item, index) => {
        if (!item.id) {
            item.id = `help-faq-${index + 1}`;
        }

        const title = item.querySelector('summary')?.textContent?.trim() || 'Pregunta frecuente';
        const summary = item.querySelector('p')?.textContent?.trim() || item.textContent.trim();
        return {
            type: 'faq',
            title,
            anchor: `#${item.id}`,
            sourceId: 'faq',
            keywords: normalizeText(`${title} ${summary}`),
            text: normalizeText(item.textContent),
            summary,
            steps: [],
            quickChecks: []
        };
    });

    return [...sectionEntries, ...getAssistantKnowledgeEntries(), ...faqEntries];
}

function scoreAssistantEntry(entry, query, tokens) {
    let score = 0;
    const isActionQuery = tokens.some(token => [
        'como',
        'pasos',
        'hacer',
        'usar',
        'importar',
        'corregir',
        'generar',
        'ver',
        'revisar',
        'consultar'
    ].includes(token));

    if (entry.title && normalizeText(entry.title).includes(query)) score += 10;
    if (entry.keywords.includes(query)) score += 8;
    if (entry.text.includes(query)) score += 4;

    tokens.forEach(token => {
        if (!token) return;
        if (normalizeText(entry.title).includes(token)) score += 3;
        if (entry.keywords.includes(token)) score += 2;
        if (entry.text.includes(token)) score += 1;
    });

    if (currentAssistantContext?.id && entry.sourceId === currentAssistantContext.id) {
        score += 6;
    }

    if (currentAssistantContext?.id === 'faq' && entry.type === 'faq') {
        score += 2;
    }

    if (isActionQuery && entry.steps?.length) {
        score += 7;
    }

    if (isActionQuery && entry.type === 'faq' && !entry.steps?.length) {
        score -= 2;
    }

    return score;
}

function findAssistantAnswer(rawQuery) {
    const query = normalizeText(rawQuery);
    const tokens = query.split(/\s+/).filter(token => token.length > 1);
    const entries = getAssistantEntries();

    const ranked = entries
        .map(entry => ({ ...entry, score: scoreAssistantEntry(entry, query, tokens) }))
        .filter(entry => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

    return ranked[0] || null;
}

function formatAssistantSteps(steps = []) {
    if (!steps.length) return '';

    return steps
        .map((step, index) => `${index + 1}. ${step}`)
        .join('\n');
}

function buildAssistantResponse(match) {
    const greetingName = getAssistantGreetingName();
    const contextPrefix = currentAssistantContext?.label && currentAssistantContext.label !== 'General'
        ? `Estando en ${currentAssistantContext.label}, `
        : '';

    if (match.steps?.length) {
        const stepsBlock = formatAssistantSteps(match.steps);
        const checksBlock = match.quickChecks?.length
            ? `\n\nAntes de cerrar, valida esto:\n${match.quickChecks.map(item => `- ${item}`).join('\n')}`
            : '';

        return `${greetingName}, ${contextPrefix}para ${match.title.toLowerCase()} sigue esta ruta:\n${stepsBlock}${checksBlock}`;
    }

    if (match.quickChecks?.length) {
        return `${greetingName}, ${contextPrefix}te recomiendo revisar esto en ${match.title}:\n${match.quickChecks.map(item => `- ${item}`).join('\n')}`;
    }

    return `${greetingName}, ${contextPrefix}encontré esto para ti en ${match.title}: ${match.summary}`;
}

function revealAllHelpContent() {
    const searchInput = document.getElementById('help-search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    document.querySelectorAll('.help-filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === 'all');
    });

    applyFilters();
}

function navigateToHelpAnchor(anchor) {
    if (!anchor) return;

    if (!anchor.startsWith('#')) {
        window.location.href = anchor;
        return;
    }

    revealAllHelpContent();

    const target = document.querySelector(anchor);
    if (!target) return;

    if (target.matches('.help-faq-item')) {
        target.open = true;
        document.querySelector('.help-section-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 180);
        return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createAssistantMessage(author, title, text, action = null) {
    const thread = document.getElementById('help-assistant-thread');
    if (!thread) return null;

    const article = document.createElement('article');
    article.className = `help-assistant-message ${author}`;

    const avatar = document.createElement('span');
    avatar.className = 'help-assistant-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = author === 'robot' ? 'UV' : 'YO';

    const bubble = document.createElement('div');
    bubble.className = 'help-assistant-bubble';

    const strong = document.createElement('strong');
    strong.textContent = title;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    bubble.append(strong, paragraph);

    if (action?.href && action?.label) {
        const actions = document.createElement('div');
        actions.className = 'help-assistant-actions';
        const link = document.createElement('a');
        link.className = 'help-assistant-link';
        link.href = action.href;
        link.textContent = action.label;
        actions.appendChild(link);
        bubble.appendChild(actions);
    }

    article.append(avatar, bubble);
    thread.appendChild(article);
    thread.scrollTop = thread.scrollHeight;
    return paragraph;
}

function typeAssistantText(element, text) {
    if (!element) return Promise.resolve();

    return new Promise(resolve => {
        let index = 0;
        const tick = () => {
            const visibleText = text.slice(0, index);
            element.textContent = visibleText;
            if (index < text.length) {
                element.innerHTML = `${visibleText}<span class="help-assistant-cursor">|</span>`;
                index += 1;
                window.setTimeout(tick, ASSISTANT_TYPING_DELAY);
                return;
            }

            element.textContent = text;
            resolve();
        };

        tick();
    });
}

async function answerAssistantQuery(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) return;

    const userName = getAssistantUserName();
    createAssistantMessage('user', userName ? `Consulta de ${userName}` : 'Tu consulta', query);

    const directResponse = getAssistantDirectResponse(query);
    if (directResponse) {
        const paragraph = createAssistantMessage('robot', ASSISTANT_LABEL, '', directResponse.action || null);
        await typeAssistantText(paragraph, directResponse.text);
        return;
    }

    const searchInput = document.getElementById('help-search-input');
    if (searchInput) {
        searchInput.value = query;
        applyFilters();
    }

    const match = findAssistantAnswer(query);
    if (!match) {
        const fallbackText = `${getAssistantGreetingName()}, no encontré una coincidencia exacta. Prueba con palabras como importar Excel, ticket diario, historial, dashboard o estadísticas.`;
        const paragraph = createAssistantMessage('robot', ASSISTANT_LABEL, fallbackText);
        await typeAssistantText(paragraph, fallbackText);
        return;
    }

    const responseText = buildAssistantResponse(match);
    const paragraph = createAssistantMessage('robot', ASSISTANT_LABEL, '', match.anchor ? { href: match.anchor, label: 'Ir al bloque' } : null);
    await typeAssistantText(paragraph, responseText);
}

async function saveAssistantIdentity(rawName) {
    const normalized = setAssistantUserName(rawName);
    updateAssistantIdentityUi();

    const responseText = normalized
        ? `Perfecto, ${normalized}. Desde ahora te llamaré así durante esta sesión.`
        : `Listo. Volví al modo general y te hablaré sin nombre personalizado en esta sesión.`;

    const paragraph = createAssistantMessage('robot', ASSISTANT_LABEL, '');
    await typeAssistantText(paragraph, responseText);
}

async function handleHelpLogout() {
    sessionStorage.removeItem(ASSISTANT_NAME_KEY);
    await logout();
}

function bindHelpOnboardingModal() {
    const modal = document.getElementById('help-onboarding-modal');
    const launcher = document.getElementById('help-assistant-launcher');
    const openAssistantButton = document.getElementById('help-onboarding-open-assistant');
    if (!modal || !launcher || localStorage.getItem(HELP_ONBOARDING_KEY) === 'seen') return;

    const closeModal = ({ openAssistant = false } = {}) => {
        localStorage.setItem(HELP_ONBOARDING_KEY, 'seen');
        modal.hidden = true;
        document.body.classList.remove('help-modal-open');

        if (openAssistant) {
            launcher.click();
        }
    };

    modal.hidden = false;
    document.body.classList.add('help-modal-open');

    modal.querySelectorAll('[data-help-onboarding-close]').forEach(button => {
        button.addEventListener('click', () => closeModal());
    });

    document.getElementById('help-onboarding-close')?.addEventListener('click', () => closeModal());
    openAssistantButton.addEventListener('click', () => closeModal({ openAssistant: true }));

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });
}

function bindHelpAssistant() {
    const launcher = document.getElementById('help-assistant-launcher');
    const panel = document.getElementById('help-assistant-panel');
    const closeButton = document.getElementById('help-assistant-close');
    const form = document.getElementById('help-assistant-form');
    const input = document.getElementById('help-assistant-input');
    const identityForm = document.getElementById('help-assistant-identity-form');
    const nameInput = document.getElementById('help-assistant-name-input');
    const editIdentityButton = document.getElementById('help-assistant-identity-edit');
    if (!launcher || !panel || !form || !input || !identityForm || !nameInput || !editIdentityButton) return;

    const setOpen = (open) => {
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
    };

    launcher.addEventListener('click', () => {
        const nextState = panel.hidden;
        setOpen(nextState);
        if (nextState) input.focus();
    });

    closeButton?.addEventListener('click', () => setOpen(false));

    identityForm.addEventListener('submit', async event => {
        event.preventDefault();
        await saveAssistantIdentity(nameInput.value);
    });

    editIdentityButton.addEventListener('click', () => {
        sessionStorage.removeItem(ASSISTANT_NAME_KEY);
        updateAssistantIdentityUi();
        nameInput.focus();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) return;
        input.value = '';
        await answerAssistantQuery(query);
    });

    document.querySelectorAll('[data-assistant-query]').forEach(button => {
        button.addEventListener('click', async () => {
            const query = button.dataset.assistantQuery || '';
            await answerAssistantQuery(query);
        });
    });

    document.getElementById('help-assistant-thread')?.addEventListener('click', event => {
        const link = event.target.closest('.help-assistant-link');
        if (!link) return;
        event.preventDefault();
        navigateToHelpAnchor(link.getAttribute('href') || '');
    });

    updateAssistantIdentityUi();
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    const accessProfile = getAccessProfile(session);
    currentAccessProfile = accessProfile;
    const rolePill = document.getElementById('help-role-pill');
    if (rolePill) {
        rolePill.textContent = getRoleLabel(accessProfile);
    }

    toggleManagementVisibility(accessProfile);
    bindToolbar();
    bindHelpAssistant();
    bindHelpOnboardingModal();
    applyFilters();
    updateAssistantContextFromViewport();
    window.addEventListener('scroll', updateAssistantContextFromViewport, { passive: true });

    document.getElementById('logout-btn')?.addEventListener('click', handleHelpLogout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', handleHelpLogout);

    if (accessProfile?.isFieldOperator) {
        const firstNavLink = document.querySelector('.sidebar nav a[href="dashboard.html"]');
        if (firstNavLink) {
            firstNavLink.setAttribute('href', getDefaultRouteForAccessProfile(accessProfile));
        }
    }
});