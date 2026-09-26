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
    initSiteBanner();
    EnovoxBookmarks.init();
    
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
        showTip(anchor, '<a class="bm-tip-link" href="/login">Log in</a> to save this', 'prompt');
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
