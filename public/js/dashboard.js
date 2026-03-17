const API = '/api';

// Listen for language changes to re-render dynamic items
window.addEventListener('clawbridge-lang-change', () => {
    fetchTokens();
    fetchJobs();
    fetchStatus();
});

// --- Utility: HTML Escape ---
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeUrl(url) {
    const value = String(url || '').trim();
    return /^(https?:\/\/|#|\/)/i.test(value) ? value : '#';
}

// --- AUTH ---
const urlParams = new URLSearchParams(window.location.search);
let API_KEY = urlParams.get('key');
if (API_KEY) {
    localStorage.setItem('claw_key', API_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
} else {
    API_KEY = localStorage.getItem('claw_key');
}
if (!API_KEY && location.hostname !== 'localhost') {
    API_KEY = prompt('🔑 Access Key:');
    if (API_KEY) localStorage.setItem('claw_key', API_KEY);
}

async function fetchAuth(url, options = {}) {
    const headers = options.headers || {};
    headers['x-claw-key'] = API_KEY;
    options.headers = headers;
    const res = await fetch(url, options);
    if (res.status === 401) throw new Error('Auth Failed');
    return res;
}

function isUnsupportedMetric(data, key) {
    return Array.isArray(data.unsupportedMonitoring) && data.unsupportedMonitoring.includes(key);
}

async function readErrorMessage(res, fallbackMessage) {
    try {
        const data = await res.json();
        if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
        if (data && typeof data.message === 'string' && data.message.trim()) return data.message;
    } catch (e) { }
    return fallbackMessage;
}

function setMetricValue(id, value, fallback = 'N/A') {
    document.getElementById(id).innerText = value == null ? fallback : value;
}

// --- TAB MANAGEMENT ---
let currentTab = 'home';
let cronInterval = null;

function switchTab(tab) {
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + tab).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const icons = { 'home': 0, 'memory': 1, 'tokens': 2, 'missions': 3, 'settings': 4 };
    document.querySelectorAll('.nav-item')[icons[tab]].classList.add('active');

    currentTab = tab;

    // Logic Switching
    if (tab === 'missions') {
        fetchJobs();
        if (!cronInterval) cronInterval = setInterval(fetchJobs, 15000);
    } else {
        if (cronInterval) { clearInterval(cronInterval); cronInterval = null; }
    }

    if (tab === 'tokens') {
        fetchTokens();
    }

    if (tab === 'memory') {
        initMemory();
    }
}

let memoryDates = [];
let currentMemIndex = 0;

async function initMemory() {
    try {
        const res = await fetchAuth(API + '/memory?list=true');
        memoryDates = await res.json();

        const sel = document.getElementById('memory-selector');
        sel.innerHTML = '';
        memoryDates.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.innerText = d;
            sel.appendChild(opt);
        });

        if (memoryDates.length > 0) {
            fetchMemory(memoryDates[0]);
        } else {
            document.getElementById('memory-content').innerText = t('memory_empty');
        }
    } catch (e) { console.warn('[Memory] Init failed:', e.message); }
}

