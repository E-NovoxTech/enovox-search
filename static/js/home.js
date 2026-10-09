const API_BASE_URL = '';

// Shared category icon/color system used by both the category grid and header menu.
window.ENOVOX_CATEGORY_PRESENTATION = Object.freeze({
    'ai & automation': { icon: 'fa-microchip', accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.14)' },
    'fintech': { icon: 'fa-credit-card', accent: '#059669', soft: 'rgba(5, 150, 105, 0.14)' },
    'education': { icon: 'fa-graduation-cap', accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.14)' },
    'business': { icon: 'fa-briefcase', accent: '#d97706', soft: 'rgba(217, 119, 6, 0.16)' },
    'productivity': { icon: 'fa-list-check', accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.14)' },
    'e-commerce': { icon: 'fa-cart-shopping', accent: '#ea580c', soft: 'rgba(234, 88, 12, 0.14)' },
    'web3 & blockchain': { icon: 'fa-cube', accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.14)' },
    'design & creative': { icon: 'fa-palette', accent: '#db2777', soft: 'rgba(219, 39, 119, 0.14)' },
    'transportation & logistics': { icon: 'fa-truck', accent: '#dc2626', soft: 'rgba(220, 38, 38, 0.14)' },
    'health & wellness': { icon: 'fa-heart-pulse', accent: '#16a34a', soft: 'rgba(22, 163, 74, 0.14)' },
    'entertainment & media': { icon: 'fa-circle-play', accent: '#9333ea', soft: 'rgba(147, 51, 234, 0.14)' },
    'agriculture': { icon: 'fa-seedling', accent: '#65a30d', soft: 'rgba(101, 163, 13, 0.15)' },
    'social & community': { icon: 'fa-users', accent: '#db2777', soft: 'rgba(219, 39, 119, 0.14)' },
    'developer tools': { icon: 'fa-code', accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.14)' },
    'gaming & esports': { icon: 'fa-gamepad', accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.14)' },
    'freelance & gig work': { icon: 'fa-briefcase', accent: '#ea580c', soft: 'rgba(234, 88, 12, 0.14)' },
    'real estate & housing': { icon: 'fa-house', accent: '#0284c7', soft: 'rgba(2, 132, 199, 0.14)' },
    'legal & compliance': { icon: 'fa-scale-balanced', accent: '#6d28d9', soft: 'rgba(109, 40, 217, 0.14)' },
    'energy & utilities': { icon: 'fa-bolt', accent: '#d97706', soft: 'rgba(217, 119, 6, 0.16)' },
    'travel & tourism': { icon: 'fa-plane', accent: '#0284c7', soft: 'rgba(2, 132, 199, 0.14)' },
    'security': { icon: 'fa-shield-halved', accent: '#059669', soft: 'rgba(5, 150, 105, 0.14)' },
    'other': { icon: 'fa-ellipsis', accent: '#64748b', soft: 'rgba(100, 116, 139, 0.14)' }
});

window.getEnovoxCategoryPresentation = function (category) {
    const name = String(category || '').trim().toLowerCase();
    const aliases = {
        'design & creatives': 'design & creative',
        'energy & utility': 'energy & utilities'
    };
    const key = aliases[name] || name;
    return window.ENOVOX_CATEGORY_PRESENTATION[key] || window.ENOVOX_CATEGORY_PRESENTATION.other;
};

// Start the category section independently of the other homepage widgets.
// A failure in hero/theme/bookmark setup must never strand its initial
// "Finding popular categories..." state without making the counts request.
function startPopularCategories() {
    const grid = document.getElementById('popular-category-grid');
    if (!grid) return; // home.js also runs on Explore and product pages

    console.info('[popular categories] Homepage ready; starting category counts.');
    initPopularCategories().catch(error => {
        // Covers failures BEFORE initPopularCategories() reaches its own
        // fetch try/catch (e.g. missing markup or an unexpected DOM error).
        console.error('[popular categories] Initialization failed before counts could load:', error);
        grid.setAttribute('aria-busy', 'false');
        const state = document.createElement('div');
        state.className = 'popular-products-state';
        state.textContent = 'Unable to load popular categories right now.';
        grid.replaceChildren(state);
        const announcement = document.getElementById('popular-category-announcement');
        if (announcement) announcement.textContent = state.textContent;
        const preview = document.getElementById('popular-categories-list');
        if (preview) {
            const previewState = document.createElement('div');
            previewState.className = 'popular-preview-state';
            previewState.textContent = 'Unable to load popular categories.';
            preview.replaceChildren(previewState);
        }
    });
}

// Register this before any legacy page initialization. Also start immediately
// if this script is injected after DOMContentLoaded has already fired.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPopularCategories, { once: true });
} else {
    startPopularCategories();
}

document.addEventListener('DOMContentLoaded', () => {
    initEnovoxProductAutocomplete();
    initForeignAlternativesBrowse();
    initForeignAlternativeDetail();

    // Generate the fixed top category row from the configured category list.
    const pillsContainer = document.getElementById('home-category-pills');
    
    if (pillsContainer && typeof ENOVOX_CONFIG !== 'undefined') {
        pillsContainer.innerHTML = '';

        const pillElements = [];
        ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
            const pill = document.createElement('a');
            pill.href = `/explore?category=${encodeURIComponent(cat)}`;
            const safeClass = cat.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
            pill.className = `category-pill pill-${safeClass}`;
            pill.textContent = cat;
            pill.style.display = 'none';
            pillsContainer.appendChild(pill);
            pillElements.push(pill);
        });

        function updatePillVisibility() {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            let visibleCount = Math.min(isMobile ? 4 : 6, pillElements.length);

            if (isMobile && visibleCount === 4) {
                // Measure the first four chips after their active responsive styles apply.
                pillElements.forEach((pill, index) => {
                    pill.style.display = index < 4 ? 'inline-block' : 'none';
                });
                const rowStyle = window.getComputedStyle(pillsContainer);
                const gap = parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
                const fourPillWidth = pillElements.slice(0, 4).reduce(
                    (total, pill) => total + pill.getBoundingClientRect().width,
                    0
                ) + gap * 3;
                const comfortableSpacing = 24;
                if (fourPillWidth + comfortableSpacing > pillsContainer.clientWidth) {
                    visibleCount = 3;
                }
            }

            pillElements.forEach((pill, index) => {
                pill.style.display = index < visibleCount ? 'inline-block' : 'none';
            });
        }

        window.addEventListener('resize', updatePillVisibility, { passive: true });
        updatePillVisibility();
    }

    initHeroRotation();
    initThemeToggle();
    initHeaderNavigation();
    initMobileMenu();
    initFooterSubscribe();
    initSubscribeHeaderButton();
    initSiteBanner();
    if (!document.body.hasAttribute('data-category-page')) EnovoxBookmarks.init();
    
    if (document.getElementById('newly-launched-list')) {
        loadGridData();
    }
});

/* ==========================================================================
   Nigerian Alternatives — browse, name-only autocomplete, and detail page
   ========================================================================== */
const FOREIGN_TOOLS_API_BASE = '/products/alternatives/foreign-tools';
let foreignToolsCache = null;
let foreignToolsFetchPromise = null;
let foreignToolsAutocompleteUnavailable = false;
let foreignToolsAutocompleteWarningShown = false;

function normalizeForeignTools(payload) {
    const items = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload && payload.foreign_tools)
            ? payload.foreign_tools
            : (Array.isArray(payload && payload.items) ? payload.items : []));
    return items.filter(item => item && String(item.name || '').trim() && String(item.slug || '').trim());
}

