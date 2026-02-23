require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { exec, execSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https'); // Explicit require for proxy
const os = require('os');
const tunnel = require('./tunnel');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Config & Paths
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.ACCESS_KEY || 'default-insecure';
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;

const HOME_DIR = os.homedir();
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(HOME_DIR, '.openclaw');

const CACHE_TTL_MS = 60000; // 60s cache
let memoryCache = { data: null, ts: 0 };
let workspaceCache = null;

// Dynamic Path Resolution
function findWorkspace() {
    // 1. Explicit env var (Highest priority)
    if (process.env.OPENCLAW_WORKSPACE) return process.env.OPENCLAW_WORKSPACE;

    // 2. Return cached
    if (workspaceCache) return workspaceCache;

    // 3. Relative path (Default installation structure: .../openclaw/skills/clawbridge)
    const relative = path.resolve(__dirname, '../../');
    if (fs.existsSync(path.join(relative, 'memory'))) {
        workspaceCache = relative;
        return relative;
    }

    // 4. Common path probing (For standalone/sandbox installs)
    const candidates = [
        '/root/clawd',
        path.join(HOME_DIR, 'clawd'), // Legacy clawdbot/clawd path
        path.join(HOME_DIR, '.openclaw'), // Standard OpenClaw storage
        process.cwd()
    ];

    for (const p of candidates) {
        if (fs.existsSync(path.join(p, 'memory'))) {
            console.log(`[Init] Probed workspace found: ${p}`);
            workspaceCache = p;
            return p;
        }
    }

    // 5. Fallback
    workspaceCache = relative;
    return relative;
}

const WORKSPACE_DIR = findWorkspace();

console.log(`[Init] Workspace: ${WORKSPACE_DIR}`);
console.log(`[Init] State Dir: ${STATE_DIR}`);

const LOG_DIR = path.join(__dirname, 'data/logs');
const TOKEN_FILE = path.join(__dirname, 'data/token_stats/latest.json');
const ID_FILE = path.join(__dirname, 'data/last_id.txt');
const ANALYZE_SCRIPT = path.join(__dirname, 'scripts/analyze.js');

// Global State for Deduplication
global.lastLoggedActivity = null;
global.lastLoggedCpu = null;
let lastProcessedId = null;

try {
    if (fs.existsSync(ID_FILE)) {
        lastProcessedId = fs.readFileSync(ID_FILE, 'utf8').trim();
    }
} catch (e) { }

app.use(express.json());

// --- Magic Link Auth Middleware ---
app.use((req, res, next) => {
    if (req.query.key === SECRET_KEY) return next();
    if (req.headers['x-claw-key'] === SECRET_KEY) return next();
    if (req.path.match(/\.(png|jpg|jpeg|svg|gif|ico|css)$/)) return next();
    if (req.path === '/manifest.json') return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Unauthorized' });

    return res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}</style></head><body><script>const urlParams=new URLSearchParams(window.location.search);if(urlParams.has('key')){alert('❌ Access Denied: Invalid Key');localStorage.removeItem('claw_key');window.location.href=window.location.pathname}else if(localStorage.getItem('claw_key')){const key=localStorage.getItem('claw_key');window.location.href=window.location.pathname+'?key='+key}else{const input=prompt('🔑 ClawBridge Access Key:');if(input){localStorage.setItem('claw_key',input);window.location.href=window.location.pathname+'?key='+input}}</script></body></html>`);
});

app.use(express.static(path.join(__dirname, 'public')));

function getOpenClawCommand() {
    if (process.env.OPENCLAW_PATH) return process.env.OPENCLAW_PATH;
    try { execSync('which openclaw'); return 'openclaw'; } catch (e) { }
    const localPath = '/root/.nvm/versions/node/v22.22.0/bin/openclaw';
    if (fs.existsSync(localPath)) return localPath;
    return 'openclaw';
}

function getActiveContext() {
    try {
        const sessionsPath = path.join(STATE_DIR, 'agents/main/sessions/sessions.json');
        const altPaths = [
            sessionsPath,
            '/root/.openclaw/agents/main/sessions/sessions.json',
            path.join(WORKSPACE_DIR, '.openclaw/sessions/sessions.json'),
            path.join(HOME_DIR, '.clawdbot/agents/main/sessions/sessions.json')
        ];

        let targetPath = null;
        for (const p of altPaths) {
            if (fs.existsSync(p)) { targetPath = p; break; }
        }

        if (!targetPath) return null;

        let sessions;
        try {
            const fileContent = fs.readFileSync(targetPath, 'utf8');
            sessions = JSON.parse(fileContent);
        } catch (e) {
            return null; // File might be empty/corrupt during write
        }

        let latestSession = null;
        let maxTime = 0;

        Object.values(sessions).forEach(s => {
            if (s.updatedAt > maxTime) {
                maxTime = s.updatedAt;
                latestSession = s;
            }
        });

        if (!latestSession) return null;

        // Only consider "Active" if updated within last 15 seconds
        // (Allows for long-running tools like web_search to still show as busy)
        if (Date.now() - maxTime > 15000) return null;

        const logFile = latestSession.sessionFile;
        // Security: validate logFile path is within expected directories
        const resolvedLogFile = path.resolve(logFile);
        const allowedPrefixes = [STATE_DIR, HOME_DIR, WORKSPACE_DIR];
        if (!allowedPrefixes.some(prefix => resolvedLogFile.startsWith(path.resolve(prefix)))) {
            console.warn('[Security] Blocked suspicious logFile path:', resolvedLogFile);
            return null;
        }
        if (!fs.existsSync(logFile)) return null;

        // Use fs.readFileSync instead of exec('tail') to avoid command injection
        const fileContent = fs.readFileSync(logFile, 'utf8');
        const allLines = fileContent.trim().split('\n');
        const tail = allLines.slice(-50).join('\n');
        const lines = tail.trim().split('\n').reverse();

        // 🛡️ FRESHNESS CHECK (Added 2026-02-23)
        // Prevent ingestion of stale logs during recovery/restart loops
        const FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();

        for (const line of lines) {
            try {
                const event = JSON.parse(line);

                // --- Freshness Filter ---
                if (event.time) {
                    const evtTime = new Date(event.time).getTime();
                    if (!isNaN(evtTime) && (now - evtTime > FRESHNESS_WINDOW_MS)) {
                        // Skip this specific event if it's too old
                        continue;
                    }
                }
                // ------------------------

                // 1. Capture Assistant Messages (Thinking + Tool Call Requests)
                if (event.type === 'message' && event.message && event.message.role === 'assistant' && event.message.content) {
                    const msgId = event.id;
                    const content = event.message.content;
                    const events = [];

                    // Extract Thinking
                    const thinking = content.find(c => c.type === 'thinking');
                    if (thinking && thinking.thinking) {
                        let text = thinking.thinking.replace(/^[#\*\- ]+/, '').replace(/\n/g, ' ').trim();
                        if (text.length > 5000) text = text.substring(0, 5000) + '...';
                        events.push(`🧠 ${text}`);
                    }

                    // Extract Tool Call Request
                    const tool = content.find(c => c.type === 'toolCall');
                    if (tool) {
                        let argStr = '';
                        if (tool.arguments) {
                            if (tool.name === 'web_search') argStr = `"${tool.arguments.query}"`;
                            else if (tool.name === 'read') argStr = tool.arguments.path || tool.arguments.file_path;
                            else if (tool.name === 'exec') argStr = tool.arguments.command;
                            else if (tool.name === 'message' || tool.name === 'sessions_send') continue; // Skip redundant chat logs
                            else argStr = JSON.stringify(tool.arguments);
                        }
                        if (argStr && argStr.length > 5000) argStr = argStr.substring(0, 5000) + '...';
                        events.push(`🔧 ${tool.name} ${argStr}`);
                    }

                    if (events.length > 0) {
                        return { id: msgId, events: events };
                    }
                }

                // 2. Capture Tool Results (Role: toolResult)
                if (event.type === 'message' && event.message && event.message.role === 'toolResult') {
                    const toolName = event.message.toolName;
                    const toolContent = event.message.content;
                    let resultText = '';

                    if (Array.isArray(toolContent)) {
                        resultText = toolContent.map(c => c.text || '').join(' ');
                    } else if (typeof toolContent === 'string') {
                        resultText = toolContent;
                    }

                    // Filter out redundant tool results (e.g. from message tool which just returns "sent")
                    if (toolName === 'message' || toolName === 'sessions_send') continue;

                    if (resultText && resultText.length > 0) {
                        if (resultText.length > 2000) resultText = resultText.substring(0, 2000) + '...';
                        return { id: event.id, events: [`🔧 Result: ${resultText}`] };
                    }
                }
            } catch (e) { }
        }
    } catch (e) { }
    return null;
}

function logActivity(task, id = null) {
    if (!task || task === 'System Idle') return;

    // --- ID-BASED IN-MEMORY DEDUPLICATION ---
    // If an ID is provided (from Agent Context), use it to strictly prevent duplicates
    // This handles the case where the service restarts, reads the same last_id from disk,
    // but might re-process if logic is slightly off.
    // Also handles the "rapid polling" issue.
    if (id) {
        if (!global.processedEventIds) global.processedEventIds = new Set();
        const key = `${id}:${task}`; // Use ID + FULL content as key to prevent partial match collisions
        if (global.processedEventIds.has(key)) return;

        global.processedEventIds.add(key);
        // Pruning
        if (global.processedEventIds.size > 200) { // Increase buffer size
            const arr = Array.from(global.processedEventIds);
            global.processedEventIds = new Set(arr.slice(-100));
        }
    }

    // For non-ID tasks (CPU, Scripts), use strict text+time
    if (!id) {
        if (global.lastLoggedTask === task && Date.now() - global.lastLoggedTime < 60000) return;
        global.lastLoggedTask = task;
        global.lastLoggedTime = Date.now();
    }

    const now = new Date();
    const ts = now.toISOString();
    const entry = { ts, task };

    const monthDir = path.join(LOG_DIR, ts.substring(0, 7));
    const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`);

    try {
        if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
        console.error('Log write failed:', e);
    }
}

