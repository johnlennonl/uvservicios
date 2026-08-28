/**
 * Servicio y Controlador del Perfil de Usuario.
 * Permite cambiar el nombre, subir foto de perfil y actualizar la contraseña de forma autónoma.
 */

import { supabase } from '../supabaseClient.js';
import { getSession } from '../auth.js';
import { getAccessProfile } from '../core/access-control.js';

const LOCAL_AVATAR_PREFIX = 'uv-avatar-local-v1:';

// Obtiene la foto de perfil de contingencia en localStorage
export function getLocalAvatar(userId) {
    try {
        return localStorage.getItem(`${LOCAL_AVATAR_PREFIX}${userId}`) || null;
    } catch {
        return null;
    }
}

// Guarda la foto de perfil de contingencia en localStorage
export function saveLocalAvatar(userId, base64Data) {
    try {
        if (base64Data) {
            localStorage.setItem(`${LOCAL_AVATAR_PREFIX}${userId}`, base64Data);
        } else {
            localStorage.removeItem(`${LOCAL_AVATAR_PREFIX}${userId}`);
        }
    } catch (e) {
        console.warn('No se pudo guardar el avatar en localStorage:', e);
    }
}

/**
 * Resuelve la URL del avatar del usuario.
 * Prioriza Supabase Storage y usa localStorage como plan de contingencia.
 */
export async function resolveUserAvatarUrl(userId) {
    if (!userId) return 'img/default-avatar.webp';

    // 0. Si el avatar está marcado como roto/inexistente, retornar default directamente
    try {
        if (localStorage.getItem(`uv-avatar-broken:${userId}`) === 'true') {
            return 'img/default-avatar.webp';
        }
    } catch (e) {}

    // 1. Verificar plan de contingencia local
    const local = getLocalAvatar(userId);
    if (local) return local;

    // 2. Intentar obtener de la caché de sesión
    const sessionCacheKey = `uv-user-avatar-url:${userId}`;
    const cachedUrl = sessionStorage.getItem(sessionCacheKey);
    if (cachedUrl) return cachedUrl;

    // 3. Consultar columna avatar_url de la tabla profiles
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', userId)
            .single();
        
        if (!error && data?.avatar_url) {
            sessionStorage.setItem(sessionCacheKey, data.avatar_url);
            return data.avatar_url;
        }
    } catch (err) {
        console.warn('Error resolviendo avatar desde profiles:', err);
    }

    return 'img/default-avatar.webp';
}

/**
 * Abre el modal interactivo de Mi Perfil.
 */
