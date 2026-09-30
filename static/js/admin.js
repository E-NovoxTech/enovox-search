/**
 * js/admin.js
 * Master Control Room logic. Uses admin_key for authorization.
 */

(function() {
    const API_URL = "";
    let adminKey = localStorage.getItem('enovox_admin_key');
    const PAGE_SIZE = 8;

    // Fields shown/editable in the submission detail modal, and their input type.
    // 'select' fields pull their option list from SELECT_OPTIONS below.
    const SUBMISSION_FIELDS = [
        { key: 'name', label: 'Product Name', type: 'text', required: true },
        { key: 'company_name', label: 'Company Name', type: 'text' },
        { key: 'category', label: 'Category', type: 'select', options: 'CATEGORIES' },
        { key: 'product_type', label: 'Product Type', type: 'select', options: 'PRODUCT_TYPES' },
        { key: 'pricing', label: 'Pricing', type: 'select', options: 'PRICING' },
        { key: 'pricing_details', label: 'Pricing Details', type: 'text' },
        { key: 'user_count_range', label: 'User Count Range', type: 'select', options: 'USER_COUNT' },
        { key: 'website', label: 'Website URL', type: 'url' },
        { key: 'logo_url', label: 'Logo URL', type: 'url' },
        { key: 'appstore_url', label: 'App Store URL', type: 'url' },
        { key: 'playstore_url', label: 'Play Store URL', type: 'url' },
        { key: 'founder', label: 'Founder Name(s)', type: 'text' },
        { key: 'contact_email', label: 'Contact Email', type: 'email' },
        { key: 'twitter_url', label: 'X / Twitter URL', type: 'url' },
        { key: 'linkedin_url', label: 'LinkedIn URL', type: 'url' },
        { key: 'instagram_url', label: 'Instagram URL', type: 'url' },
        { key: 'facebook_url', label: 'Facebook URL', type: 'url' }
    ];
    const SELECT_OPTIONS = {
        PRODUCT_TYPES: ['Software', 'App', 'Platform', 'Tool'],
        PRICING: ['Free', 'Paid', 'Subscription', 'Freemium'],
        USER_COUNT: ['Just launched', '100+', '1,000+', '10,000+'],
        get CATEGORIES() { return (typeof ENOVOX_CONFIG !== 'undefined' && ENOVOX_CONFIG.CATEGORIES) || []; }
    };

    // Core lists load on login; foreign tools load on tab open or category change.
    // Search and pagination run against the cached results.
    const state = {
        products: [],
        submissions: [],
        developers: [],
        foreignTools: [],
        foreignToolsPage: 1,
        foreignToolsFilter: { search: '', category: '' },
        productsPage: 1,
        submissionsPage: 1,
        developersPage: 1,
        productFilter: { search: '', category: '', status: '' },
        submissionFilter: { search: '', category: '', status: 'pending' },
        developerFilter: { search: '' },
        selectedSubmissionIds: new Set()
    };

    let currentDetailSubmissionId = null;
    let submissionDetailRequest = 0;
    let submissionReviewOriginal = null; // Snapshot rendered values; send only actual corrections.
    let submissionAlternativeRequest = 0;
    let submissionAlternativeState = {
        category: '', ready: false, available: new Set(),
        original: new Set(), selected: new Set(), tools: [], isPending: false,
        sourceKnown: false, droppedUnavailable: false
    };
    let rejectContext = null; // { ids: [...] }
    let foreignToolsRequest = 0;
    let productAlternativesRequest = 0;
    let productAlternativesState = { id: null, category: '', ready: false };

    // Separate from the existing paginated Developers table and its search.
    const developerUpdateSelected = new Set(); // Case-insensitive email keys.
    const DEVELOPER_UPDATE_PAGE_SIZE = 10;
    let developerUpdatePage = 1;
    let developerUpdateSending = false;

    // Keywords/Tags entered in the manual "Add Product" modal. Reset on open.
    let productKeywordTags = [];
    const MAX_KEYWORD_TAGS = 10;

    // DOM Elements
    const loginOverlay = document.getElementById('admin-login-overlay');
    const dashboardLayout = document.getElementById('dashboard-layout');
    const globalAlert = document.getElementById('global-alert');
    const productModal = document.getElementById('product-modal');
    const productForm = document.getElementById('admin-product-form');
    const foreignToolModal = document.getElementById('foreign-tool-modal');
    const foreignToolForm = document.getElementById('foreign-tool-form');
    const submissionDetailModal = document.getElementById('submission-detail-modal');
    const submissionDetailBody = document.getElementById('submission-detail-body');

    // Bulk CSV upload (Products tab) — file pickers, preview grid, publish bar
    const bulkUploadBtn = document.getElementById('open-bulk-upload-btn');
    const bulkCsvInput = document.getElementById('bulk-csv-input');
    const bulkPanelInput = document.getElementById('bulk-upload-csv-input');
    const bulkUploadPanel = document.getElementById('bulk-upload-panel');
    const bulkUploadStatus = document.getElementById('bulk-upload-status');
    const bulkUploadFilename = document.getElementById('bulk-upload-filename');
    const bulkLoadingEl = document.getElementById('bulk-upload-loading');
    const bulkErrorEl = document.getElementById('bulk-upload-error');
    const bulkSummaryEl = document.getElementById('bulk-upload-summary');
    const bulkPreviewWrapper = document.getElementById('bulk-preview-wrapper');
    const bulkTableHeadRow = document.getElementById('bulk-table-head-row');
    const bulkTableBody = document.getElementById('bulk-table-body');
    const bulkCardsEl = document.getElementById('bulk-preview-cards');
    const bulkPublishBar = document.getElementById('bulk-publish-bar');
    const bulkPublishCountEl = document.getElementById('bulk-publish-count');
    const bulkPublishBtn = document.getElementById('bulk-publish-btn');
    const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
    const rejectReasonModal = document.getElementById('reject-reason-modal');

    document.addEventListener('DOMContentLoaded', () => {
        // Dynamically populate the Admin Modal Category dropdown (product create/edit form)
        const adminCategorySelect = document.querySelector('select[name="category"]');
        if (adminCategorySelect && typeof ENOVOX_CONFIG !== 'undefined') {
            ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                adminCategorySelect.appendChild(option);
            });
        }

        // Populate shared category choices for table filters and the foreign-tool form.
        ['products-category-filter', 'submissions-category-filter',
         'foreign-tools-category-filter', 'foreign-tool-category'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel && typeof ENOVOX_CONFIG !== 'undefined') {
                ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    sel.appendChild(option);
                });
            }
        });

        // Admin Mobile Sidebar Toggle Logic
        const hamburgerBtn = document.getElementById('admin-hamburger');
        const adminSidebar = document.getElementById('admin-sidebar');
        const sidebarOverlay = document.getElementById('admin-sidebar-overlay');

        if (hamburgerBtn && adminSidebar && sidebarOverlay) {
            hamburgerBtn.addEventListener('click', () => {
                adminSidebar.classList.add('open');
                sidebarOverlay.classList.add('active');
            });

            sidebarOverlay.addEventListener('click', () => {
                adminSidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });

            // Auto-close sidebar when clicking a tab on mobile
            document.querySelectorAll('.nav-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        adminSidebar.classList.remove('open');
                        sidebarOverlay.classList.remove('active');
                    }
                });
            });
        }

        setupNavigation();
        setupEventListeners();
        setupToolbars();
        setupDeveloperUpdate();
        setupAlternatives();
        setupProductAlternatives();
        setupSubmissionDetailModal();
        setupRejectReasonModal();
        setupKeywordsTagInput();
        setupPricingDetailsLogic();
        setupBulkUpload();
        setupPricingDetailsLogic();
        setupNewsletter();
        setupClaims();
        setupAnalytics();
        setupBanner();
        initNotifications();
        initAuth(); // async — kicked off last, verifies any stored key itself
    });

    /* ==========================================================================
       Authentication
       ========================================================================== */

    // Hits a real protected admin endpoint with the given key.
    // Returns true only on an actual 200 OK response — a 403, any other
    // error status, or a network failure are all treated as an invalid key.
    async function verifyAdminKey(key) {
        try {
            const res = await fetch(`${API_URL}/developers/admin/all?admin_key=${encodeURIComponent(key)}`);
            return res.ok;
        } catch (error) {
            return false;
        }
    }

    function showLoginError(message) {
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.textContent = message;
            errEl.classList.remove('hidden');
        }
    }

    function clearLoginError() {
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.textContent = '';
            errEl.classList.add('hidden');
        }
    }

    // Wipes any stored/invalid key and forces the user back to the login
    // screen with an explanatory message. Never leaves the dashboard visible.
    function rejectLogin(message) {
        localStorage.removeItem('enovox_admin_key');
        adminKey = null;
        dashboardLayout.classList.add('hidden');
        loginOverlay.classList.remove('hidden');
        showLoginError(message);
    }

    // On page load: the dashboard is NEVER unhidden until a stored key has
    // been re-verified against the backend. No key, or a key that fails
    // verification, both land (or stay) on the login screen.
    async function initAuth() {
        if (!adminKey) {
            loginOverlay.classList.remove('hidden');
            return;
        }

        const isValid = await verifyAdminKey(adminKey);
        if (!isValid) {
            rejectLogin('Your session key is no longer valid. Please log in again.');
            return;
        }

        loginOverlay.classList.add('hidden');
        dashboardLayout.classList.remove('hidden');
        loadAllData();
    }

    // Event listeners for login / logout
    function setupEventListeners() {
        const saveKeyBtn = document.getElementById('save-key-btn');
        if (saveKeyBtn) {
            saveKeyBtn.addEventListener('click', async () => {
                const input = document.getElementById('admin-key-input').value.trim();
                if (!input) {
                    showLoginError('Please enter an admin key.');
                    return;
                }

                clearLoginError();
                saveKeyBtn.disabled = true;
                saveKeyBtn.textContent = 'Verifying...';

                const isValid = await verifyAdminKey(input);

                saveKeyBtn.disabled = false;
                saveKeyBtn.textContent = 'Enter Dashboard';

                if (!isValid) {
                    // Wrong key: do NOT store it, do NOT touch the dashboard.
                    // Stay on the login screen with an inline error.
                    showLoginError('Invalid admin key.');
                    return;
                }

                // Only store the key + proceed once the backend has
                // actually confirmed it's valid.
                localStorage.setItem('enovox_admin_key', input);
                adminKey = input;
                loginOverlay.classList.add('hidden');
                dashboardLayout.classList.remove('hidden');
                loadAllData();
            });
        }

        const logoutBtn = document.getElementById('logout-admin-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('enovox_admin_key');
                window.location.reload();
            });
        }

        const openCreateBtn = document.getElementById('open-create-modal-btn');
        if (openCreateBtn) {
            openCreateBtn.addEventListener('click', () => {
                productForm.reset();
                document.getElementById('edit_product_id').value = '';
                document.getElementById('modal-title').textContent = 'Create New Product';
                resetProductAlternatives();
                hideProductModalError();
                resetKeywordsTagInput();
                clearProductFormErrors();
                updatePricingDetailsRequirement();
                productModal.classList.remove('hidden');
            });
        }

        const closeModalBtn = document.getElementById('close-modal-btn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                productModal.classList.add('hidden');
                resetProductAlternatives();
                hideProductModalError();
            });
        }

        if (productForm) {
            productForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!validateProductForm()) {
                    return;
                }

                const id = document.getElementById('edit_product_id').value;
                hideProductModalError();
                // A failed/unfinished GET must not turn existing links into an empty PUT.
                if (id && (productAlternativesState.id !== id ||
                           productAlternativesState.category !== productForm.category.value ||
                           !productAlternativesState.ready)) {
                    showProductModalError('Wait for matching alternatives to load (or retry the load) before saving this product.');
                    return;
                }
                const foreignToolIds = id
                    ? Array.from(document.querySelectorAll('#product-alternatives-picker input[type="checkbox"]:checked'), box => Number(box.value))
                    : [];
                const formData = new FormData(productForm);
                const payload = Object.fromEntries(formData.entries());
                delete payload.id; // The hidden ID selects the endpoint, not a product field.

                // New fields: keywords (joined string, not array), contact_email, github_url
                payload.keywords = productKeywordTags.join(', ');
                payload.contact_email = productForm.contact_email.value.trim();
                payload.github_url = productForm.github_url.value.trim();
                payload.pricing_details = productForm.pricing_details.value.trim();

                [
                    'appstore_url',
                    'playstore_url',
                    'platform',
                    'company_name',
                    'twitter_url',
                    'linkedin_url',
                    'instagram_url',
                    'facebook_url',
                    'github_url'
                ].forEach(key => {
                    if (!payload[key] || payload[key].trim() === '') {
                        payload[key] = null;
                    }
                });

                const method = id ? 'PUT' : 'POST';
                const url = id
                    ? `${API_URL}/products/${encodeURIComponent(id)}?admin_key=${encodeURIComponent(adminKey)}`
                    : `${API_URL}/products/?admin_key=${encodeURIComponent(adminKey)}`;
                const saveBtn = document.getElementById('save-product-btn');
                const closeBtn = document.getElementById('close-modal-btn');
                saveBtn.disabled = true;
                closeBtn.disabled = true;
                let detailsSaved = false;

                try {
                    const res = await fetch(url, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    await requireAdminResponse(res, 'Failed to save product');
                    detailsSaved = true;

                    if (id) {
                        const linksRes = await fetch(`${API_URL}/products/admin/${encodeURIComponent(id)}/alternatives?admin_key=${encodeURIComponent(adminKey)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ foreign_tool_ids: foreignToolIds })
                        });
                        await requireAdminResponse(linksRes, 'Failed to save alternative links');
                    }
                } catch (error) {
                    if (detailsSaved) await refreshProducts();
                    showProductModalError(detailsSaved
                        ? `Product details were saved, but Alternative To links were not saved. ${error.message} Retry saving this form.`
                        : `Could not save product: ${error.message}`);
                    return;
                } finally {
                    saveBtn.disabled = false;
                    closeBtn.disabled = false;
                }

                productModal.classList.add('hidden');
                resetProductAlternatives();
                await refreshProducts();
                showAlert('success', id ? 'Product and alternatives updated successfully.' : 'Product created successfully.');
            });
        }
    }

    /* ==========================================================================
       Manual "Add Product" form: Keywords/Tags input + validation
       ========================================================================== */
    function setupKeywordsTagInput() {
        const entry = document.getElementById('keywords-tag-entry');
        if (!entry) return;

        entry.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addKeywordTag(entry.value);
                entry.value = '';
            } else if (e.key === 'Backspace' && entry.value === '' && productKeywordTags.length > 0) {
                // Convenience: backspace on empty entry removes the last tag
                removeKeywordTag(productKeywordTags.length - 1);
            }
        });

        entry.addEventListener('blur', () => {
            if (entry.value.trim() !== '') {
                addKeywordTag(entry.value);
                entry.value = '';
            }
        });
    }

    function addKeywordTag(rawValue) {
        const value = (rawValue || '').trim().replace(/,+$/, '').trim();
        if (value === '') return;

        if (productKeywordTags.length >= MAX_KEYWORD_TAGS) {
            showFieldError('keywords-error', `You can add up to ${MAX_KEYWORD_TAGS} keywords.`);
            return;
        }

        const alreadyExists = productKeywordTags.some(t => t.toLowerCase() === value.toLowerCase());
        if (alreadyExists) {
            showFieldError('keywords-error', `"${value}" is already added.`);
            return;
        }

        productKeywordTags.push(value);
        clearFieldError('keywords-error');
        renderKeywordTags();
    }

    function removeKeywordTag(index) {
        productKeywordTags.splice(index, 1);
        renderKeywordTags();
    }

    function renderKeywordTags() {
        const list = document.getElementById('keywords-chip-list');
        if (!list) return;
        list.innerHTML = '';
        productKeywordTags.forEach((tag, index) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `${escapeHTML(tag)} <button type="button" class="tag-chip-remove" aria-label="Remove ${escapeHTML(tag)}">&times;</button>`;
            chip.querySelector('.tag-chip-remove').addEventListener('click', () => removeKeywordTag(index));
            list.appendChild(chip);
        });
    }

    function resetKeywordsTagInput() {
        productKeywordTags = [];
        renderKeywordTags();
        const entry = document.getElementById('keywords-tag-entry');
        if (entry) entry.value = '';
    }

    /* ==========================================================================
       Manual "Add Product" form: Pricing Details — conditional required logic
       Required when Pricing = "Paid", optional when "Free". Mirrors the same
       logic used on the public submit page (submit.js).
       ========================================================================== */
    function setupPricingDetailsLogic() {
        const pricingSelect = productForm ? productForm.querySelector('select[name="pricing"]') : null;
        if (!pricingSelect) return;

        pricingSelect.addEventListener('change', updatePricingDetailsRequirement);
        updatePricingDetailsRequirement();
    }

    function updatePricingDetailsRequirement() {
        const detailsInput = document.getElementById('pricing_details');
        const detailsLabel = document.getElementById('pricing-details-label');
        if (!detailsInput || !detailsLabel) return;

        detailsInput.required = true;
        detailsLabel.textContent = 'Pricing Details *';

        if (detailsInput.value.trim() !== '') {
            clearFieldError('pricing-details-error');
        }
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function isValidUrl(value) {
        try {
            new URL(value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function validateProductForm() {
        clearProductFormErrors();
        let isValid = true;

        // Keywords: at least 1 tag required. Also absorb anything still sitting
        // in the entry box (user may have typed a tag but not pressed Enter).
        const entry = document.getElementById('keywords-tag-entry');
        if (entry && entry.value.trim() !== '') {
            addKeywordTag(entry.value);
            entry.value = '';
        }
        if (productKeywordTags.length === 0) {
            showFieldError('keywords-error', 'Add at least one keyword or tag.');
            isValid = false;
        }

        // Contact email: required + format
        const contactEmail = productForm.contact_email.value.trim();
        if (contactEmail === '') {
            showFieldError('contact-email-error', 'Contact email is required.');
            isValid = false;
        } else if (!isValidEmail(contactEmail)) {
            showFieldError('contact-email-error', 'Enter a valid email address.');
            isValid = false;
        }

        // Pricing details: required only when Pricing = Paid
        const pricingValue = productForm.pricing.value;
        const pricingDetailsValue = productForm.pricing_details.value.trim();
        if (pricingDetailsValue === '') {
            showFieldError('pricing-details-error', 'Please specify pricing details.');
            isValid = false;
        }

        // GitHub URL: optional, but must be a valid URL if provided
        const githubUrl = productForm.github_url.value.trim();
        if (githubUrl !== '' && !isValidUrl(githubUrl)) {
            showFieldError('github-url-error', 'Enter a valid URL (e.g. https://github.com/username).');
            isValid = false;
        }

        return isValid;
    }

    function showFieldError(elId, message) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
    }

    function clearFieldError(elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = '';
        el.classList.add('hidden');
    }

    function clearProductFormErrors() {
        ['keywords-error', 'contact-email-error', 'pricing-details-error', 'github-url-error'].forEach(clearFieldError);
    }

    /* ==========================================================================
       Navigation & Tab Switching
       ========================================================================== */
    function setupNavigation() {
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                const targetId = e.target.getAttribute('data-target');
                e.target.classList.add('active');
                // Guarded: a stale HTML/JS pair (section missing) must never
                // throw here and leave the content area blank.
                const targetSection = document.getElementById(targetId);
                if (targetSection) targetSection.classList.remove('hidden');

                renderActiveTab(targetId);
            });
        });
    }

    function renderActiveTab(tabId) {
        hideAlert();
        // Analytics is its own clean space: the global stats bar (which lives
        // above the tab sections) hides there and returns on every other tab.
        const statsBar = document.getElementById('stats-bar');
        if (statsBar) statsBar.classList.toggle('hidden', tabId === 'analytics-tab');
        if (tabId === 'products-tab') renderProducts();
        if (tabId === 'alternatives-tab') fetchForeignTools();
        if (tabId === 'submissions-tab') renderSubmissions();
        if (tabId === 'developers-tab') {
            renderDevelopers();
            renderDeveloperUpdatePicker();
        }
        if (tabId === 'newsletter-tab') {
            renderNewsletterPicker();
            // Fetch the subscriber list once per session, not on every render.
            if (subscribersCache === null) fetchNewsletterSubscribers();
        }
        if (tabId === 'claims-tab') fetchClaims();
        if (tabId === 'analytics-tab') {
            fetchSearchAnalytics();
        }
        if (tabId === 'banner-tab') loadBannerAdmin();
    }

    function getActiveTabId() {
        const active = document.querySelector('.tab-content.active');
        return active ? active.id : 'products-tab';
    }

    /* ==========================================================================
       Toolbars: search + category/status filters (products, submissions, developers)
       ========================================================================== */
    function setupToolbars() {
        const productsSearch = document.getElementById('products-search');
        const productsCategory = document.getElementById('products-category-filter');
        const productsStatus = document.getElementById('products-status-filter');
        if (productsSearch) productsSearch.addEventListener('input', () => {
            state.productFilter.search = productsSearch.value;
            state.productsPage = 1;
            renderProducts();
        });
        if (productsCategory) productsCategory.addEventListener('change', () => {
            state.productFilter.category = productsCategory.value;
            state.productsPage = 1;
            renderProducts();
        });
        if (productsStatus) productsStatus.addEventListener('change', () => {
            state.productFilter.status = productsStatus.value;
            state.productsPage = 1;
            renderProducts();
        });

        const subsSearch = document.getElementById('submissions-search');
        const subsCategory = document.getElementById('submissions-category-filter');
        const subsStatus = document.getElementById('submissions-status-filter');
        if (subsSearch) subsSearch.addEventListener('input', () => {
            state.submissionFilter.search = subsSearch.value;
            state.submissionsPage = 1;
            renderSubmissions();
        });
        if (subsCategory) subsCategory.addEventListener('change', () => {
            state.submissionFilter.category = subsCategory.value;
            state.submissionsPage = 1;
            renderSubmissions();
        });
        if (subsStatus) subsStatus.addEventListener('change', () => {
            state.submissionFilter.status = subsStatus.value;
            state.submissionsPage = 1;
            renderSubmissions();
        });

        const devsSearch = document.getElementById('developers-search');
        if (devsSearch) devsSearch.addEventListener('input', () => {
            state.developerFilter.search = devsSearch.value;
            state.developersPage = 1;
            renderDevelopers();
        });

        // Bulk action bar
        const selectAllBox = document.getElementById('submissions-select-all');
        if (selectAllBox) selectAllBox.addEventListener('change', () => {
            window.toggleSelectAllSubmissions(selectAllBox.checked);
        });
        const bulkApproveBtn = document.getElementById('bulk-approve-btn');
        if (bulkApproveBtn) bulkApproveBtn.addEventListener('click', () => window.bulkApproveSelected());
        const bulkRejectBtn = document.getElementById('bulk-reject-btn');
        if (bulkRejectBtn) bulkRejectBtn.addEventListener('click', () => window.bulkRejectSelected());
        const bulkClearBtn = document.getElementById('bulk-clear-btn');
        if (bulkClearBtn) bulkClearBtn.addEventListener('click', () => window.clearSubmissionSelection());
    }

    /* ==========================================================================
       Data loading (fetch full lists, cache in state, render active tab + stats)
       ========================================================================== */
    async function loadAllData() {
        await Promise.all([fetchProductsData(), fetchSubmissionsData(), fetchDevelopersData()]);
        updateStats();
        renderActiveTab(getActiveTabId());
    }

    async function refreshProducts() {
        await fetchProductsData();
        updateStats();
        renderProducts();
    }

    async function refreshSubmissions() {
        await fetchSubmissionsData();
        updateStats();
        renderSubmissions();
    }

    async function fetchProductsData() {
        try {
            const res = await fetch(`${API_URL}/products/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch products. Check admin key.");
            state.products = await res.json();
        } catch (error) {
            showAlert('error', error.message);
            state.products = [];
        }
    }

    async function fetchSubmissionsData() {
        try {
            const res = await fetch(`${API_URL}/submissions/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch submissions.");
            state.submissions = await res.json();
        } catch (error) {
            showAlert('error', error.message);
            state.submissions = [];
        }
    }

    async function fetchDevelopersData() {
        try {
            const res = await fetch(`${API_URL}/developers/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch developers.");
            state.developers = await res.json();
        } catch (error) {
            showAlert('error', error.message);
            state.developers = [];
        }
    }

    /* ==========================================================================
       Quick Stats Bar
       ========================================================================== */
    function updateStats() {
        setText('stat-total-products', state.products.length);
        setText('stat-pending-submissions', state.submissions.filter(s => submissionStatus(s) === 'pending').length);
        setText('stat-total-developers', state.developers.length);
        setText('stat-total-rejected', state.submissions.filter(s => submissionStatus(s) === 'rejected').length);
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function submissionStatus(s) {
        // Backend now returns a real status field: 'pending' | 'approved' | 'rejected'.
        // Fall back defensively in case older cached data lacks it.
        return s.status || (s.reviewed ? 'approved' : 'pending');
    }

    /* ==========================================================================
       Filtering helpers
       ========================================================================== */
    function getFilteredProducts() {
        const f = state.productFilter;
        return state.products.filter(p => {
            if (f.search && !(p.name || '').toLowerCase().includes(f.search.toLowerCase())) return false;
            if (f.category && p.category !== f.category) return false;
            if (f.status === 'active' && !p.status) return false;
            if (f.status === 'deactivated' && p.status) return false;
            return true;
        });
    }

    function getFilteredSubmissions() {
        const f = state.submissionFilter;
        return state.submissions.filter(s => {
            if (f.search && !(s.name || '').toLowerCase().includes(f.search.toLowerCase())) return false;
            if (f.category && s.category !== f.category) return false;
            if (f.status && submissionStatus(s) !== f.status) return false;
            return true;
        });
    }

    function getFilteredDevelopers() {
        const f = state.developerFilter;
        return state.developers.filter(d => {
            if (f.search && !(d.email || '').toLowerCase().includes(f.search.toLowerCase())) return false;
            return true;
        });
    }

    function paginate(items, page, pageSize) {
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const start = (safePage - 1) * pageSize;
        return { pageItems: items.slice(start, start + pageSize), totalPages, safePage };
    }

    function renderPagination(containerId, totalItems, currentPage, totalPages, onPageChangeFn) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (totalItems === 0) { container.innerHTML = ''; return; }
        container.innerHTML = `
            <button ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹ Prev</button>
            <span>Page ${currentPage} of ${totalPages} · ${totalItems} total</span>
            <button ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next ›</button>
        `;
        container.querySelectorAll('button:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => onPageChangeFn(parseInt(btn.getAttribute('data-page'), 10)));
        });
    }

    /* ==========================================================================
       Render: Products
       ========================================================================== */
    function renderProducts() {
        const tbody = document.getElementById('products-table-body');
        if (!tbody) return;

        const filtered = getFilteredProducts();
        const { pageItems, totalPages, safePage } = paginate(filtered, state.productsPage, PAGE_SIZE);
        state.productsPage = safePage;

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No products match your filters.</td></tr>`;
        } else {
            tbody.innerHTML = '';
            pageItems.forEach(p => {
                const tr = document.createElement('tr');

                const statusBadge = p.status
                    ? `<span class="badge active">Active</span>`
                    : `<span class="badge deactivated">Deactivated</span>`;

                let flagBadges = '';
                if (p.featured) flagBadges += `<span class="badge feature">Featured</span>`;
                if (p.is_popular) flagBadges += `<span class="badge popular">Popular</span>`;
                if (p.is_new_arrival) flagBadges += `<span class="badge new">New</span>`;

                tr.innerHTML = `
                    <td><strong>${escapeHTML(p.name)}</strong></td>
                    <td>${statusBadge}</td>
                    <td>${flagBadges || '<span class="text-muted">-</span>'}</td>
                    <td>${new Date(p.created_at).toLocaleDateString()}</td>
                    <td>
                        <div class="action-menu">
                            <button class="dot-btn" onclick="this.parentElement.classList.toggle('active')">⋮</button>
                            <div class="dropdown-content">
                                <button onclick="editProduct(${p.id})">Edit Details</button>
                                <button onclick="toggleFlag(${p.id}, 'featured', ${p.featured})">${p.featured ? 'Remove Featured' : 'Make Featured'}</button>
                                <button onclick="toggleFlag(${p.id}, 'is_popular', ${p.is_popular})">${p.is_popular ? 'Remove Popular' : 'Make Popular'}</button>
                                <button onclick="toggleFlag(${p.id}, 'is_new_arrival', ${p.is_new_arrival})">${p.is_new_arrival ? 'Remove New Arrival' : 'Make New Arrival'}</button>
                                ${p.status
                                    ? `<button class="danger" onclick="deactivateProduct(${p.id})">Deactivate</button>`
                                    : `<button onclick="reactivateProduct(${p.id})">Reactivate</button>`}
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        renderPagination('products-pagination', filtered.length, state.productsPage, totalPages, (page) => {
            state.productsPage = page;
            renderProducts();
        });
    }

    /* ==========================================================================
       Product Actions (Edit, Flags, Activate, Deactivate)
       ========================================================================== */
    window.toggleFlag = async function(id, flagKey, currentState) {
        try {
            const body = {};
            body[flagKey] = !currentState;
            const res = await fetch(`${API_URL}/products/${id}?admin_key=${adminKey}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error("Failed to update flag");
            await refreshProducts();
            showAlert('success', 'Product flags updated successfully.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    window.deactivateProduct = async function(id) {
        if (!confirm("Are you sure you want to deactivate this product? It will be hidden from the public.")) return;
        try {
            const res = await fetch(`${API_URL}/products/${id}?admin_key=${adminKey}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Failed to deactivate product");
            await refreshProducts();
            showAlert('success', 'Product deactivated.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    window.reactivateProduct = async function(id) {
        try {
            const res = await fetch(`${API_URL}/products/${id}/reactivate?admin_key=${adminKey}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to reactivate product");
            await refreshProducts();
            showAlert('success', 'Product reactivated.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    window.editProduct = async function(id) {
        try {
            const p = state.products.find(prod => String(prod.id) === String(id));
            if (!p) throw new Error("Product not found locally");

            document.getElementById('edit_product_id').value = p.id;
            document.getElementById('modal-title').textContent = 'Edit Product';

            ['name', 'contact_email', 'category', 'product_type', 'pricing', 'pricing_details', 'user_count_range',
             'website', 'logo_url', 'appstore_url', 'playstore_url', 'founder', 'platform',
             'company_name', 'twitter_url', 'linkedin_url', 'instagram_url', 'facebook_url',
             'github_url', 'description'
            ].forEach(field => {
                if (productForm[field]) {
                    // Bulk/approved products may omit optional fields entirely.
                    productForm[field].value = p[field] == null ? '' : p[field];
                }
            });

            // Rehydrate the keywords tag input from the product's stored
            // comma-separated string.
            resetKeywordsTagInput();
            if (p.keywords) {
                p.keywords.split(',').map(k => k.trim()).filter(Boolean).forEach(k => productKeywordTags.push(k));
                renderKeywordTags();
            }
            clearProductFormErrors();
            updatePricingDetailsRequirement();
            hideProductModalError();
            resetProductAlternatives();
            document.getElementById('product-alternatives-section').classList.remove('hidden');

            productModal.classList.remove('hidden');
            loadProductAlternatives(p.id, productForm.category.value);
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    /* ==========================================================================
       Alternatives: foreign-tool catalog + product edit checkboxes
       ========================================================================== */
    async function requireAdminResponse(res, fallback) {
        if (res.ok) return;
        const data = await parseApiResponse(res);
        const detail = data && (data.detail || data.message);
        const message = Array.isArray(detail)
            ? detail.map(item => item.msg || item.message || JSON.stringify(item)).join('; ')
            : (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : ''));
        throw new Error(message || `${fallback} (HTTP ${res.status}).`);
    }

    function setupAlternatives() {
        document.getElementById('open-foreign-tool-btn').addEventListener('click', () => openForeignToolModal());
        document.getElementById('close-foreign-tool-btn').addEventListener('click', closeForeignToolModal);
        document.getElementById('cancel-foreign-tool-btn').addEventListener('click', closeForeignToolModal);
        foreignToolForm.addEventListener('submit', saveForeignTool);

        const search = document.getElementById('foreign-tools-search');
        search.addEventListener('input', () => {
            state.foreignToolsFilter.search = search.value;
            state.foreignToolsPage = 1;
            renderForeignTools();
        });
        const category = document.getElementById('foreign-tools-category-filter');
        category.addEventListener('change', () => {
            state.foreignToolsFilter.category = category.value;
            state.foreignToolsPage = 1;
            fetchForeignTools();
        });
        document.getElementById('foreign-tools-table-body').addEventListener('click', event => {
            const menuBtn = event.target.closest('.dot-btn');
            if (menuBtn) {
                const menu = menuBtn.closest('.action-menu');
                const wasOpen = menu.classList.contains('active');
                document.querySelectorAll('.action-menu.active').forEach(el => el.classList.remove('active'));
                menu.classList.toggle('active', !wasOpen);
                return;
            }
            const editBtn = event.target.closest('[data-foreign-edit]');
            const deleteBtn = event.target.closest('[data-foreign-delete]');
            const id = editBtn ? editBtn.dataset.foreignEdit : (deleteBtn ? deleteBtn.dataset.foreignDelete : null);
            if (id === null) return;
            const tool = state.foreignTools.find(item => String(item.id) === id);
            if (!tool) return;
            if (editBtn) openForeignToolModal(tool);
            else deleteForeignTool(tool);
        });
    }

    async function fetchForeignTools() {
        const requestId = ++foreignToolsRequest;
        const category = state.foreignToolsFilter.category;
        const tbody = document.getElementById('foreign-tools-table-body');
        const errorEl = document.getElementById('foreign-tools-error');
        errorEl.classList.add('hidden');
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Loading foreign tools…</td></tr>';
        document.getElementById('foreign-tools-pagination').innerHTML = '';
        try {
            const query = `admin_key=${encodeURIComponent(adminKey)}` +
                (category ? `&category=${encodeURIComponent(category)}` : '');
            const res = await fetch(`${API_URL}/products/admin/alternatives/foreign-tools?${query}`);
            await requireAdminResponse(res, 'Could not load foreign tools');
            const tools = await res.json();
            if (!Array.isArray(tools)) throw new Error('Invalid foreign-tool list from the server.');
            if (requestId !== foreignToolsRequest) return false;
            state.foreignTools = tools;
            renderForeignTools();
            return true;
        } catch (error) {
            if (requestId !== foreignToolsRequest) return false;
            state.foreignTools = [];
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Could not load foreign tools. Revisit this tab to retry.</td></tr>';
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
            return false;
        }
    }

    function renderForeignTools() {
        const tbody = document.getElementById('foreign-tools-table-body');
        const search = state.foreignToolsFilter.search.trim().toLowerCase();
        const category = state.foreignToolsFilter.category;
        const filtered = state.foreignTools.filter(tool =>
            (!category || tool.category === category) &&
            (!search || String(tool.name || '').toLowerCase().includes(search))
        );
        const { pageItems, totalPages, safePage } = paginate(filtered, state.foreignToolsPage, PAGE_SIZE);
        state.foreignToolsPage = safePage;
        if (!pageItems.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No foreign tools match your filters.</td></tr>';
        } else {
            tbody.innerHTML = '';
            pageItems.forEach(tool => {
                const count = Number(tool.alternative_count ?? 0);
                const date = formatClaimDate(tool.created_at || tool.date_added) || '—';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHTML(tool.name)}</strong></td>
                    <td>${Number.isFinite(count) && count >= 0 ? count : '—'}</td>
                    <td>${escapeHTML(tool.category)}</td>
                    <td>${escapeHTML(date)}</td>
                    <td>
                        <div class="action-menu">
                            <button type="button" class="dot-btn" aria-label="Actions for ${escapeHTML(tool.name)}">⋮</button>
                            <div class="dropdown-content">
                                <button type="button" data-foreign-edit="${escapeHTML(tool.id)}">Edit</button>
                                <button type="button" class="danger" data-foreign-delete="${escapeHTML(tool.id)}">Delete</button>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        renderPagination('foreign-tools-pagination', filtered.length, safePage, totalPages, page => {
            state.foreignToolsPage = page;
            renderForeignTools();
        });
    }

    function openForeignToolModal(tool) {
        foreignToolForm.reset();
        document.getElementById('foreign-tool-form-error').classList.add('hidden');
        document.getElementById('foreign-tool-modal-title').textContent = tool ? 'Edit Foreign Tool' : 'Add Foreign Tool';
        document.getElementById('save-foreign-tool-btn').textContent = tool ? 'Save Changes' : 'Add Foreign Tool';
        document.getElementById('foreign-tool-id').value = tool ? tool.id : '';
        document.getElementById('foreign-tool-name').value = tool ? tool.name || '' : '';
        document.getElementById('foreign-tool-logo').value = tool ? tool.logo_url || '' : '';
        document.getElementById('foreign-tool-description').value = tool ? tool.description || '' : '';
        document.getElementById('foreign-tool-category').value = tool ? tool.category || '' : '';
        foreignToolModal.classList.remove('hidden');
        document.getElementById('foreign-tool-name').focus();
    }

    function closeForeignToolModal() {
        foreignToolModal.classList.add('hidden');
    }

    async function saveForeignTool(event) {
        event.preventDefault();
        const id = document.getElementById('foreign-tool-id').value;
        const payload = {
            name: document.getElementById('foreign-tool-name').value.trim(),
            logo_url: document.getElementById('foreign-tool-logo').value.trim(),
            description: document.getElementById('foreign-tool-description').value.trim(),
            category: document.getElementById('foreign-tool-category').value
        };
        const errorEl = document.getElementById('foreign-tool-form-error');
        errorEl.classList.add('hidden');
        if (!payload.name || !payload.logo_url || !payload.description || !payload.category) {
            errorEl.textContent = 'Fill in all foreign-tool fields before saving.';
            errorEl.classList.remove('hidden');
            return;
        }
        const saveBtn = document.getElementById('save-foreign-tool-btn');
        saveBtn.disabled = true;
        document.getElementById('close-foreign-tool-btn').disabled = true;
        document.getElementById('cancel-foreign-tool-btn').disabled = true;
        try {
            const url = id
                ? `${API_URL}/products/admin/alternatives/foreign-tools/${encodeURIComponent(id)}?admin_key=${encodeURIComponent(adminKey)}`
                : `${API_URL}/products/admin/alternatives/foreign-tools?admin_key=${encodeURIComponent(adminKey)}`;
            const res = await fetch(url, {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await requireAdminResponse(res, 'Could not save foreign tool');
            closeForeignToolModal();
            const refreshed = await fetchForeignTools();
            showAlert(refreshed ? 'success' : 'error', refreshed
                ? (id ? 'Foreign tool updated.' : 'Foreign tool added.')
                : 'Foreign tool saved, but the table could not be refreshed. Revisit this tab to retry.');
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        } finally {
            saveBtn.disabled = false;
            document.getElementById('close-foreign-tool-btn').disabled = false;
            document.getElementById('cancel-foreign-tool-btn').disabled = false;
        }
    }

    async function deleteForeignTool(tool) {
        if (!confirm(`Delete "${tool.name}"? Its links to Nigerian alternatives will also be removed.`)) return;
        try {
            const res = await fetch(`${API_URL}/products/admin/alternatives/foreign-tools/${encodeURIComponent(tool.id)}?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'DELETE'
            });
            await requireAdminResponse(res, 'Could not delete foreign tool');
            const refreshed = await fetchForeignTools();
            showAlert(refreshed ? 'success' : 'error', refreshed
                ? 'Foreign tool deleted and linked alternatives removed.'
                : 'Foreign tool deleted, but the table could not be refreshed. Revisit this tab to retry.');
        } catch (error) {
            showAlert('error', error.message);
        }
    }

    function setupProductAlternatives() {
        const category = productForm.querySelector('select[name="category"]');
        const control = document.querySelector('#product-alternatives-section .product-alternative-control');
        const trigger = document.getElementById('product-alternatives-trigger');
        const picker = document.getElementById('product-alternatives-picker');
        category.addEventListener('change', () => {
            const id = document.getElementById('edit_product_id').value;
            if (id && !productModal.classList.contains('hidden')) loadProductAlternatives(id, category.value);
        });
        document.getElementById('retry-product-alternatives').addEventListener('click', () => {
            const id = document.getElementById('edit_product_id').value;
            if (id) loadProductAlternatives(id, category.value);
        });
        trigger.addEventListener('click', () => setProductAlternativesOpen(picker.classList.contains('hidden')));
        picker.addEventListener('change', updateProductAlternativeSummary);
        document.addEventListener('click', event => {
            if (!control.contains(event.target)) setProductAlternativesOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !picker.classList.contains('hidden')) {
                setProductAlternativesOpen(false);
                trigger.focus();
            }
        });
    }

    function setProductAlternativesOpen(open) {
        const picker = document.getElementById('product-alternatives-picker');
        const trigger = document.getElementById('product-alternatives-trigger');
        const expanded = open && !trigger.disabled;
        picker.classList.toggle('hidden', !expanded);
        trigger.setAttribute('aria-expanded', String(expanded));
    }

    function updateProductAlternativeSummary() {
        const count = document.querySelectorAll('#product-alternatives-picker input[type="checkbox"]:checked').length;
        document.getElementById('product-alternatives-summary').textContent = count
            ? `${count} foreign tool${count === 1 ? '' : 's'} selected` : 'Select foreign tools';
    }

    function resetProductAlternatives() {
        ++productAlternativesRequest; // Ignore any GET from a previously open modal.
        productAlternativesState = { id: null, category: '', ready: false };
        document.getElementById('product-alternatives-section').classList.add('hidden');
        setProductAlternativesOpen(false);
        document.getElementById('product-alternatives-picker').replaceChildren();
        document.getElementById('product-alternatives-trigger').disabled = true;
        document.getElementById('product-alternatives-summary').textContent = 'Select foreign tools';
        document.getElementById('product-alternatives-status').textContent = '';
        document.getElementById('product-alternatives-error').classList.add('hidden');
        document.getElementById('retry-product-alternatives').classList.add('hidden');
    }

    async function loadProductAlternatives(id, category) {
        const requestId = ++productAlternativesRequest;
        productAlternativesState = { id: String(id), category, ready: false };
        const picker = document.getElementById('product-alternatives-picker');
        const trigger = document.getElementById('product-alternatives-trigger');
        const summary = document.getElementById('product-alternatives-summary');
        const status = document.getElementById('product-alternatives-status');
        const errorEl = document.getElementById('product-alternatives-error');
        const retryBtn = document.getElementById('retry-product-alternatives');
        setProductAlternativesOpen(false);
        trigger.disabled = true;
        picker.replaceChildren();
        errorEl.classList.add('hidden');
        retryBtn.classList.add('hidden');
        summary.textContent = category ? 'Loading alternatives…' : 'Choose a category first';
        status.textContent = category ? '' : 'Choose a category to see matching foreign tools.';
        if (!category) return;

        try {
            const [linkedRes, toolsRes] = await Promise.all([
                fetch(`${API_URL}/products/${encodeURIComponent(id)}/alternatives`),
                fetch(`${API_URL}/products/admin/alternatives/foreign-tools?admin_key=${encodeURIComponent(adminKey)}&category=${encodeURIComponent(category)}`)
            ]);
            await Promise.all([
                requireAdminResponse(linkedRes, 'Could not load linked alternatives'),
                requireAdminResponse(toolsRes, 'Could not load foreign tools in this category')
            ]);
            const [linked, tools] = await Promise.all([linkedRes.json(), toolsRes.json()]);
            if (!Array.isArray(linked) || !Array.isArray(tools)) throw new Error('Invalid alternatives response from the server.');
            if (requestId !== productAlternativesRequest) return;

            const linkedIds = new Set(linked.map(item => Number(item.id ?? item.foreign_tool_id)));
            const matching = tools.filter(item => item.category === category &&
                Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0);
            if (!matching.length) {
                summary.textContent = 'No foreign tools in this category';
                status.textContent = `No foreign tools are available in ${category}. Add one in the Alternatives tab.`;
            } else {
                picker.innerHTML = matching.map(item => `
                    <label class="nl-product-row">
                        <input type="checkbox" value="${Number(item.id)}" ${linkedIds.has(Number(item.id)) ? 'checked' : ''}>
                        <span class="nl-product-name">${escapeHTML(item.name)}</span>
                    </label>
                `).join('');
                trigger.disabled = false;
                updateProductAlternativeSummary();
            }
            productAlternativesState.ready = true;
        } catch (error) {
            if (requestId !== productAlternativesRequest) return;
            summary.textContent = 'Alternatives unavailable';
            errorEl.textContent = `Could not load alternatives: ${error.message}`;
            errorEl.classList.remove('hidden');
            retryBtn.classList.remove('hidden');
        }
    }

    function showProductModalError(message) {
        const errorEl = document.getElementById('product-modal-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideProductModalError() {
        const errorEl = document.getElementById('product-modal-error');
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    /* ==========================================================================
       BULK CSV UPLOAD (Products tab)
       --------------------------------------------------------------------------
       Two-step flow, both steps staying on this admin page:
         1. "Bulk Upload" opens a native file picker -> POST
            /products/admin/bulk-preview (multipart) -> the returned rows are
            rendered as an inline-editable grid (table on desktop, stacked
            collapsible cards on mobile). NOTHING is written to the database yet.
         2. "Publish All" -> POST /products/admin/bulk-publish with the current
            (possibly edited, possibly row-deleted) set -> summary of created
            vs skipped rows -> the batch is cleared so another CSV can be loaded.
       ========================================================================== */

    // Every column of the preview grid, in expected-CSV-header order.
    // `key` is the field name used by the API, `header` mirrors the CSV header.
    const BULK_FIELDS = [
        { key: 'name', header: 'Product Name' },
        { key: 'description', header: 'Description' },
        { key: 'category', header: 'Category' },
        { key: 'pricing', header: 'Pricing' },
        { key: 'pricing_details', header: 'Price Details' },
        { key: 'website', header: 'Website' },
        { key: 'product_type', header: 'Product Type' },
        { key: 'founder', header: 'Founder' },
        { key: 'company', header: 'Company' },
        { key: 'logo_url', header: 'Logo URL' },
        { key: 'keywords', header: 'Keywords' },
        { key: 'contact_email', header: 'Contact Email' },
        { key: 'github_url', header: 'GitHub URL' },
        { key: 'appstore_url', header: 'App Store URL' },
        { key: 'playstore_url', header: 'Play Store URL' },
        { key: 'user_count_range', header: 'User Count Range' },
        { key: 'twitter_url', header: 'Twitter URL' },
        { key: 'instagram_url', header: 'Instagram URL' },
        { key: 'facebook_url', header: 'Facebook URL' },
        { key: 'linkedin_url', header: 'LinkedIn URL' }
    ];

    const BULK_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    const BULK_TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

    // Working set for the pending batch: [{ id, values: { field: string }, extra: {}, isDuplicate }].
    // `values` is the single source of truth; the inputs mirror into it as the admin types.
    let bulkRows = [];
    let bulkRowSeq = 0;
    let bulkSourceFileName = '';

    function setupBulkUpload() {
        if (bulkUploadBtn) bulkUploadBtn.addEventListener('click', () => bulkCsvInput.click());
        if (bulkCsvInput) bulkCsvInput.addEventListener('change', handleBulkFileSelected);
        if (bulkPanelInput) bulkPanelInput.addEventListener('change', handleBulkFileSelected);
        if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', resetBulkUpload);
        if (bulkPublishBtn) bulkPublishBtn.addEventListener('click', publishBulkProducts);
        if (bulkUploadPanel) {
            bulkUploadPanel.addEventListener('input', onBulkPreviewInput);
            bulkUploadPanel.addEventListener('click', onBulkPreviewClick);
        }
        renderBulkTableHeaders();
    }

    function renderBulkTableHeaders() {
        if (!bulkTableHeadRow) return;
        bulkTableHeadRow.innerHTML =
            '<th class="bulk-col-index" scope="col">#</th>' +
            '<th class="bulk-col-actions" scope="col">Remove</th>' +
            BULK_FIELDS.map(f => `<th scope="col">${escapeHTML(f.header)}</th>`).join('');
    }

    /* ---------------------------------------------------------------- upload */

    async function handleBulkFileSelected(event) {
        const input = event && event.target ? event.target : null;
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        if (input) input.value = ''; // so picking the same file again still fires
        if (!file) return;

        openBulkPanel();
        hideBulkError();

        if (!/\.csv$/i.test(file.name)) {
            showBulkError(`"${escapeHTML(file.name)}" is not a CSV file. Please choose a file ending in .csv.`);
            return;
        }

        resetBulkBatch(); // clear any previous preview/summary (keeps the panel open)
        bulkSourceFileName = file.name;
        if (bulkUploadFilename) bulkUploadFilename.textContent = file.name;
        setBulkLoading(true, `Uploading ${file.name} and checking for duplicates…`);

        try {
            const formData = new FormData();
            formData.append('file', file, file.name);

            const res = await fetch(`${API_URL}/products/admin/bulk-preview?admin_key=${encodeURIComponent(adminKey || '')}`, {
                method: 'POST',
                body: formData
                // No Content-Type header on purpose: the browser sets the
                // multipart boundary itself.
            });

            const data = await parseApiResponse(res);
            if (!res.ok) throw new Error(bulkApiError(res, data, 'Could not process that CSV'));

            if (!data || !Array.isArray(data.products)) {
                throw new Error('The server did not return a product list. Check that the CSV headers match the expected columns exactly.');
            }
            if (data.products.length === 0) {
                throw new Error('No product rows were found in that CSV. Check that it has the header row plus at least one product.');
            }

            bulkRows = data.products.map(toBulkRow);
            renderBulkPreview();

            const dupes = countBulkDuplicates();
            let status = `${bulkRows.length} row${bulkRows.length === 1 ? '' : 's'} loaded from ${file.name}`;
            status += dupes > 0
                ? ` · ${dupes} flagged as duplicate (rename it or leave it — the server will skip it)`
                : ' · edit any cell in place, then publish.';
            if (bulkUploadStatus) bulkUploadStatus.textContent = status;
        } catch (error) {
            bulkRows = [];
            renderBulkPreview();
            if (bulkUploadStatus) bulkUploadStatus.textContent = 'Nothing was saved — fix the CSV and try again.';
            showBulkError(error && error.message ? error.message : 'Could not process that CSV.');
        } finally {
            setBulkLoading(false);
        }
    }

    // Normalises one row of the preview response into working state.
    // Blank/null fields become '' so they render as empty editable inputs.
    function toBulkRow(product) {
        const values = {};
        const extra = {};
        const source = product && typeof product === 'object' ? product : {};

        BULK_FIELDS.forEach(f => {
            const raw = source[f.key];
            values[f.key] = (raw === null || raw === undefined) ? '' : String(raw);
        });

        // Preserve any additional keys the API returned so the payload we
        // publish is a faithful round-trip (minus is_duplicate).
        Object.keys(source).forEach(k => {
            if (k === 'is_duplicate') return;
            if (BULK_FIELDS.some(f => f.key === k)) return;
            extra[k] = source[k];
        });

        bulkRowSeq += 1;
        return {
            id: bulkRowSeq,
            values: values,
            extra: extra,
            isDuplicate: !!source.is_duplicate
        };
    }

    function findBulkRow(rowId) {
        return bulkRows.find(r => String(r.id) === String(rowId)) || null;
    }

    function countBulkDuplicates() {
        return bulkRows.filter(r => r.isDuplicate).length;
    }

    /* ------------------------------------------------------------- rendering */

    function renderBulkPreview() {
        if (bulkTableBody) {
            bulkTableBody.innerHTML = '';
            bulkRows.forEach((row, index) => bulkTableBody.appendChild(buildBulkTableRow(row, index)));
        }
        if (bulkCardsEl) {
            bulkCardsEl.innerHTML = '';
            bulkRows.forEach((row, index) => bulkCardsEl.appendChild(buildBulkCard(row, index)));
        }
        if (bulkPreviewWrapper) bulkPreviewWrapper.classList.toggle('hidden', bulkRows.length === 0);
        updateBulkPublishBar();
    }

    function buildBulkTableRow(row, index) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-row-id', row.id);
        if (row.isDuplicate) tr.classList.add('bulk-row-duplicate');

        const cellsHTML = BULK_FIELDS.map(field => {
            const inputHTML = bulkInputHTML(row, field, index, 'bulk-cell-input');
            if (field.key !== 'name') return `<td>${inputHTML}</td>`;
            return `
                <td class="bulk-col-name">
                    <div class="bulk-name-cell">
                        ${inputHTML}
                        ${row.isDuplicate
                            ? '<span class="badge duplicate" title="A product with this exact name already exists. Publishing will skip this row unless you rename it.">Duplicate</span>'
                            : ''}
                    </div>
                </td>
            `;
        }).join('');

        tr.innerHTML = `
            <td class="bulk-col-index">${index + 1}</td>
            <td class="bulk-col-actions">${bulkDeleteButtonHTML(row.id)}</td>
            ${cellsHTML}
        `;
        return tr;
    }

    function buildBulkCard(row, index) {
        const card = document.createElement('div');
        card.className = 'bulk-card' + (row.isDuplicate ? ' duplicate' : '');
        card.setAttribute('data-card-id', row.id);

        const fieldsHTML = BULK_FIELDS.map(field => {
            const id = `bulk_${row.id}_${field.key}`;
            const attrs = `id="${id}" data-row-id="${row.id}" data-field="${field.key}" autocomplete="off" spellcheck="false"`;
            const control = field.key === 'description'
                ? `<textarea rows="3" class="bulk-cell-input bulk-card-input" ${attrs}>${escapeHTML(row.values[field.key])}</textarea>`
                : `<input type="text" class="bulk-cell-input bulk-card-input" ${attrs} value="${escapeHTML(row.values[field.key])}">`;
            return `<div class="bulk-card-field"><label for="${id}">${escapeHTML(field.header)}</label>${control}</div>`;
        }).join('');

        const displayName = row.values.name && row.values.name.trim() !== '' ? row.values.name : 'Untitled product';

        card.innerHTML = `
            <div class="bulk-card-header">
                <button type="button" class="bulk-card-toggle" data-bulk-toggle="${row.id}" aria-expanded="false">
                    <span class="bulk-card-chevron">${BULK_CHEVRON_SVG}</span>
                    <span class="bulk-card-title">
                        <span class="bulk-card-name">${escapeHTML(displayName)}</span>
                        <span class="bulk-card-sub text-muted">Row ${index + 1} · tap to edit</span>
                    </span>
                    ${row.isDuplicate ? '<span class="badge duplicate">Duplicate</span>' : ''}
                </button>
                ${bulkDeleteButtonHTML(row.id)}
            </div>
            <div class="bulk-card-body">
                ${fieldsHTML}
            </div>
        `;
        return card;
    }

    // One shared builder so the table cell and the card field always stay in sync.
    function bulkInputHTML(row, field, index, inputClass) {
        return `<input type="text" class="${inputClass}" data-row-id="${row.id}" data-field="${field.key}"
                    value="${escapeHTML(row.values[field.key])}" autocomplete="off" spellcheck="false"
                    aria-label="${escapeHTML(field.header)}, row ${index + 1}">`;
    }

    function bulkDeleteButtonHTML(rowId) {
        return `<button type="button" class="bulk-delete-btn" data-bulk-delete="${rowId}"
                    title="Remove this row — it will not be published" aria-label="Remove this row">${BULK_TRASH_SVG}</button>`;
    }

    function updateBulkPublishBar() {
        const total = bulkRows.length;
        const dupes = countBulkDuplicates();
        if (bulkPublishBar) bulkPublishBar.classList.toggle('hidden', total === 0);
        if (bulkPublishCountEl) {
            bulkPublishCountEl.textContent = total === 0
                ? ''
                : `${total} product${total === 1 ? '' : 's'} ready to publish` +
                  (dupes > 0 ? ` · ${dupes} flagged as duplicate` : '');
        }
    }

    /* ------------------------------------------------- edit / delete / expand */

    // Live edits are written straight into `bulkRows` and mirrored into the
    // other view (table <-> card) so both stay identical.
    function onBulkPreviewInput(event) {
        const target = event.target;
        if (!target || !target.matches || !target.matches('[data-row-id][data-field]')) return;

        const rowId = target.getAttribute('data-row-id');
        const field = target.getAttribute('data-field');
        const row = findBulkRow(rowId);
        if (!row) return;

        row.values[field] = target.value;

        if (bulkPreviewWrapper) {
            bulkPreviewWrapper.querySelectorAll(`[data-row-id="${rowId}"][data-field="${field}"]`).forEach(peer => {
                if (peer !== target && peer.value !== target.value) peer.value = target.value;
            });
        }

        if (field === 'name') {
            updateBulkCardName(row);
            if (target.value.trim() !== '') clearBulkRowNameError(rowId);
        }
    }

    function updateBulkCardName(row) {
        if (!bulkCardsEl) return;
        const card = bulkCardsEl.querySelector(`.bulk-card[data-card-id="${row.id}"]`);
        if (!card) return;
        const nameEl = card.querySelector('.bulk-card-name');
        if (nameEl) {
            nameEl.textContent = (row.values.name && row.values.name.trim() !== '') ? row.values.name : 'Untitled product';
        }
    }

    function onBulkPreviewClick(event) {
        if (!event.target || !event.target.closest) return;

        const delBtn = event.target.closest('[data-bulk-delete]');
        if (delBtn) {
            removeBulkRow(delBtn.getAttribute('data-bulk-delete'));
            return;
        }

        const toggle = event.target.closest('[data-bulk-toggle]');
        if (toggle) {
            const card = toggle.closest('.bulk-card');
            if (card) {
                const isOpen = card.classList.toggle('open');
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            }
            return;
        }

        if (event.target.closest('[data-bulk-dismiss]')) hideBulkSummary();
    }

    function removeBulkRow(rowId) {
        const row = findBulkRow(rowId);
        if (!row) return;

        const label = row.values.name && row.values.name.trim() !== '' ? row.values.name : 'this row';
        if (!confirm(`Remove "${label}" from this batch? It will not be published.`)) return;

        bulkRows = bulkRows.filter(r => String(r.id) !== String(rowId));
        renderBulkPreview();

        const dupes = countBulkDuplicates();
        if (bulkUploadStatus) {
            bulkUploadStatus.textContent = bulkRows.length === 0
                ? 'No rows left in this batch — upload another CSV, or cancel.'
                : `${bulkRows.length} row${bulkRows.length === 1 ? '' : 's'} ready${dupes > 0 ? ` · ${dupes} flagged as duplicate` : ''}.`;
        }
    }

    /* --------------------------------------------------------------- publish */

    async function publishBulkProducts() {
        const products = collectBulkPayload();
        if (products.length === 0) {
            showBulkError('There is nothing to publish — upload a CSV first.');
            return;
        }

        // Every row must have a name or the backend would reject/mis-create it.
        if (products.some(p => !p.name)) {
            const firstInvalidId = flagBulkNameErrors();
            showBulkError('Every product needs a Product Name before publishing. Rows with a missing name are highlighted below — fix the name or remove the row.');
            if (firstInvalidId !== null) scrollBulkRowIntoView(firstInvalidId);
            return;
        }

        const dupes = countBulkDuplicates();
        if (dupes > 0) {
            const proceed = confirm(
                `${dupes} row${dupes === 1 ? ' is' : 's are'} flagged as a duplicate of a product that already exists. ` +
                'The server will skip those rows. Publish the rest now?'
            );
            if (!proceed) return;
        }

        setBulkLoading(true, `Publishing ${products.length} product${products.length === 1 ? '' : 's'}…`);
        hideBulkError();
        hideBulkSummary();
        if (bulkPublishBtn) {
            bulkPublishBtn.disabled = true;
            bulkPublishBtn.textContent = 'Publishing…';
        }

        try {
            const res = await fetch(`${API_URL}/products/admin/bulk-publish?admin_key=${encodeURIComponent(adminKey || '')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: products })
            });

            const data = await parseApiResponse(res);
            if (!res.ok) throw new Error(bulkApiError(res, data, 'Publish failed'));

            showBulkPublishSummary(data, products.length);

            // Successful publish -> clear the batch so another CSV can be loaded.
            bulkRows = [];
            bulkRowSeq = 0;
            bulkSourceFileName = '';
            if (bulkUploadFilename) bulkUploadFilename.textContent = '';
            renderBulkPreview();
            if (bulkUploadStatus) bulkUploadStatus.textContent = 'Batch published. Upload another CSV, or cancel to close this panel.';

            await refreshProducts(); // "All Products" table + stats now include the new rows
        } catch (error) {
            showBulkError(error && error.message ? error.message : 'Publish failed.');
            if (bulkUploadStatus) bulkUploadStatus.textContent = 'Nothing was published — your edits are still here, try again.';
        } finally {
            setBulkLoading(false);
            if (bulkPublishBtn) {
                bulkPublishBtn.disabled = false;
                bulkPublishBtn.textContent = 'Publish All';
            }
        }
    }

    // Reads the CURRENT (possibly edited) state of every row into the payload
    // shape the bulk-publish endpoint expects. Empty cells are sent as null.
    function collectBulkPayload() {
        syncBulkRowsFromDOM();

        return bulkRows.map(row => {
            const payload = {};
            BULK_FIELDS.forEach(f => {
                const raw = row.values[f.key];
                const value = (raw === null || raw === undefined) ? '' : String(raw).trim();
                payload[f.key] = value === '' ? null : value;
            });
            Object.keys(row.extra).forEach(k => {
                if (!(k in payload)) payload[k] = row.extra[k];
            });
            return payload;
        });
    }

    // Safety net: the state is already kept up to date on every keystroke,
    // but this guarantees the DOM is the final word before we publish.
    function syncBulkRowsFromDOM() {
        if (!bulkPreviewWrapper) return;
        const nodes = isBulkCardViewActive()
            ? bulkCardsEl.querySelectorAll('[data-row-id][data-field]')
            : bulkTableBody.querySelectorAll('[data-row-id][data-field]');

        nodes.forEach(node => {
            const row = findBulkRow(node.getAttribute('data-row-id'));
            const field = node.getAttribute('data-field');
            if (row && field && Object.prototype.hasOwnProperty.call(row.values, field)) {
                row.values[field] = node.value;
            }
        });
    }

    // True when the CSS breakpoint has swapped the table for the card view.
    function isBulkCardViewActive() {
        return !!(bulkCardsEl && bulkCardsEl.offsetParent !== null);
    }

    function flagBulkNameErrors() {
        let firstInvalidId = null;

        bulkRows.forEach(row => {
            const invalid = String(row.values.name || '').trim() === '';
            const tr = bulkTableBody ? bulkTableBody.querySelector(`tr[data-row-id="${row.id}"]`) : null;
            const card = bulkCardsEl ? bulkCardsEl.querySelector(`.bulk-card[data-card-id="${row.id}"]`) : null;

            if (tr) tr.classList.toggle('bulk-row-invalid', invalid);
            if (card) {
                card.classList.toggle('invalid', invalid);
                if (invalid) {
                    // Open the card so the admin can see (and fix) the name field.
                    card.classList.add('open');
                    const toggle = card.querySelector('[data-bulk-toggle]');
                    if (toggle) toggle.setAttribute('aria-expanded', 'true');
                }
            }
            if (invalid && firstInvalidId === null) firstInvalidId = row.id;
        });

        return firstInvalidId;
    }

    function clearBulkRowNameError(rowId) {
        const tr = bulkTableBody ? bulkTableBody.querySelector(`tr[data-row-id="${rowId}"]`) : null;
        const card = bulkCardsEl ? bulkCardsEl.querySelector(`.bulk-card[data-card-id="${rowId}"]`) : null;
        if (tr) tr.classList.remove('bulk-row-invalid');
        if (card) card.classList.remove('invalid');
        if (bulkErrorEl) hideBulkError();
    }

    function scrollBulkRowIntoView(rowId) {
        const el = isBulkCardViewActive()
            ? (bulkCardsEl ? bulkCardsEl.querySelector(`.bulk-card[data-card-id="${rowId}"]`) : null)
            : (bulkTableBody ? bulkTableBody.querySelector(`tr[data-row-id="${rowId}"]`) : null);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // "46 of 50 products created. 4 skipped:" + skipped names/reasons.
    function showBulkPublishSummary(data, submittedCount) {
        if (!bulkSummaryEl) return;

        const created = (data && typeof data.created === 'number') ? data.created : null;
        const total = (data && typeof data.total_submitted === 'number') ? data.total_submitted : submittedCount;
        const skipped = (data && Array.isArray(data.skipped_details)) ? data.skipped_details : [];
        const skippedCount = (data && typeof data.skipped_count === 'number') ? data.skipped_count : skipped.length;

        let heading;
        if (created === null) {
            heading = `${total} product${total === 1 ? '' : 's'} submitted.`;
        } else {
            heading = `${created} of ${total} product${total === 1 ? '' : 's'} created.`;
        }
        if (skippedCount > 0) heading += ` ${skippedCount} skipped:`;

        const skippedHTML = skipped.length
            ? `<ul class="bulk-skipped-list">${skipped.map(item => {
                    const name = item && item.name ? item.name : 'Unnamed product';
                    const reason = item && item.reason ? item.reason : 'skipped by the server';
                    return `<li><strong>${escapeHTML(name)}</strong> — ${escapeHTML(reason)}</li>`;
                }).join('')}</ul>`
            : (skippedCount > 0
                ? `<p style="margin-top: 0.4rem; font-size: 0.82rem;">${skippedCount} row(s) were skipped but the server returned no details.</p>`
                : '');

        bulkSummaryEl.className = 'bulk-upload-summary' + (skippedCount > 0 ? ' warn' : ' success');
        bulkSummaryEl.innerHTML = `
            <div class="bulk-summary-head">
                <div><strong>${escapeHTML(heading)}</strong>${skippedHTML}</div>
                <button type="button" class="btn-secondary btn-small" data-bulk-dismiss="1">Dismiss</button>
            </div>
        `;
        bulkSummaryEl.classList.remove('hidden');
    }

    /* ------------------------------------------------------- state / helpers */

    function openBulkPanel() {
        if (bulkUploadPanel) bulkUploadPanel.classList.remove('hidden');
    }

    // Clears the pending batch. `options.keepSummary` leaves the last publish
    // report on screen (it is re-rendered only when a new CSV is uploaded).
    function resetBulkBatch(options) {
        const keepSummary = !!(options && options.keepSummary);

        bulkRows = [];
        bulkRowSeq = 0;
        bulkSourceFileName = '';

        if (bulkUploadFilename) bulkUploadFilename.textContent = '';
        hideBulkError();
        if (!keepSummary) hideBulkSummary();
        renderBulkPreview();
        if (bulkUploadStatus) bulkUploadStatus.textContent = '';
    }

    // "Cancel Upload" — full reset, closes the panel and returns the page to normal.
    function resetBulkUpload() {
        resetBulkBatch();
        setBulkLoading(false);
        if (bulkUploadPanel) bulkUploadPanel.classList.add('hidden');
        if (bulkCsvInput) bulkCsvInput.value = '';
        if (bulkPanelInput) bulkPanelInput.value = '';
        if (bulkPublishBtn) {
            bulkPublishBtn.disabled = false;
            bulkPublishBtn.textContent = 'Publish All';
        }
    }

    function setBulkLoading(isLoading, message) {
        if (!bulkLoadingEl) return;
        if (isLoading && message) {
            const label = bulkLoadingEl.querySelector('.bulk-loading-text');
            if (label) label.textContent = message;
        }
        bulkLoadingEl.classList.toggle('hidden', !isLoading);
    }

    function showBulkError(message) {
        if (!bulkErrorEl) return;
        bulkErrorEl.textContent = message;
        bulkErrorEl.classList.remove('hidden');
        if (bulkErrorEl.scrollIntoView) bulkErrorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideBulkError() {
        if (bulkErrorEl) {
            bulkErrorEl.textContent = '';
            bulkErrorEl.classList.add('hidden');
        }
    }

    function hideBulkSummary() {
        if (bulkSummaryEl) {
            bulkSummaryEl.classList.add('hidden');
            bulkSummaryEl.innerHTML = '';
        }
    }

    // Reads a fetch Response as JSON without throwing on non-JSON error bodies
    // (a proxy/HTML error page would otherwise look like a silent failure).
    async function parseApiResponse(res) {
        let text = '';
        try {
            text = await res.text();
        } catch (e) {
            return null;
        }
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (e) {
            const cleaned = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            return { detail: cleaned.length > 300 ? cleaned.slice(0, 300) + '…' : cleaned };
        }
    }

    function bulkApiError(res, data, fallback) {
        if (data && data.detail) {
            const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            if (detail) return detail;
        }
        if (data && data.message) return data.message;

        const status = res ? res.status : 0;
        if (status === 400) return `${fallback} — the server rejected the request (400). Check that the CSV header row matches the expected columns exactly.`;
        if (status === 401 || status === 403) return 'Admin key rejected. Clear the admin key and log in again.';
        if (status === 413) return 'That CSV is too large for the server to accept. Split it into smaller files.';
        if (status >= 500) return `${fallback} — the server hit an error (${status}). Please try again.`;
        return `${fallback}${status ? ` (HTTP ${status})` : ' — network error.'}`;
    }

    /* ==========================================================================
       Render: Submissions
       ========================================================================== */
    function renderSubmissions() {
        const tbody = document.getElementById('submissions-table-body');
        if (!tbody) return;

        const filtered = getFilteredSubmissions();
        const { pageItems, totalPages, safePage } = paginate(filtered, state.submissionsPage, PAGE_SIZE);
        state.submissionsPage = safePage;

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No submissions match your filters.</td></tr>`;
        } else {
            tbody.innerHTML = '';
            pageItems.forEach(s => {
                const tr = document.createElement('tr');
                tr.className = 'clickable-row';
                const devEmail = s.developer ? s.developer.email : (s.email || 'No developer attached');
                const status = submissionStatus(s);
                const isPending = status === 'pending';
                const isChecked = state.selectedSubmissionIds.has(s.id);

                tr.innerHTML = `
                    <td onclick="event.stopPropagation()">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} ${isPending ? '' : 'disabled'}
                               onchange="toggleSubmissionSelect(${s.id}, this.checked)">
                    </td>
                    <td><strong>${escapeHTML(s.name)}</strong></td>
                    <td>${escapeHTML(s.category || '-')}</td>
                    <td>${escapeHTML(devEmail)}</td>
                    <td>${statusBadgeHTML(s)}</td>
                    <td class="row-actions" onclick="event.stopPropagation()">
                        <button class="btn-small btn-primary" onclick="openSubmissionDetail(${s.id})">View</button>
                        ${isPending ? `<button class="btn-success btn-small" onclick="approveSubmissionRow(${s.id})">Approve</button>` : ''}
                        ${isPending ? `<button class="btn-danger btn-small" onclick="rejectSubmissionRow(${s.id})">Reject</button>` : ''}
                    </td>
                `;
                tr.addEventListener('click', () => window.openSubmissionDetail(s.id));
                tbody.appendChild(tr);
            });
        }

        renderPagination('submissions-pagination', filtered.length, state.submissionsPage, totalPages, (page) => {
            state.submissionsPage = page;
            renderSubmissions();
        });

        updateBulkBar();

        // Keep "select all" checkbox in sync with current page's pending rows
        const selectAllBox = document.getElementById('submissions-select-all');
        if (selectAllBox) {
            const pendingOnPage = pageItems.filter(s => submissionStatus(s) === 'pending');
            selectAllBox.checked = pendingOnPage.length > 0 && pendingOnPage.every(s => state.selectedSubmissionIds.has(s.id));
        }
    }

    function statusBadgeHTML(s) {
        const status = submissionStatus(s);
        if (status === 'approved') return `<span class="badge active">Approved</span>`;
        if (status === 'rejected') {
            const reason = s.rejection_reason
                ? `<span class="rejection-reason-note">"${escapeHTML(s.rejection_reason)}"</span>`
                : '';
            return `<span class="badge deactivated">Rejected</span>${reason}`;
        }
        return `<span class="badge popular">Pending Review</span>`;
    }

    /* ==========================================================================
       Submission bulk selection
       ========================================================================== */
    function updateBulkBar() {
        const bar = document.getElementById('submissions-bulk-bar');
        const countEl = document.getElementById('submissions-selected-count');
        if (!bar || !countEl) return;
        const count = state.selectedSubmissionIds.size;
        countEl.textContent = `${count} selected`;
        bar.classList.toggle('hidden', count === 0);
    }

    window.toggleSubmissionSelect = function(id, checked) {
        if (checked) state.selectedSubmissionIds.add(id);
        else state.selectedSubmissionIds.delete(id);
        updateBulkBar();
        const selectAllBox = document.getElementById('submissions-select-all');
        if (selectAllBox && !checked) selectAllBox.checked = false;
    };

    window.toggleSelectAllSubmissions = function(checked) {
        const filtered = getFilteredSubmissions();
        const { pageItems } = paginate(filtered, state.submissionsPage, PAGE_SIZE);
        pageItems.filter(s => submissionStatus(s) === 'pending').forEach(s => {
            if (checked) state.selectedSubmissionIds.add(s.id);
            else state.selectedSubmissionIds.delete(s.id);
        });
        renderSubmissions();
    };

    window.clearSubmissionSelection = function() {
        state.selectedSubmissionIds.clear();
        renderSubmissions();
    };

    window.bulkApproveSelected = async function() {
        const ids = Array.from(state.selectedSubmissionIds);
        if (ids.length === 0) return;
        if (!confirm(`Approve ${ids.length} selected submission(s)? They will instantly become live products.`)) return;

        const results = await Promise.allSettled(ids.map(id =>
            fetch(`${API_URL}/submissions/${id}/approve?admin_key=${adminKey}`, { method: 'POST' })
        ));
        const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok)).length;

        state.selectedSubmissionIds.clear();
        await refreshSubmissions();
        await refreshProducts();

        if (failed > 0) {
            showAlert('error', `${ids.length - failed} approved, ${failed} failed. Check individual submissions.`);
        } else {
            showAlert('success', `${ids.length} submission(s) approved and published.`);
        }
    };

    window.bulkRejectSelected = function() {
        const ids = Array.from(state.selectedSubmissionIds);
        if (ids.length === 0) return;
        openRejectReasonModal(ids);
    };

    /* ==========================================================================
       Single-row approve / reject (from the submissions table)
       ========================================================================== */
    window.approveSubmissionRow = async function(id) {
        if (!confirm("Approve this submission? It will instantly become a live product.")) return;
        try {
            const res = await fetch(`${API_URL}/submissions/${id}/approve?admin_key=${adminKey}`, { method: 'POST' });
            if (!res.ok) throw new Error("Approval failed");
            state.selectedSubmissionIds.delete(id);
            await refreshSubmissions();
            await refreshProducts();
            showAlert('success', 'Submission approved and product is now live.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    window.rejectSubmissionRow = function(id) {
        openRejectReasonModal([id]);
    };

    /* ==========================================================================
       Submission Detail / Edit-before-approve Modal
       ========================================================================== */
    function resetSubmissionReview() {
        ++submissionAlternativeRequest; // Invalidate any in-flight category lookup.
        submissionReviewOriginal = null;
        submissionAlternativeState = {
            category: '', ready: false, available: new Set(),
            original: new Set(), selected: new Set(), tools: [],
            isPending: false, sourceKnown: false, droppedUnavailable: false
        };
    }

    function closeSubmissionDetail() {
        ++submissionDetailRequest; // Invalidate a detail GET as well as its catalog lookup.
        resetSubmissionReview();
        currentDetailSubmissionId = null;
        submissionDetailModal.classList.add('hidden');
    }

    function setupSubmissionDetailModal() {
        const closeBtn = document.getElementById('close-submission-modal-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeSubmissionDetail);

        const approveBtn = document.getElementById('detail-approve-btn');
        if (approveBtn) approveBtn.addEventListener('click', () => window.approveFromDetail());

        const rejectBtn = document.getElementById('detail-reject-btn');
        if (rejectBtn) rejectBtn.addEventListener('click', () => {
            if (currentDetailSubmissionId != null) openRejectReasonModal([currentDetailSubmissionId]);
        });
        submissionDetailBody.addEventListener('input', clearSubmissionReviewErrors);
    }

    window.openSubmissionDetail = async function(id) {
        const requestId = ++submissionDetailRequest;
        resetSubmissionReview();
        currentDetailSubmissionId = id;
        submissionDetailBody.innerHTML = `<p class="text-muted">Loading submission details...</p>`;
        const approveBtn = document.getElementById('detail-approve-btn');
        const rejectBtn = document.getElementById('detail-reject-btn');
        if (approveBtn) approveBtn.classList.add('hidden');
        if (rejectBtn) rejectBtn.classList.add('hidden');
        submissionDetailModal.classList.remove('hidden');

        try {
            const res = await fetch(`${API_URL}/submissions/${encodeURIComponent(id)}?admin_key=${encodeURIComponent(adminKey)}`);
            if (!res.ok) throw new Error('Failed to load submission details.');
            const sub = await res.json();
            if (requestId !== submissionDetailRequest) return;
            renderSubmissionDetail(sub, requestId);
        } catch (error) {
            if (requestId !== submissionDetailRequest) return;
            submissionDetailBody.innerHTML = `<p style="color: var(--color-red);">${escapeHTML(error.message)}</p>`;
        }
    };

    function renderSubmissionDetail(sub, requestId) {
        const status = submissionStatus(sub);
        const devEmail = sub.developer ? sub.developer.email : (sub.email || sub.contact_email || 'Unknown');
        const isPending = status === 'pending';

        let metaHTML = `
            <div class="submission-meta">
                <div>${statusBadgeHTMLPlain(status)}</div>
                <div><span class="meta-label">Submitted by:</span>${escapeHTML(devEmail)}</div>
                ${sub.created_at ? `<div><span class="meta-label">Submitted:</span>${new Date(sub.created_at).toLocaleString()}</div>` : ''}
                ${status === 'rejected' && sub.rejection_reason
                    ? `<div class="submission-meta-reason"><span class="meta-label">Rejection reason:</span>${escapeHTML(sub.rejection_reason)}</div>`
                    : ''}
            </div>
        `;

        let formHTML = '<div class="form-grid">';
        SUBMISSION_FIELDS.forEach(field => {
            // The submission column/wire key is company; products use company_name.
            const saved = field.key === 'company_name' ? (sub.company ?? sub.company_name) : sub[field.key];
            const value = saved == null ? '' : String(saved);
            const id = `detail_${field.key}`;
            formHTML += `<div class="form-group${field.key === 'pricing_details' ? ' full-width' : ''}"><label for="${id}">${escapeHTML(field.label)}</label>`;
            if (field.type === 'select') {
                const options = [...(SELECT_OPTIONS[field.options] || [])];
                // Preserve an unexpected saved value instead of silently selecting the first option.
                if (value && !options.includes(value)) options.unshift(value);
                formHTML += `<select id="${id}" ${!isPending ? 'disabled' : ''}>`;
                if (!value) formHTML += '<option value="" selected>Choose an option</option>';
                options.forEach(opt => {
                    formHTML += `<option value="${escapeHTML(opt)}" ${opt === value ? 'selected' : ''}>${escapeHTML(opt)}</option>`;
                });
                formHTML += '</select>';
            } else {
                formHTML += `<input type="${field.type}" id="${id}" value="${escapeHTML(value)}" ${!isPending ? 'disabled' : ''}>`;
                if (field.key === 'pricing_details' && isPending) {
                    formHTML += '<small class="text-muted submission-review-hint">Correct the saved pricing details here if needed; changes apply on approval.</small>';
                }
            }
            formHTML += '</div>';
        });
        formHTML += '</div>';

        formHTML += `
            <div class="form-group full-width" id="detail-alternatives-group">
                <div class="submission-alternatives-heading">
                    <label>Alternative To${isPending ? ' *' : ''}</label>
                    <button type="button" id="detail-alternatives-help" class="submission-alt-help-trigger"
                            aria-label="Help: Alternative To" aria-expanded="false" aria-controls="detail-alternatives-help-pop">?</button>
                </div>
                <div id="detail-alternatives-list" class="nl-product-picker submission-alternatives-list"
                     role="group" aria-label="Foreign tools in this category" aria-describedby="detail-alternatives-status"></div>
                <div id="detail-alternatives-status" class="text-muted" role="status"></div>
                <button type="button" id="detail-alternatives-retry" class="submission-alt-retry hidden">Retry loading alternatives</button>
                <div id="detail-alternatives-error" class="submission-review-error hidden" role="alert"></div>
                <div id="detail-alternatives-help-pop" class="submission-alt-help-pop hidden" role="tooltip">
                    <button type="button" id="detail-alternatives-help-close" aria-label="Close help">&times;</button>
                    <strong>Alternative To</strong>
                    <p>Tag your product as a local alternative to well-known global tools in the same category.</p>
                </div>
            </div>
            <div class="form-group full-width">
                <label for="detail_description">Description</label>
                <textarea id="detail_description" rows="4" ${!isPending ? 'disabled' : ''}>${escapeHTML(sub.description || '')}</textarea>
            </div>
            <div id="detail-review-error" class="submission-review-error hidden" role="alert"></div>
        `;
        submissionDetailBody.innerHTML = metaHTML + formHTML;

        const originalFields = { description: document.getElementById('detail_description').value };
        SUBMISSION_FIELDS.forEach(field => {
            originalFields[field.key] = document.getElementById(`detail_${field.key}`).value;
        });
        submissionReviewOriginal = { id: String(currentDetailSubmissionId), fields: originalFields };
        submissionAlternativeState.isPending = isPending;
        submissionAlternativeState.sourceKnown = Array.isArray(sub.foreign_tool_ids);
        const ids = submissionAlternativeState.sourceKnown
            ? sub.foreign_tool_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0) : [];
        submissionAlternativeState.original = new Set(ids);
        submissionAlternativeState.selected = new Set(ids);
        submissionAlternativeState.category = originalFields.category;
        renderSubmissionAlternativeRows(); // Show saved IDs immediately, even if lookup fails.
        loadSubmissionReviewAlternatives(originalFields.category, requestId);

        if (isPending) {
            document.getElementById('detail_category').addEventListener('change', event => {
                // Returning to the original category restores the submitted selection.
                submissionAlternativeState.selected = event.target.value === submissionReviewOriginal.fields.category
                    ? new Set(submissionAlternativeState.original) : new Set();
                submissionAlternativeState.droppedUnavailable = false;
                clearSubmissionReviewErrors();
                loadSubmissionReviewAlternatives(event.target.value, requestId);
            });
            document.getElementById('detail-alternatives-list').addEventListener('change', event => {
                const box = event.target.closest('input[type="checkbox"]');
                if (!box || !submissionAlternativeState.ready) return;
                const id = Number(box.value);
                if (!submissionAlternativeState.available.has(id)) return;
                // Saved IDs absent from the category catalog stay intact when
                // only other fields change, but cannot enter corrected links.
                for (const savedId of submissionAlternativeState.selected) {
                    if (!submissionAlternativeState.available.has(savedId)) {
                        submissionAlternativeState.selected.delete(savedId);
                        submissionAlternativeState.droppedUnavailable = true;
                    }
                }
                if (box.checked) submissionAlternativeState.selected.add(id);
                else submissionAlternativeState.selected.delete(id);
                document.querySelectorAll('#detail-alternatives-list .is-unavailable input').forEach(input => {
                    input.checked = false;
                });
                clearSubmissionReviewErrors();
                updateSubmissionAlternativeStatus();
            });
        }
        document.getElementById('detail-alternatives-retry').addEventListener('click', () => {
            loadSubmissionReviewAlternatives(document.getElementById('detail_category').value, requestId);
        });
        const help = document.getElementById('detail-alternatives-help');
        const helpPop = document.getElementById('detail-alternatives-help-pop');
        help.addEventListener('click', () => {
            helpPop.classList.toggle('hidden');
            help.setAttribute('aria-expanded', String(!helpPop.classList.contains('hidden')));
        });
        document.getElementById('detail-alternatives-help-close').addEventListener('click', () => {
            helpPop.classList.add('hidden');
            help.setAttribute('aria-expanded', 'false');
            help.focus();
        });

        const approveBtn = document.getElementById('detail-approve-btn');
        const rejectBtn = document.getElementById('detail-reject-btn');
        if (approveBtn) approveBtn.classList.toggle('hidden', !isPending);
        if (rejectBtn) rejectBtn.classList.toggle('hidden', !isPending);
    }

    function appendSubmissionAlternativeRow(list, id, tool, disabled, unavailable = false) {
        const name = tool && tool.name ? String(tool.name) : `Tool #${id}`;
        const row = document.createElement(disabled ? 'div' : 'label');
        row.className = `nl-product-row submission-alternative-row${unavailable ? ' is-unavailable' : ''}`;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = String(id);
        box.checked = submissionAlternativeState.selected.has(id);
        box.disabled = disabled;
        box.setAttribute('aria-label', `Alternative to ${name}`);
        row.appendChild(box);
        if (tool && /^https?:\/\//i.test(tool.logo_url || '')) {
            const logo = document.createElement('img');
            logo.className = 'submission-alternative-logo';
            logo.src = tool.logo_url;
            logo.alt = '';
            logo.loading = 'lazy';
            row.appendChild(logo);
        }
        const nameEl = document.createElement('span');
        nameEl.className = 'nl-product-name';
        nameEl.textContent = name;
        row.appendChild(nameEl);
        if (unavailable) {
            const note = document.createElement('small');
            note.className = 'text-muted submission-alt-unavailable-note';
            note.textContent = 'Not in this category';
            row.appendChild(note);
        }
        list.appendChild(row);
    }

    function renderSubmissionAlternativeRows() {
        const list = document.getElementById('detail-alternatives-list');
        if (!list) return;
        list.replaceChildren();
        list.classList.remove('is-empty');
        const alt = submissionAlternativeState;
        if (alt.ready && alt.isPending) {
            for (const id of alt.selected) {
                if (!alt.available.has(id)) appendSubmissionAlternativeRow(list, id, null, true, true);
            }
            const sortedTools = [...alt.tools].sort((a, b) =>
                Number(alt.selected.has(Number(b.id))) - Number(alt.selected.has(Number(a.id))));
            sortedTools.forEach(tool => appendSubmissionAlternativeRow(list, Number(tool.id), tool, false));
        } else {
            const toolsById = new Map(alt.tools.map(tool => [Number(tool.id), tool]));
            for (const id of alt.selected) {
                appendSubmissionAlternativeRow(list, id, toolsById.get(id), true);
            }
        }
        if (!list.childElementCount) {
            list.classList.add('is-empty');
            list.textContent = alt.ready ? 'No foreign tools in this category.' : 'No foreign tools selected.';
        }
    }

    function updateSubmissionAlternativeStatus() {
        const alt = submissionAlternativeState;
        const status = document.getElementById('detail-alternatives-status');
        if (!status || !alt.ready) return;
        const count = alt.selected.size;
        status.classList.toggle('is-missing-selection', alt.isPending && !alt.original.size && !count);
        let text = `${count} foreign tool${count === 1 ? '' : 's'} selected.`;
        if (alt.isPending) text += ' Check or uncheck tools here to correct the selection before approval.';
        if (alt.isPending && !alt.original.size && !alt.selected.size) {
            text += ' No saved selection was returned for this submission. If you chose one earlier, select it again before approval.';
        }
        if ([...alt.selected].some(id => !alt.available.has(id))) {
            text += ' Some saved IDs are no longer in this category; they will be dropped if you change the selection.';
        } else if (alt.droppedUnavailable) {
            text += ' Unavailable saved IDs were removed from the corrected selection.';
        }
        status.textContent = text;
    }

    // Admin detail returns numeric IDs, not CSV. A lookup failure must never
    // discard submitted selections or prevent an unrelated pricing correction.
    async function loadSubmissionReviewAlternatives(category, detailRequest) {
        const requestId = ++submissionAlternativeRequest;
        const alt = submissionAlternativeState;
        alt.category = category;
        alt.ready = false;
        alt.available.clear();
        alt.tools = [];
        const status = document.getElementById('detail-alternatives-status');
        const retry = document.getElementById('detail-alternatives-retry');
        if (!status || !retry) return;
        retry.classList.add('hidden');
        renderSubmissionAlternativeRows();
        status.textContent = category
            ? 'Loading matching foreign tools… Saved selections are shown below.'
            : 'Choose a category to see matching foreign tools.';
        if (!category) return;
        try {
            const res = await fetch(`${API_URL}/products/alternatives/foreign-tools?category=${encodeURIComponent(category)}`);
            if (!res.ok) throw new Error('Could not load matching foreign tools.');
            const tools = await res.json();
            if (!Array.isArray(tools)) throw new Error('Invalid foreign-tool list.');
            if (requestId !== submissionAlternativeRequest || detailRequest !== submissionDetailRequest ||
                submissionDetailModal.classList.contains('hidden')) return;
            const seen = new Set();
            alt.tools = tools.filter(tool => {
                const id = Number(tool && tool.id);
                if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id) ||
                    (tool.category && tool.category !== category)) return false;
                seen.add(id);
                return true;
            });
            alt.available = seen;
            alt.ready = true;
            renderSubmissionAlternativeRows();
            updateSubmissionAlternativeStatus();
            if (!alt.sourceKnown) {
                status.textContent += ' The submission did not return its original selections.';
            }
        } catch (error) {
            if (requestId !== submissionAlternativeRequest || detailRequest !== submissionDetailRequest ||
                submissionDetailModal.classList.contains('hidden')) return;
            renderSubmissionAlternativeRows();
            status.textContent = `${error.message} Saved tool IDs remain visible; retry to edit the selection.`;
            retry.classList.remove('hidden');
        }
    }

    function clearSubmissionReviewErrors() {
        ['detail-review-error', 'detail-alternatives-error'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = ''; el.classList.add('hidden'); }
        });
    }

    function showSubmissionReviewError(message, alternative = false) {
        const el = document.getElementById(alternative ? 'detail-alternatives-error' : 'detail-review-error');
        if (el) {
            el.textContent = message;
            el.classList.remove('hidden');
            el.scrollIntoView({ block: 'nearest' });
        }
    }

    function statusBadgeHTMLPlain(status) {
        if (status === 'approved') return `<span class="badge active">Approved</span>`;
        if (status === 'rejected') return `<span class="badge deactivated">Rejected</span>`;
        return `<span class="badge popular">Pending Review</span>`;
    }

    window.approveFromDetail = async function() {
        if (currentDetailSubmissionId == null || !submissionReviewOriginal ||
            submissionReviewOriginal.id !== String(currentDetailSubmissionId)) return;
        const id = currentDetailSubmissionId;
        const approveBtn = document.getElementById('detail-approve-btn');
        if (approveBtn.disabled) return;
        clearSubmissionReviewErrors();
        const payload = {};
        SUBMISSION_FIELDS.forEach(field => {
            const input = document.getElementById(`detail_${field.key}`);
            if (!input || input.value === submissionReviewOriginal.fields[field.key]) return;
            const key = field.key === 'company_name' ? 'company' : field.key;
            payload[key] = input.value === '' ? null : input.value;
        });
        const description = document.getElementById('detail_description');
        if (description.value !== submissionReviewOriginal.fields.description) {
            payload.description = description.value === '' ? null : description.value;
        }

        const name = document.getElementById('detail_name');
        if (!name.value.trim()) {
            showSubmissionReviewError('Product Name cannot be empty.');
            name.focus();
            return;
        }
        const pricingDetails = document.getElementById('detail_pricing_details');
        if (('pricing_details' in payload || 'pricing' in payload) && !pricingDetails.value.trim()) {
            showSubmissionReviewError('Pricing details are required.');
            pricingDetails.focus();
            return;
        }
        // The detail modal is not a <form>; validate edited URL/email fields explicitly.
        for (const field of SUBMISSION_FIELDS) {
            const key = field.key === 'company_name' ? 'company' : field.key;
            const input = document.getElementById(`detail_${field.key}`);
            if ((field.type === 'email' || field.type === 'url') && key in payload &&
                input.value && !input.checkValidity()) {
                showSubmissionReviewError(`Enter a valid ${field.label.toLowerCase()}.`);
                input.focus();
                return;
            }
        }
        const alt = submissionAlternativeState;
        const category = document.getElementById('detail_category').value;
        const categoryChanged = 'category' in payload;
        const alternativesChanged = alt.selected.size !== alt.original.size ||
            [...alt.selected].some(toolId => !alt.original.has(toolId));
        // Alternative To is required even for an otherwise unchanged review.
        // An empty detail response must never silently publish an unlinked product.
        if (!alt.selected.size) {
            showSubmissionReviewError(alt.ready && alt.category === category
                ? 'Alternative is compulsory, pick one.'
                : 'Wait for matching alternatives to load before approving.', true);
            return;
        }
        if (categoryChanged || alternativesChanged) {
            if (!category || !alt.ready || alt.category !== category) {
                showSubmissionReviewError('Wait for matching alternatives to load before approving changes to the category or selection.', true);
                return;
            }
            if (!alt.selected.size) {
                showSubmissionReviewError('Alternative is compulsory, pick one.', true);
                return;
            }
            if ([...alt.selected].some(toolId => !alt.available.has(toolId))) {
                showSubmissionReviewError('Choose alternatives available in this category before approving.', true);
                return;
            }
            payload.foreign_tool_ids = [...alt.selected];
        }

        const changed = Object.keys(payload).length > 0;
        const question = changed
            ? 'Save these edits and approve? The submission will instantly become a live product.'
            : 'Approve this submission? It will instantly become a live product.';
        if (!confirm(question)) return;

        approveBtn.disabled = true;
        const rejectBtn = document.getElementById('detail-reject-btn');
        if (rejectBtn) rejectBtn.disabled = true;
        try {
            // An unchanged review uses the original body-less approval endpoint.
            const options = changed
                ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
                : { method: 'POST' };
            const res = await fetch(`${API_URL}/submissions/${encodeURIComponent(id)}/approve?admin_key=${encodeURIComponent(adminKey)}`, options);
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(typeof error.detail === 'string' ? error.detail : error.message || 'Approval failed.');
            }
            if (currentDetailSubmissionId === id) closeSubmissionDetail();
            state.selectedSubmissionIds.delete(id);
            await refreshSubmissions();
            await refreshProducts();
            showAlert('success', 'Submission approved and product is now live.');
        } catch (error) {
            if (currentDetailSubmissionId === id) showSubmissionReviewError(error.message);
            else showAlert('error', error.message);
        } finally {
            approveBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
        }
    };

    /* ==========================================================================
       Reject reason modal (single row, detail view, or bulk)
       ========================================================================== */
    function setupRejectReasonModal() {
        const cancelBtn = document.getElementById('reject-reason-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeRejectReasonModal);

        const confirmBtn = document.getElementById('reject-reason-confirm-btn');
        if (confirmBtn) confirmBtn.addEventListener('click', () => window.confirmRejectReason());
    }

    function openRejectReasonModal(ids) {
        rejectContext = { ids };
        const plural = document.getElementById('reject-reason-plural');
        const context = document.getElementById('reject-reason-context');
        const input = document.getElementById('reject-reason-input');
        if (plural) plural.textContent = ids.length > 1 ? 's' : '';
        if (context) {
            context.textContent = ids.length > 1
                ? `You're rejecting ${ids.length} submissions. This reason will be applied to all of them.`
                : `This reason will be shown alongside the submission's status.`;
        }
        if (input) input.value = '';
        rejectReasonModal.classList.remove('hidden');
    }

    function closeRejectReasonModal() {
        rejectReasonModal.classList.add('hidden');
        rejectContext = null;
    }

    window.confirmRejectReason = async function() {
        if (!rejectContext) return;
        const ids = rejectContext.ids;
        const reasonInput = document.getElementById('reject-reason-input');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        const body = reason ? { reason } : {};

        closeRejectReasonModal();

        try {
            const results = await Promise.allSettled(ids.map(id =>
                fetch(`${API_URL}/submissions/${id}/reject?admin_key=${adminKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                })
            ));
            const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok)).length;

            ids.forEach(id => state.selectedSubmissionIds.delete(id));

            if (submissionDetailModal && !submissionDetailModal.classList.contains('hidden') && ids.includes(currentDetailSubmissionId)) {
                submissionDetailModal.classList.add('hidden');
                currentDetailSubmissionId = null;
            }

            await refreshSubmissions();

            if (failed > 0) {
                showAlert('error', `${ids.length - failed} rejected, ${failed} failed.`);
            } else {
                showAlert('success', ids.length > 1 ? `${ids.length} submissions rejected.` : 'Submission rejected.');
            }
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    /* ==========================================================================
       Render: Developers
       ========================================================================== */
    function renderDevelopers() {
        const tbody = document.getElementById('developers-table-body');
        if (!tbody) return;

        const filtered = getFilteredDevelopers();
        const { pageItems, totalPages, safePage } = paginate(filtered, state.developersPage, PAGE_SIZE);
        state.developersPage = safePage;

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-muted">No developers match your search.</td></tr>`;
        } else {
            tbody.innerHTML = '';
            pageItems.forEach(d => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${d.id}</td>
                    <td><strong>${escapeHTML(d.email)}</strong></td>
                    <td>${new Date(d.created_at).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        renderPagination('developers-pagination', filtered.length, state.developersPage, totalPages, (page) => {
            state.developersPage = page;
            renderDevelopers();
        });
    }

    /* ==========================================================================
       Developer update composer — separate from the original Developers table.
       Uses the full cached state.developers; its picker has its own pagination
       and "Select all" spans every page, regardless of table search/filter.
       ========================================================================== */
    function developerUpdateRecipients() {
        const seen = new Set();
        const recipients = [];
        state.developers.forEach(developer => {
            const email = typeof developer?.email === 'string' ? developer.email.trim() : '';
            if (!email) return;
            const key = email.toLowerCase();
            if (seen.has(key)) return; // Never send two copies to the same inbox.
            seen.add(key);
            recipients.push({ key, email });
        });
        return recipients;
    }

    function setupDeveloperUpdate() {
        const list = document.getElementById('developer-update-list');
        const form = document.getElementById('developer-update-form');
        if (!list || !form) return;

        list.addEventListener('change', event => {
            const box = event.target.closest('input[data-developer-email]');
            if (!box || developerUpdateSending) return;
            const key = box.dataset.developerEmail;
            if (!developerUpdateRecipients().some(recipient => recipient.key === key)) return;
            if (box.checked) developerUpdateSelected.add(key);
            else developerUpdateSelected.delete(key);
            syncDeveloperUpdateControls();
        });
        document.getElementById('developer-update-select-all').addEventListener('change', event => {
            if (developerUpdateSending) return;
            if (event.target.checked) {
                developerUpdateRecipients().forEach(recipient => developerUpdateSelected.add(recipient.key));
            } else {
                developerUpdateSelected.clear();
            }
            renderDeveloperUpdatePicker();
        });
        document.getElementById('developer-update-prev').addEventListener('click', () => {
            if (developerUpdateSending) return;
            --developerUpdatePage;
            renderDeveloperUpdatePicker();
        });
        document.getElementById('developer-update-next').addEventListener('click', () => {
            if (developerUpdateSending) return;
            ++developerUpdatePage;
            renderDeveloperUpdatePicker();
        });
        document.getElementById('developer-update-subject').addEventListener('input', syncDeveloperUpdateControls);
        document.getElementById('developer-update-html').addEventListener('input', syncDeveloperUpdateControls);
        form.addEventListener('submit', sendDeveloperUpdate);
        renderDeveloperUpdatePicker();
    }

    function renderDeveloperUpdatePicker() {
        const list = document.getElementById('developer-update-list');
        if (!list) return;
        const recipients = developerUpdateRecipients();
        const available = new Set(recipients.map(recipient => recipient.key));
        for (const key of developerUpdateSelected) {
            if (!available.has(key)) developerUpdateSelected.delete(key);
        }
        const { pageItems, totalPages, safePage } = paginate(recipients, developerUpdatePage, DEVELOPER_UPDATE_PAGE_SIZE);
        developerUpdatePage = safePage;
        list.replaceChildren();
        if (!recipients.length) {
            const empty = document.createElement('p');
            empty.className = 'developer-update-empty text-muted';
            empty.textContent = 'No developer email addresses available.';
            list.appendChild(empty);
        } else {
            pageItems.forEach(recipient => {
                const row = document.createElement('label');
                row.className = 'developer-update-row';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.dataset.developerEmail = recipient.key;
                box.checked = developerUpdateSelected.has(recipient.key);
                box.disabled = developerUpdateSending;
                const email = document.createElement('span');
                email.textContent = recipient.email;
                row.append(box, email);
                list.appendChild(row);
            });
        }
        const pager = document.getElementById('developer-update-pager');
        pager.classList.toggle('hidden', totalPages <= 1);
        document.getElementById('developer-update-page-label').textContent =
            `Page ${safePage} of ${totalPages} · ${recipients.length} developers`;
        document.getElementById('developer-update-prev').disabled = developerUpdateSending || safePage <= 1;
        document.getElementById('developer-update-next').disabled = developerUpdateSending || safePage >= totalPages;
        syncDeveloperUpdateControls();
    }

    function syncDeveloperUpdateControls() {
        const recipients = developerUpdateRecipients();
        const selectedCount = recipients.filter(recipient => developerUpdateSelected.has(recipient.key)).length;
        const all = document.getElementById('developer-update-select-all');
        const send = document.getElementById('developer-update-send');
        if (!all || !send) return;
        all.checked = recipients.length > 0 && selectedCount === recipients.length;
        all.indeterminate = selectedCount > 0 && selectedCount < recipients.length;
        all.disabled = developerUpdateSending || !recipients.length;
        document.getElementById('developer-update-list').querySelectorAll('input[data-developer-email]').forEach(box => {
            box.checked = developerUpdateSelected.has(box.dataset.developerEmail);
            box.disabled = developerUpdateSending;
        });
        document.getElementById('developer-update-count').textContent = `${selectedCount} of ${recipients.length} selected`;
        const subject = document.getElementById('developer-update-subject').value.trim();
        const htmlBody = document.getElementById('developer-update-html').value.trim();
        send.disabled = developerUpdateSending || selectedCount === 0 || !subject || !htmlBody;
        send.textContent = developerUpdateSending ? `Sending to ${selectedCount}...` : 'Send Update';
    }

    function showDeveloperUpdateResult(type, message) {
        const result = document.getElementById('developer-update-result');
        result.textContent = message;
        result.className = `alert ${type}`;
    }

    function renderDeveloperUpdateFailures(failed) {
        const wrap = document.getElementById('developer-update-failed');
        wrap.replaceChildren();
        if (!Array.isArray(failed) || !failed.length) {
            wrap.classList.add('hidden');
            return;
        }
        const heading = document.createElement('strong');
        heading.textContent = `${failed.length} failed send${failed.length === 1 ? '' : 's'}:`;
        const list = document.createElement('ul');
        failed.forEach(item => {
            const row = document.createElement('li');
            row.textContent = typeof item === 'string' ? item : item && typeof item === 'object'
                ? [item.email || item.recipient, item.error || item.reason].filter(Boolean).join(' — ') || JSON.stringify(item)
                : String(item);
            list.appendChild(row);
        });
        wrap.append(heading, list);
        wrap.classList.remove('hidden');
    }

    async function sendDeveloperUpdate(event) {
        event.preventDefault();
        if (developerUpdateSending) return;
        const form = document.getElementById('developer-update-form');
        const subjectEl = document.getElementById('developer-update-subject');
        const htmlEl = document.getElementById('developer-update-html');
        const subject = subjectEl.value.trim();
        const htmlBody = htmlEl.value; // Send the raw pasted HTML/CSS unmodified.
        const recipientEmails = developerUpdateRecipients()
            .filter(recipient => developerUpdateSelected.has(recipient.key))
            .map(recipient => recipient.email);
        if (!recipientEmails.length || !subject || !htmlBody.trim()) {
            showDeveloperUpdateResult('error', 'Select at least one developer and enter a subject and HTML content.');
            syncDeveloperUpdateControls();
            return;
        }
        const count = recipientEmails.length;
        if (!window.confirm(`You are about to send this to ${count} developer${count === 1 ? '' : 's'}. Continue?`)) return;

        developerUpdateSending = true;
        subjectEl.disabled = true;
        htmlEl.disabled = true;
        document.getElementById('developer-update-result').className = 'alert hidden';
        renderDeveloperUpdateFailures(null);
        renderDeveloperUpdatePicker();
        try {
            const response = await fetch(`${API_URL}/products/admin/developers/send-update?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, html_body: htmlBody, recipient_emails: recipientEmails })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(typeof data.detail === 'string' ? data.detail
                    : data.message || `Could not send developer update (status ${response.status}).`);
            }
            const failed = Array.isArray(data.failed) ? data.failed : [];
            const sent = Number.isSafeInteger(Number(data.sent)) ? Number(data.sent) : Math.max(0, count - failed.length);
            developerUpdateSelected.clear();
            developerUpdatePage = 1;
            form.reset();
            renderDeveloperUpdatePicker();
            showDeveloperUpdateResult(failed.length ? 'error' : 'success',
                `${data.message || `Sent to ${sent} developers.`}${failed.length ? ` ${failed.length} failed.` : ''}`);
            renderDeveloperUpdateFailures(failed);
        } catch (error) {
            showDeveloperUpdateResult('error', error.message);
        } finally {
            developerUpdateSending = false;
            subjectEl.disabled = false;
            htmlEl.disabled = false;
            renderDeveloperUpdatePicker();
        }
    }

    /* ==========================================================================
       Utilities
       ========================================================================== */
    function showAlert(type, msg) {
        if (!globalAlert) return;
        globalAlert.textContent = msg;
        globalAlert.className = `alert ${type}`;
        globalAlert.classList.remove('hidden');
        setTimeout(() => globalAlert.classList.add('hidden'), 4000);
    }

    function hideAlert() {
        if (globalAlert) globalAlert.classList.add('hidden');
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));
    }

    window.onclick = function(event) {
        if (!event.target.matches('.dot-btn')) {
            document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
        }
    }

    /* ==========================================================================
       Persistent Notification Tray Logic (Unified Desktop & Mobile)

       There are two copies of the bell widget in the DOM — one inside
       .admin-top-header (shown on mobile) and one inside the sidebar
       (shown on desktop). CSS decides which one is visible; this code
       treats every ".admin-notifications-wrapper" it finds as an instance
       of the same widget, all reading/writing one shared `notifications`
       array so they never fall out of sync.
       ========================================================================== */
    function initNotifications() {
        const wrappers = document.querySelectorAll('.admin-notifications-wrapper');
        if (!wrappers.length) return;

        let notifications = JSON.parse(localStorage.getItem("enovox_admin_notifications")) || [];

        function saveAndRenderNotifications() {
            localStorage.setItem("enovox_admin_notifications", JSON.stringify(notifications));
            renderNotifications();
        }

        function renderNotifications() {
            wrappers.forEach(wrapper => {
                const list = wrapper.querySelector('.notification-list');
                const badge = wrapper.querySelector('.notification-badge');
                if (!list) return;

                list.innerHTML = '';

                if (notifications.length === 0) {
                    list.innerHTML = `<p class="notif-empty">No new notifications</p>`;
                    if (badge) badge.style.display = 'none';
                    return;
                }

                if (badge) {
                    badge.style.display = 'inline-block';
                    badge.textContent = notifications.length;
                }

                notifications.forEach((notif, index) => {
                    const item = document.createElement('div');
                    item.className = 'notif-item';
                    item.innerHTML = `
                        <div class="notif-item-content">
                            <strong>${escapeHTML(notif.title)}</strong>
                            <p>${escapeHTML(notif.message)}</p>
                            <small>${escapeHTML(notif.time)}</small>
                        </div>
                        <button class="notif-delete-btn" data-index="${index}" title="Delete">×</button>
                    `;
                    list.appendChild(item);
                });
            });
        }

        wrappers.forEach(wrapper => {
            wrapper.addEventListener('click', (e) => {
                const bellBtn = e.target.closest('.notification-bell-btn');
                if (bellBtn) {
                    e.stopPropagation();
                    const dropdown = wrapper.querySelector('.notification-dropdown');
                    const wasHidden = dropdown.classList.contains('hidden');
                    document.querySelectorAll('.notification-dropdown').forEach(d => d.classList.add('hidden'));
                    if (wasHidden) dropdown.classList.remove('hidden');
                    return;
                }

                const clearBtn = e.target.closest('.clear-all-notifications');
                if (clearBtn) {
                    notifications = [];
                    saveAndRenderNotifications();
                    return;
                }

                const delBtn = e.target.closest('.notif-delete-btn');
                if (delBtn) {
                    const idx = parseInt(delBtn.getAttribute('data-index'), 10);
                    notifications.splice(idx, 1);
                    saveAndRenderNotifications();
                }
            });
        });

        document.addEventListener('click', (e) => {
            wrappers.forEach(wrapper => {
                if (!wrapper.contains(e.target)) {
                    const dropdown = wrapper.querySelector('.notification-dropdown');
                    if (dropdown) dropdown.classList.add('hidden');
                }
            });
        });

        window.addAdminNotification = function(title, message) {
            const newNotif = {
                title: title,
                message: message,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            notifications.unshift(newNotif);
            saveAndRenderNotifications();
        };

        renderNotifications();

        async function pollNewSubmissions() {
            try {
                const currentKey = localStorage.getItem("enovox_admin_key");
                if (!currentKey) return;

                const response = await fetch(`/submissions/admin/all?admin_key=${currentKey}`);
                if (response.ok) {
                    const subs = await response.json();
                    const pendingCount = subs.filter(s => (s.status || 'pending') === 'pending').length;
                    const lastCount = parseInt(localStorage.getItem("enovox_last_sub_count") || pendingCount, 10);

                    if (pendingCount > lastCount) {
                        const diff = pendingCount - lastCount;
                        window.addAdminNotification("New Submission!", `${diff} new product submission(s) waiting for review.`);
                    }
                    localStorage.setItem("enovox_last_sub_count", pendingCount);
                }
            } catch (err) {
                console.error("Polling error:", err);
            }
        }

        setInterval(pollNewSubmissions, 60000);
    }


    /* ==========================================================================
       NEWSLETTER SENDING — two modes (Product Update / Custom HTML)
       Confirmed endpoints:
         POST /products/admin/newsletter/send-product-update?admin_key=...
              body { title, intro, product_ids: [..] }
         POST /products/admin/newsletter/send-custom?admin_key=...
              body { subject, html_body }
       Both respond { message, sent, failed: [...] }.
       The product picker reuses state.products (already cached by
       fetchProductsData) — no extra fetches are made here.
       ========================================================================== */
    const nlSelectedProductIds = new Set();
    let nlPickerFilter = '';

    function setupNewsletter() {
        const productModeBtn = document.getElementById('nl-mode-product-btn');
        const customModeBtn = document.getElementById('nl-mode-custom-btn');
        const productPanel = document.getElementById('nl-product-panel');
        const customPanel = document.getElementById('nl-custom-panel');
        if (productModeBtn && customModeBtn && productPanel && customPanel) {
            productModeBtn.addEventListener('click', () => {
                productModeBtn.classList.add('active');
                customModeBtn.classList.remove('active');
                productPanel.classList.remove('hidden');
                customPanel.classList.add('hidden');
            });
            customModeBtn.addEventListener('click', () => {
                customModeBtn.classList.add('active');
                productModeBtn.classList.remove('active');
                customPanel.classList.remove('hidden');
                productPanel.classList.add('hidden');
            });
        }

        const pickerSearch = document.getElementById('nl-product-search');
        if (pickerSearch) pickerSearch.addEventListener('input', () => {
            nlPickerFilter = pickerSearch.value;
            renderNewsletterPicker();
        });

        // One delegated change listener on the picker wrapper survives re-renders.
        const picker = document.getElementById('nl-product-picker');
        if (picker) picker.addEventListener('change', (e) => {
            const box = e.target && e.target.closest ? e.target.closest('input[data-nl-product-id]') : null;
            if (!box) return;
            const id = parseInt(box.getAttribute('data-nl-product-id'), 10);
            if (box.checked) nlSelectedProductIds.add(id);
            else nlSelectedProductIds.delete(id);
            updateNewsletterPickerHint();
        });

        // --- Subscribers reference view wiring ---
        const subsToggle = document.getElementById('nl-subs-toggle-btn');
        if (subsToggle) subsToggle.addEventListener('click', () => {
            const body = document.getElementById('nl-subs-body');
            if (!body) return;
            const nowHidden = body.classList.toggle('hidden');
            subsToggle.textContent = nowHidden ? 'Show list ▾' : 'Hide list ▴';
        });
        const subsRefresh = document.getElementById('nl-subs-refresh-btn');
        if (subsRefresh) subsRefresh.addEventListener('click', () => fetchNewsletterSubscribers());
        const subsPrev = document.getElementById('nl-subs-prev-btn');
        if (subsPrev) subsPrev.addEventListener('click', () => {
            if (subscribersPage > 1) { subscribersPage--; renderSubscribersView(); }
        });
        const subsNext = document.getElementById('nl-subs-next-btn');
        if (subsNext) subsNext.addEventListener('click', () => {
            subscribersPage++;
            renderSubscribersView();
        });

        const sendProductBtn = document.getElementById('nl-send-product-btn');
        if (sendProductBtn) sendProductBtn.addEventListener('click', sendProductUpdateNewsletter);
        const sendCustomBtn = document.getElementById('nl-send-custom-btn');
        if (sendCustomBtn) sendCustomBtn.addEventListener('click', sendCustomNewsletter);
    }

    function renderNewsletterPicker() {
        const wrap = document.getElementById('nl-product-picker');
        if (!wrap) return;
        const q = (nlPickerFilter || '').trim().toLowerCase();
        const items = state.products.filter(p => !q || String(p.name || '').toLowerCase().includes(q));

        if (items.length === 0) {
            wrap.innerHTML = '<p class="text-muted" style="padding:0.75rem;">No products match your filter.</p>';
            updateNewsletterPickerHint();
            return;
        }

        wrap.innerHTML = '';
        items.forEach(p => {
            const row = document.createElement('label');
            row.className = 'nl-product-row';
            const statusBadge = p.status
                ? '<span class="badge active">Active</span>'
                : '<span class="badge deactivated">Deactivated</span>';
            row.innerHTML = `
                <input type="checkbox" data-nl-product-id="${p.id}" ${nlSelectedProductIds.has(p.id) ? 'checked' : ''}>
                <span class="nl-product-name">${escapeHTML(p.name)}</span>
                ${statusBadge}
            `;
            wrap.appendChild(row);
        });
        updateNewsletterPickerHint();
    }

    function updateNewsletterPickerHint() {
        const hint = document.getElementById('nl-picker-hint');
        if (hint) hint.textContent = `${nlSelectedProductIds.size} product(s) selected`;
    }

    function showNewsletterAlert(type, message) {
        const el = document.getElementById('newsletter-alert');
        if (!el) return;
        el.textContent = message;
        el.className = `alert ${type}`;
    }

    function hideNewsletterAlert() {
        const el = document.getElementById('newsletter-alert');
        if (el) { el.textContent = ''; el.className = 'alert hidden'; }
        renderNewsletterFailed(null);
    }

    function renderNewsletterFailed(failed) {
        const el = document.getElementById('newsletter-failed');
        if (!el) return;
        if (!failed || !failed.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        el.classList.remove('hidden');
        el.innerHTML = `<span class="failed-title">Could not reach ${failed.length} recipient(s):</span> ` +
            failed.map(f => escapeHTML(String(f))).join(', ');
    }

    function setNewsletterSending(btn, sending, originalText) {
        btn.disabled = sending;
        btn.textContent = sending ? 'Sending...' : originalText;
    }

    async function sendProductUpdateNewsletter() {
        const btn = document.getElementById('nl-send-product-btn');
        if (!btn) return;
        hideNewsletterAlert();
        const title = (document.getElementById('nl-title').value || '').trim();
        const intro = (document.getElementById('nl-intro').value || '').trim();
        // Validation errors never touch the form, so nothing typed is lost.
        if (!title) { showNewsletterAlert('error', 'Please enter a title for the product update.'); return; }
        if (nlSelectedProductIds.size === 0) { showNewsletterAlert('error', 'Select at least one product to include in the newsletter.'); return; }
        if (!window.confirm('Send this product update to all opted-in subscribers?\n\nThis reaches real inboxes and cannot be undone.')) return;

        const originalText = btn.textContent;
        setNewsletterSending(btn, true, originalText);
        try {
            const res = await fetch(`${API_URL}/products/admin/newsletter/send-product-update?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, intro, product_ids: Array.from(nlSelectedProductIds) })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || `Send failed (status ${res.status}).`);
            showNewsletterAlert('success', data.message || `Newsletter sent to ${data.sent || 0} recipients.`);
            renderNewsletterFailed(data.failed);
        } catch (error) {
            showNewsletterAlert('error', error.message);
        } finally {
            setNewsletterSending(btn, false, originalText);
        }
    }

    async function sendCustomNewsletter() {
        const btn = document.getElementById('nl-send-custom-btn');
        if (!btn) return;
        hideNewsletterAlert();
        const subject = (document.getElementById('nl-subject').value || '').trim();
        const htmlBody = (document.getElementById('nl-html-body').value || '').trim();
        if (!subject) { showNewsletterAlert('error', 'Please enter a subject line.'); return; }
        if (!htmlBody) { showNewsletterAlert('error', 'Please enter the email content (HTML).'); return; }
        if (!window.confirm('Send this custom newsletter to all opted-in subscribers?\n\nThis reaches real inboxes and cannot be undone.')) return;

        const originalText = btn.textContent;
        setNewsletterSending(btn, true, originalText);
        try {
            const res = await fetch(`${API_URL}/products/admin/newsletter/send-custom?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, html_body: htmlBody })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || `Send failed (status ${res.status}).`);
            showNewsletterAlert('success', data.message || `Newsletter sent to ${data.sent || 0} recipients.`);
            renderNewsletterFailed(data.failed);
        } catch (error) {
            showNewsletterAlert('error', error.message);
        } finally {
            setNewsletterSending(btn, false, originalText);
        }
    }

    /* ==========================================================================
       CLAIMS REVIEW — pending product-ownership claims
       Confirmed endpoints:
         GET  /products/admin/claims?admin_key=...
         POST /products/admin/claims/{id}/approve?admin_key=...
         POST /products/admin/claims/{id}/reject?admin_key=...  body { reason }
       Product name/logo are cross-referenced from the cached state.products
       (same list that powers the Products tab) — no extra fetch.
       ========================================================================== */
    let claimsCache = [];

    function setupClaims() {
        const refreshBtn = document.getElementById('claims-refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => fetchClaims());

        const list = document.getElementById('claims-list');
        if (list) list.addEventListener('click', onClaimsListClick);
    }

    async function fetchClaims() {
        const loadingEl = document.getElementById('claims-loading');
        const errorEl = document.getElementById('claims-error');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        try {
            const res = await fetch(`${API_URL}/products/admin/claims?admin_key=${encodeURIComponent(adminKey)}`);
            if (!res.ok) throw new Error('Could not load pending claims.');
            const claims = await res.json();
            claimsCache = Array.isArray(claims) ? claims : [];
            renderClaims();
        } catch (error) {
            claimsCache = [];
            renderClaims();
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    function findClaimProduct(claim) {
        return state.products.find(p => p.id === claim.product_id) || null;
    }

    function formatClaimDate(raw) {
        if (!raw) return '';
        const d = new Date(raw);
        return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString();
    }

    function renderClaims() {
        const list = document.getElementById('claims-list');
        const emptyEl = document.getElementById('claims-empty');
        if (!list || !emptyEl) return;
        list.innerHTML = '';
        if (claimsCache.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl.classList.add('hidden');
        claimsCache.forEach(claim => list.appendChild(buildClaimCard(claim)));
    }

    function buildClaimCard(claim) {
        const card = document.createElement('div');
        card.className = 'claim-card';
        card.setAttribute('data-claim-id', claim.id);

        const product = findClaimProduct(claim);
        const productName = product ? product.name : `Product #${claim.product_id}`;
        const logoHtml = product && product.logo_url
            ? `<img src="${escapeHTML(product.logo_url)}" alt="" class="claim-product-logo" onerror="this.style.display='none'">`
            : '';
        const socialHtml = claim.social_url
            ? `<a href="${escapeHTML(claim.social_url)}" target="_blank" rel="noopener">${escapeHTML(claim.social_url)}</a>`
            : '<span class="text-muted">—</span>';

        card.innerHTML = `
            <div class="claim-card-head">
                <div class="claim-product">${logoHtml}<strong>${escapeHTML(productName)}</strong><span class="badge new">Pending</span></div>
                <span class="text-muted claim-date">Submitted ${escapeHTML(formatClaimDate(claim.created_at))}</span>
            </div>
            <div class="claim-card-body">
                <div><span class="claim-label">Claimant</span>${escapeHTML(claim.name || '—')}</div>
                <div><span class="claim-label">Email</span>${escapeHTML(claim.email || '—')}</div>
                <div><span class="claim-label">Role</span>${escapeHTML(claim.role || '—')}</div>
                <div><span class="claim-label">Social / LinkedIn</span>${socialHtml}</div>
            </div>
            <div class="claim-card-actions">
                <button type="button" class="btn-success" data-claim-action="approve" data-claim-id="${claim.id}">Approve</button>
                <button type="button" class="btn-danger" data-claim-action="reject" data-claim-id="${claim.id}">Reject</button>
            </div>
            <div class="claim-reject-row hidden">
                <input type="text" class="claim-reject-input" placeholder="Reason for rejection (required)">
                <button type="button" class="btn-danger btn-small" data-claim-action="reject-confirm" data-claim-id="${claim.id}">Confirm Reject</button>
                <button type="button" class="btn-secondary btn-small" data-claim-action="reject-cancel" data-claim-id="${claim.id}">Cancel</button>
                <div class="error-text hidden claim-reject-error">A reason is required to reject a claim.</div>
            </div>
        `;
        return card;
    }

    function onClaimsListClick(e) {
        const btn = e.target && e.target.closest ? e.target.closest('button[data-claim-action]') : null;
        if (!btn) return;
        const claimId = parseInt(btn.getAttribute('data-claim-id'), 10);
        const card = btn.closest('.claim-card');
        const action = btn.getAttribute('data-claim-action');

        if (action === 'approve') { approveClaim(claimId, card); return; }
        if (action === 'reject') {
            const row = card ? card.querySelector('.claim-reject-row') : null;
            if (row) row.classList.remove('hidden');
            return;
        }
        if (action === 'reject-cancel') {
            const row = card ? card.querySelector('.claim-reject-row') : null;
            if (row) {
                row.classList.add('hidden');
                const input = row.querySelector('.claim-reject-input');
                const err = row.querySelector('.claim-reject-error');
                if (input) input.value = '';
                if (err) err.classList.add('hidden');
            }
            return;
        }
        if (action === 'reject-confirm') { rejectClaim(claimId, card); return; }
    }

    function setClaimCardBusy(card, busy) {
        if (!card || !card.querySelectorAll) return;
        card.querySelectorAll('button').forEach(b => { b.disabled = busy; });
    }

    async function approveClaim(claimId, card) {
        const claim = claimsCache.find(c => c.id === claimId);
        if (!claim) return;
        const product = findClaimProduct(claim);
        const productName = product ? product.name : `Product #${claim.product_id}`;
        if (!window.confirm(`Approve this claim?\n\nThis will transfer ownership of "${productName}" to ${claim.name || claim.email}.`)) return;

        setClaimCardBusy(card, true);
        try {
            const res = await fetch(`${API_URL}/products/admin/claims/${claimId}/approve?admin_key=${encodeURIComponent(adminKey)}`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || 'Could not approve this claim.');
            claimsCache = claimsCache.filter(c => c.id !== claimId);
            renderClaims();
            showAlert('success', data.message || 'Claim approved.');
        } catch (error) {
            showAlert('error', error.message);
            setClaimCardBusy(card, false);
        }
    }

    async function rejectClaim(claimId, card) {
        const row = card ? card.querySelector('.claim-reject-row') : null;
        const input = row ? row.querySelector('.claim-reject-input') : null;
        const errEl = row ? row.querySelector('.claim-reject-error') : null;
        const reason = input ? input.value.trim() : '';
        if (!reason) {
            if (errEl) errEl.classList.remove('hidden');
            if (input) input.focus();
            return;
        }
        if (errEl) errEl.classList.add('hidden');

        setClaimCardBusy(card, true);
        try {
            const res = await fetch(`${API_URL}/products/admin/claims/${claimId}/reject?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || 'Could not reject this claim.');
            claimsCache = claimsCache.filter(c => c.id !== claimId);
            renderClaims();
            showAlert('success', data.message || 'Claim rejected.');
        } catch (error) {
            showAlert('error', error.message);
            setClaimCardBusy(card, false);
        }
    }

    /* ==========================================================================
       NEWSLETTER SUBSCRIBERS VIEW (reference/visibility only)
       Confirmed endpoint:
         GET /products/admin/newsletter/subscribers?admin_key=...
         -> { total, developers:[{email,source}], users:[...],
              standalone_subscribers:[{email, subscribed_at, source}] }
       Fetched once when the Newsletter tab is first opened (plus Refresh).
       Merged list paginates 10 per page with Prev/Next.
       ========================================================================== */
    let subscribersCache = null; // null = not fetched yet
    let subscribersPage = 1;
    const SUBS_PAGE_SIZE = 10;

    async function fetchNewsletterSubscribers() {
        const errorEl = document.getElementById('nl-subs-error');
        const summaryEl = document.getElementById('nl-subs-summary');
        if (errorEl) errorEl.classList.add('hidden');
        if (summaryEl && subscribersCache === null) summaryEl.textContent = 'Loading subscribers…';
        try {
            const res = await fetch(`${API_URL}/products/admin/newsletter/subscribers?admin_key=${encodeURIComponent(adminKey)}`);
            if (!res.ok) throw new Error('Could not load the subscriber list.');
            subscribersCache = await res.json();
            subscribersPage = 1;
            renderSubscribersView();
        } catch (error) {
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
            if (summaryEl) summaryEl.textContent = 'Subscribers unavailable';
        }
    }

    function buildMergedSubscribers() {
        if (!subscribersCache) return [];
        const merged = [];
        (subscribersCache.developers || []).forEach(e => merged.push({ email: e.email, source: 'Developer', date: null }));
        (subscribersCache.users || []).forEach(e => merged.push({ email: e.email, source: 'User', date: null }));
        (subscribersCache.standalone_subscribers || []).forEach(e => merged.push({ email: e.email, source: 'Standalone', date: e.subscribed_at || null }));
        return merged;
    }

    function renderSubscribersView() {
        const summaryEl = document.getElementById('nl-subs-summary');
        const breakdownEl = document.getElementById('nl-subs-breakdown');
        const listEl = document.getElementById('nl-subs-list');
        const pageLabel = document.getElementById('nl-subs-page-label');
        const prevBtn = document.getElementById('nl-subs-prev-btn');
        const nextBtn = document.getElementById('nl-subs-next-btn');
        if (!summaryEl || !listEl || !subscribersCache) return;

        const dev = (subscribersCache.developers || []).length;
        const usr = (subscribersCache.users || []).length;
        const stand = (subscribersCache.standalone_subscribers || []).length;
        const total = typeof subscribersCache.total === 'number' ? subscribersCache.total : dev + usr + stand;

        summaryEl.textContent = `${total} total subscriber${total === 1 ? '' : 's'}`;
        if (breakdownEl) breakdownEl.textContent = `${dev} Developers · ${usr} Users · ${stand} Standalone`;

        const merged = buildMergedSubscribers();
        const totalPages = Math.max(1, Math.ceil(merged.length / SUBS_PAGE_SIZE));
        if (subscribersPage < 1) subscribersPage = 1;
        if (subscribersPage > totalPages) subscribersPage = totalPages;
        const slice = merged.slice((subscribersPage - 1) * SUBS_PAGE_SIZE, subscribersPage * SUBS_PAGE_SIZE);

        if (merged.length === 0) {
            listEl.innerHTML = '<p class="text-muted" style="padding:0.75rem;">No subscribers yet.</p>';
        } else {
            listEl.innerHTML = slice.map(entry => {
                const badgeClass = entry.source === 'Developer' ? 'developer'
                    : entry.source === 'User' ? 'user' : 'standalone';
                const dateHtml = entry.date
                    ? `<span class="nl-subs-date">${escapeHTML(formatClaimDate(entry.date))}</span>`
                    : '';
                return `<div class="nl-subs-row"><span class="nl-subs-email">${escapeHTML(entry.email || '')}</span>${dateHtml}<span class="badge ${badgeClass}">${entry.source}</span></div>`;
            }).join('');
        }

        if (pageLabel) pageLabel.textContent = `Page ${subscribersPage} of ${totalPages}`;
        if (prevBtn) prevBtn.disabled = subscribersPage <= 1;
        if (nextBtn) nextBtn.disabled = subscribersPage >= totalPages;
    }

    /* ==========================================================================
       SEARCH ANALYTICS — dedicated tab (room to grow: append cards to
       .analytics-grid). Confirmed endpoint:
         GET /products/admin/search-analytics?admin_key=...
         -> { total_searches, top_searches:[{query,count}],
              zero_result_searches:[{query,count}] }
       Fetched each time the Analytics tab is selected, plus Refresh.
       ========================================================================== */
    // Build marker: check from devtools/view-source to confirm which admin.js is live.
    console.info('[enovox admin] build 2026-09-20 analytics-v3');

    function setupAnalytics() {
        ensureAnalyticsSection();
        const refreshBtn = document.getElementById('analytics-refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => fetchSearchAnalytics());
    }

    /* ==========================================================================
       Self-healing analytics view: if the host admin.html does not contain
       the analytics section (hand-maintained copies, mixed deployments),
       build it — markup identical to the shipped templates/admin.html — so
       the tab can never render blank. Uses querySelector (not getElementById)
       for the existence probe. No-ops when the section already exists.
       ========================================================================== */
    function ensureAnalyticsSection() {
        if (document.querySelector('#analytics-tab')) return;

        const section = document.createElement('section');
        section.id = 'analytics-tab';
        section.className = 'tab-content hidden';
        section.innerHTML = `
            <div class="section-header">
                <h2>Analytics</h2>
                <div class="section-header-actions">
                    <button id="analytics-refresh-btn" class="btn-secondary">Refresh</button>
                </div>
            </div>
            <div id="analytics-loading" class="text-muted" style="margin-bottom: 1rem;">Loading search analytics…</div>
            <div id="analytics-error" class="alert error hidden"></div>

            <div class="analytics-grid">
                <div class="analytics-card analytics-card--total">
                    <div id="analytics-total" class="analytics-total">–</div>
                    <div class="analytics-total-label">Total Searches</div>
                    <p id="analytics-empty" class="text-muted analytics-empty hidden">No searches logged yet.</p>
                </div>

                <div class="analytics-card">
                    <h3 class="analytics-card-title">Top Searches</h3>
                    <ol id="analytics-top-list" class="analytics-list"></ol>
                </div>

                <div class="analytics-card analytics-card--warning">
                    <h3 class="analytics-card-title">⚠ Zero-Result Searches</h3>
                    <ol id="analytics-zero-list" class="analytics-list analytics-list--warning"></ol>
                    <p class="analytics-card-hint text-muted">Queries that returned nothing — catalog gaps worth acting on.</p>
                </div>
            </div>`;
        const host = document.querySelector('main') || document.body;
        host.appendChild(section);

        // Nav entry too, if the host page lacks it.
        if (!document.querySelector('.nav-tab[data-target="analytics-tab"]')) {
            const anchor = document.querySelector('.nav-tab[data-target="newsletter-tab"]') || document.querySelector('.nav-tab');
            const btn = document.createElement('button');
            btn.className = 'nav-tab';
            btn.setAttribute('data-target', 'analytics-tab');
            btn.textContent = 'Analytics';
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        }
    }

    async function fetchSearchAnalytics() {
        const loadingEl = document.getElementById('analytics-loading');
        const errorEl = document.getElementById('analytics-error');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        try {
            const res = await fetch(`${API_URL}/products/admin/search-analytics?admin_key=${encodeURIComponent(adminKey)}`);
            if (!res.ok) throw new Error('Could not load search analytics.');
            const data = await res.json();
            renderAnalytics(data || {});
        } catch (error) {
            renderAnalytics(null);
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    function buildAnalyticsList(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return '<li class="analytics-empty-row">No searches logged yet.</li>';
        }
        return items.map((row, i) => {
            const count = row && typeof row.count === 'number' ? row.count : 0;
            return `<li class="analytics-row">` +
                `<span class="analytics-rank">${i + 1}</span>` +
                `<span class="analytics-query">${escapeHTML(row.query || '')}</span>` +
                `<span class="analytics-count">${count} search${count === 1 ? '' : 'es'}</span>` +
                `</li>`;
        }).join('');
    }

    function renderAnalytics(data) {
        const totalEl = document.getElementById('analytics-total');
        const emptyEl = document.getElementById('analytics-empty');
        const topEl = document.getElementById('analytics-top-list');
        const zeroEl = document.getElementById('analytics-zero-list');
        if (!totalEl || !topEl || !zeroEl) return;

        if (!data) {
            totalEl.textContent = '–';
            if (emptyEl) emptyEl.classList.add('hidden');
            topEl.innerHTML = '';
            zeroEl.innerHTML = '';
            return;
        }

        const total = typeof data.total_searches === 'number' ? data.total_searches : 0;
        totalEl.textContent = total.toLocaleString();
        if (emptyEl) emptyEl.classList.toggle('hidden', total !== 0);
        topEl.innerHTML = buildAnalyticsList(data.top_searches);
        zeroEl.innerHTML = buildAnalyticsList(data.zero_result_searches);
    }

            /* ==========================================================================
       SITE BANNER — admin control  (COMPLETE BLOCK, replaces all earlier banner JS)
       GET /products/banner
         -> { is_active, message, link_url, link_text, link_style, is_marquee, updated_at }
       PUT /products/admin/banner?admin_key=...
         body: { message, link_url, link_text, link_style, is_active, is_marquee }
         -> { message: "Banner updated.", banner: {...} }
       link_style is "button" (default) or "text" (underlined text).
       The live preview mirrors the public banner and updates as you type.
       ========================================================================== */
    function setupBanner() {
        const form = document.getElementById('banner-form');
        if (!form) return;

        ['banner-message', 'banner-link-text', 'banner-link-url', 'banner-marquee', 'banner-active'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
                clearBannerLinkError();
                renderBannerPreview();
            });
        });

        document.querySelectorAll('input[name="banner-link-style"]').forEach(r => {
            r.addEventListener('change', renderBannerPreview);
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveBanner();
        });

        const reloadBtn = document.getElementById('banner-reload-btn');
        if (reloadBtn) reloadBtn.addEventListener('click', () => loadBannerAdmin());
    }

    function bannerEl(id) { return document.getElementById(id); }

    function showBannerAlert(type, message) {
        const el = bannerEl('banner-alert');
        if (!el) return;
        el.textContent = message;
        el.className = `alert ${type}`;
    }

    function hideBannerAlert() {
        const el = bannerEl('banner-alert');
        if (el) { el.textContent = ''; el.className = 'alert hidden'; }
    }

    function clearBannerLinkError() {
        clearFieldError('banner-link-error');
    }

    // Reads the current form state (trimmed strings, real booleans)
    function readBannerForm() {
        const styleEl = document.querySelector('input[name="banner-link-style"]:checked');
        return {
            message: (bannerEl('banner-message').value || '').trim(),
            link_text: (bannerEl('banner-link-text').value || '').trim(),
            link_url: (bannerEl('banner-link-url').value || '').trim(),
            link_style: styleEl ? styleEl.value : 'button',
            is_marquee: !!bannerEl('banner-marquee').checked,
            is_active: !!bannerEl('banner-active').checked
        };
    }

    async function loadBannerAdmin() {
        const loadingEl = bannerEl('banner-loading');
        if (!bannerEl('banner-form')) return;
        if (loadingEl) loadingEl.classList.remove('hidden');
        hideBannerAlert();
        clearBannerLinkError();

        try {
            const res = await fetch(`${API_URL}/products/banner`);
            if (!res.ok) throw new Error('Could not load the current banner.');
            const data = await res.json();
            fillBannerForm(data || {});
        } catch (error) {
            showBannerAlert('error', error.message);
            renderBannerPreview();
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    // Always fills the form from whatever the server returns. Missing fields
    // fall back to empty values and the default "button" style.
    function fillBannerForm(data) {
        bannerEl('banner-message').value = data.message || '';
        bannerEl('banner-link-text').value = data.link_text || '';
        bannerEl('banner-link-url').value = data.link_url || '';
        bannerEl('banner-marquee').checked = !!data.is_marquee;
        bannerEl('banner-active').checked = !!data.is_active;

        const savedStyle = data.link_style === 'text' ? 'text' : 'button';
        const styleRadio = document.querySelector(`input[name="banner-link-style"][value="${savedStyle}"]`);
        if (styleRadio) styleRadio.checked = true;

        renderBannerPreview();
    }

    function renderBannerPreview() {
        const preview = bannerEl('banner-preview');
        const textEl = bannerEl('banner-preview-text');
        const linkEl = bannerEl('banner-preview-link');
        const trackEl = bannerEl('banner-preview-track');
        const statusEl = bannerEl('banner-preview-status');
        if (!preview || !textEl || !linkEl || !trackEl) return;

        const f = readBannerForm();

        textEl.textContent = f.message || 'Your announcement will appear here…';

        if (f.link_text && f.link_url) {
            linkEl.textContent = f.link_text;
            linkEl.classList.toggle('is-text', f.link_style === 'text');
            linkEl.classList.remove('hidden');
        } else {
            linkEl.classList.add('hidden');
        }

        preview.classList.toggle('is-marquee', f.is_marquee);
        preview.classList.toggle('is-inactive', !f.is_active);

        if (f.is_marquee) {
            // Same constant-speed rule as the public banner (~60px/sec, min 12s)
            const distance = trackEl.scrollWidth + preview.offsetWidth;
            const seconds = Math.max(12, Math.round(distance / 60));
            trackEl.style.setProperty('--marquee-duration', seconds + 's');
        }

        if (statusEl) {
            statusEl.textContent = f.is_active
                ? 'Visitors will see this banner once saved.'
                : 'Hidden from visitors (dimmed). Your content is kept when you save.';
        }
    }

    function isValidBannerLink(url) {
        return /^(https?:\/\/|\/)/i.test(url);
    }

    async function saveBanner() {
        const btn = bannerEl('banner-save-btn');
        if (!btn) return;
        hideBannerAlert();
        clearBannerLinkError();

        const f = readBannerForm();

        // Going live needs a message; a hidden banner may be saved with any content.
        if (f.is_active && !f.message) {
            showBannerAlert('error', 'Please enter a message before showing the banner on the site.');
            bannerEl('banner-message').focus();
            return;
        }

        // The public site only renders a link when BOTH parts exist, so flag half-filled pairs.
        if ((f.link_url && !f.link_text) || (!f.link_url && f.link_text)) {
            showFieldError('banner-link-error', 'Fill in both Link Text and Link URL, or leave both empty.');
            return;
        }
        if (f.link_url && !isValidBannerLink(f.link_url)) {
            showFieldError('banner-link-error', 'Link URL must start with https://, http:// or / (for pages on this site).');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const res = await fetch(`${API_URL}/products/admin/banner?admin_key=${encodeURIComponent(adminKey)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: f.message,
                    link_url: f.link_url,
                    link_text: f.link_text,
                    link_style: f.link_style,
                    is_active: f.is_active,
                    is_marquee: f.is_marquee
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                let detail = data.detail || data.message || '';
                if (Array.isArray(detail) && detail[0] && detail[0].msg) detail = detail[0].msg;
                throw new Error(detail || `Could not save the banner (status ${res.status}).`);
            }

            showBannerAlert('success', f.is_active
                ? 'Banner updated — now live on the site.'
                : 'Banner saved but hidden (inactive).');
            renderBannerPreview();
        } catch (error) {
            showBannerAlert('error', error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
})();