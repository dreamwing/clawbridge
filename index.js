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

// Config
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.ACCESS_KEY || 'default-insecure';
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;
const LOG_DIR = path.join(__dirname, 'data/logs');
const TOKEN_FILE = path.join(__dirname, 'data/token_stats/latest.json');
const ANALYZE_SCRIPT = path.join(__dirname, 'scripts/analyze.js');

app.use(express.json());

// --- Magic Link Auth Middleware ---
app.use((req, res, next) => {
    // 1. Pass if authenticated
    if (req.query.key === SECRET_KEY) return next();
    if (req.headers['x-claw-key'] === SECRET_KEY) return next();

    // 2. Pass safe static assets
    if (req.path.match(/\.(png|jpg|jpeg|svg|gif|ico|css|js)$/)) return next();
    if (req.path === '/manifest.json') return next(); // Allow PWA manifest

    // 3. API calls fail hard
    if (req.path.startsWith('/api')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 4. HTML pages redirect to login prompt
    return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>body{background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}</style>
            </head>
            <body>
                <script>
                    const urlParams = new URLSearchParams(window.location.search);
                    
                    // 1. If URL has key but we are here -> Key was rejected by server
                    if (urlParams.has('key')) {
                        alert('❌ Access Denied: Invalid Key');
                        localStorage.removeItem('claw_key');
                        // Redirect to clean URL to restart flow
                        window.location.href = window.location.pathname;
                    }
                    
                    // 2. If we have a stored key (and clean URL), try to auto-login
                    else if (localStorage.getItem('claw_key')) {
                        const key = localStorage.getItem('claw_key');
                        window.location.href = window.location.pathname + '?key=' + key;
                    }
                    
                    // 3. No key, No storage -> Prompt User
                    else {
                        const input = prompt('🔑 ClawBridge Access Key:');
                        if (input) {
                            localStorage.setItem('claw_key', input);
                            window.location.href = window.location.pathname + '?key=' + input;
                        }
                    }
                </script>
            </body>
            </html>
    `);
});

app.use(express.static(path.join(__dirname, 'public')));

// Helper: Get Active Context
function getActiveContext() {
    try {
        // Updated Path for OpenClaw V2
        // Dynamic path resolution based on CWD
        const sessionsPath = path.join(process.cwd(), '../../.openclaw/sessions/sessions.json');
        
        // Fallback absolute path
        const altSessionsPath = '/root/clawd/.openclaw/sessions/sessions.json';
        
        let targetPath = sessionsPath;
        if (!fs.existsSync(targetPath) && fs.existsSync(altSessionsPath)) {
            targetPath = altSessionsPath;
        }

        if (!fs.existsSync(targetPath)) return null;

        const sessions = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        let latestSession = null;
        let maxTime = 0;
        
        Object.values(sessions).forEach(s => {
            if (s.updatedAt > maxTime) {
                maxTime = s.updatedAt;
                latestSession = s;
            }
        });

        if (!latestSession || (Date.now() - maxTime > 10000)) return null;

        const logFile = latestSession.sessionFile;
        if (!fs.existsSync(logFile)) return null;

        const tail = execSync(`tail -n 50 "${logFile}"`).toString();
        const lines = tail.trim().split('\n').reverse();

        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                if (event.message && event.message.content) {
                    const tool = event.message.content.find(c => c.type === 'toolCall');
                    if (tool) {
                        let argStr = '';
                        if (tool.arguments) {
                            if (tool.name === 'web_search') argStr = `"${tool.arguments.query}"`;
                            else if (tool.name === 'read') argStr = tool.arguments.path || tool.arguments.file_path;
                            else if (tool.name === 'exec') argStr = tool.arguments.command;
                            else argStr = JSON.stringify(tool.arguments);
                        }
                        if (argStr && argStr.length > 500) argStr = argStr.substring(0, 500) + '...';
                        return `🔧 ${tool.name} ${argStr}`;
                    }
                    
                    const thinking = event.message.content.find(c => c.type === 'thinking');
                    if (thinking && thinking.thinking) {
                        let text = thinking.thinking.replace(/^[#\*\- ]+/, '').replace(/\n/g, ' ').trim();
                        if (text.length > 500) text = text.substring(0, 500) + '...';
                        return `🧠 ${text}`;
                    }
                }
            } catch(e) {}
        }
    } catch (e) { }
    return null;
}

// Helper: Save Activity (JSONL Append)
let lastRecordedTask = 'System Idle';

function logActivity(task) {
    if (!task || task === 'System Idle') return;
    if (task === lastRecordedTask) return;
    
    lastRecordedTask = task;

    const now = new Date();
    const ts = now.toISOString();
    const entry = { ts, task };
    
    // Path: data/logs/YYYY-MM/DD.jsonl
    const monthDir = path.join(LOG_DIR, ts.substring(0, 7)); // YYYY-MM
    const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`); // DD.jsonl

    try {
        if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch(e) {
        console.error('Log write failed:', e);
    }
}

// --- File Watcher ---
let fileState = {}; 
const WATCH_DIRS = ['/root/clawd/memory', '/root/clawd/scripts'];
const WATCH_FILES = ['/root/clawd/MEMORY.md', '/root/clawd/AGENTS.md', '/root/clawd/HEARTBEAT.md'];

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
                const rel = filePath.replace('/root/clawd/', '');
                logActivity(`📄 Created: ${rel}`);
            }
            return;
        }

        if (mtime > fileState[filePath]) {
            fileState[filePath] = mtime;
            if (Date.now() - mtime < 60000) { 
                const rel = filePath.replace('/root/clawd/', '');
                logActivity(`📝 Updated: ${rel}`);
            }
        }
    } catch(e) {}
}

