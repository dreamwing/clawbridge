/**
 * GET /api/tokens, POST /api/tokens/refresh, GET /api/tokens/status
 */
const router = require('express').Router();
const fs = require('fs');
const { TOKEN_FILE } = require('../config');
const { runAnalyzer, getAnalyzerState } = require('../services/analyzer');

// Simple cache: 30-second TTL for token data
let _tokenCache = null;
let _tokenCacheTime = 0;
const TOKEN_CACHE_TTL = 30 * 1000;

router.get('/api/tokens', (req, res) => {
    if (!fs.existsSync(TOKEN_FILE)) {
        // Return safe defaults instead of empty object
        return res.json({
            updatedAt: null,
            today: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
            total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, models: {} },
            history: {},
            topModels: [],
            recentCosts: { last7dAvg: 0, last30dAvg: 0 },
        });
    }
    // Use cache if fresh enough
    const now = Date.now();
    if (_tokenCache && (now - _tokenCacheTime) < TOKEN_CACHE_TTL) {
        return res.json(_tokenCache);
    }
    try {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        _tokenCache = data;
        _tokenCacheTime = now;
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Read failed' });
    }
});

router.post('/api/tokens/refresh', (req, res) => {
    const result = runAnalyzer();
    if (!result.triggered) {
        return res.status(409).json(result);
    }
    res.json(result);
});

router.get('/api/tokens/status', (req, res) => {
    res.json(getAnalyzerState());
});

module.exports = router;
