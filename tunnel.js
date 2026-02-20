const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BIN_NAME = 'cloudflared';
const BIN_PATH = path.join(__dirname, BIN_NAME);

async function downloadBinary() {
    if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1000000) return;

    // Auto-detect URL logic (Simplified for Linux x64 environment)
    const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
    console.log(`[Tunnel] Downloading cloudflared...`);

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

function startTunnel(port, token) {
    return new Promise((resolve, reject) => {
        // Stop existing
        spawn('pkill', ['-f', BIN_PATH]);

        const args = token 
            ? ['tunnel', 'run', '--token', token]
            : ['tunnel', '--url', `http://localhost:${port}`];

        console.log(`[Tunnel] Starting with args: ${args.join(' ')}`);
        const child = spawn(BIN_PATH, args);

        let urlFound = false;

        child.stderr.on('data', d => {
            const text = d.toString();
            // console.log(`[CF] ${text}`); // Debug

            // Capture Quick Tunnel URL
            const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !token && !urlFound) {
                urlFound = true;
                console.log(`[Tunnel] Quick URL: ${match[0]}`);
                resolve(match[0]);
            }

            // Capture Permanent Success
            if (token && text.includes('Registered tunnel connection')) {
                resolve('Permanent Tunnel Active');
            }
        });

        // If using Token, we might not get a URL in logs, resolve anyway after delay
        if (token) {
            setTimeout(() => resolve('Permanent Tunnel Configured'), 5000);
        }
    });
}

module.exports = { downloadBinary, startTunnel };
