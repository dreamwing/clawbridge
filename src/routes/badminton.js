/**
 * Badminton Analysis Route — 羽球分析報告 API
 *
 * 整合 badminton_ai_coach.py 的分析模組，
 * 為 assessment.html（實力評估）和 single-practice.html（單項練習）
 * 提供統一的報告產生介面。
 *
 * POST /api/badminton/assessment  實力評估報告
 * POST /api/badminton/practice    單項練習報告
 */

const router = require('express').Router();
const { execSync, spawn } = require('child_process');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const WORKSPACE = process.env.OPENCLAW_WORKSPACE ||
    path.join(process.env.HOME, '.openclaw', 'workspace');
const PY_SCRIPT = path.join(
    WORKSPACE,
    'badminton-coach-app',
    'scripts',
    'badminton_ai_coach.py'
);

// ── Raw pose_data 日誌（2026-08-31）───────────────────────────
const LOG_DIR = path.join(WORKSPACE, 'logs');
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(e) {}
const SKELETON_RAW_LOG = path.join(LOG_DIR, 'skeleton-raw-data.log');
function logSkeletonRaw(pose_data, extra = {}) {
    try {
        const firstFrame = pose_data[0] || {};
        const kps = (firstFrame.person && firstFrame.person.keypoints) ? firstFrame.person.keypoints : [];
        const entry = JSON.stringify({
            ts: new Date().toISOString(),
            frame_count: pose_data.length,
            sample_kps: kps.slice(0, 5).map(k => ({ n: k.name, n_type: typeof k.name, x: k.x, y: k.y })),
            total_kps_per_frame: kps.length,
            all_kp_names: kps.map(k => k.name),
            ...extra
        }) + '\n';
        fs.appendFileSync(SKELETON_RAW_LOG, entry);
    } catch(e) {}
}

const DETECT_SCRIPT = path.join(
    WORKSPACE,
    'badminton-coach-app',
    'scripts',
    'detect_players.py'
);

// Multer: 影片上傳暫存
const uploadDir = os.tmpdir();
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    fileFilter: (req, file, cb) => {
        // 接受所有常見影片格式
        const allowed = ['video/mp4','video/quicktime','video/x-m4v',
                         'video/mpeg','video/webm','video/x-msvideo',''];
        const ext = file.originalname.toLowerCase();
        const isVideo = allowed.includes(file.mimetype) ||
                        ext.endsWith('.mp4') || ext.endsWith('.mov') ||
                        ext.endsWith('.m4v') || ext.endsWith('.avi') ||
                        ext.endsWith('.webm') || ext.endsWith('.mpeg');
        if (isVideo) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed: ' + file.originalname));
        }
    }
});


// Image upload for yolo-pose (accepts images only, 20MB max)
const uploadImage = multer({
    dest: uploadDir,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg','image/png','image/webp','image/jpg',''];
        const ext = file.originalname.toLowerCase();
        const isImage = allowed.includes(file.mimetype) ||
                        ext.endsWith('.jpg') || ext.endsWith('.jpeg') ||
                        ext.endsWith('.png') || ext.endsWith('.webp');
        if (isImage) { cb(null, true); }
        else { cb(new Error('Only image files are allowed: ' + file.originalname)); }
    }
});
// ---------------------------------------------------------------------------
// Helper: run Python module as JSON-RPC style
// ---------------------------------------------------------------------------
function runBadmintonScript(mode, inputData) {
    const PYTHON = '/opt/homebrew/bin/python3';
    return new Promise((resolve, reject) => {
        const args = [PY_SCRIPT, '--mode', mode, '--input', JSON.stringify(inputData)];
        const proc = spawn(PYTHON, args, {
            cwd: path.dirname(PY_SCRIPT),
            timeout: 30000,
            maxBuffer: 2 * 1024 * 1024,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => (stdout += d));
        proc.stderr.on('data', d => (stderr += d));
        proc.on('close', code => {
            if (code !== 0) {
                console.error('[Badminton API] Python error:', stderr);
                return reject(new Error(stderr || `Python exit code ${code}`));
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                // If not JSON, return raw text
                resolve({ raw: stdout, mode });
            }
        });
        proc.on('error', err => reject(err));
    });
}

// ---------------------------------------------------------------------------
// POST /api/badminton/assessment
// Body: { mode:"assessment", scores?, pose_data?, hit_data? }
// Returns: 實力評估報告（四維分數 + 等級 + 瓶頸 + 建議）
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

// ========================================================================
// 非同步 Job 系統（yolo-assessment 輪詢模式）
// ========================================================================

const jobStore = new Map(); // jobId → { status, progress, result, error, createdAt }

// 定期清理 1 小時前的 completed/failed jobs
setInterval(() => {
    const ONE_HOUR = 60 * 60 * 1000;
    for (const [jobId, job] of jobStore.entries()) {
        if ((job.status === 'COMPLETED' || job.status === 'FAILED') &&
            (Date.now() - job.createdAt) > ONE_HOUR) {
            jobStore.delete(jobId);
        }
    }
}, 10 * 60 * 1000);

// 檢查影片時長，超過 MAX_DURATION 秒則裁切
const MAX_DURATION = 100; // 秒
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const FFMPEG  = '/opt/homebrew/bin/ffmpeg';

function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        const proc = spawn(FFPROBE, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let out = '';
        proc.stdout.on('data', d => { out += d; });
        proc.on('close', code => {
            if (code === 0) resolve(parseFloat(out.trim()) || 0);
            else resolve(0);
        });
        proc.on('error', () => resolve(0));
    });
}

function trimVideo(inputPath, outputPath, maxSeconds) {
    return new Promise((resolve, reject) => {
        const proc = spawn(FFMPEG, [
            '-y',
            '-i', inputPath,
            '-t', String(maxSeconds),
            '-c', 'copy',          // copy codec（快速，不重新編碼）
            '-avoid_negative_ts', 'make_zero',
            outputPath
        ]);
        let err = '';
        proc.stderr.on('data', d => { err += d; });
        proc.on('close', code => {
            if (code === 0) resolve(true);
            else reject(new Error(err.slice(-300)));
        });
        proc.on('error', e => reject(e));
    });
}

