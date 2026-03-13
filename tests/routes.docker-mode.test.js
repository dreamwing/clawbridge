/* eslint-env jest */
'use strict';

function invokeRouteHandler(router, method, routePath, reqOverrides = {}) {
    const layer = router.stack.find(entry => entry.route && entry.route.path === routePath);
    if (!layer) throw new Error(`Route not found: ${routePath}`);

    const routeLayer = layer.route.stack.find(entry => entry.method === method);
    if (!routeLayer) throw new Error(`Method not found: ${method.toUpperCase()} ${routePath}`);

    const req = {
        body: {},
        params: {},
        ip: '127.0.0.1',
        ...reqOverrides,
    };
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };

    routeLayer.handle(req, res);
    return res;
}

describe('Docker-mode route restrictions', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('GET /api/cron returns a Docker-mode marker without CLI fallback', () => {
        const exec = jest.fn();

        jest.doMock('../src/config', () => ({
            HOME_DIR: '/tmp',
            STATE_DIR: '/tmp/.openclaw',
            IS_DOCKER: true,
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => false),
            readFileSync: jest.fn(),
        }));
        jest.doMock('child_process', () => ({
            exec,
            execFile: jest.fn(),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
        }));

        const router = require('../src/routes/cron');
        const res = invokeRouteHandler(router, 'get', '/api/cron');

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ dockerMode: true, jobs: [] });
        expect(exec).not.toHaveBeenCalled();
    });

    test('POST /api/run/:id is blocked in Docker mode before ID validation', () => {
        jest.doMock('../src/config', () => ({
            HOME_DIR: '/tmp',
            STATE_DIR: '/tmp/.openclaw',
            IS_DOCKER: true,
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => false),
            readFileSync: jest.fn(),
        }));
        jest.doMock('child_process', () => ({
            exec: jest.fn(),
            execFile: jest.fn(),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
        }));

        const router = require('../src/routes/cron');
        const res = invokeRouteHandler(router, 'post', '/api/run/:id', {
            params: { id: 'bad!!id' },
        });

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            error: 'Running cron jobs is not supported in Docker Mode. Please interact with the host CLI directly.',
        });
    });

    test('POST /api/kill is blocked in Docker mode before confirmation validation', () => {
        jest.doMock('../src/config', () => ({
            IS_DOCKER: true,
        }));
        jest.doMock('../src/utils/rateLimit', () => ({
            rateLimit: jest.fn(() => true),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
            WORKSPACE_DIR: '/tmp/workspace',
        }));
        jest.doMock('child_process', () => ({
            exec: jest.fn(),
        }));

        const router = require('../src/routes/process');
        const res = invokeRouteHandler(router, 'post', '/api/kill');

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            error: 'Process termination is not supported in Docker Container Mode. Please restart the container or run host commands directly.',
        });
    });

    test('POST /api/gateway/restart is blocked in Docker mode', () => {
        jest.doMock('../src/config', () => ({
            IS_DOCKER: true,
        }));
        jest.doMock('../src/utils/rateLimit', () => ({
            rateLimit: jest.fn(() => true),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
            WORKSPACE_DIR: '/tmp/workspace',
        }));
        jest.doMock('child_process', () => ({
            exec: jest.fn(),
        }));

        const router = require('../src/routes/process');
        const res = invokeRouteHandler(router, 'post', '/api/gateway/restart');

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            error: 'Gateway process restarts are not supported inside Docker containers. To restart the gateway, please restart the Docker container.',
        });
    });
});
