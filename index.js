/**
 * ClawBridge Dashboard — Entry Point
 *
 * This is the thin orchestrator that loads config, creates the server,
 * wires up modules, and starts listening.
 */
require('dotenv').config({ path: '/Users/openclaw0712/.openclaw/workspace/clawbridge/.env' });

const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const { PORT, TUNNEL_TOKEN, LOG_DIR } = require('./src/config');
const app = require('./src/app');
const { setupWebSocket } = require('./src/websocket');
const { checkSystemStatus } = require('./src/services/monitor');
const { runAnalyzer, setWss } = require('./src/services/analyzer');
const { WORKSPACE_DIR } = require('./src/services/openclaw');
const tunnel = require('./tunnel');
const disableAnalyzer = process.env.COST_CONTROL_SKIP_ANALYZER === 'true';

// --- Create Server ---
const server = createServer(app);
const wss = new WebSocketServer({ server });

// --- WebSocket ---
setupWebSocket(wss);
setWss(wss);

// --- Background Tasks ---
setInterval(() => {
    try {
        checkSystemStatus(() => { });
    } catch (e) {
        console.error('[Dashboard] checkSystemStatus failed:', e && e.message ? e.message : e);
    }
}, 3000);

// --- Process-level safety net ---
// Background work (monitor, analyzer, websocket) must not be able to take the
// dashboard down: an uncaught exception kills the process, launchd restarts it
// immediately and the dying instance still holds port 3847 -> EADDRINUSE ->
// crash loop. Log loudly, keep serving.
process.on('uncaughtException', (err) => {
    console.error('[Dashboard] Uncaught exception (daemon kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Dashboard] Unhandled rejection (daemon kept alive):', reason);
});

if (!disableAnalyzer) {
    try {
        runAnalyzer();
    } catch (e) {
        console.error('[Dashboard] runAnalyzer failed:', e && e.message ? e.message : e);
    }
    setInterval(() => {
        try {
            runAnalyzer();
        } catch (e) {
            console.error('[Dashboard] runAnalyzer failed:', e && e.message ? e.message : e);
        }
    }, 60 * 60 * 1000);
}

// --- Startup ---
async function main() {
    // Cleanup old quick tunnel file
    try {
        fs.unlinkSync(path.join(__dirname, '.quick_tunnel_url'));
    } catch (e) {
        /* expected: file may not exist */
    }

    // Handle EADDRINUSE gracefully — exponential backoff (capped at 60s) so a
    // stale instance holding the port cannot turn into a 5s-interval log storm.
    let bindRetryDelay = 5000;
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Dashboard] Port ${PORT} in use, retrying in ${Math.round(bindRetryDelay / 1000)}s...`);
            setTimeout(() => server.listen(PORT, '::'), bindRetryDelay);
            bindRetryDelay = Math.min(bindRetryDelay * 2, 60000);
            return;
        }
        if (err.code === 'ERR_SERVER_NOT_RUNNING') return;
        console.error('[Dashboard] Server error:', err);
        process.exit(1);
    });
    server.listen(PORT, '::', async () => {
        console.log(`[Dashboard] Local: http://[::]:${PORT}`);
        console.log(`[Init] Workspace: ${WORKSPACE_DIR}`);
        console.log(`[Init] State Dir: ${require('./src/config').STATE_DIR}`);

        // Cold start — ensure log file has at least one entry
        const now = new Date();
        const ts = now.toISOString();
        const monthDir = path.join(LOG_DIR, ts.substring(0, 7));
        const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`);

        try {
            if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
            const isNew = !fs.existsSync(logFile) || fs.statSync(logFile).size === 0;
            if (isNew) {
                const entry = { ts, task: '🚀 ClawBridge Dashboard Online' };
                fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
            }
        } catch (e) {
            console.warn('[Startup] Failed to write cold-start log:', e.message);
        }

        // Tunnel
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
