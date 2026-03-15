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
  sources = [
    {
      id: 'src_demo',
      name: 'demo',
      type: 'text_url',
      enabled: 1,
      is_public: 1,
      config_json: '{}',
      tags_json: '[]',
      sync_interval_min: 5,
      last_sync_at: null,
      last_status: 'idle',
      last_error: null,
      item_count: 1,
      created_at: '2026-03-15T00:00:00.000Z',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
  ];

  items = [
    {
      id: 'item_demo',
      source_id: 'src_demo',
      kind: 'ip',
      item_key: '1.1.1.1',
      value_json: JSON.stringify({ ip: '1.1.1.1', port: 443 }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
      is_active: 1,
    },
  ];

  measurements: any[] = [];

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.startsWith('SELECT * FROM sources WHERE id = ?')) {
      return this.sources.filter((row) => row.id === params[0]);
    }

    if (sql.includes('SELECT id, source_id, item_key FROM items WHERE source_id = ? AND item_key = ?')) {
      return this.items.filter((row) => row.source_id === params[0] && row.item_key === params[1] && row.is_active === 1)
        .map((row) => ({ id: row.id, source_id: row.source_id, item_key: row.item_key }));
    }

    if (sql.includes('FROM measurements m\n     JOIN items i ON i.id = m.item_id')) {
      return this.measurements
        .filter((m) => m.source_id === params[0])
        .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
        .slice(0, Number(params[1]))
        .map((m) => ({
          ...m,
          item_key: this.items.find((item) => item.id === m.item_id)?.item_key ?? null,
        }));
    }

    if (sql.includes('FROM items i\n     JOIN sources s ON s.id = i.source_id')) {
      const limit = Number(params[0]);
      return this.items
        .filter((item) => item.is_active === 1)
        .slice(0, limit)
        .map((item) => {
          const m = this.measurements
            .filter((row) => row.item_id === item.id)
            .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0] ?? null;
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
        });
    }

    throw new Error('Unhandled query: ' + sql);
  }

  async exec(sql: string, params: unknown[]) {
    if (sql.startsWith('INSERT INTO measurements')) {
      this.measurements.push({
        id: params[0],
        item_id: params[1],
        source_id: params[2],
        probe_type: params[3],
        latency_ms: params[4],
        loss_pct: params[5],
        jitter_ms: params[6],
        status: params[7],
        region: params[8],
        score: params[9],
        checked_at: params[10],
        created_at: params[11],
      });
      return;
    }

    throw new Error('Unhandled exec: ' + sql);
  }
}

async function main() {
  const env: Env = {
    DB: new FakeD1Database() as unknown as D1Database,
    ADMIN_TOKEN: 'test-admin',
  };

  const postRes = await worker.fetch(new Request('https://example.com/api/admin/sources/src_demo/measurements', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-admin',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      item_key: '1.1.1.1',
      probe_type: 'manual_probe',
      latency_ms: 38,
      loss_pct: 0,
      jitter_ms: 2,
      status: 'ok',
      region: 'HKG',
      score: 98.5,
      checked_at: '2026-03-15T13:12:00.000Z',
    }),
  }), env);
  assert.equal(postRes.status, 201);
  const postBody = await postRes.json<any>();
  assert.equal(postBody.success, true);
  assert.equal(postBody.items[0].created, true);

  const listRes = await worker.fetch(new Request('https://example.com/api/admin/sources/src_demo/measurements?limit=10', {
    headers: { authorization: 'Bearer test-admin' },
  }), env);
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json<any>();
  assert.equal(listBody.items.length, 1);
  assert.equal(listBody.items[0].latency_ms, 38);

  const publicRes = await worker.fetch(new Request('https://example.com/api/public/results?limit=10'), env);
  assert.equal(publicRes.status, 200);
  const publicBody = await publicRes.json<any>();
  assert.equal(publicBody.items[0].host, '1.1.1.1');
  assert.equal(publicBody.items[0].latency_ms, 38);
  assert.equal(publicBody.items[0].loss_pct, 0);
  assert.equal(publicBody.items[0].status, 'ok');
  assert.equal(publicBody.items[0].region, 'HKG');

  console.log('measurements-api.test.ts ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
