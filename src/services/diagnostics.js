const configManager = require('./openclaw_config');
const pricingService = require('./pricing');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

// Cache for diagnostic results (60s TTL)
let _diagCache = null;
let _diagCacheTs = 0;
const DIAG_CACHE_TTL = 60000;

class DiagnosticsEngine {
    constructor() {
        this.statsPath = path.join(__dirname, '../../data/token_stats/latest.json');
        this.thresholdsPath = path.join(__dirname, '../../data/diagnostics.config.json');
        this._thresholds = null;
    }

    /**
     * Load custom thresholds from diagnostics.config.json.
     * Falls back to defaults if file doesn't exist.
     */
    async _getThresholds() {
        if (this._thresholds) return this._thresholds;
        const defaults = {
            D01_modelCostRatio: 0.5,        // trigger if single model > 50% of total cost
            D06_cacheHitRateMin: 0.10,       // trigger if cache hit rate < 10%
            D06_cacheableRatio: 0.80,        // assume 80% of input is cacheable
            D09_outputRatioThreshold: 0.10,  // trigger if output/input > 10%
            D09_minOutputTokens: 1000,       // minimum output tokens to trigger
            D09_reductionFactor: 0.30,       // concise mode reduces output by 30%
            D05_thinkingProportion: 0.40,    // 40% of output is thinking
            D05_reductionRatio: 0.75         // minimal mode cuts thinking by 75%
        };
        try {
            const data = await fs.readFile(this.thresholdsPath, 'utf8');
            this._thresholds = { ...defaults, ...JSON.parse(data) };
        } catch (_e) {
            this._thresholds = defaults;
        }
        return this._thresholds;
    }

