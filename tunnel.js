const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const BIN_NAME = 'cloudflared';
const BIN_PATH = path.join(__dirname, BIN_NAME);
const PID_FILE = path.join(__dirname, '.cloudflared.pid');

function getDownloadUrl() {
    const arch = os.arch(); // 'x64', 'arm64', etc.
    const platform = os.platform(); // 'linux', 'darwin', etc.

    const archMap = {
        'x64': 'amd64',
        'arm64': 'arm64',
        'arm': 'arm',
    };

    const cfArch = archMap[arch];
    if (!cfArch) {
        throw new Error(`Unsupported architecture: ${arch}. Supported: x64, arm64, arm`);
    }

    if (platform === 'linux') {
        return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}`;
    } else if (platform === 'darwin') {
        return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${cfArch}.tgz`;
    }

    throw new Error(`Unsupported platform: ${platform}. Supported: linux, darwin`);
}

async function downloadBinary() {
    if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1000000) return;

    const url = getDownloadUrl();
    console.log(`[Tunnel] Downloading cloudflared for ${os.platform()}/${os.arch()}...`);

    return new Promise((resolve, reject) => {
        const wget = spawn('wget', ['-q', '-O', BIN_PATH, url]);
        wget.on('close', (code) => {
            if (code === 0) {
                fs.chmodSync(BIN_PATH, '755');
                resolve();
            } else reject(new Error('Download failed'));
        });
    });
}

function stopExistingTunnel() {
    // Use PID file to kill only our own cloudflared process
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid && !isNaN(pid)) {
                try { process.kill(pid, 'SIGTERM'); } catch (e) { } // Ignore if already dead
                console.log(`[Tunnel] Stopped previous cloudflared (PID: ${pid})`);
            }
            fs.unlinkSync(PID_FILE);
        }
    } catch (e) { }
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
        try { fs.writeFileSync(PID_FILE, String(child.pid)); } catch (e) { }

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
                    try { fs.writeFileSync(path.join(__dirname, '.quick_tunnel_url'), url); } catch (e) { }
                    resolve(url);
                }
            }

            // Capture Permanent Success
            if (token && text.includes('Registered tunnel connection')) {
                resolve('Permanent Tunnel Active');
            }
        });

        child.on('exit', () => {
            try { fs.unlinkSync(PID_FILE); } catch (e) { }
        });

        // If using Token, we might not get a URL in logs, resolve anyway after delay
        if (token) {
            setTimeout(() => resolve('Permanent Tunnel Configured'), 5000);
        }
    });
}

module.exports = { downloadBinary, startTunnel };
