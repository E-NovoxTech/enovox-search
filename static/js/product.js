/**
 * js/product.js
 * Product detail page behaviour:
 *   - Similar Products grid (GET /products/{id}/similar); the whole section
 *     stays hidden when there are none (or the request fails)
 *   - Share popover (copy link + WhatsApp / X / LinkedIn)
 *   - Pricing details disclosure (closed by default)
 *   - Claim Product modal — two-step flow:
       step 1 POST /products/{id}/claim/start → { claim_id, needs_code, message }
       needs_code true  → step 2 code entry, POST /claim/{claim_id}/verify,
                          then the page reloads as ownership-claimed
       needs_code false → review-offer step, POST /claim/{claim_id}/submit-for-review
 *   - Outbound tracking params on external links to the product's own site
 *   - Logo fallback (letter tile) when an image fails to load
 * Save (bookmark) behaviour stays in the shared bookmarks script.
 */

(function () {
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const ACCOUNT_TYPE_KEY = 'enovox_account_type';

    document.addEventListener('DOMContentLoaded', () => {
        setupLogoFallbacks(document);

        const section = document.getElementById('similar-products-section');
        const grid = document.getElementById('similar-products-grid');
        if (section && grid) {
            const productId = grid.getAttribute('data-product-id');
            if (productId) fetchSimilarProducts(productId, section, grid);
        }

        setupOutboundTracking();
        setupSharePopover();
        setupPricingDisclosure();
        setupClaimModal();
    });

    /* ==========================================================================
       Logo fallback: a broken image becomes a letter tile
       ========================================================================== */
    function setupLogoFallbacks(root) {
        root.querySelectorAll('img[data-fallback-letter]').forEach((img) => {
            const swap = () => {
                const tile = document.createElement('div');
                tile.className = img.dataset.fallbackClass || 'pp-logo-fallback';
                if (img.dataset.fallbackTint) tile.classList.add(img.dataset.fallbackTint);
                tile.setAttribute('aria-hidden', 'true');
                tile.textContent = img.dataset.fallbackLetter || '?';
                img.replaceWith(tile);
            };
            img.addEventListener('error', swap, { once: true });
            if (img.complete && img.naturalWidth === 0) swap(); // failed before this script ran
        });
    }

    /* ==========================================================================
       Similar products
       ========================================================================== */
    async function fetchSimilarProducts(id, section, container) {
        try {
            const response = await fetch(`${API_URL}/products/${encodeURIComponent(id)}/similar`);
            if (!response.ok) throw new Error('Failed to fetch similar products');

            const products = await response.json();
            if (!Array.isArray(products) || products.length === 0) return; // section stays hidden

            container.innerHTML = '';
            products.forEach((product) => container.appendChild(buildSimilarCard(product)));
            setupLogoFallbacks(container);
            section.hidden = false;
        } catch (error) {
            console.error(error); // fail quietly: the section simply stays hidden
        }
    }

    function buildSimilarCard(product) {
        const card = document.createElement('a');
        card.href = `/product/${safeEscape(product.slug)}`;
        card.className = 'pp-sim-card';

        const name = String(product.name || '').trim();
        const letter = safeEscape((name.charAt(0) || '?').toUpperCase());
        const tint = `pp-tint${name.length % 5}`;
        const category = String(product.category || '');
        const categorySlug = category.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-');
        const bookmarkHtml = window.EnovoxBookmarks ? window.EnovoxBookmarks.cardButtonHtml(product.id) : '';

        const logoHtml = product.logo_url
            ? `<img src="${safeEscape(product.logo_url)}" alt="" loading="lazy" class="pp-sim-logo"
                    data-fallback-letter="${letter}" data-fallback-class="pp-sim-logo-fallback" data-fallback-tint="${tint}">`
            : `<div class="pp-sim-logo-fallback ${tint}" aria-hidden="true">${letter}</div>`;

        card.innerHTML = `
            <div class="pp-sim-head">
                ${logoHtml}
                <div class="pp-sim-actions card-header-actions">
                    ${bookmarkHtml}
                    <svg class="pp-sim-arrow" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </div>
            </div>
            <div class="pp-sim-body">
                <h3 class="pp-sim-name" title="${safeEscape(name)}">${safeEscape(name)}</h3>
                <p class="pp-sim-desc">${safeEscape(truncateText(product.description, 140))}</p>
                ${category ? `<span class="category-pill pill-${safeEscape(categorySlug)} pp-tag">${safeEscape(category)}</span>` : ''}
            </div>
        `;
        return card;
    }

    /* ==========================================================================
       Outbound tracking param on links to the product's own website
       ========================================================================== */
    function appendTrackingParams(url) {
        if (!url) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}utm_source=enovoxsearch&utm_medium=referral`;
    }

    function setupOutboundTracking() {
        document.querySelectorAll('[data-outbound]').forEach((link) => {
            const originalHref = link.getAttribute('href');
            if (originalHref) link.setAttribute('href', appendTrackingParams(originalHref));
        });
    }

    /* ==========================================================================
       Share + copy popover (shares this page's own URL, so no tracking param)
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
        urlTextEl.title = pageUrl;

        const nameEl = document.getElementById('pp-name');
        const productName = nameEl ? nameEl.textContent.trim() : 'this product';
        const encodedUrl = encodeURIComponent(pageUrl);
        const shareText = encodeURIComponent(`Check out ${productName} on Enovox Search`);

        const whatsappLink = document.getElementById('share-whatsapp');
        const xLink = document.getElementById('share-x');
        const linkedinLink = document.getElementById('share-linkedin');
        if (whatsappLink) whatsappLink.href = `https://wa.me/?text=${shareText}%20${encodedUrl}`;
        if (xLink) xLink.href = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${shareText}`;
        if (linkedinLink) linkedinLink.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

        const setOpen = (open) => {
            popover.hidden = !open;
            shareBtn.setAttribute('aria-expanded', String(open));
        };

        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(popover.hidden);
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
            if (!popover.hidden && !popover.contains(e.target) && !shareBtn.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !popover.hidden) {
                setOpen(false);
                shareBtn.focus();
            }
        });
    }

    /* ==========================================================================
       Pricing details disclosure — a real <button>, so Enter and Space work
       natively. Closed by default; opens/closes only from its own button.
       ========================================================================== */
    function setupPricingDisclosure() {
        const toggle = document.getElementById('pricing-details-toggle');
        const panel = document.getElementById('pricing-details-panel');
        if (!toggle || !panel) return;

        toggle.addEventListener('click', () => {
            const isOpen = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!isOpen));
            panel.hidden = isOpen;
        });
    }

    /* ==========================================================================
       Claim product modal — two-step flow
       Step 1 (name, email, role, social URL) POSTs /claim/start. When the
       email matches the listing's website domain (needs_code: true) a second
       step asks for the emailed 6-digit code and POSTs /claim/{claim_id}/verify;
       on success the page reloads as ownership-claimed. When it does not match
       (needs_code: false) the modal offers "Submit for review instead", which
       POSTs /claim/{claim_id}/submit-for-review and leaves the claim pending.
       ========================================================================== */
    function setupClaimModal() {
        const claimBtn = document.getElementById('claim-product-btn');
        const modal = document.getElementById('claim-modal');
        const form = document.getElementById('claim-form');
        if (!claimBtn || !modal || !form) return; // claimed products have no Claim button

        claimBtn.addEventListener('click', () => handleClaimClick(claimBtn));
        [
            document.getElementById('claim-modal-close'),
            document.getElementById('claim-modal-cancel'),
            document.getElementById('claim-verify-cancel'),
            document.getElementById('claim-review-cancel')
        ].forEach((btn) => { if (btn) btn.addEventListener('click', closeClaimModal); });
        modal.addEventListener('click', (e) => { if (e.target === modal) closeClaimModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeClaimModal();
        });

        form.addEventListener('submit', handleClaimStart);

        const verifyBtn = document.getElementById('claim-verify-submit');
        if (verifyBtn) verifyBtn.addEventListener('click', () => handleClaimVerify(modal));
        const reviewBtn = document.getElementById('claim-review-submit');
        if (reviewBtn) reviewBtn.addEventListener('click', () => handleClaimReview(modal));

        const codeInput = document.getElementById('claim_code');
        if (codeInput) {
            // Digits only; hitting Enter anywhere in step 2 verifies.
            codeInput.addEventListener('input', () => {
                codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
            });
            codeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleClaimVerify(modal); }
            });
        }
    }

    function handleClaimClick(claimBtn) {
        const token = localStorage.getItem(TOKEN_KEY);
        const accountType = localStorage.getItem(ACCOUNT_TYPE_KEY);

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
        form.classList.remove('hidden');
        form.dataset.productId = productId;
        delete modal.dataset.claimId;
        setClaimFormDisabled(false);
        document.getElementById('claim-modal-submit').textContent = 'Continue';
        showClaimStep(null);
        alertEl.className = 'alert hidden';
        alertEl.textContent = '';

        modal.classList.remove('hidden');

        // Pre-fill email from the account profile (the JWT itself has no email).
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
            // Non-fatal: the email field just stays editable/blank.
        }
    }

    function closeClaimModal() {
        document.getElementById('claim-modal').classList.add('hidden');
    }

    function setClaimFormDisabled(disabled) {
        const form = document.getElementById('claim-form');
        if (!form) return;
        Array.from(form.elements).forEach((el) => { el.disabled = disabled; });
    }

    // Exactly one of the modal's body sections is visible at a time:
    // null = step-1 form, 'code' = verification-code step, 'review' = review-offer step.
    function showClaimStep(mode, message) {
        const form = document.getElementById('claim-form');
        const codeStep = document.getElementById('claim-step-code');
        const reviewStep = document.getElementById('claim-step-review');
        if (form) form.classList.toggle('hidden', mode !== null);
        if (codeStep) {
            codeStep.classList.toggle('hidden', mode !== 'code');
            if (mode === 'code') {
                if (typeof message === 'string') document.getElementById('claim-code-message').textContent = message;
                const codeInput = document.getElementById('claim_code');
                if (codeInput) { codeInput.value = ''; codeInput.focus(); }
            }
        }
        if (reviewStep) {
            reviewStep.classList.toggle('hidden', mode !== 'review');
            if (mode === 'review' && typeof message === 'string') {
                document.getElementById('claim-review-message').textContent = message;
            }
        }
    }

    async function handleClaimStart(e) {
        e.preventDefault();
        const form = e.target;
        const modal = document.getElementById('claim-modal');
        const alertEl = document.getElementById('claim-modal-alert');
        const submitBtn = document.getElementById('claim-modal-submit');
        const token = localStorage.getItem(TOKEN_KEY);
        const productId = form.dataset.productId;

        if (!token || !productId) return;

        alertEl.className = 'alert hidden';
        alertEl.textContent = '';

        // Read by id (never form.<named-access>: "name"/"method"/"role" collide
        // with HTMLFormElement's own IDL properties and shadowing is ambiguous).
        const payload = {
            name: document.getElementById('claim_name').value.trim(),
            email: document.getElementById('claim_email').value.trim(),
            role: document.getElementById('claim_role').value,
            social_url: document.getElementById('claim_social_url').value.trim() || null
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking...';

        try {
            const res = await fetch(`${API_URL}/products/${productId}/claim/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.detail || 'Could not start your claim. Please try again.');
            }

            modal.dataset.claimId = data.claim_id;
            setClaimFormDisabled(false);

            if (data.needs_code) {
                // Email matches the listing's website domain: it holds a fresh code.
                showClaimStep('code', data.message || 'We sent a 6-digit code to that email. Enter it below.');
            } else {
                // No domain match: verification by code is impossible — the modal
                // offers the pending-review submission path instead.
                showClaimStep('review', data.message || 'That email does not match the product website domain, so we cannot verify ownership by code.');
            }

        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Continue';
        }
    }

    async function handleClaimVerify(modal) {
        const alertEl = document.getElementById('claim-modal-alert');
        const verifyBtn = document.getElementById('claim-verify-submit');
        const codeInput = document.getElementById('claim_code');
        const form = document.getElementById('claim-form');
        const token = localStorage.getItem(TOKEN_KEY);
        const productId = form && form.dataset.productId;
        const claimId = modal.dataset.claimId;
        const code = codeInput ? codeInput.value.trim() : '';

        if (!token || !productId || !claimId) return;
        if (code.length !== 6) {
            alertEl.textContent = 'Enter the 6-digit code from the email.';
            alertEl.className = 'alert error';
            if (codeInput) codeInput.focus();
            return;
        }

        alertEl.className = 'alert hidden';
        alertEl.textContent = '';
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';

        try {
            const res = await fetch(`${API_URL}/products/${productId}/claim/${claimId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.detail || 'That code is wrong or has expired. Check it and try again.');
            }

            // Ownership granted: confirm, then reload so the page shows the
            // listing in its ownership-claimed state.
            alertEl.textContent = data.message || 'Ownership verified — you now manage this listing.';
            alertEl.className = 'alert success';
            verifyBtn.textContent = 'Verified';

            setTimeout(() => {
                closeClaimModal();
                window.location.reload();
            }, 1500);

        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify code';
            if (codeInput) { codeInput.select ? codeInput.select() : codeInput.focus(); }
        }
    }

    async function handleClaimReview(modal) {
        const alertEl = document.getElementById('claim-modal-alert');
        const reviewBtn = document.getElementById('claim-review-submit');
        const form = document.getElementById('claim-form');
        const token = localStorage.getItem(TOKEN_KEY);
        const productId = form && form.dataset.productId;
        const claimId = modal.dataset.claimId;

        if (!token || !productId || !claimId) return;

        alertEl.className = 'alert hidden';
        alertEl.textContent = '';
        reviewBtn.disabled = true;
        reviewBtn.textContent = 'Submitting...';

        try {
            const res = await fetch(`${API_URL}/products/${productId}/claim/${claimId}/submit-for-review`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.detail || 'Could not submit your claim for review. Please try again.');
            }

            alertEl.textContent = data.message || 'Claim submitted for review.';
            alertEl.className = 'alert success';
            reviewBtn.textContent = 'Submitted';

            setTimeout(closeClaimModal, 1800);

        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className = 'alert error';
            reviewBtn.disabled = false;
            reviewBtn.textContent = 'Submit for review instead';
        }
    }

    /* ---------- helpers ---------- */
    function safeEscape(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, (tag) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    function truncateText(str, maxLength) {
        if (!str) return '';
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
})();