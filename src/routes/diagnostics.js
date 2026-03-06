const express = require('express');
const router = express.Router();
const diagnosticsEngine = require('../services/diagnostics');

router.get('/api/diagnostics', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const result = await diagnosticsEngine.runDiagnostics();
        // Strip _rawData unless ?verbose=true (advanced user API export)
        if (req.query.verbose !== 'true') {
            const { _rawData, ...clean } = result; // eslint-disable-line no-unused-vars
            return res.json(clean);
        }
        res.json(result);
    } catch (err) {
        console.error("Diagnostics error:", err);
        res.status(500).json({ error: "Failed to run diagnostics", details: err.message });
    }
});

module.exports = router;
