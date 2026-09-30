/* Nigeria @ 66 logo wall. Uses the existing public product list and detail routes. */
(() => {
    'use strict';

    const ENDPOINT = '/products/?limit=66&sort=newest';
    // 12:00 AM WAT (UTC+1) on October 1, 2026 = 23:00 UTC on September 30.
    const UNLOCK_UTC_MS = Date.parse('2026-09-30T23:00:00Z');
    const CLOCK_ENDPOINT = '/products/banner'; // Existing same-origin GET has a server Date header.

    function fallback(name) {
        const mark = document.createElement('span');
        mark.className = 'nigeria66-logo-fallback';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = (name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toLocaleUpperCase();
        return mark;
    }

    function logoUrl(rawUrl) {
        if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
        try {
            const url = new URL(rawUrl.trim(), window.location.origin);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
        } catch (_) {
            return '';
        }
    }

    function makeTile(product) {
        const name = product.name.trim();
        const tile = document.createElement('a');
        tile.className = 'nigeria66-tile';
        tile.href = `/product/${encodeURIComponent(product.slug.trim())}`;
        tile.setAttribute('aria-label', `View ${name} on Enovox Search`);
        tile.title = name;

        const url = logoUrl(product.logo_url);
        if (!url) {
            tile.appendChild(fallback(name));
        } else {
            const img = document.createElement('img');
            img.alt = ''; // The link itself names the product for screen readers.
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => img.replaceWith(fallback(name)), { once: true });
            img.src = url;
            tile.appendChild(img);
        }
        return tile;
    }

    async function loadProducts() {
        const grid = document.getElementById('nigeria66-grid');
        const status = document.getElementById('nigeria66-status');
        if (!grid || !status) return;

        try {
            const response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Product request failed (${response.status})`);

            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Unexpected product list response');
            const products = data.filter(item => item && typeof item.name === 'string' && item.name.trim()
                && typeof item.slug === 'string' && item.slug.trim()).slice(0, 66);

            if (!products.length) {
                status.textContent = 'Products will appear here as they are published.';
                return;
            }

            const tiles = document.createDocumentFragment();
            products.forEach(product => tiles.appendChild(makeTile(product)));
            grid.replaceChildren(tiles);

            if (products.length < 66) {
                status.textContent = `${products.length} products featured so far · More will appear as they are published.`;
            } else {
                status.textContent = '';
                status.hidden = true;
            }
        } catch (error) {
            console.error('Nigeria @ 66 products:', error);
            status.textContent = 'We could not load the products. Please refresh and try again.';
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    function startTimeGate() {
        const countdown = document.getElementById('nigeria66-countdown');
        const hero = document.getElementById('nigeria66-hero');
        const showcase = document.getElementById('nigeria66-showcase');
        const status = document.getElementById('nigeria66-clock-status');
        const units = ['days', 'hours', 'minutes', 'seconds']
            .map(name => document.getElementById(`nigeria66-${name}`));
        // Fail closed if markup is incomplete: the celebration sections start hidden in HTML.
        if (!countdown || !hero || !showcase || !status || units.some(unit => !unit)) return;

        let serverEpochMs = null;
        let sampledAt = 0;
        let checking = false;
        let clockFailed = false;
        let opened = false;
        let refreshTimer = 0;
        let displayTimer = 0;
        let nextAllowedCheckAt = 0;

        // Date.now() is deliberately never used: changing a phone's clock cannot unlock the page.
        const officialNow = () => serverEpochMs === null
            ? null : serverEpochMs + Math.max(0, performance.now() - sampledAt);

        function showTime() {
            if (opened) return;
            const now = officialNow();
            if (now === null) return;
            const remaining = UNLOCK_UTC_MS - now;
            const total = Math.max(0, Math.ceil(remaining / 1000));
            const parts = [Math.floor(total / 86400), Math.floor(total / 3600) % 24,
                Math.floor(total / 60) % 60, total % 60];
            units.forEach((unit, i) => { unit.textContent = String(parts[i]).padStart(2, '0'); });

            if (remaining <= 0) {
                if (!clockFailed && status.textContent !== 'Verifying launch time…') {
                    status.textContent = 'Verifying launch time…';
                }
                // Reconfirm with the server at zero. Never unlock from an extrapolated clock alone.
                if (!checking && performance.now() >= nextAllowedCheckAt) {
                    nextAllowedCheckAt = performance.now() + 3000;
                    verifyTime();
                }
            }
        }

        function scheduleCheck(delay) {
            clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(verifyTime, delay);
        }

        function unlock() {
            if (opened) return;
            opened = true;
            clearTimeout(refreshTimer);
            clearInterval(displayTimer);
            countdown.hidden = true;
            hero.hidden = false;
            showcase.hidden = false;
            loadProducts(); // No product-list request is made while the page is locked.
        }

        async function verifyTime() {
            if (checking || opened) return;
            checking = true;
            try {
                // A unique query and no-store prevent a stale cached Date from delaying launch.
                const nonce = `${Math.random().toString(36).slice(2)}-${Math.round(performance.now())}`;
                const response = await fetch(`${CLOCK_ENDPOINT}?nigeria66_clock=${nonce}`, {
                    cache: 'no-store', headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`Clock request failed (${response.status})`);
                const serverTime = Date.parse(response.headers.get('Date') || '');
                if (!Number.isFinite(serverTime)) throw new Error('Server Date header unavailable');
                clockFailed = false;

                // HTTP Date has second precision: use the lower bound, not the user's wall clock.
                serverEpochMs = serverTime;
                sampledAt = performance.now();
                if (serverTime >= UNLOCK_UTC_MS) {
                    unlock();
                    return;
                }
                status.textContent = 'Opens at midnight, Nigeria time (WAT).';
                showTime();
                scheduleCheck(UNLOCK_UTC_MS - officialNow() <= 10000 ? 1000 : 60000);
            } catch (error) {
                console.warn('Nigeria @ 66: official time unavailable; keeping the page locked.', error);
                clockFailed = true;
                status.textContent = 'Cannot verify official time right now. Retrying automatically…';
                scheduleCheck(5000);
            } finally {
                checking = false;
            }
        }

        displayTimer = window.setInterval(showTime, 1000);
        verifyTime();
        // Refresh after returning to a suspended/background tab or regaining a connection.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !opened) verifyTime();
        });
        window.addEventListener('pageshow', event => {
            if (event.persisted && !opened) verifyTime();
        });
        window.addEventListener('online', () => { if (!opened) verifyTime(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startTimeGate, { once: true });
    } else {
        startTimeGate();
    }
})();
