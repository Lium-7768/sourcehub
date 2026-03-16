import assert from 'node:assert/strict';
import worker from '../src/index';
import type { Env } from '../src/app/types';

class FakePreparedStatement {
  constructor(private db: FakeD1Database, private sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new FakePreparedStatement(this.db, this.sql, params);
  }
  async first<T>() {
    const rows = await this.db.query(this.sql, this.params);
    return (rows[0] ?? null) as T | null;
  }
  async all<T>() {
    const rows = await this.db.query(this.sql, this.params);
    return { results: rows as T[] };
  }
  async run() {
    await this.db.exec(this.sql, this.params);
    return { meta: { changes: 1 } };
  }
}

class FakeD1Database {
  items = [
    {
      id: 'item_demo_1',
      source_id: 'src_demo',
      kind: 'ip',
      item_key: '1.1.1.1',
      value_json: JSON.stringify({ ip: '1.1.1.1', org: 'Oracle', city: 'Tokyo', country: 'JP' }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
      is_active: 1,
    },
    {
      id: 'item_demo_2',
      source_id: 'src_demo',
      kind: 'ip',
      item_key: '2.2.2.2',
      value_json: JSON.stringify({ ip: '2.2.2.2', org: 'Oracle', city: 'Osaka', country: 'JP' }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
      is_active: 1,
    },
    {
      id: 'item_demo_3',
      source_id: 'src_demo',
      kind: 'ip',
      item_key: '3.3.3.3',
      value_json: JSON.stringify({ ip: '3.3.3.3', org: 'Oracle', city: 'Kyoto', country: 'JP' }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
      is_active: 1,
    },
  ];

  measurements = [
    {
      id: 'msr_demo_1',
      item_id: 'item_demo_1',
      source_id: 'src_demo',
      probe_type: 'manual',
      latency_ms: 38,
      loss_pct: 0,
      jitter_ms: 2,
      status: 'ok',
      region: 'HKG',
      score: 98.5,
      checked_at: '2026-03-15T13:12:00.000Z',
      created_at: '2026-03-15T13:12:00.000Z',
    },
    {
      id: 'msr_demo_2',
      item_id: 'item_demo_2',
      source_id: 'src_demo',
      probe_type: 'manual',
      latency_ms: 39,
      loss_pct: 0,
      jitter_ms: 1,
      status: 'ok',
      region: 'HKG',
      score: 98.5,
      checked_at: '2026-03-15T13:13:00.000Z',
      created_at: '2026-03-15T13:13:00.000Z',
    },
    {
      id: 'msr_demo_3',
      item_id: 'item_demo_3',
      source_id: 'src_demo',
      probe_type: 'manual',
      latency_ms: 40,
      loss_pct: 0,
      jitter_ms: 3,
      status: 'ok',
      region: 'HKG',
      score: 98.5,
      checked_at: '2026-03-15T13:13:00.000Z',
      created_at: '2026-03-15T13:13:00.000Z',
    },
  ];

  sources = [
    {
      id: 'src_demo',
      name: 'public probe results',
      type: 'json_api',
      enabled: 1,
      is_public: 1,
      config_json: '{}',
      tags_json: '[]',
      sync_interval_min: 1440,
      last_sync_at: null,
      last_status: 'success',
      last_error: null,
      item_count: 1,
      created_at: '2026-03-15T00:00:00.000Z',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
  ];

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.includes('FROM items i') && sql.includes('JOIN sources s ON s.id = i.source_id')) {
      const limit = Number(params[params.length - 1]);
      return this.items
        .map((item) => {
          const m = this.measurements.find((row) => row.item_id === item.id) ?? null;
          return {
            item_id: item.id,
            source_id: item.source_id,
            kind: item.kind,
            item_key: item.item_key,
            value_json: item.value_json,
            updated_at: item.updated_at,
            latency_ms: m?.latency_ms ?? null,
            loss_pct: m?.loss_pct ?? null,
            jitter_ms: m?.jitter_ms ?? null,
            status: m?.status ?? null,
            region: m?.region ?? null,
            score: m?.score ?? null,
            checked_at: m?.checked_at ?? null,
          };
        })
        .filter((row) => row.status !== null && row.status !== 'unknown' && row.status !== 'fail')
        .sort((a, b) => {
          const aNull = a.score == null ? 1 : 0;
          const bNull = b.score == null ? 1 : 0;
          if (aNull !== bNull) return aNull - bNull;
          if ((b.score ?? -Infinity) !== (a.score ?? -Infinity)) return (b.score ?? -Infinity) - (a.score ?? -Infinity);
          if ((b.checked_at ?? '') !== (a.checked_at ?? '')) return (b.checked_at ?? '').localeCompare(a.checked_at ?? '');
          return a.item_key.localeCompare(b.item_key);
        })
        .slice(0, limit);
    }

    throw new Error('Unhandled query: ' + sql);
  }

  async exec(_sql: string, _params: unknown[]) {
    throw new Error('No writes expected in this test');
  }
}

async function main() {
  const env: Env = {
    DB: new FakeD1Database() as unknown as D1Database,
    ADMIN_TOKEN: 'test-admin',
  };

  const unauthorized = await worker.fetch(new Request('https://example.com/api/results?limit=10'), env);
  assert.equal(unauthorized.status, 401);

  const okRes = await worker.fetch(new Request('https://example.com/api/results?limit=10', {
    headers: { authorization: 'Bearer sourcehub-results-token-v1' },
  }), env);
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json<any>();
  assert.equal(okBody.items.length, 3);
  assert.deepEqual(okBody.items.map((item: any) => item.host), ['2.2.2.2', '3.3.3.3', '1.1.1.1']);
  assert.equal(okBody.items[0].latency_ms, 39);
  assert.equal(okBody.items[0].org, 'Oracle');
  assert.equal(okBody.meta.source, 'db_results');

  const oldPublic = await worker.fetch(new Request('https://example.com/api/public/results?limit=10', {
    headers: { authorization: 'Bearer sourcehub-results-token-v1' },
  }), env);
  assert.equal(oldPublic.status, 404);

  const ui = await worker.fetch(new Request('https://example.com/ui'), env);
  assert.equal(ui.status, 404);

  const admin = await worker.fetch(new Request('https://example.com/api/admin/sources', {
    headers: { authorization: 'Bearer test-admin' },
  }), env);
  assert.equal(admin.status, 404);

  console.log('measurements-api.test.ts ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
