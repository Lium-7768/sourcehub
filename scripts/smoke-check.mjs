import fs from 'node:fs';

function requireArg(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function http(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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
  const adminToken = requireArg('ADMIN_TOKEN');

  const root = await http('GET', `${baseUrl}/`);
  assert(root.ok, 'root endpoint failed');
  assert(Array.isArray(root.json?.endpoints), 'root response missing endpoints');

  const create = await http('POST', `${baseUrl}/api/admin/sources`, {
    token: adminToken,
    body: {
      name: 'smoke text source',
      type: 'text_url',
      enabled: true,
      is_public: true,
      sync_interval_min: 5,
      tags: ['smoke', 'text'],
      config: {
        url: 'https://www.cloudflare.com/ips-v4',
        kind: 'ip',
        parse_mode: 'regex_ip',
      },
    },
  });
  assert(create.status === 201, `create source failed: ${JSON.stringify(create.json)}`);
  const sourceId = create.json?.id;
  assert(sourceId, 'create source missing id');

  const source = await http('GET', `${baseUrl}/api/admin/sources/${sourceId}`, { token: adminToken });
  assert(source.ok, 'get created source failed');
  assert(source.json?.sync_interval_min === 5, 'sync_interval_min not persisted');

  const sync = await http('POST', `${baseUrl}/api/admin/sources/${sourceId}/sync`, { token: adminToken });
  assert(sync.ok, `manual sync failed: ${JSON.stringify(sync.json)}`);
  assert(sync.json?.success === true, 'manual sync did not return success=true');

  const publicItems = await http('GET', `${baseUrl}/api/public/items?source_id=${sourceId}&limit=10`);
  assert(publicItems.ok, 'public items failed');
  assert(Array.isArray(publicItems.json?.items), 'public items missing items array');
  assert(publicItems.json.items.length > 0, 'public items returned empty array after sync');

  const exportJson = await http('GET', `${baseUrl}/api/public/export/${sourceId}?format=json`);
  assert(exportJson.ok, 'public export json failed');
  assert(Array.isArray(exportJson.json?.items), 'public export json missing items array');

  const invalidCreate = await http('POST', `${baseUrl}/api/admin/sources`, {
    token: adminToken,
    body: {
      name: 'bad json api',
      type: 'json_api',
      config: {
        url: 'https://example.com/api',
        kind: 'demo',
        extract_path: 'data.items',
        field_map: { name: 'name' },
      },
    },
  });
  assert(invalidCreate.status === 400, 'invalid source create should return 400');
  assert(invalidCreate.json?.error === 'validation_failed', 'invalid source create should return validation_failed');

  const failedRuns = await http('GET', `${baseUrl}/api/admin/sync-runs?source_id=${sourceId}`, { token: adminToken });
  assert(failedRuns.ok, 'sync-runs query failed');
  assert(Array.isArray(failedRuns.json?.items), 'sync-runs query missing items array');

  const summary = {
    sourceId,
    syncRunCount: failedRuns.json.items.length,
    publicItemCount: publicItems.json.items.length,
  };

  fs.writeFileSync('/tmp/sourcehub-smoke-summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ success: true, summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
