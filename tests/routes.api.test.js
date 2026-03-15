'use strict';

// Set env before any module loading
process.env.ACCESS_KEY = 'testkey123';
process.env.OPENCLAW_WORKSPACE = '/tmp/claw_test_ws';
process.env.PORT = '0'; // random port, supertest ignores this

jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        readFileSync: jest.fn((path, options) => {
            if (path.includes('openclaw.json')) return JSON.stringify({ workspace: '/tmp/claw_test_ws' });
            return originalFs.readFileSync(path, options);
        }),
    };
});

jest.mock('openclaw', () => {
    return {
        loadConfig: jest.fn().mockResolvedValue({ workspace: '/tmp/claw_test_ws' }),
        CommandProxy: class { },
        ContextProxy: class {
            async read() { return { test: true }; }
            async getPrompt() { return { context: 'test' }; }
        }
    };
}, { virtual: true });

jest.mock('../src/services/analyzer', () => {
    return {
        runAnalyzer: jest.fn().mockReturnValue({ triggered: true, running: true, message: 'Analysis started.' }),
        getAnalyzerState: jest.fn().mockReturnValue({ running: true }),
        setWss: jest.fn()
    };
});

const fs = require('fs');
fs.mkdirSync('/tmp/claw_test_ws/memory', { recursive: true });

const request = require('supertest');
const app = require('../src/app');

describe('Authentication Middleware', () => {
    test('GET / (no auth) returns 200 with login HTML', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('ClawBridge');
        expect(res.text).toContain('login');
    });

    test('GET /api/status (no auth) returns 401 JSON', async () => {
        const res = await request(app).get('/api/status');
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
    });

    test('GET /api/status with wrong x-claw-key returns 401', async () => {
        const res = await request(app)
            .get('/api/status')
            .set('x-claw-key', 'wrongkey');
        expect(res.status).toBe(401);
    });

    test('GET /api/status with correct x-claw-key returns 200', async () => {
        const res = await request(app)
            .get('/api/status')
            .set('x-claw-key', 'testkey123');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('task');
    });
});

describe('POST /api/auth', () => {
    test('wrong key returns 401', async () => {
        const res = await request(app)
            .post('/api/auth')
            .send({ key: 'wrongkey' });
        expect(res.status).toBe(401);
    });

    test('correct key returns 200 and sets session cookie', async () => {
        const res = await request(app)
            .post('/api/auth')
            .send({ key: 'testkey123' });
        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies[0]).toMatch(/claw_session=/);
        expect(cookies[0]).toMatch(/HttpOnly/i);
    });
});

describe('Cookie Session Auth', () => {
    let sessionCookie;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/auth')
            .send({ key: 'testkey123' });
        sessionCookie = res.headers['set-cookie'][0].split(';')[0];
    });

    test('GET /api/config with valid cookie returns 200', async () => {
        const res = await request(app)
            .get('/api/config')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('hasToken');
    });

    test('GET /api/memory with valid cookie returns 200', async () => {
        const res = await request(app)
            .get('/api/memory')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(200);
    });

    test('POST /api/logout clears session cookie', async () => {
        const res = await request(app)
            .post('/api/logout')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(200);
        const cleared = res.headers['set-cookie'] ? res.headers['set-cookie'][0] : '';
        // Cookie should be cleared (max-age=0 or expires in past)
        expect(cleared).toMatch(/claw_session=/);
    });

    test('old cookie is rejected after logout', async () => {
        const res = await request(app)
            .get('/api/config')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(401);
    });
});

describe('Rate Limiting on /api/auth', () => {
    test('11 failed attempts trigger 429 Too Many Requests', async () => {
        // Each test run has a fresh IP implicitly since supertest uses loopback
        // We need > 10 fails with the SAME IP. supertest uses loopback (::1 or 127.0.0.1).
        // First clear by sending a success (which resets counter in our implementation)
        await request(app).post('/api/auth').send({ key: 'testkey123' });

        // Send 10 failures
        for (let i = 0; i < 10; i++) {
            await request(app).post('/api/auth').send({ key: 'wrongkey' });
        }
        // 11th should be rate-limited
        const res = await request(app).post('/api/auth').send({ key: 'wrongkey' });
        expect(res.status).toBe(429);

        // Reset rate limiter for next test suites
        const { resetAuthAttempts } = require('../src/auth/sessions');
        resetAuthAttempts('::ffff:127.0.0.1');
        resetAuthAttempts('::1');
        resetAuthAttempts('127.0.0.1');
    });
});

describe('Legacy Magic Link', () => {
    test('GET /?key=correctKey redirects and sets cookie', async () => {
        const res = await request(app).get('/?key=testkey123');
        expect(res.status).toBe(302);
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies[0]).toMatch(/claw_session=/);
    });
});

describe('Token Routes (/api/tokens)', () => {
    let sessionCookie;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/auth')
            .send({ key: 'testkey123' });
        sessionCookie = res.headers['set-cookie'][0].split(';')[0];
    });

    test('GET /api/tokens handles missing file gracefully', async () => {
        // Mock fs to simulate missing file
        const originalFs = jest.requireActual('fs');
        jest.spyOn(fs, 'existsSync').mockImplementation(path => {
            if (path.includes('latest.json')) return false;
            return originalFs.existsSync(path);
        });

        const res = await request(app)
            .get('/api/tokens')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('today');
        expect(res.body.today).toHaveProperty('cost', 0);
        expect(res.body).toHaveProperty('recentCosts');

        jest.restoreAllMocks();
    });

    test('POST /api/tokens/refresh triggers analysis', async () => {
        const res = await request(app)
            .post('/api/tokens/refresh')
            .set('Cookie', sessionCookie);
        // It should either trigger (200) or report already running (409)
        expect([200, 409]).toContain(res.status);
        expect(res.body).toHaveProperty('running', true);
    });

    test('GET /api/tokens/status returns analyzer state', async () => {
        const res = await request(app)
            .get('/api/tokens/status')
            .set('Cookie', sessionCookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('running');
    });
});