async function fetchMemory(date) {
    if (!date) return;
    currentMemIndex = memoryDates.indexOf(date);
    document.getElementById('memory-selector').value = date;

    try {
        document.getElementById('memory-content').style.opacity = '0.5';
        const res = await fetchAuth(API + '/memory?date=' + date);
        const data = await res.json();

        // Simple Markdown Rendering
        let html = (data.content || t('memory_empty'))
            .replace(/^# (.*$)/gim, (_match, text) => `<h3 style="margin-top:0;color:var(--accent)">${escapeHtml(text)}</h3>`)
            .replace(/^## (.*$)/gim, (_match, text) => `<h4 style="margin:10px 0 5px;color:var(--text)">${escapeHtml(text)}</h4>`)
            .replace(/\*\*(.*)\*\*/gim, (_match, text) => `<b>${escapeHtml(text)}</b>`)
            .replace(/^\- (.*$)/gim, (_match, text) => `• ${escapeHtml(text)}`)
            .replace(/\[(.*?)\]\((.*?)\)/gim, (_match, label, url) =>
                `<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener" style="color:var(--accent)">${escapeHtml(label)}</a>`);

        document.getElementById('memory-content').innerHTML = html;
        document.getElementById('memory-content').style.opacity = '1';
    } catch (e) {
        document.getElementById('memory-content').innerText = t('memory_failed');
        console.warn('[Memory] Fetch failed:', e.message);
    }
}

function navMemory(delta) {
    const newIndex = currentMemIndex - delta; // List is Newest->Oldest. So "Previous" (Back in time) means Index + 1
    // Wait, UI says "Previous" (Back in time) -> Older Date. "Next" -> Newer Date.
    // If list is [Today, Yesterday, ...], then Older is Index + 1.

    // Let's fix direction:
    // "Previous Day" -> Go to Index + 1
    // "Next Day" -> Go to Index - 1

    let target = currentMemIndex;
    if (delta === -1) target++; // Previous button
    else target--; // Next button

    if (target >= 0 && target < memoryDates.length) {
        fetchMemory(memoryDates[target]);
    }
}

// --- HOME LOGIC ---
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = protocol + '//' + window.location.host;
let ws;
function connectWS() {
    const wsAuthUrl = wsUrl + '?key=' + encodeURIComponent(API_KEY || '');
    ws = new WebSocket(wsAuthUrl);
    ws.onopen = () => console.log('WS Connected');
    ws.onclose = () => setTimeout(connectWS, 3000);
    ws.onmessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (_e) {
            return;
        }
        if (data.type === 'heartbeat') {
            document.getElementById('heartbeat').innerText = new Date(data.ts).toLocaleTimeString();
        }
        // --- Analysis WS Events ---
        if (data.type === 'analysis_complete') {
            handleAnalysisComplete();
        }
        if (data.type === 'analysis_error') {
            handleAnalysisError(data.error);
        }
    };
}
connectWS();

// --- Analysis WS Handlers ---
let _analysisResolve = null;

function handleAnalysisComplete() {
    if (currentTab === 'tokens') {
        fetchTokens();
        try { fetchDiagnostics(); } catch (_) { }
    }
    if (_analysisResolve) {
        _analysisResolve('complete');
        _analysisResolve = null;
    }
}

function handleAnalysisError(error) {
    console.warn('[Analysis] Error:', error);
    if (_analysisResolve) {
        _analysisResolve('error');
        _analysisResolve = null;
    }
}

function timeAgo(ms) {
    if (!ms) return 'Never';
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return sec + 's ago';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    return hr + 'h ago';
}

let lastTask = '';

async function fetchStatus() {
    if (document.hidden) return;
    try {
        const res = await fetchAuth(API + '/status');
        if (!res.ok) {
            console.warn('[Status] Fetch failed:', res.status);
            return;
        }
        const data = await res.json();

        setMetricValue('cpu-val', isUnsupportedMetric(data, 'cpu') ? 'N/A' : (data.cpu == null ? '--%' : data.cpu + '%'));
        setMetricValue('mem-val', isUnsupportedMetric(data, 'mem') ? 'N/A' : (data.mem == null ? '--%' : data.mem + '%'));
        setMetricValue('disk-val', isUnsupportedMetric(data, 'disk') ? 'N/A' : (data.disk == null ? '--%' : data.disk));
        if (data.timezone) document.getElementById('server-tz').innerText = data.timezone;
        if (data.environment && typeof data.environment.isDocker === 'boolean') {
            document.getElementById('runtime-env').innerText = data.environment.isDocker ? 'Docker Mode' : 'Node.js (Systemd)';
        }
        if (data.versions) {
            document.getElementById('ver-core').innerText = data.versions.core;
            document.getElementById('ver-num').innerText = 'v' + data.versions.dashboard;
        }

        // Update PID
        if (isUnsupportedMetric(data, 'gatewayPid')) {
            document.getElementById('gateway-pid').innerText = t('docker_unavailable');
        } else if (data.gatewayPid) {
            document.getElementById('gateway-pid').innerText = data.gatewayPid;
        } else {
            document.getElementById('gateway-pid').innerText = t('gateway_stopped');
        }
        // Update Scripts List
        const scriptList = document.getElementById('running-scripts-list');
        if (isUnsupportedMetric(data, 'scripts')) {
            scriptList.innerHTML = `<div style="opacity:0.7; text-align:center;">${t('docker_unavailable')}</div>`;
        } else if (data.scripts && data.scripts.length > 0) {
            const items = data.scripts.map(s =>
                `<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:2px 0;">
                            <span>${s.name}</span>
                            <span style="opacity:0.5">${s.pid}</span>
                        </div>`
            ).join('');
            scriptList.innerHTML = `<div style="margin-bottom:4px; font-weight:600; color:var(--text)">${t('scripts_running')} (${data.scripts.length}):</div>` + items;
        } else {
            scriptList.innerHTML = `<div style="opacity:0.5; text-align:center;">${t('scripts_none')}</div>`;
        }

        const dot = document.getElementById('status-dot');
        if (data.status === 'busy') {
            dot.className = 'status-dot busy';
            document.getElementById('activity-status').innerText = t('status_busy');
            document.getElementById('activity-status').style.color = 'var(--warning)';
        } else {
            dot.className = 'status-dot active';
            document.getElementById('activity-status').innerText = t('status_idle');
            document.getElementById('activity-status').style.color = 'var(--success)';
        }

        if (data.task && data.task !== 'System Idle' && data.task !== lastTask) {
            addFeedItem(new Date().toISOString(), data.task, 'prepend'); // Live updates go to top
            lastTask = data.task;
        }
    } catch (e) {
        document.getElementById('status-dot').className = 'status-dot error';
    }
}

function addFeedItem(ts, task, method = 'append') {
    const feed = document.getElementById('activity-feed');
    if (feed.children.length === 1) {
        const text = feed.children[0].innerText;
        const isConnecting = Object.values(translations).some(loc => 
            text.includes(loc.connecting.replace('...', ''))
        ) || text.includes('Connecting');
        if (isConnecting) feed.innerHTML = '';
    }

    // Deduplication Logic
    const firstItem = feed.firstElementChild;
    if (firstItem) {
        const textSpan = firstItem.querySelector('span:last-child');
        if (textSpan && textSpan.innerText === task) {
            // Match found! Update time instead of adding new row.
            const timeSpan = firstItem.querySelector('span:first-child');
            const time = new Date(ts).toLocaleTimeString('en-US', { hour12: false });
            timeSpan.innerText = time;

            // Flash effect
            firstItem.style.background = 'rgba(255,255,255,0.1)';
            setTimeout(() => firstItem.style.background = 'transparent', 300);
            return;
        }
    }

    const div = document.createElement('div');
    const time = new Date(ts).toLocaleTimeString('en-US', { hour12: false });

    let color = 'var(--text)';
    if (task.includes('🧠')) color = '#60a5fa';
    if (task.includes('🔧')) color = '#fbbf24';
    if (task.includes('📜')) color = '#c084fc';
    if (task.includes('🤖')) color = '#34d399';
    if (task.includes('📄')) color = '#22d3ee';
    if (task.includes('📝')) color = '#4ade80';

    // Sanitize to prevent HTML injection (which breaks layout/newlines)
    const safeTask = task
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Collapsed view: replace newlines with space
    const collapsedTask = safeTask.replace(/\n/g, ' ');

    div.innerHTML = `<span style="color:var(--text-dim); margin-right:8px; font-size:10px; vertical-align:middle;">${time}</span><span style="color:${color}; vertical-align:middle;">${collapsedTask}</span>`;
    div.dataset.fullText = task; // Store raw text for expansion

    div.style.padding = '6px 4px';
    div.style.minHeight = '18px';
    div.style.lineHeight = '1.5';
    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    div.style.cursor = 'pointer';
    div.style.whiteSpace = 'nowrap';
    div.style.overflow = 'hidden';
    div.style.textOverflow = 'ellipsis';
    div.onclick = function () {
        const contentSpan = this.querySelector('span:last-child');
        if (this.style.whiteSpace === 'nowrap') {
            this.style.whiteSpace = 'pre-wrap';
            this.style.wordBreak = 'break-all';
            this.style.background = 'rgba(255,255,255,0.08)';
            this.style.padding = '8px';
            this.style.borderRadius = '4px';
            contentSpan.innerText = this.dataset.fullText; // Show full
        } else {
            this.style.whiteSpace = 'nowrap';
            this.style.wordBreak = 'normal';
            this.style.background = 'transparent';
            this.style.padding = '6px 4px';
            contentSpan.innerText = this.dataset.fullText.replace(/\n/g, ' '); // Show collapsed
        }
    };

    if (method === 'prepend') {
        feed.prepend(div);
        feed.scrollTop = 0; // Scroll to top for new items
    } else {
        feed.appendChild(div);
    }

    if (feed.children.length > 100) feed.removeChild(feed.children[feed.children.length - 1]);
}

async function fetchHistory() {
    try {
        const res = await fetchAuth(API + '/logs?limit=100');
        if (!res.ok) return;
        const history = await res.json(); // [Newest, ..., Oldest]

        const feed = document.getElementById('activity-feed');
        feed.innerHTML = '';


        history.forEach(item => {
            addFeedItem(item.ts, item.task, 'append');
            lastTask = item.task; // Sync latest seen
        });
    } catch (e) { console.warn('[History] Fetch failed:', e.message); }
}

// --- MISSIONS ---
async function fetchJobs() {
    try {
        const res = await fetchAuth(API + '/cron');
        if (!res.ok) {
            console.warn('[Missions] Fetch failed:', res.status);
            return;
        }
        const jobs = await res.json();
        jobs.sort((a, b) => (b.state?.lastRunAtMs || 0) - (a.state?.lastRunAtMs || 0));

        const container = document.getElementById('job-list');
        container.innerHTML = '';

        if (jobs.length === 0) {
            container.innerHTML = `<div style="text-align:center; opacity:0.5; padding:20px;">${t('no_jobs')}</div>`;
            return;
        }

        jobs.forEach(job => {
            if (!job.enabled) return;
            const lastRun = job.state?.lastRunAtMs;
            const nextRun = job.state?.nextRunAtMs;
            const status = job.state?.lastStatus || 'pending';
            const duration = job.state?.lastDurationMs ? (job.state.lastDurationMs / 1000).toFixed(0) + 's' : '';
            const cron = job.schedule?.expr || 'Manual';

            // Extract script path
            const text = job.payload?.text || '';
            const match = text.match(/'([^']+\.js)'/) || text.match(/"([^"]+\.js)"/);
            const scriptPath = match ? match[1] : null;

            let nextText = '';
            if (nextRun) {
                const now = Date.now();
                const diffMins = Math.round((nextRun - now) / 60000);
                const timeStr = new Date(nextRun).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
                if (diffMins < 60) nextText = `🔜 ${timeStr} (in ${diffMins}m)`;
                else nextText = `🔜 ${timeStr} (in ${(diffMins / 60).toFixed(1)}h)`;
            }

            let badgeClass = 'pending';
            if (status === 'ok') badgeClass = 'ok';
            if (status === 'error' || status === 'skipped') badgeClass = 'fail';

            const div = document.createElement('div');
            div.className = 'job-item';

            let pathHtml = '';
            if (scriptPath) {
                pathHtml = `<div style="font-family:monospace; font-size:10px; color:var(--text-dim); margin-top:3px; word-break:break-all; opacity:0.7;">
                            📄 ${escapeHtml(scriptPath)}
                        </div>`;
            }

            div.innerHTML = `
                        <div class="job-info">
                            <div class="job-name">${escapeHtml(job.name)}</div>
                            ${pathHtml}
                            <div class="job-meta">
                                <span class="badge ${badgeClass}">${escapeHtml(status.toUpperCase())}</span>
                                <span class="job-sched">${escapeHtml(cron)}</span>
                                <span>⏮️ ${timeAgo(lastRun)} ${duration ? `(${escapeHtml(duration)})` : ''}</span>
                                <span class="job-next">${escapeHtml(nextText)}</span>
                            </div>
                        </div>
                        <button class="run-icon" data-job-id="${escapeHtml(job.id)}" aria-label="Run job">▶</button>
                    `;
            const runBtn = div.querySelector('.run-icon');
            if (runBtn) {
                runBtn.addEventListener('click', () => runJob(job.id));
            }
            container.appendChild(div);
        });
    } catch (e) { console.warn('[Missions] Fetch failed:', e.message); }
}

