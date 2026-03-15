#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/tests/cost-control/fixtures"
LOCAL_DIR="$ROOT_DIR/tests/cost-control/local"
BACKUP_DIR="$LOCAL_DIR/.backup"
SANDBOX_DIR="$LOCAL_DIR/.sandbox"

TOKEN_FILE="$ROOT_DIR/data/token_stats/latest.json"
REAL_OPENCLAW_DIR="${HOME}/.openclaw"
REAL_OPENCLAW_JSON="$REAL_OPENCLAW_DIR/openclaw.json"
REAL_WORKSPACE_DIR="$REAL_OPENCLAW_DIR/workspace"
REAL_HEARTBEAT_FILE="$REAL_WORKSPACE_DIR/HEARTBEAT.md"
REAL_SOUL_FILE="$REAL_WORKSPACE_DIR/SOUL.md"
REAL_SKILLS_DIR="$REAL_OPENCLAW_DIR/skills"

SANDBOX_OPENCLAW_DIR="$SANDBOX_DIR/openclaw"
SANDBOX_OPENCLAW_JSON="$SANDBOX_OPENCLAW_DIR/openclaw.json"
SANDBOX_WORKSPACE_DIR="$SANDBOX_OPENCLAW_DIR/workspace"
SANDBOX_HEARTBEAT_FILE="$SANDBOX_WORKSPACE_DIR/HEARTBEAT.md"
SANDBOX_SOUL_FILE="$SANDBOX_WORKSPACE_DIR/SOUL.md"
SANDBOX_SKILLS_DIR="$SANDBOX_OPENCLAW_DIR/skills"

ensure_dirs() {
  mkdir -p "$BACKUP_DIR" "$SANDBOX_DIR"
}

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  fi
}

require_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
}

require_backup() {
  if [ ! -f "$BACKUP_DIR/latest.json" ]; then
    echo "Missing token backup. Run: tests/cost-control/local/run-local-check.sh backup-token" >&2
    exit 1
  fi
}

require_sandbox() {
  if [ ! -f "$SANDBOX_OPENCLAW_JSON" ]; then
    echo "Sandbox is not initialized. Run: tests/cost-control/local/run-local-check.sh sandbox-init" >&2
    exit 1
  fi
}

backup_token() {
  ensure_dirs
  cp "$TOKEN_FILE" "$BACKUP_DIR/latest.json"
  echo "Backed up token stats to $BACKUP_DIR/latest.json"
}

restore_token() {
  require_backup
  cp "$BACKUP_DIR/latest.json" "$TOKEN_FILE"
  echo "Restored token stats."
}

