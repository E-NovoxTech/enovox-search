/**
 * js/product.js
 * Fetches and renders the Similar Products grid on the product detail page.
 */

(function() {
    const API_URL = "";

    document.addEventListener('DOMContentLoaded', () => {
        const grid = document.getElementById('similar-products-grid');
        if (!grid) return;

        // Retrieve the product ID injected by Jinja2
        const productId = grid.getAttribute('data-product-id');
        if (productId) fetchSimilarProducts(productId, grid);
    });

    async function fetchSimilarProducts(id, container) {
        try {
            const response = await fetch(`${API_URL}/products/${id}/similar`);
            if (!response.ok) throw new Error('Failed to fetch similar products');
            
            const products = await response.json();
            
            if (products.length === 0) {
                container.innerHTML = '<p class="text-muted">No similar products found in this category.</p>';
                container.style.display = 'block';
                return;
            }

            container.innerHTML = '';
            
            // Reusing the exact card HTML structure from the Explore page
            products.forEach(product => {
                const card = document.createElement('a');
                card.href = `/product/${product.slug}`;
                card.className = 'product-card';

                const safeName = safeEscape(product.name);
                const firstLetter = safeName.charAt(0).toUpperCase();
                const safeDesc = safeEscape(truncateText(product.description, 100));
                
                // Color mapping for fallback avatar
                const colors = ['#eef2ff', '#f0fdf4', '#fefce8', '#fff1f2', '#f3e8ff'];
                const textColors = ['#4f46e5', '#16a34a', '#ca8a04', '#e11d48', '#9333ea'];
                const colorIndex = safeName.length % colors.length;
                const bgColor = colors[colorIndex];
                const textColor = textColors[colorIndex];

                const logoHTML = product.logo_url 
                    ? `<img src="${product.logo_url}" alt="${safeName} logo" class="card-logo">`
                    : `<div class="card-logo-fallback" style="background-color: ${bgColor}; color: ${textColor};">${firstLetter}</div>`;

                const safeCategoryClass = product.category.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');

                card.innerHTML = `
                    <div class="card-header">
                        ${logoHTML}
                        <svg class="arrow-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </div>
                    <div class="card-body">
                        <h3 class="product-title" title="${safeName}">${safeName}</h3>
                        <p class="product-desc" title="${safeEscape(product.description)}">${safeDesc}</p>
                        <span class="category-pill pill-${safeCategoryClass}">${safeEscape(product.category)}</span>
                    </div>
                `;
                
                container.appendChild(card);
            });

        } catch (error) {
            console.error(error);
            container.innerHTML = ''; // Silently fail and hide section to maintain clean UI
        }
    }

    // Helper functions
    function safeEscape(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    function truncateText(str, maxLength) {
        if (!str) return '';
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
})();