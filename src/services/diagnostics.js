const configManager = require('./openclaw_config');
const fs = require('fs').promises;
const path = require('path');

// Dynamic mapping of expensive models to cheaper alternatives (D01)
// savingsRatio = 1 - (alternativePrice / originalPrice)
const MODEL_REPLACEMENTS = {
    'claude-3-5-opus-20240229': {
        alternative: 'claude-3-5-sonnet-20241022',
        savingsRatio: 0.8
    },
    'gpt-4o': {
        alternative: 'gpt-4o-mini',
        savingsRatio: 0.95
    },
    'gemini-1.5-pro': {
        alternative: 'gemini-1.5-flash',
        savingsRatio: 0.9
    }
};

// Cache for diagnostic results (60s TTL)
let _diagCache = null;
let _diagCacheTs = 0;
const DIAG_CACHE_TTL = 60000;

class DiagnosticsEngine {
    constructor() {
        this.statsPath = path.join(__dirname, '../../data/token_stats/latest.json');
    }

    async getStats() {
        try {
            const data = await fs.readFile(this.statsPath, 'utf8');
            return JSON.parse(data);
        } catch (_err) {
            // No stats available — return zeroed structure, never fake data
            return {
                totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                cost: { total: 0, byModel: {} },
                history: {},
                _empty: true
            };
        }
    }

    /**
     * Compute the per-token cost ratio for a given token type from per-model data.
     * Uses the actual model rates from latest.json to get precise $/token.
     */
    _computeTokenCostRatio(models, tokenType) {
        let totalTokens = 0;
        let totalCost = 0;
        for (const m of Object.values(models || {})) {
            totalTokens += m[tokenType] || 0;
            // We only have aggregate cost per model, so we estimate per-type cost
            // using the token proportion within that model.
            const modelTotal = (m.input || 0) + (m.output || 0) + (m.cacheRead || 0);
            if (modelTotal > 0 && m.cost) {
                totalCost += m.cost * ((m[tokenType] || 0) / modelTotal);
            }
        }
        if (totalTokens === 0) return 0;
        return totalCost / totalTokens;
    }

    async runDiagnostics() {
        // Return cached result if still fresh
        const now = Date.now();
        if (_diagCache && (now - _diagCacheTs) < DIAG_CACHE_TTL) {
            return _diagCache;
        }

        const results = [];
        let totalMonthlySavings = 0;

        // 1. Get current config
        const agentsConfig = await configManager.getRawConfig();
        const defaults = agentsConfig.defaults || {};

        // 2. Get usage stats
        const rawStats = await this.getStats();

        // If stats are empty, return no recommendations rather than fake ones
        if (rawStats._empty) {
            const emptyResult = {
                totalMonthlySavings: 0,
                currentMonthlyCost: 0,
                actions: [],
                noData: true
            };
            _diagCache = emptyResult;
            _diagCacheTs = now;
            return emptyResult;
        }

        // Normalize data: support both old (cost.total) and new (total.cost) formats
        const rawModels = (rawStats.total && rawStats.total.models) || {};
        const stats = {
            totals: rawStats.totals || rawStats.total || { input: 0, output: 0, cacheRead: 0 },
            cost: {
                total: (rawStats.cost && rawStats.cost.total) ? rawStats.cost.total
                    : (rawStats.total ? rawStats.total.cost : 0) || 0,
                byModel: (rawStats.cost && rawStats.cost.byModel) ? rawStats.cost.byModel
                    : Object.fromEntries(Object.entries(rawModels).map(([k, v]) => [k, v.cost || 0]))
            },
            models: rawModels,
            activeDays: Math.max(1, Object.keys(rawStats.history || {}).length)
        };

        const totalCost = stats.cost.total || 0;
        const monthlyMultiplier = 30 / stats.activeDays;
        const totalInput = stats.totals.input || 0;
        const totalOutput = stats.totals.output || 0;
        const totalCacheRead = stats.totals.cacheRead || 0;

        // Precise per-token cost ratios from actual model data
        const inputCostPerToken = this._computeTokenCostRatio(stats.models, 'input');
        const outputCostPerToken = this._computeTokenCostRatio(stats.models, 'output');

        // --- D01: Expensive Model ---
        const byModelStats = stats.cost.byModel;
        for (const [modelId, cost] of Object.entries(byModelStats)) {
            if (totalCost > 0 && MODEL_REPLACEMENTS[modelId] && (cost / totalCost) > 0.5) {
                const info = MODEL_REPLACEMENTS[modelId];
                const estimatedSavings = cost * monthlyMultiplier * info.savingsRatio;
                totalMonthlySavings += estimatedSavings;


                results.push({
                    actionId: 'A01',
                    title: `Downgrade ${modelId.split('-').slice(0, 2).join(' ')}`,
                    description: `Primary usage is on premium model. Switching to ${info.alternative} saves ~${(info.savingsRatio * 100).toFixed(0)}%.`,
                    sideEffect: '⚠ Mild decrease in performance on highly complex reasoning tasks.',
                    savings: estimatedSavings,
                    savingsStr: `-$${estimatedSavings.toFixed(2)}/mo`,
                    codeTag: `model: "${info.alternative}"`,
                    level: 'high',
                    _meta: { alternative: info.alternative }
                });
                break;
            }
        }

        // --- D02: Heartbeat Optimization ---
        let hbEvery = defaults.heartbeat?.every;
        let heartbeatTasksText = '';
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            const hbPath = path.join(homeDir, '.openclaw', 'workspace', 'HEARTBEAT.md');
            const fileContent = await fs.readFile(hbPath, 'utf8');
            heartbeatTasksText = fileContent.split('\n')
                .filter(l => l.trim() && !l.trim().startsWith('#'))
                .join('\n');
        } catch (_e) {
            // File doesn't exist
        }