sandbox_init() {
  ensure_dirs
  rm -rf "$SANDBOX_OPENCLAW_DIR"
  mkdir -p "$SANDBOX_OPENCLAW_DIR" "$SANDBOX_WORKSPACE_DIR" "$SANDBOX_SKILLS_DIR"
  # Start from an empty sandbox config so local acceptance stays reproducible
  # and is not polluted by the operator's real ~/.openclaw settings.
  echo "{}" > "$SANDBOX_OPENCLAW_JSON"
  copy_if_exists "$REAL_HEARTBEAT_FILE" "$SANDBOX_HEARTBEAT_FILE"
  copy_if_exists "$REAL_SOUL_FILE" "$SANDBOX_SOUL_FILE"
  copy_if_exists "$REAL_WORKSPACE_DIR/AGENTS.md" "$SANDBOX_WORKSPACE_DIR/AGENTS.md"
  copy_if_exists "$REAL_WORKSPACE_DIR/MEMORY.md" "$SANDBOX_WORKSPACE_DIR/MEMORY.md"
  if [ -d "$REAL_SKILLS_DIR" ]; then
    find "$REAL_SKILLS_DIR" -maxdepth 2 -name SKILL.md | while read -r skill_md; do
      rel_dir="$(dirname "${skill_md#$REAL_SKILLS_DIR/}")"
      mkdir -p "$SANDBOX_SKILLS_DIR/$rel_dir"
      cp "$skill_md" "$SANDBOX_SKILLS_DIR/$rel_dir/SKILL.md"
    done
  fi
  echo "Sandbox initialized at $SANDBOX_OPENCLAW_DIR"
  print_env
}

sandbox_reset() {
  require_sandbox
  sandbox_init
}

set_thinking_default() {
  local config_path="$1"
  local mode="$2"
  node -e "
    const fs=require('fs');
    const p=process.argv[1];
    const mode=process.argv[2];
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.agents = j.agents || {};
    j.agents.defaults = j.agents.defaults || {};
    if (mode === '__unset__') delete j.agents.defaults.thinkingDefault;
    else j.agents.defaults.thinkingDefault = mode;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  " "$config_path" "$mode"
}

install_skill_fixtures() {
  mkdir -p "$SANDBOX_SKILLS_DIR"
  rm -rf "$SANDBOX_SKILLS_DIR/test-idle-skill" "$SANDBOX_SKILLS_DIR/test-quiet-skill" "$SANDBOX_SKILLS_DIR/test-active-skill"
  cp -R "$FIXTURE_DIR/skills/test-idle-skill" "$SANDBOX_SKILLS_DIR/test-idle-skill"
  cp -R "$FIXTURE_DIR/skills/test-quiet-skill" "$SANDBOX_SKILLS_DIR/test-quiet-skill"
  cp -R "$FIXTURE_DIR/skills/test-active-skill" "$SANDBOX_SKILLS_DIR/test-active-skill"
  touch -t "$(date -v-10d +%Y%m%d%H%M)" "$SANDBOX_SKILLS_DIR/test-idle-skill"
  touch -t "$(date -v-5d +%Y%m%d%H%M)" "$SANDBOX_SKILLS_DIR/test-quiet-skill"
  touch -t "$(date +%Y%m%d%H%M)" "$SANDBOX_SKILLS_DIR/test-active-skill"
}

apply_case() {
  local case_name="$1"
  require_backup
  require_sandbox
  case "$case_name" in
    case-a)
      cp "$FIXTURE_DIR/latest.case-a-expensive-thinking.json" "$TOKEN_FILE"
      set_thinking_default "$SANDBOX_OPENCLAW_JSON" "high"
      ;;
    case-b)
      cp "$FIXTURE_DIR/latest.case-b-cache-verbosity.json" "$TOKEN_FILE"
      set_thinking_default "$SANDBOX_OPENCLAW_JSON" "__unset__"
      ;;
    case-c)
      cp "$FIXTURE_DIR/latest.case-c-sessions-skills.json" "$TOKEN_FILE"
      set_thinking_default "$SANDBOX_OPENCLAW_JSON" "__unset__"
      install_skill_fixtures
      ;;
    *)
      echo "Unknown case: $case_name" >&2
      exit 1
      ;;
  esac
  echo "Applied $case_name to sandbox + repo token stats."
  status
}

print_env() {
  cat <<EOF
Use these env vars when starting ClawBridge for local acceptance:

export OPENCLAW_STATE_DIR="$SANDBOX_OPENCLAW_DIR"
export OPENCLAW_WORKSPACE="$SANDBOX_WORKSPACE_DIR"

Then start ClawBridge in the same shell.
EOF
}

status() {
  echo "Repo token stats:"
  ls -l "$TOKEN_FILE"
  echo
  if [ -f "$SANDBOX_OPENCLAW_JSON" ]; then
    echo "Sandbox thinking default:"
    node -e "const fs=require('fs'); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(j.agents?.defaults?.thinkingDefault ?? '(unset)');" "$SANDBOX_OPENCLAW_JSON"
    echo
    echo "Sandbox managed skills:"
    find "$SANDBOX_SKILLS_DIR" -maxdepth 2 -name SKILL.md -print | sort || true
  else
    echo "Sandbox not initialized."
  fi
}

