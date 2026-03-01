const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizer');

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
        const { backupPath } = req.body;
        if (!backupPath) {
            return res.status(400).json({ error: 'backupPath is required' });
        }
        const result = await optimizerService.restoreBackup(backupPath);
        res.json(result);
    } catch (err) {
        console.error('Undo error:', err);
        res.status(500).json({ error: 'Failed to undo', details: err.message });
    }
});

module.exports = router;
