const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { resolveHomeDir } = require('../src/utils/paths');

// --- Config ---
const DATA_DIR = path.join(__dirname, '../data/token_stats');
const CONFIG_DIR = path.join(__dirname, '../data/config');
const PRICING_FILE = path.join(CONFIG_DIR, 'pricing.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'latest.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

// Cache retention: prune messages older than this many days
const CACHE_MAX_DAYS = 90;

// --- Timezone ---
const APP_TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function getLocalDate(date = new Date()) {
    return date.toLocaleString('en-CA', { timeZone: APP_TIMEZONE }).split(',')[0].trim();
}

// --- Pricing ---
let COST_MAP = { 'default': { input: 0.10, output: 0.40 } };
if (fs.existsSync(PRICING_FILE)) {
    try {
        COST_MAP = { ...COST_MAP, ...JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8')) };
    } catch (e) { console.warn('[Analyzer] Failed to load pricing file:', e.message); }
}

// [P1 Fix] Model alias map: provider-native model names → pricing.json keys.
const MODEL_ALIAS_MAP = {
    // Google Antigravity / Gemini CLI
    'gemini-3-pro-high': 'google/gemini-3-pro-preview',
    'gemini-3-pro-low': 'google/gemini-3-pro-preview',
    'gemini-3-pro-preview': 'google/gemini-3-pro-preview',
    'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
    'gemini-3-pro-image-preview': 'google/gemini-3-pro-image-preview',
    'gemini-3.1-pro-preview': 'google/gemini-3.1-pro-preview',
    'gemini-2.5-pro': 'google/gemini-2.5-pro',
    'gemini-2.5-pro-preview': 'google/gemini-2.5-pro-preview',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
    // Anthropic direct
    'claude-sonnet-4.6': 'anthropic/claude-sonnet-4.6',
    'claude-sonnet-4.5': 'anthropic/claude-sonnet-4.5',
    'claude-opus-4.6': 'anthropic/claude-opus-4.6',
    'claude-opus-4.5': 'anthropic/claude-opus-4.5',
    'claude-opus-4.1': 'anthropic/claude-opus-4.1',
    'claude-haiku-4.5': 'anthropic/claude-haiku-4.5',
    // OpenAI direct
    'gpt-5': 'openai/gpt-5',
    'gpt-5-mini': 'openai/gpt-5-mini',
    'gpt-5-chat': 'openai/gpt-5-chat',
    'gpt-5-codex': 'openai/gpt-5-codex',
    'gpt-5.1': 'openai/gpt-5.1',
    'gpt-5.1-codex': 'openai/gpt-5.1-codex',
    'gpt-5.2': 'openai/gpt-5.2',
    'gpt-5.2-codex': 'openai/gpt-5.2-codex',
    'o3-pro': 'openai/o3-pro',
    // DeepSeek
    'deepseek-v3.2': 'deepseek/deepseek-v3.2',
    'deepseek-v3.1': 'deepseek/deepseek-chat-v3.1',
    'deepseek-r1-0528': 'deepseek/deepseek-r1-0528',
    // ZAI / GLM
    'glm-4.7': 'z-ai/glm-4.7',
    'glm-4.7-flash': 'z-ai/glm-4.7-flash',
    'glm-5': 'z-ai/glm-5',
    'glm-4.5': 'z-ai/glm-4.5',
    'glm-4.6': 'z-ai/glm-4.6',
    // Moonshot / Kimi
    'kimi-k2.5': 'moonshotai/kimi-k2.5',
    'kimi-k2': 'moonshotai/kimi-k2',
};

// Sort model keys longest-first for most specific match
const COST_MAP_KEYS = Object.keys(COST_MAP)
    .filter(k => k !== 'default')
    .sort((a, b) => b.length - a.length);

function resolveModelPricingKey(model) {
    if (!model) return 'default';
    // 1. Direct alias lookup
    if (MODEL_ALIAS_MAP[model]) {
        const aliased = MODEL_ALIAS_MAP[model];
        if (COST_MAP[aliased]) return aliased;
    }
    // 2. Exact match in COST_MAP
    if (COST_MAP[model]) return model;
    // 3. Partial match (optimized logic): pricing key is substring of model name, sorted by length
    const partialKey = COST_MAP_KEYS.find(k => model.includes(k));
    if (partialKey) return partialKey;

    // 4. Reverse partial: model name is substring of pricing key
    const reverseKey = Object.keys(COST_MAP).find(
        k => k !== 'default' && k !== 'updatedAt' && k.includes(model)
    );
    if (reverseKey) return reverseKey;

    return 'default';
}

function calcCost(model, input, output, cacheRead = 0, cacheWrite = 0) {
    const key = resolveModelPricingKey(model);
    const rate = COST_MAP[key];
    const cacheReadRate = rate.cacheRead || (rate.input * 0.10);
    const cacheWriteRate = rate.cacheWrite || (rate.input * 1.25);
    return (input / 1000000 * rate.input) +
        (output / 1000000 * rate.output) +
        (cacheRead / 1000000 * cacheReadRate) +
        (cacheWrite / 1000000 * cacheWriteRate);
}

// --- Path Discovery ---

// Scan multiple possible locations for session JSONL files
function discoverSessionFiles() {
    const HOME_DIR = resolveHomeDir();
    const searchDirs = [];

    // 1. New multi-agent path: ~/.openclaw/agents/*/sessions/
    const agentsDir = path.join(HOME_DIR, '.openclaw/agents');
    if (fs.existsSync(agentsDir)) {
        try {
            const agents = fs.readdirSync(agentsDir);
            for (const agent of agents) {
                const sessDir = path.join(agentsDir, agent, 'sessions');
                if (fs.existsSync(sessDir)) searchDirs.push(sessDir);
            }
        } catch (e) { console.debug('[Analyzer] Cannot read agents directory:', e.message); }
    }

    // 2. Legacy flat path: ~/.openclaw/sessions/
    const flatSessions = path.join(HOME_DIR, '.openclaw/sessions');
    if (fs.existsSync(flatSessions)) searchDirs.push(flatSessions);

    // 3. Legacy clawdbot path: ~/.clawdbot/agents/main/sessions/
    const legacyPath = path.join(HOME_DIR, '.clawdbot/agents/main/sessions');
    if (fs.existsSync(legacyPath)) searchDirs.push(legacyPath);

    // Deduplicate directories (in case paths overlap)
    const uniqueDirs = [...new Set(searchDirs.map(d => fs.realpathSync(d)))];

    // Collect all .jsonl files, excluding .deleted.
    const allFiles = [];
    for (const dir of uniqueDirs) {
        try {
            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'));
            for (const f of files) {
                allFiles.push(path.join(dir, f));
            }
        } catch (e) { console.debug('[Analyzer] Cannot read session directory:', dir, e.message); }
    }

    return allFiles;
}

// --- Parse Timestamp to Local Date ---
function getDateFromEntry(entry) {
    // Priority 1: Top-level timestamp (ISO 8601)
    if (entry.timestamp) {
        const d = new Date(entry.timestamp);
        if (!isNaN(d.getTime())) return getLocalDate(d);
    }
    // Priority 2: message.timestamp (epoch ms)
    if (entry.message && entry.message.timestamp) {
        const d = new Date(entry.message.timestamp);
        if (!isNaN(d.getTime())) return getLocalDate(d);
    }
    // Priority 3: top-level time field
    if (entry.time) {
        const d = new Date(entry.time);
        if (!isNaN(d.getTime())) return getLocalDate(d);
    }
    return 'unknown';
}

// --- Process Single File (Stream-based, per-message granularity) ---
// Returns an array of per-message result objects
function processFile(filePath, startOffset = 0) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, {
            encoding: 'utf8',
            start: startOffset
        });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        const messages = [];
        let bytesRead = startOffset;
        let isFirstLine = startOffset > 0;

        rl.on('line', (line) => {
            // Track byte position (line + newline)
            bytesRead += Buffer.byteLength(line, 'utf8') + 1;

            // Skip first partial line when resuming from offset mid-file
            if (isFirstLine) {
                isFirstLine = false;
                // If starting from a non-zero offset, the first line may be partial JSON.
                // Try to parse it; if it fails, skip it safely.
                try {
                    JSON.parse(line);
                } catch (e) {
                    return; // Skip partial line
                }
            }

            try {
                const entry = JSON.parse(line);

                // Filter 1: type must be 'message'
                if (entry.type !== 'message') return;

                // Filter 2: role must be 'assistant'
                const msg = entry.message;
                if (!msg || msg.role !== 'assistant') return;

                // Extract usage
                const usage = entry.usage || msg.usage;
                if (!usage) return;

                const input = usage.input || usage.inputTokens || 0;
                const output = usage.output || usage.outputTokens || 0;
                const totalTokens = usage.totalTokens || 0;

                // Filter 3: usage must be > 0
                if ((input + output + totalTokens) === 0) return;

                const cacheRead = usage.cacheRead || 0;
                const cacheWrite = usage.cacheWrite || 0;

                // Extract model (per-message)
                const model = entry.model || msg.model || 'unknown';

                // Skip delivery-mirror virtual messages
                if (model.includes('delivery-mirror')) return;

                // Extract date from message timestamp
                const dateStr = getDateFromEntry(entry);

                // Extract cost (per-message)
                let cost = 0;
                if (usage.cost && typeof usage.cost.total === 'number') {
                    cost = usage.cost.total;
                } else {
                    // Fallback: calculate from pricing map for this single message
                    cost = calcCost(model, input, output, cacheRead, cacheWrite);
                }

                messages.push({
                    date: dateStr,
                    model,
                    input,
                    output,
                    cacheRead,
                    cacheWrite,
                    cost
                });
            } catch (e) { /* expected: not all JSONL lines are valid JSON */ }
        });

        rl.on('close', () => {
            resolve({ messages, bytesRead });
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

// --- Prune old messages from cache ---
function pruneCacheMessages(messages) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_DAYS);
    const cutoffStr = getLocalDate(cutoffDate);

    return messages.filter(msg => {
        if (msg.date === 'unknown') return false;
        return msg.date >= cutoffStr; // String comparison works for YYYY-MM-DD
    });
}

// --- Main Analysis ---
async function analyze() {
    const allFiles = discoverSessionFiles();

    if (allFiles.length === 0) {
        const emptyData = {
            updatedAt: new Date().toISOString(),
            timezone: APP_TIMEZONE,
            today: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
            total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, models: {} },
            history: {},
            topModels: [],
            recentCosts: { last7dAvg: 0, last30dAvg: 0 },
        };
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emptyData, null, 2));
        return;
    }

    // Load cache
    let cache = {};
    try {
        if (fs.existsSync(CACHE_FILE)) {
            cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch (e) { console.debug('[Analyzer] No cache file found or invalid cache:', e.message); }

    const newCache = {};

    // Per-file processing with incremental support
    for (const filePath of allFiles) {
        const cacheKey = filePath; // Use full path as cache key

        try {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;

            const cached = cache[cacheKey];

            if (cached && cached.fileSize === fileSize) {
                // File unchanged — reuse cached messages (but prune old ones)
                newCache[cacheKey] = {
                    ...cached,
                    messages: pruneCacheMessages(cached.messages || []),
                };
            } else if (cached && fileSize > cached.fileSize && cached.byteOffset <= fileSize) {
                // File grew — incremental parse from last offset
                const { messages: newMsgs, bytesRead } = await processFile(filePath, cached.byteOffset);
                const allMsgs = [...(cached.messages || []), ...newMsgs];
                newCache[cacheKey] = {
                    fileSize,
                    byteOffset: bytesRead,
                    messages: pruneCacheMessages(allMsgs),
                };
            } else {
                // File is new, shrunk, or cache invalid — full parse
                const { messages, bytesRead } = await processFile(filePath, 0);
                newCache[cacheKey] = {
                    fileSize,
                    byteOffset: bytesRead,
                    messages: pruneCacheMessages(messages),
                };
            }
        } catch (e) { console.warn('[Analyzer] Error processing file:', filePath, e.message); }
    }

    // --- Aggregation (from all cached messages) ---
    const history = {};
    const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, models: {} };
    // [P4 Fix] Track which sessions (JSONL files) contributed to each day
    const sessionsByDay = {}; // { 'YYYY-MM-DD': Set<cacheKey> }

    for (const cacheKey of Object.keys(newCache)) {
        const entry = newCache[cacheKey];
        if (!entry.messages) continue;

        for (const msg of entry.messages) {
            const dateStr = msg.date;
            if (dateStr === 'unknown') continue; // Skip messages with no valid date

            // Aggregate by date
            if (!history[dateStr]) {
                history[dateStr] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, sessions: 0 };
            }
            history[dateStr].input += msg.input;
            history[dateStr].output += msg.output;
            history[dateStr].cacheRead += msg.cacheRead;
            history[dateStr].cacheWrite += msg.cacheWrite;
            history[dateStr].cost += msg.cost;

            // Track session contribution per day
            if (!sessionsByDay[dateStr]) sessionsByDay[dateStr] = new Set();
            sessionsByDay[dateStr].add(cacheKey);

            // Aggregate grand total
            grandTotal.input += msg.input;
            grandTotal.output += msg.output;
            grandTotal.cacheRead += msg.cacheRead;
            grandTotal.cacheWrite += msg.cacheWrite;
            grandTotal.cost += msg.cost;

            // Aggregate by model
            const m = msg.model;
            if (m && m !== 'unknown') {
                if (!grandTotal.models[m]) {
                    grandTotal.models[m] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
                }
                grandTotal.models[m].input += msg.input;
                grandTotal.models[m].output += msg.output;
                grandTotal.models[m].cacheRead += msg.cacheRead;
                grandTotal.models[m].cacheWrite += msg.cacheWrite;
                grandTotal.models[m].cost += msg.cost;
            }
        }
    }

    // [P4 Fix] Write session counts per day
    for (const [day, sessionSet] of Object.entries(sessionsByDay)) {
        if (history[day]) history[day].sessions = sessionSet.size;
    }

    // Today's usage
    const todayStr = getLocalDate();
    const todayUsage = history[todayStr] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

    // Recent cost averages for smarter forecasting
    const sortedDays = Object.keys(history).sort();
    const last7days = sortedDays.slice(-7);
    const last30days = sortedDays.slice(-30);
    const sum7 = last7days.reduce((s, d) => s + history[d].cost, 0);
    const sum30 = last30days.reduce((s, d) => s + history[d].cost, 0);
    const recentCosts = {
        last7dAvg: last7days.length > 0 ? sum7 / last7days.length : 0,
        last30dAvg: last30days.length > 0 ? sum30 / last30days.length : 0,
    };

    // Top models by cost
    const topModels = Object.entries(grandTotal.models)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

    const finalData = {
        updatedAt: new Date().toISOString(),
        timezone: APP_TIMEZONE,
        today: todayUsage,
        total: grandTotal,
        history,
        topModels,
        recentCosts,
    };

    // Write output
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(newCache));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));

    // Stats
    const totalFiles = Object.keys(newCache).length;
    const totalMsgs = Object.values(newCache).reduce((sum, e) => sum + (e.messages?.length || 0), 0);
    console.log(`[Analyzer] Done: ${totalFiles} files, ${totalMsgs} messages, ${Object.keys(history).length} days, $${grandTotal.cost.toFixed(4)} total`);
}

analyze().catch(err => {
    console.error('[Analyzer] Fatal error:', err);
    process.exit(1);
});