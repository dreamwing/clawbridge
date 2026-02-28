const optimizerService = require('../src/services/optimizer');
const configManager = require('../src/services/openclaw_config');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

jest.mock('../src/services/openclaw_config');
jest.mock('fs', () => ({
    promises: {
        appendFile: jest.fn(),
        mkdir: jest.fn(),
        readFile: jest.fn()
    }
}));

describe('OptimizerService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock implementation
        configManager.setConfig.mockResolvedValue({ success: true });
    });

    test('A02: Disable Background Polling', async () => {
        const result = await optimizerService.applyAction('A02');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.heartbeat.every', '0m');

        // Should log to history
        expect(fs.appendFile).toHaveBeenCalled();
        const loggedCall = fs.appendFile.mock.calls[0];
        expect(loggedCall[0]).toContain('optimizations.jsonl');
        expect(loggedCall[1]).toContain('"actionId":"A02"');
    });

    test('A06: Enable Prompt Caching', async () => {
        const result = await optimizerService.applyAction('A06');

        expect(result.success).toBe(true);
        expect(configManager.setConfig).toHaveBeenCalledWith('agents.defaults.contextPruning.mode', 'cache-ttl');

        // Should log to history
        expect(fs.appendFile).toHaveBeenCalled();
        const loggedCall = fs.appendFile.mock.calls[0];
        expect(loggedCall[1]).toContain('"actionId":"A06"');
    });

    test('A09: Reduce Output Verbosity', async () => {
        const result = await optimizerService.applyAction('A09');

        expect(result.success).toBe(true);
        // A09 appends to SOUL.md instead of setConfig
        expect(configManager.setConfig).not.toHaveBeenCalled();

        const soulCall = fs.appendFile.mock.calls.find(call => call[0].includes('SOUL.md'));
        expect(soulCall).toBeDefined();
        expect(soulCall[1]).toContain('Be concise');

        const logCall = fs.appendFile.mock.calls.find(call => call[0].includes('optimizations.jsonl'));
        expect(logCall).toBeDefined();
        expect(logCall[1]).toContain('"actionId":"A09"');
    });

    test('getHistory returns parsed JSONL records', async () => {
        const mockLog = `{"actionId":"A02","timestamp":"2026-02-28T12:00:00.000Z"}
{"actionId":"A09","timestamp":"2026-02-28T12:05:00.000Z"}`;
        fs.readFile.mockResolvedValue(mockLog);

        const history = await optimizerService.getHistory();

        expect(history).toHaveLength(2);
        // It reverses the list
        expect(history[0].actionId).toBe('A09');
        expect(history[1].actionId).toBe('A02');
    });
});
