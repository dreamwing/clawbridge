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
const DOCKER_UNSUPPORTED_MONITORING = ['cpu', 'mem', 'disk', 'gatewayPid', 'scripts'];

// --- Poll state ---
// The dashboard polls every 3s. A poll must never overlap the previous one
// (slow `ps`, stalled pipe): stacked children + pipes eat file descriptors,
// and launchd gives this daemon a 256-fd soft limit.
let pollInFlight = false;
let lastDiskUsage = '--%';
let lastGatewayPid = null;
let lastPsOutput = '';
let spawnFailures = 0;

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

    function finalizeStatus({ diskUsage = '--%', gatewayPid = null, psOutput = '', err = null }) {
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
        const unsupportedMonitoring = IS_DOCKER ? [...DOCKER_UNSUPPORTED_MONITORING] : [];

        callback({
            status: status,
            task: taskText,
            cpu: IS_DOCKER ? null : Math.round(totalCpu),
            mem: IS_DOCKER ? null : Math.round((1 - os.freemem() / os.totalmem()) * 100),
            disk: IS_DOCKER ? null : diskUsage,
            timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            lastHeartbeat: new Date().toISOString(),
            versions: versions,
            gatewayPid: IS_DOCKER ? null : gatewayPid,
            scripts: IS_DOCKER ? null : runningScripts,
            environment: {
                isDocker: IS_DOCKER,
            },
            unsupportedMonitoring,
        });
    }

    if (IS_DOCKER) {
        return finalizeStatus({});
    }

    const osType = os.type();
    const mergedCmd = osType === 'Darwin'
        ? `echo "===DISK==="; df -h /System/Volumes/Data | awk 'NR==2 {print $5}'; echo "===GWPID==="; pgrep -f '[o]penclaw.*gateway' | head -n 1 || true; echo "===PS==="; ps -Ao pid,pcpu,comm,args -r | head -n 21`
        : `echo "===DISK==="; df -h /System/Volumes/Data | awk 'NR==2 {print $5}'; echo "===GWPID==="; pgrep -f '[o]penclaw.*gateway' | head -n 1 || true; echo "===PS==="; ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 20`;

    // Overlap guard: if the previous child is still alive, serve the last known
    // snapshot instead of stacking another shell + pipes (fd budget is 256).
    if (pollInFlight) {
        return finalizeStatus({
            diskUsage: lastDiskUsage,
            gatewayPid: lastGatewayPid,
            psOutput: lastPsOutput,
        });
    }
    pollInFlight = true;

    const onDone = (err, stdout) => {
        pollInFlight = false;
        const sections = stdout ? stdout.split(/===\w+===\n?/) : [];
        lastDiskUsage = sections[1] ? sections[1].trim() || '--%' : '--%';
        lastGatewayPid = sections[2] ? sections[2].trim() || null : null;
        lastPsOutput = sections[3] || '';
        if (!err) spawnFailures = 0;
        try {
            finalizeStatus({
                err,
                diskUsage: lastDiskUsage,
                gatewayPid: lastGatewayPid,
                psOutput: lastPsOutput,
            });
        } catch (e) {
            console.error('[Monitor] finalizeStatus failed:', (e && e.message) || e);
            try { callback({ status: 'error', task: 'Monitor Error' }); } catch (_) { /* ignore */ }
        }
    };

    // spawn() can fail synchronously: uv_spawn returns EBADF/ENOSPC when the
    // system cannot create the child (e.g. volume full). Node throws that error
    // straight out of exec(); uncaught it kills the daemon, launchd restarts it,
    // the dying instance still holds the port -> EADDRINUSE -> crash loop.
    try {
        exec(mergedCmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, onDone);
    } catch (e) {
        spawnFailures++;
        if (spawnFailures === 1 || spawnFailures % 20 === 0) {
            console.error(`[Monitor] System status probe failed to spawn (${spawnFailures}x):`, (e && e.code) || (e && e.message) || e);
        }
        onDone(e, '');
    }
}

module.exports = { checkSystemStatus, getVersions };
