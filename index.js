require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const tunnel = require('./tunnel');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Config & Paths
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.ACCESS_KEY || 'default-insecure';
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;

// Dynamic Path Resolution
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || path.resolve(__dirname, '../../');
const HOME_DIR = os.homedir();
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(HOME_DIR, '.openclaw');

console.log(`[Init] Workspace: ${WORKSPACE_DIR}`);
console.log(`[Init] State Dir: ${STATE_DIR}`);

const LOG_DIR = path.join(__dirname, 'data/logs');
const TOKEN_FILE = path.join(__dirname, 'data/token_stats/latest.json');
const ID_FILE = path.join(__dirname, 'data/last_id.txt'); 
const ANALYZE_SCRIPT = path.join(__dirname, 'scripts/analyze.js');

app.use(express.json());

// Load last ID from disk to prevent duplicates on restart
let lastProcessedId = null;
try {
    if (fs.existsSync(ID_FILE)) {
        lastProcessedId = fs.readFileSync(ID_FILE, 'utf8').trim();
    }
} catch (e) {}

// --- Magic Link Auth Middleware ---
app.use((req, res, next) => {
    if (req.query.key === SECRET_KEY) return next();
    if (req.headers['x-claw-key'] === SECRET_KEY) return next();
    if (req.path.match(/\.(png|jpg|jpeg|svg|gif|ico|css|js)$/)) return next();
    if (req.path === '/manifest.json') return next(); 
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Unauthorized' });

    return res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}</style></head><body><script>const urlParams=new URLSearchParams(window.location.search);if(urlParams.has('key')){alert('❌ Access Denied: Invalid Key');localStorage.removeItem('claw_key');window.location.href=window.location.pathname}else if(localStorage.getItem('claw_key')){const key=localStorage.getItem('claw_key');window.location.href=window.location.pathname+'?key='+key}else{const input=prompt('🔑 ClawBridge Access Key:');if(input){localStorage.setItem('claw_key',input);window.location.href=window.location.pathname+'?key='+input}}</script></body></html>`);
});

app.use(express.static(path.join(__dirname, 'public')));

function getOpenClawCommand() {
    if (process.env.OPENCLAW_PATH) return process.env.OPENCLAW_PATH;
    try { execSync('which openclaw'); return 'openclaw'; } catch (e) {}
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

        const logFile = latestSession.sessionFile;
        if (!fs.existsSync(logFile)) return null;

        const tail = execSync(`tail -n 50 "${logFile}"`).toString();
        const lines = tail.trim().split('\n').reverse();

        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                
                if (event.type === 'message' && event.message && event.message.content) {
                    const msgId = event.id;
                    const content = event.message.content;
                    const events = [];

                    const thinking = content.find(c => c.type === 'thinking');
                    if (thinking && thinking.thinking) {
                        let text = thinking.thinking.replace(/^[#\*\- ]+/, '').replace(/\n/g, ' ').trim();
                        if (text.length > 5000) text = text.substring(0, 5000) + '...';
                        events.push(`🧠 ${text}`);
                    }

                    const tool = content.find(c => c.type === 'toolCall');
                    if (tool) {
                        let argStr = '';
                        if (tool.arguments) {
                            if (tool.name === 'web_search') argStr = `"${tool.arguments.query}"`;
                            else if (tool.name === 'read') argStr = tool.arguments.path || tool.arguments.file_path;
                            else if (tool.name === 'exec') argStr = tool.arguments.command;
                            else if (tool.name === 'message' || tool.name === 'sessions_send') {
                                // Skip chat replies from "Tool Calls" section
                                // We rely on the Text Content parser below to capture conversation
                                // But if text content extraction is disabled/filtered, we might miss it.
                                // For now, let's keep suppressing redundant tool calls.
                                continue; 
                            }
                            else argStr = JSON.stringify(tool.arguments);
                        }
                        if (argStr && argStr.length > 5000) argStr = argStr.substring(0, 5000) + '...';
                        events.push(`🔧 ${tool.name} ${argStr}`);
                    }
                    
                    // 3. Extract Text Content (if it's not empty/generic)
                    /* 
                       Logic Update: 
                       User explicitly requested to HIDE text that duplicates chat history.
                       Since OpenClaw sends the 'text' block to the user as a chat message,
                       showing it here IS duplicating the chat history.
                       
                       We ONLY want to show internal activities (Thinking, Tools).
                       We do NOT want to show the final "Output" text, because the user
                       already sees that in their chat app.
                       
                       Exception: If there are NO tools and NO thinking, and we hide text,
                       the dashboard will show nothing for that turn. 
                       But maybe that's what the user wants? "Live Activity" = "Background Work".
                       Chat is "Foreground".
                       
                       Let's completely comment out the Text Extraction for now to strictly follow orders.
                    */
                    /*
                    const textPart = content.find(c => c.type === 'text');
                    if (textPart && textPart.text && textPart.text.trim().length > 0 && textPart.text !== "NO_REPLY") {
                        let t = textPart.text.trim();
                        if (t.length > 5000) t = t.substring(0, 5000) + '...';
                        events.push(`💬 ${t}`);
                    }
                    */

                    if (events.length > 0) {
                        return { id: msgId, events: events };
                    }
                }
            } catch(e) {}
        }
    } catch (e) { }
    return null;
}

function logActivity(task) {
    if (!task || task === 'System Idle') return;

    const now = new Date();
    const ts = now.toISOString();
    const entry = { ts, task };
    
    const monthDir = path.join(LOG_DIR, ts.substring(0, 7)); 
    const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`); 

    try {
        if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch(e) {
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
        } catch(e) {}
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
    } catch(e) {}
}

