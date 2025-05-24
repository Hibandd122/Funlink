(function () {
    'use strict';

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

    // Show toast
    function showToast(message, type = 'error', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? 'rgba(255, 82, 82, 0.9)' : 'rgba(76, 175, 80, 0.9)'};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10001;
            animation: slideIn 0.3s ease, fadeOut 0.3s ease ${duration}ms forwards;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration + 300);
    }

    // Update overlay content
    function updateOverlayContent() {
        const els = {
            timer: document.getElementById('timer-text'),
            action: document.getElementById('action-text'),
            linkId: document.getElementById('link-id-text'),
            progress: document.getElementById('progress-bar'),
            status: document.getElementById('status-icon'),
            debug: document.getElementById('debug-log')
        };
        if (!els.timer || !els.progress) return;
        els.timer.textContent = `${Math.ceil(state.timer)}s`;
        if (els.action) els.action.textContent = state.action;
        if (els.linkId) {
            els.linkId.textContent = state.linkId.length > 30 ? `${state.linkId.substring(0, 27)}...` : state.linkId;
            els.linkId.title = state.linkId;
        }
        els.progress.style.width = `${(state.timer / 45) * 100}%`;
        if (els.status) {
            els.status.textContent = state.action.includes('Error') ? '❌' :
                state.action.includes('Fetching') || state.action.includes('Mapping') ? '⏳' :
                state.action.includes('Redirecting') ? '✅' : 'ℹ️';
        }
        if (els.debug && state.debugMode) {
            els.debug.textContent = `RID: ${state.rid || 'N/A'}\nError: ${state.lastError || 'None'}`;
        }
    }

    // Show full-screen timer overlay
    function showTimerAndProgress(seconds = 45) {
        // Remove existing overlay if any
        const existingOverlay = document.getElementById('timer-overlay');
        if (existingOverlay) existingOverlay.remove();

        state.timer = seconds;
        const startTime = performance.now();

        // Create full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'timer-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: ${state.theme === 'dark'
                ? 'linear-gradient(135deg, rgba(26, 26, 46, 0.9), rgba(22, 33, 62, 0.9))'
                : 'linear-gradient(135deg, rgba(224, 234, 252, 0.9), rgba(207, 222, 243, 0.9))'};
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.5s ease-out;
        `;

        // Create timer container
        const container = document.createElement('div');
        container.style.cssText = `
            text-align: center;
            padding: ${state.isMinimized ? '10px' : '30px'};
            background: ${state.theme === 'dark'
                ? 'rgba(40, 40, 60, 0.7)'
                : 'rgba(255, 255, 255, 0.7)'};
            backdrop-filter: blur(12px);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            color: ${state.theme === 'dark' ? '#e0e0ff' : '#333'};
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: ${state.isMinimized ? '60px' : '300px'};
            max-width: ${state.isMinimized ? '60px' : '400px'};
            animation: scaleIn 0.5s ease-out;
            ${state.isMinimized ? 'border-radius: 50%;' : ''}
        `;
        container.innerHTML = state.isMinimized ? `
            <div id="minimized-icon" style="font-size: 24px; line-height: 40px; cursor: pointer;">⏳</div>
        ` : `
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="margin-right: 10px;">
                    <circle cx="12" cy="12" r="10" stroke="${state.theme === 'dark' ? '#21CBF3' : '#1976D2'}" stroke-width="2"/>
                    <path d="M12 6v6l4 2" stroke="${state.theme === 'dark' ? '#21CBF3' : '#1976D2'}" stroke-width="2"/>
                </svg>
                <div id="timer-text" style="font-size: 32px; font-weight: 600; letter-spacing: 1px;">
                    ${Math.ceil(seconds)}s
                </div>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <span id="status-icon" style="margin-right: 8px; font-size: 20px;">ℹ️</span>
                <span id="action-text" style="font-size: 16px;">${state.action}</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <span id="link-id-text" style="font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${state.linkId}">
                    ${state.linkId.length > 30 ? `${state.linkId.substring(0, 27)}...` : state.linkId}
                </span>
                <button id="copy-link-id-btn" style="
                    background: none;
                    border: none;
                    color: ${state.theme === 'dark' ? '#21CBF3' : '#1976D2'};
                    font-size: 16px;
                    cursor: pointer;
                    padding: 5px;
                    margin-left: 10px;
                ">📋</button>
            </div>
            <div class="progress-container" style="
                height: 12px;
                background: ${state.theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'};
                border-radius: 6px;
                overflow: hidden;
                margin-bottom: 20px;
            ">
                <div id="progress-bar" style="
                    height: 100%;
                    width: 100%;
                    background: linear-gradient(90deg, #2196F3, #21CBF3);
                    transition: width 0.3s linear;
                    animation: progressGlow 2s infinite;
                "></div>
            </div>
            ${state.debugMode ? `
                <div id="debug-log" style="
                    font-size: 12px;
                    padding: 10px;
                    background: ${state.theme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'};
                    border-radius: 6px;
                    text-align: left;
                    max-height: 100px;
                    overflow-y: auto;
                ">RID: ${state.rid || 'N/A'}\nError: ${state.lastError || 'None'}</div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                <button id="theme-btn" style="
                    padding: 10px 20px;
                    background: linear-gradient(45deg, ${state.theme === 'dark' ? '#2196F3, #21CBF3' : '#1976D2, #42A5F5'});
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: transform 0.2s, box-shadow 0.2s;
                ">Theme</button>
                <button id="minimize-btn" style="
                    padding: 10px 20px;
                    background: linear-gradient(45deg, #ffb300, #ffca28);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: transform 0.2s, box-shadow 0.2s;
                ">${state.isMinimized ? 'Show' : 'Minimize'}</button>
                <button id="close-btn" style="
                    padding: 10px 20px;
                    background: linear-gradient(45deg, #ff5252, #ff8a80);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: transform 0.2s, box-shadow 0.2s;
                ">Close</button>
            </div>
        `;

        overlay.appendChild(container);
        try {
            document.body.appendChild(overlay);
        } catch (e) {
            console.error('Failed to append timer overlay:', e);
            showToast('Failed to render overlay', 'error');
            return;
        }

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.8); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes progressGlow {
                0% { box-shadow: 0 0 5px #2196F3; }
                50% { box-shadow: 0 0 15px #21CBF3; }
                100% { box-shadow: 0 0 5px #2196F3; }
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes fadeOut {
                to { opacity: 0; }
            }
            #timer-overlay {
                transition: all 0.3s ease;
            }
            #timer-overlay.minimized {
                background: transparent;
                backdrop-filter: none;
            }
            #timer-text {
                animation: pulse 2s infinite;
            }
            #copy-link-id-btn:hover {
                filter: drop-shadow(0 0 5px ${state.theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)'});
            }
            #theme-btn:hover, #minimize-btn:hover, #close-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 4px 15px rgba(33, 150, 243, 0.5);
            }
            #minimize-btn:hover {
                box-shadow: 0 4px 15px rgba(255, 179, 0, 0.5);
            }
            #close-btn:hover {
                box-shadow: 0 4px 15px rgba(255, 82, 82, 0.5);
            }
            @media (max-width: 600px) {
                #timer-overlay {
                    padding: 20px;
                }
                #timer-overlay > div {
                    min-width: 250px;
                    padding: 20px;
                }
                #timer-text {
                    font-size: 24px;
                }
                #action-text, #link-id-text {
                    font-size: 14px;
                }
                .progress-container {
                    height: 10px;
                }
                #theme-btn, #minimize-btn, #close-btn {
                    padding: 8px 16px;
                    font-size: 12px;
                }
                #timer-overlay.minimized > div {
                    min-width: 50px;
                    max-width: 50px;
                    height: 50px;
                }
            }
        `;
        try {
            document.head.appendChild(style);
        } catch (e) {
            console.error('Failed to append style:', e);
            showToast('Style rendering failed', 'error');
            return;
        }

        // Event listeners with null checks
        const themeBtn = document.getElementById('theme-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                state.theme = state.theme === 'dark' ? 'light' : 'dark';
                localStorage.setItem('funlinkTimerState', JSON.stringify(state));
                overlay.remove();
                style.remove();
                showTimerAndProgress(state.timer);
            });
        }

        const minimizeBtn = document.getElementById('minimize-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                state.isMinimized = !state.isMinimized;
                localStorage.setItem('funlinkTimerState', JSON.stringify(state));
                overlay.remove();
                style.remove();
                showTimerAndProgress(state.timer);
            });
        }

        const closeBtn = document.getElementById('close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (confirm('Close overlay?')) {
                    overlay.remove();
                    style.remove();
                    cancelAnimationFrame(animationFrameId);
                }
            });
        }

        const copyLinkIdBtn = document.getElementById('copy-link-id-btn');
        if (copyLinkIdBtn) {
            copyLinkIdBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(state.linkId)
                    .then(() => showToast('Link ID copied!', 'success'))
                    .catch(() => showToast('Copy failed', 'error'));
            });
        }

        const minimizedIcon = document.getElementById('minimized-icon');
        if (minimizedIcon) {
            minimizedIcon.addEventListener('click', () => {
                state.isMinimized = false;
                localStorage.setItem('funlinkTimerState', JSON.stringify(state));
                overlay.remove();
                style.remove();
                showTimerAndProgress(state.timer);
            });
        }

        const timerText = document.getElementById('timer-text');
        if (timerText) {
            timerText.addEventListener('dblclick', () => {
                state.debugMode = !state.debugMode;
                localStorage.setItem('funlinkTimerState', JSON.stringify(state));
                overlay.remove();
                style.remove();
                showTimerAndProgress(state.timer);
            });
        }

        // Update timer
        let animationFrameId = null;
        function updateTimer(start, duration) {
            if (!document.getElementById('timer-overlay')) {
                cancelAnimationFrame(animationFrameId);
                return;
            }
            const elapsed = (performance.now() - start) / 1000;
            state.timer = Math.max(0, duration - elapsed);
            updateOverlayContent();
            if (state.timer <= 0) {
                cancelAnimationFrame(animationFrameId);
                if (overlay && style) {
                    overlay.remove();
                    style.remove();
                }
            } else {
                animationFrameId = requestAnimationFrame(() => updateTimer(start, duration));
            }
        }

        animationFrameId = requestAnimationFrame(() => updateTimer(startTime, seconds));
        setTimeout(() => updateOverlayContent(), 0);
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
            showToast(`Redirect error: ${e.message}`, 'error');
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
            showTimerAndProgress(45);
            updateOverlayContent();

            state.action = 'Sending OPTIONS';
            updateOverlayContent();
            await sendOptions(`${apiBase}code/ch`, rid);

            state.action = 'Waiting';
            updateOverlayContent();
            await new Promise(r => setTimeout(r, 45000));

            state.action = 'Fetching code';
            updateOverlayContent();
            const codeResult = await sendPost(`${apiBase}code/code`, createPayload(keywordData.url_destination), rid, keywordData.url_destination);
            if (!codeResult.success || !codeResult.code) throw new Error('No code');

            state.action = 'Tracking';
            updateOverlayContent();
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
                updateOverlayContent();
                window.location.href = trackingResult.data_link.url;
            } else {
                throw new Error('No valid URL');
            }
        } catch (e) {
            state.action = 'Error';
            state.lastError = e.message;
            showToast(`Error: ${e.message}`, 'error');
            showTimerAndProgress(45);
            updateOverlayContent();
        }
    }

    async function main() {
        try {
            const rid = generateId();
            state.rid = rid;
            const linkId = getLinkId();
            if (!linkId) {
                showToast('No link ID', 'error');
                showTimerAndProgress(45);
                return;
            }

            state.action = 'Checking';
            showTimerAndProgress(45);
            updateOverlayContent();
            const data = await sendGetRequest(`${apiBase}code/renew-key?ignoreId=1&id=${linkId}`, rid);

            if (data.data_keyword === null) {
                state.action = 'Resolving';
                updateOverlayContent();
                const finalUrl = await getFinalUrl(window.location.href, rid);
                if (finalUrl) {
                    state.action = 'Redirecting';
                    state.targetUrl = finalUrl;
                    updateOverlayContent();
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
            showToast(`Error: ${e.message}`, 'error');
            showTimerAndProgress(45);
            updateOverlayContent();
        }
    }

    main();
})();
