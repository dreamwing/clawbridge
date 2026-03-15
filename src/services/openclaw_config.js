const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;
const { resolveConfigDir } = require('../utils/paths');

const execFileAsync = util.promisify(execFile);
const CONFIG_GET_TIMEOUT_MS = 1500;

// Helper to determine the openclaw binary path or just use 'openclaw'
const OPENCLAW_BIN = 'openclaw';

class OpenClawConfig {
    _validateConfigArg(name, value, pattern) {
        if (typeof value !== 'string' || !pattern.test(value)) {
            throw new Error(`Invalid ${name}`);
        }
    }

    /**
     * Reads raw openclaw.json file manually as a fallback, because running 
     * `openclaw config get --json` can be slow or have permission locks.
     */
    async getRawConfig() {
        try {
            const { stdout } = await execFileAsync(OPENCLAW_BIN, ['config', 'get', 'agents', '--json'], {
                env: { ...process.env, NO_COLOR: '1' }, // Ensure pure JSON
                timeout: CONFIG_GET_TIMEOUT_MS
            });
            return JSON.parse(stdout);
        } catch (err) {
            console.warn("Failed to get config via CLI, trying direct file read...");
            // Fallback: Read ~/.openclaw/openclaw.json directly
            try {
                const configPath = path.join(resolveConfigDir(), 'openclaw.json');
                const content = await fs.readFile(configPath, 'utf-8');
                return JSON.parse(content).agents || {};
            } catch (e) {
                console.error("Direct read also failed", e);
                return { defaults: {} }; // Return empty defaults to avoid crashing
            }
        }
    }

    /**
     * Sets a specific key in the OpenClaw configuration using the CLI
     * @param {string} key Path to the key, e.g. "agents.defaults.thinkingDefault"
     * @param {string} value The value to set
     */
    async setConfig(key, value) {
        try {
            this._validateConfigArg('config key', key, /^[A-Za-z0-9._-]+$/);
            this._validateConfigArg('config value', value, /^(?!-)[A-Za-z0-9_./:@-]+$/);
            const { stdout } = await execFileAsync(OPENCLAW_BIN, ['config', 'set', '--', key, value]);
            return { success: true, message: stdout.trim() };
        } catch (err) {
            console.error(`Failed to set config ${key} to ${value}:`, err);
            throw new Error(`Config update failed: ${err.message}`);
        }
    }
}

module.exports = new OpenClawConfig();
