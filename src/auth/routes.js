/**
 * Auth routes — POST /api/auth, POST /api/logout
 */
const router = require('express').Router();
const { SECRET_KEY } = require('../config');
const {
    generateSessionToken,
    addSession,
    removeSession,
    checkAuthRateLimit,
    resetAuthAttempts,
} = require('./sessions');

// POST /api/auth — Login
router.post('/api/auth', (req, res) => {
    if (!checkAuthRateLimit(req.ip)) {
        return res.status(429).json({ error: 'Too many attempts. Please wait.' });
    }
    const { key } = req.body;
    if (key === SECRET_KEY) {
        resetAuthAttempts(req.ip);
        const token = generateSessionToken();
        addSession(token);
        res.cookie('claw_session', token, {
            httpOnly: true,
            secure: req.secure,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        return res.json({ status: 'ok' });
    }
    res.status(401).json({ error: 'Invalid key' });
});

// POST /api/logout
router.post('/api/logout', (req, res) => {
    const token = req.cookies?.claw_session;
    if (token) removeSession(token);
    res.clearCookie('claw_session');
    res.json({ status: 'ok' });
});

module.exports = router;