function getForeignTools(force = false) {
    if (foreignToolsCache && !force) return Promise.resolve(foreignToolsCache);
    if (foreignToolsFetchPromise && !force) return foreignToolsFetchPromise;

    const request = fetch(`${API_BASE_URL}${FOREIGN_TOOLS_API_BASE}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    }).then(response => {
        if (!response.ok) throw new Error(`Foreign tools API failed (${response.status})`);
        return response.json();
    }).then(normalizeForeignTools).then(items => {
        foreignToolsCache = items;
        return items;
    }).catch(error => {
        foreignToolsFetchPromise = null;
        throw error;
    });

    foreignToolsFetchPromise = request;
    return request;
}

function safeForeignToolLogoUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(String(value), window.location.origin);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (error) {
        return '';
    }
}

function createForeignToolLogo(tool, className = 'foreign-tool-logo') {
    const name = String(tool.name || '').trim();
    const src = safeForeignToolLogoUrl(tool.logo_url);
    if (!src) {
        const fallback = document.createElement('span');
        fallback.className = `${className} ${className}-fallback`;
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = name.charAt(0).toUpperCase() || '?';
        return fallback;
    }

    const image = document.createElement('img');
    image.className = className;
    image.src = src;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = `${className} ${className}-fallback`;
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = name.charAt(0).toUpperCase() || '?';
        image.replaceWith(fallback);
    }, { once: true });
    return image;
}

function truncateAlternativeCardDescription(value, maxLength = 112) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (text.length <= maxLength) return text;

    let excerpt = text.slice(0, maxLength - 3);
    const lastSpace = excerpt.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.65) excerpt = excerpt.slice(0, lastSpace);
    return `${excerpt.trimEnd()}...`;
}

function createForeignToolCard(tool) {
    const name = String(tool.name || '').trim();
    const slug = String(tool.slug || '').trim();
    const card = document.createElement('a');
    card.className = 'product-card foreign-tool-card';
    card.href = `/alternative/${encodeURIComponent(slug)}`;
    card.setAttribute('aria-label', `See Nigerian alternatives to ${name}`);

    card.appendChild(createForeignToolLogo(tool, 'product-logo'));

    const content = document.createElement('div');
    content.className = 'product-info';

    const title = document.createElement('h3');
    title.className = 'product-name';
    title.textContent = name;
    content.appendChild(title);

    if (tool.description) {
        const description = document.createElement('p');
        description.className = 'product-desc';
        description.title = String(tool.description);
        description.textContent = truncateAlternativeCardDescription(tool.description);
        content.appendChild(description);
    }

    const count = Number(tool.alternative_count) || 0;
    const countLabel = document.createElement('span');
    countLabel.className = 'product-badge foreign-tool-card-count';
    countLabel.textContent = `${count} Nigerian alternative${count === 1 ? '' : 's'}`;
    content.appendChild(countLabel);

    if (tool.category) {
        const categoryName = String(tool.category).trim();
        const categoryClass = categoryName.toLowerCase()
            .replace(/ & /g, '-')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const category = document.createElement('span');
        category.className = `category-pill pill-${categoryClass} pill-sm`;
        category.textContent = categoryName;
        content.appendChild(category);
    }

    card.appendChild(content);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'card-arrow');
    arrow.setAttribute('width', '18');
    arrow.setAttribute('height', '18');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '5');
    line.setAttribute('y1', '12');
    line.setAttribute('x2', '19');
    line.setAttribute('y2', '12');
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    point.setAttribute('points', '12 5 19 12 12 19');
    arrow.append(line, point);
    card.appendChild(arrow);

    return card;
}
function initForeignAlternativesBrowse() {
    const grid = document.getElementById('foreign-tools-grid');
    if (!grid) return;

    const status = document.getElementById('foreign-tools-status');
    initForeignToolAutocomplete();
    grid.setAttribute('aria-busy', 'true');

    getForeignTools().then(tools => {
        grid.replaceChildren();
        if (!tools.length) {
            const empty = document.createElement('p');
            empty.className = 'foreign-tools-empty';
            empty.textContent = 'Foreign products will appear here soon.';
            grid.appendChild(empty);
        } else {
            tools.forEach(tool => grid.appendChild(createForeignToolCard(tool)));
        }
        grid.setAttribute('aria-busy', 'false');
        if (status) status.textContent = `${tools.length} foreign products loaded.`;
    }).catch(error => {
        console.error('[foreign alternatives] Could not load the foreign tools list:', error);
        grid.setAttribute('aria-busy', 'false');
        grid.replaceChildren();
        const message = document.createElement('div');
        message.className = 'foreign-tools-load-error';
        const copy = document.createElement('p');
        copy.textContent = 'We could not load the foreign products right now.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'foreign-tools-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => {
            foreignToolsCache = null;
            getForeignTools(true).then(tools => {
                grid.replaceChildren(...tools.map(createForeignToolCard));
                grid.setAttribute('aria-busy', 'false');
                if (status) status.textContent = `${tools.length} foreign products loaded.`;
            }).catch(retryError => {
                console.error('[foreign alternatives] Retry failed:', retryError);
            });
        });
        message.append(copy, retry);
        grid.appendChild(message);
        if (status) status.textContent = 'Unable to load foreign products.';
    });
}

function normalizeForeignAutocomplete(payload) {
    const items = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload && payload.suggestions)
            ? payload.suggestions
            : (Array.isArray(payload && payload.results) ? payload.results : []));
    return items.filter(item => item && String(item.name || '').trim() && String(item.slug || '').trim()).slice(0, 8);
}

function normalizeForeignSearchText(value) {
    return String(value || '').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function searchForeignToolsByName(query, signal) {
    if (!foreignToolsAutocompleteUnavailable) {
        try {
            const params = new URLSearchParams({ query });
            const response = await fetch(`${API_BASE_URL}${FOREIGN_TOOLS_API_BASE}/autocomplete?${params.toString()}`, {
                signal,
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) return normalizeForeignAutocomplete(await response.json());

            // If FastAPI routes this static path as a foreign-tool slug, use the
            // already-loaded list as a name-only fallback until routing is fixed.
            foreignToolsAutocompleteUnavailable = true;
            if (!foreignToolsAutocompleteWarningShown) {
                console.warn(`[foreign alternatives] Autocomplete endpoint returned ${response.status}; filtering the foreign-tools list by name instead.`);
                foreignToolsAutocompleteWarningShown = true;
            }
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            foreignToolsAutocompleteUnavailable = true;
            if (!foreignToolsAutocompleteWarningShown) {
                console.warn('[foreign alternatives] Autocomplete endpoint unavailable; filtering the foreign-tools list by name instead.', error);
                foreignToolsAutocompleteWarningShown = true;
            }
        }
    }

    const foreignTools = await getForeignTools();
    const normalizedQuery = normalizeForeignSearchText(query);
    return foreignTools
        .filter(tool => normalizeForeignSearchText(tool.name).includes(normalizedQuery))
        .sort((a, b) => {
            const aStarts = normalizeForeignSearchText(a.name).startsWith(normalizedQuery);
            const bStarts = normalizeForeignSearchText(b.name).startsWith(normalizedQuery);
            return Number(bStarts) - Number(aStarts);
        })
        .slice(0, 8)
        .map(({ name, slug, logo_url }) => ({ name, slug, logo_url }));
}

function initForeignToolAutocomplete() {
    const input = document.getElementById('foreign-tool-search');
    const wrapper = input && input.closest('.foreign-tool-search-wrapper');
    const panel = wrapper && wrapper.querySelector('.foreign-tool-suggestions');
    if (!input || !wrapper || !panel) return;

    let timer = null;
    let controller = null;
    let requestVersion = 0;

    function clearActive() {
        input.removeAttribute('aria-activedescendant');
        panel.querySelectorAll('.product-autocomplete-option.is-active').forEach(option => {
            option.classList.remove('is-active');
            option.setAttribute('aria-selected', 'false');
        });
    }

    function cancelPending() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        requestVersion += 1;
        if (controller) {
            controller.abort();
            controller = null;
        }
    }

    function closePanel(cancel = true) {
        if (cancel) cancelPending();
        panel.hidden = true;
        panel.replaceChildren();
        input.setAttribute('aria-expanded', 'false');
        clearActive();
    }

    function setActive(option) {
        if (!option) return;
        clearActive();
        option.classList.add('is-active');
        option.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', option.id);
    }

    function showMatches(query, matches) {
        const items = normalizeForeignAutocomplete(matches).slice(0, 8);
        panel.replaceChildren();
        clearActive();
        if (!items.length) {
            closePanel(false);
            return;
        }

        const heading = document.createElement('div');
        heading.className = 'product-autocomplete-header';
        const label = document.createElement('span');
        label.textContent = 'Foreign products';
        const count = document.createElement('span');
        count.className = 'product-autocomplete-count';
        count.textContent = `${items.length} match${items.length === 1 ? '' : 'es'}`;
        heading.append(label, count);
        panel.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'product-autocomplete-list';
        list.id = 'foreign-tool-suggestion-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Foreign product matches');
        const rows = [];
        items.forEach((tool, index) => {
            const row = document.createElement('li');
            row.hidden = index >= 3;
            const option = document.createElement('a');
            option.id = `foreign-tool-suggestion-${index + 1}`;
            option.className = 'product-autocomplete-option';
            option.href = `/alternative/${encodeURIComponent(String(tool.slug).trim())}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.tabIndex = -1;
            option.title = String(tool.name).trim();
            option.appendChild(createForeignToolLogo(tool, 'product-autocomplete-logo'));
            const copy = document.createElement('span');
            copy.className = 'product-autocomplete-copy';
            const name = document.createElement('span');
            name.className = 'product-autocomplete-name';
            name.textContent = String(tool.name).trim();
            copy.appendChild(name);
            option.appendChild(copy);
            option.addEventListener('mouseenter', () => setActive(option));
            row.appendChild(option);
            list.appendChild(row);
            rows.push(row);
        });
        panel.appendChild(list);

        if (items.length > 3) {
            const footer = document.createElement('div');
            footer.className = 'product-autocomplete-footer product-autocomplete-footer-end';
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'product-autocomplete-more';
            more.setAttribute('aria-controls', list.id);
            more.setAttribute('aria-expanded', 'false');
            more.textContent = `Show ${items.length - 3} more`;
            let expanded = false;
            more.addEventListener('click', () => {
                expanded = !expanded;
                rows.forEach((row, index) => {
                    if (index >= 3) row.hidden = !expanded;
                });
                more.setAttribute('aria-expanded', String(expanded));
                more.textContent = expanded ? 'Show fewer' : `Show ${items.length - 3} more`;
                const active = document.getElementById(input.getAttribute('aria-activedescendant') || '');
                if (!expanded && active && active.closest('li').hidden) clearActive();
            });
            footer.appendChild(more);
            panel.appendChild(footer);
        }

        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    async function load(query) {
        const version = ++requestVersion;
        const currentController = new AbortController();
        controller = currentController;
        try {
            const matches = await searchForeignToolsByName(query, currentController.signal);
            if (version !== requestVersion || input.value.trim() !== query) return;
            showMatches(query, matches);
        } catch (error) {
            if (error && error.name === 'AbortError') return;
            if (version !== requestVersion || input.value.trim() !== query) return;
            console.error('[foreign alternatives] Autocomplete lookup failed:', error);
            closePanel(false);
        } finally {
            if (controller === currentController) controller = null;
        }
    }

    input.addEventListener('input', () => {
        closePanel();
        const query = input.value.trim();
        if (query.length < 2) return;
        timer = setTimeout(() => {
            timer = null;
            load(query);
        }, 180);
    });

    input.addEventListener('focus', () => {
        const query = input.value.trim();
        if (query.length >= 2 && panel.hidden) {
            cancelPending();
            load(query);
        }
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!panel.hidden) {
                event.preventDefault();
                closePanel();
            }
            return;
        }
        if (event.key === 'Enter') {
            const active = document.getElementById(input.getAttribute('aria-activedescendant') || '');
            if (active && panel.contains(active)) {
                event.preventDefault();
                window.location.assign(active.href);
            }
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const options = Array.from(panel.querySelectorAll('.product-autocomplete-option')).filter(option => {
            const row = option.closest('li');
            return row && !row.hidden;
        });
        if (!options.length) return;
        event.preventDefault();
        const activeId = input.getAttribute('aria-activedescendant');
        const current = options.findIndex(option => option.id === activeId);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const next = current === -1
            ? (direction > 0 ? 0 : options.length - 1)
            : (current + direction + options.length) % options.length;
        setActive(options[next]);
    });

    wrapper.addEventListener('focusout', () => {
        window.setTimeout(() => {
            if (!wrapper.contains(document.activeElement)) closePanel();
        }, 0);
    });
    document.addEventListener('pointerdown', event => {
        if (!wrapper.contains(event.target)) closePanel();
    });
}

