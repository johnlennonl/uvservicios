/**
 * Modulo de autenticacion.
 * Encapsula el acceso a Supabase para iniciar y cerrar sesion.
 */

import { supabase } from './supabaseClient.js';
import { applyNavigationAccessProfile, getAccessProfile, getDefaultRouteForAccessProfile } from './core/access-control.js';

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

        if (data?.user) {
            const profile = getAccessProfile(data.user);
            // Registrar fecha y hora de último acceso y sincronizar rol en segundo plano
            supabase
                .from('profiles')
                .update({ 
                    last_login_at: new Date().toISOString(),
                    role: profile.role
                })
                .eq('id', data.user.id)
                .then(({ error: updateErr }) => {
                    if (updateErr) console.warn('No se pudo actualizar perfil:', updateErr);
                });

            // Registrar log de acceso en la nueva tabla
            supabase
                .from('user_access_logs')
                .insert([{
                    user_id: data.user.id,
                    email: data.user.email,
                    login_time: new Date().toISOString()
                }])
                .then(({ error: logErr }) => {
                    if (logErr) console.warn('No se pudo guardar el log de acceso:', logErr);
                });
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
    sessionStorage.removeItem('uv-stats-monitoring-detail-state');
    localStorage.removeItem('uv-stats-monitoring-state');
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
    if (data?.session) {
        try {
            const profile = getAccessProfile(data.session);
            applyNavigationAccessProfile(profile);

            // Buscar elementos del header y sidebar para pintar el usuario activo dinámicamente
            const headerNameEl = document.getElementById('header-user-name');
            const headerRoleEl = document.getElementById('header-user-role');
            const sidebarNameEl = document.getElementById('sidebar-user-name');
            const sidebarRoleEl = document.getElementById('sidebar-user-role');

            if (headerNameEl || headerRoleEl || sidebarNameEl || sidebarRoleEl) {
                const labels = {
                    admin: 'Administrador del Sistema',
                    supervisor: 'Supervisor',
                    campo: 'Técnico de Campo',
                    cliente_view: 'Cliente',
                    base_datos: 'Administrador Base de Datos',
                    gestor_usuarios: 'Gestor de Accesos',
                    gerencial: 'Gerencial / Dirección'
                };
                
                const roleLabel = labels[profile.role] || profile.role || 'Cliente';
                const userEmail = data.session.user.email;

                if (headerRoleEl) headerRoleEl.textContent = roleLabel;
                if (sidebarRoleEl) sidebarRoleEl.textContent = roleLabel;
                
                const currentName = headerNameEl ? headerNameEl.textContent.trim() : (sidebarNameEl ? sidebarNameEl.textContent.trim() : '');
                
                if (!currentName || currentName === 'Cargando...' || currentName === userEmail) {
                    if (headerNameEl) headerNameEl.textContent = userEmail;
                    if (sidebarNameEl) sidebarNameEl.textContent = userEmail;

                    // Intentar traer el nombre real
                    supabase
                        .from('profiles')
                        .select('nombre, apellido')
                        .eq('id', data.session.user.id)
                        .single()
                        .then(({ data: userProf }) => {
                            if (userProf?.nombre) {
                                const fullName = `${userProf.nombre} ${userProf.apellido || ''}`.trim();
                                if (headerNameEl) headerNameEl.textContent = fullName;
                                if (sidebarNameEl) sidebarNameEl.textContent = fullName;
                            }
                        });
                }

                // Cargar avatar personalizado y configurar el evento click en la tarjeta de perfil
                const sidebarAvatarEl = document.querySelector('.sidebar-user-info img') || document.getElementById('sidebar-user-avatar');
                if (sidebarAvatarEl) {
                    import('./services/profile-service.js').then(({ resolveUserAvatarUrl }) => {
                        resolveUserAvatarUrl(data.session.user.id).then(url => {
                            if (url) sidebarAvatarEl.src = url;
                        });
                    });
                }

                const userCardEl = document.querySelector('.sidebar-user-info') || document.getElementById('sidebar-user-card');
                if (userCardEl && !userCardEl.dataset.profileListenerAttached) {
                    userCardEl.dataset.profileListenerAttached = 'true';
                    userCardEl.style.cursor = 'pointer';
                    userCardEl.addEventListener('click', () => {
                        import('./services/profile-service.js').then(({ openUserProfileModal }) => {
                            openUserProfileModal();
                        });
                    });
                }

                // Inyectar avatar de perfil en el mobile top app bar (reemplazando la píldora Online)
                const mobileRightBar = document.querySelector('.mobile-app-bar-right');
                if (mobileRightBar) {
                    let mobileTrigger = document.getElementById('mobile-profile-trigger');
                    if (!mobileTrigger) {
                        mobileTrigger = document.createElement('div');
                        mobileTrigger.id = 'mobile-profile-trigger';
                        mobileTrigger.className = 'mobile-profile-avatar-wrapper';
                        mobileTrigger.style.cursor = 'pointer';

                        const portalLink = document.getElementById('mobile-link-portal');
                        if (portalLink) {
                            mobileRightBar.innerHTML = '';
                            mobileRightBar.appendChild(portalLink);
                            mobileRightBar.appendChild(mobileTrigger);
                        } else {
                            mobileRightBar.innerHTML = '';
                            mobileRightBar.appendChild(mobileTrigger);
                        }

                        mobileTrigger.addEventListener('click', () => {
                            import('./services/profile-service.js').then(({ openUserProfileModal }) => {
                                openUserProfileModal();
                            });
                        });
                    }

                    // Cargar imagen o inicial en el avatar móvil
                    import('./services/profile-service.js').then(({ resolveUserAvatarUrl, getLocalAvatar }) => {
                        resolveUserAvatarUrl(data.session.user.id).then(url => {
                            const local = getLocalAvatar(data.session.user.id);
                            const isDefault = !local && (!url || url.includes('default-avatar.webp'));

                            if (isDefault) {
                                supabase
                                    .from('profiles')
                                    .select('nombre')
                                    .eq('id', data.session.user.id)
                                    .single()
                                    .then(({ data: userProf }) => {
                                        const letter = userProf?.nombre ? userProf.nombre.charAt(0).toUpperCase() : (data.session.user.email ? data.session.user.email.charAt(0).toUpperCase() : '?');
                                        mobileTrigger.innerHTML = `<div class="mobile-profile-avatar-placeholder">${letter}</div>`;
                                    });
                            } else {
                                mobileTrigger.innerHTML = `<img src="${url}" alt="Profile" class="mobile-profile-avatar-img">`;
                            }
                        });
                    });
                }
            }
        } catch (e) {
            console.warn('Error aplicando perfil de navegación:', e);
        }
    }
    return data?.session || null;
}

export { applyNavigationAccessProfile, getAccessProfile, getDefaultRouteForAccessProfile };
