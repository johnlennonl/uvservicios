/**
 * Entry Point - Supabase Integrated
 * Manages the initialization of the app and coordinates auth logic.
 */

import { login, getSession } from './auth.js';
import * as ui from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State: Check for existing session
    const session = await getSession();
    
    // Setup UI features
    ui.setupPasswordToggle();

    if (session) {
        console.log('Session detected, redirecting...');
        ui.redirectToDashboard();
        return; // Stop further execution
    }

    // Hide loader if no session, showing the login form
    setTimeout(() => {
        ui.hideFullLoader();
    }, 800);

    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    // 2. Handle Login Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        ui.clearError();
        ui.setLoading(true);

        const emailVal = document.getElementById('email').value;
        const passwordVal = document.getElementById('password').value;

        try {
            // Ensure the loader stays for at least 2500ms for better UX
            const [result] = await Promise.all([
                login(emailVal, passwordVal),
                new Promise(resolve => setTimeout(resolve, 2500))
            ]);

            if (result.success) {
                ui.redirectToDashboard();
            } else {
                ui.showError(result.message);
                ui.setLoading(false);
            }
        } catch (error) {
            ui.showError('Ocurrió un error inesperado. Intente de nuevo.');
            ui.setLoading(false);
        }
    });
});
