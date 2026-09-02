/**
 * ====================================================================
 * UV SERVICIOS - ENRUTADOR HYBRID SPA V.3.0
 * ====================================================================
 * Este módulo centraliza la navegación de la plataforma para convertirla
 * en una aplicación de página única (SPA). Intercepta clics locales,
 * descarga el HTML de destino, intercambia el contenedor principal en el DOM,
 * y gestiona el ciclo de vida (init / destroy) de cada controlador.
 */

// Mapeo de rutas físicas a sus respectivos controladores y funciones de ciclo de vida
const ROUTES = {
    'dashboard.html': {
        load: () => import('../charts.js'),
        init: (m) => m.initDashboard(),
        destroy: (m) => m.destroyDashboard()
    },
    'campo-admin.html': {
        load: () => import('../campo-admin.js'),
        init: (m) => m.initCampoAdmin(),
        destroy: (m) => m.destroyCampoAdmin()
    },
    'data.html': {
        load: () => import('../modules/data-controller.js'),
        init: (m) => m.initData(),
        destroy: (m) => m.destroyData()
    },
    'dashboard-data.html': {
        load: () => import('../modules/dashboard-data-controller.js?v=20260819-1253'),
        init: (m) => m.initDashboardData(),
        destroy: (m) => m.destroyDashboardData()
    },
    'gestion-usuarios.html': {
        load: () => import('../gestion-usuarios.js'),
        init: (m) => m.initGestionUsuarios(),
        destroy: (m) => m.destroyGestionUsuarios()
    },
    'stats.html': {
        load: () => import('../estadisticas.js?v=20260827-1609'),
        init: (m) => m.initEstadisticas(),
        destroy: (m) => m.destroyEstadisticas()
    },
    'consolidado.html': {
        load: () => import('../consolidado.js'),
        init: (m) => m.initConsolidado(),
        destroy: (m) => m.destroyConsolidado()
    }
};

// Mantiene el estado de la página actual y el módulo cargado en memoria
let currentPage = null;
let currentModule = null;
let lenisInstance = null;

/**
 * Crea e inyecta la pantalla de carga SPA en el documento si no existe.
 */
function ensureLoaderOverlay() {
    let overlay = document.querySelector('.spa-navigation-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'spa-navigation-overlay';
        overlay.innerHTML = `
            <img src="img/UV-SERVICES-Logo-vectorial-sin-fondo.webp" class="spa-loader-logo" alt="UV Servicios">
        `;
        document.body.appendChild(overlay);
    }
}

/**
 * Obtiene el nombre del archivo HTML desde una URL.
 * @param {string} url - URL completa o relativa.
 * @returns {string} Nombre de la página (ej: 'dashboard.html').
 */
function getPageName(url) {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1] || '';
    // Retorna el nombre de la página o el Dashboard por defecto
    return lastPart.split('?')[0].split('#')[0] || 'dashboard.html';
}

/**
 * Actualiza el estado visual "activo" en el menú lateral y barra móvil.
 * @param {string} pageName - Nombre de la página activa.
 */
function updateNavigationActiveState(pageName) {
    // Buscar todos los enlaces en sidebar y barra móvil
    const links = document.querySelectorAll('a[href], button[data-href]');
    links.forEach(link => {
        const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
        const linkPage = getPageName(href);
        const isActive = linkPage === pageName;

        // Alternar clase active según corresponda
        link.classList.toggle('active', isActive);
        
        // Soporte para links dentro del menú "Más" móvil
        if (link.classList.contains('more-menu-item') || link.classList.contains('mobile-nav-link')) {
            link.classList.toggle('active', isActive);
        }
    });
}

/**
 * Realiza la transición de navegación SPA inyectando el nuevo contenido.
 * @param {string} url - URL de la página a cargar.
 * @param {boolean} [pushState=true] - Si se debe añadir el registro al historial del navegador.
 */