let fileState = {};
const WATCH_DIRS = [path.join(WORKSPACE_DIR, 'memory'), path.join(WORKSPACE_DIR, 'scripts')];
const WATCH_FILES = ['MEMORY.md', 'AGENTS.md', 'HEARTBEAT.md'].map(f => path.join(WORKSPACE_DIR, f));

function checkFileChanges() {
    WATCH_FILES.forEach(f => scanFile(f));
    WATCH_DIRS.forEach(d => {
        if (!fs.existsSync(d)) return;
        try {
            const files = fs.readdirSync(d);
            files.forEach(file => {
                if (file.startsWith('.') || file.endsWith('.tmp')) return;
                scanFile(path.join(d, file));
            });
        } catch (e) { }
    });
}

function scanFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return;
        const stat = fs.statSync(filePath);
        const mtime = stat.mtimeMs;
        const ctime = stat.ctimeMs;

        if (!fileState[filePath]) {
            fileState[filePath] = mtime;
            if (Date.now() - ctime < 60000) {
                const rel = path.relative(WORKSPACE_DIR, filePath);
                logActivity(`📄 Created: ${rel}`);
            }
            return;
        }

        if (mtime > fileState[filePath]) {
            fileState[filePath] = mtime;
            if (Date.now() - mtime < 60000) {
                const rel = path.relative(WORKSPACE_DIR, filePath);
                logActivity(`📝 Updated: ${rel}`);
            }
        }
    } catch (e) { }
}

