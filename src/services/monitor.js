/**
 * System monitor — checks CPU, disk, processes, and versions.
 */
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ID_FILE, APP_DIR, IS_DOCKER } = require('../config');
const { getOpenClawCommand } = require('./openclaw');
const { getActiveContext } = require('./context');
const { logActivity, checkFileChanges } = require('./activity');

// --- Global dedup state ---
global.lastLoggedActivity = null;
global.lastLoggedCpu = null;
let lastProcessedId = null;

try {
    if (fs.existsSync(ID_FILE)) {
        lastProcessedId = fs.readFileSync(ID_FILE, 'utf8').trim();
    }
} catch (e) {
    console.debug('[Init] No previous event ID file:', e.message);
}

// --- Version Cache ---
let cachedVersions = null;
let cachedVersionsTs = 0;
const VERSION_CACHE_TTL = 5 * 60 * 1000;

function getVersions() {
    if (cachedVersions && Date.now() - cachedVersionsTs < VERSION_CACHE_TTL) {
        return cachedVersions;
    }

    let dashboard = 'Unknown';
    let core = 'Unknown';

    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
        dashboard = pkg.version;
    } catch (e) {
        console.warn('[Versions] Failed to read dashboard package.json:', e.message);
    }

    if (IS_DOCKER) {
        core = 'Managed by Docker';
    } else {
        try {
            const cmd = `${getOpenClawCommand()} --version`;
            core = execSync(cmd, { timeout: 5000 }).toString().trim();
        } catch (e) {
            try {
                const nodeBinDir = path.dirname(process.execPath);
                const globalModulesPath = path.join(nodeBinDir, '../lib/node_modules/openclaw/package.json');
                const pkg = JSON.parse(fs.readFileSync(globalModulesPath, 'utf8'));
                core = `v${pkg.version}`;
            } catch (e2) {
                console.warn('[Versions] OpenClaw version detection failed:', e2.message);
                core = 'Unknown';
            }
        }
    }

    cachedVersions = { dashboard, core };
    cachedVersionsTs = Date.now();
    return cachedVersions;
}

function checkSystemStatus(callback) {
    checkFileChanges();

    const osType = os.type();
    let mergedCmd = '';

    if (IS_DOCKER) {
        // In Docker, we can't reliably see host processes or the gateway PID.
        mergedCmd = `echo "===DISK==="; df -h / | awk 'NR==2 {print $5}'; echo "===GWPID==="; echo ""; echo "===PS==="; echo ""`;
    } else if (osType === 'Darwin') {
        mergedCmd = `echo "===DISK==="; df -h / | awk 'NR==2 {print $5}'; echo "===GWPID==="; pgrep -f '[o]penclaw.*gateway' | head -n 1 || true; echo "===PS==="; ps -Ao pid,pcpu,comm,args -r | head -n 21`;
    } else {
        mergedCmd = `echo "===DISK==="; df -h / | awk 'NR==2 {print $5}'; echo "===GWPID==="; pgrep -f '[o]penclaw.*gateway' | head -n 1 || true; echo "===PS==="; ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 20`;
    }

    exec(mergedCmd, (err, stdout) => {
        const sections = stdout ? stdout.split(/===\w+===\n?/) : [];
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

                // 1. Agent Activity (Highest Priority)
                if (ctx) {
                    status = 'busy';
                    const currentId = String(ctx.id).trim();
                    const lastId = String(lastProcessedId).trim();

                    if (currentId !== lastId) {
                        ctx.events.forEach(evt => logActivity(evt, currentId));
                        lastProcessedId = currentId;
                        try {
                            fs.writeFileSync(ID_FILE, currentId, 'utf8');
                        } catch (e) {
                            console.error('ID Save Failed:', e);
                        }
                    }
                    if (ctx.events && ctx.events.length > 0) {
                        taskText = ctx.events[ctx.events.length - 1];
                    }
                }

                // 2. Background Scripts (Medium Priority)
                if (activities.length > 0) {
                    status = 'busy';
                    const activityText = activities.join(', ');
                    if (taskText === 'System Idle') taskText = activityText;
                    if (global.lastLoggedActivity !== activityText) {
                        logActivity(activityText);
                        global.lastLoggedActivity = activityText;
                    }
                } else {
                    global.lastLoggedActivity = null;
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
                    scripts: runningScripts,
                });
            }
        }
    });
}

module.exports = { checkSystemStatus, getVersions };
