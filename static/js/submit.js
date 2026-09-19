/**
 * js/submit.js
 * Handles Developer Authentication, Product Submission Form, and Dashboard logic.
 */

(function() {
    // Configuration
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const SUBMIT_TIMEOUT_MS = 15000; // fail loudly instead of hanging forever

    document.addEventListener('DOMContentLoaded', () => {
        // Dynamically populate the Category dropdown from config
        const categorySelect = document.getElementById('category');
        if (categorySelect && typeof ENOVOX_CONFIG !== 'undefined') {
            ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categorySelect.appendChild(option);
            });
        }

        checkAuthAndInit();
        setupEventListeners();
        setupPricingDetailsLogic();
    });

    /* ==========================================================================
       1. Authentication & Initialization
       ========================================================================== */
    function checkAuthAndInit() {
        const token = localStorage.getItem(TOKEN_KEY);
        const authWall = document.getElementById('auth-wall-view');
        const authView = document.getElementById('authenticated-view');
        const navAuthBtns = document.getElementById('nav-auth-buttons');

        if (!token) {
            authWall.style.display = 'flex';
            authView.style.display = 'none';
            if (navAuthBtns) navAuthBtns.style.display = 'flex';
        } else {
            authWall.style.display = 'none';
            authView.style.display = 'grid';
            if (navAuthBtns) navAuthBtns.style.display = 'none';
            loadDashboard(token);
        }
    }

    /* ==========================================================================
       2. Event Listeners
       ========================================================================== */
    function setupEventListeners() {
        const form = document.getElementById('submit-tool-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(TOKEN_KEY);
                window.location.reload();
            });
        }
    }

    /* ==========================================================================
       2b. Pricing Details — conditional required logic
       ========================================================================== */
    function setupPricingDetailsLogic() {
        const pricingSelect = document.getElementById('pricing');
        if (!pricingSelect) return;

        pricingSelect.addEventListener('change', updatePricingDetailsRequirement);
        updatePricingDetailsRequirement();
    }

    function updatePricingDetailsRequirement() {
        const pricingSelect = document.getElementById('pricing');
        const detailsInput = document.getElementById('pricing_details');
        const detailsLabel = document.getElementById('pricing-details-label');
        if (!pricingSelect || !detailsInput || !detailsLabel) return;

        const isPaid = pricingSelect.value === 'Paid';
        detailsInput.required = isPaid;
        detailsLabel.textContent = isPaid ? 'Pricing Details *' : 'Pricing Details';

        if (!isPaid || detailsInput.value.trim() !== '') {
            clearPricingDetailsError();
        }
    }

    function showPricingDetailsError(message) {
        const group = document.getElementById('pricing-details-group');
        const errorEl = document.getElementById('pricing-details-error');
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
    }

    function clearPricingDetailsError() {
        const group = document.getElementById('pricing-details-group');
        const errorEl = document.getElementById('pricing-details-error');
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    /* ==========================================================================
       3. Form Submission Logic
       ========================================================================== */
    async function handleFormSubmit(e) {
        e.preventDefault();

        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return handleSessionExpired();

        const form = e.target;
        const submitBtn = document.getElementById('submit-btn');

        hideAlert();
        clearPricingDetailsError();

        // Defensive: don't let a missing/renamed field silently kill the
        // handler before the button state is even set. If pricing_details
        // isn't in the DOM (e.g. HTML not deployed yet), fall back to ''
        // instead of throwing on `.value` of undefined.
        const pricingValue = form.pricing ? form.pricing.value : '';
        const pricingDetailsField = form.pricing_details;
        const pricingDetailsValue = pricingDetailsField ? pricingDetailsField.value.trim() : '';

        if (pricingValue === 'Paid' && pricingDetailsValue === '') {
            showPricingDetailsError('Please specify pricing details for paid products');
            if (pricingDetailsField) pricingDetailsField.focus();
            return;
        }

        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        const payload = {
            name: form.name.value.trim(),
            founder: form.founder.value.trim(),
            description: form.description.value.trim(),
            category: form.category.value,
            product_type: form.product_type.value,
            website: form.website.value.trim(),
            pricing: form.pricing.value,
            pricing_details: pricingDetailsValue,
            logo_url: form.logo_url.value.trim(),
            appstore_url: form.appstore_url.value.trim() || null,
            playstore_url: form.playstore_url.value.trim() || null,
            user_count_range: form.user_count_range.value,
            // Submissions-table column is "company" (the PRODUCTS table uses
            // "company_name" instead). The DOM field id stays company_name.
            company: form.company_name.value.trim(),
            twitter_url: form.twitter_url.value.trim(),
            linkedin_url: form.linkedin_url.value.trim(),
            instagram_url: form.instagram_url.value.trim(),
            facebook_url: form.facebook_url.value.trim(),
            keywords: form.keywords.value.trim(),
            contact_email: form.contact_email.value.trim(),
            github_url: form.github_url.value.trim() || null
        };

        const optionalFields = [
            'appstore_url', 'playstore_url', 'company',
            'twitter_url', 'linkedin_url', 'instagram_url', 'facebook_url'
        ];

        optionalFields.forEach(field => {
            if (!payload[field] || payload[field].trim() === '') {
                payload[field] = null;
            }
        });

        // Hard timeout: if the request doesn't settle in time, abort it and
        // treat it as a failure rather than leaving the button stuck forever.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}/submissions/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (response.status === 401) {
                return handleSessionExpired();
            }

            if (!response.ok) {
                let errorMsg = 'Submission failed. Please check your fields.';
                try {
                    const errorData = await response.json();
                    if (Array.isArray(errorData.detail) && errorData.detail[0] && errorData.detail[0].msg) {
                        errorMsg = errorData.detail[0].msg;
                    } else if (errorData.detail) {
                        errorMsg = errorData.detail;
                    }
                } catch (parseErr) {
                    // Body wasn't JSON (e.g. a 500 HTML error page) — keep the generic message.
                    console.error('Could not parse error response:', parseErr);
                }
                throw new Error(errorMsg);
            }

            showAlert('success', "Thanks! Your product is under review. Taking you to your dashboard...");
            submitBtn.textContent = 'Redirecting...';
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1200);
            return;

        } catch (error) {
            console.error('Submission Error:', error);
            const message = error.name === 'AbortError'
                ? 'The request timed out. Please check your connection and try again.'
                : error.message;
            showAlert('error', message);
            submitBtn.textContent = 'Submit Product';
            submitBtn.disabled = false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /* ==========================================================================
       4. Dashboard Data Fetching (My Products)
       ========================================================================== */
    async function loadDashboard(token) {
        const liveContainer = document.getElementById('live-products-list');
        const pendingContainer = document.getElementById('pending-products-list');

        try {
            const liveRes = await fetch(`${API_URL}/developers/me/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (liveRes.status === 401) return handleSessionExpired();

            const liveProducts = await liveRes.json();
            renderProducts(liveContainer, liveProducts, 'live');

            const pendingRes = await fetch(`${API_URL}/submissions/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (pendingRes.status === 401) return handleSessionExpired();

            const pendingProducts = await pendingRes.json();
            renderProducts(pendingContainer, pendingProducts, 'pending');

        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
            liveContainer.innerHTML = '<div class="loading-state-small">Error loading products.</div>';
            pendingContainer.innerHTML = '<div class="loading-state-small">Error loading submissions.</div>';
        }
    }

    function renderProducts(container, products, type) {
        if (!products || products.length === 0) {
            container.innerHTML = `<div class="loading-state-small">No ${type} products found.</div>`;
            return;
        }

        container.innerHTML = '';

        products.forEach(product => {
            const item = document.createElement(type === 'live' ? 'a' : 'div');
            item.className = 'dev-product-item';

            if (type === 'live') {
                item.href = `/product/${product.slug}`;
                item.title = "View product page";
            }

            const badge = type === 'live'
                ? `<span class="badge live"><span class="glow-dot"></span> Live</span>`
                : `<span class="badge pending">Under Review</span>`;

            item.innerHTML = `
                <span class="dev-product-name" title="${safeEscape(product.name)}">${safeEscape(product.name)}</span>
                ${badge}
            `;
            container.appendChild(item);
        });
    }

    /* ==========================================================================
       5. Helper Utilities
       ========================================================================== */
    function handleSessionExpired() {
        localStorage.removeItem(TOKEN_KEY);
        alert("Your session has expired. Please log in again.");
        window.location.href = '/login';
    }

    function showAlert(type, message) {
        const alertBox = document.getElementById('form-alert');
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = `alert ${type}`;
        alertBox.style.display = 'block';
    }

    function hideAlert() {
        const alertBox = document.getElementById('form-alert');
        if (alertBox) {
            alertBox.className = 'alert hidden';
            alertBox.style.display = '';
        }
    }

    function safeEscape(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

})();