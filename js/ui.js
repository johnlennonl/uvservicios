/**
 * UI Module - Enterprise Premium Edition
 * Handles sophisticated DOM state transitions and visual feedback.
 */

const elements = {
    form: document.getElementById('login-form'),
    submitBtn: document.getElementById('submit-btn'),
    errorContainer: document.getElementById('error-container'),
    errorMessage: document.getElementById('error-message')
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
 * Displays a professional error message with a subtle entry animation.
 * @param {string} message 
 */
export function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorContainer.classList.remove('hidden');
    
    // Smooth shake for the card itself to signify rejection
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = 'softShake 0.4s ease-in-out';
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
export function redirectToDashboard() {
    // Add a final fade out effect before redirecting
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 500);
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