    async getStats() {
        try {
            const data = await fs.readFile(this.statsPath, 'utf8');
            return JSON.parse(data);
        } catch (_err) {
            // No stats available — return zeroed structure, never fake data
            return {
                totals: { input: 0, output: 0, cacheRead: 0 },
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

        // Load threshold config (custom or defaults)
        const thresholds = await this._getThresholds();

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
        const MODEL_REPLACEMENTS = await pricingService.getReplacements();
        const byModelStats = stats.cost.byModel;
        for (const [modelId, cost] of Object.entries(byModelStats)) {
            if (totalCost > 0 && MODEL_REPLACEMENTS[modelId] && (cost / totalCost) > thresholds.D01_modelCostRatio) {
                const info = MODEL_REPLACEMENTS[modelId];
                const estimatedSavings = cost * monthlyMultiplier * info.savingsRatio;
                totalMonthlySavings += estimatedSavings;


                results.push({
                    actionId: 'A01',
                    title: `Downgrade ${modelId.split('-').slice(0, 2).join(' ')}`,
                    plainTitle: 'Switch to a cheaper AI model',
                    helpText: 'AI models come in different tiers. Premium models are smarter but cost more per message. This switches to a model that\'s almost as good but significantly cheaper.',
                    description: `Primary usage is on premium model. Switching to ${info.alternative} saves ~${(info.savingsRatio * 100).toFixed(0)}%.`,
                    sideEffect: '⚠ Mild decrease in performance on highly complex reasoning tasks.',
                    plainSideEffect: 'Complex math or logic problems might get slightly less accurate answers.',
                    savings: estimatedSavings,
                    savingsStr: `-$${estimatedSavings.toFixed(2)}/mo`,
                    codeTag: `model: "${info.alternative}"`,
                    calcDetail: `${modelId}: $${cost.toFixed(2)} (${((cost / totalCost) * 100).toFixed(0)}% of total) × ${info.savingsRatio} ratio × ${monthlyMultiplier.toFixed(1)}x monthly`,
                    configDiff: { key: 'agents.defaults.model', from: modelId, to: info.alternative },
                    level: 'high',
                    _meta: { alternative: info.alternative }
                });
                // Intentional: only flag the top expensive model to keep recommendation
                // actionable (one model switch at a time). Additional models below the
                // threshold are not flagged.
                break;
            }
        }

        // --- D02: Heartbeat Optimization ---
        let hbEvery = defaults.heartbeat?.every;
        let heartbeatTasksText = '';
        try {
            const homeDir = config.resolveHomeDir();
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
                { label: 'Every 6 hours', value: '6h', minutes: 360 },
                { label: 'Every 12 hours', value: '12h', minutes: 720 },
                { label: 'Every 24 hours', value: '24h', minutes: 1440 },
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
                plainTitle: 'Reduce background checking frequency',
                helpText: '“心跳”是 AI 的后台自动刷新。就像手机后台同步邮件一样，每次刷新都会消耗少量 Token。降低频率可以让 AI 减少唤醒次数，从而通过延长“深度睡眠”来节省大量闲置成本。',
                description: `Running every ${hbEvery} with ${taskCount} task${taskCount > 1 ? 's' : ''}, consuming ~${(currentMonthlyTokens / 1000000).toFixed(1)}M tokens/mo ($${currentMonthlyCostHB.toFixed(2)}/mo).`,
                sideEffect: '⚠ Longer intervals delay cross-agent message delivery.',
                plainSideEffect: 'Your AI agent will check for updates less often. You may need to manually refresh for new messages.',
                savings: maxSavings,
                savingsStr: `-$${maxSavings.toFixed(2)}/mo`,
                codeTag: 'heartbeat.every',
                calcDetail: `${taskCount} task(s) × ${tokensPerRun} tok/run × ${currentRunsPerMonth.toFixed(0)} runs/mo × $${(hbCostPerToken * 1000000).toFixed(2)}/M`,
                configDiff: { key: 'heartbeat.every', from: hbEvery, to: 'your choice' },
                level: 'medium',
                options,
                currentInterval: hbEvery,
                _meta: { type: 'heartbeat-interval' }
            });
        }

        // --- D03: Session Reset Pattern ---
        // If average tokens per session is very low (<5K) but many sessions, user may be
        // creating new conversations instead of continuing — wasting context loading tokens.
        const historyDays = Object.values(rawStats.history || {});
        if (historyDays.length > 0) {
            const totalSessions = historyDays.reduce((sum, day) => sum + (day.sessions || day.count || 1), 0);
            const avgTokensPerSession = (totalInput + totalOutput) / Math.max(1, totalSessions);
            const avgSessionsPerDay = totalSessions / stats.activeDays;

            if (avgTokensPerSession < 5000 && avgSessionsPerDay > 5) {
                // Wasted context = sessions × system prompt load (~1000 tokens) × input cost
                const wastedContextTokens = totalSessions * 1000;
                const contextWasteSavings = wastedContextTokens * inputCostPerToken * monthlyMultiplier * 0.5; // 50% reduction if users continue sessions

                if (contextWasteSavings > 0.1) {
                    totalMonthlySavings += contextWasteSavings;
                    results.push({
                        actionId: 'A03',
                        title: 'Reduce Session Resets',
                        plainTitle: 'Continue existing conversations instead of starting new ones',
                        helpText: 'Every new conversation loads the full system prompt and context from scratch. Continuing an existing conversation reuses what\'s already loaded, saving input tokens.',
                        description: `~${avgSessionsPerDay.toFixed(0)} sessions/day with only ${(avgTokensPerSession / 1000).toFixed(1)}K tokens each. Many short sessions waste context loading costs.`,
                        sideEffect: '⚠ Longer conversations may eventually need compaction.',
                        plainSideEffect: 'Longer conversations might slow down slightly as they grow, but cost much less overall.',
                        savings: contextWasteSavings,
                        savingsStr: `-$${contextWasteSavings.toFixed(2)}/mo`,
                        codeTag: 'session.resumeDefault: true',
                        calcDetail: `${totalSessions} sessions × 1K prompt tokens × $${(inputCostPerToken * 1000000).toFixed(2)}/M × 50% reduction × ${monthlyMultiplier.toFixed(1)}x`,
                        configDiff: { key: 'session.resumeDefault', from: 'false', to: 'true' },
                        level: 'medium'
                    });
                }
            }
        }

        // --- D04: Idle Skill Detection (Granular) ---
        // Reference: openclaw/src/agents/skills/workspace.ts loadSkillEntries()
        // Skills are loaded from 6 sources (precedence: extra < bundled < managed < personal-agents < project-agents < workspace).
        // For idle detection, we only scan "managed" skills (user-installed via `openclaw skills install`).
        // Managed dir: CONFIG_DIR/skills = (OPENCLAW_STATE_DIR || ~/.openclaw)/skills
        // A valid skill folder must contain SKILL.md.
        try {
            const configDir = config.resolveConfigDir();
            const managedSkillsDir = path.join(configDir, 'skills');
            const entries = await fs.readdir(managedSkillsDir, { withFileTypes: true });

            // Match OpenClaw's listChildDirectories: skip dotfiles, handle symlinks
            const skillFolders = [];
            for (const e of entries) {
                if (e.name.startsWith('.') || e.name === 'node_modules') continue;
                const fullPath = path.join(managedSkillsDir, e.name);
                let isDir = e.isDirectory();
                if (!isDir && e.isSymbolicLink()) {
                    try { isDir = (await fs.stat(fullPath)).isDirectory(); } catch { continue; }
                }
                if (!isDir) continue;
                // Must contain SKILL.md to be a valid Skill
                try { await fs.access(path.join(fullPath, 'SKILL.md')); } catch { continue; }
                skillFolders.push({ name: e.name, path: fullPath });
            }

            const idleDaysThreshold = thresholds.D04_idleDaysThreshold || 7;
            const quietDaysThreshold = 3;
            const now = Date.now();

            const idleSkills = [];  // >7d — strongly recommend removal
            const quietSkills = []; // >3d but ≤7d — listed for user to decide

            for (const folder of skillFolders) {
                try {
                    const folderPath = folder.path;
                    const stat = await fs.stat(folderPath);
                    const daysSince = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);

                    if (daysSince > idleDaysThreshold) {
                        idleSkills.push({ name: folder.name, daysSince: Math.floor(daysSince) });
                    } else if (daysSince > quietDaysThreshold) {
                        quietSkills.push({ name: folder.name, daysSince: Math.floor(daysSince) });
                    }
                } catch (_statErr) {
                    // Skip unreadable folders
                }
            }

            if (idleSkills.length > 0 || quietSkills.length > 0) {
                const totalIdleCount = idleSkills.length + quietSkills.length;
                // Each Skill adds ~750 tokens to system prompt per session
                const totalSessions = historyDays.reduce((sum, day) => sum + (day.sessions || day.count || 1), 0);
                const idleTokenWaste = totalIdleCount * 750;
                const skillWasteSavings = idleTokenWaste * totalSessions * inputCostPerToken * monthlyMultiplier;

                // Build description with specific skill names
                const idleNames = idleSkills.map(s => `${s.name} (${s.daysSince}d)`).join(', ');
                const quietNames = quietSkills.map(s => `${s.name} (${s.daysSince}d)`).join(', ');
                let descParts = [];
                if (idleSkills.length > 0) descParts.push(`Idle >7d: ${idleNames}`);
                if (quietSkills.length > 0) descParts.push(`Quiet >3d: ${quietNames}`);

                totalMonthlySavings += skillWasteSavings;
                results.push({
                    actionId: 'A04',
                    title: `Review ${totalIdleCount} Unused Skills`,
                    plainTitle: 'Remove AI add-ons you haven\'t used recently',
                    helpText: '扩展技能就像是给 AI 加装的“插件”。哪怕你这次对话不用它们，AI 也会把它们加载到大脑里准备着，这导致每一句话的“起步价”都变贵了。移除不常用的插件能让 AI 快速、低成本地投入工作。',
                    description: descParts.join('. ') + '.',
                    sideEffect: '⚠ Removed Skills will no longer be available until re-installed.',
                    plainSideEffect: 'The AI will lose specific abilities for any Skills you remove. You can always re-install them later.',
                    savings: skillWasteSavings,
                    savingsStr: skillWasteSavings > 0 ? `-$${skillWasteSavings.toFixed(2)}/mo` : '🛡️ Review',
                    codeTag: `${idleSkills.length} idle, ${quietSkills.length} quiet`,
                    calcDetail: `${totalIdleCount} unused × 750 tok/session × ${totalSessions} sessions × $${(inputCostPerToken * 1000000).toFixed(2)}/M × ${monthlyMultiplier.toFixed(1)}x`,
                    configDiff: { key: 'skills', from: `${skillFolders.length} installed`, to: `remove ${totalIdleCount} unused` },
                    level: totalIdleCount > 0 ? 'medium' : 'low',
                    _meta: {
                        type: 'skill-audit',
                        idleSkills,
                        quietSkills,
                        totalInstalled: skillFolders.length
                    }
                });
            }
        } catch (_e) {
            // Skills dir not found — skip D04
        }

