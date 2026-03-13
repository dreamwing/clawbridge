/* eslint-env jest */
'use strict';

describe('monitor service in Docker mode', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('getVersions reports Docker-managed core without invoking openclaw CLI', () => {
        const execSync = jest.fn();

        jest.doMock('child_process', () => ({
            exec: jest.fn(),
            execSync,
        }));
        jest.doMock('../src/config', () => ({
            ID_FILE: '/tmp/last_id.txt',
            APP_DIR: '/app',
            IS_DOCKER: true,
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => false),
            readFileSync: jest.fn((targetPath) => {
                if (targetPath === '/app/package.json') return JSON.stringify({ version: '1.2.3' });
                throw new Error(`Unexpected read: ${targetPath}`);
            }),
            writeFileSync: jest.fn(),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
        }));
        jest.doMock('../src/services/context', () => ({
            getActiveContext: jest.fn(() => null),
        }));
        jest.doMock('../src/services/activity', () => ({
            logActivity: jest.fn(),
            checkFileChanges: jest.fn(),
        }));

        const { getVersions } = require('../src/services/monitor');

        expect(getVersions()).toEqual({ dashboard: '1.2.3', core: 'Managed by Docker' });
        expect(execSync).not.toHaveBeenCalled();
    });

    test('checkSystemStatus marks host-only metrics as unsupported in Docker mode', done => {
        const exec = jest.fn((cmd, callback) => {
            callback(null, '===DISK===\n42%\n===GWPID===\n\n===PS===\n\n');
        });

        jest.doMock('child_process', () => ({
            exec,
            execSync: jest.fn(),
        }));
        jest.doMock('../src/config', () => ({
            ID_FILE: '/tmp/last_id.txt',
            APP_DIR: '/app',
            IS_DOCKER: true,
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => false),
            readFileSync: jest.fn((targetPath) => {
                if (targetPath === '/app/package.json') return JSON.stringify({ version: '1.2.3' });
                throw new Error(`Unexpected read: ${targetPath}`);
            }),
            writeFileSync: jest.fn(),
        }));
        jest.doMock('../src/services/openclaw', () => ({
            getOpenClawCommand: jest.fn(() => 'openclaw'),
        }));
        jest.doMock('../src/services/context', () => ({
            getActiveContext: jest.fn(() => null),
        }));
        jest.doMock('../src/services/activity', () => ({
            logActivity: jest.fn(),
            checkFileChanges: jest.fn(),
        }));

        const { checkSystemStatus } = require('../src/services/monitor');

        checkSystemStatus(data => {
            expect(exec).toHaveBeenCalled();
            expect(exec.mock.calls[0][0]).not.toContain('df -h /');
            expect(data.disk).toBeNull();
            expect(data.cpu).toBeNull();
            expect(data.mem).toBeNull();
            expect(data.gatewayPid).toBeNull();
            expect(data.scripts).toBeNull();
            expect(data.environment).toEqual({ isDocker: true });
            expect(data.unsupportedMonitoring).toEqual(['cpu', 'mem', 'disk', 'gatewayPid', 'scripts']);
            done();
        });
    });
});
