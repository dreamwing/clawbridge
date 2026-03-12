const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizer');

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

module.exports = router;
