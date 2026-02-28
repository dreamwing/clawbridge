const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const BIN_NAME = 'cloudflared';
let BIN_PATH = path.join(__dirname, BIN_NAME);
const PID_FILE = path.join(__dirname, '.cloudflared.pid');

async function downloadBinary() {
    // Check local binary first (legacy or manual placement)
    if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1000000) return;

    // Check system PATH
    const { execSync } = require('child_process');
    try {
        const systemPath = execSync('which cloudflared', { encoding: 'utf8' }).trim();
        if (systemPath && fs.existsSync(systemPath)) {
            BIN_PATH = systemPath;
            return;
        }
    } catch (e) { /* expected if not found in PATH */ }

    // If both fail, throw error so index.js catches it and doesn't start tunnel
    throw new Error('cloudflared not found. Install via: brew install cloudflared (macOS) or apt install cloudflared (Linux)');
}

function stopExistingTunnel() {
    // Use PID file to kill only our own cloudflared process
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid && !isNaN(pid)) {
                try { process.kill(pid, 'SIGTERM'); } catch (e) { /* expected: process may already be dead */ }
                console.log(`[Tunnel] Stopped previous cloudflared (PID: ${pid})`);
            }
            fs.unlinkSync(PID_FILE);
        }
    } catch (e) { console.warn('[Tunnel] Failed to stop existing tunnel:', e.message); }
}

function startTunnel(port, token) {
    return new Promise((resolve, reject) => {
        stopExistingTunnel();

        const args = token
            ? ['tunnel', 'run', '--token', token]
            : ['tunnel', '--url', `http://localhost:${port}`];

        console.log(`[Tunnel] Starting with args: ${args.join(' ')}`);
        const child = spawn(BIN_PATH, args);

        // Save PID so we can kill only our own process later
        try { fs.writeFileSync(PID_FILE, String(child.pid)); } catch (e) { console.warn('[Tunnel] Failed to write PID file:', e.message); }

        let urlFound = false;

        child.stderr.on('data', d => {
            const text = d.toString();

            // Capture Quick Tunnel URL
            const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !token) {
                const url = match[0];
                if (!urlFound) {
                    urlFound = true;
                    console.log(`\n🌊 [Quick Tunnel] URL Generated: ${url}`);
                    try { fs.writeFileSync(path.join(__dirname, '.quick_tunnel_url'), url); } catch (e) { console.warn('[Tunnel] Failed to save quick tunnel URL:', e.message); }
                    resolve(url);
                }
            }

            // Capture Permanent Success
            if (token && text.includes('Registered tunnel connection')) {
                resolve('Permanent Tunnel Active');
            }
        });

        child.on('exit', () => {
            try { fs.unlinkSync(PID_FILE); } catch (e) { /* expected: PID file may not exist */ }
        });

        // If using Token, we might not get a URL in logs, resolve anyway after delay
        if (token) {
            setTimeout(() => resolve('Permanent Tunnel Configured'), 5000);
        }
    });
}

module.exports = { downloadBinary, startTunnel };