// Helper: Get Versions
let cachedVersions = null;
function getVersions() {
    if (cachedVersions) return cachedVersions;
    
    let dashboard = 'Unknown';
    let core = 'Unknown';
    
    // 1. Dashboard Version (from local package.json)
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        dashboard = pkg.version;
    } catch(e) {}

    // 2. OpenClaw Core Version
    try {
        const corePkg = JSON.parse(fs.readFileSync('/root/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/package.json', 'utf8'));
        core = `v${corePkg.version}`;
    } catch(e) {
        // Fallback: try CLI if file read fails
        try {
            const cmd = `${getOpenClawCommand()} --version`;
            core = execSync(cmd).toString().trim();
        } catch(err) {}
    }

    cachedVersions = { dashboard, core };
    return cachedVersions;
}

// Monitor Core
function checkSystemStatus(callback) {
    checkFileChanges();

    exec("df -h / | awk 'NR==2 {print $5}'", (errDisk, stdoutDisk) => {
        const diskUsage = stdoutDisk ? stdoutDisk.trim() : '--%';

        const cmd = "ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 15";
        exec(cmd, (err, stdout) => {
            if (err) return callback({ status: 'error', task: 'Monitor Error' });

            const lines = stdout.trim().split('\n').slice(1);
            let activities = [];
            let totalCpu = 0;
            let topProc = null;


            lines.forEach((line, index) => {
                const parts = line.trim().split(/\s+/);
                const cpu = parseFloat(parts[1]);
                const comm = parts[2];
                const args = parts.slice(3).join(' ');

                if (!isNaN(cpu)) totalCpu += cpu;
                
                // Capture Top Process Name (Row 0)
                if (index === 0) {
                    topProc = `${comm} (${Math.round(cpu)}%)`;
                }

                if (comm === 'node' && args.includes('scripts/')) {
                    const script = args.match(/scripts\/([a-zA-Z0-9_.-]+)/)?.[1] || 'Script';
                    activities.push(`📜 ${script}`);
                }
                
                if (['grep', 'find', 'curl', 'wget', 'git', 'tar', 'python', 'python3'].includes(comm)) {
                    let detail = args.split(' ').pop();
                    if (comm === 'grep') detail = args.match(/"([^"]+)"/)?.[1] || detail;
                    if (detail && detail.length > 500) detail = detail.substring(0, 500) + '...';
                    activities.push(`🔧 ${comm} ${detail}`);
                }
            });

            activities = [...new Set(activities)];
            const context = getActiveContext();
            
            let status = 'idle';
            let taskText = 'System Idle';
            
            if (context) {
                status = 'busy';
                taskText = context;
            } else if (activities.length > 0) {
                status = 'busy';
                taskText = activities.join(', ');
            } else if (totalCpu > 15.0) {
                status = 'busy';
                taskText = `⚡ High CPU: ${topProc || 'Unknown'}`;
            }

            if (taskText === 'System Idle') {
                if (lastRecordedTask !== 'System Idle') {
                    lastRecordedTask = 'System Idle'; 
                }
            } else {
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
                versions: versions
            });
        });
    });
}

