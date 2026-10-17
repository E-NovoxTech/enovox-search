/**
 * js/spotlight-detail.js
 * /spotlight/{slug} — founder spotlight detail page (server-rendered Jinja
 * template; this file is progressive enhancement only).
 *
 * Handles: reading-time estimate (200 wpm from the story column), date
 * formatting (Published / Updated), photo onerror -> silhouette, Like/Dislike
 * reactions (public to view, logged-in to click, one reaction per account),
 * share links + copy link, "More founders to watch" (from GET
 * /spotlight/public - capped at 3 cards), and the Apply-for-spotlight
 * gating (same as the /spotlight index card).
 *
 * Reactions contract (confirmed by backend): POST /spotlight/{spotlight_id}/react
 * with the NUMERIC spotlight id from the page data (not the slug) and JSON
 * body { "value": "like" | "dislike" | null } (null removes the user's
 * reaction). Counts update optimistically, are then set from the response's
 * "likes"/"dislikes", and are reverted entirely on failure.
 *
 * Logged-out visitors: clicking Like/Dislike never touches counts or the
 * network; it shows a "Log in to react" toast instead.
 */
(() => {
    const root = document.querySelector('.slug-page');
    if (!root) return;

    const el = (id) => document.getElementById(id);
    const TOKEN_KEY = 'enovox_dev_token';
    const APPLY_URL = '/spotlight/apply';
    const READ_WPM = 200;
    const MORE_MAX = 3; // "More founders to watch" never shows more than this
    const TOAST_MS = 3500;
    const REACTIONS_STORAGE_PREFIX = 'enovox_spotlight_react:';

    function getToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
    }

    /* ------------------------------------------------------------------
     * Dates: Published {date} (+ Updated {date} when the server renders it)
     * Server prints the raw value; upgrade to "12 Oct 2026" when parseable.
     * ------------------------------------------------------------------ */
    function formatIsoChip(id, prefix) {
        const chip = el(id);
        if (!chip) return;
        const iso = chip.getAttribute('data-iso');
        const date = new Date(iso);
        if (!iso || Number.isNaN(date.getTime())) return; // leave server text as-is
        try {
            chip.textContent = `${prefix} ${date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } catch (error) { /* keep server text */ }
    }
    formatIsoChip('slug-published-at', 'Published');
    formatIsoChip('slug-updated-at', 'Updated');

    /* ------------------------------------------------------------------
     * Reading time — word count of the story fields
     * ------------------------------------------------------------------ */
    function initReadTime() {
        const story = el('slug-story');
        const chip = el('slug-readtime');
        if (!story || !chip) return;
        const words = story.textContent.trim().split(/\s+/).filter(Boolean).length;
        const minutes = Math.max(1, Math.round(words / READ_WPM));
        chip.textContent = `${minutes} min read`;
        chip.hidden = false;
    }

    /* ------------------------------------------------------------------
     * Hero photo: failed load -> hatched silhouette (no error surface)
     * ------------------------------------------------------------------ */
    function initPhoto() {
        const img = el('slug-photo-img');
        const photo = el('slug-photo');
        if (!img || !photo) return;
        img.addEventListener('error', () => {
            const placeholder = document.createElement('span');
            placeholder.className = 'slug-photo-placeholder';
            placeholder.setAttribute('aria-hidden', 'true');
            placeholder.innerHTML = '<i class="fa-regular fa-user"></i>';
            img.remove();
            photo.appendChild(placeholder);
        }, { once: true });
    }

    /* ------------------------------------------------------------------
     * "Log in to react" toast (logged-out Like / Dislike clicks)
     * ------------------------------------------------------------------ */
    let toastTimer = null;

    function hideLoginToast() {
        const toast = el('slug-login-toast');
        if (toast) toast.classList.remove('is-visible');
        if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }
    }

    function showLoginToast() {
        let toast = el('slug-login-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'slug-login-toast';
            toast.className = 'slug-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');

            const icon = document.createElement('i');
            icon.className = 'fa-regular fa-thumbs-up slug-toast-icon';
            icon.setAttribute('aria-hidden', 'true');

            const text = document.createElement('span');
            text.className = 'slug-toast-text';
            text.textContent = 'Log in to react';

            const link = document.createElement('a');
            link.className = 'slug-toast-link';
            link.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            link.textContent = 'Log in';

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'slug-toast-close';
            close.setAttribute('aria-label', 'Dismiss');
            close.textContent = '×';
            close.addEventListener('click', hideLoginToast);

            toast.append(icon, text, link, close);
            document.body.appendChild(toast);
            // force a reflow so the transition runs on first show
            void toast.offsetWidth;
        }
        toast.classList.add('is-visible');
        if (toastTimer) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(hideLoginToast, TOAST_MS);
    }

    /* ------------------------------------------------------------------
     * Reactions: counts always visible incl. 0;
     * public to view, logged-in to click; one reaction per account.
     * ------------------------------------------------------------------ */
    const react = {
        panel: el('slug-react-panel'),
        hint: el('slug-react-hint'),
        likeBtn: el('slug-like-btn'),
        dislikeBtn: el('slug-dislike-btn'),
        likeCount: el('slug-like-count'),
        dislikeCount: el('slug-dislike-count'),
    };

    function reactionState() {
        const slug = react.panel ? react.panel.getAttribute('data-slug') : '';
        const spotlightId = react.panel ? String(react.panel.getAttribute('data-spotlight-id') || '').trim() : '';
        let liked = parseInt(react.likeCount ? react.likeCount.textContent : '0', 10) || 0;
        let disliked = parseInt(react.dislikeCount ? react.dislikeCount.textContent : '0', 10) || 0;
        let mine = null;
        try { mine = window.localStorage.getItem(REACTIONS_STORAGE_PREFIX + slug); } catch (error) { mine = null; }
        return {
            slug,
            spotlightId,
            mine,
            get like() { return liked; },
            get dislike() { return disliked; },
            setCounts(l, d) { liked = l; disliked = d; paint(); },
        };
    }

    function paintButtons(mine) {
        [
            [react.likeBtn, 'like'],
            [react.dislikeBtn, 'dislike'],
        ].forEach(([btn, kind]) => {
            if (!btn) return;
            const active = mine === kind;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    function paint() {
        if (react.likeCount) react.likeCount.textContent = String(state.like);
        if (react.dislikeCount) react.dislikeCount.textContent = String(state.dislike);
        paintButtons(state.mine);
    }

    let state = null;
    function initReactions() {
        if (!react.panel || !react.likeBtn || !react.dislikeBtn) return;
        state = reactionState();
        paint();

        [react.likeBtn, react.dislikeBtn].forEach((btn) => {
            btn.addEventListener('click', () => onReactClick(btn.getAttribute('data-reaction')));
        });
    }

    function promptLogin() {
        showLoginToast();
        if (!react.hint) return;
        react.hint.classList.add('is-prompt');
        window.setTimeout(() => react.hint && react.hint.classList.remove('is-prompt'), 2600);
    }

    function applyDelta(clicked) {
        // one reaction per account: clicking the same one removes it
        const prev = state.mine;
        const next = prev === clicked ? null : clicked;
        let { like, dislike } = state;
        if (prev === 'like') like -= 1;
        if (prev === 'dislike') dislike -= 1;
        if (next === 'like') like += 1;
        if (next === 'dislike') dislike += 1;
        const snapshot = { like: state.like, dislike: state.dislike, mine: state.mine };
        state.setCounts(Math.max(0, like), Math.max(0, dislike));
        state.mine = next;
        paintButtons(next);
        try {
            if (next) window.localStorage.setItem(REACTIONS_STORAGE_PREFIX + state.slug, next);
            else window.localStorage.removeItem(REACTIONS_STORAGE_PREFIX + state.slug);
        } catch (error) { /* storage full/blocked — counts still updated */ }
        return snapshot;
    }

    function revert(snapshot) {
        state.setCounts(snapshot.like, snapshot.dislike);
        state.mine = snapshot.mine;
        paintButtons(snapshot.mine);
        try {
            if (snapshot.mine) window.localStorage.setItem(REACTIONS_STORAGE_PREFIX + state.slug, snapshot.mine);
            else window.localStorage.removeItem(REACTIONS_STORAGE_PREFIX + state.slug);
        } catch (error) { /* ignore */ }
    }

    async function onReactClick(reaction) {
        if (!state) return;
        // Logged out: no optimistic update, no request — just tell them why.
        if (!getToken()) { promptLogin(); return; }
        const snapshot = applyDelta(reaction);
        const next = state.mine;
        if (!state.spotlightId) {
            console.error('[spotlight detail] reaction failed: page carries no spotlight id');
            revert(snapshot);
            return;
        }
        try {
            const res = await fetch(`/spotlight/${encodeURIComponent(state.spotlightId)}/react`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${getToken()}`,
                },
                body: JSON.stringify({ value: next }),
            });
            if (res.status === 401 || res.status === 403) { promptLogin(); revert(snapshot); return; }
            if (!res.ok) throw new Error(`react failed (HTTP ${res.status})`);
            // Authoritative counts come back in "likes"/"dislikes" - use those
            // instead of the optimistic local math so the page and a refresh
            // always agree.
            const data = await res.json().catch(() => null);
            if (data && typeof data.likes === 'number' && typeof data.dislikes === 'number') {
                state.setCounts(Math.max(0, data.likes), Math.max(0, data.dislikes));
            }
        } catch (error) {
            console.error('[spotlight detail] reaction failed:', error);
            revert(snapshot);
        }
    }

    /* ------------------------------------------------------------------
     * Share links + copy link
     * ------------------------------------------------------------------ */
    function initShare() {
        const url = window.location.origin + `/spotlight/${encodeURIComponent((react.panel && react.panel.getAttribute('data-slug')) || window.location.pathname.split('/').filter(Boolean).pop() || '')}`;
        const title = (document.querySelector('.slug-headline') || {}).textContent || document.title;
        const text = title.trim();
        const x = el('slug-share-x');
        const wa = el('slug-share-wa');
        const li = el('slug-share-li');
        if (x) x.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
        if (li) li.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

        const copyBtn = el('slug-copy-btn');
        const copyLabel = el('slug-copy-label');
        if (!copyBtn) return;
        copyBtn.addEventListener('click', async () => {
            const done = () => {
                if (!copyLabel) return;
                const prev = copyLabel.textContent;
                copyLabel.textContent = 'Copied!';
                copyBtn.classList.add('is-copied');
                window.setTimeout(() => {
                    copyLabel.textContent = prev;
                    copyBtn.classList.remove('is-copied');
                }, 1800);
            };
            try {
                await navigator.clipboard.writeText(url);
                done();
            } catch (error) {
                try {
                    const temp = document.createElement('textarea');
                    temp.value = url;
                    document.body.appendChild(temp);
                    temp.select();
                    document.execCommand('copy');
                    temp.remove();
                    done();
                } catch (fallbackError) {
                    console.error('[spotlight detail] copy failed:', fallbackError);
                }
            }
        });
    }

    /* ------------------------------------------------------------------
     * More founders to watch — client-side from GET /spotlight/public
     * (backend template does not receive this list). Max 3 cards.
     * ------------------------------------------------------------------ */
    function moreCard(item) {
        const url = `/spotlight/${encodeURIComponent(String(item.slug || '').trim())}`;
        const card = document.createElement('article');
        card.className = 'spotlight-card';

        const photo = document.createElement('a');
        photo.className = 'spotlight-photo spotlight-card-photo';
        photo.href = url;
        photo.setAttribute('aria-label', `Read the ${item.startup_name || 'startup'} spotlight`);
        const fallback = () => {
            photo.classList.add('is-placeholder');
            photo.replaceChildren(iconEl());
        };
        const iconEl = () => {
            const icon = document.createElement('i');
            icon.className = 'fa-regular fa-user';
            icon.setAttribute('aria-hidden', 'true');
            return icon;
        };
        const photoUrl = String(item.photo_url || '').trim();
        if (photoUrl) {
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', fallback, { once: true });
            photo.appendChild(img);
        } else {
            fallback();
        }
        if (item.open_to_work === true) {
            const badge = document.createElement('span');
            badge.className = 'spotlight-open-badge';
            badge.innerHTML = '<span class="spotlight-open-dot" aria-hidden="true"></span>Open to work';
            photo.appendChild(badge);
        }

        const body = document.createElement('div');
        body.className = 'spotlight-card-body';
        const name = document.createElement('h3');
        name.className = 'spotlight-card-name';
        const link = document.createElement('a');
        link.href = url;
        link.textContent = String(item.startup_name || 'Untitled startup');
        name.appendChild(link);
        body.appendChild(name);
        const byline = [item.founder_name, item.state].map(s => String(s || '').trim()).filter(Boolean).join(' · ');
        if (byline) {
            const p = document.createElement('p');
            p.className = 'spotlight-founder-line';
            p.textContent = byline;
            body.appendChild(p);
        }
        const read = document.createElement('a');
        read.className = 'spotlight-read-link';
        read.href = url;
        read.textContent = 'Read spotlight →';
        read.setAttribute('aria-label', `Read the ${item.startup_name || 'startup'} spotlight`);
        body.appendChild(read);

        card.append(photo, body);
        return card;
    }

    async function initMore() {
        const section = el('slug-more');
        const grid = el('slug-more-grid');
        if (!section || !grid) return;
        try {
            const res = await fetch('/spotlight/public', { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`more founders failed (HTTP ${res.status})`);
            const data = await res.json().catch(() => null);
            if (!data || typeof data !== 'object') throw new Error('bad more-founders payload');
            // backend-curated list: keep the backend's order, but never render
            // more than MORE_MAX cards.
            const others = (Array.isArray(data.more) ? data.more : [])
                .filter(x => x && typeof x === 'object' && String(x.slug || '').trim())
                .slice(0, MORE_MAX);
            if (!others.length) { section.hidden = true; return; } // nothing else published - stay hidden
            grid.replaceChildren(...others.map(moreCard));
            section.hidden = false;
        } catch (error) {
            console.error('[spotlight detail] more founders:', error);
            section.hidden = true;
        }
    }

    /* ------------------------------------------------------------------
     * Apply gating (same convention as /spotlight index)
     * ------------------------------------------------------------------ */
    function initApply() {
        const btn = el('slug-apply-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (getToken()) { window.location.href = APPLY_URL; return; }
            window.location.href = `/login?type=developer&redirect=${encodeURIComponent(APPLY_URL)}`;
        });
    }

    initReadTime();
    initPhoto();
    initReactions();
    initShare();
    initMore();
    initApply();
})();