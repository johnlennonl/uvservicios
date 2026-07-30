import { supabase } from './supabaseClient.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { CONFIG } from './config.js';
import { getSession, logout, getAccessProfile } from './auth.js';

// DOM elements
const activeUserNameEl = document.getElementById('active-user-name');
const statTotalUsersEl = document.getElementById('stat-total-users');
const statActiveSessionsEl = document.getElementById('stat-active-sessions');
const statActiveRolesEl = document.getElementById('stat-active-roles');
const formCreateUser = document.getElementById('form-create-user');
const btnSubmitUser = document.getElementById('btn-submit-user');
const usersTableBody = document.getElementById('users-table-body');
const tableShimmerLoader = document.getElementById('table-shimmer-loader');
const searchUsersInput = document.getElementById('search-users');
const btnLogout = document.getElementById('logout-btn');

// Modal Elements
const modalOverlay = document.getElementById('user-management-modal');
const btnCloseModal = document.getElementById('close-modal-btn');
const modalUserFullName = document.getElementById('modal-user-fullname');
const modalUserEmail = document.getElementById('modal-user-email');
const tabButtons = document.querySelectorAll('.modal-tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Tab details fields
const detailEmpresa = document.getElementById('detail-empresa');
const detailRole = document.getElementById('detail-role');
const detailLastLogin = document.getElementById('detail-last-login');
const detailCreated = document.getElementById('detail-created');

// Password change fields
const formChangePassword = document.getElementById('form-change-password');
const changePassUserId = document.getElementById('change-pass-user-id');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const togglePasswordsVis = document.getElementById('toggle-passwords-vis');
const btnSubmitChangePass = document.getElementById('btn-submit-change-pass');

// Timeline fields
const logsTimeline = document.getElementById('logs-timeline');
const logsTimelineLoader = document.getElementById('logs-timeline-loader');
const logsEmptyMessage = document.getElementById('logs-empty-message');

let allProfiles = [];
let currentSortCol = null;
let isAscending = true;

// Helper to escape HTML safely
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 1. Session Verification
async function checkAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    const profile = getAccessProfile(session);
    if (!profile.canManageUsers) {
        window.location.href = 'dashboard.html';
        return null;
    }

    // Show active user name in header
    activeUserNameEl.textContent = profile.email;
    
    // Fetch profile info for display if it exists
    try {
        const { data: userProf } = await supabase
            .from('profiles')
            .select('nombre, apellido')
            .eq('id', session.user.id)
            .single();
        if (userProf?.nombre) {
            activeUserNameEl.textContent = `${userProf.nombre} ${userProf.apellido}`;
        }
    } catch (e) {
        console.warn('Could not load current user profile:', e);
    }

    return session;
}

