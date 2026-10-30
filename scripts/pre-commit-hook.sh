#!/bin/bash
# ClawBridge pre-commit 金鑰防線（版本控制內）
# 2026-10-30 建立。理由：
#   apps/clawbridge 是獨立 git repo（remote: github.com/dreamwing/clawbridge.git，PUBLIC），
#   先前沒有任何 pre-commit 防線 → 2026-10-30 查證現役 MiniMax 金鑰
#   （len 125）確實出現在本 repo 的 commit 歷史（b1d4aa0 / 69304ca）。
#   主工作區有防線但覆蓋不到 submodule → 污染發生在沒防線的那個 repo。
#
# 設計原則（沿用主工作區 scripts/pre-commit-hook.sh 的分層閉環）：
#   1. 找不到掃描器 → 跳過且 exit 0（工具壞掉不得卡死 workflow）。
#   2. 僅「高信心完整金鑰」（token 長度 >= 32）才 exit 1 阻擋 commit；片段/範例只警告。
#   3. 緊急略過：SKIP_SECRET_SCAN=1 git commit ...

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

# 掃描器位置：優先環境變數，其次主工作區預設路徑。
SCANNER=""
for cand in "${OPENCLAW_SECRET_SCANNER:-}" "$REPO_ROOT/../../scripts/secret-scan.js" "$HOME/.openclaw/workspace/scripts/secret-scan.js"; do
  if [ -n "$cand" ] && [ -f "$cand" ]; then SCANNER="$cand"; break; fi
done

if [ -z "$SCANNER" ]; then
  echo "⚠️ 找不到 secret-scan.js → 略過金鑰檢查（不阻擋 commit）"
  exit 0
fi

if [ "${SKIP_SECRET_SCAN:-0}" = "1" ]; then
  echo "⚠️ SKIP_SECRET_SCAN=1 → 略過金鑰阻擋"
  exit 0
fi

cd "$REPO_ROOT" || exit 0
echo "🔐 Secret Scan (staged)..."
node "$SCANNER" --staged --strict
SCAN_EXIT=$?
if [ "$SCAN_EXIT" -eq 1 ]; then
  echo "🚫 金鑰阻擋：本次 commit 含高信心完整金鑰"
fi
exit $SCAN_EXIT
