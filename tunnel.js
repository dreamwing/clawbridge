const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const BIN_NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
const BIN_PATH = path.join(__dirname, BIN_NAME);

// Cloudflare Download URLs
const DOWNLOAD_URLS = {
    'linux-x64': 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
};

function getDownloadUrl() {
    return DOWNLOAD_URLS['linux-x64'];
}

async function downloadBinary() {
    if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1000000) return; // Check if exists and >1MB

    const url = getDownloadUrl();
    console.log(`[Tunnel] Downloading cloudflared from ${url}...`);

    return new Promise((resolve, reject) => {
        // Use wget for reliability
        const wget = spawn('wget', ['-O', BIN_PATH, url]);
        
        wget.on('close', (code) => {
            if (code === 0) {
                fs.chmodSync(BIN_PATH, '755');
                console.log('[Tunnel] Download complete.');
                resolve();
            } else {
                reject(new Error(`wget failed with code ${code}`));
            }
        });
    });
}

function startTunnel(port, token) {
    return new Promise((resolve, reject) => {
        console.log(`[Tunnel] Starting PERMANENT tunnel...`);
        
        // Mode A: Quick Tunnel (No Token)
        if (!token) {
            const child = spawn(BIN_PATH, ['tunnel', '--url', `http://localhost:${port}`]);
            // ... (keep quick tunnel logic) ...
            return;
        }

        // Mode B: Token Tunnel (Fixed Domain)
        // Command: cloudflared tunnel run --token <TOKEN>
        // Note: The tunnel MUST be configured in CF Dashboard to point to http://localhost:3000
        const child = spawn(BIN_PATH, ['tunnel', 'run', '--token', token]);

        child.stdout.on('data', d => console.log(`[CF] ${d}`));
        child.stderr.on('data', d => {
            const text = d.toString();
            console.log(`[CF] ${text}`);
            if (text.includes('Registered tunnel connection')) {
                resolve('https://captain-deck.clawbridge.app'); // Hardcoded success
            }
        });

        child.on('error', reject);
        process.on('exit', () => child.kill());
    });
}

module.exports = { downloadBinary, startTunnel };
