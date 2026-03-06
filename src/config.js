/**
 * Central configuration module.
 * Resolves all env vars, paths, and constants at startup.
 */
const path = require('path');

// --- Environment ---
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.ACCESS_KEY;
if (!SECRET_KEY) {
    console.error('❌ ACCESS_KEY not set in .env! Please set a secure key. Exiting.');
    process.exit(1);
}
const TUNNEL_TOKEN = process.env.TUNNEL_TOKEN;

// --- Paths ---
// Shared home/config directory resolution, aligned with OpenClaw's src/infra/home-dir.ts.
const { resolveHomeDir, resolveConfigDir } = require('./utils/paths');

const HOME_DIR = resolveHomeDir();
const STATE_DIR = resolveConfigDir();
const APP_DIR = path.resolve(__dirname, '..');

const LOG_DIR = path.join(APP_DIR, 'data/logs');
const TOKEN_FILE = path.join(APP_DIR, 'data/token_stats/latest.json');
const ID_FILE = path.join(APP_DIR, 'data/last_id.txt');
const ANALYZE_SCRIPT = path.join(APP_DIR, 'scripts/analyze.js');

// --- Constants ---
const CACHE_TTL_MS = 60000; // 60s cache

module.exports = {
    PORT,
    SECRET_KEY,
    TUNNEL_TOKEN,
    HOME_DIR,
    STATE_DIR,
    APP_DIR,
    LOG_DIR,
    TOKEN_FILE,
    ID_FILE,
    ANALYZE_SCRIPT,
    CACHE_TTL_MS,
    resolveHomeDir,
    resolveConfigDir,
};
