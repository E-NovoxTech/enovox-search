/**
 * js/explore.js
 * Handles filtering, search, pagination, and data fetching for the Enovox Search Explore page.
 */

(function() {
    // Configuration
    const API_URL = 'http://localhost:8000';
    const LIMIT = 20;
    let currentPage = 1;

    document.addEventListener('DOMContentLoaded', () => {
        // Generate category checkboxes with a six-item cutoff and see-more toggle.
        const categoryFilterContainer = document.getElementById('dynamic-category-filters');
        
        if (categoryFilterContainer && typeof ENOVOX_CONFIG !== 'undefined') {
            categoryFilterContainer.innerHTML = '';
            
            ENOVOX_CONFIG.CATEGORIES.forEach((cat, index) => {
                const label = document.createElement('label');
                label.className = 'custom-checkbox';
                if (index >= 6) {
                    label.classList.add('hidden-category');
                    label.classList.add('extra-category-item');
                }
                label.innerHTML = `<input type="checkbox" name="category" value="${cat}" class="category-filter-checkbox"><span class="checkmark"></span> ${cat}`;
                categoryFilterContainer.appendChild(label);
            });

            if (ENOVOX_CONFIG.CATEGORIES.length > 6) {
                const seeMoreBtn = document.createElement('div');
                seeMoreBtn.className = 'see-more-btn';
                seeMoreBtn.innerHTML = 'see more <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

                seeMoreBtn.addEventListener('click', function() {
                    const isExpanded = this.classList.contains('expanded');
                    const extraItems = categoryFilterContainer.querySelectorAll('.extra-category-item');

                    extraItems.forEach(item => {
                        if (isExpanded) {
                            item.classList.add('hidden-category');
                        } else {
                            item.classList.remove('hidden-category');
                        }
                    });

                    if (isExpanded) {
                        this.classList.remove('expanded');
                        this.innerHTML = 'see more <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                    } else {
                        this.classList.add('expanded');
                        this.innerHTML = 'see less <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
                    }
                });

                categoryFilterContainer.appendChild(seeMoreBtn);
            }
        }

        initExplore();
    });

    /**
     * Bootstraps the explore page by syncing the URL to the filters and fetching data.
     */
    function initExplore() {
        syncUrlToForm();
        fetchAndRender();

        // 1. Listen for Checkbox/Radio filter changes
        document.getElementById('filter-form').addEventListener('change', () => {
            currentPage = 1; // Reset to page 1 whenever a filter changes
            fetchAndRender();
        });

        // 2. Listen for Search Input (with Debounce)
        let searchTimeout;
        const searchInput = document.getElementById('explore-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentPage = 1;
                    fetchAndRender();
                }, 400); // Wait 400ms after typing stops before fetching
            });
        }

        // 3. Listen for Clear All Button
        const clearBtn = document.getElementById('clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                document.getElementById('filter-form').reset();
                document.getElementById('explore-search').value = '';
                
                // Force sort back to default "newest"
                const defaultSort = document.querySelector('input[name="sort"][value="newest"]');
                if (defaultSort) defaultSort.checked = true;

                currentPage = 1;
                fetchAndRender();
            });
        }

        // 4. Mobile Filter Accordion Toggle
        const filtersHeader = document.querySelector('.filters-header');
        const filtersSidebar = document.querySelector('.filters-sidebar');
        
        if (filtersHeader && filtersSidebar) {
            filtersHeader.addEventListener('click', (e) => {
                // Prevent toggle if they clicked anywhere inside the "Clear all" button
                if (e.target.closest('.btn-clear')) {
                    return; 
                }
                // Toggle the open class
                filtersSidebar.classList.toggle('open');
            });
        }
    }

    /* ==========================================================================
       State Synchronization (URL <--> DOM)
       ========================================================================== */

    /**
     * Reads the URL parameters on initial load and visually checks the correct boxes.
     */
    function syncUrlToForm() {
        const params = new URLSearchParams(window.location.search);
        
        // Checkboxes (Categories, Pricing, Product Type)
        ['category', 'pricing', 'product_type'].forEach(paramName => {
            const values = params.getAll(paramName);
            document.querySelectorAll(`input[name="${paramName}"]`).forEach(cb => {
                cb.checked = values.includes(cb.value);
            });
        });

        // Radio (Sort) - Default is 'newest'
        const sort = params.get('sort') || 'newest';
        const sortRadio = document.querySelector(`input[name="sort"][value="${sort}"]`);
        if (sortRadio) sortRadio.checked = true;

        // Search Input
        const query = params.get('query') || '';
        document.getElementById('explore-search').value = query;

        // Page Number
        currentPage = parseInt(params.get('page')) || 1;
    }

    /**
     * Reads the current form state, updates the URL silently, and returns URLSearchParams.
     */
    function syncFormToUrl() {
        const params = new URLSearchParams();
        
        // Append all checked checkboxes
        document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            params.append(cb.name, cb.value);
        });
        
        // Append sort if it's not the default
        const sortRadio = document.querySelector('input[name="sort"]:checked');
        if (sortRadio && sortRadio.value !== 'newest') {
            params.set('sort', sortRadio.value);
        }

        // Append search query
        const query = document.getElementById('explore-search').value.trim();
        if (query) params.set('query', query);

        // Append page number if not page 1
        if (currentPage > 1) params.set('page', currentPage);

        // Update browser URL without reloading the page
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        
        return params;
    }

    /* ==========================================================================
       Data Fetching & Rendering logic
       ========================================================================== */

    /**
     * The master function: updates state, fetches count, fetches data, and renders UI.
     */
    async function fetchAndRender() {
        const grid = document.getElementById('explore-results-grid');
        const resultsCountStr = document.getElementById('results-count');
        
        grid.innerHTML = '<div class="loading-state">Loading products...</div>';
        
        // Build query string from current filters
        const params = syncFormToUrl();
        const countUrl = `${API_URL}/products/count?${params.toString()}`;
        
        // Append pagination limits specifically for the data payload
        const offset = (currentPage - 1) * LIMIT;
        params.set('limit', LIMIT);
        params.set('offset', offset);
        const dataUrl = `${API_URL}/products/?${params.toString()}`;

        try {
            // 1. Fetch Total Count for Pagination Logic
            const countRes = await fetch(countUrl);
            if (!countRes.ok) throw new Error('Count API failed');
            const countData = await countRes.json();
            const total = countData.total || 0;
            
            resultsCountStr.textContent = `Showing ${total} tool${total !== 1 ? 's' : ''}`;

            // 2. Fetch the actual product segment
            const dataRes = await fetch(dataUrl);
            if (!dataRes.ok) throw new Error('Data API failed');
            const products = await dataRes.json();
            
            // 3. Render
            renderGrid(products);
            renderPagination(total);

        } catch (error) {
            console.error('Explore Fetch Error:', error);
            grid.innerHTML = `<div class="loading-state" style="color: #ef4444; border-color: #fee2e2;">Error loading products. Is the backend running?</div>`;
            resultsCountStr.textContent = 'Showing 0 tools';
            document.getElementById('pagination-wrapper').innerHTML = '';
        }
    }

    /**
     * Loops through product data and creates the grid.
     */
    function renderGrid(products) {
        const grid = document.getElementById('explore-results-grid');
        
        if (!products || products.length === 0) {
            grid.innerHTML = '<div class="loading-state">No products found matching your criteria. Try clearing some filters.</div>';
            return;
        }
        
        grid.innerHTML = '';
        products.forEach(product => {
            const card = document.createElement('a');
            card.href = `/product/${product.slug}`;
            card.className = 'product-card';
            const safeCategoryClass = product.category.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');

            let logoHtml = '';
            if (product.logo_url) {
                logoHtml = `<img src="${product.logo_url}" alt="${safeEscape(product.name)} Logo" class="product-logo" onerror="this.outerHTML='<div class=\\'product-logo\\'>${getInitialsFall(product.name)}</div>'">`;
            } else {
                logoHtml = `<div class="product-logo">${getInitialsFall(product.name)}</div>`;
            }

            card.innerHTML = `
                ${logoHtml}
                <div class="product-info">
                    <h3 class="product-name">${safeEscape(product.name)}</h3>
                    <p class="product-desc" title="${safeEscape(product.description)}">${safeEscape(product.description)}</p>
                    <span class="category-pill pill-${safeCategoryClass} pill-sm">${safeEscape(product.category)}</span>
                </div>
                <svg class="card-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            `;
            grid.appendChild(card);
        });
    }

    /* ==========================================================================
       Pagination Builder
       ========================================================================== */

    /**
     * Builds the numbered pagination (Prev [1] [2] [3] Next) and attaches click listeners.
     */
    function renderPagination(totalItems) {
        const paginationWrapper = document.getElementById('pagination-wrapper');
        const totalPages = Math.ceil(totalItems / LIMIT);
        
        paginationWrapper.innerHTML = '';

        if (totalPages <= 1) return; // Hide pagination if 1 page or fewer

        // Prev Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.textContent = 'Prev';
        if (currentPage === 1) prevBtn.disabled = true;
        else prevBtn.addEventListener('click', () => changePage(currentPage - 1));
        paginationWrapper.appendChild(prevBtn);

        // Numbered Buttons
        for (let i = 1; i <= totalPages; i++) {
            const numBtn = document.createElement('button');
            numBtn.className = `page-btn ${currentPage === i ? 'active' : ''}`;
            numBtn.textContent = i;
            numBtn.addEventListener('click', () => changePage(i));
            paginationWrapper.appendChild(numBtn);
        }

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.textContent = 'Next';
        if (currentPage === totalPages) nextBtn.disabled = true;
        else nextBtn.addEventListener('click', () => changePage(currentPage + 1));
        paginationWrapper.appendChild(nextBtn);
    }

    /**
     * Updates the page number, fetches new data, and scrolls to top.
     */
    function changePage(pageNumber) {
        currentPage = pageNumber;
        fetchAndRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ==========================================================================
       Helper Utilities (Locally Scoped)
       ========================================================================== */
       
    function safeEscape(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    function getInitialsFall(name) {
        return name ? name.charAt(0).toUpperCase() : 'E';
    }

})();