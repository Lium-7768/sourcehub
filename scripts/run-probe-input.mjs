import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = '/root/.openclaw/workspace/sourcehub';
const inputPath = path.join(ROOT, 'data', 'normalized', 'probe_input.csv');
const resultsDir = path.join(ROOT, 'data', 'results');
const jsonOut = path.join(resultsDir, 'probe_results.json');
const csvOut = path.join(resultsDir, 'probe_results.csv');
const failOut = path.join(resultsDir, 'probe_failures.csv');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function toCsvRow(values) {
  return values.map((value) => {
    const s = String(value ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',');
}

function readRows(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
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

async function probeHost(host, preferredPort) {
  const portPlan = preferredPort ? [preferredPort] : [80, 443];
  for (const port of portPlan) {
    const latencies = [];
    let failures = 0;
    for (let i = 0; i < 2; i += 1) {
      try {
        latencies.push(await connectOnce(host, port, 1500));
      } catch {
        failures += 1;
      }
    }
    if (latencies.length > 0) {
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const jitter = latencies.length < 2 ? 0 : Math.abs(latencies[1] - latencies[0]);
      const loss = Number(((failures / 2) * 100).toFixed(1));
      const status = failures === 0 ? 'ok' : 'partial';
      const score = Math.max(1, Number((100 - Math.min(60, avg / 5) - Math.min(40, loss * 2)).toFixed(1)));
      return { ok: true, port, latency_ms: avg, jitter_ms: jitter, loss_pct: loss, status, score };
    }
  }
  return { ok: false };
}

const limit = Number(process.env.PROBE_LIMIT || '100');
const rows = readRows(inputPath).slice(0, limit);
const passed = [];
const failed = [];
for (const row of rows) {
  const preferredPort = row.port && /^\d+$/.test(row.port) ? Number(row.port) : null;
  const result = await probeHost(row.ip, preferredPort);
  if (result.ok) {
    passed.push({
      host: row.ip,
      port: result.port,
      latency_ms: result.latency_ms,
      loss_pct: result.loss_pct,
      jitter_ms: result.jitter_ms,
      score: result.score,
      org: row.org,
      city: row.city,
      country: row.country,
      checked_at: new Date().toISOString(),
    });
  } else {
    failed.push({ ip: row.ip, port: row.port, org: row.org, city: row.city, country: row.country });
  }
}

passed.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify({ items: passed, meta: { count: passed.length, failed: failed.length, scanned: rows.length } }, null, 2) + '\n');
fs.writeFileSync(csvOut, [
  toCsvRow(['host', 'port', 'latency_ms', 'loss_pct', 'jitter_ms', 'score', 'org', 'city', 'country', 'checked_at']),
  ...passed.map((row) => toCsvRow([row.host, row.port, row.latency_ms, row.loss_pct, row.jitter_ms, row.score, row.org, row.city, row.country, row.checked_at]))
].join('\n') + '\n');
fs.writeFileSync(failOut, [
  toCsvRow(['ip', 'port', 'org', 'city', 'country']),
  ...failed.map((row) => toCsvRow([row.ip, row.port, row.org, row.city, row.country]))
].join('\n') + '\n');
console.log(JSON.stringify({ jsonOut, csvOut, failOut, passed: passed.length, failed: failed.length, scanned: rows.length }, null, 2));
