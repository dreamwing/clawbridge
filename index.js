require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const tunnel = require('./tunnel');

const PORT = 3000;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Config from Env
const SECRET_KEY = process.env.ACCESS_KEY || 'default-insecure';
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;
const LOG_DIR = path.join(__dirname, 'data/logs');
const TOKEN_FILE = path.join(__dirname, 'data/token_stats/latest.json');
const ANALYZE_SCRIPT = path.join(__dirname, 'scripts/analyze.js');

app.use(express.json());

// --- Magic Link Auth Middleware ---
app.use((req, res, next) => {
    if (req.query.key === SECRET_KEY) return next();
    if (req.headers['x-claw-key'] === SECRET_KEY) return next();

    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>body{background:#0f172a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}</style>
            </head>
            <body>
                <script>
                    const storedKey = localStorage.getItem('claw_key');
                    if (storedKey === '${SECRET_KEY}') {
                        if (!location.search.includes('key=')) {
                            location.href = location.pathname + '?key=' + storedKey;
                        }
                    } else {
                        const input = prompt('🔑 ClawBridge Access Key:');
                        if (input === '${SECRET_KEY}') {
                            localStorage.setItem('claw_key', input);
                            location.href = location.pathname + '?key=' + input;
                        } else {
                            alert('❌ Access Denied');
                            localStorage.removeItem('claw_key');
                            location.reload();
                        }
                    }
                </script>
            </body>
            </html>
        `);
    }
    res.status(401).json({ error: 'Unauthorized' });
});

app.use(express.static(path.join(__dirname, 'public')));

// Helper: Get Active Context
function getActiveContext() {
    try {
        const sessionsPath = '/root/.clawdbot/agents/main/sessions/sessions.json';
        if (!fs.existsSync(sessionsPath)) return null;

        const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
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

// Monitor Core
function checkSystemStatus(callback) {
    checkFileChanges();

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

        callback({
            status: status,
            task: taskText,
            cpu: Math.round(totalCpu),
            mem: Math.round((1 - os.freemem() / os.totalmem()) * 100),
            timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            lastHeartbeat: new Date().toISOString()
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

// API: Kill
app.post('/api/kill', (req, res) => {
    exec("pkill -f 'node scripts/'", () => res.json({status:'killed'}));
});

// API: Restart Gateway
app.post('/api/gateway/restart', (req, res) => {
    exec("pkill -f 'clawdbot gateway' || true", () => {
        setTimeout(() => {
            exec("/root/.nvm/versions/node/v22.22.0/bin/clawdbot gateway start --background", () => {
                 res.json({status:'restarted'});
            });
        }, 2000);
    });
});

// API: Cron
app.get('/api/cron', (req, res) => {
    exec('/root/.nvm/versions/node/v22.22.0/bin/clawdbot cron list --json', { maxBuffer: 1024 * 1024 * 5 }, (err, stdout) => {
        if (!err) {
            try {
                const data = JSON.parse(stdout);
                if (data.jobs) return res.json(data.jobs);
            } catch (e) {}
        }
        try {
            const fileData = fs.readFileSync('/root/.clawdbot/cron/jobs.json', 'utf8');
            const json = JSON.parse(fileData);
            return res.json(json.jobs || []);
        } catch(e) {
            res.json([]); 
        }
    });
});

app.post('/api/run/:id', (req, res) => {
    exec(`/root/.nvm/versions/node/v22.22.0/bin/clawdbot cron run ${req.params.id}`);
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
