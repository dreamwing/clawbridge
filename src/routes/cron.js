/**
 * GET /api/cron, POST /api/run/:id
 */
const router = require('express').Router();
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { HOME_DIR, STATE_DIR, IS_DOCKER } = require('../config');
const { getOpenClawCommand } = require('../services/openclaw');

router.get('/api/cron', (req, res) => {
    // 1. FAST PATH: Read state file directly
    try {
        const v2Path = path.join(STATE_DIR, 'cron/jobs.json');
        const legacyPath = path.join(HOME_DIR, '.clawdbot/cron/jobs.json');

        let target = fs.existsSync(v2Path) ? v2Path : fs.existsSync(legacyPath) ? legacyPath : null;

        if (target) {
            const fileData = fs.readFileSync(target, 'utf8');
            const json = JSON.parse(fileData);
            if (json.jobs) return res.json(json.jobs);
        }
    } catch (e) {
        // Silent fail, fallthrough to CLI
    }

    // 2. SLOW PATH: CLI Fallback (n/a in Docker)
    if (IS_DOCKER) return res.json([]);

    const cmd = `${getOpenClawCommand()} cron list --json`;
    exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        try {
            const data = JSON.parse(stdout);
            if (data.jobs) return res.json(data.jobs);
            return res.json([]);
        } catch (e) {
            res.json([]);
        }
    });
});

router.post('/api/run/:id', (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid job ID format' });
    }
    if (IS_DOCKER) {
        return res.status(403).json({ error: 'Running cron jobs is not supported in Docker Mode. Please interact with the host CLI directly.' });
    }
    const openclawCmd = getOpenClawCommand();
    execFile(openclawCmd, ['cron', 'run', id], (err, stdout, stderr) => {
        if (err) {
            console.error('[Cron Run] Error:', stderr);
            return res.json({ status: 'error', message: stderr || err.message });
        }
        res.json({ status: 'triggered' });
    });
});

module.exports = router;
