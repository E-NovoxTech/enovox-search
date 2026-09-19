const API_BASE_URL = '';

document.addEventListener('DOMContentLoaded', () => {
    // Generate Home Category Pills with Progressive Reveal
    const pillsContainer = document.getElementById('home-category-pills');
    const toggleBtn = document.getElementById('pill-toggle-btn');
    
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
    initFooterSubscribe();
    initSubscribeHeaderButton();
    
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