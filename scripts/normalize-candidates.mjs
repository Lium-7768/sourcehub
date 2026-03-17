import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const importsDir = path.join(ROOT, 'data', 'imports');
const normalizedDir = path.join(ROOT, 'data', 'normalized');
const rejectsDir = path.join(ROOT, 'data', 'rejects');

const firstPassOut = path.join(normalizedDir, 'first_pass_candidates.csv');
const probeInputOut = path.join(normalizedDir, 'probe_input.csv');
const rejectOut = path.join(rejectsDir, 'first_pass_rejects.csv');
const summaryOut = path.join(normalizedDir, 'first_pass_summary.json');

function listInputFiles() {
  if (!fs.existsSync(importsDir)) return [];
  return fs.readdirSync(importsDir)
    .filter((name) => /\.(csv|json)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(importsDir, name));
}

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
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
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

function isIpv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIpv6(ip) {
  return ip.includes(':');
}

function normalizePort(port) {
  const s = String(port ?? '').trim();
  if (!s || !/^\d+$/.test(s)) return '';
  const n = Number(s);
  if (n < 1 || n > 65535) return '';
  return String(n);
}

function scoreRow(row) {
  let score = 0;
  if (!row.domain && !row.host) score += 3;
  if (row.protocol === 'https') score += 2;
  if (row.port === '443') score += 4;
  if (['8443', '2053', '2083', '2087', '2096', '4433'].includes(row.port)) score += 2;
  if (row.title && /403 Forbidden/i.test(row.title)) score += 1;
  if (row.org && /oracle/i.test(row.org)) score += 2;
  if (row.title && /(phishing|cloudflare|just a moment|attention required|dns points to prohibited ip)/i.test(row.title)) score -= 5;
  return score;
}

function rejectReason(row) {
  if (!row.ip) return 'missing_ip';
  if (isIpv6(row.ip)) return 'ipv6_not_in_scope';
  if (!isIpv4(row.ip)) return 'invalid_ip';
  const title = row.title || '';
  const domain = row.domain || '';
  const host = row.host || '';
  if (/(phishing|dns points to prohibited ip|attention required|just a moment)/i.test(title)) return 'noise_title';
  if (/(cloudfront\.net)$/i.test(domain)) return 'cdn_domain';
  if (/(\.vip|\.app|\.shop|\.cc|\.cn|\.immo|\.villas|\.xyz|\.exchange)$/i.test(domain || host)) return 'noise_domain_shell';
  return '';
}

function normalizeObject(raw, sourceFile) {
  return {
    ip: String(raw.ip || '').trim(),
    port: normalizePort(raw.port || ''),
    protocol: String(raw.protocol || '').trim().toLowerCase(),
    title: String(raw.title || '').trim(),
    domain: String(raw.domain || '').trim().toLowerCase(),
    host: String(raw.host || '').trim(),
    link: String(raw.link || '').trim(),
    country: String(raw.country || '').trim(),
    city: String(raw.city || '').trim(),
    org: String(raw.org || '').trim(),
    source_file: sourceFile,
  };
}

function readInput(file) {
  const base = path.basename(file);
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    return rows.map((item) => normalizeObject(item, base));
  }

  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((h, idx) => [h, (values[idx] ?? '').trim()]));
    return normalizeObject(row, base);
  });
}

const inputFiles = listInputFiles();
const firstPassRows = [];
const byIp = new Map();
const rejects = [];
const stats = {
  files: [],
  totalFiles: inputFiles.length,
  totalRows: 0,
  acceptedRows: 0,
  rejectedRows: 0,
  dedupedRows: 0,
  uniqueIps: 0,
};

for (const file of inputFiles) {
  const rows = readInput(file);
  stats.files.push(path.basename(file));

  for (const row of rows) {
    stats.totalRows += 1;
    const reason = rejectReason(row);
    if (reason) {
      rejects.push({ ...row, reason });
      stats.rejectedRows += 1;
      continue;
    }

    const candidate = {
      ip: row.ip,
      port: row.port || (row.protocol === 'https' ? '443' : row.protocol === 'http' ? '80' : ''),
      org: row.org,
      city: row.city,
      country: row.country,
      source_file: row.source_file,
      sample_host: row.host || row.link || row.ip,
      score: scoreRow(row),
    };

    firstPassRows.push(candidate);
    const existing = byIp.get(candidate.ip);
    if (!existing) {
      byIp.set(candidate.ip, { ...candidate });
      stats.acceptedRows += 1;
      continue;
    }

    stats.dedupedRows += 1;
    if (candidate.score > existing.score) {
      byIp.set(candidate.ip, { ...candidate });
    } else {
      if (!existing.port && candidate.port) existing.port = candidate.port;
      if (!existing.org && candidate.org) existing.org = candidate.org;
      if (!existing.city && candidate.city) existing.city = candidate.city;
      if (!existing.country && candidate.country) existing.country = candidate.country;
      if (!existing.sample_host && candidate.sample_host) existing.sample_host = candidate.sample_host;
    }
  }
}

const probeInputRows = Array.from(byIp.values())
  .sort((a, b) => a.ip.localeCompare(b.ip))
  .map(({ ip, port, org, city, country, source_file, sample_host }) => ({ ip, port, org, city, country, source_file, sample_host }));

stats.uniqueIps = probeInputRows.length;

fs.mkdirSync(normalizedDir, { recursive: true });
fs.mkdirSync(rejectsDir, { recursive: true });

const candidateHeader = ['ip', 'port', 'org', 'city', 'country', 'source_file', 'sample_host'];
const firstPassHeader = ['ip', 'port', 'org', 'city', 'country', 'source_file', 'sample_host', 'score'];
const rejectHeader = ['ip', 'port', 'protocol', 'title', 'domain', 'host', 'country', 'city', 'org', 'source_file', 'reason'];

fs.writeFileSync(firstPassOut, [
  toCsvRow(firstPassHeader),
  ...firstPassRows.map((row) => toCsvRow(firstPassHeader.map((key) => row[key] ?? ''))),
].join('\n') + '\n');

fs.writeFileSync(probeInputOut, [
  toCsvRow(candidateHeader),
  ...probeInputRows.map((row) => toCsvRow(candidateHeader.map((key) => row[key] ?? ''))),
].join('\n') + '\n');

fs.writeFileSync(rejectOut, [
  toCsvRow(rejectHeader),
  ...rejects.map((row) => toCsvRow(rejectHeader.map((key) => row[key] ?? ''))),
].join('\n') + '\n');

fs.writeFileSync(summaryOut, JSON.stringify({
  ...stats,
  outputs: {
    first_pass: firstPassOut,
    probe_input: probeInputOut,
    rejects: rejectOut,
  },
}, null, 2) + '\n');

console.log(JSON.stringify({
  firstPassOut,
  probeInputOut,
  rejectOut,
  summaryOut,
  stats,
}, null, 2));
