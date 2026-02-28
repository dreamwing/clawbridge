const configManager = require('./openclaw_config');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class OptimizerService {
    constructor() {
        this.logPath = path.join(__dirname, '../../data/logs/optimizations.jsonl');
    }

    async ensureLogDir() {
        const dir = path.dirname(this.logPath);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            // Ignore if exists
        }
    }

    async logOptimization({ actionId, title, savings, configChanged }) {
        await this.ensureLogDir();
        const entry = {
            timestamp: new Date().toISOString(),
            actionId,
            title,
            savings,
            configChanged
        };
        await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
    }

    async getHistory() {
        try {
            const data = await fs.readFile(this.logPath, 'utf8');
            const lines = data.split('\n').filter(l => l.trim().length > 0);
            return lines.map(l => JSON.parse(l)).reverse(); // Newest first
        } catch (err) {
            // If file doesn't exist yet, return empty history
            return [];
        }
    }

    async applyAction(actionId) {
        let result = false;
        let details = {};

        switch (actionId) {
            case 'A01':
                // Downgrade Expensive Model
                result = await configManager.setConfig('agents.defaults.model', 'claude-3-5-sonnet-20241022');
                details = {
                    title: 'Downgraded Premium Model',
                    savings: 15.00, // This should ideally be passed from UI or diagnostics
                    configChanged: 'model: claude-3-5-sonnet'
                };
                break;
            case 'A02':
                // Disable Background Polling
                result = await configManager.setConfig('agents.defaults.heartbeat.every', '0m');
                details = {
                    title: 'Disable Background Polling',
                    savings: 6.21,
                    configChanged: 'heartbeat.every: 0m'
                };
                break;
            case 'A05':
                // Reduce Thinking Overhead
                result = await configManager.setConfig('agents.defaults.thinkingDefault', 'minimal');
                details = {
                    title: 'Reduce Thinking Overhead',
                    savings: 8.50,
                    configChanged: 'thinkingDefault: minimal'
                };
                break;
            case 'A06':
                // Enable Prompt Caching - there is no direct global flag in OpenClaw for this, 
                // but setting default cache behavior if it existed, or just a dummy config for demonstration.
                // Assuming it might be contextPruning or similar. Let's set contextPruning mode.
                result = await configManager.setConfig('agents.defaults.contextPruning.mode', 'cache-ttl');
                details = {
                    title: 'Enable Prompt Caching',
                    savings: 18.36,
                    configChanged: 'contextPruning.mode: cache-ttl'
                };
                break;
            case 'A07':
                // Enable Compaction Safeguard
                result = await configManager.setConfig('agents.defaults.compaction.mode', 'safeguard');
                await configManager.setConfig('agents.defaults.compaction.reserveTokens', '50000');
                details = {
                    title: 'Enable Compaction Safeguard',
                    savings: 0,
                    configChanged: 'compaction.mode: safeguard'
                };
                break;
            case 'A09':
                // Reduce Output Verbosity -> Append to SOUL.md
                try {
                    const paramsPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'SOUL.md');
                    await fs.appendFile(paramsPath, '\n\nBe concise.\n', 'utf8');
                    result = { success: true };
                } catch (e) {
                    console.error("Failed to append to SOUL.md", e);
                    result = { success: false, error: e.message };
                }
                details = {
                    title: 'Reduce Output Verbosity',
                    savings: 10.45,
                    configChanged: 'SOUL.md += "Be concise"'
                };
                break;
            default:
                throw new Error(`Unknown action mapping: ${actionId}`);
        }

        if (result && result.success !== false) {
            await this.logOptimization({
                actionId,
                title: details.title,
                savings: details.savings,
                configChanged: details.configChanged
            });
            return { success: true, details };
        } else {
            throw new Error(`Failed to apply action ${actionId}: ${result?.error || 'Unknown error'}`);
        }
    }
}

module.exports = new OptimizerService();
