/**
 * Yoga Booking JSONBin Proxy — CORS-safe API route
 * 
 * Serves as a proxy to JSONBin to avoid CORS issues when called from
 * static GitHub Pages sites (openclaw0712.github.io/yoga-pink-booking)
 */
const router = require('express').Router();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Backup storage path (accessible via files.myclawdomain.ccwu.cc)
const BACKUP_DIR = '/Users/openclaw0712/.openclaw/workspace/media/yoga-backups';

// CORS headers for all responses
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// JSONBin backend URL
const BIN_BACKEND = 'https://jsonbin-zeta.vercel.app/api/bins';

// Path to store bin ID for yoga booking
const BIN_ID_PATH = path.join('/tmp', 'yoga_booking_bin_id.json');

// Helper: read bin ID
function readBinId() {
    try {
        if (fs.existsSync(BIN_ID_PATH)) {
            const data = JSON.parse(fs.readFileSync(BIN_ID_PATH, 'utf8'));
            return data.binId || null;
        }
    } catch (e) {}
    return null;
}

// Helper: write bin ID
function writeBinId(binId) {
    fs.writeFileSync(BIN_ID_PATH, JSON.stringify({ binId, updated: new Date().toISOString() }));
}

// OPTIONS preflight
router.options('/', (req, res) => {
    setCORS(res);
    res.sendStatus(204);
});

// GET /api/yoga — read data (returns JSON)
router.get('/', (req, res) => {
    setCORS(res);
    const binId = readBinId();

    if (!binId) {
        return res.json({ 
            courses: defaultCourses(), 
            users: [], 
            bookings: [], 
            waitlist: [] 
        });
    }

    const axios = require('axios');
    axios.get(BIN_BACKEND + '/' + binId)
        .then(r => res.json(r.data))
        .catch(() => {
            res.json({ courses: defaultCourses(), users: [], bookings: [], waitlist: [] });
        });
});

// POST /api/yoga/bin — create new bin
router.post('/', (req, res) => {
    setCORS(res);
    const axios = require('axios');
    const data = req.body || { courses: defaultCourses(), users: [], bookings: [], waitlist: [] };

    axios.post(BIN_BACKEND, data, {
        headers: { 'Content-Type': 'application/json' }
    }).then(r => {
        if (r.data && r.data.id) {
            writeBinId(r.data.id);
        }
        res.json(r.data);
    }).catch(e => {
        res.status(500).json({ error: 'Failed to create bin', detail: e.message });
    });
});

// PUT /api/yoga/bin — update existing bin
router.put('/', (req, res) => {
    setCORS(res);
    const binId = readBinId();
    if (!binId) {
        // Auto-create if no bin ID
        const axios = require('axios');
        const data = req.body || { courses: defaultCourses(), users: [], bookings: [], waitlist: [] };
        return axios.post(BIN_BACKEND, data, { headers: { 'Content-Type': 'application/json' } })
            .then(r => {
                if (r.data && r.data.id) writeBinId(r.data.id);
                res.json(r.data);
            })
            .catch(e => res.status(500).json({ error: e.message }));
    }

    try {
        const axios = require('axios');
        axios.put(BIN_BACKEND + '/' + binId, req.body, {
            headers: { 'Content-Type': 'application/json' }
        }).then(r => res.json(r.data))
          .catch(e => res.status(500).json({ error: e.message }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/yoga/bin — clear bin ID
router.delete('/', (req, res) => {
    setCORS(res);
    if (fs.existsSync(BIN_ID_PATH)) fs.unlinkSync(BIN_ID_PATH);
    res.json({ ok: true });
});


// Ensure backup dir exists
function ensureBackupDir(){
  if(!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, {recursive:true});
}

// GET /api/yoga/backups — list all backup files
router.get('/backups', (req, res) => {
  setCORS(res);
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, date: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ backups: files });
});

// POST /api/yoga/backup — save new backup
router.post('/backup', (req, res) => {
  setCORS(res);
  ensureBackupDir();
  const data = req.body;
  if(!data || !data.courses) return res.status(400).json({ error: 'Invalid data' });
  const filename = 'yoga-backup-' + new Date().toISOString().slice(0,19).replace(/[T:]/g,'-') + '.json';
  fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(data, null, 2));
  res.json({ ok: true, filename: filename, url: '/yoga-backups/' + filename });
});

// GET /api/yoga/backup/:filename — download a specific backup
router.get('/backup/:filename', (req, res) => {
  setCORS(res);
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(BACKUP_DIR, safeName);
  if(!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '"');
  res.send(fs.readFileSync(filePath));
});

// DELETE /api/yoga/backup/:filename — delete a backup
router.delete('/backup/:filename', (req, res) => {
  setCORS(res);
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(BACKUP_DIR, safeName);
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// Default course data
function defaultCourses() {
    return [
        { id: 1, name: '晨間瑜伽', teacher: 'Luna', time: '08:00-09:00', cap: 10, booked: 3, status: 'active', weekday: 1 },
        { id: 2, name: '陰瑜伽', teacher: 'Luna', time: '10:00-11:30', cap: 8, booked: 8, status: 'active', weekday: 2 },
        { id: 3, name: '哈達瑜伽', teacher: 'Luna', time: '14:00-15:30', cap: 10, booked: 5, status: 'active', weekday: 3 },
        { id: 4, name: '流動瑜伽', teacher: 'Guest', time: '16:00-17:00', cap: 12, booked: 2, status: 'active', weekday: 4 },
        { id: 5, name: '晚間冥想', teacher: 'Luna', time: '19:30-20:30', cap: 15, booked: 6, status: 'active', weekday: 5 }
    ];
}

module.exports = router;