function initForeignAlternativeDetail() {
    const root = document.getElementById('foreign-alternative-detail');
    if (!root) return;

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    let slug = pathParts.length ? pathParts[pathParts.length - 1] : '';
    try { slug = decodeURIComponent(slug); } catch (error) { /* keep the raw route slug */ }

    const nameElement = document.getElementById('foreign-tool-name');
    const descriptionElement = document.getElementById('foreign-tool-description');
    const logoContainer = document.getElementById('foreign-tool-logo-container');
    const loading = document.getElementById('alternatives-detail-loading');
    const grid = document.getElementById('alternatives-products-grid');
    const emptyState = document.getElementById('alternatives-empty-state');
    const errorState = document.getElementById('alternatives-detail-error');
    const intro = document.getElementById('alternatives-detail-intro');
    const count = document.getElementById('alternatives-detail-count');

    function setMeta(selector, content, attribute = 'content') {
        let element = document.querySelector(selector);
        if (!element) {
            element = document.createElement('meta');
            if (selector.startsWith('meta[name=')) element.name = selector.match(/name="([^"]+)"/)[1];
            else if (selector.startsWith('meta[property=')) element.setAttribute('property', selector.match(/property="([^"]+)"/)[1]);
            document.head.appendChild(element);
        }
        element.setAttribute(attribute, content);
    }

    function setCanonical(url) {
        let link = document.querySelector('link[rel="canonical"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'canonical';
            document.head.appendChild(link);
        }
        link.href = url;
    }

    function updateAlternativeSEO(tool) {
        const toolName = String(tool.name || 'this product').trim();
        const canonical = `https://search.enovoxtech.com/alternative/${encodeURIComponent(String(tool.slug || slug))}`;
        const title = `Nigerian Alternatives to ${toolName} | Enovox Search`;
        const description = `Discover Nigerian-built alternatives to ${toolName}. Compare locally developed products that solve similar problems for the Nigerian market.`;
        document.title = title;
        setMeta('meta[name="description"]', description);
        setMeta('meta[name="robots"]', 'index,follow');
        setMeta('meta[property="og:title"]', title);
        setMeta('meta[property="og:description"]', description);
        setMeta('meta[property="og:url"]', canonical);
        if (tool.logo_url) setMeta('meta[property="og:image"]', String(tool.logo_url));
        setCanonical(canonical);
    }

    function showLogo(tool) {
        if (!logoContainer) return;
        logoContainer.replaceChildren(createForeignToolLogo(tool, 'foreign-alternative-logo'));
    }

    if (!slug) {
        if (loading) loading.hidden = true;
        if (errorState) {
            errorState.hidden = false;
            errorState.textContent = 'This foreign product page could not be found.';
        }
        return;
    }

    fetch(`${API_BASE_URL}${FOREIGN_TOOLS_API_BASE}/${encodeURIComponent(slug)}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    }).then(response => {
        if (!response.ok) throw new Error(`Foreign tool detail API failed (${response.status})`);
        return response.json();
    }).then(payload => {
        const tool = payload && payload.foreign_tool;
        const alternatives = payload && Array.isArray(payload.alternatives) ? payload.alternatives : [];
        if (!tool || !tool.name) throw new Error('The foreign tool was not found.');

        updateAlternativeSEO(tool);
        if (nameElement) nameElement.textContent = String(tool.name);
        if (descriptionElement) descriptionElement.textContent = String(tool.description || '');
        if (intro) intro.textContent = `Looking for a Nigerian-built alternative to ${tool.name}? Here are locally developed tools that solve the same problem, built for the Nigerian market.`;
        const detailHeading = document.getElementById('alternatives-detail-heading');
        if (detailHeading) detailHeading.textContent = `Nigerian Alternatives to ${tool.name}`;
        showLogo(tool);

        if (loading) loading.hidden = true;
        if (alternatives.length) {
            grid.replaceChildren();
            alternatives.forEach(product => {
                const cardProduct = Object.assign({}, product, {
                    category: product.category || 'Other',
                    description: product.description || ''
                });
                const productCard = createProductCard(cardProduct);
                const exploreLabel = productCard.querySelector('.card-explore-text');
                if (exploreLabel) exploreLabel.remove();
                const cardDescription = productCard.querySelector('.product-desc');
                if (cardDescription) {
                    cardDescription.title = String(product.description || '');
                    cardDescription.textContent = truncateAlternativeCardDescription(product.description || '');
                }
                grid.appendChild(productCard);
            });
            grid.hidden = false;
            if (count) {
                count.hidden = false;
                count.textContent = `${alternatives.length} Nigerian alternative${alternatives.length === 1 ? '' : 's'}`;
            }
        } else if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent = `No Nigerian alternatives listed yet for ${tool.name} — check back soon.`;
        }
    }).catch(error => {
        console.error('[foreign alternatives] Could not load the selected foreign tool:', error);
        if (loading) loading.hidden = true;
        if (errorState) {
            errorState.hidden = false;
            errorState.textContent = 'We could not load this foreign product right now. Please try again shortly.';
        }
    });
}


/* ==========================================================================
   Product autocomplete for homepage + Explore search bars
   Uses the lightweight autocomplete endpoint when available, with a fallback
   to the existing filtered products endpoint while the backend route is being
   exposed ahead of the dynamic /products/{product_id} route.
   ========================================================================== */
function initEnovoxProductAutocomplete() {
    const searchInputs = [
        document.getElementById('hero-search-input'),
        document.getElementById('explore-search')
    ].filter(Boolean);

    if (!searchInputs.length) return;

    let autocompleteEndpointUnavailable = false;
    let fallbackWarningShown = false;

    function normalizeProducts(payload) {
        const products = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload && payload.suggestions)
                ? payload.suggestions
                : (Array.isArray(payload && payload.results) ? payload.results : []));

        return products.filter(product =>
            product && String(product.name || '').trim() && String(product.slug || '').trim()
        ).slice(0, 8);
    }

    async function fetchAutocompleteProducts(query, signal) {
        if (!autocompleteEndpointUnavailable) {
            const params = new URLSearchParams({ query });
            const response = await fetch(`${API_BASE_URL}/products/autocomplete?${params.toString()}`, {
                signal,
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });

            // FastAPI may send this path to /products/{product_id} unless the
            // dedicated route is registered before that dynamic route.
            if ([404, 405, 422].includes(response.status)) {
                autocompleteEndpointUnavailable = true;
                if (!fallbackWarningShown) {
                    console.warn('[product autocomplete] /products/autocomplete is not available yet; using the existing product-search endpoint until the route is exposed.');
                    fallbackWarningShown = true;
                }
            } else {
                if (!response.ok) throw new Error(`Autocomplete API failed (${response.status})`);
                return normalizeProducts(await response.json());
            }
        }

        const fallbackParams = new URLSearchParams({ query, limit: '8' });
        const fallbackResponse = await fetch(`${API_BASE_URL}/products/?${fallbackParams.toString()}`, {
            signal,
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        if (!fallbackResponse.ok) throw new Error(`Product search API failed (${fallbackResponse.status})`);
        return normalizeProducts(await fallbackResponse.json());
    }

    function safeLogoUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(String(value), window.location.origin);
            return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    searchInputs.forEach(input => {
        const wrapper = input.closest('.search-container, .search-wrapper');
        if (!wrapper) return;

        const panel = wrapper.querySelector('.product-autocomplete');
        const clearButton = wrapper.querySelector('.autocomplete-clear-btn');
        if (!panel || !clearButton) return;

        let debounceTimer = null;
        let requestController = null;
        let requestVersion = 0;
        let expanded = false;

        function updateClearButton() {
            clearButton.hidden = input.value.length === 0;
        }

        function cancelPendingRequest() {
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            requestVersion += 1;
            if (requestController) {
                requestController.abort();
                requestController = null;
            }
        }

        function clearActiveOption() {
            input.removeAttribute('aria-activedescendant');
            panel.querySelectorAll('.product-autocomplete-option.is-active').forEach(option => {
                option.classList.remove('is-active');
                option.setAttribute('aria-selected', 'false');
            });
        }

        function closePanel(cancelRequest = true) {
            if (cancelRequest) cancelPendingRequest();
            panel.hidden = true;
            panel.replaceChildren();
            input.setAttribute('aria-expanded', 'false');
            clearActiveOption();
            expanded = false;
        }

        function openPanel() {
            panel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        function makeLogo(product) {
            const name = String(product.name || '').trim();
            const src = safeLogoUrl(product.logo_url);
            if (!src) {
                const fallback = document.createElement('span');
                fallback.className = 'product-autocomplete-logo-fallback';
                fallback.setAttribute('aria-hidden', 'true');
                fallback.textContent = name.charAt(0).toUpperCase() || '?';
                return fallback;
            }

            const image = document.createElement('img');
            image.className = 'product-autocomplete-logo';
            image.src = src;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                const fallback = document.createElement('span');
                fallback.className = 'product-autocomplete-logo-fallback';
                fallback.setAttribute('aria-hidden', 'true');
                fallback.textContent = name.charAt(0).toUpperCase() || '?';
                image.replaceWith(fallback);
            }, { once: true });
            return image;
        }

        function makeViewAllLink(query) {
            const link = document.createElement('a');
            link.className = 'product-autocomplete-view-all';
            link.href = `/explore?query=${encodeURIComponent(query)}`;
            link.setAttribute('aria-label', `View all search results for ${query}`);
            link.textContent = 'View all results';
            return link;
        }

        function renderPanel(query, products, message) {
            panel.replaceChildren();
            expanded = false;
            clearActiveOption();

            const heading = document.createElement('div');
            heading.className = 'product-autocomplete-header';
            const headingLabel = document.createElement('span');
            headingLabel.textContent = 'Product suggestions';
            const countLabel = document.createElement('span');
            countLabel.className = 'product-autocomplete-count';
            countLabel.textContent = products.length
                ? `${products.length} match${products.length === 1 ? '' : 'es'}`
                : '';
            heading.append(headingLabel, countLabel);
            panel.appendChild(heading);

            if (products.length) {
                const list = document.createElement('ul');
                list.className = 'product-autocomplete-list';
                list.id = `${panel.id}-list`;
                list.setAttribute('role', 'listbox');
                list.setAttribute('aria-label', 'Matching products');

                const rows = [];
                products.forEach((product, index) => {
                    const name = String(product.name).trim();
                    const row = document.createElement('li');
                    row.hidden = index >= 3;

                    const option = document.createElement('a');
                    option.id = `${panel.id}-option-${index + 1}`;
                    option.className = 'product-autocomplete-option';
                    option.href = `/product/${encodeURIComponent(String(product.slug).trim())}`;
                    option.setAttribute('role', 'option');
                    option.setAttribute('aria-selected', 'false');
                    option.tabIndex = -1;
                    option.title = name;
                    option.appendChild(makeLogo(product));

                    const copy = document.createElement('span');
                    copy.className = 'product-autocomplete-copy';
                    const nameElement = document.createElement('span');
                    nameElement.className = 'product-autocomplete-name';
                    nameElement.textContent = name;
                    copy.appendChild(nameElement);
                    if (product.category) {
                        const category = document.createElement('span');
                        category.className = 'product-autocomplete-category';
                        category.textContent = String(product.category);
                        copy.appendChild(category);
                    }
                    option.appendChild(copy);
                    option.addEventListener('mouseenter', () => setActiveOption(option));
                    row.appendChild(option);
                    list.appendChild(row);
                    rows.push(row);
                });
                panel.appendChild(list);

                const footer = document.createElement('div');
                footer.className = 'product-autocomplete-footer';
                if (products.length > 3) {
                    const moreButton = document.createElement('button');
                    moreButton.type = 'button';
                    moreButton.className = 'product-autocomplete-more';
                    moreButton.setAttribute('aria-controls', list.id);
                    moreButton.setAttribute('aria-expanded', 'false');
                    moreButton.textContent = `Show ${products.length - 3} more`;
                    moreButton.addEventListener('click', () => {
                        expanded = !expanded;
                        rows.forEach((row, index) => {
                            if (index >= 3) row.hidden = !expanded;
                        });
                        moreButton.setAttribute('aria-expanded', String(expanded));
                        moreButton.textContent = expanded ? 'Show fewer' : `Show ${products.length - 3} more`;
                        const activeOption = document.getElementById(input.getAttribute('aria-activedescendant') || '');
                        if (!expanded && activeOption && activeOption.closest('li').hidden) clearActiveOption();
                    });
                    footer.appendChild(moreButton);
                }
                footer.appendChild(makeViewAllLink(query));
                panel.appendChild(footer);
            } else {
                const empty = document.createElement('p');
                empty.className = 'product-autocomplete-empty';
                empty.textContent = message || 'No matching products found. You can still search all products.';
                panel.appendChild(empty);
                const footer = document.createElement('div');
                footer.className = 'product-autocomplete-footer product-autocomplete-footer-end';
                footer.appendChild(makeViewAllLink(query));
                panel.appendChild(footer);
            }

            openPanel();
        }

        function setActiveOption(option) {
            if (!option) return;
            clearActiveOption();
            option.classList.add('is-active');
            option.setAttribute('aria-selected', 'true');
            input.setAttribute('aria-activedescendant', option.id);
        }

        function visibleOptions() {
            return Array.from(panel.querySelectorAll('.product-autocomplete-option')).filter(option => {
                const row = option.closest('li');
                return row && !row.hidden;
            });
        }

        async function loadSuggestions(query) {
            const version = ++requestVersion;
            const controller = new AbortController();
            requestController = controller;

            try {
                const products = await fetchAutocompleteProducts(query, controller.signal);
                if (version !== requestVersion || input.value.trim() !== query) return;
                renderPanel(query, products);
            } catch (error) {
                if (error && error.name === 'AbortError') return;
                if (version !== requestVersion || input.value.trim() !== query) return;
                console.error('[product autocomplete] Could not load suggestions:', error);
                renderPanel(query, [], 'Suggestions are unavailable right now. You can still search all products.');
            } finally {
                if (requestController === controller) requestController = null;
            }
        }

        input.addEventListener('input', () => {
            updateClearButton();
            closePanel();
            const query = input.value.trim();
            if (query.length < 2) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                loadSuggestions(query);
            }, 200);
        });

        input.addEventListener('focus', () => {
            const query = input.value.trim();
            if (query.length >= 2 && panel.hidden) {
                cancelPendingRequest();
                loadSuggestions(query);
            }
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                if (!panel.hidden) {
                    event.preventDefault();
                    closePanel();
                }
                return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const options = visibleOptions();
                if (!options.length) return;
                event.preventDefault();
                const activeId = input.getAttribute('aria-activedescendant');
                const currentIndex = options.findIndex(option => option.id === activeId);
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                const nextIndex = currentIndex === -1
                    ? (direction === 1 ? 0 : options.length - 1)
                    : (currentIndex + direction + options.length) % options.length;
                setActiveOption(options[nextIndex]);
                return;
            }

            if (event.key === 'Enter') {
                const activeOption = document.getElementById(input.getAttribute('aria-activedescendant') || '');
                if (activeOption && panel.contains(activeOption)) {
                    event.preventDefault();
                    window.location.assign(activeOption.href);
                    return;
                }

                if (input.id === 'explore-search') {
                    const runSearchButton = document.getElementById('explore-search-btn');
                    if (runSearchButton) {
                        event.preventDefault();
                        closePanel();
                        runSearchButton.click();
                    }
                }
            }
        });

        clearButton.addEventListener('click', event => {
            event.preventDefault();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        });

        input.addEventListener('enovox:autocomplete-reset', () => {
            updateClearButton();
            closePanel();
        });

        const form = input.form;
        if (form) form.addEventListener('submit', () => closePanel());

        const runSearchButton = wrapper.querySelector('#explore-search-btn');
        if (runSearchButton) runSearchButton.addEventListener('click', () => closePanel());

        wrapper.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!wrapper.contains(document.activeElement)) closePanel();
            }, 0);
        });

        document.addEventListener('pointerdown', event => {
            if (!wrapper.contains(event.target)) closePanel();
        });

        updateClearButton();
    });
}

/* ==========================================================================
   Hero Text Rotation
   ========================================================================== */
function initHeroRotation() {
    const heroHeadline = document.getElementById('hero-headline');
    if (!heroHeadline) return;

    const headlines = [
        "Discover What Nigeria Is Building.",
        "Find Nigerian Tech Built for Your Needs.",
        "Explore the Technology Powering Nigeria."
    ];
    let currentIndex = 0;

    // Apply a CSS transition for smooth cross-fading
    heroHeadline.style.transition = 'opacity 0.5s ease-in-out';

    setInterval(() => {
        // Fade out
        heroHeadline.style.opacity = '0';
        
        setTimeout(() => {
            // Update text and fade back in
            currentIndex = (currentIndex + 1) % headlines.length;
            heroHeadline.textContent = headlines[currentIndex];
            heroHeadline.style.opacity = '1';
        }, 500); // Wait for the fade-out transition to complete
    }, 4000); // Rotate every 4 seconds
}

/* ==========================================================================
   Dark Mode Toggle
   ========================================================================== */
function initThemeToggle() {
    const themeToggles = [
        document.getElementById('theme-toggle'),
        document.getElementById('mobile-theme-toggle')
    ].filter(Boolean);
    if (!themeToggles.length) return;

    const savedTheme = localStorage.getItem('enovox_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);

    function applyTheme(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        document.querySelectorAll('.sun-icon').forEach(icon => {
            icon.style.display = isDark ? 'none' : 'block';
        });
        document.querySelectorAll('.moon-icon').forEach(icon => {
            icon.style.display = isDark ? 'block' : 'none';
        });
        themeToggles.forEach(toggle => {
            toggle.setAttribute('aria-pressed', String(isDark));
            toggle.classList.toggle('is-on', isDark);
        });
    }

    applyTheme(shouldUseDark);
    themeToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const isDark = !document.body.classList.contains('dark-mode');
            applyTheme(isDark);
            localStorage.setItem('enovox_theme', isDark ? 'dark' : 'light');
        });
    });
}

/* ==========================================================================
   Global Logged-In Nav State -- MOVED to nav-auth.js
   nav-auth.js is slot-based (.auth-login-slot / .auth-signup-slot) and
   covers BOTH the desktop .nav-actions links and the mobile slider pills,
   on every page. The old initAuthState() that lived here duplicated it
   (desktop only) and double-bound the Logout click handler, so it was
   removed. Every page that loads home.js also loads nav-auth.js.
   ========================================================================== */

/* ==========================================================================
   Backend Data Fetching & Card Generation
   ========================================================================== */
function loadGridData() {
    // 1. Newly Launched (Newest products)
    fetchProducts('/products/?sort=newest&limit=3', 'newly-launched-list');
    
    // The existing Popular categories column is populated from the live
    // highest-count category by initPopularCategories(), not a fixed category.

    // 2. Featured Products
    fetchProducts('/products/?featured=true&limit=3', 'featured-products-list');
}

/**
 * Homepage's three most populated categories. Keep the small pre-existing
 * "Popular categories" column in sync using the first three of the highest
 * category's six products, without a second request or a fixed category.
 */
async function initPopularCategories() {
    const tabs = document.getElementById('popular-category-tabs');
    const grid = document.getElementById('popular-category-grid');
    const seeAll = document.getElementById('popular-category-see-all');
    const announcement = document.getElementById('popular-category-announcement');
    if (!grid) return;
    if (!tabs || !seeAll) {
        throw new Error('Popular categories section is missing its tabs or See all link');
    }

    const preview = document.getElementById('popular-categories-list');
    const previewSeeAll = document.querySelector('#col-popular-categories .see-all');
    let categories = [];
    let topCategory = null;
    let activeCategory = null;
    let latestRequest = 0;
    let previewLoaded = false;

    function previewMessage(message) {
        if (!preview) return;
        const box = document.createElement('div');
        box.className = 'popular-preview-state';
        box.textContent = message;
        preview.replaceChildren(box);
    }

    function renderPreview(products) {
        if (!preview) return;
        if (!products.length) {
            previewMessage('More products coming soon!');
            return;
        }
        preview.replaceChildren(...products.slice(0, 3).map(createProductCard));
    }

    function showMessage(message, canRetry = false) {
        grid.setAttribute('aria-busy', 'false');
        const box = document.createElement('div');
        box.className = 'popular-products-state';
        const text = document.createElement('p');
        text.textContent = message;
        box.appendChild(text);
        if (canRetry && activeCategory) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'popular-retry-btn';
            retry.textContent = 'Try again';
            retry.addEventListener('click', () => selectCategory(activeCategory, true));
            box.appendChild(retry);
        }
        grid.replaceChildren(box);
        if (announcement) announcement.textContent = message;
    }

    function showSkeletons() {
        grid.setAttribute('aria-busy', 'true');
        grid.innerHTML = Array.from({ length: 6 }, () => `
            <div class="popular-card-skeleton" aria-hidden="true">
                <span class="popular-skeleton-logo"></span>
                <span class="popular-skeleton-line"></span>
                <span class="popular-skeleton-line short"></span>
                <span class="popular-skeleton-line"></span>
            </div>
        `).join('');
    }

    async function selectCategory(category, force = false) {
        if (category === activeCategory && !force) return;
        activeCategory = category;
        tabs.querySelectorAll('.popular-category-tab').forEach(tab => {
            const selected = tab.dataset.category === category;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected) grid.setAttribute('aria-labelledby', tab.id);
        });
        seeAll.href = `/explore?category=${encodeURIComponent(category)}`;
        seeAll.setAttribute('aria-label', `See all ${category} products`);
        seeAll.classList.remove('hidden');
        grid.scrollLeft = 0; // start the mobile carousel at the first product
        showSkeletons();
        if (announcement) announcement.textContent = `Loading ${category} products...`;
        const request = ++latestRequest;

        try {
            const response = await fetch(`${API_BASE_URL}/products/?category=${encodeURIComponent(category)}&limit=6`);
            if (!response.ok) throw new Error('Failed to fetch popular products');
            const products = await response.json();
            if (!Array.isArray(products)) throw new Error('Invalid popular products response');

            // Also update the older homepage preview. Do this even if the user
            // switched tabs while the first (top-category) request was pending.
            if (category === topCategory && !previewLoaded) {
                previewLoaded = true;
                renderPreview(products);
            }
            if (request !== latestRequest) return; // never display stale tab results

            if (!products.length) {
                showMessage(`No products in ${category} yet.`);
                return;
            }
            grid.replaceChildren(...products.slice(0, 6).map(createProductCard));
            grid.setAttribute('aria-busy', 'false');
            if (announcement) announcement.textContent = `Showing ${Math.min(products.length, 6)} ${category} products.`;
        } catch (error) {
            console.error(`Error loading popular products for ${category}:`, error);
            if (category === topCategory && !previewLoaded) previewMessage('Unable to load popular products.');
            if (request !== latestRequest) return;
            showMessage(`Couldn't load ${category} products right now.`, true);
        }
    }

    // Standard tablist keyboard navigation (three tabs stay in one row).
    tabs.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const current = Array.from(tabs.children).indexOf(document.activeElement);
        if (current < 0) return;
        event.preventDefault();
        let next = current;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = categories.length - 1;
        else next = (current + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length;
        tabs.children[next].focus();
        selectCategory(categories[next]);
    });

    previewMessage('Finding popular categories...');
    const countsUrl = `${API_BASE_URL}/products/categories/counts`;
    try {
        console.info('[popular categories] Requesting', countsUrl);
        const response = await fetch(countsUrl);
        if (!response.ok) throw new Error(`GET ${countsUrl} failed (HTTP ${response.status})`);
        const counts = await response.json();
        if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
            throw new Error('Invalid category counts response');
        }

        categories = Object.entries(counts)
            .filter(([name, count]) => name.trim() && typeof count === 'number' && Number.isFinite(count) && count >= 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
        if (!categories.length) {
            previewMessage('More products coming soon!');
            showMessage('No popular categories to show yet.');
            return;
        }

        topCategory = categories[0];
        if (previewSeeAll) {
            previewSeeAll.href = `/explore?category=${encodeURIComponent(topCategory)}`;
            previewSeeAll.setAttribute('aria-label', `See all ${topCategory} products`);
        }
        const buttons = categories.map((category, index) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.id = `popular-category-tab-${index}`;
            tab.className = 'popular-category-tab';
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', grid.id);
            tab.setAttribute('aria-selected', 'false');
            tab.tabIndex = -1;
            tab.dataset.category = category;
            tab.textContent = category;
            tab.title = category; // full name remains available when narrow tabs truncate
            tab.addEventListener('click', () => selectCategory(category));
            return tab;
        });
        tabs.replaceChildren(...buttons);
        tabs.classList.remove('hidden');
        selectCategory(topCategory);
    } catch (error) {
        console.error('[popular categories] Failed to load counts from ' + countsUrl + ':', error);
        previewMessage('Unable to load popular categories.');
        showMessage('Unable to load popular categories right now.');
    }
}

