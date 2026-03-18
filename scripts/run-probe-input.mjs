import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
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

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function summarizeLatencies(latencies, attempts) {
  if (!latencies.length) {
    return {
      avg: null,
      min: null,
      max: null,
      jitter: null,
      lossPct: attempts > 0 ? 100 : null,
      ok: false,
    };
  }
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const jitter = latencies.length < 2 ? 0 : Number((max - min).toFixed(1));
  const lossPct = Number((((attempts - latencies.length) / attempts) * 100).toFixed(1));
  return {
    avg: Number(avg.toFixed(1)),
    min: Number(min.toFixed(1)),
    max: Number(max.toFixed(1)),
    jitter,
    lossPct,
    ok: true,
  };
}

function pingHost(host) {
  const command = 'ping';
  const args = ['-n', '-c', '2', '-W', '1', host];
  let output = '';
  try {
    output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        ok: false,
        avg: null,
        min: null,
        max: null,
        lossPct: null,
        error: 'ping_unavailable',
      };
    }
    output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
  }

  const packetMatch = output.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+(?:packets\s+)?received,.*?(\d+(?:\.\d+)?)%\s+packet loss/i);
  const rttMatch = output.match(/(?:round-trip|rtt) min\/avg\/max(?:\/mdev)? = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)\/[0-9.]+\s*ms/i);

  const transmitted = parseNumber(packetMatch?.[1]);
  const received = parseNumber(packetMatch?.[2]);
  const lossPct = parseNumber(packetMatch?.[3]);
  const min = parseNumber(rttMatch?.[1]);
  const avg = parseNumber(rttMatch?.[2]);
  const max = parseNumber(rttMatch?.[3]);
  const ok = Boolean(received && received > 0);

  return {
    ok,
    avg,
    min,
    max,
    lossPct,
    error: ok ? null : 'ping_failed',
  };
}

async function tcpProbePort(host, port, attempts = 2, timeoutMs = 1500) {
  const latencies = [];
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      latencies.push(await connectOnce(host, port, timeoutMs));
    } catch (error) {
      lastError = error?.message || 'tcp_failed';
    }
  }
  const summary = summarizeLatencies(latencies, attempts);
  return {
    port,
    ok: summary.ok,
    avg: summary.avg,
    min: summary.min,
    max: summary.max,
    jitter: summary.jitter,
    lossPct: summary.lossPct,
    error: summary.ok ? null : lastError,
  };
}

async function probeHost(host, preferredPort) {
  const ping = pingHost(host);
  const portPlan = preferredPort ? [preferredPort] : [80, 443];

  for (const port of portPlan) {
    const tcp = await tcpProbePort(host, port);
    if (tcp.ok) {
      const score = Math.max(
        1,
        Number((100 - Math.min(60, (tcp.avg ?? 999) / 5) - Math.min(40, (tcp.lossPct ?? 100) * 2)).toFixed(1)),
      );
      return {
        ok: true,
        port,
        score,
        ping,
        tcp,
      };
    }
  }

  return {
    ok: false,
    ping,
    tcp: {
      ok: false,
      avg: null,
      min: null,
      max: null,
      jitter: null,
      lossPct: 100,
      error: 'all_tcp_ports_failed',
    },
  };
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
      latency_ms: result.tcp.avg,
      loss_pct: result.tcp.lossPct,
      jitter_ms: result.tcp.jitter,
      ping_avg_ms: result.ping.avg,
      ping_min_ms: result.ping.min,
      ping_max_ms: result.ping.max,
      ping_loss_pct: result.ping.lossPct,
      ping_ok: result.ping.ok,
      tcp_avg_ms: result.tcp.avg,
      tcp_min_ms: result.tcp.min,
      tcp_max_ms: result.tcp.max,
      tcp_jitter_ms: result.tcp.jitter,
      tcp_loss_pct: result.tcp.lossPct,
      tcp_ok: result.tcp.ok,
      score: result.score,
      org: row.org,
      city: row.city,
      country: row.country,
      checked_at: new Date().toISOString(),
    });
  } else {
    failed.push({
      ip: row.ip,
      port: row.port,
      org: row.org,
      city: row.city,
      country: row.country,
      ping_ok: result.ping.ok,
      ping_avg_ms: result.ping.avg,
      ping_loss_pct: result.ping.lossPct,
      tcp_error: result.tcp.error,
    });
  }
}

passed.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify({ items: passed, meta: { count: passed.length, failed: failed.length, scanned: rows.length } }, null, 2) + '\n');
fs.writeFileSync(csvOut, [
  toCsvRow([
    'host', 'port', 'latency_ms', 'loss_pct', 'jitter_ms',
    'ping_avg_ms', 'ping_min_ms', 'ping_max_ms', 'ping_loss_pct', 'ping_ok',
    'tcp_avg_ms', 'tcp_min_ms', 'tcp_max_ms', 'tcp_jitter_ms', 'tcp_loss_pct', 'tcp_ok',
    'score', 'org', 'city', 'country', 'checked_at',
  ]),
  ...passed.map((row) => toCsvRow([
    row.host, row.port, row.latency_ms, row.loss_pct, row.jitter_ms,
    row.ping_avg_ms, row.ping_min_ms, row.ping_max_ms, row.ping_loss_pct, row.ping_ok,
    row.tcp_avg_ms, row.tcp_min_ms, row.tcp_max_ms, row.tcp_jitter_ms, row.tcp_loss_pct, row.tcp_ok,
    row.score, row.org, row.city, row.country, row.checked_at,
  ])),
].join('\n') + '\n');
fs.writeFileSync(failOut, [
  toCsvRow(['ip', 'port', 'org', 'city', 'country', 'ping_ok', 'ping_avg_ms', 'ping_loss_pct', 'tcp_error']),
  ...failed.map((row) => toCsvRow([row.ip, row.port, row.org, row.city, row.country, row.ping_ok, row.ping_avg_ms, row.ping_loss_pct, row.tcp_error])),
].join('\n') + '\n');
console.log(JSON.stringify({ jsonOut, csvOut, failOut, passed: passed.length, failed: failed.length, scanned: rows.length }, null, 2));
