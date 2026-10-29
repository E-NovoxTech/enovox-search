/**
 * js/home-sections.js
 * Homepage sections added after the Newly launched / Popular / Featured row:
 *   1) Alternatives      GET /products/alternatives/daily-comparisons
 *   2) Sponsored         GET /products/sponsored/public
 *   3) Founder Spotlight GET /spotlight/public
 *   4) Collections       GET /collections/public
 *   5) Articles          GET /articles/public?page=1&page_size=4
 * plus the Newsletter card (POST /products/newsletter/subscribe, same as the footer).
 *
 * Load this AFTER home.js (it reuses home.js's API_BASE_URL). All three
 * requests start together, once, on page load. If a request fails or returns
 * nothing, only that section is hidden; the rest of the page is never touched.
 */
(function () {
    'use strict';

    var BASE = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : '';
    var ROTATE_MS = 18000;        // Alternatives: advance to the next group
    var TOUCH_RESUME_MS = 3000;   // Alternatives: resume after a swipe ends
    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* ---------- tiny helpers ---------- */
    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function text(value) { return String(value === undefined || value === null ? '' : value).trim(); }

    function getJson(path) {
        return fetch(BASE + path, { cache: 'no-store', headers: { 'Accept': 'application/json' } })
            .then(function (response) {
                if (!response.ok) throw new Error(path + ' failed (' + response.status + ')');
                return response.json();
            });
    }

    // Only http(s) image URLs are ever used.
    function safeImageUrl(value) {
        if (!value) return '';
        try {
            var url = new URL(String(value), window.location.origin);
            return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
        } catch (error) { return ''; }
    }

    // Only same-site paths are used for links that come from the API.
    function sitePath(value, fallback) {
        var path = text(value);
        return (path.charAt(0) === '/' && path.charAt(1) !== '/') ? path : fallback;
    }

    function svg(width, paths, extraClass) {
        var node = document.createElementNS(SVG_NS, 'svg');
        node.setAttribute('width', String(width));
        node.setAttribute('height', String(width));
        node.setAttribute('viewBox', '0 0 24 24');
        node.setAttribute('fill', 'none');
        node.setAttribute('stroke', 'currentColor');
        node.setAttribute('stroke-width', '2');
        node.setAttribute('stroke-linecap', 'round');
        node.setAttribute('stroke-linejoin', 'round');
        node.setAttribute('aria-hidden', 'true');
        if (extraClass) node.setAttribute('class', extraClass);
        paths.forEach(function (d) {
            var path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', d);
            node.appendChild(path);
        });
        return node;
    }

    // Logo with a rounded letter-tile fallback (missing or broken image).
    function logo(item, tintIndex, foreign) {
        var name = text(item.name);
        var letter = (name.charAt(0) || '?').toUpperCase();
        var fallbackClass = 'home-logo-fallback' + (foreign ? ' home-logo-fallback--foreign' : ' home-tint' + (tintIndex % 4));

        function tile() {
            var fallback = el('span', fallbackClass, letter);
            fallback.setAttribute('aria-hidden', 'true');
            return fallback;
        }

        var src = safeImageUrl(item.logo_url);
        if (!src) return tile();

        var image = document.createElement('img');
        image.className = 'home-logo';
        image.src = src;
        image.alt = name + ' logo';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', function () { image.replaceWith(tile()); }, { once: true });
        return image;
    }

    function clearSkeleton(container) {
        container.setAttribute('aria-busy', 'false');
    }

    function hide(section, reason) {
        if (reason) console.warn('[home sections] Hiding "' + section.id + '":', reason);
        section.hidden = true;
    }

    /* ======================================================================
       1) ALTERNATIVES
       ====================================================================== */
    function isValidAltCard(card) {
        return card && card.foreign_tool && text(card.foreign_tool.name) &&
               card.alternative && text(card.alternative.name) && text(card.alternative.slug);
    }

    function buildAltCard(card, index) {
        var foreign = card.foreign_tool;
        var alt = card.alternative;
        var foreignName = text(foreign.name);
        var viewAll = sitePath(card.view_all_url, foreign.slug ? '/alternative/' + encodeURIComponent(text(foreign.slug)) : '/alternative');

        var article = el('article', 'home-alt-card');

        var top = el('div');
        var labelRow = el('div', 'home-alt-labelrow');
        labelRow.appendChild(el('span', 'home-alt-label', 'Instead of'));
        var viewAllLink = el('a', 'home-alt-viewall', 'View all');
        viewAllLink.href = viewAll;
        viewAllLink.setAttribute('aria-label', 'View all Nigerian alternatives to ' + foreignName);
        labelRow.appendChild(viewAllLink);
        top.appendChild(labelRow);

        var tool = el('div', 'home-alt-tool');
        tool.appendChild(logo(foreign, index, true));
        var toolCopy = el('div', 'home-alt-tool-copy');
        toolCopy.appendChild(el('span', 'home-alt-tool-name', foreignName));
        if (text(card.category)) toolCopy.appendChild(el('span', 'home-alt-tool-cat', text(card.category)));
        tool.appendChild(toolCopy);
        top.appendChild(tool);
        article.appendChild(top);

        var divider = el('div', 'home-alt-divider');
        divider.setAttribute('aria-hidden', 'true');
        var arrow = el('span', 'home-alt-arrow');
        arrow.appendChild(svg(16, ['M12 5v14', 'M6 13l6 6 6-6']));
        divider.append(el('span'), arrow, el('span'));
        article.appendChild(divider);

        var panel = el('a', 'home-alt-panel');
        panel.href = '/product/' + encodeURIComponent(text(alt.slug));
        panel.appendChild(el('span', 'home-alt-badge', 'Built in Nigeria'));
        var product = el('span', 'home-alt-product');
        product.appendChild(logo(alt, index + 1, false));
        var productCopy = el('span', 'home-alt-product-copy');
        productCopy.appendChild(el('span', 'home-alt-product-name', text(alt.name)));
        if (text(alt.description)) productCopy.appendChild(el('span', 'home-alt-product-desc', text(alt.description)));
        product.appendChild(productCopy);
        panel.appendChild(product);
        article.appendChild(panel);

        return article;
    }

    function initAlternatives() {
        var section = document.getElementById('home-alt-section');
        var stage = document.getElementById('home-alt-stage');
        if (!section || !stage) return;

        getJson('/products/alternatives/daily-comparisons').then(function (data) {
            // Rendered exactly as the API returns it: same groups, same order.
            var groups = (data && Array.isArray(data.groups) ? data.groups : [])
                .map(function (group) {
                    return (group && Array.isArray(group.cards) ? group.cards : []).filter(isValidAltCard);
                })
                .filter(function (cards) { return cards.length > 0; });

            if (!groups.length) { hide(section, 'no alternative groups'); return; }

            var groupEls = groups.map(function (cards, groupIndex) {
                var group = el('div', 'home-alt-group');
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', 'Alternatives, set ' + (groupIndex + 1) + ' of ' + groups.length);
                cards.forEach(function (card, index) { group.appendChild(buildAltCard(card, index)); });
                return group;
            });
            stage.replaceChildren.apply(stage, groupEls);
            clearSkeleton(stage);

            var current = 0;
            function activate(next) {
                current = next;
                groupEls.forEach(function (group, index) {
                    var active = index === current;
                    group.classList.toggle('is-active', active);
                    group.setAttribute('aria-hidden', active ? 'false' : 'true');
                    group.inert = !active; // keeps hidden groups out of the tab order
                    if (active) group.scrollLeft = 0; // swipe row starts at the first card
                });
            }
            activate(0);

            if (groupEls.length > 1) startRotation(section, groupEls.length, function () {
                activate((current + 1) % groupEls.length);
            });
        }).catch(function (error) {
            hide(section, error);
        });
    }

    // Client-side only rotation. Pauses on hover, focus, touch and hidden tabs.
    function startRotation(section, count, advance) {
        var timer = null;
        var resumeTimer = null;
        var hovering = false;
        var touching = false;
        var focused = false;

        function stop() { if (timer !== null) { clearTimeout(timer); timer = null; } }
        function schedule() {
            stop();
            if (hovering || touching || focused || document.hidden) return;
            timer = setTimeout(function () { timer = null; advance(); schedule(); }, ROTATE_MS);
        }

        section.addEventListener('pointerenter', function (event) {
            if (event.pointerType && event.pointerType !== 'mouse') return; // touch "hover" would stick
            hovering = true; stop();
        });
        section.addEventListener('pointerleave', function (event) {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            hovering = false; schedule();
        });

        section.addEventListener('touchstart', function () {
            touching = true; stop();
            if (resumeTimer !== null) { clearTimeout(resumeTimer); resumeTimer = null; }
        }, { passive: true });
        function touchDone() {
            if (resumeTimer !== null) clearTimeout(resumeTimer);
            resumeTimer = setTimeout(function () { resumeTimer = null; touching = false; schedule(); }, TOUCH_RESUME_MS);
        }
        section.addEventListener('touchend', touchDone, { passive: true });
        section.addEventListener('touchcancel', touchDone, { passive: true });

        section.addEventListener('focusin', function () { focused = true; stop(); });
        section.addEventListener('focusout', function () {
            setTimeout(function () { focused = section.contains(document.activeElement); schedule(); }, 0);
        });

        function onVisibility() { if (document.hidden) stop(); else schedule(); }
        document.addEventListener('visibilitychange', onVisibility);

        // Clean up when the page goes away (also covers back/forward cache).
        window.addEventListener('pagehide', function () {
            stop();
            if (resumeTimer !== null) { clearTimeout(resumeTimer); resumeTimer = null; }
            document.removeEventListener('visibilitychange', onVisibility);
        });

        schedule();
    }

    /* ======================================================================
       SPONSORED PRODUCTS  (GET /products/sponsored/public -> array, max 10, already live-only)
       Carousel: arrows on desktop and mobile, swipe on touch, smooth scrolling.
       ====================================================================== */
    function buildSponsoredCard(item, index) {
        var name = text(item.name);
        var card = el('article', 'home-sp-card');

        var head = el('div', 'home-sp-head');
        head.appendChild(logo(item, index, false));
        head.appendChild(el('span', 'home-sp-tag', 'Sponsored'));
        card.appendChild(head);

        card.appendChild(el('h3', 'home-sp-name', name));

        var pills = el('div', 'home-sp-pills');
        if (text(item.category)) pills.appendChild(el('span', 'home-sp-pill', text(item.category)));
        var pricing = text(item.pricing);
        if (pricing) pills.appendChild(el('span', 'home-sp-pill' + (pricing.toLowerCase() === 'free' ? ' home-sp-pill--free' : ''), pricing));
        if (pills.childNodes.length) card.appendChild(pills);

        if (text(item.description)) card.appendChild(el('p', 'home-sp-desc', text(item.description)));

        var cta = el('a', 'home-sp-cta');
        cta.href = '/product/' + encodeURIComponent(text(item.slug));
        cta.setAttribute('aria-label', 'View sponsored product: ' + name);
        cta.appendChild(el('span', null, 'View product'));
        cta.appendChild(svg(18, ['M5 12h14', 'M12 5l7 7-7 7']));
        card.appendChild(cta);

        return card;
    }

    function initSponsored() {
        var section = document.getElementById('home-sponsored-section');
        var track = document.getElementById('home-sp-track');
        var prev = document.getElementById('home-sp-prev');
        var next = document.getElementById('home-sp-next');
        if (!section || !track) return;

        getJson('/products/sponsored/public').then(function (data) {
            var list = (Array.isArray(data) ? data : [])
                .filter(function (item) { return item && text(item.slug) && text(item.name); })
                .slice(0, 10);
            if (!list.length) { hide(section, 'no sponsored products'); return; }

            track.replaceChildren.apply(track, list.map(buildSponsoredCard));
            clearSkeleton(track);

            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            // One card (plus gap) per click, so each press lands cleanly on a card.
            function step() {
                var first = track.firstElementChild;
                if (!first) return track.clientWidth;
                var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
                return first.getBoundingClientRect().width + gap;
            }
            function update() {
                var max = track.scrollWidth - track.clientWidth;
                var overflow = max > 2;
                if (prev) prev.disabled = !overflow || track.scrollLeft <= 2;
                if (next) next.disabled = !overflow || track.scrollLeft >= max - 2;
                var nav = document.getElementById('home-sp-nav');
                if (nav) nav.hidden = !overflow; // nothing to scroll, so no arrows
            }
            function go(direction) {
                track.scrollBy({ left: direction * step(), behavior: reduce ? 'auto' : 'smooth' });
            }

            if (prev) prev.addEventListener('click', function () { go(-1); });
            if (next) next.addEventListener('click', function () { go(1); });
            track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
            window.addEventListener('resize', update, { passive: true });
            // Keyboard: arrow keys scroll the focused carousel.
            track.addEventListener('keydown', function (event) {
                if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
                else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
            });
            update();
        }).catch(function (error) {
            hide(section, error);
        });
    }

    /* ======================================================================
       3) FOUNDER SPOTLIGHT
       ====================================================================== */
    function buildSpotlightCard(item) {
        var startup = text(item.startup_name);
        var founder = text(item.founder_name);
        var state = text(item.state);

        var card = el('article', 'home-spot-card');

        var photo = el('div', 'home-spot-photo');
        // Striped placeholder is always underneath; the photo covers it when it loads.
        photo.appendChild(svg(56, ['M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z']));
        photo.firstChild.setAttribute('stroke-width', '1.2');
        var src = safeImageUrl(item.photo_url);
        if (src) {
            var image = document.createElement('img');
            image.src = src;
            image.alt = founder ? founder + ', founder of ' + startup : startup;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', function () { image.remove(); }, { once: true });
            photo.appendChild(image);
        }
        if (item.open_to_work === true) photo.appendChild(el('span', 'home-spot-badge', 'Open to work'));
        card.appendChild(photo);

        var body = el('div', 'home-spot-body');
        body.appendChild(el('h3', 'home-spot-title', startup));
        body.appendChild(el('p', 'home-spot-by', state ? founder + ' · ' + state : founder));
        if (text(item.summary)) body.appendChild(el('p', 'home-spot-summary', text(item.summary)));
        var link = el('a', 'home-spot-link', 'View spotlight →');
        link.href = '/spotlight/' + encodeURIComponent(text(item.slug));
        link.setAttribute('aria-label', 'View spotlight: ' + startup);
        body.appendChild(link);
        card.appendChild(body);

        return card;
    }

    function initSpotlight() {
        var section = document.getElementById('home-spot-section');
        var grid = document.getElementById('home-spot-grid');
        if (!section || !grid) return;

        getJson('/spotlight/public').then(function (data) {
            // 3 most recently published, already ordered by the API. No re-sorting.
            var list = [];
            if (data && data.featured) list.push(data.featured);
            if (data && Array.isArray(data.more)) list = list.concat(data.more);
            list = list
                .filter(function (item) { return item && text(item.slug) && text(item.startup_name); })
                .slice(0, 3);

            if (!list.length) { hide(section, 'no spotlights'); return; }

            grid.replaceChildren.apply(grid, list.map(buildSpotlightCard));
            clearSkeleton(grid);
        }).catch(function (error) {
            hide(section, error);
        });
    }

    /* ======================================================================
       4) COLLECTIONS
       ====================================================================== */
    // Same 3 for every visitor all day; a different 3 after midnight Lagos time.
    function pickCollections(list) {
        var n = list.length;
        if (n <= 3) return list.slice();

        var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()); // YYYY-MM-DD
        var parts = today.split('-');
        var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
        var dayNumber = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2024, 0, 1)) / 86400000);
        var start = (((dayNumber * 3) % n) + n) % n;

        return [0, 1, 2].map(function (offset) { return list[(start + offset) % n]; });
    }

    function buildCollectionTile(item, index) {
        var tile = el('a', 'home-col-tile');
        tile.href = '/collection#' + encodeURIComponent(text(item.slug));

        var icon = el('span', 'home-col-icon home-col-icon--' + (index % 3), text(item.emoji) || '✨');
        icon.setAttribute('aria-hidden', 'true');
        tile.appendChild(icon);

        var copy = el('span', 'home-col-copy');
        copy.appendChild(el('span', 'home-col-title', text(item.title)));
        var total = Number(item.total);
        if (isFinite(total) && total >= 0) {
            copy.appendChild(el('span', 'home-col-count', total + (total === 1 ? ' product' : ' products')));
        }
        tile.appendChild(copy);

        var arrow = svg(20, ['M5 12h14', 'M12 5l7 7-7 7'], 'home-col-arrow');
        tile.appendChild(arrow);
        return tile;
    }

    function initCollections() {
        var section = document.getElementById('home-col-section');
        var grid = document.getElementById('home-col-grid');
        if (!section || !grid) return;

        getJson('/collections/public').then(function (data) {
            var list = (Array.isArray(data) ? data : [])
                .filter(function (item) { return item && text(item.slug) && text(item.title); });
            if (!list.length) { hide(section, 'no collections'); return; }

            var picked;
            try {
                picked = pickCollections(list);
            } catch (error) {
                console.warn('[home sections] Daily collection pick failed; showing the first three.', error);
                picked = list.slice(0, 3);
            }

            grid.replaceChildren.apply(grid, picked.map(buildCollectionTile));
            clearSkeleton(grid);
        }).catch(function (error) {
            hide(section, error);
        });
    }

    /* ======================================================================
       NEWSLETTER CARD
       Same behaviour as initFooterSubscribe() in home.js: POST
       /products/newsletter/subscribe with {"email"}, the same email check,
       the same messages, and the same button states.
       ====================================================================== */
    function initNewsletter() {
        var form = document.getElementById('home-nl-form');
        var input = document.getElementById('home-nl-email');
        var msgEl = document.getElementById('home-nl-msg');
        if (!form || !input) return;
        var btn = form.querySelector('button[type="submit"]');
        if (!btn) return;

        var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same pattern the footer form uses

        function showMsg(message, kind) {
            if (!msgEl) return;
            msgEl.textContent = message;
            msgEl.className = kind ? 'footer-subscribe-msg ' + kind : 'footer-subscribe-msg';
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = input.value.trim();
            if (!EMAIL_RE.test(email)) {
                showMsg('Please enter a valid email address.', 'error');
                return;
            }

            var originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Subscribing...';
            showMsg('', '');

            fetch(BASE + '/products/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            }).then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    if (!res.ok) {
                        var detail = data.message || data.detail || '';
                        if (Array.isArray(detail) && detail[0] && detail[0].msg) detail = detail[0].msg; // FastAPI 422
                        throw new Error(detail || 'Could not subscribe right now. Please try again.');
                    }
                    showMsg(data.message || 'Subscribed successfully.', 'success');
                    input.value = '';
                });
            }).catch(function (err) {
                showMsg(err.message, 'error');
            }).then(function () {
                btn.disabled = false;
                btn.textContent = originalText;
            });
        });
    }

    /* ======================================================================
       5) ARTICLES  (latest 4: one featured + three smaller cards)
       ====================================================================== */
    var ART_LABELS = {
        product_discovery: 'Discover', news: 'News', updates: 'Updates',
        guides: 'Guides', industry_trends: 'Industry Trends'
    };

    function artDate(value) {
        var d = value ? new Date(value) : null;
        if (!d || isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function artCover(item) {
        var wrap = el('span', 'home-art-cover');
        function fallback() {
            var f = el('span', 'home-art-cover-fallback');
            f.appendChild(el('span', '', ART_LABELS[item.type] || 'Enovox'));
            return f;
        }
        var src = safeImageUrl(item.cover_image_url);
        if (!src) { wrap.appendChild(fallback()); return wrap; }
        var image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', function () { image.replaceWith(fallback()); }, { once: true });
        wrap.appendChild(image);
        return wrap;
    }

    function artChip(type) {
        var chip = el('span', 'home-art-chip', ART_LABELS[type] || 'Article');
        chip.setAttribute('data-type', type || '');
        return chip;
    }

    function artTitle(item, tag, className) {
        var heading = el(tag, className);
        var link = el('a', 'home-art-link', text(item.title));
        link.href = '/articles/' + encodeURIComponent(text(item.slug));
        heading.appendChild(link);
        return heading;
    }

    function artMeta(item) {
        var bits = [];
        var date = artDate(item.published_at);
        if (date) bits.push(date);
        var mins = Number(item.read_minutes);
        if (isFinite(mins) && mins > 0) bits.push(mins + ' min read');
        return el('p', 'home-art-meta', bits.join(' \u00b7 '));
    }

    function buildArtFeatured(item) {
        var card = el('article', 'home-art-card home-art-featured');
        card.appendChild(artCover(item));
        var body = el('div', 'home-art-body');
        var top = el('div', 'home-art-chips');
        top.appendChild(artChip(item.type));
        if (item.is_featured) top.appendChild(el('span', 'home-art-chip home-art-chip--featured', 'Featured'));
        body.appendChild(top);
        body.appendChild(artTitle(item, 'h3', 'home-art-title home-art-title--lg'));
        var summary = text(item.summary);
        if (summary) body.appendChild(el('p', 'home-art-summary', summary));
        var author = text(item.author_name);
        if (author) {
            var by = el('p', 'home-art-by');
            by.appendChild(el('span', 'home-art-avatar', author.charAt(0).toUpperCase()));
            by.appendChild(el('span', '', 'By '));
            by.lastChild.appendChild(el('strong', '', author));
            body.appendChild(by);
        }
        body.appendChild(artMeta(item));
        card.appendChild(body);
        return card;
    }

    function buildArtCard(item) {
        var card = el('article', 'home-art-card home-art-small');
        card.appendChild(artCover(item));
        var body = el('div', 'home-art-body');
        body.appendChild(artChip(item.type));
        body.appendChild(artTitle(item, 'h3', 'home-art-title'));
        body.appendChild(artMeta(item));
        card.appendChild(body);
        return card;
    }

    function initArticles() {
        var section = document.getElementById('home-art-section');
        var layout = document.getElementById('home-art-layout');
        if (!section || !layout) return;

        getJson('/articles/public?page=1&page_size=4').then(function (data) {
            var items = (data && Array.isArray(data.items) ? data.items : [])
                .filter(function (a) { return a && text(a.slug) && text(a.title); });
            // featured comes from the API only (the article flagged "Featured on homepage banner").
            var featured = (data && data.featured && text(data.featured.slug) && text(data.featured.title)) ? data.featured : items[0];
            if (!featured) { hide(section, 'no articles'); return; }

            var rest = items.filter(function (a) { return a.id !== featured.id; }).slice(0, 3);
            layout.replaceChildren();
            layout.appendChild(buildArtFeatured(featured));
            if (rest.length) {
                var side = el('div', 'home-art-side');
                rest.forEach(function (a) { side.appendChild(buildArtCard(a)); });
                layout.appendChild(side);
            } else {
                layout.classList.add('is-single');
            }
            clearSkeleton(layout);
        }).catch(function (error) {
            hide(section, error);
        });
    }

    /* ---------- start all three together, once ---------- */
    function init() {
        initAlternatives();
        initSponsored();
        initSpotlight();
        initCollections();
        initArticles();
        initNewsletter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();