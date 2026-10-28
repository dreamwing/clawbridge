/**
 * Practice Route — 單項練習記錄儲存（不影響等級）
 * 
 * POST /api/practice/save    - 儲存單次練習結果
 * GET  /api/practice/history - 取得練習歷史
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PRACTICES_FILE = path.join(DATA_DIR, 'practices.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadPractices() {
  if (!fs.existsSync(PRACTICES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PRACTICES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function savePractices(records) {
  fs.writeFileSync(PRACTICES_FILE, JSON.stringify(records, null, 2), 'utf8');
}

// ============ POST /save ============
router.post('/save', (req, res) => {
  const { userId, shot, score, date, feedback, shots } = req.body;
  if (!userId || !shot) {
    return res.status(400).json({ error: '缺少必要欄位：userId, shot' });
  }

  const records = loadPractices();
  const newRecord = {
    id: records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1,
    userId: String(userId).substring(0, 64),
    date: date || new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    shot: String(shot).substring(0, 32),
    score: Number(score) || 0,
    feedback: feedback || '',
    shotCount: Number(shots) || 0
  };

  records.push(newRecord);
  savePractices(records);

  res.json({ ok: true, id: newRecord.id });
});

// ============ GET /history ============
router.get('/history', (req, res) => {
  const { userId, days = '90' } = req.query;
  if (!userId) return res.status(400).json({ error: '缺少 userId' });

  const records = loadPractices()
    .filter(r => r.userId === String(userId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(days));
  const recent = records.filter(r => new Date(r.timestamp) >= cutoff);

  // Stats
  const totalSessions = recent.length;
  const avgScore = totalSessions > 0
    ? Math.round(recent.reduce((sum, r) => sum + r.score, 0) / totalSessions)
    : 0;

  // Group by shot
  const byShot = {};
  recent.forEach(r => {
    if (!byShot[r.shot]) byShot[r.shot] = [];
    byShot[r.shot].push(r);
  });

  // Latest trend per shot (latest vs previous)
  const shotTrends = Object.keys(byShot).map(shot => {
    const recs = byShot[shot].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = recs[0];
    const prev = recs[1];
    return {
      shot,
      latestScore: latest.score,
      trend: prev ? latest.score - prev.score : 0,
      count: recs.length,
      history: recs.slice(0, 10).reverse().map(r => ({ date: r.date, score: r.score }))
    };
  });

  res.json({
    ok: true,
    totalSessions,
    avgScore,
    recentCount: recent.length,
    shotTrends,
    byShot,
    records: recent.slice(0, 50)
  });
});

module.exports = router;
