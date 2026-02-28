const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizer');

router.post('/api/optimize/:action_id', async (req, res) => {
    const { action_id } = req.params;
    try {
        const result = await optimizerService.applyAction(action_id);
        res.json(result);
    } catch (err) {
        console.error(`Optimize error for ${action_id}:`, err);
        res.status(500).json({ error: "Failed to apply optimization", details: err.message });
    }
});

module.exports = router;
