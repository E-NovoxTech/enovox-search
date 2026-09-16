/** 
 * js/nav-auth.js
 * Global logged-in nav state -- include this on every page.
 * Updates ALL matching auth slots (desktop nav-actions AND mobile slider)
 * since both now share .auth-login-slot / .auth-signup-slot classes.
 */
(function () {
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';
    const DASHBOARD_URL = '/dashboard';

    document.addEventListener('DOMContentLoaded', () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return; // not logged in -- leave Login / Sign up exactly as they are

        const loginLinks = document.querySelectorAll('.auth-login-slot');
        const signupLinks = document.querySelectorAll('.auth-signup-slot');
        if (!loginLinks.length || !signupLinks.length) return;

        const isDeveloper = localStorage.getItem(ACCOUNT_TYPE_KEY) === 'developer';

        loginLinks.forEach((loginLink) => {
            if (isDeveloper) {
                loginLink.textContent = 'Dashboard';
                loginLink.setAttribute('href', DASHBOARD_URL);
            } else {
                loginLink.textContent = 'Signed in';
                loginLink.removeAttribute('href');
                loginLink.style.cursor = 'default';
            }
        });

        signupLinks.forEach((signupLink) => {
            signupLink.textContent = 'Logout';
            signupLink.removeAttribute('href');
            signupLink.style.cursor = 'pointer';
            signupLink.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(ACCOUNT_TYPE_KEY);
                window.location.href = '/';
            });
        });
    });
})();