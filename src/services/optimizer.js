const configManager = require('./openclaw_config');
const diagnosticsEngine = require('./diagnostics');
const { WORKSPACE_DIR } = require('./openclaw');
const { resolveConfigDir } = require('../utils/paths');
const fs = require('fs').promises;
const path = require('path');

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
    async backupConfig(extra) {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            const config = await configManager.getRawConfig();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `config_backup_${ts}.json`);
            const payload = extra ? { ...config, ...extra } : config;
            await fs.writeFile(backupPath, JSON.stringify(payload, null, 2), 'utf8');
            return backupPath;
        } catch (err) {
            console.warn('Config backup failed (non-blocking):', err.message);
            return null;
        }
    }

    async logOptimization({ actionId, title, savings, configChanged, backupPath, preOptCostSnapshot, undoable }) {
        await this.ensureLogDir();
        const entry = {
            timestamp: new Date().toISOString(),
            actionId,
            title,
            savings: typeof savings === 'number' ? parseFloat(savings.toFixed(2)) : 0,
            configChanged,
            backupPath: backupPath || null,
            preOptCostSnapshot: typeof preOptCostSnapshot === 'number' ? parseFloat(preOptCostSnapshot.toFixed(2)) : null,
            undoable: typeof undoable === 'boolean' ? undoable : false
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

    _resolveModelConfigWrite(defaults, nextModel) {
        const currentModel = defaults?.model;
        if (currentModel && typeof currentModel === 'object' && !Array.isArray(currentModel)) {
            return {
                key: 'agents.defaults.model.primary',
                value: nextModel
            };
        }
        return {
            key: 'agents.defaults.model',
            value: nextModel
        };
    }

    async _listManagedSkillNames(managedSkillsDir) {
        const allowedSkillNames = new Set();
        const entries = await fs.readdir(managedSkillsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const fullPath = path.join(managedSkillsDir, entry.name);
            let isDir = entry.isDirectory();
            if (!isDir && entry.isSymbolicLink()) {
                try {
                    isDir = (await fs.stat(fullPath)).isDirectory();
                } catch (_e) {
                    continue;
                }
            }
            if (!isDir) continue;

            try {
                await fs.access(path.join(fullPath, 'SKILL.md'));
                allowedSkillNames.add(entry.name);
            } catch (_e) {
                // Ignore invalid skill folders.
            }
        }

        return allowedSkillNames;
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
        const modelRestore = defaults.model !== undefined
            ? (() => {
                const target = this._resolveModelConfigWrite(
                    defaults,
                    typeof defaults.model === 'string' ? defaults.model : defaults.model?.primary
                );
                return [[target.key, target.value]];
            })()
            : [];
        const restoreKeys = [
            ...modelRestore,
            ['agents.defaults.heartbeat.every', defaults.heartbeat?.every],
            ['agents.defaults.thinkingDefault', defaults.thinkingDefault],
            ['agents.defaults.compaction.mode', defaults.compaction?.mode],
            ['agents.defaults.compaction.reserveTokens', defaults.compaction?.reserveTokens],
            ['agents.defaults.contextPruning.mode', defaults.contextPruning?.mode]
        ].filter(([, value]) => value !== undefined);

        const restored = [];
        for (const [key, value] of restoreKeys) {
            await configManager.setConfig(key, String(value));
            restored.push(key);
        }

        // Restore file backup if present (e.g., SOUL.md from A09)
        let fileRestored = null;
        if (backupData._fileBackupPath) {
            try {
                const soulPath = path.join(WORKSPACE_DIR, 'SOUL.md');
                const fileContent = await fs.readFile(backupData._fileBackupPath, 'utf8');
                await fs.writeFile(soulPath, fileContent, 'utf8');
                fileRestored = 'SOUL.md';
            } catch (e) {
                console.warn('File restore failed:', e.message);
            }
        }

        // Restore moved skills if present (A04)
        let skillsRestored = 0;
        if (backupData._movedSkills && Array.isArray(backupData._movedSkills)) {
            for (const skill of backupData._movedSkills) {
                try {
                    await fs.rename(skill.backup, skill.original);
                    skillsRestored++;
                } catch (e) {
                    console.warn(`Failed to restore skill ${skill.original}:`, e.message);
                }
            }
        }

        // Log the undo action
        await this.logOptimization({
            actionId: 'UNDO',
            title: 'Restored from backup',
            savings: 0,
            configChanged: `Restored ${restored.length} keys${fileRestored ? ' + ' + fileRestored : ''}${skillsRestored ? ` + ${skillsRestored} skills` : ''} from ${path.basename(backupPath)}`,
            undoable: false
        });

        diagnosticsEngine.invalidateCache();
        return { success: true, restoredKeys: restored, fileRestored, backupFile: path.basename(backupPath) };
    }

    async applyAction(actionId, dynamicSavings, meta) {
        // Validate actionId against whitelist
        const VALID_ACTIONS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A09'];
        if (!VALID_ACTIONS.includes(actionId)) {
            throw new Error(`Unknown action: ${actionId}. Valid actions: ${VALID_ACTIONS.join(', ')}`);
        }

        // Backup config before any modification (PRD requirement)
        let backupPath = await this.backupConfig();

        let result = false;
        let details = {};

        switch (actionId) {
            case 'A01': {
                // Dynamic: use the alternative model detected by diagnostics
                const alternative = (meta && meta.alternative) || 'claude-3-5-sonnet-20241022';
                const agentsConfig = await configManager.getRawConfig();
                const modelTarget = this._resolveModelConfigWrite(agentsConfig.defaults || {}, alternative);
                result = await configManager.setConfig(modelTarget.key, modelTarget.value);
                details = {
                    title: 'Downgraded Premium Model',
                    savings: dynamicSavings || 0,
                    configChanged: `${modelTarget.key}: ${alternative}`
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
            case 'A04': {
                // Move selected managed skill folders to backup directory.
                const skillBackupDir = path.join(this.backupDir, 'skills');
                await fs.mkdir(skillBackupDir, { recursive: true });
                const selectedSkillNames = (meta && meta.selectedSkillNames) || [];
                if (selectedSkillNames.length === 0) {
                    throw new Error('No skills selected for removal');
                }

                const managedSkillsDir = path.join(resolveConfigDir(), 'skills');
                const allowedSkillNames = await this._listManagedSkillNames(managedSkillsDir);

                const moved = [];
                const movedSkillsData = [];

                for (const rawName of selectedSkillNames) {
                    const skillName = typeof rawName === 'string' ? rawName.trim() : '';
                    if (!skillName || skillName !== path.basename(skillName) || skillName.includes(path.sep)) {
                        console.warn(`Skipping invalid skill name: ${rawName}`);
                        continue;
                    }
                    if (!allowedSkillNames.has(skillName)) {
                        console.warn(`Skipping unknown skill: ${skillName}`);
                        continue;
                    }

                    const resolved = path.resolve(managedSkillsDir, skillName);
                    const managedRoot = path.resolve(managedSkillsDir) + path.sep;
                    if (!resolved.startsWith(managedRoot)) {
                        console.warn(`Skipping suspicious resolved path: ${resolved}`);
                        continue;
                    }

                    const destPath = path.join(skillBackupDir, `${skillName}_${Date.now()}`);
                    try {
                        await fs.rename(resolved, destPath);
                        moved.push(skillName);
                        movedSkillsData.push({ original: resolved, backup: destPath });
                    } catch (e) {
                        console.warn(`Failed to move skill ${skillName}:`, e.message);
                    }
                }

                if (moved.length === 0) {
                    throw new Error('Failed to move any skills');
                }

                // Inject the moved skills into the backup JSON for Undo support
                backupPath = await this.backupConfig({ _movedSkills: movedSkillsData });

                result = { success: true };
                details = {
                    title: `Removed ${moved.length} Idle Skills`,
                    savings: dynamicSavings || 0,
                    configChanged: `Moved to backup: ${moved.join(', ')}`
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
            case 'A09': {
                const soulPath = path.join(WORKSPACE_DIR, 'SOUL.md');
                try {
                    // Backup SOUL.md before modifying
                    const originalContent = await fs.readFile(soulPath, 'utf8');
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    const soulBackupPath = path.join(this.backupDir, `soul_backup_${ts}.md`);
                    await fs.mkdir(this.backupDir, { recursive: true });
                    await fs.writeFile(soulBackupPath, originalContent, 'utf8');

                    // We must regenerate the backup JSON to inject _fileBackupPath for the Undo system
                    backupPath = await this.backupConfig({ _fileBackupPath: soulBackupPath });

                    // Append concise instruction
                    await fs.appendFile(soulPath, '\n\nBe concise.\n', 'utf8');
                    result = { success: true };
                } catch (e) {
                    console.error('Failed to modify SOUL.md', e);
                    result = { success: false, error: e.message };
                }
                details = {
                    title: 'Reduce Output Verbosity',
                    savings: dynamicSavings || 0,
                    configChanged: 'SOUL.md += "Be concise"'
                };
                break;
            }
        }

        if (result && result.success !== false) {
            await this.logOptimization({
                actionId,
                title: details.title,
                savings: details.savings,
                configChanged: details.configChanged,
                backupPath,
                undoable: !!backupPath
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
