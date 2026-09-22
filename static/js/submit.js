/**
 * js/submit.js
 * Handles Developer Authentication, Product Submission Form, and Dashboard logic.
 */

(function() {
    // Configuration
    const API_URL = "";
    const TOKEN_KEY = 'enovox_dev_token';
    const SUBMIT_TIMEOUT_MS = 15000; // fail loudly instead of hanging forever

    document.addEventListener('DOMContentLoaded', () => {
        // Dynamically populate the Category dropdown from config
        const categorySelect = document.getElementById('category');
        if (categorySelect && typeof ENOVOX_CONFIG !== 'undefined') {
            ENOVOX_CONFIG.CATEGORIES.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categorySelect.appendChild(option);
            });
        }

        checkAuthAndInit();
        setupEventListeners();
        setupPricingDetailsLogic();
        setupStepNavigation();
        setupContextHelp();
        setupDescriptionCounter();
        setupFormAutosave();
    });

    /* ==========================================================================
       1. Authentication & Initialization
       ========================================================================== */
    function checkAuthAndInit() {
        const token = localStorage.getItem(TOKEN_KEY);
        const authWall = document.getElementById('auth-wall-view');
        const authView = document.getElementById('authenticated-view');
        if (!token) {
            authWall.style.display = 'flex';
            authView.style.display = 'none';
        } else {
            authWall.style.display = 'none';
            authView.style.display = 'block';
            loadDashboard(token);
        }
    }

    /* ==========================================================================
       2. Event Listeners
       ========================================================================== */
    function setupEventListeners() {
        const form = document.getElementById('submit-tool-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(TOKEN_KEY);
                window.location.reload();
            });
        }
    }

    /* ==========================================================================
       2b. Pricing Details — conditional required logic
       ========================================================================== */
    function setupPricingDetailsLogic() {
        const pricingSelect = document.getElementById('pricing');
        if (!pricingSelect) return;

        pricingSelect.addEventListener('change', () => {
            syncPricingDetailsForModel();
            clearFieldError('pricing-group', 'pricing-error');
        });
        syncPricingDetailsForModel();
    }

    /* Pricing Details is REQUIRED for every pricing model now (Free included).
       The asterisk is static in the HTML; here we only keep the guidance
       placeholder in sync with the chosen model and clear stale errors. */
    const PRICING_DETAIL_PLACEHOLDERS = {
        'Free': 'e.g. Free to use, no paid plans',
        'Paid': 'e.g. ₦5,000/per month',
        'Subscription': 'e.g. $9/month or one-time payment',
        'Freemium': 'e.g. Free tier + $10/mo Pro'
    };
    const DEFAULT_DETAILS_PLACEHOLDER = '$5/mo, ₦5,000/month, Free tier + $10/mo Pro';

    function syncPricingDetailsForModel() {
        const pricingSelect = document.getElementById('pricing');
        const detailsInput = document.getElementById('pricing_details');
        if (!pricingSelect || !detailsInput) return;

        detailsInput.required = true;
        detailsInput.placeholder = PRICING_DETAIL_PLACEHOLDERS[pricingSelect.value] || DEFAULT_DETAILS_PLACEHOLDER;

        if (detailsInput.value.trim() !== '') {
            clearPricingDetailsError();
        }
    }

    function showPricingDetailsError(message) {
        const group = document.getElementById('pricing-details-group');
        const errorEl = document.getElementById('pricing-details-error');
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
    }

    function clearPricingDetailsError() {
        const group = document.getElementById('pricing-details-group');
        const errorEl = document.getElementById('pricing-details-error');
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    /* ==========================================================================
       2c. Inline field errors (shared by both steps)
       ========================================================================== */
    function setFieldError(groupId, errorId, message) {
        const group = document.getElementById(groupId);
        const errorEl = document.getElementById(errorId);
        if (group) group.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
    }

    function clearFieldError(groupId, errorId) {
        const group = document.getElementById(groupId);
        const errorEl = document.getElementById(errorId);
        if (group) group.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
    }

    /* ==========================================================================
       2d. Two-step navigation + per-step validation
       ========================================================================== */
    let currentStep = 1;

    function setupStepNavigation() {
        const nextBtn = document.getElementById('next-step-btn');
        const backBtn = document.getElementById('back-step-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (validateStep1()) goToStep(2);
            });
        }
        if (backBtn) {
            // Inputs live in the same <form>, so nothing is lost going back.
            backBtn.addEventListener('click', () => goToStep(1));
        }
    }

    function goToStep(step) {
        currentStep = step;
        const s1 = document.getElementById('step-1');
        const s2 = document.getElementById('step-2');
        const ind1 = document.getElementById('step-ind-1');
        const ind2 = document.getElementById('step-ind-2');
        if (s1) s1.classList.toggle('hidden', step !== 1);
        if (s2) s2.classList.toggle('hidden', step !== 2);
        if (ind1) {
            ind1.classList.toggle('active', step === 1);
            ind1.classList.toggle('done', step > 1);
        }
        if (ind2) ind2.classList.toggle('active', step === 2);
        hideAlert();
        const stepper = document.getElementById('submit-stepper');
        if (stepper && stepper.scrollIntoView) {
            stepper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // Exposed so submit-tags.js (whose capture-phase submit listener can
    // block this file's own handler via stopImmediatePropagation) can
    // reuse the exact same step-switching logic instead of duplicating
    // it — keeps currentStep and the stepper UI in sync from either file.
    window.__enovoxGoToStep = goToStep;

    /* Step 1 = product information. Every required field gets an inline
       message; we never rely on browser-default validation bubbles.
       NOTE: user_count_range now lives in Step 1 (moved from Step 2 — it's
       product info, not company info), so its check lives here too. */
    function validateStep1() {
        const get = (id) => document.getElementById(id);
        const name = get('name'), description = get('description'), category = get('category'),
              productType = get('product_type'), pricing = get('pricing'),
              details = get('pricing_details'), website = get('website'), logo = get('logo_url'),
              keywords = get('keywords'), users = get('user_count_range');

        const checks = [
            { ok: !name || name.value.trim().length >= 2, group: 'name-group', err: 'name-error', msg: 'Please enter the product name (at least 2 characters).', el: name },
            { ok: !description || description.value.trim().length >= 20, group: 'description-group', err: 'description-error', msg: 'Please describe your tool in at least 20 characters.', el: description },
            { ok: !category || category.value !== '', group: 'category-group', err: 'category-error', msg: 'Please choose a category.', el: category },
            { ok: !productType || productType.value !== '', group: 'product-type-group', err: 'product-type-error', msg: 'Please choose a product type.', el: productType },
            { ok: !pricing || pricing.value !== '', group: 'pricing-group', err: 'pricing-error', msg: 'Please choose a pricing model.', el: pricing },
            { ok: !details || details.value.trim() !== '', group: 'pricing-details-group', err: 'pricing-details-error', msg: 'Pricing details are required \u2014 e.g. \u201cFree to use\u201d or \u201c\u20a65,000/month\u201d.', el: details },
            { ok: !website || /^https?:\/\/\S+\.\S+/.test(website.value.trim()), group: 'website-group', err: 'website-error', msg: 'Please enter the product website, e.g. https://your-product.com', el: website },
            { ok: !users || users.value !== '', group: 'user-count-group', err: 'user-count-error', msg: 'Please select your current user count.', el: users },
            { ok: !logo || /^https?:\/\/\S+\.\S+/.test(logo.value.trim()), group: 'logo-group', err: 'logo-error', msg: 'Please provide a direct logo image URL, e.g. https://.../logo.png', el: logo },
            { ok: !keywords || keywords.value.trim() !== '', group: 'keywords-wrap-group', err: 'keywords-error', msg: 'Add at least 1 keyword.', el: get('keyword-input') }
        ];

        let firstBad = null;
        checks.forEach(c => {
            if (c.ok) {
                clearFieldError(c.group, c.err);
            } else {
                setFieldError(c.group, c.err, c.msg);
                if (!firstBad && c.el) firstBad = c.el;
            }
        });
        if (firstBad && firstBad.focus) firstBad.focus();
        return !firstBad;
    }

    /* Step 2 = company / founder information.
       (user_count_range check removed — that field now lives in Step 1.) */
    function validateStep2() {
        const get = (id) => document.getElementById(id);
        const founder = get('founder'), email = get('contact_email'), agree = get('agree-terms');

        const checks = [
            { ok: !founder || founder.value.trim().length >= 2, group: 'founder-group', err: 'founder-error', msg: 'Please enter the founder name(s).', el: founder },
            { ok: !email || /^\S+@\S+\.\S+$/.test(email.value.trim()), group: 'contact-email-group', err: 'contact-email-error', msg: 'Please enter a valid contact email address.', el: email },
            { ok: !agree || agree.checked, group: 'agree-group', err: 'agree-error', msg: 'Please accept the Terms & Conditions and Privacy Policy.', el: agree }
        ];

        let firstBad = null;
        checks.forEach(c => {
            if (c.ok) {
                clearFieldError(c.group, c.err);
            } else {
                setFieldError(c.group, c.err, c.msg);
                if (!firstBad && c.el) firstBad = c.el;
            }
        });
        if (firstBad && firstBad.focus) firstBad.focus();
        return !firstBad;
    }

    /* ==========================================================================
       2e. Contextual help popovers (? icons) — desktop hover/click, mobile tap
       ========================================================================== */
    const HELP_KEYS = ['pricing', 'pricing-details'];
    // Field that each help bubble belongs to — focusing the field itself
    // (not just the ? icon) also surfaces the guidance (item 7).
    const HELP_FIELD_IDS = { 'pricing': 'pricing', 'pricing-details': 'pricing_details' };

    function setupContextHelp() {
        HELP_KEYS.forEach(key => {
            const btn = document.getElementById(key + '-help-btn');
            const pop = document.getElementById(key + '-help-pop');
            const closeBtn = document.getElementById(key + '-help-close');
            const field = document.getElementById(HELP_FIELD_IDS[key]);
            if (!btn || !pop) return;

            const setOpen = (open) => {
                pop.classList.toggle('hidden', !open);
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            };

            btn.addEventListener('click', () => setOpen(pop.classList.contains('hidden')));
            btn.addEventListener('mouseenter', () => setOpen(true));   // desktop hover
            btn.addEventListener('mouseleave', () => setOpen(false));  // desktop hover-out
            if (field) {
                field.addEventListener('focus', () => setOpen(true));  // keyboard/tab focus
                field.addEventListener('blur', () => setOpen(false));
            }
            if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
        });

        // Click anywhere else closes any open popover.
        document.addEventListener('click', (e) => {
            const t = e && e.target;
            if (t && t.closest && (t.closest('.help-trigger') || t.closest('.field-help-pop'))) return;
            closeAllHelpPops();
        });
    }

    function closeAllHelpPops() {
        HELP_KEYS.forEach(key => {
            const btn = document.getElementById(key + '-help-btn');
            const pop = document.getElementById(key + '-help-pop');
            if (pop) pop.classList.add('hidden');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    /* Live 0/1000 counter under the description textarea. */
    function setupDescriptionCounter() {
        const desc = document.getElementById('description');
        const counter = document.getElementById('description-count');
        if (!desc || !counter) return;
        const update = () => { counter.textContent = `${desc.value.length}/1000`; };
        desc.addEventListener('input', update);
        update();
    }

    /* ==========================================================================
       3. Form Submission Logic
       ========================================================================== */
    async function handleFormSubmit(e) {
        e.preventDefault();

        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return handleSessionExpired();

        const form = e.target;
        const submitBtn = document.getElementById('submit-btn');

        hideAlert();
        clearPricingDetailsError();

        // Re-validate both steps at submit time (the button only exists on
        // step 2, but a stale/edited DOM shouldn't slip through).
        if (!validateStep1()) {
            goToStep(1);
            showAlert('error', 'Please complete the highlighted field(s) in Product Information before submitting — including Keywords / Tags.');
            return;
        }
        if (!validateStep2()) return;

        const pricingDetailsField = form.pricing_details;
        const pricingDetailsValue = pricingDetailsField ? pricingDetailsField.value.trim() : '';

        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        const payload = {
            name: form.name.value.trim(),
            founder: form.founder.value.trim(),
            description: form.description.value.trim(),
            category: form.category.value,
            product_type: form.product_type.value,
            website: form.website.value.trim(),
            pricing: form.pricing.value,
            pricing_details: pricingDetailsValue,
            logo_url: form.logo_url.value.trim(),
            appstore_url: form.appstore_url.value.trim() || null,
            playstore_url: form.playstore_url.value.trim() || null,
            user_count_range: form.user_count_range.value,
            // Submissions-table column is "company" (the PRODUCTS table uses
            // "company_name" instead). The DOM field id stays company_name.
            company: form.company_name.value.trim(),
            twitter_url: form.twitter_url.value.trim(),
            linkedin_url: form.linkedin_url.value.trim(),
            instagram_url: form.instagram_url.value.trim(),
            facebook_url: form.facebook_url.value.trim(),
            keywords: form.keywords.value.trim(),
            contact_email: form.contact_email.value.trim(),
            github_url: form.github_url.value.trim() || null
        };

        const optionalFields = [
            'appstore_url', 'playstore_url', 'company',
            'twitter_url', 'linkedin_url', 'instagram_url', 'facebook_url'
        ];

        optionalFields.forEach(field => {
            if (!payload[field] || payload[field].trim() === '') {
                payload[field] = null;
            }
        });

        // Hard timeout: if the request doesn't settle in time, abort it and
        // treat it as a failure rather than leaving the button stuck forever.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}/submissions/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (response.status === 401) {
                return handleSessionExpired();
            }

            if (!response.ok) {
                let errorMsg = 'Submission failed. Please check your fields.';
                try {
                    const errorData = await response.json();
                    if (Array.isArray(errorData.detail) && errorData.detail[0] && errorData.detail[0].msg) {
                        errorMsg = errorData.detail[0].msg;
                    } else if (errorData.detail) {
                        errorMsg = errorData.detail;
                    }
                } catch (parseErr) {
                    // Body wasn't JSON (e.g. a 500 HTML error page) — keep the generic message.
                    console.error('Could not parse error response:', parseErr);
                }
                throw new Error(errorMsg);
            }

            clearAutosavedDraft(); // successful submission — don't let it come back as a "restored draft" next time
            form.reset(); // also clear the visible fields, so nothing stale lingers if the redirect is delayed
            const keywordsEl = document.getElementById('keywords');
            if (keywordsEl && typeof window.renderKeywordChipsFromValue === 'function') {
                window.renderKeywordChipsFromValue(''); // clear keyword chips too — form.reset() doesn't touch the tag widget's own state
            }
            showAlert('success', "Thanks! Your product is under review. Taking you to your dashboard...");
            submitBtn.textContent = 'Redirecting...';
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1200);
            return;

        } catch (error) {
            console.error('Submission Error:', error);
            const message = error.name === 'AbortError'
                ? 'The request timed out. Please check your connection and try again.'
                : error.message;
            showAlert('error', message);
            submitBtn.textContent = 'Submit Product';
            submitBtn.disabled = false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /* ==========================================================================
       4. Dashboard Data Fetching (My Products)
       ========================================================================== */
    async function loadDashboard(token) {
        // querySelector probe: the sidebar was removed, so these containers
        // no longer exist on the page — skip the fetches entirely.
        const liveContainer = document.querySelector('#live-products-list');
        const pendingContainer = document.querySelector('#pending-products-list');
        if (!liveContainer || !pendingContainer) return; // sidebar removed — nothing to render

        try {
            const liveRes = await fetch(`${API_URL}/developers/me/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (liveRes.status === 401) return handleSessionExpired();

            const liveProducts = await liveRes.json();
            renderProducts(liveContainer, liveProducts, 'live');

            const pendingRes = await fetch(`${API_URL}/submissions/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (pendingRes.status === 401) return handleSessionExpired();

            const pendingProducts = await pendingRes.json();
            renderProducts(pendingContainer, pendingProducts, 'pending');

        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
            liveContainer.innerHTML = '<div class="loading-state-small">Error loading products.</div>';
            pendingContainer.innerHTML = '<div class="loading-state-small">Error loading submissions.</div>';
        }
    }

    function renderProducts(container, products, type) {
        if (!products || products.length === 0) {
            container.innerHTML = `<div class="loading-state-small">No ${type} products found.</div>`;
            return;
        }

        container.innerHTML = '';

        products.forEach(product => {
            const item = document.createElement(type === 'live' ? 'a' : 'div');
            item.className = 'dev-product-item';

            if (type === 'live') {
                item.href = `/product/${product.slug}`;
                item.title = "View product page";
            }

            const badge = type === 'live'
                ? `<span class="badge live"><span class="glow-dot"></span> Live</span>`
                : `<span class="badge pending">Under Review</span>`;

            item.innerHTML = `
                <span class="dev-product-name" title="${safeEscape(product.name)}">${safeEscape(product.name)}</span>
                ${badge}
            `;
            container.appendChild(item);
        });
    }

    /* ==========================================================================
       5. Helper Utilities
       ========================================================================== */
    function handleSessionExpired() {
        localStorage.removeItem(TOKEN_KEY);
        alert("Your session has expired. Please log in again.");
        window.location.href = '/login';
    }

    function showAlert(type, message) {
        const alertBox = document.getElementById('form-alert');
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = `alert ${type}`;
        alertBox.style.display = 'block';
    }

    function hideAlert() {
        const alertBox = document.getElementById('form-alert');
        if (alertBox) {
            alertBox.className = 'alert hidden';
            alertBox.style.display = '';
        }
    }

    function safeEscape(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    /* ==========================================================================
       6. Form Autosave / Draft Restore
       Saves in-progress (never-submitted) form data to localStorage so an
       accidental refresh doesn't wipe the user's work. Cleared automatically
       on successful submission (see clearAutosavedDraft() call in
       handleFormSubmit's success path) — a submitted product's data is
       never restored as a "draft".
       ========================================================================== */
    const DRAFT_KEY = 'enovox_submit_draft_v1';
    const DRAFT_DEBOUNCE_MS = 400;

    // Plain text/url/email/number inputs + selects + textarea, all keyed by id.
    // Keywords (tag widget) and the checkbox are handled separately below.
    const AUTOSAVE_FIELD_IDS = [
        'name', 'description', 'category', 'product_type', 'pricing', 'pricing_details',
        'website', 'user_count_range', 'logo_url',
        'founder', 'company_name', 'contact_email', 'github_url',
        'twitter_url', 'linkedin_url', 'instagram_url', 'facebook_url',
        'appstore_url', 'playstore_url'
    ];

    let draftSaveTimer = null;
    let draftBannerShown = false;
    let autosaveDisabled = false; // set true right after a successful submit, so a late beforeunload/debounced save can't resurrect the cleared draft

    function setupFormAutosave() {
        const form = document.getElementById('submit-tool-form');
        if (!form) return;

        // Debounced save on any input/change inside the form.
        form.addEventListener('input', scheduleDraftSave);
        form.addEventListener('change', scheduleDraftSave);

        // Also save immediately on step navigation, so the current step
        // itself is part of what gets restored.
        const nextBtn = document.getElementById('next-step-btn');
        const backBtn = document.getElementById('back-step-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => setTimeout(saveDraftNow, 0));
        if (backBtn) backBtn.addEventListener('click', () => setTimeout(saveDraftNow, 0));

        // Belt-and-braces: catch the accidental-refresh/close case directly.
        window.addEventListener('beforeunload', saveDraftNow);

        // Requirement 5: if the user wasn't logged in, only restore once
        // they ARE logged in (checkAuthAndInit already ran by this point
        // in DOMContentLoaded, so we can check the real auth state here).
        const isLoggedIn = !!localStorage.getItem(TOKEN_KEY);
        if (isLoggedIn) {
            restoreDraftIfAny();
        }
        // If not logged in, we simply don't restore now. The draft stays
        // in localStorage untouched, and will be picked up the next time
        // this page loads while the user IS logged in.
    }

    function scheduleDraftSave() {
        if (autosaveDisabled) return;
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(saveDraftNow, DRAFT_DEBOUNCE_MS);
    }

    function saveDraftNow() {
        if (autosaveDisabled) return;
        try {
            const data = {};
            AUTOSAVE_FIELD_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) data[id] = el.value;
            });

            // NOTE: keywords are intentionally NOT included in the saved
            // draft (see restoreDraftIfAny for why) — the tag widget
            // manages its own state and isn't part of autosave.

            const agreeEl = document.getElementById('agree-terms');
            if (agreeEl) data.agree_terms = agreeEl.checked;

            data._step = currentStep;

            // Don't bother persisting a totally empty draft.
            const hasContent = Object.keys(data).some(k => {
                if (k === '_step' || k === 'agree_terms') return false;
                return data[k] && String(data[k]).trim() !== '';
            });

            if (hasContent) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
            } else {
                localStorage.removeItem(DRAFT_KEY);
            }
        } catch (err) {
            // localStorage can throw (private browsing, quota, etc.) —
            // autosave is a convenience, never let it break the form.
            console.warn('Autosave: could not save draft', err);
        }
    }

    function restoreDraftIfAny() {
        let raw;
        try {
            raw = localStorage.getItem(DRAFT_KEY);
        } catch (err) {
            return;
        }
        if (!raw) return;

        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            localStorage.removeItem(DRAFT_KEY);
            return;
        }
        if (!data || typeof data !== 'object') return;

        AUTOSAVE_FIELD_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && typeof data[id] === 'string' && data[id] !== '') {
                el.value = data[id];
            }
        });

        // NOTE: keywords are intentionally NOT autosaved/restored. The
        // keyword-tag widget (submit-tags.js) keeps its own in-memory
        // state independent of this draft system, and restoring it here
        // caused unreliable/duplicate-looking results. Most sites don't
        // autosave tag/chip inputs either — the user re-adds keywords
        // after a refresh, and the submit-time validation message (see
        // handleFormSubmit) makes it obvious if they forget.
        if (typeof data.agree_terms === 'boolean') {
            const agreeEl = document.getElementById('agree-terms');
            if (agreeEl) agreeEl.checked = data.agree_terms;
        }

        // Sync the description char counter after restoring its value.
        const desc = document.getElementById('description');
        const counter = document.getElementById('description-count');
        if (desc && counter) counter.textContent = `${desc.value.length}/1000`;

        // Sync the pricing-details placeholder/required state to whatever
        // pricing model was restored.
        if (typeof syncPricingDetailsForModel === 'function') {
            syncPricingDetailsForModel();
        }

        // Restore whichever step they were on.
        const step = data._step === 2 ? 2 : 1;
        goToStep(step);

        showDraftRestoredBanner();
    }

    function clearAutosavedDraft() {
        autosaveDisabled = true; // block any late save (e.g. the beforeunload that fires during the post-submit redirect) from resurrecting the draft we just cleared
        clearTimeout(draftSaveTimer);
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (err) {
            // no-op — nothing to clean up if storage isn't available
        }
    }

    // Requirement 4: let the user know a draft was restored, without being
    // intrusive. Reuses the existing #form-alert element/styles so no new
    // CSS is needed.
    function showDraftRestoredBanner() {
        if (draftBannerShown) return;
        draftBannerShown = true;
        showAlert('success', "We restored your unsaved draft from earlier.");
        // Auto-dismiss after a few seconds so it doesn't linger like a
        // real success/error state would.
        setTimeout(() => {
            const alertBox = document.getElementById('form-alert');
            if (alertBox && alertBox.textContent === "We restored your unsaved draft from earlier.") {
                hideAlert();
            }
        }, 4000);
    }

})();