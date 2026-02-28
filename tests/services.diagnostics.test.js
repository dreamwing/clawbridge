const diagnosticsEngine = require('../src/services/diagnostics');
const configManager = require('../src/services/openclaw_config');
const fs = require('fs').promises;

jest.mock('../src/services/openclaw_config');
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

describe('DiagnosticsEngine', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('D01: Should flag expensive models if >50% usage', async () => {
        // Mock Config
        configManager.getRawConfig.mockResolvedValue({
            defaults: {}
        });

        // Mock Stats
        const mockStats = {
            totals: { input: 1000, output: 100, cacheRead: 50 },
            cost: {
                total: 100,
                byModel: {
                    'claude-3-5-opus-20240229': 60, // 60% of total
                    'gpt-4o-mini': 40
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        // Should find A01
        const action = result.actions.find(a => a.actionId === 'A01');
        expect(action).toBeDefined();
        expect(action.title).toContain('Downgrade');
        expect(action.codeTag).toContain('model: "claude-3-5-sonnet');
    });

    test('D02: Should flag heartbeat if not 0m', async () => {
        // Mock Config
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                heartbeat: { every: '15m' }
            }
        });

        const mockStats = {
            totals: { input: 100000, output: 10000, cacheRead: 50000 }, // High cache to prevent D06
            cost: { total: 10 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A02');
        expect(action).toBeDefined();
        expect(action.codeTag).toBe('heartbeat.every: "0m"');
    });

    test('D05: Should flag high thinkingDefault', async () => {
        // Mock Config
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                thinkingDefault: 'high',
                compaction: { mode: 'safeguard' } // prevent D07
            }
        });

        const mockStats = {
            totals: { input: 100000, output: 100, cacheRead: 50000 },
            cost: { total: 100 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A05');
        expect(action).toBeDefined();
        expect(action.codeTag).toBe('thinkingDefault: "minimal"');
    });

    test('D06: Should flag prompt caching if cacheRead is low', async () => {
        // Mock Config
        configManager.getRawConfig.mockResolvedValue({
            defaults: { compaction: { mode: 'safeguard' } }
        });

        // input 1,000,000, cacheRead only 10,000 (1%)
        const mockStats = {
            totals: { input: 1000000, output: 10000, cacheRead: 10000 },
            cost: { total: 100 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A06');
        expect(action).toBeDefined();
        expect(action.title).toBe('Enable Prompt Caching');
    });

    test('Should return no actions if perfectly optimized', async () => {
        // Perfectly optimized config
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                heartbeat: { every: '0m' },
                thinkingDefault: 'minimal',
                compaction: { mode: 'safeguard' }
            }
        });

        // Cheap model, high cache hits, low output length
        const mockStats = {
            totals: { input: 100000, output: 1000, cacheRead: 80000 },
            cost: {
                total: 5,
                byModel: { 'claude-3-5-sonnet-20241022': 5 }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        expect(result.actions).toHaveLength(0);
        expect(result.totalMonthlySavings).toBe(0);
    });
});