async function startYoloAnalysisJob(videoPath, playerId, jobId) {
    const PYTHON = '/opt/homebrew/bin/python3';
    const ANALYZE_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'analyze_video_yolo.py');
    const DATA_DIR = path.join(WORKSPACE, 'badminton-coach-app', 'data');
    const OUTPUT_JSON = path.join(DATA_DIR, `yolo_result_${jobId}.json`);
    const TRIMMED_VIDEO = path.join(DATA_DIR, `yolo_trimmed_${jobId}.mp4`);

    jobStore.set(jobId, { status: 'PROCESSING', progress: 0, result: null, error: null, createdAt: Date.now() });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // ── 先把上傳的暫存檔複製到 DATA_DIR，避免被 multer 清理掉 ──
    const videoBasename = path.basename(videoPath);
    const persistentVideo = path.join(DATA_DIR, `upload_${jobId}_${videoBasename}`);
    try {
        fs.copyFileSync(videoPath, persistentVideo);
        console.log(`[Badminton Job ${jobId}] 已複製影片至: ${persistentVideo}`);
    } catch (e) {
        console.warn(`[Badminton Job ${jobId}] 複製影片失敗，使用原始路徑: ${e.message}`);
        // 如果複製失敗，仍然使用原始路徑
    }
    const videoForAnalysis = fs.existsSync(persistentVideo) ? persistentVideo : videoPath;

    // ── 裁切超過 100 秒的影片 ──
    let videoToAnalyze = videoForAnalysis;
    try {
        const duration = await getVideoDuration(videoForAnalysis);
        if (duration > MAX_DURATION) {
            console.log(`[Badminton Job ${jobId}] 影片 ${duration.toFixed(1)}s > ${MAX_DURATION}s，裁切至前 ${MAX_DURATION} 秒...`);
            await trimVideo(videoPath, TRIMMED_VIDEO, MAX_DURATION);
            videoToAnalyze = TRIMMED_VIDEO;
            console.log(`[Badminton Job ${jobId}] 裁切完成: ${TRIMMED_VIDEO}`);
        } else {
            console.log(`[Badminton Job ${jobId}] 影片 ${duration.toFixed(1)}s，無需裁切`);
        }
    } catch (e) {
        console.warn(`[Badminton Job ${jobId}] 裁切失敗，使用原始影片: ${e.message}`);
    }

    const args = [ANALYZE_SCRIPT, videoToAnalyze, '--output', OUTPUT_JSON, '--sample-interval', '5'];
    if (playerId) args.push('--player-id', playerId);

    console.log(`[Badminton Job ${jobId}] 啟動分析... video=${videoToAnalyze}`);
    console.log(`[Badminton Job ${jobId}] 命令: ${PYTHON} ${args.join(' ')}`);
    console.log(`[Badminton Job ${jobId}] 影片存在? ${fs.existsSync(videoToAnalyze)}`);
    if (fs.existsSync(videoToAnalyze)) {
        console.log(`[Badminton Job ${jobId}] 影片大小: ${(fs.statSync(videoToAnalyze).size / 1024 / 1024).toFixed(2)} MB`);
    }

    // 🚨 5 分鐘 timeout，防止 Python 永遠 hang 住
    const TIMEOUT_MS = 5 * 60 * 1000;
    const timeoutTimer = setTimeout(() => {
        if (proc && !proc.killed) {
            console.error(`[Badminton Job ${jobId}] ⏰ Python 超時（${TIMEOUT_MS/1000}s），強制終止`);
            proc.kill('SIGKILL');
            jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: `分析超時（${TIMEOUT_MS/1000}秒），請嘗試較短的影片`, createdAt: Date.now() });
        }
    }, TIMEOUT_MS);

    const proc = spawn(PYTHON, args, { cwd: path.dirname(ANALYZE_SCRIPT) });
    let stderr = '', stdout = '';
    proc.stderr.on('data', d => { stderr += d; });
    proc.stdout.on('data', d => { stdout += d; });
    proc.on('close', code => {
        clearTimeout(timeoutTimer);
        if (code === 0 && fs.existsSync(OUTPUT_JSON)) {
            try {
                const analysisResult = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
                const phase3 = analysisResult ? analysisResult.phase3_report : null;
                const overall = phase3 ? phase3.overall : null;
                const dims = phase3 ? phase3.dimensions : {};
                const isInsufficientData = phase3 && phase3.report_status === 'insufficient_data';
                // 🔍 DEBUG: 2026-08-29 維度診斷
                console.log('[Badminton API] dims from Python:', JSON.stringify(dims));
                console.log('[Badminton API] overall:', JSON.stringify(overall));
                const result = {
                    ok: true,
                    ability_score: overall ? Math.round(overall.total_score || 0) : 0,
                    ability_level: isInsufficientData ? -1 : (overall ? (overall.grade || 0) : 0) || 0,
                    title: isInsufficientData ? '無法評估' : (overall ? (overall.grade_name || '') : '未知'),
                    subtitle: isInsufficientData ? '偵測到 0 次擊球，請重新拍攝' : (overall ? (overall.grade_description || '') : ''),
                    new_system: {
                        total_score: isInsufficientData ? 0 : (overall ? (overall.total_score || 0) : 0),
                        level: isInsufficientData ? -1 : (overall ? (overall.grade || 0) : 0),
                        level_name: isInsufficientData ? '無法評估' : (overall ? (overall.grade_name || '') : '未知'),
                        level_desc: isInsufficientData ? '偵測到 0 次擊球，請重新拍攝' : (overall ? (overall.grade_description || '') : ''),
                        insufficient_data: isInsufficientData,
                        confidence: phase3 ? (phase3.confidence || 0) : 0,
                        shot_diversity_score: overall ? (overall.shot_diversity_score || 0) : 0,
                        hit_type_distribution: overall ? (overall.hit_type_distribution || {}) : {},
                        distinct_shot_types: overall ? (overall.distinct_shot_types || 0) : 0,
                        dimensions: {
                            power: Math.min(100, Math.max(0, Math.round(dims.power?.score ?? 50))),
                            stability: Math.min(100, Math.max(0, Math.round(dims.stability?.score ?? 50))),
                            footwork: Math.min(100, Math.max(0, Math.round(dims.footwork?.score ?? 30))),
                            fluency: Math.min(100, Math.max(0, Math.round(dims.fluency?.score ?? 50))),
                            reaction: Math.min(100, Math.max(0, Math.round(dims.reaction?.score ?? 40))),
                            shot_diversity: Math.min(100, Math.max(0, Math.round(dims.shot_diversity?.score ?? 50))),
                        },
                        // 六維雷達圖（2026-09-01）
                        radar_labels: ['力道', '穩定', '步法', '流暢', '反應', '球路'],
                        radar_scores: [
                            Math.min(100, Math.max(0, Math.round(dims.power?.score ?? 50))),
                            Math.min(100, Math.max(0, Math.round(dims.stability?.score ?? 50))),
                            Math.min(100, Math.max(0, Math.round(dims.footwork?.score ?? 30))),
                            Math.min(100, Math.max(0, Math.round(dims.fluency?.score ?? 50))),
                            Math.min(100, Math.max(0, Math.round(dims.reaction?.score ?? 40))),
                            Math.min(100, Math.max(0, Math.round(dims.shot_diversity?.score ?? 50))),
                        ],
                        radar_colors: [
                            'var(--primary)',
                            'var(--accent)',
                            '#10B981',
                            '#F59E0B',
                            '#8B5CF6',
                        ],
                        pose_detection: analysisResult ? analysisResult.pose_detection : null,
                        phase1: analysisResult ? analysisResult.phase1_displacement : null,
                        phase2: analysisResult ? analysisResult.phase2_hits : null,
                        suggestions: phase3 ? phase3.suggestions : [],
                        bottleneck: (() => {
                            if (!phase3 || !phase3.bottleneck) return null;
                            const dimScoreMap = {
                                '擊球爆發力': Math.min(100, Math.max(0, Math.round(dims.power?.score ?? 50))),
                                '姿勢穩定度': Math.min(100, Math.max(0, Math.round(dims.stability?.score ?? 50))),
                                '步法覆蓋率': Math.min(100, Math.max(0, Math.round(dims.footwork?.score ?? 30))),
                                '反應速度': Math.min(100, Math.max(0, Math.round(dims.reaction?.score ?? 40))),
                                '動作協調度': Math.min(100, Math.max(0, Math.round(dims.fluency?.score ?? 50))),

                            };
                            return phase3.bottleneck.map(item => ({
                                factor: item.factor || item.dimension || '',   // 維度名稱
                                score: dimScoreMap[item.factor] ?? 0,        // 真正維度分數
                                description: item.description || '',
                            }));
                        })(),
                    },
                    timestamp: new Date().toISOString(),
                };
                jobStore.set(jobId, { status: 'COMPLETED', progress: 100, result, error: null, createdAt: Date.now() });
                console.log('[Badminton Job ' + jobId + '] 完成');
            } catch (e) {
                jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: '結果解析失敗: ' + e.message, createdAt: Date.now() });
            }
        } else {
            jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: stderr || stdout || `Exit ${code}`, createdAt: Date.now() });
            console.error(`[Badminton Job ${jobId}] 失敗 (code=${code}):`, stderr || stdout || '無輸出');
        }
        // 清理原始上傳檔
        fs.unlink(videoPath, () => {});
        // 清理我們複製的持久化檔案
        if (fs.existsSync(persistentVideo)) {
            fs.unlink(persistentVideo, () => {});
        }
        // 清理裁切後的影片（若與原始不同）
        if (videoToAnalyze !== videoPath && videoToAnalyze !== persistentVideo && fs.existsSync(videoToAnalyze)) {
            fs.unlink(videoToAnalyze, () => {});
        }
    });
}

