/**
 * js/auth.js
 * Handles Login and Signup for both account types (User / Developer).
 *
 * The toggle at the top of the card sets #account_type's value to "user" or
 * "developer" — that value decides which endpoint gets called and where the
 * person lands afterward. Same email/password fields either way.
 */

(function () {
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';
    const MIN_PASSWORD_LENGTH = 8;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    document.addEventListener('DOMContentLoaded', () => {
        setupAccountTypeToggle();

        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');

        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (signupForm) signupForm.addEventListener('submit', handleSignup);
    });

    /* ==========================================================================
       Account type toggle
       ========================================================================== */
    function setupAccountTypeToggle() {
        const buttons = document.querySelectorAll('.account-type-btn');
        const accountTypeInput = document.getElementById('account_type');
        if (!buttons.length || !accountTypeInput) return;

        const title = document.getElementById('auth-title');
        const subtitle = document.getElementById('auth-subtitle');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                const type = btn.getAttribute('data-type');
                accountTypeInput.value = type;

                // Swap the card's title/subtitle copy to match, if present
                if (title) {
                    const text = type === 'developer' ? title.getAttribute('data-dev-text') : title.getAttribute('data-user-text');
                    if (text) title.textContent = text;
                }
                if (subtitle) {
                    const text = type === 'developer' ? subtitle.getAttribute('data-dev-text') : subtitle.getAttribute('data-user-text');
                    if (text) subtitle.textContent = text;
                }
            });
        });
    }

    function getAccountType() {
        const input = document.getElementById('account_type');
        return input && input.value === 'developer' ? 'developer' : 'user';
    }

    /* ==========================================================================
       Validation helpers
       ========================================================================== */
    function setFieldError(inputId, message) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const group = input.closest('.form-group');
        const errorEl = document.getElementById(`${inputId}-error`);
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
    }

    function clearFieldError(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const group = input.closest('.form-group');
        const errorEl = document.getElementById(`${inputId}-error`);
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    function clearFieldErrors(ids) {
        ids.forEach(clearFieldError);
    }

    /* ==========================================================================
       Login — POST /users/login or /developers/login
       ========================================================================== */
    async function handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('login-btn');

        hideAlert();
        clearFieldErrors(['email', 'password']);

        const email = form.email.value.trim();
        const password = form.password.value;
        let hasError = false;

        if (!EMAIL_RE.test(email)) {
            setFieldError('email', 'Enter a valid email address.');
            hasError = true;
        }
        if (!password) {
            setFieldError('password', 'Password is required.');
            hasError = true;
        }
        if (hasError) return;

        const accountType = getAccountType();
        const endpoint = accountType === 'developer' ? '/developers/login' : '/users/login';

        setLoading(btn, true, 'Logging In...');

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.status === 401) {
                throw new Error("Invalid email or password.");
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "An error occurred during login.");
            }

            const data = await response.json();
            localStorage.setItem(TOKEN_KEY, data.access_token);
            localStorage.setItem(ACCOUNT_TYPE_KEY, accountType);
            redirectAfterAuth(accountType);

        } catch (error) {
            showAlert('error', error.message);
        } finally {
            setLoading(btn, false, 'Log In');
        }
    }

    /* ==========================================================================
       Signup — POST /users/signup or /developers/signup
       ========================================================================== */
    async function handleSignup(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('signup-btn');

        hideAlert();
        clearFieldErrors(['email', 'password', 'confirm_password']);

        const email = form.email.value.trim();
        const password = form.password.value;
        const confirmPassword = form.confirm_password.value;
        let hasError = false;

        if (!EMAIL_RE.test(email)) {
            setFieldError('email', 'Enter a valid email address.');
            hasError = true;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            setFieldError('password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            hasError = true;
        }
        if (password !== confirmPassword) {
            setFieldError('confirm_password', 'Passwords do not match.');
            hasError = true;
        }
        if (hasError) return;

        const accountType = getAccountType();
        const endpoint = accountType === 'developer' ? '/developers/signup' : '/users/signup';

        setLoading(btn, true, 'Creating Account...');

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || (response.status === 400
                    ? "This email is already registered, try logging in instead."
                    : "Registration failed. Please try again."));
            }

            const data = await response.json();
            localStorage.setItem(TOKEN_KEY, data.access_token);
            localStorage.setItem(ACCOUNT_TYPE_KEY, accountType);
            redirectAfterAuth(accountType);

        } catch (error) {
            showAlert('error', error.message);
            if (/already registered/i.test(error.message)) {
                const alertBox = document.getElementById('auth-alert');
                if (alertBox) {
                    alertBox.innerHTML = `${escapeHTML(error.message)} <a href="/login" style="text-decoration: underline; font-weight: bold;">Log in here</a>.`;
                }
            }
        } finally {
            setLoading(btn, false, 'Create Account');
        }
    }

    /* ==========================================================================
       Redirect after successful login/signup.
       Developer -> /submit (existing behavior, unchanged).
       User -> wherever they came from (same-origin, not an auth page),
               otherwise /ai — the only thing a user account unlocks.
       ========================================================================== */
    function redirectAfterAuth(accountType) {
        if (accountType === 'developer') {
            // Updated from /submit to /dashboard now that the developer
            // dashboard is built — /submit alone would never surface it.
            window.location.href = '/dashboard';
            return;
        }

        const ref = document.referrer;
        try {
            if (ref) {
                const refUrl = new URL(ref);
                const isSameOrigin = refUrl.origin === window.location.origin;
                const isAuthPage = /\/(login|signup)\/?$/.test(refUrl.pathname);
                if (isSameOrigin && !isAuthPage) {
                    window.location.href = ref;
                    return;
                }
            }
        } catch (e) {
            // fall through to default below
        }
        window.location.href = '/ai';
    }

    /* ==========================================================================
       UI Helpers
       ========================================================================== */
    function showAlert(type, message) {
        const alertBox = document.getElementById('auth-alert');
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = `alert ${type}`;
        alertBox.style.display = 'block';
    }

    function hideAlert() {
        const alertBox = document.getElementById('auth-alert');
        if (alertBox) {
            alertBox.className = 'alert hidden';
            alertBox.style.display = '';
            alertBox.textContent = '';
        }
    }

    function setLoading(btn, isLoading, text) {
        if (!btn) return;
        btn.disabled = isLoading;
        btn.textContent = text;
        if (isLoading) {
            btn.style.opacity = '0.7';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

})();