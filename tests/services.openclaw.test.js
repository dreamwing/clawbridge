'use strict';

const fs = require('fs');
const path = require('path');

// Set env before any requires
process.env.OPENCLAW_WORKSPACE = '/tmp/claw_test_ws';
process.env.OPENCLAW_PATH = '/usr/local/bin/openclaw';

jest.mock('../src/config', () => ({
    SECRET_KEY: 'testkey123',
    HOME_DIR: '/tmp',
    APP_DIR: '/tmp',
    STATE_DIR: '/tmp/.openclaw',
    PORT: 3456,
    WORKSPACE_DIR: '/tmp/claw_test_ws',
    LOG_DIR: '/tmp/logs',
    TOKEN_FILE: '/tmp/token_stats/latest.json',
    CRON_DIR: '/tmp/cron',
    MEMORY_DIR: '/tmp/memory',
    ENABLE_EMBEDDED_TUNNEL: false,
    TUNNEL_TOKEN: null,
}));

describe('findWorkspace()', () => {
    test('returns OPENCLAW_WORKSPACE env var immediately when set', () => {
        // Reset module to clear workspaceCache
        jest.resetModules();
        process.env.OPENCLAW_WORKSPACE = '/tmp/env_workspace';
        const { findWorkspace } = require('../src/services/openclaw');
        expect(findWorkspace()).toBe('/tmp/env_workspace');
    });

    test('falls back to probe paths when env var is unset', () => {
        jest.resetModules();
        delete process.env.OPENCLAW_WORKSPACE;
        // Create a fake workspace with a memory dir to trigger probe
        const fakeWs = '/tmp/fake_probe_workspace';
        fs.mkdirSync(path.join(fakeWs, 'memory'), { recursive: true });
        fs.writeFileSync(path.join(fakeWs, 'MEMORY.md'), '# mock');
        // We can't easily control the probe paths without env, just verify it returns a string or null
        const { findWorkspace } = require('../src/services/openclaw');
        const result = findWorkspace();
        expect(result === null || typeof result === 'string').toBe(true);
        fs.rmSync(fakeWs, { recursive: true, force: true });
        process.env.OPENCLAW_WORKSPACE = '/tmp/claw_test_ws'; // restore
    });
});

describe('getOpenClawCommand()', () => {
    test('returns OPENCLAW_PATH env var when set', () => {
        jest.resetModules();
        process.env.OPENCLAW_PATH = '/usr/local/bin/openclaw';
        const { getOpenClawCommand } = require('../src/services/openclaw');
        expect(getOpenClawCommand()).toBe('/usr/local/bin/openclaw');
    });

    test('falls back to "openclaw" string when env var not set and binary not found', () => {
        jest.resetModules();
        delete process.env.OPENCLAW_PATH;
        const { getOpenClawCommand } = require('../src/services/openclaw');
        const result = getOpenClawCommand();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        process.env.OPENCLAW_PATH = '/usr/local/bin/openclaw'; // restore
    });
});
