const configManager = require('./openclaw_config');
const diagnosticsEngine = require('./diagnostics');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class OptimizerService {
    constructor() {
        this.logPath = path.join(__dirname, '../../data/logs/optimizations.jsonl');
        this.backupDir = path.join(__dirname, '../../data/backups');
    }

    async ensureLogDir() {
        await fs.mkdir(path.dirname(this.logPath), { recursive: true }).catch(() => { });
    }

    /**
     * Backup current config before making changes (PRD requirement).
     * Saves a timestamped snapshot of the current config to data/backups/.
     */
    async backupConfig() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            const config = await configManager.getRawConfig();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `config_backup_${ts}.json`);
            await fs.writeFile(backupPath, JSON.stringify(config, null, 2), 'utf8');
            return backupPath;
        } catch (err) {
            console.warn('Config backup failed (non-blocking):', err.message);
            return null;
        }
    }

    async logOptimization({ actionId, title, savings, configChanged, backupPath }) {
        await this.ensureLogDir();
        const entry = {
            timestamp: new Date().toISOString(),
            actionId,
            title,
            savings: typeof savings === 'number' ? parseFloat(savings.toFixed(2)) : 0,
            configChanged,
            backupPath: backupPath || null
        };
        await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf8');
    }

    async getHistory() {
        try {
            const data = await fs.readFile(this.logPath, 'utf8');
            const lines = data.split('\n').filter(l => l.trim().length > 0);
            return lines.map(l => {
                try { return JSON.parse(l); }
                catch (_e) { return null; }
            }).filter(Boolean).reverse();
        } catch (_err) {
            return [];
        }
    }

    /**
     * Restore configuration from a backup file.
     * Reads the backup JSON and re-applies each config key.
     */
    async restoreBackup(backupPath) {
        if (!backupPath) throw new Error('No backup path provided');
        const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
        const defaults = backupData.defaults || {};

        // Restore key config values from backup
        const restoreKeys = [
            ['agents.defaults.model', defaults.model],
            ['agents.defaults.heartbeat.every', defaults.heartbeat?.every],
            ['agents.defaults.thinkingDefault', defaults.thinkingDefault],
            ['agents.defaults.compaction.mode', defaults.compaction?.mode],
            ['agents.defaults.compaction.reserveTokens', defaults.compaction?.reserveTokens],
            ['agents.defaults.contextPruning.mode', defaults.contextPruning?.mode]
        ];

        const restored = [];
        for (const [key, value] of restoreKeys) {
            if (value !== undefined) {
                await configManager.setConfig(key, String(value));
                restored.push(key);
            }
        }

        // Log the undo action
        await this.logOptimization({
            actionId: 'UNDO',
            title: 'Restored from backup',
            savings: 0,
            configChanged: `Restored ${restored.length} keys from ${path.basename(backupPath)}`
        });

        diagnosticsEngine.invalidateCache();
        return { success: true, restoredKeys: restored, backupFile: path.basename(backupPath) };
    }

    async applyAction(actionId, dynamicSavings, meta) {
        // Validate actionId against whitelist
        const VALID_ACTIONS = ['A01', 'A02', 'A05', 'A06', 'A07', 'A09'];
        if (!VALID_ACTIONS.includes(actionId)) {
            throw new Error(`Unknown action: ${actionId}. Valid actions: ${VALID_ACTIONS.join(', ')}`);
        }

        // Backup config before any modification (PRD requirement)
        const backupPath = await this.backupConfig();

        let result = false;
        let details = {};

        switch (actionId) {
            case 'A01': {
                // Dynamic: use the alternative model detected by diagnostics
                const alternative = (meta && meta.alternative) || 'claude-3-5-sonnet-20241022';
                result = await configManager.setConfig('agents.defaults.model', alternative);
                details = {
                    title: 'Downgraded Premium Model',
                    savings: dynamicSavings || 0,
                    configChanged: `model: ${alternative}`
                };
                break;
            }
            case 'A02': {
                // Support custom interval (e.g., '2h', '30m') or full disable ('0m')
                const interval = (meta && meta.interval) || '0m';
                result = await configManager.setConfig('agents.defaults.heartbeat.every', interval);
                const isDisabled = interval === '0m' || interval === '0';
                details = {
                    title: isDisabled ? 'Disabled Background Polling' : `Heartbeat set to ${interval}`,
                    savings: dynamicSavings || 0,
                    configChanged: `heartbeat.every: ${interval}`
                };
                break;
            }
            case 'A05':
                result = await configManager.setConfig('agents.defaults.thinkingDefault', 'minimal');
                details = {
                    title: 'Reduce Thinking Overhead',
                    savings: dynamicSavings || 0,
                    configChanged: 'thinkingDefault: minimal'
                };
                break;
            case 'A06':
                result = await configManager.setConfig('agents.defaults.contextPruning.mode', 'cache-ttl');
                details = {
                    title: 'Enable Prompt Caching',
                    savings: dynamicSavings || 0,
                    configChanged: 'contextPruning.mode: cache-ttl'
                };
                break;
            case 'A07':
                result = await configManager.setConfig('agents.defaults.compaction.mode', 'safeguard');
                await configManager.setConfig('agents.defaults.compaction.reserveTokens', '50000');
                details = {
                    title: 'Enable Compaction Safeguard',
                    savings: 0,
                    configChanged: 'compaction.mode: safeguard'
                };
                break;
            case 'A09':
                try {
                    const soulPath = path.join(os.homedir(), '.openclaw', 'workspace', 'SOUL.md');
                    await fs.appendFile(soulPath, '\n\nBe concise.\n', 'utf8');
                    result = { success: true };
                } catch (e) {
                    console.error('Failed to append to SOUL.md', e);
                    result = { success: false, error: e.message };
                }
                details = {
                    title: 'Reduce Output Verbosity',
                    savings: dynamicSavings || 0,
                    configChanged: 'SOUL.md += "Be concise"'
                };
                break;
        }

        if (result && result.success !== false) {
            await this.logOptimization({
                actionId,
                title: details.title,
                savings: details.savings,
                configChanged: details.configChanged,
                backupPath
            });

            // Invalidate diagnostics cache so next check reflects the change
            diagnosticsEngine.invalidateCache();

            return { success: true, details, backupPath };
        } else {
            throw new Error(`Failed to apply ${actionId}: ${result?.error || 'Config update returned failure'}`);
        }
    }
}

module.exports = new OptimizerService();
