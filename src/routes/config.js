/**
 * GET /api/config, GET /api/check_update
 */
const router = require('express').Router();
const https = require('https');

router.get('/api/config', (req, res) => {
    res.json({ hasToken: !!process.env.TUNNEL_TOKEN });
});

router.get('/api/check_update', (req, res) => {
    const fetchUrl = (url, attempts = 0) => {
        if (attempts > 3) return res.json({ error: 'Too many redirects', version: '0.0.0' });

        https
            .get(url, { timeout: 3000 }, apiRes => {
                if (apiRes.statusCode >= 300 && apiRes.statusCode < 400 && apiRes.headers.location) {
                    return fetchUrl(apiRes.headers.location, attempts + 1);
                }

                let data = '';
                apiRes.on('data', chunk => (data += chunk));
                apiRes.on('end', () => {
                    try {
                        res.json(JSON.parse(data));
                    } catch (_e) {
                        res.json({ error: 'Invalid JSON', version: '0.0.0' });
                    }
                });
            })
            .on('error', _e => {
                res.json({ error: 'Update check failed', version: '0.0.0' });
            });
    };

    fetchUrl('https://clawbridge.app/api/version');
});

module.exports = router;
