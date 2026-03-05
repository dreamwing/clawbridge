const API = '/api';

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
            document.getElementById('memory-content').innerText = 'No memories found.';
        }
    } catch (e) { }
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
        let html = (data.content || '')
            .replace(/^# (.*$)/gim, '<h3 style="margin-top:0;color:var(--accent)">$1</h3>')
            .replace(/^## (.*$)/gim, '<h4 style="margin:10px 0 5px;color:var(--text)">$1</h4>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/^- (.*$)/gim, '• $1')
            .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');

        document.getElementById('memory-content').innerHTML = html;
        document.getElementById('memory-content').style.opacity = '1';
    } catch (e) {
        document.getElementById('memory-content').innerText = 'Failed to load memory.';
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
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') {
            document.getElementById('heartbeat').innerText = new Date(data.ts).toLocaleTimeString();
        }
    };
}
connectWS();

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
        const data = await res.json();

        document.getElementById('cpu-val').innerText = data.cpu + '%';
        document.getElementById('mem-val').innerText = data.mem + '%';
        if (data.disk) document.getElementById('disk-val').innerText = data.disk;
        if (data.timezone) document.getElementById('server-tz').innerText = data.timezone;
        if (data.versions) {
            document.getElementById('ver-core').innerText = data.versions.core;
            document.getElementById('ver-num').innerText = 'v' + data.versions.dashboard;
        }

        // Update PID
        if (data.gatewayPid) {
            document.getElementById('gateway-pid').innerText = data.gatewayPid;
        } else {
            document.getElementById('gateway-pid').innerText = 'Stopped / Not Found';
        }

        // Update Scripts List
        const scriptList = document.getElementById('running-scripts-list');
        if (data.scripts && data.scripts.length > 0) {
            const items = data.scripts.map(s =>
                `<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding:2px 0;">
                            <span>${s.name}</span>
                            <span style="opacity:0.5">${s.pid}</span>
                        </div>`
            ).join('');
            scriptList.innerHTML = `<div style="margin-bottom:4px; font-weight:600; color:var(--text)">Running (${data.scripts.length}):</div>` + items;
        } else {
            scriptList.innerHTML = '<div style="opacity:0.5; text-align:center;">No scripts running</div>';
        }

        const dot = document.getElementById('status-dot');
        if (data.status === 'busy') {
            dot.className = 'status-dot busy';
            document.getElementById('activity-status').innerText = '● Busy';
            document.getElementById('activity-status').style.color = 'var(--warning)';
        } else {
            dot.className = 'status-dot active';
            document.getElementById('activity-status').innerText = '● Idle';
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
    if (feed.children.length === 1 && feed.children[0].innerText.includes('Connecting')) {
        feed.innerHTML = '';
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

        // Append in order: Newest at Top (via simple append order if list is New->Old? No.)
        // If we want Newest at TOP:
        // DOM:
        // [Newest]
        // [Older]
        // [Oldest]

        // history array is [Newest, Older, Oldest]
        // If we appendChild(Newest), then appendChild(Older)...
        // Result:
        // [Newest]
        // [Older]
        // Perfect.

        history.forEach(item => {
            addFeedItem(item.ts, item.task, 'append');
            lastTask = item.task; // Sync latest seen
        });

        // No scroll to bottom needed
    } catch (e) { }
}

