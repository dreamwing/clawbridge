/**
 * Growth System Route
 * 成長系統 × ClawBridge 整合
 * 
 * GET /api/growth/status     - 成長維度達成率
 * GET /api/growth/weekly      - 本週探索報告
 * GET /api/growth/blindspots  - 盲點清單
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, '.openclaw', 'workspace');
const GROWTH_AUDIT_FILE = path.join(WORKSPACE, 'memory', 'growth', 'growth-audit.json');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const SCRIPTS_DIR = path.join(WORKSPACE, 'scripts');

// ============ 維度定義 ============
const DIMENSIONS = {
  G1: { name: 'G1-連結過去', desc: '有連結老闆過去說過的話', weight: 1, phase: 1 },
  P1: { name: 'P1-預判問題', desc: '老闆問之前先看見問題', weight: 1, phase: 1 },
  P2: { name: 'P2-主動預判', desc: '老闆問 A 主動提 B', weight: 1, phase: 1 },
  P3: { name: 'P3-系統異常', desc: '異常時主動報告', weight: 1, phase: 1 },
  P4: { name: 'P4-看見需要', desc: '先做再說（低風險）', weight: 1, phase: 1 },
  F1: { name: 'F1-不知道', desc: '直接說不知道', weight: 1, phase: 2 },
  F2: { name: 'F2-犯錯承認', desc: '第一時間承認', weight: 1, phase: 2 },
  F3: { name: 'F3-真正判斷', desc: '主動說值得/不值得', weight: 1, phase: 2 },
  F4: { name: 'F4-敢於反對', desc: '有實質不同觀點時說', weight: 1, phase: 2 },
  G3: { name: 'G3-三省', desc: '每三省找到被遺忘的線索', weight: 1, phase: 3 },
  G4: { name: 'G4-新主題連結', desc: '提到新主題時連結舊主題', weight: 1, phase: 3 },
  E1: { name: 'E1-主動探索', desc: '不等問題，主動探索未知領域', weight: 2, phase: 5 },
  E2: { name: 'E2-盲點偵測', desc: '主動發現提及但未實作的項目', weight: 2, phase: 5 },
  E3: { name: 'E3-跨系統連結', desc: '成長系統 × 其他系統主動整合', weight: 2, phase: 5 },
};

const PHASE_NAMES = {
  1: '觸發與三省',
  2: '防衰退+真學習',
  3: '生長引擎',
  4: '預測+ROI報告',
  5: '主動進化型',
};

// ============ Helper Functions ============

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function weekKey() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  return monday.toISOString().split('T')[0];
}

function loadGrowthData() {
  try {
    if (fs.existsSync(GROWTH_AUDIT_FILE)) {
      return JSON.parse(fs.readFileSync(GROWTH_AUDIT_FILE, 'utf8'));
    }
  } catch (e) {}
  return { daily: {}, weekly: {}, marks: {} };
}

function getBlindSpots() {
  const blindSpots = [];
  const patterns = [
    { name: '未完成', pattern: /未完成/ },
    { name: '還沒做', pattern: /還沒做/ },
    { name: '待整合', pattern: /待整合/ },
    { name: '計畫中', pattern: /計畫中/ },
  ];

  if (fs.existsSync(MEMORY_DIR)) {
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') && !f.includes('phase5'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
      const lines = content.split('\n');
      
      // 只找真正有意義的盲點（不是對話記錄）
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const p of patterns) {
          if (line.includes(p.name) && !line.includes('user:') && !line.includes('assistant:')) {
            // 排除對話記錄中的用戶提問
            if (!line.match(/^[#\-\*]*\s*user:/) && !line.match(/^「.*」/) ) {
              blindSpots.push({
                file,
                line: i + 1,
                type: p.name,
                context: line.trim().substring(0, 100)
              });
            }
          }
        }
      }
    }
  }

  // 去重
  const unique = [];
  const seen = new Set();
  for (const bs of blindSpots) {
    const key = bs.file + ':' + bs.line;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(bs);
    }
  }
  return unique;
}

// ============ API Endpoints ============

/**
 * GET /api/growth/status
 * 成長維度達成率
 */
