/**
 * js/auth.js
 * Handles Login, Signup, Email Verification, and Google Sign-In for both
 * account types (User / Developer).
 */

(function () {
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';
    const MIN_PASSWORD_LENGTH = 8;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const RESEND_COOLDOWN_MS = 30000;

    let resendCooldownActive = false;
    let pendingGoogleCredential = null;
    let pendingGoogleType = null; // selected account type in the Google modal
    let googleSignupInFlight = false; // true while the create-account POST is running

    /* ==========================================================================
       URL params: /login?type=developer&redirect=/product/some-slug
       Sent by the Claim-product button in product.js when the visitor isn't
       logged in as a developer. `type` preselects the account-type tab;
       `redirect` sends them back to the page they came from after ANY
       successful auth (login, signup+verify, or Google) -- it wins over the
       default developer/user destinations in redirectAfterAuth().
       `redirect` is validated to be a same-origin relative path only.
       ========================================================================== */
    const urlParams = new URLSearchParams(window.location.search);

    function getSafeRedirect() {
        const raw = (urlParams.get('redirect') || '').trim();
        // Same-origin relative paths only: must start with a single '/'.
        // Blocks '//evil.com', 'https://evil.com' and '/\\evil.com' tricks.
        if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
        return raw;
    }

    const requestedRedirect = getSafeRedirect();
    const requestedAccountType = urlParams.get('type') === 'developer' ? 'developer'
        : (urlParams.get('type') === 'user' ? 'user' : null);

    document.addEventListener('DOMContentLoaded', () => {
        setupAccountTypeToggle();
        setupGoogleModal();
        initGoogleSignIn();
        applyUrlParams();
        setupPasswordToggles();

        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const verifyForm = document.getElementById('verify-form');
        const resendLink = document.getElementById('resend-code-link');

        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (signupForm) signupForm.addEventListener('submit', handleSignup);
        if (verifyForm) verifyForm.addEventListener('submit', handleVerify);
        if (resendLink) resendLink.addEventListener('click', handleResend);

        const forgotPasswordLink = document.getElementById('forgot-password-link');
        const backToLoginLink = document.getElementById('back-to-login-link');
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        const resetPasswordForm = document.getElementById('reset-password-form');
        const resendResetLink = document.getElementById('resend-reset-code-link');

        if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showForgotPasswordScreen(); });
        if (backToLoginLink) backToLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLoginScreen(); });
        if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
        if (resetPasswordForm) resetPasswordForm.addEventListener('submit', handleResetPassword);
        if (resendResetLink) resendResetLink.addEventListener('click', handleResendResetCode);
    });

    /* ==========================================================================
       Account type toggle (existing login/signup form — untouched behavior).
       Scoped to .account-type-toggle specifically so the Google modal's own
       "I'm a Developer / I'm a User" buttons — which reuse .account-type-btn
       for styling only — don't get wired up to this same handler.
       ========================================================================== */
    function setupAccountTypeToggle() {
        const buttons = document.querySelectorAll('.account-type-toggle .account-type-btn');
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

    /* Applies ?type= / ?redirect= to the page:
       - preselects the matching account-type tab by triggering the tab's own
         existing click handler, so the hidden input, title and subtitle all
         stay in sync exactly as if the user had clicked it;
       - carries the same query string onto the login<->signup cross-links so
         the params survive switching between the two pages.
       Scoped to .auth-footer .auth-link only -- the header nav slots belong
       to nav-auth.js and must not be touched here. */
    function applyUrlParams() {
        if (!requestedRedirect && !requestedAccountType) return;

        if (requestedAccountType) {
            const tab = document.querySelector(`.account-type-toggle .account-type-btn[data-type="${requestedAccountType}"]`);
            if (tab && !tab.classList.contains('active')) tab.click();
        }

        const qs = window.location.search;
        if (!qs) return;
        document.querySelectorAll('.auth-footer a.auth-link[href="/signup"], .auth-footer a.auth-link[href="/login"]').forEach(link => {
            link.setAttribute('href', link.getAttribute('href') + qs);
        });
    }

    function getAccountType() {
        const input = document.getElementById('account_type');
        return input && input.value === 'developer' ? 'developer' : 'user';
    }

    /* ==========================================================================
       Show/hide password toggle (eye icon) — works on any input wrapped in
       .password-field with a sibling .password-toggle-btn[data-target=inputId].
       Applies to login, signup, and reset-password fields alike.
       ========================================================================== */
    function setupPasswordToggles() {
        document.querySelectorAll('.password-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (!input) return;

                const icon = btn.querySelector('i');
                const willShow = input.type === 'password';
                input.type = willShow ? 'text' : 'password';

                if (icon) {
                    icon.classList.toggle('fa-eye', !willShow);
                    icon.classList.toggle('fa-eye-slash', willShow);
                }
                btn.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
                btn.setAttribute('aria-pressed', willShow ? 'true' : 'false');
            });
        });
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

        hideAlert('auth-alert');
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

            if (response.status === 403) {
                showVerifyScreen(email, accountType, `Please verify your email — we sent a 6-digit code to ${email}. Enter it below to continue.`);
                return;
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
            showAlert('error', error.message, 'auth-alert');
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

        hideAlert('auth-alert');
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

        // Terms gate — frontend-only (the backend has no field for it).
        const termsBox = document.getElementById('signup-terms');
        if (termsBox && !termsBox.checked) {
            showAlert('error', 'Please accept the Terms & Conditions and Privacy Policy to create an account.', 'auth-alert');
            return;
        }

        const accountType = getAccountType();
        const endpoint = accountType === 'developer' ? '/developers/signup' : '/users/signup';

        // Optional newsletter opt-in — sent as a boolean, per the confirmed
        // backend contract for /developers/signup and /users/signup.
        const newsletterBox = document.getElementById('signup-newsletter');

        setLoading(btn, true, 'Creating Account...');

        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    newsletter_opt_in: !!(newsletterBox && newsletterBox.checked)
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || (response.status === 400
                    ? "This email is already registered, try logging in instead."
                    : "Registration failed. Please try again."));
            }

            await response.json().catch(() => ({}));
            showVerifyScreen(email, accountType, `We sent a 6-digit code to ${email}. Enter it below to continue.`);

        } catch (error) {
            showAlert('error', error.message, 'auth-alert');
            if (/already registered/i.test(error.message)) {
                const alertBox = document.getElementById('auth-alert');
                if (alertBox) {
                    alertBox.innerHTML = `${escapeHTML(error.message)} <a href="/login${escapeHTML(window.location.search)}" style="text-decoration: underline; font-weight: bold;">Log in here</a>.`;
                }
            }
        } finally {
            setLoading(btn, false, 'Create Account');
        }
    }

    /* ==========================================================================
       Email verification screen
       ========================================================================== */
    function showVerifyScreen(email, accountType, message) {
        const formView = document.getElementById('auth-form-view');
        const verifyScreen = document.getElementById('verify-screen');
        if (!verifyScreen) return;

        if (formView) formView.classList.add('hidden');
        verifyScreen.classList.remove('hidden');
        verifyScreen.dataset.email = email;
        verifyScreen.dataset.accountType = accountType;

        const msgEl = document.getElementById('verify-message');
        if (msgEl) msgEl.textContent = message;

        hideAlert('verify-alert');
        clearFieldError('verify-code');
        const resendMsg = document.getElementById('resend-message');
        if (resendMsg) resendMsg.textContent = '';

        const codeInput = document.getElementById('verify-code');
        if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
        }
    }

    async function handleVerify(e) {
        e.preventDefault();
        const verifyScreen = document.getElementById('verify-screen');
        const btn = document.getElementById('verify-btn');
        const codeInput = document.getElementById('verify-code');
        if (!verifyScreen || !codeInput) return;

        hideAlert('verify-alert');
        clearFieldError('verify-code');

        const code = codeInput.value.trim();
        if (!/^\d{6}$/.test(code)) {
            setFieldError('verify-code', 'Enter the 6-digit code.');
            return;
        }

        const email = verifyScreen.dataset.email;
        const accountType = verifyScreen.dataset.accountType || 'user';

        setLoading(btn, true, 'Verifying...');

        try {
            const res = await fetch(`${API_URL}/verify-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, account_type: accountType })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Verification failed. Please try again.');
            }

            const data = await res.json();
            localStorage.setItem(TOKEN_KEY, data.access_token);
            localStorage.setItem(ACCOUNT_TYPE_KEY, accountType);
            redirectAfterAuth(accountType);

        } catch (error) {
            showAlert('error', error.message, 'verify-alert');
        } finally {
            setLoading(btn, false, 'Verify');
        }
    }

    async function handleResend(e) {
        e.preventDefault();
        if (resendCooldownActive) return;

        const verifyScreen = document.getElementById('verify-screen');
        const link = document.getElementById('resend-code-link');
        const msgEl = document.getElementById('resend-message');
        if (!verifyScreen || !link) return;

        const email = verifyScreen.dataset.email;
        const accountType = verifyScreen.dataset.accountType || 'user';

        resendCooldownActive = true;
        link.classList.add('disabled-link');
        const originalText = link.textContent;
        link.textContent = 'Sending...';
        if (msgEl) msgEl.textContent = '';

        try {
            const res = await fetch(`${API_URL}/resend-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, account_type: accountType })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Could not resend the code.');
            }

            if (msgEl) {
                msgEl.textContent = 'Code resent — check your email.';
                msgEl.classList.remove('resend-error');
                setTimeout(() => {
                    if (msgEl.textContent === 'Code resent — check your email.') msgEl.textContent = '';
                }, 4000);
            }
        } catch (error) {
            if (msgEl) {
                msgEl.textContent = error.message;
                msgEl.classList.add('resend-error');
            }
        } finally {
            link.textContent = originalText;
            setTimeout(() => {
                resendCooldownActive = false;
                link.classList.remove('disabled-link');
            }, RESEND_COOLDOWN_MS);
        }
    }

    /* ==========================================================================
       Forgot / Reset password — POST /forgot-password, POST /reset-password
       Confirmed payloads (per /docs schema):
         /forgot-password : { email, account_type }
         /reset-password  : { email, code, new_password, account_type }
       account_type is taken from the login form's current tab selection
       (getAccountType()) and carried through to the reset screen.
       ========================================================================== */
    let resendResetCooldownActive = false;

    function showForgotPasswordScreen() {
        hideAllAuthScreens();
        const screen = document.getElementById('forgot-password-screen');
        if (!screen) return;
        screen.classList.remove('hidden');
        hideAlert('forgot-password-alert');
        clearFieldError('forgot-email');
        const emailInput = document.getElementById('forgot-email');
        if (emailInput) {
            const loginEmail = document.getElementById('email');
            emailInput.value = loginEmail ? loginEmail.value.trim() : '';
            emailInput.focus();
        }
    }

    function showResetPasswordScreen(email, accountType) {
        hideAllAuthScreens();
        const screen = document.getElementById('reset-password-screen');
        if (!screen) return;
        screen.classList.remove('hidden');
        screen.dataset.email = email;
        screen.dataset.accountType = accountType || 'user';
        hideAlert('reset-password-alert');
        clearFieldErrors(['reset-code', 'new-password', 'confirm-new-password']);
        const resetForm = document.getElementById('reset-password-form');
        if (resetForm) resetForm.reset();
        const codeInput = document.getElementById('reset-code');
        if (codeInput) codeInput.focus();
    }

    function showLoginScreen() {
        hideAllAuthScreens();
        const formView = document.getElementById('auth-form-view');
        if (formView) formView.classList.remove('hidden');
    }

    function hideAllAuthScreens() {
        ['auth-form-view', 'verify-screen', 'forgot-password-screen', 'reset-password-screen'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    async function handleForgotPassword(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('forgot-password-btn');

        hideAlert('forgot-password-alert');
        clearFieldError('forgot-email');

        const email = form.email.value.trim();
        if (!EMAIL_RE.test(email)) {
            setFieldError('forgot-email', 'Enter a valid email address.');
            return;
        }

        const accountType = getAccountType();

        setLoading(btn, true, 'Sending...');

        try {
            const response = await fetch(`${API_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, account_type: accountType })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Something went wrong. Please try again.');
            }

            // Same "always succeeds" response whether or not the account
            // exists (email enumeration protection) — always move forward.
            showResetPasswordScreen(email, accountType);

        } catch (error) {
            showAlert('error', error.message, 'forgot-password-alert');
        } finally {
            setLoading(btn, false, 'Send Reset Code');
        }
    }

    async function handleResetPassword(e) {
        e.preventDefault();
        const screen = document.getElementById('reset-password-screen');
        const form = e.target;
        const btn = document.getElementById('reset-password-btn');
        if (!screen) return;

        hideAlert('reset-password-alert');
        clearFieldErrors(['reset-code', 'new-password', 'confirm-new-password']);

        const code = form.code.value.trim();
        const newPassword = form.new_password.value;
        const confirmNewPassword = form.confirm_new_password.value;
        let hasError = false;

        if (!/^\d{6}$/.test(code)) {
            setFieldError('reset-code', 'Enter the 6-digit code.');
            hasError = true;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setFieldError('new-password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            hasError = true;
        }
        if (newPassword !== confirmNewPassword) {
            setFieldError('confirm-new-password', 'Passwords do not match.');
            hasError = true;
        }
        if (hasError) return;

        const email = screen.dataset.email;
        const accountType = screen.dataset.accountType || 'user';

        setLoading(btn, true, 'Resetting...');

        try {
            const response = await fetch(`${API_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, new_password: newPassword, account_type: accountType })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Could not reset your password. Check the code and try again.');
            }

            showLoginScreen();
            showAlert('success', 'Password reset — log in with your new password.', 'auth-alert');

        } catch (error) {
            showAlert('error', error.message, 'reset-password-alert');
        } finally {
            setLoading(btn, false, 'Reset Password');
        }
    }

    async function handleResendResetCode(e) {
        e.preventDefault();
        if (resendResetCooldownActive) return;

        const screen = document.getElementById('reset-password-screen');
        const link = document.getElementById('resend-reset-code-link');
        const msgEl = document.getElementById('resend-reset-message');
        if (!screen || !link) return;

        const email = screen.dataset.email;
        const accountType = screen.dataset.accountType || 'user';

        resendResetCooldownActive = true;
        link.classList.add('disabled-link');
        const originalText = link.textContent;
        link.textContent = 'Sending...';
        if (msgEl) msgEl.textContent = '';

        try {
            const res = await fetch(`${API_URL}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, account_type: accountType })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Could not resend the code.');
            }

            if (msgEl) {
                msgEl.textContent = 'Code resent — check your email.';
                msgEl.classList.remove('resend-error');
                setTimeout(() => {
                    if (msgEl.textContent === 'Code resent — check your email.') msgEl.textContent = '';
                }, 4000);
            }
        } catch (error) {
            if (msgEl) {
                msgEl.textContent = error.message;
                msgEl.classList.add('resend-error');
            }
        } finally {
            link.textContent = originalText;
            setTimeout(() => {
                resendResetCooldownActive = false;
                link.classList.remove('disabled-link');
            }, RESEND_COOLDOWN_MS);
        }
    }

    /* ==========================================================================
       Google Sign-In
       ========================================================================== */
    /* ==========================================================================
       Google Identity Services bootstrap — moved here from the inline
       <script> blocks in login.html / signup.html so one file owns the whole
       flow. Loads the GSI client only on pages that actually have the
       #google-signin-button div, then initializes + renders the button.
       window.handleGoogleResponse (defined below) stays the callback.
       ========================================================================== */
    const GSI_CLIENT_ID = '861554047183-72jmrbvpsjjnknu9d2adukth7un0bips.apps.googleusercontent.com';

    function initGoogleSignIn() {
        const btnEl = document.getElementById('google-signin-button');
        if (!btnEl) return; // page has no Google button (e.g. dashboard, home)

        const setup = () => {
            if (!window.google || !window.google.accounts || !window.google.accounts.id) return false;
            window.google.accounts.id.initialize({
                client_id: GSI_CLIENT_ID,
                callback: window.handleGoogleResponse
            });
            window.google.accounts.id.renderButton(
                btnEl,
                { theme: 'outline', size: 'large', width: '100%' }
            );
            return true;
        };

        if (setup()) return; // GSI client already loaded

        const tag = document.createElement('script');
        tag.src = 'https://accounts.google.com/gsi/client';
        tag.async = true;
        tag.defer = true;
        tag.onload = () => setup();
        document.head.appendChild(tag);
    }

    function setupGoogleModal() {
        const modal = document.getElementById('google-account-type-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('gsi-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeAccountTypeModal);

        // Click-outside-to-close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAccountTypeModal();
        });

        // Choice buttons only SELECT now — nothing is submitted until Continue.
        modal.querySelectorAll('.gsi-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => selectGoogleAccountType(btn.getAttribute('data-type')));
        });

        const continueBtn = document.getElementById('gsi-continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                if (pendingGoogleType) finishGoogleSignup(pendingGoogleType);
            });
        }
    }

    /* Marks one account type as selected (single-select) and unlocks the
       Continue button. Pure UI state — no API call happens here. */
    function selectGoogleAccountType(type) {
        pendingGoogleType = type;
        const modal = document.getElementById('google-account-type-modal');
        if (!modal) return;
        modal.querySelectorAll('.gsi-choice-btn').forEach(btn => {
            const on = btn.getAttribute('data-type') === type;
            btn.classList.toggle('selected', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const continueBtn = document.getElementById('gsi-continue-btn');
        if (continueBtn) continueBtn.disabled = false;
    }

    function openAccountTypeModal(credential) {
        pendingGoogleCredential = credential;
        const modal = document.getElementById('google-account-type-modal');
        if (!modal) return;
        const errorEl = document.getElementById('gsi-modal-error');
        if (errorEl) { errorEl.className = 'alert hidden'; errorEl.textContent = ''; }

        // Fresh state each time the modal opens: no selection, Continue locked.
        pendingGoogleType = null;
        modal.querySelectorAll('.gsi-choice-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.setAttribute('aria-pressed', 'false');
        });
        const gsiContinue = document.getElementById('gsi-continue-btn');
        if (gsiContinue) gsiContinue.disabled = true;

        const gsiTerms = document.getElementById('gsi-terms');
        const gsiNewsletter = document.getElementById('gsi-newsletter');
        if (gsiTerms) gsiTerms.checked = false;
        if (gsiNewsletter) gsiNewsletter.checked = false;

        modal.classList.remove('hidden');
    }

    function closeAccountTypeModal() {
        pendingGoogleCredential = null;
        pendingGoogleType = null;
        const modal = document.getElementById('google-account-type-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function finishGoogleSignup(accountType) {
        if (!pendingGoogleCredential) return;
        if (!accountType) return; // Continue clicked with nothing selected (shouldn't happen: button stays disabled)
        if (googleSignupInFlight) return; // ignore repeat Continue clicks while the first request is still running

        const errorEl = document.getElementById('gsi-modal-error');
        if (errorEl) { errorEl.className = 'alert hidden'; errorEl.textContent = ''; }

        // Terms gate — frontend-only; keeps pendingGoogleCredential intact so
        // the user can tick the box and choose an account type again.
        const gsiTerms = document.getElementById('gsi-terms');
        if (gsiTerms && !gsiTerms.checked) {
            if (errorEl) {
                errorEl.textContent = 'Please accept the Terms & Conditions and Privacy Policy to continue.';
                errorEl.className = 'alert error';
            }
            return;
        }

        // Lock the button for the duration of the request so a slow backend
        // (e.g. Google cert fetch stalling) can't be hammered into duplicates.
        googleSignupInFlight = true;
        const continueBtn = document.getElementById('gsi-continue-btn');
        if (continueBtn) {
            continueBtn.disabled = true;
            continueBtn.classList.add('loading');
            // Animated dots (CSS .gsi-dots) give visible "working" feedback
            continueBtn.innerHTML = 'Please wait<span class="gsi-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>';
        }

        try {
            const res = await fetch(`${API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential: pendingGoogleCredential,
                    account_type: accountType,
                    // Confirmed contract: the NEW-account /auth/google call
                    // accepts newsletter_opt_in alongside account_type.
                    newsletter_opt_in: !!(document.getElementById('gsi-newsletter') &&
                                          document.getElementById('gsi-newsletter').checked)
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Google sign-in failed, please try again.');
            }

            const data = await res.json();
            localStorage.setItem(TOKEN_KEY, data.access_token);
            localStorage.setItem(ACCOUNT_TYPE_KEY, data.account_type || accountType);
            closeAccountTypeModal();
            redirectAfterAuth(data.account_type || accountType);

        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message;
                errorEl.className = 'alert error';
            }
        } finally {
            googleSignupInFlight = false;
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.classList.remove('loading');
                continueBtn.textContent = 'Continue';
            }
        }
    }

    // Exposed on window: Google's initialize({ callback: handleGoogleResponse })
    // in the inline script block references this by name.
    window.handleGoogleResponse = async function (response) {
        hideAlert('google-signin-error');
        try {
            const res = await fetch(`${API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });

            let data = {};
            try {
                data = await res.json();
            } catch (parseErr) {
                console.error('[Google sign-in] Response body was not valid JSON:', parseErr);
            }
            // Left in deliberately — until the backend's response shape here
            // is confirmed stable, seeing the raw response is the fastest
            // way to tell what actually happened.
            console.log('[Google sign-in] /auth/google response:', res.status, data);

            if (!res.ok) {
                // Surface the backend's real message instead of a hardcoded
                // generic one — a non-2xx status doesn't mean nothing
                // happened server-side (e.g. an email can still have sent).
                throw new Error(data.detail || `Google sign-in failed (status ${res.status}). Please try again.`);
            }

            // Existing account — log straight in, no modal.
            if (data.new_account === false && data.access_token) {
                localStorage.setItem(TOKEN_KEY, data.access_token);
                localStorage.setItem(ACCOUNT_TYPE_KEY, data.account_type);
                redirectAfterAuth(data.account_type);
                return;
            }

            // Brand-new email, no account_type chosen yet — ask via modal.
            if (data.new_account === true && !data.access_token) {
                openAccountTypeModal(response.credential);
                return;
            }

            // Defensive fallback, shouldn't normally happen on the first call.
            if (data.access_token) {
                localStorage.setItem(TOKEN_KEY, data.access_token);
                localStorage.setItem(ACCOUNT_TYPE_KEY, data.account_type);
                redirectAfterAuth(data.account_type);
                return;
            }

            // Response didn't match ANY expected shape from the spec. Most
            // likely explanation: the backend's /auth/google "new account"
            // path was updated to also require email verification (since
            // that feature was added after this contract was written), and
            // now returns something like {message: "...code sent..."}
            // instead of {new_account, email}. Surfacing it instead of
            // silently failing so this is diagnosable from the UI itself.
            console.warn('[Google sign-in] Response did not match the documented shape (new_account/access_token):', data);
            throw new Error(data.message || 'Unexpected response from the server — check the browser console for details.');

        } catch (error) {
            showAlert('error', error.message, 'google-signin-error');
        }
    };

    /* ==========================================================================
       Redirect after successful login/signup-verification/Google sign-in.
       An explicit ?redirect= path (validated same-origin, e.g. from the
       product page's Claim button) wins; otherwise the defaults apply:
       Developer -> /dashboard. User -> always / (home). Still no referrer
       logic — the redirect comes from an explicit, validated URL param.
       ========================================================================== */
    function redirectAfterAuth(accountType) {
        if (requestedRedirect) {
            window.location.href = requestedRedirect;
            return;
        }
        if (accountType === 'developer') {
            window.location.href = '/dashboard';
            return;
        }
        window.location.href = '/';
    }

    /* ==========================================================================
       UI Helpers
       ========================================================================== */
    function showAlert(type, message, alertId) {
        const alertBox = document.getElementById(alertId || 'auth-alert');
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = `alert ${type}`;
        alertBox.style.display = 'block';
    }

    function hideAlert(alertId) {
        const alertBox = document.getElementById(alertId || 'auth-alert');
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