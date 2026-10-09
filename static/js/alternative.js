(() => {
    'use strict';

    const API_URL = '/products/alternatives/foreign-tools';
    const AUTOCOMPLETE_URL = '/products/alternatives/foreign-tools/autocomplete';
    const PAGE_SIZE = 12;
    const CATEGORY_PREVIEW_SIZE = 6;

    const searchInput = document.getElementById('foreign-tool-search');
    const searchWrapper = document.querySelector('.foreign-tool-search-wrapper');
    const suggestionsPanel = document.getElementById('foreign-tool-suggestions');
    const grid = document.getElementById('alternative-tools-grid');
    const emptyState = document.getElementById('foreign-tools-empty');
    const status = document.getElementById('foreign-tools-status');
    const categoryOptionsContainer = document.getElementById('dynamic-category-filters');
    const filterForm = document.getElementById('filter-form');
    const filterSidebar = document.getElementById('foreign-tools-filter-sidebar');
    const filterHeader = filterSidebar && filterSidebar.querySelector('.filters-header');
    const clearFiltersButton = document.getElementById('clear-filters');
    const sortSelect = document.getElementById('foreign-tools-sort');
    const showMoreButton = document.getElementById('foreign-tools-show-more');
    const showMoreLabel = document.getElementById('foreign-tools-show-more-label');

    if (!searchInput || !suggestionsPanel || !grid || !categoryOptionsContainer) return;

    let tools = [];
    let categoryOptions = [];
    let selectedCategory = '';
    let selectedSort = 'count';
    let expanded = false;
    let dataPromise = null;
    let searchTimer = null;
    let searchRequest = null;
    let searchSequence = 0;
    let categoryListExpanded = false;

    const normalizeCategory = (value) => {
        const normalized = String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
        const aliases = {
            'design & creatives': 'design & creative',
            'energy & utility': 'energy & utilities',
            'energy and utility': 'energy & utilities',
            'arts & entertainment': 'arts and entertainment'
        };
        return aliases[normalized] || normalized;
    };

    const getToolSlug = (tool) => String(tool.slug || tool.foreign_tool_slug || tool.product_slug || '').trim();
    const getToolName = (tool) => String(tool.name || tool.foreign_tool_name || tool.product_name || 'Untitled product').trim();
    const getToolLogo = (tool) => String(tool.logo_url || tool.logo || tool.image_url || tool.icon || '').trim();
    const getToolCategory = (tool) => String(tool.category || tool.category_name || '').trim();
    const getAlternativeCount = (tool) => {
        const number = Number(tool.alternative_count ?? tool.alternatives_count ?? tool.count ?? 0);
        return Number.isFinite(number) ? number : 0;
    };
    const getToolDate = (tool) => tool.created_at || tool.createdAt || tool.date_added || tool.dateAdded || tool.added_at || '';

    function unwrapTools(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];
        if (Array.isArray(payload.tools)) return payload.tools;
        if (Array.isArray(payload.foreign_tools)) return payload.foreign_tools;
        if (Array.isArray(payload.products)) return payload.products;
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.suggestions)) return payload.suggestions;
        if (Array.isArray(payload.results)) return payload.results;
        if (Array.isArray(payload.data)) return payload.data;
        if (payload.data && Array.isArray(payload.data.tools)) return payload.data.tools;
        if (payload.data && Array.isArray(payload.data.foreign_tools)) return payload.data.foreign_tools;
        if (payload.data && Array.isArray(payload.data.products)) return payload.data.products;
        if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
        if (payload.data && Array.isArray(payload.data.suggestions)) return payload.data.suggestions;
        return [];
    }

    function normalizeTool(rawTool, index) {
        const raw = rawTool && typeof rawTool === 'object' ? rawTool : {};
        return {
            ...raw,
            slug: getToolSlug(raw),
            name: getToolName(raw),
            logo_url: getToolLogo(raw),
            category: getToolCategory(raw),
            alternative_count: getAlternativeCount(raw),
            _fetchedIndex: index
        };
    }

    function getConfiguredCategories() {
        try {
            if (typeof ENOVOX_CONFIG !== 'undefined' && Array.isArray(ENOVOX_CONFIG.CATEGORIES)) {
                return ENOVOX_CONFIG.CATEGORIES.map((item) => {
                    if (typeof item === 'string') return { label: item.trim(), value: item.trim() };
                    if (!item || typeof item !== 'object') return null;
                    const label = String(item.label || item.name || item.title || item.value || '').trim();
                    const value = String(item.value || item.slug || item.name || item.label || '').trim();
                    return label && value ? { label, value } : null;
                }).filter(Boolean);
            }
        } catch (error) {
            console.warn('Could not read configured categories.', error);
        }
        return [];
    }

    function buildCategoryOptions() {
        return getConfiguredCategories();
    }

    function createCategoryInput(option, index) {
        const label = document.createElement('label');
        label.className = 'custom-checkbox';
        label.htmlFor = `foreign-category-${index}`;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'category';
        input.id = `foreign-category-${index}`;
        input.value = option.value;
        input.checked = normalizeCategory(option.value) === normalizeCategory(selectedCategory);
        input.setAttribute('aria-label', option.label);

        const checkmark = document.createElement('span');
        checkmark.className = 'checkmark';
        checkmark.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.className = 'foreign-category-label';
        text.textContent = option.label;

        label.append(input, checkmark, text);
        return label;
    }

    function renderCategoryOptions() {
        if (!categoryOptionsContainer) return;
        categoryOptionsContainer.replaceChildren();
        const allOptions = [{ label: 'All Categories', value: '' }, ...categoryOptions];
        allOptions.forEach((option, index) => {
            const optionLabel = createCategoryInput(option, index);
            if (index > CATEGORY_PREVIEW_SIZE) {
                optionLabel.classList.add('foreign-category-collapsed');
                optionLabel.hidden = !categoryListExpanded;
            }
            categoryOptionsContainer.appendChild(optionLabel);
        });

        if (categoryOptions.length > CATEGORY_PREVIEW_SIZE) {
            const moreButton = document.createElement('button');
            moreButton.type = 'button';
            moreButton.className = 'see-more-btn foreign-category-see-more';

            const updateMoreButton = () => {
                moreButton.classList.toggle('expanded', categoryListExpanded);
                moreButton.setAttribute('aria-expanded', String(categoryListExpanded));
                moreButton.replaceChildren(document.createTextNode(categoryListExpanded ? 'See less' : 'See all'));
                const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                chevron.setAttribute('viewBox', '0 0 24 24');
                chevron.setAttribute('fill', 'none');
                chevron.setAttribute('stroke', 'currentColor');
                chevron.setAttribute('stroke-width', '2');
                chevron.setAttribute('stroke-linecap', 'round');
                chevron.setAttribute('stroke-linejoin', 'round');
                chevron.setAttribute('aria-hidden', 'true');
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                arrow.setAttribute('points', '6 9 12 15 18 9');
                chevron.appendChild(arrow);
                moreButton.appendChild(chevron);
            };

            updateMoreButton();
            moreButton.addEventListener('click', () => {
                categoryListExpanded = !categoryListExpanded;
                categoryOptionsContainer.querySelectorAll('.foreign-category-collapsed').forEach((option) => {
                    option.hidden = !categoryListExpanded;
                });
                updateMoreButton();
            });
            categoryOptionsContainer.appendChild(moreButton);
        }

        if (categoryOptions.length === 0) {
            const note = document.createElement('span');
            note.className = 'filter-loading';
            note.textContent = 'No categories available';
            categoryOptionsContainer.appendChild(note);
        }
    }

    function readCategoryFromUrl() {
        const requested = new URLSearchParams(window.location.search).get('category') || '';
        if (!requested) return '';
        const match = categoryOptions.find((option) => normalizeCategory(option.value) === normalizeCategory(requested) || normalizeCategory(option.label) === normalizeCategory(requested));
        return match ? match.value : '';
    }

    function updateCategoryUrl(category, replace = false) {
        const url = new URL(window.location.href);
        if (category) url.searchParams.set('category', category);
        else url.searchParams.delete('category');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextUrl === currentUrl) return;
        if (replace) window.history.replaceState({ category }, '', nextUrl);
        else window.history.pushState({ category }, '', nextUrl);
    }

    function parseDate(tool) {
        const value = getToolDate(tool);
        if (!value) return null;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function getSortedTools() {
        const filtered = selectedCategory
            ? tools.filter((tool) => normalizeCategory(tool.category) === normalizeCategory(selectedCategory))
            : tools.slice();

        if (selectedSort === 'az') {
            return filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        }
        if (selectedSort === 'newest') {
            return filtered.sort((a, b) => {
                const aDate = parseDate(a);
                const bDate = parseDate(b);
                if (aDate !== null && bDate !== null && aDate !== bDate) return bDate - aDate;
                if (aDate !== null && bDate === null) return -1;
                if (aDate === null && bDate !== null) return 1;
                return b._fetchedIndex - a._fetchedIndex;
            });
        }
        return filtered.sort((a, b) => b.alternative_count - a.alternative_count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    function safeLogoUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(value, window.location.origin);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
            return url.href;
        } catch (error) {
            return '';
        }
    }

    function createLogo(tool, compact = false) {
        const logoUrl = safeLogoUrl(tool.logo_url);
        const holder = document.createElement('span');
        holder.className = compact ? 'foreign-tool-logo foreign-tool-logo-compact' : 'foreign-tool-logo';
        holder.setAttribute('aria-hidden', 'true');
        if (logoUrl) {
            const image = document.createElement('img');
            image.src = logoUrl;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                const initial = document.createElement('span');
                initial.className = 'foreign-tool-logo-fallback';
                initial.textContent = tool.name.trim().charAt(0).toLocaleUpperCase() || '?';
                holder.replaceChildren(initial);
                holder.classList.add('has-logo-fallback');
            }, { once: true });
            holder.appendChild(image);
        } else {
            const initial = document.createElement('span');
            initial.className = 'foreign-tool-logo-fallback';
            initial.textContent = tool.name.trim().charAt(0).toLocaleUpperCase() || '?';
            holder.appendChild(initial);
            holder.classList.add('has-logo-fallback');
        }
        return holder;
    }

    function getCategoryPillClass(category) {
        return normalizeCategory(category)
            .replace(/\s*&\s*/g, '-')
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'other';
    }

    function createToolCard(tool) {
        const anchor = document.createElement('a');
        anchor.className = 'foreign-tool-card';
        anchor.href = `/alternative/${encodeURIComponent(tool.slug)}`;
        anchor.title = tool.name;

        const alternativeLabel = tool.alternative_count === 1 ? 'Alternative' : 'Alternatives';
        anchor.setAttribute('aria-label', `${tool.name}, ${tool.alternative_count} ${alternativeLabel}`);

        const identity = document.createElement('span');
        identity.className = 'foreign-tool-card-identity';
        identity.appendChild(createLogo(tool));

        const copy = document.createElement('span');
        copy.className = 'foreign-tool-card-copy';

        const heading = document.createElement('span');
        heading.className = 'foreign-tool-card-heading';

        const name = document.createElement('span');
        name.className = 'foreign-tool-card-name';
        name.textContent = tool.name;

        const count = document.createElement('span');
        count.className = 'foreign-tool-card-count';
        count.textContent = `${tool.alternative_count} ${alternativeLabel}`;
        heading.append(name, count);
        copy.appendChild(heading);

        if (tool.category) {
            const category = document.createElement('span');
            const fullCategoryName = String(tool.category).trim();
            const truncationClass = fullCategoryName.length >= 16 ? ' foreign-tool-card-category-truncate' : '';
            category.className = `category-pill pill-${getCategoryPillClass(fullCategoryName)} foreign-tool-card-category${truncationClass}`;
            category.textContent = fullCategoryName;
            category.title = fullCategoryName;
            copy.appendChild(category);
        }

        anchor.append(identity, copy);
        return anchor;
    }

    function renderEmpty(message) {
        grid.replaceChildren();
        grid.setAttribute('aria-busy', 'false');
        emptyState.textContent = message;
        emptyState.hidden = false;
        showMoreButton.hidden = true;
        status.textContent = message;
    }

    function renderResults(resetExpansion = false) {
        if (resetExpansion) expanded = false;
        emptyState.hidden = true;
        grid.setAttribute('aria-busy', 'false');

        if (tools.length === 0) {
            renderEmpty(selectedCategory ? 'No alternatives for now. Check back later.' : 'No foreign products with alternatives are available yet.');
            return;
        }

        const sortedTools = getSortedTools();
        if (sortedTools.length === 0) {
            renderEmpty(selectedCategory ? 'No alternatives for now. Check back later.' : 'No foreign products with alternatives are available yet.');
            return;
        }

        const visibleTools = expanded ? sortedTools : sortedTools.slice(0, PAGE_SIZE);
        grid.replaceChildren(...visibleTools.map(createToolCard));
        emptyState.hidden = true;
        showMoreButton.hidden = sortedTools.length <= PAGE_SIZE;
        showMoreButton.setAttribute('aria-expanded', String(expanded));
        showMoreLabel.textContent = expanded ? 'Show less' : `Show ${sortedTools.length - PAGE_SIZE} more`;
        status.textContent = selectedCategory
            ? `Showing ${visibleTools.length} of ${sortedTools.length} products in ${selectedCategory}.`
            : `Showing ${visibleTools.length} of ${sortedTools.length} products.`;
    }

    function renderLoadError() {
        grid.setAttribute('aria-busy', 'false');
        emptyState.hidden = true;
        showMoreButton.hidden = true;
        const box = document.createElement('div');
        box.className = 'foreign-tools-load-error';
        const text = document.createElement('p');
        text.textContent = 'Foreign products could not be loaded. Please try again.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'foreign-tools-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => {
            retry.disabled = true;
            retry.textContent = 'Loading…';
            loadTools(true).catch(() => renderLoadError());
        });
        box.append(text, retry);
        grid.replaceChildren(box);
        status.textContent = 'Foreign products could not be loaded.';
    }

    async function loadTools(force = false) {
        if (dataPromise && !force) return dataPromise;
        grid.setAttribute('aria-busy', 'true');
        const promise = fetch(API_URL, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        }).then((response) => {
            if (!response.ok) throw new Error(`Foreign tools request failed (${response.status})`);
            return response.json();
        }).then((payload) => {
            tools = unwrapTools(payload)
                .map(normalizeTool)
                .filter((tool) => tool.slug && tool.alternative_count >= 1);
            categoryOptions = buildCategoryOptions();
            selectedCategory = readCategoryFromUrl();
            const selectedCategoryIndex = categoryOptions.findIndex((option) => normalizeCategory(option.value) === normalizeCategory(selectedCategory));
            categoryListExpanded = selectedCategoryIndex >= CATEGORY_PREVIEW_SIZE;
            updateCategoryUrl(selectedCategory, true);
            renderCategoryOptions();
            if (sortSelect) {
                sortSelect.value = selectedSort;
            }
            renderResults(true);
            return tools;
        }).catch((error) => {
            dataPromise = null;
            throw error;
        });
        dataPromise = promise;
        return promise;
    }

    function showAutocompleteMessage(message) {
        const box = document.createElement('div');
        box.className = 'product-autocomplete-empty';
        box.textContent = message;
        suggestionsPanel.replaceChildren(box);
        suggestionsPanel.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
        searchInput.removeAttribute('aria-activedescendant');
    }

    function renderAutocompleteMatches(matches) {
        if (!matches.length) {
            showAutocompleteMessage('No matching products found.');
            return;
        }

        const list = document.createElement('div');
        list.className = 'product-autocomplete-list';
        list.id = 'foreign-tool-suggestion-list';
        list.setAttribute('role', 'listbox');

        matches.forEach((tool, index) => {
            const option = document.createElement('a');
            option.className = 'product-autocomplete-option foreign-tool-suggestion';
            option.href = `/alternative/${encodeURIComponent(tool.slug)}`;
            option.id = `foreign-tool-suggestion-${index}`;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.appendChild(createLogo(tool, true));

            const name = document.createElement('span');
            name.className = 'product-autocomplete-name foreign-tool-suggestion-name';
            name.textContent = tool.name;
            option.appendChild(name);
            list.appendChild(option);
        });

        suggestionsPanel.replaceChildren(list);
        suggestionsPanel.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
        searchInput.removeAttribute('aria-activedescendant');
    }

    function toolFromAutocomplete(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const slug = getToolSlug(item);
        const positiveTool = tools.find((tool) => tool.slug === slug);
        const name = String(item.name || item.foreign_tool_name || item.product_name || '').trim() || (positiveTool && positiveTool.name) || 'Untitled product';
        const logo = getToolLogo(item);
        return {
            ...(positiveTool || {}),
            ...item,
            slug,
            name: name || (positiveTool && positiveTool.name) || 'Untitled product',
            logo_url: logo || (positiveTool && positiveTool.logo_url) || '',
            alternative_count: getAlternativeCount(item) || (positiveTool && positiveTool.alternative_count) || 0,
            _fetchedIndex: index
        };
    }

    async function fetchAutocomplete(query, sequence) {
        if (searchRequest) searchRequest.abort();
        searchRequest = new AbortController();
        const endpoint = `${AUTOCOMPLETE_URL}?query=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(endpoint, {
                headers: { Accept: 'application/json' },
                signal: searchRequest.signal
            });
            if (!response.ok) throw new Error(`Autocomplete request failed (${response.status})`);
            const payload = await response.json();
            if (sequence !== searchSequence) return;
            const positiveSlugs = new Set(tools.map((tool) => tool.slug));
            const suggestions = unwrapTools(payload)
                .map(toolFromAutocomplete)
                .filter((tool) => tool.slug && positiveSlugs.has(tool.slug) && tool.alternative_count >= 1);
            renderAutocompleteMatches(suggestions);
        } catch (error) {
            if (error.name === 'AbortError' || sequence !== searchSequence) return;
            const queryLower = query.toLocaleLowerCase();
            const localMatches = tools
                .filter((tool) => tool.name.toLocaleLowerCase().includes(queryLower))
                .slice(0, 8);
            renderAutocompleteMatches(localMatches);
        }
    }

    function closeAutocomplete() {
        if (searchTimer) window.clearTimeout(searchTimer);
        if (searchRequest) searchRequest.abort();
        suggestionsPanel.hidden = true;
        suggestionsPanel.replaceChildren();
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
    }

    async function searchProducts(query, sequence) {
        suggestionsPanel.replaceChildren();
        suggestionsPanel.hidden = false;
        const loading = document.createElement('div');
        loading.className = 'product-autocomplete-empty product-autocomplete-loading';
        loading.textContent = 'Searching…';
        suggestionsPanel.appendChild(loading);
        searchInput.setAttribute('aria-expanded', 'true');

        try {
            await loadTools();
        } catch (error) {
            if (sequence === searchSequence) showAutocompleteMessage('Products could not be loaded. Please try again later.');
            return;
        }
        if (sequence !== searchSequence) return;
        await fetchAutocomplete(query, sequence);
    }

    function getSuggestionLinks() {
        return Array.from(suggestionsPanel.querySelectorAll('.foreign-tool-suggestion'));
    }

    function setActiveSuggestion(index) {
        const links = getSuggestionLinks();
        if (!links.length) return -1;
        const bounded = (index + links.length) % links.length;
        links.forEach((link, currentIndex) => {
            const active = currentIndex === bounded;
            link.classList.toggle('is-active', active);
            link.setAttribute('aria-selected', String(active));
        });
        searchInput.setAttribute('aria-activedescendant', links[bounded].id);
        return bounded;
    }

    function setCategory(value, updateUrl = true) {
        selectedCategory = value;
        if (updateUrl) updateCategoryUrl(value);
        if (filterForm) {
            filterForm.querySelectorAll('input[name="category"]').forEach((input) => {
                input.checked = input.value === value;
            });
        }
        renderResults(true);
    }

    function updateFilterSidebarForViewport() {
        if (!filterSidebar || !filterHeader) return;
        const mobile = window.matchMedia('(max-width: 992px)').matches;
        if (!mobile) {
            filterSidebar.classList.remove('open');
            filterSidebar.setAttribute('aria-expanded', 'true');
            filterHeader.setAttribute('aria-expanded', 'true');
        } else {
            filterSidebar.setAttribute('aria-expanded', String(filterSidebar.classList.contains('open')));
            filterHeader.setAttribute('aria-expanded', String(filterSidebar.classList.contains('open')));
        }
    }

    if (filterForm) {
        filterForm.addEventListener('change', (event) => {
            const target = event.target;
            if (!target || target.name !== 'category') return;
            setCategory(target.value);
        });
        filterForm.addEventListener('submit', (event) => event.preventDefault());
    }

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', (event) => {
            event.preventDefault();
            setCategory('');
        });
    }

    if (filterHeader && filterSidebar) {
        const toggleFilters = () => {
            if (!window.matchMedia('(max-width: 992px)').matches) return;
            const isOpen = filterSidebar.classList.toggle('open');
            filterSidebar.setAttribute('aria-expanded', String(isOpen));
            filterHeader.setAttribute('aria-expanded', String(isOpen));
        };
        filterHeader.addEventListener('click', (event) => {
            if (event.target.closest('.btn-clear')) return;
            toggleFilters();
        });
        filterHeader.addEventListener('keydown', (event) => {
            if (event.target !== filterHeader || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggleFilters();
        });
        window.addEventListener('resize', updateFilterSidebarForViewport, { passive: true });
        updateFilterSidebarForViewport();
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            selectedSort = ['count', 'az', 'newest'].includes(sortSelect.value) ? sortSelect.value : 'count';
            renderResults(true);
        });
    }

    if (showMoreButton) {
        showMoreButton.addEventListener('click', () => {
            expanded = !expanded;
            renderResults(false);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchTimer) window.clearTimeout(searchTimer);
            if (searchRequest) searchRequest.abort();
            const query = searchInput.value.trim();
            const sequence = ++searchSequence;
            if (query.length < 2) {
                closeAutocomplete();
                return;
            }
            searchTimer = window.setTimeout(() => searchProducts(query, sequence), 220);
        });

        searchInput.addEventListener('keydown', (event) => {
            const links = getSuggestionLinks();
            const current = links.findIndex((link) => link.classList.contains('is-active'));
            if (event.key === 'ArrowDown' && links.length) {
                event.preventDefault();
                setActiveSuggestion(current + 1);
            } else if (event.key === 'ArrowUp' && links.length) {
                event.preventDefault();
                setActiveSuggestion(current < 0 ? links.length - 1 : current - 1);
            } else if (event.key === 'Enter' && current >= 0) {
                event.preventDefault();
                window.location.assign(links[current].href);
            } else if (event.key === 'Escape') {
                closeAutocomplete();
            }
        });
    }

    if (searchWrapper) {
        searchWrapper.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!searchWrapper.contains(document.activeElement)) closeAutocomplete();
            }, 0);
        });
    }

    document.addEventListener('pointerdown', (event) => {
        if (searchWrapper && !searchWrapper.contains(event.target)) closeAutocomplete();
    });

    window.addEventListener('popstate', () => {
        selectedCategory = readCategoryFromUrl();
        const selectedCategoryIndex = categoryOptions.findIndex((option) => normalizeCategory(option.value) === normalizeCategory(selectedCategory));
        categoryListExpanded = selectedCategoryIndex >= CATEGORY_PREVIEW_SIZE;
        updateCategoryUrl(selectedCategory, true);
        renderCategoryOptions();
        renderResults(true);
    });

    if (sortSelect) selectedSort = sortSelect.value || 'count';
    categoryOptions = buildCategoryOptions();
    selectedCategory = readCategoryFromUrl();
    const selectedCategoryIndex = categoryOptions.findIndex((option) => normalizeCategory(option.value) === normalizeCategory(selectedCategory));
    categoryListExpanded = selectedCategoryIndex >= CATEGORY_PREVIEW_SIZE;
    updateCategoryUrl(selectedCategory, true);
    renderCategoryOptions();
    loadTools().catch(renderLoadError);
})();