assess() {
  node - "$TOKEN_FILE" "$REAL_OPENCLAW_JSON" "$REAL_HEARTBEAT_FILE" "$REAL_SOUL_FILE" "$REAL_SKILLS_DIR" <<'EOF'
const fs = require('fs');
const path = require('path');

const [tokenFile, configFile, heartbeatFile, soulFile, skillsDir] = process.argv.slice(2);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function exists(file) {
  try { fs.accessSync(file); return true; } catch { return false; }
}

const stats = readJson(tokenFile);
const cfg = readJson(configFile);
const defaults = cfg?.agents?.defaults || {};
const total = stats?.total || {};
const models = total.models || {};
const history = stats?.history || {};
const totalInput = total.input || 0;
const totalOutput = total.output || 0;
const totalCacheRead = total.cacheRead || 0;
const totalCost = total.cost || 0;
const sessions = Object.values(history).reduce((sum, day) => sum + (day.sessions || day.count || 1), 0);
const activeDays = Math.max(1, Object.keys(history).length);
const avgSessionsPerDay = sessions / activeDays;
const avgTokensPerSession = sessions > 0 ? (totalInput + totalOutput) / sessions : 0;
const cacheHitRate = (totalInput + totalCacheRead) > 0 ? totalCacheRead / (totalInput + totalCacheRead) : 0;
const outputRatio = totalInput > 0 ? totalOutput / totalInput : 0;
const thinking = defaults.thinkingDefault;

const knownExpensive = new Set([
  'anthropic/claude-opus-4.6',
  'anthropic/claude-opus-4.5',
  'openai/gpt-5-pro',
  'openai/gpt-5.2-pro',
  'openai/gpt-5',
  'openai/gpt-5.2',
  'google/gemini-3.1-pro-preview',
  'google/gemini-2.5-pro',
  'x-ai/grok-4',
  'x-ai/grok-3',
  'openai/o3-pro',
  'amazon/nova-premier-v1'
]);

const expensiveMatch = Object.entries(models).find(([id, v]) => knownExpensive.has(id) && totalCost > 0 && ((v.cost || 0) / totalCost) > 0.5);

let skillNames = [];
try {
  skillNames = fs.readdirSync(skillsDir).filter(name => exists(path.join(skillsDir, name, 'SKILL.md')));
} catch {}

const report = [
  ['A01 expensive model', !!expensiveMatch, expensiveMatch ? `matched ${expensiveMatch[0]}` : 'needs >50% cost on a known replaceable model'],
  ['A02 heartbeat', exists(heartbeatFile), exists(heartbeatFile) ? 'HEARTBEAT.md present' : 'needs workspace HEARTBEAT.md with tasks'],
  ['A03 session resets', avgTokensPerSession < 5000 && avgSessionsPerDay > 5, `avg ${avgSessionsPerDay.toFixed(1)} sessions/day, ${avgTokensPerSession.toFixed(0)} tokens/session`],
  ['A04 skill cleanup', skillNames.length >= 2, `${skillNames.length} managed skills with SKILL.md detected`],
  ['A05 thinking', thinking === 'high' || thinking === 'xhigh' || thinking === 'on', `thinkingDefault=${thinking || '(unset)'}`],
  ['A06 prompt caching', cacheHitRate < 0.10, `cache hit ${(cacheHitRate * 100).toFixed(1)}%`],
  ['A07 safeguard', true, 'config-backed action; can always be forced if not already enabled'],
  ['A09 verbosity', outputRatio > 0.10 && totalOutput > 1000 && exists(soulFile), `output/input ${(outputRatio * 100).toFixed(1)}%, SOUL.md ${exists(soulFile) ? 'present' : 'missing'}`]
];

console.log('Cost Control local assessment');
console.log('');
for (const [name, ok, detail] of report) {
  console.log(`${ok ? 'READY ' : 'NEEDS '} ${name}: ${detail}`);
}
EOF
}

usage() {
  cat <<EOF
Usage:
  tests/cost-control/local/run-local-check.sh assess
  tests/cost-control/local/run-local-check.sh backup-token
  tests/cost-control/local/run-local-check.sh restore-token
  tests/cost-control/local/run-local-check.sh sandbox-init
  tests/cost-control/local/run-local-check.sh sandbox-reset
  tests/cost-control/local/run-local-check.sh apply case-a|case-b|case-c
  tests/cost-control/local/run-local-check.sh env
  tests/cost-control/local/run-local-check.sh status
EOF
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    assess)
      assess
      ;;
    backup-token)
      backup_token
      ;;
    restore-token)
      restore_token
      ;;
    sandbox-init)
      sandbox_init
      ;;
    sandbox-reset)
      sandbox_reset
      ;;
    apply)
      apply_case "${2:-}"
      ;;
    env)
      print_env
      ;;
    status)
      status
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
