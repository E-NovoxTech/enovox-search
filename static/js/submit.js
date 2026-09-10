/**
 * js/submit.js
 * Handles Developer Authentication, Product Submission Form, and Dashboard logic.
 */

(function() {
    // Configuration
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';

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
    });

    /* ==========================================================================
       1. Authentication & Initialization
       ========================================================================== */
    function checkAuthAndInit() {
        const token = localStorage.getItem(TOKEN_KEY);
        const authWall = document.getElementById('auth-wall-view');
        const authView = document.getElementById('authenticated-view');
        const navAuthBtns = document.getElementById('nav-auth-buttons'); // Login/Signup in header

        if (!token) {
            // User is NOT logged in: Show auth wall, hide form
            authWall.style.display = 'flex';
            authView.style.display = 'none';
            if (navAuthBtns) navAuthBtns.style.display = 'flex';
        } else {
            // User IS logged in: Show dashboard, hide auth wall
            authWall.style.display = 'none';
            authView.style.display = 'grid'; // Matches the dashboard-layout grid
            if (navAuthBtns) navAuthBtns.style.display = 'none'; // Hide header login buttons
            
            // Fetch their products for the sidebar
            loadDashboard(token);
        }
    }

    /* ==========================================================================
       2. Event Listeners
       ========================================================================== */
    function setupEventListeners() {
        // Form Submission
        const form = document.getElementById('submit-tool-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Logout Button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(TOKEN_KEY);
                window.location.reload(); // Reload triggers the auth wall
            });
        }
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
        
        // Setup loading state
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        hideAlert();

        // Build Payload (Matching backend requirements perfectly)
        const payload = {
            name: form.name.value.trim(),
            founder: form.founder.value.trim(),
            description: form.description.value.trim(),
            category: form.category.value,
            product_type: form.product_type.value,
            website: form.website.value.trim(),
            pricing: form.pricing.value,
            logo_url: form.logo_url.value.trim(),
            appstore_url: form.appstore_url.value.trim() || null,
            playstore_url: form.playstore_url.value.trim() || null,
            user_count_range: form.user_count_range.value,
            company_name: form.company_name.value.trim(),
            twitter_url: form.twitter_url.value.trim(),
            linkedin_url: form.linkedin_url.value.trim(),
            instagram_url: form.instagram_url.value.trim(),
            facebook_url: form.facebook_url.value.trim()
        };

        const optionalFields = [
            'appstore_url',
            'playstore_url',
            'company_name',
            'twitter_url',
            'linkedin_url',
            'instagram_url',
            'facebook_url'
        ];

        optionalFields.forEach(field => {
            if (!payload[field] || payload[field].trim() === '') {
                payload[field] = null;
            }
        });

        try {
            const response = await fetch(`${API_URL}/submissions/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Injects the JWT
                },
                body: JSON.stringify(payload)
            });

            // Handle Unauthorized
            if (response.status === 401) {
                return handleSessionExpired();
            }

            // Handle Bad Requests / Validation Errors (422/400)
            if (!response.ok) {
                const errorData = await response.json();
                // If FastAPI sends a validation error array, grab the first message, otherwise use detail
                const errorMsg = Array.isArray(errorData.detail) 
                    ? errorData.detail[0].msg 
                    : (errorData.detail || 'Submission failed. Please check your fields.');
                throw new Error(errorMsg);
            }

            // Success!
            form.reset();
            showAlert('success', "Thanks! Your product is under review. We'll notify you once it's approved.");
            
            // Refresh the dashboard so the user immediately sees it in the "Under Review" list
            loadDashboard(token);

        } catch (error) {
            console.error('Submission Error:', error);
            showAlert('error', error.message);
        } finally {
            submitBtn.textContent = 'Submit Product';
            submitBtn.disabled = false;
        }
    }

    /* ==========================================================================
       4. Dashboard Data Fetching (My Products)
       ========================================================================== */
    async function loadDashboard(token) {
        const liveContainer = document.getElementById('live-products-list');
        const pendingContainer = document.getElementById('pending-products-list');

        try {
            // 1. Fetch Live Products
            const liveRes = await fetch(`${API_URL}/developers/me/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (liveRes.status === 401) return handleSessionExpired();
            
            const liveProducts = await liveRes.json();
            renderProducts(liveContainer, liveProducts, 'live');

            // 2. Fetch Pending Submissions
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

        container.innerHTML = ''; // Clear loading state
        
        products.forEach(product => {
            // Live products are clickable links to the product page. Pending are just div rows.
            const item = document.createElement(type === 'live' ? 'a' : 'div');
            item.className = 'dev-product-item';
            
            if (type === 'live') {
                item.href = `/product/${product.slug}`;
                item.title = "View product page";
            }

            // REPLACED THE LIVE BADGE HERE
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
        alertBox.style.display = 'block'; // Failsafe for display
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