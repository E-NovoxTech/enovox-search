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

    document.addEventListener('DOMContentLoaded', () => {
        setupAccountTypeToggle();
        setupGoogleModal();

        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const verifyForm = document.getElementById('verify-form');
        const resendLink = document.getElementById('resend-code-link');

        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (signupForm) signupForm.addEventListener('submit', handleSignup);
        if (verifyForm) verifyForm.addEventListener('submit', handleVerify);
        if (resendLink) resendLink.addEventListener('click', handleResend);
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

            await response.json().catch(() => ({}));
            showVerifyScreen(email, accountType, `We sent a 6-digit code to ${email}. Enter it below to continue.`);

        } catch (error) {
            showAlert('error', error.message, 'auth-alert');
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
       Google Sign-In
       ========================================================================== */
    function setupGoogleModal() {
        const modal = document.getElementById('google-account-type-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('gsi-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closeAccountTypeModal);

        // Click-outside-to-close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAccountTypeModal();
        });

        modal.querySelectorAll('.gsi-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => finishGoogleSignup(btn.getAttribute('data-type')));
        });
    }

    function openAccountTypeModal(credential) {
        pendingGoogleCredential = credential;
        const modal = document.getElementById('google-account-type-modal');
        if (!modal) return;
        const errorEl = document.getElementById('gsi-modal-error');
        if (errorEl) { errorEl.className = 'alert hidden'; errorEl.textContent = ''; }
        modal.classList.remove('hidden');
    }

    function closeAccountTypeModal() {
        pendingGoogleCredential = null;
        const modal = document.getElementById('google-account-type-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function finishGoogleSignup(accountType) {
        if (!pendingGoogleCredential) return;
        const errorEl = document.getElementById('gsi-modal-error');
        if (errorEl) { errorEl.className = 'alert hidden'; errorEl.textContent = ''; }

        try {
            const res = await fetch(`${API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: pendingGoogleCredential, account_type: accountType })
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
       Developer -> /dashboard. User -> always / (home) — no referrer logic.
       ========================================================================== */
    function redirectAfterAuth(accountType) {
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