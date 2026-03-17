import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const importsDir = path.join(ROOT, 'data', 'imports');
const normalizedDir = path.join(ROOT, 'data', 'normalized');
const rejectsDir = path.join(ROOT, 'data', 'rejects');
const cacheDir = path.join(normalizedDir, 'cache');

const firstPassOut = path.join(normalizedDir, 'first_pass_candidates.csv');
const probeInputOut = path.join(normalizedDir, 'probe_input.csv');
const rejectOut = path.join(rejectsDir, 'first_pass_rejects.csv');
const summaryOut = path.join(normalizedDir, 'first_pass_summary.json');
const manifestOut = path.join(normalizedDir, 'import_manifest.json');
const qualityGateOut = path.join(normalizedDir, 'quality_gate.json');

const MAX_IMPORT_FILE_BYTES = Number(process.env.MAX_IMPORT_FILE_BYTES || String(10 * 1024 * 1024));
const REQUIRED_FIELDS = ['ip'];
const OPTIONAL_FIELDS = ['port', 'protocol', 'title', 'domain', 'host', 'link', 'country', 'city', 'org'];
const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

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

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cachePathFor(fileName) {
  return path.join(cacheDir, `${safeName(fileName)}.json`);
}

function fileMeta(file) {
  const stat = fs.statSync(file);
  const raw = fs.readFileSync(file);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(raw),
  };
}

function inspectCsv(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, reason: 'empty_file' };
  }
  if (lines.length === 1) {
    return { ok: false, reason: 'missing_data_rows' };
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const missing = REQUIRED_FIELDS.filter((field) => !headers.includes(field));
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_required_fields', details: { missing, headers } };
  }
  const unknown = headers.filter((field) => !ALLOWED_FIELDS.has(field));
  return {
    ok: true,
    type: 'csv',
    headers,
    rowCount: Math.max(0, lines.length - 1),
    unknownFields: unknown,
  };
}

function inspectJson(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) {
    return { ok: false, reason: 'empty_file' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'invalid_json', details: { message: error instanceof Error ? error.message : String(error) } };
  }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!rows) {
    return { ok: false, reason: 'json_shape_not_supported' };
  }
  if (rows.length === 0) {
    return { ok: false, reason: 'empty_rows' };
  }
  const sample = rows.find((row) => row && typeof row === 'object') ?? null;
  if (!sample) {
    return { ok: false, reason: 'json_rows_not_objects' };
  }
  const keys = Object.keys(sample);
  const missing = REQUIRED_FIELDS.filter((field) => !keys.includes(field));
  if (missing.length > 0) {
    return { ok: false, reason: 'missing_required_fields', details: { missing, keys } };
  }
  const unknown = keys.filter((field) => !ALLOWED_FIELDS.has(field));
  return {
    ok: true,
    type: 'json',
    headers: keys,
    rowCount: rows.length,
    unknownFields: unknown,
  };
}

function buildQualityGate(files) {
  const gates = [];
  const stemMap = new Map();

  for (const file of files) {
    const name = path.basename(file);
    const stem = name.replace(/\.[^.]+$/, '');
    stemMap.set(stem, [...(stemMap.get(stem) || []), name]);
  }

  const duplicateStemNames = new Set(
    Array.from(stemMap.values())
      .filter((names) => names.length > 1)
      .flat(),
  );

  for (const file of files) {
    const name = path.basename(file);
    const meta = fileMeta(file);
    let gate = {
      file: name,
      size: meta.size,
      sha256: meta.sha256,
      ok: true,
      warnings: [],
      errors: [],
      rowCount: 0,
      headers: [],
      type: path.extname(file).slice(1).toLowerCase(),
    };

    if (duplicateStemNames.has(name)) {
      gate.ok = false;
      gate.errors.push('duplicate_batch_stem');
    }
    if (meta.size === 0) {
      gate.ok = false;
      gate.errors.push('empty_file');
    }
    if (meta.size > MAX_IMPORT_FILE_BYTES) {
      gate.ok = false;
      gate.errors.push('file_too_large');
    }

    if (gate.ok) {
      const inspected = file.endsWith('.csv') ? inspectCsv(file) : inspectJson(file);
      gate.type = inspected.type || gate.type;
      if (!inspected.ok) {
        gate.ok = false;
        gate.errors.push(inspected.reason);
        if (inspected.details) gate.details = inspected.details;
      } else {
        gate.rowCount = inspected.rowCount || 0;
        gate.headers = inspected.headers || [];
        if (inspected.unknownFields?.length) {
          gate.warnings.push('unknown_fields_present');
          gate.unknownFields = inspected.unknownFields;
        }
      }
    }

    gates.push(gate);
  }

  return {
    generated_at: new Date().toISOString(),
    max_import_file_bytes: MAX_IMPORT_FILE_BYTES,
    required_fields: REQUIRED_FIELDS,
    files: gates,
    summary: {
      total_files: gates.length,
      accepted_files: gates.filter((x) => x.ok).length,
      rejected_files: gates.filter((x) => !x.ok).length,
      warning_files: gates.filter((x) => x.warnings.length > 0).length,
    },
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

function processRows(rows) {
  const firstPassRows = [];
  const rejects = [];
  const stats = {
    totalRows: 0,
    acceptedRows: 0,
    rejectedRows: 0,
  };

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
    stats.acceptedRows += 1;
  }

  return { firstPassRows, rejects, stats };
}

function readCache(fileName) {
  const cacheFile = cachePathFor(fileName);
  if (!fs.existsSync(cacheFile)) return null;
  return loadJson(cacheFile, null);
}

function writeCache(fileName, payload) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePathFor(fileName), JSON.stringify(payload, null, 2) + '\n');
}