// ────────────────────────────────────────────────────────────────────────
// startPracticeAnalysisJob — 單項練習非同步任務
// 流程與 startYoloAnalysisJob 相同，但結果轉換為單項練習報告格式
// ────────────────────────────────────────────────────────────────────────
async function startPracticeAnalysisJob(videoPath, playerId, shotType, jobId) {
    const PYTHON = '/opt/homebrew/bin/python3';
    const ANALYZE_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'analyze_video_yolo.py');
    const DATA_DIR = path.join(WORKSPACE, 'badminton-coach-app', 'data');
    const OUTPUT_JSON = path.join(DATA_DIR, `yolo_result_${jobId}.json`);
    const TRIMMED_VIDEO = path.join(DATA_DIR, `yolo_trimmed_${jobId}.mp4`);

    jobStore.set(jobId, { status: 'PROCESSING', progress: 0, result: null, error: null, createdAt: Date.now() });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const videoBasename = path.basename(videoPath);
    const persistentVideo = path.join(DATA_DIR, `upload_${jobId}_${videoBasename}`);
    try {
        fs.copyFileSync(videoPath, persistentVideo);
        console.log(`[Badminton Practice Job ${jobId}] 已複製影片至: ${persistentVideo}`);
    } catch (e) {
        console.warn(`[Badminton Practice Job ${jobId}] 複製失敗: ${e.message}`);
    }
    const videoForAnalysis = fs.existsSync(persistentVideo) ? persistentVideo : videoPath;

    let videoToAnalyze = videoForAnalysis;
    try {
        const duration = await getVideoDuration(videoForAnalysis);
        if (duration > MAX_DURATION) {
            console.log(`[Badminton Practice Job ${jobId}] 裁切 ${duration.toFixed(1)}s → ${MAX_DURATION}s`);
            await trimVideo(videoPath, TRIMMED_VIDEO, MAX_DURATION);
            videoToAnalyze = TRIMMED_VIDEO;
        }
    } catch (e) {
        console.warn(`[Badminton Practice Job ${jobId}] 裁切失敗: ${e.message}`);
    }

    const args = [ANALYZE_SCRIPT, videoToAnalyze, '--output', OUTPUT_JSON, '--sample-interval', '5'];
    if (playerId) args.push('--player-id', playerId);

    console.log(`[Badminton Practice Job ${jobId}] 啟動 YOLO 分析 (shot=${shotType})`);
    const proc = spawn(PYTHON, args, { cwd: path.dirname(ANALYZE_SCRIPT) });
    let stderr = '', stdout = '';
    proc.stderr.on('data', d => { stderr += d; });
    proc.stdout.on('data', d => { stdout += d; });
    proc.on('close', code => {
        if (code === 0 && fs.existsSync(OUTPUT_JSON)) {
            try {
                const analysisResult = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
                const phase3 = analysisResult ? analysisResult.phase3_report : null;
                const phase2 = analysisResult ? analysisResult.phase2_hits : null;
                const poseData = analysisResult ? analysisResult.pose_detection : null;

                // 從 YOLO 分析結果計算姿勢指標
                let avgWristSpeed = 0;
                let avgPostureScore = 0;
                let hitCount = 0;
                if (phase2 && phase2.hits) {
                    hitCount = phase2.hits.length || 0;
                    // 計算平均手腕速度（從擊球偵測結果估算）
                    const speeds = (phase2.hits || []).map(h => h.wrist_speed || h.velocity || 0);
                    if (speeds.length > 0) avgWristSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
                }
                if (phase3 && phase3.dimensions) {
                    const dims = phase3.dimensions;
                    avgPostureScore = Math.round(
                        ((dims.stability?.score || 50) + (dims.fluency?.score || 50)) / 2
                    );
                }

                // 產生教練建議（直接用 phase3 的 suggestions，若無則 fallback）
                let suggestions = [];
                let gaps = [];
                if (phase3 && phase3.suggestions && phase3.suggestions.length > 0) {
                    suggestions = phase3.suggestions.map(s => typeof s === 'string' ? s : (s.suggestion || s.description || ''));
                    gaps = phase3.bottleneck ? phase3.bottleneck.map(b => b.description || b.factor || '') : [];
                } else {
                    // Fallback：從維度瓶頸自動產生建議
                    const dims = phase3 ? phase3.dimensions : {};
                    const entries = Object.entries(dims).sort((a, b) => (a[1].score || 0) - (b[1].score || 0));
                    entries.slice(0, 2).forEach(([key, val]) => {
                        const score = Math.round(val.score || 50);
                        if (score < 60) {
                            gaps.push(`${key}較弱（${score}分）`);
                            suggestions.push(`加強${key}訓練`);
                        }
                    });
                    if (suggestions.length === 0) suggestions.push('持續練習此球種動作，強化肌肉記憶');
                }

                // 計算 ability_score / ability_level（從 YOLO 維度估算）
                const dims = phase3 ? phase3.dimensions : {};
                const dimScores = Object.values(dims).map(d => Math.round(d.score || 50));
                const abilityScore = dimScores.length > 0 ? Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length) : 50;
                // 等級對照：0-40=初學/40-60=中階/60-80=進階/80+=高手
                const abilityLevel = abilityScore >= 80 ? '高手' : abilityScore >= 60 ? '進階' : abilityScore >= 40 ? '中階' : '初學';

                const result = {
                    ok: true,
                    shot_type: shotType,
                    hit_count: hitCount,
                    ability_score: abilityScore,
                    ability_level: abilityLevel,
                    avgWristSpeed: Math.round(avgWristSpeed),
                    avgPostureScore,
                    suggestions,
                    gaps,
                    gap: gaps.join('；'),
                    comparison: {
                        avg_wrist_speed: Math.round(avgWristSpeed),
                        speed_gap: Math.max(0, Math.round(avgWristSpeed - 300)), // 參考標準 300px/s
                    },
                    // 保留原始 YOLO 資料供報告顯示用
                    _yolo: {
                        dimensions: dims,
                        hit_count: hitCount,
                        phase3,
                        pose_data: poseData,
                    },
                    timestamp: new Date().toISOString(),
                };
                jobStore.set(jobId, { status: 'COMPLETED', progress: 100, result, error: null, createdAt: Date.now() });
                console.log(`[Badminton Practice Job ${jobId}] 完成 ability_score=${abilityScore}`);
            } catch (e) {
                jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: '結果解析失敗: ' + e.message, createdAt: Date.now() });
            }
        } else {
            jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: stderr || stdout || `Exit ${code}`, createdAt: Date.now() });
            console.error(`[Badminton Practice Job ${jobId}] 失敗 (code=${code}):`, stderr.slice(0, 300));
        }
        // 清理
        fs.unlink(videoPath, () => {});
        if (fs.existsSync(persistentVideo)) fs.unlink(persistentVideo, () => {});
        if (videoToAnalyze !== videoPath && videoToAnalyze !== persistentVideo && fs.existsSync(videoToAnalyze)) {
            fs.unlink(videoToAnalyze, () => {});
        }
    });
}