let cachedVersions = null;
let cachedVersionsTs = 0;
const VERSION_CACHE_TTL = 5 * 60 * 1000; // Cache versions for 5 minutes

function getVersions() {
    if (cachedVersions && (Date.now() - cachedVersionsTs < VERSION_CACHE_TTL)) {
        return cachedVersions;
    }

    let dashboard = 'Unknown';
    let core = 'Unknown';

    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        dashboard = pkg.version;
    } catch (e) { }

    try {
        const cmd = `${getOpenClawCommand()} --version`;
        core = execSync(cmd, { timeout: 5000 }).toString().trim();
    } catch (e) {
        // Fallback checks
        try {
            const pkg = require('/root/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/package.json');
            core = `v${pkg.version}`;
        } catch (e2) {
            core = 'v2.6.4+ (Unverified)';
        }
    }
    cachedVersions = { dashboard, core };
    cachedVersionsTs = Date.now();
    return cachedVersions;
}

function checkSystemStatus(callback) {
    checkFileChanges();

    // Merged: run disk, gateway PID, and process list in a single shell command
    const mergedCmd = `echo "===DISK==="; df -h / | awk 'NR==2 {print $5}'; echo "===GWPID==="; pgrep -f 'openclaw gateway' | head -n 1 || true; echo "===PS==="; ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 20`;
    exec(mergedCmd, (err, stdout) => {
        const sections = stdout ? stdout.split(/===\w+===\n?/) : [];
        // sections[0] is empty (before first marker), [1]=disk, [2]=gwpid, [3]=ps
        const diskUsage = sections[1] ? sections[1].trim() || '--%' : '--%';
        const gatewayPid = sections[2] ? sections[2].trim() || null : null;
        const psOutput = sections[3] || '';
        {
            {
                if (err && !psOutput) return callback({ status: 'error', task: 'Monitor Error' });

                const lines = psOutput.trim().split('\n').slice(1);
                let activities = [];
                let runningScripts = [];
                let totalCpu = 0;
                let topProc = null;

                lines.forEach((line, index) => {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[0];
                    const cpu = parseFloat(parts[1]);
                    const comm = parts[2];
                    const args = parts.slice(3).join(' ');

                    if (!isNaN(cpu)) totalCpu += cpu;
                    if (index === 0) topProc = `${comm} (${Math.round(cpu)}%)`;

                    if (comm === 'node' && args.includes('scripts/')) {
                        const script = args.match(/scripts\/([a-zA-Z0-9_.-]+)/)?.[1] || 'Script';
                        activities.push(`📜 Running Script: ${script}`);
                        runningScripts.push({ pid, name: script });
                    }

                    if (['grep', 'find', 'curl', 'wget', 'git', 'tar', 'python', 'python3'].includes(comm)) {
                        let detail = args.split(' ').pop();
                        if (comm === 'grep') detail = args.match(/"([^"]+)"/)?.[1] || detail;
                        if (detail && detail.length > 5000) detail = detail.substring(0, 5000) + '...';
                        activities.push(`🔧 ${comm} ${detail}`);
                    }
                });

                activities = [...new Set(activities)];
                const ctx = getActiveContext();

                let status = 'idle';
                let taskText = 'System Idle';

                // --- PARALLEL PROCESSING LOGIC ---
                // We want to detect Background Scripts & CPU even if Agent is busy.

                // 1. Agent Activity (Highest Priority for UI Display)
                if (ctx) {
                    status = 'busy';
                    const currentId = String(ctx.id).trim();
                    const lastId = String(lastProcessedId).trim();

                    if (currentId !== lastId) {
                        // Check if we've already logged this EXACT id+event combination in this process lifetime
                        // This prevents re-logging on service restart if file was not updated
                        ctx.events.forEach(evt => logActivity(evt, currentId));
                        lastProcessedId = currentId;
                        try { fs.writeFileSync(ID_FILE, currentId, 'utf8'); } catch (e) { console.error('ID Save Failed:', e); }
                    }
                    // This is what the Dashboard HEADER shows
                    if (ctx.events && ctx.events.length > 0) {
                        taskText = ctx.events[ctx.events.length - 1];
                    }
                }

                // 2. Background Scripts (Medium Priority)
                // Always log them if found, even if agent is busy
                if (activities.length > 0) {
                    status = 'busy';
                    const activityText = activities.join(', ');

                    // If UI header is still Idle, show this instead
                    if (taskText === 'System Idle') taskText = activityText;

                    // Deduplicate persistent logs (in-memory check)
                    // If activityText changed from last time, log it
                    if (global.lastLoggedActivity !== activityText) {
                        logActivity(activityText);
                        global.lastLoggedActivity = activityText;
                    }
                } else {
                    global.lastLoggedActivity = null; // Reset
                }

                // 3. High CPU (Low Priority)
                if (totalCpu > 70.0) {
                    status = 'busy';
                    const cpuText = `⚡ High CPU: ${topProc || 'Unknown'}`;

                    if (taskText === 'System Idle') taskText = cpuText;

                    if (global.lastLoggedCpu !== cpuText) {
                        logActivity(cpuText);
                        global.lastLoggedCpu = cpuText;
                    }
                } else {
                    global.lastLoggedCpu = null;
                }

                const versions = getVersions();

                callback({
                    status: status,
                    task: taskText,
                    cpu: Math.round(totalCpu),
                    mem: Math.round((1 - os.freemem() / os.totalmem()) * 100),
                    disk: diskUsage,
                    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                    lastHeartbeat: new Date().toISOString(),
                    versions: versions,
                    gatewayPid: gatewayPid,
                    scripts: runningScripts
                });
            }
        }
    });
}