async function runJob(id) {
    if (!confirm(t('confirm_run'))) return;
    const res = await fetchAuth(API + '/run/' + id, { method: 'POST' });
    if (!res.ok) {
        alert(await readErrorMessage(res, t('run_failed')));
        return;
    }
    setTimeout(fetchJobs, 2000);
}

async function killAll() {
    if (!confirm(t('confirm_kill_all'))) return;
    const res = await fetchAuth(API + '/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
    });
    if (!res.ok) {
        alert(await readErrorMessage(res, t('stop_failed')));
    }
}

async function restartGateway() {
    if (!confirm(t('confirm_restart'))) return;
    const res = await fetchAuth(API + '/gateway/restart', { method: 'POST' });
    if (!res.ok) {
        alert(await readErrorMessage(res, t('restart_failed')));
    }
}

async function refreshTokenStats() {
    const btn = document.querySelector('#view-tokens .section-header button') || document.querySelector('#view-tokens button');
    const origText = btn.innerText;

    // Prevent double-click
    if (btn.disabled) return;

    // Set Loading State
    btn.innerText = '⏳ Analyzing...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
        const waitForAnalysis = new Promise(resolve => { _analysisResolve = resolve; });

        // 1. Trigger analysis
        const triggerRes = await fetchAuth(API + '/tokens/refresh', { method: 'POST' });

        if (triggerRes.status === 409) {
            // Already running — wait for WS completion
            btn.innerText = '⏳ In progress...';
        }

        // 2. Wait for WS completion event OR timeout at 30s
        const result = await Promise.race([
            waitForAnalysis,
            new Promise(resolve => setTimeout(() => resolve('timeout'), 30000)),
        ]);

        // 3. Refresh UI regardless of result
        await fetchTokens();

        if (result === 'timeout') {
            console.warn('[Tokens] Refresh timed out, showing latest available data');
        } else if (result === 'error') {
            console.warn('[Tokens] Analysis reported an error');
        }
    } catch (e) {
        console.warn('[Tokens] Refresh trigger failed:', e.message);
        // Try to show whatever data is available
        try { await fetchTokens(); } catch (_) { }
    } finally {
        // Always restore button state
        btn.innerText = origText;
        btn.disabled = false;
        btn.style.opacity = '1';
        _analysisResolve = null;
    }
}

// --- TOKENS ---
let showAllModels = false;

