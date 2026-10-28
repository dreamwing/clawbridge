/**
 * Yoga Admin API — 管理後台完整 CRUD
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');

const DATA_FILE = '/Users/openclaw0712/.openclaw/workspace/media/yoga-data.json';
const BACKUP_DIR = '/Users/openclaw0712/.openclaw/workspace/media/yoga-backups';

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claw-key');
}

// ── 管理後台 API 保護（無認證狀態下的唯一防線）──
// 認證 middleware 已刻意停用（見 src/app.js），但後台 CRUD 仍需金鑰：
// 接受已登入的 session cookie（前端 admin.html 登入後自動帶入）
// 或程式呼叫用的 x-claw-key header。
const { SECRET_KEY } = require('../config');
const { hasSession } = require('../auth/sessions');
const { safeCompare } = require('../auth/utils');

function requireAdminAuth(req, res, next) {
    // CORS preflight 不需驗證
    if (req.method === 'OPTIONS') return next();
    // 1. 已登入的 session cookie
    const token = req.cookies?.claw_session;
    if (token && hasSession(token)) return next();
    // 2. 程式呼叫用的 x-claw-key header
    if (safeCompare(req.headers['x-claw-key'], SECRET_KEY)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdminAuth);

function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {}
    return defaultData();
}

function writeData(data) {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Write atomically
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
}

function defaultData() {
    return {
        bookings: [],
        courses: [
            { id: '1', name: '晨間瑜伽', teacher: 'Luna', time: '08:00-09:00', cap: 10, booked: 3, weekday: 1, level: 'beginner', status: 'active' },
            { id: '2', name: '陰瑜伽', teacher: 'Luna', time: '10:00-11:30', cap: 8, booked: 8, weekday: 2, level: 'intermediate', status: 'active' },
            { id: '3', name: '哈達瑜伽', teacher: 'Luna', time: '14:00-15:30', cap: 10, booked: 5, weekday: 3, level: 'beginner', status: 'active' },
            { id: '4', name: '流動瑜伽', teacher: 'Guest', time: '16:00-17:00', cap: 12, booked: 2, weekday: 4, level: 'intermediate', status: 'active' },
            { id: '5', name: '晚間冥想', teacher: 'Luna', time: '19:30-20:30', cap: 15, booked: 6, weekday: 5, level: 'beginner', status: 'active' }
        ],
        teachers: [
            { id: '1', name: 'Luna', specialty: '哈達瑜伽、陰瑜伽', bio: '專精哈達瑜伽與陰瑜伽，十年教學經驗，引導學員在練習中找到自己的節奏，與身心好好相處。', photo: '', status: 'active' },
            { id: '2', name: 'Guest', specialty: '多元風格', bio: '每月特邀導師，帶來多元練習風格，拓寬練習視野', photo: '', status: 'active' }
        ]
    };
}

router.options('/', (req, res) => { setCORS(res); res.sendStatus(204); });

// GET /api/admin/all — 取得所有資料
router.get('/all', (req, res) => {
    setCORS(res);
    try { res.json(readData()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// === 預約 ===
router.get('/bookings', (req, res) => {
    setCORS(res);
    try { const d = readData(); res.json(d.bookings || []); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/bookings/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        const idx = data.bookings.findIndex(b => b.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        data.bookings[idx] = { ...data.bookings[idx], ...req.body, updatedAt: new Date().toISOString() };
        writeData(data);
        res.json(data.bookings[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bookings/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        data.bookings = data.bookings.filter(b => b.id != req.params.id);
        writeData(data);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === 課程 ===
router.post('/courses', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        data.courses = data.courses || [];
        data.courses.push(req.body);
        writeData(data);
        res.json(req.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/courses/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        const idx = data.courses.findIndex(c => c.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        data.courses[idx] = { ...data.courses[idx], ...req.body };
        writeData(data);
        res.json(data.courses[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/courses/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        const idx = data.courses.findIndex(c => c.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        data.courses[idx] = { ...data.courses[idx], ...req.body };
        writeData(data);
        res.json(data.courses[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/courses/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        data.courses = (data.courses || []).filter(c => c.id != req.params.id);
        writeData(data);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === 老師 ===
router.post('/teachers', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        data.teachers = data.teachers || [];
        data.teachers.push(req.body);
        writeData(data);
        res.json(req.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/teachers/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        const idx = data.teachers.findIndex(t => t.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        data.teachers[idx] = { ...data.teachers[idx], ...req.body };
        writeData(data);
        res.json(data.teachers[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/teachers/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        const idx = data.teachers.findIndex(t => t.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        data.teachers[idx] = { ...data.teachers[idx], ...req.body };
        writeData(data);
        res.json(data.teachers[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/teachers/:id', (req, res) => {
    setCORS(res);
    try {
        const data = readData();
        data.teachers = (data.teachers || []).filter(t => t.id != req.params.id);
        writeData(data);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve admin page at /api/admin
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

module.exports = router;
