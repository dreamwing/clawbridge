# Cost Control Center

The **Cost Control Center** is a built-in diagnostic engine that analyzes your OpenClaw agent's token usage and provides actionable recommendations to reduce API costs.

## Features

### Token Monitoring Dashboard
- **Today's Cost** — live running total
- **Grand Total** — cumulative cost since installation
- **30-Day Forecast** — projected monthly spend based on recent patterns
- **Top Models** — cost breakdown by model
- **7-Day Histogram** — daily cost chart with drill-down

### Diagnostic Scanner (10 Rules)

| ID | Diagnostic | Description |
|----|-----------|-------------|
| A01 | Model Downgrade | Detects premium models used for routine tasks; suggests cheaper alternatives |
| A02 | Heartbeat Optimization | Calculates hidden heartbeat polling costs; offers tiered intervals |
| A03 | Session Reset Waste | Flags excessive session resets that waste context tokens |
| A04 | Idle Skill Detection | Finds unused skills that bloat system prompts |
| A05 | Thinking Overhead | Measures extended reasoning costs; recommends minimal mode |
| A06 | Prompt Caching | Detects missing cache config; enables 90% input savings |
| A07 | Compaction Safeguard | Prevents runaway costs from unbounded context growth |
| A08 | Local Ollama Routing | Routes simple requests to local models *(planned)* |
| A09 | Output Verbosity | Detects verbose output; adds concise directive |
| A10 | Multi-Model Routing | Cost-aware routing by task complexity *(planned)* |

### One-Tap Optimizer
- **Apply** button on every recommendation
- Automatic configuration backup before changes
- Instant **Undo/Rollback** to restore previous settings
- Full optimization history in `data/logs/optimizations.jsonl`

## API Endpoints

```
GET  /api/diagnostics   — Run all diagnostic checks, returns actions with savings
POST /api/optimize/:id  — Apply a specific optimization (A01–A10)
```

## How It Works

1. The **DiagnosticsEngine** reads your JSONL usage logs and current configuration.
2. Each diagnostic rule calculates potential savings based on your *actual* data.
3. Results are displayed in the dashboard with dollar amounts and configuration diffs.
4. Tapping **Apply** triggers the **OptimizerService**, which:
   - Backs up the current config to `data/backups/`
   - Writes the optimized setting
   - Logs the action to `data/logs/optimizations.jsonl`

## Files

```
src/services/diagnostics.js  — 10 diagnostic rules (A01–A10)
src/services/optimizer.js    — Apply/backup/rollback engine
src/services/pricing.js      — 340+ model pricing database
src/routes/diagnostics.js    — GET /api/diagnostics
src/routes/optimize.js       — POST /api/optimize/:id
public/js/dashboard.js       — Frontend rendering
```

## Credits

The 10 diagnostic rules were inspired by a community analysis of common OpenClaw cost pitfalls by [@li9292](https://x.com/li9292/status/2025081922410443243).

## Learn More

See the full series on [clawbridge.app/solutions](https://clawbridge.app/solutions) — 12 articles covering each diagnostic in depth.
