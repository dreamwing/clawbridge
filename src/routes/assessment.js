/**
 * Assessment Route — 實力評估結果儲存與歷史查詢
 * 
 * POST /api/assessment/save   - 儲存單次評估結果
 * GET  /api/assessment/history?userId=xxx - 取得用戶評估歷史
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ASSESSMENTS_FILE = path.join(DATA_DIR, 'assessments.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============ Helper ============
function loadAssessments() {
  if (!fs.existsSync(ASSESSMENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ASSESSMENTS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveAssessments(records) {
  fs.writeFileSync(ASSESSMENTS_FILE, JSON.stringify(records, null, 2), 'utf8');
}

// Generate a simple device fingerprint from user-agent + accept-language
function generateFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  return crypto.createHash('sha256').update(ua + lang).digest('hex').substring(0, 16);
}

// ============ POST /save ============
// Body: { userId, level, total, power, stability, footwork, reaction, fluency, shotCount, date? }
router.post('/save', (req, res) => {
  const { userId, level, total, power, stability, footwork, reaction, fluency, shotCount } = req.body;

  if (!userId || total === undefined) {
    return res.status(400).json({ error: '缺少必要欄位：userId, total' });
  }

  const records = loadAssessments();
  const newRecord = {
    id: records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1,
    userId: String(userId).substring(0, 64),
    date: req.body.date || new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    level: Number(level) || 0,
    total: Number(total),
    power: Number(power) || 0,
    stability: Number(stability) || 0,
    footwork: Number(footwork) || 0,
    reaction: Number(reaction) || 0,
    fluency: Number(fluency) || 0,
    shotCount: Number(shotCount) || 0,
    // For growth trend calculation
    levelScore: calculateLevelScore(total)
  };

  records.push(newRecord);
  saveAssessments(records);

  res.json({ ok: true, id: newRecord.id, levelScore: newRecord.levelScore });
});

// ============ GET /history ============
// Query: ?userId=xxx&days=30
router.get('/history', (req, res) => {
  const { userId, days = '90' } = req.query;

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' });
  }

  const records = loadAssessments()
    .filter(r => r.userId === String(userId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(days));
  const recentRecords = records.filter(r => new Date(r.timestamp) >= cutoff);

  // Calculate level trend (grouped by date)
  const byDate = {};
  recentRecords.forEach(r => {
    if (!byDate[r.date] || r.total > byDate[r.date].total) {
      byDate[r.date] = r;
    }
  });
  const trend = Object.keys(byDate)
    .sort()
    .map(date => ({
      date,
      total: byDate[date].total,
      level: byDate[date].level,
      power: byDate[date].power,
      stability: byDate[date].stability,
      footwork: byDate[date].footwork,
      reaction: byDate[date].reaction,
      fluency: byDate[date].fluency,
      shotCount: byDate[date].shotCount
    }));

  // Latest record
  const latest = records.length > 0 ? records[records.length - 1] : null;

  // Improvement vs first record in period
  let improvement = null;
  if (recentRecords.length >= 2) {
    const first = recentRecords[0];
    const last = recentRecords[recentRecords.length - 1];
    improvement = {
      total: last.total - first.total,
      power: last.power - first.power,
      stability: last.stability - first.stability,
      footwork: last.footwork - first.footwork,
      reaction: last.reaction - first.reaction,
      fluency: last.fluency - first.fluency
    };
  }

  res.json({
    ok: true,
    total: records.length,
    recent: recentRecords.length,
    latest,
    improvement,
    trend,
    byDate
  });
});

// ============ Level Score Helper ============
function calculateLevelScore(total) {
  // Map total score (0-100) to level
  if (total >= 90) return 12;
  if (total >= 85) return 11;
  if (total >= 80) return 10;
  if (total >= 75) return 9;
  if (total >= 70) return 8;
  if (total >= 65) return 7;
  if (total >= 60) return 6;
  if (total >= 55) return 5;
  if (total >= 50) return 4;
  if (total >= 45) return 3;
  if (total >= 40) return 2;
  if (total >= 35) return 1;
  return 0;
}

module.exports = router;