async function fetchTokens() {
    try {
        // Use API, not static file
        const res = await fetchAuth(API + '/tokens');
        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Failed to load token stats'));
        }
        const data = await res.json();
        document.getElementById('token-card').style.display = 'block';

        if (data.updatedAt) {
            const date = new Date(data.updatedAt);
            document.getElementById('token-updated').innerText = date.toLocaleTimeString();
        }

        if (data.today) {
            document.getElementById('token-cost').innerText = '$' + (data.today.cost || 0).toFixed(4);
            document.getElementById('token-in').innerText = ((data.today.input || 0) / 1000).toFixed(1) + 'k';
            document.getElementById('token-out').innerText = ((data.today.output || 0) / 1000).toFixed(1) + 'k';
        }

        // Cache Hit Rate
        const totalInput = (data.total?.input || 0);
        const totalCacheRead = (data.total?.cacheRead || 0);
        const cacheHitRate = (totalInput + totalCacheRead) > 0
            ? ((totalCacheRead / (totalInput + totalCacheRead)) * 100).toFixed(1)
            : '0.0';
        const cacheHitEl = document.getElementById('token-cache-hit-rate');
        if (cacheHitEl) cacheHitEl.innerText = cacheHitRate + '%';

        if (data.total) {
            document.getElementById('grand-total-cost').innerText = '$' + (data.total.cost || 0).toFixed(2);

            // Forecast Logic — use recent 7-day average for smarter estimate
            let avg = 0;
            if (data.recentCosts && data.recentCosts.last7dAvg > 0) {
                avg = data.recentCosts.last7dAvg;
            } else {
                // Fallback to all-time average
                const days = Object.keys(data.history || {}).length || 1;
                avg = (data.total.cost || 0) / days;
            }
            const forecast = avg * 30;
            document.getElementById('monthly-forecast').innerText = '$' + forecast.toFixed(2);
        }

        // Top Models
        if (data.topModels) {
            const list = document.getElementById('top-models-list');
            list.innerHTML = '';
            const modelsToShow = showAllModels ? data.topModels : data.topModels.slice(0, 5);
            modelsToShow.forEach(m => {
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.padding = '8px 0';
                div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                div.style.fontSize = '13px';

                // Clean Name
                let name = m.name.split('/').pop();
                if (name.length > 25) name = name.substring(0, 23) + '..';

                div.innerHTML = `
                            <div style="display:flex;align-items:center">
                                <span style="width:6px;height:6px;background:var(--text-dim);border-radius:50%;margin-right:10px"></span>
                                ${escapeHtml(name)}
                            </div>
                            <span style="font-family:monospace; color:var(--text);">${escapeHtml('$' + m.cost.toFixed(3))}</span>
                        `;
                list.appendChild(div);
            });

            // Show toggle if more than 5 models
            if (data.topModels.length > 5) {
                const toggleDiv = document.createElement('div');
                toggleDiv.style.textAlign = 'center';
                toggleDiv.style.padding = '8px 0';
                toggleDiv.style.fontSize = '12px';
                toggleDiv.style.color = 'var(--accent)';
                toggleDiv.style.cursor = 'pointer';
                const showAllText = t('show_all');
                const showLessText = t('show_less');
                toggleDiv.innerText = showAllModels ? `▲ ${showLessText}` : `▼ ${showAllText} (${data.topModels.length})`;
                toggleDiv.onclick = () => {
                    showAllModels = !showAllModels;
                    fetchTokens();
                };
                list.appendChild(toggleDiv);
            }
        }

        if (data.history) {
            const chart = document.getElementById('trend-chart');
            const labels = document.getElementById('trend-labels');
            chart.innerHTML = '';
            labels.innerHTML = '';
            const days = Object.keys(data.history).sort().slice(-7);
            // Use server timezone for "today" comparison
            const serverTz = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: serverTz });
            if (days.length > 0) {
                const maxCost = Math.max(...days.map(d => data.history[d].cost)) || 0.01;
                days.forEach((day, idx) => {
                    const stats = data.history[day];
                    const height = Math.max(5, (stats.cost / maxCost) * 100);
                    const bar = document.createElement('div');
                    bar.style.width = '100%';
                    bar.style.height = height + '%';
                    bar.style.backgroundColor = 'var(--accent)';
                    bar.style.borderRadius = '4px 4px 0 0';
                    bar.style.opacity = day === todayStr ? '1' : '0.4';

                    // Show cost change percentage vs previous day
                    let changeText = '';
                    if (idx > 0) {
                        const prevDay = days[idx - 1];
                        const prevCost = data.history[prevDay].cost;
                        if (prevCost > 0) {
                            const pct = ((stats.cost - prevCost) / prevCost * 100).toFixed(0);
                            changeText = pct >= 0 ? '+' + pct + '%' : pct + '%';
                        }
                    }

                    bar.onclick = () => {
                        Array.from(chart.children).forEach(c => c.style.opacity = '0.4');
                        bar.style.opacity = '1';
                        const detail = document.getElementById('daily-detail');
                        detail.style.display = 'block';
                        document.getElementById('detail-date').innerText = day;
                        document.getElementById('detail-cost').innerText = '$' + stats.cost.toFixed(4);
                        document.getElementById('detail-input').innerText = ((stats.input || 0) / 1000).toFixed(1) + 'k';
                        document.getElementById('detail-output').innerText = ((stats.output || 0) / 1000).toFixed(1) + 'k';
                        document.getElementById('detail-cache-read').innerText = ((stats.cacheRead || 0) / 1000).toFixed(1) + 'k';
                        document.getElementById('detail-cache-write').innerText = ((stats.cacheWrite || 0) / 1000).toFixed(1) + 'k';

                        // Show change percentage
                        const changeEl = document.getElementById('detail-change');
                        if (changeEl && changeText) {
                            changeEl.innerText = changeText;
                            changeEl.style.color = changeText.startsWith('+') ? 'var(--danger)' : 'var(--success)';
                            changeEl.style.display = 'inline';
                        } else if (changeEl) {
                            changeEl.style.display = 'none';
                        }

                        // Auto Scroll to Detail (Delayed for render)
                        setTimeout(() => {
                            detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 50);
                    };
                    chart.appendChild(bar);
                    const label = document.createElement('div');
                    label.innerText = day.split('-')[2];
                    labels.appendChild(label);
                });
            }
        }
    } catch (e) { console.warn('[Tokens] Fetch failed:', e.message); }
}

// === COST OPTIMIZER LOGIC ===
const container = document.getElementById('flip-container');
const trigger = document.getElementById('scanner-trigger');
const triggerText = document.getElementById('trigger-text');
const triggerBtn = document.getElementById('trigger-btn');
const progress = document.getElementById('scan-progress');
const results = document.getElementById('scan-results');
const success = document.getElementById('success-state');
const stepEl = document.getElementById('scan-step-text');

let actionsApplied = 0;
let totalActions = 0;
let isFullyOptimized = false;
let diagnosticsData = null;
let optimizerProgressTimer = null;
let undoSkillResolver = null;

function clearOptimizerProgressTimer() {
    if (optimizerProgressTimer) {
        clearInterval(optimizerProgressTimer);
        optimizerProgressTimer = null;
    }
}

function openUndoSkillModal(skills) {
    return new Promise((resolve) => {
        undoSkillResolver = resolve;
        const modal = document.getElementById('undo-skill-modal');
        const list = document.getElementById('undo-skill-list');
        list.innerHTML = '';

        skills.forEach((name) => {
            const label = document.createElement('label');
            label.className = 'undo-skill-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'undo-skill-checkbox';
            checkbox.value = name;
            checkbox.checked = true;

            const text = document.createElement('span');
            text.className = 'undo-skill-name';
            text.textContent = name;

            label.appendChild(checkbox);
            label.appendChild(text);
            list.appendChild(label);
        });

        modal.classList.add('active');
    });
}

function setUndoSkillSelection(checked) {
    document.querySelectorAll('.undo-skill-checkbox').forEach((checkbox) => {
        checkbox.checked = checked;
    });
}

function closeUndoSkillModal(result) {
    const modal = document.getElementById('undo-skill-modal');
    modal.classList.remove('active');
    if (undoSkillResolver) {
        const resolve = undoSkillResolver;
        undoSkillResolver = null;
        resolve(result);
    }
}

function confirmUndoSkillSelection() {
    const selected = Array.from(document.querySelectorAll('.undo-skill-checkbox'))
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);
    closeUndoSkillModal(selected);
}



async function fetchDiagnostics() {
    try {
        const res = await fetchAuth(API + '/diagnostics?nocache=' + Date.now());
        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Failed to load diagnostics'));
        }
        diagnosticsData = await res.json();
        // Normalize field name (backend sends totalMonthlySavings)
        diagnosticsData.monthlySavings = diagnosticsData.totalMonthlySavings || 0;
        diagnosticsData.advisorySavings = diagnosticsData.advisoryMonthlySavings || 0;

        const actions = diagnosticsData.actions || [];
        totalActions = actions.filter(a => a.type !== 'advisory').length;

        if (diagnosticsData.noData) {
            trigger.style.display = 'flex';
            trigger.classList.add('all-done');
            triggerText.innerHTML = '<strong>No usage data yet.</strong> Start chatting with your AI agent, then come back to see Token cost analysis and savings.';
            triggerBtn.textContent = 'History';
            isFullyOptimized = true;
        } else if (totalActions > 0) {
            trigger.style.display = 'flex';
            trigger.classList.remove('all-done');
            if (diagnosticsData.monthlySavings > 0) {
                const advisoryNote = diagnosticsData.advisorySavings > 0
                    ? ` <span class="opt-advisory-note">+ manual ~$${diagnosticsData.advisorySavings.toFixed(2)}/mo</span>`
                    : '';
                triggerText.innerHTML = `<strong>${totalActions} action${totalActions > 1 ? 's' : ''}</strong> available. Tap to save <span class="et-savings" id="trigger-savings">\$${diagnosticsData.monthlySavings.toFixed(2)}/mo</span>.${advisoryNote}`;
            } else {
                triggerText.innerHTML = `<strong>${totalActions} action${totalActions > 1 ? 's' : ''}</strong> found. Tap to review & protect.`;
            }
            triggerBtn.textContent = 'Optimize';
            isFullyOptimized = false;
        } else {
            isFullyOptimized = true;
            trigger.style.display = 'flex';
            trigger.classList.add('all-done');
            triggerText.innerHTML = '<strong>System Optimized.</strong> Token usage is highly efficient.';
            triggerBtn.textContent = 'History';
        }

        // Re-render current view if visible
        refreshFlippedOptimizerView();
    } catch (e) {
        console.error('Failed to load diagnostics', e);
        showToast(e.message || 'Failed to load diagnostics');
    }
}

