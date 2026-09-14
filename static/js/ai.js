/**
 * js/ai.js
 * Ask AI page — single-page, two-state (search / results), no chat history.
 * Talks to POST /ai/ask and POST /ai/product-details per the contract.
 *
 * Also handles this page's theme toggle + mobile nav, since home.js isn't
 * available to me yet. Built to match the exact mechanism visible in your
 * real style.css / login.html markup:
 *   - dark mode = ".dark-mode" class (I'm applying it to <body>)
 *   - the sun/moon icons inside #theme-toggle are swapped via inline
 *     style.display, matching the moon icon's default `display:none`
 *   - the mobile nav-links drawer opens via an ".active-slider" class
 * If you share home.js and it does the same thing, swap this block out for
 * a plain <script src="/static/js/home.js"> — no other changes needed.
 */

(function () {
    const API_BASE = ""; // same-origin

    /* ==========================================================================
       Theme toggle
       ========================================================================== */
    const THEME_KEY = 'enovox_theme'; // guessed key — reconcile with home.js if it uses a different one
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = document.querySelector('#theme-toggle .sun-icon');
    const moonIcon = document.querySelector('#theme-toggle .moon-icon');

    function applyTheme(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        if (sunIcon) sunIcon.style.display = isDark ? 'none' : '';
        if (moonIcon) moonIcon.style.display = isDark ? '' : 'none';
    }

    const storedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(storedTheme ? storedTheme === 'dark' : prefersDark);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const nowDark = !document.body.classList.contains('dark-mode');
            localStorage.setItem(THEME_KEY, nowDark ? 'dark' : 'light');
            applyTheme(nowDark);
        });
    }

    /* ==========================================================================
       Mobile nav (hamburger -> .nav-links.active-slider)
       ========================================================================== */
    const hamburgerBtn = document.getElementById('hamburger-menu');
    const navLinks = document.querySelector('.nav-links');
    if (hamburgerBtn && navLinks) {
        hamburgerBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active-slider');
        });
    }

    /* ==========================================================================
       Ask AI functionality
       ========================================================================== */
    const form = document.getElementById('ai-form');
    const queryInput = document.getElementById('ai-query');
    const submitBtn = document.getElementById('ai-submit-btn');
    const btnAskText = submitBtn.querySelector('.btn-ask-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    const initialState = document.getElementById('ai-initial');
    const resultsState = document.getElementById('ai-results');
    const loadingEl = document.getElementById('ai-loading');
    const errorEl = document.getElementById('ai-error');
    const answerEl = document.getElementById('ai-answer');
    const productsEl = document.getElementById('ai-products');
    const newSearchBtn = document.getElementById('ai-new-search-btn');

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    // Escapes HTML first (safety), then turns **bold**, blank-line
    // paragraphs, and "- "/"* " bullet lines into real markup.
    function formatAIAnswer(text) {
        if (!text) return '';
        let safe = escapeHTML(text);
        safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        const lines = safe.split(/\r?\n/);
        let html = '';
        let inList = false;

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            const isBullet = /^[-*]\s+/.test(line);

            if (isBullet) {
                if (!inList) { html += '<ul>'; inList = true; }
                html += `<li>${line.replace(/^[-*]\s+/, '')}</li>`;
            } else {
                if (inList) { html += '</ul>'; inList = false; }
                if (line !== '') html += `<p>${line}</p>`;
            }
        });
        if (inList) html += '</ul>';
        return html || `<p>${safe}</p>`;
    }

    function productUrl(slug) {
        return `${window.location.origin}/product/${encodeURIComponent(slug)}`;
    }

    function autoGrowTextarea() {
        queryInput.style.height = 'auto';
        queryInput.style.height = Math.min(queryInput.scrollHeight, 200) + 'px';
    }
    queryInput.addEventListener('input', autoGrowTextarea);

    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    function setLoading(isLoading) {
        loadingEl.classList.toggle('hidden', !isLoading);
        submitBtn.disabled = isLoading;
        btnAskText.classList.toggle('hidden', isLoading);
        btnSpinner.classList.toggle('hidden', !isLoading);
    }

    function clearError() {
        errorEl.classList.add('hidden');
        errorEl.innerHTML = '';
    }

    function showError(message, showAuthPrompt) {
        errorEl.classList.remove('hidden');
        errorEl.innerHTML = `<p>${escapeHTML(message)}</p>` + (showAuthPrompt ? `
            <div class="ai-error-actions">
                <a href="/login" class="btn-text-link">Log in</a>
                <a href="/signup" class="btn-primary">Sign up</a>
            </div>` : '');
    }

    async function handle429(res) {
        let detail = null;
        try {
            const body = await res.json();
            detail = body && body.detail ? body.detail : body;
        } catch (e) {
            detail = null;
        }
        const message = (detail && detail.message) || "You've reached your usage limit for now. Please try again later.";
        const showAuthPrompt = !!(detail && detail.action);
        showError(message, showAuthPrompt);
    }

    function renderResults(data) {
        answerEl.innerHTML = formatAIAnswer(data.answer);

        productsEl.innerHTML = '';
        const products = (data.products || []).slice(0, 2);

        if (products.length === 0) {
            productsEl.innerHTML = `<p class="text-muted">No specific matches found — try rephrasing your question.</p>`;
        } else {
            products.forEach(p => productsEl.appendChild(buildProductCard(p)));
        }

        initialState.classList.add('hidden');
        resultsState.classList.remove('hidden');
    }

    function buildProductCard(product) {
        const card = document.createElement('div');
        card.className = 'ai-product-card';
        card.innerHTML = `
            <a class="product-card-link" href="${productUrl(product.slug)}">
                <h3>${escapeHTML(product.name)}</h3>
            </a>
            <button type="button" class="btn-more-info" data-slug="${escapeHTML(product.slug)}">Tell me more</button>
            <div class="product-details hidden"></div>
        `;
        const moreBtn = card.querySelector('.btn-more-info');
        moreBtn.addEventListener('click', () => handleMoreInfo(moreBtn, card));
        return card;
    }

    async function handleMoreInfo(btn, card) {
        const detailsEl = card.querySelector('.product-details');

        if (detailsEl.dataset.loaded === 'true') {
            const nowHidden = detailsEl.classList.toggle('hidden');
            btn.textContent = nowHidden ? 'Tell me more' : 'Hide details';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Loading...';

        try {
            const res = await fetch(`${API_BASE}/ai/product-details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: btn.getAttribute('data-slug') })
            });

            if (res.status === 429) {
                await handle429(res);
                btn.textContent = 'Tell me more';
                return;
            }
            if (!res.ok) throw new Error('Could not load more details right now.');

            const data = await res.json();
            detailsEl.innerHTML = buildProductDetailsHTML(data);
            detailsEl.dataset.loaded = 'true';
            detailsEl.classList.remove('hidden');
            btn.textContent = 'Hide details';
        } catch (err) {
            detailsEl.innerHTML = `<p class="ai-inline-error">${escapeHTML(err.message)}</p>`;
            detailsEl.classList.remove('hidden');
            btn.textContent = 'Tell me more';
        } finally {
            btn.disabled = false;
        }
    }

    function buildProductDetailsHTML(data) {
        let html = formatAIAnswer(data.answer);
        const similar = data.similar_products || [];
        if (similar.length) {
            html += `<div class="similar-products"><span class="similar-label">Similar tools:</span>`;
            similar.forEach(sp => {
                html += `<a class="similar-chip" href="${productUrl(sp.slug)}">${escapeHTML(sp.name)}</a>`;
            });
            html += `</div>`;
        }
        return html;
    }

    async function submitQuery(query) {
        clearError();
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/ai/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            if (res.status === 429) {
                await handle429(res);
                return;
            }
            if (!res.ok) throw new Error('Something went wrong — please try again.');

            const data = await res.json();
            renderResults(data);
        } catch (err) {
            showError(err.message || 'Something went wrong — please try again.', false);
        } finally {
            setLoading(false);
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = queryInput.value.trim();
        if (!query) return;
        submitQuery(query);
    });

    newSearchBtn.addEventListener('click', () => {
        resultsState.classList.add('hidden');
        initialState.classList.remove('hidden');
        clearError();
        queryInput.value = '';
        autoGrowTextarea();
        queryInput.focus();
    });

    document.querySelectorAll('.example-query-btn').forEach(exampleBtn => {
        exampleBtn.addEventListener('click', () => {
            queryInput.value = exampleBtn.getAttribute('data-query') || exampleBtn.textContent;
            autoGrowTextarea();
            queryInput.focus();
        });
    });
})();