        // --- D05: Thinking Token Overhead ---
        const thinking = defaults.thinkingDefault;
        // Only trigger when user has explicitly configured a high-cost thinking mode.
        // Skip when undefined (not configured) to avoid noise for new users.
        if (thinking === 'high' || thinking === 'xhigh' || thinking === 'on') {
            // Precise: thinking tokens are output tokens that the model generates internally.
            // With "high" thinking, ~40% of output goes to reasoning. Minimal reduces this by ~75%.
            // Savings = outputTokens * thinkingProportion * reductionRatio * outputCostPerToken
            const thinkingProportion = thresholds.D05_thinkingProportion;
            const reductionRatio = thresholds.D05_reductionRatio;
            const thinkingSavingsAllTime = totalOutput * thinkingProportion * reductionRatio * outputCostPerToken;
            const thinkingSavings = thinkingSavingsAllTime * monthlyMultiplier;

            if (thinkingSavings > 0) {
                totalMonthlySavings += thinkingSavings;
                results.push({
                    actionId: 'A05',
                    title: 'Reduce Thinking Overhead',
                    plainTitle: 'Make the AI think less before answering',
                    helpText: 'AI models can "think" before responding — like showing their work on a math problem. This uses extra tokens. Minimal mode skips most internal reasoning to save costs.',
                    description: `~${(totalOutput * thinkingProportion / 1000).toFixed(0)}K output tokens spent on reasoning. Minimal mode cuts this by ${(reductionRatio * 100).toFixed(0)}%.`,
                    sideEffect: '⚠ May reduce mathematical or logical accuracy on hard prompts.',
                    plainSideEffect: 'The AI might make more mistakes on tricky math or logic questions.',
                    savings: thinkingSavings,
                    savingsStr: `-$${thinkingSavings.toFixed(2)}/mo`,
                    codeTag: 'thinkingDefault: "minimal"',
                    calcDetail: `${(totalOutput / 1000).toFixed(0)}K output × ${(thinkingProportion * 100)}% thinking × ${(reductionRatio * 100)}% cut × $${(outputCostPerToken * 1000000).toFixed(2)}/M × ${monthlyMultiplier.toFixed(1)}x`,
                    configDiff: { key: 'thinkingDefault', from: thinking || 'high', to: 'minimal' },
                    level: 'medium'
                });
            }
        }

