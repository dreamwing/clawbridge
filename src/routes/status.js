/**
 * GET /api/status
 */
const router = require('express').Router();
const { checkSystemStatus } = require('../services/monitor');

router.get('/api/status', (req, res) => {
    checkSystemStatus(data => res.json(data));
});

module.exports = router;

// Proxy: /services → unified-home:3848 (for Athena monitoring center)
const http = require('http');
router.get('/services', (req, res) => {
    http.get('http://127.0.0.1:3848/services', { timeout: 3000 }, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Content-Type', 'application/json');
            res.send(data);
        });
    }).on('error', () => {
        res.status(500).json({ error: 'unified-home unreachable' });
    });
});