        if (!hbEvery && heartbeatTasksText.length > 0) {
            hbEvery = '5m'; // OpenClaw default
        }

        if (hbEvery && hbEvery !== '0m' && hbEvery !== '0' && heartbeatTasksText.length > 0) {
            let intervalMinutes = 5;
            if (hbEvery.endsWith('m')) intervalMinutes = parseInt(hbEvery) || 5;
            else if (hbEvery.endsWith('h')) intervalMinutes = (parseInt(hbEvery) || 1) * 60;

            const taskTokens = Math.ceil(heartbeatTasksText.length / 4);
            const tokensPerRun = 2000 + taskTokens; // base system prompt + task
            const hbCostPerToken = inputCostPerToken > 0 ? inputCostPerToken : (0.10 / 1000000);

            // Current cost at current interval
            const currentRunsPerMonth = (30 * 24 * 60) / Math.max(1, intervalMinutes);
            const currentMonthlyTokens = currentRunsPerMonth * tokensPerRun;
            const currentMonthlyCostHB = currentMonthlyTokens * hbCostPerToken;

            // Generate multi-interval options with per-option savings
            const intervalOptions = [
                { label: 'Every 30 min', value: '30m', minutes: 30 },
                { label: 'Every 1 hour', value: '1h', minutes: 60 },
                { label: 'Every 2 hours', value: '2h', minutes: 120 },
                { label: 'Every 4 hours', value: '4h', minutes: 240 },
                { label: 'Disable completely', value: '0m', minutes: Infinity }
            ];

            const options = intervalOptions
                .filter(opt => opt.minutes > intervalMinutes) // Only show slower intervals
                .map(opt => {
                    const optRunsPerMonth = opt.minutes === Infinity ? 0
                        : (30 * 24 * 60) / opt.minutes;
                    const optMonthlyCost = optRunsPerMonth * tokensPerRun * hbCostPerToken;
                    const optSavings = currentMonthlyCostHB - optMonthlyCost;
                    return {
                        label: opt.label,
                        value: opt.value,
                        savings: optSavings,
                        savingsStr: `-$${optSavings.toFixed(2)}/mo`,
                        monthlyTokens: optRunsPerMonth * tokensPerRun,
                    };
                });

            // Default savings = full disable (max savings)
            const maxSavings = currentMonthlyCostHB;
            totalMonthlySavings += maxSavings;

            const taskCount = heartbeatTasksText.split('\n').length;
            results.push({
                actionId: 'A02',
                title: 'Adjust Heartbeat Interval',
                description: `Running every ${hbEvery} with ${taskCount} task${taskCount > 1 ? 's' : ''}, consuming ~${(currentMonthlyTokens / 1000000).toFixed(1)}M tokens/mo ($${currentMonthlyCostHB.toFixed(2)}/mo).`,
                sideEffect: '⚠ Longer intervals delay cross-agent message delivery.',
                savings: maxSavings,
                savingsStr: `-$${maxSavings.toFixed(2)}/mo`,
                codeTag: 'heartbeat.every',
                level: 'medium',
                options,
                currentInterval: hbEvery,
                _meta: { type: 'heartbeat-interval' }
            });
        }