export async function navigate(url, pushState = true) {
    // Cerrar el menú "Más" móvil para evitar que se quede abierto al cambiar de sección
    const mobileMenu = document.getElementById('mobile-more-menu');
    if (mobileMenu) {
        mobileMenu.classList.remove('active');
    }

    const pageName = getPageName(url);
    const route = ROUTES[pageName];

    // FALLBACK HÍBRIDO: Si la página no está registrada en la SPA, navegar de forma física tradicional
    if (!route) {
        window.location.href = url;
        return;
    }



    // Iniciar cronómetro de carga y mostrar pantalla de espera inmediatamente
    const startTime = Date.now();
    ensureLoaderOverlay();
    document.body.classList.add('spa-navigating');

    try {
        // Esperar a que el loader cubra la pantalla (180ms de animación CSS)
        await new Promise(resolve => setTimeout(resolve, 180));

        // 1. Destrucción de la página anterior para evitar fugas de memoria
        if (currentPage && ROUTES[currentPage]) {
            const prevRoute = ROUTES[currentPage];
            if (prevRoute.destroy && currentModule) {
                try {
                    prevRoute.destroy(currentModule);
                } catch (e) {
                    console.error(`[Router] Error destruyendo módulo ${currentPage}:`, e);
                }
            }
        }

        // 2. Fetch asíncrono del nuevo código HTML
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const htmlText = await response.text();

        // 3. Parsear el HTML descargado
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // 4. PREPARAR e inyectar nuevos estilos sin remover los viejos aún (evita parpadeo/FOUC)
        const oldSpaStyles = Array.from(document.querySelectorAll('[data-spa-styles]'));

        // Copiar bloques <style> internos de la nueva página al <head>
        doc.querySelectorAll('style').forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.setAttribute('data-spa-styles', 'true');
            newStyle.textContent = style.textContent;
            document.head.appendChild(newStyle);
        });

        // Copiar hojas de estilo externas <link> y esperar a que carguen
        const currentLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(el => el.getAttribute('href'));
        const linkPromises = [];
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !currentLinks.includes(href)) {
                const newLink = document.createElement('link');
                newLink.setAttribute('rel', 'stylesheet');
                newLink.setAttribute('href', href);
                newLink.setAttribute('data-spa-styles', 'true');
                // Esperar a que el CSS termine de cargar antes de mostrar el DOM
                const loadPromise = new Promise(resolve => {
                    newLink.onload = resolve;
                    newLink.onerror = resolve; // No bloquear en caso de fallo
                });
                linkPromises.push(loadPromise);
                document.head.appendChild(newLink);
            }
        });

        // Esperar a que todas las hojas de estilo nuevas terminen de cargar
        if (linkPromises.length > 0) {
            await Promise.all(linkPromises);
        }

        // 4.1 Copiar y ejecutar scripts externos (<script src="...">) que no estén ya cargados
        const currentScripts = Array.from(document.querySelectorAll('script')).map(el => el.getAttribute('src')).filter(Boolean);
        const scriptPromises = [];
        
        doc.querySelectorAll('script').forEach(script => {
            const src = script.getAttribute('src');
            if (src && !currentScripts.includes(src)) {
                const newScript = document.createElement('script');
                newScript.setAttribute('src', src);
                newScript.setAttribute('data-spa-script', 'true');
                newScript.async = false;
                
                const type = script.getAttribute('type');
                if (type) {
                    newScript.setAttribute('type', type);
                }
                
                const scriptPromise = new Promise(resolve => {
                    newScript.onload = resolve;
                    newScript.onerror = () => {
                        console.warn(`[Router] No se pudo cargar el script: ${src}`);
                        resolve();
                    };
                });
                scriptPromises.push(scriptPromise);
                document.head.appendChild(newScript);
            }
        });

        if (scriptPromises.length > 0) {
            await Promise.all(scriptPromises);
        }

        // 5. AHORA intercambiar el contenedor <main> en el DOM (CSS ya cargado)
        const newMain = doc.querySelector('.main-container');
        const currentMain = document.querySelector('.main-container');
        if (newMain && currentMain) {
            currentMain.replaceWith(newMain);
        } else {
            throw new Error('No se encontró el contenedor .main-container en la página destino.');
        }

        // 5.1 Remover los estilos de la SPA anterior una vez que el DOM nuevo ya está en pantalla
        oldSpaStyles.forEach(el => el.remove());

        // 6. Actualizar el título y metadata
        document.title = doc.title || 'UV Servicios';
        
        // 7. Actualizar las clases del Body, preservando el estado de la transición SPA
        const wasNavigating = document.body.classList.contains('spa-navigating');
        document.body.className = doc.body.className;
        if (wasNavigating) {
            document.body.classList.add('spa-navigating');
        }

        // 8. Actualizar el historial del navegador
        if (pushState) {
            history.pushState({ page: pageName }, '', url);
        }

        // 9. Actualizar navegación visual activa
        updateNavigationActiveState(pageName);

        // 10. Cargar dinámicamente el controlador JS
        currentPage = pageName;
        const module = await route.load();
        currentModule = module;

        // 11. Inicializar la nueva página (se esperan las cargas asíncronas de datos)
        if (route.init) {
            await route.init(module);
        }

        // 12. Ejecutar la animación de desvanecimiento de entrada
        const duration = Date.now() - startTime;
        // Garantizar al menos 800ms para una animación fluida sin flash
        const remainingTime = Math.max(0, 800 - duration);
        
        await new Promise(resolve => setTimeout(resolve, remainingTime));

        // Ocultar pantalla de espera revelando el contenido completamente cargado
        document.body.classList.remove('spa-navigating');

        // Hacer scroll al inicio de la página al cambiar de sección
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Refrescar cabeceras y saludo dinámico de usuario en la nueva vista
        import('../auth.js').then(({ getSession }) => {
            getSession().catch(() => null);
        });

    } catch (error) {
        console.error('[Router] Transición fallida, ejecutando navegación de respaldo:', error);
        document.body.classList.remove('spa-navigating');
        window.location.href = url;
    }
}