// POST /api/badminton/yolo-assessment-async → 立刻回 202 + job_id
router.post('/yolo-assessment-async', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No video file provided' });
    const videoPath = req.file.path;
    // player_index 優先（直接是陣列索引），否則用 avatar 字元轉換
    let playerId = null;
    if (req.body?.player_index !== undefined && req.body?.player_index !== null && req.body?.player_index !== '') {
        const idx = parseInt(req.body.player_index, 10);
        if (!isNaN(idx) && idx >= 0) {
            playerId = `player_${idx}`;
        }
    } else {
        playerId = req.body?.player_id || req.query?.player_id;
        if (playerId) {
            const char = playerId.toUpperCase();
            if (char >= 'A' && char <= 'Z') {
                playerId = `player_${char.charCodeAt(0) - 'A'.charCodeAt(0)}`;
            }
        }
    }
    const jobId = `yolo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Badminton] 新非同步任務 jobId=${jobId} playerId=${playerId || '全部'} videoPath=${videoPath}`);
    res.status(202).json({ ok: true, job_id: jobId, message: '請輪詢 /status/:job_id 取得結果' });
    startYoloAnalysisJob(videoPath, playerId, jobId);
});

// DEBUG: echo raw pose_data to inspect format
router.post('/skeleton-assessment-debug', (req, res) => {
    const pose_data = req.body.pose_data;
    if (!pose_data || !Array.isArray(pose_data) || pose_data.length === 0) {
        return res.json({ ok: false, error: 'No pose_data', received: typeof req.body.pose_data });
    }
    const frame0 = pose_data[0];
    const kps0 = (frame0.person && frame0.person.keypoints) ? frame0.person.keypoints : [];
    const sample = {
        frame_count: pose_data.length,
        first_frame_id: frame0.frame_id,
        first_timestamp_ms: frame0.timestamp_ms,
        keypoint_count: kps0.length,
        first_keypoint_names: kps0.slice(0, 5).map(k => ({ name: k.name, x: k.x, y: k.y, confidence: k.confidence })),
        keypoint_name_type: typeof (kps0[0] || {}).name,
        x_range: [Math.min(...kps0.map(k => k.x)), Math.max(...kps0.map(k => k.x))],
        y_range: [Math.min(...kps0.map(k => k.y)), Math.max(...kps0.map(k => k.y))],
        all_keypoint_names: kps0.map(k => k.name),
    };
    console.log('[skeleton-debug] incoming pose_data:', JSON.stringify(sample));
    res.json({ ok: true, sample });
});

// POST /api/badminton/skeleton-assessment
// v2.0.0(2026-08-30): 直接接收前端上傳的骨架資料（跳過YOLO影片分析）
// Body: JSON { pose_data, player_index, shots, elbowAngles, ... }
router.post('/skeleton-assessment', async (req, res) => {
    if (!req.body || !req.body.pose_data) {
        return res.status(400).json({ ok: false, error: 'No pose_data provided' });
    }
    const pose_data = req.body.pose_data;
    const playerIdx = req.body.player_index;
    const playerId = playerIdx !== undefined && playerIdx !== null ? `player_${playerIdx}` : (req.body.player_id || null);
    const jobId = `skel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Badminton] 骨架評估任務 jobId=${jobId} pose_frames=${pose_data.length} playerId=${playerId || '全部'}`);

    // 非同步處理，避免超時
    startSkeletonAssessmentJob(pose_data, playerId, jobId, (err, result) => {
        if (err) {
            console.error(`[Badminton skeleton job ${jobId}] 失敗:`, err);
        }
    });

    // 立刻回傳 job_id（同步模式，直接等待結果，10秒超時）
    try {
        const result = await waitForSkeletonJob(jobId, 30000);
        res.json({ ok: true, ...result });
    } catch (e) {
        res.status(500).json({ ok: false, error: '骨架分析超時或失敗: ' + e.message });
    }
});

async function waitForSkeletonJob(jobId, timeoutMs) {
    return new Promise((resolve, reject) => {
        const job = jobStore.get(jobId);
        if (!job) return reject(new Error('Job not found'));
        const start = Date.now();
        const poll = () => {
            const j = jobStore.get(jobId);
            if (j.status === 'COMPLETED') return resolve(j.result);
            if (j.status === 'FAILED') return reject(new Error(j.error || 'Analysis failed'));
            if (Date.now() - start > timeoutMs) return reject(new Error('Timeout'));
            setTimeout(poll, 500);
        };
        poll();
    });
}

async function startSkeletonAssessmentJob(pose_data, playerId, jobId, callback) {
    logSkeletonRaw(pose_data, { jobId, playerId, source: 'mediapipe' });  // 立刻寫入，不等 Python 完成
    const PYTHON = '/opt/homebrew/bin/python3';
    const SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'badminton_ai_coach.py');
    jobStore.set(jobId, { status: 'PROCESSING', progress: 0, result: null, error: null, createdAt: Date.now() });

    try {
        // 【FIX 2026-08-31】把 playerId 傳給 Python，这样 Python 才知道在分析哪位球員
        const inputJson = JSON.stringify({ pose_data, player_id: playerId });
        const args = [SCRIPT, '--mode', 'full_assessment', '--input', inputJson];
        if (playerId) args.push('--player-id', playerId);
        const proc = spawn(PYTHON, args, { cwd: path.dirname(SCRIPT), timeout: 60000 });
        let stderr = '', stdout = '';
        proc.stderr.on('data', d => { stderr += d; });
        proc.stdout.on('data', d => { stdout += d; });
        proc.on('close', code => {
            if (stderr) console.log('[skeleton-assessment] stderr:', stderr.slice(0, 500));
            if (code !== 0) {
                const err = new Error('Python exit ' + code);
                jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: err.message });
                return callback(err);
            }
            try {
                const parsed = JSON.parse(stdout);
                if (!parsed.ok) throw new Error(parsed.error || 'Unknown error');
                const report = parsed.report || {};
                // FIX(2026-08-30): 四維對齊 (力道/穩定/步法/流暢)
                // Python four_dimensions 中文key → 英文key 映射
                const CHINESE_TO_EN = {
                    '手腕爆發力': 'power',
                    '姿勢標準度': 'fluency',     // 流暢 = 姿勢標準度
                    '步法復原速度': 'footwork',
                    '動作穩定度': 'stability',
                };
                function mapDim(val) {
                    if (typeof val === 'object' && val !== null && !Array.isArray(val))
                        return Math.min(100, Math.max(0, Math.round(val.score || val.score_score || 0)));
                    return Math.min(100, Math.max(0, Math.round(Number(val) || 0)));
                }
                const rawDims = report.four_dimensions || report.dimensions || {};
                console.log('[skeleton-assessment] Python report.four_dimensions:', JSON.stringify(rawDims).slice(0, 500));
                const dims = {};
                for (const [key, val] of Object.entries(rawDims))
                    dims[CHINESE_TO_EN[key] || key] = mapDim(val);
                console.log('[skeleton-assessment] mapped dims (EN keys):', JSON.stringify(dims));

                const overall = report.overall || {};
                // Python 維度名 → 顯示維度名 mapping
                // wrist_power→力道, consistency→穩定, footwork_recovery→步法, posture→流暢
                const result = {
                    ok: true,
                    new_system: {
                        total_score: overall.total_score || 0,
                        level: overall.level || 0,
                        level_name: overall.level_name || overall.level_group || '',
                        level_desc: overall.level_description || '',
                        insufficient_data: report.report_status === 'insufficient_data',
                        confidence: report.confidence || 0,
                        distinct_shot_types: report.distinct_shot_types || 0,
                        dimensions: {
                            power:     dims.wrist_power    ?? dims.power     ?? 50,  // 力道
                            stability:  dims.consistency    ?? dims.stability ?? 50,  // 穩定
                            footwork:  dims.footwork_recovery ?? dims.footwork ?? 30, // 步法
                            fluency:   dims.posture       ?? dims.fluency   ?? 50,  // 流暢
                        },
                        suggestions: report.advices || [],
                        hit_summary: report.hit_summary || {},
                    }
                };
                console.log('[skeleton-assessment] final new_system.dimensions:', JSON.stringify(result.new_system.dimensions));
                console.log('[skeleton-assessment] final new_system.bottleneck:', JSON.stringify(result.new_system.bottleneck));
                console.log('[skeleton-assessment] final new_system keys:', Object.keys(result.new_system));
                jobStore.set(jobId, { status: 'COMPLETED', progress: 100, result: result, error: null });
                callback(null, result);
            } catch (e) {
                jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: e.message });
                callback(e);
            }
        });
    } catch (e) {
        jobStore.set(jobId, { status: 'FAILED', progress: 0, result: null, error: e.message });
        callback(e);
    }
}

