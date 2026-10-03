/* =====================================================
   AUTH – Login, Logout, Session, Route Guards
   =====================================================
   • Accounts and payroll data live in localStorage (see js/data.js).
   • After login, the active session is stored in sessionStorage (pms_role, pms_user)
     so it clears when the browser tab/session ends unless you add your own persistence.
   ===================================================== */

// ---- Session ----
function setSession(role, user) {
    sessionStorage.setItem('pms_role', role);
    sessionStorage.setItem('pms_user', JSON.stringify(user));
}

function getSession() {
    const role = sessionStorage.getItem('pms_role');
    const user = JSON.parse(sessionStorage.getItem('pms_user') || 'null');
    return role && user ? { role, user } : null;
}

function clearSession() {
    sessionStorage.removeItem('pms_role');
    sessionStorage.removeItem('pms_user');
}

// ---- Route Guards ----
function requireAdmin() {
    const s = getSession();
    if (!s || s.role !== 'admin') {
        window.location.href = 'index.html';
        return null;
    }
    return s;
}

function requireEmployee() {
    const s = getSession();
    if (!s || s.role !== 'employee') {
        window.location.href = 'index.html';
        return null;
    }
    return s;
}

function logout() {
    clearSession();
    window.location.href = 'index.html';
}

// ---- Toast Notification ----
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
    const toast = document.createElement('div');
    toast.className = `pms-toast ${type}`;
    toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