router.get('/api/growth/status', (req, res) => {
  try {
    const data = loadGrowthData();
    const tk = todayKey();
    const wk = weekKey();
    
    const todayRecords = data.daily[tk] || {};
    const weekRecords = data.weekly[wk] || {};
    
    // 計算每個維度的達成情況
    const dimensions = Object.entries(DIMENSIONS).map(([key, dim]) => {
      const today = todayRecords[key] || 0;
      const week = weekRecords[key] || 0;
      const total = data.marks?.[key] || 0;
      
      return {
        key,
        name: dim.name,
        desc: dim.desc,
        phase: dim.phase,
        today,
        week,
        total,
        score: week > 0 ? Math.min(100, week * 20) : 0, // 每有一次 +20 分
      };
    });

    // 按 Phase 分組
    const byPhase = {};
    for (let p = 1; p <= 5; p++) {
      const phaseDims = dimensions.filter(d => d.phase === p);
      const totalScore = phaseDims.reduce((s, d) => s + d.score, 0);
      const maxScore = phaseDims.length * 100;
      byPhase[p] = {
        name: PHASE_NAMES[p],
        dimensions: phaseDims,
        score: totalScore,
        maxScore,
        percentage: maxScore > 0 ? Math.round(totalScore / maxScore * 100) : 0,
      };
    }

    // 雷達圖資料（標準化到 0-100）
    const radarData = dimensions.map(d => ({
      axis: d.name,
      value: d.score,
    }));

    // 計算 overallPct（所有維度的平均分數）
    const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
    const maxTotalScore = dimensions.length * 100;
    const overallPct = maxTotalScore > 0 ? Math.round(totalScore / maxTotalScore * 100) : 0;

    res.json({
      ok: true,
      today: tk,
      weekStart: wk,
      week: wk, // 供前端 growth.html 使用
      totalToday: Object.values(todayRecords).reduce((s, v) => s + v, 0),
      totalWeek: Object.values(weekRecords).reduce((s, v) => s + v, 0),
      overallPct,
      dimensions,
      byPhase,
      radarData,
      tips: dimensions.filter(d => d.week === 0).map(d => `⚠️ ${d.name} 本週還沒達成`),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/growth/weekly
 * 本週探索報告
 */
router.get('/api/growth/weekly', (req, res) => {
  try {
    // 讀取最新的探索報告
    const explorationFile = path.join(MEMORY_DIR, '2026-08-09-phase5-exploration.md');
    
    let exploration = null;
    if (fs.existsSync(explorationFile)) {
      const content = fs.readFileSync(explorationFile, 'utf8');
      // 簡單解析
      const area = content.match(/領域：(.+)/)?.[1] || '未知';
      const actions = content.match(/行動：\n([\s\S]+?)\n\n/)?.pop()?.split('\n').filter(Boolean) || [];
      
      exploration = {
        area,
        actions,
        timestamp: fs.statSync(explorationFile).mtime.toISOString(),
      };
    }

    // 讀取生長審計本週數據
    const data = loadGrowthData();
    const wk = weekKey();
    const weekRecords = data.weekly[wk] || {};
    
    // 計算本週TOP維度
    const topDims = Object.entries(weekRecords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({
        key,
        name: DIMENSIONS[key]?.name || key,
        count,
      }));

    res.json({
      ok: true,
      weekStart: wk,
      exploration,
      topDimensions: topDims,
      totalActions: Object.values(weekRecords).reduce((s, v) => s + v, 0),
      nextExplore: '下週日 01:30 自動執行',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/growth/blindspots
 * 盲點清單
 */
router.get('/api/growth/blindspots', (req, res) => {
  try {
    const blindSpots = getBlindSpots();
    
    // 按類型分組
    const byType = {};
    for (const bs of blindSpots) {
      if (!byType[bs.type]) byType[bs.type] = [];
      byType[bs.type].push(bs);
    }

    res.json({
      ok: true,
      total: blindSpots.length,
      byType,
      recent: blindSpots.slice(0, 10), // 最近10項
      status: blindSpots.length === 0 ? '✅ 無待處理盲點' : '⚠️ 有待清理盲點',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
