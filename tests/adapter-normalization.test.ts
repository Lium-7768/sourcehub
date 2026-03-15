import assert from 'node:assert/strict';
import { runTextUrlSource } from '../src/source-adapters/text-url.adapter';
import { runJsonApiSource } from '../src/source-adapters/json-api.adapter';
import { runCloudflareDnsSource } from '../src/source-adapters/cloudflare-dns.adapter';

const originalFetch = globalThis.fetch;

async function main() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'https://demo.test/ip.txt') {
      return new Response('999.1.1.1\n1.1.1.1\n1.1.1.1\nhello\n', { status: 200 });
    }

    if (url === 'https://demo.test/api-ok') {
      return Response.json({ data: { items: [{ id: 'a', name: 'alpha' }] } }, { status: 200 });
    }

    if (url === 'https://demo.test/api-empty') {
      return Response.json({ data: { items: [] } }, { status: 200 });
    }

    if (url.includes('/client/v4/zones/1386437c420847e09a07ee2a1976f9a7/dns_records')) {
      return Response.json({
        success: true,
        result: [
          { id: '1', name: 'api.example.com', type: 'A', content: '1.1.1.1', proxied: false, ttl: 1 },
          { id: '2', name: '', type: 'A', content: '2.2.2.2', proxied: false, ttl: 1 },
        ],
      }, { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const textResult = await runTextUrlSource({
    id: 'src_text',
    name: 'text',
    type: 'text_url',
    enabled: 1,
    is_public: 1,
    config_json: JSON.stringify({ url: 'https://demo.test/ip.txt', kind: 'ip', parse_mode: 'line' }),
    tags_json: '[]',
    sync_interval_min: 5,
    last_sync_at: null,
    last_status: 'idle',
    last_error: null,
    item_count: 0,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  });
  assert.equal(textResult.items.length, 1);
  assert.equal(textResult.items[0].itemKey, '1.1.1.1');

  const jsonResult = await runJsonApiSource({
    id: 'src_json',
    name: 'json',
    type: 'json_api',
    enabled: 1,
    is_public: 0,
    config_json: JSON.stringify({
      url: 'https://demo.test/api-ok',
      kind: 'demo',
      extract_path: 'data.items',
      field_map: { itemKey: 'id', name: 'name' },
    }),
    tags_json: '[]',
    sync_interval_min: 5,
    last_sync_at: null,
    last_status: 'idle',
    last_error: null,
    item_count: 0,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  });
  assert.equal(jsonResult.items.length, 1);
  assert.equal(jsonResult.items[0].itemKey, 'a');

  await assert.rejects(async () => runJsonApiSource({
    id: 'src_json_bad',
    name: 'json bad',
    type: 'json_api',
    enabled: 1,
    is_public: 0,
    config_json: JSON.stringify({
      url: 'https://demo.test/api-empty',
      kind: 'demo',
      extract_path: 'data.items',
      field_map: { itemKey: 'id', name: 'name' },
    }),
    tags_json: '[]',
    sync_interval_min: 5,
    last_sync_at: null,
    last_status: 'idle',
    last_error: null,
    item_count: 0,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  }), /json_api extract_path resolved to an empty array/);

  const dnsResult = await runCloudflareDnsSource({
    id: 'src_cf',
    name: 'cf',
    type: 'cloudflare_dns',
    enabled: 1,
    is_public: 0,
    config_json: JSON.stringify({ zone_id: '1386437c420847e09a07ee2a1976f9a7' }),
    tags_json: '[]',
    sync_interval_min: 5,
    last_sync_at: null,
    last_status: 'idle',
    last_error: null,
    item_count: 0,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
  }, 'demo-token');
  assert.equal(dnsResult.items.length, 1);
  assert.equal(dnsResult.items[0].itemKey, 'api.example.com:A:1.1.1.1');

  console.log('adapter-normalization.test.ts ok');
}

main()
  .finally(() => {
    globalThis.fetch = originalFetch;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
