/**
 * POST /api/kill, POST /api/gateway/restart
 */
const router = require('express').Router();
const { exec } = require('child_process');
const path = require('path');
const { rateLimit } = require('../utils/rateLimit');
const { getOpenClawCommand, WORKSPACE_DIR } = require('../services/openclaw');
const { IS_DOCKER } = require('../config');

router.post('/api/kill', (req, res) => {
    if (req.body?.confirm !== true) {
        return res.status(400).json({ error: 'Confirmation required. Send { "confirm": true } in request body.' });
    }
    if (!rateLimit('kill', 5000)) {
        return res.status(429).json({ error: 'Please wait before retrying.' });
    }
    if (IS_DOCKER) {
        return res.status(403).json({ error: 'Process termination is not supported in Docker Container Mode. Please restart the container or run host commands directly.' });
    }

    const openclawDir = path.resolve(WORKSPACE_DIR);
    const escapedDir = openclawDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    exec(`pgrep -f 'node.*${escapedDir}'`, (err, stdout) => {
        const pidList = stdout ? stdout.trim().split('\n').filter(Boolean) : [];
        if (pidList.length === 0) {
            console.log(`[Kill] No matching processes found (scope: ${openclawDir}) by ${req.ip}`);
            return res.json({ status: 'none', message: 'No matching script processes found.' });
        }

        exec(`ps -p ${pidList.join(',')} -o pid,args`, (psErr, psOut) => {
            let processDetails = pidList.join(', ');
            if (psOut) {
                // Strip the header line generic to both Linux and macOS
                const lines = psOut.trim().split('\n');
                if (lines.length > 1) {
                    processDetails = lines.slice(1).join('\n');
                } else {
                    processDetails = lines[0]; // just in case
                }
            }
            console.log(`[Kill] Terminating processes by ${req.ip} at ${new Date().toISOString()}:\n${processDetails}`);

            pidList.forEach(pid => {
                try {
                    process.kill(parseInt(pid), 'SIGTERM');
                } catch (e) {
                    /* may already be dead */
                }
            });

            setTimeout(() => {
                pidList.forEach(pid => {
                    try {
                        process.kill(parseInt(pid), 0);
                        process.kill(parseInt(pid), 'SIGKILL');
                    } catch (e) {
                        /* already dead */
                    }
                });
            }, 3000);

            res.json({ status: 'stopping', pids: pidList, details: processDetails });
        });
    });
});

router.post('/api/gateway/restart', (req, res) => {
    if (!rateLimit('gateway_restart', 10000)) {
        return res.status(429).json({ error: 'Please wait at least 10 seconds before retrying.' });
    }
    if (IS_DOCKER) {
        return res.status(403).json({ error: 'Gateway process restarts are not supported inside Docker containers. To restart the gateway, please restart the Docker container.' });
    }
    console.log(`[Gateway] Restart requested by ${req.ip} at ${new Date().toISOString()}`);

    exec("pkill -SIGTERM -f 'openclaw gateway' || true", (killErr, killStdout, killStderr) => {
        if (killErr && killErr.code !== 1) {
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

module.exports = router;
