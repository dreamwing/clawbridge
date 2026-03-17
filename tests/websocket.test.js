'use strict';

process.env.ACCESS_KEY = 'testkey123';
process.env.OPENCLAW_WORKSPACE = '/tmp/claw_test_ws';

jest.mock('openclaw', () => {
    return {
        loadConfig: jest.fn().mockResolvedValue({ workspace: '/tmp/claw_test_ws' }),
        CommandProxy: class { },
        ContextProxy: class {
            async read() { return { test: true }; }
            async getPrompt() { return { context: 'test' }; }
        },
    };
}, { virtual: true });

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const app = require('../src/app');
const { setupWebSocket } = require('../src/websocket');
const { addSession, generateSessionToken } = require('../src/auth/sessions');

/** Returns a server listening on a random port, with WS set up. */
function createTestServer() {
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });
    setupWebSocket(wss);
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, wss })));
}

function closeServer(server, wss) {
    return new Promise(resolve => {
        wss.close(() => server.close(resolve));
    });
}

describe('WebSocket Authentication', () => {
    let server, wss, port;

    beforeAll(async () => {
        ({ server, wss } = await createTestServer());
        port = server.address().port;
    });

    afterAll(async () => {
        await closeServer(server, wss);
    });

    test('no credentials → close code 4001 (Unauthorized)', done => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.on('close', (code) => {
            expect(code).toBe(4001);
            done();
        });
        ws.on('error', done); // fail fast on connection error
    });

    test('wrong x-claw-key header → close code 4001', done => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
            headers: { 'x-claw-key': 'wrongkey' },
        });
        ws.on('close', (code) => {
            expect(code).toBe(4001);
            done();
        });
        ws.on('error', done);
    });

    test('correct x-claw-key header → connected (receives heartbeat)', done => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
            headers: { 'x-claw-key': 'testkey123' },
        });
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            expect(msg).toHaveProperty('type', 'heartbeat');
            ws.close();
            done();
        });
        ws.on('error', done);
    });

    test('valid session cookie → connected (receives heartbeat)', done => {
        const token = generateSessionToken();
        addSession(token);

        const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
            headers: { cookie: `claw_session=${token}` },
        });
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            expect(msg).toHaveProperty('type', 'heartbeat');
            ws.close();
            done();
        });
        ws.on('error', done);
    });
});