/**
 * Crea e inyecta el botón flotante "Volver Arriba" en la página si no existe.
 */
function ensureScrollToTopButton() {
    let btn = document.getElementById('scroll-to-top-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'scroll-to-top-btn';
        btn.className = 'scroll-to-top-btn';
        btn.setAttribute('aria-label', 'Volver arriba');
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
        `;
        document.body.appendChild(btn);
        
        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });
    }
}

/**
 * Inicializa el motor de scroll inercial suave Lenis.
 */
/**
 * Detecta si un elemento es un contenedor scrollable interno (select, modal, input, textarea, etc.)
 */
function isScrollableInnerElement(node) {
    if (!node || node === document.body || node === document.documentElement) return false;

    let curr = node;
    while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.nodeType === 1) {
            const tagName = curr.tagName;
            if (['SELECT', 'TEXTAREA', 'INPUT', 'OPTION'].includes(tagName)) {
                return true;
            }
            if (curr.hasAttribute('data-lenis-prevent') || curr.classList.contains('lenis-prevent')) {
                return true;
            }
            if (curr.classList.contains('campo-admin-modal') ||
                curr.classList.contains('swal2-container') ||
                curr.classList.contains('campo-admin-modal-body') ||
                curr.classList.contains('campo-admin-modal-review-panel') ||
                curr.classList.contains('off-wells-list') ||
                curr.classList.contains('alertas-table-wrap') ||
                curr.classList.contains('pozo-filter-dropdown') ||
                curr.classList.contains('pozo-filter-list')) {
                return true;
            }
            const overflowY = window.getComputedStyle(curr).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && curr.scrollHeight > curr.clientHeight) {
                return true;
            }
        }
        curr = curr.parentElement;
    }
    return false;
}

let lenisRafId = null;

function initLenis() {
    if (typeof Lenis === 'undefined') {
        console.warn('[Router] La librería Lenis no está disponible globalmente.');
        return;
    }

    if (lenisInstance) {
        lenisInstance.destroy();
    }
    
    if (lenisRafId) {
        cancelAnimationFrame(lenisRafId);
    }

    lenisInstance = new Lenis({
        duration: 1.0,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Curva expoOut premium
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 0.95,
        touchMultiplier: 1.5,
        infinite: false,
        prevent: (node) => isScrollableInnerElement(node)
    });

    // Bucle de actualización (RequestAnimationFrame)
    function raf(time) {
        if (lenisInstance) {
            lenisInstance.raf(time);
            lenisRafId = requestAnimationFrame(raf);
        }
    }
    lenisRafId = requestAnimationFrame(raf);
}

/**
 * Los contenedores internos utilizan el desplazamiento nativo e instantáneo con rueda de ratón.
 */
function initNestedSmoothScroll() {
    // Desplazamiento nativo del navegador habilitado sin bloqueo de eventos wheel
}

/**
 * Inicializa el enrutador en la carga inicial de la página física.
 */
function initRouter() {
    const pageName = getPageName(window.location.pathname);

    // Registrar escuchador del botón de retroceso/adelante del navegador
    window.addEventListener('popstate', (event) => {
        navigate(window.location.pathname, false);
    });

    // Interceptar clics globales en la página (Delegación de eventos)
    document.addEventListener('click', (event) => {
        // Encontrar si el clic fue en un enlace <a> o dentro de él
        const anchor = event.target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        
        // Ignorar enlaces vacíos, externos, de javascript o anclas internas
        if (!href || href.startsWith('http') || href.startsWith('javascript:') || href.startsWith('#')) {
            return;
        }

        // Cancelar el comportamiento estándar de recarga del navegador
        event.preventDefault();
        
        // Navegar mediante SPA asíncrono
        navigate(href);
    });

    // Autodetectar e inicializar la página física actual
    const route = ROUTES[pageName];
    if (route) {
        currentPage = pageName;
        route.load().then(module => {
            currentModule = module;
            if (route.init) {
                route.init(module);
            }
        }).catch(err => {
            console.error(`[Router] Error cargando módulo inicial: ${pageName}`, err);
        });
    }
    
    // Sincronizar el estado visual del sidebar al iniciar
    updateNavigationActiveState(pageName);

    // Inicializar el botón global de volver arriba
    ensureScrollToTopButton();

    // Inicializar el motor de scroll inercial suave Lenis
    initLenis();

    // Inicializar el suavizado de scroll en contenedores internos protegidos
    initNestedSmoothScroll();
}

// Arrancar el enrutador al cargarse el script
initRouter();