function refreshFlippedOptimizerView() {
    if (!container.classList.contains('flipped')) return;

    clearOptimizerProgressTimer();
    progress.style.display = 'none';

    if (isFullyOptimized) {
        results.style.display = 'none';
        success.style.display = 'flex';
        renderHistoryList();
    } else {
        success.style.display = 'none';
        results.style.display = 'flex';
        renderOptimizerList();
    }
}

function renderSkillAuditList(meta) {
    let html = '<div class="skill-audit-list">';
    const defaultCount = meta.defaultSelectedCount || 0;
    html += `<div class="skill-audit-summary">
        <span class="skill-audit-summary-text">Checked = remove. Unchecked = keep. ${defaultCount > 0 ? `${defaultCount} suggested for removal by default.` : 'Nothing is pre-selected by default.'}</span>
        <div class="skill-audit-actions">
            <button type="button" class="skill-audit-action" data-skill-action="keep-all">Keep All</button>
            <button type="button" class="skill-audit-action" data-skill-action="remove-flagged">Remove All</button>
        </div>
    </div>`;
    if (meta.idleSkills && meta.idleSkills.length > 0) {
        html += '<div class="skill-group"><span class="skill-group-label idle">Suggested Remove (' + meta.idleSkills.length + ')</span>';
        meta.idleSkills.forEach(s => {
            html += `<label class="skill-badge idle"><input type="checkbox" class="skill-checkbox" checked data-skill-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} <small>${s.daysSince}d</small> <span class="skill-choice">Remove</span></label>`;
        });
        html += '</div>';
    }
    if (meta.quietSkills && meta.quietSkills.length > 0) {
        html += '<div class="skill-group"><span class="skill-group-label quiet">Review Manually (' + meta.quietSkills.length + ')</span>';
        meta.quietSkills.forEach(s => {
            html += `<label class="skill-badge quiet"><input type="checkbox" class="skill-checkbox" data-skill-name="${escapeHtml(s.name)}">${escapeHtml(s.name)} <small>${s.daysSince}d</small> <span class="skill-choice">Keep</span></label>`;
        });
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function updateSkillAuditSelection(itemEl) {
    const skillCheckboxes = itemEl.querySelectorAll('.skill-checkbox');
    let selectedCount = 0;
    skillCheckboxes.forEach(cb => {
        if (cb.checked) selectedCount++;
        const choice = cb.closest('.skill-badge')?.querySelector('.skill-choice');
        if (choice) choice.textContent = cb.checked ? 'Remove' : 'Keep';
    });

    const currentMeta = JSON.parse(itemEl.getAttribute('data-meta') || '{}');
    const selectedSkillNames = [];
    skillCheckboxes.forEach(cb => {
        if (cb.checked) selectedSkillNames.push(cb.dataset.skillName);
    });
    currentMeta.selectedSkillNames = selectedSkillNames;
    itemEl.setAttribute('data-meta', JSON.stringify(currentMeta));

    const perSkillSavings = Number(currentMeta.perSkillSavings) || 0;
    const selectedSavings = selectedCount * perSkillSavings;
    itemEl.setAttribute('data-savings', selectedSavings);
    const tag = itemEl.querySelector(`#savings-tag-${itemEl.getAttribute('data-action')}`);
    if (tag) {
        tag.textContent = selectedSavings > 0 ? `-$${selectedSavings.toFixed(2)}/mo` : '🛡️ Review';
    }
}

function renderActionItem(act, isSkipped = false) {
    const savingsStr = act.savings > 0 ? `-$${act.savings.toFixed(2)}/mo` : '🛡️ Protection';
    const savingsClass = act.savings > 10 ? 'high-savings' : (act.savings > 0 ? 'medium-savings' : 'safety');
    const initialMeta = act._meta && typeof act._meta === 'object' && !Array.isArray(act._meta)
        ? { ...act._meta }
        : {};

    // L2: Side effect in plain language
    let sideEffectHtml = '';
    if (act.plainSideEffect || act.sideEffect) {
        sideEffectHtml = `<div class="opt-sideeffect">${escapeHtml(act.plainSideEffect || act.sideEffect)}</div>`;
    }

    // L1: Use plainTitle (beginner-friendly), fallback to title
    const displayTitle = act.plainTitle || act.title;

    // A02 with multi-interval options
    let optionsHtml = '';
    if (act.actionId === 'A02' && act.options && act.options.length > 0) {
        const initialOption = act.options[0];
        if (initialOption) {
            initialMeta.interval = initialOption.value;
            act = { ...act, savings: initialOption.savings };
        }
        const optItems = act.options.map((opt, i) => {
            const checked = i === 0 ? ' checked' : '';
            const isDisable = opt.value === '0m';
            const labelClass = isDisable ? 'opt-radio-disable' : '';
            return `<label class="opt-radio ${labelClass}">
                <input type="radio" name="${isSkipped ? 'skip-' : ''}hb-interval-${act.actionId}" value="${opt.value}" data-savings="${opt.savings}"${checked}>
                <span class="opt-radio-label">${escapeHtml(opt.label)}</span>
                <span class="opt-radio-savings">${opt.savingsStr}</span>
            </label>`;
        }).join('');
        optionsHtml = `<div class="opt-interval-selector" style="margin:8px 0;display:flex;flex-direction:column;gap:4px;">${optItems}</div>`;
    }

    // L3: Collapsible technical details
    let detailsHtml = '';
    const detailParts = [];
    if (act.configDiff) {
        const d = act.configDiff;
        detailParts.push(`<div class="opt-diff"><span class="diff-key">${escapeHtml(d.key)}:</span> <span class="diff-from">${escapeHtml(d.from)}</span> <span class="diff-arrow">\u2192</span> <span class="diff-to">${escapeHtml(d.to)}</span></div>`);
    }
    if (act.calcDetail) {
        detailParts.push(`<div class="opt-calc">\ud83d\udcd0 ${escapeHtml(act.calcDetail)}</div>`);
    }
    if (act.codeTag) {
        detailParts.push(`<div class="opt-codetag"><code>${escapeHtml(act.codeTag)}</code></div>`);
    }
    if (detailParts.length > 0) {
        detailsHtml = `<details class="opt-details"><summary>Technical Details</summary><div class="opt-details-body">${detailParts.join('')}</div></details>`;
    }

    const tooltipHtml = act.helpText ? `<span class="opt-help" onclick="toggleHelp(this, event)">?</span>` : '';
    const helpBoxHtml = act.helpText ? `<div class="opt-help-box">${escapeHtml(act.helpText)}</div>` : '';
    const tagInteractive = act.savings === 0 ? ' interactive' : '';
    const tagOnclick = act.savings === 0 ? ' onclick="toggleHelp(this, event)"' : '';

    const actionButtons = isSkipped 
        ? `<button class="btn-skip" onclick="handleUnskip('${act.actionId}')">Restore</button>
           <button class="btn-mini" onclick="handleOpt(this, '${act.actionId}')">Apply Anyway</button>`
        : `<button class="btn-skip" onclick="handleSkip(this, '${act.actionId}')">Skip</button>
           <button class="btn-mini" onclick="handleOpt(this, '${act.actionId}')"><span class="default-label">Apply</span><span class="confirm-label">Confirm?</span><span class="applying-label">Applying\u2026</span><span class="done-label">\u2713 Applied</span></button>`;
    const metaAttr = Object.keys(initialMeta).length > 0
        ? ' data-meta=\'' + JSON.stringify(initialMeta).replace(/'/g, '&#39;') + '\''
        : '';

    const itemHtml = `
                <div class="opt-item ${savingsClass} ${isSkipped ? 'is-skipped' : ''}" data-action="${act.actionId}" data-savings="${act.savings}"${metaAttr}>
                    <div class="opt-header"><span class="opt-title">${escapeHtml(displayTitle)} ${tooltipHtml}</span><span class="opt-savings-tag${tagInteractive}" id="savings-tag-${act.actionId}"${tagOnclick}>${savingsStr}</span></div>
                    <div class="opt-desc">${escapeHtml(act.description || '')}</div>
                    ${act._meta && act._meta.type === 'skill-audit' ? renderSkillAuditList(act._meta) : ''}
                    ${helpBoxHtml}
                    ${sideEffectHtml}
                    ${optionsHtml}
                    ${detailsHtml}
                    <div class="opt-action-line" style="justify-content: flex-end; gap: 8px;">
                        ${act.type === 'advisory' ? '<span class="btn-advisory">ℹ️ Manual Action</span>' : actionButtons}
                    </div>
                </div>`;

    const temp = document.createElement('div');
    temp.innerHTML = itemHtml;
    const itemEl = temp.firstElementChild;

    // Wire up radio change
    const radioName = `${isSkipped ? 'skip-' : ''}hb-interval-${act.actionId}`;
    itemEl.querySelectorAll(`input[name="${radioName}"]`).forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedSavings = parseFloat(radio.getAttribute('data-savings')) || 0;
            itemEl.setAttribute('data-savings', selectedSavings);
            const tag = itemEl.querySelector(`#savings-tag-${act.actionId}`);
            if (tag) tag.textContent = `-$${selectedSavings.toFixed(2)}/mo`;
            const currentMeta = JSON.parse(itemEl.getAttribute('data-meta') || '{}');
            currentMeta.interval = radio.value;
            itemEl.setAttribute('data-meta', JSON.stringify(currentMeta));
        });
    });

    // Wire up A04 skill checkboxes
    if (act.actionId === 'A04' && act._meta) {
        const skillCheckboxes = itemEl.querySelectorAll('.skill-checkbox');
        const applyBtn = itemEl.querySelector('.btn-mini');
        const keepAllBtn = itemEl.querySelector('[data-skill-action="keep-all"]');
        const removeAllBtn = itemEl.querySelector('[data-skill-action="remove-flagged"]');

        skillCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => updateSkillAuditSelection(itemEl));
        });
        if (keepAllBtn) {
            keepAllBtn.addEventListener('click', () => {
                skillCheckboxes.forEach(cb => { cb.checked = false; });
                updateSkillAuditSelection(itemEl);
            });
        }
        if (removeAllBtn) {
            removeAllBtn.addEventListener('click', () => {
                skillCheckboxes.forEach(cb => { cb.checked = true; });
                updateSkillAuditSelection(itemEl);
            });
        }
        if (applyBtn) {
            applyBtn.removeAttribute('onclick'); // Override default handleOpt
            applyBtn.addEventListener('click', () => {
                const selected = [];
                skillCheckboxes.forEach(cb => { if (cb.checked) selected.push(cb.dataset.skillName); });
                if (selected.length === 0) { showToast('Please select at least one skill to remove'); return; }
                const currentMeta = JSON.parse(itemEl.getAttribute('data-meta') || '{}');
                currentMeta.selectedSkillNames = selected;
                itemEl.setAttribute('data-meta', JSON.stringify(currentMeta));
                handleOpt(applyBtn, 'A04');
            });
        }
        updateSkillAuditSelection(itemEl);
    }

    return itemEl;
}