let cachedVersions = null;
function getVersions() {
    let dashboard = 'Unknown';
    let core = 'Unknown';
    
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        dashboard = pkg.version;
    } catch(e) {}

    try {
        const cmd = `${getOpenClawCommand()} --version`;
        core = execSync(cmd).toString().trim();
    } catch(e) {
        const paths = [
             path.join(HOME_DIR, '.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/package.json'),
             '/usr/local/lib/node_modules/openclaw/package.json'
        ];
        for (const p of paths) {
             try {
                if (fs.existsSync(p)) {
                    const corePkg = JSON.parse(fs.readFileSync(p, 'utf8'));
                    core = `v${corePkg.version}`;
                    break;
                }
             } catch(err) {}
        }
    }
    cachedVersions = { dashboard, core };
    return cachedVersions;
}

function checkSystemStatus(callback) {
    checkFileChanges();

    exec("df -h / | awk 'NR==2 {print $5}'", (errDisk, stdoutDisk) => {
        const diskUsage = stdoutDisk ? stdoutDisk.trim() : '--%';
        const gatewayPidCmd = "pgrep -f 'openclaw gateway' | head -n 1";
        
        exec(gatewayPidCmd, (errGw, stdoutGw) => {
            const gatewayPid = stdoutGw ? stdoutGw.trim() : null;
            const cmd = "ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 20";
            exec(cmd, (err, stdout) => {
                if (err) return callback({ status: 'error', task: 'Monitor Error' });

                const lines = stdout.trim().split('\n').slice(1);
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
                
                if (ctx) {
                    status = 'busy';
                    
                    // ID-based deduplication (Robust)
                    const currentId = String(ctx.id).trim();
                    const lastId = String(lastProcessedId).trim();

                    if (currentId !== lastId) {
                        ctx.events.forEach(evt => logActivity(evt));
                        lastProcessedId = currentId;
                        try { fs.writeFileSync(ID_FILE, currentId, 'utf8'); } catch(e){ console.error('ID Save Failed:', e); }
                    }
                    taskText = ctx.events[ctx.events.length - 1];
                } else if (activities.length > 0) {
                    status = 'busy';
                    taskText = activities.join(', ');
                    logActivity(taskText);
                } else if (totalCpu > 70.0) { 
                    status = 'busy';
                    taskText = `⚡ High CPU: ${topProc || 'Unknown'}`;
                    logActivity(taskText);
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
            });
        });
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
            try { logs.push(JSON.parse(lines[i])); } catch(e) {}
            if (logs.length >= limit) break;
        }
        res.json(logs);
    } catch(e) { res.status(500).json({ error: 'Log read failed' }); }
});

app.get('/api/tokens', (req, res) => {
    if (!fs.existsSync(TOKEN_FILE)) return res.json({});
    try {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch(e) { res.status(500).json({ error: 'Read failed' }); }
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

setInterval(() => { checkSystemStatus(() => {}); }, 3000);
runAnalyzer();
setInterval(runAnalyzer, 60 * 60 * 1000);

app.post('/api/kill', (req, res) => {
    exec("pkill -SIGTERM -f 'node scripts/'", (err) => {
        setTimeout(() => {
            exec("pgrep -f 'node scripts/'", (err, stdout) => {
                if (!err && stdout) exec("pkill -SIGKILL -f 'node scripts/'");
            });
        }, 3000);
        res.json({status:'stopping', message: 'Sent SIGTERM.'});
    });
});

app.post('/api/gateway/restart', (req, res) => {
    exec("pkill -SIGTERM -f 'openclaw gateway' || true", () => {
        setTimeout(() => {
            const cmd = `${getOpenClawCommand()} gateway start --background`;
            exec(cmd, (err, stdout, stderr) => {
                 if (err) res.json({status:'error', message: stderr});
                 else res.json({status:'restarted'});
            });
        }, 2000);
    });
});

app.get('/api/cron', (req, res) => {
    const cmd = `${getOpenClawCommand()} cron list --json`;
    exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) {
            try {
                const v2Path = path.join(STATE_DIR, 'cron/jobs.json');
                let fileData;
                if (fs.existsSync(v2Path)) fileData = fs.readFileSync(v2Path, 'utf8');
                else fileData = fs.readFileSync(path.join(HOME_DIR, '.clawdbot/cron/jobs.json'), 'utf8');
                const json = JSON.parse(fileData);
                return res.json(json.jobs || []);
            } catch(e) { return res.json([]); }
        }
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
        try {
            const files = fs.readdirSync(memoryDir)
                .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
                .sort().reverse(); 
            return res.json(files.map(f => f.replace('.md', '')));
        } catch(e) { return res.json([]); }
    }

    const tz = 'Asia/Shanghai';
    let date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({error: 'Invalid date'});

    const memPath = path.join(WORKSPACE_DIR, 'memory', `${date}.md`);
    if (!fs.existsSync(memPath)) return res.json({ date, content: '*No memory log found.*' });
    
    try {
        const content = fs.readFileSync(memPath, 'utf8');
        res.json({ date, content });
    } catch (e) { res.status(500).json({ error: 'Failed to read memory' }); }
});

app.post('/api/run/:id', (req, res) => {
    exec(`${getOpenClawCommand()} cron run ${req.params.id}`);
    res.json({status:'triggered'});
});

app.get('/api/config', (req, res) => {
    res.json({ hasToken: !!process.env.TUNNEL_TOKEN });
});

setInterval(() => {
    wss.clients.forEach(c => c.send(JSON.stringify({type:'heartbeat', ts:Date.now()})));
}, 2000);

async function main() {
    server.listen(PORT, '::', async () => {
        console.log(`[Dashboard] Local: http://[::]:${PORT}`);
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
