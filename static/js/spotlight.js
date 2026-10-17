/**
 * js/spotlight.js
 * Public /spotlight page: renders GET /spotlight/public
 *   { "featured": {...} | null, "more": [...] }
 * Each item: slug, headline, summary, founder_name, startup_name, state,
 * photo_url, open_to_work, published_at.
 *
 * Matches the uploaded design: a large "LATEST SPOTLIGHT" featured card,
 * a "More founders to watch" grid (horizontal swipe carousel on mobile),
 * an always-visible "Apply for spotlight" banner, plus loading / empty /
 * error states. No fields beyond the contract are displayed.
 *
 * State rule: 5xx / network throw -> error state + Retry; HTTP 404 or
 * any 2xx with no usable spotlights (null, [], empty body, missing
 * featured+more) -> the mockup empty state, never the error screen.
 */
(() => {
    const featuredEl = document.getElementById('spotlight-featured');
    const moreWrap = document.getElementById('spotlight-more-wrap');
    const moreHeading = document.getElementById('spotlight-more-heading');
    const moreGrid = document.getElementById('spotlight-more');
    const statusEl = document.getElementById('spotlight-status');
    const applyBtn = document.getElementById('spotlight-apply-btn');
    if (!featuredEl || !moreWrap || !moreHeading || !moreGrid || !statusEl || !applyBtn) return;

    const SPOTLIGHT_URL = '/spotlight/public';
    const APPLY_URL = '/spotlight/apply';
    const TOKEN_KEY = 'enovox_dev_token';

    function escapeHTML(str) {
        return String(str == null ? '' : str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    function setBusy(isBusy) {
        featuredEl.setAttribute('aria-busy', String(isBusy));
        moreGrid.setAttribute('aria-busy', String(isBusy));
    }

    function setMoreVisible(isVisible) {
        moreWrap.hidden = !isVisible;
    }

    /* ------------------------------------------------------------------
     * Field formatting (only the fields in the API contract)
     * ------------------------------------------------------------------ */

    function formatPublished(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return raw;
        try {
            return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (error) {
            return raw;
        }
    }

    function founderLine(item) {
        const parts = [String(item.founder_name || '').trim(), String(item.state || '').trim()]
            .filter(Boolean);
        return parts.join(' · '); // contract has "state" only — no "city"
    }

    function itemUrl(item) {
        return `/spotlight/${encodeURIComponent(String(item.slug || '').trim())}`;
    }

    /* ------------------------------------------------------------------
     * Photo with hatched-placeholder fallback (matches the mockup)
     * ------------------------------------------------------------------ */

    function buildPhoto(item, extraClass, label) {
        const photo = document.createElement('a');
        photo.className = extraClass ? `spotlight-photo ${extraClass}` : 'spotlight-photo';
        photo.href = itemUrl(item);
        photo.setAttribute('aria-label', label);

        const url = String(item.photo_url || '').trim();
        const fallback = () => {
            photo.classList.add('is-placeholder');
            const icon = document.createElement('i');
            icon.className = 'fa-regular fa-user';
            icon.setAttribute('aria-hidden', 'true');
            photo.replaceChildren(icon);
        };
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = `${item.startup_name || 'Startup'} founder photo`;
            img.loading = 'lazy';
            img.addEventListener('error', fallback, { once: true });
            photo.appendChild(img);
        } else {
            fallback();
        }

        // "when open_to_work is true" — badge sits on the photo, reading
        // "Open to work" exactly.
        if (item.open_to_work === true) {
            const badge = document.createElement('span');
            badge.className = 'spotlight-open-badge';
            badge.innerHTML = '<span class="spotlight-open-dot" aria-hidden="true"></span>Open to work';
            photo.appendChild(badge);
        }
        return photo;
    }

    /* ------------------------------------------------------------------
     * Cards
     * ------------------------------------------------------------------ */

    function buildReadLink(item, extraClass) {
        const link = document.createElement('a');
        link.className = extraClass;
        link.href = itemUrl(item);
        link.textContent = 'Read spotlight →';
        link.setAttribute('aria-label', `Read the ${item.startup_name || 'startup'} spotlight`);
        return link;
    }

    function buildFeatured(item) {
        const card = document.createElement('article');
        card.className = 'spotlight-featured-card';

        card.appendChild(buildPhoto(item, 'spotlight-featured-photo', `Read the ${item.startup_name || 'startup'} spotlight`));

        const body = document.createElement('div');
        body.className = 'spotlight-featured-body';

        const meta = document.createElement('div');
        meta.className = 'spotlight-featured-meta';
        const badge = document.createElement('span');
        badge.className = 'spotlight-latest-badge';
        badge.textContent = 'Latest Spotlight'; // "LATEST SPOTLIGHT" styling via CSS
        meta.appendChild(badge);
        const published = formatPublished(item.published_at);
        if (published) {
            const pub = document.createElement('span');
            pub.className = 'spotlight-published';
            pub.textContent = `Published ${published}`;
            meta.appendChild(pub);
        }

        const name = document.createElement('h2');
        name.className = 'spotlight-featured-name';
        const nameLink = document.createElement('a');
        nameLink.href = itemUrl(item);
        nameLink.textContent = String(item.startup_name || 'Untitled startup');
        name.appendChild(nameLink);

        const byline = document.createElement('p');
        byline.className = 'spotlight-founder-line';
        byline.textContent = founderLine(item);

        const summary = document.createElement('p');
        summary.className = 'spotlight-summary';
        summary.textContent = String(item.summary || '');

        body.append(meta, name);
        if (byline.textContent) body.appendChild(byline);
        if (summary.textContent) body.appendChild(summary);
        body.appendChild(buildReadLink(item, 'spotlight-btn'));

        card.appendChild(body);
        return card;
    }

    function buildGridCard(item) {
        const card = document.createElement('article');
        card.className = 'spotlight-card';

        card.appendChild(buildPhoto(item, 'spotlight-card-photo', `Read the ${item.startup_name || 'startup'} spotlight`));

        const body = document.createElement('div');
        body.className = 'spotlight-card-body';

        const name = document.createElement('h3');
        name.className = 'spotlight-card-name';
        const nameLink = document.createElement('a');
        nameLink.href = itemUrl(item);
        nameLink.textContent = String(item.startup_name || 'Untitled startup');
        name.appendChild(nameLink);

        const byline = document.createElement('p');
        byline.className = 'spotlight-founder-line';
        byline.textContent = founderLine(item);

        body.appendChild(name);
        if (byline.textContent) body.appendChild(byline);
        body.appendChild(buildReadLink(item, 'spotlight-read-link'));

        card.appendChild(body);
        return card;
    }

    /* ------------------------------------------------------------------
     * Skeletons (loading state mirrors the uploaded wireframe)
     * ------------------------------------------------------------------ */

    function skel(className) {
        const el = document.createElement('span');
        el.className = `spotlight-skel ${className}`;
        el.setAttribute('aria-hidden', 'true');
        return el;
    }

    function buildFeaturedSkeleton() {
        const card = document.createElement('div');
        card.className = 'spotlight-featured-card spotlight-skeleton-card';
        card.setAttribute('aria-hidden', 'true');
        const photo = document.createElement('span');
        photo.className = 'spotlight-skel spotlight-skeleton-photo';
        const body = document.createElement('div');
        body.className = 'spotlight-skeleton-body';
        body.append(
            skel('spotlight-skel-line w-30'),
            skel('spotlight-skel-line w-70 t-lg'),
            skel('spotlight-skel-line w-40'),
            skel('spotlight-skel-line w-90'),
            skel('spotlight-skel-line w-85'),
            skel('spotlight-skel-btn')
        );
        card.append(photo, body);
        return card;
    }

    function buildTileSkeleton() {
        const card = document.createElement('div');
        card.className = 'spotlight-card spotlight-skeleton-card';
        card.setAttribute('aria-hidden', 'true');
        const photo = document.createElement('span');
        photo.className = 'spotlight-skel spotlight-skeleton-tile-photo';
        const body = document.createElement('div');
        body.className = 'spotlight-skeleton-tile-body';
        body.append(
            skel('spotlight-skel-line w-55'),
            skel('spotlight-skel-line w-40'),
            skel('spotlight-skel-line w-35')
        );
        card.append(photo, body);
        return card;
    }

    function showLoading() {
        setBusy(true);
        statusEl.hidden = true;
        featuredEl.replaceChildren(buildFeaturedSkeleton());
        const headingSkeleton = document.createElement('span');
        headingSkeleton.className = 'spotlight-skel spotlight-more-heading-skel';
        headingSkeleton.setAttribute('aria-hidden', 'true');
        moreHeading.replaceChildren(headingSkeleton);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i += 1) fragment.appendChild(buildTileSkeleton());
        moreGrid.replaceChildren(fragment);
        setMoreVisible(true);
    }

    /* ------------------------------------------------------------------
     * Empty + error states (Apply banner below them always stays visible)
     * ------------------------------------------------------------------ */

    function buildStateBox({ variant, icon, title, text, retry }) {
        const box = document.createElement('div');
        box.className = `spotlight-state spotlight-state-${variant}`;
        box.setAttribute('role', variant === 'error' ? 'alert' : 'status');

        const iconWrap = document.createElement('span');
        iconWrap.className = 'spotlight-state-icon';
        iconWrap.setAttribute('aria-hidden', 'true');
        iconWrap.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;

        const heading = document.createElement('h2');
        heading.className = 'spotlight-state-title';
        heading.textContent = title;

        const copy = document.createElement('p');
        copy.className = 'spotlight-state-text';
        copy.textContent = text;

        box.append(iconWrap, heading, copy);

        if (retry) {
            const actions = document.createElement('div');
            actions.className = 'spotlight-state-actions';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'spotlight-btn';
            button.textContent = 'Retry';
            button.addEventListener('click', loadSpotlights);
            actions.appendChild(button);
            box.appendChild(actions);
        }
        return box;
    }

    /* ------------------------------------------------------------------
     * Apply gating: developers go straight to /spotlight/apply; logged-out
     * visitors are sent to login and returned to /spotlight/apply — same
     * convention product.js uses for claiming.
     * ------------------------------------------------------------------ */

    function isLoggedIn() {
        try {
            return !!window.localStorage.getItem(TOKEN_KEY);
        } catch (error) {
            return false;
        }
    }

    function initApply() {
        applyBtn.addEventListener('click', () => {
            if (isLoggedIn()) {
                window.location.href = APPLY_URL;
                return;
            }
            window.location.href = `/login?type=developer&redirect=${encodeURIComponent(APPLY_URL)}`;
        });
    }

    /* ------------------------------------------------------------------
     * Load + render
     * ------------------------------------------------------------------ */

    function normalizeItem(item) {
        return item && typeof item === 'object' ? item : null;
    }

    function render(data) {
        const featured = normalizeItem(data ? data.featured : null);
        const more = (data && Array.isArray(data.more) ? data.more : []).map(normalizeItem).filter(Boolean)
            .filter(item => String(item.slug || '').trim());

        // Empty state: no featured and no more — banner still shows below.
        if (!featured && more.length === 0) {
            featuredEl.replaceChildren();
            setMoreVisible(false);
            statusEl.replaceChildren(buildStateBox({
                variant: 'empty',
                icon: 'fa-regular fa-star',
                title: 'Our first founder stories are on the way',
                text: "Check back soon, or be the first to share what you're building."
            }));
            statusEl.hidden = false;
            return;
        }

        statusEl.hidden = true;
        statusEl.replaceChildren();
        if (featured) {
            featuredEl.replaceChildren(buildFeatured(featured));
        } else {
            featuredEl.replaceChildren();
        }

        setMoreVisible(more.length > 0);
        moreHeading.textContent = 'More founders to watch';
        moreGrid.replaceChildren(...more.map(buildGridCard));
    }

    async function loadSpotlights() {
        showLoading();
        try {
            // cache:'no-store' — never serve a stale empty/failed response;
            // new spotlights must appear on the very next page load.
            const response = await fetch(SPOTLIGHT_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
            // 404 here means "nothing published yet" (or the endpoint is
            // not live on the server) - that is the EMPTY state, not an
            // error. Real failures (5xx, network) still get the error
            // state with Retry below.
            if (response.status === 404) {
                console.warn('[spotlight] /spotlight/public returned 404 - showing the empty state.');
                render({ featured: null, more: [] });
                return;
            }
            if (!response.ok) throw new Error(`GET ${SPOTLIGHT_URL} failed (HTTP ${response.status})`);
            // An empty body is also "worked, nothing to show" -> empty state.
            const data = await response.json().catch(() => null);
            // Key requirement: "request worked, but there is nothing to show
            // yet" must NOT render the error screen. Any successful response
            // that is not the expected object (null, [], missing keys) is
            // treated as "no spotlights yet" -> the mockup empty state.
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                console.warn('[spotlight] Unexpected /spotlight/public payload; showing the empty state.', data);
                render({ featured: null, more: [] });
                return;
            }
            render(data);
        } catch (error) {
            console.error('[spotlight] Unable to load spotlight stories:', error);
            featuredEl.replaceChildren();
            setMoreVisible(false);
            statusEl.replaceChildren(buildStateBox({
                variant: 'error',
                icon: 'fa-solid fa-triangle-exclamation',
                title: "We couldn't load the founder stories",
                text: 'Check your connection and try again.',
                retry: true
            }));
            statusEl.hidden = false;
        } finally {
            setBusy(false);
        }
    }

    initApply();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSpotlights, { once: true });
    } else {
        loadSpotlights();
    }
})();