function renderOptimizerList() {
    if (!diagnosticsData) return;
    actionsApplied = 0;
    totalActions = (diagnosticsData.actions || []).filter(act => act.type !== 'advisory').length;

    // Update Header
    if (diagnosticsData.totalMonthlySavings > 0) {
        document.getElementById('main-savings-amount').innerText = '$' + diagnosticsData.totalMonthlySavings.toFixed(2);
        document.getElementById('main-savings-amount').style.fontSize = '56px';
    } else {
        document.getElementById('main-savings-amount').innerText = '🛡️ Preventative';
        document.getElementById('main-savings-amount').style.fontSize = '36px';
    }

    const currentCost = diagnosticsData.currentMonthlyCost || 0;
    const optimizedCost = Math.max(0, currentCost - diagnosticsData.totalMonthlySavings);

    const currentEl = document.querySelector('.cost-compare-val.current');
    const optimizedEl = document.querySelector('.cost-compare-val.optimized');
    if (currentEl) currentEl.innerText = '$' + currentCost.toFixed(2);
    if (optimizedEl) optimizedEl.innerText = '$' + optimizedCost.toFixed(2);

    const list = document.getElementById('opt-list');
    list.innerHTML = '';

    // Render Active Actions
    (diagnosticsData.actions || []).forEach(act => {
        list.appendChild(renderActionItem(act, false));
    });

    // Render Skipped Actions (if any)
    const skipped = diagnosticsData.skippedActions || [];
    if (skipped.length > 0) {
        const skippedWrapper = document.createElement('div');
        skippedWrapper.style.marginTop = '30px';
        skippedWrapper.innerHTML = `
            <div class="section-header-small" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; border: 1px dashed var(--border);" onclick="this.nextElementSibling.classList.toggle('hidden')">
                <span>Skipped Recommendations (${skipped.length})</span>
                <span style="font-size:10px; opacity:0.6; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">Toggle View</span>
            </div>
            <div id="skipped-list" class="opt-list" style="margin-top:12px; border-top:1px solid var(--border); padding-top:12px; opacity: 0.9;"></div>
        `;
        list.appendChild(skippedWrapper);
        const skippedListContainer = skippedWrapper.querySelector('#skipped-list');
        skipped.forEach(act => {
            skippedListContainer.appendChild(renderActionItem(act, true));
        });
    }

    // Display cache hit rate
    const cacheEl = document.getElementById('optimizer-cache-hit-rate');
    if (cacheEl && diagnosticsData.cacheHitRate !== undefined) {
        const rate = (diagnosticsData.cacheHitRate * 100).toFixed(1);
        const color = diagnosticsData.cacheHitRate >= 0.5 ? 'var(--accent-green)' : (diagnosticsData.cacheHitRate >= 0.1 ? 'rgba(245, 158, 11, 0.9)' : '#ef4444');
        cacheEl.innerHTML = `<span style="color:${color}">${rate}%</span>`;
        cacheEl.parentElement.style.display = '';
    }
}

