/**
 * Express app assembly — wires middleware, auth, static, and routes.
 *
 * 2026-10-30 iron-laws 重構（32 筆指摘全數處理）
 *   IL-101 硬編碼金鑰 → 改讀環境變數，缺值 fail-closed
 *   IL-506 SSRF → growth 代理改白名單 + URL 組裝（同時消除自我代理迴圈）
 *   IL-504 命令注入 → execSync → execFileSync（無 shell）
 *   IL-502 路徑穿越 → safeResolve / safeResolveUnder 越界檢查
 *   IL-511 標頭注入 → 檔名白名單化
 *   IL-305 錯誤洩漏 → 回應只回通用錯誤碼，詳情只寫 log
 *   IL-301 吞錯 → catch 一律記 log
 *   AI-101 硬編碼路徑/URL → 環境變數化
 *   AI-105 CORS '*' → 環境變數允許清單
 *   ARC-201 巢狀過深 → 抽出 helper 函式
 *   AI-120 缺錯誤中介 → 補 4 參數 error handler
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const cookieParser = require('cookie-parser');

const authRoutes = require('./auth/routes');
const authMiddleware = require('./auth/middleware');
const apiRoutes = require('./routes');
const { SECRET_KEY } = require('./config');
const { safeCompare } = require('./auth/utils');

const app = express();

app.set('trust proxy', 'loopback');

// Body parsing & cookies
app.use(express.json({ limit: '10mb' }));  // FIX(2026-08-30): 骨架300幀可能很大
app.use(cookieParser());

// Auth routes (before auth middleware — /api/auth must be public)
app.use(authRoutes);

// Root route — serve index.html for the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── 通用安全輔助 ─────────────────────────────────────────────────────────────
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '', '.openclaw');
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || path.join(OPENCLAW_HOME, 'workspace');

// 錯誤回應不外洩內部訊息（IL-305），詳細原因只寫 log
function fail(res, err, code = 'internal_error', status = 500) {
    console.error(`[clawbridge] ${code}:`, err && err.stack ? err.stack : err);
    return res.status(status).json({ ok: false, error: code });
}

// 路徑白名單解析：只允許 base 目錄底下的檔名（IL-502）
function safeResolve(baseDir, name) {
    if (typeof name !== 'string' || !name) return null;
    const base = path.resolve(baseDir);
    const target = path.resolve(base, path.basename(name));
    if (!target.startsWith(base + path.sep)) return null;
    return target;
}

// 相對路徑解析：限制在某個根目錄之內（IL-502）
function safeResolveUnder(baseDir, relativePath) {
    if (typeof relativePath !== 'string' || !relativePath) return null;
    const base = path.resolve(baseDir);
    let decoded;
    try {
        decoded = decodeURIComponent(relativePath);
    } catch (e) {
        // IL-301：不可靜默吞錯，解碼失敗要留下紀錄
        console.warn('[clawbridge] path decode failed:', e && e.message ? e.message : e);
        return null;
    }
    const target = path.resolve(base, decoded.replace(/^[/\\]+/, ''));
    if (!target.startsWith(base + path.sep)) return null;
    return target;
}

// 檔名白名單化，避免換行/引號注入標頭（IL-511）
function safeHeaderFilename(name) {
    const cleaned = path.basename(String(name || 'file')).replace(/[^\w.\-]/g, '_').slice(0, 120);
    return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'file';
}

// WASM 路徑白名單化（IL-502）：逐段 basename + 允許字元 + 根目錄收斂檢查
function sanitizeWasmPath(requestPath) {
    if (typeof requestPath !== 'string' || !requestPath) return null;
    let decoded;
    try {
        decoded = decodeURIComponent(requestPath);
    } catch (e) {
        // IL-301：不可靜默吞錯，解碼失敗要留下紀錄
        console.warn('[clawbridge] wasm path decode failed:', e && e.message ? e.message : e);
        return null;
    }
    const segments = decoded.split('/').filter(Boolean).map((seg) => path.basename(seg));
    if (!segments.length) return null;
    const allowedSegment = segments.every(
        (seg) => /^[A-Za-z0-9._\-]+$/.test(seg) && seg !== '.' && seg !== '..'
    );
    if (!allowedSegment) return null;
    if (!segments[segments.length - 1].endsWith('.wasm')) return null;
    const base = path.resolve(path.join(__dirname, '..', 'public'));
    const target = path.resolve(base, segments.join('/'));
    if (!target.startsWith(base + path.sep)) return null;
    return target;
}

// CORS 允許清單（AI-105）：不使用 '*'；允許來源改由環境變數 CLAWBRIDGE_ALLOWED_ORIGINS 列舉
//（設定值放在 .env，不寫死在程式碼裡）。IL-511：回寫標頭的值取自清單項目本身，不直接用請求原值。
const ALLOWED_ORIGINS = (process.env.CLAWBRIDGE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    for (const allowed of ALLOWED_ORIGINS) {
        if (allowed !== origin) continue;
        res.set('Access-Control-Allow-Origin', allowed);
        res.set('Vary', 'Origin');
        return;
    }
}

// ── Public Growth API (no auth required) ───────────────────────────────────
const GROWTH_AUDIT_FILE = path.join(WORKSPACE_DIR, 'memory', 'growth', 'growth-audit.json');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');

const DIMENSIONS = {
  G1:{name:'G1-連結過去',phase:1},P1:{name:'P1-預判問題',phase:1},P2:{name:'P2-主動預判',phase:1},
  P3:{name:'P3-系統異常',phase:1},P4:{name:'P4-看見需要',phase:1},F1:{name:'F1-不知道',phase:2},
  F2:{name:'F2-犯錯承認',phase:2},F3:{name:'F3-真正判斷',phase:2},F4:{name:'F4-敢於反對',phase:2},
  G3:{name:'G3-三省',phase:3},G4:{name:'G4-新主題連結',phase:3},E1:{name:'E1-主動探索',phase:5},
  E2:{name:'E2-盲點偵測',phase:5},E3:{name:'E3-跨系統連結',phase:5},
};
const PHASE_NAMES = {1:'觸發與三省',2:'防衰退+真學習',3:'生長引擎',4:'預測+ROI報告',5:'主動進化型'};

function todayKey(){return new Date().toISOString().split('T')[0];}
function weekKey(){const now=new Date(),dow=now.getDay();const m=new Date(now);m.setDate(now.getDate()-((dow+6)%7));return m.toISOString().split('T')[0];}

// 單段讀檔：直接 try/catch 讀取，不做 existsSync + readFileSync 兩段式（避免 TOCTOU）
function readGrowthAudit() {
    try {
        return JSON.parse(fs.readFileSync(GROWTH_AUDIT_FILE, 'utf8'));
    } catch (e) {
        // IL-301：不可吞錯。缺檔雖屬預期情境，仍留下紀錄以便追查。
        console.error('[clawbridge] growth audit read failed:', e && e.message ? e.message : e);
        return { daily: {}, weekly: {}, marks: {} };
    }
}

const BLINDSPOT_PATTERNS = ['未完成', '還沒做', '待整合', '計畫中'];

function isBlindspotLine(line) {
    if (line.includes('user:') || line.includes('assistant:')) return false;
    if (/^[#\-\*]*\s*user:/.test(line)) return false;
    if (/^「.*」/.test(line)) return false;
    if (line.includes('~~')) return false;
    return true;
}

function listMemoryFiles() {
    let names;
    try {
        names = fs.readdirSync(MEMORY_DIR);
    } catch (e) {
        console.error('[clawbridge] memory dir read failed:', e.message);
        return [];
    }
    return names.filter(
        (f) =>
            f.endsWith('.md') &&
            !f.includes('phase5') &&
            !/^(evening-report-|morning-report-|daily-distill-|weekly-review-|afternoon-report-)/.test(f) &&
            !/^\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(f)
    );
}

function collectBlindspots() {
    const found = [];
    for (const file of listMemoryFiles()) {
        let content;
        try {
            content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
        } catch (e) {
            console.error(`[clawbridge] read ${file} failed:`, e.message);
            continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!isBlindspotLine(line)) continue;
            for (const pattern of BLINDSPOT_PATTERNS) {
                if (!line.includes(pattern)) continue;
                found.push({ file, line: i + 1, type: pattern, context: line.trim().substring(0, 100) });
            }
        }
    }
    return found;
}

function dedupeBlindspots(list) {
    const seen = new Set();
    const out = [];
    for (const bs of list) {
        const key = `${bs.file}:${bs.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(bs);
    }
    return out;
}

function groupByType(list) {
    const out = {};
    for (const bs of list) {
        if (!out[bs.type]) out[bs.type] = [];
        out[bs.type].push(bs);
    }
    return out;
}

function buildByPhase(dims) {
    const byPhase = {};
    for (let p = 1; p <= 5; p++) {
        const pd = dims.filter((d) => d.phase === p);
        const ts = pd.reduce((s, d) => s + d.score, 0);
        byPhase[p] = {
            name: PHASE_NAMES[p],
            dims: pd,
            score: ts,
            maxScore: pd.length * 100,
            pct: pd.length > 0 ? Math.round((ts / (pd.length * 100)) * 100) : 0,
        };
    }
    return byPhase;
}

function readExploration(file) {
    try {
        const match = fs.readFileSync(file, 'utf8').match(/領域：(.+)/);
        return match ? match[1] || '已執行探索' : '已執行探索';
    } catch (e) {
        if (e && e.code !== 'ENOENT') {
            console.error('[clawbridge] exploration read failed:', e.message);
        }
        return null;
    }
}

function growthStatusPayload() {
    const data = readGrowthAudit();
    const tk = todayKey(), wk = weekKey();
    const todayRec = data.daily[tk] || {}, weekRec = data.weekly[wk] || {};
    const dims = Object.entries(DIMENSIONS).map(([k, d]) => ({
        key: k, name: d.name, phase: d.phase,
        today: todayRec[k] || 0, week: weekRec[k] || 0, total: data.marks?.[k] || 0,
        score: weekRec[k] ? Math.min(100, (weekRec[k] || 0) * 20) : 0,
    }));
    const byPhase = buildByPhase(dims);
    const unique = dedupeBlindspots(collectBlindspots());
    const byType = groupByType(unique);
    const totalPct = Object.values(byPhase).reduce((s, p) => s + p.pct, 0);
    return {
        ok: true, today: tk, week: wk,
        totalToday: Object.values(todayRec).reduce((s, v) => s + v, 0),
        totalWeek: Object.values(weekRec).reduce((s, v) => s + v, 0),
        dims, byPhase,
        overallPct: Math.round(totalPct / 5),
        tips: dims.filter((d) => d.week === 0).slice(0, 3).map((d) => '⚠️ ' + d.name + ' 本週未達成'),
        blindspots: { total: unique.length, recent: unique.slice(0, 5), byType, status: unique.length === 0 ? '✅ 無待處理盲點' : '⚠️ 有待清理盲點' },
    };
}

function growthWeeklyPayload() {
    const wk = weekKey();
    const data = readGrowthAudit();
    const weekRec = data.weekly[wk] || {};
    const topDims = Object.entries(weekRec)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, c]) => ({ key: k, name: DIMENSIONS[k]?.name || k, count: c }));
    const exploration = readExploration(path.join(MEMORY_DIR, '2026-08-09-phase5-exploration.md'));
    return {
        ok: true, weekStart: wk, topDimensions: topDims,
        totalActions: Object.values(weekRec).reduce((s, v) => s + v, 0),
        exploration, nextExplore: '下週日 01:30',
    };
}

function growthBlindspotsPayload() {
    const unique = dedupeBlindspots(collectBlindspots());
    const byType = groupByType(unique);
    return {
        ok: true, total: unique.length, byType,
        recent: unique.slice(0, 10),
        status: unique.length === 0 ? '✅ 無待處理盲點' : '⚠️ 有待清理盲點',
    };
}

app.get('/api/growth/status', (req, res) => {
    try {
        res.json(growthStatusPayload());
    } catch (e) {
        fail(res, e, 'growth_status_failed');
    }
});

app.get('/api/growth/weekly', (req, res) => {
    try {
        res.json(growthWeeklyPayload());
    } catch (e) {
        fail(res, e, 'growth_weekly_failed');
    }
});

app.get('/api/growth/blindspots', (req, res) => {
    try {
        res.json(growthBlindspotsPayload());
    } catch (e) {
        fail(res, e, 'growth_blindspots_failed');
    }
});

// ── /api/growth/* 通用入口：僅允許白名單子路徑 ───────────────────────────────
// IL-506：舊版把外部輸入拼進 URL 再 http.get 回自己（自我代理迴圈 + SSRF 疑慮）。
// 現在改為在進程內直接組資料，完全不需要對外發任何請求。
const GROWTH_PAYLOADS = {
    status: growthStatusPayload,
    weekly: growthWeeklyPayload,
    blindspots: growthBlindspotsPayload,
};

app.get('/api/growth/:path', (req, res) => {
    const sub = String(req.params.path || '');
    const build = GROWTH_PAYLOADS[sub];
    if (!build) {
        return res.status(404).json({ ok: false, error: 'not_found' });
    }
    try {
        applyCors(req, res);
        res.json(build());
    } catch (e) {
        fail(res, e, 'growth_proxy_failed');
    }
});

// ── Public Vault Memory API (no auth required) ───────────────────────────────
const VAULT_BIN = process.env.VAULT_BIN || path.join(OPENCLAW_HOME, '.vault-venv', 'bin', 'vault');
const VAULT_PROJECT = process.env.VAULT_PROJECT_DIR || path.join(WORKSPACE_DIR, 'vault-memory');

// IL-504：execSync + 字串拼接 → execFileSync + 參數陣列（不經 shell，無命令注入）
function vaultJson(args = [], flags = '') {
    try {
        const extra = flags === 'json' ? ['--json'] : flags === 'pretty' ? ['--pretty'] : [];
        const out = execFileSync(VAULT_BIN, [...args, '--project-dir', VAULT_PROJECT, ...extra], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return JSON.parse(out);
    } catch (e) {
        console.error('[clawbridge] vault command failed:', e && e.message ? e.message : e);
        return null;
    }
}

app.get('/api/vault/status', (req, res) => {
    const stats = vaultJson(['stats'], 'json') || {};
    const candidates = vaultJson(['candidates']) || {};
    const list = vaultJson(['list', '--layer', 'L2', '--max-results', '50']) || {};
    const growthCandidates = (candidates.candidates || []).filter((c) => (c.tags || '').includes('成長系統'));
    const s = stats.stats || stats;
    res.json({
        ok: true,
        vault: { knowledgeCount: s.knowledge_count || s.active_count || 0, dbSize: s.db_size_mb || '0', vectors: s.semantic_vector_count || 0 },
        candidates: { total: candidates.count || 0, growth: growthCandidates.length, items: growthCandidates },
        active: { total: list.length || 0 },
    });
});

app.post('/api/vault/promote', requireShareWriteAuth, (req, res) => {
    const { candidateId } = req.body || {};
    if (!candidateId) { res.json({ ok: false, error: 'candidateId required' }); return; }
    const result = vaultJson(['promote', '--confirm', String(candidateId)], 'pretty');
    res.json({ ok: true, result });
});

app.post('/api/vault/reject', requireShareWriteAuth, (req, res) => {
    // Vault 不支援直接拒絕候選，候選只會停留在池中直到被晉升
    // 改用 vault delete 移除知識條目
    const { candidateId } = req.body || {};
    if (!candidateId) { res.json({ ok: false, error: 'candidateId required' }); return; }
    const result = vaultJson(['delete', String(candidateId)], 'pretty');
    res.json({ ok: true, result });
});

// ── Public proxy: /services → unified-home:3848 (no auth required) ───────────
const UNIFIED_HOME_URL = process.env.UNIFIED_HOME_URL || 'http://127.0.0.1:3848';

app.get('/services', (req, res) => {
    const target = new URL('/services', UNIFIED_HOME_URL);
    const proxy = http.get(target, { timeout: 5000 }, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
            applyCors(req, res);
            res.set('Content-Type', 'application/json');
            res.send(data);
        });
    });
    proxy.on('error', (err) => {
        console.error('[clawbridge] unified-home proxy failed:', err.message);
        res.status(500).json({ error: 'unified-home unreachable' });
    });
});

// ── Public share upload (write requires access key) ──────────────────────────
// 讀取（列表／下載）維持公開；寫入（上傳／刪除）需要金鑰。
// 為什麼要收斂：3847 經 Cloudflare Tunnel 對外公開，且 tunnel 設定含
// 萬用網域指向本服務，無認證等於任何人都能上傳或刪除公開目錄中的檔案。
// 金鑰沿用既有機制：config.SECRET_KEY（= ACCESS_KEY）+ safeCompare timing-safe 比對。
function requireShareWriteAuth(req, res, next) {
    if (safeCompare(req.headers['x-claw-key'], SECRET_KEY)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}
const multer = require('multer');
const shareDir = path.join(__dirname, '..', 'public', 'share');
const shareStorage = multer.diskStorage({
    destination: shareDir,
    // IL-502：客戶端提供的檔名可能含路徑分隔符或 .. ，寫入前必須正規化，
    // 否則 path.join 會讓檔案落到分享目錄之外。
    filename: (req, file, cb) => {
        const raw = String(file.originalname || 'file');
        const base = path.basename(raw).replace(/[\\/]/g, '');
        cb(null, (base && base !== '.' && base !== '..') ? base : 'file');
    },
});
const shareUpload = multer({ storage: shareStorage });
app.post('/api/share-upload', requireShareWriteAuth, shareUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ success: true, name: req.file.filename, size: req.file.size });
});
app.get('/share', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'file-share.html')));

// Share file list & download (no auth)
app.get('/api/share-list', (req, res) => {
    try {
        const files = fs.readdirSync(shareDir).filter((f) => f !== '.gitkeep');
        res.json({ files });
    } catch (e) {
        console.error('[clawbridge] share list failed:', e.message);
        res.status(500).json({ error: 'Cannot read share folder' });
    }
});

app.get('/api/share-download', (req, res) => {
    const filePath = safeResolve(shareDir, req.query.file);
    if (!filePath) return res.status(400).json({ error: 'Invalid file' });
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (e) {
        if (e && e.code !== 'ENOENT') console.error('[clawbridge] share stat failed:', e.message);
        return res.status(404).json({ error: 'File not found' });
    }
    if (!stat.isFile()) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
});

app.delete('/api/share-delete', requireShareWriteAuth, (req, res) => {
    const filePath = safeResolve(shareDir, req.query.file);
    if (!filePath) return res.status(400).json({ error: 'Invalid file' });
    try {
        fs.unlinkSync(filePath);
    } catch (e) {
        if (e && e.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
        console.error('[clawbridge] share delete failed:', e.message);
        return res.status(500).json({ error: 'Delete failed' });
    }
    res.json({ success: true });
});

// ── Public Courts API (no auth required) ─────────────────────────────────────
app.use('/api/courts', require('./routes/courts'));

// ── Public Assessment API (no auth required — user ID is localStorage-based) ──
app.use('/api/assessment', require('./routes/assessment'));

// ── Public Practice API (no auth required — for single-practice, does NOT affect level) ──
app.use('/api/practice', require('./routes/practice'));

// ── Badminton Analysis API (integrates badminton_ai_coach.py analysis module) ──
app.use('/api/badminton', require('./routes/badminton'));

// ── MiniMax AI Proxy (avoids CORS) ──────────────────────────────────────────
// IL-101：金鑰改由環境變數提供（workspace/clawbridge/.env 或 apps/clawbridge/.env），
// 缺值時 fail-closed（503），不再把密鑰寫進程式碼。
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '2024475421608780206';
const MINIMAX_ENDPOINT = process.env.MINIMAX_ENDPOINT || 'https://api.minimax.io/v1/text/chatcompletion_v2';

app.post('/api/ai/chat', async (req, res) => {
    const { model, max_tokens, messages } = req.body;
    if (!MINIMAX_API_KEY) {
        console.error('[clawbridge] MINIMAX_API_KEY is not configured');
        return res.status(503).json({ error: 'ai_proxy_not_configured' });
    }
    try {
        const response = await fetch(`${MINIMAX_ENDPOINT}?GroupId=${encodeURIComponent(MINIMAX_GROUP_ID)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MINIMAX_API_KEY}`,
            },
            body: JSON.stringify({ model: model || 'MiniMax-Text-01', max_tokens: max_tokens || 1000, messages }),
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('MiniMax proxy error:', error);
        res.status(500).json({ error: 'ai_proxy_error' });
    }
});

// Auth middleware (protects everything below)
// ── 璇璣塔羅 Webhook 路由（在 auth 之前，公開） ────────────────────────────
const tarotRouter = require('./routes/tarot');
app.use('/tarot', tarotRouter);

// DISABLED: app.use(authMiddleware);

// APK download: bypass express.static and handle directly to set correct filename
// IL-511 / 標頭注入：交給 res.download 設定 Content-* 標頭，檔名先白名單化，不再手工組標頭。
app.use((req, res, next) => {
    if (!req.path.endsWith('.apk')) return next();
    const filePath = safeResolve(shareDir, req.path.split('/').pop());
    if (!filePath) return next();
    res.download(filePath, safeHeaderFilename(path.basename(filePath)), (err) => {
        if (!err) return;
        if (err.code === 'ENOENT') return next();
        console.error('[clawbridge] apk download failed:', err.message);
        if (!res.headersSent) res.status(404).end();
    });
});

// WASM files: serve manually with correct MIME type (BEFORE static)
app.get('*.wasm', (req, res, next) => {
  const filePath = sanitizeWasmPath(req.path);
  if (!filePath) return next();
  res.setHeader('Content-Type', 'application/wasm');
  res.sendFile(filePath);
});

// badminton assessment: no-cache so fixes take effect immediately
app.get('/badminton-coach/assessment.html', (req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
  res.sendFile(path.join(__dirname, '..', 'public', 'badminton-coach', 'assessment.html'));
});

// badminton-coach .js files: no-cache (prevents stale JS serving)
app.use('/badminton-coach/js', (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
  next();
});

// API routes (must be BEFORE static to handle /tarot, /api/*)
app.use(["/api/kill", "/api/gateway/restart"], requireShareWriteAuth);
app.use(apiRoutes);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── 錯誤處理中介（AI-120：4 參數簽章，必須掛在所有路由之後）───────────────
app.use((err, req, res, next) => {
    console.error('[clawbridge] unhandled error:', err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    // 保留框架判定的 4xx（例如找不到檔案 404），其餘一律 500 + 通用錯誤碼
    const status = Number(err && (err.status || err.statusCode));
    if (status >= 400 && status < 600) {
        return res.status(status).json({ ok: false, error: status === 404 ? 'not_found' : 'request_failed' });
    }
    res.status(500).json({ ok: false, error: 'internal_error' });
});

module.exports = app;