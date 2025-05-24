'use strict';

// Import UI module (assuming it's loaded separately)
import ui from './ui.js';

(function () {
    let state = {
        timer: 45,
        theme: 'dark',
        action: 'Initializing...',
        linkId: 'N/A',
        isMinimized: false,
        debugMode: false,
        rid: null,
        lastError: null
    };

    // Load saved state
    Object.assign(state, JSON.parse(localStorage.getItem('funlinkTimerState')) || {});

    // Generate UUID
    function generateId() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, d =>
            (d ^ (crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> (d / 4))).toString(16)
        );
    }

    // Get link ID
    function getLinkId() {
        const path = window.location.pathname;
        let id = path === '/404' ? prompt('Enter link ID:', '')?.trim() : path.split('/').filter(s => s)[0];
        state.linkId = id || 'N/A';
        return id;
    }

    // Retry logic
    async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
        for (let i = 1; i <= maxRetries; i++) {
            try {
                return await fn();
            } catch (e) {
                if (i === maxRetries || e.message.includes('429')) throw e;
                await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i - 1)));
            }
        }
    }

    // API requests
    async function sendOptions(url, rid) {
        return withRetry(() => fetch(url, {
            method: 'OPTIONS',
            headers: { rid },
            signal: AbortSignal.timeout(10000)
        }).then(r => {
            if (r.status === 429) throw new Error('Rate limit');
            if (r.status < 200 || r.status >= 300) throw new Error(`Status ${r.status}`);
            return r;
        }));
    }

    async function sendPost(url, data, rid, mappedUrl) {
        const headers = { 'Content-Type': 'application/json', rid };
        if (mappedUrl) headers['mapped-url'] = mappedUrl;
        return withRetry(() => fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(10000)
        }).then(async r => {
            if (r.status === 429) throw new Error('Rate limit');
            if (r.status < 200 || r.status >= 300) throw new Error(`Status ${r.status}`);
            const text = await r.text();
            if (!text) throw new Error('Empty response');
            return JSON.parse(text);
        }));
    }

    async function sendGetRequest(url, rid) {
        return withRetry(() => fetch(url, {
            method: 'GET',
            headers: { rid },
            signal: AbortSignal.timeout(10000)
        }).then(async r => {
            if (r.status === 429) throw new Error('Rate limit');
            if (r.status < 200 || r.status >= 300) throw new Error(`Status ${r.status}`);
            const text = await r.text();
            if (!text) throw new Error('Empty response');
            return JSON.parse(text);
        }));
    }

    // Create payload
    function createPayload(mappedUrl) {
        let hostname = `https://${window.location.hostname}`;
        if (mappedUrl) {
            try {
                hostname = `https://${new URL(mappedUrl).hostname}`;
            } catch (e) {}
        }
        return {
            screen: `${screen.width}x${screen.height}`,
            browser_name: navigator.appName,
            browser_version: '' + parseFloat(navigator.appVersion),
            is_mobile: /Android|iPhone|iPad/.test(navigator.userAgent),
            is_cookies: !!navigator.cookieEnabled,
            href: mappedUrl || window.location.href,
            user_agent: navigator.userAgent,
            hostname
        };
    }

    const apiBase = 'https://public.funlink.io/api/';
    const keywordData = {
        id: "7043c47f-9807-4ee5-b78f-406b1a56b477",
        keyword_text: "Caraworld Cam Ranh",
        url_destination: "https://caraworldcamranh.land/"
    };

    async function getFinalUrl(url, rid) {
        const id = url.split('/').pop();
        if (!id) return null;
        try {
            const data = await sendGetRequest(`${apiBase}url/get?id=${id}`, rid);
            if (!data.data_link?.url) return null;
            return data.data_link.url.includes('funlink.io') ? await getFinalUrl(data.data_link.url, rid) : data.data_link.url;
        } catch (e) {
            ui.showToast(`Redirect error: ${e.message}`, 'error');
            return null;
        }
    }

    async function triggerRequest() {
        try {
            const rid = generateId();
            state.rid = rid;
            const linkId = getLinkId();
            if (!linkId) throw new Error('No link ID');

            state.action = 'Processing';
            state.targetUrl = keywordData.url_destination || 'N/A';
            ui.showTimerAndProgress(state, 45);
            ui.updateOverlayContent(state);

            state.action = 'Sending OPTIONS';
            ui.updateOverlayContent(state);
            await sendOptions(`${apiBase}code/ch`, rid);

            state.action = 'Waiting';
            ui.updateOverlayContent(state);
            await new Promise(r => setTimeout(r, 45000));

            state.action = 'Fetching code';
            ui.updateOverlayContent(state);
            const codeResult = await sendPost(`${apiBase}code/code`, createPayload(keywordData.url_destination), rid, keywordData.url_destination);
            if (!codeResult.success || !codeResult.code) throw new Error('No code');

            state.action = 'Tracking';
            ui.updateOverlayContent(state);
            const trackingResult = await fetch(`${apiBase}url/tracking-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'rid': rid,
                    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8"'
                },
                body: JSON.stringify({
                    browser_name: "Chrome",
                    browser_version: "135.0.0.0",
                    os_name: "Windows",
                    os_version: "10",
                    keyword_answer: codeResult.code,
                    link_shorten_id: linkId,
                    keyword: keywordData.keyword_text,
                    user_agent: navigator.userAgent,
                    device_name: "desktop",
                    keyword_id: keywordData.id,
                    rid
                }),
                signal: AbortSignal.timeout(10000)
            }).then(r => r.json());

            if (trackingResult.result && trackingResult.data_link?.url) {
                state.action = 'Redirecting';
                state.targetUrl = trackingResult.data_link.url;
                ui.updateOverlayContent(state);
                window.location.href = trackingResult.data_link.url;
            } else {
                throw new Error('No valid URL');
            }
        } catch (e) {
            state.action = 'Error';
            state.lastError = e.message;
            ui.showToast(`Error: ${e.message}`, 'error');
            ui.showTimerAndProgress(state, 45);
            ui.updateOverlayContent(state);
        }
    }

    async function main() {
        try {
            const rid = generateId();
            state.rid = rid;
            const linkId = getLinkId();
            if (!linkId) {
                ui.showToast('No link ID', 'error');
                ui.showTimerAndProgress(state, 45);
                return;
            }

            state.action = 'Checking';
            ui.showTimerAndProgress(state, 45);
            ui.updateOverlayContent(state);
            const data = await sendGetRequest(`${apiBase}code/renew-key?ignoreId=1&id=${linkId}`, rid);

            if (data.data_keyword === null) {
                state.action = 'Resolving';
                ui.updateOverlayContent(state);
                const finalUrl = await getFinalUrl(window.location.href, rid);
                if (finalUrl) {
                    state.action = 'Redirecting';
                    state.targetUrl = finalUrl;
                    ui.updateOverlayContent(state);
                    window.location.replace(finalUrl);
                } else {
                    throw new Error('No redirect URL');
                }
            } else {
                await triggerRequest();
            }
        } catch (e) {
            state.action = 'Error';
            state.lastError = e.message;
            ui.showToast(`Error: ${e.message}`, 'error');
            ui.showTimerAndProgress(state, 45);
            ui.updateOverlayContent(state);
        }
    }

    main();
})();
