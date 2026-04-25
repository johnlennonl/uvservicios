/**
 * Modulo de autenticacion.
 * Encapsula el acceso a Supabase para iniciar y cerrar sesion.
 */

import { supabase } from './supabaseClient.js';

const READ_ONLY_EMAILS = new Set([
    'ingeniero@uvservicios.com'
]);

/**
 * Valida las credenciales contra Supabase.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, message: string, user: object}>}
 */
export async function login(email, password) {
    try {
        if (!email || !password) {
            return { success: false, message: 'Por favor complete todos los campos.' };
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            // Traduce errores comunes de Supabase a mensajes comprensibles para la interfaz.
            let msg = 'Credenciales inválidas. Intente de nuevo.';
            if (error.message.includes('Invalid login credentials')) {
                msg = 'Usuario o contraseña incorrectos.';
            } else if (error.message.includes('Email not confirmed')) {
                msg = 'El correo electrónico no ha sido confirmado.';
            }
            return { success: false, message: msg };
        }

        return { success: true, user: data.user };
    } catch (err) {
        console.error('Supabase Auth Error:', err);
        return { success: false, message: 'Error de conexión con el servidor.' };
    }
}

/**
 * Cierra la sesion actual y limpia el contexto temporal del navegador.
 */
export async function logout() {
    sessionStorage.removeItem('dashboard-visited');
    sessionStorage.removeItem('uv-selected-pozo');
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    window.location.href = 'index.html';
}

/**
 * Devuelve la sesion activa si existe.
 */
export async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
}

export function getAccessProfile(sessionOrUser) {
    const user = sessionOrUser?.user || sessionOrUser || null;
    const email = String(user?.email || '').trim().toLowerCase();
    const isReadOnly = READ_ONLY_EMAILS.has(email);

    return {
        email,
        isReadOnly,
        canViewManagement: !isReadOnly,
        canEditData: !isReadOnly
    };
}