// POST /api/badminton/yolo-practice-async
// 單項練習非同步版：上傳影片 → YOLO 分析 → 返回練習報告
// Body: multipart/form-data { video: File, shot_type: string, player_index?: number }
router.post('/yolo-practice-async', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No video file provided' });
    const videoPath = req.file.path;
    const shotType = req.body?.shot_type || req.body?.shotType || '殺球';
    let playerId = null;
    if (req.body?.player_index !== undefined && req.body?.player_index !== null && req.body?.player_index !== '') {
        const idx = parseInt(req.body.player_index, 10);
        if (!isNaN(idx) && idx >= 0) playerId = `player_${idx}`;
    } else {
        playerId = req.body?.player_id;
        if (playerId) {
            const char = playerId.toUpperCase();
            if (char >= 'A' && char <= 'Z') playerId = `player_${char.charCodeAt(0) - 'A'.charCodeAt(0)}`;
        }
    }
    const jobId = `practice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Badminton] 新單項練習任務 jobId=${jobId} shotType=${shotType} playerId=${playerId || '全部'}`);
    res.status(202).json({ ok: true, job_id: jobId, message: '請輪詢 /yolo-practice/status/:job_id 取得結果' });
    startPracticeAnalysisJob(videoPath, playerId, shotType, jobId);
});

// GET /api/badminton/yolo-practice/status/:job_id
router.get('/yolo-practice/status/:job_id', (req, res) => {
    const job = jobStore.get(req.params.job_id);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    res.json({ ok: true, status: job.status, progress: job.progress, error: job.error || null });
});

// GET /api/badminton/yolo-practice/result/:job_id
router.get('/yolo-practice/result/:job_id', (req, res) => {
    const job = jobStore.get(req.params.job_id);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    if (job.status === 'PROCESSING' || job.status === 'PENDING') {
        return res.status(202).json({ ok: true, status: job.status, progress: job.progress });
    }
    if (job.status === 'FAILED') return res.status(200).json({ ok: false, error: job.error });
    res.json({ ok: true, ...job.result });
});

// GET /api/badminton/yolo-assessment/status/:job_id
router.get('/yolo-assessment/status/:job_id', (req, res) => {
    const jobId = req.params.job_id;
    const job = jobStore.get(jobId);
    if (!job) {
        // Fallback: check if result JSON file exists
        const resultFile = path.join(WORKSPACE, 'badminton-coach-app', 'data', `yolo_result_${jobId}.json`);
        if (fs.existsSync(resultFile)) {
            return res.json({ ok: true, status: 'COMPLETED', progress: 100, error: null });
        }
        return res.status(404).json({ ok: false, error: 'Job not found' });
    }
    res.json({ ok: true, status: job.status, progress: job.progress, error: job.error || null });
});

// GET /api/badminton/yolo-assessment/result/:job_id
router.get('/yolo-assessment/result/:job_id', (req, res) => {
    const jobId = req.params.job_id;
    const job = jobStore.get(jobId);
    if (!job) {
        // Fallback: directly read result JSON file
        const resultFile = path.join(WORKSPACE, 'badminton-coach-app', 'data', `yolo_result_${jobId}.json`);
        if (fs.existsSync(resultFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
                return res.json({ ok: true, ...data });
            } catch(e) {
                return res.status(500).json({ ok: false, error: 'Result file read error: ' + e.message });
            }
        }
        return res.status(404).json({ ok: false, error: 'Job not found' });
    }
    if (job.status === 'PROCESSING' || job.status === 'PENDING') {
        return res.status(202).json({ ok: true, status: job.status, progress: job.progress });
    }
    if (job.status === 'FAILED') return res.status(200).json({ ok: false, error: job.error });
    res.json({ ok: true, ...job.result });
});

