# Cost Control Local Acceptance

[English | [简体中文](README_CN.md)]

This folder contains local acceptance assets for the Cost Control Center.

It is intentionally separate from business scripts. These helpers are designed for open-source users with different local `~/.openclaw` states.

The workflow has two layers:

1. `assess`
   Purpose: inspect the user's real local `~/.openclaw` and current token stats, then report which Cost Control scenarios are already naturally testable.
2. `sandbox`
   Purpose: create a clean sandbox under `tests/cost-control/local/.sandbox/openclaw`, then apply only the fixture state needed for each case.

This avoids changing the user's real OpenClaw state during acceptance testing, and keeps runs reproducible instead of inheriting the operator's local OpenClaw config.

## What the helper touches

- Always:
  - `data/token_stats/latest.json`
- Sandbox only:
  - `tests/cost-control/local/.sandbox/openclaw/*`
- It does not modify the real `~/.openclaw` after `sandbox-init`

## Supported cases

- `case-a`
  Purpose: trigger `A01` and `A05`
  Extra config: sets `agents.defaults.thinkingDefault` to `high`

- `case-b`
  Purpose: trigger `A06` and `A09`
  Extra config: clears `agents.defaults.thinkingDefault`

- `case-c`
  Purpose: trigger `A03` and `A04`
  Extra config: installs three managed-skill fixtures and adjusts mtimes

## Usage

From the repo root:

```bash
tests/cost-control/local/run-local-check.sh assess
tests/cost-control/local/run-local-check.sh backup-token
tests/cost-control/local/run-local-check.sh sandbox-init
tests/cost-control/local/run-local-check.sh env
tests/cost-control/local/run-local-check.sh apply case-a
tests/cost-control/local/run-local-check.sh status
tests/cost-control/local/run-local-check.sh restore-token
```

## Start ClawBridge Against The Sandbox

Start ClawBridge in the same shell after exporting the sandbox env:

```bash
export OPENCLAW_STATE_DIR=".../tests/cost-control/local/.sandbox/openclaw"
export OPENCLAW_WORKSPACE=".../tests/cost-control/local/.sandbox/openclaw/workspace"
export ACCESS_KEY="cost-control-local-key"
export PORT="3399"
npm start
```

ClawBridge resolves config and workspace from those environment variables, so this makes the running dashboard read and write only the sandbox copy.

## Run All Cases Automatically

You can run the full local acceptance flow with one command:

```bash
node tests/cost-control/local/run-all-cases.mjs
```

What it does:

1. Backs up `data/token_stats/latest.json`
2. Creates or refreshes a clean sandbox OpenClaw state
3. Applies `case-a`, `case-b`, `case-c` in order
4. Starts ClawBridge against the sandbox for each case
5. Calls the local Cost Control APIs
6. Tries the expected optimize actions
7. Attempts one Undo when the history entry is undoable
8. Writes a markdown and json report under `tests/cost-control/local/.reports/`

Notes:

- The controller starts its own ClawBridge process for each case.
- It automatically injects the sandbox env before startup.
- It disables startup and hourly analyzer runs for those harness-managed ClawBridge processes so fixtures are not overwritten.
- It probes for a free port starting from `3399` and records the actual base URL in the report.

## Verified Baseline

Latest verified run: March 13, 2026

- Report files:
  - `tests/cost-control/local/.reports/cost-control-report.md`
  - `tests/cost-control/local/.reports/cost-control-report.json`
- Verified outcomes:
  - `case-a`: `A01`, `A05`, and Undo succeed
  - `case-b`: `A06`, `A09`, and Undo succeed
  - `case-c`: `A04` and Undo succeed; `A03` is detected as advisory

Use this as the current expected baseline when the local acceptance harness is rerun.

## Suggested flow

1. Run `assess` to see what your real local state already covers.
2. Back up the repo token stats with `backup-token`.
3. Create the sandbox with `sandbox-init`.
4. Export the sandbox env and start ClawBridge in that shell.
5. Apply one fixture case at a time.
6. Verify UI, Apply, History, and Undo behavior.
7. Restore token stats with `restore-token` when finished.

## Suggested manual checklist per case

1. Start ClawBridge.
2. Open the Cost Control Center UI.
3. Confirm the expected cards appear for the selected case.
4. Apply one action at a time against the sandbox environment.
5. Confirm file or config changes in the sandbox OpenClaw directory.
6. Use Undo and verify recovery.
7. If checking files directly, inspect the sandbox path instead of the real `~/.openclaw`.
