const express = require('express');
const router = express.Router();
const diagnosticsEngine = require('../services/diagnostics');

router.get('/api/diagnostics', async (req, res) => {
    try {
        const result = await diagnosticsEngine.runDiagnostics();
        res.json(result);
    } catch (err) {
        console.error("Diagnostics error:", err);
        res.status(500).json({ error: "Failed to run diagnostics", details: err.message });
    }
});

module.exports = router;
