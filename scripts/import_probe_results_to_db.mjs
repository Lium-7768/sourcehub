import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'https://sourcehub.lium840471184.workers.dev';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SOURCE_ID = process.env.SOURCE_ID || 'src_de1c6186e7cc48cd9619653eeee9581e';
const INPUT = process.env.INPUT || '/root/.openclaw/workspace/sourcehub/data/results/probe_results.json';
const REGION = process.env.REGION || 'HKG';

if (!ADMIN_TOKEN) throw new Error('Missing ADMIN_TOKEN');

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const items = Array.isArray(payload.items) ? payload.items : [];

async function postOne(item) {
  const res = await fetch(`${BASE_URL}/api/admin/sources/${SOURCE_ID}/measurements`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      item_key: item.host,
      probe_type: 'file_probe_import',
      latency_ms: item.latency_ms,
      loss_pct: item.loss_pct,
      jitter_ms: item.jitter_ms,
      status: item.loss_pct === 0 ? 'ok' : 'partial',
      region: REGION,
      score: item.score,
      checked_at: item.checked_at,
    }),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

let imported = 0;
for (const item of items) {
  const result = await postOne(item);
  if (result?.items?.[0]?.created) imported += 1;
}

console.log(JSON.stringify({ success: true, sourceId: SOURCE_ID, imported, total: items.length }, null, 2));
