/**
 * js/collection.js
 * Public /collection page: renders the curated sections returned by
 * GET /collections/public in the order they arrive.
 *
 * - Each section shows compact product cards (logo, short name, one-line
 *   description). Text is cut in JS and again with CSS ellipsis.
 * - 3 cards per row on desktop, 2 per row on mobile.
 * - Bookmark buttons come from EnovoxBookmarks.cardButtonHtml and behave
 *   exactly like the homepage/Explore cards.
 * - Data fetching, slugs/ids, chips, hash scrolling and copy-link logic are
 *   unchanged from the previous version.
 */
(() => {
    const sectionsEl = document.getElementById('collection-sections');
    const statusEl = document.getElementById('collection-status');
    const jumpNav = document.getElementById('collection-jump');
    const jumpTrack = document.getElementById('collection-jump-track');
    if (!sectionsEl || !statusEl || !jumpNav || !jumpTrack) return;

    const COLLECTIONS_URL = '/collections/public';
    const COPY_RESET_MS = 1800;
    const NAME_MAX = 26;
    const DESC_MAX = 58;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

    // Hard cut: if the text is too long, trim it and add an ellipsis.
    function truncate(str, max) {
        const text = String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
        return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
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
     * Compact product card
     * ------------------------------------------------------------------ */

    function buildCard(product) {
        const fullName = String(product.name || 'Untitled product');
        const fullDesc = String(product.description || '');
        const bookmarkHtml = (window.EnovoxBookmarks && product.id != null)
            ? window.EnovoxBookmarks.cardButtonHtml(product.id)
            : '';

        const card = document.createElement('a');
        card.href = `/product/${encodeURIComponent(product.slug)}`;
        card.className = 'collection-card';
        card.title = fullName;

        const logoWrap = document.createElement('span');
        logoWrap.className = 'collection-card-logo';
        const fallback = () => {
            logoWrap.replaceChildren(document.createTextNode(getInitials(fullName)));
            logoWrap.classList.add('is-fallback');
        };
        if (product.logo_url) {
            const img = document.createElement('img');
            img.src = product.logo_url;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', fallback, { once: true });
            logoWrap.appendChild(img);
        } else {
            fallback();
        }

        const info = document.createElement('span');
        info.className = 'collection-card-info';
        info.innerHTML = `
            <span class="collection-card-name">${escapeHTML(truncate(fullName, NAME_MAX))}</span>
            <span class="collection-card-desc">${escapeHTML(truncate(fullDesc, DESC_MAX))}</span>
        `;

        card.append(logoWrap, info);

        if (bookmarkHtml) {
            const bookmark = document.createElement('span');
            bookmark.className = 'collection-card-bookmark';
            bookmark.innerHTML = bookmarkHtml;
            card.appendChild(bookmark);
        }
        return card;
    }

    /* ------------------------------------------------------------------
     * Copy-permalink control
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
        const baseLabel = button.dataset.baseLabel || 'Copy link';
        const baseAria = button.dataset.baseAria || `Copy link to ${title}`;
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

    function buildCopyButton(title, slug) {
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
            // Native share sheet where available (most phones); otherwise copy the link.
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
     * Quick-jump chips
     * ------------------------------------------------------------------ */

    function centerChip(chip) {
        if (!chip || !jumpTrack) return;
        const targetLeft = Math.max(chip.offsetLeft - ((jumpTrack.clientWidth - chip.clientWidth) / 2), 0);
        if (typeof jumpTrack.scrollTo === 'function') {
            try {
                jumpTrack.scrollTo({ left: targetLeft, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
                return;
            } catch (error) {
                /* Older engines reject smooth-scroll options; use scrollLeft. */
            }
        }
        jumpTrack.scrollLeft = targetLeft;
    }

    function setActiveChip(slug, scrollChipIntoView = false) {
        let activeChip = null;
        jumpTrack.querySelectorAll('.collection-jump-chip').forEach(chip => {
            const isActive = chip.dataset.target === slug;
            chip.classList.toggle('active', isActive);
            if (isActive) {
                chip.setAttribute('aria-current', 'true');
                activeChip = chip;
            } else {
                chip.removeAttribute('aria-current');
            }
        });
        if (scrollChipIntoView && activeChip) centerChip(activeChip);
    }

    function scrollToSectionSlug(slug, smooth = true) {
        const target = slug ? document.getElementById(slug) : null;
        if (!target || !target.classList.contains('collection-section')) return false;
        if (typeof target.scrollIntoView === 'function') {
            try {
                target.scrollIntoView({ behavior: smooth && !prefersReducedMotion.matches ? 'smooth' : 'auto', block: 'start' });
            } catch (error) {
                try { target.scrollIntoView(); } catch (ignored) { /* no scroll support */ }
            }
        }
        setActiveChip(slug, true);
        return true;
    }

    function onChipClick(event) {
        event.preventDefault();
        const slug = event.currentTarget.dataset.target;
        if (!scrollToSectionSlug(slug, true)) return;
        try {
            if (window.history && typeof window.history.replaceState === 'function') {
                window.history.replaceState(null, '', `#${slug}`);
            }
        } catch (error) {
            /* History APIs can throw in sandboxed contexts; the scroll still worked. */
        }
    }

    function buildChip(section) {
        const slug = String(section.slug || '').trim();
        const title = String(section.title || 'Untitled collection').trim() || 'Untitled collection';
        const emoji = String(section.emoji || '').trim();

        const chip = document.createElement('a');
        chip.className = 'collection-jump-chip';
        chip.href = `#${slug}`;
        chip.dataset.target = slug;
        chip.title = `Jump to ${title}`;
        if (emoji) {
            const emojiEl = document.createElement('span');
            emojiEl.className = 'collection-jump-chip-emoji';
            emojiEl.setAttribute('aria-hidden', 'true');
            emojiEl.textContent = emoji;
            chip.appendChild(emojiEl);
        }
        const label = document.createElement('span');
        label.className = 'collection-jump-chip-label';
        label.textContent = title;
        chip.appendChild(label);
        chip.addEventListener('click', onChipClick);
        return chip;
    }

    /* ------------------------------------------------------------------
     * Sections
     * ------------------------------------------------------------------ */

    function buildSection(section, index) {
        const slug = String(section.slug || '').trim();
        const title = String(section.title || 'Untitled collection').trim() || 'Untitled collection';
        const emoji = String(section.emoji || '').trim();
        const description = String(section.description || '').trim();
        const sectionType = String(section.section_type || '').trim();

        const sectionEl = document.createElement('section');
        sectionEl.className = 'collection-section';
        if (slug) sectionEl.id = slug;
        sectionEl.setAttribute('aria-labelledby', `collection-heading-${index}`);

        const header = document.createElement('header');
        header.className = 'collection-section-header';

        // Left: emoji badge + title + description
        const main = document.createElement('div');
        main.className = 'collection-section-main';

        if (emoji) {
            const badge = document.createElement('span');
            badge.className = 'collection-section-emoji';
            badge.setAttribute('aria-hidden', 'true');
            badge.textContent = emoji;
            main.appendChild(badge);
        }

        const textWrap = document.createElement('div');
        textWrap.className = 'collection-section-text';

        const heading = document.createElement('h2');
        heading.className = 'collection-section-title';
        heading.id = `collection-heading-${index}`;
        const name = document.createElement('span');
        name.className = 'collection-section-name';
        name.textContent = title;
        heading.appendChild(name);
        textWrap.appendChild(heading);

        if (description) {
            const desc = document.createElement('p');
            desc.className = 'collection-section-desc';
            desc.textContent = description;
            textWrap.appendChild(desc);
        }
        main.appendChild(textWrap);
        header.appendChild(main);

        // Right: copy link + View all (View all only when backend says more exist;
        // auto sections never link out)
        const actions = document.createElement('div');
        actions.className = 'collection-section-actions';
        if (slug) actions.appendChild(buildCopyButton(title, slug));
        if (slug && section.has_more === true && sectionType !== 'auto') {
            const viewAll = document.createElement('a');
            viewAll.className = 'collection-view-all';
            viewAll.href = `/collection/${encodeURIComponent(slug)}`;
            viewAll.setAttribute('aria-label', `View all ${title} products`);
            viewAll.textContent = 'View all →';
            actions.appendChild(viewAll);
        }
        header.appendChild(actions);
        sectionEl.appendChild(header);

        const products = (Array.isArray(section.products) ? section.products : [])
            .filter(product => product && product.slug && product.name);

        if (products.length) {
            const grid = document.createElement('div');
            grid.className = 'collection-products-grid';
            grid.setAttribute('role', 'group');
            grid.setAttribute('aria-label', `${title} products`);
            products.forEach(product => grid.appendChild(buildCard(product)));
            sectionEl.appendChild(grid);
        } else {
            const note = document.createElement('div');
            note.className = 'collection-section-empty-note';
            note.textContent = 'Products are being added to this collection.';
            sectionEl.appendChild(note);
        }

        return sectionEl;
    }

    /* ------------------------------------------------------------------
     * Skeleton / empty states
     * ------------------------------------------------------------------ */

    function buildSkeletonCard() {
        const skeleton = document.createElement('div');
        skeleton.className = 'collection-card-skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        skeleton.innerHTML = '<span class="collection-skeleton-logo"></span><span class="collection-skeleton-lines"><span></span><span></span></span>';
        return skeleton;
    }

    function showSkeletons() {
        setBusy(true);
        jumpNav.hidden = true;
        hideStatus();
        const fragment = document.createDocumentFragment();
        for (let s = 0; s < 2; s += 1) {
            const block = document.createElement('div');
            block.className = 'collection-section collection-section-skeleton';
            block.setAttribute('aria-hidden', 'true');
            const heading = document.createElement('div');
            heading.className = 'collection-skeleton-heading';
            const grid = document.createElement('div');
            grid.className = 'collection-products-grid';
            for (let c = 0; c < 6; c += 1) grid.appendChild(buildSkeletonCard());
            block.append(heading, grid);
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
     * Active chip tracking + hash navigation
     * ------------------------------------------------------------------ */

    function observeSections() {
        if (sectionObserver) {
            sectionObserver.disconnect();
            sectionObserver = null;
        }
        if (typeof IntersectionObserver !== 'function') return;
        const sections = Array.from(sectionsEl.querySelectorAll('.collection-section[id]'));
        if (!sections.length) return;
        sectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) setActiveChip(entry.target.id, false);
            });
        }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
        sections.forEach(sectionEl => sectionObserver.observe(sectionEl));
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
                if (target && target.classList.contains('collection-section')) {
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
     * Load + render
     * ------------------------------------------------------------------ */

    function renderCollections(sections) {
        const fragment = document.createDocumentFragment();
        // The quick-jump chip bar is intentionally not rendered anymore.
        sections.forEach((section, index) => {
            fragment.appendChild(buildSection(section, index));
        });
        jumpTrack.replaceChildren();
        sectionsEl.replaceChildren(fragment);
        jumpNav.hidden = true;
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