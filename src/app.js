/**
 * Express app assembly — wires middleware, auth, static, and routes.
 */
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const authRoutes = require('./auth/routes');
const authMiddleware = require('./auth/middleware');
const apiRoutes = require('./routes');

const app = express();

app.set('trust proxy', 'loopback');

// Body parsing & cookies
app.use(express.json());
app.use(cookieParser());

// Auth routes (before auth middleware — /api/auth must be public)
app.use(authRoutes);

// Auth middleware (protects everything below)
app.use(authMiddleware);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use(apiRoutes);

module.exports = app;