app.get('/api/status', (req, res) => {
    checkSystemStatus((data) => res.json(data));
});

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const month = dateStr.slice(0, 7);
    const day = dateStr.slice(8, 10);
    const logFile = path.join(LOG_DIR, month, `${day}.jsonl`);

    if (!fs.existsSync(logFile)) return res.json([]);

    try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.trim().split('\n');
        const logs = [];
        for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i]) continue;
            try { logs.push(JSON.parse(lines[i])); } catch (e) { }
            if (logs.length >= limit) break;
        }
        res.json(logs);
    } catch (e) { res.status(500).json({ error: 'Log read failed' }); }
});

app.get('/api/tokens', (req, res) => {
    if (!fs.existsSync(TOKEN_FILE)) return res.json({});
    try {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) { res.status(500).json({ error: 'Read failed' }); }
});

app.post('/api/tokens/refresh', (req, res) => {
    runAnalyzer();
    res.json({ status: 'triggered', message: 'Analysis started.' });
});

function runAnalyzer() {
    const nodePath = process.execPath;
    exec(`"${nodePath}" "${ANALYZE_SCRIPT}"`, (err, stdout, stderr) => {
        if (err) console.error('[Analyzer] Error:', stderr);
    });
}

setInterval(() => { checkSystemStatus(() => { }); }, 3000);
runAnalyzer();
setInterval(runAnalyzer, 60 * 60 * 1000);