// Helper to filter and sort profiles in memory
function getProcessedProfiles() {
    let list = [...allProfiles];
    
    // 1. Filter
    const query = (searchUsersInput?.value || '').toLowerCase().trim();
    if (query) {
        list = list.filter(p => {
            const fullName = `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase();
            const email = String(p.email || '').toLowerCase();
            const empresa = String(p.empresa || '').toLowerCase();
            return fullName.includes(query) || email.includes(query) || empresa.includes(query);
        });
    }
    
    // 2. Sort
    if (currentSortCol) {
        list.sort((a, b) => {
            let valA = '';
            let valB = '';
            
            if (currentSortCol === 'nombre') {
                valA = `${a.nombre || ''} ${a.apellido || ''}`.trim().toLowerCase();
                valB = `${b.nombre || ''} ${b.apellido || ''}`.trim().toLowerCase();
            } else if (currentSortCol === 'email') {
                valA = String(a.email || '').toLowerCase();
                valB = String(b.email || '').toLowerCase();
            } else if (currentSortCol === 'empresa') {
                valA = String(a.empresa || 'UV Servicios').toLowerCase();
                valB = String(b.empresa || 'UV Servicios').toLowerCase();
            } else if (currentSortCol === 'role') {
                valA = getRoleLabel(a.role).toLowerCase();
                valB = getRoleLabel(b.role).toLowerCase();
            } else if (currentSortCol === 'last_login') {
                valA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
                valB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
            } else if (currentSortCol === 'status') {
                valA = a.last_login_at ? 1 : 0;
                valB = b.last_login_at ? 1 : 0;
            }
            
            if (valA < valB) return isAscending ? -1 : 1;
            if (valA > valB) return isAscending ? 1 : -1;
            return 0;
        });
    }
    
    return list;
}

// 2. Fetch and render user list
async function loadUsers() {
    tableShimmerLoader.style.display = 'block';
    usersTableBody.innerHTML = '';
    
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        allProfiles = profiles || [];
        renderUsers(getProcessedProfiles());
        updateStats(allProfiles);
    } catch (err) {
        console.error('Error fetching profiles:', err);
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">
                    ⚠️ Error al cargar los usuarios: ${escapeHtml(err.message)}
                </td>
            </tr>
        `;
    } finally {
        tableShimmerLoader.style.display = 'none';
    }
}

function renderUsers(profiles) {
    if (profiles.length === 0) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #64748b; padding: 30px;">
                    Sin resultados.
                </td>
            </tr>
        `;
        return;
    }

    usersTableBody.innerHTML = profiles.map(profile => {
        const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
        const roleLabel = getRoleLabel(profile.role);
        const roleBadgeClass = getRoleBadgeClass(profile.role);
        
        let lastLoginText = 'Nunca';
        if (profile.last_login_at) {
            lastLoginText = new Date(profile.last_login_at).toLocaleString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }

        const isUserActive = profile.last_login_at ? 'Activo' : 'Creado';
        const statusBadgeStyle = profile.last_login_at
            ? 'background: #ecfdf5; color: #047857;'
            : 'background: #f1f5f9; color: #475569;';

        return `
            <tr>
                <td style="font-weight: 700; color: #0f172a;">${escapeHtml(fullName)}</td>
                <td style="color: #475569;">${escapeHtml(profile.email)}</td>
                <td>${escapeHtml(profile.empresa || 'UV Servicios')}</td>
                <td>
                    <span class="role-badge-premium ${roleBadgeClass}">${escapeHtml(roleLabel)}</span>
                </td>
                <td style="font-size: 0.8rem; color: #64748b;">${escapeHtml(lastLoginText)}</td>
                <td style="text-align: center;">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 0.72rem; font-weight: 700; ${statusBadgeStyle}">
                        ${isUserActive}
                    </span>
                </td>
                <td style="text-align: center;">
                    <button type="button" class="btn-manage-user" data-user-id="${escapeHtml(profile.id)}">
                        Gestionar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStats(profiles) {
    statTotalUsersEl.textContent = String(profiles.length);
    
    // Count active sessions (users who logged in within the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeCount = profiles.filter(p => p.last_login_at && new Date(p.last_login_at) > thirtyDaysAgo).length;
    statActiveSessionsEl.textContent = String(activeCount);
    
    // Distinct roles count
    const roles = new Set(profiles.map(p => p.role).filter(Boolean));
    statActiveRolesEl.textContent = String(roles.size);
}

function getRoleLabel(role) {
    const labels = {
        admin: 'Administrador',
        supervisor: 'Supervisor',
        campo: 'Técnico de Campo',
        cliente_view: 'Cliente (Solo Lectura)',
        base_datos: 'Base de Datos',
        gestor_usuarios: 'Gestor de Accesos'
    };
    return labels[role] || role || 'Cliente (Solo Lectura)';
}

function getRoleBadgeClass(role) {
    const classes = {
        admin: 'badge-admin',
        supervisor: 'badge-supervisor',
        campo: 'badge-campo',
        cliente_view: 'badge-cliente',
        base_datos: 'badge-database',
        gestor_usuarios: 'badge-gestor'
    };
    return classes[role] || 'badge-cliente';
}

// 3. User Onboarding (using temporary client to bypass local session override)
async function createUser(email, password, nombre, apellido, empresa, role) {
    // Initialize temporary non-persist client
    const tempClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    // 1. Sign up the new user
    const { data: authData, error: authError } = await tempClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                nombre,
                apellido,
                empresa,
                role
            }
        }
    });

    if (authError) throw authError;

    const newUser = authData.user;
    if (!newUser) throw new Error('No se pudo inicializar la cuenta de autenticación.');

    // 2. Insert profile directly in public.profiles to guarantee immediate display (in case trigger takes a second)
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert([{
            id: newUser.id,
            email: email.trim().toLowerCase(),
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            empresa: empresa.trim(),
            role: role,
            clave_plana: password
        }]);

    if (profileError) {
        console.warn('Profile direct insert failed, relying on DB trigger:', profileError);
    }
}

