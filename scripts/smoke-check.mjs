import fs from 'node:fs';

function requireArg(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function http(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const baseUrl = requireArg('BASE_URL').replace(/\/$/, '');
  const resultsToken = requireArg('RESULTS_TOKEN');

  const root = await http(`${baseUrl}/`);
  assert(root.ok, `root failed: ${JSON.stringify(root.json)}`);
  assert(root.json?.status === 'ok', 'root status should be ok');
  assert(Array.isArray(root.json?.endpoints), 'root endpoints missing');

  const unauthed = await http(`${baseUrl}/api/results?limit=1`);
  assert(unauthed.status === 401, `unauthed /api/results should be 401, got ${unauthed.status}`);

  const authed = await http(`${baseUrl}/api/results?limit=5`, {
    Authorization: `Bearer ${resultsToken}`,
    Accept: 'application/json',
    'User-Agent': 'sourcehub-smoke/1.0',
  });
  assert(authed.ok, `authed /api/results failed: ${JSON.stringify(authed.json)}`);
  assert(Array.isArray(authed.json?.items), 'results items missing');
  assert(authed.json?.meta?.source === 'db_results', 'results meta.source should be db_results');
  assert(Number(authed.json?.meta?.count ?? -1) >= 0, 'results meta.count missing');

  if (authed.json.items.length > 0) {
    const item = authed.json.items[0];
    assert(typeof item.host === 'string' && item.host.length > 0, 'first result host missing');
    assert(Object.prototype.hasOwnProperty.call(item, 'score'), 'first result score missing');
  }

  const summary = {
    baseUrl,
    root: root.json,
    resultCount: authed.json.items.length,
    meta: authed.json.meta,
    firstItem: authed.json.items[0] ?? null,
  };

  fs.writeFileSync('/tmp/sourcehub-smoke-summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ success: true, summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
