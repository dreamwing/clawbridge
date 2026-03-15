/**
 * Pricing service — loads model pricing from data/config/pricing.json.
 *
 * No remote fetching; the file is updated manually from OpenRouter.
 * Cache is indefinite (loaded once per process lifetime until invalidated).
 */
const fs = require('fs').promises;
const path = require('path');

const PRICING_PATH = path.join(__dirname, '../../data/config/pricing.json');

let _pricing = null;
let _replacements = null;

/**
 * Load pricing data from local JSON file.
 * Returns the full pricing map { modelId: { input, output, cacheRead? } }.
 */
async function loadPricing() {
    if (_pricing) return _pricing;
    try {
        const data = await fs.readFile(PRICING_PATH, 'utf8');
        const parsed = JSON.parse(data);
        // Remove metadata fields
        const { updatedAt, default: defaultPricing, ...models } = parsed;
        _pricing = { models, defaultPricing: defaultPricing || { input: 0.1, output: 0.4 }, updatedAt };
    } catch (err) {
        console.warn('Failed to load pricing.json:', err.message);
        _pricing = { models: {}, defaultPricing: { input: 0.1, output: 0.4 }, updatedAt: null };
    }
    return _pricing;
}

/**
 * Get price for a specific model ($/M tokens).
 * Falls back to default pricing if model not found.
 */
async function getModelPrice(modelId) {
    const pricing = await loadPricing();
    return pricing.models[modelId] || pricing.defaultPricing;
}

/**
 * Dynamically build MODEL_REPLACEMENTS from pricing data.
 *
 * Strategy: for each expensive model (input > $3/M), find the cheapest
 * model in the same family that's at least 50% cheaper.
 *
 * Known replacement pairs (curated):
 */
const KNOWN_REPLACEMENTS = {
    'anthropic/claude-opus-4.6': 'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.5': 'anthropic/claude-sonnet-4.5',
    'anthropic/claude-opus-4.1': 'anthropic/claude-sonnet-4.5',
    'openai/gpt-5-pro': 'openai/gpt-5',
    'openai/gpt-5.2-pro': 'openai/gpt-5.2',
    'openai/gpt-5': 'openai/gpt-5-mini',
    'openai/gpt-5.1': 'openai/gpt-5.1-codex-mini',
    'openai/gpt-5.2': 'openai/gpt-5-mini',
    'google/gemini-3.1-pro-preview': 'google/gemini-2.5-flash',
    'google/gemini-2.5-pro': 'google/gemini-2.5-flash',
    'x-ai/grok-4': 'x-ai/grok-4-fast',
    'x-ai/grok-3': 'x-ai/grok-3-mini',
    'openai/o3-pro': 'openai/gpt-5',
    'amazon/nova-premier-v1': 'amazon/nova-2-lite-v1',
    // Legacy model IDs (for backward compat with hardcoded tests)
    'claude-3-5-opus-20240229': 'claude-3-5-sonnet-20241022',
    'gpt-4o': 'gpt-4o-mini',
    'gemini-1.5-pro': 'gemini-1.5-flash'
};

/**
 * Get model replacements map: { expensiveModelId: { alternative, savingsRatio } }
 * savingsRatio = 1 - (cheaperPrice / expensivePrice)
 */
function getNumericPrice(price, key) {
    const value = price && Number.isFinite(price[key]) ? price[key] : null;
    if (value != null) return value;
    if (key === 'cacheRead') {
        return price && Number.isFinite(price.input) ? price.input : 0;
    }
    return 0;
}

function computeSavingsRatio(expPrice, cheapPrice, usageStats) {
    if (!expPrice || !cheapPrice) return 0.8;

    const inputTokens = Math.max(0, usageStats?.input || 0);
    const outputTokens = Math.max(0, usageStats?.output || 0);
    const cacheReadTokens = Math.max(0, usageStats?.cacheRead || 0);

    const blendedExpensive =
        inputTokens * getNumericPrice(expPrice, 'input') +
        outputTokens * getNumericPrice(expPrice, 'output') +
        cacheReadTokens * getNumericPrice(expPrice, 'cacheRead');
    const blendedCheap =
        inputTokens * getNumericPrice(cheapPrice, 'input') +
        outputTokens * getNumericPrice(cheapPrice, 'output') +
        cacheReadTokens * getNumericPrice(cheapPrice, 'cacheRead');

    if (blendedExpensive <= 0) {
        const fallbackRatio = 1 - (getNumericPrice(cheapPrice, 'input') / Math.max(getNumericPrice(expPrice, 'input'), Number.EPSILON));
        return Math.max(0, Math.min(1, parseFloat(fallbackRatio.toFixed(2))));
    }

    const ratio = 1 - (blendedCheap / blendedExpensive);
    return Math.max(0, Math.min(1, parseFloat(ratio.toFixed(2))));
}

async function getReplacements(modelUsage = {}) {
    if (_replacements) return _replacements;

    const pricing = await loadPricing();
    _replacements = {};

    for (const [expensive, cheaper] of Object.entries(KNOWN_REPLACEMENTS)) {
        const expPrice = pricing.models[expensive];
        const cheapPrice = pricing.models[cheaper];

        if (expPrice && cheapPrice) {
            _replacements[expensive] = {
                alternative: cheaper,
                savingsRatio: computeSavingsRatio(expPrice, cheapPrice, modelUsage[expensive])
            };
        } else {
            // For legacy model IDs without pricing data, use conservative estimate
            _replacements[expensive] = {
                alternative: cheaper,
                savingsRatio: 0.8
            };
        }
    }

    return _replacements;
}

/**
 * Invalidate cached pricing and replacements.
 * Call after pricing.json is updated.
 */
function invalidateCache() {
    _pricing = null;
    _replacements = null;
}

module.exports = {
    loadPricing,
    getModelPrice,
    getReplacements,
    invalidateCache
};
