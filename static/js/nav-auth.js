/**
 * js/nav-auth.js
 * Global logged-in nav state -- include this on every page.
 *
 * Reads localStorage on load:
 *   - "enovox_dev_token"    -> presence means logged in
 *   - "enovox_account_type" -> "developer" shows a Dashboard link,
 *                               "user" shows plain "Signed in" (no link --
 *                               user accounts don't have a dashboard)
 *
 * Reuses the exact .btn-text / .btn-primary classes already on the
 * Login / Sign up links in .nav-actions, so it inherits your real
 * dark/light mode colors automatically -- no new CSS needed.
 *
 * NOTE on the dashboard URL: this is the persistent nav link shown on every
 * page while a developer is logged in, separate from the one-time redirect
 * auth.js does immediately after a successful developer login/signup (which
 * goes to /submit, preserving existing behavior per your instructions).
 * Update DASHBOARD_URL below if /dashboard isn't the right persistent link.
 */
(function () {
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';
    const DASHBOARD_URL = '/dashboard';

    document.addEventListener('DOMContentLoaded', () => {
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return; // not logged in -- leave Login / Sign up exactly as they are

        // Scoped to .nav-actions specifically so this never touches unrelated
        // links elsewhere on the page (e.g. the "New here? Sign up" link
        // inside the login card itself).
        const loginLink = navActions.querySelector('a.btn-text[href="/login"]');
        const signupLink = navActions.querySelector('a.btn-primary[href="/signup"]');
        if (!loginLink || !signupLink) return; // markup doesn't match, or already swapped

        const isDeveloper = localStorage.getItem(ACCOUNT_TYPE_KEY) === 'developer';

        // Replace the "Login" slot
        if (isDeveloper) {
            loginLink.textContent = 'Dashboard';
            loginLink.setAttribute('href', DASHBOARD_URL);
        } else {
            loginLink.textContent = 'Signed in';
            loginLink.removeAttribute('href');
            loginLink.style.cursor = 'default';
        }

        // Replace the "Sign up" slot with Logout -- same button, same styling
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
})();