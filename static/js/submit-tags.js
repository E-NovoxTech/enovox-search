/**
 * js/submit-tags.js
 * Keyword/tag-input widget for the submit form. Self-contained — doesn't
 * touch submit.js at all. Maintains a hidden input#keywords (comma-separated)
 * that submit.js's existing FormData-based payload building will pick up
 * automatically, same as every other named field on the form.
 *
 * Validation runs in the CAPTURE phase on the form's "submit" event, so it
 * fires and can block (preventDefault + stopImmediatePropagation) before
 * submit.js's own submit handler runs.
 */
(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('submit-tool-form');
        const wrap = document.getElementById('keywords-wrap-group');
        const chipContainer = document.getElementById('keyword-chips');
        const input = document.getElementById('keyword-input');
        const hidden = document.getElementById('keywords');
        const errorEl = document.getElementById('keywords-error');
        if (!form || !chipContainer || !input || !hidden) return;

        const MAX_TAGS = 10;
        let tags = [];

        function sync() {
            hidden.value = tags.join(',');
            chipContainer.innerHTML = '';
            tags.forEach((tag, i) => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.innerHTML = `${escapeHTML(tag)}<button type="button" data-i="${i}" aria-label="Remove ${escapeHTML(tag)}">&times;</button>`;
                chipContainer.appendChild(chip);
            });
            input.disabled = tags.length >= MAX_TAGS;
            input.placeholder = tags.length >= MAX_TAGS ? 'Maximum 10 keywords reached' : 'Type a keyword and press Enter';
        }

        function addTag(raw) {
            const val = raw.trim().replace(/,+$/, '');
            if (!val || tags.length >= MAX_TAGS) return;
            if (tags.some(t => t.toLowerCase() === val.toLowerCase())) {
                input.value = '';
                return;
            }
            tags.push(val);
            input.value = '';
            clearError();
            sync();
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(input.value);
            } else if (e.key === 'Backspace' && input.value === '' && tags.length) {
                tags.pop();
                sync();
            }
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) addTag(input.value);
        });

        chipContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-i]');
            if (!btn) return;
            tags.splice(parseInt(btn.dataset.i, 10), 1);
            sync();
        });

        function showError(msg) {
            if (errorEl) errorEl.textContent = msg;
            if (wrap) wrap.classList.add('has-error');
        }
        function clearError() {
            if (errorEl) errorEl.textContent = '';
            if (wrap) wrap.classList.remove('has-error');
        }

        form.addEventListener('submit', (e) => {
            if (tags.length === 0) {
                e.preventDefault();
                e.stopImmediatePropagation();
                showError('Add at least 1 keyword.');
                input.focus();
            } else if (tags.length > MAX_TAGS) {
                e.preventDefault();
                e.stopImmediatePropagation();
                showError('Maximum 10 keywords allowed.');
            } else {
                clearError();
            }
        }, true); // capture phase — runs before submit.js's own listener

        function escapeHTML(str) {
            return String(str).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
        }

        sync();
    });
})();