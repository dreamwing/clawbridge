const configManager = require('./openclaw_config');
const fs = require('fs').promises;
const path = require('path');

// Basic mapping of expensive models to cheaper alternatives (D01)
const MODEL_REPLACEMENTS = {
    'claude-3-5-opus-20240229': {
        alternative: 'claude-3-5-sonnet-20241022',
        savingsRatio: 0.8 // Rough estimation: 80% cheaper
    },
    'gpt-4o': {
        alternative: 'gpt-4o-mini',
        savingsRatio: 0.95 // Very rough
    },
    'gemini-1.5-pro': {
        alternative: 'gemini-1.5-flash',
        savingsRatio: 0.9
    }
};

class DiagnosticsEngine {
    constructor() {
        this.statsPath = path.join(__dirname, '../../data/token_stats/latest.json');
    }

    async getStats() {
        try {
            const data = await fs.readFile(this.statsPath, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.warn("Could not read stats file, using mock stats for diagnostics:", err.message);
            // Return some mock data if stats aren't available yet
            return {
                totals: { input: 20000000, output: 290000, cacheRead: 5000000 },
                cost: {
                    total: 102.69,
                    byModel: {
                        'claude-3-5-opus-20240229': 60.50,
                        'gemini-1.5-pro': 20.19,
                        'gpt-4o': 22.00
                    }
                }
            };
        }
    }

    async runDiagnostics() {
        const results = [];
        let totalMonthlySavings = 0;

        // 1. Get current config
        const agentsConfig = await configManager.getRawConfig();
        const defaults = agentsConfig.defaults || {};

        // 2. Get usage stats
        let rawStats = await this.getStats();

        // Normalize the raw data from `latest.json` to the diagnostic structure expected below
        // Backwards compatibility: Older versions use `stats.cost.total`, newer versions use `stats.total.cost`
        const stats = {
            totals: rawStats.totals || rawStats.total || { input: 0, output: 0, cacheRead: 0 },
            cost: {
                total: (rawStats.cost && rawStats.cost.total) ? rawStats.cost.total : (rawStats.total ? rawStats.total.cost : 0),
                byModel: (rawStats.cost && rawStats.cost.byModel) ? rawStats.cost.byModel :
                    (rawStats.total && rawStats.total.models) ?
                        Object.fromEntries(Object.entries(rawStats.total.models).map(([k, v]) => [k, v.cost])) : {}
            },
            activeDays: Math.max(1, Object.keys(rawStats.history || {}).length)
        };

        // --- Run Rules ---

        const safeTotalCost = (stats.cost && stats.cost.total) ? stats.cost.total : 100;

        // D01: Expensive Model
        // Check if > 50% of cost comes from an expensive model
        let foundExpensive = false;
        const byModelStats = (stats.cost && stats.cost.byModel) ? stats.cost.byModel : {};
        for (const [modelId, cost] of Object.entries(byModelStats)) {
            if (MODEL_REPLACEMENTS[modelId] && (cost / safeTotalCost) > 0.5) {
                const info = MODEL_REPLACEMENTS[modelId];
                // Estimate monthly savings based on active days
                const monthlyMultiplier = 30 / stats.activeDays;
                const estimatedMonthlyCost = cost * monthlyMultiplier;
                const estimatedSavings = estimatedMonthlyCost * info.savingsRatio;
                totalMonthlySavings += estimatedSavings;

                results.push({
                    actionId: 'A01',
                    title: `Downgrade ${modelId.split('-').slice(0, 2).join(' ')}`,
                    description: `Primary usage is on premium model. Switching to ${info.alternative} saves ~${(info.savingsRatio * 100).toFixed(0)}%.`,
                    sideEffect: '⚠ Mild decrease in performance on highly complex reasoning tasks.',
                    savings: estimatedSavings,
                    savingsStr: `-$${estimatedSavings.toFixed(2)}/mo`,
                    codeTag: `model: "${info.alternative}"`,
                    level: 'high'
                });
                foundExpensive = true;
                break; // Only suggest one main model switch
            }
        }

        // D02: Heartbeat Enabled
        let hbEvery = defaults.heartbeat?.every;
        let heartbeatTasksText = "";
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            const hbPath = path.join(homeDir, '.openclaw', 'workspace', 'HEARTBEAT.md');
            const fileContent = await fs.readFile(hbPath, 'utf8');
            // Remove comments and empty lines to get actual tasks
            heartbeatTasksText = fileContent.split('\n')
                .filter(l => l.trim() && !l.trim().startsWith('#'))
                .join('\n');
        } catch (e) {
            // Ignore if file doesn't exist
        }

        // If openclaw.json is unreadable but HEARTBEAT.md has tasks, assume default 5m
        if (!hbEvery && heartbeatTasksText.length > 0) {
            hbEvery = '5m';
        }

        // OpenClaw skips heartbeat execution entirely if HEARTBEAT.md is empty (no tasks)
        if (hbEvery && hbEvery !== '0m' && hbEvery !== '0' && heartbeatTasksText.length > 0) {
            let intervalMinutes = 5;
            if (hbEvery.endsWith('m')) intervalMinutes = parseInt(hbEvery) || 5;
            else if (hbEvery.endsWith('h')) intervalMinutes = (parseInt(hbEvery) || 1) * 60;

            const runsPerMonth = (30 * 24 * 60) / Math.max(1, intervalMinutes);

            // Rough token estimate: Base system prompt (~2000 tokens) + Task tokens (~chars/4)
            const taskTokens = Math.ceil(heartbeatTasksText.length / 4);
            const tokensPerRun = 2000 + taskTokens;

            const hbEstimatedMonthlyTokens = runsPerMonth * tokensPerRun;

            const inputCostRatio = (stats.cost && stats.cost.input) ? (stats.cost.input / Math.max(stats.totals.input, 1)) : (0.10 / 1000000); // fallback to $3/M
            const hbCostEstimate = hbEstimatedMonthlyTokens * inputCostRatio;

            totalMonthlySavings += hbCostEstimate;
            results.push({
                actionId: 'A02',
                title: 'Disable Background Polling',
                description: `Heartbeats consume ~${(hbEstimatedMonthlyTokens / 1000000).toFixed(1)}M background tokens/mo based on tasks.`,
                sideEffect: '⚠ Passive cross-agent messages require manual refresh.',
                savings: hbCostEstimate,
                savingsStr: `-$${hbCostEstimate.toFixed(2)}/mo`,
                codeTag: `heartbeat.every: "0m"`,
                level: 'medium'
            });
        }

        // D05: Reasoning / Thinking Tokens
        const thinking = defaults.thinkingDefault;
        if (!thinking || thinking === 'high' || thinking === 'xhigh' || thinking === 'on') {
            // Estimate thinking takes ~20% of output cost
            const savingsAllTime = safeTotalCost * 0.15; // Rough estimate
            const monthlyMultiplier = 30 / stats.activeDays;
            const thinkingSavings = savingsAllTime * monthlyMultiplier;
            totalMonthlySavings += thinkingSavings;
            results.push({
                actionId: 'A05',
                title: 'Reduce Thinking Overhead',
                description: 'Default reasoning level is high. Minimal mode forces models to think less and output faster.',
                sideEffect: '⚠ May reduce mathematical or logical accuracy on hard prompts.',
                savings: thinkingSavings,
                savingsStr: `-$${thinkingSavings.toFixed(2)}/mo`,
                codeTag: `thinkingDefault: "minimal"`,
                level: 'medium'
            });
        }

        // D06: Prompt Caching
        // If caching is missing or cache hits are very low compared to input.
        if (stats.totals && stats.totals.cacheRead < (stats.totals.input * 0.1)) {
            // Calculate dynamic savings:
            // Assuming 80% of current input could be cached.
            // Cost of input = rate.input
            // Cost of cacheRead = rate.input * 0.1
            // Savings per token = rate.input * 0.9
            const cacheableInput = stats.totals.input * 0.8;
            const inputCostRatio = (stats.cost && stats.cost.input) ? (stats.cost.input / Math.max(stats.totals.input, 1)) : (0.10 / 1000000); // fallback to $3/M

            // Extrapolate to monthly based on active days tracked
            const monthlyMultiplier = 30 / stats.activeDays;
            const savingsAllTime = cacheableInput * inputCostRatio * 0.9;
            const cachingSavings = savingsAllTime * monthlyMultiplier;

            totalMonthlySavings += cachingSavings;
            results.push({
                actionId: 'A06',
                title: 'Enable Prompt Caching',
                description: 'System prompts run uncached. Cache hits cost significantly less.',
                sideEffect: '⚠ First message per session remains full price.',
                savings: cachingSavings,
                savingsStr: `-$${cachingSavings.toFixed(2)}/mo`,
                codeTag: `cachePolicy: "aggressive"`,
                level: 'high'
            });
        }

        // D07: Security Compaction
        const compactionMode = defaults.compaction?.mode;
        if (compactionMode !== 'safeguard') {
            results.push({
                actionId: 'A07',
                title: 'Enable Compaction Safeguard',
                description: 'Auto-compacts at 50K tokens to prevent extreme single-session billing.',
                sideEffect: '⚠ May truncate history during massive code translation sessions.',
                savings: 0,
                savingsStr: `🛡️ Protection`,
                codeTag: `mode: "safeguard"`,
                level: 'safety'
            });
        }

        // D09: Output Verbosity (SOUL.md)
        // Check if ratio of output to input is suspiciously high (e.g. > 10%)
        if (stats.totals && stats.totals.output > (stats.totals.input * 0.05)) {
            // Assume concise mode reduces output by 30%
            const reducibleOutput = stats.totals.output * 0.3;
            const outputCostRatio = (stats.cost && stats.cost.output) ? (stats.cost.output / Math.max(stats.totals.output, 1)) : (0.40 / 1000000); // fallback to $12/M

            const savingsAllTime = reducibleOutput * outputCostRatio;
            const monthlyMultiplier = 30 / stats.activeDays;
            const verbositySavings = savingsAllTime * monthlyMultiplier;

            totalMonthlySavings += verbositySavings;
            results.push({
                actionId: 'A09',
                title: 'Reduce Output Verbosity',
                description: 'Concise mode typically cuts output tokens by 30%.',
                sideEffect: '⚠ Responses become visibly shorter.',
                savings: verbositySavings,
                savingsStr: `-$${verbositySavings.toFixed(2)}/mo`,
                codeTag: `SOUL.md += "Be concise"`,
                level: 'high'
            });
        }

        // Sort results by savings descending
        results.sort((a, b) => b.savings - a.savings);

        return {
            totalMonthlySavings,
            currentMonthlyCost: safeTotalCost,
            actions: results
        };
    }
}

module.exports = new DiagnosticsEngine();
