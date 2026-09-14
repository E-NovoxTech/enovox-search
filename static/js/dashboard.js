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
        initDevNotifications(token);
    });

    /* ==========================================================================
       Developer notification tray — polls GET /submissions/me,
       diffs each submission's status against what we last saw (stored in
       localStorage), and raises a notification when one flips to
       approved/rejected. Notifications themselves also persist in
       localStorage so they survive a refresh, same as the admin tray.
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
                if (!res.ok) return;
                const submissions = await res.json();
                const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');

                (submissions || []).forEach(s => {
                    const prev = seen[s.id];
                    if (prev && prev !== s.status && (s.status === 'approved' || s.status === 'rejected')) {
                        notifications.unshift({
                            title: s.status === 'approved' ? 'Submission approved!' : 'Submission rejected',
                            message: `"${s.name}" is now ${s.status}.`
                        });
                    }
                    seen[s.id] = s.status;
                });

                localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
                save();
            } catch (e) { /* silent — next poll retries */ }
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
        const card = document.createElement('a');
        card.className = 'dashboard-product-card';
        card.href = `/product/${product.slug}`;

        const logoHtml = product.logo_url
            ? `<img src="${escapeAttr(product.logo_url)}" alt="" class="dashboard-product-logo" onerror="this.outerHTML='<div class=\\'dashboard-product-logo\\'>${escapeHTML(getInitial(product.name))}</div>'">`
            : `<div class="dashboard-product-logo">${escapeHTML(getInitial(product.name))}</div>`;

        card.innerHTML = `
            ${logoHtml}
            <div class="dashboard-product-info">
                <div class="dashboard-product-name">${escapeHTML(product.name)}</div>
                <div class="dashboard-product-category">${escapeHTML(product.category || '')}</div>
            </div>
        `;
        return card;
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