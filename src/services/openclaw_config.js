const { execFile } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;

const execFileAsync = util.promisify(execFile);

// Helper to determine the openclaw binary path or just use 'openclaw'
const OPENCLAW_BIN = 'openclaw';

class OpenClawConfig {
    /**
     * Reads raw openclaw.json file manually as a fallback, because running 
     * `openclaw config get --json` can be slow or have permission locks.
     */
    async getRawConfig() {
        try {
            const { stdout } = await execFileAsync(OPENCLAW_BIN, ['config', 'get', 'agents', '--json'], {
                env: { ...process.env, NO_COLOR: '1' } // Ensure pure JSON
            });
            return JSON.parse(stdout);
        } catch (err) {
            console.warn("Failed to get config via CLI, trying direct file read...");
            // Fallback: Read ~/.openclaw/openclaw.json directly
            try {
                const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
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
            const { stdout } = await execFileAsync(OPENCLAW_BIN, ['config', 'set', key, value]);
            return { success: true, message: stdout.trim() };
        } catch (err) {
            console.error(`Failed to set config ${key} to ${value}:`, err);
            throw new Error(`Config update failed: ${err.message}`);
        }
    }
}

module.exports = new OpenClawConfig();
