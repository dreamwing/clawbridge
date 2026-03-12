'use strict';

const fs = require('fs').promises;

const mockExecFileAsync = jest.fn();

jest.mock('util', () => {
    const actual = jest.requireActual('util');
    return {
        ...actual,
        promisify: jest.fn(() => mockExecFileAsync)
    };
});

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

jest.mock('../src/utils/paths', () => ({
    resolveConfigDir: jest.fn(() => '/tmp/.openclaw')
}));

describe('OpenClawConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecFileAsync.mockReset();
    });

    test('falls back to reading openclaw.json when CLI get times out', async () => {
        mockExecFileAsync.mockRejectedValue(new Error('Command timed out'));
        fs.readFile.mockResolvedValue(JSON.stringify({
            agents: {
                defaults: {
                    model: { primary: 'openai/gpt-5-pro' }
                }
            }
        }));

        const configManager = require('../src/services/openclaw_config');
        const result = await configManager.getRawConfig();

        expect(result.defaults.model.primary).toBe('openai/gpt-5-pro');
        expect(fs.readFile).toHaveBeenCalledWith('/tmp/.openclaw/openclaw.json', 'utf-8');
    });
});
