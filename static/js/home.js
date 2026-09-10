

const API_BASE_URL = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
    // Generate Home Category Pills with Progressive Reveal
    const pillsContainer = document.getElementById('home-category-pills');
    const toggleBtn = document.getElementById('pill-toggle-btn');
    
    if (pillsContainer && typeof ENOVOX_CONFIG !== 'undefined') {
        pillsContainer.innerHTML = '';

        const pillElements = [];
        ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
            const pill = document.createElement('a');
            pill.href = `explore.html?category=${encodeURIComponent(cat)}`;
            const safeClass = cat.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
            pill.className = `category-pill pill-${safeClass}`;
            pill.textContent = cat;
            pill.style.display = 'none';
            pillsContainer.appendChild(pill);
            pillElements.push(pill);
        });

        const isMobile = window.innerWidth <= 768;
        let currentStage = 0;

        function updatePillVisibility() {
            let visibleCount;
            if (isMobile) {
                if (currentStage === 0) visibleCount = 4;
                else if (currentStage === 1) visibleCount = 7;
                else visibleCount = pillElements.length;
            } else {
                if (currentStage === 0) visibleCount = 6;
                else visibleCount = pillElements.length;
            }

            pillElements.forEach((pill, index) => {
                pill.style.display = index < visibleCount ? 'inline-block' : 'none';
            });

            const maxStage = isMobile ? 2 : 1;
            if (toggleBtn) {
                toggleBtn.innerHTML = currentStage === maxStage
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>'
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            }
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const maxStage = isMobile ? 2 : 1;
                currentStage = currentStage >= maxStage ? 0 : currentStage + 1;
                updatePillVisibility();
            });
        }

        updatePillVisibility();
    }

    initHeroRotation();
    initThemeToggle();
    initMobileMenu();
    
    if (document.getElementById('newly-launched-list')) {
        loadGridData();
    }
});

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
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (!themeToggle || !sunIcon || !moonIcon) return;

    // Check system preference or localStorage
    const savedTheme = localStorage.getItem('enovox_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        
        if (isDark) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
            localStorage.setItem('enovox_theme', 'dark');
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
            localStorage.setItem('enovox_theme', 'light');
        }
    });
}

/* ==========================================================================
   Backend Data Fetching & Card Generation
   ========================================================================== */
function loadGridData() {
    // 1. Newly Launched (Newest products)
    fetchProducts('/products/?sort=newest&limit=3', 'newly-launched-list');
    
    // 2. Popular Categories (We will fetch 'Fintech' to represent a popular category)
    // URL encoded for safety
    fetchProducts(`/products/?category=${encodeURIComponent('Fintech')}&limit=3`, 'popular-categories-list');
    
    // 3. Featured Products
    fetchProducts('/products/?featured=true&limit=3', 'featured-products-list');
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
    card.className = 'product-card';

    card.innerHTML = `
        <span class="card-explore-text">Explore</span>
        ${logoHtml}
        <div class="product-info">
            <h3 class="product-name">${escapeHTML(product.name)}</h3>
            <p class="product-desc" title="${escapeHTML(product.description)}">${escapeHTML(product.description)}</p>
            <span class="category-pill pill-${safeCategoryClass} pill-sm">${escapeHTML(product.category)}</span>
        </div>
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
function initMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburger-menu');
    const navLinks = document.querySelector('.nav-links');

    if (hamburgerBtn && navLinks) {
        hamburgerBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active-slider');
        });

        document.addEventListener('click', (event) => {
            if (!navLinks.contains(event.target) && !hamburgerBtn.contains(event.target)) {
                navLinks.classList.remove('active-slider');
            }
        });
    }
}