// 4. Modal management functions
function openUserModal(profile) {
    const fullName = `${profile.nombre || ''} ${profile.apellido || ''}`.trim();
    modalUserFullName.textContent = fullName || 'Sin Nombre';
    modalUserEmail.textContent = profile.email;
    
    document.getElementById('edit-profile-user-id').value = profile.id;
    document.getElementById('edit-profile-clave-plana').value = profile.clave_plana || '';
    document.getElementById('edit-nombre').value = profile.nombre || '';
    document.getElementById('edit-apellido').value = profile.apellido || '';
    document.getElementById('edit-empresa').value = profile.empresa || 'UV Servicios';
    document.getElementById('edit-role').value = profile.role || 'cliente_view';
    
    detailLastLogin.textContent = profile.last_login_at
        ? new Date(profile.last_login_at).toLocaleString('es-VE', { hour12: true })
        : 'Nunca';
        
    detailCreated.textContent = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString('es-VE')
        : 'Desconocida';
        
    changePassUserId.value = profile.id;
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    
    // Activate Details Tab by default
    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'tab-info'));
    tabContents.forEach(tab => tab.classList.toggle('active', tab.id === 'tab-info'));
    
    modalOverlay.style.display = 'flex';
    setTimeout(() => {
        modalOverlay.classList.add('active');
    }, 10);
}

function closeUserModal() {
    modalOverlay.classList.remove('active');
    setTimeout(() => {
        modalOverlay.style.display = 'none';
    }, 150);
}