// --- MISSIONS ---
async function fetchJobs() {
    try {
        const res = await fetchAuth(API + '/cron');
        const jobs = await res.json();
        jobs.sort((a, b) => (b.state?.lastRunAtMs || 0) - (a.state?.lastRunAtMs || 0));

        const container = document.getElementById('job-list');
        container.innerHTML = '';

        if (jobs.length === 0) {
            container.innerHTML = '<div style="text-align:center; opacity:0.5; padding:20px;">No jobs found</div>';
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
                            📄 ${scriptPath}
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
                        <button class="run-icon" onclick="runJob('${escapeHtml(job.id)}')" aria-label="Run job">▶</button>
                    `;
            container.appendChild(div);
        });
    } catch (e) { }
}

async function runJob(id) {
    if (!confirm('Execute task?')) return;
    await fetchAuth(API + '/run/' + id, { method: 'POST' });
    setTimeout(fetchJobs, 2000);
}

async function killAll() {
    if (!confirm('⚠️ STOP ALL SCRIPTS?')) return;
    await fetchAuth(API + '/kill', { method: 'POST' });
}

async function restartGateway() {
    if (!confirm('♻️ RESTART GATEWAY?')) return;
    await fetchAuth(API + '/gateway/restart', { method: 'POST' });
}

async function refreshTokenStats() {
    const btn = document.querySelector('#view-tokens button');
    const origText = btn.innerText;
    const timeEl = document.getElementById('token-updated');
    const initialTime = timeEl.innerText;

    // Set Loading State (Immediate Countdown)
    btn.innerText = '⏳ Calc... (10s)';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
        // 1. Trigger
        await fetchAuth(API + '/tokens/refresh', { method: 'POST' });

        // 2. Poll for changes
        let attempts = 0;
        const poll = setInterval(async () => {
            attempts++;
            const remaining = 10 - attempts;
            btn.innerText = `⏳ Calc... (${remaining}s)`;

            try {
                const res = await fetchAuth(API + '/tokens');
                const data = await res.json();

                // Parse time to compare string difference
                const newDate = new Date(data.updatedAt);
                const newTimeStr = newDate.toLocaleTimeString();

                // If time changed OR attempts > 10
                if (newTimeStr !== initialTime || attempts > 10) {
                    clearInterval(poll);
                    fetchTokens(); // Refresh UI

                    btn.innerText = origText;
                    btn.disabled = false;
                    btn.style.opacity = '1';

                    if (attempts > 10) console.warn('Refresh timed out (no change detected)');
                }
            } catch (e) { clearInterval(poll); }
        }, 1000);

    } catch (e) {
        alert('Trigger failed');
        btn.innerText = origText;
        btn.disabled = false;
    }
}

// --- TOKENS ---
async function fetchTokens() {
    try {
        // Use API, not static file
        const res = await fetchAuth(API + '/tokens');
        const data = await res.json();
        document.getElementById('token-card').style.display = 'block';

        // Also fetch optimizations
        fetchDiagnostics();

        if (data.updatedAt) {
            const date = new Date(data.updatedAt);
            document.getElementById('token-updated').innerText = date.toLocaleTimeString();
        }

        if (data.today) {
            document.getElementById('token-cost').innerText = '$' + data.today.cost.toFixed(4);
            document.getElementById('token-in').innerText = (data.today.input / 1000).toFixed(1) + 'k';
            document.getElementById('token-out').innerText = (data.today.output / 1000).toFixed(1) + 'k';
        }
        if (data.total) {
            document.getElementById('grand-total-cost').innerText = '$' + data.total.cost.toFixed(2);

            // Forecast Logic
            const days = Object.keys(data.history || {}).length || 1;
            const avg = data.total.cost / days;
            const forecast = avg * 30;
            document.getElementById('monthly-forecast').innerText = '$' + forecast.toFixed(2);
        }

        // Top Models
        if (data.topModels) {
            const list = document.getElementById('top-models-list');
            list.innerHTML = '';
            data.topModels.slice(0, 5).forEach(m => {
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
                days.forEach(day => {
                    const stats = data.history[day];
                    const height = Math.max(5, (stats.cost / maxCost) * 100);
                    const bar = document.createElement('div');
                    bar.style.width = '100%';
                    bar.style.height = height + '%';
                    bar.style.backgroundColor = 'var(--accent)';
                    bar.style.borderRadius = '4px 4px 0 0';
                    bar.style.opacity = day === todayStr ? '1' : '0.4';
                    bar.onclick = () => {
                        Array.from(chart.children).forEach(c => c.style.opacity = '0.4');
                        bar.style.opacity = '1';
                        const detail = document.getElementById('daily-detail');
                        detail.style.display = 'block';
                        document.getElementById('detail-date').innerText = day;
                        document.getElementById('detail-cost').innerText = '$' + stats.cost.toFixed(4);
                        document.getElementById('detail-input').innerText = (stats.input / 1000).toFixed(1) + 'k';
                        document.getElementById('detail-output').innerText = (stats.output / 1000).toFixed(1) + 'k';

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
    } catch (e) { }
}

// --- INIT ---
if (window.location.hostname.endsWith('trycloudflare.com')) {
    document.getElementById('quick-tunnel-alert').style.display = 'block';
}

fetchHistory();
fetchStatus();
checkUpdate(); // Check on load

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
    } catch (e) { }
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

async function fetchDiagnostics() {
    try {
        const res = await fetchAuth(API + '/diagnostics');
        diagnosticsData = await res.json();
        // Normalize field name (backend sends totalMonthlySavings)
        diagnosticsData.monthlySavings = diagnosticsData.totalMonthlySavings || 0;

        const actions = diagnosticsData.actions || [];
        totalActions = actions.length;

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
                triggerText.innerHTML = `<strong>${totalActions} action${totalActions > 1 ? 's' : ''}</strong> available. Tap to save <span class="et-savings" id="trigger-savings">\$${diagnosticsData.monthlySavings.toFixed(2)}/mo</span>.`;
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
    } catch (e) {
        console.error('Failed to load diagnostics', e);
    }
}

function renderOptimizerList() {
    if (!diagnosticsData) return;

    if (diagnosticsData.monthlySavings > 0) {
        document.getElementById('main-savings-amount').innerText = '$' + diagnosticsData.monthlySavings.toFixed(2);
        document.getElementById('main-savings-amount').style.fontSize = '56px';
    } else {
        document.getElementById('main-savings-amount').innerText = '🛡️ Preventative';
        document.getElementById('main-savings-amount').style.fontSize = '36px';
    }

    const currentCost = diagnosticsData.currentMonthlyCost || 0;
    const optimizedCost = Math.max(0, currentCost - diagnosticsData.monthlySavings);

    const currentEl = document.querySelector('.cost-compare-val.current');
    const optimizedEl = document.querySelector('.cost-compare-val.optimized');
    if (currentEl) currentEl.innerText = '$' + currentCost.toFixed(2);
    if (optimizedEl) optimizedEl.innerText = '$' + optimizedCost.toFixed(2);

    const list = document.getElementById('opt-list');
    list.innerHTML = '';

    function renderSkillAuditList(meta) {
        let html = '<div class="skill-audit-list">';
        if (meta.idleSkills && meta.idleSkills.length > 0) {
            html += '<div class="skill-group"><span class="skill-group-label idle">Suggest Removal (' + meta.idleSkills.length + ')</span>';
            meta.idleSkills.forEach(s => {
                html += '<span class="skill-badge idle">' + escapeHtml(s.name) + ' <small>' + s.daysSince + 'd</small></span>';
            });
            html += '</div>';
        }
        if (meta.quietSkills && meta.quietSkills.length > 0) {
            html += '<div class="skill-group"><span class="skill-group-label quiet">Review Usage (' + meta.quietSkills.length + ')</span>';
            meta.quietSkills.forEach(s => {
                html += '<span class="skill-badge quiet">' + escapeHtml(s.name) + ' <small>' + s.daysSince + 'd</small></span>';
            });
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    // Display cache hit rate in the optimizer header
    const cacheEl = document.getElementById('cache-hit-rate');
    if (cacheEl && diagnosticsData.cacheHitRate !== undefined) {
        const rate = (diagnosticsData.cacheHitRate * 100).toFixed(1);
        const color = diagnosticsData.cacheHitRate >= 0.5 ? 'var(--accent-green)' : (diagnosticsData.cacheHitRate >= 0.1 ? 'rgba(245, 158, 11, 0.9)' : '#ef4444');
        cacheEl.innerHTML = `<span style="color:${color}">${rate}%</span>`;
        cacheEl.parentElement.style.display = '';
    }

    const actions = diagnosticsData.actions || [];
    actions.forEach(act => {
        const savingsStr = act.savings > 0 ? `-$${act.savings.toFixed(2)}/mo` : '🛡️ Protection';
        const savingsClass = act.savings > 10 ? 'high-savings' : (act.savings > 0 ? 'medium-savings' : 'safety');

        // L2: Side effect in plain language
        let sideEffectHtml = '';
        if (act.plainSideEffect || act.sideEffect) {
            sideEffectHtml = `<div class="opt-sideeffect">${escapeHtml(act.plainSideEffect || act.sideEffect)}</div>`;
        }

        // L1: Use plainTitle (beginner-friendly), fallback to title
        const displayTitle = act.plainTitle || act.title;

        const metaAttr = act._meta ? ' data-meta=\'' + JSON.stringify(act._meta).replace(/'/g, '&#39;') + '\'' : '';

        // A02 with multi-interval options
        let optionsHtml = '';
        if (act.actionId === 'A02' && act.options && act.options.length > 0) {
            const optItems = act.options.map((opt, i) => {
                const checked = (i === act.options.length - 1) ? ' checked' : '';
                const isDisable = opt.value === '0m';
                const labelClass = isDisable ? 'opt-radio-disable' : '';
                return `<label class="opt-radio ${labelClass}">
                    <input type="radio" name="hb-interval" value="${opt.value}" data-savings="${opt.savings}"${checked}>
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

        // Tooltip ? icon for helpText
        const tooltipHtml = act.helpText ? `<span class="opt-help" onclick="toggleHelp(this, event)">?</span>` : '';
        const helpBoxHtml = act.helpText ? `<div class="opt-help-box">${escapeHtml(act.helpText)}</div>` : '';

        const itemHtml = `
                    <div class="opt-item ${savingsClass}" data-action="${act.actionId}" data-savings="${act.savings}"${metaAttr}>
                        <div class="opt-header"><span class="opt-title">${escapeHtml(displayTitle)} ${tooltipHtml}</span><span class="opt-savings-tag" id="savings-tag-${act.actionId}">${savingsStr}</span></div>
                        <div class="opt-desc">${escapeHtml(act.description || '')}</div>
                        ${act._meta && act._meta.type === 'skill-audit' ? renderSkillAuditList(act._meta) : ''}
                        ${helpBoxHtml}
                        ${sideEffectHtml}
                        ${optionsHtml}
                        ${detailsHtml}
                        <div class="opt-action-line" style="justify-content: flex-end;">
                            <button class="btn-mini" onclick="handleOpt(this, '${act.actionId}')"><span class="default-label">Apply</span><span class="confirm-label">Confirm?</span><span class="applying-label">Applying\u2026</span><span class="done-label">\u2713 Applied</span></button>
                        </div>
                    </div>`;

        const temp = document.createElement('div');
        temp.innerHTML = itemHtml;
        const itemEl = temp.firstElementChild;

        // Wire up radio change for A02
        if (act.actionId === 'A02' && act.options) {
            itemEl.querySelectorAll('input[name="hb-interval"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    const selectedSavings = parseFloat(radio.getAttribute('data-savings')) || 0;
                    itemEl.setAttribute('data-savings', selectedSavings);
                    const tag = itemEl.querySelector('#savings-tag-A02');
                    if (tag) tag.textContent = `-$${selectedSavings.toFixed(2)}/mo`;
                    const currentMeta = JSON.parse(itemEl.getAttribute('data-meta') || '{}');
                    currentMeta.interval = radio.value;
                    itemEl.setAttribute('data-meta', JSON.stringify(currentMeta));
                });
            });
            const defaultRadio = itemEl.querySelector('input[name="hb-interval"]:checked');
            if (defaultRadio) {
                const currentMeta = JSON.parse(itemEl.getAttribute('data-meta') || '{}');
                currentMeta.interval = defaultRadio.value;
                itemEl.setAttribute('data-meta', JSON.stringify(currentMeta));
            }
        }

        list.appendChild(itemEl);
    });
}

