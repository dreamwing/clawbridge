const diagnosticsEngine = require('../src/services/diagnostics');
const configManager = require('../src/services/openclaw_config');
const pricingService = require('../src/services/pricing');
const fs = require('fs').promises;

jest.mock('../src/services/openclaw_config');
jest.mock('../src/services/pricing');
jest.mock('../src/services/openclaw', () => ({
    WORKSPACE_DIR: '/tmp/mock-workspace',
    findWorkspace: jest.fn(() => '/tmp/mock-workspace'),
    getOpenClawCommand: jest.fn(() => 'openclaw')
}));
jest.mock('../src/utils/paths', () => ({
    resolveHomeDir: jest.fn(() => '/tmp/mock-home'),
    resolveConfigDir: jest.fn(() => '/tmp/mock-home/.openclaw')
}));
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
        access: jest.fn(),
        writeFile: jest.fn().mockResolvedValue(undefined)
    }
}));

describe('DiagnosticsEngine', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        diagnosticsEngine.invalidateCache();

        // Setup default non-failing fs mocks for non-targeted tests
        fs.readdir.mockResolvedValue([]);
        fs.stat.mockResolvedValue({ mtimeMs: Date.now() });
        fs.access.mockResolvedValue(undefined);

        // Setup default pricing mock so savings calculation works
        pricingService.getModelPrice.mockResolvedValue({ input: 5.0, output: 15.0 });
        pricingService.getReplacements.mockResolvedValue({
            'claude-3-5-opus-20240229': { alternative: 'claude-3-5-sonnet-20241022', savingsRatio: 0.8 },
            'openai/gpt-5-pro': { alternative: 'openai/gpt-5-mini', savingsRatio: 0.8 }
        });
    });

    test('D01: Should flag expensive models if >50% usage', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                model: { primary: 'openai/gpt-5-pro' }
            }
        });

        const mockStats = {
            totals: { input: 1000, output: 100, cacheRead: 50 },
            cost: {
                total: 100,
                byModel: {
                    'openai/gpt-5-pro': 60,
                    'openai/gpt-5-mini': 40
                }
            },
            total: {
                models: {
                    'openai/gpt-5-pro': { input: 1000, output: 100, cacheRead: 50, cost: 60 },
                    'openai/gpt-5-mini': { input: 1000, output: 100, cacheRead: 50, cost: 40 }
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A01');
        expect(action).toBeDefined();
        expect(action.title).toContain('Downgrade');
        expect(action.codeTag).toContain('model: "openai/gpt-5-mini"');
        expect(action._meta.alternative).toBe('openai/gpt-5-mini');
        expect(action.configDiff.key).toBe('agents.defaults.model.primary');
    });

    test('D02: Should flag heartbeat if not 0m and HEARTBEAT.md has tasks', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: { heartbeat: { every: '15m' } }
        });

        const mockStats = {
            totals: { input: 100000, output: 10000, cacheRead: 50000 },
            cost: { total: 10 }
        };
        fs.readFile.mockImplementation((pathStr) => {
            if (pathStr.includes('HEARTBEAT.md')) {
                return Promise.resolve('Check my emails and summarize.');
            }
            return Promise.resolve(JSON.stringify(mockStats));
        });

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A02');
        expect(action).toBeDefined();
        expect(action.codeTag).toBe('heartbeat.every');
        expect(action.savings).toBeGreaterThan(0);
        // Should have multi-interval options
        expect(action.options).toBeDefined();
        expect(action.options.length).toBeGreaterThan(0);
        // Last option should be 'Disable completely'
        const disableOpt = action.options.find(o => o.value === '0m');
        expect(disableOpt).toBeDefined();
        expect(disableOpt.savings).toBeGreaterThan(0);
        expect(action.savings).toBe(action.options[0].savings);
        expect(result.totalMonthlySavings).toBe(action.options[0].savings);
        expect(action.savings).toBeLessThan(disableOpt.savings);
        expect(action._meta.type).toBe('heartbeat-interval');
    });

    test('D02: excludes agents with per-agent heartbeat overrides from default savings', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: { heartbeat: { every: '15m' } },
            list: [
                { id: 'default-agent' },
                { id: 'custom-agent', heartbeat: { every: '5m' } }
            ]
        });

        const mockStats = {
            totals: { input: 100000, output: 10000, cacheRead: 50000 },
            cost: { total: 10 }
        };
        fs.readFile.mockImplementation((pathStr) => {
            if (pathStr.includes('HEARTBEAT.md')) {
                return Promise.resolve('Check inbox');
            }
            return Promise.resolve(JSON.stringify(mockStats));
        });

        const result = await diagnosticsEngine.runDiagnostics();
        const action = result.actions.find(a => a.actionId === 'A02');

        expect(action).toBeDefined();
        expect(action.description).toContain('default-agent');
        expect(action.description).not.toContain('custom-agent');
    });

    test('Should ignore malformed skip list content', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                model: { primary: 'openai/gpt-5-pro' }
            }
        });

        const mockStats = {
            totals: { input: 1000, output: 100, cacheRead: 50 },
            cost: {
                total: 100,
                byModel: {
                    'openai/gpt-5-pro': 60,
                    'openai/gpt-5-mini': 40
                }
            },
            total: {
                models: {
                    'openai/gpt-5-pro': { input: 1000, output: 100, cacheRead: 50, cost: 60 },
                    'openai/gpt-5-mini': { input: 1000, output: 100, cacheRead: 50, cost: 40 }
                }
            }
        };

        fs.readFile.mockImplementation((pathStr) => {
            if (pathStr.includes('optimizer.skip.json')) {
                return Promise.resolve(JSON.stringify({ skipped: ['A01'] }));
            }
            return Promise.resolve(JSON.stringify(mockStats));
        });

        const result = await diagnosticsEngine.runDiagnostics();

        expect(result.actions.find(a => a.actionId === 'A01')).toBeDefined();
        expect(result.skippedActions).toEqual([]);
    });

    test('Skipped advisory actions do not count toward advisoryMonthlySavings', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                compaction: { mode: 'safeguard' },
                thinkingDefault: 'minimal',
                contextPruning: { mode: 'cache-ttl' }
            }
        });

        const mockStats = {
            totals: { input: 100000, output: 100, cacheRead: 0 },
            cost: {
                total: 50,
                byModel: {
                    'claude-3-5-sonnet-20241022': 50
                }
            },
            total: {
                models: {
                    'claude-3-5-sonnet-20241022': { input: 100000, output: 0, cost: 50 }
                }
            },
            activeDays: 2,
            history: {
                '2026-03-01': { input: 50000, cost: 25, sessions: 10 },
                '2026-03-02': { input: 50000, cost: 25, sessions: 12 }
            }
        };

        fs.readFile.mockImplementation((pathStr) => {
            if (pathStr.includes('optimizer.skip.json')) {
                return Promise.resolve(JSON.stringify(['A03']));
            }
            return Promise.resolve(JSON.stringify(mockStats));
        });

        const result = await diagnosticsEngine.runDiagnostics();

        expect(result.actions.find(a => a.actionId === 'A03')).toBeUndefined();
        expect(result.skippedActions.find(a => a.actionId === 'A03')).toBeDefined();
        expect(result.advisoryMonthlySavings).toBe(0);
    });

    test('D05: Should flag high thinkingDefault', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                thinkingDefault: 'high',
                compaction: { mode: 'safeguard' }
            }
        });

        const mockStats = {
            totals: { input: 100000, output: 10000, cacheRead: 50000 },
            cost: { total: 100 },
            total: {
                models: {
                    'claude-3-5-sonnet-20241022': {
                        input: 100000, output: 10000, cacheRead: 50000, cost: 100
                    }
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A05');
        expect(action).toBeDefined();
        expect(action.codeTag).toBe('thinkingDefault: "minimal"');
        // Savings should be based on actual output tokens, not totalCost * 15%
        expect(action.savings).toBeGreaterThan(0);
    });

    test('D06: Should flag prompt caching if cacheRead is low (PRD formula)', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: { compaction: { mode: 'safeguard' } }
        });

        // cacheRead / (input + cacheRead) = 10000 / (1000000 + 10000) = ~0.99% < 10%
        const mockStats = {
            totals: { input: 1000000, output: 10000, cacheRead: 10000 },
            cost: { total: 100 },
            total: {
                models: {
                    'm1': { input: 1000000, output: 10000, cacheRead: 10000, cost: 100 }
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A06');
        expect(action).toBeDefined();
        expect(action.title).toBe('Enable Prompt Caching');
        expect(action.savings).toBeGreaterThan(0);
    });

    test('D06: Should not flag prompt caching when cache-ttl is already enabled', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                compaction: { mode: 'safeguard' },
                contextPruning: { mode: 'cache-ttl' }
            }
        });

        const mockStats = {
            totals: { input: 1000000, output: 10000, cacheRead: 10000 },
            cost: { total: 100 },
            total: {
                models: {
                    'm1': { input: 1000000, output: 10000, cacheRead: 10000, cost: 100 }
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A06');
        expect(action).toBeUndefined();
    });

    test('D07: Should flag missing safeguard compaction', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {} // No compaction configured
        });

        const mockStats = {
            totals: { input: 100000, output: 1000, cacheRead: 80000 },
            cost: { total: 5, byModel: { 'claude-3-5-sonnet-20241022': 5 } }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A07');
        expect(action).toBeDefined();
        expect(action.savings).toBe(0);
        expect(action.savingsStr).toContain('Protection');
    });

    test('D09: Should flag high output/input ratio', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                thinkingDefault: 'minimal',
                compaction: { mode: 'safeguard' }
            }
        });

        // output/input = 20000/100000 = 20% > 10% threshold
        const mockStats = {
            totals: { input: 100000, output: 20000, cacheRead: 80000 },
            cost: { total: 50 },
            total: {
                models: {
                    'm1': { input: 100000, output: 20000, cacheRead: 80000, cost: 50 }
                }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A09');
        expect(action).toBeDefined();
        expect(action.title).toBe('Reduce Output Verbosity');
        expect(action.savings).toBeGreaterThan(0);
    });
    test('D03: Should flag frequent session resets', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                compaction: { mode: 'safeguard' },
                thinkingDefault: 'minimal',
                contextPruning: { mode: 'cache-ttl' }
            }
        });

        const mockStats = {
            totals: { input: 100000, output: 100, cacheRead: 0 },
            cost: {
                total: 50,
                byModel: {
                    'claude-3-5-sonnet-20241022': 50
                }
            },
            total: {
                models: {
                    'claude-3-5-sonnet-20241022': { input: 100000, output: 0, cost: 50 }
                }
            },
            activeDays: 2,
            history: {
                '2026-03-01': { input: 50000, cost: 25, sessions: 10 },
                '2026-03-02': { input: 50000, cost: 25, sessions: 12 }
            }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A03');
        expect(action).toBeDefined();
        expect(action.title).toBe('Reduce Session Resets');
        expect(action.savings).toBeGreaterThan(0);
        expect(action.type).toBe('advisory');
        expect(result.advisoryMonthlySavings).toBeGreaterThan(0);
        expect(result.totalMonthlySavings).toBeCloseTo(
            result.actions
                .filter(a => a.type !== 'advisory')
                .reduce((sum, a) => sum + a.savings, 0),
            5
        );
    });

    test('D01: prefers the highest-cost matching model when multiple exceed the threshold', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                model: { primary: 'anthropic/claude-opus-4.6' }
            }
        });

        pricingService.getReplacements.mockResolvedValue({
            'openai/gpt-5-pro': { alternative: 'openai/gpt-5', savingsRatio: 0.5 },
            'anthropic/claude-opus-4.6': { alternative: 'anthropic/claude-sonnet-4.6', savingsRatio: 0.6 }
        });

        const mockStats = {
            totals: { input: 1000, output: 500, cacheRead: 0 },
            cost: {
                total: 100,
                byModel: {
                    'openai/gpt-5-pro': 35,
                    'anthropic/claude-opus-4.6': 45,
                    'openai/gpt-5-mini': 20
                }
            },
            total: {
                models: {
                    'openai/gpt-5-pro': { input: 100, output: 100, cacheRead: 0, cost: 35 },
                    'anthropic/claude-opus-4.6': { input: 400, output: 300, cacheRead: 0, cost: 45 },
                    'openai/gpt-5-mini': { input: 500, output: 100, cacheRead: 0, cost: 20 }
                }
            },
            history: {
                '2026-03-01': { input: 1000, output: 500, cacheRead: 0, cost: 100, sessions: 1 }
            }
        };

        fs.readFile.mockImplementation(async (pathStr) => {
            if (pathStr.includes('diagnostics.config.json')) {
                return JSON.stringify({ D01_modelCostRatio: 0.3 });
            }
            return JSON.stringify(mockStats);
        });

        const result = await diagnosticsEngine.runDiagnostics();
        const action = result.actions.find(a => a.actionId === 'A01');

        expect(action).toBeDefined();
        expect(action.configDiff.from).toBe('anthropic/claude-opus-4.6');
        expect(action._meta.alternative).toBe('anthropic/claude-sonnet-4.6');
    });

    test('D04: Should flag idle skills', async () => {
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });

        const mockStats = {
            totals: { input: 1000, output: 100, cacheRead: 0 },
            cost: { total: 5 },
            total: {
                models: {
                    'openai/gpt-5-mini': { input: 1000, output: 100, cacheRead: 0, cost: 5 }
                }
            },
            history: {
                '2026-03-01': { input: 1000, cost: 5, sessions: 1 }
            }
        };
        fs.readFile.mockImplementation(async (pathStr) => {
            if (pathStr.includes('latest.json')) return JSON.stringify(mockStats);
            throw new Error('ENOENT');
        });

        // Mock 1 idle skill (>7 days) and 1 quiet skill (>3 days)
        fs.readdir.mockResolvedValue([
            { name: 'idle-skill', isDirectory: () => true, isSymbolicLink: () => false },
            { name: 'quiet-skill', isDirectory: () => true, isSymbolicLink: () => false },
            { name: 'active-skill', isDirectory: () => true, isSymbolicLink: () => false }
        ]);

        const OneDay = 1000 * 60 * 60 * 24;
        fs.stat.mockImplementation(async (filePath) => {
            if (filePath.includes('idle-skill')) return { mtimeMs: Date.now() - 10 * OneDay };
            if (filePath.includes('quiet-skill')) return { mtimeMs: Date.now() - 5 * OneDay };
            if (filePath.includes('active-skill')) return { mtimeMs: Date.now() - 1 * OneDay };
            return { mtimeMs: Date.now() };
        });

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A04');
        expect(action).toBeDefined();
        expect(action.title).toContain('Audit');
        expect(action.plainTitle).toBe('Audit possibly inactive skills');
        expect(action._meta.idleSkills).toHaveLength(1);
        expect(action._meta.quietSkills).toHaveLength(1);
        expect(action._meta.idleSkills[0].name).toBe('idle-skill');
        expect(action._meta.quietSkills[0].name).toBe('quiet-skill');
        expect(action.savings).toBeGreaterThan(0);
        expect(action._meta.potentialSavings).toBeGreaterThan(action.savings);
    });

    test('D04: respects explicit zero idle threshold from config', async () => {
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });

        const mockStats = {
            totals: { input: 1000, output: 100, cacheRead: 0 },
            cost: { total: 5 },
            history: {
                '2026-03-01': { input: 1000, cost: 5, sessions: 1 }
            }
        };

        fs.readFile.mockImplementation(async (pathStr) => {
            if (pathStr.includes('diagnostics.config.json')) {
                return JSON.stringify({ D04_idleDaysThreshold: 0 });
            }
            if (pathStr.includes('latest.json')) {
                return JSON.stringify(mockStats);
            }
            throw new Error('ENOENT');
        });

        fs.readdir.mockResolvedValue([
            { name: 'recent-skill', isDirectory: () => true, isSymbolicLink: () => false }
        ]);

        const OneDay = 1000 * 60 * 60 * 24;
        fs.stat.mockResolvedValue({ mtimeMs: Date.now() - OneDay });

        const result = await diagnosticsEngine.runDiagnostics();

        const action = result.actions.find(a => a.actionId === 'A04');
        expect(action).toBeDefined();
        expect(action._meta.idleSkills).toHaveLength(1);
        expect(action._meta.idleSkills[0].name).toBe('recent-skill');
    });


    test('Should return no actions if perfectly optimized', async () => {
        configManager.getRawConfig.mockResolvedValue({
            defaults: {
                heartbeat: { every: '0m' },
                thinkingDefault: 'minimal',
                compaction: { mode: 'safeguard' },
                budget: { maxCostPerDay: 5 },
                contextPruning: { mode: 'cache-ttl' }
            }
        });

        // Cheap model, high cache hits, low output ratio
        const mockStats = {
            totals: { input: 100000, output: 1000, cacheRead: 800000 },
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

    test('Should return empty actions with noData flag when stats file is missing', async () => {
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });

        // Simulate file not found
        fs.readFile.mockRejectedValue(new Error('ENOENT'));

        const result = await diagnosticsEngine.runDiagnostics();

        expect(result.noData).toBe(true);
        expect(result.actions).toHaveLength(0);
        expect(result.currentMonthlyCost).toBe(0);
    });

    test('Should cache results for 60 seconds', async () => {
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });
        const mockStats = {
            totals: { input: 100, output: 10, cacheRead: 50 },
            cost: { total: 1 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockStats));

        const result1 = await diagnosticsEngine.runDiagnostics();
        const result2 = await diagnosticsEngine.runDiagnostics();

        // Second call should use cache (fs.readFile called only once for stats)
        expect(result1).toBe(result2); // Same reference = cached
    });

    test('Should reload thresholds after diagnostics TTL expires', async () => {
        const originalNow = Date.now;
        configManager.getRawConfig.mockResolvedValue({ defaults: {} });

        fs.readFile.mockImplementation((pathStr) => {
            if (pathStr.includes('diagnostics.config.json')) {
                if (Date.now() < 61000) {
                    return Promise.resolve(JSON.stringify({ D09_outputRatioThreshold: 0.9 }));
                }
                return Promise.resolve(JSON.stringify({ D09_outputRatioThreshold: 0.1 }));
            }
            return Promise.resolve(JSON.stringify({
                totals: { input: 100000, output: 20000, cacheRead: 0 },
                cost: { total: 10 },
                total: {
                    models: {
                        modelA: { input: 100000, output: 20000, cacheRead: 0, cost: 10 }
                    }
                }
            }));
        });

        try {
            Date.now = jest.fn(() => 0);
            const result1 = await diagnosticsEngine.runDiagnostics();
            expect(result1.actions.find(a => a.actionId === 'A09')).toBeUndefined();

            Date.now = jest.fn(() => 61000);
            const result2 = await diagnosticsEngine.runDiagnostics();
            expect(result2.actions.find(a => a.actionId === 'A09')).toBeDefined();
        } finally {
            Date.now = originalNow;
        }
    });
});
