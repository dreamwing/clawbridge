/**
 * GET /api/memory
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { CACHE_TTL_MS } = require('../config');
const { WORKSPACE_DIR } = require('../services/openclaw');

let memoryCache = { data: null, ts: 0 };

router.get('/api/memory', (req, res) => {
    if (req.query.list === 'true') {
        const memoryDir = path.join(WORKSPACE_DIR, 'memory');
        if (!fs.existsSync(memoryDir)) return res.json([]);

        // Cache Check
        if (memoryCache.data && Date.now() - memoryCache.ts < CACHE_TTL_MS) {
            return res.json(memoryCache.data);
        }

        try {
            const files = fs
                .readdirSync(memoryDir)
                .filter(f => 
                    (f.match(/^\d{4}-\d{2}-\d{2}\.md$/) && !f.startsWith('morning-report-') && !f.startsWith('evening-report-') && !f.startsWith('afternoon-report-')) ||
                    (f.match(/^\d{4}-\d{2}-\d{2}-[0-9]{4}\.md$/) && !f.match(/[0-9]{4}-[0-9]{2}$/))
                )
                .sort()
                .reverse()
                .slice(0, 30);

            const list = files.map(f => f.replace('.md', ''));
            memoryCache = { data: list, ts: Date.now() };
            return res.json(list);
        } catch (e) {
            return res.json([]);
        }
    }

    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    let date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (!date.match(/^\d{4}-\d{2}-\d{2}(-[0-9]{4})?$/)) return res.status(400).json({ error: 'Invalid date' });

    const memPath = path.join(WORKSPACE_DIR, 'memory', `${date}.md`);
    if (!fs.existsSync(memPath)) {
        return res.json({
            date,
            content:
                '### 👋 No memories yet today.\n\nChat with your agent or run tasks to start building your timeline.',
        });
    }

    try {
        const content = fs.readFileSync(memPath, 'utf8');
        res.json({ date, content });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read memory' });
    }
});

module.exports = router;
