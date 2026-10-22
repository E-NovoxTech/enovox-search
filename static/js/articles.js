/* ==========================================================================
   Enovox Search - Articles (list page + share buttons on article page)
   Load AFTER config.js and home.js (uses API_BASE_URL). No other dependencies.

   LIST PAGE  -> GET {API}/articles/public?type=&category=&q=&page=&page_size=
        returns { items:[Article], total:int, featured:Article|null, categories:[{id,name,slug}] }
        types: product_discovery | news | updates | guides | industry_trends
   Article    -> { id, slug, title, summary, cover_image_url, type, category:{id,name,slug}|null,
                   author_name, author_avatar_url, published_at (ISO), read_minutes, is_featured }
   ========================================================================== */
(function () {
    'use strict';

    var BASE = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : '';
    var PAGE_SIZE = 9;
    var TYPES = [
        { slug: '', label: 'All' },
        { slug: 'news', label: 'News' },
        { slug: 'updates', label: 'Updates' },
        { slug: 'guides', label: 'Guides' },
        { slug: 'industry_trends', label: 'Industry Trends' },
        { slug: 'product_discovery', label: 'Discover' }
    ];
    var CATEGORY_TYPE = 'product_discovery'; // category filter only applies to this tab
    var TYPE_LABEL = {};
    TYPES.forEach(function (t) { if (t.slug) TYPE_LABEL[t.slug] = t.label; });

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function initials(name) {
        return String(name || 'E').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || 'E';
    }
    function debounce(fn, ms) {
        var t;
        return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    }

    /* ---------------------------------------------------------------- list page */
    function initList() {
        var root = document.getElementById('ar-list-root');
        if (!root) return;

        var tabsEl = document.getElementById('ar-tabs');
        var searchEl = document.getElementById('ar-search');
        var clearSearchEl = document.getElementById('ar-search-clear');
        var catEl = document.getElementById('ar-category');
        var countEl = document.getElementById('ar-count');
        var resetEl = document.getElementById('ar-reset');
        var featuredEl = document.getElementById('ar-featured-slot');
        var gridEl = document.getElementById('ar-grid');
        var stateEl = document.getElementById('ar-state');
        var moreWrap = document.getElementById('ar-more');
        var moreBtn = document.getElementById('ar-more-btn');

        var state = { type: '', category: '', q: '', page: 1 };
        var items = [];
        var total = 0;
        var reqId = 0;

        function readUrl() {
            var p = new URLSearchParams(location.search);
            state.type = TYPE_LABEL[p.get('type')] ? p.get('type') : '';
            state.category = state.type === CATEGORY_TYPE ? (p.get('category') || '') : '';
            state.q = (p.get('q') || '').trim();
        }
        function writeUrl() {
            var p = new URLSearchParams();
            if (state.type) p.set('type', state.type);
            if (state.category) p.set('category', state.category);
            if (state.q) p.set('q', state.q);
            var qs = p.toString();
            history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
        }

        function renderTabs() {
            tabsEl.innerHTML = TYPES.map(function (t) {
                return '<button type="button" role="tab" class="ar-tab" data-type="' + esc(t.slug) + '" aria-selected="' + (t.slug === state.type) + '">' + esc(t.label) + '</button>';
            }).join('');
        }

        var allCats = [];
        function renderCategories(cats) {
            if (cats) allCats = cats;
            cats = allCats;
            if (state.type !== CATEGORY_TYPE || !cats.length) { catEl.parentElement.hidden = true; return; }
            catEl.parentElement.hidden = false;
            var html = '<option value="">All categories</option>' + cats.map(function (c) {
                return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>';
            }).join('');
            catEl.innerHTML = html;
            catEl.value = state.category;
        }

        function cover(a, eager) {
            var label = esc(TYPE_LABEL[a.type] || 'Enovox');
            if (!a.cover_image_url) return '<span class="ar-cover"><span class="ar-cover-fallback"><span>' + label + '</span></span></span>';
            return '<span class="ar-cover"><img src="' + esc(a.cover_image_url) + '" alt="" ' + (eager ? '' : 'loading="lazy" ') + 'decoding="async"></span>';
        }
        function chip(a) {
            return '<span class="ar-chip" data-type="' + esc(a.type) + '">' + esc(TYPE_LABEL[a.type] || a.type) + '</span>';
        }
        function url(a) { return '/articles/' + encodeURIComponent(a.slug); }
        function metaLine(a) {
            var bits = [];
            if (a.category && a.category.name) bits.push(esc(a.category.name));
            var d = fmtDate(a.published_at);
            if (d) bits.push(d);
            if (a.read_minutes) bits.push(esc(a.read_minutes) + ' min read');
            return bits.map(function (b) { return '<span class="ar-date">' + b + '</span>'; }).join('<span class="ar-meta-dot" aria-hidden="true">&middot;</span>');
        }

        function cardHtml(a) {
            return '<article class="ar-card">' +
                '<a class="ar-cover-link" href="' + url(a) + '" tabindex="-1" aria-hidden="true">' + cover(a) + '</a>' +
                '<div class="ar-card-meta">' + chip(a) + metaLine(a) + '</div>' +
                '<h3><a href="' + url(a) + '">' + esc(a.title) + '</a></h3>' +
                (a.summary ? '<p class="ar-desc">' + esc(a.summary) + '</p>' : '') +
                '</article>';
        }
        function featuredHtml(a) {
            var author = a.author_name ? '<div class="ar-byline"><span class="ar-avatar">' +
                (a.author_avatar_url ? '<img src="' + esc(a.author_avatar_url) + '" alt="">' : esc(initials(a.author_name))) +
                '</span><span>By <strong>' + esc(a.author_name) + '</strong></span></div>' : '';
            return '<article class="ar-featured">' +
                '<div class="ar-featured-copy">' +
                '<div class="ar-featured-top">' + chip(a) + '<span class="ar-chip" style="--chip-bg:#fff7d6;--chip-fg:#854d0e">Featured</span></div>' +
                '<h2><a href="' + url(a) + '">' + esc(a.title) + '</a></h2>' +
                (a.summary ? '<p class="ar-desc">' + esc(a.summary) + '</p>' : '') +
                author +
                '<div class="ar-card-meta">' + metaLine(a) + '</div>' +
                '</div>' + cover(a, true) + '</article>';
        }

        function showSkeleton() {
            stateEl.hidden = true;
            featuredEl.innerHTML = state.page === 1 && !state.type && !state.category && !state.q ? '<div class="ar-skel ar-skel--featured"></div>' : '';
            gridEl.innerHTML = new Array(6).join('x').split('').concat('x').slice(0, 6).map(function () { return '<div class="ar-skel ar-skel--card"></div>'; }).join('');
            moreWrap.hidden = true;
        }

        function showState(icon, title, text, actionLabel) {
            stateEl.hidden = false;
            stateEl.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' +
                (actionLabel ? '<button type="button" class="ar-btn" id="ar-state-action">' + esc(actionLabel) + '</button>' : '');
            var b = document.getElementById('ar-state-action');
            if (b) b.addEventListener('click', actionLabel === 'Try again' ? function () { load(false); } : resetAll);
        }

        function updateMeta() {
            var filtered = !!(state.type || state.category || state.q);
            resetEl.hidden = !filtered;
            countEl.textContent = total ? total + (total === 1 ? ' article' : ' articles') : '';
        }

        function load(append) {
            var id = ++reqId;
            if (!append) { showSkeleton(); }
            else { moreBtn.disabled = true; moreBtn.textContent = 'Loading...'; }

            var p = new URLSearchParams();
            if (state.type) p.set('type', state.type);
            if (state.category) p.set('category', state.category);
            if (state.q) p.set('q', state.q);
            p.set('page', state.page);
            p.set('page_size', PAGE_SIZE);

            fetch(BASE + '/articles/public?' + p.toString())
                .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
                .then(function (data) {
                    if (id !== reqId) return;
                    var list = Array.isArray(data.items) ? data.items : [];
                    total = Number(data.total) || list.length;
                    items = append ? items.concat(list) : list;
                    if (!append && data.categories) { renderCategories(data.categories); }

                    var unfiltered = !state.type && !state.category && !state.q;
                    var feat = null;
                    if (!append && unfiltered) {
                        feat = data.featured || null; // featured comes only from the backend (null whenever a filter is active)
                    }
                    var gridItems = feat ? items.filter(function (a) { return a.id !== feat.id; }) : items;
                    if (append) { gridEl.insertAdjacentHTML('beforeend', list.map(cardHtml).join('')); }
                    else {
                        featuredEl.innerHTML = feat ? featuredHtml(feat) : '';
                        gridEl.innerHTML = gridItems.map(cardHtml).join('');
                    }
                    stateEl.hidden = true;
                    if (!items.length) {
                        gridEl.innerHTML = '';
                        showState('fa-newspaper', filtersActive() ? 'No articles match your search' : 'No articles yet',
                            filtersActive() ? 'Try a different keyword, type or category.' : 'We are writing. Check back soon.',
                            filtersActive() ? 'Clear filters' : '');
                    }
                    moreWrap.hidden = items.length >= total;
                    moreBtn.disabled = false; moreBtn.textContent = 'Load more articles';
                    updateMeta();
                })
                .catch(function () {
                    if (id !== reqId) return;
                    if (append) { moreBtn.disabled = false; moreBtn.textContent = 'Load more articles'; return; }
                    featuredEl.innerHTML = ''; gridEl.innerHTML = ''; moreWrap.hidden = true;
                    showState('fa-triangle-exclamation', 'Could not load articles', 'Check your connection and try again.', 'Try again');
                });
        }

        function filtersActive() { return !!(state.type || state.category || state.q); }
        function refresh() { state.page = 1; writeUrl(); load(false); }
        function resetAll() {
            state.type = ''; state.category = ''; state.q = ''; searchEl.value = ''; clearSearchEl.hidden = true;
            catEl.value = ''; renderTabs(); renderCategories(); refresh();
        }

        tabsEl.addEventListener('click', function (e) {
            var b = e.target.closest('.ar-tab'); if (!b) return;
            state.type = b.getAttribute('data-type');
            if (state.type !== CATEGORY_TYPE) { state.category = ''; catEl.value = ''; }
            renderTabs(); renderCategories(); refresh();
        });
        catEl.addEventListener('change', function () { state.category = catEl.value; refresh(); });
        var onSearch = debounce(function () { state.q = searchEl.value.trim(); refresh(); }, 350);
        searchEl.addEventListener('input', function () { clearSearchEl.hidden = !searchEl.value; onSearch(); });
        clearSearchEl.addEventListener('click', function () { searchEl.value = ''; clearSearchEl.hidden = true; state.q = ''; refresh(); searchEl.focus(); });
        resetEl.addEventListener('click', resetAll);
        moreBtn.addEventListener('click', function () { state.page += 1; load(true); });

        readUrl();
        searchEl.value = state.q; clearSearchEl.hidden = !state.q;
        renderTabs();
        renderCategories([]);
        load(false);
    }

    /* ---------------------------------------------------------- article page */
    function initShare() {
        var groups = document.querySelectorAll('.ar-share');
        if (!groups.length) return;
        var link = (document.querySelector('link[rel="canonical"]') || {}).href || location.href.split('#')[0];
        var title = document.title.replace(/\s*[-|]\s*Enovox Search\s*$/i, '');
        var text = encodeURIComponent(title + ' ' + link);

        groups.forEach(function (g) {
            g.querySelectorAll('a[data-share]').forEach(function (a) {
                var k = a.getAttribute('data-share');
                if (k === 'whatsapp') a.href = 'https://wa.me/?text=' + text;
                if (k === 'x') a.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(link);
                if (k === 'facebook') a.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link);
                if (k === 'linkedin') a.href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link);
                a.target = '_blank'; a.rel = 'noopener noreferrer';
            });
            var copy = g.querySelector('[data-share="copy"]');
            if (copy) copy.addEventListener('click', function () {
                var label = copy.querySelector('span');
                var done = function () {
                    copy.classList.add('is-copied');
                    if (label) label.textContent = 'Copied!';
                    setTimeout(function () { copy.classList.remove('is-copied'); if (label) label.textContent = 'Copy link'; }, 2000);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(link).then(done, fallback);
                } else { fallback(); }
                function fallback() {
                    var t = document.createElement('textarea'); t.value = link; t.style.position = 'fixed'; t.style.opacity = '0';
                    document.body.appendChild(t); t.select();
                    try { document.execCommand('copy'); done(); } catch (e) {}
                    document.body.removeChild(t);
                }
            });
            var native = g.querySelector('[data-share="native"]');
            if (native && navigator.share) {
                native.hidden = false;
                native.addEventListener('click', function () { navigator.share({ title: title, url: link }).catch(function () {}); });
            }
        });
    }

    /* ------------------------------------------------- page newsletter block */
    function initInlineNewsletter() {
        var form = document.getElementById('ar-nl-form');
        if (!form) return;
        var input = document.getElementById('ar-nl-email');
        var msg = document.getElementById('ar-nl-msg');
        var btn = form.querySelector('button[type="submit"]');
        var RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        function show(m, k) { msg.textContent = m; msg.className = 'footer-subscribe-msg' + (k ? ' ' + k : ''); }
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = input.value.trim();
            if (!RE.test(email)) { show('Please enter a valid email address.', 'error'); return; }
            var old = btn.textContent; btn.disabled = true; btn.textContent = 'Subscribing...'; show('', '');
            fetch(BASE + '/products/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
                .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
                    if (!r.ok) { var m = d.message || d.detail || ''; if (Array.isArray(m) && m[0] && m[0].msg) m = m[0].msg; throw new Error(m || 'Could not subscribe right now.'); }
                    show(d.message || 'Subscribed successfully.', 'success'); input.value = '';
                }); })
                .catch(function (err) { show(err.message || 'Could not subscribe right now.', 'error'); })
                .then(function () { btn.disabled = false; btn.textContent = old; });
        });
    }

    function init() { initList(); initShare(); initInlineNewsletter(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();