// POST /api/badminton/yolo-pose
// YOLO11-Pose 單圖多人骨架偵測
// Body: multipart/form-data { image: File }
// Returns: { ok, result_image_url, player_count, players, avg_confidence }
// ---------------------------------------------------------------------------
router.post('/yolo-pose', uploadImage.single('image'), (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ ok: false, error: 'No image file provided' });
    }

    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    const imagePath = file.path + ext;
    fs.renameSync(file.path, imagePath);  // 加上副檔名讓 YOLO 能辨識

    const YOLO_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'yolo_pose.py');
    const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'badminton-coach', 'data', 'yolo_pose_results');
    const TIMESTAMP = Date.now();
    const OUTPUT_IMAGE = path.join(OUTPUT_DIR, `result_${TIMESTAMP}.jpg`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const PY = '/opt/homebrew/bin/python3';

    const JSON_OUTPUT = path.join(OUTPUT_DIR, `pose_${TIMESTAMP}.json`);
    const proc = spawn(PY, [
        YOLO_SCRIPT, imagePath,
        '--output', JSON_OUTPUT,
        '--visualize',
        '--model', 'n',
    ], {
        cwd: path.dirname(YOLO_SCRIPT),
        timeout: 60000,
        maxBuffer: 50 * 1024 * 1024,
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.on('close', code => {
        if (stderr) console.log('[yolo-pose] stderr:', stderr.slice(0, 500));
        if (code !== 0) {
            fs.unlink(imagePath, () => {});
            return res.status(500).json({ ok: false, error: stderr || `Python exit ${code}` });
        }

        // 讀取 JSON 結果（yolo_pose.py --output 寫入檔案）
        let result;
        try {
            const jsonContent = fs.readFileSync(JSON_OUTPUT, 'utf8');
            result = JSON.parse(jsonContent);
        } catch (e) {
            fs.unlink(imagePath, () => {});
            return res.status(500).json({ ok: false, error: 'Cannot read JSON result: ' + e.message });
        }

        // 視覺化圖片產生在 imagePath + "_yolopose.jpg"
        const annotatedBase = imagePath.slice(0, imagePath.lastIndexOf('.'));
        const annotatedPath = annotatedBase + '_yolopose.jpg';
        const publicImageName = `yolo_${TIMESTAMP}.jpg`;
        const publicImagePath = path.join(OUTPUT_DIR, publicImageName);

        let resultImageUrl = '';
        if (fs.existsSync(annotatedPath)) {
            try {
                fs.copyFileSync(annotatedPath, publicImagePath);
                resultImageUrl = `/badminton-coach/data/yolo_pose_results/${publicImageName}`;
            } catch (e) {
                console.error('[yolo-pose] copy image error:', e.message);
            }
        }

        // 清理暫存
        fs.unlink(imagePath, () => {});
        fs.unlink(annotatedPath, () => {});
        if (fs.existsSync(JSON_OUTPUT)) fs.unlink(JSON_OUTPUT, () => {});

        const players = result.persons || result.players || [];
        const avgConf = players.length > 0
            ? players.reduce((s, p) => s + (p.confidence || 0), 0) / players.length
            : 0;
        console.log(`[yolo-pose] ok=true players=${players.length} conf=${avgConf.toFixed(2)}`);

        res.json({
            ok: true,
            result_image_url: resultImageUrl,
            player_count: players.length,
            players: players.map(p => ({
                id: p.id,
                confidence: p.confidence,
                bounding_box: p.bounding_box,
                keypoint_count: (p.keypoints || []).length,
                keypoints: (p.keypoints || []).map(k => ({
                    name: k.name,
                    x: k.x,
                    y: k.y,
                    confidence: k.confidence || 0.9,
                })),
            })),
            avg_confidence: avgConf,
            image_width: result.image_size ? result.image_size.width : 0,
            image_height: result.image_size ? result.image_size.height : 0,
            timestamp: new Date().toLocaleTimeString('zh-TW'),
        });
    });
    proc.on('error', err => {
        fs.unlink(imagePath, () => {});
        console.error('[yolo-pose] spawn error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    });
});

// POST /api/badminton/yolo-pose-video
// YOLO11-Pose 影片批量骨架偵測
// Body: multipart/form-data { video: File, interval: number (optional, default=5) }
// Returns: { ok, video_info, frames: [{frame_index, timestamp, person_count, persons}] }
// ---------------------------------------------------------------------------
const multerVideo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed'));
        }
    }
});