/**
 * Fetches products from the FastAPI backend and injects them into the specified container.
 */
async function fetchProducts(endpoint, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Temporary Loading State
    container.innerHTML = `
        <div style="padding: 1rem; color: var(--text-muted); font-size: 0.875rem; text-align: center;">
            Fetching data...
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) throw new Error('Failed to fetch data');
        
        const products = await response.json();

        // Empty State Fallback
        if (!products || products.length === 0) {
            container.innerHTML = `
                <div style="padding: 1rem; background-color: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-muted); font-size: 0.875rem; text-align: center;">
                    More products coming soon!
                </div>
            `;
            return;
        }

        // Clear container and append cards
        container.innerHTML = '';
        products.forEach(product => {
            const card = createProductCard(product);
            container.appendChild(card);
        });

    } catch (error) {
        console.error(`Error loading products for ${containerId}:`, error);
        // Error State Fallback
        container.innerHTML = `
            <div style="padding: 1rem; background-color: var(--bg-card); border: 1px solid #fee2e2; border-radius: 12px; color: #ef4444; font-size: 0.875rem; text-align: center;">
                Unable to load products. Is the backend running?
            </div>
        `;
    }
}

/**
 * Constructs the HTML DOM nodes for a single product card.
 */
function createProductCard(product) {
    // Determine logo or fallback character
    let logoHtml = '';
    if (product.logo_url) {
        logoHtml = `<img src="${product.logo_url}" alt="${product.name} Logo" class="product-logo" onerror="this.outerHTML='<div class=\\'product-logo\\'>${getInitials(product.name)}</div>'">`;
    } else {
        logoHtml = `<div class="product-logo">${getInitials(product.name)}</div>`;
    }

    const card = document.createElement('a');
    const safeCategoryClass = product.category.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
    // Note: The backend uses Jinja2 for /product/{slug} so we route directly there
    card.href = `/product/${product.slug}`;
    const bookmarkHtml = (window.EnovoxBookmarks ? window.EnovoxBookmarks.cardButtonHtml(product.id) : '');
    card.className = 'product-card';

    card.innerHTML = `
        <span class="card-explore-text">Explore</span>
        ${logoHtml}
        <div class="product-info">
            <h3 class="product-name">${escapeHTML(product.name)}</h3>
            <p class="product-desc" title="${escapeHTML(product.description)}">${escapeHTML(product.description)}</p>
            <span class="category-pill pill-${safeCategoryClass} pill-sm">${escapeHTML(product.category)}</span>
        </div>
        ${bookmarkHtml}
        <svg class="card-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
    `;

    return card;
}

/**
 * Helper: Gets the first letter of a string for the fallback logo.
 */
function getInitials(name) {
    if (!name) return 'E'; // Enovox fallback
    return name.charAt(0).toUpperCase();
}

/**
 * Helper: Basic HTML escaping to prevent XSS from user-submitted product data.
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

/* ==========================================================================
   Mobile Navigation Slider
   ========================================================================== */
function initHeaderNavigation() {
    const nav = document.getElementById('primary-navigation');
    const categoryLinks = document.getElementById('header-category-links');

    function createIconCircle(className, iconClass, accent, soft) {
        const circle = document.createElement('span');
        circle.className = className;
        circle.setAttribute('aria-hidden', 'true');
        circle.style.setProperty('--icon-accent', accent);
        circle.style.setProperty('--icon-soft', soft);
        const icon = document.createElement('i');
        icon.className = `fa-solid ${iconClass}`;
        circle.appendChild(icon);
        return circle;
    }

    if (nav) {
        const exploreIcons = {
            '/explore': { icon: 'fa-boxes-stacked', accent: '#2563eb', soft: 'rgba(37, 99, 235, 0.14)' },
            '/collection': { icon: 'fa-layer-group', accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.14)' },
            '/spotlight': { icon: 'fa-fire', accent: '#ea580c', soft: 'rgba(234, 88, 12, 0.16)' },
            '/alternative': { icon: 'fa-shuffle', accent: '#0f766e', soft: 'rgba(15, 118, 110, 0.14)' }
        };
        const exploreMenu = nav.querySelector('#header-explore-menu');
        if (exploreMenu) {
            exploreMenu.querySelectorAll('.nav-dropdown-item').forEach(item => {
                const route = (item.getAttribute('href') || '').split('?')[0].replace(/\/+$/, '') || '/';
                const visual = exploreIcons[route];
                const copy = item.querySelector('.nav-dropdown-item-copy');
                if (!visual || !copy || item.querySelector('.nav-menu-icon-circle')) return;
                item.insertBefore(createIconCircle('nav-menu-icon-circle', visual.icon, visual.accent, visual.soft), copy);
            });
        }

        const categoryTriggerIcon = nav.querySelector('[aria-controls="header-categories-menu"] .nav-trigger-icon');
        if (categoryTriggerIcon && !categoryTriggerIcon.parentElement.classList.contains('nav-category-trigger-icon')) {
            const circle = document.createElement('span');
            circle.className = 'nav-category-trigger-icon';
            circle.setAttribute('aria-hidden', 'true');
            categoryTriggerIcon.parentNode.insertBefore(circle, categoryTriggerIcon);
            circle.appendChild(categoryTriggerIcon);
        }
    }

    if (categoryLinks && typeof ENOVOX_CONFIG !== 'undefined' && Array.isArray(ENOVOX_CONFIG.CATEGORIES)) {
        const fragment = document.createDocumentFragment();
        ENOVOX_CONFIG.CATEGORIES.forEach(category => {
            const link = document.createElement('a');
            link.className = 'header-category-link';
            link.href = `/explore?category=${encodeURIComponent(category)}`;
            const visual = window.getEnovoxCategoryPresentation(category);
            link.appendChild(createIconCircle('nav-category-icon-circle', visual.icon, visual.accent, visual.soft));
            const label = document.createElement('span');
            label.className = 'header-category-label';
            label.textContent = category;
            link.appendChild(label);
            fragment.appendChild(link);
        });
        categoryLinks.replaceChildren(fragment);
    }

    const isDeveloper = !!localStorage.getItem('enovox_dev_token')
        && localStorage.getItem('enovox_account_type') === 'developer';
    document.documentElement.classList.toggle('is-developer-authenticated', isDeveloper);
    document.querySelectorAll('[data-developer-links]').forEach(section => { section.hidden = !isDeveloper; });
    document.querySelectorAll('[data-developer-guest]').forEach(section => { section.hidden = isDeveloper; });

    if (nav) {
        const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
        const alternativeLink = nav.querySelector('[data-alternative-nav]');
        if (alternativeLink && (pathname === '/alternative' || pathname.startsWith('/alternative/'))) {
            alternativeLink.classList.add('active');
            alternativeLink.setAttribute('aria-current', 'page');
        }

        const dropdowns = Array.from(nav.querySelectorAll('[data-nav-dropdown]'));
        function setDropdownOpen(dropdown, isOpen) {
            dropdown.classList.toggle('is-open', isOpen);
            const trigger = dropdown.querySelector('.nav-dropdown-trigger');
            if (trigger) trigger.setAttribute('aria-expanded', String(isOpen));
        }
        function closeDropdowns(except = null) {
            dropdowns.forEach(dropdown => {
                if (dropdown !== except) setDropdownOpen(dropdown, false);
            });
        }

        dropdowns.forEach(dropdown => {
            const trigger = dropdown.querySelector('.nav-dropdown-trigger');
            if (trigger) {
                trigger.addEventListener('click', event => {
                    event.stopPropagation();
                    const shouldOpen = !dropdown.classList.contains('is-open');
                    closeDropdowns();
                    setDropdownOpen(dropdown, shouldOpen);
                });
            }
            dropdown.addEventListener('pointerenter', () => {
                if (window.matchMedia('(min-width: 1280px)').matches) setDropdownOpen(dropdown, true);
            });
            dropdown.addEventListener('pointerleave', () => {
                if (window.matchMedia('(min-width: 1280px)').matches && !dropdown.contains(document.activeElement)) {
                    setDropdownOpen(dropdown, false);
                }
            });
            dropdown.addEventListener('focusout', event => {
                if (window.matchMedia('(min-width: 1280px)').matches && !dropdown.contains(event.relatedTarget)) {
                    setDropdownOpen(dropdown, false);
                }
            });
            dropdown.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => closeDropdowns());
            });
        });

        document.addEventListener('click', event => {
            if (!nav.contains(event.target)) closeDropdowns();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeDropdowns();
        });
    }
}

function initMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburger-menu');
    const navLinks = document.getElementById('primary-navigation');
    const closeBtn = document.getElementById('mobile-nav-close');
    const overlay = document.getElementById('nav-overlay');
    if (!hamburgerBtn || !navLinks) return;

    const mobileQuery = window.matchMedia('(max-width: 1279px)');
    function setMenuOpen(isOpen) {
        navLinks.classList.toggle('active-slider', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
        if (overlay) overlay.classList.toggle('is-visible', isOpen);
        document.body.classList.toggle('mobile-nav-open', isOpen);
        if (mobileQuery.matches) navLinks.setAttribute('aria-hidden', String(!isOpen));
        else navLinks.removeAttribute('aria-hidden');
        if (!isOpen) {
            navLinks.querySelectorAll('[data-nav-dropdown].is-open').forEach(dropdown => {
                dropdown.classList.remove('is-open');
                const trigger = dropdown.querySelector('.nav-dropdown-trigger');
                if (trigger) trigger.setAttribute('aria-expanded', 'false');
            });
        }
    }

    hamburgerBtn.addEventListener('click', event => {
        event.stopPropagation();
        setMenuOpen(!navLinks.classList.contains('active-slider'));
    });
    if (closeBtn) closeBtn.addEventListener('click', () => setMenuOpen(false));
    if (overlay) overlay.addEventListener('click', () => setMenuOpen(false));
    navLinks.addEventListener('click', event => {
        if (mobileQuery.matches && event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('click', event => {
        if (navLinks.classList.contains('active-slider')
            && !navLinks.contains(event.target)
            && !hamburgerBtn.contains(event.target)) {
            setMenuOpen(false);
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && navLinks.classList.contains('active-slider')) {
            setMenuOpen(false);
            hamburgerBtn.focus();
        }
    });
    const handleBreakpointChange = () => setMenuOpen(false);
    if (typeof mobileQuery.addEventListener === 'function') mobileQuery.addEventListener('change', handleBreakpointChange);
    else if (typeof mobileQuery.addListener === 'function') mobileQuery.addListener(handleBreakpointChange);
    setMenuOpen(false);
}
/* ==========================================================================
   Footer Newsletter Subscribe
   Wires #footer-subscribe-form (email input + Subscribe button) to
   POST /products/newsletter/subscribe -- confirmed backend contract:
     body:     {"email": "..."}
     response: {"message": "Subscribed successfully."}
               or {"message": "You're already subscribed."}
   Shows the returned message inline and clears the input on success.
   Inert on pages without the markup (e.g. the admin panel).
   ========================================================================== */
function initFooterSubscribe() {
    const form = document.getElementById('footer-subscribe-form');
    if (!form) return;
    const input = document.getElementById('footer-subscribe-email');
    const msgEl = document.getElementById('footer-subscribe-msg');
    const btn = form.querySelector('button[type="submit"]');
    if (!input || !btn) return;

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same pattern auth.js uses

    function showMsg(text, kind) {
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.className = kind ? `footer-subscribe-msg ${kind}` : 'footer-subscribe-msg';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = input.value.trim();
        if (!EMAIL_RE.test(email)) {
            showMsg('Please enter a valid email address.', 'error');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Subscribing...';
        showMsg('', '');

        try {
            const res = await fetch(`${API_BASE_URL}/products/newsletter/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                let detail = data.message || data.detail || '';
                if (Array.isArray(detail) && detail[0] && detail[0].msg) detail = detail[0].msg; // FastAPI 422
                throw new Error(detail || 'Could not subscribe right now. Please try again.');
            }
            showMsg(data.message || 'Subscribed successfully.', 'success');
            input.value = '';
        } catch (err) {
            showMsg(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

/* ==========================================================================
   Header "Subscribe" pill -- smooth-scrolls down to the footer subscribe
   box and focuses the email input. Inert on pages without the form (the
   native #footer-subscribe-form anchor remains as a fallback).
   ========================================================================== */
function initSubscribeHeaderButton() {
    document.querySelectorAll('.nav-subscribe-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const form = document.getElementById('footer-subscribe-form');
            if (!form) return;
            e.preventDefault();
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = document.getElementById('footer-subscribe-email');
            if (input) setTimeout(() => input.focus({ preventScroll: true }), 400);
        });
    });
}

