/**
 * js/dashboard.js
 * MVP Developer Dashboard: profile (from GET /developers/me), approved
 * products list, logout.
 *
 * Confirmed with backend:
 *   - GET /developers/me/products (Bearer auth) is correct as assumed.
 *   - Product.status is Boolean, not a string — filter is `status === true`.
 *   - The JWT itself only carries account_id/type/exp, so profile info
 *     comes from a real call to GET /developers/me (Bearer auth) instead
 *     of client-side decoding.
 */

(function () {
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';

    document.addEventListener('DOMContentLoaded', () => {
        const token = localStorage.getItem(TOKEN_KEY);
        const accountType = localStorage.getItem(ACCOUNT_TYPE_KEY);

        // Guard: no token -> not logged in. User accounts don't have a
        // dashboard at all, per spec.
        if (!token) {
            window.location.href = '/login';
            return;
        }
        if (accountType !== 'developer') {
            window.location.href = '/ai';
            return;
        }

        fetchProfile(token);
        setupLogout();
        fetchApprovedProducts(token);
        fetchPendingSubmissions(token);
        setupEditModal(token);
        initDevNotifications(token);
    });

    /* ==========================================================================
       Developer notification tray — polls GET /submissions/me — the same endpoint your existing submit.js already uses successfully,
       diffs each submission's status against what we last saw (stored in
       localStorage), and raises a notification when one flips to
       approved/rejected. Notifications themselves also persist in
       localStorage so they survive a refresh, same as the admin tray.
       CONFIRMED: GET /submissions/me is already used successfully in submit.js.
       returns objects with at least {id, name, status}. Confirm with
       backend — if the path differs, only the fetch URL below changes.
       ========================================================================== */
    function initDevNotifications(token) {
        const NOTIF_KEY = 'enovox_dev_notifications';
        const SEEN_KEY = 'enovox_dev_submission_statuses';
        const wrapper = document.querySelector('.dev-notif-wrapper');
        if (!wrapper) return;

        const bellBtn = wrapper.querySelector('.dev-bell-btn');
        const dropdown = wrapper.querySelector('.dev-notif-dropdown');
        const badge = wrapper.querySelector('.dev-notif-badge');
        const list = wrapper.querySelector('.notification-list');
        const clearBtn = wrapper.querySelector('.clear-all-notifications');

        let notifications = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');

        function save() {
            localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
            render();
        }

        function render() {
            list.innerHTML = '';
            if (notifications.length === 0) {
                list.innerHTML = '<p class="notif-empty">No new notifications</p>';
                badge.style.display = 'none';
                return;
            }
            badge.style.display = 'inline-block';
            badge.textContent = notifications.length;
            notifications.forEach((n, i) => {
                const item = document.createElement('div');
                item.className = 'notif-item';
                item.innerHTML = `<div class="notif-item-content"><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p></div><button class="notif-delete-btn" data-i="${i}">&times;</button>`;
                list.appendChild(item);
            });
        }

        wrapper.addEventListener('click', (e) => {
            if (e.target.closest('.dev-bell-btn')) {
                dropdown.classList.toggle('hidden');
            } else if (e.target.closest('.clear-all-notifications')) {
                notifications = [];
                save();
            } else if (e.target.closest('.notif-delete-btn')) {
                const i = parseInt(e.target.closest('.notif-delete-btn').dataset.i, 10);
                notifications.splice(i, 1);
                save();
            }
        });
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) dropdown.classList.add('hidden');
        });

        render();

        async function poll() {
            try {
                const res = await fetch(`${API_URL}/submissions/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    console.error(`[dev notifications] GET /submissions/me returned ${res.status} — check this endpoint exists on the backend.`);
                    return;
                }
                const submissions = await res.json();
                if (!Array.isArray(submissions)) {
                    console.error('[dev notifications] GET /submissions/me did not return a list:', submissions);
                    return;
                }

                // SEEN_KEY persists across sessions, so a status change that
                // happens while the developer is away still notifies them on
                // their next dashboard visit. Entries are {status, name};
                // bare status strings from the old format are still accepted.
                const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
                const prevStatusOf = (entry) => (entry && typeof entry === 'object') ? entry.status : entry;
                const prevNameOf = (entry) => (entry && typeof entry === 'object') ? (entry.name || '') : '';

                let changed = false;
                const currentIds = new Set();

                submissions.forEach(s => {
                    currentIds.add(String(s.id));
                    const prevStatus = prevStatusOf(seen[s.id]);
                    if (prevStatus && prevStatus !== s.status && (s.status === 'approved' || s.status === 'rejected')) {
                        notifications.unshift({
                            title: s.status === 'approved' ? 'Submission approved!' : 'Submission rejected',
                            message: `"${s.name}" is now ${s.status}.`
                        });
                        changed = true;
                    }
                    seen[s.id] = { status: s.status, name: s.name || prevNameOf(seen[s.id]) };
                });

                // Approved submissions typically DISAPPEAR from /submissions/me
                // (they become live products), so the status flip above can't
                // always observe an approval. If an id last seen as 'pending'
                // is no longer listed, treat that as approved. Rejected items
                // stay listed (the Under Review section renders them), so
                // rejections always arrive via the flip branch.
                Object.keys(seen).forEach(id => {
                    if (currentIds.has(String(id))) return;
                    const entry = seen[id];
                    if (prevStatusOf(entry) === 'pending') {
                        const name = prevNameOf(entry);
                        notifications.unshift({
                            title: 'Submission approved!',
                            message: `"${name || 'Your submission'}" is now approved.`
                        });
                        changed = true;
                    }
                    delete seen[id]; // never notify twice for the same id
                });

                if (notifications.length > 30) {
                    notifications.length = 30; // cap the tray
                    changed = true;
                }

                localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
                if (changed) save();
            } catch (e) {
                console.error('[dev notifications] poll failed:', e);
            }
        }

        poll();
        setInterval(poll, 60000);
    }

    /* ==========================================================================
       Profile — GET /developers/me
       ========================================================================== */
    async function fetchProfile(token) {
        const avatarEl = document.getElementById('profile-avatar');
        const emailEl = document.getElementById('profile-email');
        const joinedEl = document.getElementById('profile-joined');

        try {
            const res = await fetch(`${API_URL}/developers/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401) {
                handleExpiredToken();
                return;
            }
            if (!res.ok) throw new Error('Could not load your profile.');

            const data = await res.json();
            const email = data.email || 'Developer';

            if (avatarEl) avatarEl.textContent = email.charAt(0).toUpperCase();
            if (emailEl) emailEl.textContent = email;

            if (joinedEl) {
                const joined = formatJoinedDate(data.created_at);
                joinedEl.textContent = joined ? `Member since ${joined}` : '';
            }
        } catch (err) {
            if (emailEl) emailEl.textContent = 'Unable to load profile';
            if (avatarEl) avatarEl.textContent = '!';
        }
    }

    function formatJoinedDate(raw) {
        if (!raw) return null;
        const dateObj = typeof raw === 'number' ? new Date(raw * 1000) : new Date(raw);
        if (isNaN(dateObj.getTime())) return null;
        return dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    }

    function handleExpiredToken() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ACCOUNT_TYPE_KEY);
        window.location.href = '/login';
    }

    /* ==========================================================================
       Approved products — Product.status is Boolean, so "approved" = true
       ========================================================================== */
    async function fetchApprovedProducts(token) {
        const loadingEl = document.getElementById('dashboard-products-loading');
        const emptyEl = document.getElementById('dashboard-products-empty');
        const errorEl = document.getElementById('dashboard-products-error');
        const gridEl = document.getElementById('dashboard-products-grid');

        try {
            const res = await fetch(`${API_URL}/developers/me/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401) {
                handleExpiredToken();
                return;
            }
            if (!res.ok) throw new Error('Could not load your products right now.');

            const products = await res.json();
            const approved = (products || []).filter(p => p.status === true);

            loadingEl.classList.add('hidden');

            if (approved.length === 0) {
                emptyEl.classList.remove('hidden');
                return;
            }

            gridEl.innerHTML = '';
            approved.forEach(p => gridEl.appendChild(buildProductCard(p)));

        } catch (err) {
            loadingEl.classList.add('hidden');
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }

    function buildProductCard(product) {
        const card = document.createElement('div');
        card.className = 'dashboard-product-card non-link';

        const logoHtml = product.logo_url
            ? `<img src="${escapeAttr(product.logo_url)}" alt="" class="dashboard-product-logo" onerror="this.outerHTML='<div class=\\'dashboard-product-logo\\'>${escapeHTML(getInitial(product.name))}</div>'">`
            : `<div class="dashboard-product-logo">${escapeHTML(getInitial(product.name))}</div>`;

        card.innerHTML = `
            ${logoHtml}
            <div class="dashboard-product-info">
                <a href="/product/${escapeAttr(product.slug)}" class="dashboard-product-name">${escapeHTML(product.name)}</a>
                <div class="dashboard-product-category">${escapeHTML(product.category || '')}</div>
                <button type="button" class="dashboard-edit-btn" data-kind="product">Edit</button>
            </div>
        `;
        card.querySelector('.dashboard-edit-btn').addEventListener('click', () => openEditModal(product, 'product'));
        return card;
    }

    /* ==========================================================================
       NEW: Under Review / Rejected submissions
       Reuses GET /submissions/me, the same endpoint
       initDevNotifications() already polls — never confirmed by backend.
       Confirm the path, and confirm submission objects carry the fields
       used below (id, name, category, status, rejection_reason).
       ========================================================================== */
    async function fetchPendingSubmissions(token) {
        const loadingEl = document.getElementById('dashboard-pending-loading');
        const emptyEl = document.getElementById('dashboard-pending-empty');
        const errorEl = document.getElementById('dashboard-pending-error');
        const gridEl = document.getElementById('dashboard-pending-grid');

        try {
            const res = await fetch(`${API_URL}/submissions/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.status === 401) {
                handleExpiredToken();
                return;
            }
            if (!res.ok) throw new Error('Could not load your submissions right now.');

            const submissions = await res.json();
            const relevant = (submissions || []).filter(s => s.status === 'pending' || s.status === 'rejected');

            loadingEl.classList.add('hidden');

            if (relevant.length === 0) {
                emptyEl.classList.remove('hidden');
                return;
            }

            gridEl.innerHTML = '';
            relevant.forEach(s => gridEl.appendChild(buildSubmissionCard(s)));

        } catch (err) {
            loadingEl.classList.add('hidden');
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }

    function buildSubmissionCard(sub) {
        const card = document.createElement('div');
        card.className = 'dashboard-product-card non-link';

        const logoHtml = sub.logo_url
            ? `<img src="${escapeAttr(sub.logo_url)}" alt="" class="dashboard-product-logo" onerror="this.outerHTML='<div class=\\'dashboard-product-logo\\'>${escapeHTML(getInitial(sub.name))}</div>'">`
            : `<div class="dashboard-product-logo">${escapeHTML(getInitial(sub.name))}</div>`;

        const badge = sub.status === 'rejected'
            ? `<span class="dashboard-status-badge rejected">Rejected</span>`
            : `<span class="dashboard-status-badge pending">Pending Review</span>`;
        const reason = sub.status === 'rejected' && sub.rejection_reason
            ? `<div class="dashboard-rejection-reason">"${escapeHTML(sub.rejection_reason)}"</div>`
            : '';

        card.innerHTML = `
            ${logoHtml}
            <div class="dashboard-product-info">
                <div class="dashboard-product-name">${escapeHTML(sub.name)}</div>
                <div class="dashboard-product-category">${escapeHTML(sub.category || '')}</div>
                ${badge}
                ${reason}
                <button type="button" class="dashboard-edit-btn" data-kind="submission">Edit</button>
            </div>
        `;
        card.querySelector('.dashboard-edit-btn').addEventListener('click', () => openEditModal(sub, 'submission'));
        return card;
    }

    /* ==========================================================================
       NEW: Edit modal — shared by approved products and pending/rejected
       submissions.
       ASSUMPTION (unconfirmed — flag to backend dev before shipping):
         - Editing an approved product:  PUT /developers/me/products/{id}
         - Editing a pending submission: PUT /submissions/{id}/mine  (guess —
           may not exist yet; editing a pending submission before admin
           review is a different action than editing a live product, so it
           likely needs its own endpoint)
       OPEN DECISION (raised earlier, still unresolved): should editing an
       ALREADY-APPROVED product flip it back to "pending" for re-review, or
       go live immediately? The note shown in the modal below flags this to
       the developer but the actual backend behavior is whatever the
       endpoint does — frontend has no control over that.
       ========================================================================== */
    let editingItem = null;
    let editingKind = null; // 'product' | 'submission'
    let editingOriginal = null;

    // Full editable field list — matches submit.html. Company-field note:
    // the form/DOM field is "company", but the WIRE key differs per endpoint
    // (confirmed): PUT /submissions/{id}/edit (pending submission) expects
    // "company"; PUT /products/me/{id}/edit (live product) expects
    // "company_name". handleEditSubmit() renames the key for product edits,
    // and openEditModal() reads either shape when populating.
    const EDIT_FIELDS = [
        'name', 'description', 'category', 'pricing', 'pricing_details',
        'website', 'product_type', 'logo_url', 'appstore_url', 'playstore_url',
        'user_count_range', 'founder', 'company', 'twitter_url', 'instagram_url',
        'facebook_url', 'linkedin_url', 'contact_email', 'github_url'
        // 'keywords' handled separately — it's the tag widget's hidden input
    ];

    function setupEditModal(token) {
        const modal = document.getElementById('edit-item-modal');
        const form = document.getElementById('edit-item-form');
        const closeBtn = document.getElementById('edit-modal-close');
        const cancelBtn = document.getElementById('edit-modal-cancel');
        if (!modal || !form) return;

        populateEditCategoryOptions();
        setupEditPricingDetailsToggle();
        setupEditKeywordsWidget();

        closeBtn.addEventListener('click', closeEditModal);
        cancelBtn.addEventListener('click', closeEditModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeEditModal(); });
        form.addEventListener('submit', (e) => handleEditSubmit(e, token));
    }

    function populateEditCategoryOptions() {
        const select = document.getElementById('edit_category');
        if (!select || typeof ENOVOX_CONFIG === 'undefined') return;
        ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    }

    /* Pricing Details — required only when Pricing = Paid (same rule as submit.html) */
    function setupEditPricingDetailsToggle() {
        const pricingSelect = document.getElementById('edit_pricing');
        const detailsInput = document.getElementById('edit_pricing_details');
        if (!pricingSelect || !detailsInput) return;
        pricingSelect.addEventListener('change', updateEditPricingDetailsRequirement);
        detailsInput.addEventListener('input', () => clearEditFieldError('edit_pricing_details'));
    }

    function updateEditPricingDetailsRequirement() {
        const pricingSelect = document.getElementById('edit_pricing');
        const detailsInput = document.getElementById('edit_pricing_details');
        const label = document.getElementById('edit-pricing-details-label');
        if (!pricingSelect || !detailsInput || !label) return;
        const isPaid = pricingSelect.value === 'Paid';
        detailsInput.required = isPaid;
        label.textContent = isPaid ? 'Pricing Details *' : 'Pricing Details';
        if (!isPaid) clearEditFieldError('edit_pricing_details');
    }

    /* Keywords tag-input widget — same behavior as submit-tags.js, scoped to
       the edit form's own ids so it doesn't collide with the submit page. */
    let editTags = [];
    function setupEditKeywordsWidget() {
        const chipContainer = document.getElementById('edit_keyword-chips');
        const input = document.getElementById('edit_keyword-input');
        const hidden = document.getElementById('edit_keywords');
        if (!chipContainer || !input || !hidden) return;
        const MAX_TAGS = 10;

        function sync() {
            hidden.value = editTags.join(',');
            chipContainer.innerHTML = '';
            editTags.forEach((tag, i) => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.innerHTML = `${escapeHTML(tag)}<button type="button" data-i="${i}" aria-label="Remove ${escapeHTML(tag)}">&times;</button>`;
                chipContainer.appendChild(chip);
            });
            input.disabled = editTags.length >= MAX_TAGS;
            input.placeholder = editTags.length >= MAX_TAGS ? 'Maximum 10 keywords reached' : 'Type a keyword and press Enter';
        }
        function addTag(raw) {
            const val = raw.trim().replace(/,+$/, '');
            if (!val || editTags.length >= MAX_TAGS) return;
            if (editTags.some(t => t.toLowerCase() === val.toLowerCase())) { input.value = ''; return; }
            editTags.push(val);
            input.value = '';
            clearEditFieldError('edit_keywords');
            sync();
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input.value); }
            else if (e.key === 'Backspace' && input.value === '' && editTags.length) { editTags.pop(); sync(); }
        });
        input.addEventListener('blur', () => { if (input.value.trim()) addTag(input.value); });
        chipContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-i]');
            if (!btn) return;
            editTags.splice(parseInt(btn.dataset.i, 10), 1);
            sync();
        });
        setupEditKeywordsWidget._sync = sync; // exposed for openEditModal to call after setting editTags
    }
    function setEditKeywords(commaString) {
        editTags = (commaString || '').split(',').map(t => t.trim()).filter(Boolean);
        if (typeof setupEditKeywordsWidget._sync === 'function') setupEditKeywordsWidget._sync();
    }

    function setEditFieldError(fieldId, msg) {
        const el = document.getElementById(fieldId);
        const group = el ? el.closest('.form-group') : document.getElementById(`${fieldId}-wrap-group`);
        const errorEl = document.getElementById(`${fieldId}-error`);
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = msg;
    }
    function clearEditFieldError(fieldId) {
        const el = document.getElementById(fieldId);
        const group = el ? el.closest('.form-group') : document.getElementById(`${fieldId}-wrap-group`);
        const errorEl = document.getElementById(`${fieldId}-error`);
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    function openEditModal(item, kind) {
        editingItem = item;
        editingKind = kind;

        // Snapshot original values so we only send changed fields on submit.
        // NOTE: if the list endpoint this item came from only returns
        // summary fields, most of these will legitimately be blank here —
        // that's a data-availability gap, not a bug in this form. See the
        // note flagged in chat.
        editingOriginal = {};
        EDIT_FIELDS.forEach(f => {
            let raw = item[f];
            // Live products (products table) carry the value as "company_name";
            // submissions carry it as "company". The form field is a single
            // #edit_company, so accept either shape when populating.
            if (f === 'company' && raw == null && item.company_name != null) {
                raw = item.company_name;
            }
            editingOriginal[f] = raw != null ? String(raw) : '';
            const el = document.getElementById(`edit_${f}`);
            if (el) el.value = editingOriginal[f];
        });
        editingOriginal.keywords = item.keywords != null ? String(item.keywords) : '';
        setEditKeywords(editingOriginal.keywords);

        updateEditPricingDetailsRequirement();
        EDIT_FIELDS.concat(['keywords']).forEach(f => clearEditFieldError(`edit_${f}`));

        document.getElementById('edit-modal-title').textContent = kind === 'product' ? 'Edit Product' : 'Edit Submission';

        const noteEl = document.getElementById('edit-modal-note');
        if (kind === 'product') {
            noteEl.textContent = 'This product is live. Saving changes will unpublish it and send the edit for admin review — it stays hidden until the edit is approved.';
            noteEl.classList.remove('hidden');
        } else {
            noteEl.classList.add('hidden');
        }

        const alertEl = document.getElementById('edit-modal-alert');
        alertEl.className = 'alert hidden';
        alertEl.textContent = '';

        document.getElementById('edit-item-modal').classList.remove('hidden');
    }

    function closeEditModal() {
        editingItem = null;
        editingKind = null;
        document.getElementById('edit-item-modal').classList.add('hidden');
    }

    async function handleEditSubmit(e, token) {
        e.preventDefault();
        if (!editingItem || !editingKind) return;

        const form = e.target;
        const saveBtn = document.getElementById('edit-modal-save');
        const alertEl = document.getElementById('edit-modal-alert');
        alertEl.className = 'alert hidden';

        // Pricing Details required only when Pricing = Paid (same rule as submit.html)
        clearEditFieldError('edit_pricing_details');
        if (form.pricing.value === 'Paid' && form.pricing_details.value.trim() === '') {
            setEditFieldError('edit_pricing_details', 'Please specify pricing details for paid products.');
            form.pricing_details.focus();
            return;
        }

        // Only send fields that actually changed from what was loaded.
        const current = {};
        EDIT_FIELDS.forEach(f => { current[f] = (form[f] ? form[f].value : '').trim(); });
        current.keywords = editTags.join(',');

        const payload = {};
        Object.keys(current).forEach(key => {
            if (current[key] !== (editingOriginal[key] || '')) payload[key] = current[key];
        });

        if (Object.keys(payload).length === 0) {
            closeEditModal();
            return;
        }

        // Wire-key mapping (confirmed): the products table column is
        // "company_name", the submissions table column is "company".
        // The form always sends "company"; rename it for product edits.
        if (editingKind === 'product' && Object.prototype.hasOwnProperty.call(payload, 'company')) {
            payload.company_name = payload.company;
            delete payload.company;
        }

        // Confirmed endpoints — unchanged:
        //   pending submission -> PUT /submissions/{id}/edit
        //   live product       -> PUT /products/me/{id}/edit
        const endpoint = editingKind === 'product'
            ? `${API_URL}/products/me/${editingItem.id}/edit`
            : `${API_URL}/submissions/${editingItem.id}/edit`;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.status === 401) {
                handleExpiredToken();
                return;
            }
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Could not save changes.');
            }

            const data = await res.json().catch(() => ({}));
            closeEditModal();

            // Product edits don't apply immediately — the product gets
            // unpublished and a new pending review is created instead.
            if (editingKind === 'product') {
                showEditResultMessage(data.message || 'Edit submitted for review. Product is temporarily hidden until approved.');
            }

            fetchApprovedProducts(token);
            fetchPendingSubmissions(token);

        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }

    function showEditResultMessage(message) {
        const el = document.getElementById('dashboard-products-error');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden', 'error');
        el.classList.add('info');
        setTimeout(() => el.classList.add('hidden'), 8000);
    }

    function getInitial(name) {
        return name ? name.charAt(0).toUpperCase() : 'E';
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }
    function escapeAttr(str) {
        return escapeHTML(str);
    }

    /* ==========================================================================
       Logout — same behavior as the nav's Logout: clear both keys, back home.
       ========================================================================== */
    function setupLogout() {
        const btn = document.getElementById('dashboard-logout-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ACCOUNT_TYPE_KEY);
            window.location.href = '/';
        });
    }
})();