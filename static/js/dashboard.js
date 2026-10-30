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
 *   - GET /submissions/me now returns ALL submissions (pending, approved,
 *     rejected) instead of only pending ones.
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
        initProductTabs();
        initDraftsDropdown(token);
        fetchSpotlightSummary(token);
        initSpotlightRefetchOnReturn(token);
        setupEditModal(token);
        initDevNotifications(token);
        setupDeleteAccount(token);
    });

    /* ==========================================================================
       Product tabs — segmented Approved | Under review switcher. Real tabs:
       role=tablist / role=tab / role=tabpanel, aria-selected syncing, roving
       tabindex and arrow-key movement.
       ========================================================================== */
    function initProductTabs() {
        const tabApproved = document.getElementById('db-tab-approved');
        const tabReview = document.getElementById('db-tab-review');
        const paneApproved = document.getElementById('db-pane-approved');
        const paneReview = document.getElementById('db-pane-review');
        if (!tabApproved || !tabReview || !paneApproved || !paneReview) return;
        const tabs = [tabApproved, tabReview];
        const whichOf = (tab) => (tab === tabReview ? 'review' : 'approved');

        function activate(which, moveFocus) {
            tabs.forEach((tab) => {
                const selected = whichOf(tab) === which;
                tab.classList.toggle('is-active', selected);
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                if (selected && moveFocus) tab.focus();
            });
            paneApproved.hidden = which !== 'approved';
            paneReview.hidden = which !== 'review';
        }

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => activate(whichOf(tab), false));
            tab.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const dir = event.key === 'ArrowRight' ? 1 : -1;
                const next = tabs[(tabs.indexOf(tab) + dir + tabs.length) % tabs.length];
                activate(whichOf(next), true);
            });
        });
    }

    /* ==========================================================================
       Founder Spotlight card + saved-drafts dropdown — one fresh
       GET /spotlight/my (cache: no-store, same source the old drafts section
       used) feeds:
         - the Spotlight stats tile (Not applied / Pending / Approved)
         - the spotlight card body — exactly ONE of: intro / pending / approved
         - the drafts count badge + list inside the disclosure
       Draft delete runs through DELETE /spotlight/apply/{id} — the rest
       sibling of the PUT the apply page's edit path already uses
       (PUT /spotlight/apply/{id}). If the backend names the delete route
       differently ONLY this call is affected — everything else keeps working.
       Errors render INSIDE the card/dropdown — never a page-level red box.
       ========================================================================== */
    let spotlightTokenCache = null;

    function spotlightDate(rawDate) {
        if (!rawDate) return '';
        const when = new Date(rawDate);
        if (Number.isNaN(when.getTime())) return '';
        return when.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    }

        /* ---- Rejection notices: one dismissible notice per rejected application ---- */
    const DISMISSED_SPOTLIGHT_KEY = 'enovox_dev_spotlight_dismissed';

    function getDismissedSpotlightIds() {
        try {
            const raw = JSON.parse(localStorage.getItem(DISMISSED_SPOTLIGHT_KEY) || '[]');
            return new Set(Array.isArray(raw) ? raw.map(String) : []);
        } catch (e) {
            return new Set();
        }
    }

    function rememberDismissedSpotlight(id) {
        const dismissed = getDismissedSpotlightIds();
        dismissed.add(String(id));
        try {
            localStorage.setItem(DISMISSED_SPOTLIGHT_KEY, JSON.stringify([...dismissed]));
        } catch (e) { /* storage blocked: notice still hides for this session */ }
    }

    function renderSpotlightNotices(apps) {
        const box = document.getElementById('db-spotlight-notices');
        if (!box) return;
        box.replaceChildren();
        const dismissed = getDismissedSpotlightIds();
        (apps || [])
            .filter((app) => app && app.status === 'rejected' && !dismissed.has(String(app.id)))
            .sort((a, b) => String(b.updated_at || b.created_at || '')
                .localeCompare(String(a.updated_at || a.created_at || '')))
            .forEach((app) => {
                const reason = String(app.rejection_reason || '').trim();
                const title = app.startup_name
                    ? `${app.startup_name}: spotlight application not approved`
                    : 'Spotlight application not approved';
                const notice = document.createElement('div');
                notice.className = 'db-notice db-notice-rejected';
                notice.setAttribute('role', 'alert');
                notice.innerHTML = `
                    <i class="fa-solid fa-circle-exclamation db-notice-icon" aria-hidden="true"></i>
                    <div class="db-notice-copy">
                        <strong>${escapeHTML(title)}</strong>
                        <p>${reason ? escapeHTML(reason) : 'No reason was provided.'}</p>
                    </div>
                    <button type="button" class="db-notice-dismiss" aria-label="Dismiss notification">&times;</button>`;
                notice.querySelector('.db-notice-dismiss').addEventListener('click', () => {
                    rememberDismissedSpotlight(app.id);
                    notice.remove();
                });
                box.appendChild(notice);
            });
    }

    function renderSpotlightBody(apps) {
        const body = document.getElementById('db-spotlight-body');
        const tile = document.getElementById('db-stat-spotlight');
        if (!body) return;

        const live = (apps || [])
            .filter((app) => app && (app.status === 'pending' || app.status === 'approved'))
            .sort((a, b) => String(b.updated_at || b.created_at || '')
                .localeCompare(String(a.updated_at || a.created_at || '')));
        const current = live[0] || null;
        const pendingApp = live.find((app) => app.status === 'pending') || null;

        /* No pending/approved application -> intro + CTA (rejected ones show as notices above) */
        if (!current) {
            if (tile) tile.textContent = 'Not applied';
            body.innerHTML = `
                <p class="db-muted db-spotlight-intro">Share your story with people discovering what Nigeria is building.</p>
                <a class="db-btn-primary db-btn-block db-spotlight-apply" href="/spotlight/apply">Apply for spotlight</a>`;
            return;
        }

        const name = escapeHTML(current.startup_name || 'Untitled startup');
        const submitted = spotlightDate(current.created_at || current.updated_at);
        const againLink = '<a class="db-link" href="/spotlight/apply">Apply for another startup <span aria-hidden="true">&rarr;</span></a>';
        const underReview = (app) => `
            <p class="db-spotlight-status"><span class="db-pill db-pill-amber"><span class="db-dot db-dot-amber" aria-hidden="true"></span>Spotlight application under review</span></p>
            <p class="db-spotlight-name">${escapeHTML(app.startup_name || 'Untitled startup')}</p>`;

        if (current.status === 'pending') {
            if (tile) tile.textContent = 'Pending';
            body.innerHTML = `
                ${underReview(current)}
                ${submitted ? `<p class="db-muted db-spotlight-sub">Submitted ${escapeHTML(submitted)}</p>` : '<p class="db-muted db-spotlight-sub">We&rsquo;re reviewing your application.</p>'}
                ${againLink}`;
            return;
        }

        /* Newest entry is approved; if another application is still pending, show that too. */
        if (tile) tile.textContent = 'Approved';
        body.innerHTML = `
            <p class="db-spotlight-status"><span class="db-pill db-pill-green"><span class="db-dot db-dot-green" aria-hidden="true"></span>Approved</span></p>
            <p class="db-spotlight-name">${name}</p>
            <p class="db-muted db-spotlight-sub">We'll email you the link to share when it goes live.</p>
            ${pendingApp ? `<div class="db-spotlight-extra">${underReview(pendingApp)}</div>` : ''}
            ${againLink}`;
    }

    /* Re-fetch GET /spotlight/my when the founder returns to this page (back button / bfcache,
       or switching back to the tab after submitting on /spotlight/apply). A draft that was
       actually Submitted is "pending" server-side, so it drops out of the drafts list. */
    let spotlightLastFetch = 0;
    function initSpotlightRefetchOnReturn(token) {
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) fetchSpotlightSummary(token);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && Date.now() - spotlightLastFetch > 15000) {
                fetchSpotlightSummary(token);
            }
        });
    }
    function buildDraftRow(draft) {
        const li = document.createElement('li');
        li.className = 'db-draft';
        li.dataset.draftId = String(draft.id);
        const saved = spotlightDate(draft.updated_at || draft.created_at);
        li.innerHTML = `
            <div class="db-draft-info">
                <span class="db-draft-title">${escapeHTML(draft.startup_name || 'Untitled draft')}</span>
                <span class="db-draft-meta">${saved ? `Saved ${escapeHTML(saved)}` : 'Saved'}</span>
            </div>
            <div class="db-draft-actions">
                <a class="db-draft-continue" href="/spotlight/apply?edit=${encodeURIComponent(String(draft.id))}">Continue</a>
                <button type="button" class="db-draft-delete" aria-label="Delete draft" title="Delete draft">
                    <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
                </button>
            </div>`;
        li.querySelector('.db-draft-delete').addEventListener('click', () => confirmDeleteDraft(li, draft));
        return li;
    }

    /* Two-step inline delete: first click arms the row (Delete draft/Cancel),
       Delete performs the DELETE call, Cancel restores. Failures stay inline
       on the row, never page-level. */
    function confirmDeleteDraft(li, draft) {
        if (li.classList.contains('is-confirming')) return;
        li.classList.add('is-confirming');
        const actions = li.querySelector('.db-draft-actions');
        if (!actions) return;
        li.dataset.actionsHtml = actions.innerHTML;

        const yes = document.createElement('button');
        yes.type = 'button';
        yes.className = 'db-draft-confirm-yes';
        yes.textContent = 'Delete draft';
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'db-draft-confirm-no';
        no.textContent = 'Cancel';

        const restore = (errorText) => {
            li.classList.remove('is-confirming');
            actions.innerHTML = li.dataset.actionsHtml || '';
            const rearmed = li.querySelector('.db-draft-delete');
            if (rearmed) rearmed.addEventListener('click', () => confirmDeleteDraft(li, draft));
            const stale = li.querySelector('.db-draft-error');
            if (stale) stale.remove();
            if (errorText) {
                const err = document.createElement('span');
                err.className = 'db-draft-error';
                err.setAttribute('role', 'alert');
                err.textContent = errorText;
                li.appendChild(err);
            }
        };

        no.addEventListener('click', () => restore());
        yes.addEventListener('click', async () => {
            yes.disabled = true;
            no.disabled = true;
            yes.textContent = 'Deleting...';
            try {
                const res = await fetch(`${API_URL}/spotlight/apply/${encodeURIComponent(String(draft.id))}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${spotlightTokenCache}`, Accept: 'application/json' }
                });
                if (!res.ok && res.status !== 404) throw new Error(`delete failed (HTTP ${res.status})`);
                await fetchSpotlightSummary(spotlightTokenCache);
            } catch (e) {
                console.error('[dashboard] draft delete failed:', e);
                restore('Could not delete. Try again.');
            }
        });

        actions.replaceChildren(no, yes);
    }

    function renderDraftsPanel(apps) {
        const count = document.getElementById('db-drafts-count');
        const list = document.getElementById('db-drafts-list');
        const empty = document.getElementById('db-drafts-empty');
        const loading = document.getElementById('db-drafts-loading');
        if (loading) loading.hidden = true;
        const drafts = (apps || []).filter((app) => app && app.status === 'draft');
        if (count) count.textContent = String(drafts.length);
        if (!list) return;
        list.replaceChildren();
        if (!drafts.length) {
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;
        drafts
            .slice()
            .sort((a, b) => String(b.updated_at || b.created_at || '')
                .localeCompare(String(a.updated_at || a.created_at || '')))
            .forEach((draft) => list.appendChild(buildDraftRow(draft)));
    }

    async function fetchSpotlightSummary(token) {
        spotlightTokenCache = token;
        spotlightLastFetch = Date.now();
        const body = document.getElementById('db-spotlight-body');
        const tile = document.getElementById('db-stat-spotlight');
        const loading = document.getElementById('db-drafts-loading');
        const error = document.getElementById('db-drafts-error');
        if (error) error.hidden = true;
        if (loading) loading.hidden = false;
        try {
            const res = await fetch(`${API_URL}/spotlight/my`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                cache: 'no-store'
            });
            if (res.status === 401) { handleExpiredToken(); return; }
            if (!res.ok) throw new Error(`spotlight summary failed (HTTP ${res.status})`);
            const data = await res.json();
            const apps = Array.isArray(data) ? data : [];
            renderSpotlightNotices(apps);
            renderSpotlightBody(apps);
            renderDraftsPanel(apps);
        } catch (e) {
            console.error('[dashboard] spotlight summary failed:', e);
            if (loading) loading.hidden = true;
            /* Inline, card-local error + Retry — never a page-level red box. */
            if (error) error.hidden = false;
            if (tile) tile.textContent = '\u2014';
            if (body) {
                body.innerHTML = `
                    <p class="db-muted db-spotlight-intro">We couldn't load your spotlight status right now.</p>
                    <button type="button" class="db-btn-secondary db-btn-block" id="db-spotlight-retry">Retry</button>`;
                const again = document.getElementById('db-spotlight-retry');
                if (again) again.addEventListener('click', () => fetchSpotlightSummary(token));
            }
        }
    }

    function initDraftsDropdown(token) {
        const toggle = document.getElementById('db-drafts-toggle');
        const panel = document.getElementById('db-drafts-panel');
        const retry = document.getElementById('db-drafts-retry');
        if (toggle && panel) {
            toggle.addEventListener('click', () => {
                const open = panel.hidden;
                panel.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                toggle.classList.toggle('is-open', open);
            });
        }
        if (retry) retry.addEventListener('click', () => fetchSpotlightSummary(token));
    }

    /* ==========================================================================
       Developer notification tray — polls GET /submissions/me, which now
       returns the FULL set of submissions (pending, approved, rejected) —
       not just pending ones. This function receives that full, unfiltered
       response and diffs each submission's status against what we last saw
       (stored in localStorage), raising a notification when one flips from
       pending -> approved or pending -> rejected. Notifications themselves
       also persist in localStorage so they survive a refresh, same as the
       admin tray.

       FIX: previously, /submissions/me only returned pending submissions,
       so an approval could only be inferred by an id DISAPPEARING from the
       list. Now that the endpoint returns every submission regardless of
       status, that inference is gone — we detect approval/rejection
       directly from the real status value on each submission, exactly like
       any other status flip. The disappeared-id branch is removed entirely.
       ========================================================================== */
    function initDevNotifications(token) {
        const NOTIF_KEY = 'enovox_dev_notifications';
        const SEEN_KEY = 'enovox_dev_submission_statuses';
        const card = document.getElementById('db-notifs-card');
        if (!card) return;

        const badge = document.getElementById('db-notifs-badge');
        const list = document.getElementById('db-notifs-list');
        const clearBtn = document.getElementById('db-notifs-clear');

        let notifications = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');

        function save() {
            localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
            render();
        }

        function render() {
            list.innerHTML = '';
            if (notifications.length === 0) {
                list.innerHTML = '<p class="db-notif-empty">No new notifications</p>';
                if (badge) badge.hidden = true;
                if (clearBtn) clearBtn.classList.add('hidden');
                return;
            }
            if (badge) {
                badge.hidden = false;
                badge.textContent = `${notifications.length} new`;
            }
            if (clearBtn) clearBtn.classList.remove('hidden');
            notifications.forEach((n, i) => {
                const item = document.createElement('div');
                item.className = 'db-notif-item';
                item.innerHTML = `<span class="db-notif-dot" aria-hidden="true"></span><div class="db-notif-content"><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.message)}</p></div><button type="button" class="db-notif-delete" data-i="${i}" aria-label="Dismiss notification">&times;</button>`;
                list.appendChild(item);
            });
        }

        card.addEventListener('click', (e) => {
            if (clearBtn && e.target.closest('#db-notifs-clear')) {
                notifications = [];
                save();
            } else if (e.target.closest('.db-notif-delete')) {
                const i = parseInt(e.target.closest('.db-notif-delete').dataset.i, 10);
                notifications.splice(i, 1);
                save();
            }
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
                // IMPORTANT: this is the full, unfiltered response — pending,
                // approved, AND rejected submissions. Do not filter it before
                // running the notification diff below; the pending-only view
                // used elsewhere on the dashboard filters its own copy
                // separately (see fetchPendingSubmissions).
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
                function buildStatusNotification(status, name, reason) {
                    const label = name || 'Your submission';

                    if (status === 'approved') {
                        return {
                            title: 'Submission approved!',
                            message: `"${label}" was approved!`
                        };
                    }

                    if (status === 'rejected') {
                        return {
                            title: 'Submission rejected',
                            message: reason
                                ? `"${label}" was rejected: ${reason}`
                                : `"${label}" was rejected.`
                        };
                    }

                    return null;
                }
                let changed = false;
                const currentIds = new Set();

                // Single pass over the FULL submissions list: for each one,
                // compare its real current status against what we last saw.
                // pending -> approved and pending -> rejected are both
                // detected directly here now that approved/rejected items no
                // longer vanish from the response.
                submissions.forEach(s => {
                    currentIds.add(String(s.id));
                    const prevStatus = prevStatusOf(seen[s.id]);
                    if (prevStatus && prevStatus !== s.status) {
                        const note = buildStatusNotification(
                            s.status,
                            s.name,
                            s.rejection_reason
                        );

                        if (note) {
                            notifications.unshift(note);
                            changed = true;
                        }
                    }
                    seen[s.id] = { status: s.status, name: s.name || prevNameOf(seen[s.id]) };
                });

                // REMOVED: the old "disappeared id last seen as pending ==
                // approved" inference. That was only needed when the endpoint
                // returned pending-only data; now every submission (including
                // approved/rejected ones) stays in the response, so a missing
                // id just means it belongs to a different developer account
                // or was actually deleted — not an approval. We still prune
                // seen[] entries for ids that truly vanished, so stale keys
                // don't accumulate forever.
                Object.keys(seen).forEach(id => {
                    if (!currentIds.has(String(id))) delete seen[id];
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

            const statApprovedEl = document.getElementById('db-stat-approved');
            if (statApprovedEl) statApprovedEl.textContent = String(approved.length);
            const countApprovedEl = document.getElementById('db-count-approved');
            if (countApprovedEl) countApprovedEl.textContent = String(approved.length);

            // Subtle second entry point: only when at least one product is live.
            const featuredEl = document.getElementById('db-products-featured');
            if (featuredEl) featuredEl.hidden = approved.length === 0;

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
        card.className = 'db-product';

        const name = product.name || '';
        const tint = `db-logo-tint${Math.abs(String(name).charCodeAt(0) || 0) % 6}`;
        const initial = escapeHTML(getInitial(name));
        const logoHtml = product.logo_url
            ? `<img src="${escapeAttr(product.logo_url)}" alt="" class="db-product-logo db-product-logo-img" onerror="this.outerHTML='<div class=\\'db-product-logo ${tint}\\'>${initial}</div>'">`
            : `<div class="db-product-logo ${tint}">${initial}</div>`;

        card.innerHTML = `
            <div class="db-product-main">
                ${logoHtml}
                <div class="db-product-info">
                    <a href="/product/${escapeAttr(product.slug)}" class="db-product-name" title="${escapeAttr(name)}">${escapeHTML(name)}</a>
                    <div class="db-product-category">${escapeHTML(product.category || '')}</div>
                </div>
            </div>
            <div class="db-product-side">
                <button type="button" class="db-edit-btn" data-kind="product">Edit</button>
                <span class="db-product-status db-status-approved"><span class="db-dot db-dot-green" aria-hidden="true"></span>Approved</span>
            </div>
        `;
        card.querySelector('.db-edit-btn').addEventListener('click', () => openEditModal(product, 'product'));
        return card;
    }

    /* ==========================================================================
       Under Review submissions list.
       FIX: GET /submissions/me now returns ALL submissions (pending,
       approved, rejected). This view only ever wants to show submissions
       that are still awaiting a decision, so it filters to status ===
       'pending' only.

       Per product decision: once a submission is approved, it moves to the
       Approved Products grid (fetchApprovedProducts) and should drop out of
       this list — filtering to 'pending' only already achieves that, since
       an approved item's status is no longer 'pending'. Once a submission
       is rejected, it should also stop showing here (rejected items no
       longer persist in this view either) — same 'pending'-only filter
       handles that too, since a rejected item's status is 'rejected', not
       'pending'. So only truly-pending submissions ever render in this
       section; approved and rejected items are both cleared from it
       automatically by this filter, with approved ones surfacing instead in
       the Approved Products grid above.
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
            const relevant = (submissions || []).filter(s => s.status === 'pending');

            const statReviewEl = document.getElementById('db-stat-review');
            if (statReviewEl) statReviewEl.textContent = String(relevant.length);
            const countReviewEl = document.getElementById('db-count-review');
            if (countReviewEl) countReviewEl.textContent = String(relevant.length);

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
        card.className = 'db-product';

        const name = sub.name || '';
        const tint = `db-logo-tint${Math.abs(String(name).charCodeAt(0) || 0) % 6}`;
        const initial = escapeHTML(getInitial(name));
        const logoHtml = sub.logo_url
            ? `<img src="${escapeAttr(sub.logo_url)}" alt="" class="db-product-logo db-product-logo-img" onerror="this.outerHTML='<div class=\\'db-product-logo ${tint}\\'>${initial}</div>'">`
            : `<div class="db-product-logo ${tint}">${initial}</div>`;

        // NOTE: with the pending-only filter above, this card is only ever
        // built for status === 'pending' submissions. The rejected branches
        // stay as dead-safe fallback rendering in case this function is ever
        // called with a non-pending item from elsewhere.
        const statusHtml = sub.status === 'rejected'
            ? '<span class="db-product-status db-status-rejected"><span class="db-dot db-dot-red" aria-hidden="true"></span>Rejected</span>'
            : '<span class="db-product-status db-status-pending"><span class="db-dot db-dot-amber" aria-hidden="true"></span>Pending review</span>';
        const reason = sub.status === 'rejected' && sub.rejection_reason
            ? `<div class="db-rejection-reason">"${escapeHTML(sub.rejection_reason)}"</div>`
            : '';

        card.innerHTML = `
            <div class="db-product-main">
                ${logoHtml}
                <div class="db-product-info">
                    <div class="db-product-name" title="${escapeAttr(name)}">${escapeHTML(name)}</div>
                    <div class="db-product-category">${escapeHTML(sub.category || '')}</div>
                </div>
            </div>
            <div class="db-product-side">
                <button type="button" class="db-edit-btn" data-kind="submission">Edit</button>
                ${statusHtml}
            </div>
            ${reason}
        `;
        card.querySelector('.db-edit-btn').addEventListener('click', () => openEditModal(sub, 'submission'));
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
    const editAlternativeState = {
        requestId: 0, category: '', ready: false, sourceKnown: false,
        available: new Set(), selected: new Set(), original: new Set()
    };

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
        setupEditAlternatives();

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

   // Pricing Details is now ALWAYS required, regardless of pricing model
// (matches submit.html's current validation — no longer conditional on
// pricing === 'Paid').
    function updateEditPricingDetailsRequirement() {
        const detailsInput = document.getElementById('edit_pricing_details');
        const label = document.getElementById('edit-pricing-details-label');
        if (!detailsInput || !label) return;
        detailsInput.required = true;
        label.textContent = 'Pricing Details *';
    }

    /* Alternative To: same select-like disclosure used by the submit form. */
    function parseEditForeignToolIds(raw) {
        const values = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
        return new Set(values.map(value => {
            // Product-alternative link records can have their OWN id as well
            // as foreign_tool_id. Only the latter identifies the checkbox.
            const toolId = value && typeof value === 'object'
                ? (value.foreign_tool_id ?? value.foreign_tool?.id ?? value.id) : value;
            return typeof toolId === 'string' && !toolId.trim() ? NaN : Number(toolId);
        }).filter(id => Number.isSafeInteger(id) && id > 0));
    }

    function editAlternativeLinksArray(raw) {
        if (Array.isArray(raw)) return raw;
        // Accept both the flat list and common envelope shapes without ever
        // interpreting a product/link record's id as a foreign tool id.
        if (raw && typeof raw === 'object') {
            for (const key of ['alternatives', 'foreign_tools', 'foreign_tool_ids']) {
                if (Array.isArray(raw[key])) return raw[key];
            }
        }
        return null;
    }

    let editHelpPinned = false;
    function setEditAlternativeHelpOpen(open) {
        const pop = document.getElementById('edit-alternatives-help-pop');
        const btn = document.getElementById('edit-alternatives-help-btn');
        pop.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', String(!!open));
        if (!open) editHelpPinned = false;
    }

    function setupEditAlternatives() {
        const category = document.getElementById('edit_category');
        const trigger = document.getElementById('edit-alternative-trigger');
        const dropdown = document.querySelector('#edit-alternatives-group .alternative-dropdown');
        const panel = document.getElementById('edit-alternative-options');
        const help = document.getElementById('edit-alternatives-help-btn');
        const helpPop = document.getElementById('edit-alternatives-help-pop');
        if (!category || !trigger || !panel) return;

        category.addEventListener('change', () => {
            const restoreOriginal = category.value === editingOriginal?.category;
            if (restoreOriginal) editAlternativeState.selected = new Set(editAlternativeState.original);
            loadEditAlternatives({ keepSelection: restoreOriginal });
        });
        trigger.addEventListener('click', () => setEditAlternativeOpen(panel.classList.contains('hidden')));
        panel.addEventListener('change', event => {
            const box = event.target.closest('input[type="checkbox"]');
            if (!box) return;
            const id = Number(box.value);
            // An existing saved link may no longer appear in the catalog.
            // Let its owner uncheck it without silently deleting it on load.
            if (!editAlternativeState.available.has(id) && !editAlternativeState.original.has(id)) {
                box.checked = false;
                return;
            }
            if (box.checked) editAlternativeState.selected.add(id);
            else editAlternativeState.selected.delete(id);
            updateEditAlternativeSummary();
            if (editAlternativeState.selected.size) clearEditAlternativeError();
        });
        document.getElementById('edit-alternative-retry').addEventListener('click', () =>
            loadEditAlternatives({ keepSelection: true })
        );
        document.addEventListener('click', event => {
            if (!dropdown.contains(event.target)) setEditAlternativeOpen(false);
            if (!help.contains(event.target) && !helpPop.contains(event.target)) setEditAlternativeHelpOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                const wasOpen = !panel.classList.contains('hidden');
                setEditAlternativeOpen(false);
                setEditAlternativeHelpOpen(false);
                if (wasOpen) trigger.focus();
            }
        });
        help.addEventListener('mouseenter', () => setEditAlternativeHelpOpen(true));
        help.addEventListener('mouseleave', () => { if (!editHelpPinned) setEditAlternativeHelpOpen(false); });
        help.addEventListener('click', () => {
            if (editHelpPinned) setEditAlternativeHelpOpen(false);
            else { editHelpPinned = true; setEditAlternativeHelpOpen(true); }
        });
        document.getElementById('edit-alternatives-help-close').addEventListener('click', () =>
            setEditAlternativeHelpOpen(false)
        );
    }

    function setEditAlternativeOpen(open) {
        const panel = document.getElementById('edit-alternative-options');
        const trigger = document.getElementById('edit-alternative-trigger');
        const expanded = !!open && !trigger.disabled && editAlternativeState.ready;
        panel.classList.toggle('hidden', !expanded);
        trigger.setAttribute('aria-expanded', String(expanded));
    }

    function updateEditAlternativeSummary() {
        const count = editAlternativeState.selected.size;
        document.getElementById('edit-alternative-summary').textContent = count
            ? `${count} foreign tool${count === 1 ? '' : 's'} selected` : 'Select foreign tools';
    }

    function setEditAlternativeError(message) {
        document.getElementById('edit-alternatives-group').classList.add('has-error');
        document.getElementById('edit-alternatives-error').textContent = message;
        document.getElementById('edit-alternative-trigger').setAttribute('aria-invalid', 'true');
    }
    function clearEditAlternativeError() {
        document.getElementById('edit-alternatives-group').classList.remove('has-error');
        document.getElementById('edit-alternatives-error').textContent = '';
        document.getElementById('edit-alternative-trigger').removeAttribute('aria-invalid');
    }

    function prepareEditAlternatives(item, kind) {
        ++editAlternativeState.requestId;
        editAlternativeState.category = '';
        editAlternativeState.ready = false;
        editAlternativeState.sourceKnown = kind === 'submission' &&
            Object.prototype.hasOwnProperty.call(item, 'foreign_tool_ids');
        editAlternativeState.available.clear();
        editAlternativeState.selected = editAlternativeState.sourceKnown
            ? parseEditForeignToolIds(item.foreign_tool_ids) : new Set();
        editAlternativeState.original = new Set(editAlternativeState.selected);
        setEditAlternativeOpen(false);
        setEditAlternativeHelpOpen(false);
        clearEditAlternativeError();
        loadEditAlternatives({ keepSelection: true });
    }

    async function loadEditAlternatives({ keepSelection = false } = {}) {
        if (!editingItem || !editingKind) return;
        const category = document.getElementById('edit_category').value;
        const requestId = ++editAlternativeState.requestId;
        editAlternativeState.category = category;
        editAlternativeState.ready = false;
        editAlternativeState.available.clear();
        if (!keepSelection) editAlternativeState.selected.clear();

        const panel = document.getElementById('edit-alternative-options');
        const trigger = document.getElementById('edit-alternative-trigger');
        const summary = document.getElementById('edit-alternative-summary');
        const status = document.getElementById('edit-alternative-status');
        const retry = document.getElementById('edit-alternative-retry');
        setEditAlternativeOpen(false);
        panel.replaceChildren();
        trigger.disabled = true;
        status.textContent = '';
        retry.classList.add('hidden');
        clearEditAlternativeError();
        summary.textContent = category ? 'Loading alternatives…' : 'Choose a category first';
        if (!category) return;

        try {
            const toolsRequest = fetch(`${API_URL}/products/alternatives/foreign-tools?category=${encodeURIComponent(category)}`);
            const linksRequest = editingKind === 'product' && !editAlternativeState.sourceKnown
                ? fetch(`${API_URL}/products/${encodeURIComponent(editingItem.id)}/alternatives`)
                : Promise.resolve(null);
            const [toolsRes, linksRes] = await Promise.all([toolsRequest, linksRequest]);
            if (requestId !== editAlternativeState.requestId) return;

            // Read live-product links before validating the catalog response.
            // A catalog error must not make saved links appear to be empty.
            if (linksRes) {
                if (!linksRes.ok) throw new Error('Could not load linked alternatives.');
                const linked = editAlternativeLinksArray(await linksRes.json());
                if (!linked) throw new Error('Invalid linked alternatives response from the server.');
                if (requestId !== editAlternativeState.requestId) return;
                editAlternativeState.original = parseEditForeignToolIds(linked);
                editAlternativeState.sourceKnown = true;
                if (keepSelection) editAlternativeState.selected = new Set(editAlternativeState.original);
                updateEditAlternativeSummary();
            }
            if (!editAlternativeState.sourceKnown) throw new Error('Existing submission alternatives are unavailable.');
            if (!toolsRes.ok) throw new Error('Could not load matching foreign tools.');
            const tools = await toolsRes.json();
            if (!Array.isArray(tools)) throw new Error('Invalid alternatives response from the server.');
            if (requestId !== editAlternativeState.requestId) return;

            const matching = [];
            const seen = new Set();
            for (const tool of tools) {
                if (!tool || (tool.category && tool.category !== category)) continue;
                const id = Number(tool.id);
                if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A foreign tool is missing its ID.');
                if (!seen.has(id)) { matching.push(tool); seen.add(id); }
            }
            editAlternativeState.available = seen;
            editAlternativeState.ready = true;
            const missing = [...editAlternativeState.selected].filter(id => !seen.has(id));
            if (missing.length) {
                status.textContent = 'Saved alternatives not in this category list are still selected below. Uncheck one only if you want to remove it.';
            } else if (linksRes && !editAlternativeState.original.size) {
                status.textContent = 'This published product has no linked alternatives. If you selected one before approval, the product links may not have been carried over.';
            }
            if (!matching.length && !missing.length) {
                summary.textContent = 'No foreign tools in this category';
                status.textContent = 'No foreign tools are available here. Choose another category.';
            } else {
                const rows = document.createDocumentFragment();
                missing.forEach(id => {
                    const label = document.createElement('label');
                    label.className = 'alternative-option is-unavailable';
                    const box = document.createElement('input');
                    box.type = 'checkbox';
                    box.value = String(id);
                    box.checked = true;
                    const name = document.createElement('span');
                    name.className = 'alternative-option-name';
                    name.textContent = `Previously linked tool #${id} (not in this category list)`;
                    label.append(box, name);
                    rows.appendChild(label);
                });
                matching.forEach(tool => {
                    const id = Number(tool.id);
                    const label = document.createElement('label');
                    label.className = 'alternative-option';
                    const box = document.createElement('input');
                    box.type = 'checkbox';
                    box.value = String(id);
                    box.checked = editAlternativeState.selected.has(id);
                    const name = document.createElement('span');
                    name.className = 'alternative-option-name';
                    name.textContent = String(tool.name || tool.slug || `Tool ${id}`);
                    label.append(box, makeEditAlternativeToolLogo(tool, name.textContent), name);
                    rows.appendChild(label);
                });
                panel.appendChild(rows);
                trigger.disabled = false;
                updateEditAlternativeSummary();
                if (!matching.length) status.textContent += ' No new foreign tools are available in this category.';
            }
        } catch (error) {
            if (requestId !== editAlternativeState.requestId) return;
            if (editAlternativeState.sourceKnown && editAlternativeState.selected.size) {
                updateEditAlternativeSummary();
                status.textContent = `${error.message} Saved tool IDs: ${[...editAlternativeState.selected].map(id => `#${id}`).join(', ')}. Retry to edit safely.`;
            } else {
                summary.textContent = 'Alternatives unavailable';
                status.textContent = error.message;
            }
            retry.classList.remove('hidden');
        }
    }

    function makeEditAlternativeToolLogo(tool, displayName) {
        const fallback = document.createElement('span');
        fallback.className = 'alternative-option-logo-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = displayName.trim().charAt(0).toUpperCase() || '?';
        const logoUrl = typeof tool.logo_url === 'string' ? tool.logo_url.trim() : '';
        if (!/^(https?:\/\/|\/(?!\/))\S+/i.test(logoUrl)) return fallback;
        const logo = document.createElement('img');
        logo.className = 'alternative-option-logo';
        logo.src = logoUrl;
        logo.alt = '';
        logo.loading = 'lazy';
        logo.addEventListener('error', () => logo.replaceWith(fallback), { once: true });
        return logo;
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
        prepareEditAlternatives(item, kind);
    }

    function closeEditModal() {
        ++editAlternativeState.requestId; // Ignore any GET from a closed modal.
        editAlternativeState.ready = false;
        editAlternativeState.selected.clear();
        setEditAlternativeOpen(false);
        setEditAlternativeHelpOpen(false);
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

        // Pricing details and alternatives are required for every pricing model.
        clearEditFieldError('edit_pricing_details');
        if (form.pricing_details.value.trim() === '') {
            setEditFieldError('edit_pricing_details', 'Pricing details are required.');
            form.pricing_details.focus();
            return;
        }
        if (!editAlternativeState.ready || !editAlternativeState.sourceKnown ||
            editAlternativeState.category !== form.category.value) {
            setEditAlternativeError('Wait for matching alternatives to load before saving.');
            return;
        }
        if (!editAlternativeState.selected.size) {
            setEditAlternativeError('Alternative is compulsory, pick one.');
            document.getElementById('edit-alternative-trigger').focus();
            return;
        }
        clearEditAlternativeError();

        // Only send fields that actually changed from what was loaded.
        const current = {};
        EDIT_FIELDS.forEach(f => { current[f] = (form[f] ? form[f].value : '').trim(); });
        current.keywords = editTags.join(',');

        const payload = {};
        Object.keys(current).forEach(key => {
            if (current[key] !== (editingOriginal[key] || '')) payload[key] = current[key];
        });

        const selectedIds = Array.from(editAlternativeState.selected);
        const alternativesChanged = selectedIds.length !== editAlternativeState.original.size ||
            selectedIds.some(id => !editAlternativeState.original.has(id));
        if (Object.keys(payload).length === 0 && !alternativesChanged) {
            closeEditModal();
            return;
        }
        // Both existing edit endpoints accept this same array as the original submit form.
        payload.foreign_tool_ids = selectedIds;

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
        const startedAt = Date.now();

        try {
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            // Keep the "Saving..." state on screen for a perceptible minimum
            // even when the API answers instantly; a slow API simply runs past
            // the minimum and the state lasts until it resolves.
            await holdSavingState(startedAt);

            if (res.status === 401) {
                handleExpiredToken();
                return;
            }
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Could not save changes.');
            }

            const data = await res.json().catch(() => ({}));
            // closeEditModal() nulls editingKind, so capture it first —
            // otherwise the product-specific confirmation never fires.
            const kind = editingKind;
            closeEditModal();

            // Product edits don't apply immediately — the product gets
            // unpublished and a new pending review is created instead.
            if (kind === 'product') {
                showToast('success', '✅ Edit submitted — awaiting admin approval. Your product is temporarily hidden until it\'s reviewed.');
            } else {
                showToast('success', data.message || 'Edit submitted for review.');
            }

            fetchApprovedProducts(token);
            fetchPendingSubmissions(token);

        } catch (err) {
            // Network-level failures never reached the hold above.
            await holdSavingState(startedAt);
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
            showToast('error', err.message || 'Something went wrong — please try again.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }

    /* Minimum visible duration for the button's "Saving..." state (ms). */
    const MIN_SAVING_MS = 900;

    function holdSavingState(startedAt) {
        const remaining = MIN_SAVING_MS - (Date.now() - startedAt);
        return remaining > 0 ? new Promise(resolve => setTimeout(resolve, remaining)) : Promise.resolve();
    }

    /* ==========================================================================
       Toast notifications — non-blocking slide-in card(s) in a fixed stack.
       Reuses the dashboard's own tokens (bg-card / border / card-shadow /
       green + red accents) so light & dark mode both follow automatically.
       Auto-dismisses after ~4.5s with a slide-out.
       ========================================================================== */
    const TOAST_VISIBLE_MS = 4500;

    function showToast(type, message) {
        let stack = document.getElementById('dev-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'dev-toast-stack';
            stack.className = 'dev-toast-stack';
            document.body.appendChild(stack);
        }

        const toast = document.createElement('div');
        toast.className = `dev-toast dev-toast--${type}`;
        toast.setAttribute('role', 'status');
        toast.textContent = message;
        stack.appendChild(toast);

        // next frame -> transition the slide-in
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, TOAST_VISIBLE_MS);
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
       Delete account — DELETE /developers/me (Bearer auth)
       Backend response: { message: "Account deleted. Your products remain live
       and are now unclaimed." }. The backend commits everything in one
       transaction, so on any error nothing was deleted and the user can retry.
       Success -> clear this browser's session + dashboard data -> toast -> home.
       ========================================================================== */
    const DELETE_PHRASE = 'DELETE';
    const ACCOUNT_LOCAL_KEYS = [
        TOKEN_KEY, ACCOUNT_TYPE_KEY,
        'enovox_dev_notifications', 'enovox_dev_submission_statuses', DISMISSED_SPOTLIGHT_KEY
    ];

    function setupDeleteAccount(token) {
        const modal = document.getElementById('delete-account-modal');
        const openBtn = document.getElementById('db-delete-open');
        const closeBtn = document.getElementById('delete-modal-close');
        const cancelBtn = document.getElementById('delete-modal-cancel');
        const confirmBtn = document.getElementById('delete-modal-confirm');
        const input = document.getElementById('delete-confirm-input');
        const alertEl = document.getElementById('delete-account-alert');
        const emailEl = document.getElementById('delete-modal-email');
        if (!modal || !openBtn || !confirmBtn || !input) return;

        let busy = false;
        let lastFocus = null;

        function showError(message) {
            alertEl.textContent = message;
            alertEl.classList.remove('hidden');
        }
        function clearError() {
            alertEl.textContent = '';
            alertEl.classList.add('hidden');
        }
        function matches() { return input.value.trim() === DELETE_PHRASE; }
        function syncConfirm() { confirmBtn.disabled = busy || !matches(); }

        function openModal() {
            const email = (document.getElementById('profile-email') || {}).textContent || '';
            emailEl.textContent = email && email !== 'Loading...' && email !== 'Unable to load profile' ? email : 'your account';
            input.value = '';
            clearError();
            busy = false;
            input.disabled = false;
            cancelBtn.disabled = false;
            closeBtn.disabled = false;
            confirmBtn.textContent = 'Delete my account';
            syncConfirm();
            lastFocus = document.activeElement;
            modal.classList.remove('hidden');
            document.body.classList.add('db-modal-open');
            input.focus();
        }
        function closeModal() {
            if (busy) return;
            modal.classList.add('hidden');
            document.body.classList.remove('db-modal-open');
            if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        }

        openBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });
        input.addEventListener('input', () => { clearError(); syncConfirm(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (!confirmBtn.disabled) confirmBtn.click(); }
        });

        confirmBtn.addEventListener('click', async () => {
            if (busy || !matches()) return;
            busy = true;
            clearError();
            input.disabled = true;
            cancelBtn.disabled = true;
            closeBtn.disabled = true;
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deleting...';
            try {
                const res = await fetch(`${API_URL}/developers/me`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
                });
                if (res.status === 401) {
                    // Session already invalid: nothing to delete with this token.
                    busy = false;
                    handleExpiredToken();
                    return;
                }
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const detail = res.status < 500 && typeof err.detail === 'string' ? err.detail : '';
                    throw new Error(detail || (res.status === 404
                        ? 'We could not find this account. It may already be deleted.'
                        : 'We could not delete your account. Nothing was changed, so please try again.'));
                }
                const data = await res.json().catch(() => ({}));
                ACCOUNT_LOCAL_KEYS.forEach((key) => { try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ } });
                confirmBtn.textContent = 'Account deleted';
                showToast('success', data.message || 'Account deleted. Your products remain live and are now unclaimed.');
                window.setTimeout(() => { window.location.href = '/'; }, 1600);
            } catch (error) {
                console.error('[dashboard] delete account failed:', error);
                busy = false;
                input.disabled = false;
                cancelBtn.disabled = false;
                closeBtn.disabled = false;
                confirmBtn.textContent = 'Try again';
                syncConfirm();
                showError(error && error.message && error.message !== 'Failed to fetch'
                    ? error.message
                    : 'Network problem. Check your connection and try again.');
            }
        });
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