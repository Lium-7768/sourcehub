import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const resultsDir = path.join(ROOT, 'data', 'results');

const host = String(process.env.TARGET_HOST || '').trim();
const ports = String(process.env.TARGET_PORTS || '80,443')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => Number(x))
  .filter((x) => Number.isInteger(x) && x >= 1 && x <= 65535);
const attempts = Math.max(1, Number(process.env.PROBE_ATTEMPTS || '3'));
const timeoutMs = Math.max(100, Number(process.env.PROBE_TIMEOUT_MS || '1500'));
const region = String(process.env.REGION || 'github-actions');

if (!host) {
  console.error('Missing TARGET_HOST');
  process.exit(1);
}
if (!ports.length) {
  console.error('No valid TARGET_PORTS');
  process.exit(1);
}

function connectOnce(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      const latency = Date.now() - start;
      cleanup();
      resolve(latency);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('timeout')));
    socket.once('connect', ok);
    socket.once('error', fail);
  });
}

function toCsvRow(values) {
  return values.map((value) => {
    const s = String(value ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',');
}

async function probePort(port) {
  const latencies = [];
  const errors = [];
  for (let i = 0; i < attempts; i += 1) {
    try {
      latencies.push(await connectOnce(host, port, timeoutMs));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const checkedAt = new Date().toISOString();
  if (!latencies.length) {
    return {
      host,
      port,
      status: 'failed',
      attempts,
      success_count: 0,
      failure_count: errors.length,
      loss_pct: 100,
      latency_ms: null,
      jitter_ms: null,
      checked_at: checkedAt,
      region,
      last_error: errors[errors.length - 1] || 'connect_failed',
    };
  }
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const jitter = latencies.length < 2 ? 0 : Math.max(...latencies) - Math.min(...latencies);
  const loss = Number((((attempts - latencies.length) / attempts) * 100).toFixed(1));
  return {
    host,
    port,
    status: latencies.length === attempts ? 'ok' : 'partial',
    attempts,
    success_count: latencies.length,
    failure_count: attempts - latencies.length,
    loss_pct: loss,
    latency_ms: Number(avg.toFixed(2)),
    jitter_ms: Number(jitter.toFixed(2)),
    checked_at: checkedAt,
    region,
    last_error: errors[errors.length - 1] || null,
  };
}

const results = [];
for (const port of ports) {
  results.push(await probePort(port));
}

fs.mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonOut = path.join(resultsDir, `fixed_target_probe_${host.replace(/[^\w.-]+/g, '_')}_${stamp}.json`);
const csvOut = path.join(resultsDir, `fixed_target_probe_${host.replace(/[^\w.-]+/g, '_')}_${stamp}.csv`);

fs.writeFileSync(jsonOut, JSON.stringify({
  target: host,
  ports,
  attempts,
  timeout_ms: timeoutMs,
  region,
  results,
}, null, 2) + '\n');

fs.writeFileSync(csvOut, [
  toCsvRow(['host', 'port', 'status', 'attempts', 'success_count', 'failure_count', 'loss_pct', 'latency_ms', 'jitter_ms', 'checked_at', 'region', 'last_error']),
  ...results.map((row) => toCsvRow([
    row.host,
    row.port,
    row.status,
    row.attempts,
    row.success_count,
    row.failure_count,
    row.loss_pct,
    row.latency_ms ?? '',
    row.jitter_ms ?? '',
    row.checked_at,
    row.region,
    row.last_error ?? '',
  ])),
].join('\n') + '\n');

console.log(JSON.stringify({ success: true, target: host, ports, attempts, timeoutMs, region, results, jsonOut, csvOut }, null, 2));
