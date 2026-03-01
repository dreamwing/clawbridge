const request = require('supertest');
const app = require('../src/app');

// Mock Auth Middleware so we don't need a real token for testing API routes
jest.mock('../src/auth/middleware', () => {
    return (req, res, next) => {
        req.user = { id: 'test-user' };
        next();
    };
});

// Since integration tests test the routes and services together,
// we should mock the CLI execution at the lowest level so we don't accidentally
// change the host machine's openclaw configuration.
jest.mock('../src/services/openclaw_config', () => {
    return {
        getRawConfig: jest.fn().mockResolvedValue({
            defaults: {
                heartbeat: { every: '15m' }, // Trigger D02
            }
        }),
        setConfig: jest.fn().mockResolvedValue({ success: true, message: 'Mock success' })
    };
});

// Mock fs to control what diagnostics sees as token history
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        promises: {
            ...originalFs.promises,
            readFile: jest.fn((pathStr) => {
                if (pathStr.includes('optimizations.jsonl')) {
                    const mockLog = `{"actionId":"A02","timestamp":"2026-02-28T12:00:00.000Z"}`;
                    return Promise.resolve(mockLog);
                }
                if (pathStr.includes('latest.json')) {
                    return Promise.resolve(JSON.stringify({
                        totals: { input: 1000, output: 100, cacheRead: 50 },
                        cost: { total: 10, byModel: { 'claude-3-5-opus-20240229': 6 } }
                    }));
                }
                if (pathStr.includes('HEARTBEAT.md')) {
                    return Promise.resolve('Check my emails.');
                }
                if (originalFs.promises.readFile) {
                    return originalFs.promises.readFile(pathStr);
                }
                return Promise.resolve('');
            }),
            appendFile: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined)
        }
    };
});

describe('Cost Control API Integration Tests', () => {

    test('GET /api/diagnostics', async () => {
        const response = await request(app).get('/api/diagnostics');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('actions');
        expect(Array.isArray(response.body.actions)).toBe(true);
        expect(response.body.actions.length).toBeGreaterThan(0);

        // It should flag D01 (because Opus is 60%) and D02 (heartbeat 15m)
        const actionIds = response.body.actions.map(a => a.actionId);
        expect(actionIds).toContain('A01');
        expect(actionIds).toContain('A02');
    });

    test('POST /api/optimize/:action_id', async () => {
        const response = await request(app).post('/api/optimize/A02');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.details).toBeDefined();
        expect(response.body.details.title).toBe('Disable Background Polling');
    });

    test('GET /api/optimizations/history', async () => {
        const response = await request(app).get('/api/optimizations/history');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].actionId).toBe('A02');
    });
});
