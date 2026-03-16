import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DB_NAME = process.env.D1_DB_NAME || 'sourcehub';
const SOURCE_ID = process.env.PUBLIC_SOURCE_ID || 'src_public_results_db';
const INPUT = process.env.INPUT || path.resolve('data/results/probe_results.json');
const REGION = process.env.REGION || 'HKG';
const REMOTE = process.env.REMOTE !== '0';

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const items = Array.isArray(payload?.items) ? payload.items : [];
const now = nowIso();

const lines = [];
lines.push(`DELETE FROM latest_results WHERE source_id = ${q(SOURCE_ID)};`);
lines.push(`DELETE FROM measurements WHERE source_id = ${q(SOURCE_ID)};`);
lines.push(`DELETE FROM items WHERE source_id = ${q(SOURCE_ID)};`);
lines.push(
  `UPDATE sources SET ` +
  `name=${q('public probe results')}, ` +
  `type=${q('json_api')}, ` +
  `enabled=1, is_public=1, ` +
  `config_json=${q(JSON.stringify({ mode: 'latest_results', note: 'managed from file flow, exposed via latest_results' }))}, ` +
  `tags_json=${q(JSON.stringify(['public', 'results', 'latest-results']))}, ` +
  `sync_interval_min=1440, ` +
  `last_status=${q('success')}, ` +
  `item_count=${items.length}, ` +
  `updated_at=${q(now)}, ` +
  `probe_last_at=${q(now)}, ` +
  `probe_last_status=${q('success')}, ` +
  `probe_last_error=NULL ` +
  `WHERE id=${q(SOURCE_ID)};`
);

for (const row of items) {
  const itemId = makeId('item');
  const msrId = makeId('msr');
  const checkedAt = row.checked_at || now;
  const loss = row.loss_pct;
  const status = (loss || 0) === 0 ? 'ok' : 'partial';
  const port = row.port == null ? 'NULL' : String(Number(row.port));
  const value = JSON.stringify({
    ip: row.host,
    port: row.port ?? null,
    org: row.org ?? null,
    city: row.city ?? null,
    country: row.country ?? null,
  });
  const latency = row.latency_ms == null ? 'NULL' : String(row.latency_ms);
  const lossSql = loss == null ? 'NULL' : String(loss);
  const jitter = row.jitter_ms == null ? 'NULL' : String(row.jitter_ms);
  const score = row.score == null ? 'NULL' : String(row.score);

  lines.push(
    `INSERT INTO items (id,source_id,kind,item_key,value_json,tags_json,checksum,is_active,first_seen_at,last_seen_at,unknown_since_at,recheck_after_at,lifecycle_state,created_at,updated_at) VALUES (` +
    `${q(itemId)},${q(SOURCE_ID)},${q('ip')},${q(row.host)},${q(value)},${q('[]')},NULL,1,${q(checkedAt)},${q(checkedAt)},NULL,NULL,${q('active')},${q(now)},${q(checkedAt)});`
  );

  lines.push(
    `INSERT INTO measurements (id,item_id,source_id,probe_type,latency_ms,loss_pct,jitter_ms,status,region,score,checked_at,created_at) VALUES (` +
    `${q(msrId)},${q(itemId)},${q(SOURCE_ID)},${q('file_probe_import')},${latency},${lossSql},${jitter},${q(status)},${q(REGION)},${score},${q(checkedAt)},${q(now)});`
  );

  lines.push(
    `INSERT INTO latest_results (item_id,source_id,item_key,host,port,org,city,country,latency_ms,loss_pct,jitter_ms,status,region,score,checked_at,updated_at) VALUES (` +
    `${q(itemId)},${q(SOURCE_ID)},${q(row.host)},${q(row.host)},${port},${q(row.org ?? '')},${q(row.city ?? '')},${q(row.country ?? '')},${latency},${lossSql},${jitter},${q(status)},${q(REGION)},${score},${q(checkedAt)},${q(now)});`
  );
}

const sqlPath = path.join(os.tmpdir(), `sourcehub-public-results-${Date.now()}.sql`);
fs.writeFileSync(sqlPath, lines.join('\n'));

const args = ['d1', 'execute', DB_NAME];
if (REMOTE) args.push('--remote');
args.push('--file', sqlPath);

execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit' });

console.log(JSON.stringify({
  success: true,
  sourceId: SOURCE_ID,
  rows: items.length,
  input: INPUT,
  sqlPath,
  remote: REMOTE,
}, null, 2));