// API: Status
app.get('/api/status', (req, res) => {
    checkSystemStatus((data) => res.json(data));
});

// API: Logs (JSONL Reader)
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    
    // Construct path
    const month = dateStr.slice(0, 7);
    const day = dateStr.slice(8, 10);
    const logFile = path.join(LOG_DIR, month, `${day}.jsonl`);

    if (!fs.existsSync(logFile)) {
        return res.json([]);
    }

    try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.trim().split('\n');
        const logs = [];
        for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i]) continue;
            try {
                logs.push(JSON.parse(lines[i]));
            } catch(e) {}
            if (logs.length >= limit) break;
        }
        res.json(logs);
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: 'Log read failed' });
    }
});

// API: Tokens (Auth Protected)
app.get('/api/tokens', (req, res) => {
    if (!fs.existsSync(TOKEN_FILE)) return res.json({});
    try {
        const data = fs.readFileSync(TOKEN_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch(e) {
        res.status(500).json({ error: 'Read failed' });
    }
});

// API: Trigger Token Analysis
app.post('/api/tokens/refresh', (req, res) => {
    runAnalyzer();
    res.json({ status: 'triggered', message: 'Analysis started. Refresh in a few seconds.' });
});

// Helper: Run Analyzer (Child Process)
function runAnalyzer() {
    const nodePath = process.execPath; // Use the exact same node binary running this script
    exec(`"${nodePath}" "${ANALYZE_SCRIPT}"`, (err, stdout, stderr) => {
        if (err) console.error('[Analyzer] Error:', stderr);
        // else console.log('[Analyzer] Updated stats');
    });
}

// Background Loop & Scheduler
setInterval(() => {
    checkSystemStatus(() => {});
}, 3000);

// Run Analyzer on Start + Every Hour
runAnalyzer();
setInterval(runAnalyzer, 60 * 60 * 1000);

// API: Kill (Graceful Shutdown)
app.post('/api/kill', (req, res) => {
    // 1. Try SIGTERM (Graceful)
    exec("pkill -SIGTERM -f 'node scripts/'", (err) => {
        // 2. Wait 3s, then check and Force Kill if needed
        setTimeout(() => {
            exec("pgrep -f 'node scripts/'", (err, stdout) => {
                if (!err && stdout) {
                    console.log('Force killing stuck scripts...');
                    exec("pkill -SIGKILL -f 'node scripts/'");
                }
            });
        }, 3000);
        res.json({status:'stopping', message: 'Sent SIGTERM. Will force kill in 3s if needed.'});
    });
});

// API: Restart Gateway
app.post('/api/gateway/restart', (req, res) => {
    // Graceful Stop first
    exec("pkill -SIGTERM -f 'openclaw gateway' || true", () => {
        setTimeout(() => {
            // Force start
            const cmd = `${getOpenClawCommand()} gateway start --background`;
            exec(cmd, (err, stdout, stderr) => {
                 if (err) {
                     console.error('Restart failed:', stderr);
                     res.json({status:'error', message: stderr});
                 } else {
                     res.json({status:'restarted'});
                 }
            });
        }, 2000);
    });
});

// Helper: Resolve OpenClaw Binary
function getOpenClawCommand() {
    // 1. Env Var (User Override)
    if (process.env.OPENCLAW_PATH) return process.env.OPENCLAW_PATH;

    // 2. Try standard command (works if in PATH)
    try {
        execSync('which openclaw');
        return 'openclaw';
    } catch (e) {}

    // 3. Fallback: Hardcoded path for this specific environment (Clawdbot Standard Env)
    // This is useful for systemd services where PATH might be minimal
    const localPath = '/root/.nvm/versions/node/v22.22.0/bin/openclaw';
    if (fs.existsSync(localPath)) return localPath;

    // 4. Give up, hope 'openclaw' works or user sets env
    return 'openclaw';
}

// API: Cron
app.get('/api/cron', (req, res) => {
    const cmd = `${getOpenClawCommand()} cron list --json`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron API Error]', stderr || err.message);
            // Fallback to static file if CLI fails
            try {
                // Try V2 path first
                let fileData;
                const v2Path = '/root/clawd/.openclaw/cron/jobs.json';
                if (fs.existsSync(v2Path)) {
                    fileData = fs.readFileSync(v2Path, 'utf8');
                } else {
                    // Fallback to legacy path
                    fileData = fs.readFileSync('/root/.clawdbot/cron/jobs.json', 'utf8');
                }
                const json = JSON.parse(fileData);
                return res.json(json.jobs || []);
            } catch(e) {
                console.error('[Cron File Error]', e.message);
                return res.json([]); 
            }
        }
        
        try {
            const data = JSON.parse(stdout);
            if (data.jobs) return res.json(data.jobs);
            return res.json([]);
        } catch (e) {
            console.error('[Cron Parse Error]', e.message);
            res.json([]);
        }
    });
});

