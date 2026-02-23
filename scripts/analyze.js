const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Config ---
const DATA_DIR = path.join(__dirname, '../data/token_stats');
const CONFIG_DIR = path.join(__dirname, '../data/config');
const PRICING_FILE = path.join(CONFIG_DIR, 'pricing.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'latest.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

// History Path
const HOME_DIR = os.homedir();
const NEW_PATH = path.join(HOME_DIR, '.openclaw/sessions/');
const OLD_PATH = path.join(HOME_DIR, '.clawdbot/agents/main/sessions/');

let HISTORY_DIR = NEW_PATH;
if (!fs.existsSync(NEW_PATH) && fs.existsSync(OLD_PATH)) {
    HISTORY_DIR = OLD_PATH;
}

// Timezone
const APP_TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function getLocalDate(date = new Date()) {
    return date.toLocaleString('en-CA', { timeZone: APP_TIMEZONE }).split(',')[0].trim();
}

// Cost Config
let COST_MAP = {
    'default': { input: 0.10, output: 0.40 }
};

if (fs.existsSync(PRICING_FILE)) {
    try {
        COST_MAP = { ...COST_MAP, ...JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8')) };
    } catch (e) { }
}

function calcCost(model, input, output, cacheRead = 0) {
    const key = Object.keys(COST_MAP).find(k => model && model.includes(k)) || 'default';
    const rate = COST_MAP[key];

    // Add cacheRead if available (Gemini specific, usually 50% or 25% of input cost)
    const cacheRate = rate.cacheRead || (rate.input * 0.25);

    return (input / 1000000 * rate.input) +
        (output / 1000000 * rate.output) +
        (cacheRead / 1000000 * cacheRate);
}

// Core Logic: Parse Single File (Stream-based to avoid OOM on large files)
// 🛡️ REPAIR (2026-02-24): Use SUM instead of MAX to fix undercounting
// Also capture cacheRead for Gemini.
function processFile(filePath) {
    return new Promise((resolve, reject) => {
        const readline = require('readline');
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCost = 0;
        let lastModel = 'unknown';

        rl.on('line', (line) => {
            try {
                const entry = JSON.parse(line);
                if (entry.type !== 'message') return;

                const usage = entry.usage || (entry.message && entry.message.usage);
                if (usage) {
                    totalInput += (usage.input || usage.inputTokens || 0);
                    totalOutput += (usage.output || usage.outputTokens || 0);
                    totalCacheRead += (usage.cacheRead || 0);

                    if (usage.cost && typeof usage.cost.total === 'number') {
                        totalCost += usage.cost.total;
                    }
                }

                const m = entry.model || (entry.message && entry.message.model);
                if (m) lastModel = m;
            } catch (e) { }
        });

        rl.on('close', () => {
            // If internal cost tracking is missing, fallback to pricing map
            if (totalCost === 0 && (totalInput > 0 || totalOutput > 0)) {
                totalCost = calcCost(lastModel, totalInput, totalOutput, totalCacheRead);
            }

            resolve({
                input: totalInput,
                output: totalOutput,
                cacheRead: totalCacheRead,
                cost: totalCost,
                model: lastModel
            });
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

async function analyze() {
    if (!fs.existsSync(HISTORY_DIR)) {
        const emptyData = { updatedAt: new Date().toISOString(), today: {}, total: { cost: 0 }, history: {} };
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emptyData));
        return;
    }

    let cache = {};
    try {
        if (fs.existsSync(CACHE_FILE)) {
            cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch (e) { }

    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.jsonl'));
    const newCache = {};

    const history = {};
    const grandTotal = { input: 0, output: 0, cost: 0, models: {} };

    for (const file of files) {
        try {
            const filePath = path.join(HISTORY_DIR, file);
            const stat = fs.statSync(filePath);
            const mtime = stat.mtimeMs;
            const dateStr = getLocalDate(stat.mtime);

            let stats;
            if (cache[file] && cache[file].mtime === mtime) {
                stats = cache[file].stats;
            } else {
                // Cache Miss - Reprocess (async stream-based)
                stats = await processFile(filePath);
            }

            newCache[file] = { mtime, stats };

            if (stats.model && (stats.model.includes('delivery-mirror') || stats.model === 'unknown')) {
                // Skip
            } else {
                if (!history[dateStr]) history[dateStr] = { input: 0, output: 0, cost: 0 };
                history[dateStr].input += stats.input;
                history[dateStr].output += stats.output;
                history[dateStr].cost += stats.cost;

                grandTotal.input += stats.input;
                grandTotal.output += stats.output;
                grandTotal.cost += stats.cost;

                const m = stats.model;
                if (!grandTotal.models[m]) grandTotal.models[m] = { input: 0, output: 0, cost: 0 };
                grandTotal.models[m].input += stats.input;
                grandTotal.models[m].output += stats.output;
                grandTotal.models[m].cost += stats.cost;
            }
        } catch (e) { }
    }

    const todayStr = getLocalDate();
    const todayUsage = history[todayStr] || { input: 0, output: 0, cost: 0 };

    const topModels = Object.entries(grandTotal.models)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

    const finalData = {
        updatedAt: new Date().toISOString(),
        today: todayUsage,
        total: grandTotal,
        history: history,
        topModels: topModels
    };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(newCache, null, 2));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
}

analyze();