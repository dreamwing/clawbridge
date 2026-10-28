/**
 * Express app assembly — wires middleware, auth, static, and routes.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');

const authRoutes = require('./auth/routes');
const authMiddleware = require('./auth/middleware');
const apiRoutes = require('./routes');

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

// ── Public Growth API (no auth required) ───────────────────────────────────
const GROWTH_AUDIT_FILE = path.join(process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, '.openclaw', 'workspace'), 'memory', 'growth', 'growth-audit.json');
const MEMORY_DIR = path.join(process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, '.openclaw', 'workspace'), 'memory');

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

app.get('/api/growth/status', (req, res) => {
    const fs = require('fs');
    try {
        const data = fs.existsSync(GROWTH_AUDIT_FILE) ? JSON.parse(fs.readFileSync(GROWTH_AUDIT_FILE,'utf8')) : {daily:{},weekly:{},marks:{}};
        const tk = todayKey(), wk = weekKey();
        const todayRec = data.daily[tk]||{}, weekRec = data.weekly[wk]||{};
        const dims = Object.entries(DIMENSIONS).map(([k,d])=>({
            key:k, name:d.name, phase:d.phase,
            today:todayRec[k]||0, week:weekRec[k]||0, total:data.marks?.[k]||0,
            score:weekRec[k] ? Math.min(100,(weekRec[k]||0)*20) : 0,
        }));
        const byPhase={};
        for(let p=1;p<=5;p++){
            const pd=dims.filter(d=>d.phase===p);
            const ts=pd.reduce((s,d)=>s+d.score,0);
            byPhase[p]={name:PHASE_NAMES[p],dims:pd,score:ts,maxScore:pd.length*100,pct:pd.length>0?Math.round(ts/(pd.length*100)*100):0};
        }
        // Blindspots inline
        const blindSpots = [];
        const patterns = [
            { name: '未完成', pattern: /未完成/ },
            { name: '還沒做', pattern: /還沒做/ },
            { name: '待整合', pattern: /待整合/ },
            { name: '計畫中', pattern: /計畫中/ },
        ];
        if (fs.existsSync(MEMORY_DIR)) {
            const files = fs.readdirSync(MEMORY_DIR).filter(f =>
                f.endsWith('.md') &&
                !f.includes('phase5') &&
                !f.startsWith('evening-report-') &&
                !f.startsWith('morning-report-') &&
                !f.startsWith('daily-distill-') &&
                !f.startsWith('weekly-review-') &&
                !f.startsWith('afternoon-report-') &&
                !f.match(/^\d{4}-\d{2}-\d{2}-\d{4}\.md$/) // 排除對話記錄如 2026-07-17-2239.md
            );
            for (const file of files) {
                const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    for (const p of patterns) {
                        if (line.includes(p.name) && !line.includes('user:') && !line.includes('assistant:') && !line.match(/^[#\-\*]*\s*user:/) && !line.match(/^「.*」/) && !line.includes('~~')) {
                            blindSpots.push({ file, line: i+1, type: p.name, context: line.trim().substring(0, 100) });
                        }
                    }
                }
            }
        }
        const unique = [];
        const seen = new Set();
        for (const bs of blindSpots) {
            const key = bs.file + ':' + bs.line;
            if (!seen.has(key)) { seen.add(key); unique.push(bs); }
        }
        const byType = {};
        for (const bs of unique) {
            if (!byType[bs.type]) byType[bs.type] = [];
            byType[bs.type].push(bs);
        }
        const totalPct=Object.values(byPhase).reduce((s,p)=>s+p.pct,0);
        res.json({
            ok:true,today:tk,week:wk,
            totalToday:Object.values(todayRec).reduce((s,v)=>s+v,0),
            totalWeek:Object.values(weekRec).reduce((s,v)=>s+v,0),
            dims,byPhase,
            overallPct:Math.round(totalPct/5),
            tips:dims.filter(d=>d.week===0).slice(0,3).map(d=>'⚠️ '+d.name+' 本週未達成'),
            blindspots:{ total:unique.length, recent:unique.slice(0,5), byType, status: unique.length===0?'✅ 無待處理盲點':'⚠️ 有待清理盲點' }
        });
    }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.get('/api/growth/weekly', (req, res) => {
    const fs = require('fs');
    const wk = weekKey();
    const data = fs.existsSync(GROWTH_AUDIT_FILE) ? JSON.parse(fs.readFileSync(GROWTH_AUDIT_FILE,'utf8')) : {weekly:{}};
    const weekRec = data.weekly[wk]||{};
    const topDims = Object.entries(weekRec).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,c])=>({key:k,name:DIMENSIONS[k]?.name||k,count:c}));
    const expFile = path.join(MEMORY_DIR,'2026-08-09-phase5-exploration.md');
    const exploration = fs.existsSync(expFile) ? fs.readFileSync(expFile,'utf8').match(/領域：(.+)/)?.[1]||'已執行探索' : null;
    res.json({ok:true,weekStart:wk,topDimensions:topDims,totalActions:Object.values(weekRec).reduce((s,v)=>s+v,0),exploration,nextExplore:'下週日 01:30'});
});

app.get('/api/growth/blindspots', (req, res) => {
    const fs = require('fs');
    const blindSpots = [];
    const patterns = [
        { name: '未完成', pattern: /未完成/ },
        { name: '還沒做', pattern: /還沒做/ },
        { name: '待整合', pattern: /待整合/ },
        { name: '計畫中', pattern: /計畫中/ },
    ];
    if (fs.existsSync(MEMORY_DIR)) {
        const files = fs.readdirSync(MEMORY_DIR).filter(f =>
            f.endsWith('.md') &&
            !f.includes('phase5') &&
            !f.startsWith('evening-report-') &&
            !f.startsWith('morning-report-') &&
            !f.startsWith('daily-distill-') &&
            !f.startsWith('weekly-review-') &&
            !f.startsWith('afternoon-report-') &&
            !f.match(/^\d{4}-\d{2}-\d{2}-\d{4}\.md$/)
        );
        for (const file of files) {
            const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const p of patterns) {
                    if (line.includes(p.name) && !line.includes('user:') && !line.includes('assistant:')) {
                        if (!line.match(/^[#\-\*]*\s*user:/) && !line.match(/^「.*」/) && !line.includes('~~')) {
                            blindSpots.push({ file, line: i+1, type: p.name, context: line.trim().substring(0, 100) });
                        }
                    }
                }
            }
        }
    }
    const unique = [];
    const seen = new Set();
    for (const bs of blindSpots) {
        const key = bs.file + ':' + bs.line;
        if (!seen.has(key)) { seen.add(key); unique.push(bs); }
    }
    const byType = {};
    for (const bs of unique) {
        if (!byType[bs.type]) byType[bs.type] = [];
        byType[bs.type].push(bs);
    }
    res.json({ ok: true, total: unique.length, byType, recent: unique.slice(0, 10), status: unique.length === 0 ? '✅ 無待處理盲點' : '⚠️ 有待清理盲點' });
});

// ── Public proxy: /services → unified-home:3848 (no auth required) ───────────
// Public proxy: /api/growth/* → self (public, no auth needed since we handle it above)
app.get('/api/growth/:path', (req, res) => {
    http.get(`http://127.0.0.1:3847/api/growth/${req.params.path}`, { timeout: 5000 }, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Content-Type', 'application/json');
            res.send(data);
        });
    }).on('error', () => res.status(500).json({ error: 'growth API error' }));
});

// ── Public Vault Memory API (no auth required) ──────────────────────────────────
const { execSync } = require('child_process');
const VAULT_VENV = '/Users/openclaw0712/.openclaw/.vault-venv/bin/activate';
const VAULT_PROJECT = '/Users/openclaw0712/.openclaw/workspace/vault-memory';

function vaultJson(args, flags = '') {
    try {
        const vaultBin = path.join(path.dirname(VAULT_VENV), 'vault');
        const extra = flags === 'json' ? ' --json' : flags === 'pretty' ? ' --pretty' : '';
        const cmd = `"${vaultBin}" ${args} --project-dir "${VAULT_PROJECT}"${extra} 2>/dev/null`;
        const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        return JSON.parse(out);
    } catch { return null; }
}

app.get('/api/vault/status', (req, res) => {
    const stats = vaultJson('stats', 'json') || {};
    const candidates = vaultJson('candidates') || {};
    const list = vaultJson('list --layer L2 --max-results 50') || {};
    const growthCandidates = (candidates.candidates || []).filter(c => (c.tags || '').includes('成長系統'));
    const s = stats.stats || stats;
    res.json({
        ok: true,
        vault: { knowledgeCount: s.knowledge_count || s.active_count || 0, dbSize: s.db_size_mb || '0', vectors: s.semantic_vector_count || 0 },
        candidates: { total: candidates.count || 0, growth: growthCandidates.length, items: growthCandidates },
        active: { total: list.length || 0 },
    });
});

app.post('/api/vault/promote', (req, res) => {
    const { candidateId } = req.body || {};
    if (!candidateId) { res.json({ ok: false, error: 'candidateId required' }); return; }
    const result = vaultJson(`promote --confirm "${candidateId}"`, 'pretty');
    res.json({ ok: true, result });
});

app.post('/api/vault/reject', (req, res) => {
    // Vault 不支援直接拒絕候選，候選只會停留在池中直到被晉升
    // 改用 vault delete 移除知識條目
    const { candidateId } = req.body || {};
    if (!candidateId) { res.json({ ok: false, error: 'candidateId required' }); return; }
    const result = vaultJson(`delete "${candidateId}"`, 'pretty');
    res.json({ ok: true, result });
});

app.get('/services', (req, res) => {
    http.get('http://127.0.0.1:3848/services', { timeout: 5000 }, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Content-Type', 'application/json');
            res.send(data);
        });
    }).on('error', () => res.status(500).json({ error: 'unified-home unreachable' }));
});

// ── Public share upload (no auth — for local file sharing) ─────────────────────
const multer = require('multer');
const shareStorage = multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'share'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const shareUpload = multer({ storage: shareStorage });
app.post('/api/share-upload', shareUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ success: true, name: req.file.filename, size: req.file.size });
});
app.get('/share', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'file-share.html')));

// Share file list & download (no auth)
const shareDir = path.join(__dirname, '..', 'public', 'share');
app.get('/api/share-list', (req, res) => {
    const fs = require('fs');
    try {
        const files = fs.readdirSync(shareDir).filter(f => f !== '.gitkeep');
        res.json({ files });
    } catch (e) {
        res.status(500).json({ error: 'Cannot read share folder' });
    }
});
app.get('/api/share-download', (req, res) => {
    const fs = require('fs');
    const file = req.query.file;
    if (!file || file.includes('..')) return res.status(400).json({ error: 'Invalid file' });
    const filePath = path.join(shareDir, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
});

app.delete('/api/share-delete', (req, res) => {
    const fs = require('fs');
    const file = req.query.file;
    if (!file || file.includes('..')) return res.status(400).json({ error: 'Invalid file' });
    const filePath = path.join(shareDir, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync(filePath);
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
const MINIMAX_API_KEY = '***REMOVED***';
const MINIMAX_GROUP_ID = '2024475421608780206';

app.post('/api/ai/chat', async (req, res) => {
    const { model, max_tokens, messages } = req.body;
    try {
        const response = await fetch(`https://api.minimax.io/v1/text/chatcompletion_v2?GroupId=${MINIMAX_GROUP_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MINIMAX_API_KEY}`
            },
            body: JSON.stringify({ model: model || 'MiniMax-Text-01', max_tokens: max_tokens || 1000, messages })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('MiniMax proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Auth middleware (protects everything below)
// ── 璇璣塔羅 Webhook 路由（在 auth 之前，公開） ────────────────────────────
const tarotRouter = require('./routes/tarot');
app.use('/tarot', tarotRouter);

// DISABLED: app.use(authMiddleware);

// APK download: bypass express.static and handle directly to set correct filename
app.use((req, res, next) => {
    if (req.path.endsWith('.apk')) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(shareDir, req.path.split('/').pop());
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            res.set('Content-Type', 'application/vnd.android.package-archive');
            res.set('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
            res.set('Content-Length', stat.size);
            fs.createReadStream(filePath).pipe(res);
            return;
        }
    }
    next();
});

// WASM files: serve manually with correct MIME type (BEFORE static)
app.get('*.wasm', (req, res, next) => {
  const filePath = path.join(__dirname, '..', 'public', req.path);
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
app.use(apiRoutes);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;
