const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Config ---
const DATA_DIR = path.join(__dirname, '../data/token_stats');
const CONFIG_DIR = path.join(__dirname, '../data/config');
const PRICING_FILE = path.join(CONFIG_DIR, 'pricing.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'latest.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

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

function calcCost(model, input, output, cacheRead = 0) {
    const key = Object.keys(COST_MAP).find(k => model && model.includes(k)) || 'default';
    const rate = COST_MAP[key];
    const cacheRate = rate.cacheRead || (rate.input * 0.25);
    return (input / 1000000 * rate.input) +
        (output / 1000000 * rate.output) +
        (cacheRead / 1000000 * cacheRate);
}

// --- Path Discovery ---
// Scan multiple possible locations for session JSONL files
function discoverSessionFiles() {
    const HOME_DIR = os.homedir();
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
        const readline = require('readline');
        const stream = fs.createReadStream(filePath, {
            encoding: 'utf8',
            start: startOffset
        });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        const messages = [];
        let bytesRead = startOffset;

        rl.on('line', (line) => {
            // Track byte position (line + newline)
            bytesRead += Buffer.byteLength(line, 'utf8') + 1;

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
                    cost = calcCost(model, input, output, cacheRead);
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
            topModels: []
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
                // File unchanged — reuse cached messages
                newCache[cacheKey] = cached;
            } else if (cached && fileSize > cached.fileSize && cached.byteOffset <= fileSize) {
                // File grew — incremental parse from last offset
                const { messages: newMsgs, bytesRead } = await processFile(filePath, cached.byteOffset);
                newCache[cacheKey] = {
                    fileSize,
                    byteOffset: bytesRead,
                    messages: [...cached.messages, ...newMsgs]
                };
            } else {
                // File is new, shrunk, or cache invalid — full parse
                const { messages, bytesRead } = await processFile(filePath, 0);
                newCache[cacheKey] = {
                    fileSize,
                    byteOffset: bytesRead,
                    messages
                };
            }
        } catch (e) { console.warn('[Analyzer] Error processing file:', filePath, e.message); }
    }

    // --- Aggregation (from all cached messages) ---
    const history = {};
    const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, models: {} };

    for (const cacheKey of Object.keys(newCache)) {
        const entry = newCache[cacheKey];
        if (!entry.messages) continue;

        for (const msg of entry.messages) {
            const dateStr = msg.date;
            if (dateStr === 'unknown') continue; // Skip messages with no valid date

            // Aggregate by date
            if (!history[dateStr]) {
                history[dateStr] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
            }
            history[dateStr].input += msg.input;
            history[dateStr].output += msg.output;
            history[dateStr].cacheRead += msg.cacheRead;
            history[dateStr].cacheWrite += msg.cacheWrite;
            history[dateStr].cost += msg.cost;

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

    // Today's usage
    const todayStr = getLocalDate();
    const todayUsage = history[todayStr] || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

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
        topModels
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