/* ==========================================================================
   Animated Stats Counters
   Counts each .stat-number up from 0 to its data-target once, the first
   time the stats section scrolls into view. Never re-triggers, never loops.
   ========================================================================== */
(function () {
    const statNumbers = document.querySelectorAll('.stat-number');
    if (!statNumbers.length) return;

    const DURATION = 1600; // ms — tweak between 1000-2000 as desired
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function animateCounter(el) {
        const target = parseInt(el.getAttribute('data-target'), 10) || 0;
        const suffix = el.getAttribute('data-suffix') || '';

        if (prefersReducedMotion) {
            el.textContent = target + suffix;
            return;
        }

        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / DURATION, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.round(eased * target);

            el.textContent = current + suffix;

            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = target + suffix; // lock in the exact final value
            }
        }

        requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target); // fires once, never again
            }
        });
    }, { threshold: 0.4 });

    statNumbers.forEach(el => observer.observe(el));
})();
/* ==========================================================================
   FAQ Accordion — only one answer open at a time
   ========================================================================== */
(function () {
    const faqItems = document.querySelectorAll('.faq-item');
    if (!faqItems.length) return;

    faqItems.forEach(item => {
        item.addEventListener('toggle', () => {
            if (item.open) {
                faqItems.forEach(other => {
                    if (other !== item) other.open = false;
                });
            }
        });
    });
})();
/* ==========================================================================
   Floating "Report an issue" button (WhatsApp)
   Injected on every page that loads home.js — no per-page HTML needed.
   ========================================================================== */
