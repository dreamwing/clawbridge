import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const localDir = path.join(rootDir, 'tests/cost-control/local');
const reportDir = path.join(localDir, '.reports');
const sandboxDir = path.join(localDir, '.sandbox/openclaw');
const sandboxWorkspace = path.join(sandboxDir, 'workspace');
const helperScript = path.join(localDir, 'run-local-check.sh');

const requestedBaseUrl = process.env.CLAWBRIDGE_BASE_URL || 'http://[::1]:3399';
const accessKey = process.env.CLAWBRIDGE_ACCESS_KEY || process.env.ACCESS_KEY || 'cost-control-local-key';
const nodeBin = process.execPath;

const cases = [
  { id: 'case-a', required: ['A01', 'A05'] },
  { id: 'case-b', required: ['A06', 'A09'] },
  { id: 'case-c', required: ['A03', 'A04'] }
];

function runHelper(args) {
  execFileSync(helperScript, args, {
    cwd: rootDir,
    stdio: 'inherit'
  });
}

async function fetchJson(url, options = {}) {
  const headers = {
    'x-claw-key': accessKey,
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

async function waitForServer(url, child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) {
      throw new Error(`ClawBridge exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetchJson(`${url}/api/config`);
      if (res.ok) return;
    } catch {
      // Retry until the server is ready.
    }
    await delay(500);
  }
  throw new Error('Timed out waiting for ClawBridge to start');
}

function isPortFree(port, host = '::1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  for (let i = 0; i < 20; i++, port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found starting from ${startPort}`);
}

function buildBaseUrl(port) {
  return `http://[::1]:${port}`;
}

function startServer(caseId, port) {
  fs.mkdirSync(reportDir, { recursive: true });
  const logPath = path.join(reportDir, `${caseId}.server.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawn(nodeBin, ['index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      ACCESS_KEY: accessKey,
      PORT: String(port),
      OPENCLAW_STATE_DIR: sandboxDir,
      OPENCLAW_WORKSPACE: sandboxWorkspace,
      COST_CONTROL_SKIP_ANALYZER: 'true',
      ENABLE_EMBEDDED_TUNNEL: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return { child, logStream, logPath };
}

async function stopServer(server) {
  server.child.kill('SIGTERM');
  await delay(500);
  if (server.child.exitCode === null) {
    server.child.kill('SIGKILL');
  }
  server.logStream.end();
}

function buildMeta(action) {
  const meta = action._meta ? { ...action._meta } : {};
  if (action.actionId === 'A02' && action.options?.length) {
    meta.interval = action.options[0].value;
  }
  if (action.actionId === 'A04') {
    const idle = action._meta?.idleSkills || [];
    const quiet = action._meta?.quietSkills || [];
    const selected = idle.length > 0 ? idle.map(skill => skill.name) : quiet.map(skill => skill.name);
    meta.selectedSkillNames = selected;
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

async function runCase(testCase, baseUrl, port) {
  runHelper(['sandbox-reset']);
  runHelper(['apply', testCase.id]);

  const server = startServer(testCase.id, port);
  try {
    await waitForServer(baseUrl, server.child);

    const diagnostics = await fetchJson(`${baseUrl}/api/diagnostics`);
    if (!diagnostics.ok) {
      throw new Error(`Diagnostics failed with ${diagnostics.status}`);
    }

    const actions = diagnostics.body.actions || [];
    const actualIds = actions.map(action => action.actionId);
    const missing = testCase.required.filter(id => !actualIds.includes(id));
    const applied = [];

    for (const actionId of testCase.required.filter(id => actualIds.includes(id) && !['A03'].includes(id))) {
      const action = actions.find(item => item.actionId === actionId);
      const optimize = await fetchJson(`${baseUrl}/api/optimize/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savings: action?.savings || 0,
          meta: buildMeta(action)
        })
      });
      applied.push({
        actionId,
        ok: optimize.ok,
        status: optimize.status,
        details: optimize.body?.details || optimize.body
      });
    }

    const history = await fetchJson(`${baseUrl}/api/optimizations/history`);
    let undo = null;
    if (history.ok && Array.isArray(history.body) && history.body[0]?.undoable && history.body[0]?.backupPath) {
      const undoRes = await fetchJson(`${baseUrl}/api/optimizations/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupPath: history.body[0].backupPath })
      });
      undo = {
        ok: undoRes.ok,
        status: undoRes.status,
        details: undoRes.body
      };
    }

    return {
      caseId: testCase.id,
      required: testCase.required,
      actualIds,
      missing,
      diagnosticsSummary: {
        totalMonthlySavings: diagnostics.body.totalMonthlySavings,
        advisoryMonthlySavings: diagnostics.body.advisoryMonthlySavings || 0,
        currentMonthlyCost: diagnostics.body.currentMonthlyCost
      },
      baseUrl,
      applied,
      undo,
      serverLog: server.logPath
    };
  } finally {
    await stopServer(server);
  }
}

function writeReports(results) {
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'cost-control-report.json');
  const mdPath = path.join(reportDir, 'cost-control-report.md');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  const lines = ['# Cost Control Local Report', ''];
  for (const result of results) {
    lines.push(`## ${result.caseId}`);
    lines.push('');
    lines.push(`- Required: ${result.required.join(', ')}`);
    lines.push(`- Detected: ${result.actualIds.join(', ') || '(none)'}`);
    lines.push(`- Missing: ${result.missing.join(', ') || '(none)'}`);
    lines.push(`- Savings: actionable $${Number(result.diagnosticsSummary.totalMonthlySavings || 0).toFixed(2)}/mo, advisory $${Number(result.diagnosticsSummary.advisoryMonthlySavings || 0).toFixed(2)}/mo`);
    lines.push(`- Base URL: ${result.baseUrl}`);
    if (result.applied.length > 0) {
      lines.push(`- Applied: ${result.applied.map(item => `${item.actionId}:${item.ok ? 'ok' : 'fail'}`).join(', ')}`);
    } else {
      lines.push('- Applied: none');
    }
    if (result.undo) {
      lines.push(`- Undo: ${result.undo.ok ? 'ok' : 'fail'} (${result.undo.status})`);
    } else {
      lines.push('- Undo: not attempted');
    }
    lines.push(`- Server log: ${result.serverLog}`);
    lines.push('');
  }

  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

async function main() {
  const requestedPort = Number(new URL(requestedBaseUrl).port || 3399);
  const port = await findAvailablePort(requestedPort);
  const baseUrl = buildBaseUrl(port);

  runHelper(['backup-token']);
  runHelper(['sandbox-init']);

  const results = [];
  try {
    for (const testCase of cases) {
      results.push(await runCase(testCase, baseUrl, port));
    }
  } finally {
    runHelper(['restore-token']);
  }

  const report = writeReports(results);
  console.log(`Wrote report:\n- ${report.mdPath}\n- ${report.jsonPath}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
