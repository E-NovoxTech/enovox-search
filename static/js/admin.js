/**
 * js/admin.js
 * Master Control Room logic. Uses admin_key for authorization.
 */

(function() {
    const API_URL = "";
    let adminKey = localStorage.getItem('enovox_admin_key');
    const PAGE_SIZE = 8;
    const ADMIN_NAV_ITEMS = Object.freeze([
        { group: 'OVERVIEW', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', sectionId: 'dashboard-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Products', icon: 'fa-solid fa-box-open', sectionId: 'products-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Collections', icon: 'fa-solid fa-layer-group', sectionId: 'collections-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Sponsored', icon: 'fa-solid fa-rectangle-ad', sectionId: 'sponsored-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Alternatives', icon: 'fa-solid fa-shuffle', sectionId: 'alternatives-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Submissions', icon: 'fa-solid fa-inbox', sectionId: 'submissions-tab' },
        { group: 'PRODUCT MANAGEMENT', label: 'Claims', icon: 'fa-solid fa-circle-check', sectionId: 'claims-tab' },
        { group: 'COMMUNITY', label: 'Developers', icon: 'fa-solid fa-users', sectionId: 'developers-tab' },
        { group: 'COMMUNITY', label: 'Newsletter', icon: 'fa-solid fa-envelope', sectionId: 'newsletter-tab' },
        { group: 'SPOTLIGHT', label: 'Applications', icon: 'fa-solid fa-star', sectionId: 'spotlight-applications-tab' },
        { group: 'SPOTLIGHT', label: 'Founder Spotlights', icon: 'fa-solid fa-id-card', sectionId: 'spotlight-list-tab' },
        { group: 'SPOTLIGHT', label: 'Hires', icon: 'fa-solid fa-handshake', sectionId: 'spotlight-hires-tab' },
        { group: 'SPOTLIGHT', label: 'Add Founder', icon: 'fa-solid fa-user-plus', sectionId: 'spotlight-add-founder-tab', hidden: true },
        { group: 'INSIGHTS', label: 'Search Analytics', icon: 'fa-solid fa-chart-line', sectionId: 'analytics-tab' },
        { group: 'WEBSITE', label: 'Announcements', icon: 'fa-solid fa-bullhorn', sectionId: 'banner-tab' },
        { group: 'PINNED', label: 'Settings', icon: 'fa-solid fa-gear', sectionId: 'settings-tab', pinned: true }
    ]);

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
    let dashboardSummaryRequest = 0;
    const collectionsPageState = { rows: [], counts: {}, filter: 'all', loaded: false };
    let collectionsListRequest = 0;
    let collectionsMutationBusy = false;
    let collectionProductCatalogReady = false;
    let collectionProductCatalogError = null;
    let collectionProductCatalogPromise = null;
    let coreProductsLoadPromise = null;
    let collectionEditorId = null;
    let collectionEditorRequest = 0;
    let collectionEditorReady = false;
    let collectionEditorSaving = false;
    let collectionSelectedProducts = [];
    let collectionEditorReturnFocus = null;
    let collectionSuccessTimer = null;

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
         'foreign-tools-category-filter', 'foreign-tool-category',
         'sponsored-category-filter'].forEach(id => {
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

        renderAdminNavigation();
        setupDashboard();
        setupSettings();
        setupCollections();
        setupSponsored();

        // Mobile sidebar drawer controls.
        const hamburgerBtn = document.getElementById('admin-hamburger');
        const adminSidebar = document.getElementById('admin-sidebar');
        const sidebarOverlay = document.getElementById('admin-sidebar-overlay');
        if (hamburgerBtn && adminSidebar && sidebarOverlay) {
            hamburgerBtn.addEventListener('click', () => setSidebarDrawerOpen(!adminSidebar.classList.contains('open')));
            sidebarOverlay.addEventListener('click', () => setSidebarDrawerOpen(false));
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && adminSidebar.classList.contains('open')) setSidebarDrawerOpen(false);
            });
            window.addEventListener('resize', () => {
                if (window.innerWidth > 768) setSidebarDrawerOpen(false);
            }, { passive: true });
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
        setupSpotlight();
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
                document.getElementById('product-alternatives-section').classList.remove('hidden');
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

                let id = document.getElementById('edit_product_id').value;
                const isEditing = Boolean(id);
                hideProductModalError();
                const productCategory = productForm.category.value;
                const alternativesSection = document.getElementById('product-alternatives-section');
                const alternativesReady = productAlternativesState.category === productCategory &&
                    productAlternativesState.ready &&
                    (isEditing ? productAlternativesState.id === id : productAlternativesState.id === null);
                if (productCategory && alternativesSection && !alternativesSection.classList.contains('hidden') && !alternativesReady) {
                    showProductModalError('Wait for matching alternatives to load (or retry the load) before saving this product.');
                    return;
                }
                const foreignToolIds = Array.from(
                    document.querySelectorAll('#product-alternatives-picker input[type="checkbox"]:checked'),
                    box => Number(box.value)
                );
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

                    // New products need their ID before Alternative To links can be attached.
                    if (!isEditing && foreignToolIds.length > 0) {
                        let createdProductId = extractCreatedProductId(await res.clone().json().catch(() => null));
                        if (!createdProductId) {
                            await refreshProducts();
                            createdProductId = findCreatedProductId(payload);
                        }
                        if (!createdProductId) {
                            throw new Error('The product was created, but its ID could not be found to save Alternative To links.');
                        }
                        id = createdProductId;
                        document.getElementById('edit_product_id').value = id;
                        document.getElementById('modal-title').textContent = 'Edit Product';
                        productAlternativesState.id = id;
                    }

                    if (isEditing || foreignToolIds.length > 0) {
                        const linksRes = await fetch(`${API_URL}/products/admin/${encodeURIComponent(id)}/alternatives?admin_key=${encodeURIComponent(adminKey)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ foreign_tool_ids: foreignToolIds })
                        });
                        await requireAdminResponse(linksRes, 'Failed to save alternative links');
                    }
                } catch (error) {
                    if (detailsSaved) await refreshProducts();
                    if (detailsSaved && !isEditing && !id) {
                        productModal.classList.add('hidden');
                        resetProductAlternatives();
                        showAlert('error', `Product was created, but Alternative To links were not saved. ${error.message} Find the product in the list and edit it to retry.`);
                    } else {
                        showProductModalError(detailsSaved
                            ? `Product details were saved, but Alternative To links were not saved. ${error.message} Retry saving this form.`
                            : `Could not save product: ${error.message}`);
                    }
                    return;
                } finally {
                    saveBtn.disabled = false;
                    closeBtn.disabled = false;
                }

                productModal.classList.add('hidden');
                resetProductAlternatives();
                await refreshProducts();
                showAlert('success', isEditing
                    ? 'Product and alternatives updated successfully.'
                    : (foreignToolIds.length ? 'Product created with Alternative To links.' : 'Product created successfully.'));
            });
        }
    }

    /* ==========================================================================
       Manual "Add Product" form: Keywords/Tags input + validation
       ========================================================================== */
    function setupKeywordsTagInput() {
        const entry = document.getElementById('keywords-tag-entry');
        if (!entry) return;

        // Keywords are optional in the admin product form. Make sure a stray
        // HTML "required" attribute can never trigger the browser's own
        // blocking "Please fill out this field" bubble before our handler runs.
        entry.required = false;
        const keywordsField = productForm ? productForm.querySelector('[name="keywords"]') : null;
        if (keywordsField) keywordsField.required = false;

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

        // Keywords are OPTIONAL. We still absorb anything left sitting in the
        // entry box (user may have typed a tag but not pressed Enter) so that
        // text is not lost, but an empty tag list no longer blocks saving.
        const entry = document.getElementById('keywords-tag-entry');
        if (entry && entry.value.trim() !== '') {
            addKeywordTag(entry.value);
            entry.value = '';
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

        // Founder: required by the backend (ProductBase) — keep client in
        // sync so admins get a named error instead of a raw 422.
        if (productForm.founder.value.trim() === '') {
            showFieldError('founder-error', 'Founder name(s) are required.');
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
        ['keywords-error', 'contact-email-error', 'pricing-details-error', 'github-url-error', 'founder-error'].forEach(clearFieldError);
    }

    /* ==========================================================================
       Navigation & Tab Switching
       ========================================================================== */
    function renderAdminNavigation() {
        const mainNav = document.getElementById('admin-sidebar-nav');
        const pinnedNav = document.getElementById('admin-sidebar-pinned-nav');
        if (!mainNav || !pinnedNav) return;
        mainNav.replaceChildren();
        pinnedNav.replaceChildren();

        const activeSectionId = getActiveTabId();
        const groups = new Map();
        ADMIN_NAV_ITEMS.forEach(item => {
            if (item.hidden) return;
            if (item.pinned) {
                pinnedNav.appendChild(createAdminNavButton(item, activeSectionId));
                return;
            }
            if (!groups.has(item.group)) {
                const group = document.createElement('section');
                group.className = 'sidebar-nav-group';
                group.dataset.group = item.group;
                const heading = document.createElement('h2');
                heading.className = 'sidebar-nav-heading';
                heading.textContent = item.group;
                const items = document.createElement('div');
                items.className = 'sidebar-nav-items';
                group.append(heading, items);
                groups.set(item.group, items);
                mainNav.appendChild(group);
            }
            groups.get(item.group).appendChild(createAdminNavButton(item, activeSectionId));
        });
    }

    function createAdminNavButton(item, activeSectionId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `nav-tab${item.sectionId === activeSectionId ? ' active' : ''}`;
        button.dataset.target = item.sectionId;
        button.setAttribute('aria-controls', item.sectionId);
        button.setAttribute('aria-current', item.sectionId === activeSectionId ? 'page' : 'false');
        const icon = document.createElement('i');
        icon.className = item.icon;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = item.label;
        button.append(icon, label);
        return button;
    }

    function setupNavigation() {
        const sidebar = document.getElementById('admin-sidebar');
        if (sidebar) {
            sidebar.addEventListener('click', event => {
                const button = event.target.closest('.nav-tab[data-target]');
                if (!button) return;
                switchAdminPage(button.dataset.target);
                if (window.innerWidth <= 768) setSidebarDrawerOpen(false);
            });
        }

        const cards = document.getElementById('dashboard-cards');
        if (cards) {
            cards.addEventListener('click', event => {
                const card = event.target.closest('[data-dashboard-target]');
                if (card) switchAdminPage(card.dataset.dashboardTarget);
            });
        }
    }

    function switchAdminPage(sectionId) {
        const navItem = ADMIN_NAV_ITEMS.find(item => item.sectionId === sectionId);
        const section = document.getElementById(sectionId);
        if (!navItem || !section) return false;

        document.querySelectorAll('.tab-content').forEach(page => {
            const active = page.id === sectionId;
            page.classList.toggle('active', active);
            page.classList.toggle('hidden', !active);
        });
        const adminMain = document.getElementById('admin-main');
        if (adminMain) adminMain.classList.toggle('collections-page-active', sectionId === 'collections-tab' || sectionId === 'sponsored-tab');
        document.querySelectorAll('.nav-tab[data-target]').forEach(button => {
            const active = button.dataset.target === sectionId;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        renderActiveTab(sectionId);
        return true;
    }

    function setSidebarDrawerOpen(open) {
        const sidebar = document.getElementById('admin-sidebar');
        const overlay = document.getElementById('admin-sidebar-overlay');
        const hamburger = document.getElementById('admin-hamburger');
        if (!sidebar || !overlay) return;
        sidebar.classList.toggle('open', Boolean(open));
        overlay.classList.toggle('active', Boolean(open));
        if (hamburger) hamburger.setAttribute('aria-expanded', String(Boolean(open)));
    }

    function setupDashboard() {
        ['dashboard-refresh-btn', 'dashboard-retry-btn'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', loadDashboardSummary);
        });
    }

    async function loadDashboardSummary() {
        const requestId = ++dashboardSummaryRequest;
        const loading = document.getElementById('dashboard-loading');
        const errorBox = document.getElementById('dashboard-error');
        const errorMessage = document.getElementById('dashboard-error-message');
        const cards = document.getElementById('dashboard-cards');
        const refreshButton = document.getElementById('dashboard-refresh-btn');
        if (!loading || !errorBox || !cards) return;

        loading.classList.remove('hidden');
        errorBox.classList.add('hidden');
        cards.classList.add('hidden');
        cards.replaceChildren();
        if (refreshButton) refreshButton.disabled = true;

        try {
            const response = await fetch(`${API_URL}/products/admin/dashboard-summary?admin_key=${encodeURIComponent(adminKey)}`, {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(response, 'Could not load dashboard summary');
            const data = await response.json();
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('The dashboard summary response was invalid.');
            }
            if (requestId !== dashboardSummaryRequest) return;
            renderDashboardCards(data);
            cards.classList.remove('hidden');
        } catch (error) {
            if (requestId !== dashboardSummaryRequest) return;
            if (errorMessage) errorMessage.textContent = error.message || 'Please try again.';
            errorBox.classList.remove('hidden');
        } finally {
            if (requestId === dashboardSummaryRequest) {
                loading.classList.add('hidden');
                if (refreshButton) refreshButton.disabled = false;
            }
        }
    }

    function renderDashboardCards(data) {
        const cards = document.getElementById('dashboard-cards');
        if (!cards) return;
        const definitions = [
            { key: 'total_products', label: 'Total Products', detail: 'Live listings', target: 'products-tab', icon: 'fa-solid fa-box-open' },
            { key: 'pending_submissions', label: 'Pending Submissions', detail: 'Awaiting review', target: 'submissions-tab', icon: 'fa-solid fa-inbox', attention: true },
            { key: 'pending_claims', label: 'Pending Claims', detail: 'Awaiting review', target: 'claims-tab', icon: 'fa-solid fa-circle-check', attention: true },
            { key: 'pending_spotlights', label: 'Spotlight Applications', detail: 'Awaiting review', target: 'spotlight-applications-tab', icon: 'fa-solid fa-star', attention: true },
            { key: 'developers', label: 'Developers', detail: 'Registered developers', target: 'developers-tab', icon: 'fa-solid fa-users' },
            { key: 'newsletter_subscribers', label: 'Newsletter Subscribers', detail: 'Active subscribers', target: 'newsletter-tab', icon: 'fa-solid fa-envelope' },
            { key: 'total_searches', label: 'Search Analytics', detail: 'Total searches', target: 'analytics-tab', icon: 'fa-solid fa-chart-line' }
        ];
        cards.replaceChildren(...definitions.map(definition => {
            const value = formatDashboardMetric(data[definition.key]);
            const numericValue = Number(data[definition.key]);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `dashboard-summary-card${definition.attention && Number.isFinite(numericValue) && numericValue > 0 ? ' needs-attention' : ''}`;
            card.dataset.dashboardTarget = definition.target;
            card.setAttribute('aria-label', `${definition.label}: ${value}. Open ${navLabelForSection(definition.target)}.`);

            const icon = document.createElement('span');
            icon.className = 'dashboard-card-icon';
            const iconGlyph = document.createElement('i');
            iconGlyph.className = definition.icon;
            iconGlyph.setAttribute('aria-hidden', 'true');
            icon.appendChild(iconGlyph);

            const content = document.createElement('span');
            content.className = 'dashboard-card-content';
            const label = document.createElement('span');
            label.className = 'dashboard-card-label';
            label.textContent = definition.label;
            const metric = document.createElement('strong');
            metric.className = 'dashboard-card-value';
            metric.textContent = value;
            const detail = document.createElement('span');
            detail.className = 'dashboard-card-detail';
            detail.textContent = definition.detail;
            content.append(label, metric, detail);

            const arrow = document.createElement('i');
            arrow.className = 'fa-solid fa-arrow-up-right-from-square dashboard-card-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            card.append(icon, content, arrow);
            return card;
        }));
    }

    function formatDashboardMetric(value) {
        if (value === null || value === undefined || value === '') return '—';
        const number = Number(value);
        return Number.isFinite(number) ? number.toLocaleString() : '—';
    }

    function navLabelForSection(sectionId) {
        const item = ADMIN_NAV_ITEMS.find(navItem => navItem.sectionId === sectionId);
        return item ? item.label : 'page';
    }

    function setupSettings() {
        const exportButton = document.getElementById('export-products-csv-btn');
        if (exportButton) exportButton.addEventListener('click', exportProductsCsv);
    }

    async function exportProductsCsv() {
        const button = document.getElementById('export-products-csv-btn');
        const status = document.getElementById('settings-export-status');
        const errorBox = document.getElementById('settings-export-error');
        if (!button || !status || !errorBox) return;
        status.textContent = '';
        errorBox.textContent = '';
        errorBox.classList.add('hidden');
        button.disabled = true;

        try {
            const url = `${API_URL}/products/admin/export-csv?admin_key=${encodeURIComponent(adminKey)}`;
            const response = await fetch(url, { cache: 'no-store' });
            await requireAdminResponse(response, 'Could not export products');
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            const plainName = disposition.match(/filename="?([^";]+)"?/i);
            let filename = encodedName ? encodedName[1] : (plainName ? plainName[1] : 'products.csv');
            try { filename = decodeURIComponent(filename.replace(/^"|"$/g, '')); } catch (error) { /* keep server-provided name */ }

            const objectUrl = URL.createObjectURL(blob);
            const download = document.createElement('a');
            download.href = objectUrl;
            download.download = filename;
            download.hidden = true;
            document.body.appendChild(download);
            download.click();
            download.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            status.textContent = 'Products CSV downloaded.';
        } catch (error) {
            errorBox.textContent = error.message || 'The CSV export could not be downloaded.';
            errorBox.classList.remove('hidden');
        } finally {
            button.disabled = false;
        }
    }

    /* ==========================================================================
       Collections management
       ========================================================================== */
    function setupCollections() {
        const newButton = document.getElementById('collection-new-btn');
        const tabs = document.getElementById('collection-status-tabs');
        const list = document.getElementById('collections-list');
        const form = document.getElementById('collection-editor-form');
        const productSearch = document.getElementById('collection-product-search');
        const productResults = document.getElementById('collection-product-results');
        const selectedList = document.getElementById('collection-selected-list');
        const typeSelect = document.getElementById('collection-section-type');
        const publishToggle = document.getElementById('collection-published');
        const emojiInput = document.getElementById('collection-emoji');

        if (newButton) newButton.addEventListener('click', () => openCollectionEditor(null, newButton));
        if (tabs) tabs.addEventListener('click', event => {
            const tab = event.target.closest('[data-collection-status]');
            if (!tab) return;
            collectionsPageState.filter = tab.dataset.collectionStatus || 'all';
            renderCollectionStatusTabs();
            renderCollectionList();
        });
        if (list) list.addEventListener('click', handleCollectionListClick);
        if (form) form.addEventListener('submit', saveCollectionEditor);
        if (typeSelect) typeSelect.addEventListener('change', () => {
            updateCollectionTypePanels();
            renderCollectionProductResults();
            updateCollectionPublishConstraint();
        });
        if (productSearch) productSearch.addEventListener('input', renderCollectionProductResults);
        if (productResults) productResults.addEventListener('click', handleCollectionProductResultClick);
        if (selectedList) selectedList.addEventListener('click', handleSelectedCollectionProductClick);
        if (publishToggle) publishToggle.addEventListener('change', updateCollectionPublishConstraint);
        if (emojiInput) emojiInput.addEventListener('blur', () => { emojiInput.value = normalizeCollectionEmoji(emojiInput.value); });

        ['collection-drawer-close', 'collection-cancel-btn', 'collection-drawer-backdrop'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', closeCollectionDrawer);
        });
        document.addEventListener('keydown', event => {
            const drawer = document.getElementById('collection-drawer');
            if (event.key === 'Escape' && drawer && !drawer.classList.contains('hidden')) closeCollectionDrawer();
        });

        // "..." action menu: it is position: fixed and placed from the button's
        // rectangle, so it is never clipped by the table or the page and it opens
        // upward when there is no room below (e.g. the last row of the list).
        document.addEventListener('toggle', event => {
            const details = event.target;
            if (!details || !details.classList || !details.classList.contains('collection-action-menu')) return;
            if (details.open) {
                closeCollectionMenus(details);
                positionCollectionMenu(details);
            } else {
                const menu = details.querySelector('.collection-actions-menu');
                if (menu) menu.classList.remove('is-ready');
            }
        }, true);
        document.addEventListener('click', event => {
            if (!event.target.closest('.collection-action-menu')) closeCollectionMenus();
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const open = document.querySelector('details.collection-action-menu[open]');
            if (open) { open.removeAttribute('open'); const summary = open.querySelector('summary'); if (summary) summary.focus(); }
        });
        window.addEventListener('resize', () => closeCollectionMenus());
        document.addEventListener('scroll', event => {
            const target = event.target;
            if (target && target.nodeType === 1 && target.closest('.collection-actions-menu')) return;
            closeCollectionMenus();
        }, true);

        // Drawer: jump links between the four sections.
        if (form) form.addEventListener('click', event => {
            const jump = event.target.closest('[data-collection-jump]');
            if (!jump) return;
            const section = document.getElementById(jump.dataset.collectionJump);
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        // Drawer: live preview card + description counter.
        ['collection-title', 'collection-emoji', 'collection-description'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', syncCollectionPreview);
        });
    }

    function closeCollectionMenus(except) {
        document.querySelectorAll('details.collection-action-menu[open]').forEach(details => {
            if (details !== except) details.removeAttribute('open');
        });
    }

    function positionCollectionMenu(details) {
        const summary = details.querySelector('summary');
        const menu = details.querySelector('.collection-actions-menu');
        if (!summary || !menu) return;
        const rect = summary.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const gap = 6;
        const pad = 8;
        let top = rect.bottom + gap;
        let opensUp = false;
        if (top + height > window.innerHeight - pad) {
            if (rect.top - gap - height >= pad) { top = rect.top - gap - height; opensUp = true; }
            else top = Math.max(pad, window.innerHeight - pad - height);
        }
        const left = Math.min(Math.max(pad, rect.right - width), Math.max(pad, window.innerWidth - width - pad));
        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
        menu.classList.toggle('opens-up', opensUp);
        menu.classList.add('is-ready');
    }

    function syncCollectionPreview() {
        const title = document.getElementById('collection-title');
        const emoji = document.getElementById('collection-emoji');
        const description = document.getElementById('collection-description');
        const previewTitle = document.getElementById('collection-preview-title');
        const previewEmoji = document.getElementById('collection-preview-emoji');
        const previewDesc = document.getElementById('collection-preview-desc');
        const count = document.getElementById('collection-description-count');
        if (previewTitle) previewTitle.textContent = (title && title.value.trim()) || 'Your collection title';
        if (previewEmoji) previewEmoji.textContent = (emoji && emoji.value.trim()) || '✨';
        if (previewDesc) previewDesc.textContent = (description && description.value.trim()) || 'Your short description shows here.';
        if (count) count.textContent = `${description ? description.value.length : 0} / 280`;
    }

    function collectionApiUrl(path = '') {
        const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
        return `${API_URL}/collections/admin${cleanPath}?admin_key=${encodeURIComponent(adminKey || '')}`;
    }

    async function loadCollections(options = {}) {
        const requestId = ++collectionsListRequest;
        const loading = document.getElementById('collections-loading');
        const table = document.getElementById('collection-table-container');
        const empty = document.getElementById('collections-empty');
        const error = document.getElementById('collections-error');
        const silent = Boolean(options.silent);
        if (error) { error.textContent = ''; error.classList.add('hidden'); }
        if (loading && !silent) loading.classList.remove('hidden');
        if (!silent) {
            if (table) table.classList.add('hidden');
            if (empty) empty.classList.add('hidden');
        }

        try {
            const response = await fetch(collectionApiUrl(), {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(response, 'Could not load collections');
            const data = await response.json();
            if (!data || !Array.isArray(data.collections)) throw new Error('The collections response was invalid.');
            if (requestId !== collectionsListRequest) return false;
            const collectionRows = data.collections.slice();
            const hasDisplayOrder = collectionRows.length > 0 && collectionRows.every(row => row.display_order !== null && row.display_order !== undefined && Number.isFinite(Number(row.display_order)));
            if (hasDisplayOrder) collectionRows.sort((a, b) => Number(a.display_order) - Number(b.display_order));
            collectionsPageState.rows = collectionRows;
            collectionsPageState.counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
            collectionsPageState.loaded = true;
            renderCollectionStatusTabs();
            renderCollectionList();
            return true;
        } catch (loadError) {
            if (requestId !== collectionsListRequest) return false;
            setCollectionsError(loadError.message || 'Could not load collections.');
            if (collectionsPageState.loaded) renderCollectionList();
            else {
                if (table) table.classList.add('hidden');
                if (empty) empty.classList.add('hidden');
            }
            return false;
        } finally {
            if (requestId === collectionsListRequest && loading) loading.classList.add('hidden');
        }
    }

    function collectionIsArchived(collection) {
        return Boolean(collection && (collection.is_archived === true || String(collection.status || '').toLowerCase() === 'archived'));
    }

    function collectionStatus(collection) {
        if (collectionIsArchived(collection)) return 'archived';
        const status = String(collection && collection.status || 'draft').toLowerCase();
        return ['live', 'scheduled', 'draft', 'expired'].includes(status) ? status : 'draft';
    }

    function collectionIsPublished(collection) {
        if (collection && collection.is_published !== undefined && collection.is_published !== null) {
            return collection.is_published === true || collection.is_published === 1 || collection.is_published === 'true';
        }
        return ['live', 'scheduled', 'expired'].includes(collectionStatus(collection));
    }

    function collectionType(collection) {
        return String(collection && collection.section_type || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
    }

    function collectionSelectedCount(collection) {
        const count = Number(collection && collection.selected_count);
        return Number.isFinite(count) ? count : 0;
    }

    function renderCollectionStatusTabs() {
        const tabs = document.getElementById('collection-status-tabs');
        if (!tabs) return;
        const rows = collectionsPageState.rows;
        const computed = {
            all: rows.filter(row => !collectionIsArchived(row)).length,
            live: rows.filter(row => collectionStatus(row) === 'live').length,
            scheduled: rows.filter(row => collectionStatus(row) === 'scheduled').length,
            draft: rows.filter(row => collectionStatus(row) === 'draft').length,
            expired: rows.filter(row => collectionStatus(row) === 'expired').length,
            archived: rows.filter(row => collectionIsArchived(row)).length
        };
        tabs.querySelectorAll('[data-collection-status]').forEach(tab => {
            const key = tab.dataset.collectionStatus;
            const active = key === collectionsPageState.filter;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            const count = tab.querySelector('[data-collection-count]');
            if (count) {
                const serverCount = Number(collectionsPageState.counts[key]);
const countValue = Number.isFinite(serverCount) ? serverCount : computed[key];
                count.textContent = Number(countValue || 0).toLocaleString();
            }
        });
        const orderNote = document.getElementById('collection-order-note');
        if (orderNote) orderNote.classList.toggle('hidden', collectionsPageState.filter !== 'all');
    }

    function renderCollectionList() {
        const tbody = document.getElementById('collections-list');
        const table = document.getElementById('collection-table-container');
        const empty = document.getElementById('collections-empty');
        if (!tbody || !table || !empty) return;

        const filter = collectionsPageState.filter;
        const rows = collectionsPageState.rows.filter(collection => {
            if (filter === 'all') return !collectionIsArchived(collection);
            if (filter === 'archived') return collectionIsArchived(collection);
            return collectionStatus(collection) === filter;
        });
        tbody.innerHTML = '';
        if (!rows.length) {
            table.classList.add('hidden');
            empty.textContent = collectionEmptyMessage(filter);
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        table.classList.remove('hidden');
        const reorderableRows = collectionsPageState.rows.filter(row => !collectionIsArchived(row));
        tbody.innerHTML = rows.map(collection => {
            const id = escapeHTML(String(collection.id));
            const title = escapeHTML(collection.title || 'Untitled collection');
            const emoji = escapeHTML(collection.emoji || '✨');
            const type = collectionType(collection);
            const status = collectionStatus(collection);
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
            const warnings = Array.isArray(collection.warnings) ? collection.warnings.filter(Boolean) : [];
            const warningMarkup = warnings.map(warning => `<span class="collection-warning-line"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>${escapeHTML(warning)}</span>`).join('');
            const schedule = collectionScheduleLabel(collection);
            const index = reorderableRows.findIndex(row => String(row.id) === String(collection.id));
            const canReorder = filter === 'all' && !collectionIsArchived(collection) && index >= 0;
            const orderMarkup = canReorder
                ? `<div class="collection-order-buttons" aria-label="Change collection order">
                        <button type="button" class="btn-secondary btn-small" data-collection-action="move-up" data-collection-id="${id}" aria-label="Move ${title} up" ${index === 0 || collectionsMutationBusy ? 'disabled' : ''}><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
                        <button type="button" class="btn-secondary btn-small" data-collection-action="move-down" data-collection-id="${id}" aria-label="Move ${title} down" ${index === reorderableRows.length - 1 || collectionsMutationBusy ? 'disabled' : ''}><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                    </div>`
                : '<span class="text-muted collection-no-order">—</span>';
            const liveCount = Number(collection.live_count);
            const countLabel = Number.isFinite(liveCount) ? liveCount.toLocaleString() : '0';
            const actionMarkup = renderCollectionActionGroups(collection, id);
            return `<tr class="collection-table-row" data-collection-id="${id}">
                <td data-label="Collection">
                    <div class="collection-title-cell"><span class="collection-row-emoji" aria-hidden="true">${emoji}</span><div><strong>${title}</strong>${warningMarkup ? `<div class="collection-warning-list">${warningMarkup}</div>` : ''}</div></div>
                </td>
                <td data-label="Type"><span class="collection-type-badge collection-type-${type}">${type === 'auto' ? 'Auto' : 'Hand-picked'}</span></td>
                <td data-label="Live products"><strong class="collection-live-count">${countLabel}</strong><span class="collection-mobile-caption">live products</span></td>
                <td data-label="Status"><span class="collection-status-badge collection-status-${status}">${statusLabel}</span></td>
                <td data-label="Schedule"><span class="collection-schedule-cell">${escapeHTML(schedule)}</span></td>
                <td data-label="Order">${orderMarkup}</td>
                <td data-label="Actions">${actionMarkup}</td>
            </tr>`;
        }).join('');
    }

    function collectionEmptyMessage(filter) {
        const messages = {
            all: 'No collections yet. Create your first collection to build a section for the public page.',
            live: 'There are no live collections.',
            scheduled: 'There are no scheduled collections.',
            draft: 'There are no draft collections.',
            expired: 'There are no expired collections.',
            archived: 'There are no archived collections.'
        };
        return messages[filter] || messages.all;
    }

    function renderCollectionActionGroups(collection, id) {
        const title = escapeHTML(collection.title || 'collection');
        const archived = collectionIsArchived(collection);
        const published = collectionIsPublished(collection);
        const publishBlocked = !published && collectionType(collection) === 'manual' && collectionSelectedCount(collection) < 3;
        const disabled = collectionsMutationBusy ? 'disabled' : '';
        const publishDisabled = collectionsMutationBusy || publishBlocked ? 'disabled' : '';
        const publishTitle = publishBlocked ? 'Add at least 3 products before publishing' : `${published ? 'Unpublish' : 'Publish'} ${title}`;
        // Edit and Publish/Unpublish stay visible; Duplicate and Archive/Restore live in the "..." menu.
        const primaryActions = `<button type="button" class="btn-secondary btn-small" data-collection-action="edit" data-collection-id="${id}" ${disabled}>Edit</button>
            <button type="button" class="${published ? 'btn-secondary' : 'btn-primary'} btn-small" data-collection-action="publish" data-collection-id="${id}" title="${escapeHTML(publishTitle)}" aria-label="${escapeHTML(publishTitle)}" ${publishDisabled}>${published ? 'Unpublish' : 'Publish'}</button>`;
        const menuActions = `<button type="button" class="btn-secondary btn-small" data-collection-action="duplicate" data-collection-id="${id}" ${disabled}>Duplicate</button>
            ${archived
                ? `<button type="button" class="btn-secondary btn-small" data-collection-action="restore" data-collection-id="${id}" ${disabled}>Restore</button>`
                : `<button type="button" class="btn-danger btn-small" data-collection-action="archive" data-collection-id="${id}" ${disabled}>Archive</button>`}`;
        return `<div class="collection-actions-inline">${primaryActions}
            <details class="collection-action-menu">
                <summary class="btn-secondary btn-small" aria-label="More actions for ${title}" title="More actions"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></summary>
                <div class="collection-actions-menu">${menuActions}</div>
            </details></div>`;
    }

    function collectionScheduleLabel(collection) {
        const pieces = [];
        if (collection.start_date) pieces.push(`Starts ${formatCollectionDate(collection.start_date)}`);
        if (collection.end_date) pieces.push(`Ends ${formatCollectionDate(collection.end_date)}`);
        return pieces.length ? pieces.join(' · ') : 'Always on';
    }

    function formatCollectionDate(raw) {
        if (!raw) return '';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return String(raw);
        return raw.includes('T') ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : date.toLocaleDateString([], { dateStyle: 'medium' });
    }

    function setCollectionsError(message) {
        const error = document.getElementById('collections-error');
        if (!error) return;
        error.textContent = message || 'The collection request failed.';
        error.classList.remove('hidden');
    }

    function showCollectionsSuccess(message) {
        const success = document.getElementById('collections-success');
        if (!success) return;
        window.clearTimeout(collectionSuccessTimer);
        success.textContent = message;
        success.classList.remove('hidden');
        collectionSuccessTimer = window.setTimeout(() => success.classList.add('hidden'), 5000);
    }

    function clearCollectionsFeedback() {
        const error = document.getElementById('collections-error');
        const success = document.getElementById('collections-success');
        if (error) { error.textContent = ''; error.classList.add('hidden'); }
        if (success) { success.textContent = ''; success.classList.add('hidden'); }
        window.clearTimeout(collectionSuccessTimer);
    }

    async function handleCollectionListClick(event) {
        const button = event.target.closest('[data-collection-action]');
        if (!button || button.disabled) return;
        const id = button.dataset.collectionId;
        const action = button.dataset.collectionAction;
        const collection = collectionsPageState.rows.find(row => String(row.id) === String(id));
        if (!collection) return;
        const details = button.closest('details');
        if (details) details.removeAttribute('open');

        if (action === 'edit') {
            await openCollectionEditor(collection.id, button);
        } else if (action === 'publish') {
            const publish = !collectionIsPublished(collection);
            if (publish && collectionType(collection) === 'manual' && collectionSelectedCount(collection) < 3) {
                setCollectionsError('At least 3 products must be selected before a hand-picked collection can be published.');
                return;
            }
            await runCollectionMutation(
                publish ? 'Collection published.' : 'Collection unpublished.',
                () => updateCollection(collection.id, { is_published: publish })
            );
        } else if (action === 'duplicate') {
            await runCollectionMutation('Collection duplicated as an unpublished copy.', () => duplicateCollection(collection.id));
        } else if (action === 'archive') {
            const title = collection.title || 'this collection';
            if (!window.confirm(`Archive “${title}”? It will be removed from the public collection page.`)) return;
            await runCollectionMutation('Collection archived.', () => updateCollection(collection.id, { is_archived: true }));
        } else if (action === 'restore') {
            await runCollectionMutation('Collection restored.', () => updateCollection(collection.id, { is_archived: false }));
        } else if (action === 'move-up') {
            await moveCollection(collection.id, -1);
        } else if (action === 'move-down') {
            await moveCollection(collection.id, 1);
        }
    }

    async function runCollectionMutation(successMessage, requestFunction) {
        if (collectionsMutationBusy) return;
        collectionsMutationBusy = true;
        clearCollectionsFeedback();
        renderCollectionList();
        try {
            await requestFunction();
            await loadCollections({ silent: true });
            showCollectionsSuccess(successMessage);
        } catch (error) {
            setCollectionsError(error.message || 'The collection could not be updated.');
        } finally {
            collectionsMutationBusy = false;
            renderCollectionList();
        }
    }

    async function updateCollection(id, payload) {
        const response = await fetch(collectionApiUrl(`/${encodeURIComponent(String(id))}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        });
        await requireAdminResponse(response, 'Could not update collection');
    }

    async function duplicateCollection(id) {
        const response = await fetch(collectionApiUrl(`/${encodeURIComponent(String(id))}/duplicate`), {
            method: 'POST',
            headers: { Accept: 'application/json' }
        });
        await requireAdminResponse(response, 'Could not duplicate collection');
    }

    async function moveCollection(id, direction) {
        if (collectionsMutationBusy || collectionsPageState.filter !== 'all') return;
        const previousRows = collectionsPageState.rows.slice();
        const reorderable = previousRows.filter(row => !collectionIsArchived(row));
        const from = reorderable.findIndex(row => String(row.id) === String(id));
        const to = from + direction;
        if (from < 0 || to < 0 || to >= reorderable.length) return;
        [reorderable[from], reorderable[to]] = [reorderable[to], reorderable[from]];
        const archivedRows = previousRows.filter(row => collectionIsArchived(row));
        collectionsPageState.rows = reorderable.concat(archivedRows);
        collectionsMutationBusy = true;
        clearCollectionsFeedback();
        renderCollectionList();
        try {
            const response = await fetch(collectionApiUrl('/reorder'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ ids: reorderable.map(row => row.id) })
            });
            await requireAdminResponse(response, 'Could not save collection order');
            await loadCollections({ silent: true });
            showCollectionsSuccess('Collection order saved.');
        } catch (error) {
            collectionsPageState.rows = previousRows;
            setCollectionsError(error.message || 'Could not save collection order.');
        } finally {
            collectionsMutationBusy = false;
            renderCollectionList();
        }
    }

    function handleCollectionProductResultClick(event) {
        const retryButton = event.target.closest('[data-retry-collection-products]');
        if (retryButton) {
            collectionProductCatalogReady = false;
            collectionProductCatalogError = null;
            ensureCollectionProductCatalog().then(renderCollectionProductPicker);
            return;
        }
        const button = event.target.closest('[data-add-collection-product]');
        if (!button || button.disabled) return;
        const product = state.products.find(item => String(item.id) === String(button.dataset.addCollectionProduct));
        if (!product || !collectionProductIsLive(product)) return;
        if (collectionSelectedProducts.some(item => String(item.id) === String(product.id))) return;
        if (collectionSelectedProducts.length >= 30) {
            const limit = document.getElementById('collection-product-limit-message');
            if (limit) limit.classList.remove('hidden');
            return;
        }
        collectionSelectedProducts.push({ ...product });
        renderCollectionProductPicker();
    }

    function handleSelectedCollectionProductClick(event) {
        const button = event.target.closest('[data-selected-product-action]');
        if (!button || button.disabled) return;
        const id = button.dataset.productId;
        const index = collectionSelectedProducts.findIndex(product => String(product.id) === String(id));
        if (index < 0) return;
        const action = button.dataset.selectedProductAction;
        if (action === 'remove') collectionSelectedProducts.splice(index, 1);
        if (action === 'up' && index > 0) [collectionSelectedProducts[index - 1], collectionSelectedProducts[index]] = [collectionSelectedProducts[index], collectionSelectedProducts[index - 1]];
        if (action === 'down' && index < collectionSelectedProducts.length - 1) [collectionSelectedProducts[index + 1], collectionSelectedProducts[index]] = [collectionSelectedProducts[index], collectionSelectedProducts[index + 1]];
        renderCollectionProductPicker();
    }

    async function ensureCollectionProductCatalog() {
        if (collectionProductCatalogReady) return;
        if (coreProductsLoadPromise) {
            await coreProductsLoadPromise;
            return;
        }
        if (!collectionProductCatalogPromise) {
            collectionProductCatalogPromise = fetchProductsData().finally(() => { collectionProductCatalogPromise = null; });
        }
        await collectionProductCatalogPromise;
    }

    function collectionProductIsLive(product) {
        if (!product) return false;
        if (typeof product.is_live === 'boolean') return product.is_live;
        if (product.is_live !== undefined && product.is_live !== null) return ['true', '1', 'live', 'active'].includes(String(product.is_live).toLowerCase());
        if (typeof product.status === 'boolean') return product.status;
        if (product.status !== undefined && product.status !== null) return ['true', '1', 'live', 'active', 'published'].includes(String(product.status).toLowerCase());
        if (typeof product.is_active === 'boolean') return product.is_active;
        return true;
    }

    function renderCollectionProductPicker() {
        renderCollectionProductResults();
        renderSelectedCollectionProducts();
        updateCollectionPublishConstraint();
        const count = document.getElementById('collection-selected-count');
        if (count) count.textContent = `${collectionSelectedProducts.length} of 30 selected`;
        const limit = document.getElementById('collection-product-limit-message');
        if (limit) limit.classList.toggle('hidden', collectionSelectedProducts.length < 30);
    }

    function renderCollectionProductResults() {
        const results = document.getElementById('collection-product-results');
        const searchInput = document.getElementById('collection-product-search');
        if (!results) return;
        if (!collectionProductCatalogReady) {
            results.innerHTML = '<p class="text-muted collection-product-empty">Loading the admin product catalog…</p>';
            return;
        }
        if (collectionProductCatalogError) {
            results.innerHTML = `<div class="collection-product-load-error"><p>${escapeHTML(collectionProductCatalogError)}</p><button type="button" class="btn-secondary btn-small" data-retry-collection-products>Retry product load</button></div>`;
            return;
        }
        if (!Array.isArray(state.products) || !state.products.length) {
            results.innerHTML = '<p class="text-muted collection-product-empty">No products are available in the admin catalog.</p>';
            return;
        }
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const matched = state.products.filter(product => {
            const name = String(product.name || '').toLowerCase();
            const category = String(product.category || '').toLowerCase();
            return !query || name.includes(query) || category.includes(query);
        });
        if (!matched.length) {
            results.innerHTML = '<p class="text-muted collection-product-empty">No products match your search.</p>';
            return;
        }
        const visible = matched.slice(0, 40);
        const selectedIds = new Set(collectionSelectedProducts.map(product => String(product.id)));
        results.innerHTML = visible.map(product => {
            const id = escapeHTML(String(product.id));
            const name = escapeHTML(product.name || 'Untitled product');
            const category = escapeHTML(product.category || 'Uncategorised');
            const live = collectionProductIsLive(product);
            const selected = selectedIds.has(String(product.id));
            const atLimit = collectionSelectedProducts.length >= 30;
            const disabled = !live || selected || atLimit;
            const logo = safeCollectionImageUrl(product.logo_url);
            const logoMarkup = logo
                ? `<img src="${escapeHTML(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : '<i class="fa-solid fa-cube" aria-hidden="true"></i>';
            return `<div class="collection-product-result${live ? '' : ' is-hidden-product'}">
                <span class="collection-product-logo">${logoMarkup}</span>
                <span class="collection-product-copy"><strong>${name}</strong><small>${category}</small></span>
                ${!live ? '<span class="collection-hidden-badge">Hidden</span>' : ''}
                <button type="button" class="btn-secondary btn-small collection-add-product" data-add-collection-product="${id}" ${disabled ? 'disabled' : ''}>${selected ? 'Added' : (atLimit && live ? 'Limit reached' : 'Add')}</button>
            </div>`;
        }).join('') + (matched.length > visible.length ? `<p class="collection-result-limit text-muted">Showing 40 of ${matched.length} matches. Refine your search to find more.</p>` : '');
    }

    function safeCollectionImageUrl(value) {
        const url = String(value || '').trim();
        if (/^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'))) return url;
        return '';
    }

    function renderSelectedCollectionProducts() {
        const list = document.getElementById('collection-selected-list');
        if (!list) return;
        if (!collectionSelectedProducts.length) {
            list.innerHTML = '<li class="collection-selected-empty text-muted">No products selected yet.</li>';
            return;
        }
        list.innerHTML = collectionSelectedProducts.map((product, index) => {
            const id = escapeHTML(String(product.id));
            const name = escapeHTML(product.name || 'Untitled product');
            const category = escapeHTML(product.category || 'Uncategorised');
            const live = collectionProductIsLive(product);
            const logo = safeCollectionImageUrl(product.logo_url);
            const logoMarkup = logo
                ? `<img src="${escapeHTML(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : '<i class="fa-solid fa-cube" aria-hidden="true"></i>';
            return `<li class="collection-selected-product" data-product-id="${id}">
                <span class="collection-selected-number">${index + 1}</span>
                <span class="collection-product-logo">${logoMarkup}</span>
                <span class="collection-product-copy"><strong>${name}</strong><small>${category}${live ? '' : ' · Hidden'}</small></span>
                <span class="collection-selected-order">
                    <button type="button" class="btn-secondary btn-small" data-selected-product-action="up" data-product-id="${id}" aria-label="Move ${name} up" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
                    <button type="button" class="btn-secondary btn-small" data-selected-product-action="down" data-product-id="${id}" aria-label="Move ${name} down" ${index === collectionSelectedProducts.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                </span>
                <button type="button" class="btn-secondary btn-small collection-remove-product" data-selected-product-action="remove" data-product-id="${id}" aria-label="Remove ${name}">Remove</button>
            </li>`;
        }).join('');
    }

    function updateCollectionTypePanels() {
        const typeSelect = document.getElementById('collection-section-type');
        const manualPanel = document.getElementById('collection-manual-panel');
        const autoPanel = document.getElementById('collection-auto-panel');
        const lockNote = document.getElementById('collection-type-lock-note');
        if (!typeSelect) return;
        const isAuto = typeSelect.value === 'auto';
        typeSelect.disabled = collectionEditorId !== null;
        if (manualPanel) manualPanel.classList.toggle('hidden', isAuto);
        if (autoPanel) autoPanel.classList.toggle('hidden', !isAuto);
        if (lockNote) lockNote.classList.toggle('hidden', collectionEditorId === null);
    }

    function updateCollectionPublishConstraint() {
        const type = document.getElementById('collection-section-type');
        const toggle = document.getElementById('collection-published');
        const guidance = document.getElementById('collection-publish-guidance');
        if (!type || !toggle || !guidance) return;
        const needsThree = type.value === 'manual' && collectionSelectedProducts.length < 3;
        if (!needsThree) {
            toggle.disabled = false;
            guidance.textContent = '';
            guidance.classList.add('hidden');
            return;
        }
        toggle.disabled = !toggle.checked;
        guidance.textContent = toggle.checked
            ? 'At least 3 products are required to publish. Turn Published off to save this collection as a draft.'
            : 'At least 3 products are needed to show on the site. You can save this collection as a draft.';
        guidance.classList.remove('hidden');
    }

    function normalizeCollectionEmoji(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            const first = segmenter.segment(text)[Symbol.iterator]().next();
            return first && first.value ? first.value.segment : '';
        }
        return Array.from(text)[0] || '';
    }

    function setCollectionAutoRule(value) {
        const select = document.getElementById('collection-auto-rule');
        if (!select) return;
        const rule = value || 'newest';
        const exists = Array.from(select.options).some(option => option.value === rule);
        if (!exists) {
            const option = document.createElement('option');
            option.value = rule;
            option.textContent = `Saved rule: ${rule}`;
            select.appendChild(option);
        }
        select.value = rule;
    }

    function resetCollectionEditorForm() {
        const form = document.getElementById('collection-editor-form');
        if (form) form.reset();
        collectionSelectedProducts = [];
        const type = document.getElementById('collection-section-type');
        if (type) { type.value = 'manual'; type.disabled = false; }
        const search = document.getElementById('collection-product-search');
        if (search) search.value = '';
        const emoji = document.getElementById('collection-emoji');
        if (emoji) emoji.value = '';
        setCollectionAutoRule('newest');
        ['collection-editor-error', 'collection-editor-success', 'collection-title-error', 'collection-date-error', 'collection-product-limit-message', 'collection-publish-guidance'].forEach(id => {
            const element = document.getElementById(id);
            if (element) { element.textContent = ''; element.classList.add('hidden'); }
        });
        const saveButton = document.getElementById('collection-save-btn');
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Collection'; }
        const cancelButton = document.getElementById('collection-cancel-btn');
        if (cancelButton) cancelButton.disabled = false;
        collectionEditorReady = false;
        updateCollectionTypePanels();
        renderCollectionProductPicker();
        syncCollectionPreview();
    }

    async function openCollectionEditor(id = null, trigger = null) {
        const requestId = ++collectionEditorRequest;
        collectionEditorId = id === null || id === undefined ? null : id;
        collectionEditorReturnFocus = trigger || document.activeElement;
        resetCollectionEditorForm();
        const drawer = document.getElementById('collection-drawer');
        const backdrop = document.getElementById('collection-drawer-backdrop');
        const heading = document.getElementById('collection-drawer-heading');
        const form = document.getElementById('collection-editor-form');
        const loading = document.getElementById('collection-editor-loading');
        const saveButton = document.getElementById('collection-save-btn');
        if (!drawer || !backdrop || !form || !loading) return;
        drawer.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('collection-editor-open');
        if (heading) heading.textContent = collectionEditorId === null ? 'New Collection' : 'Edit Collection';
        if (saveButton) saveButton.textContent = collectionEditorId === null ? 'Save Collection' : 'Save Changes';

        if (collectionEditorId === null) {
            collectionEditorReady = true;
            form.classList.remove('hidden');
            loading.classList.add('hidden');
            updateCollectionTypePanels();
            renderCollectionProductPicker();
            ensureCollectionProductCatalog().then(() => {
                if (requestId === collectionEditorRequest && !drawer.classList.contains('hidden')) renderCollectionProductPicker();
            });
            window.setTimeout(() => document.getElementById('collection-title')?.focus(), 50);
            return;
        }

        collectionEditorReady = false;
        form.classList.add('hidden');
        loading.classList.remove('hidden');
        try {
            const [detail] = await Promise.all([
                fetchCollectionDetail(collectionEditorId),
                ensureCollectionProductCatalog()
            ]);
            if (requestId !== collectionEditorRequest) return;
            fillCollectionEditor(detail);
            loading.classList.add('hidden');
            form.classList.remove('hidden');
            collectionEditorReady = true;
            renderCollectionProductPicker();
            window.setTimeout(() => document.getElementById('collection-title')?.focus(), 50);
        } catch (error) {
            if (requestId !== collectionEditorRequest) return;
            loading.classList.add('hidden');
            form.classList.remove('hidden');
            setCollectionEditorError(error.message || 'Could not load this collection. Close the editor and try again.');
            if (saveButton) saveButton.disabled = true;
        }
    }

    async function fetchCollectionDetail(id) {
        const response = await fetch(collectionApiUrl(`/${encodeURIComponent(String(id))}`), {
            headers: { Accept: 'application/json' }, cache: 'no-store'
        });
        await requireAdminResponse(response, 'Could not load collection');
        return response.json();
    }

    function fillCollectionEditor(detail) {
        const title = document.getElementById('collection-title');
        const emoji = document.getElementById('collection-emoji');
        const description = document.getElementById('collection-description');
        const type = document.getElementById('collection-section-type');
        const published = document.getElementById('collection-published');
        const start = document.getElementById('collection-start-date');
        const end = document.getElementById('collection-end-date');
        if (title) title.value = detail.title || '';
        if (emoji) emoji.value = detail.emoji || '';
        if (description) description.value = detail.description || '';
        if (type) {
            type.value = String(detail.section_type || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
            type.disabled = true;
        }
        if (published) published.checked = collectionIsPublished(detail);
        if (start) start.value = collectionDateToInput(detail.start_date);
        if (end) end.value = collectionDateToInput(detail.end_date);
        setCollectionAutoRule(detail.auto_rule || 'newest');
        const detailProducts = Array.isArray(detail.products) ? detail.products : [];
        collectionSelectedProducts = detailProducts.map(product => {
            const catalog = state.products.find(item => String(item.id) === String(product.id)) || {};
            return { ...catalog, ...product, id: product.id };
        });
        updateCollectionTypePanels();
        const titleError = document.getElementById('collection-title-error');
        if (titleError) titleError.classList.add('hidden');
        const dateError = document.getElementById('collection-date-error');
        if (dateError) dateError.classList.add('hidden');
        syncCollectionPreview();
    }

    function collectionDateToInput(raw) {
        if (!raw) return '';
        const value = String(raw);
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return value.slice(0, 16);
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    }

    function collectionDateToIso(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function closeCollectionDrawer(force = false) {
        if (collectionEditorSaving && !force) return;
        const drawer = document.getElementById('collection-drawer');
        const backdrop = document.getElementById('collection-drawer-backdrop');
        if (!drawer || drawer.classList.contains('hidden')) return;
        ++collectionEditorRequest;
        drawer.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        drawer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('collection-editor-open');
        collectionEditorId = null;
        collectionEditorReady = false;
        const focusTarget = collectionEditorReturnFocus && collectionEditorReturnFocus.isConnected
            ? collectionEditorReturnFocus
            : document.getElementById('collection-new-btn');
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    }

    function setCollectionEditorError(message) {
        const error = document.getElementById('collection-editor-error');
        if (!error) return;
        error.textContent = message || 'The collection could not be saved.';
        error.classList.remove('hidden');
        error.scrollIntoView({ block: 'nearest' });
    }

    async function saveCollectionEditor(event) {
        event.preventDefault();
        if (collectionEditorSaving || !collectionEditorReady) return;
        const titleInput = document.getElementById('collection-title');
        const titleError = document.getElementById('collection-title-error');
        const dateError = document.getElementById('collection-date-error');
        const editorError = document.getElementById('collection-editor-error');
        const editorSuccess = document.getElementById('collection-editor-success');
        const typeSelect = document.getElementById('collection-section-type');
        const publishedToggle = document.getElementById('collection-published');
        const startValue = document.getElementById('collection-start-date').value;
        const endValue = document.getElementById('collection-end-date').value;
        const title = titleInput ? titleInput.value.trim() : '';
        if (titleError) { titleError.textContent = ''; titleError.classList.add('hidden'); }
        if (dateError) { dateError.textContent = ''; dateError.classList.add('hidden'); }
        if (editorError) { editorError.textContent = ''; editorError.classList.add('hidden'); }
        if (editorSuccess) { editorSuccess.textContent = ''; editorSuccess.classList.add('hidden'); }

        if (!title) {
            if (titleError) { titleError.textContent = 'Title is required.'; titleError.classList.remove('hidden'); }
            if (titleInput) titleInput.focus();
            return;
        }
        if (startValue && endValue && new Date(endValue) < new Date(startValue)) {
            if (dateError) { dateError.textContent = 'End date must be after the start date.'; dateError.classList.remove('hidden'); }
            return;
        }
        const sectionType = typeSelect && typeSelect.value === 'auto' ? 'auto' : 'manual';
        const isPublished = Boolean(publishedToggle && publishedToggle.checked);
        if (sectionType === 'manual' && collectionSelectedProducts.length < 3 && isPublished) {
            updateCollectionPublishConstraint();
            if (editorError) {
                editorError.textContent = 'Choose at least 3 products or turn Published off to save as a draft.';
                editorError.classList.remove('hidden');
            }
            return;
        }

        const payload = {
            title,
            emoji: normalizeCollectionEmoji(document.getElementById('collection-emoji').value),
            description: document.getElementById('collection-description').value.trim(),
            section_type: sectionType,
            auto_rule: sectionType === 'auto' ? (document.getElementById('collection-auto-rule').value || 'newest') : null,
            product_ids: sectionType === 'manual' ? collectionSelectedProducts.map(product => product.id) : [],
            is_published: isPublished,
            start_date: collectionDateToIso(startValue),
            end_date: collectionDateToIso(endValue)
        };
        const isEditing = collectionEditorId !== null;
        const saveButton = document.getElementById('collection-save-btn');
        const cancelButton = document.getElementById('collection-cancel-btn');
        const form = document.getElementById('collection-editor-form');
        collectionEditorSaving = true;
        if (form) form.setAttribute('aria-busy', 'true');
        if (saveButton) { saveButton.disabled = true; saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving…'; }
        if (cancelButton) cancelButton.disabled = true;
        let successMessage = '';
        try {
            const response = await fetch(collectionApiUrl(isEditing ? `/${encodeURIComponent(String(collectionEditorId))}` : ''), {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload)
            });
            await requireAdminResponse(response, isEditing ? 'Could not save collection' : 'Could not create collection');
            await loadCollections({ silent: true });
            successMessage = isEditing ? 'Collection saved.' : 'Collection created.';
        } catch (error) {
            setCollectionEditorError(error.message || 'The collection could not be saved.');
        } finally {
            collectionEditorSaving = false;
            if (form) form.removeAttribute('aria-busy');
            if (saveButton) { saveButton.disabled = false; saveButton.textContent = isEditing ? 'Save Changes' : 'Save Collection'; }
            if (cancelButton) cancelButton.disabled = false;
        }
        if (successMessage) {
            closeCollectionDrawer(true);
            showCollectionsSuccess(successMessage);
        }
    }

    function renderActiveTab(tabId) {
        hideAlert();
        if (tabId === 'dashboard-tab') loadDashboardSummary();
        if (tabId === 'collections-tab') loadCollections();
        if (tabId === 'sponsored-tab') loadSponsored();
        if (tabId === 'products-tab') renderProducts();
        if (tabId === 'alternatives-tab') fetchForeignTools();
        if (tabId === 'submissions-tab') {
            // Show whatever is cached straight away, then re-fetch from the
            // server so submissions made AFTER the admin page loaded (the ones
            // the dashboard summary and the bell already count) appear here.
            renderSubmissions();
            refreshSubmissions();
        }
        if (tabId === 'developers-tab') {
            renderDevelopers();
            renderDeveloperUpdatePicker();
        }
        if (tabId === 'newsletter-tab') {
            renderNewsletterPicker();
            if (subscribersCache === null) fetchNewsletterSubscribers();
        }
        if (tabId === 'claims-tab') fetchClaims();
        if (tabId === 'analytics-tab') fetchSearchAnalytics();
        if (tabId === 'banner-tab') loadBannerAdmin();
        if (tabId === 'spotlight-applications-tab') loadSpotApplications();
        if (tabId === 'spotlight-list-tab') loadSpotlights();
        if (tabId === 'spotlight-hires-tab') loadSpotHires();
        if (tabId === 'spotlight-add-founder-tab') initSpotAddFounderView();
    }

    function getActiveTabId() {
        const active = document.querySelector('.tab-content.active');
        return active ? active.id : 'dashboard-tab';
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
       Data loading (fetch full lists, cache in state, render active page)
       ========================================================================== */
    async function loadAllData() {
        const initiallyOnDashboard = getActiveTabId() === 'dashboard-tab';
        if (initiallyOnDashboard) loadDashboardSummary();
        const productsPromise = fetchProductsData();
        coreProductsLoadPromise = productsPromise;
        await Promise.all([productsPromise, fetchSubmissionsData(), fetchDevelopersData()]);
        if (coreProductsLoadPromise === productsPromise) coreProductsLoadPromise = null;
        if (getActiveTabId() !== 'dashboard-tab') renderActiveTab(getActiveTabId());
    }

    async function refreshProducts() {
        await fetchProductsData();
        renderProducts();
    }

    async function refreshSubmissions() {
        await fetchSubmissionsData();
        renderSubmissions();
    }

    async function fetchProductsData() {
        try {
            const res = await fetch(`${API_URL}/products/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch products. Check admin key.");
            state.products = await res.json();
            collectionProductCatalogError = null;
            collectionProductCatalogReady = true;
        } catch (error) {
            showAlert('error', error.message);
            state.products = [];
            collectionProductCatalogError = error.message || 'Could not load the admin product catalog.';
            collectionProductCatalogReady = true;
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
                            <button class="dot-btn" onclick="toggleActionMenu(this)">⋮</button>
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
    // Readable labels for backend wire keys (everything else is humanized).
    const ADMIN_SERVER_FIELD_LABELS = {
        contact_email: 'Contact email',
        startup_website: 'Startup website',
        founder_name: 'Founder name',
        startup_name: 'Startup name',
        photo_url: 'Photo URL',
        what_it_does: 'What the startup does',
        open_to_work: 'Open to work',
        consent: 'Consent to publish',
        guidelines_agreed: 'Guidelines agreement',
        save_as_draft: 'Save as draft',
        product_ids: 'Products',
        x_url: 'X URL',
        why_believe: 'Why believe in Nigeria',
        body_opening: 'Opening',
        body_building: "What they're building",
        body_why_started: 'Why they started',
        body_headed: "Where they're headed"
    };
    function humanizeWireKey(key) {
        return String(key)
            .replace(/_url$/, ' URL')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, ch => ch.toUpperCase());
    }
    async function requireAdminResponse(res, fallback) {
        if (res.ok) return;
        const data = await parseApiResponse(res);
        const detail = data && (data.detail || data.message);
        // FastAPI 422 detail entries are {loc: [..., '<key>'], msg}: name the
        // exact field instead of repeating bare "field required" rows.
        const message = Array.isArray(detail)
            ? detail.map(item => {
                if (!item || typeof item !== 'object') return String(item);
                const loc = Array.isArray(item.loc) ? item.loc : [];
                const key = loc.length ? String(loc[loc.length - 1]) : null;
                const label = key ? (ADMIN_SERVER_FIELD_LABELS[key] || humanizeWireKey(key)) : null;
                const msg = item.msg || item.message || JSON.stringify(item);
                return label ? `${label}: ${msg}` : msg;
            }).filter(Boolean).join('; ')
            : (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : ''));
        throw new Error(message || `${fallback} (HTTP ${res.status}).`);
    }

    /* ==========================================================================
       Sponsored picks - the homepage "Sponsored" section, max 10 products.
       Data: this tab reuses the Products tab data, not a separate list
       endpoint - the same cached admin catalog (GET /products/admin/all via
       fetchProductsData) drives the search box, the category filter and the
       10-per-page pagination (the shared paginate/renderPagination helpers,
       same as the Products tab). Every product object carries its own
       is_sponsored flag; only live products are listed (the same live test
       the Collections picker uses).
       Toggle: the switch on a row PUTs /products/{product_id}/sponsor
       ?admin_key= with NO body - the single endpoint flips the flag both
       ways. The id sent is the product's own database id field (id, with a
       defensive _id fallback) - never a row index, never the slug - and it
       is logged to the console right before the request fires so it can be
       matched against the Products tab. Updates are optimistic with
       rollback: on server rejection (e.g. the 10-pick cap) the flag and the
       switch are restored and the server message shows inline on the row.
       Order: the "Currently Sponsored" panel under the list mirrors the
       homepage order. Arrows rearrange it locally, then the FULL ordered id
       list is saved with PUT /products/sponsored/reorder {ids:[...]}; a
       failed save rolls the local order back and surfaces the error banner.
       ========================================================================== */
    const SPONSORED_LIMIT = 10;
    const SPONSORED_PAGE_SIZE = 10;
    const sponsoredState = {
        filter: { search: '', category: '' },
        page: 1,
        busyIds: new Set(),
        rowErrors: new Map(),
        order: [],
        orderSeeded: false,
        reorderBusy: false
    };
    let sponsoredSuccessTimer = 0;

    function setupSponsored() {
        const list = document.getElementById('sponsored-list');
        const search = document.getElementById('sponsored-search');
        const category = document.getElementById('sponsored-category-filter');
        const currentList = document.getElementById('sponsored-current-list');
        if (!list) return;

        if (search) search.addEventListener('input', () => {
            sponsoredState.filter.search = search.value;
            sponsoredState.page = 1; // filters always jump back to page 1
            renderSponsored();
        });
        if (category) category.addEventListener('change', () => {
            sponsoredState.filter.category = category.value;
            sponsoredState.page = 1; // filters always jump back to page 1
            renderSponsored();
        });
        list.addEventListener('change', handleSponsoredListChange);
        if (currentList) currentList.addEventListener('click', handleSponsoredMoveClick);
    }

    /* ---------- ids ---------- */

    // The wire id for a product row: its own database id field. The backend
    // 404s the sponsor endpoint when this does not match a real product, so
    // it must come from the row data itself - never a render index or slug.
    function sponsoredProductId(product) {
        if (!product) return null;
        const primary = product.id;
        const fallback = product._id;
        const value = (primary !== undefined && primary !== null && String(primary).trim() !== '')
            ? primary
            : ((fallback !== undefined && fallback !== null && String(fallback).trim() !== '') ? fallback : null);
        return value;
    }

    function sponsoredIdKey(product) {
        const id = sponsoredProductId(product);
        return id === null ? null : String(id);
    }

    function findSponsoredProduct(key) {
        return (Array.isArray(state.products) ? state.products : []).find(item => sponsoredIdKey(item) === String(key)) || null;
    }

    /* ---------- data (reuses the Products tab catalog) ---------- */

    // Server may send true/false/1/0/"true" - collapse to a bool, keep fallback on absence.
    function sponsoredFlag(value, fallback) {
        if (value === undefined || value === null) return fallback;
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function sponsoredIsPicked(product) {
        return !!product && sponsoredFlag(product.is_sponsored, false);
    }

    // Every live product from the cached catalog - the same live test the
    // Collections picker applies, so deactivated/hidden products stay out.
    function getSponsoredCatalog() {
        return (Array.isArray(state.products) ? state.products : []).filter(collectionProductIsLive);
    }

    function getFilteredSponsoredProducts() {
        const query = (sponsoredState.filter.search || '').trim().toLowerCase();
        const category = sponsoredState.filter.category;
        return getSponsoredCatalog().filter(product => {
            if (category && (product.category || '') !== category) return false;
            if (query && !(product.name || '').toLowerCase().includes(query)) return false;
            return true;
        });
    }

    function sponsoredPickedCount() {
        return getSponsoredCatalog().filter(sponsoredIsPicked).length;
    }

    // The single sponsor endpoint: PUT flips the product's is_sponsored flag. No body.
    function sponsoredApiUrl(productId, desired) {
        const flag = (desired === undefined) ? '' : `&sponsored=${desired}`;
        return `${API_URL}/products/${encodeURIComponent(String(productId))}/sponsor?admin_key=${adminKey}${flag}`;
    }
    // Saves the full homepage order of sponsored picks. Body: {ids:[...]}.
    function sponsoredReorderApiUrl() {
        return `${API_URL}/products/sponsored/reorder?admin_key=${adminKey}`;
    }

    // Primary population comes from the shared filter populator above
    // (ENOVOX_CONFIG). This backfill only runs when that left the select
    // empty, deriving categories from the cached catalog instead.
    function populateSponsoredCategoryFilter() {
        const sel = document.getElementById('sponsored-category-filter');
        if (!sel || sel.options.length > 1) return;
        const fromConfig = (typeof ENOVOX_CONFIG !== 'undefined' && Array.isArray(ENOVOX_CONFIG.CATEGORIES) && ENOVOX_CONFIG.CATEGORIES.length)
            ? ENOVOX_CONFIG.CATEGORIES
            : [];
        const seen = new Set(fromConfig);
        const extra = getSponsoredCatalog().map(product => product && product.category).filter(cat => cat && !seen.has(cat)).sort();
        fromConfig.concat(extra).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            sel.appendChild(option);
        });
    }

    function loadSponsored() {
        const loading = document.getElementById('sponsored-loading');
        clearSponsoredError();
        if (!collectionProductCatalogReady && loading) loading.classList.remove('hidden');
        // Same data path as the Products tab - the cached admin catalog fetch.
        ensureCollectionProductCatalog().then(() => {
            if (loading) loading.classList.add('hidden');
            if (collectionProductCatalogError) setSponsoredError(collectionProductCatalogError);
            populateSponsoredCategoryFilter();
            renderSponsored();
        });
    }

    /* ---------- order of the sponsored picks ---------- */

    // Optional server-provided ordering fields, if the catalog ever grows one.
    function sponsoredPositionHint(product) {
        const raw = product && (product.sponsored_position !== undefined ? product.sponsored_position
            : (product.sponsor_order !== undefined ? product.sponsor_order : product.sponsored_order));
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    // Keeps sponsoredState.order in step with the flags on the catalog: on
    // first load it seeds from the catalog (position hints first), afterwards
    // it preserves the arranged order, drops picks that were toggled off and
    // appends fresh picks at the end.
    function syncSponsoredOrder() {
        if (!collectionProductCatalogReady || collectionProductCatalogError) return;
        const picked = getSponsoredCatalog().filter(sponsoredIsPicked);
        const byKey = new Map();
        picked.forEach(product => {
            const key = sponsoredIdKey(product);
            if (key !== null && !byKey.has(key)) byKey.set(key, product);
        });
        if (!sponsoredState.orderSeeded) {
            sponsoredState.orderSeeded = true;
            sponsoredState.order = picked.slice().sort((a, b) => {
                const pa = sponsoredPositionHint(a);
                const pb = sponsoredPositionHint(b);
                if (pa === null && pb === null) return 0;
                if (pa === null) return 1;
                if (pb === null) return -1;
                return pa - pb;
            }).map(sponsoredIdKey).filter(key => key !== null);
            return;
        }
        const kept = sponsoredState.order.filter(key => byKey.has(key));
        const have = new Set(kept);
        sponsoredState.order = kept.concat(picked.filter(product => {
            const key = sponsoredIdKey(product);
            return key !== null && !have.has(key);
        }).map(sponsoredIdKey));
    }

    /* ---------- render ---------- */

    // Real <img> logo like the rest of the panel; the letter tile behind it is
    // only a placeholder until the image reports a successful load, and stays
    // as the fallback when the URL is missing or the image errors out.
    function sponsoredLogoCell(name, logoUrl) {
        const letter = escapeHTML((name || 'S').trim().charAt(0).toUpperCase() || 'S');
        const image = logoUrl
            ? `<img class="sponsored-logo-img" src="${escapeHTML(logoUrl)}" alt="" loading="lazy" onload="this.parentElement.classList.add('has-logo')" onerror="this.remove()">`
            : '';
        return `<span class="collection-product-logo sponsored-logo" aria-hidden="true"><span class="sponsored-logo-letter">${letter}</span>${image}</span>`;
    }

    function renderSponsored() {
        const list = document.getElementById('sponsored-list');
        const empty = document.getElementById('sponsored-empty');
        const slots = document.getElementById('sponsored-slots');
        if (!list || !empty) return;

        syncSponsoredOrder();

        if (slots) {
            const picked = sponsoredPickedCount();
            slots.textContent = `${picked} of ${SPONSORED_LIMIT} picked`;
            slots.classList.toggle('sponsored-slots-full', picked >= SPONSORED_LIMIT);
            updateSponsoredMeter(picked);
        }

        const pagination = document.getElementById('sponsored-pagination');
        if (!collectionProductCatalogReady || collectionProductCatalogError) {
            list.innerHTML = '';
            if (pagination) pagination.innerHTML = '';
            if (collectionProductCatalogError) {
                empty.textContent = 'The product list could not be loaded. Fix the error above and reopen this tab.';
                empty.classList.remove('hidden');
            } else {
                empty.classList.add('hidden');
            }
            renderSponsoredCurrent();
            return;
        }

        const catalog = getSponsoredCatalog();
        const filtered = getFilteredSponsoredProducts();
        const { pageItems, totalPages, safePage } = paginate(filtered, sponsoredState.page, SPONSORED_PAGE_SIZE);
        sponsoredState.page = safePage;

        if (!filtered.length) {
            list.innerHTML = '';
            if (pagination) pagination.innerHTML = '';
            empty.textContent = catalog.length
                ? 'No products match your search.'
                : 'No live products yet. Once a product is live it appears here, ready to sponsor.';
            empty.classList.remove('hidden');
            renderSponsoredCurrent();
            return;
        }
        empty.classList.add('hidden');

        list.innerHTML = pageItems.map(product => {
            const pid = sponsoredProductId(product);
            const key = sponsoredIdKey(product);
            const idAttr = key === null ? '' : escapeHTML(key);
            const name = escapeHTML(product.name || 'Untitled product');
            const picked = sponsoredIsPicked(product);
            const busy = key !== null && sponsoredState.busyIds.has(key);
            const rowError = key !== null ? (sponsoredState.rowErrors.get(key) || '') : '';
            const noId = pid === null;
            return `<div class="sponsored-product-row" ${key === null ? '' : `data-sponsored-id="${idAttr}"`}>
                ${sponsoredLogoCell(product.name, product.logo_url)}
                <div class="collection-product-copy"><strong>${name}</strong><small>${escapeHTML(product.category || 'Uncategorised')}</small></div>
                <div class="sponsored-toggle-cell">
                    <label class="collection-publish-toggle sponsored-active-toggle" aria-label="Toggle ${name} sponsored state">
                        <input type="checkbox" class="sponsored-toggle-input" ${key === null ? '' : `data-sponsored-id="${idAttr}"`} ${picked ? 'checked' : ''} ${busy || noId ? 'disabled' : ''} ${noId ? 'title="This product has no database id the sponsor endpoint can use"' : ''}>
                        <span class="collection-toggle-track" aria-hidden="true"><span></span></span>
                        <span class="sponsored-active-caption"><small>${picked ? 'Sponsored' : 'Not sponsored'}</small></span>
                    </label>
                    <p class="sponsored-row-error${rowError ? '' : ' hidden'}" role="alert">${escapeHTML(rowError)}</p>
                </div>
            </div>`;
        }).join('');

        renderPagination('sponsored-pagination', filtered.length, sponsoredState.page, totalPages, (page) => {
            sponsoredState.page = page;
            renderSponsored();
        });

        renderSponsoredCurrent();
    }

    function updateSponsoredMeter(picked) {
        const countEl = document.getElementById('sponsored-meter-count');
        const noteEl = document.getElementById('sponsored-meter-note');
        const bar = document.getElementById('sponsored-meter-bar');
        if (countEl) countEl.textContent = String(picked);
        if (noteEl) {
            const left = Math.max(0, SPONSORED_LIMIT - picked);
            noteEl.textContent = left === 0
                ? 'All slots are used. Switch one off to add another.'
                : `${left} ${left === 1 ? 'slot' : 'slots'} left. The homepage carousel shows up to ${SPONSORED_LIMIT}.`;
        }
        if (bar) Array.from(bar.children).forEach((segment, index) => segment.classList.toggle('is-on', index < picked));
    }

    function renderSponsoredCurrent() {
        const wrap = document.getElementById('sponsored-current-list');
        const empty = document.getElementById('sponsored-current-empty');
        const count = document.getElementById('sponsored-current-count');
        if (!wrap || !empty) return;
        const order = sponsoredState.order.filter(key => {
            const product = findSponsoredProduct(key);
            return product && sponsoredIsPicked(product);
        });
        if (count) count.textContent = `${order.length} of ${SPONSORED_LIMIT}`;
        if (!order.length) {
            wrap.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        wrap.innerHTML = order.map((key, index) => {
            const product = findSponsoredProduct(key);
            if (!product) return '';
            const keyAttr = escapeHTML(String(key));
            const name = escapeHTML(product.name || 'Untitled product');
            const busyAttr = sponsoredState.reorderBusy ? 'disabled' : '';
            return `<div class="sponsored-current-row" data-sponsored-key="${keyAttr}">
                <span class="sponsored-current-position" aria-hidden="true">${index + 1}</span>
                ${sponsoredLogoCell(product.name, product.logo_url)}
                <div class="collection-product-copy"><strong>${name}</strong><small>${escapeHTML(product.category || '')}</small></div>
                <div class="sponsored-order-buttons" aria-label="Change sponsored order">
                    <button type="button" class="btn-secondary btn-small" data-sponsored-move="up" data-sponsored-key="${keyAttr}" aria-label="Move ${name} up" ${index === 0 ? 'disabled' : busyAttr}><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
                    <button type="button" class="btn-secondary btn-small" data-sponsored-move="down" data-sponsored-key="${keyAttr}" aria-label="Move ${name} down" ${index === order.length - 1 ? 'disabled' : busyAttr}><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                </div>
            </div>`;
        }).join('');
    }

    function setSponsoredError(message) {
        const el = document.getElementById('sponsored-error');
        if (!el) return;
        el.textContent = message || 'The sponsored request failed.';
        el.classList.remove('hidden');
    }
    function clearSponsoredError() {
        const el = document.getElementById('sponsored-error');
        if (!el) return;
        el.textContent = '';
        el.classList.add('hidden');
    }
    function showSponsoredSuccess(message) {
        const el = document.getElementById('sponsored-success');
        if (!el) return;
        window.clearTimeout(sponsoredSuccessTimer);
        el.textContent = message;
        el.classList.remove('hidden');
        sponsoredSuccessTimer = window.setTimeout(() => el.classList.add('hidden'), 5000);
    }

    /* ---------- toggle action ---------- */

    async function handleSponsoredListChange(event) {
        const input = event.target.closest('.sponsored-toggle-input');
        if (!input) return;
        const key = input.dataset.sponsoredId;
        const product = key === undefined ? null : findSponsoredProduct(key);
        if (!product) { input.checked = false; return; }
        const pid = sponsoredProductId(product);
        const previous = sponsoredIsPicked(product);
        if (sponsoredState.busyIds.has(key)) { input.checked = previous; return; }
        if (pid === null) {
            // Defensive: never fire the sponsor request without a real wire id.
            input.checked = previous;
            sponsoredState.rowErrors.set(key, 'This product has no database id the sponsor endpoint can use.');
            renderSponsored();
            return;
        }

        const next = !previous;
        const url = sponsoredApiUrl(pid, next);
        console.log('[sponsored] toggle for', JSON.stringify(product.name), '- sending product id', JSON.stringify(pid), '-', url);
        sponsoredState.rowErrors.delete(key);
        product.is_sponsored = next; // optimistic: the endpoint flips the flag on every call
        sponsoredState.busyIds.add(key);
        clearSponsoredError();
        renderSponsored();
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: { Accept: 'application/json' }
            });
            const reply = response.clone();
            await requireAdminResponse(response, 'Could not update the sponsored flag');
            try {
                const result = await reply.json();
                if (typeof result.is_sponsored === 'boolean') product.is_sponsored = result.is_sponsored;
            } catch (e) { /* keep the optimistic value */ }
            showSponsoredSuccess(product.is_sponsored
                ? '"' + (product.name || 'Product') + '" added to the Sponsored section.'
                : '"' + (product.name || 'Product') + '" removed from the Sponsored section.');
        } catch (error) {
            // Roll the flag and the switch back: a rejected toggle (e.g. the
            // 10-pick cap) must not stay visibly on; the message stays inline
            // on the row that failed.
            product.is_sponsored = previous;
            sponsoredState.rowErrors.set(key, error.message || 'Could not update the sponsored flag.');
        } finally {
            sponsoredState.busyIds.delete(key);
            renderSponsored();
        }
    }

    /* ---------- reorder action ---------- */

    function handleSponsoredMoveClick(event) {
        const button = event.target.closest('[data-sponsored-move]');
        if (!button || button.disabled) return;
        moveSponsoredPick(button.dataset.sponsoredKey, button.dataset.sponsoredMove === 'up' ? -1 : 1);
    }

    async function moveSponsoredPick(key, direction) {
        if (sponsoredState.reorderBusy) return;
        const previousOrder = sponsoredState.order.slice();
        const from = previousOrder.indexOf(String(key));
        const to = from + direction;
        if (from < 0 || to < 0 || to >= previousOrder.length) return;
        const nextOrder = previousOrder.slice();
        [nextOrder[from], nextOrder[to]] = [nextOrder[to], nextOrder[from]];
        const idsBody = nextOrder.map(k => {
            const product = findSponsoredProduct(k);
            return product ? sponsoredProductId(product) : k;
        });
        sponsoredState.order = nextOrder;
        sponsoredState.reorderBusy = true;
        clearSponsoredError();
        renderSponsored();
        try {
            const response = await fetch(sponsoredReorderApiUrl(), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ ids: idsBody })
            });
            await requireAdminResponse(response, 'Could not save the sponsored order');
            showSponsoredSuccess('Sponsored order saved.');
        } catch (error) {
            sponsoredState.order = previousOrder; // roll the local order back
            setSponsoredError(error.message || 'Could not save the sponsored order.');
        } finally {
            sponsoredState.reorderBusy = false;
            renderSponsored();
        }
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
                    window.toggleActionMenu(menuBtn);
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
            if (!productModal.classList.contains('hidden')) loadProductAlternatives(id, category.value);
        });
        document.getElementById('retry-product-alternatives').addEventListener('click', () => {
            const id = document.getElementById('edit_product_id').value;
            loadProductAlternatives(id, category.value);
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
        document.getElementById('product-alternatives-status').textContent = 'Choose a category to see matching foreign tools.';
        document.getElementById('product-alternatives-error').classList.add('hidden');
        document.getElementById('retry-product-alternatives').classList.add('hidden');
    }

    async function loadProductAlternatives(id, category) {
        const productId = id ? String(id) : null;
        const requestId = ++productAlternativesRequest;
        productAlternativesState = { id: productId, category, ready: false };
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
            const toolsRequest = fetch(`${API_URL}/products/admin/alternatives/foreign-tools?admin_key=${encodeURIComponent(adminKey)}&category=${encodeURIComponent(category)}`);
            const linksRequest = productId
                ? fetch(`${API_URL}/products/${encodeURIComponent(productId)}/alternatives`)
                : Promise.resolve(null);
            const [toolsRes, linkedRes] = await Promise.all([toolsRequest, linksRequest]);
            await requireAdminResponse(toolsRes, 'Could not load foreign tools in this category');
            if (linkedRes) await requireAdminResponse(linkedRes, 'Could not load linked alternatives');

            const tools = await toolsRes.json();
            const linked = linkedRes ? await linkedRes.json() : [];
            if (!Array.isArray(tools) || !Array.isArray(linked)) {
                throw new Error('Invalid alternatives response from the server.');
            }
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

    function extractCreatedProductId(data) {
        if (!data || typeof data !== 'object') return null;
        const candidates = [
            data.id,
            data.product_id,
            data.product && data.product.id,
            data.product && data.product.product_id,
            data.data && data.data.id,
            data.data && data.data.product && data.data.product.id
        ];
        const candidate = candidates.find(value => value !== undefined && value !== null && String(value).trim() !== '');
        return candidate === undefined ? null : String(candidate);
    }

    function findCreatedProductId(payload) {
        const normalize = value => String(value || '').trim().toLocaleLowerCase();
        const normalizeWebsite = value => normalize(value).replace(/\/+$/, '');
        const name = normalize(payload.name);
        const website = normalizeWebsite(payload.website);
        const category = normalize(payload.category);
        const matches = state.products.filter(product =>
            normalize(product.name) === name &&
            normalizeWebsite(product.website) === website &&
            normalize(product.category) === category &&
            product.id !== undefined && product.id !== null
        );
        return matches.length === 1 ? String(matches[0].id) : null;
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
        if (status === 401 || status === 403) return 'Admin key rejected. Sign out and log in again.';
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
                    <label id="detail-alternatives-label">Alternative To${isPending ? ' *' : ''}</label>
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
        // The required star only applies when this category has tools to pick from.
        const label = document.getElementById('detail-alternatives-label');
        if (label) label.textContent = `Alternative To${alt.isPending && alt.available.size ? ' *' : ''}`;
        const count = alt.selected.size;
        if (!alt.available.size && !count) {
            // Nothing exists to pick in this category, so nothing is required.
            status.classList.remove('is-missing-selection');
            status.textContent = 'No foreign tools exist in this category, so an alternative is not required.';
            return;
        }
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
            if (!alt.sourceKnown && alt.available.size > 0) {
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
        // Alternative To is only compulsory when this category actually has
        // foreign tools to choose from. Once the list for the CURRENT category
        // has loaded and is empty, there is nothing to pick, so it must not
        // block approval. (A list that has not loaded yet is still not treated
        // as "empty": that case keeps waiting, so a slow or failed request can
        // never let an unlinked product through.)
        const altListLoaded = alt.ready && alt.category === category;
        const noToolsInCategory = altListLoaded && alt.available.size === 0;
        // Otherwise it is required even for an otherwise unchanged review.
        // An empty detail response must never silently publish an unlinked product.
        if (!alt.selected.size && !noToolsInCategory) {
            showSubmissionReviewError(altListLoaded
                ? 'Alternative is compulsory, pick one.'
                : 'Wait for matching alternatives to load before approving.', true);
            return;
        }
        if (categoryChanged || alternativesChanged) {
            if (!category || !alt.ready || alt.category !== category) {
                showSubmissionReviewError('Wait for matching alternatives to load before approving changes to the category or selection.', true);
                return;
            }
            if (!alt.selected.size && !noToolsInCategory) {
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

    
    function closeActionMenus() {
        document.querySelectorAll('.action-menu.active').forEach(menu => {
            menu.classList.remove('active');
            const dropdown = menu.querySelector('.dropdown-content');
            if (dropdown) dropdown.removeAttribute('style'); // drop the fixed positioning
        });
    }

    // Opens the row menu as a fixed overlay so table scroll containers can't clip it.
    function positionActionMenu(menu) {
        const btn = menu.querySelector('.dot-btn');
        const dropdown = menu.querySelector('.dropdown-content');
        if (!btn || !dropdown) return;
        dropdown.style.position = 'fixed';
        dropdown.style.right = 'auto';
        const b = btn.getBoundingClientRect();
        const d = dropdown.getBoundingClientRect();
        const gap = 4;
        const margin = 8;
        let top = b.bottom + gap;
        // Not enough room below? Open upward instead.
        if (top + d.height > window.innerHeight - margin && b.top - gap - d.height >= margin) {
            top = b.top - gap - d.height;
        }
        top = Math.max(margin, Math.min(top, window.innerHeight - d.height - margin));
        const left = Math.max(margin, Math.min(b.right - d.width, window.innerWidth - d.width - margin));
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
    }

    window.toggleActionMenu = function(btn) {
        const menu = btn.closest('.action-menu');
        if (!menu) return;
        const wasOpen = menu.classList.contains('active');
        closeActionMenus();
        if (!wasOpen) {
            menu.classList.add('active');
            positionActionMenu(menu);
        }
    };

    window.onclick = function(event) {
        if (!event.target.matches('.dot-btn')) closeActionMenus();
    };
    window.addEventListener('resize', closeActionMenus, { passive: true });
    // Capture phase so scrolling .admin-main or a table container also closes it.
    document.addEventListener('scroll', () => {
        if (document.querySelector('.action-menu.active')) closeActionMenus();
    }, true);
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

                    // Keep the Submissions tab's cached list in step with what the
                    // bell just saw, so the tab never lags behind the notification.
                    if (Array.isArray(subs)) {
                        state.submissions = subs;
                        if (getActiveTabId() === 'submissions-tab') renderSubmissions();
                    }

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
    let claimsFilter = 'pending'; // default view; other tabs filter client-side on claim.status

    function setupClaims() {
        const refreshBtn = document.getElementById('claims-refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => fetchClaims());

        const tabs = document.getElementById('claims-status-tabs');
        if (tabs) tabs.addEventListener('click', event => {
            const tab = event.target.closest('[data-claims-status]');
            if (!tab || tab.dataset.claimsStatus === claimsFilter) return;
            claimsFilter = tab.dataset.claimsStatus;
            renderClaims();
        });

        const list = document.getElementById('claims-list');
        if (list) list.addEventListener('click', onClaimsListClick);
    }

    // Missing status is treated as pending; unknown values stay as-is (visible under "All" only).
    function claimStatus(claim) {
        return String((claim && claim.status) || 'pending').toLowerCase();
    }

    async function fetchClaims() {
        const loadingEl = document.getElementById('claims-loading');
        const errorEl = document.getElementById('claims-error');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        try {
            const res = await fetch(`${API_URL}/products/admin/claims/all?admin_key=${encodeURIComponent(adminKey)}`);
            if (!res.ok) throw new Error('Could not load claims.');
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

    function renderClaimTabs() {
        const counts = { pending: 0, approved: 0, rejected: 0, all: claimsCache.length };
        claimsCache.forEach(claim => {
            const status = claimStatus(claim);
            if (status in counts) counts[status] += 1;
        });
        document.querySelectorAll('#claims-status-tabs [data-claims-status]').forEach(tab => {
            const key = tab.dataset.claimsStatus;
            const active = key === claimsFilter;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            const count = tab.querySelector('[data-claims-count]');
            if (count) count.textContent = String(counts[key] || 0);
        });
    }

    function claimsEmptyMessage() {
        if (claimsFilter === 'all') return 'No claims yet';
        return `No ${claimsFilter} claims`;
    }

    function renderClaims() {
        renderClaimTabs();
        const list = document.getElementById('claims-list');
        const emptyEl = document.getElementById('claims-empty');
        if (!list || !emptyEl) return;
        list.innerHTML = '';
        const rows = claimsFilter === 'all'
            ? claimsCache
            : claimsCache.filter(claim => claimStatus(claim) === claimsFilter);
        if (rows.length === 0) {
            emptyEl.textContent = claimsEmptyMessage();
            emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl.classList.add('hidden');
        rows.forEach(claim => list.appendChild(buildClaimCard(claim)));
    }

    function claimStatusBadgeHTML(status) {
        if (status === 'approved') return '<span class="badge active">Approved</span>';
        if (status === 'rejected') return '<span class="badge deactivated">Rejected</span>';
        if (status === 'pending') return '<span class="badge new">Pending</span>';
        return `<span class="badge feature">${escapeHTML(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
    }

    function buildClaimCard(claim) {
        const card = document.createElement('div');
        card.className = 'claim-card';
        card.setAttribute('data-claim-id', claim.id);

        const status = claimStatus(claim);
        const isPending = status === 'pending';
        const product = findClaimProduct(claim);
        const productName = product ? product.name : `Product #${claim.product_id}`;
        const logoHtml = product && product.logo_url
            ? `<img src="${escapeHTML(product.logo_url)}" alt="" class="claim-product-logo" onerror="this.style.display='none'">`
            : '';
        const socialHtml = claim.social_url
            ? `<a href="${escapeHTML(claim.social_url)}" target="_blank" rel="noopener">${escapeHTML(claim.social_url)}</a>`
            : '<span class="text-muted">—</span>';
        const reason = claim.rejection_reason || claim.reason || '';
        const reasonHtml = (status === 'rejected' && reason)
            ? `<div class="claim-rejection-note"><strong>Rejection reason:</strong> ${escapeHTML(reason)}</div>`
            : '';
        const actionsHtml = isPending ? `
            <div class="claim-card-actions">
                <button type="button" class="btn-success" data-claim-action="approve" data-claim-id="${claim.id}">Approve</button>
                <button type="button" class="btn-danger" data-claim-action="reject" data-claim-id="${claim.id}">Reject</button>
            </div>
            <div class="claim-reject-row hidden">
                <input type="text" class="claim-reject-input" placeholder="Reason for rejection (required)">
                <button type="button" class="btn-danger btn-small" data-claim-action="reject-confirm" data-claim-id="${claim.id}">Confirm Reject</button>
                <button type="button" class="btn-secondary btn-small" data-claim-action="reject-cancel" data-claim-id="${claim.id}">Cancel</button>
                <div class="error-text hidden claim-reject-error">A reason is required to reject a claim.</div>
            </div>` : '';

        card.innerHTML = `
            <div class="claim-card-head">
                <div class="claim-product">${logoHtml}<strong>${escapeHTML(productName)}</strong>${claimStatusBadgeHTML(status)}</div>
                <span class="text-muted claim-date">Submitted ${escapeHTML(formatClaimDate(claim.created_at))}</span>
            </div>
            <div class="claim-card-body">
                <div><span class="claim-label">Claimant</span>${escapeHTML(claim.name || '—')}</div>
                <div><span class="claim-label">Email</span>${escapeHTML(claim.email || '—')}</div>
                <div><span class="claim-label">Role</span>${escapeHTML(claim.role || '—')}</div>
                <div><span class="claim-label">Social / LinkedIn</span>${socialHtml}</div>
            </div>
            ${reasonHtml}
            ${actionsHtml}
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
            claim.status = 'approved'; // moves out of Pending, into Approved
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
            const claim = claimsCache.find(c => c.id === claimId);
            if (claim) { claim.status = 'rejected'; claim.rejection_reason = reason; }
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
                <h2>Search Analytics</h2>
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

    /* ==========================================================================
       SPOTLIGHT ADMIN
       Applications review + AI drafting, spotlight editor, hires and the
       manual Add Founder view. Every endpoint lives under /spotlight/admin and
       takes the admin key as ?admin_key=...
       ========================================================================== */
    const SPOT_DRAFT_FIELDS = ['headline', 'summary', 'body_opening', 'body_building', 'quote', 'body_why_started', 'body_headed', 'why_believe'];
    const SPOT_SOCIAL_KEYS = ['instagram_url', 'x_url', 'facebook_url', 'linkedin_url', 'tiktok_url', 'github_url'];
    const SPOT_SOCIAL_META = {
        instagram_url: { icon: 'fa-brands fa-instagram', label: 'Instagram' },
        x_url: { icon: 'fa-brands fa-x-twitter', label: 'X' },
        facebook_url: { icon: 'fa-brands fa-facebook-f', label: 'Facebook' },
        linkedin_url: { icon: 'fa-brands fa-linkedin-in', label: 'LinkedIn' },
        tiktok_url: { icon: 'fa-brands fa-tiktok', label: 'TikTok' },
        github_url: { icon: 'fa-brands fa-github', label: 'GitHub' }
    };
    const SPOT_APP_STATUS_TABS = ['pending', 'approved', 'rejected', 'draft'];
    const SPOT_LIST_STATUS_TABS = ['all', 'draft', 'published', 'unpublished'];

    const spotState = {
        applications: [],
        appStatus: 'pending',
        counts: { pending: 0, approved: 0, rejected: 0, draft: 0 },
        countsLoaded: false,
        currentApp: null,
        aiDrafted: false,
        spotlights: [],
        listStatus: 'all',
        editingSpotlight: null,
        hires: [],
        afSkills: [],
        afProducts: []
    };

    function spotUrl(path) {
        const joiner = path.includes('?') ? '&' : '?';
        return `${API_URL}${path}${joiner}admin_key=${encodeURIComponent(adminKey)}`;
    }

    function formatSpotDate(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString([], { dateStyle: 'medium' });
    }

    function spotAppStatusBadge(status) {
        if (status === 'approved') return '<span class="badge active">Approved</span>';
        if (status === 'rejected') return '<span class="badge deactivated">Rejected</span>';
        if (status === 'draft') return '<span class="badge new">Draft</span>';
        return '<span class="badge popular">Pending</span>';
    }

    function spotListStatusBadge(status) {
        if (status === 'published') return '<span class="badge active">Published</span>';
        if (status === 'unpublished') return '<span class="badge deactivated">Unpublished</span>';
        return '<span class="badge popular">Draft</span>';
    }

    function spotSourceBadge(source) {
        return source === 'admin'
            ? '<span class="badge feature">Admin-added</span>'
            : '<span class="badge popular">Founder</span>';
    }

    function spotSkillsArray(skills) {
        if (Array.isArray(skills)) return skills.map(s => String(s).trim()).filter(Boolean);
        if (typeof skills === 'string') {
            return skills.split(',').map(s => s.trim()).filter(Boolean);
        }
        return [];
    }

    function spotThumbHTML(url, extraClass) {
        const cls = `spot-thumb-wrap${extraClass ? ` ${extraClass}` : ''}`;
        if (!url) return `<span class="${cls}" aria-hidden="true"><i class="fa-solid fa-user"></i></span>`;
        return `<span class="${cls}"><img src="${escapeHTML(url)}" alt="" data-spot-photo loading="lazy"><i class="fa-solid fa-user" aria-hidden="true"></i></span>`;
    }

    function bindSpotPhotoFallbacks(root) {
        root.querySelectorAll('img[data-spot-photo]').forEach(img => {
            img.addEventListener('error', () => { img.classList.add('hidden'); img.removeAttribute('data-spot-photo'); }, { once: true });
        });
    }

    /* --------------------------------------------------------------------------
       View 1: Applications (status tabs, table, detail panel, approve/reject/AI)
       -------------------------------------------------------------------------- */
    function renderSpotAppTabs() {
        document.querySelectorAll('#spot-app-status-tabs [data-spot-status]').forEach(btn => {
            const active = btn.dataset.spotStatus === spotState.appStatus;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        SPOT_APP_STATUS_TABS.forEach(status => {
            const span = document.querySelector(`#spot-app-status-tabs [data-spot-count="${status}"]`);
            if (!span) return;
            const raw = spotState.counts ? spotState.counts[status] : 0;
            const value = Number(raw);
            span.textContent = Number.isFinite(value) ? String(value) : '0';
        });
    }

    async function loadSpotApplications() {
        const loading = document.getElementById('spot-app-loading');
        const errorEl = document.getElementById('spot-app-error');
        const emptyEl = document.getElementById('spot-app-empty');
        const table = document.getElementById('spot-app-table-container');
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (table) table.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        try {
            const statusParam = spotState.appStatus === 'all' ? '' : `?status=${encodeURIComponent(spotState.appStatus)}`;
            const listRes = await fetch(spotUrl(`/spotlight/admin/applications${statusParam}`), {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(listRes, 'Could not load spotlight applications');
            const list = await listRes.json();
            spotState.applications = Array.isArray(list) ? list : [];

            try {
                const countsRes = await fetch(spotUrl('/spotlight/admin/counts'), {
                    headers: { Accept: 'application/json' },
                    cache: 'no-store'
                });
                if (countsRes.ok) {
                    spotState.counts = await countsRes.json();
                    spotState.countsLoaded = true;
                } else {
                    console.warn('[spotlight] could not load application counts:', countsRes.status);
                }
            } catch (countsError) {
                console.warn('[spotlight] could not load application counts:', countsError);
            }
        } catch (error) {
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
        } finally {
            if (loading) loading.classList.add('hidden');
        }
        renderSpotApplications();
    }

    function renderSpotApplications() {
        renderSpotAppTabs();
        const body = document.getElementById('spot-app-table-body');
        const emptyEl = document.getElementById('spot-app-empty');
        const table = document.getElementById('spot-app-table-container');
        if (!body) return;
        const apps = spotState.applications;
        if (!apps.length) {
            if (table) table.classList.add('hidden');
            if (emptyEl) {
                emptyEl.textContent = spotState.appStatus === 'pending'
                    ? 'No pending applications right now.'
                    : `No ${spotState.appStatus === 'all' ? '' : `${spotState.appStatus} `}applications found.`;
                emptyEl.classList.remove('hidden');
            }
            return;
        }
        body.innerHTML = apps.map(app => `
            <tr class="clickable-row" data-spot-app-id="${escapeHTML(String(app.id))}">
                <td data-cell="Photo" class="spot-td-photo">${spotThumbHTML(app.photo_url)}</td>
                <td data-cell="Founder"><strong>${escapeHTML(app.founder_name || '—')}</strong></td>
                <td data-cell="Startup">${escapeHTML(app.startup_name || '—')}</td>
                <td data-cell="State">${escapeHTML(app.state || '—')}</td>
                <td data-cell="Source">${spotSourceBadge(app.source)}</td>
                <td data-cell="Submitted">${escapeHTML(formatSpotDate(app.created_at))}</td>
            </tr>
        `).join('');
        bindSpotPhotoFallbacks(body);
        if (table) table.classList.remove('hidden');
    }

    function spotDetailItem(label, valueHTML, full) {
        const value = (valueHTML === null || valueHTML === undefined || valueHTML === '') ? '—' : valueHTML;
        return `<div class="spot-detail-item${full ? ' spot-detail-full' : ''}"><dt>${escapeHTML(label)}</dt><dd>${value}</dd></div>`;
    }

    function spotExternalLink(url, label) {
        const raw = String(url || '').trim();
        if (!/^https?:\/\//i.test(raw)) return null;
        return `<a href="${escapeHTML(raw)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label || raw)} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`;
    }

    function spotApplicationProductsHTML(app) {
        const ids = Array.isArray(app.product_ids) ? app.product_ids
            : (Array.isArray(app.products) ? app.products.map(p => (p && typeof p === 'object') ? p.id : p) : []);
        const embedded = Array.isArray(app.products)
            ? app.products.filter(p => p && typeof p === 'object' && p.name)
            : [];
        const pills = [];
        ids.forEach(id => {
            const known = embedded.find(p => String(p.id) === String(id))
                || (Array.isArray(state.products) ? state.products.find(p => String(p.id) === String(id)) : null);
            if (!known) return;
            const logo = known.logo_url ? `<img src="${escapeHTML(known.logo_url)}" alt="" data-spot-photo>` : '';
            pills.push(`<span class="spot-product-pill">${logo}<span>${escapeHTML(known.name)}</span></span>`);
        });
        if (!pills.length) return '';
        return spotDetailItem('Featured products', `<span class="spot-product-pills">${pills.join('')}</span>`, true);
    }

    function renderSpotApplicationDetail(app) {
        const detailBody = document.getElementById('spot-app-detail-body');
        if (!detailBody) return;
        const websiteLink = spotExternalLink(app.startup_website, 'Visit website');
        const email = app.contact_email ? `<a href="mailto:${escapeHTML(app.contact_email)}">${escapeHTML(app.contact_email)}</a>` : '';
        const skills = spotSkillsArray(app.skills);
        const skillsHTML = skills.length
            ? `<span class="spot-skills-row">${skills.map(s => `<span class="tag-chip">${escapeHTML(s)}</span>`).join('')}</span>`
            : '';
        const socialsHTML = SPOT_SOCIAL_KEYS.map(key => {
            const link = spotExternalLink(app[key], null);
            if (!link) return '';
            const meta = SPOT_SOCIAL_META[key];
            return `<a href="${escapeHTML(app[key])}" target="_blank" rel="noopener noreferrer" title="${meta.label}" aria-label="${meta.label}"><i class="${meta.icon}" aria-hidden="true"></i></a>`;
        }).filter(Boolean).join('');
        const openToWork = app.open_to_work
            ? '<span class="badge active">Open to work</span>'
            : '<span class="text-muted">Not marked open to work</span>';

        detailBody.innerHTML = `
            <div class="spot-detail-head">
                ${spotThumbHTML(app.photo_url, 'spot-detail-photo')}
                <div>
                    <div class="spot-detail-names"><strong>${escapeHTML(app.founder_name || '—')}</strong> <span class="text-muted">/ ${escapeHTML(app.startup_name || '')}</span></div>
                    <div class="spot-detail-badges">${spotAppStatusBadge(app.status)} ${spotSourceBadge(app.source)}</div>
                    <p class="text-muted spot-detail-submitted">Submitted ${escapeHTML(formatSpotDate(app.created_at))}</p>
                </div>
            </div>
            <dl class="spot-detail-grid">
                ${spotDetailItem('What it does', escapeHTML(app.what_it_does || ''), true)}
                ${spotDetailItem('Biggest challenges', escapeHTML(app.challenges || ''), true)}
                ${spotDetailItem('Proudest achievement', escapeHTML(app.achievement || ''), true)}
                ${spotDetailItem('Vision', escapeHTML(app.vision || ''), true)}
                ${spotDetailItem('State', escapeHTML(app.state || ''))}
                ${spotDetailItem('Startup website', websiteLink || '')}
                ${spotDetailItem('Contact email', email)}
                ${spotDetailItem('Open to work', openToWork)}
                ${skillsHTML ? spotDetailItem('Skills', skillsHTML, true) : ''}
                ${socialsHTML ? spotDetailItem('Socials', `<span class="spot-social-links">${socialsHTML}</span>`, true) : ''}
                ${spotApplicationProductsHTML(app)}
            </dl>
            ${app.rejection_reason ? `<p class="spot-rejection-note"><strong>Rejection reason:</strong> ${escapeHTML(app.rejection_reason)}</p>` : ''}
            <ul class="spot-consent-list">
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Consented to be featured</li>
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Agreed to the spotlight guidelines</li>
            </ul>
        `;
        bindSpotPhotoFallbacks(detailBody);
    }

    function openSpotApplicationModal(app) {
        spotState.currentApp = app;
        spotState.aiDrafted = false;
        document.getElementById('spot-app-modal-title').textContent = `${app.founder_name || 'Application'} — ${app.startup_name || ''}`;
        renderSpotApplicationDetail(app);
        const aiBlock = document.getElementById('spot-ai-draft');
        if (aiBlock) aiBlock.classList.add('hidden');
        document.querySelectorAll('#spot-ai-draft [data-draft-field]').forEach(ta => { ta.value = ''; });
        document.getElementById('spot-ai-status').textContent = '';
        document.getElementById('spot-copy-status').textContent = '';
        const pending = app.status === 'pending';
        document.getElementById('spot-approve-btn').classList.toggle('hidden', !pending);
        document.getElementById('spot-reject-btn').classList.toggle('hidden', !pending);
        document.getElementById('spot-app-detail-modal').classList.remove('hidden');
    }

    function closeSpotApplicationModal() {
        document.getElementById('spot-app-detail-modal').classList.add('hidden');
        spotState.currentApp = null;
        spotState.aiDrafted = false;
    }

    async function approveSpotApplication() {
        const app = spotState.currentApp;
        if (!app) return;
        const label = `${app.founder_name || 'this founder'} of ${app.startup_name || 'this startup'}`;
        if (!window.confirm(`Approve ${label}? This creates a spotlight draft. Continue?`)) return;
        const btn = document.getElementById('spot-approve-btn');
        btn.disabled = true;
        try {
            const res = await fetch(spotUrl(`/spotlight/admin/applications/${app.id}/approve`), { method: 'POST' });
            await requireAdminResponse(res, 'Could not approve the application');
            showAlert('success', 'Application approved — spotlight draft created.');
            closeSpotApplicationModal();
            await loadSpotApplications();
        } catch (error) {
            document.getElementById('spot-ai-status').textContent = error.message;
            showAlert('error', error.message);
        } finally {
            btn.disabled = false;
        }
    }

    function openSpotRejectModal() {
        const app = spotState.currentApp;
        if (!app) return;
        document.getElementById('spot-reject-context').textContent = `${app.founder_name || 'Founder'} — ${app.startup_name || 'Startup'}`;
        const input = document.getElementById('spot-reject-reason-input');
        input.value = '';
        document.getElementById('spot-reject-error').classList.add('hidden');
        document.getElementById('spot-reject-modal').classList.remove('hidden');
        input.focus();
    }

    async function confirmSpotReject() {
        const app = spotState.currentApp;
        if (!app) return;
        const input = document.getElementById('spot-reject-reason-input');
        const errorEl = document.getElementById('spot-reject-error');
        const reason = input.value.trim();
        if (!reason) {
            errorEl.classList.remove('hidden');
            input.focus();
            return;
        }
        errorEl.classList.add('hidden');
        const btn = document.getElementById('spot-reject-confirm-btn');
        btn.disabled = true;
        try {
            const res = await fetch(spotUrl(`/spotlight/admin/applications/${app.id}/reject?reason=${encodeURIComponent(reason)}`), { method: 'POST' });
            await requireAdminResponse(res, 'Could not reject the application');
            showAlert('success', 'Application rejected.');
            document.getElementById('spot-reject-modal').classList.add('hidden');
            closeSpotApplicationModal();
            await loadSpotApplications();
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
        }
    }

    async function draftSpotWithAI() {
        const app = spotState.currentApp;
        if (!app) return;
        const btn = document.getElementById('spot-draft-ai-btn');
        const statusEl = document.getElementById('spot-ai-status');
        btn.disabled = true;
        statusEl.textContent = 'Generating draft with AI… this can take a few seconds.';
        try {
            const res = await fetch(spotUrl(`/spotlight/admin/applications/${app.id}/draft`), {
                method: 'POST',
                headers: { Accept: 'application/json' }
            });
            await requireAdminResponse(res, 'AI drafting failed');
            const data = await res.json();
            const draft = data && data.draft;
            if (!draft || typeof draft !== 'object') throw new Error('The AI response did not include a draft.');
            SPOT_DRAFT_FIELDS.forEach(field => {
                const ta = document.querySelector(`#spot-ai-draft [data-draft-field="${field}"]`);
                if (ta) ta.value = typeof draft[field] === 'string' ? draft[field] : '';
            });
            spotState.aiDrafted = true;
            document.getElementById('spot-ai-draft').classList.remove('hidden');
            statusEl.textContent = 'Draft ready — review and edit it below, then copy it into the spotlight.';
        } catch (error) {
            statusEl.textContent = `AI drafting failed: ${error.message}`;
        } finally {
            btn.disabled = false;
        }
    }

    async function resolveSpotlightIdForApp(app) {
        if (app.spotlight_id) return app.spotlight_id;
        if (app.spotlight && app.spotlight.id) return app.spotlight.id;
        const res = await fetch(spotUrl('/spotlight/admin/spotlights'), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        await requireAdminResponse(res, 'Could not load spotlights');
        const list = await res.json();
        const rows = Array.isArray(list) ? list : [];
        const direct = rows.find(row => String(row.application_id) === String(app.id))
            || rows.find(row => row.application && String(row.application.id) === String(app.id))
            || rows.find(row => row.startup_name === app.startup_name && row.founder_name === app.founder_name);
        if (direct) return direct.id;
        // Last resort: walk the newest drafts and inspect their nested application record.
        const candidates = rows.slice(0, 50);
        for (const candidate of candidates) {
            try {
                const detailRes = await fetch(spotUrl(`/spotlight/admin/spotlights/${candidate.id}`), {
                    headers: { Accept: 'application/json' },
                    cache: 'no-store'
                });
                if (!detailRes.ok) continue;
                const detail = await detailRes.json();
                if (detail && detail.application && String(detail.application.id) === String(app.id)) return candidate.id;
            } catch (walkError) {
                console.warn('[spotlight] detail lookup failed for spotlight', candidate.id, walkError);
            }
        }
        return null;
    }

    async function copySpotDraftToSpotlight() {
        const app = spotState.currentApp;
        const statusEl = document.getElementById('spot-copy-status');
        if (!app || !spotState.aiDrafted) {
            statusEl.textContent = 'Generate an AI draft first.';
            return;
        }
        statusEl.textContent = '';
        if (app.status !== 'approved') {
            statusEl.textContent = 'Approve this application first to create the spotlight record, then copy the AI draft over.';
            return;
        }
        const payload = {};
        SPOT_DRAFT_FIELDS.forEach(field => {
            const ta = document.querySelector(`#spot-ai-draft [data-draft-field="${field}"]`);
            if (ta) payload[field] = ta.value;
        });
        const btn = document.getElementById('spot-copy-btn');
        btn.disabled = true;
        statusEl.textContent = 'Looking up the spotlight…';
        try {
            const spotlightId = await resolveSpotlightIdForApp(app);
            if (!spotlightId) {
                statusEl.textContent = 'Approve this application first to create the spotlight record.';
                return;
            }
            statusEl.textContent = 'Copying draft into the spotlight…';
            const res = await fetch(spotUrl(`/spotlight/admin/spotlights/${spotlightId}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await requireAdminResponse(res, 'Could not copy the draft into the spotlight');
            statusEl.textContent = 'Copied — find it under Founder Spotlights (Draft tab).';
            showAlert('success', 'AI draft copied into the spotlight.');
        } catch (error) {
            statusEl.textContent = `Copy failed: ${error.message}`;
        } finally {
            btn.disabled = false;
        }
    }

    /* --------------------------------------------------------------------------
       AI draft — SAVE (persist into the spotlight) and APPROVE (approve the
       application record, then persist the draft). Both write to the server
       and verify with a refetch, so results survive a page refresh.
       -------------------------------------------------------------------------- */
    function setSpotAiButtonsBusy(busy, busyId, busyText) {
        const buttons = {
            'spot-ai-save-btn': '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save to Spotlight',
            'spot-ai-approve-btn': '<i class="fa-solid fa-check" aria-hidden="true"></i> Approve &amp; Save',
            'spot-copy-btn': '<i class="fa-solid fa-copy" aria-hidden="true"></i> Copy to Founder Spotlights'
        };
        Object.keys(buttons).forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = busy;
            btn.innerHTML = (busy && id === busyId) ? busyText : buttons[id];
        });
        spotState.aiBusy = busy;
    }

    function collectSpotAiDraftPayload() {
        const payload = {};
        SPOT_DRAFT_FIELDS.forEach(field => {
            const ta = document.querySelector(`#spot-ai-draft [data-draft-field="${field}"]`);
            if (ta) payload[field] = ta.value;
        });
        return payload;
    }

    // PUT the AI text into the spotlight record, then GET it back to confirm
    // the write actually persisted (approval must update the real record).
    async function persistSpotAiDraft(app) {
        const spotlightId = await resolveSpotlightIdForApp(app);
        if (!spotlightId) return { ok: false, reason: 'no-spotlight' };
        const payload = collectSpotAiDraftPayload();
        const res = await fetch(spotUrl(`/spotlight/admin/spotlights/${spotlightId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await requireAdminResponse(res, 'Could not save the AI draft');
        const check = await fetch(spotUrl(`/spotlight/admin/spotlights/${spotlightId}`), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (check.ok) {
            const detail = await check.json();
            if (detail && typeof detail.headline === 'string' && detail.headline !== payload.headline) {
                return { ok: false, reason: 'verify-mismatch' };
            }
        }
        app.spotlight_id = spotlightId;
        return { ok: true, spotlightId };
    }

    async function saveSpotAiDraft() {
        const app = spotState.currentApp;
        const statusEl = document.getElementById('spot-ai-status');
        if (!app || spotState.aiBusy) return;
        if (!spotState.aiDrafted) {
            statusEl.textContent = 'Generate an AI draft first.';
            return;
        }
        if (app.status !== 'approved') {
            statusEl.textContent = 'Save needs the spotlight record — approve this application first (or use Approve & Save to do both).';
            return;
        }
        setSpotAiButtonsBusy(true, 'spot-ai-save-btn', '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving…');
        statusEl.textContent = 'Saving the AI draft into the spotlight…';
        try {
            const result = await persistSpotAiDraft(app);
            if (!result.ok && result.reason === 'no-spotlight') {
                statusEl.textContent = 'Save failed: the spotlight record was not found — approve this application first.';
                return;
            }
            if (!result.ok) throw new Error('The save was verified against the server and did not match — please try again.');
            statusEl.textContent = 'Saved — this draft is stored on the spotlight and survives a page refresh.';
            showAlert('success', 'AI draft saved to the spotlight.');
            await loadSpotlights(); // keep the Founder Spotlights list in sync
        } catch (error) {
            statusEl.textContent = `Save failed: ${error.message}`;
        } finally {
            setSpotAiButtonsBusy(false);
        }
    }

    async function approveSpotAiDraft() {
        const app = spotState.currentApp;
        const statusEl = document.getElementById('spot-ai-status');
        if (!app || spotState.aiBusy) return;
        if (!spotState.aiDrafted) {
            statusEl.textContent = 'Generate an AI draft first.';
            return;
        }
        const label = `${app.founder_name || 'this founder'} of ${app.startup_name || 'this startup'}`;
        const pending = app.status === 'pending';
        const question = pending
            ? `Approve ${label} and store this AI text as the spotlight draft? The application is approved and the spotlight record is written on the server. Continue?`
            : `Store this AI text as ${label}'s spotlight draft on the server? Continue?`;
        if (!window.confirm(question)) return;
        setSpotAiButtonsBusy(true, 'spot-ai-approve-btn', '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Approving…');
        try {
            if (pending) {
                statusEl.textContent = 'Approving the application…';
                const res = await fetch(spotUrl(`/spotlight/admin/applications/${app.id}/approve`), { method: 'POST' });
                await requireAdminResponse(res, 'Could not approve the application');
                app.status = 'approved';
                statusEl.textContent = 'Approved — saving the AI draft into the spotlight…';
            }
            const result = await persistSpotAiDraft(app);
            if (!result.ok && result.reason === 'no-spotlight') {
                statusEl.textContent = 'Approved, but the spotlight record was not found yet — check Founder Spotlights.';
                return;
            }
            if (!result.ok) throw new Error('The record update was verified against the server and did not match — please try again.');
            statusEl.textContent = 'Approved — this text is stored as the spotlight draft (Founder Spotlights → Draft).';
            showAlert('success', 'Application approved and AI draft saved to the spotlight.');
            // Re-sync the open modal + the lists with what the server now holds.
            document.getElementById('spot-approve-btn').classList.add('hidden');
            document.getElementById('spot-reject-btn').classList.add('hidden');
            renderSpotApplicationDetail(app);
            await loadSpotApplications();
            await loadSpotlights();
        } catch (error) {
            statusEl.textContent = `Approve failed: ${error.message}`;
        } finally {
            setSpotAiButtonsBusy(false);
        }
    }

    /* --------------------------------------------------------------------------
       View 2: Founder Spotlights (list + editor with Save/Publish/Unpublish)
       -------------------------------------------------------------------------- */
    function renderSpotListTabs() {
        const counts = { all: spotState.spotlights.length, draft: 0, published: 0, unpublished: 0 };
        spotState.spotlights.forEach(row => {
            const key = (row.status === 'published' || row.status === 'unpublished') ? row.status : 'draft';
            counts[key] += 1;
        });
        SPOT_LIST_STATUS_TABS.forEach(status => {
            const btn = document.querySelector(`#spot-list-status-tabs [data-spotlist-status="${status}"]`);
            if (btn) {
                const active = spotState.listStatus === status;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            }
            const span = document.querySelector(`#spot-list-status-tabs [data-spotlist-count="${status}"]`);
            if (span) span.textContent = String(counts[status] || 0);
        });
    }

    async function loadSpotlights() {
        const loading = document.getElementById('spot-list-loading');
        const errorEl = document.getElementById('spot-list-error');
        const emptyEl = document.getElementById('spot-list-empty');
        const table = document.getElementById('spot-list-table-container');
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (table) table.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        try {
            const res = await fetch(spotUrl('/spotlight/admin/spotlights'), {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(res, 'Could not load spotlights');
            const list = await res.json();
            spotState.spotlights = Array.isArray(list) ? list : [];
        } catch (error) {
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
        } finally {
            if (loading) loading.classList.add('hidden');
        }
        renderSpotlights();
    }

    function renderSpotlights() {
        renderSpotListTabs();
        const body = document.getElementById('spot-list-table-body');
        const emptyEl = document.getElementById('spot-list-empty');
        const table = document.getElementById('spot-list-table-container');
        if (!body) return;
        const visible = spotState.listStatus === 'all'
            ? spotState.spotlights
            : spotState.spotlights.filter(row => (row.status || 'draft') === spotState.listStatus);
        if (!visible.length) {
            if (table) table.classList.add('hidden');
            if (emptyEl) {
                emptyEl.textContent = spotState.listStatus === 'all'
                    ? 'No spotlights yet — approve an application or add a founder to create one.'
                    : `No ${spotState.listStatus} spotlights.`;
                emptyEl.classList.remove('hidden');
            }
            return;
        }
        body.innerHTML = visible.map(row => {
            const slug = row.slug || '';
            const viewLink = row.status === 'published' && slug
                ? `<a class="spot-view-link" href="/spotlight/${encodeURIComponent(slug)}" target="_blank" rel="noopener noreferrer">View page <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`
                : '<span class="text-muted">—</span>';
            const hires = Number(row.hire_count);
            return `
            <tr class="clickable-row" data-spot-id="${escapeHTML(String(row.id))}">
                <td data-cell="Headline"><strong>${escapeHTML(row.headline || '(untitled draft)')}</strong><br><span class="text-muted spot-slug-note">/spotlight/${escapeHTML(slug)}</span></td>
                <td data-cell="Startup">${escapeHTML(row.startup_name || '—')}</td>
                <td data-cell="Founder">${escapeHTML(row.founder_name || '—')}</td>
                <td data-cell="Status">${spotListStatusBadge(row.status)}</td>
                <td data-cell="Hires">${Number.isFinite(hires) ? hires : 0}</td>
                <td data-cell="Updated">${escapeHTML(formatSpotDate(row.updated_at))}</td>
                <td data-cell="View">${viewLink}</td>
            </tr>`;
        }).join('');
        if (table) table.classList.remove('hidden');
    }

    function spotEditorAsideHTML(detail) {
        const app = detail.application || {};
        const rows = [
            ['Founder', escapeHTML(app.founder_name || detail.founder_name || '')],
            ['Startup', escapeHTML(app.startup_name || detail.startup_name || '')],
            ['State', escapeHTML(app.state || '')],
            ['Contact email', app.contact_email ? `<a href="mailto:${escapeHTML(app.contact_email)}">${escapeHTML(app.contact_email)}</a>` : ''],
            ['Website', spotExternalLink(app.startup_website, 'Visit site') || ''],
            ['Open to work', app.open_to_work ? '<span class="badge active">Open to work</span>' : '']
        ];
        return `
            <h4>Founder application</h4>
            ${spotThumbHTML(app.photo_url, 'spot-aside-photo')}
            <dl class="spot-aside-list">
                ${rows.map(([label, value]) => value ? `<div class="spot-aside-item"><dt>${label}</dt><dd>${value}</dd></div>` : '').join('')}
            </dl>
        `;
    }

    function updateSpotEditorChrome() {
        const detail = spotState.editingSpotlight;
        if (!detail) return;
        document.getElementById('spot-editor-status').innerHTML = spotListStatusBadge(detail.status);
        document.getElementById('spot-publish-btn').classList.toggle('hidden', detail.status === 'published');
        document.getElementById('spot-unpublish-btn').classList.toggle('hidden', detail.status !== 'published');
        const preview = document.getElementById('spot-edit-slug-preview');
        if (preview) preview.textContent = document.getElementById('spot-edit-slug').value.trim() || '…';
    }

    async function openSpotEditorModal(row) {
        const modal = document.getElementById('spot-editor-modal');
        const loading = document.getElementById('spot-editor-loading');
        const errorEl = document.getElementById('spot-editor-error');
        const body = document.getElementById('spot-editor-body');
        modal.classList.remove('hidden');
        errorEl.textContent = ''; errorEl.classList.add('hidden');
        body.classList.add('hidden');
        loading.classList.remove('hidden');
        document.getElementById('spot-save-status').textContent = '';
        try {
            const res = await fetch(spotUrl(`/spotlight/admin/spotlights/${row.id}`), {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(res, 'Could not load the spotlight');
            const detail = await res.json();
            if (!detail || typeof detail !== 'object') throw new Error('Unexpected spotlight response.');
            spotState.editingSpotlight = detail;
            SPOT_DRAFT_FIELDS.forEach(field => {
                const ta = document.getElementById(`spot-edit-${field}`);
                if (ta) ta.value = typeof detail[field] === 'string' ? detail[field] : '';
            });
            document.getElementById('spot-edit-slug').value = detail.slug || row.slug || '';
            document.getElementById('spot-editor-app-info').innerHTML = spotEditorAsideHTML(detail);
            bindSpotPhotoFallbacks(document.getElementById('spot-editor-app-info'));
            updateSpotEditorChrome();
            body.classList.remove('hidden');
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loading.classList.add('hidden');
        }
    }

    function collectSpotEditorPayload(includeStatus) {
        const payload = {};
        SPOT_DRAFT_FIELDS.forEach(field => {
            const ta = document.getElementById(`spot-edit-${field}`);
            if (ta) payload[field] = ta.value;
        });
        const slugInput = document.getElementById('spot-edit-slug');
        const slug = slugInput.value.trim();
        const current = spotState.editingSpotlight || {};
        if (slug && slug !== current.slug) payload.slug = slug;
        if (includeStatus) payload.status = includeStatus;
        return payload;
    }

    async function saveSpotEditor() {
        const detail = spotState.editingSpotlight;
        if (!detail) return;
        const statusEl = document.getElementById('spot-save-status');
        const btn = document.getElementById('spot-save-btn');
        btn.disabled = true;
        statusEl.textContent = 'Saving…';
        try {
            const payload = collectSpotEditorPayload(null);
            const res = await fetch(spotUrl(`/spotlight/admin/spotlights/${detail.id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await requireAdminResponse(res, 'Could not save the spotlight');
            Object.assign(detail, payload);
            statusEl.textContent = payload.slug ? `Saved — new public URL: /spotlight/${payload.slug}.` : 'Saved.';
            showAlert('success', 'Spotlight saved.');
            await loadSpotlights();
        } catch (error) {
            statusEl.textContent = error.message;
        } finally {
            btn.disabled = false;
        }
    }

    async function changeSpotEditorStatus(newStatus) {
        const detail = spotState.editingSpotlight;
        if (!detail) return;
        const statusEl = document.getElementById('spot-save-status');
        const message = newStatus === 'published'
            ? 'This goes live immediately and emails the founder if they have an account. Continue?'
            : 'Unpublish this spotlight? It stops being publicly visible right away. Continue?';
        if (!window.confirm(message)) return;
        const btn = document.getElementById(newStatus === 'published' ? 'spot-publish-btn' : 'spot-unpublish-btn');
        btn.disabled = true;
        statusEl.textContent = newStatus === 'published' ? 'Publishing…' : 'Unpublishing…';
        try {
            const payload = collectSpotEditorPayload(newStatus);
            const res = await fetch(spotUrl(`/spotlight/admin/spotlights/${detail.id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await requireAdminResponse(res, `Could not ${newStatus === 'published' ? 'publish' : 'unpublish'} the spotlight`);
            Object.assign(detail, payload, { status: newStatus });
            updateSpotEditorChrome();
            statusEl.textContent = newStatus === 'published' ? 'Published — the page is live.' : 'Unpublished — the page is offline.';
            showAlert('success', newStatus === 'published' ? 'Spotlight published.' : 'Spotlight unpublished.');
            await loadSpotlights();
        } catch (error) {
            statusEl.textContent = error.message;
        } finally {
            btn.disabled = false;
        }
    }

    /* --------------------------------------------------------------------------
       View 3: Hires (confirm toggle)
       -------------------------------------------------------------------------- */
    async function loadSpotHires() {
        const loading = document.getElementById('spot-hires-loading');
        const errorEl = document.getElementById('spot-hires-error');
        const emptyEl = document.getElementById('spot-hires-empty');
        const table = document.getElementById('spot-hires-table-container');
        if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
        if (emptyEl) emptyEl.classList.add('hidden');
        if (table) table.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        try {
            const res = await fetch(spotUrl('/spotlight/admin/hires'), {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            await requireAdminResponse(res, 'Could not load hires');
            const list = await res.json();
            spotState.hires = Array.isArray(list) ? list : [];
        } catch (error) {
            if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
        } finally {
            if (loading) loading.classList.add('hidden');
        }
        renderSpotHires();
    }

    function renderSpotHires() {
        const body = document.getElementById('spot-hires-table-body');
        const emptyEl = document.getElementById('spot-hires-empty');
        const table = document.getElementById('spot-hires-table-container');
        if (!body) return;
        if (!spotState.hires.length) {
            if (table) table.classList.add('hidden');
            if (emptyEl) {
                emptyEl.textContent = 'No hires reported yet.';
                emptyEl.classList.remove('hidden');
            }
            return;
        }
        body.innerHTML = spotState.hires.map(hire => {
            const confirmed = Boolean(hire.confirmed);
            const note = hire.note ? escapeHTML(hire.note) : '<span class="text-muted">—</span>';
            return `
            <tr class="spot-hire-row${confirmed ? '' : ' spot-hire-pending'}" data-hire-id="${escapeHTML(String(hire.id))}">
                <td data-cell="Startup"><strong>${escapeHTML(hire.startup || '—')}</strong></td>
                <td data-cell="Founder">${escapeHTML(hire.founder || '—')}</td>
                <td data-cell="Hired by">${escapeHTML(hire.hired_by || '—')}</td>
                <td data-cell="Note" class="spot-hire-note">${note}</td>
                <td data-cell="Date">${escapeHTML(formatSpotDate(hire.hired_on))}</td>
                <td data-cell="Confirmed">
                    <span class="spot-confirm-cell">
                        <label class="banner-switch">
                            <input type="checkbox" data-hire-toggle="${escapeHTML(String(hire.id))}"${confirmed ? ' checked' : ''} aria-label="Toggle confirmed for this hire">
                            <span class="banner-switch-track"><span class="banner-switch-thumb"></span></span>
                        </label>
                        <span class="badge ${confirmed ? 'active' : 'popular'}">${confirmed ? 'Confirmed' : 'Unconfirmed'}</span>
                    </span>
                </td>
            </tr>`;
        }).join('');
        if (table) table.classList.remove('hidden');
    }

    async function toggleSpotHireConfirmed(input) {
        const hireId = input.dataset.hireToggle;
        const hire = spotState.hires.find(h => String(h.id) === String(hireId));
        const confirmed = input.checked;
        input.disabled = true;
        try {
            const res = await fetch(spotUrl(`/spotlight/admin/hires/${hireId}/confirm`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmed })
            });
            await requireAdminResponse(res, 'Could not update the hire');
            if (hire) hire.confirmed = confirmed;
            renderSpotHires();
            showAlert('success', confirmed ? 'Hire confirmed.' : 'Hire marked unconfirmed.');
        } catch (error) {
            input.checked = !confirmed;
            showAlert('error', error.message);
        } finally {
            input.disabled = false;
        }
    }

    /* --------------------------------------------------------------------------
       View 4: Add Founder (manual entry, auto-approved + draft spotlight)
       -------------------------------------------------------------------------- */
    function renderAfSkillChips() {
        const list = document.getElementById('spot-af-skills-chip-list');
        if (!list) return;
        list.innerHTML = spotState.afSkills.map((skill, index) => `
            <span class="tag-chip">${escapeHTML(skill)}
                <button type="button" class="tag-chip-remove" data-af-skill-remove="${index}" aria-label="Remove ${escapeHTML(skill)}">&times;</button>
            </span>
        `).join('');
        const input = document.getElementById('spot-af-skills-input');
        if (input) input.placeholder = spotState.afSkills.length >= 5 ? 'Maximum 5 skills' : 'Type a skill and press Enter or , (max 5)';
    }

    function addAfSkill(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) return false;
        if (spotState.afSkills.length >= 5) return false;
        if (spotState.afSkills.some(existing => existing.toLowerCase() === value.toLowerCase())) return false;
        spotState.afSkills.push(value);
        renderAfSkillChips();
        return true;
    }

    function renderAfProductChips() {
        const list = document.getElementById('spot-af-product-chips');
        if (!list) return;
        list.innerHTML = spotState.afProducts.map(product => `
            <span class="tag-chip">${escapeHTML(product.name)}
                <button type="button" class="tag-chip-remove" data-af-product-remove="${escapeHTML(String(product.id))}" aria-label="Remove ${escapeHTML(product.name)}">&times;</button>
            </span>
        `).join('');
    }

    function renderAfProductResults(query) {
        const container = document.getElementById('spot-af-product-results');
        if (!container) return;
        const q = String(query || '').trim().toLowerCase();
        const catalog = Array.isArray(state.products) ? state.products : [];
        const matches = catalog
            .filter(p => p && !spotState.afProducts.some(sel => String(sel.id) === String(p.id)))
            .filter(p => !q
                || String(p.name || '').toLowerCase().includes(q)
                || String(p.category || '').toLowerCase().includes(q))
            .slice(0, 8);
        if (!matches.length) {
            container.innerHTML = `<p class="text-muted spot-picker-empty">${catalog.length ? 'No products match.' : 'No products available.'}</p>`;
            container.classList.remove('hidden');
            return;
        }
        container.innerHTML = matches.map(p => {
            const logo = p.logo_url ? `<img src="${escapeHTML(p.logo_url)}" alt="" data-spot-photo>` : '<i class="fa-solid fa-box-open" aria-hidden="true"></i>';
            return `<button type="button" class="spot-pick-option" data-af-product-id="${escapeHTML(String(p.id))}">${logo}<span class="spot-pick-name">${escapeHTML(p.name || 'Unnamed product')}</span><span class="spot-pick-cat">${escapeHTML(p.category || '')}</span></button>`;
        }).join('');
        bindSpotPhotoFallbacks(container);
        container.classList.remove('hidden');
    }

    function selectAfProduct(productId) {
        const errorEl = document.getElementById('spot-af-product-error');
        const product = (Array.isArray(state.products) ? state.products : []).find(p => String(p.id) === String(productId));
        if (!product) return;
        if (spotState.afProducts.length >= 2) {
            if (errorEl) errorEl.classList.remove('hidden');
            return;
        }
        if (errorEl) errorEl.classList.add('hidden');
        spotState.afProducts.push({ id: product.id, name: product.name });
        renderAfProductChips();
        const search = document.getElementById('spot-af-product-search');
        if (search) { search.value = ''; search.focus(); }
        renderAfProductResults('');
    }

    async function ensureSpotlightProductCatalog() {
        const hint = document.getElementById('spot-af-product-loading');
        if (Array.isArray(state.products) && state.products.length) {
            if (hint) hint.classList.add('hidden');
            renderAfProductResults(document.getElementById('spot-af-product-search').value);
            return;
        }
        if (hint) hint.classList.remove('hidden');
        try {
            await fetchProductsData();
        } catch (catalogError) {
            console.warn('[spotlight] product catalog unavailable:', catalogError);
        }
        if (hint) hint.classList.add('hidden');
        renderAfProductResults(document.getElementById('spot-af-product-search').value);
    }

    function initSpotAddFounderView() {
        ensureSpotlightProductCatalog();
    }

    function readAfField(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function validSpotUrl(url) {
        if (!/^https?:\/\//i.test(url)) return false;
        try { new URL(url); return true; } catch (err) { return false; }
    }

    async function submitSpotAddFounder(event) {
        event.preventDefault();
        const errorEl = document.getElementById('spot-af-error');
        const statusEl = document.getElementById('spot-af-status');
        errorEl.textContent = ''; errorEl.classList.add('hidden');

        // Absorb whatever skill the admin typed but did not commit with Enter yet.
        const skillInput = document.getElementById('spot-af-skills-input');
        if (skillInput && skillInput.value.trim()) {
            addAfSkill(skillInput.value);
            skillInput.value = '';
        }

        const fail = message => {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
            errorEl.scrollIntoView({ block: 'center' });
        };

        // Backend change: every field is optional. Admins fill in only what they
        // know; URLs are still format-checked when provided (genuinely invalid input).
        const urlFields = ['spot-af-photo-url', 'spot-af-website'];
        for (const id of urlFields) {
            const value = readAfField(id);
            if (value && !validSpotUrl(value)) {
                fail('Photo URL and startup website must be full http(s) links.');
                document.getElementById(id).focus();
                return;
            }
        }
        const socials = {};
        SPOT_SOCIAL_KEYS.forEach((key, index) => {
            const ids = ['spot-af-instagram', 'spot-af-x', 'spot-af-facebook', 'spot-af-linkedin', 'spot-af-tiktok', 'spot-af-github'];
            const value = readAfField(ids[index]);
            if (value && validSpotUrl(value)) socials[key] = value;
            else if (value && !validSpotUrl(value)) socials.__invalid = ids[index];
        });
        if (socials.__invalid) {
            fail('Social links must be full http(s) URLs.');
            document.getElementById(socials.__invalid).focus();
            return;
        }
        delete socials.__invalid;

        const body = {
            founder_name: readAfField('spot-af-founder-name'),
            startup_name: readAfField('spot-af-startup-name'),
            photo_url: readAfField('spot-af-photo-url'),
            state: readAfField('spot-af-state'),
            startup_website: readAfField('spot-af-website'),
            what_it_does: readAfField('spot-af-what-it-does'),
            vision: readAfField('spot-af-vision'),
            challenges: readAfField('spot-af-challenges'),
            achievement: readAfField('spot-af-achievement'),
            quote: readAfField('spot-af-quote'),
            why_nigeria: readAfField('spot-af-why-nigeria'),
            skills: [...spotState.afSkills],
            ...socials,
            open_to_work: document.getElementById('spot-af-open-to-work').checked,
            product_ids: spotState.afProducts.map(p => p.id),
            consent: document.getElementById('spot-af-consent').checked,
            guidelines_agreed: document.getElementById('spot-af-guidelines').checked,
            save_as_draft: false
        };

        const submitBtn = document.getElementById('spot-af-submit');
        submitBtn.disabled = true;
        statusEl.textContent = 'Creating founder and spotlight draft…';
        try {
            const res = await fetch(spotUrl('/spotlight/admin/applications'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body)
            });
            await requireAdminResponse(res, 'Could not create the founder');
            statusEl.textContent = '';
            document.getElementById('spot-af-form').reset();
            document.getElementById('spot-af-consent').checked = true;
            document.getElementById('spot-af-guidelines').checked = true;
            spotState.afSkills = [];
            spotState.afProducts = [];
            renderAfSkillChips();
            renderAfProductChips();
            renderAfProductResults('');
            const resultEl = document.getElementById('spot-af-result');
            const who = body.startup_name ? `${body.founder_name} of ${body.startup_name}` : body.founder_name;
            document.getElementById('spot-af-result-text').textContent =
                `${who} is approved already, and their draft spotlight was created.`;
            resultEl.classList.remove('hidden');
            resultEl.scrollIntoView({ block: 'center' });
            showAlert('success', 'Founder added and spotlight draft created.');
        } catch (error) {
            statusEl.textContent = '';
            fail(error.message);
        } finally {
            submitBtn.disabled = false;
        }
    }

    /* --------------------------------------------------------------------------
       Wiring
       -------------------------------------------------------------------------- */
    function setupSpotlight() {
        const onClick = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };

        // Applications view ---------------------------------------------------
        onClick('spot-add-founder-btn', () => switchAdminPage('spotlight-add-founder-tab'));
        onClick('spot-af-back-btn', () => switchAdminPage('spotlight-applications-tab'));
        const appTabs = document.getElementById('spot-app-status-tabs');
        if (appTabs) {
            appTabs.addEventListener('click', event => {
                const btn = event.target.closest('[data-spot-status]');
                if (!btn || btn.dataset.spotStatus === spotState.appStatus) return;
                spotState.appStatus = btn.dataset.spotStatus;
                loadSpotApplications();
            });
        }
        const appBody = document.getElementById('spot-app-table-body');
        if (appBody) {
            appBody.addEventListener('click', event => {
                const row = event.target.closest('tr[data-spot-app-id]');
                if (!row) return;
                const app = spotState.applications.find(a => String(a.id) === String(row.dataset.spotAppId));
                if (app) openSpotApplicationModal(app);
            });
        }
        onClick('spot-app-modal-close', closeSpotApplicationModal);
        onClick('spot-approve-btn', approveSpotApplication);
        onClick('spot-reject-btn', openSpotRejectModal);
        onClick('spot-reject-cancel-btn', () => document.getElementById('spot-reject-modal').classList.add('hidden'));
        onClick('spot-reject-confirm-btn', confirmSpotReject);
        onClick('spot-draft-ai-btn', draftSpotWithAI);
        onClick('spot-copy-btn', copySpotDraftToSpotlight);
        onClick('spot-ai-save-btn', saveSpotAiDraft);
        onClick('spot-ai-approve-btn', approveSpotAiDraft);

        // Founder Spotlights view --------------------------------------------
        const listTabs = document.getElementById('spot-list-status-tabs');
        if (listTabs) {
            listTabs.addEventListener('click', event => {
                const btn = event.target.closest('[data-spotlist-status]');
                if (!btn || btn.dataset.spotlistStatus === spotState.listStatus) return;
                spotState.listStatus = btn.dataset.spotlistStatus;
                renderSpotlights();
            });
        }
        const listBody = document.getElementById('spot-list-table-body');
        if (listBody) {
            listBody.addEventListener('click', event => {
                if (event.target.closest('a.spot-view-link')) return;
                const row = event.target.closest('tr[data-spot-id]');
                if (!row) return;
                const spotlight = spotState.spotlights.find(s => String(s.id) === String(row.dataset.spotId));
                if (spotlight) openSpotEditorModal(spotlight);
            });
        }
        onClick('spot-editor-close', () => {
            document.getElementById('spot-editor-modal').classList.add('hidden');
            spotState.editingSpotlight = null;
        });
        onClick('spot-save-btn', saveSpotEditor);
        onClick('spot-publish-btn', () => changeSpotEditorStatus('published'));
        onClick('spot-unpublish-btn', () => changeSpotEditorStatus('unpublished'));
        const slugInput = document.getElementById('spot-edit-slug');
        if (slugInput) {
            slugInput.addEventListener('input', () => {
                const preview = document.getElementById('spot-edit-slug-preview');
                if (preview) preview.textContent = slugInput.value.trim() || '…';
            });
        }

        // Hires view ----------------------------------------------------------
        const hiresBody = document.getElementById('spot-hires-table-body');
        if (hiresBody) {
            hiresBody.addEventListener('change', event => {
                const input = event.target.closest('[data-hire-toggle]');
                if (input) toggleSpotHireConfirmed(input);
            });
        }

        // Add Founder view -----------------------------------------------------
        const skillsInput = document.getElementById('spot-af-skills-input');
        if (skillsInput) {
            skillsInput.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    if (addAfSkill(skillsInput.value)) skillsInput.value = '';
                } else if (event.key === 'Backspace' && !skillsInput.value && spotState.afSkills.length) {
                    spotState.afSkills.pop();
                    renderAfSkillChips();
                }
            });
        }
        const skillChips = document.getElementById('spot-af-skills-chip-list');
        if (skillChips) {
            skillChips.addEventListener('click', event => {
                const removeBtn = event.target.closest('[data-af-skill-remove]');
                if (!removeBtn) return;
                spotState.afSkills.splice(Number(removeBtn.dataset.afSkillRemove), 1);
                renderAfSkillChips();
            });
        }
        const productSearch = document.getElementById('spot-af-product-search');
        if (productSearch) {
            productSearch.addEventListener('input', () => renderAfProductResults(productSearch.value));
            productSearch.addEventListener('focus', () => renderAfProductResults(productSearch.value));
        }
        const productResults = document.getElementById('spot-af-product-results');
        if (productResults) {
            productResults.addEventListener('click', event => {
                const option = event.target.closest('[data-af-product-id]');
                if (option) selectAfProduct(option.dataset.afProductId);
            });
        }
        const productChips = document.getElementById('spot-af-product-chips');
        if (productChips) {
            productChips.addEventListener('click', event => {
                const removeBtn = event.target.closest('[data-af-product-remove]');
                if (!removeBtn) return;
                spotState.afProducts = spotState.afProducts.filter(p => String(p.id) !== String(removeBtn.dataset.afProductRemove));
                document.getElementById('spot-af-product-error').classList.add('hidden');
                renderAfProductChips();
                renderAfProductResults(document.getElementById('spot-af-product-search').value);
            });
        }
        const afForm = document.getElementById('spot-af-form');
        if (afForm) afForm.addEventListener('submit', submitSpotAddFounder);
        onClick('spot-af-view-spotlight', () => {
            spotState.listStatus = 'draft';
            document.getElementById('spot-af-result').classList.add('hidden');
            switchAdminPage('spotlight-list-tab');
        });
    }

})();