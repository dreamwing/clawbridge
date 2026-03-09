/**
 * Token analysis runner.
 * Supports state tracking, concurrent protection, and WebSocket broadcast.
 */
const { exec } = require('child_process');
const { ANALYZE_SCRIPT } = require('../config');

// --- Internal State ---
let _state = {
    running: false,
    lastError: null,
    lastCompletedAt: null,
    lastTriggeredAt: null,
};

let _wss = null;

/**
 * Set the WebSocket server reference for broadcasting analysis events.
 */
function setWss(wss) {
    _wss = wss;
}

/**
 * Broadcast a message to all connected WS clients.
 */
function broadcast(data) {
    if (!_wss) return;
    const msg = JSON.stringify(data);
    _wss.clients.forEach(c => {
        if (c.readyState === 1) c.send(msg);
    });
}

/**
 * Get current analyzer state.
 * @returns {{ running: boolean, lastError: string|null, lastCompletedAt: string|null, lastTriggeredAt: string|null }}
 */
function getAnalyzerState() {
    return { ..._state };
}

/**
 * Run the analysis script.
 * Returns a result object: { triggered, running, error }
 * Prevents concurrent runs. Broadcasts completion via WS.
 */
function runAnalyzer() {
    if (_state.running) {
        return { triggered: false, running: true, message: 'Analysis already in progress.' };
    }

    _state.running = true;
    _state.lastError = null;
    _state.lastTriggeredAt = new Date().toISOString();

    const nodePath = process.execPath;
    exec(`"${nodePath}" "${ANALYZE_SCRIPT}"`, (err, stdout, stderr) => {
        _state.running = false;

        if (err) {
            _state.lastError = stderr || err.message;
            console.error('[Analyzer] Error:', _state.lastError);
            broadcast({ type: 'analysis_error', error: _state.lastError, ts: Date.now() });
        } else {
            _state.lastCompletedAt = new Date().toISOString();
            if (stdout) console.log('[Analyzer]', stdout.trim());
            broadcast({ type: 'analysis_complete', ts: Date.now() });
        }
    });

    return { triggered: true, running: true, message: 'Analysis started.' };
}

module.exports = { runAnalyzer, getAnalyzerState, setWss };
