/**
 * OpenClaw command and workspace detection service.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { HOME_DIR, APP_DIR } = require('../config');

let workspaceCache = null;

function hasReadableMemoryMarkdown(baseDir) {
    try {
        const memoryDir = path.join(baseDir, 'memory');
        if (!fs.existsSync(memoryDir) || !fs.statSync(memoryDir).isDirectory()) return false;

        const files = fs.readdirSync(memoryDir);
        return files.some(f => /^\d{4}-\d{2}-\d{2}(?:-.+)?\.md$/.test(f));
    } catch {
        return false;
    }
}

function isWorkspaceLike(baseDir) {
    // A real OpenClaw workspace usually has MEMORY.md/AGENTS.md and markdown memories.
    return (
        hasReadableMemoryMarkdown(baseDir) ||
        fs.existsSync(path.join(baseDir, 'MEMORY.md')) ||
        fs.existsSync(path.join(baseDir, 'AGENTS.md'))
    );
}

function findWorkspace() {
    // 1. Explicit env var (Highest priority)
    if (process.env.OPENCLAW_WORKSPACE) return process.env.OPENCLAW_WORKSPACE;

    // 2. Return cached
    if (workspaceCache) return workspaceCache;

    // 3. Relative path (Default installation structure: .../openclaw/skills/clawbridge)
    const relative = path.resolve(APP_DIR, '../../');
    if (isWorkspaceLike(relative)) {
        workspaceCache = relative;
        return relative;
    }

    // 4. Common path probing (For standalone/sandbox installs)
    // Prefer ~/.openclaw/workspace over ~/.openclaw to avoid selecting state dir by mistake.
    const candidates = [
        path.join(HOME_DIR, '.openclaw', 'workspace'),
        path.join(HOME_DIR, 'clawd'), // Legacy clawdbot/clawd path
        path.join(HOME_DIR, '.openclaw'), // Standard OpenClaw storage/state root
        process.cwd(),
    ];

    for (const p of candidates) {
        if (isWorkspaceLike(p)) {
            console.log(`[Init] Probed workspace found: ${p}`);
            workspaceCache = p;
            return p;
        }
    }

    // 5. Fallback
    workspaceCache = relative;
    return relative;
}

function getOpenClawCommand() {
    if (process.env.OPENCLAW_PATH) return process.env.OPENCLAW_PATH;
    try {
        execSync('which openclaw', { stdio: 'pipe' });
        return 'openclaw';
    } catch (e) {
        /* expected: openclaw may not be in PATH */
    }
    // Dynamic: look for openclaw in same bin dir as current Node.js
    const nodeBinDir = path.dirname(process.execPath);
    const localPath = path.join(nodeBinDir, 'openclaw');
    if (fs.existsSync(localPath)) return localPath;
    return 'openclaw';
}

// Resolve once at startup
const WORKSPACE_DIR = findWorkspace();

module.exports = { findWorkspace, getOpenClawCommand, WORKSPACE_DIR };