function initReportIssueButton() {
    // EDIT THIS: your WhatsApp number, international format, digits only —
    // no "+", no spaces, no dashes. e.g. Nigerian number 0801 234 5678
    // becomes "2348012345678".
    const WHATSAPP_NUMBER = '2349025366010';

    if (document.getElementById('report-issue-btn')) return; // avoid double-injection

    const pageUrl = window.location.href;
    const message = `Hi, I have an issue on your site.\nPage: ${pageUrl}\nProblem: `;
    const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    const btn = document.createElement('a');
    btn.id = 'report-issue-btn';
    btn.href = waLink;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.setAttribute('aria-label', 'Report an issue on WhatsApp');
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.14.82.84-3.06-.2-.32a8.18 8.18 0 0 1-1.26-4.37c0-4.54 3.7-8.22 8.26-8.22zm-3.6 4.5c-.15 0-.4.06-.61.3-.21.24-.8.78-.8 1.9s.82 2.2.93 2.35c.12.15 1.6 2.5 3.9 3.4 1.9.75 2.29.6 2.7.56.42-.04 1.35-.55 1.54-1.08.19-.53.19-.98.13-1.08-.06-.1-.21-.15-.44-.27-.23-.12-1.35-.67-1.56-.74-.21-.08-.36-.12-.51.12-.15.23-.58.74-.71.9-.13.15-.26.17-.49.06-.23-.12-.96-.36-1.83-1.14-.68-.6-1.14-1.35-1.27-1.58-.13-.23-.01-.35.1-.47.1-.1.23-.26.35-.4.11-.13.15-.23.23-.38.08-.15.04-.29-.02-.4-.06-.12-.51-1.26-.71-1.72-.18-.44-.37-.38-.51-.39z"/></svg>
        <span class="report-issue-text">Report an issue</span>
    `;

    document.body.appendChild(btn);
    initReportIssueScrollExpand();
}

document.addEventListener('DOMContentLoaded', initReportIssueButton);
function initReportIssueScrollExpand() {
    const btn = document.getElementById('report-issue-btn');
    if (!btn) return;

    let lastScrollY = window.scrollY;
    let collapseTimer = null;

    window.addEventListener('scroll', () => {
        if (window.innerWidth > 600) return; // desktop already reveals text on hover

        const currentScrollY = window.scrollY;
        const scrollingUp = currentScrollY < lastScrollY;
        lastScrollY = currentScrollY;

        if (scrollingUp) {
            btn.classList.add('expanded');
            clearTimeout(collapseTimer);
            collapseTimer = setTimeout(() => {
                btn.classList.remove('expanded');
            }, 1500);
        }
    }, { passive: true });
}
/* ==========================================================================
   Site-wide Announcement Banner
   GET /products/banner -> { is_active, message, link_url, link_text,
                             is_marquee, updated_at }
   Dismissal is stored in localStorage as 'dismissed_banner' = updated_at.
   A changed updated_at (admin published new content) shows it again.
   Skipped entirely on admin pages and on pages without the banner markup.
   ========================================================================== */
async function initSiteBanner() {
    const banner = document.getElementById('site-banner');
    if (!banner) return;
    if (window.location.pathname.startsWith('/admin')) return;

    const textEl = document.getElementById('site-banner-text');
    const linkEl = document.getElementById('site-banner-link');
    const trackEl = document.getElementById('site-banner-track');
    const closeBtn = document.getElementById('site-banner-close');
    if (!textEl || !linkEl || !trackEl || !closeBtn) return;

    const root = document.documentElement;

    function setOffset() {
        root.style.setProperty('--banner-h', banner.classList.contains('hidden') ? '0px' : banner.offsetHeight + 'px');
    }

    function hideBanner() {
        banner.classList.add('hidden');
        setOffset();
    }

    function safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage blocked; dismiss just won't persist */ }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/products/banner`);
        if (!res.ok) return;
        const data = await res.json();

        if (!data || !data.is_active || !data.message) return;

        const version = String(data.updated_at || '');
        if (version && safeGet('dismissed_banner') === version) return; // already dismissed, no new content

        // Build content (textContent = XSS-safe for admin-entered text)
        textEl.textContent = data.message;

        const linkUrl = typeof data.link_url === 'string' ? data.link_url.trim() : '';
        const safeLink = /^(https?:\/\/|\/)/i.test(linkUrl);

        if (linkUrl && data.link_text && safeLink) {
            linkEl.href = linkUrl;
            linkEl.textContent = data.link_text;

            // Same-site paths open in the same tab; external links in a new one
            if (linkUrl.startsWith('/')) {
                linkEl.removeAttribute('target');
            } else {
                linkEl.target = '_blank';
            }

            // Style: 'text' = underlined text, anything else = button (default)
            linkEl.classList.toggle('is-text', data.link_style === 'text');
            linkEl.classList.remove('hidden');
        } else {
            linkEl.classList.add('hidden');
        }

        banner.classList.toggle('is-marquee', !!data.is_marquee);
        banner.classList.remove('hidden');

        // Marquee speed: roughly constant px/sec regardless of message length
        if (data.is_marquee) {
            const distance = trackEl.scrollWidth + banner.offsetWidth;
            const seconds = Math.max(12, Math.round(distance / 60));
            trackEl.style.setProperty('--marquee-duration', seconds + 's');
        }

        setOffset();
        window.addEventListener('resize', setOffset);

        closeBtn.addEventListener('click', () => {
            if (version) safeSet('dismissed_banner', version);
            hideBanner();
        });
    } catch (err) {
        console.error('Banner load failed:', err);
        // Fail silently: a broken banner call must never affect the page
    }
}

