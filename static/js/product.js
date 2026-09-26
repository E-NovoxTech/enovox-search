/**
 * js/product.js
 * Fetches and renders the Similar Products grid on the product detail page.
 * Also handles: Claim Product modal, Share/Copy popover, Pricing Details
 * dropdown, and appending a tracking param to the outbound "Visit Website" link.
 */

(function() {
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';

    document.addEventListener('DOMContentLoaded', () => {
        const grid = document.getElementById('similar-products-grid');
        if (grid) {
            const productId = grid.getAttribute('data-product-id');
            if (productId) fetchSimilarProducts(productId, grid);
        }

        setupOutboundTracking();
        setupSharePopover();
        setupPricingDropdown();
        setupClaimModal();
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
                const bookmarkHtml = (window.EnovoxBookmarks ? window.EnovoxBookmarks.cardButtonHtml(product.id) : '');

                card.innerHTML = `
                    <div class="card-header">
                        ${logoHTML}
                        <div class="card-header-actions">
                            ${bookmarkHtml}
                            <svg class="arrow-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </div>
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

    /* ==========================================================================
       Outbound tracking param on the "Visit Website" link
       ========================================================================== */
    function appendTrackingParams(url) {
        if (!url) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}utm_source=enovoxsearch&utm_medium=referral`;
    }

    function setupOutboundTracking() {
        const link = document.getElementById('visit-website-btn');
        if (!link) return;
        const originalHref = link.getAttribute('href');
        link.setAttribute('href', appendTrackingParams(originalHref));
    }

    /* ==========================================================================
       Share + copy popover
       Shares this page's own URL (not the product's external website), so
       no tracking param is appended here — that's scoped to outbound links
       to the product's real site per the "TRACKING PARAMETER ON OUTBOUND
       LINKS" spec, and this link isn't outbound.
       ========================================================================== */
    function setupSharePopover() {
        const shareBtn = document.getElementById('share-product-btn');
        const popover = document.getElementById('share-popover');
        const urlTextEl = document.getElementById('share-url-text');
        const copyBtn = document.getElementById('copy-share-url-btn');
        const copyConfirm = document.getElementById('copy-confirm-msg');
        if (!shareBtn || !popover || !urlTextEl) return;

        const pageUrl = window.location.origin + window.location.pathname;
        urlTextEl.textContent = pageUrl;
        urlTextEl.title = pageUrl; // full URL on hover even though it's visually truncated

        // Product name is already rendered by Jinja2 — reused here rather
        // than adding a new data attribute for it.
        const nameEl = document.querySelector('.product-name');
        const productName = nameEl ? nameEl.textContent.trim() : 'this product';
        const encodedUrl = encodeURIComponent(pageUrl);
        const shareText = encodeURIComponent(`Check out ${productName} on Enovox Search`);

        const whatsappLink = document.getElementById('share-whatsapp');
        const xLink = document.getElementById('share-x');
        const linkedinLink = document.getElementById('share-linkedin');
        if (whatsappLink) whatsappLink.href = `https://wa.me/?text=${shareText}%20${encodedUrl}`;
        if (xLink) xLink.href = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${shareText}`;
        if (linkedinLink) linkedinLink.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePricingPanel(); // don't allow both popovers open at once
            popover.classList.toggle('hidden');
        });

        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(pageUrl);
                    if (copyConfirm) {
                        copyConfirm.classList.remove('hidden');
                        setTimeout(() => copyConfirm.classList.add('hidden'), 2000);
                    }
                } catch (err) {
                    console.error('[share] clipboard copy failed:', err);
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== shareBtn) {
                popover.classList.add('hidden');
            }
        });
    }

    /* ==========================================================================
       NEW: Pricing Details dropdown
       Collapsed by default. Clicking the toggle reveals a panel that sits
       absolutely positioned over the "Visit Website" box (same wrapper,
       inset: 0 in CSS), rather than pushing layout around. Closes on an
       outside click or when the share popover is opened.
       ========================================================================== */
    function setupPricingDropdown() {
        const toggle = document.getElementById('pricing-details-toggle');
        const panel = document.getElementById('pricing-details-panel');
        if (!toggle || !panel) return;

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !panel.classList.contains('hidden');
            if (isOpen) {
                closePricingPanel();
            } else {
                document.getElementById('share-popover')?.classList.add('hidden');
                panel.classList.remove('hidden');
                toggle.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
                closePricingPanel();
            }
        });
    }

    function closePricingPanel() {
        const toggle = document.getElementById('pricing-details-toggle');
        const panel = document.getElementById('pricing-details-panel');
        if (!toggle || !panel) return;
        panel.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
    }

    /* ==========================================================================
       Claim product modal
       ASSUMPTION: not-logged-in / wrong-account-type users are sent to
       /login with ?type=developer&redirect=<this page> query params. These
       params are NOT currently read by login.html/signup.html/auth.js — I
       only touched product.html/.css/.js for this task, so the "pre-select
       Developer" and "return here after login" behavior described in the
       spec needs a small follow-up edit to those auth files to actually
       take effect. Harmless to include now either way.
       ========================================================================== */
    function setupClaimModal() {
        const claimBtn = document.getElementById('claim-product-btn');
        const modal = document.getElementById('claim-modal');
        const closeBtn = document.getElementById('claim-modal-close');
        const cancelBtn = document.getElementById('claim-modal-cancel');
        const form = document.getElementById('claim-form');
        if (!claimBtn || !modal || !form) return;

        claimBtn.addEventListener('click', () => handleClaimClick(claimBtn));
        closeBtn.addEventListener('click', closeClaimModal);
        cancelBtn.addEventListener('click', closeClaimModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeClaimModal(); });
        form.addEventListener('submit', (e) => handleClaimSubmit(e, claimBtn));
    }

    function handleClaimClick(claimBtn) {
        const token = localStorage.getItem(TOKEN_KEY);
        const accountType = localStorage.getItem(ACCOUNT_TYPE_KEY);

        // Not logged in, or logged in as a User (not Developer) — claiming
        // requires a developer account per the backend contract.
        if (!token || accountType !== 'developer') {
            const redirectTo = window.location.pathname;
            window.location.href = `/login?type=developer&redirect=${encodeURIComponent(redirectTo)}`;
            return;
        }

        openClaimModal(claimBtn.getAttribute('data-product-id'), token);
    }

    async function openClaimModal(productId, token) {
        const modal = document.getElementById('claim-modal');
        const form = document.getElementById('claim-form');
        const alertEl = document.getElementById('claim-modal-alert');

        form.reset();
        form.dataset.productId = productId;
        alertEl.className = 'alert hidden';
        alertEl.textContent = '';
        setClaimFormDisabled(false);
        document.getElementById('claim-modal-submit').textContent = 'Submit Claim';

        modal.classList.remove('hidden');

        // Pre-fill email from the account, if available (the JWT itself
        // doesn't carry email — confirmed earlier — so this reads the real
        // profile endpoint instead).
        try {
            const res = await fetch(`${API_URL}/developers/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const emailInput = document.getElementById('claim_email');
                if (data.email && emailInput) emailInput.value = data.email;
            }
        } catch (err) {
            // Non-fatal — email field just stays editable/blank.
        }
    }

    function closeClaimModal() {
        document.getElementById('claim-modal').classList.add('hidden');
    }

    function setClaimFormDisabled(disabled) {
        const form = document.getElementById('claim-form');
        if (!form) return;
        Array.from(form.elements).forEach(el => { el.disabled = disabled; });
    }

    async function handleClaimSubmit(e, claimBtn) {
        e.preventDefault();
        const form = e.target;
        const alertEl = document.getElementById('claim-modal-alert');
        const submitBtn = document.getElementById('claim-modal-submit');
        const token = localStorage.getItem(TOKEN_KEY);
        const productId = form.dataset.productId;

        if (!token || !productId) return;

        alertEl.className = 'alert hidden';
        alertEl.textContent = '';

        const payload = {
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            role: form.role.value,
            social_url: form.social_url.value.trim() || null
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const res = await fetch(`${API_URL}/products/${productId}/claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.detail || 'Could not submit your claim. Please try again.');
            }

            // Success (auto_verified true or false) — show the returned
            // message, then close the modal and disable the form so a
            // second submit can't fire while it's closing.
            alertEl.textContent = data.message || 'Claim submitted.';
            alertEl.className = 'alert success';
            setClaimFormDisabled(true);
            submitBtn.textContent = 'Done';

            setTimeout(() => {
                closeClaimModal();
                if (data.auto_verified) {
                    // Ownership was verified immediately — the Claim button
                    // itself has no way to know this without a page reload,
                    // since visibility is server-controlled by developer_id.
                    claimBtn.textContent = 'Ownership verified';
                    claimBtn.disabled = true;
                }
            }, 1800);

        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Claim';
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