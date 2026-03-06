const pricingService = require('../src/services/pricing');
const fs = require('fs').promises;

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

describe('Pricing Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        pricingService.invalidateCache();
    });

    test('Should load pricing successfully', async () => {
        const mockPricing = {
            updatedAt: "2026-03-01T00:00:00.000Z",
            default: { input: 0.1, output: 0.2 },
            "openai/gpt-5": { input: 1.0, output: 2.0 },
            "openai/gpt-5-mini": { input: 0.2, output: 0.4 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockPricing));

        const price = await pricingService.getModelPrice('openai/gpt-5');
        expect(price).toEqual({ input: 1.0, output: 2.0 });

        const defaultPrice = await pricingService.getModelPrice('unknown-model');
        expect(defaultPrice).toEqual({ input: 0.1, output: 0.2 });
    });

    test('Should handle pricing.json read failure with empty cache', async () => {
        fs.readFile.mockRejectedValue(new Error('ENOENT'));

        const price = await pricingService.getModelPrice('any-model');
        // Falls back to safe defaults { input: 0.1, output: 0.4 }
        expect(price).toEqual({ input: 0.1, output: 0.4 });
    });

    test('Should compute replacements properly', async () => {
        const mockPricing = {
            "openai/gpt-5": { input: 1.0, output: 2.0 },
            "openai/gpt-5-mini": { input: 0.2, output: 0.4 }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(mockPricing));

        const replacements = await pricingService.getReplacements();

        // Known replacements test
        expect(replacements['openai/gpt-5']).toBeDefined();
        expect(replacements['openai/gpt-5'].alternative).toBe('openai/gpt-5-mini');

        // Savings ratio: 1 - (0.2 / 1.0) = 0.8
        expect(replacements['openai/gpt-5'].savingsRatio).toBeCloseTo(0.8);

        // Unknown replacement fallbacks to 0.8 savings
        expect(replacements['openai/gpt-5-pro']).toBeDefined();
        expect(replacements['openai/gpt-5-pro'].alternative).toBe('openai/gpt-5');
        expect(replacements['openai/gpt-5-pro'].savingsRatio).toBe(0.8);
    });
});