app.post('/api/kill', (req, res) => {
    exec("pkill -SIGTERM -f 'node scripts/'", (err) => {
        setTimeout(() => {
            exec("pgrep -f 'node scripts/'", (err, stdout) => {
                if (!err && stdout) exec("pkill -SIGKILL -f 'node scripts/'");
            });
        }, 3000);
        res.json({ status: 'stopping', message: 'Sent SIGTERM.' });
    });
});

app.post('/api/gateway/restart', (req, res) => {
    exec("pkill -SIGTERM -f 'openclaw gateway' || true", (killErr, killStdout, killStderr) => {
        if (killErr && killErr.code !== 1) {
            // code 1 means no process found, which is OK
            console.warn('[Gateway] Kill warning:', killStderr);
        }
        setTimeout(() => {
            const cmd = `${getOpenClawCommand()} gateway start --background`;
            exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[Gateway] Restart failed:', stderr);
                    res.json({ status: 'error', message: stderr || err.message });
                } else {
                    console.log('[Gateway] Restart success:', stdout.trim());
                    res.json({ status: 'restarted', message: stdout.trim() || 'Gateway started successfully' });
                }
            });
        }, 2000);
    });
});

app.get('/api/cron', (req, res) => {
    // 1. FAST PATH: Read state file directly (ms)
    // This avoids spawning a heavy node process for 'openclaw cron list'
    try {
        const v2Path = path.join(STATE_DIR, 'cron/jobs.json');
        // Legacy fallback
        const legacyPath = path.join(HOME_DIR, '.clawdbot/cron/jobs.json');

        let target = fs.existsSync(v2Path) ? v2Path : (fs.existsSync(legacyPath) ? legacyPath : null);

        if (target) {
            const fileData = fs.readFileSync(target, 'utf8');
            const json = JSON.parse(fileData);
            // If we have valid jobs data, return it immediately
            if (json.jobs) return res.json(json.jobs);
        }
    } catch (e) {
        // Silent fail, fallthrough to CLI
    }

    // 2. SLOW PATH: CLI Fallback (Authoritative but heavy)
    const cmd = `${getOpenClawCommand()} cron list --json`;
    exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        try {
            const data = JSON.parse(stdout);
            if (data.jobs) return res.json(data.jobs);
            return res.json([]);
        } catch (e) { res.json([]); }
    });
});