async function renderHistoryList() {
    try {
        const res = await fetchAuth(API + '/optimizations/history');
        const history = await res.json();

        const list = document.getElementById('timline-list');
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

            // Add undo button to the most recent non-UNDO entry that has a backup
            let undoHtml = '';
            if (i === 0 && hist.backupPath && hist.actionId !== 'UNDO') {
                undoHtml = `<button class="btn-undo" onclick="handleUndo('${escapeHtml(hist.backupPath)}')">Undo</button>`;
            }

            // 7-day effect tracking
            let effectHtml = '';
            const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince >= 7 && hist.preOptCostSnapshot && hist.actionId !== 'UNDO' && diagnosticsData) {
                const actualCost = diagnosticsData.currentMonthlyCost || 0;
                const actualSaving = hist.preOptCostSnapshot - actualCost;
                const effectClass = actualSaving >= hist.savings * 0.8 ? 'effect-good' : 'effect-partial';
                effectHtml = `<span class="effect-tag ${effectClass}">7d: $${actualSaving.toFixed(2)}</span>`;
            }

            const div = document.createElement('div');
            div.className = 'timeline-item';
            const dotColor = hist.actionId === 'UNDO' ? 'rgba(245, 158, 11, 0.8)' : (i === 0 ? 'var(--accent-green)' : 'var(--text-dim)');
            div.innerHTML = `
                            <div class="timeline-dot" style="border-color: ${dotColor};"></div>
                            <div class="timeline-time">${timeStr}</div>
                            <div class="timeline-content">${escapeHtml(title)}${savingsTag} ${effectHtml} ${undoHtml}</div>
                        `;
            list.appendChild(div);
        });
    } catch (_e) { }
}