// API: Memory Feed
app.get('/api/memory', (req, res) => {
    // 1. List available dates
    if (req.query.list === 'true') {
        const memoryDir = '/root/clawd/memory';
        if (!fs.existsSync(memoryDir)) return res.json([]);
        
        try {
            const files = fs.readdirSync(memoryDir)
                .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
                .sort()
                .reverse(); // Newest first
            return res.json(files.map(f => f.replace('.md', '')));
        } catch(e) { return res.json([]); }
    }

    // 2. Get specific date content
    const tz = 'Asia/Shanghai';
    let date = req.query.date;
    if (!date) {
        date = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    }
    
    // Safety check path traversal
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return res.status(400).json({error: 'Invalid date'});

    const memPath = `/root/clawd/memory/${date}.md`;
    
    if (!fs.existsSync(memPath)) {
        return res.json({ date, content: '*No memory log found for this date.*' });
    }
    
    try {
        const content = fs.readFileSync(memPath, 'utf8');
        res.json({ date, content });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read memory' });
    }
});

app.post('/api/run/:id', (req, res) => {
    // Use dynamic command
    exec(`${getOpenClawCommand()} cron run ${req.params.id}`);
    res.json({status:'triggered'});
});

// WS Heartbeat
setInterval(() => {
    wss.clients.forEach(c => c.send(JSON.stringify({type:'heartbeat', ts:Date.now()})));
}, 2000);

// Main
async function main() {
    server.listen(PORT, '::', async () => {
        console.log(`[Dashboard] Local: http://[::]:${PORT}`);
        if (process.env.ENABLE_EMBEDDED_TUNNEL === 'true') {
            try {
                await tunnel.downloadBinary();
                const url = await tunnel.startTunnel(PORT, TUNNEL_TOKEN);
                console.log(`\n🚀 CLAWBRIDGE DASHBOARD LIVE:\n👉 ${url}\n`);
            } catch (e) {
                console.error('Tunnel Failed:', e);
            }
        }
    });
}

main();
