/**
 * js/auth.js
 * Handles Login and Signup logic, frontend validation, and JWT storage.
 */

(function() {
    const API_URL = 'http://localhost:8000';
    const TOKEN_KEY = 'enovox_dev_token';

    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');

        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }

        if (signupForm) {
            signupForm.addEventListener('submit', handleSignup);
        }
    });

    /**
     * Handles the POST request to /developers/login
     */
    async function handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('login-btn');
        
        hideAlert();
        setLoading(btn, true, 'Logging In...');

        const payload = {
            email: form.email.value.trim(),
            password: form.password.value
        };

        try {
            const response = await fetch(`${API_URL}/developers/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                throw new Error("Invalid email or password.");
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "An error occurred during login.");
            }

            const data = await response.json();
            
            // Store JWT and redirect to submit page
            localStorage.setItem(TOKEN_KEY, data.access_token);
            window.location.href = 'submit.html';

        } catch (error) {
            showAlert('error', error.message);
        } finally {
            setLoading(btn, false, 'Log In');
        }
    }

    /**
     * Handles the POST request to /developers/signup with frontend password confirmation
     */
    async function handleSignup(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('signup-btn');
        
        hideAlert();

        const email = form.email.value.trim();
        const password = form.password.value;
        const confirmPassword = form.confirm_password.value;

        // Frontend validation: Check passwords match
        if (password !== confirmPassword) {
            return showAlert('error', 'Passwords do not match. Please try again.');
        }

        setLoading(btn, true, 'Creating Account...');

        const payload = {
            email: email,
            password: password
        };

        try {
            const response = await fetch(`${API_URL}/developers/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 400) {
                throw new Error("This email is already registered, try logging in instead.");
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Registration failed. Please try again.");
            }

            const data = await response.json();

            // Store JWT and redirect to submit page
            localStorage.setItem(TOKEN_KEY, data.access_token);
            window.location.href = 'submit.html';

        } catch (error) {
            showAlert('error', error.message);
            // If the error suggests logging in, append a link dynamically
            if (error.message.includes('try logging in')) {
                const alertBox = document.getElementById('auth-alert');
                alertBox.innerHTML = `This email is already registered. <a href="login.html" style="text-decoration: underline; font-weight: bold;">Log in here</a>.`;
            }
        } finally {
            setLoading(btn, false, 'Create Account');
        }
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

})();