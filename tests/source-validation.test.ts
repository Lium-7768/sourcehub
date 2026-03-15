import assert from 'node:assert/strict';
import { mergeExistingSourceForValidation, validateSourcePayload, validateSourceRuntime } from '../src/app/source-validation';
import type { SourceRow } from '../src/app/types';

function expectValidationError(result: ReturnType<typeof validateSourcePayload>, field: string) {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, 'validation_failed');
  assert.ok(field in result.fields, `expected field ${field} in ${JSON.stringify(result.fields)}`);
}

const validText = validateSourcePayload({
  name: 'demo',
  type: 'text_url',
  config: {
    url: 'https://example.com/list.txt',
    kind: 'ip',
    parse_mode: 'line',
  },
  sync_interval_min: 30,
}, 'create');
assert.equal(validText.ok, true);

expectValidationError(validateSourcePayload({
  name: 'demo',
  type: 'text_url',
  config: {
    url: 'ftp://example.com/list.txt',
    kind: 'ip',
    parse_mode: 'line',
  },
}, 'create'), 'config.url');

expectValidationError(validateSourcePayload({
  name: 'demo',
  type: 'json_api',
  config: {
    url: 'https://example.com/api',
    kind: 'demo',
    extract_path: 'data.items',
    field_map: { name: 'name' },
  },
}, 'create'), 'config.field_map');

expectValidationError(validateSourcePayload({
  name: 'demo',
  type: 'cloudflare_dns',
  config: {
    zone_id: 'bad-zone-id',
  },
}, 'create'), 'config.zone_id');

expectValidationError(validateSourcePayload({
  name: 'demo',
  type: 'text_url',
  config: {
    url: 'https://example.com/list.txt',
    kind: 'ip',
    parse_mode: 'line',
  },
  sync_interval_min: 1,
}, 'create'), 'sync_interval_min');

const existing = {
  name: 'old',
  type: 'text_url' as const,
  enabled: 1,
  is_public: 0,
  config_json: JSON.stringify({ url: 'https://example.com/1.txt', kind: 'ip', parse_mode: 'line' }),
  tags_json: JSON.stringify(['old']),
  sync_interval_min: 60,
};

const merged = mergeExistingSourceForValidation(existing, {
  type: 'json_api',
  config: {
    url: 'https://example.com/api',
    kind: 'demo',
    extract_path: 'data.items',
    field_map: { itemKey: 'id', name: 'name' },
  },
  sync_interval_min: 30,
});
assert.equal(merged.type, 'json_api');
assert.equal(merged.sync_interval_min, 30);

const runtimeSource: SourceRow = {
  id: 'src_test',
  name: 'cf demo',
  type: 'cloudflare_dns',
  enabled: 1,
  is_public: 0,
  config_json: JSON.stringify({ zone_id: '1386437c420847e09a07ee2a1976f9a7' }),
  tags_json: '[]',
  sync_interval_min: 60,
  last_sync_at: null,
  last_status: 'idle',
  last_error: null,
  item_count: 0,
  created_at: '2026-03-15T00:00:00.000Z',
  updated_at: '2026-03-15T00:00:00.000Z',
};

const runtimeMissingToken = validateSourceRuntime(runtimeSource, { DB: {} as D1Database });
assert.equal(runtimeMissingToken.ok, false);
if (!runtimeMissingToken.ok) {
  assert.equal(runtimeMissingToken.fields['env.CF_API_TOKEN'], 'required for cloudflare_dns sync');
}

const runtimeOk = validateSourceRuntime(runtimeSource, { DB: {} as D1Database, CF_API_TOKEN: 'demo-token' });
assert.equal(runtimeOk.ok, true);

console.log('source-validation.test.ts ok');
