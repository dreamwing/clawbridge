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
// V2.1 Path Update: Support both old (.clawdbot) and new (.openclaw) paths
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

// Cost Config (Load from file or Default)
let COST_MAP = {
    'default': { input: 0.10, output: 0.40 }
};

if (fs.existsSync(PRICING_FILE)) {
    try {
        COST_MAP = { ...COST_MAP, ...JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8')) };
    } catch(e) {
        console.error('Error loading pricing.json, using defaults');
    }
} else {
    // Fallback defaults if file missing
    COST_MAP = {
        'google/gemini-3-pro-preview': { input: 0, output: 0 },
        'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
        'anthropic/claude-3-5-sonnet-20240620': { input: 3.00, output: 15.00 },
        'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
        'openai/gpt-4o': { input: 2.50, output: 10.00 },
        'default': { input: 0.10, output: 0.40 }
    };
}

function calcCost(model, input, output) {
    const key = Object.keys(COST_MAP).find(k => model && model.includes(k)) || 'default';
    const rate = COST_MAP[key];
    return (input / 1000000 * rate.input) + (output / 1000000 * rate.output);
}

// Core Logic: Parse Single File
function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    
    let maxInput = 0;
    let maxOutput = 0;
    let maxCost = 0;
    let lastModel = 'unknown';

    lines.forEach(line => {
        try {
            const entry = JSON.parse(line);
            let usage = entry.usage || (entry.message && entry.message.usage);

            if (usage) {
                const input = usage.input || usage.inputTokens || 0;
                const output = usage.output || usage.outputTokens || 0;
                if (input > maxInput) maxInput = input;
                if (output > maxOutput) maxOutput = output;
                if (usage.cost && typeof usage.cost.total === 'number') {
                    if (usage.cost.total > maxCost) maxCost = usage.cost.total;
                }
            }
            
            const m = entry.model || (entry.message && entry.message.model);
            if (m) lastModel = m;
        } catch(e) {}
    });

    let finalCost = maxCost;
    if (finalCost === 0 && (maxInput > 0 || maxOutput > 0)) {
        finalCost = calcCost(lastModel, maxInput, maxOutput);
    }

    return {
        input: maxInput,
        output: maxOutput,
        cost: finalCost,
        model: lastModel
    };
}

async function analyze() {
    if (!fs.existsSync(HISTORY_DIR)) {
        const emptyData = { updatedAt: new Date().toISOString(), today: {}, total: {cost:0}, history: {} };
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emptyData));
        return;
    }

    // 1. Load Cache
    let cache = {};
    try {
        if (fs.existsSync(CACHE_FILE)) {
            cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch(e) {}

    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.jsonl'));
    const newCache = {}; // Rebuild cache to prune deleted files
    
    // Aggregators
    const history = {}; 
    const grandTotal = { input: 0, output: 0, cost: 0, models: {} };
    let freshCount = 0;

    // 2. Scan & Process
    files.forEach(file => {
        try {
            const filePath = path.join(HISTORY_DIR, file);
            const stat = fs.statSync(filePath);
            const mtime = stat.mtimeMs;
            const dateStr = getLocalDate(stat.mtime); // Group by File Date

            let stats;

            // Cache Hit?
            if (cache[file] && cache[file].mtime === mtime) {
                stats = cache[file].stats;
            } else {
                // Cache Miss - Reprocess
                stats = processFile(filePath);
                freshCount++;
            }

            // Update Cache
            newCache[file] = { mtime, stats };

            // Aggregate
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

        } catch (e) {
            // console.error(`Failed ${file}: ${e.message}`);
        }
    });

    // 3. Finalize Output
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
    
    // Write Cache & Output
    fs.writeFileSync(CACHE_FILE, JSON.stringify(newCache, null, 2)); // Save for next time
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2)); // Frontend consumption

    // console.log(`[Analyzer] Done. Files: ${files.length} (Fresh: ${freshCount}). Cost: $${grandTotal.cost.toFixed(4)}`);
}

analyze();