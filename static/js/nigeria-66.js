/* Nigeria @ 66 logo wall. Uses the existing public product list and detail routes. */
(() => {
    'use strict';

    const ENDPOINT = '/products/?limit=66&sort=newest';

    function fallback(name) {
        const mark = document.createElement('span');
        mark.className = 'nigeria66-logo-fallback';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = (name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toLocaleUpperCase();
        return mark;
    }

    function logoUrl(rawUrl) {
        if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
        try {
            const url = new URL(rawUrl.trim(), window.location.origin);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
        } catch (_) {
            return '';
        }
    }

    function makeTile(product) {
        const name = product.name.trim();
        const tile = document.createElement('a');
        tile.className = 'nigeria66-tile';
        tile.href = `/product/${encodeURIComponent(product.slug.trim())}`;
        tile.setAttribute('aria-label', `View ${name} on Enovox Search`);
        tile.title = name;

        const url = logoUrl(product.logo_url);
        if (!url) {
            tile.appendChild(fallback(name));
        } else {
            const img = document.createElement('img');
            img.alt = ''; // The link itself names the product for screen readers.
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => img.replaceWith(fallback(name)), { once: true });
            img.src = url;
            tile.appendChild(img);
        }
        return tile;
    }

    async function loadProducts() {
        const grid = document.getElementById('nigeria66-grid');
        const status = document.getElementById('nigeria66-status');
        if (!grid || !status) return;

        try {
            const response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Product request failed (${response.status})`);

            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Unexpected product list response');
            const products = data.filter(item => item && typeof item.name === 'string' && item.name.trim()
                && typeof item.slug === 'string' && item.slug.trim()).slice(0, 66);

            if (!products.length) {
                status.textContent = 'Products will appear here as they are published.';
                return;
            }

            const tiles = document.createDocumentFragment();
            products.forEach(product => tiles.appendChild(makeTile(product)));
            grid.replaceChildren(tiles);

            if (products.length < 66) {
                status.textContent = `${products.length} products featured so far · More will appear as they are published.`;
            } else {
                status.textContent = '';
                status.hidden = true;
            }
        } catch (error) {
            console.error('Nigeria @ 66 products:', error);
            status.textContent = 'We could not load the products. Please refresh and try again.';
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadProducts, { once: true });
    } else {
        loadProducts();
    }
})();