app.get('/api/memory', (req, res) => {
    if (req.query.list === 'true') {
        const memoryDir = path.join(WORKSPACE_DIR, 'memory');
        if (!fs.existsSync(memoryDir)) return res.json([]);

        // Cache Check
        if (memoryCache.data && (Date.now() - memoryCache.ts < CACHE_TTL_MS)) {
            return res.json(memoryCache.data);
        }

        try {
            const files = fs.readdirSync(memoryDir)
                .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
                .sort().reverse()
                .slice(0, 30); // Limit to last 30 days 

            const list = files.map(f => f.replace('.md', ''));

            // Update Cache
            memoryCache = { data: list, ts: Date.now() };

            return res.json(list);
        } catch (e) { return res.json([]); }
    }

    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    let date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({ error: 'Invalid date' });

    const memPath = path.join(WORKSPACE_DIR, 'memory', `${date}.md`);
    if (!fs.existsSync(memPath)) {
        return res.json({
            date,
            content: '### 👋 No memories yet today.\n\nChat with your agent or run tasks to start building your timeline.'
        });
    }

    try {
        const content = fs.readFileSync(memPath, 'utf8');
        res.json({ date, content });
    } catch (e) { res.status(500).json({ error: 'Failed to read memory' }); }
});

app.post('/api/run/:id', (req, res) => {
    const id = req.params.id;
    // Security: strict validation to prevent command injection
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid job ID format' });
    }
    const openclawCmd = getOpenClawCommand();
    execFile(openclawCmd, ['cron', 'run', id], (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron Run] Error:', stderr);
            return res.json({ status: 'error', message: stderr || err.message });
        }
        res.json({ status: 'triggered' });
    });
});

// const https = require('https');

app.get('/api/check_update', (req, res) => {
    // Helper to fetch with redirect follow
    const fetchUrl = (url, attempts = 0) => {
        if (attempts > 3) return res.json({ error: 'Too many redirects', version: '0.0.0' });

        https.get(url, { timeout: 3000 }, (apiRes) => {
            // Handle Redirects (301, 302, 307, 308)
            if (apiRes.statusCode >= 300 && apiRes.statusCode < 400 && apiRes.headers.location) {
                return fetchUrl(apiRes.headers.location, attempts + 1);
            }

            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    res.json(JSON.parse(data));
                } catch (e) {
                    res.json({ error: 'Invalid JSON', version: '0.0.0' });
                }
            });
        }).on('error', (e) => {
            res.json({ error: 'Update check failed', version: '0.0.0' });
        });
    };

    // Start with root domain (canonical preference)
    fetchUrl('https://clawbridge.app/api/version');
});

app.get('/api/config', (req, res) => {
    res.json({ hasToken: !!process.env.TUNNEL_TOKEN });
});

// WebSocket Authentication
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const key = url.searchParams.get('key') || req.headers['x-claw-key'];
    if (key !== SECRET_KEY) {
        ws.close(4001, 'Unauthorized');
        return;
    }
});

setInterval(() => {
    wss.clients.forEach(c => {
        if (c.readyState === 1) { // WebSocket.OPEN
            c.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
        }
    });
}, 1000);

async function main() {
    // Cleanup old quick tunnel file
    try { fs.unlinkSync(path.join(__dirname, '.quick_tunnel_url')); } catch (e) { }

    server.listen(PORT, '::', async () => {
        console.log(`[Dashboard] Local: http://[::]:${PORT}`);

        // --- COLD START: Welcome Log ---
        // Ensure the log file has at least one entry so the UI isn't empty
        const now = new Date();
        const ts = now.toISOString();
        const monthDir = path.join(LOG_DIR, ts.substring(0, 7));
        const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`);

        try {
            if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

            // Check if file is empty or new
            const isNew = !fs.existsSync(logFile) || fs.statSync(logFile).size === 0;

            if (isNew) {
                const entry = { ts, task: "🚀 ClawBridge Dashboard Online" };
                fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
            }
        } catch (e) { }
        // -------------------------------

        if (process.env.ENABLE_EMBEDDED_TUNNEL === 'true') {
            try {
                await tunnel.downloadBinary();
                const url = await tunnel.startTunnel(PORT, TUNNEL_TOKEN);
                console.log(`\n🚀 CLAWBRIDGE DASHBOARD LIVE:\n👉 ${url}\n`);
            } catch (e) { console.error('Tunnel Failed:', e); }
        }
    });
}

main();
