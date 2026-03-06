const optimizerService = require('../src/services/optimizer');
const configManager = require('../src/services/openclaw_config');
const diagnosticsEngine = require('../src/services/diagnostics');
const fs = require('fs').promises;

jest.mock('../src/services/openclaw_config');
jest.mock('../src/services/diagnostics', () => ({
    invalidateCache: jest.fn()
}));
jest.mock('fs', () => ({
    promises: {
        appendFile: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn(),
        writeFile: jest.fn().mockResolvedValue(undefined)
    }
}));

describe('OptimizerService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        configManager.setConfig.mockResolvedValue({ success: true });
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });
    });

    test('A02: Disable Background Polling', async () => {
        const result = await optimizerService.applyAction('A02');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.heartbeat.every', '0m');

        // Should log to history
        expect(fs.appendFile).toHaveBeenCalled();
        const loggedCall = fs.appendFile.mock.calls.find(c => c[0].includes('optimizations.jsonl'));
        expect(loggedCall[1]).toContain('"actionId":"A02"');

        // Should invalidate diagnostics cache
        expect(diagnosticsEngine.invalidateCache).toHaveBeenCalled();
    });

    test('A01: Dynamic model selection via meta', async () => {
        const result = await optimizerService.applyAction('A01', 50, { alternative: 'gpt-4o-mini' });

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.model', 'gpt-4o-mini');
    });

    test('A01: Falls back to sonnet if no meta provided', async () => {
        const result = await optimizerService.applyAction('A01', 50);

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.model', 'claude-3-5-sonnet-20241022');
    });

    test('A06: Enable Prompt Caching', async () => {
        const result = await optimizerService.applyAction('A06');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.contextPruning.mode', 'cache-ttl');

        const loggedCall = fs.appendFile.mock.calls.find(c => c[0].includes('optimizations.jsonl'));
        expect(loggedCall[1]).toContain('"actionId":"A06"');
    });

    test('A09: Reduce Output Verbosity', async () => {
        const result = await optimizerService.applyAction('A09');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).not.toHaveBeenCalled();

        const soulCall = fs.appendFile.mock.calls.find(call => call[0].includes('SOUL.md'));
        expect(soulCall).toBeDefined();
        expect(soulCall[1]).toContain('Be concise');

        const logCall = fs.appendFile.mock.calls.find(call => call[0].includes('optimizations.jsonl'));
        expect(logCall).toBeDefined();
    });

    test('A07: Enable Compaction Safeguard sets two config keys', async () => {
        const result = await optimizerService.applyAction('A07');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.compaction.mode', 'safeguard');
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.compaction.reserveTokens', '50000');
    });

    test('Should throw on unknown actionId', async () => {
        await expect(optimizerService.applyAction('A99'))
            .rejects
            .toThrow('Unknown action: A99');
    });

    test('Should throw when config update fails', async () => {
        configManager.setConfig.mockResolvedValue({ success: false, error: 'Permission denied' });

        await expect(optimizerService.applyAction('A02'))
            .rejects
            .toThrow('Failed to apply A02');
    });

    test('Should backup config before applying', async () => {
        await optimizerService.applyAction('A05', 10);

        // Backup should write config JSON
        expect(fs.writeFile).toHaveBeenCalled();
        const writeCall = fs.writeFile.mock.calls[0];
        expect(writeCall[0]).toContain('config_backup_');
    });

    test('Should return backupPath in result', async () => {
        const result = await optimizerService.applyAction('A05');

        expect(result.backupPath).toBeDefined();
        expect(result.backupPath).toContain('config_backup_');
    });

    test('getHistory returns parsed JSONL records', async () => {
        const mockLog = `{"actionId":"A02","timestamp":"2026-02-28T12:00:00.000Z","savings":1.50}
{"actionId":"A09","timestamp":"2026-02-28T12:05:00.000Z","savings":3.20}`;
        fs.readFile.mockResolvedValue(mockLog);

        const history = await optimizerService.getHistory();

        expect(history).toHaveLength(2);
        expect(history[0].actionId).toBe('A09'); // Reversed (newest first)
        expect(history[1].actionId).toBe('A02');
        expect(history[0].savings).toBe(3.20);
    });

    test('getHistory handles corrupted JSONL gracefully', async () => {
        const mockLog = `{"actionId":"A02","timestamp":"2026-02-28T12:00:00.000Z"}
CORRUPTED LINE
{"actionId":"A09","timestamp":"2026-02-28T12:05:00.000Z"}`;
        fs.readFile.mockResolvedValue(mockLog);

        const history = await optimizerService.getHistory();

        expect(history).toHaveLength(2); // Corrupted line filtered out
    });

    test('getHistory returns empty array when file does not exist', async () => {
        fs.readFile.mockRejectedValue(new Error('ENOENT'));

        const history = await optimizerService.getHistory();

        expect(history).toEqual([]);
    });

    test('Should return null from backupConfig if write fails (non-blocking)', async () => {
        fs.writeFile.mockRejectedValue(new Error('Write failed'));
        const result = await optimizerService.backupConfig();
        expect(result).toBeNull();
    });

    test('restoreBackup restores config keys accurately', async () => {
        const mockBackup = {
            defaults: {
                model: "gpt-4-turbo",
                heartbeat: { every: "12h" },
                thinkingDefault: "maximal",
                compaction: { mode: "safe", reserveTokens: "100" },
                contextPruning: { mode: "lru" }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockBackup));

        const result = await optimizerService.restoreBackup('/fake/backup/path.json');

        // Check if configManager was called 6 times with the valid backup keys
        expect(configManager.setConfig).toHaveBeenCalledTimes(6);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.model', 'gpt-4-turbo');
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.heartbeat.every', '12h');
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.thinkingDefault', 'maximal');

        expect(result.success).toBe(true);
        expect(result.restoredKeys).toHaveLength(6);
        expect(result.backupFile).toBe('path.json');

        // Ensure diagnostics are invalidated
        expect(diagnosticsEngine.invalidateCache).toHaveBeenCalled();

        // Ensure the restore action is logged in optimizations history
        const loggedCall = fs.appendFile.mock.calls.find(c => c[0].includes('optimizations.jsonl'));
        expect(loggedCall[1]).toContain('Restored 6 keys');
        expect(loggedCall[1]).toContain('"actionId":"UNDO"');
    });

    test('restoreBackup throws error if no backup path provided', async () => {
        await expect(optimizerService.restoreBackup())
            .rejects
            .toThrow('No backup path provided');
    });
});
