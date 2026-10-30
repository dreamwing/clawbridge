/**
 * Vault Memory Route
 * 成長系統 × Vault Agent Memory 整合
 *
 * GET /api/vault/status       - Vault 統計 + 候選狀態
 * GET /api/vault/candidates   - 待處理候選記憶清單
 * POST /api/vault/promote     - 晉升候選記憶
 * POST /api/vault/reject      - 拒絕候選記憶
 */

const router = require('express').Router();
const { execSync } = require('child_process');

const VAULT_VENV = '/Users/openclaw0712/.openclaw/.vault-venv/bin/activate';
const VAULT_PROJECT = '/Users/openclaw0712/.openclaw/workspace/vault-memory';

function vaultCmd(args, json = true) {
  const cmd = `source "${VAULT_VENV}" && vault ${args} --project-dir "${VAULT_PROJECT}" ${json ? '--json --pretty' : ''} 2>/dev/null`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return json ? JSON.parse(out) : out.trim();
  } catch (e) {
    return json ? null : '';
  }
}

// ============ API ============

/**
 * GET /api/vault/status
 * Vault 統計 + 成長系統候選狀態
 */
router.get('/api/vault/status', (req, res) => {
  try {
    const stats = vaultCmd('stats') || {};
    const candidates = vaultCmd('candidates') || {};
    const list = vaultCmd('list --layer L2 --max-results 50') || {};

    // 過濾出成長系統相關記憶
    const growthCandidates = (candidates.candidates || [])
      .filter(c => (c.tags || '').includes('成長系統'));

    const response = {
      ok: true,
      vault: {
        knowledgeCount: stats.knowledge_count || 0,
        dbSize: stats.db_size || '0',
        vectors: stats.semantic_vectors || 0,
      },
      candidates: {
        total: candidates.count || 0,
        growth: growthCandidates.length,
        items: growthCandidates.map(c => ({
          id: c.id,
          title: c.title,
          tags: c.tags,
          status: c.status,
          trust: c.trust,
          sensitivity: c.sensitivity,
          privacyStatus: c.privacy_status,
          createdAt: c.created_at,
          contentPreview: c.content_preview,
        })),
      },
      active: {
        total: list.length || 0,
      },
    };

    res.json(response);
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/vault/candidates
 * 候選記憶詳細清單
 */
router.get('/api/vault/candidates', (req, res) => {
  try {
    const candidates = vaultCmd('candidates') || {};
    res.json({ ok: true, candidates: candidates.candidates || [] });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/vault/promote
 * 晉升候選記憶
 */
router.post('/api/vault/promote', (req, res) => {
  try {
    const { candidateId } = req.body; if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(candidateId || ""))) return res.status(400).json({ ok: false, error: "invalid candidateId" });
    if (!candidateId) {
      res.json({ ok: false, error: 'candidateId required' });
      return;
    }
    const result = vaultCmd(`promote --candidate-id ${candidateId} --confirm`);
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/vault/reject
 * 拒絕候選記憶
 */
router.post('/api/vault/reject', (req, res) => {
  try {
    const { candidateId } = req.body; if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(candidateId || ""))) return res.status(400).json({ ok: false, error: "invalid candidateId" });
    if (!candidateId) {
      res.json({ ok: false, error: 'candidateId required' });
      return;
    }
    const result = vaultCmd(`memory-review --candidate-id ${candidateId} --reject`);
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
