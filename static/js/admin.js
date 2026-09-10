/**
 * js/admin.js
 * Master Control Room logic. Uses admin_key for authorization.
 */

(function() {
    const API_URL = 'http://localhost:8000';
    let adminKey = localStorage.getItem('enovox_admin_key');

    // DOM Elements
    const loginOverlay = document.getElementById('admin-login-overlay');
    const dashboardLayout = document.getElementById('dashboard-layout');
    const globalAlert = document.getElementById('global-alert');
    const productModal = document.getElementById('product-modal');
    const productForm = document.getElementById('admin-product-form');

    document.addEventListener('DOMContentLoaded', () => {
        // Dynamically populate the Admin Modal Category dropdown
        const adminCategorySelect = document.querySelector('select[name="category"]');
        if (adminCategorySelect && typeof ENOVOX_CONFIG !== 'undefined') {
            ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                adminCategorySelect.appendChild(option);
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
        }

        initAuth();
        setupNavigation();
        setupEventListeners();
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
            loadTab('products-tab'); // Default load
        }
    }

    document.getElementById('save-key-btn').addEventListener('click', () => {
        const input = document.getElementById('admin-key-input').value.trim();
        if (input) {
            localStorage.setItem('enovox_admin_key', input);
            adminKey = input;
            initAuth();
        }
    });

    document.getElementById('logout-admin-btn').addEventListener('click', () => {
        localStorage.removeItem('enovox_admin_key');
        window.location.reload();
    });

    /* ==========================================================================
       Navigation & Tab Switching
       ========================================================================== */
    function setupNavigation() {
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active classes
                document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                
                const targetId = e.target.getAttribute('data-target');
                e.target.classList.add('active');
                document.getElementById(targetId).classList.remove('hidden');
                
                loadTab(targetId);
            });
        });
        
        // Submission Filter Toggles
        document.querySelectorAll('input[name="sub-filter"]').forEach(radio => {
            radio.addEventListener('change', () => loadTab('submissions-tab'));
        });
    }

    function loadTab(tabId) {
        hideAlert();
        if (tabId === 'products-tab') fetchProducts();
        if (tabId === 'submissions-tab') fetchSubmissions();
        if (tabId === 'developers-tab') fetchDevelopers();
    }

    /* ==========================================================================
       Fetch: Products
       ========================================================================== */
    async function fetchProducts() {
        const tbody = document.getElementById('products-table-body');
        tbody.innerHTML = '<tr><td colspan="5">Loading products...</td></tr>';
        
        try {
            const res = await fetch(`${API_URL}/products/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch products. Check admin key.");
            const products = await res.json();
            
            tbody.innerHTML = '';
            products.forEach(p => {
                const tr = document.createElement('tr');
                
                // Construct Badges
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
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red;">${error.message}</td></tr>`;
        }
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
            fetchProducts();
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
            fetchProducts();
            showAlert('success', 'Product deactivated.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    window.reactivateProduct = async function(id) {
        try {
            const res = await fetch(`${API_URL}/products/${id}/reactivate?admin_key=${adminKey}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to reactivate product");
            fetchProducts();
            showAlert('success', 'Product reactivated.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    /* ==========================================================================
       Create / Edit Product Form Modal
       ========================================================================== */
    document.getElementById('open-create-modal-btn').addEventListener('click', () => {
        productForm.reset();
        document.getElementById('edit_product_id').value = '';
        document.getElementById('modal-title').textContent = 'Create New Product';
        productModal.classList.remove('hidden');
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        productModal.classList.add('hidden');
    });

    window.editProduct = async function(id) {
        // Fetch full product details to populate form
        try {
            const res = await fetch(`${API_URL}/products/admin/all?admin_key=${adminKey}`);
            const products = await res.json();
            const p = products.find(prod => prod.id === id);
            
            if (!p) throw new Error("Product not found locally");
            
            document.getElementById('edit_product_id').value = p.id;
            document.getElementById('modal-title').textContent = 'Edit Product';
            
            // Populate fields
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

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_product_id').value;
        const formData = new FormData(productForm);
        const payload = Object.fromEntries(formData.entries());
        
        // Clean up empty optional fields so FastAPI accepts them as null
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
            fetchProducts();
            showAlert('success', id ? 'Product updated successfully.' : 'Product created successfully.');
        } catch (error) {
            alert("Error saving: " + error.message);
        }
    });

    /* ==========================================================================
       Fetch: Submissions
       ========================================================================== */
    async function fetchSubmissions() {
        const tbody = document.getElementById('submissions-table-body');
        const filter = document.querySelector('input[name="sub-filter"]:checked').value;
        tbody.innerHTML = '<tr><td colspan="5">Loading submissions...</td></tr>';
        
        const endpoint = filter === 'all' 
            ? `/submissions/admin/all?admin_key=${adminKey}`
            : `/submissions/?admin_key=${adminKey}`;

        try {
            const res = await fetch(`${API_URL}${endpoint}`);
            if (!res.ok) throw new Error("Failed to fetch submissions.");
            const subs = await res.json();
            
            tbody.innerHTML = '';
            subs.forEach(s => {
                const tr = document.createElement('tr');
                const devEmail = s.developer ? s.developer.email : 'No Developer attached';
                
                // Strictly evaluate the real status field sent by the backend
                const isPending = s.status === 'pending';
                
                // Set the badge based on the exact backend status
                let statusBadge = '';
                if (isPending) {
                    statusBadge = `<span class="badge popular">Pending Review</span>`;
                } else if (s.status === 'approved') {
                    statusBadge = `<span class="badge active">Approved</span>`;
                } else {
                    // Catch-all for any other unexpected statuses
                    statusBadge = `<span class="badge deactivated">${escapeHTML(s.status)}</span>`;
                }

                tr.innerHTML = `
                    <td><strong>${escapeHTML(s.name)}</strong></td>
                    <td>${escapeHTML(s.category)}</td>
                    <td>${escapeHTML(devEmail)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        ${isPending ? `<button class="btn-success" onclick="approveSubmission(${s.id})">Approve & Publish</button>` : '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red;">${error.message}</td></tr>`;
        }
    }

    window.approveSubmission = async function(id) {
        if (!confirm("Approve this submission? It will instantly become a live product.")) return;
        try {
            const res = await fetch(`${API_URL}/submissions/${id}/approve?admin_key=${adminKey}`, { method: 'POST' });
            if (!res.ok) throw new Error("Approval failed");
            fetchSubmissions(); // Refresh list
            showAlert('success', 'Submission approved and product is now live.');
        } catch (error) {
            showAlert('error', error.message);
        }
    };

    /* ==========================================================================
       Fetch: Developers
       ========================================================================== */
    async function fetchDevelopers() {
        const tbody = document.getElementById('developers-table-body');
        tbody.innerHTML = '<tr><td colspan="3">Loading developers...</td></tr>';
        
        try {
            const res = await fetch(`${API_URL}/developers/admin/all?admin_key=${adminKey}`);
            if (!res.ok) throw new Error("Failed to fetch developers.");
            const devs = await res.json();
            
            tbody.innerHTML = '';
            devs.forEach(d => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${d.id}</td>
                    <td><strong>${escapeHTML(d.email)}</strong></td>
                    <td>${new Date(d.created_at).toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="3" style="color:red;">${error.message}</td></tr>`;
        }
    }

    /* ==========================================================================
       Utilities
       ========================================================================== */
    function showAlert(type, msg) {
        globalAlert.textContent = msg;
        globalAlert.className = `alert ${type}`;
        globalAlert.classList.remove('hidden');
        setTimeout(() => globalAlert.classList.add('hidden'), 4000);
    }
    function hideAlert() {
        globalAlert.classList.add('hidden');
    }
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));
    }
    
    // Close dropdowns when clicking outside
    window.onclick = function(event) {
        if (!event.target.matches('.dot-btn')) {
            document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
        }
    }

})();