async function loadAccessLogs(userId) {
    logsTimelineLoader.style.display = 'block';
    logsTimeline.innerHTML = '';
    logsEmptyMessage.style.display = 'none';
    
    try {
        const { data: logs, error } = await supabase
            .from('user_access_logs')
            .select('*')
            .eq('user_id', userId)
            .order('login_time', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        if (!logs || logs.length === 0) {
            logsEmptyMessage.style.display = 'block';
            return;
        }
        
        logsTimeline.innerHTML = logs.map(log => {
            const dateStr = new Date(log.login_time).toLocaleString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            return `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <span class="timeline-time">${escapeHtml(dateStr)}</span>
                        <span class="timeline-label">Inicio de sesión registrado</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading logs:', err);
        logsTimeline.innerHTML = `
            <div style="color: #ef4444; font-weight: 600; padding: 10px; text-align: center;">
                ⚠️ Error al cargar el historial: ${escapeHtml(err.message)}
            </div>
        `;
    } finally {
        logsTimelineLoader.style.display = 'none';
    }
}

// 5. Events binding
document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    if (!session) return;

    await loadUsers();

    // Table Header Sorting listeners
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const sortCol = th.dataset.sort;
            if (currentSortCol === sortCol) {
                isAscending = !isAscending;
            } else {
                currentSortCol = sortCol;
                isAscending = true;
            }
            
            document.querySelectorAll('th[data-sort]').forEach(item => {
                item.classList.remove('th-sorted-asc', 'th-sorted-desc');
            });
            th.classList.add(isAscending ? 'th-sorted-asc' : 'th-sorted-desc');
            
            renderUsers(getProcessedProfiles());
        });
    });

    // Search filter listener
    searchUsersInput.addEventListener('input', () => {
        renderUsers(getProcessedProfiles());
    });

    // Event delegation for "Gestionar" buttons in the table
    usersTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-manage-user');
        if (btn) {
            const userId = btn.dataset.userId;
            const profile = allProfiles.find(p => p.id === userId);
            if (profile) {
                openUserModal(profile);
            }
        }
    });

    // Close modal triggers
    btnCloseModal.addEventListener('click', closeUserModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeUserModal();
        }
    });

    // Modal Tabs Navigation
    tabButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetTabId = btn.dataset.tab;
            
            tabButtons.forEach(b => b.classList.toggle('active', b === btn));
            tabContents.forEach(tab => tab.classList.toggle('active', tab.id === targetTabId));
            
            if (targetTabId === 'tab-logs') {
                await loadAccessLogs(changePassUserId.value);
            }
        });
    });

    // Password fields visibility toggle
    togglePasswordsVis.addEventListener('change', () => {
        const type = togglePasswordsVis.checked ? 'text' : 'password';
        newPasswordInput.type = type;
        confirmPasswordInput.type = type;
    });

    // Password change submit handler
    formChangePassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = changePassUserId.value;
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        if (password.length < 6) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseña muy corta',
                text: 'La contraseña debe tener al menos 6 caracteres.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }
        
        if (password !== confirmPassword) {
            Swal.fire({
                icon: 'warning',
                title: 'Contraseñas no coinciden',
                text: 'Por favor, asegúrate de que ambas contraseñas escritas sean iguales.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }
        
        btnSubmitChangePass.disabled = true;
        btnSubmitChangePass.textContent = 'Actualizando...';
        
        try {
            const { data, error } = await supabase.rpc('admin_change_user_password', {
                target_user_id: userId,
                new_password: password
            });
            
            if (error) throw error;
            
            const email = document.getElementById('modal-user-email').textContent.trim();
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const accessLink = 'https://uvservicios.vercel.app/';
            
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Se ha actualizado tu contraseña de ingreso. Aquí tienes tus credenciales:

📧 *Correo:* ${email}
🔒 *Nueva Contraseña:* ${password}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: '¡Contraseña Actualizada!',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar las nuevas credenciales listas para enviar al usuario:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Se ha actualizado tu contraseña.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${password}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Credenciales',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'Las credenciales actualizadas han sido copiadas al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'Las credenciales actualizadas han sido copiadas al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }
            
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            closeUserModal();
        } catch (err) {
            console.error('Error changing password:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error al cambiar contraseña',
                text: err.message || 'Ocurrió un error inesperado al intentar cambiar la contraseña.',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            btnSubmitChangePass.disabled = false;
            btnSubmitChangePass.textContent = 'Actualizar Contraseña';
        }
    });

    // Profile Edit submit handler
    const formEditProfile = document.getElementById('form-edit-profile');
    const btnSubmitEditProfile = document.getElementById('btn-submit-edit-profile');
    if (formEditProfile) {
        formEditProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const userId = document.getElementById('edit-profile-user-id').value;
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const empresa = document.getElementById('edit-empresa').value.trim();
            const role = document.getElementById('edit-role').value;
            
            btnSubmitEditProfile.disabled = true;
            btnSubmitEditProfile.textContent = 'Guardando...';
            
            try {
                const { data, error } = await supabase.rpc('admin_update_user_profile', {
                    target_user_id: userId,
                    new_nombre: nombre,
                    new_apellido: apellido,
                    new_empresa: empresa,
                    new_role: role
                });
                
                if (error) throw error;
                
                Swal.fire({
                    icon: 'success',
                    title: 'Perfil actualizado',
                    text: 'Los datos del usuario se han actualizado con éxito.',
                    confirmButtonColor: '#2563eb'
                });
                
                closeUserModal();
                await loadUsers();
            } catch (err) {
                console.error('Error updating user profile:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error al actualizar',
                    text: err.message || 'No se pudieron guardar los cambios del perfil.',
                    confirmButtonColor: '#ef4444'
                });
            } finally {
                btnSubmitEditProfile.disabled = false;
                btnSubmitEditProfile.textContent = 'Guardar Cambios';
            }
        });
    }

    // Delete User handler
    const btnDeleteUser = document.getElementById('btn-delete-user');
    if (btnDeleteUser) {
        btnDeleteUser.addEventListener('click', async () => {
            const userId = document.getElementById('edit-profile-user-id').value;
            const currentSession = await getSession();
            
            if (userId === currentSession?.user?.id) {
                Swal.fire({
                    icon: 'error',
                    title: 'Operación no permitida',
                    text: 'No puedes eliminar tu propia cuenta de usuario en esta sesión.',
                    confirmButtonColor: '#ef4444'
                });
                return;
            }
            
            const result = await Swal.fire({
                title: '¿Estás seguro?',
                text: 'Esta acción eliminará de forma permanente al usuario y todos sus accesos. No se puede deshacer.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            });
            
            if (result.isConfirmed) {
                btnDeleteUser.disabled = true;
                btnDeleteUser.textContent = 'Eliminando...';
                
                try {
                    const { data, error } = await supabase.rpc('admin_delete_user', {
                        target_user_id: userId
                    });
                    
                    if (error) throw error;
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Usuario eliminado',
                        text: 'El usuario se ha eliminado de forma permanente.',
                        confirmButtonColor: '#2563eb'
                    });
                    
                    closeUserModal();
                    await loadUsers();
                } catch (err) {
                    console.error('Error deleting user:', err);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error al eliminar',
                        text: err.message || 'No se pudo eliminar al usuario de la base de datos.',
                        confirmButtonColor: '#ef4444'
                    });
                } finally {
                    btnDeleteUser.disabled = false;
                    btnDeleteUser.textContent = 'Eliminar Usuario';
                }
            }
        });
    }

    // Share Credentials handler
    const btnShareCredentials = document.getElementById('btn-share-credentials');
    if (btnShareCredentials) {
        btnShareCredentials.addEventListener('click', async () => {
            const email = document.getElementById('modal-user-email').textContent.trim();
            const nombre = document.getElementById('edit-nombre').value.trim();
            const apellido = document.getElementById('edit-apellido').value.trim();
            const accessLink = 'https://uvservicios.vercel.app/';
            const clavePlana = document.getElementById('edit-profile-clave-plana').value;
            const passwordToShow = clavePlana || '(Tu contraseña de acceso)';
            
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Aquí tienes tus datos de ingreso para la plataforma:

📧 *Correo:* ${email}
🔒 *Contraseña:* ${passwordToShow}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: 'Compartir Acceso',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar este mensaje con el enlace y correo de ingreso del usuario:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Aquí tienes tus datos de ingreso.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${passwordToShow}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Mensaje',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de acceso ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de acceso ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }
        });
    }

    // Logout trigger
    btnLogout.addEventListener('click', async () => {
        await logout();
    });

    // Toggle password visibility for user creation
    const toggleCreatePasswordBtn = document.getElementById('toggle-create-password');
    const inputPassword = document.getElementById('input-password');
    if (toggleCreatePasswordBtn && inputPassword) {
        toggleCreatePasswordBtn.addEventListener('click', () => {
            const isPassword = inputPassword.type === 'password';
            inputPassword.type = isPassword ? 'text' : 'password';
            
            toggleCreatePasswordBtn.innerHTML = isPassword 
                ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                   </svg>`
                : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                   </svg>`;
        });
    }

    // Form user creation submit handler
    formCreateUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nombre = document.getElementById('input-nombre').value.trim();
        const apellido = document.getElementById('input-apellido').value.trim();
        const email = document.getElementById('input-email').value.trim();
        const password = document.getElementById('input-password').value;
        const empresa = document.getElementById('input-empresa').value.trim();
        const role = document.getElementById('select-role').value;

        try {
            btnSubmitUser.disabled = true;
            btnSubmitUser.textContent = 'Procesando registro...';

            await createUser(email, password, nombre, apellido, empresa, role);

            const accessLink = 'https://uvservicios.vercel.app/';
            const welcomeMessage = `🔑 *Acceso Plataforma UV Servicios* 🔑

¡Hola *${nombre} ${apellido}*! Se ha creado tu cuenta con éxito. Aquí tienes tus credenciales de ingreso:

📧 *Correo:* ${email}
🔒 *Contraseña:* ${password}
🌐 *Enlace de acceso:* ${accessLink}`;

            const shareResult = await Swal.fire({
                title: '¡Usuario Creado con Éxito!',
                html: `<p style="margin-bottom: 12px; font-size: 0.92rem; color: #475569;">Puedes copiar este mensaje de bienvenida listo para enviar por WhatsApp o correo:</p>
                <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1.5px solid #e2e8f0; font-family: inherit; font-size: 0.88rem; white-space: pre-line; line-height: 1.6; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
🔑 <b>Acceso Plataforma UV Servicios</b>

¡Hola <b>${nombre} ${apellido}</b>! Se ha creado tu cuenta.

📧 <b>Correo:</b> ${email}
🔒 <b>Contraseña:</b> ${password}
🌐 <b>Enlace:</b> <a href="${accessLink}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${accessLink}</a>
</div>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '📋 Copiar Credenciales',
                cancelButtonText: 'Listo',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (shareResult.isConfirmed) {
                try {
                    await navigator.clipboard.writeText(welcomeMessage);
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de bienvenida ha sido copiado al portapapeles. Ya puedes pegarlo en WhatsApp o Correo.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                } catch (clipErr) {
                    const textarea = document.createElement('textarea');
                    textarea.value = welcomeMessage;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Copiado!',
                        text: 'El mensaje de bienvenida ha sido copiado al portapapeles.',
                        confirmButtonColor: '#2563eb',
                        timer: 2000
                    });
                }
            }

            formCreateUser.reset();
            if (inputPassword) {
                inputPassword.type = 'password';
                toggleCreatePasswordBtn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 20px; height: 20px; pointer-events: none;">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                   </svg>`;
            }
            await loadUsers();
        } catch (err) {
            console.error('Error creating user:', err);
            await Swal.fire({
                title: 'Error de Registro',
                text: err.message || 'No se pudo crear la cuenta de usuario.',
                icon: 'error',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            btnSubmitUser.disabled = false;
            btnSubmitUser.textContent = 'Crear Cuenta Confirmada';
        }
    });
});
