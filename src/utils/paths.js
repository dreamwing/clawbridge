const path = require('path');
const os = require('os');

/**
 * Shared home/config directory resolution, aligned with OpenClaw's src/infra/home-dir.ts.
 * All modules should use these functions instead of duplicating resolution logic.
 */

/**
 * Resolve the effective OpenClaw home directory.
 * Precedence: OPENCLAW_HOME > HOME > USERPROFILE > os.homedir()
 * Handles tilde (~) expansion in OPENCLAW_HOME.
 */
function resolveHomeDir() {
    const explicitHome = process.env.OPENCLAW_HOME?.trim();
    if (explicitHome) {
        if (explicitHome.startsWith('~')) {
            const baseHome = process.env.HOME?.trim()
                || process.env.USERPROFILE?.trim()
                || os.homedir();
            return path.resolve(explicitHome.replace(/^~(?=$|[/\\])/, baseHome));
        }
        return path.resolve(explicitHome);
    }
    return process.env.HOME?.trim()
        || process.env.USERPROFILE?.trim()
        || os.homedir();
}

/**
 * Resolve the OpenClaw config/state directory (~/.openclaw).
 * Precedence: OPENCLAW_STATE_DIR > resolveHomeDir()/.openclaw
 */
function resolveConfigDir() {
    const override = process.env.OPENCLAW_STATE_DIR?.trim();
    if (override) return path.resolve(override);
    return path.join(resolveHomeDir(), '.openclaw');
}

module.exports = {
    resolveHomeDir,
    resolveConfigDir
};