async function renderHistoryList() {
        const successSkippedSection = document.getElementById('success-skipped-section');
        const successSkippedList = document.getElementById('success-skipped-list');
        const skipped = (diagnosticsData && diagnosticsData.skippedActions) || [];

        if (successSkippedSection && successSkippedList) {
            if (skipped.length > 0) {
                successSkippedSection.classList.remove('hidden');
                successSkippedList.innerHTML = '';
                skipped.forEach(act => {
                    const itemNode = renderActionItem(act, true);
                    if (itemNode) {
                        successSkippedList.appendChild(itemNode);
                    }
                });
            } else {
                successSkippedSection.classList.add('hidden');
            }
        }

    // 2. Render Optimization History
    try {
        const res = await fetchAuth(API + '/optimizations/history');
        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Failed to load optimization history'));
        }
        const history = await res.json();
        renderHistoryTimeline(document.getElementById('timeline-list'), history);
        renderHistoryTimeline(document.getElementById('active-timeline-list'), history);
    } catch (e) {
        console.warn('[Optimizer] History load failed:', e.message);
        renderHistoryTimeline(document.getElementById('timeline-list'), []);
        renderHistoryTimeline(document.getElementById('active-timeline-list'), []);
    }
}

function renderHistoryTimeline(list, history) {
    if (!list) return;
    list.innerHTML = '';

    if (history.length === 0) {
        list.innerHTML = '<div style="color:var(--text-dim); font-size:12px;">No recent optimizations found.</div>';
        return;
    }

    history.forEach((hist, i) => {
        const date = new Date(hist.timestamp);
        const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let title = hist.title || ('Applied: ' + hist.actionId);
        if (hist.actionId === 'A01') title = 'Switched to a more efficient Model';
        if (hist.actionId === 'A02') title = 'Adjusted Heartbeat Interval';
        if (hist.actionId === 'A03') title = 'Reduced Session Resets';
        if (hist.actionId === 'A04') title = 'Reviewed Installed Skills';
        if (hist.actionId === 'A05') title = 'Reduced AI Thinking Allowance';
        if (hist.actionId === 'A06') title = 'Enabled Prompt Caching';
        if (hist.actionId === 'A07') title = 'Enabled Compaction Safeguard';
        if (hist.actionId === 'A09') title = 'Reduced Output Verbosity';
        if (hist.actionId === 'UNDO') title = '↩️ Rolled back to previous config';

        const savingsTag = hist.savings > 0 ? ` — saved $${Number(hist.savings).toFixed(2)}/mo` : '';

        const canShowUndo = i === 0 && hist.backupPath && hist.undoable && hist.actionId !== 'UNDO';
        const isUndoBlockedByNewerChanges = i > 0 && hist.backupPath && hist.undoable && hist.actionId !== 'UNDO';

        let undoHtml = '';
        if (canShowUndo) {
            const undoLabel = hist.actionId === 'A04' ? 'Restore Skills' : 'Undo';
            undoHtml = `<button class="btn-undo" data-backup-path="${encodeURIComponent(hist.backupPath)}">${undoLabel}</button>`;
        }

        let undoNoticeHtml = '';
        if (isUndoBlockedByNewerChanges) {
            undoNoticeHtml = '<div class="timeline-note">Undo unavailable after newer changes.</div>';
        }

        let effectHtml = '';
        const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= 7 && hist.preOptCostSnapshot && hist.actionId !== 'UNDO' && diagnosticsData) {
            const actualCost = diagnosticsData.currentMonthlyCost || 0;
            const actualSaving = hist.preOptCostSnapshot - actualCost;
            const effectClass = actualSaving >= hist.savings * 0.8 ? 'effect-good' : 'effect-partial';
            effectHtml = `<span class="effect-tag ${effectClass}">7d: $${actualSaving.toFixed(2)}</span>`;
        }

        const detailsHtml = hist.configChanged ? `<div class="timeline-details hidden">${escapeHtml(hist.configChanged)}</div>` : '';
        const clickHandler = hist.configChanged ? 'style="cursor:pointer;" onclick="this.querySelector(\'.timeline-details\').classList.toggle(\'hidden\')"' : '';

        const div = document.createElement('div');
        div.className = 'timeline-item';
        const dotColor = hist.actionId === 'UNDO' ? 'rgba(245, 158, 11, 0.8)' : (i === 0 ? 'var(--accent-green)' : 'var(--text-dim)');
        div.innerHTML = `
                        <div class="timeline-dot" style="border-color: ${dotColor};"></div>
                        <div class="timeline-time">${timeStr}</div>
                        <div class="timeline-content" ${clickHandler}>
                            ${escapeHtml(title)}${savingsTag} ${effectHtml} ${undoHtml}
                            ${detailsHtml}
                            ${undoNoticeHtml}
                        </div>
                    `;
        const undoBtn = div.querySelector('.btn-undo');
        if (undoBtn) {
            undoBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                handleUndo(undoBtn, decodeURIComponent(undoBtn.dataset.backupPath || ''));
            });
        }
        list.appendChild(div);
    });
}

function setUndoButtonState(button, pending) {
    if (!button) return;
    if (pending) {
        button.disabled = true;
        if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
        button.textContent = 'Undoing...';
    } else {
        button.disabled = false;
        if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    }
}

async function handleUndo(triggerBtn, backupPath) {
    setUndoButtonState(triggerBtn, true);
    try {
        let selectedSkillNames;
        const previewRes = await fetchAuth(API + '/optimizations/undo-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupPath })
        });
        const preview = previewRes.ok ? await previewRes.json() : null;

        if (preview && Array.isArray(preview.restorableSkills) && preview.restorableSkills.length > 0) {
            const response = await openUndoSkillModal(preview.restorableSkills);
            if (response === null) {
                setUndoButtonState(triggerBtn, false);
                return;
            }
            if (response.length === 0) {
                showToast('Select at least one skill to restore');
                setUndoButtonState(triggerBtn, false);
                return;
            }
            if (response.length !== preview.restorableSkills.length) selectedSkillNames = response;
        } else if (!confirm('Undo this optimization? Your config will be restored from the backup.')) {
            setUndoButtonState(triggerBtn, false);
            return;
        }

        showToast('Undo in progress...');
        const res = await fetchAuth(API + '/optimizations/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupPath, selectedSkillNames })
        });
        if (res.ok) {
            const result = await res.json();
            const skillSuffix = result.skillsRestored ? ` and ${result.skillsRestored} skill${result.skillsRestored > 1 ? 's' : ''}` : '';
            showToast(`✓ Restored ${result.restoredKeys.length} settings${skillSuffix} from ${result.backupFile}`);
            await renderHistoryList();
            await fetchDiagnostics();
        } else {
            showToast('Undo failed: ' + ((await res.json().catch(() => ({}))).details || 'Unknown error'));
        }
    } catch (e) {
        showToast('Undo failed: ' + e.message);
    } finally {
        setUndoButtonState(triggerBtn, false);
    }
}

function flipToOptimizer() {
    trigger.style.display = 'none';
    container.classList.add('flipped');

    if (!isFullyOptimized) {
        renderOptimizerList();

        progress.style.display = 'block';
        results.style.display = 'none';
        success.style.display = 'none';

        const steps = ["Reading history...", "Calculating tokens...", "Checking models...", "Cross-referencing config...", "Finalizing measures..."];
        let i = 0;
        stepEl.textContent = steps[0];
        clearOptimizerProgressTimer();
        optimizerProgressTimer = setInterval(() => {
            i++;
            if (i < steps.length) { stepEl.textContent = steps[i]; }
            else {
                clearOptimizerProgressTimer();
                progress.style.display = 'none';
                results.style.display = 'flex';
            }
        }, 300);
    } else {
        renderHistoryList();
        progress.style.display = 'none';
        results.style.display = 'none';
        success.style.display = 'flex';
    }
}