export async function openUserProfileModal() {
    const session = await getSession().catch(() => null);
    if (!session?.user) return;

    const user = session.user;
    const userId = user.id;

    // Cargar perfil actual de la base de datos
    let nombre = '';
    let apellido = '';
    try {
        const { data: prof } = await supabase
            .from('profiles')
            .select('nombre, apellido')
            .eq('id', userId)
            .single();
        if (prof) {
            nombre = prof.nombre || '';
            apellido = prof.apellido || '';
        }
    } catch (err) {
        console.warn('Error cargando perfil del usuario:', err);
    }

    const avatarUrl = await resolveUserAvatarUrl(userId);
    const local = getLocalAvatar(userId);
    
    // Determinar si debemos pintar el placeholder con iniciales
    const isDefaultAvatar = !local && (!avatarUrl || avatarUrl.includes('default-avatar.webp'));
    const firstLetter = nombre ? nombre.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : '?');

    // Obtener rol formateado correctamente mediante el perfil de navegación
    const profile = getAccessProfile(session);
    const userRole = profile.role || 'cliente_view';

    const labels = {
        admin: 'Administrador del Sistema',
        supervisor: 'Supervisor',
        campo: 'Técnico de Campo',
        cliente_view: 'Cliente',
        base_datos: 'Administrador Base de Datos',
        gestor_usuarios: 'Gestor de Accesos',
        gerencial: 'Gerencial / Dirección'
    };
    const roleLabel = labels[userRole] || userRole || 'Cliente';
    const requiresPin = ['admin', 'supervisor', 'base_datos', 'seguridad'].includes(userRole);
    const pinBtnDisplay = requiresPin ? 'flex' : 'none';

    // Si ya existe un modal de perfil abierto, lo removemos
    document.getElementById('user-profile-modal')?.remove();

    // Crear el elemento modal
    const modal = document.createElement('div');
    modal.id = 'user-profile-modal';
    modal.className = 'user-profile-modal-overlay';
    modal.innerHTML = `
        <div class="user-profile-modal-card">
            <button type="button" class="user-profile-modal-close" id="btn-close-profile-modal" aria-label="Cerrar modal">&times;</button>
            
            <div class="user-profile-modal-header">
                <h3>Mi Perfil de Usuario</h3>
                <p>Gestiona tu información personal y credenciales de acceso.</p>
            </div>

            <form id="form-user-profile" class="user-profile-modal-form">
                <div class="user-profile-modal-body">
                    <!-- Foto de Perfil / Avatar -->
                    <div class="user-profile-avatar-section">
                        <div class="user-profile-avatar-wrapper">
                            <div class="user-profile-avatar-inner" id="profile-modal-avatar-container">
                                ${isDefaultAvatar 
                                    ? `<div class="profile-modal-avatar-placeholder">${firstLetter}</div>` 
                                    : `<img id="profile-modal-avatar-preview" src="${avatarUrl}" alt="Avatar" onerror="this.onerror=null; this.src='img/default-avatar.webp'; if(window.markAvatarAsBroken) window.markAvatarAsBroken('${userId}');">`
                                }
                            </div>
                            <label for="profile-avatar-file-input" class="user-profile-avatar-hover">
                                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5h.008v.008h-.008V10.5Z" />
                                </svg>
                                <span>Editar</span>
                            </label>
                            <input type="file" id="profile-avatar-file-input" accept="image/*" style="display: none;">
                        </div>
                        <small class="avatar-help-text">Haz clic en la foto para cambiarla (WebP/JPG/PNG, máx 2MB)</small>
                    </div>

                    <!-- Inputs de Nombre y Apellido -->
                    <div class="user-profile-form-grid">
                        <label class="user-profile-input-group">
                            <span>Nombre</span>
                            <input type="text" id="profile-input-nombre" value="${escapeHtml(nombre)}" required placeholder="Escribe tu nombre">
                        </label>
                        <label class="user-profile-input-group">
                            <span>Apellido</span>
                            <input type="text" id="profile-input-apellido" value="${escapeHtml(apellido)}" required placeholder="Escribe tu apellido">
                        </label>
                    </div>

                    <!-- Datos de Solo Lectura -->
                    <div class="user-profile-form-grid read-only-fields">
                        <label class="user-profile-input-group">
                            <span>Correo Electrónico</span>
                            <input type="email" value="${escapeHtml(user.email)}" disabled class="input-disabled">
                        </label>
                        <label class="user-profile-input-group">
                            <span>Rol en la Plataforma</span>
                            <input type="text" value="${escapeHtml(roleLabel)}" disabled class="input-disabled">
                        </label>
                    </div>

                    <!-- Botón para desplegar cambio de contraseña -->
                    <button type="button" id="btn-toggle-change-password" class="btn-profile-secondary">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Cambiar Contraseña</span>
                    </button>

                    <!-- Botón para desplegar cambio de PIN -->
                    <button type="button" id="btn-toggle-change-pin" class="btn-profile-secondary" style="margin-top: 10px; display: ${pinBtnDisplay};">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Cambiar PIN Operativo</span>
                    </button>

                    <!-- Formulario de Cambio de PIN (Plegado por defecto) -->
                    <div id="section-change-pin" class="password-change-section" style="display: none; margin-top: 10px;">
                        <div class="user-profile-form-grid">
                            <label class="user-profile-input-group">
                                <span>PIN Actual</span>
                                <input type="password" id="profile-input-current-pin" placeholder="PIN actual (ej: 0000)" maxlength="4" pattern="[0-9]{4}" inputmode="numeric">
                            </label>
                            <label class="user-profile-input-group">
                                <span>Nuevo PIN (4 dígitos)</span>
                                <input type="password" id="profile-input-new-pin" placeholder="Nuevo PIN (ej: 4826)" maxlength="4" pattern="[0-9]{4}" inputmode="numeric">
                            </label>
                        </div>
                    </div>

                    <!-- Formulario de Cambio de Contraseña (Plegado por defecto) -->
                    <div id="section-change-password" class="password-change-section" style="display: none;">
                        <div class="user-profile-form-grid">
                            <label class="user-profile-input-group">
                                <span>Nueva Contraseña</span>
                                <div class="password-input-container">
                                    <input type="password" id="profile-input-new-password" placeholder="Mínimo 6 caracteres" minlength="6">
                                    <button type="button" class="btn-toggle-password-visibility" data-target="profile-input-new-password" aria-label="Mostrar contraseña">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="eye-icon-visible">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="eye-icon-hidden" style="display: none;">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                        </svg>
                                    </button>
                                </div>
                            </label>
                            <label class="user-profile-input-group">
                                <span>Confirmar Contraseña</span>
                                <div class="password-input-container">
                                    <input type="password" id="profile-input-confirm-password" placeholder="Repite la contraseña" minlength="6">
                                    <button type="button" class="btn-toggle-password-visibility" data-target="profile-input-confirm-password" aria-label="Mostrar contraseña">
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="eye-icon-visible">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" class="eye-icon-hidden" style="display: none;">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                        </svg>
                                    </button>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Botones de Acción -->
                <div class="user-profile-modal-actions">
                    <button type="button" id="btn-cancel-profile" class="btn-profile-cancel">Cancelar</button>
                    <button type="submit" id="btn-save-profile" class="btn-profile-submit">
                        <span>Guardar Cambios</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Eventos del modal
    const closeBtn = document.getElementById('btn-close-profile-modal');
    const cancelBtn = document.getElementById('btn-cancel-profile');
    const form = document.getElementById('form-user-profile');
    const fileInput = document.getElementById('profile-avatar-file-input');
    const avatarPreview = document.getElementById('profile-modal-avatar-preview');
    const togglePassBtn = document.getElementById('btn-toggle-change-password');
    const passSection = document.getElementById('section-change-password');
    const togglePinBtn = document.getElementById('btn-toggle-change-pin');
    const pinSection = document.getElementById('section-change-pin');

    const closeModal = () => {
        modal.classList.add('is-closing');
        setTimeout(() => modal.remove(), 250);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Plegar/desplegar contraseña
    togglePassBtn.addEventListener('click', () => {
        const isHidden = passSection.style.display === 'none';
        passSection.style.display = isHidden ? 'block' : 'none';
        togglePassBtn.classList.toggle('active', isHidden);
        if (isHidden) {
            pinSection.style.display = 'none';
            togglePinBtn.classList.remove('active');
        }
    });

    // Plegar/desplegar PIN
    togglePinBtn.addEventListener('click', () => {
        const isHidden = pinSection.style.display === 'none';
        pinSection.style.display = isHidden ? 'block' : 'none';
        togglePinBtn.classList.toggle('active', isHidden);
        if (isHidden) {
            passSection.style.display = 'none';
            togglePassBtn.classList.remove('active');
        }
    });

    // Alternar visibilidad de contraseña (Ojito)
    modal.querySelectorAll('.btn-toggle-password-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            const isPassword = input.getAttribute('type') === 'password';
            input.setAttribute('type', isPassword ? 'text' : 'password');

            const eyeVisible = btn.querySelector('.eye-icon-visible');
            const eyeHidden = btn.querySelector('.eye-icon-hidden');

            if (isPassword) {
                if (eyeVisible) eyeVisible.style.display = 'none';
                if (eyeHidden) eyeHidden.style.display = 'block';
            } else {
                if (eyeVisible) eyeVisible.style.display = 'block';
                if (eyeHidden) eyeHidden.style.display = 'none';
            }
        });
    });

    // Manejo de la subida local de foto
    let selectedImageBlob = null;
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            if (window.Swal) {
                window.Swal.fire({ icon: 'warning', title: 'Archivo muy pesado', text: 'La foto no debe superar los 2MB.' });
            } else {
                alert('La foto no debe superar los 2MB.');
            }
            fileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Comprimir y recortar a cuadrado de 128x128
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 128;
                canvas.height = 128;

                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;

                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);

                // Previsualizar base64 (remplazando placeholder si existía)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                const container = document.getElementById('profile-modal-avatar-container');
                if (container) {
                    container.innerHTML = `<img id="profile-modal-avatar-preview" src="${compressedBase64}" alt="Avatar">`;
                }

                // Guardar blob para subir
                canvas.toBlob((blob) => {
                    selectedImageBlob = blob;
                }, 'image/jpeg', 0.85);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newNombre = document.getElementById('profile-input-nombre').value.trim();
        const newApellido = document.getElementById('profile-input-apellido').value.trim();
        const newPassword = document.getElementById('profile-input-new-password').value;
        const confirmPassword = document.getElementById('profile-input-confirm-password').value;

        const currentPin = document.getElementById('profile-input-current-pin')?.value?.trim();
        const newPin = document.getElementById('profile-input-new-pin')?.value?.trim();

        // Validar PIN si se llenó
        if (newPin) {
            if (!currentPin) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Debes ingresar tu PIN actual para poder cambiarlo.' });
                return;
            }
            if (!/^[0-9]{4}$/.test(newPin)) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'El nuevo PIN debe ser de exactamente 4 dígitos numéricos.' });
                return;
            }
            if (newPin === '0000') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Por seguridad, no puedes elegir 0000 como tu PIN de seguridad.' });
                return;
            }
        }

        // Validar contraseña si se llenó
        if (newPassword || confirmPassword) {
            if (newPassword !== confirmPassword) {
                if (window.Swal) {
                    window.Swal.fire({ icon: 'error', title: 'Error', text: 'Las contraseñas no coinciden.' });
                } else {
                    alert('Las contraseñas no coinciden.');
                }
                return;
            }
            if (newPassword.length < 6) {
                if (window.Swal) {
                    window.Swal.fire({ icon: 'error', title: 'Error', text: 'La contraseña debe tener al menos 6 caracteres.' });
                } else {
                    alert('La contraseña debe tener al menos 6 caracteres.');
                }
                return;
            }
        }

        // Mostrar cargador en el botón submit
        const submitBtn = document.getElementById('btn-save-profile');
        submitBtn.disabled = true;
        const origHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span>Guardando...</span>`;

        try {
            // 1. Guardar cambios en la tabla profiles
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({ nombre: newNombre, apellido: newApellido })
                .eq('id', userId);
            
            if (profileErr) throw profileErr;

            // 2. Subir avatar si se seleccionó uno nuevo
            let finalAvatarUrl = avatarUrl;
            if (selectedImageBlob) {
                // Intentar subir a Supabase Storage
                const { error: uploadErr } = await supabase.storage
                    .from('avatars')
                    .upload(`${userId}.webp`, selectedImageBlob, {
                        cacheControl: '3600',
                        upsert: true
                    });

                if (!uploadErr) {
                    const { data: pubData } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(`${userId}.webp`);
                    if (pubData?.publicUrl) {
                        finalAvatarUrl = pubData.publicUrl;
                        try {
                            localStorage.removeItem(`uv-avatar-broken:${userId}`);
                        } catch (e) {}
                        // También actualizar perfil con url del avatar si la columna existe (opcional, fallback local)
                        await supabase
                            .from('profiles')
                            .update({ avatar_url: finalAvatarUrl })
                            .eq('id', userId)
                            .catch(() => null);
                    }
                } else {
                    console.warn('Fallo subida a Supabase Storage, guardando en local storage:', uploadErr);
                    // Contingencia: Guardar como base64 en localStorage
                    const activePreview = document.getElementById('profile-modal-avatar-preview');
                    if (activePreview) {
                        saveLocalAvatar(userId, activePreview.src);
                        finalAvatarUrl = activePreview.src;
                    }
                }
            }

            // 3. Cambiar contraseña si se llenó
            if (newPassword) {
                const { error: passErr } = await supabase.auth.updateUser({ password: newPassword });
                if (passErr) throw passErr;
            }

            // 3b. Cambiar PIN si se llenó
            if (newPin) {
                const { data: success, error: pinErr } = await supabase.rpc('change_my_pin', {
                    p_old_pin: currentPin,
                    p_new_pin: newPin
                });
                if (pinErr) throw pinErr;
                if (success !== true) {
                    throw new Error('El PIN actual ingresado es incorrecto.');
                }
            }

            // 4. Refrescar visualmente el sidebar, header y saludo en caliente
            const fullName = `${newNombre} ${newApellido}`.trim();
            const firstName = newNombre.trim().split(' ')[0];

            sessionStorage.setItem('uv-user-fullname', fullName);
            sessionStorage.setItem('uv-user-firstname', firstName);

            const sidebarNameEl = document.getElementById('sidebar-user-name');
            const headerNameEl = document.getElementById('header-user-name');
            const sidebarAvatarEl = document.querySelector('.sidebar-user-info img') || document.querySelector('.sidebar-avatar img');
            const welcomeTitleEl = document.getElementById('welcome-title');

            if (sidebarNameEl) sidebarNameEl.textContent = fullName;
            if (headerNameEl) headerNameEl.textContent = fullName;
            if (sidebarAvatarEl) sidebarAvatarEl.src = finalAvatarUrl;

            // Actualizar saludo en caliente si el elemento existe en el dashboard
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

            closeModal();

            if (window.Swal) {
                window.Swal.fire({
                    icon: 'success',
                    title: 'Perfil actualizado',
                    text: 'Los cambios se han guardado correctamente.',
                    timer: 3000,
                    showConfirmButton: false
                });
            } else {
                alert('Perfil actualizado correctamente.');
            }

        } catch (err) {
            console.error('Error al guardar cambios de perfil:', err);
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;

            if (window.Swal) {
                window.Swal.fire({
                    icon: 'error',
                    title: 'Error al guardar',
                    text: err.message || 'Ocurrió un problema inesperado.'
                });
            } else {
                alert('Error al guardar: ' + (err.message || 'Problema inesperado'));
            }
        }
    });
}

// Auxiliar para escapar cadenas HTML y prevenir XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