async function handleUndo(backupPath) {
    if (!confirm('Undo this optimization? Your config will be restored from the backup.')) return;
    try {
        const res = await fetchAuth(API + '/optimizations/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupPath })
        });
        if (res.ok) {
            const result = await res.json();
            showToast(`✓ Restored ${result.restoredKeys.length} settings from ${result.backupFile}`);
            await renderHistoryList();
            // Refresh diagnostics
            diagnosticsEngine_cache = null;
            await fetchDiagnostics();
        } else {
            showToast('Undo failed: ' + ((await res.json().catch(() => ({}))).details || 'Unknown error'));
        }
    } catch (e) {
        showToast('Undo failed: ' + e.message);
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
        const interval = setInterval(() => {
            i++;
            if (i < steps.length) { stepEl.textContent = steps[i]; }
            else {
                clearInterval(interval);
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
    container.classList.remove('flipped');
    setTimeout(() => { trigger.style.display = 'flex'; }, 800);
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
            let meta = null;
            try { meta = JSON.parse(item.getAttribute('data-meta')); } catch (_e) { /* no meta */ }

            const res = await fetchAuth(API + '/optimize/' + actionId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ savings: savingsVal, meta })
            });
            if (res.ok) {
                btn.classList.remove('applying');
                item.classList.add('done');
                actionsApplied++;

                const mainAmount = document.getElementById('main-savings-amount');
                let cur = parseFloat(mainAmount.textContent.replace('$', ''));
                mainAmount.textContent = '$' + Math.max(0, cur - savingsVal).toFixed(2);

                if (actionsApplied >= totalActions) {
                    setTimeout(showSuccess, 1000);
                }
            } else {
                btn.classList.remove('applying');
                btn.disabled = false;
                showToast('Optimization failed: ' + (await res.json().catch(() => ({}))).details || 'Unknown error');
            }
        } catch (e) {
            btn.classList.remove('applying');
            btn.disabled = false;
            showToast('Network error: ' + e.message);
        }
    }
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
