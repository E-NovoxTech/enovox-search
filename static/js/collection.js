/**
 * js/collection.js
 * Public /collection page — rebuilt to the 2026-10 Collections design.
 *
 * Data (unchanged contract): GET /collections/public -> array of sections
 *   { id, title, slug, emoji, description, section_type, total, has_more,
 *     products: [{ id, slug, name, description, logo_url, ... }] }
 *
 * Behavior carried over unchanged from the previous version:
 *   - Share on each collection (navigator.share where available, clipboard
 *     fallback with Copied/Failed feedback).
 *   - Bookmark buttons via window.EnovoxBookmarks.cardButtonHtml(product.id),
 *     exactly like the homepage/Explore cards (existing save behaviour and
 *     its logged-out handling are untouched).
 *   - Data fetching, hash scrolling, error + retry and empty states.
 *
 * New in this rebuild:
 *   - Card = tinted header band (icon, title, description, REAL total count)
 *     + product area, one card per collection.
 *   - Theme from the title keywords (money/fintech -> blue wallet,
 *     education -> green cap) else cycles blue, green, amber with a star.
 *   - At most 6 product tiles per collection, in the given order. Empty
 *     collections are hidden; if none are renderable, the empty state shows.
 *   - "See all" only when the collection's real total > 6 (and the section
 *     isn't an auto section — same no-link rule as before, since auto slugs
 *     have no detail page): header-band button labelled "See all →" on
 *     desktop/tablet, full-width "See all <n> products →" under the carousel
 *     on mobile (both rendered, CSS decides which shows).
 *   - Mobile product area is a CSS scroll-snap carousel of equal-sized
 *     tiles; desktop is a 3-column grid, tablet 2.
 */
