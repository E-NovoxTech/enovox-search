/**
 * js/spotlight-apply.js
 * /spotlight/apply — founder spotlight application (developer auth, Bearer).
 *
 * Submit -> POST /spotlight/apply (save_as_draft: false, full client-side
 * validation). Save draft -> same endpoint with save_as_draft: true and NO
 * required-field validation: whatever is on the form is sent (empty strings
 * = "not provided" server-side).
 *
 * Wire keys match the backend model exactly: startup_website (from the
 * website input), flat <platform>_url socials (empties omitted), consent /
 * guidelines_agreed, numeric product_ids. The draft flag travels in BOTH the
 * body and the ?save_as_draft= query param. Server 400/422 validation
 * errors are mapped back onto named form fields (never bare "field
 * required").
 *
 * Contract corrections applied: no email field (signup email is used
 * server-side), photo is a URL input with a live 4:5 preview, website is
 * required, Skills becomes required only while "Open to work" is on.
 */
(() => {
    const form = document.getElementById('spotlight-apply-form');
    if (!form) return;

    const API = '/spotlight/apply';
    const PRODUCTS_URL = '/developers/me/products';
    const TOKEN_KEY = 'enovox_dev_token';
    const MAX_SKILLS = 5;
    const MAX_PRODUCTS = 2;
    const QUOTE_MAX = 180;

    function getToken() {
        try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch (error) { return ''; }
    }
    const token = getToken();

    /* Logged-out visitors are sent to login first, then returned here —
       same convention as product.js claim + the /spotlight apply button. */
    if (!token) {
        window.location.href = `/login?type=developer&redirect=${encodeURIComponent('/spotlight/apply')}`;
        return;
    }

    /* ------------------------------------------------------------------
     * Element registry
     * ------------------------------------------------------------------ */
    const el = (id) => document.getElementById(id);
    const inputs = {
        startup_name: el('startup_name'),
        founder_name: el('founder_name'),
        website: el('website'),
        state: el('state'),
        photo_url: el('photo_url'),
        what_it_does: el('what_it_does'),
        challenges: el('challenges'),
        achievement: el('achievement'),
        vision: el('vision'),
        why_nigeria: el('why_nigeria'),
        quote: el('quote'),
    };
    const openToWork = el('open_to_work');
    const photoPreview = el('photo-preview');
    const photoPreviewImg = el('photo-preview-img');
    const photoLoader = el('photo-preview-loader');
    const photoErrorNote = el('photo-preview-error');
    const skillsSection = el('skills-section');
    const skillsLabel = el('skills-label');
    const skillsInput = el('skills-input');
    const skillsAddBtn = el('skills-add-btn');
    const skillsChips = el('skills-chips');
    const skillsCount = el('skills-count');
    const skillsHint = el('skills-hint');
    const quoteCount = el('quote-count');
    const whyNigeriaCount = el('why-nigeria-count');
    const productsBox = el('apply-products-box');
    const productsList = el('apply-products-list');
    const productsCount = el('apply-products-count');
    const socialInputs = Array.from(form.querySelectorAll('[data-social]'));
    const consentPublish = el('consent_publish');
    const consentGuidelines = el('consent_guidelines');
    const submitBtn = el('apply-submit-btn');
    const draftBtn = el('apply-draft-btn');
    const formAlert = el('apply-form-alert');
    const applyBanner = el('apply-banner');
    const layout = el('apply-layout');
    const successPanel = el('apply-success');
    if (!submitBtn || !draftBtn || !layout || !successPanel) return;

    const skills = [];
    const selectedProductIds = new Set();
    let submitting = false;

    function escapeHTML(str) {
        return String(str == null ? '' : str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    /* ------------------------------------------------------------------
     * Field-level errors
     * ------------------------------------------------------------------ */
    function setFieldError(key, message) {
        const errEl = document.getElementById(`${key}-error`);
        const group = form.querySelector(`[data-field-group="${key}"]`);
        if (errEl) errEl.textContent = message || '';
        if (group) group.classList.toggle('has-error', Boolean(message));
    }

    function clearErrors() {
        form.querySelectorAll('.apply-field-error').forEach((e) => { e.textContent = ''; });
        form.querySelectorAll('.has-error').forEach((g) => g.classList.remove('has-error'));
        if (formAlert) { formAlert.hidden = true; formAlert.textContent = ''; }
    }

    function showFormAlert(message) {
        if (!formAlert) return;
        formAlert.textContent = message;
        formAlert.hidden = false;
    }

    function focusGroup(key) {
        const group = form.querySelector(`[data-field-group="${key}"]`);
        if (!group) return;
        const target = group.querySelector('input, textarea, select, button');
        group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (target) window.setTimeout(() => target.focus({ preventScroll: true }), 400);
    }

    /* ------------------------------------------------------------------
     * Founder photo URL live preview with loading / success / error states.
     * While the URL image is being fetched the preview shows a skeleton +
     * spinner; on load the image appears; on failure the silhouette returns
     * with a short error note. A small debounce avoids a fetch per keystroke.
     * ------------------------------------------------------------------ */
    let photoLoadSeq = 0;
    let photoDebounceTimer = null;
    let lastGoodPreviewUrl = '';

    function setPhotoPreviewState(state) {
        // states: 'empty' (silhouette), 'loading', 'loaded', 'error'
        photoPreview.classList.toggle('is-loading', state === 'loading');
        photoPreview.classList.toggle('has-image', state === 'loaded');
        photoPreview.classList.toggle('is-error', state === 'error');
        photoPreviewImg.hidden = state !== 'loaded';
        if (photoLoader) photoLoader.hidden = state !== 'loading';
        if (photoErrorNote) photoErrorNote.hidden = state !== 'error';
        photoPreview.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    }

    function loadPhotoPreview(url) {
        if (url === lastGoodPreviewUrl && photoPreview.classList.contains('has-image')) return; // already on screen
        const seq = ++photoLoadSeq;
        photoPreviewImg.onload = () => {
            if (seq !== photoLoadSeq) return; // a newer URL won
            lastGoodPreviewUrl = url;
            setPhotoPreviewState('loaded');
        };
        photoPreviewImg.onerror = () => {
            if (seq !== photoLoadSeq) return;
            setPhotoPreviewState('error');
        };
        setPhotoPreviewState('loading');
        photoPreviewImg.src = url;
    }

    function syncPhotoPreview() {
        if (!photoPreview || !photoPreviewImg || !inputs.photo_url) return;
        const url = inputs.photo_url.value.trim();
        window.clearTimeout(photoDebounceTimer);
        if (!url) {
            ++photoLoadSeq; // cancel any in-flight load
            lastGoodPreviewUrl = '';
            photoPreviewImg.removeAttribute('src');
            setPhotoPreviewState('empty');
            return;
        }
        photoDebounceTimer = window.setTimeout(() => loadPhotoPreview(url), 350);
    }

    /* ------------------------------------------------------------------
     * Quote live counter (max QUOTE_MAX)
     * ------------------------------------------------------------------ */
    function bindShortCount(input, counter) {
        if (!input || !counter) return;
        const sync = () => {
            const used = input.value.length;
            counter.textContent = `${used}/${QUOTE_MAX}`;
            counter.classList.toggle('is-limit', used >= QUOTE_MAX);
        };
        input.setAttribute('maxlength', String(QUOTE_MAX));
        input.addEventListener('input', sync);
        sync();
    }

    /* ------------------------------------------------------------------
     * Skills chips — optional normally, required while Open to work is ON
     * ------------------------------------------------------------------ */
    function syncSkillsUI() {
        const required = openToWork && openToWork.checked;
        if (skillsLabel) skillsLabel.textContent = required ? 'Skills *' : 'Skills (optional)';
        if (skillsCount) skillsCount.textContent = `${skills.length}/${MAX_SKILLS}`;
        if (skillsInput) skillsInput.disabled = skills.length >= MAX_SKILLS;
        if (skillsAddBtn) skillsAddBtn.disabled = skills.length >= MAX_SKILLS;
        if (skillsSection) skillsSection.classList.toggle('is-required-now', required);
        // Live message mirrors the submit-time blocking rule
        if (skillsHint) {
            skillsHint.textContent = required
                ? (skills.length === 0
                    ? 'Open to work is on — add at least 1 skill (up to 5) before you can submit.'
                    : `Required because Open to work is on. Add up to ${MAX_SKILLS - skills.length} more.`)
                : 'Type a skill and press Enter. Up to 5.';
        }
        if (!required) setFieldError('skills', '');
    }

    function renderSkills() {
        if (!skillsChips) return;
        const chips = skills.map((skill, index) => {
            const chip = document.createElement('span');
            chip.className = 'apply-chip';
            const text = document.createElement('span');
            text.textContent = skill;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'apply-chip-remove';
            remove.setAttribute('aria-label', `Remove ${skill}`);
            remove.innerHTML = '&times;';
            remove.addEventListener('click', () => { skills.splice(index, 1); renderSkills(); syncSkillsUI(); });
            chip.append(text, remove);
            return chip;
        });
        skillsChips.replaceChildren(...chips);
        syncSkillsUI();
    }

    function commitSkillInput() {
        if (!skillsInput) return;
        const raw = skillsInput.value.trim();
        if (!raw) return;
        raw.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach((skill) => {
            if (skills.length >= MAX_SKILLS) return;
            if (!skills.some(s => s.toLowerCase() === skill.toLowerCase())) skills.push(skill);
        });
        skillsInput.value = '';
        renderSkills();
        syncSkillsUI();
    }

    function initSkills() {
        if (skillsAddBtn) skillsAddBtn.addEventListener('click', commitSkillInput);
        if (skillsInput) {
            skillsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitSkillInput(); }
            });
            skillsInput.addEventListener('blur', commitSkillInput);
        }
        syncSkillsUI();
    }

    /* ------------------------------------------------------------------
     * Products (up to 2 of the founder's approved products)
     * ------------------------------------------------------------------ */
    function productCard(product) {
        const id = product.id;
        const label = document.createElement('label');
        label.className = 'apply-product-option';
        const logo = product.logo_url
            ? `<img src="${escapeHTML(product.logo_url)}" alt="" class="apply-product-logo" loading="lazy" onerror="this.outerHTML='<span class=\\'apply-product-logo is-fallback\\'>${escapeHTML(String(product.name || 'P').charAt(0).toUpperCase())}</span>'">`
            : `<span class="apply-product-logo is-fallback">${escapeHTML(String(product.name || 'P').charAt(0).toUpperCase())}</span>`;
        label.innerHTML = `
            <input type="checkbox" value="${escapeHTML(String(id))}" ${selectedProductIds.has(String(id)) ? 'checked' : ''}>
            ${logo}
            <span class="apply-product-meta">
                <span class="apply-product-name">${escapeHTML(product.name || 'Untitled product')}</span>
                <span class="apply-product-category">${escapeHTML(product.category || '')}</span>
            </span>
            <span class="apply-product-check" aria-hidden="true"></span>
        `;
        const box = label.querySelector('input');
        box.addEventListener('change', () => {
            if (box.checked) {
                if (selectedProductIds.size >= MAX_PRODUCTS) {
                    box.checked = false;
                    setFieldError('products', `You can pick up to ${MAX_PRODUCTS} products.`);
                    return;
                }
                selectedProductIds.add(String(id));
            } else {
                selectedProductIds.delete(String(id));
            }
            setFieldError('products', '');
            syncProductsCount();
        });
        return label;
    }

    function syncProductsCount() {
        if (productsCount) productsCount.textContent = `${selectedProductIds.size}/${MAX_PRODUCTS} selected`;
    }

    function renderProductsMessage(icon, title, text, linkHref, linkText) {
        if (!productsList) return;
        const box = document.createElement('div');
        box.className = 'apply-products-message';
        box.innerHTML = `
            <span class="apply-products-message-icon" aria-hidden="true"><i class="${icon}"></i></span>
            <p class="apply-products-message-title">${escapeHTML(title)}</p>
            <p class="apply-products-message-text">${escapeHTML(text)}</p>
            ${linkHref ? `<a class="apply-products-message-link" href="${escapeHTML(linkHref)}">${escapeHTML(linkText)}</a>` : ''}
        `;
        productsList.replaceChildren(box);
    }

    async function loadProducts() {
        if (!productsList) return;
        try {
            const res = await fetch(PRODUCTS_URL, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
            if (res.status === 401) { silentRelogin(); return; }
            if (!res.ok) throw new Error('products request failed');
            const data = await res.json();
            const approved = (Array.isArray(data) ? data : []).filter(p => p && p.status === true);
            if (!approved.length) {
                // exactly per correction 8: no products yet -> message + save-draft-and-add-later path
                renderProductsMessage(
                    'fa-solid fa-box-open',
                    "You haven't listed a product yet.",
                    'You can apply without one. Or save your answers as a draft, add a product from your dashboard, and come back to finish.',
                    '/submit',
                    'Add a product'
                );
                syncProductsCount();
                return;
            }
            productsList.replaceChildren(...approved.map(productCard));
            syncProductsCount();
        } catch (error) {
            console.error('[spotlight apply] Unable to load your products:', error);
            renderProductsMessage(
                'fa-solid fa-triangle-exclamation',
                "We couldn't load your products right now.",
                'You can keep filling the form — try again before submitting to attach up to 2 products.',
                null,
                null
            );
        }
    }

    function silentRelogin() {
        window.location.href = `/login?type=developer&redirect=${encodeURIComponent('/spotlight/apply')}`;
    }

    /* ------------------------------------------------------------------
     * Payload (SAME body for submit and draft; draft adds save_as_draft)
     * ------------------------------------------------------------------ */
    function value(key) {
        return inputs[key] ? inputs[key].value.trim() : '';
    }

    function buildPayload(saveAsDraft) {
        // Backend model keys: flat <platform>_url socials (empties omitted
        // so draft saves never fail URL validation on "not provided").
        const socials = {};
        socialInputs.forEach((input) => {
            const raw = input.value.trim();
            if (raw) socials[`${input.dataset.social}_url`] = raw;
        });
        return {
            founder_name: value('founder_name'),
            startup_name: value('startup_name'),
            startup_website: value('website'),
            state: value('state'),
            photo_url: value('photo_url'),
            open_to_work: Boolean(openToWork && openToWork.checked),
            skills: [...skills],
            what_it_does: value('what_it_does'),
            challenges: value('challenges'),
            achievement: value('achievement'),
            vision: value('vision'),
            quote: value('quote'),
            why_nigeria: value('why_nigeria'),
            product_ids: [...selectedProductIds].map((pid) => (/^\d+$/.test(pid) ? Number(pid) : pid)),
            ...socials,
            consent: Boolean(consentPublish && consentPublish.checked),
            guidelines_agreed: Boolean(consentGuidelines && consentGuidelines.checked),
            save_as_draft: Boolean(saveAsDraft),
        };
    }

    /* ------------------------------------------------------------------
     * Submit validation (draft skips ALL of this on purpose)
     * ------------------------------------------------------------------ */
    function validate() {
        clearErrors();
        const problems = [];
        const need = (key, msg) => {
            if (!value(key)) { setFieldError(key, msg); problems.push(key); }
        };
        need('photo_url', 'Please add a link to your photo.');
        need('founder_name', 'Please add your name.');
        need('state', 'Please select your state.');
        need('startup_name', 'Please add your startup name.');
        if (value('website') && !/^https?:\/\/\S+\.\S+/i.test(value('website'))) { setFieldError('website', 'Please add a full URL, e.g. https://yourstartup.com.'); problems.push('website'); }
        need('what_it_does', 'Please tell us what you are building and the problem it solves.');
        need('vision', 'Please tell us where you are headed.');
        need('quote', 'Please add a line in your own words.');
        need('why_nigeria', 'Please tell us why you believe in Nigeria.');

        if (openToWork && openToWork.checked && skills.length === 0) {
            setFieldError('skills', 'Open to work is on — add at least 1 skill (up to 5).');
            problems.push('skills');
        }
        const anySocial = socialInputs.some(input => input.value.trim());
        if (!anySocial) {
            setFieldError('socials', 'Add at least one social link so readers can find you.');
            problems.push('socials');
        }
        if (consentPublish && !consentPublish.checked) {
            setFieldError('consent', 'Please confirm you consent to being published.');
            problems.push('consent_publish');
        }
        if (consentGuidelines && !consentGuidelines.checked) {
            setFieldError('consent', 'Please agree to the Developer Guidelines.');
            if (!problems.includes('consent_publish')) problems.push('consent_guidelines');
        }
        return problems;
    }

    /* ------------------------------------------------------------------
     * Edit mode (?edit=<application id>, e.g. from the dashboard's "My
     * Spotlight Drafts" list): pre-fill from GET /spotlight/my, then submit /
     * re-save via PUT /spotlight/apply/{id} (draft and rejected applications
     * are editable; others fall back to a fresh form).
     * ------------------------------------------------------------------ */
    let editing = null;

    function setInputValue(key, val) {
        const input = inputs[key];
        if (!input) return;
        input.value = val == null ? '' : String(val);
    }

    function prefillFromApplication(app) {
        [
            ['founder_name', app.founder_name], ['startup_name', app.startup_name],
            ['website', app.startup_website], ['state', app.state],
            ['photo_url', app.photo_url], ['what_it_does', app.what_it_does],
            ['challenges', app.challenges], ['achievement', app.achievement],
            ['vision', app.vision], ['quote', app.quote],
            ['why_nigeria', app.why_nigeria],
        ].forEach(([key, val]) => setInputValue(key, val));
        // keep the state select, counters and the photo preview in sync
        if (inputs.state) inputs.state.dispatchEvent(new Event('change', { bubbles: true }));
        if (inputs.photo_url) syncPhotoPreview();
        if (inputs.quote) inputs.quote.dispatchEvent(new Event('input', { bubbles: true }));
        if (inputs.why_nigeria) inputs.why_nigeria.dispatchEvent(new Event('input', { bubbles: true }));
        if (openToWork) {
            openToWork.checked = app.open_to_work === true || app.open_to_work === 'true';
            openToWork.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const skillList = Array.isArray(app.skills)
            ? app.skills
            : String(app.skills || '').split(',').map(s => s.trim()).filter(Boolean);
        skillList.forEach((skill) => {
            const text = String(skill).trim();
            if (text && skills.length < MAX_SKILLS && !skills.some(s => s.toLowerCase() === text.toLowerCase())) skills.push(text);
        });
        renderSkills();
        socialInputs.forEach((input) => {
            const val = app[`${input.dataset.social}_url`];
            if (val) input.value = String(val);
        });
        const ids = Array.isArray(app.product_ids) ? app.product_ids : [];
        ids.slice(0, MAX_PRODUCTS).forEach((id) => selectedProductIds.add(String(id)));
        if (consentPublish && app.consent === true) consentPublish.checked = true;
        if (consentGuidelines && app.guidelines_agreed === true) consentGuidelines.checked = true;
    }

    function syncProductBoxesWithSelection() {
        if (!productsList) return;
        productsList.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            box.checked = selectedProductIds.has(String(box.value));
        });
        syncProductsCount();
    }

    async function initEditFromServer(productsPromise) {
        const params = new URLSearchParams(window.location.search);
        const editId = (params.get('edit') || '').trim();
        if (!editId) return;
        try {
            const res = await fetch('/spotlight/my', {
                headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
                cache: 'no-store',
            });
            if (res.status === 401) { silentRelogin(); return; }
            if (!res.ok) throw new Error(`spotlight/my failed (HTTP ${res.status})`);
            const data = await res.json().catch(() => null);
            const apps = Array.isArray(data) ? data : [];
            const app = apps.find(a => String(a && a.id) === editId);
            if (!app) {
                console.warn('[spotlight apply] edit target not found in /spotlight/my:', editId);
                return;
            }
            if (app.status !== 'draft' && app.status !== 'rejected') {
                console.warn(`[spotlight apply] application ${editId} is "${app.status}" - only draft/rejected can be edited; starting a fresh form`);
                return;
            }
            prefillFromApplication(app);
            editing = { id: app.id };
            // product boxes may render before or after the prefill - reconcile both ways
            Promise.resolve(productsPromise).catch(() => {}).finally(syncProductBoxesWithSelection);
            showBanner('edit', 'You are editing your saved spotlight application. Submit sends it back into review; Save Draft keeps it as a draft.');
        } catch (error) {
            console.error('[spotlight apply] could not load the saved draft to edit:', error);
            showBanner('error', 'We could not load that saved draft. The form is fresh - reopen it from your dashboard instead.');
        }
    }

    /* ------------------------------------------------------------------
     * Network: POST /spotlight/apply (or PUT /spotlight/apply/{id} when the
     * page opened in edit mode)
     * ------------------------------------------------------------------ */
    function detailMessage(data) {
        if (!data) return '';
        const d = data.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d) && d.length) return d.map(e => e && (e.msg || e.message)).filter(Boolean).join(' ');
        if (typeof data.message === 'string') return data.message;
        return '';
    }

    function setBusy(isBusy, which) {
        submitting = isBusy;
        submitBtn.disabled = isBusy;
        draftBtn.disabled = isBusy;
        submitBtn.classList.toggle('is-busy', isBusy && which === 'submit');
        draftBtn.classList.toggle('is-busy', isBusy && which === 'draft');
    }

    function showBanner(kind, message) {
        if (!applyBanner) return;
        applyBanner.className = `apply-banner apply-banner-${kind}`;
        applyBanner.textContent = message;
        applyBanner.hidden = false;
        applyBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideBanner() {
        if (!applyBanner) return;
        applyBanner.hidden = true;
    }

    function showSuccess() {
        layout.hidden = true;
        const banner = el('apply-header-note');
        if (applyBanner) applyBanner.hidden = true;
        successPanel.innerHTML = `
            <span class="apply-success-icon" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
            <h2 class="apply-success-title">Application submitted</h2>
            <p class="apply-success-text">Thanks for sharing your story. The Enovox team will review your application and email you when your spotlight goes live.</p>
            <div class="apply-success-actions">
                <a class="apply-btn-primary" href="/spotlight">View the Spotlight page</a>
                <a class="apply-btn-secondary" href="/dashboard">Go to your dashboard</a>
            </div>
        `;
        successPanel.hidden = false;
        successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ------------------------------------------------------------------
     * Server validation errors -> named, per-field messages.
     * FastAPI 422 detail entries are {loc: ['body', '<key>'], msg: '...'}:
     * instead of echoing bare "field required" entries we translate each
     * wire key to its visible label and paint the matching form group.
     * ------------------------------------------------------------------ */
    const WIRE_FIELD_LABELS = {
        founder_name: 'Founder name',
        startup_name: 'Startup name',
        startup_website: 'Startup website',
        website: 'Startup website',
        state: 'State',
        photo_url: 'Founder photo URL',
        what_it_does: 'What your startup does',
        challenges: 'Biggest challenges',
        achievement: 'Proudest achievement',
        vision: 'Vision for Nigeria',
        why_nigeria: 'Why do you believe in Nigeria',
        quote: 'Quote',
        skills: 'Skills',
        product_ids: 'Products',
        consent: 'Consent to publish',
        consent_publish: 'Consent to publish',
        guidelines_agreed: 'Guidelines agreement',
        consent_guidelines: 'Guidelines agreement',
        open_to_work: 'Open to work',
        save_as_draft: 'Save as draft',
        instagram_url: 'Instagram URL',
        x_url: 'X (Twitter) URL',
        facebook_url: 'Facebook URL',
        linkedin_url: 'LinkedIn URL',
        tiktok_url: 'TikTok URL',
        github_url: 'GitHub URL'
    };
    const WIRE_TO_GROUP = {
        founder_name: 'founder_name', startup_name: 'startup_name',
        startup_website: 'website', website: 'website',
        state: 'state', photo_url: 'photo_url', what_it_does: 'what_it_does',
        challenges: 'challenges', achievement: 'achievement', vision: 'vision',
        why_nigeria: 'why_nigeria', quote: 'quote',
        skills: 'skills', product_ids: 'products',
        consent: 'consent', consent_publish: 'consent',
        guidelines_agreed: 'consent', consent_guidelines: 'consent',
        open_to_work: 'open_to_work',
        instagram_url: 'socials', x_url: 'socials', facebook_url: 'socials',
        linkedin_url: 'socials', tiktok_url: 'socials', github_url: 'socials'
    };

    function wireFieldLabel(key) {
        if (!key) return null;
        if (WIRE_FIELD_LABELS[key]) return WIRE_FIELD_LABELS[key];
        return String(key)
            .replace(/_url$/, ' URL')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function parseServerProblems(data) {
        const detail = data && data.detail;
        if (!Array.isArray(detail)) return [];
        return detail.map((item) => {
            if (!item || typeof item !== 'object') return { key: null, label: 'Form', message: String(item) };
            const loc = Array.isArray(item.loc) ? item.loc : [];
            const key = loc.length ? String(loc[loc.length - 1]) : null;
            let message = item.msg || item.message || 'Invalid value.';
            if (/^field required\.?$/i.test(message)) message = 'is required — please add it.';
            else if (/valid url/i.test(message)) message = 'needs a full URL (starting with http:// or https://).';
            return { key, label: key ? (wireFieldLabel(key) || key) : message, message };
        });
    }

    function reportServerProblems(problems) {
        problems.forEach((problem) => {
            const group = problem.key ? WIRE_TO_GROUP[problem.key] : null;
            if (group) setFieldError(group, problem.message);
        });
        const names = problems.map((p) => p.label);
        const list = names.length > 5
            ? `${names.slice(0, 5).join(', ')} and ${names.length - 5} more`
            : names.join(', ');
        showFormAlert(`The server flagged ${names.length === 1 ? 'this field' : 'these fields'} as missing or invalid: ${list}.`);
        const firstGroup = problems
            .map((p) => (p.key ? WIRE_TO_GROUP[p.key] : null))
            .find((g) => g && form.querySelector(`[data-field-group="${g}"]`));
        if (firstGroup) focusGroup(firstGroup);
        return list;
    }

    async function post(saveAsDraft) {
        hideBanner();
        if (!saveAsDraft) {
            const problems = validate();
            if (problems.length) {
                showFormAlert('Please complete the highlighted fields before submitting.');
                focusGroup(problems[0]);
                return;
            }
        } else {
            clearErrors();
        }
        setBusy(true, saveAsDraft ? 'draft' : 'submit');
        try {
            // Draft flag goes in BOTH the body and the query string, so a
            // backend that reads either keeps draft validation relaxed.
            // Edit mode (from the dashboard drafts list) resaves via PUT
            // /spotlight/apply/{id} instead of a fresh POST.
            const endpoint = editing
                ? `${API}/${encodeURIComponent(String(editing.id))}?save_as_draft=${saveAsDraft ? 'true' : 'false'}`
                : `${API}?save_as_draft=${saveAsDraft ? 'true' : 'false'}`;
            const res = await fetch(endpoint, {
                method: editing ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(buildPayload(saveAsDraft)),
            });
            if (res.status === 401 || res.status === 403) { silentRelogin(); return; }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const problems = parseServerProblems(data);
                if (problems.length) {
                    const list = reportServerProblems(problems);
                    showBanner('error', `${saveAsDraft ? 'Draft not saved' : 'Application not submitted'} — check: ${list}.`);
                } else {
                    showBanner('error', detailMessage(data) || `Request failed (HTTP ${res.status}).`);
                }
                return;
            }
            if (saveAsDraft) {
                showBanner('success', (data && data.message) || 'Draft saved. You can finish it later from your dashboard.');
            } else {
                showSuccess();
            }
        } catch (error) {
            console.error(`[spotlight apply] ${saveAsDraft ? 'draft save' : 'submit'} failed:`, error);
            showBanner('error', error.message || 'Something went wrong — please try again.');
        } finally {
            setBusy(false, saveAsDraft ? 'draft' : 'submit');
        }
    }

    /* ------------------------------------------------------------------
     * Wire-up
     * ------------------------------------------------------------------ */
    if (inputs.photo_url) {
        inputs.photo_url.addEventListener('input', syncPhotoPreview);
        inputs.photo_url.addEventListener('change', syncPhotoPreview);
        syncPhotoPreview();
    }
    bindShortCount(inputs.quote, quoteCount);
    bindShortCount(inputs.why_nigeria, whyNigeriaCount);
    if (openToWork) openToWork.addEventListener('change', syncSkillsUI);
    initSkills();
    const productsDone = loadProducts();
    initEditFromServer(productsDone);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!submitting) post(false); });
    draftBtn.addEventListener('click', () => { if (!submitting) post(true); });
})();