        // --- D05: Thinking Token Overhead ---
        const thinking = defaults.thinkingDefault;
        if (!thinking || thinking === 'high' || thinking === 'xhigh' || thinking === 'on') {
            // Precise: thinking tokens are output tokens that the model generates internally.
            // With "high" thinking, ~40% of output goes to reasoning. Minimal reduces this by ~75%.
            // Savings = outputTokens * thinkingProportion * reductionRatio * outputCostPerToken
            const thinkingProportion = 0.40;
            const reductionRatio = 0.75;
            const thinkingSavingsAllTime = totalOutput * thinkingProportion * reductionRatio * outputCostPerToken;
            const thinkingSavings = thinkingSavingsAllTime * monthlyMultiplier;

            if (thinkingSavings > 0) {
                totalMonthlySavings += thinkingSavings;
                results.push({
                    actionId: 'A05',
                    title: 'Reduce Thinking Overhead',
                    description: `~${(totalOutput * thinkingProportion / 1000).toFixed(0)}K output tokens spent on reasoning. Minimal mode cuts this by ${(reductionRatio * 100).toFixed(0)}%.`,
                    sideEffect: '⚠ May reduce mathematical or logical accuracy on hard prompts.',
                    savings: thinkingSavings,
                    savingsStr: `-$${thinkingSavings.toFixed(2)}/mo`,
                    codeTag: 'thinkingDefault: "minimal"',
                    level: 'medium'
                });
            }
        }

        // --- D06: Prompt Caching ---
        // PRD formula: hitRate = cacheRead / (input + cacheRead)
        const cacheHitRate = (totalInput + totalCacheRead) > 0
            ? totalCacheRead / (totalInput + totalCacheRead) : 0;

        if (cacheHitRate < 0.10) {
            // Savings = uncached input that could be cached * (inputPrice - cacheReadPrice)
            // cacheRead typically costs 10% of input price
            const cacheableInput = totalInput * 0.8; // 80% of input is system prompt / repeatable
            const cacheDiscount = 0.9; // cache reads are 90% cheaper
            const cachingSavingsAllTime = cacheableInput * inputCostPerToken * cacheDiscount;
            const cachingSavings = cachingSavingsAllTime * monthlyMultiplier;

            if (cachingSavings > 0) {
                totalMonthlySavings += cachingSavings;
                results.push({
                    actionId: 'A06',
                    title: 'Enable Prompt Caching',
                    description: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}%. ${(cacheableInput / 1000).toFixed(0)}K input tokens could be cached at 90% discount.`,
                    sideEffect: '⚠ First message per session remains full price.',
                    savings: cachingSavings,
                    savingsStr: `-$${cachingSavings.toFixed(2)}/mo`,
                    codeTag: 'cachePolicy: "aggressive"',
                    level: 'high'
                });
            }
        }

        // --- D07: Safeguard Compaction ---
        if (defaults.compaction?.mode !== 'safeguard') {
            results.push({
                actionId: 'A07',
                title: 'Enable Compaction Safeguard',
                description: 'Auto-compacts at 50K tokens to prevent extreme single-session billing.',
                sideEffect: '⚠ May truncate history during massive code translation sessions.',
                savings: 0,
                savingsStr: '🛡️ Protection',
                codeTag: 'mode: "safeguard"',
                level: 'safety'
            });
        }

        // --- D09: Output Verbosity ---
        // Precise: compare output/input ratio. Industry average is ~5-15%.
        // If > 15%, output is verbose. "Be concise" typically reduces by 30%.
        const outputRatio = totalInput > 0 ? totalOutput / totalInput : 0;
        if (outputRatio > 0.10 && totalOutput > 1000) {
            const reductionFactor = 0.30;
            const reducibleOutput = totalOutput * reductionFactor;
            const verbositySavingsAllTime = reducibleOutput * outputCostPerToken;
            const verbositySavings = verbositySavingsAllTime * monthlyMultiplier;

            if (verbositySavings > 0) {
                totalMonthlySavings += verbositySavings;
                results.push({
                    actionId: 'A09',
                    title: 'Reduce Output Verbosity',
                    description: `Output/Input ratio is ${(outputRatio * 100).toFixed(1)}% (${(totalOutput / 1000).toFixed(0)}K tokens). Concise mode cuts ~30%.`,
                    sideEffect: '⚠ Responses become visibly shorter.',
                    savings: verbositySavings,
                    savingsStr: `-$${verbositySavings.toFixed(2)}/mo`,
                    codeTag: 'SOUL.md += "Be concise"',
                    level: 'high'
                });
            }
        }

        // Sort by savings descending (protection items last)
        results.sort((a, b) => b.savings - a.savings);

        const currentMonthlyCost = totalCost * monthlyMultiplier;
        const result = {
            totalMonthlySavings,
            currentMonthlyCost,
            cacheHitRate,
            actions: results
        };

        // Cache the result
        _diagCache = result;
        _diagCacheTs = now;

        return result;
    }

    /** Invalidate cached diagnostics (e.g. after optimization applied) */
    invalidateCache() {
        _diagCache = null;
        _diagCacheTs = 0;
    }
}

module.exports = new DiagnosticsEngine();
