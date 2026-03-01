const request = require('supertest');
const app = require('../src/app');

// Mock Auth Middleware so we don't need a real token for testing API routes
jest.mock('../src/auth/middleware', () => {
    return (req, res, next) => {
        req.user = { id: 'test-user' };
        next();
    };
});

// Mock diagnostics engine to avoid circular dependency issues
jest.mock('../src/services/diagnostics', () => {
    return {
        runDiagnostics: jest.fn().mockResolvedValue({
            totalMonthlySavings: 50,
            currentMonthlyCost: 100,
            cacheHitRate: 0.05,
            actions: [
                {
                    actionId: 'A01',
                    title: 'Downgrade claude 3',
                    description: 'Primary usage on premium model.',
                    sideEffect: '⚠ Mild decrease.',
                    savings: 30,
                    savingsStr: '-$30.00/mo',
                    codeTag: 'model: "claude-3-5-sonnet-20241022"',
                    level: 'high',
                    _meta: { alternative: 'claude-3-5-sonnet-20241022' }
                },
                {
                    actionId: 'A02',
                    title: 'Disable Background Polling',
                    description: 'Heartbeats consume ~17M tokens/mo.',
                    sideEffect: '⚠ Manual refresh needed.',
                    savings: 20,
                    savingsStr: '-$20.00/mo',
                    codeTag: 'heartbeat.every: "0m"',
                    level: 'medium'
                }
            ]
        }),
        invalidateCache: jest.fn()
    };
});

// Mock openclaw_config to prevent real config changes
jest.mock('../src/services/openclaw_config', () => {
    return {
        getRawConfig: jest.fn().mockResolvedValue({
            defaults: { heartbeat: { every: '15m' } }
        }),
        setConfig: jest.fn().mockResolvedValue({ success: true, message: 'Mock success' })
    };
});

// Mock fs at the lowest level
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        promises: {
            ...originalFs.promises,
            readFile: jest.fn((pathStr) => {
                if (pathStr.includes('optimizations.jsonl')) {
                    const mockLog = `{"actionId":"A02","timestamp":"2026-02-28T12:00:00.000Z","savings":1.50}`;
                    return Promise.resolve(mockLog);
                }
                if (originalFs.promises.readFile) {
                    return originalFs.promises.readFile(pathStr);
                }
                return Promise.resolve('');
            }),
            appendFile: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined),
            writeFile: jest.fn().mockResolvedValue(undefined)
        }
    };
});

describe('Cost Control API Integration Tests', () => {

    test('GET /api/diagnostics returns actions array', async () => {
        const response = await request(app).get('/api/diagnostics');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('actions');
        expect(Array.isArray(response.body.actions)).toBe(true);
        expect(response.body.actions.length).toBeGreaterThan(0);

        const actionIds = response.body.actions.map(a => a.actionId);
        expect(actionIds).toContain('A01');
        expect(actionIds).toContain('A02');
    });

    test('GET /api/diagnostics returns totalMonthlySavings and currentMonthlyCost', async () => {
        const response = await request(app).get('/api/diagnostics');
        expect(response.body.totalMonthlySavings).toBeGreaterThan(0);
        expect(response.body.currentMonthlyCost).toBeGreaterThan(0);
    });

    test('POST /api/optimize/:action_id applies action', async () => {
        const response = await request(app)
            .post('/api/optimize/A02')
            .send({ savings: 1.50 });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.details).toBeDefined();
        expect(response.body.details.title).toBe('Disable Background Polling');
        expect(response.body.backupPath).toBeDefined();
    });

    test('POST /api/optimize with meta passes alternative model', async () => {
        const response = await request(app)
            .post('/api/optimize/A01')
            .send({ savings: 30, meta: { alternative: 'gpt-4o-mini' } });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('POST /api/optimize with invalid actionId returns 500', async () => {
        const response = await request(app)
            .post('/api/optimize/A99')
            .send({});
        expect(response.status).toBe(500);
        expect(response.body.error).toBeDefined();
    });

    test('GET /api/optimizations/history returns array', async () => {
        const response = await request(app).get('/api/optimizations/history');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].actionId).toBe('A02');
    });
});