(() => {
    const sectionsEl = document.getElementById('collection-sections');
    const statusEl = document.getElementById('collection-status');
    const jumpNav = document.getElementById('collection-jump');
    const jumpTrack = document.getElementById('collection-jump-track');
    if (!sectionsEl || !statusEl || !jumpNav || !jumpTrack) return;

    const COLLECTIONS_URL = '/collections/public';
    const COPY_RESET_MS = 1800;
    const MAX_SHOWN = 6;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Accent theme + icon rules. Keywords are matched against the lowercase
    // collection title; unmatched titles cycle blue -> green -> amber and
    // keep the generic star icon (exactly the rule in the design brief).
    const THEME_NAMES = ['blue', 'green', 'amber'];
    const THEME_ICONS = { blue: 'fa-wallet', green: 'fa-graduation-cap', amber: 'fa-star' };
    const KEYWORD_THEMES = [
        { words: ['fintech', 'payment', 'bank', 'money'], theme: 'blue', icon: 'fa-wallet' },
        { words: ['education', 'learn', 'school'], theme: 'green', icon: 'fa-graduation-cap' },
    ];

    function themeFor(title, index) {
        const lower = String(title || '').toLowerCase();
        for (const rule of KEYWORD_THEMES) {
            if (rule.words.some(word => lower.includes(word))) {
                return { theme: rule.theme, icon: rule.icon };
            }
        }
        const theme = THEME_NAMES[index % THEME_NAMES.length];
        return { theme, icon: theme === 'blue' || theme === 'green' ? 'fa-star' : THEME_ICONS[theme] };
    }

    const copyTimers = new WeakMap();
    let sectionObserver = null;

    /* ------------------------------------------------------------------
     * Small shared helpers
     * ------------------------------------------------------------------ */

    function escapeHTML(str) {
        return String(str == null ? '' : str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    function getInitials(name) {
        if (!name) return 'E';
        return name.charAt(0).toUpperCase();
    }

    function plainText(str) {
        return String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
    }

    function setBusy(isBusy) {
        sectionsEl.setAttribute('aria-busy', String(isBusy));
    }

    function hideStatus() {
        statusEl.hidden = true;
        statusEl.classList.remove('is-error');
        statusEl.replaceChildren();
    }

    function showStatus(message, { isError = false, retry = false } = {}) {
        statusEl.classList.toggle('is-error', isError);
        const text = document.createElement('span');
        text.textContent = message;
        statusEl.replaceChildren(text);
        if (retry) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'collection-retry-btn popular-retry-btn';
            button.textContent = 'Try again';
            button.addEventListener('click', loadCollections);
            statusEl.appendChild(button);
        }
        statusEl.hidden = false;
    }

    /* ------------------------------------------------------------------
     * Product tile — link to the product page + separate bookmark button
     * ------------------------------------------------------------------ */

    function buildTile(product) {
        const fullName = plainText(product.name) || 'Untitled product';
        const fullDesc = plainText(product.description);

        const tile = document.createElement('a');
        tile.href = `/product/${encodeURIComponent(product.slug)}`;
        tile.className = 'cl-tile';
        tile.title = fullName;

        // Logo with pastel letter-tile fallback (tint derived from the name
        // so the same product always reads in the same colour).
        const tint = `cl-tint${Math.abs((fullName.charCodeAt(0) || 0)) % 6}`;
        const logoWrap = document.createElement('span');
        logoWrap.className = 'cl-tile-logo';
        const fallback = () => {
            logoWrap.className = `cl-tile-logo ${tint} is-fallback`;
            logoWrap.replaceChildren(document.createTextNode(getInitials(fullName)));
        };
        if (product.logo_url) {
            const img = document.createElement('img');
            img.src = product.logo_url;
            img.alt = '';
            img.loading = 'lazy';
            img.className = 'cl-tile-logo-img';
            img.addEventListener('error', fallback, { once: true });
            logoWrap.classList.add('has-img');
            logoWrap.appendChild(img);
        } else {
            fallback();
        }

        const info = document.createElement('span');
        info.className = 'cl-tile-info';
        info.innerHTML = `
            <span class="cl-tile-name">${escapeHTML(fullName)}</span>
            <span class="cl-tile-desc">${escapeHTML(fullDesc)}</span>
        `;

        tile.append(logoWrap, info);

        const bookmarkHtml = (window.EnovoxBookmarks && product.id != null)
            ? window.EnovoxBookmarks.cardButtonHtml(product.id)
            : '';
        if (bookmarkHtml) {
            // Separate control inside the link: EnovoxBookmarks' document-level
            // handler preventDefaults + stopPropagations, so tapping it never
            // triggers the tile's navigation.
            const wrap = document.createElement('span');
            wrap.className = 'cl-tile-bookmark';
            wrap.innerHTML = bookmarkHtml;
            const btn = wrap.querySelector('button');
            if (btn) btn.setAttribute('aria-label', 'Save product');
            tile.appendChild(wrap);
        }
        return tile;
    }

    /* ------------------------------------------------------------------
     * Share control (existing behaviour: native share sheet or copy link)
     * ------------------------------------------------------------------ */

    async function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return;
        }
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const ok = document.execCommand('copy');
        helper.remove();
        if (!ok) throw new Error('execCommand copy failed');
    }

    function resetCopyButton(button, label, ariaLabel) {
        button.classList.remove('is-copied', 'is-failed');
        const text = button.querySelector('.collection-copy-text');
        if (text) text.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
    }

    function setCopyFeedback(button, state, title) {
        const baseLabel = button.dataset.baseLabel || 'Share';
        const baseAria = button.dataset.baseAria || `Share ${title}`;
        const readyLabel = button.dataset.readyLabel || baseAria;
        if (state === 'copied') {
            button.classList.add('is-copied');
            button.classList.remove('is-failed');
            const text = button.querySelector('.collection-copy-text');
            if (text) text.textContent = 'Copied';
            button.setAttribute('aria-label', 'Link copied to clipboard');
        } else if (state === 'failed') {
            button.classList.add('is-failed');
            button.classList.remove('is-copied');
            const text = button.querySelector('.collection-copy-text');
            if (text) text.textContent = 'Copy failed';
            button.setAttribute('aria-label', 'Copying the link failed. Please try again.');
        } else {
            resetCopyButton(button, baseLabel, readyLabel);
            return;
        }
        const previous = copyTimers.get(button);
        if (previous) clearTimeout(previous);
        copyTimers.set(button, window.setTimeout(() => resetCopyButton(button, baseLabel, readyLabel), COPY_RESET_MS));
    }

    function buildShareButton(title, slug) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'collection-copy';
        button.dataset.baseLabel = 'Share';
        button.dataset.baseAria = `Share ${title}`;
        button.setAttribute('aria-label', button.dataset.baseAria);
        button.innerHTML = `
            <svg class="collection-copy-icon collection-copy-icon-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            <svg class="collection-copy-icon collection-copy-icon-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span class="collection-copy-text">Share</span>
        `;
        button.addEventListener('click', async () => {
            const url = `${window.location.origin}/collection#${slug}`;
            if (typeof navigator.share === 'function') {
                try {
                    await navigator.share({ title, url });
                    return;
                } catch (error) {
                    if (error && error.name === 'AbortError') return; // user closed the sheet
                    /* any other failure: fall through to copying */
                }
            }
            try {
                await copyText(url);
                setCopyFeedback(button, 'copied', title);
            } catch (error) {
                console.warn('[collections] Unable to copy the collection link:', error);
                setCopyFeedback(button, 'failed', title);
            }
        });
        return button;
    }

    /* ------------------------------------------------------------------
     * Hash scrolling (unchanged) — the quick-jump chip bar stays unused
     * ------------------------------------------------------------------ */

    function setActiveChip() { /* chip bar intentionally not rendered */ }

    function scrollToSectionSlug(slug, smooth = true) {
        const target = slug ? document.getElementById(slug) : null;
        if (!target || !target.classList.contains('cl-card')) return false;
        if (typeof target.scrollIntoView === 'function') {
            try {
                target.scrollIntoView({ behavior: smooth && !prefersReducedMotion.matches ? 'smooth' : 'auto', block: 'start' });
            } catch (error) {
                try { target.scrollIntoView(); } catch (ignored) { /* no scroll support */ }
            }
        }
        return true;
    }

    function currentHashSlug() {
        if (!window.location.hash) return '';
        const raw = window.location.hash.slice(1);
        try {
            return decodeURIComponent(raw);
        } catch (error) {
            return raw;
        }
    }

    function scrollToCurrentHash() {
        const slug = currentHashSlug();
        if (!slug) return;
        window.requestAnimationFrame(() => {
            window.setTimeout(() => {
                const target = document.getElementById(slug);
                if (target && target.classList.contains('cl-card')) {
                    scrollToSectionSlug(slug, true);
                }
            }, 60);
        });
    }

    window.addEventListener('hashchange', () => {
        const slug = currentHashSlug();
        if (slug) scrollToSectionSlug(slug, true);
    });
    window.addEventListener('load', () => {
        const slug = currentHashSlug();
        if (slug) scrollToSectionSlug(slug, false);
    });

    /* ------------------------------------------------------------------
     * Collection card
     * ------------------------------------------------------------------ */

    function buildCard(section, index) {
        const slug = String(section.slug || '').trim();
        const title = String(section.title || 'Untitled collection').trim() || 'Untitled collection';
        const description = String(section.description || '').trim();
        const sectionType = String(section.section_type || '').trim();

        const products = (Array.isArray(section.products) ? section.products : [])
            .filter(product => product && product.slug && product.name)
            .slice(0, MAX_SHOWN);

        // Hide whole collections that have no products (all-empty handled by
        // the caller: if no card renders, the friendly empty state shows).
        if (!products.length) return null;

        // The payload carries the REAL total — the band count and the mobile
        // "See all <n>" label both use it, never the number of tiles shown.
        const totalRaw = Number(section.total);
        const total = Number.isFinite(totalRaw) ? totalRaw : products.length;
        const countLabel = `${total} product${total === 1 ? '' : 's'}`;

        // "See all" ONLY when more than 6 exist. Auto sections never link out
        // (unchanged rule: their slugs have no detail page).
        const hasSeeAll = total > MAX_SHOWN && !!slug && sectionType !== 'auto';

        const { theme, icon } = themeFor(title, index);

        const card = document.createElement('section');
        card.className = `cl-card cl-theme-${theme}`;
        if (slug) card.id = slug;
        card.setAttribute('aria-labelledby', `cl-heading-${index}`);

        /* --- tinted header band --- */
        const band = document.createElement('div');
        band.className = 'cl-band';

        const main = document.createElement('div');
        main.className = 'cl-band-main';

        const iconEl = document.createElement('span');
        iconEl.className = 'cl-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = (section.emoji && String(section.emoji).trim()) || '✨';
        main.appendChild(iconEl);

        const textWrap = document.createElement('div');
        textWrap.className = 'cl-band-text';

        const heading = document.createElement('h2');
        heading.className = 'cl-title';
        heading.id = `cl-heading-${index}`;
        heading.textContent = title;
        textWrap.appendChild(heading);

        if (description) {
            const desc = document.createElement('p');
            desc.className = 'cl-desc';
            desc.textContent = description;
            textWrap.appendChild(desc);
        }

        const count = document.createElement('p');
        count.className = 'cl-count';
        count.textContent = countLabel;
        textWrap.appendChild(count);

        main.appendChild(textWrap);
        band.appendChild(main);

        const actions = document.createElement('div');
        actions.className = 'cl-band-actions';
        if (slug) actions.appendChild(buildShareButton(title, slug));
        if (hasSeeAll) {
            const seeAll = document.createElement('a');
            seeAll.className = 'cl-seeall';
            seeAll.href = `/collection/${encodeURIComponent(slug)}`;
            seeAll.setAttribute('aria-label', `See all ${countLabel} in ${title}`);
            seeAll.innerHTML = 'See all <span aria-hidden="true">&rarr;</span>';
            actions.appendChild(seeAll);
        }
        band.appendChild(actions);
        card.appendChild(band);

        /* --- product area (grid on desktop/tablet, snap carousel on mobile) --- */
        const area = document.createElement('div');
        area.className = 'cl-products';
        area.setAttribute('role', 'group');
        // Focusable so keyboard users can arrow-scroll the carousel on mobile.
        area.tabIndex = 0;
        area.setAttribute('aria-label', `Products in ${title}`);
        products.forEach(product => area.appendChild(buildTile(product)));
        card.appendChild(area);

        if (hasSeeAll) {
            // Full-width button under the carousel — mobile-only (CSS hides it
            // at >= 640px), labelled with the real total.
            const seeAllMobile = document.createElement('a');
            seeAllMobile.className = 'cl-seeall-mobile';
            seeAllMobile.href = `/collection/${encodeURIComponent(slug)}`;
            seeAllMobile.setAttribute('aria-label', `See all ${countLabel} in ${title}`);
            seeAllMobile.innerHTML = `See all ${total} product${total === 1 ? '' : 's'} <span aria-hidden="true">&rarr;</span>`;
            card.appendChild(seeAllMobile);
        }

        return card;
    }

    /* ------------------------------------------------------------------
     * Skeleton / empty states
     * ------------------------------------------------------------------ */

    function showSkeletons() {
        setBusy(true);
        jumpNav.hidden = true;
        hideStatus();
        const fragment = document.createDocumentFragment();
        for (let s = 0; s < 2; s += 1) {
            const block = document.createElement('div');
            block.className = 'cl-card cl-skel';
            block.setAttribute('aria-hidden', 'true');
            block.innerHTML = `
                <div class="cl-skel-band"><span class="cl-skel-icon"></span>
                    <span class="cl-skel-band-text"><span class="cl-skel-line cl-skel-lg"></span><span class="cl-skel-line"></span><span class="cl-skel-line cl-skel-short"></span></span></div>
                <div class="cl-skel-tiles"><span class="cl-skel-tile"></span><span class="cl-skel-tile"></span><span class="cl-skel-tile"></span></div>`;
            fragment.appendChild(block);
        }
        sectionsEl.replaceChildren(fragment);
    }

    function showEmptyState() {
        jumpNav.hidden = true;
        hideStatus();
        const box = document.createElement('div');
        box.className = 'collection-empty';

        const icon = document.createElement('span');
        icon.className = 'collection-empty-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<i class="fa-solid fa-layer-group" aria-hidden="true"></i>';

        const heading = document.createElement('h2');
        heading.className = 'collection-empty-title';
        heading.textContent = 'New collections are coming soon';

        const copy = document.createElement('p');
        copy.className = 'collection-empty-copy';
        copy.textContent = 'We are putting together curated lists of Nigerian products. Check back shortly, or explore the full catalog in the meantime.';

        const link = document.createElement('a');
        link.className = 'collection-empty-link';
        link.href = '/explore';
        link.textContent = 'Explore all products';

        box.append(icon, heading, copy, link);
        sectionsEl.replaceChildren(box);
    }

    /* ------------------------------------------------------------------
     * Load + render
     * ------------------------------------------------------------------ */

    function renderCollections(sections) {
        const fragment = document.createDocumentFragment();
        let rendered = 0;
        sections.forEach((section, index) => {
            const card = buildCard(section, index);
            if (card) {
                fragment.appendChild(card);
                rendered += 1;
            }
        });
        jumpTrack.replaceChildren();
        jumpNav.hidden = true;

        if (!rendered) {
            // Everything was empty — show the friendly empty state instead of
            // a blank page. setBusy was already cleared by the caller.
            showEmptyState();
            return;
        }
        sectionsEl.replaceChildren(fragment);
        scrollToCurrentHash();
    }

    async function loadCollections() {
        showSkeletons();
        try {
            const response = await fetch(COLLECTIONS_URL, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`GET ${COLLECTIONS_URL} failed (HTTP ${response.status})`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Invalid collections response');
            const sections = data.filter(item => item && typeof item === 'object');
            setBusy(false);
            if (!sections.length) {
                showEmptyState();
                return;
            }
            hideStatus();
            renderCollections(sections);
        } catch (error) {
            console.error('[collections] Unable to load collections:', error);
            setBusy(false);
            jumpNav.hidden = true;
            sectionsEl.replaceChildren();
            showStatus("We couldn't load collections right now. Please check your connection and try again.", { isError: true, retry: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCollections, { once: true });
    } else {
        loadCollections();
    }
})();
