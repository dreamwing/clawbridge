/**
 * Courts API — 臨打揪團 CRUD + 報名功能
 * Data stored in JSON files under data/courts.json and data/registrations.json
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COURTS_FILE = path.join(DATA_DIR, 'courts.json');
const REGS_FILE = path.join(DATA_DIR, 'registrations.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCourts() {
  ensureDataDir();
  if (!fs.existsSync(COURTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(COURTS_FILE, 'utf8')); } catch { return []; }
}

function writeCourts(courts) {
  ensureDataDir();
  fs.writeFileSync(COURTS_FILE, JSON.stringify(courts, null, 2), 'utf8');
}

function readRegs() {
  ensureDataDir();
  if (!fs.existsSync(REGS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(REGS_FILE, 'utf8')); } catch { return []; }
}

function writeRegs(regs) {
  ensureDataDir();
  fs.writeFileSync(REGS_FILE, JSON.stringify(regs, null, 2), 'utf8');
}

function nextId(items) {
  if (!items || items.length === 0) return 1;
  return Math.max(...items.map(i => i.id)) + 1;
}

function resOk(res, data) { res.json({ success: true, data }); }
function resErr(res, status, msg) { res.status(status).json({ success: false, error: msg }); }

// ── CORS preflight (already handled in app.js, but courts may be called from other origins) ──
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── GET /api/courts ────────────────────────────────────────────────────────────
// Query params: ?creator=:userId  ?joined=:userId
router.get('/', (req, res) => {
  try {
    const { creator, joined } = req.query;
    let courts = readCourts();
    const regs = readRegs();

    if (creator) {
      courts = courts.filter(c => c.creator === creator);
    }

    if (joined) {
      const joinedIds = new Set(regs.filter(r => r.userId === joined).map(r => r.courtId));
      courts = courts.filter(c => joinedIds.has(c.id));
    }

    // Attach currentPeople (computed from registrations)
    courts = courts.map(c => ({
      ...c,
      currentPeople: regs.filter(r => r.courtId === c.id).length
    }));

    resOk(res, courts);
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── POST /api/courts ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, mapsUrl, date, time, endTime, fee, maxPeople, registerUrl, note, creator, levelMin, levelMax, region, city, district } = req.body;

    if (!name || !date || !time || !maxPeople || !creator) {
      return resErr(res, 400, '缺少必要欄位：name, date, time, maxPeople, creator');
    }

    const courts = readCourts();
    const newCourt = {
      id: nextId(courts),
      name: String(name).trim(),
      mapsUrl: String(mapsUrl || '').trim(),
      date: String(date).trim(),
      time: String(time).trim(),
      endTime: String(endTime || '').trim(),
      fee: String(fee || '').trim(),
      maxPeople: parseInt(maxPeople, 10),
      registerUrl: String(registerUrl || '').trim(),
      note: String(note || '').trim(),
      creator: String(creator).trim(),
      levelMin: parseInt(levelMin, 10) || 0,
      levelMax: parseInt(levelMax, 10) || 18,
      region: String(region || '').trim(),
      city: String(city || '').trim(),
      district: String(district || '').trim(),
      createdAt: new Date().toISOString().split('T')[0]
    };

    courts.push(newCourt);
    writeCourts(courts);

    // currentPeople 從報名資料計算，一開始為 0
    const result = { ...newCourt, currentPeople: 0 };
    resOk(res, result);
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── GET /api/courts/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const courts = readCourts();
    const regs = readRegs();
    const court = courts.find(c => c.id === parseInt(req.params.id, 10));

    if (!court) return resErr(res, 404, '找不到這個揪團');

    const courtRegs = regs.filter(r => r.courtId === court.id);
    resOk(res, { ...court, currentPeople: courtRegs.length, registrations: courtRegs });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── PUT /api/courts/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const courts = readCourts();
    const idx = courts.findIndex(c => c.id === parseInt(req.params.id, 10));

    if (idx === -1) return resErr(res, 404, '找不到這個揪團');

    const allowed = ['name', 'mapsUrl', 'date', 'time', 'endTime', 'fee', 'maxPeople', 'registerUrl', 'note', 'levelMin', 'levelMax', 'region', 'city', 'district'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    courts[idx] = { ...courts[idx], ...updates };
    writeCourts(courts);

    const regs = readRegs();
    resOk(res, { ...courts[idx], currentPeople: regs.filter(r => r.courtId === courts[idx].id).length });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── DELETE /api/courts/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    let courts = readCourts();
    let regs = readRegs();
    const id = parseInt(req.params.id, 10);

    const before = courts.length;
    courts = courts.filter(c => c.id !== id);
    if (courts.length === before) return resErr(res, 404, '找不到這個揪團');

    // Cascade delete registrations
    const beforeRegs = regs.length;
    regs = regs.filter(r => r.courtId !== id);

    writeCourts(courts);
    writeRegs(regs);

    resOk(res, { deleted: id, registrationsRemoved: beforeRegs - regs.length });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── POST /api/courts/:id/join ────────────────────────────────────────────────
router.post('/:id/join', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return resErr(res, 400, 'userId 是必填欄位');

    const courts = readCourts();
    const regs = readRegs();
    const courtId = parseInt(req.params.id, 10);
    const court = courts.find(c => c.id === courtId);

    if (!court) return resErr(res, 404, '找不到這個揪團');

    const currentCount = regs.filter(r => r.courtId === courtId).length;
    if (currentCount >= court.maxPeople) return resErr(res, 409, '揪團已額滿');

    const already = regs.find(r => r.courtId === courtId && r.userId === String(userId).trim());
    if (already) return resErr(res, 409, '已經報名過了');

    const newReg = {
      id: nextId(regs),
      courtId,
      userId: String(userId).trim(),
      name: req.body.name ? String(req.body.name).trim() : '',
      level: req.body.level !== undefined ? parseInt(req.body.level, 10) : 0,
      joinedAt: new Date().toISOString().split('T')[0]
    };
    regs.push(newReg);
    writeRegs(regs);

    resOk(res, { ...newReg, currentPeople: regs.filter(r => r.courtId === courtId).length });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── DELETE /api/courts/:id/leave ─────────────────────────────────────────────
router.delete('/:id/leave', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return resErr(res, 400, 'userId 是必填欄位');

    let regs = readRegs();
    const courtId = parseInt(req.params.id, 10);
    const userIdStr = String(userId).trim();

    const before = regs.length;
    regs = regs.filter(r => !(r.courtId === courtId && r.userId === userIdStr));

    if (regs.length === before) return resErr(res, 404, '找不到這個報名記錄');

    writeRegs(regs);

    resOk(res, { left: courtId, currentPeople: regs.filter(r => r.courtId === courtId).length });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

// ── GET /api/courts/user-level?userId= ────────────────────────────────────────
// Returns the user's level from the most recent court registration (for pre-filling join modal)
router.get('/user-level', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return resErr(res, 400, 'userId 是必填');

    const regs = readRegs();
    // Find most recent registration with level data for this user
    const userRegs = regs
      .filter(r => r.userId === String(userId).trim() && r.level !== undefined && r.level > 0)
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));

    if (userRegs.length === 0) {
      return resOk(res, { level: 0, name: '' });
    }

    resOk(res, { level: userRegs[0].level, name: userRegs[0].name || '' });
  } catch (e) {
    resErr(res, 500, e.message);
  }
});

module.exports = router;
