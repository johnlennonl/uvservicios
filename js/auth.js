/**
 * Authentication Module - Supabase Edition
 * Handles real authentication calls using the Supabase client.
 */

import { supabase } from './supabaseClient.js';

/**
 * Validates the credentials against Supabase.
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
            // Map common Supabase errors to user-friendly messages
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
 * Signs out the current user.
 */
export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    window.location.href = 'index.html';
}

/**
 * Checks if there is an active session.
 */
export async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
}
