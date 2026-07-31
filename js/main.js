/**
 * Entry Point - Supabase Integrated
 * Manages the initialization of the app and coordinates auth logic.
 */

import { login, logout, getSession, getAccessProfile, getDefaultRouteForAccessProfile } from './auth.js';
import * as ui from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Setup UI features
    ui.setupPasswordToggle();

    const loginForm = document.getElementById('login-form');
    const pinStepContainer = document.getElementById('pin-2fa-step-container');
    const pinStepForm = document.getElementById('pin-2fa-step-form');
    const pinInput = document.getElementById('step-pin-input');
    const pinError = document.getElementById('pin-2fa-error');
    const btnBack = document.getElementById('btn-back-to-login');

    let pendingRoute = null;

    // 1. Initial State: Check for existing session
    const startTime = Date.now();
    const session = await getSession();

    if (session) {
        console.log('Session detected, checking profile...');
        const route = getDefaultRouteForAccessProfile(getAccessProfile(session));
        if (route === 'base-datos.html') {
            if (sessionStorage.getItem('uv_db_pin_verified') === 'true') {
                ui.redirectToDashboard(route);
                return;
            }
            // Si ya hay sesión pero falta el PIN, mostramos el Paso 2
            pendingRoute = route;
            showPinStep();
            
            const elapsedTime = Date.now() - startTime;
            const remainingDelay = Math.max(0, 2500 - elapsedTime);
            setTimeout(() => {
                ui.hideFullLoader();
            }, remainingDelay);
        } else {
            ui.redirectToDashboard(route);
            return;
        }
    } else {
        const elapsedTime = Date.now() - startTime;
        const remainingDelay = Math.max(0, 2500 - elapsedTime);
        setTimeout(() => {
            ui.hideFullLoader();
        }, remainingDelay);
    }

    function showPinStep() {
        if (loginForm) {
            loginForm.classList.add('hidden');
            loginForm.style.display = 'none';
        }
        if (pinStepContainer) {
            pinStepContainer.classList.remove('hidden');
            pinStepContainer.hidden = false;
            pinStepContainer.style.display = 'block';
        }
        if (pinError) pinError.classList.add('hidden');
        if (pinInput) {
            pinInput.value = '';
            setTimeout(() => pinInput.focus(), 150);
        }
    }

    async function showLoginForm() {
        sessionStorage.removeItem('uv_db_pin_verified');
        try {
            await logout();
        } catch (err) {
            console.warn('Error during logout:', err);
        }
        if (pinStepContainer) {
            pinStepContainer.classList.add('hidden');
            pinStepContainer.hidden = true;
            pinStepContainer.style.display = 'none';
        }
        if (loginForm) {
            loginForm.classList.remove('hidden');
            loginForm.style.display = 'flex';
            loginForm.reset();
        }
        ui.setLoading(false);
    }

    if (btnBack) {
        btnBack.addEventListener('click', async (e) => {
            e.preventDefault();
            await showLoginForm();
        });
    }

    // 2. Paso 1: Iniciar Sesión con Correo y Contraseña
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            ui.clearError();
            ui.setLoading(true);

            const emailVal = document.getElementById('email')?.value?.trim();
            const passwordVal = document.getElementById('password')?.value;

            try {
                const [loginRes] = await Promise.all([
                    login(emailVal, passwordVal),
                    new Promise(resolve => setTimeout(resolve, 800))
                ]);

                if (loginRes.success) {
                    const targetRoute = getDefaultRouteForAccessProfile(getAccessProfile(loginRes.user));
                    if (targetRoute === 'base-datos.html') {
                        ui.setLoading(false);
                        pendingRoute = targetRoute;
                        showPinStep();
                    } else {
                        ui.redirectToDashboard(targetRoute);
                    }
                } else {
                    ui.showError(loginRes.message || 'Correo o contraseña incorrectos.');
                    ui.setLoading(false);
                }
            } catch (error) {
                ui.showError('Ocurrió un error inesperado. Intente de nuevo.');
                ui.setLoading(false);
            }
        });
    }

    // 3. Paso 2: Validación del PIN 2FA
    if (pinStepForm) {
        pinStepForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const enteredPin = pinInput?.value?.trim();

            if (enteredPin === '4826') {
                sessionStorage.setItem('uv_db_pin_verified', 'true');
                if (pinError) pinError.classList.add('hidden');
                ui.redirectToDashboard(pendingRoute || 'base-datos.html');
            } else {
                if (pinError) pinError.classList.remove('hidden');
                if (pinInput) {
                    pinInput.value = '';
                    pinInput.focus();
                }
            }
        });
    }
});
