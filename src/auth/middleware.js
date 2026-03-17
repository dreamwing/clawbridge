/**
 * Authentication middleware — checks cookie, header, or query key.
 */
const path = require('path');
const fs = require('fs');
const { SECRET_KEY } = require('../config');
const { hasSession, generateSessionToken, addSession } = require('./sessions');
const { safeCompare } = require('./utils');

// Cache login page HTML at startup
const LOGIN_PAGE = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');

function authMiddleware(req, res, next) {
    // 1. Cookie-based session (preferred)
    const sessionToken = req.cookies?.claw_session;
    if (sessionToken && hasSession(sessionToken)) return next();

    // 2. Header-based auth (for API/programmatic access)
    if (safeCompare(req.headers['x-claw-key'], SECRET_KEY)) return next();

    // 3. Query key (legacy, backward-compatible magic links — sets cookie then redirects)
    if (safeCompare(req.query.key, SECRET_KEY)) {
        const token = generateSessionToken();
        addSession(token);
        res.cookie('claw_session', token, {
            httpOnly: true,
            secure: req.secure,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        const cleanUrl = req.path;
        return res.redirect(302, cleanUrl);
    }

    // 4. Static assets passthrough
    if (req.path.match(/\.(png|jpg|jpeg|svg|gif|ico|css)$/)) return next();
    if (req.path === '/manifest.json') return next();
    if (req.path === '/login.html') return res.redirect(302, '/');

    // 5. API returns 401
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Unauthorized' });

    // 6. Serve login page
    return res.send(LOGIN_PAGE);
}

module.exports = authMiddleware;