        // --- D06: Prompt Caching ---
        // PRD formula: hitRate = cacheRead / (input + cacheRead)
        const cacheHitRate = (totalInput + totalCacheRead) > 0
            ? totalCacheRead / (totalInput + totalCacheRead) : 0;

        if (cacheHitRate < thresholds.D06_cacheHitRateMin) {
            const cacheableInput = totalInput * thresholds.D06_cacheableRatio;
            const cacheDiscount = 0.9; // cache reads are 90% cheaper
            const cachingSavingsAllTime = cacheableInput * inputCostPerToken * cacheDiscount;
            const cachingSavings = cachingSavingsAllTime * monthlyMultiplier;

            if (cachingSavings > 0) {
                totalMonthlySavings += cachingSavings;
                results.push({
                    actionId: 'A06',
                    title: 'Enable Prompt Caching',
                    plainTitle: 'Turn on memory for repeated prompts',
                    helpText: '每一轮对话都要发送重复的“说明书”。缓存就像是给 AI 准备的高速书签，它能快速找回已经读过的内容而不需要你再次付钱让它重读一遍。',
                    description: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}%. ${(cacheableInput / 1000).toFixed(0)}K input tokens could be cached at 90% discount.`,
                    sideEffect: '⚠ First message per session remains full price.',
                    plainSideEffect: 'The first question in each conversation costs the same. Savings kick in from the second question onwards.',
                    savings: cachingSavings,
                    savingsStr: `-$${cachingSavings.toFixed(2)}/mo`,
                    codeTag: 'cachePolicy: "aggressive"',
                    calcDetail: `${(cacheableInput / 1000).toFixed(0)}K cacheable × $${(inputCostPerToken * 1000000).toFixed(2)}/M × 90% discount × ${monthlyMultiplier.toFixed(1)}x`,
                    configDiff: { key: 'contextPruning.mode', from: 'none', to: 'cache-ttl' },
                    level: 'high'
                });
            }
        }

        // --- D07: Safeguard Compaction ---
        if (defaults.compaction?.mode !== 'safeguard') {
            const currentCompMode = defaults.compaction?.mode || 'off';
            results.push({
                actionId: 'A07',
                title: 'Enable Compaction Safeguard',
                plainTitle: 'Auto-trim long conversations to save money',
                helpText: '极长的对话可能会产生数倍于平时的巨额账单。自动压缩就像是“保险丝”，在费用失控前及时截断并总结历史，防止产生数万 Token 的意外扣费。',
                description: 'Auto-compacts at 50K tokens to prevent extreme single-session billing.',
                sideEffect: '⚠ May truncate history during massive code translation sessions.',
                plainSideEffect: 'Very long conversations may lose some early messages to keep costs down.',
                savings: 0,
                savingsStr: '🛡️ Protection',
                codeTag: 'mode: "safeguard"',
                configDiff: { key: 'compaction.mode', from: currentCompMode, to: 'safeguard' },
                level: 'safety'
            });
        }

        // --- D09: Output Verbosity ---
        // Precise: compare output/input ratio. Industry average is ~5-15%.
        // If > 15%, output is verbose. "Be concise" typically reduces by 30%.
        const outputRatio = totalInput > 0 ? totalOutput / totalInput : 0;
        if (outputRatio > thresholds.D09_outputRatioThreshold && totalOutput > thresholds.D09_minOutputTokens) {
            const reductionFactor = thresholds.D09_reductionFactor;
            const reducibleOutput = totalOutput * reductionFactor;
            const verbositySavingsAllTime = reducibleOutput * outputCostPerToken;
            const verbositySavings = verbositySavingsAllTime * monthlyMultiplier;

            if (verbositySavings > 0) {
                totalMonthlySavings += verbositySavings;
                results.push({
                    actionId: 'A09',
                    title: 'Reduce Output Verbosity',
                    plainTitle: 'Ask the AI to give shorter answers',
                    helpText: 'AI responses include explanations, examples, and formatting. "Concise mode" tells the AI to skip the fluff and give direct answers — saving output tokens.',
                    description: `Output/Input ratio is ${(outputRatio * 100).toFixed(1)}% (${(totalOutput / 1000).toFixed(0)}K tokens). Concise mode cuts ~30%.`,
                    sideEffect: '⚠ Responses become visibly shorter.',
                    plainSideEffect: 'The AI will give you more concise answers — less explanation, more action.',
                    savings: verbositySavings,
                    savingsStr: `-$${verbositySavings.toFixed(2)}/mo`,
                    codeTag: 'SOUL.md += "Be concise"',
                    calcDetail: `${(totalOutput / 1000).toFixed(0)}K output × 30% cut × $${(outputCostPerToken * 1000000).toFixed(2)}/M × ${monthlyMultiplier.toFixed(1)}x`,
                    configDiff: { key: 'SOUL.md', from: '(current)', to: 'append: "Be concise."' },
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

        // Attach raw data for verbose API export (advanced users)
        result._rawData = {
            activeDays: stats.activeDays,
            totalCost,
            monthlyMultiplier,
            totalInput,
            totalOutput,
            totalCacheRead,
            inputCostPerToken,
            outputCostPerToken,
            byModel: stats.cost.byModel,
            thresholds
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
        this._thresholds = null;
    }
}

module.exports = new DiagnosticsEngine();
