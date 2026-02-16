const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Config (Open Source Compatible) ---
// 1. Output: ../data/token_stats/latest.json
const OUTPUT_FILE = path.join(__dirname, '../data/token_stats/latest.json');

// 2. History: ~/.clawdbot/agents/main/sessions/ (Standard Clawdbot Path)
const HOME_DIR = os.homedir();
const HISTORY_DIR = path.join(HOME_DIR, '.clawdbot/agents/main/sessions/');

// --- Timezone Detection ---
const APP_TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Helper: Get YYYY-MM-DD in Local Time
function getLocalDate(date = new Date()) {
    return date.toLocaleString('en-CA', { timeZone: APP_TIMEZONE }).split(',')[0].trim();
}

// Cost Config (per 1M tokens)
const COST_MAP = {
    'google/gemini-3-pro-preview': { input: 0, output: 0 },
    'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
    'anthropic/claude-3-5-sonnet-20240620': { input: 3.00, output: 15.00 },
    'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
    'default': { input: 0.10, output: 0.40 }
};

function calcCost(model, input, output) {
    const key = Object.keys(COST_MAP).find(k => model && model.includes(k)) || 'default';
    const rate = COST_MAP[key];
    return (input / 1000000 * rate.input) + (output / 1000000 * rate.output);
}

async function analyze() {
    // console.log(`[Analyzer] Starting... Timezone: ${APP_TIMEZONE}`);
    
    if (!fs.existsSync(HISTORY_DIR)) {
        // console.error('[Analyzer] History dir not found:', HISTORY_DIR);
        // Write empty stats to avoid 404s
        const emptyData = { updatedAt: new Date().toISOString(), today: {}, total: {cost:0}, history: {} };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(emptyData));
        return;
    }

    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.jsonl'));
    const history = {}; 
    const grandTotal = { input: 0, output: 0, cost: 0, models: {} };
    
    files.forEach(file => {
        try {
            const filePath = path.join(HISTORY_DIR, file);
            const stat = fs.statSync(filePath);
            const dateStr = getLocalDate(stat.mtime);
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

            if (!history[dateStr]) history[dateStr] = { input: 0, output: 0, cost: 0 };
            history[dateStr].input += maxInput;
            history[dateStr].output += maxOutput;
            history[dateStr].cost += finalCost;

            grandTotal.input += maxInput;
            grandTotal.output += maxOutput;
            grandTotal.cost += finalCost;

            if (!grandTotal.models[lastModel]) grandTotal.models[lastModel] = { input: 0, output: 0, cost: 0 };
            grandTotal.models[lastModel].input += maxInput;
            grandTotal.models[lastModel].output += maxOutput;
            grandTotal.models[lastModel].cost += finalCost;

        } catch (e) {}
    });

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

    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    // console.log(`[Analyzer] Done. Cost: $${grandTotal.cost.toFixed(4)}`);
}

analyze();