/* ==========================================================================
   Bookmarks / Saved Products (site-wide) -- window.EnovoxBookmarks
   GET  /products/me/saved           -> array of saved product objects
   POST /products/{product_id}/save  -> { message, saved: true|false }
   (401 "Please log in to save products" when unauthenticated.)

   Powers three things, all fed from one saved-id set:
   1. Header bookmark control (visible only when logged in, Developer or
      User) with a desktop dropdown (<=768px = mobile: bottom sheet instead).
      Both containers share the exact same list/card markup and empty state;
      only the presentation differs. Both fetch /products/me/saved on open.
   2. Per-card bookmark toggles rendered by explore.js (Explore grid) and
      createProductCard() below (homepage Featured / Newly Launched /
      Popular) via EnovoxBookmarks.cardButtonHtml(product.id).
   3. The product detail page toggle (product.html #bookmark-product-btn,
      next to the share icon) -- same .bookmark-toggle[data-product-id]
      hook, handled by the delegated click listener below.

   On page load (logged-in only) the saved list is fetched once and every
   toggle's filled/outline state is synced from it. Toggling flips the icon
   instantly from the POST response -- no reload.

   Logged-out gating: clicking a bookmark icon while logged out opens a
   popover with a clickable "Log in" link to /login -- no forced redirect.
   Hovering any bookmark icon shows a small tooltip ("Save this to your
   list"; the header icon reads "Saved product") in that same shared box.
   ========================================================================== */