function flipToDashboard() {
    clearOptimizerProgressTimer();
    container.classList.remove('flipped');
    fetchDiagnostics();
    setTimeout(() => { trigger.style.display = 'flex'; }, 800);
}

async function handleSkip(btn, actionId) {
    if (!confirm('Ignore this recommendation? You can reset ignored items in Settings.')) return;
    btn.disabled = true;
    try {
        const res = await fetchAuth(API + '/optimize/' + actionId + '/skip', { method: 'POST' });
        if (res.ok) {
            const item = btn.closest('.opt-item');
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            await fetchDiagnostics();
            showToast('Recommendation skipped');
        } else {
            btn.disabled = false;
            showToast(await readErrorMessage(res, 'Skip failed'));
        }
    } catch (e) {
        btn.disabled = false;
        showToast('Network error');
    }
}

async function handleUnskip(actionId) {
    try {
        const res = await fetchAuth(API + '/optimize/' + actionId + '/unskip', { method: 'POST' });
        if (res.ok) {
            await fetchDiagnostics();
            showToast('Recommendation restored');
        } else {
            showToast(await readErrorMessage(res, 'Restore failed'));
        }
    } catch (e) {
        showToast('Restore failed');
    }
}

async function handleOpt(btn, actionId) {
    const item = btn.closest('.opt-item');
    if (!btn.classList.contains('confirming')) {
        btn.classList.add('confirming');
        btn._timer = setTimeout(() => { btn.classList.remove('confirming'); }, 3000);
    } else {
        clearTimeout(btn._timer);
        btn.classList.remove('confirming');

        // Disable button during request (loading state)
        btn.disabled = true;
        btn.classList.add('applying');

        try {
            const savingsVal = parseFloat(item.getAttribute('data-savings')) || 0;
            let meta;
            try { meta = JSON.parse(item.getAttribute('data-meta')); } catch (_e) { /* no meta */ }
            const payload = { savings: savingsVal };
            if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
                payload.meta = meta;
            }

            const res = await fetchAuth(API + '/optimize/' + actionId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                btn.classList.remove('applying');
                item.classList.add('done');
                const appliedSkippedRecommendation = item.classList.contains('is-skipped');
                if (!item.classList.contains('is-skipped')) {
                    actionsApplied++;
                }

                const mainAmount = document.getElementById('main-savings-amount');
                const cur = parseFloat(String(mainAmount.textContent).replace(/[^0-9.-]/g, ''));
                if (Number.isFinite(cur)) {
                    mainAmount.textContent = '$' + Math.max(0, cur - savingsVal).toFixed(2);
                }

                showToast(appliedSkippedRecommendation ? 'Skipped recommendation applied' : 'Optimization applied');

                if (actionsApplied >= totalActions) {
                    setTimeout(showSuccess, 1000);
                }
            } else {
                btn.classList.remove('applying');
                btn.disabled = false;
                showToast('Optimization failed: ' + ((await res.json().catch(() => ({}))).details || 'Unknown error'));
            }
        } catch (e) {
            btn.classList.remove('applying');
            btn.disabled = false;
            showToast('Network error: ' + e.message);
        }
    }
}

// --- INIT ---
if (window.location.hostname.endsWith('trycloudflare.com')) {
    document.getElementById('quick-tunnel-alert').style.display = 'block';
}

async function resetSkips() {
    if (!confirm('Reset all ignored recommendations?')) return;
    try {
        const res = await fetchAuth(API + '/optimize/reset-skips', { method: 'POST' });
        if (res.ok) {
            showToast('Reset successful');
            fetchDiagnostics();
        }
    } catch (e) {
        showToast('Reset failed');
    }
}

fetchHistory();
fetchStatus();
checkUpdate(); // Check on load
fetchDiagnostics(); // Load diagnostics on init

setInterval(fetchStatus, 5000);

/* Tab Swipe Logic */
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, false);

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, false);

function handleSwipe() {
    if (currentTab !== 'memory') return;
    const threshold = 50;
    if (touchEndX < touchStartX - threshold) navMemory(1); // Swipe Left -> Next Day
    if (touchEndX > touchStartX + threshold) navMemory(-1); // Swipe Right -> Prev Day
}

function toggleLegend(show) {
    const modal = document.getElementById('legend-modal');
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
}

function showTokenHelp() {
    toggleTokenHelp(true);
}

function toggleTokenHelp(show) {
    const modal = document.getElementById('token-modal');
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
}

function toggleUpdateHelp(show) {
    const modal = document.getElementById('update-modal');
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
}

function showUpdateHelp() { toggleUpdateHelp(true); }

function copyText(el, text) {
    navigator.clipboard.writeText(text);
    const icon = el.querySelector('.copy-icon');
    const original = icon.innerText;
    icon.innerText = '✅';
    setTimeout(() => icon.innerText = original, 2000);
}

function skipVersion() {
    const ver = document.getElementById('update-ver').innerText;
    localStorage.setItem('clawbridge_skip_version', ver);
    toggleUpdateHelp(false);
    document.getElementById('update-alert').style.display = 'none';
}

async function checkUpdate() {
    try {
        // Get Local Version
        const statusRes = await fetchAuth(API + '/status');
        const statusData = await statusRes.json();
        const currentVer = statusData.versions?.dashboard || '0.0.0';

        // Get Remote Version (via Backend Proxy)
        const checkRes = await fetchAuth(API + '/check_update');
        const remoteData = await checkRes.json();
        const remoteVer = remoteData.version;

        if (remoteVer && remoteVer !== currentVer && semverCompare(remoteVer, currentVer) > 0) {
            // Check skipped
            if (localStorage.getItem('clawbridge_skip_version') === remoteVer) return;

            document.getElementById('update-ver').innerText = 'v' + remoteVer;
            document.getElementById('update-alert').style.display = 'block';
        }
    } catch (e) { console.warn('[Update] Check failed:', e.message); }
}

// Semantic version comparison: returns >0 if a > b, <0 if a < b, 0 if equal
function semverCompare(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(Number);
    const pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

function showToast(message) {
    let toast = document.getElementById('opt-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'opt-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--card);color:var(--text);padding:10px 20px;border-radius:8px;border:1px solid rgba(255,80,80,0.4);font-size:13px;z-index:9999;opacity:0;transition:opacity 0.3s;max-width:90vw;text-align:center;';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

function showSuccess() {
    isFullyOptimized = true;
    results.style.opacity = '0';
    results.style.transition = 'opacity 0.5s';
    setTimeout(() => {
        results.style.display = 'none';
        success.style.display = 'flex';
        renderHistoryList(); // Refresh history
        trigger.classList.add('all-done');
        triggerText.innerHTML = '<strong>System Optimized.</strong> Token usage is 100% efficient.';
        triggerBtn.textContent = 'History';
    }, 500);
}

function toggleHelp(el, event) {
    if (event) event.stopPropagation();
    const item = el.closest('.opt-item');
    if (!item) return;
    const box = item.querySelector('.opt-help-box');
    if (box) {
        box.classList.toggle('active');
        el.classList.toggle('active');
    }
}
