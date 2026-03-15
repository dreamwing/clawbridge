const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizer');
const diagnosticsEngine = require('../services/diagnostics');

function validateOptimizeMeta(actionId, meta) {
    if (meta === undefined) return null;
    if (typeof meta !== 'object' || Array.isArray(meta)) {
        return 'meta must be a plain object';
    }
    if (actionId === 'A01' && meta.alternative !== undefined && !/^(?!-)[A-Za-z0-9_./:@-]+$/.test(meta.alternative)) {
        return 'meta.alternative must be a valid model identifier';
    }
    if (actionId === 'A02' && meta.interval !== undefined && !/^(?:0m|0|\d+[mh])$/.test(meta.interval)) {
        return 'meta.interval must be like 30m, 1h, or 0m';
    }
    return null;
}

router.post('/api/optimize/reset-skips', async (req, res) => {
    try {
        await diagnosticsEngine.clearSkipList();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset skips', details: err.message });
    }
});

router.post('/api/optimize/:action_id', async (req, res) => {
    const { action_id } = req.params;
    const { savings } = req.body;
    const meta = req.body.meta == null ? undefined : req.body.meta;

    // Input validation
    if (savings !== undefined && typeof savings !== 'number') {
        return res.status(400).json({ error: 'savings must be a number' });
    }
    const metaError = validateOptimizeMeta(action_id, meta);
    if (metaError) {
        return res.status(400).json({ error: metaError });
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

router.post('/api/optimize/:action_id/unskip', async (req, res) => {
    const { action_id } = req.params;
    try {
        const result = await diagnosticsEngine.unskipAction(action_id);
        res.json(result);
    } catch (err) {
        console.error(`Unskip error for ${action_id}:`, err);
        res.status(500).json({ error: 'Failed to unskip action', details: err.message });
    }
});

module.exports = router;
