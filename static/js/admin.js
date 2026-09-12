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
        PRICING: ['Free', 'Paid'],
        USER_COUNT: ['Just launched', '100+', '1,000+', '10,000+'],
        get CATEGORIES() { return (typeof ENOVOX_CONFIG !== 'undefined' && ENOVOX_CONFIG.CATEGORIES) || []; }
    };

    // Central in-memory state. Lists are fetched in full on load / after a
    // mutating action; filtering & pagination below are done client-side
    // against these arrays so switching tabs / typing in search is instant.
    const state = {
        products: [],
        submissions: [],
        developers: [],
        productsPage: 1,
        submissionsPage: 1,
        developersPage: 1,
        productFilter: { search: '', category: '', status: '' },
        submissionFilter: { search: '', category: '', status: 'pending' },
        developerFilter: { search: '' },
        selectedSubmissionIds: new Set()
    };

    let currentDetailSubmissionId = null;
    let rejectContext = null; // { ids: [...] }

    // DOM Elements
    const loginOverlay = document.getElementById('admin-login-overlay');
    const dashboardLayout = document.getElementById('dashboard-layout');
    const globalAlert = document.getElementById('global-alert');
    const productModal = document.getElementById('product-modal');
    const productForm = document.getElementById('admin-product-form');
    const submissionDetailModal = document.getElementById('submission-detail-modal');
    const submissionDetailBody = document.getElementById('submission-detail-body');
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

        // Populate category filter dropdowns (products + submissions toolbars)
        ['products-category-filter', 'submissions-category-filter'].forEach(id => {
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

        initAuth();
        setupNavigation();
        setupEventListeners();
        setupToolbars();
        setupSubmissionDetailModal();
        setupRejectReasonModal();
        initNotifications();
    });

    /* ==========================================================================
       Authentication
       ========================================================================== */
    function initAuth() {
        if (!adminKey) {
            loginOverlay.classList.remove('hidden');
        } else {
            loginOverlay.classList.add('hidden');
            dashboardLayout.classList.remove('hidden');
            loadAllData();
        }
    }

    // Event listeners for login / logout
    function setupEventListeners() {
        const saveKeyBtn = document.getElementById('save-key-btn');
        if (saveKeyBtn) {
            saveKeyBtn.addEventListener('click', () => {
                const input = document.getElementById('admin-key-input').value.trim();
                if (input) {
                    localStorage.setItem('enovox_admin_key', input);
                    adminKey = input;
                    initAuth();
                }
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
                productModal.classList.remove('hidden');
            });
        }

        const closeModalBtn = document.getElementById('close-modal-btn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                productModal.classList.add('hidden');
            });
        }

        if (productForm) {
            productForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('edit_product_id').value;
                const formData = new FormData(productForm);
                const payload = Object.fromEntries(formData.entries());

                [
                    'appstore_url',
                    'playstore_url',
                    'contact_email',
                    'platform',
                    'company_name',
                    'twitter_url',
                    'linkedin_url',
                    'instagram_url',
                    'facebook_url'
                ].forEach(key => {
                    if (!payload[key] || payload[key].trim() === '') {
                        payload[key] = null;
                    }
                });

                const method = id ? 'PUT' : 'POST';
                const url = id
                    ? `${API_URL}/products/${id}?admin_key=${adminKey}`
                    : `${API_URL}/products/?admin_key=${adminKey}`;

                try {
                    const res = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.detail ? JSON.stringify(err.detail) : "Failed to save product");
                    }

                    productModal.classList.add('hidden');
                    await refreshProducts();
                    showAlert('success', id ? 'Product updated successfully.' : 'Product created successfully.');
                } catch (error) {
                    alert("Error saving: " + error.message);
                }
            });
        }
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
                document.getElementById(targetId).classList.remove('hidden');

                renderActiveTab(targetId);
            });
        });
    }

    function renderActiveTab(tabId) {
        hideAlert();
        if (tabId === 'products-tab') renderProducts();
        if (tabId === 'submissions-tab') renderSubmissions();
        if (tabId === 'developers-tab') renderDevelopers();
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
            const p = state.products.find(prod => prod.id === id);
            if (!p) throw new Error("Product not found locally");

            document.getElementById('edit_product_id').value = p.id;
            document.getElementById('modal-title').textContent = 'Edit Product';

            ['name', 'contact_email', 'category', 'product_type', 'pricing', 'user_count_range',
             'website', 'logo_url', 'appstore_url', 'playstore_url', 'founder', 'platform',
             'company_name', 'twitter_url', 'linkedin_url', 'instagram_url', 'facebook_url', 'description'
            ].forEach(field => {
                if (productForm[field]) {
                    productForm[field].value = p[field] !== null ? p[field] : '';
                }
            });

            productModal.classList.remove('hidden');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

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
    function setupSubmissionDetailModal() {
        const closeBtn = document.getElementById('close-submission-modal-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            submissionDetailModal.classList.add('hidden');
            currentDetailSubmissionId = null;
        });

        const approveBtn = document.getElementById('detail-approve-btn');
        if (approveBtn) approveBtn.addEventListener('click', () => window.approveFromDetail());

        const rejectBtn = document.getElementById('detail-reject-btn');
        if (rejectBtn) rejectBtn.addEventListener('click', () => {
            if (currentDetailSubmissionId != null) openRejectReasonModal([currentDetailSubmissionId]);
        });
    }

    window.openSubmissionDetail = async function(id) {
        currentDetailSubmissionId = id;
        submissionDetailBody.innerHTML = `<p class="text-muted">Loading submission details...</p>`;
        submissionDetailModal.classList.remove('hidden');

        try {
            const res = await fetch(`${API_URL}/submissions/${id}?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to load submission details.");
            const sub = await res.json();
            renderSubmissionDetail(sub);
        } catch (error) {
            submissionDetailBody.innerHTML = `<p style="color: var(--color-red);">${escapeHTML(error.message)}</p>`;
        }
    };

    function renderSubmissionDetail(sub) {
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
            const value = sub[field.key] !== null && sub[field.key] !== undefined ? sub[field.key] : '';
            formHTML += `<div class="form-group"><label>${escapeHTML(field.label)}</label>`;
            if (field.type === 'select') {
                const options = SELECT_OPTIONS[field.options] || [];
                formHTML += `<select id="detail_${field.key}" ${!isPending ? 'disabled' : ''}>`;
                options.forEach(opt => {
                    formHTML += `<option value="${escapeHTML(opt)}" ${opt === value ? 'selected' : ''}>${escapeHTML(opt)}</option>`;
                });
                formHTML += `</select>`;
            } else {
                formHTML += `<input type="${field.type}" id="detail_${field.key}" value="${escapeHTML(value)}" ${!isPending ? 'disabled' : ''}>`;
            }
            formHTML += `</div>`;
        });
        formHTML += '</div>';

        formHTML += `
            <div class="form-group full-width">
                <label>Description</label>
                <textarea id="detail_description" rows="4" ${!isPending ? 'disabled' : ''}>${escapeHTML(sub.description || '')}</textarea>
            </div>
        `;

        submissionDetailBody.innerHTML = metaHTML + formHTML;

        // Only pending submissions can be edited / approved / rejected from here
        const approveBtn = document.getElementById('detail-approve-btn');
        const rejectBtn = document.getElementById('detail-reject-btn');
        if (approveBtn) approveBtn.classList.toggle('hidden', !isPending);
        if (rejectBtn) rejectBtn.classList.toggle('hidden', !isPending);
    }

    function statusBadgeHTMLPlain(status) {
        if (status === 'approved') return `<span class="badge active">Approved</span>`;
        if (status === 'rejected') return `<span class="badge deactivated">Rejected</span>`;
        return `<span class="badge popular">Pending Review</span>`;
    }

    window.approveFromDetail = async function() {
        if (currentDetailSubmissionId == null) return;
        const id = currentDetailSubmissionId;

        // Gather any edits the admin made before approving.
        const payload = { description: valueOf('detail_description') };
        SUBMISSION_FIELDS.forEach(field => {
            payload[field.key] = valueOf(`detail_${field.key}`);
        });

        if (!payload.name || payload.name.trim() === '') {
            showAlert('error', 'Product Name cannot be empty.');
            return;
        }

        if (!confirm("Save these edits and approve? The submission will instantly become a live product.")) return;

        try {
            const res = await fetch(`${API_URL}/submissions/${id}/approve?admin_key=${adminKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Approval failed");
            submissionDetailModal.classList.add('hidden');
            currentDetailSubmissionId = null;
            state.selectedSubmissionIds.delete(id);
            await refreshSubmissions();
            await refreshProducts();
            showAlert('success', 'Submission approved and product is now live.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    function valueOf(elId) {
        const el = document.getElementById(elId);
        if (!el) return null;
        const v = el.value;
        return v === '' ? null : v;
    }

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

})();