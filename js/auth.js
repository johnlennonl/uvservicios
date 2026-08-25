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
                
                // Intentar cargar nombre y saludo dinámico usando caché de sesión para performance
                const cachedFullName = sessionStorage.getItem('uv-user-fullname');
                const cachedFirstName = sessionStorage.getItem('uv-user-firstname');

                function applyUserGreeting(firstName) {
                    const welcomeTitleEl = document.getElementById('welcome-title');
                    if (welcomeTitleEl) {
                        const hour = new Date().getHours();
                        let greeting = '¡Hola';
                        if (hour >= 6 && hour < 12) {
                            greeting = '¡Buenos días';
                        } else if (hour >= 12 && hour < 19) {
                            greeting = '¡Buenas tardes';
                        } else {
                            greeting = '¡Buenas noches';
                        }
                        welcomeTitleEl.innerHTML = `${greeting}, <span style="color: #2563eb;">${firstName}</span>! 👋`;
                    }
                }

                if (cachedFullName && cachedFirstName) {
                    if (headerNameEl) headerNameEl.textContent = cachedFullName;
                    if (sidebarNameEl) sidebarNameEl.textContent = cachedFullName;
                    applyUserGreeting(cachedFirstName);
                } else {
                    if (headerNameEl) headerNameEl.textContent = userEmail;
                    if (sidebarNameEl) sidebarNameEl.textContent = userEmail;

                    supabase
                        .from('profiles')
                        .select('nombre, apellido')
                        .eq('id', data.session.user.id)
                        .single()
                        .then(({ data: userProf }) => {
                            if (userProf?.nombre) {
                                const fullName = `${userProf.nombre} ${userProf.apellido || ''}`.trim();
                                const firstName = userProf.nombre.trim().split(' ')[0];
                                
                                sessionStorage.setItem('uv-user-fullname', fullName);
                                sessionStorage.setItem('uv-user-firstname', firstName);

                                if (headerNameEl) headerNameEl.textContent = fullName;
                                if (sidebarNameEl) sidebarNameEl.textContent = fullName;
                                applyUserGreeting(firstName);
                            }
                        });
                }

                // Cargar avatar personalizado o iniciales en el sidebar footer de forma dinámica
                const sidebarAvatarContainer = document.querySelector('.sidebar-avatar') || document.getElementById('sidebar-user-avatar');
                if (sidebarAvatarContainer) {
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
                                        sidebarAvatarContainer.innerHTML = `<div class="sidebar-avatar-placeholder">${letter}</div>`;
                                    });
                            } else {
                                sidebarAvatarContainer.innerHTML = `<img src="${url}" alt="Avatar" class="sidebar-avatar-img">`;
                            }
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

// Bucle de ayuda global interactivo (SweetAlert2)
function showSectionHelpModal(section) {
    if (!window.Swal) return;

    const sectionsInfo = {
        dashboard: {
            title: 'Guía del Panel de Operación BES',
            desc: 'Visualización y diagnóstico en tiempo real de la telemetría del pozo activo.',
            points: [
                '<b>Parámetros Críticos:</b> Monitorea Frecuencia (Hz), Presión PIP (PSI), Temperatura (Motor) y Estado (RUN/STOP).',
                '<b>Filtros de Búsqueda:</b> Selecciona el pozo activo y el rango de datos históricos a consultar en los selectores.',
                '<b>Navegación:</b> Usa la opción "Scroll seguro" para explorar las tarjetas sin interferir con el desplazamiento de los gráficos.'
            ]
        },
        gestion: {
            title: 'Módulo de Gestión de Datos BES',
            desc: 'Centro administrativo para la ingesta y parametrización de información técnica.',
            points: [
                '<b>Entrada de Parámetros:</b> Captura diaria por turnos o importación masiva mediante plantillas Excel/CSV.',
                '<b>Producción Técnica:</b> Registro mensual de volúmenes de producción (BPPD, %AyS, BNPD).',
                '<b>Ficha de Pozos:</b> Configuración del equipo de fondo (Bomba, Motor, Sensor, Cable y Variador).',
                '<b>Niveles / Echometer:</b> Registro de niveles dinámicos y presiones de fondo PIP.'
            ]
        },
        data: {
            title: 'Guía de la Base de Datos Histórica',
            desc: 'Explorador y descarga de toda la base de datos de telemetría operativa BES.',
            points: [
                '<b>Consultas Rápidas:</b> Filtra registros por pozo, rango de fechas y tipo de medición.',
                '<b>Descarga de Informes:</b> Exporta los datos consultados a hojas de cálculo de Excel en un clic.',
                '<b>Pestañas:</b> Alterna entre "Historial Operativo" (parámetros diarios) e "Historial de Medición Técnica" (fondo).'
            ]
        },
        consolidado: {
            title: 'Guía del Consolidado Maestro',
            desc: 'Base de datos consolidada unificada de todas las operaciones BES de UV Servicios.',
            points: [
                '<b>Mantenimiento:</b> Permite registrar y editar las mediciones oficiales consolidadas.',
                '<b>Importación:</b> Carga masiva de planillas de consolidado histórico.',
                '<b>Exportación:</b> Genera informes ejecutivos de consolidado técnico.'
            ]
        },
        stats: {
            title: 'Guía de Análisis Estadístico',
            desc: 'Métricas de rendimiento e indicadores clave BES para directivos y supervisores.',
            points: [
                '<b>Tendencias BES:</b> Gráficos interactivos de evolución de frecuencia, PIP y temperaturas.',
                '<b>KPIs Clave:</b> Análisis y cálculo automático del Tiempo Medio Entre Fallas (MTBF) de los equipos.',
                '<b>Reportes:</b> Generación de resúmenes de actividad operativa por campo.'
            ]
        },
        campo: {
            title: 'Control de Jornadas de Campo',
            desc: 'Bandeja de revisión, aprobación e histórico de jornadas reportadas por técnicos.',
            points: [
                '<b>Flujo de Aprobación:</b> Revisa las jornadas en estado "Pendiente" enviadas desde el pozo.',
                '<b>Aprobación/Rechazo:</b> Aprueba para consolidar los datos o rechaza con observaciones.',
                '<b>Historial de Revisiones:</b> Consulta jornadas anteriores filtrando por estado o técnico.'
            ]
        }
    };

    const info = sectionsInfo[section];
    if (!info) return;

    window.Swal.fire({
        title: info.title,
        html: `
            <div style="text-align: left; font-size: 0.9rem; line-height: 1.6; color: #374151; font-family: 'Outfit', sans-serif;">
                <p style="margin-bottom: 14px; font-weight: 500; color: #1e293b;">${info.desc}</p>
                <ul style="padding-left: 20px; margin: 0; display: flex; flex-direction: column; gap: 8px;">
                    ${info.points.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        `,
        icon: 'info',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#2563eb',
        customClass: {
            popup: 'premium-swal-popup',
            title: 'premium-swal-title'
        }
    });
}

// Delegación de eventos global para disparar la ayuda en cualquier página
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.section-help-trigger');
    if (trigger) {
        const section = trigger.getAttribute('data-help-section');
        showSectionHelpModal(section);
    }
});