window.EnovoxBookmarks = (function () {
    'use strict';

    // Same localStorage keys product.js uses for the auth session.
    const TOKEN_KEY = 'enovox_dev_token';
    // Matches the app's mobile breakpoint (hamburger nav / stacked layouts).
    const MOBILE_MQ = '(max-width: 768px)'; // same breakpoint as the hamburger nav
    // Hover tooltip / logged-out prompt targets: card + product toggles and the header icon.
    const TIP_TARGETS = '.bookmark-toggle[data-product-id], #nav-bookmark-btn';

    let savedIds = new Set();   // String(product.id) -> true
    let panelMode = null;       // 'dropdown' | 'sheet' | null
    let panelWasMobile = false;
    let tipMode = null;        // 'hover' | 'prompt' | null
    let tipAnchor = null;      // element the tip is currently pointed at
    let wired = false;
    const inflight = new Set(); // product ids with a toggle request in flight

    /* ---------- auth ---------- */
    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
    }

    function isLoggedIn() {
        return !!getToken(); // a stored Bearer token covers both Developer and User accounts
    }

    /* ---------- hover tooltip + logged-out prompt ----------
       One shared fixed-position box (#bookmark-tip) serves both the hover
       tooltip and the logged-out click prompt, so their styling and
       alignment are identical. positionTip() centers the box above the
       icon, flips it below when there is no room above, and clamps it to
       the viewport (with the arrow still tracking the icon center) so it
       never gets cut off at screen edges -- including cards hard against
       the edge. */

    function getTipEl() {
        return document.getElementById('bookmark-tip');
    }

    function hoverCapable() {
        try { return window.matchMedia('(hover: hover)').matches; } catch (e) { return true; }
    }

    function hoverTextFor(el) {
        return el.id === 'nav-bookmark-btn' ? 'Saved product' : 'Save this to your list';
    }

    function showTip(anchor, html, mode) {
        const tip = getTipEl();
        if (!tip || !anchor) return;
        tip.innerHTML = html;
        tip.classList.toggle('is-prompt', mode === 'prompt');
        tip.classList.remove('bm-tip--below');
        tip.classList.remove('hidden');
        tipAnchor = anchor;
        tipMode = mode;
        positionTip(anchor);
    }

    function hideTip(force) {
        if (tipMode === 'prompt' && !force) return; // hover-outs must not kill the prompt
        const tip = getTipEl();
        if (tip) tip.classList.add('hidden');
        tipAnchor = null;
        tipMode = null;
    }

    function showPrompt(anchor) {
        showTip(anchor, '<a class="bm-tip-link" href="/login">Log in</a> to bookmark this', 'prompt');
    }

    function positionTip(anchor) {
        const tip = getTipEl();
        if (!tip || tip.classList.contains('hidden') || !anchor) return;
        const r = anchor.getBoundingClientRect();
        tip.style.left = '0px';
        tip.style.top = '0px';
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        const GAP = 8;
        const EDGE = 8;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        // Prefer sitting above the icon (never covers its own card); flip
        // below only when that would clip off the top of the viewport.
        let top = r.top - th - GAP;
        let below = false;
        if (top < EDGE) {
            top = r.bottom + GAP;
            below = true;
        }
        if (below && top + th > vh - EDGE) {
            const aboveTop = r.top - th - GAP;
            if (aboveTop >= EDGE) { top = aboveTop; below = false; }
        }

        let left = r.left + r.width / 2 - tw / 2;
        left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - tw - EDGE));

        tip.classList.toggle('bm-tip--below', below);
        // Arrow keeps pointing at the icon center even when the box had to
        // slide sideways to stay on screen.
        const arrowX = Math.min(Math.max(12, r.left + r.width / 2 - left), Math.max(12, tw - 12));
        tip.style.setProperty('--tip-arrow-x', arrowX + 'px');
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
    }

    function repositionTip() {
        if (!tipMode) return;
        if (!tipAnchor || !tipAnchor.isConnected) { hideTip(true); return; }
        positionTip(tipAnchor);
    }

    /* ---------- saved-state bookkeeping ---------- */
    function isSaved(productId) {
        return savedIds.has(String(productId));
    }

    function rememberSavedList(products) {
        savedIds = new Set((products || []).map(p => String(p.id)));
    }

    function syncButton(btn) {
        if (!btn || !btn.dataset.productId) return;
        const saved = isSaved(btn.dataset.productId);
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        const icon = btn.querySelector('.bm-icon');
        if (icon) {
            icon.classList.toggle('fa-solid', saved);
            icon.classList.toggle('fa-regular', !saved);
        }
    }

    function syncAll() {
        document.querySelectorAll('.bookmark-toggle[data-product-id]').forEach(syncButton);
    }

    /* ---------- markup ---------- */
    // Small outline/filled bookmark button for product cards. Cards are <a>
    // links, so the delegated click handler below prevents navigation and
    // stops propagation on this button.
    function cardButtonHtml(productId) {
        const saved = isSaved(productId);
        const iconCls = saved ? 'fa-solid' : 'fa-regular';
        return `<button type="button" class="card-bookmark-btn bookmark-toggle${saved ? ' is-saved' : ''}" data-product-id="${productId}" aria-label="Save this product" aria-pressed="${saved}"><i class="${iconCls} fa-bookmark bm-icon"></i></button>`;
    }

    function truncateText(str, maxLength) {
        if (!str) return '';
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }

    // Compact clickable row: logo, name, ~60-char description.
    function savedItemHtml(product) {
        const name = escapeHTML(product.name || '');
        const desc = escapeHTML(truncateText(product.description || '', 60));
        const initial = escapeHTML((product.name || 'E').charAt(0).toUpperCase());
        const logo = product.logo_url
            ? `<img src="${escapeHTML(product.logo_url)}" alt="${name} logo" class="saved-item-logo">`
            : `<div class="saved-item-logo saved-item-fallback">${initial}</div>`;
        return `<a class="saved-item" href="/product/${product.slug}">${logo}` +
            `<div class="saved-item-info"><span class="saved-item-name">${name}</span>` +
            `<span class="saved-item-desc">${desc}</span></div></a>`;
    }

    function renderSavedList(container, products) {
        if (!container) return;
        if (!products || products.length === 0) {
            container.innerHTML = '<p class="saved-empty">No saved tools yet.</p>';
            return;
        }
        container.innerHTML = products.map(savedItemHtml).join('');
    }

    // Header control + desktop dropdown + mobile bottom sheet. Injected on
    // every page that loads home.js (same approach as the report-issue
    // button), so the header feature is identical site-wide without
    // per-page HTML edits. Hidden until we see a logged-in session.
    const PANEL_MARKUP = `
<div class="nav-bookmark-wrap hidden" id="nav-bookmark-wrap">
    <button type="button" id="nav-bookmark-btn" class="icon-btn nav-bookmark-btn" aria-label="Saved tools" aria-expanded="false" aria-haspopup="true">
        <i class="fa-regular fa-bookmark"></i>
    </button>
    <div id="saved-dropdown" class="saved-dropdown hidden" role="dialog" aria-label="Saved tools">
        <div class="saved-panel-header">
            <span class="saved-panel-title">Saved Tools</span>
            <button type="button" id="saved-dropdown-close" class="saved-close-btn" aria-label="Close saved tools">&times;</button>
        </div>
        <div id="saved-dropdown-list" class="saved-list"></div>
    </div>
</div>
<div id="saved-sheet-overlay" class="saved-sheet-overlay" aria-hidden="true">
    <div id="saved-sheet" class="saved-sheet" role="dialog" aria-modal="true" aria-label="Saved tools">
        <div class="saved-sheet-grab" id="saved-sheet-grab">
            <div class="saved-sheet-handle"></div>
            <div class="saved-panel-header">
                <span class="saved-panel-title">Saved Tools</span>
                <button type="button" id="saved-sheet-close" class="saved-close-btn" aria-label="Close saved tools">&times;</button>
            </div>
        </div>
        <div id="saved-sheet-list" class="saved-list saved-list-sheet"></div>
    </div>
</div>
<div id="bookmark-tip" class="bm-tip hidden" role="tooltip"></div>
`;

    function injectHeaderUI() {
        const navActions = document.querySelector('.nav-actions');
        if (!navActions || document.getElementById('nav-bookmark-wrap')) return;

        const host = document.createElement('div');
        host.innerHTML = PANEL_MARKUP;
        const wrap = host.querySelector('#nav-bookmark-wrap');
        const overlay = host.querySelector('#saved-sheet-overlay');
        const tipEl = host.querySelector('#bookmark-tip');

        // Park the control right after the header search icon (fall back to
        // just before the hamburger).
        const searchBtn = navActions.querySelector('.icon-btn[aria-label="Search"]');
        const burger = document.getElementById('hamburger-menu');
        if (searchBtn && searchBtn.nextSibling) {
            navActions.insertBefore(wrap, searchBtn.nextSibling);
        } else if (burger) {
            navActions.insertBefore(wrap, burger);
        } else {
            navActions.appendChild(wrap);
        }
        document.body.appendChild(overlay);
        if (tipEl) document.body.appendChild(tipEl);

        // Visible only when logged in (Developer or User).
        if (isLoggedIn()) wrap.classList.remove('hidden');
    }

    /* ---------- API ---------- */
    async function fetchSaved() {
        const token = getToken();
        if (!token) throw new Error('Not logged in');
        const res = await fetch(`${API_BASE_URL}/products/me/saved`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) throw new Error('Session expired');
        if (!res.ok) throw new Error('Failed to load saved products');
        return res.json();
    }

    async function preloadSavedIds() {
        try {
            rememberSavedList(await fetchSaved());
        } catch (err) {
            console.error('[bookmarks] saved list preload failed:', err);
        }
        syncAll();
    }

    async function toggleSave(productId, btn) {
        const id = String(productId);
        if (!id || inflight.has(id)) return;
        const token = getToken();
        if (!token) { showPrompt(btn); return; }

        inflight.add(id);
        try {
            const res = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(id)}/save`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) { showPrompt(btn); return; }
            if (!res.ok) throw new Error(data.detail || data.message || 'Could not update saved products');

            if (data.saved) savedIds.add(id);
            else savedIds.delete(id);
            syncAll(); // instant outline <-> filled flip, no reload
            if (panelMode) refreshList(); // keep an open dropdown/sheet in step
        } catch (err) {
            console.error('[bookmarks] toggle failed:', err);
        } finally {
            inflight.delete(id);
        }
    }

    /* ---------- dropdown + bottom sheet ---------- */
    function activeList() {
        return panelMode === 'sheet'
            ? document.getElementById('saved-sheet-list')
            : document.getElementById('saved-dropdown-list');
    }

    async function refreshList() {
        const mode = panelMode;
        if (!mode) return;
        const list = activeList();
        if (list) list.innerHTML = '<p class="saved-empty">Loading saved tools...</p>';
        try {
            const products = await fetchSaved();
            rememberSavedList(products); // same payload also refreshes card states
            syncAll();
            if (panelMode !== mode) return; // panel closed/swapped while fetching
            renderSavedList(activeList(), products);
        } catch (err) {
            console.error('[bookmarks] saved list load failed:', err);
            if (panelMode !== mode) return;
            const target = activeList();
            if (target) target.innerHTML = '<p class="saved-empty">Couldn\'t load saved tools.</p>';
        }
    }

    function openPanel() {
        hideTip(true);
        if (!isLoggedIn()) { showPrompt(document.getElementById('nav-bookmark-btn')); return; }
        const isMobile = window.matchMedia(MOBILE_MQ).matches;
        closePanels(true);
        panelMode = isMobile ? 'sheet' : 'dropdown';
        panelWasMobile = isMobile;

        if (panelMode === 'sheet') {
            const overlay = document.getElementById('saved-sheet-overlay');
            const sheet = document.getElementById('saved-sheet');
            if (sheet) sheet.style.transform = '';
            if (overlay) {
                overlay.classList.add('open');
                overlay.setAttribute('aria-hidden', 'false');
            }
            document.body.style.overflow = 'hidden';
        } else {
            const dropdown = document.getElementById('saved-dropdown');
            const btn = document.getElementById('nav-bookmark-btn');
            if (dropdown) dropdown.classList.remove('hidden');
            if (btn) btn.setAttribute('aria-expanded', 'true');
        }
        refreshList(); // fetch /products/me/saved on open
    }

    function closePanels(silent) {
        const dropdown = document.getElementById('saved-dropdown');
        const overlay = document.getElementById('saved-sheet-overlay');
        const sheet = document.getElementById('saved-sheet');
        const btn = document.getElementById('nav-bookmark-btn');
        if (dropdown) dropdown.classList.add('hidden');
        if (overlay) {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (sheet) sheet.style.transform = '';
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        if (!silent) panelMode = null;
    }

    // Swipe-down dismissal from the sheet's grab zone (drag handle + header).
    // The list below scrolls normally and is deliberately not a drag surface.
    function attachSheetDrag() {
        const grab = document.getElementById('saved-sheet-grab');
        const sheet = document.getElementById('saved-sheet');
        if (!grab || !sheet) return;
        let startY = null;
        let dy = 0;

        grab.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            dy = 0;
            sheet.style.transition = 'none';
        }, { passive: true });

        grab.addEventListener('touchmove', (e) => {
            if (startY === null) return;
            dy = Math.max(0, e.touches[0].clientY - startY);
            sheet.style.transform = `translateY(${dy}px)`;
        }, { passive: true });

        const endDrag = () => {
            sheet.style.transition = '';
            sheet.style.transform = '';
            if (dy > 80) closePanels();
            startY = null;
            dy = 0;
        };
        grab.addEventListener('touchend', endDrag);
        grab.addEventListener('touchcancel', endDrag);
    }

    function wireEvents() {
        if (wired) return;
        wired = true;

        // Delegated toggle handling for every bookmark button (all product
        // cards + the product detail page). Cards are <a> links, so swallow
        // the click completely: never navigate, never bubble into the card.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest && e.target.closest('.bookmark-toggle[data-product-id]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleSave(btn.dataset.productId, btn);
        });

        // Hover tooltip (fine pointers only, i.e. desktop). The header icon
        // reads "Saved product"; every other bookmark icon reads
        // "Save this to your list".
        document.addEventListener('mouseover', (e) => {
            if (tipMode === 'prompt' || panelMode || !hoverCapable()) return;
            const el = e.target.closest && e.target.closest(TIP_TARGETS);
            if (!el) return;
            if (e.relatedTarget && el.contains(e.relatedTarget)) return;
            showTip(el, hoverTextFor(el), 'hover');
        });
        document.addEventListener('mouseout', (e) => {
            if (tipMode !== 'hover') return;
            const el = e.target.closest && e.target.closest(TIP_TARGETS);
            if (!el) return;
            if (e.relatedTarget && el.contains(e.relatedTarget)) return;
            hideTip();
        });

        // The logged-out prompt is a popover: dismiss on outside click.
        document.addEventListener('click', (e) => {
            if (tipMode !== 'prompt') return;
            if (e.target.closest && e.target.closest('.bm-tip, .bookmark-toggle, #nav-bookmark-btn')) return;
            hideTip(true);
        });

        const openBtn = document.getElementById('nav-bookmark-btn');
        if (openBtn) openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panelMode) closePanels();
            else openPanel();
        });

        const dropdownClose = document.getElementById('saved-dropdown-close');
        if (dropdownClose) dropdownClose.addEventListener('click', () => closePanels());

        const sheetClose = document.getElementById('saved-sheet-close');
        if (sheetClose) sheetClose.addEventListener('click', () => closePanels());

        // Desktop dropdown: clicking outside closes it.
        document.addEventListener('click', (e) => {
            if (panelMode !== 'dropdown') return;
            const wrap = document.getElementById('nav-bookmark-wrap');
            if (wrap && !wrap.contains(e.target)) closePanels();
        });

        // Mobile sheet: tapping the backdrop closes it.
        const overlay = document.getElementById('saved-sheet-overlay');
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePanels();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (panelMode) closePanels();
            hideTip(true);
        });

        window.addEventListener('scroll', repositionTip, { passive: true });
        window.addEventListener('resize', repositionTip);

        // One container is display:none once the viewport crosses the
        // breakpoint -- dismiss rather than leave a ghost panel behind.
        window.addEventListener('resize', () => {
            if (!panelMode) return;
            const isMobile = window.matchMedia(MOBILE_MQ).matches;
            if (isMobile !== panelWasMobile) closePanels();
        });

        attachSheetDrag();
    }

    function init() {
        injectHeaderUI();
        wireEvents();
        if (isLoggedIn()) preloadSavedIds(); // one saved-list fetch per page load
    }

    return {
        init,
        isSaved,
        cardButtonHtml,
        syncButton,
        syncAll,
        toggleSave
    };
})();
