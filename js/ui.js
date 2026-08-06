/**
 * UI Module - Enterprise Premium Edition
 * Handles sophisticated DOM state transitions and visual feedback.
 */

const elements = {
    form: document.getElementById('login-form'),
    submitBtn: document.getElementById('submit-btn'),
    errorContainer: document.getElementById('error-container'),
    errorMessage: document.getElementById('error-message'),
    premiumLoader: document.getElementById('premium-loader')
};

/**
 * Sets the loading state of the login process.
 * @param {boolean} isLoading 
 */
export function setLoading(isLoading) {
    if (isLoading) {
        elements.submitBtn.disabled = true;
        elements.submitBtn.classList.add('loading');
    } else {
        elements.submitBtn.disabled = false;
        elements.submitBtn.classList.remove('loading');
    }
}

/**
 * Shows the fullscreen preloader.
 */
export function showFullLoader() {
    if (elements.premiumLoader) {
        elements.premiumLoader.classList.remove('hidden');
    }
}

/**
 * Hides the fullscreen preloader with a fade effect.
 */
export function hideFullLoader() {
    if (elements.premiumLoader) {
        elements.premiumLoader.classList.add('hidden');
    }
}

/**
 * Sets up the password visibility toggle functionality.
 */
export function setupPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    if (!toggleBtn || !passwordInput) return;

    toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
        
        // Toggle icon visibility
        toggleBtn.querySelector('.eye-open').classList.toggle('hidden', !isPassword);
        toggleBtn.querySelector('.eye-closed').classList.toggle('hidden', isPassword);
    });
}

/**
 * Displays a professional error message with a subtle entry animation.
 * @param {string} message 
 */
export function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorContainer.classList.remove('hidden');
    
    // Smooth shake for the card itself to signify rejection
    const card = document.querySelector('.form-content-wrapper');
    if (card) {
        card.style.animation = 'none';
        card.offsetHeight; // trigger reflow
        card.style.animation = 'softShake 0.4s ease-in-out';
    }
}

/**
 * Clears errors.
 */
export function clearError() {
    elements.errorContainer.classList.add('hidden');
}

/**
 * Redirects to the target path cleanly.
 */
export function redirectToDashboard(targetPath = 'dashboard.html') {
    window.location.href = targetPath;
}

function parseAnimatedNumber(value) {
    const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}

function formatAnimatedNumber(value, options = {}) {
    const roundedValue = Math.round(Number(value) || 0);
    return options.locale === false
        ? String(roundedValue)
        : roundedValue.toLocaleString(options.locale || 'es-VE');
}

export function animateNumber(element, nextValue, options = {}) {
    if (!element) return;

    if (element._uvNumberAnimationFrame) {
        cancelAnimationFrame(element._uvNumberAnimationFrame);
        element._uvNumberAnimationFrame = '';
    }
    element.classList.remove('uv-number-animating');

    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue)) {
        element.textContent = String(nextValue ?? '');
        element.dataset.currentValue = '';
        return;
    }

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const fromValue = element.dataset.currentValue !== undefined
        ? parseAnimatedNumber(element.dataset.currentValue)
        : parseAnimatedNumber(element.textContent);
    const toValue = numericValue;
    const suffix = options.suffix || '';

    if (prefersReducedMotion || options.duration === 0 || fromValue === toValue) {
        element.textContent = `${formatAnimatedNumber(toValue, options)}${suffix}`;
        element.dataset.currentValue = String(toValue);
        return;
    }

    const duration = Math.max(180, Number(options.duration || 650));
    const startedAt = performance.now();
    const easeOutCubic = progress => 1 - Math.pow(1 - progress, 3);
    element.classList.add('uv-number-animating');

    const tick = now => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = easeOutCubic(progress);
        const currentValue = fromValue + (toValue - fromValue) * eased;
        element.textContent = `${formatAnimatedNumber(currentValue, options)}${suffix}`;

        if (progress < 1) {
            element._uvNumberAnimationFrame = requestAnimationFrame(tick);
            return;
        }

        element.textContent = `${formatAnimatedNumber(toValue, options)}${suffix}`;
        element.dataset.currentValue = String(toValue);
        element._uvNumberAnimationFrame = '';
        element.classList.remove('uv-number-animating');
    };

    element._uvNumberAnimationFrame = requestAnimationFrame(tick);
}

// Global styles for JS-driven animations
const style = document.createElement('style');
style.textContent = `
    @keyframes softShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }

    .uv-number-animating {
        display: inline-block;
        animation: uvNumberLift 0.65s ease both;
        will-change: transform;
    }

    @keyframes uvNumberLift {
        0% { transform: translateY(2px); filter: saturate(0.95); }
        45% { transform: translateY(-1px); filter: saturate(1.08); }
        100% { transform: translateY(0); filter: saturate(1); }
    }

    @media (prefers-reduced-motion: reduce) {
        .uv-number-animating {
            animation: none;
        }
    }
`;
document.head.appendChild(style);
