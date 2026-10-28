/**
 * Athena Dashboard Route
 * Serves the Athena web dashboard at /athena
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, '.openclaw', 'workspace');
const DASHBOARD_PATH = path.join(WORKSPACE, '🏛️-雅典娜核心', 'athena-dashboard.html');
const API_SERVER_PATH = path.join(WORKSPACE, '🏛️-雅典娜核心', 'athena-api-server.js');

// Startup cache — load once, serve many
let _dashboardHtmlCache = null;
function getDashboardHtml() {
    if (_dashboardHtmlCache) return _dashboardHtmlCache;
    if (fs.existsSync(DASHBOARD_PATH)) {
        _dashboardHtmlCache = fs.readFileSync(DASHBOARD_PATH, 'utf8')
            .replace(/fetch\('\/api\//g, "fetch('/clawbridge/api/")
            .replace(/fetch\("\/api\//g, 'fetch("/clawbridge/api/');
    }
    return _dashboardHtmlCache;
}

// Serve Athena Dashboard
router.get('/athena', (req, res) => {
    const html = getDashboardHtml();
    if (html) {
        res.type('html').send(html);
    } else {
        res.status(404).json({ error: 'Athena Dashboard not found' });
    }
});

// Proxy /api/* to Athena API server
router.get('/api/status', async (req, res) => {
    try {
        const http = require('http');
        const options = { hostname: '127.0.0.1', port: 18801, path: '/api/status', method: 'GET' };
        const proxyReq = http.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                try { res.json(JSON.parse(data)); }
                catch { res.status(500).json({ error: 'Invalid response from Athena API' }); }
            });
        });
        proxyReq.on('error', () => res.status(503).json({ error: 'Athena API unavailable' }));
        proxyReq.end();
    } catch { res.status(503).json({ error: 'Athena API error' }); }
});

router.get('/api/skills', async (req, res) => {
    try {
        const http = require('http');
        const options = { hostname: '127.0.0.1', port: 18801, path: '/api/skills', method: 'GET' };
        const proxyReq = http.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                try { res.json(JSON.parse(data)); }
                catch { res.status(500).json({ error: 'Invalid response from Athena API' }); }
            });
        });
        proxyReq.on('error', () => res.status(503).json({ error: 'Athena API unavailable' }));
        proxyReq.end();
    } catch { res.status(503).json({ error: 'Athena API error' }); }
});

// Check if Athena API server is running
router.get('/api/health', async (req, res) => {
    try {
        const http = require('http');
        const options = { hostname: '127.0.0.1', port: 18801, path: '/api/health', method: 'GET', timeout: 3000 };
        const proxyReq = http.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                try { res.json(JSON.parse(data)); }
                catch { res.json({ status: 'unknown' }); }
            });
        });
        proxyReq.on('error', () => res.json({ status: 'offline', port: 18801 }));
        proxyReq.on('timeout', () => res.json({ status: 'timeout' }));
        proxyReq.end();
    } catch { res.json({ status: 'error' }); }
});

// Embed Athena dashboard link in dashboard nav
router.get('/athena-info', (req, res) => {
    const isRunning = isPortInUse(18801);
    res.json({
        available: true,
        port: 18801,
        dashboardUrl: '/athena',
        apiStatus: isRunning ? 'running' : 'stopped'
    });
});

function isPortInUse(port) {
    const net = require('net');
    const server = net.createServer();
    return new Promise(resolve => {
        server.once('error', () => resolve(true));
        server.once('listening', () => { server.close(); resolve(false); });
        server.listen(port, '127.0.0.1');
    });
}

module.exports = router;