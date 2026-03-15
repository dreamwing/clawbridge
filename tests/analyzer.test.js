'use strict';

const { runAnalyzer, getAnalyzerState, setWss } = require('../src/services/analyzer');
const { exec } = require('child_process');

jest.mock('child_process', () => {
    return {
        exec: jest.fn((cmd, options, cb) => {
            // Simulate a long-running process
            setTimeout(() => {
                cb(null, 'Success', '');
            }, 50);
        })
    };
});

describe('Analyzer Service', () => {
    beforeEach(() => {
        // Reset state by mocking child process and waiting for it
        jest.clearAllMocks();
    });

    test('getAnalyzerState returns initial state', () => {
        const state = getAnalyzerState();
        expect(state).toHaveProperty('running');
        expect(state).toHaveProperty('lastError');
        expect(state).toHaveProperty('lastCompletedAt');
        expect(state).toHaveProperty('lastTriggeredAt');
    });

    test('runAnalyzer triggers analysis and tracks state', (done) => {
        const result = runAnalyzer();
        expect(result.triggered).toBe(true);
        expect(result.running).toBe(true);
        expect(exec).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ timeout: 300000 }),
            expect.any(Function)
        );

        const state = getAnalyzerState();
        expect(state.running).toBe(true);
        expect(state.lastTriggeredAt).not.toBeNull();

        // Wait for mock exec to finish
        setTimeout(() => {
            const finalState = getAnalyzerState();
            expect(finalState.running).toBe(false);
            expect(finalState.lastError).toBeNull();
            expect(finalState.lastCompletedAt).not.toBeNull();
            done();
        }, 100);
    });

    test('runAnalyzer prevents concurrent executions', () => {
        // First run
        const result1 = runAnalyzer();
        expect(result1.triggered).toBe(true);

        // Immediate second run should fail
        const result2 = runAnalyzer();
        expect(result2.triggered).toBe(false);
        expect(result2.message).toMatch(/already in progress/);
    });

    test('broadcasts to WebSocket clients on completion', (done) => {
        const mockClient = {
            readyState: 1,
            send: jest.fn()
        };
        const mockWss = {
            clients: [mockClient]
        };

        setWss(mockWss);
        runAnalyzer();

        setTimeout(() => {
            expect(mockClient.send).toHaveBeenCalled();
            const sentMsg = JSON.parse(mockClient.send.mock.calls[0][0]);
            expect(sentMsg.type).toBe('analysis_complete');
            done();
        }, 100);
    });
});