router.post('/yolo-pose-video', multerVideo.single('video'), (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ ok: false, error: 'No video file provided' });
    }

    const interval = parseInt(req.body.interval) || 5;
    console.log(`[yolo-pose-video] received video: ${file.originalname}, size: ${(file.size/1024/1024).toFixed(1)}MB, interval: ${interval}`);

    // 保存影片到暫存
    const WORKSPACE = process.env.WORKSPACE || path.join(os.homedir(), '.openclaw', 'workspace');
    const TEMP_DIR = path.join(WORKSPACE, 'badminton-coach-app', 'temp');
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    const videoPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    fs.writeFileSync(videoPath, file.buffer);

    const YOLO_VIDEO_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'yolo_pose_video.py');
    const JSON_OUTPUT = path.join(TEMP_DIR, `video_result_${Date.now()}.json`);

    const PY = '/opt/homebrew/bin/python3';

    const proc = spawn(PY, [
        YOLO_VIDEO_SCRIPT, videoPath,
        '--output', JSON_OUTPUT,
        '--interval', String(interval),
        '--model', 'n',
    ], {
        cwd: path.dirname(YOLO_VIDEO_SCRIPT),
        timeout: 600000, // 10 分鐘超時
        maxBuffer: 100 * 1024 * 1024,
    });

    let stdout = '', stderr = '';
    proc.stdout.on('data', d => {
        stdout += d;
        // 即時輸出 Python 的 progress
        process.stdout.write(d);
    });
    proc.stderr.on('data', d => {
        stderr += d;
        console.log('[yolo-pose-video] stderr:', d.toString().slice(0, 200));
    });

    proc.on('close', code => {
        // 清理影片暫存
        fs.unlink(videoPath, () => {});

        if (code !== 0) {
            console.error('[yolo-pose-video] python exit code:', code);
            console.error('[yolo-pose-video] stderr:', stderr.slice(0, 500));
            return res.status(500).json({ ok: false, error: stderr || `Python exit ${code}` });
        }

        // 讀取 JSON 結果
        let result;
        try {
            const jsonContent = fs.readFileSync(JSON_OUTPUT, 'utf8');
            result = JSON.parse(jsonContent);
        } catch (e) {
            console.error('[yolo-pose-video] cannot read JSON:', e.message);
            return res.status(500).json({ ok: false, error: 'Cannot read analysis result: ' + e.message });
        }

        // 清理 JSON 暫存
        fs.unlink(JSON_OUTPUT, () => {});

        const frameCount = result.frames ? result.frames.length : 0;
        console.log(`[yolo-pose-video] ok=true, processed ${frameCount} frames`);

        res.json({
            ok: true,
            video_info: result.video_info,
            frames: result.frames,
            timestamp: new Date().toLocaleTimeString('zh-TW'),
        });
    });

    proc.on('error', err => {
        fs.unlink(videoPath, () => {});
        console.error('[yolo-pose-video] spawn error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    });
});

router.post('/assessment', async (req, res) => {
    const {
        // assessment mode: pre-computed scores from JS (assessment.html)
        scores,
        // or full pose data for Python to recompute
        pose_data,
        hit_data,
        // metadata
        shotCount = 0,
        avgWristSpeed = 0,   // deg/s (已確認單位)
        avgElbowAngle = 0,
        avgShoulderAngle = 0,
    } = req.body || {};

    try {
        let report;

        if (scores && !pose_data) {
            if (scores.new_system) {
                // ── 新制（方案A）：前端已算好，直接生成報告格式 ──
                // scores 格式：{ level, power, stability, reaction, fluency, shot_diversity, total, shots, ... }
                const level = scores.level || 6;
                const dims = {
                    '力道': scores.power || 0,
                    '穩定': scores.stability || 0,
                    '步法': scores.footwork || 0,
                    '流暢': scores.fluency || 0,
                };

                // 找出瓶頸維度（只比較四個核心維度）
                const BOTTLE_KEYS = ['力道', '穩定', '步法', '流暢'];
                let bottleneckKey = BOTTLE_KEYS[0], bottleneckScore = dims[BOTTLE_KEYS[0]] || 0;
                for (const k of BOTTLE_KEYS) {
                    if ((dims[k] || 0) < bottleneckScore) { bottleneckScore = dims[k]; bottleneckKey = k; }
                }

                // 等級分組
                const levelGroup = level >= 11 ? '🌟 頂尖' :
                                   level >= 8  ? '🏆 高手' :
                                   level >= 5  ? '⚡ 中階' : '🌱 初級';

                // 根據瓶頸維度給對應建議（針對四維）
                const bottleneckDesc = {
                    '力道': '擊球爆發力不足，建議加強手腕與前臂甩鞭訓練',
                    '穩定': '姿勢穩定性不足，建議放慢節奏專注動作一致性',
                    '步法': '步法覆蓋範圍偏小，建議練習步伐移動與重心轉換',
                    '流暢': '動作協調度不足，建議分解動作練習流暢銜接',
                }[bottleneckKey] || '各維度均衡發展';

                report = {
                    ok: true,
                    report: {
                        overall: {
                            total_score: scores.total || 0,
                            level: level,
                            level_group: levelGroup,
                            level_range: `Lv.${level}`,
                        },
                        four_dimensions: {
                            '力道': scores.power || 0,
                            '穩定': scores.stability || 0,
                            '步法': scores.footwork || 0,
                            '流暢': scores.fluency || 0,
                        },
                        bottleneck: {
                            factor: bottleneckKey,
                            score: bottleneckScore,
                            description: bottleneckDesc,
                        },
                        advices: [
                            bottleneckKey === '力道' ? '💪 爆發力訓練：甩鞭動作練習，增強手腕與前臂爆發力' : '',
                            bottleneckKey === '穩定' ? '🎯 穩定性訓練：放慢練習節奏，專注每一下動作的一致性' : '',
                            bottleneckKey === '步法' ? '👟 步法訓練：多球練習步伐移動，提升重心轉換速度' : '',
                            bottleneckKey === '流暢' ? '🌊 協調性訓練：分解動作練習，流暢銜接動力鏈每個環節' : '',
                            scores.power >= 70 && bottleneckKey !== '力道' ? '💪 擊球力道優秀：維持現有訓練菜單' : '',
                            scores.stability >= 70 && bottleneckKey !== '穩定' ? '🎯 姿勢穩定性良好：持續動作一致性訓練' : '',
                            scores.footwork >= 70 && bottleneckKey !== '步法' ? '👟 步法覆蓋範圍佳：維持步伐移動訓練' : '',
                            scores.fluency >= 70 && bottleneckKey !== '流暢' ? '🌊 動作協調度佳：持續流暢性練習' : '',
                        ].filter(Boolean),
                        hit_summary: { hit_count: scores.shots || shotCount || 0 },
                        avgWristSpeed: scores.avgWristSpeed || 0,
                    },
                };
            } else {
                // 舊制：交給 Python（向後相容）
                const input = {
                    mode: 'skills_report',
                    scores,
                    shotCount,
                    avgWristSpeed,
                    avgElbowAngle,
                    avgShoulderAngle,
                };
                report = await runBadmintonScript('skills_report', input);
            }
        } else {
            // Full pose data → Python does complete analysis
            const input = {
                mode: 'full_assessment',
                pose_data: pose_data || [],
                hit_data: hit_data || [],
                shotCount,
                avgWristSpeed,
                avgElbowAngle,
                avgShoulderAngle,
            };
            report = await runBadmintonScript('full_assessment', input);
        }

        // runBadmintonScript returns Python JSON: {"ok": true, "report": {...}}
        // We only need the inner report
        res.json({ ok: true, report: report.report || report });
    } catch (err) {
        console.error('[Badminton API] /assessment error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/badminton/practice
// Body: { mode:"practice", shot_type, scores?, pose_data? }
// Returns: 單項練習報告（該球路分析 + 改善建議 + 與標準差距）
// ---------------------------------------------------------------------------
router.post('/practice', async (req, res) => {
    const {
        shot_type,           // '殺球' | '高遠球' | etc.
        scores,              // optional pre-computed scores
        pose_data,           // optional full pose data
        avgWristSpeed = 0,   // deg/s (已確認單位)
        avgPostureScore = 0,
    } = req.body || {};

    if (!shot_type) {
        return res.status(400).json({ ok: false, error: 'shot_type is required' });
    }

    try {
        let report;

        if (scores && !pose_data) {
            // single-practice.html computed scores → just generate report
            const input = {
                mode: 'single_shot_report',
                shot_type,
                scores,            // { ability_score }
                avgWristSpeed,     // deg/s
                avgPostureScore,
            };
            report = await runBadmintonScript('single_shot_report', input);
        } else {
            // Full pose data → Python does complete analysis
            const input = {
                mode: 'full_practice',
                shot_type,
                pose_data: pose_data || [],
                avgWristSpeed,
                avgPostureScore,
            };
            report = await runBadmintonScript('full_practice', input);
        }

        // runBadmintonScript returns Python JSON: {"ok": true, "report": {...}}
        // We only need the inner report
        res.json({ ok: true, report: report.report || report });
    } catch (err) {
        console.error('[Badminton API] /practice error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
router.get('/health', (req, res) => {
    res.json({ ok: true, service: 'badminton-analysis' });
});

// ---------------------------------------------------------------------------
// POST /api/badminton/detect-players-rcnn
// TorchVision Keypoint RCNN 多人姿勢偵測（多尺度 + 解剖學過濾）
// Body: multipart/form-data { video: File }
// Returns: { ok, video_info, players, player_count, best_frame }
// ----------------------------------------------------------------------------
router.post('/detect-players-rcnn', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    const RCNN_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'rcnn_video_detector.py');
    const args = [
        RCNN_SCRIPT,
        videoPath,
        '--sample-interval', '150',
        '--min-confidence', '0.3'
    ];

    try {
        const PY = '/opt/homebrew/bin/python3';

        const result = await new Promise((resolve, reject) => {
            const proc = spawn(PY, args, {
                cwd: path.dirname(RCNN_SCRIPT),
                timeout: 120000,  // RCNN 較慢，給 2 分鐘
                maxBuffer: 100 * 1024 * 1024,
            });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => (stdout += d));
            proc.stderr.on('data', d => (stderr += d));
            proc.on('close', code => {
                if (stderr) console.log('[rcnn] Python stderr:', stderr.slice(0, 1000));
                if (code !== 0) {
                    return reject(new Error(stderr || `Python exit code ${code}`));
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch {
                    reject(new Error('Invalid JSON: ' + stdout.slice(0, 200)));
                }
            });
            proc.on('error', err => reject(err));
        });

        fs.unlink(videoPath, () => {});

        console.log('[rcnn] Result: ok=' + result.ok + ' players=' + result.player_count + ' best_frame=' + result.best_frame);

        if (!result.ok) {
            return res.status(500).json({ ok: false, error: result.error });
        }

        // 轉換為前端格式
        result.players = result.players.map((p, i) => {
            const b = p.bounding_box;
            const box = {
                minX: (b.x1 || 0) / result.video_info.width,
                minY: (b.y1 || 0) / result.video_info.height,
                maxX: (b.x2 || 0) / result.video_info.width,
                maxY: (b.y2 || 0) / result.video_info.height,
            };
            return {
                id: p.id || ('player_' + (i+1)),
                name: '球員' + String.fromCharCode(65 + i),
                status: 'RCNN 偵測',
                avatar: String.fromCharCode(65 + i),
                box,
                landmarks: p.keypoints,
                confidence: p.confidence,
                color: '#F97316',
            };
        });

        res.json(result);
    } catch (err) {
        fs.unlink(videoPath, () => {});
        console.error('[rcnn] Error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/badminton/detect-players
// Body: multipart/form-data { video: File }
// Returns: { ok, video_info, players: [{id, name, bbox, landmarks}] }
// ---------------------------------------------------------------------------
router.post('/detect-players', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    const args = [
        DETECT_SCRIPT,
        videoPath,
        '--sample-interval', '3',
        '--min-confidence', '0.25',
        '--max-players', '4',
        '--yolo-conf', '0.25'
    ];

    try {
        const PY = '/opt/homebrew/bin/python3';

        const result = await new Promise((resolve, reject) => {
            const proc = spawn(PY, args, {
                cwd: path.dirname(DETECT_SCRIPT),
                timeout: 60000,
                maxBuffer: 50 * 1024 * 1024,
            });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => (stdout += d));
            proc.stderr.on('data', d => (stderr += d));
            proc.on('close', code => {
                if (stderr) console.log('[detect-players] Python stderr:', stderr.slice(0, 500));
                if (code !== 0) {
                    return reject(new Error(stderr || `Python exit code ${code}`));
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch {
                    reject(new Error('Invalid JSON from detect_players.py: ' + stdout.slice(0, 200)));
                }
            });
            proc.on('error', err => reject(err));
        });

        // 清理暫存影片
        fs.unlink(videoPath, () => {});

        console.log('[detect-players] Result: ok=' + result.ok + ' players=' + (result.players ? result.players.length : 0) + ' message=' + (result.message || ''));

        if (!result.ok) {
            return res.status(500).json({ ok: false, error: result.error });
        }

        // 加入球員狀態描述 + 修復坐標格式
        // Python 輸出：bbox={x,y,w,h} 百分比(0-100) → 轉為 minX/maxY 歸一化(0-1)
        result.players = result.players.map(p => {
            const b = p.bbox;
            const box = {
                minX: (b.x || 0) / 100,
                minY: (b.y || 0) / 100,
                maxX: ((b.x || 0) + (b.w || 0)) / 100,
                maxY: ((b.y || 0) + (b.h || 0)) / 100,
            };
            return {
                ...p,
                box,
                status: `偵測到 ${p.detection_count} 幀`,
                avatar: String.fromCharCode(65 + p.id - 1),
            };
        });

        res.json(result);
    } catch (err) {
        // 清理失敗的暫存
        fs.unlink(videoPath, () => {});
        console.error('[Badminton API] /detect-players error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/badminton/yolo-assessment  【新制評估 - C混合模式】
// Body: multipart/form-data { video: File }
// Runs: analyze_video_yolo.py（新公式：6維度 + 18級門檻制 + 三位顧問共識）
// Returns: 與 homepage localStorage 格式相容的結果
// ---------------------------------------------------------------------------
router.post('/yolo-assessment', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    const PYTHON = '/opt/homebrew/bin/python3';
    const ANALYZE_SCRIPT = path.join(WORKSPACE, 'badminton-coach-app', 'scripts', 'analyze_video_yolo.py');
    const DATA_DIR = path.join(WORKSPACE, 'badminton-coach-app', 'data');
    const OUTPUT_JSON = path.join(DATA_DIR, 'yolo_assessment_result.json');

    try {
        // 確保 data 目錄存在
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        // 執行 YOLO 分析腳本（支援 --player-id 過濾球員）
        const playerId = req.body?.player_id || req.query?.player_id;
        const args = [ANALYZE_SCRIPT, videoPath, '--output', OUTPUT_JSON, '--sample-interval', '5'];
        if (playerId) {
            args.push('--player-id', playerId);
            console.log(`[Badminton] 分析球員: ${playerId}`);
        }
        const result = await new Promise((resolve, reject) => {
            const proc = spawn(PYTHON, args, { cwd: path.dirname(ANALYZE_SCRIPT), timeout: 600000 });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);
            proc.on('close', code => {
                if (code !== 0) reject(new Error(stderr || `Exit ${code}`));
                else resolve(true);
            });
        });

        // 讀取分析結果
        let analysisResult = null;
        if (fs.existsSync(OUTPUT_JSON)) {
            analysisResult = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
        }

        // 取出核心數值（與舊 assessment 格式相容）
        const phase3 = analysisResult ? analysisResult.phase3_report : null;
        const overall = phase3 ? phase3.overall : null;
        const dims = phase3 ? phase3.dimensions : {};

        // 【修正】檢查是否為 insufficient_data（0球）
        const isInsufficientData = phase3 && phase3.report_status === 'insufficient_data';
        if (isInsufficientData) {
            debugLog('[Badminton API] 偵測到 0 球，回傳 insufficient_data 狀態', 'warning');
        }

        // 轉換為 homepage 期望的格式
        const response = {
            ok: true,
            // 與舊 assessment 相容的欄位
            ability_score: overall ? Math.round(overall.total_score || 0) : 0,
            ability_level: isInsufficientData ? -1 : (overall ? overall.grade : 0) || 0,
            title: isInsufficientData ? '無法評估' : (overall ? overall.grade_name : '未知'),
            subtitle: isInsufficientData ? '偵測到 0 次擊球，請重新拍攝' : (overall ? overall.grade_description : ''),
            // 新制完整資訊
            new_system: {
                total_score: isInsufficientData ? 0 : (overall ? (overall.total_score || 0) : 0),
                level: isInsufficientData ? -1 : (overall ? (overall.grade || 0) : 0),
                level_name: isInsufficientData ? '無法評估' : (overall ? (overall.grade_name || '') : '未知'),
                level_desc: isInsufficientData ? '偵測到 0 次擊球，請重新拍攝' : (overall ? (overall.grade_description || '') : ''),
                insufficient_data: isInsufficientData,
                confidence: phase3 ? (phase3.confidence || 0) : 0,
                shot_diversity_score: overall ? (overall.shot_diversity_score || 0) : 0,
                hit_type_distribution: overall ? (overall.hit_type_distribution || {}) : {},
                distinct_shot_types: overall ? (overall.distinct_shot_types || 0) : 0,
                // 六維度分數（0-100）
                dimensions: {
                    power: Math.min(100, Math.max(0, Math.round(dims.power?.score ?? 50))),
                    stability: Math.min(100, Math.max(0, Math.round(dims.stability?.score ?? 50))),
                    footwork: Math.min(100, Math.max(0, Math.round(dims.footwork?.score ?? 30))),
                    fluency: Math.min(100, Math.max(0, Math.round(dims.fluency?.score ?? 50))),
                    reaction: Math.min(100, Math.max(0, Math.round(dims.reaction?.score ?? 40))),
                    shot_diversity: Math.min(100, Math.max(0, Math.round(dims.shot_diversity?.score ?? 50))),
                },
                // 六維雷達圖（2026-09-01）
                radar_labels: ['力道', '穩定', '步法', '流暢', '反應', '球路'],
                radar_scores: [
                    Math.min(100, Math.max(0, Math.round(dims.power?.score ?? 50))),
                    Math.min(100, Math.max(0, Math.round(dims.stability?.score ?? 50))),
                    Math.min(100, Math.max(0, Math.round(dims.footwork?.score ?? 30))),
                    Math.min(100, Math.max(0, Math.round(dims.fluency?.score ?? 50))),
                    Math.min(100, Math.max(0, Math.round(dims.reaction?.score ?? 40))),
                    Math.min(100, Math.max(0, Math.round(dims.shot_diversity?.score ?? 50))),
                ],
                // 原始分析數據
                pose_detection: analysisResult ? analysisResult.pose_detection : null,
                phase1: analysisResult ? analysisResult.phase1_displacement : null,
                phase2: analysisResult ? analysisResult.phase2_hits : null,
                suggestions: phase3 ? phase3.suggestions : [],
                bottleneck: phase3 ? phase3.bottleneck : null,
            },
            timestamp: new Date().toISOString(),
        };

        // 清理暫存影片
        fs.unlink(videoPath, () => {});

        res.json(response);
    } catch (err) {
        fs.unlink(videoPath, () => {});
        console.error('[Badminton API] /yolo-assessment error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// POST /api/badminton/yolo-pose
// YOLO11-Pose 多人骨架偵測（圖片上傳）
// Body: multipart/form-data { image: File }

module.exports = router;
