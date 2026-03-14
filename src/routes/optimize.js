const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizer');
const diagnosticsEngine = require('../services/diagnostics');

router.post('/api/optimize/:action_id', async (req, res) => {
    const { action_id } = req.params;
    const { savings } = req.body;
    const meta = req.body.meta == null ? undefined : req.body.meta;

    // Input validation
    if (savings !== undefined && typeof savings !== 'number') {
        return res.status(400).json({ error: 'savings must be a number' });
    }
    if (meta !== undefined && (typeof meta !== 'object' || Array.isArray(meta))) {
        return res.status(400).json({ error: 'meta must be a plain object' });
    }

    try {
        const result = await optimizerService.applyAction(action_id, savings, meta);
        res.json(result);
    } catch (err) {
        console.error(`Optimize error for ${action_id}:`, err);
        res.status(500).json({ error: 'Failed to apply optimization', details: err.message });
    }
});

router.post('/api/optimize/:action_id/skip', async (req, res) => {
    const { action_id } = req.params;
    try {
        const result = await diagnosticsEngine.skipAction(action_id);
        res.json(result);
    } catch (err) {
        console.error(`Skip error for ${action_id}:`, err);
        res.status(500).json({ error: 'Failed to skip action', details: err.message });
    }
});

router.post('/api/optimize/reset-skips', async (req, res) => {
    try {
        await diagnosticsEngine.clearSkipList();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset skips', details: err.message });
    }
});

module.exports = router;