const inputFiles = listInputFiles();
fs.mkdirSync(normalizedDir, { recursive: true });
fs.mkdirSync(rejectsDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const qualityGate = buildQualityGate(inputFiles);
fs.writeFileSync(qualityGateOut, JSON.stringify(qualityGate, null, 2) + '\n');

const acceptedFiles = qualityGate.files.filter((file) => file.ok).map((file) => file.file);
const rejectedFiles = qualityGate.files.filter((file) => !file.ok).map((file) => ({ file: file.file, errors: file.errors }));
const previousManifest = loadJson(manifestOut, { files: {} });
const firstPassRows = [];
const rejects = [];
const byIp = new Map();
const stats = {
  files: acceptedFiles,
  totalFiles: inputFiles.length,
  acceptedFiles: acceptedFiles.length,
  rejectedFiles: rejectedFiles.length,
  totalRows: 0,
  acceptedRows: 0,
  rejectedRows: 0,
  dedupedRows: 0,
  uniqueIps: 0,
  cacheHits: 0,
  cacheMisses: 0,
  changedFiles: [],
  unchangedFiles: [],
  skippedFiles: rejectedFiles,
};

for (const gate of qualityGate.files.filter((file) => file.ok)) {
  const file = path.join(importsDir, gate.file);
  const meta = { size: gate.size, sha256: gate.sha256, rowCount: gate.rowCount, headers: gate.headers };
  const prev = previousManifest.files?.[gate.file] || null;
  const unchanged = prev && prev.sha256 === meta.sha256 && prev.size === meta.size;

  let processed;
  if (unchanged) {
    processed = readCache(gate.file);
  }

  if (unchanged && processed) {
    stats.cacheHits += 1;
    stats.unchangedFiles.push(gate.file);
  } else {
    const rows = readInput(file);
    processed = processRows(rows);
    writeCache(gate.file, { meta, ...processed });
    stats.cacheMisses += 1;
    stats.changedFiles.push(gate.file);
  }

  stats.totalRows += processed.stats.totalRows;
  stats.acceptedRows += processed.stats.acceptedRows;
  stats.rejectedRows += processed.stats.rejectedRows;
  firstPassRows.push(...processed.firstPassRows);
  rejects.push(...processed.rejects);
}

for (const candidate of firstPassRows) {
  const existing = byIp.get(candidate.ip);
  if (!existing) {
    byIp.set(candidate.ip, { ...candidate });
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

const probeInputRows = Array.from(byIp.values())
  .sort((a, b) => a.ip.localeCompare(b.ip))
  .map(({ ip, port, org, city, country, source_file, sample_host }) => ({ ip, port, org, city, country, source_file, sample_host }));

stats.uniqueIps = probeInputRows.length;

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

const manifest = {
  generated_at: new Date().toISOString(),
  files: Object.fromEntries(qualityGate.files.map((file) => [file.file, {
    sha256: file.sha256,
    size: file.size,
    rowCount: file.rowCount,
    ok: file.ok,
    headers: file.headers,
    errors: file.errors,
  }])),
};
fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n');

fs.writeFileSync(summaryOut, JSON.stringify({
  ...stats,
  outputs: {
    first_pass: firstPassOut,
    probe_input: probeInputOut,
    rejects: rejectOut,
    manifest: manifestOut,
    quality_gate: qualityGateOut,
  },
}, null, 2) + '\n');

console.log(JSON.stringify({
  firstPassOut,
  probeInputOut,
  rejectOut,
  summaryOut,
  manifestOut,
  qualityGateOut,
  stats,
}, null, 2));
