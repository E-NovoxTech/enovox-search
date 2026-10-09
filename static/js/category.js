(() => {
    const grid = document.getElementById('category-grid');
    const status = document.getElementById('category-status');
    if (!grid || !status) return;

    const aliases = {
        'design & creatives': 'design & creative',
        'energy & utility': 'energy & utilities'
    };

    function normalizeCategory(name) {
        const key = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return aliases[key] || key;
    }

    function categoryOrder(name) {
        if (typeof ENOVOX_CONFIG === 'undefined' || !Array.isArray(ENOVOX_CONFIG.CATEGORIES)) {
            return Number.MAX_SAFE_INTEGER;
        }
        const key = normalizeCategory(name);
        const index = ENOVOX_CONFIG.CATEGORIES.findIndex(item => normalizeCategory(item) === key);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    }

    function makeCard(category, count) {
        const visual = window.getEnovoxCategoryPresentation(category);
        const card = document.createElement('a');
        card.className = 'category-card';
        card.href = `/explore?category=${encodeURIComponent(category)}`;
        card.setAttribute('aria-label', `${category}, ${count} ${count === 1 ? 'product' : 'products'}`);
        card.style.setProperty('--category-accent', visual.accent);
        card.style.setProperty('--category-soft', visual.soft);

        const icon = document.createElement('span');
        icon.className = 'category-card-icon';
        icon.setAttribute('aria-hidden', 'true');
        const glyph = document.createElement('i');
        glyph.className = `fa-solid ${visual.icon}`;
        icon.appendChild(glyph);

        const title = document.createElement('h2');
        title.className = 'category-card-title';
        title.textContent = category;

        const countText = document.createElement('p');
        countText.className = 'category-card-count';
        countText.textContent = `${new Intl.NumberFormat().format(count)} ${count === 1 ? 'product' : 'products'}`;

        card.append(icon, title, countText);
        return card;
    }

    async function loadCategories() {
        grid.setAttribute('aria-busy', 'true');
        status.hidden = false;
        status.classList.remove('is-error');
        status.textContent = 'Loading categories…';

        try {
            const response = await fetch('/products/categories/counts', {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(`Category counts request failed (HTTP ${response.status})`);

            const counts = await response.json();
            if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
                throw new Error('Invalid category counts response');
            }

            const categories = Object.entries(counts)
                .map(([name, value]) => [String(name).trim(), Number(value)])
                .filter(([name, count]) => name && Number.isFinite(count) && count > 0)
                .sort((a, b) => {
                    const orderDiff = categoryOrder(a[0]) - categoryOrder(b[0]);
                    return orderDiff === 0 || !Number.isFinite(orderDiff)
                        ? a[0].localeCompare(b[0])
                        : orderDiff;
                });

            if (!categories.length) {
                grid.replaceChildren();
                status.textContent = 'No categories with products yet.';
                return;
            }

            grid.replaceChildren(...categories.map(([name, count]) => makeCard(name, count)));
            status.hidden = true;
        } catch (error) {
            console.error('Unable to load category counts:', error);
            grid.replaceChildren();
            status.classList.add('is-error');
            status.textContent = 'Unable to load categories right now. Please try again later.';
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCategories, { once: true });
    } else {
        loadCategories();
    }
})();
