/**
 * Auth routes — POST /api/auth, POST /api/logout
 */
const router = require('express').Router();
const crypto = require('crypto');
const { SECRET_KEY } = require('../config');
const {
    generateSessionToken,
    addSession,
    removeSession,
    checkAuthRateLimit,
    resetAuthAttempts,
} = require('./sessions');

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        const hashA = crypto.createHash('sha256').update(bufA).digest();
        const hashB = crypto.createHash('sha256').update(bufB).digest();
        return crypto.timingSafeEqual(hashA, hashB);
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/auth — Login
router.post('/api/auth', (req, res) => {
    if (!checkAuthRateLimit(req.ip)) {
        return res.status(429).json({ error: 'Too many attempts. Please wait.' });
    }
    const { key } = req.body;
    if (safeCompare(key, SECRET_KEY)) {
        resetAuthAttempts(req.ip);
        const token = generateSessionToken();
        addSession(token);
        res.cookie('claw_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
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
