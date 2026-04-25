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
 * Redirects to the dashboard.
 */
export function redirectToDashboard(targetPath = 'dashboard.html') {
    showFullLoader(); // Activate loader before leaving
    
    // Smooth fade transition
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.6s ease';
    
    setTimeout(() => {
        window.location.href = targetPath;
    }, 600);
}

// Global styles for JS-driven animations
const style = document.createElement('style');
style.textContent = `
    @keyframes softShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }
`;
document.head.appendChild(style);
