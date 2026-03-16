const express = require('express');
const router = express.Router();
const path = require('path');
const optimizerService = require('../services/optimizer');

const BACKUPS_DIR = path.join(__dirname, '../../data/backups');

router.get('/api/optimizations/history', async (req, res) => {
    try {
        const history = await optimizerService.getHistory();
        res.json(history);
    } catch (err) {
        console.error("Optimization history error:", err);
        res.status(500).json({ error: "Failed to fetch history", details: err.message });
    }
});

router.post('/api/optimizations/undo', async (req, res) => {
    try {
        const { backupPath, selectedSkillNames } = req.body;
        if (!backupPath) {
            return res.status(400).json({ error: 'backupPath is required' });
        }
        if (selectedSkillNames !== undefined && !Array.isArray(selectedSkillNames)) {
            return res.status(400).json({ error: 'selectedSkillNames must be an array' });
        }

        // Security: resolve to expected directory, reject traversal attempts
        const resolved = path.resolve(BACKUPS_DIR, path.basename(backupPath));
        if (!resolved.startsWith(BACKUPS_DIR + path.sep)) {
            return res.status(400).json({ error: 'Invalid backup path' });
        }

        const result = await optimizerService.restoreBackup(resolved, { selectedSkillNames });
        res.json(result);
    } catch (err) {
        console.error('Undo error:', err);
        res.status(500).json({ error: 'Failed to undo', details: err.message });
    }
});

router.post('/api/optimizations/undo-preview', async (req, res) => {
    try {
        const { backupPath } = req.body;
        if (!backupPath) {
            return res.status(400).json({ error: 'backupPath is required' });
        }

        const resolved = path.resolve(BACKUPS_DIR, path.basename(backupPath));
        if (!resolved.startsWith(BACKUPS_DIR + path.sep)) {
            return res.status(400).json({ error: 'Invalid backup path' });
        }

        const result = await optimizerService.inspectBackup(resolved);
        res.json(result);
    } catch (err) {
        console.error('Undo preview error:', err);
        res.status(500).json({ error: 'Failed to inspect backup', details: err.message });
    }
});

module.exports = router;
