/**
 * Activity logger and file watcher service.
 */
const path = require('path');
const fs = require('fs');
const { LOG_DIR } = require('../config');
const { WORKSPACE_DIR } = require('./openclaw');

// --- Log hygiene ---
// Keep the daily activity file bounded, and never spam stderr when the disk
// is full: every append fails with ENOSPC, and an unthrottled error message
// turns one disk problem into thousands of log lines.
const MAX_LOG_BYTES = 32 * 1024 * 1024;
const WRITE_ERROR_THROTTLE_MS = 60 * 1000;

function rotateIfOversized(logFile) {
    let stat;
    try {
        stat = fs.statSync(logFile);
    } catch (e) {
        return; // file does not exist yet
    }
    if (stat.size < MAX_LOG_BYTES) return;
    try {
        const rotated = `${logFile}.1`;
        try { fs.unlinkSync(rotated); } catch (e) { /* no previous rotation */ }
        fs.renameSync(logFile, rotated);
    } catch (e) {
        // Rotation is best-effort — never block logging on it.
    }
}

function reportWriteFailure(e) {
    const now = Date.now();
    const last = global.lastLogWriteErrorAt || 0;
    if (now - last < WRITE_ERROR_THROTTLE_MS) return;
    global.lastLogWriteErrorAt = now;
    console.error('Log write failed:', (e && e.message) ? e.message : e);
}

function logActivity(task, id = null) {
    if (!task || task === 'System Idle') return;

    // --- ID-BASED IN-MEMORY DEDUPLICATION ---
    if (id) {
        if (!global.processedEventIds) global.processedEventIds = new Set();
        const key = `${id}:${task}`;
        if (global.processedEventIds.has(key)) return;

        global.processedEventIds.add(key);
        if (global.processedEventIds.size > 200) {
            const arr = Array.from(global.processedEventIds);
            global.processedEventIds = new Set(arr.slice(-100));
        }
    }

    // For non-ID tasks (CPU, Scripts), use strict text+time
    if (!id) {
        if (global.lastLoggedTask === task && Date.now() - global.lastLoggedTime < 60000) return;
        global.lastLoggedTask = task;
        global.lastLoggedTime = Date.now();
    }

    const now = new Date();
    const ts = now.toISOString();
    const entry = { ts, task };

    const monthDir = path.join(LOG_DIR, ts.substring(0, 7));
    const logFile = path.join(monthDir, `${ts.substring(8, 10)}.jsonl`);

    try {
        if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });
        rotateIfOversized(logFile);
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
        reportWriteFailure(e);
    }
}

let fileState = {};
const WATCH_DIRS = [path.join(WORKSPACE_DIR, 'memory'), path.join(WORKSPACE_DIR, 'scripts')];
const WATCH_FILES = ['MEMORY.md', 'AGENTS.md', 'HEARTBEAT.md'].map(f => path.join(WORKSPACE_DIR, f));

function checkFileChanges() {
    WATCH_FILES.forEach(f => scanFile(f));
    WATCH_DIRS.forEach(d => {
        if (!fs.existsSync(d)) return;
        try {
            const files = fs.readdirSync(d);
            files.forEach(file => {
                if (file.startsWith('.') || file.endsWith('.tmp')) return;
                scanFile(path.join(d, file));
            });
        } catch (e) {
            console.debug('[Watch] Error reading directory:', d, e.message);
        }
    });
}

function scanFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return;
        const stat = fs.statSync(filePath);
        const mtime = stat.mtimeMs;
        const ctime = stat.ctimeMs;

        if (!fileState[filePath]) {
            fileState[filePath] = mtime;
            if (Date.now() - ctime < 60000) {
                const rel = path.relative(WORKSPACE_DIR, filePath);
                logActivity(`📄 Created: ${rel}`);
            }
            return;
        }

        if (mtime > fileState[filePath]) {
            fileState[filePath] = mtime;
            if (Date.now() - mtime < 60000) {
                const rel = path.relative(WORKSPACE_DIR, filePath);
                logActivity(`📝 Updated: ${rel}`);
            }
        }
    } catch (e) {
        console.debug('[Watch] Error scanning file:', filePath, e.message);
    }
}

module.exports = { logActivity, checkFileChanges, scanFile };
