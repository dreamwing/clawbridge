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

    async inspectBackup(backupPath) {
        if (!backupPath) throw new Error('No backup path provided');
        const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
        const movedSkills = Array.isArray(backupData._movedSkills)
            ? backupData._movedSkills.map(skill => path.basename(skill.original))
            : [];
        return {
            backupFile: path.basename(backupPath),
            restorableSkills: movedSkills,
            hasFileBackup: Boolean(backupData._fileBackupPath)
        };
    }

    /**
     * Restore configuration from a backup file.
     * Reads the backup JSON and re-applies each config key.
     */
    async restoreBackup(backupPath, options = {}) {
        if (!backupPath) throw new Error('No backup path provided');
        const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
        const defaults = backupData.defaults || {};
        const selectedSkillNames = Array.isArray(options.selectedSkillNames)
            ? options.selectedSkillNames
                .filter(name => typeof name === 'string')
                .map(name => name.trim())
                .filter(Boolean)
            : null;

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
                throw new Error(`File restore failed: ${e.message}`);
            }
        }

        // Restore moved skills if present (A04)
        let skillsRestored = 0;
        const failedSkillRestores = [];
        if (backupData._movedSkills && Array.isArray(backupData._movedSkills)) {
            const skillsToRestore = selectedSkillNames
                ? backupData._movedSkills.filter(skill => selectedSkillNames.includes(path.basename(skill.original)))
                : backupData._movedSkills;
            for (const skill of skillsToRestore) {
                try {
                    await fs.rename(skill.backup, skill.original);
                    skillsRestored++;
                } catch (e) {
                    failedSkillRestores.push(`${skill.original}: ${e.message}`);
                }
            }
        }
        if (failedSkillRestores.length > 0) {
            throw new Error(`Failed to restore ${failedSkillRestores.length} skill(s): ${failedSkillRestores.join('; ')}`);
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
        return {
            success: true,
            restoredKeys: restored,
            fileRestored,
            backupFile: path.basename(backupPath),
            skillsRestored
        };
    }

    async applyAction(actionId, dynamicSavings, meta) {
        // Validate actionId against whitelist
        const VALID_ACTIONS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A07', 'A09'];
        if (!VALID_ACTIONS.includes(actionId)) {
            throw new Error(`Unknown action: ${actionId}. Valid actions: ${VALID_ACTIONS.join(', ')}`);
        }

        // Backup config before any modification (PRD requirement)
        // A04/A09 generate specialized backups later to avoid orphan snapshots.
        let backupPath = ['A04', 'A09'].includes(actionId) ? null : await this.backupConfig();
        let preOptCostSnapshot = null;
        try {
            const diag = await diagnosticsEngine.runDiagnostics();
            preOptCostSnapshot = diag?.currentMonthlyCost ?? null;
        } catch (_e) {
            // Non-blocking: optimization should still proceed without the history snapshot.
        }

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
                const failed = [];

                for (const rawName of selectedSkillNames) {
                    const skillName = typeof rawName === 'string' ? rawName.trim() : '';
                    if (!skillName || skillName !== path.basename(skillName) || skillName.includes(path.sep)) {
                        console.warn(`Skipping invalid skill name: ${rawName}`);
                        failed.push(String(rawName));
                        continue;
                    }
                    if (!allowedSkillNames.has(skillName)) {
                        console.warn(`Skipping unknown skill: ${skillName}`);
                        failed.push(skillName);
                        continue;
                    }

                    const resolved = path.resolve(managedSkillsDir, skillName);
                    const managedRoot = path.resolve(managedSkillsDir) + path.sep;
                    if (!resolved.startsWith(managedRoot)) {
                        console.warn(`Skipping suspicious resolved path: ${resolved}`);
                        failed.push(skillName);
                        continue;
                    }

                    const destPath = path.join(skillBackupDir, `${skillName}_${Date.now()}`);
                    try {
                        await fs.rename(resolved, destPath);
                        moved.push(skillName);
                        movedSkillsData.push({ original: resolved, backup: destPath });
                    } catch (e) {
                        console.warn(`Failed to move skill ${skillName}:`, e.message);
                        failed.push(skillName);
                    }
                }

                if (moved.length === 0) {
                    throw new Error('Failed to move any skills');
                }

                if (failed.length > 0) {
                    const rollbackFailures = [];
                    for (const skill of movedSkillsData.reverse()) {
                        try {
                            await fs.rename(skill.backup, skill.original);
                        } catch (rollbackError) {
                            rollbackFailures.push(path.basename(skill.original));
                            console.warn(`Failed to roll back skill ${skill.original}:`, rollbackError.message);
                        }
                    }

                    const failedList = failed.join(', ');
                    if (rollbackFailures.length > 0) {
                        throw new Error(`Failed to move selected skills: ${failedList}. Rollback also failed for: ${rollbackFailures.join(', ')}`);
                    }
                    throw new Error(`Failed to move selected skills: ${failedList}`);
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
                const CONCISE_MARKER = 'Be concise.';
                try {
                    // Backup SOUL.md before modifying
                    let originalContent = '';
                    try {
                        originalContent = (await fs.readFile(soulPath, 'utf8')) || '';
                    } catch (readErr) {
                        if (readErr.code !== 'ENOENT') throw readErr;
                    }
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    const soulBackupPath = path.join(this.backupDir, `soul_backup_${ts}.md`);
                    await fs.mkdir(this.backupDir, { recursive: true });
                    await fs.writeFile(soulBackupPath, originalContent, 'utf8');

                    // We must regenerate the backup JSON to inject _fileBackupPath for the Undo system
                    backupPath = await this.backupConfig({ _fileBackupPath: soulBackupPath });

                    if (!originalContent.includes(CONCISE_MARKER)) {
                        await fs.appendFile(soulPath, '\n\nBe concise.\n', 'utf8');
                    }
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
                preOptCostSnapshot,
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
