import assert from 'node:assert/strict';
import { runScheduledProbes } from '../src/services/probe.service';
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
      id: 'src_probe',
      name: 'probe source',
      type: 'text_url',
      enabled: 1,
      is_public: 1,
      config_json: JSON.stringify({ probe: { enabled: true, limit: 1, attempts: 2, timeout_ms: 1000, interval_min: 5, max_rounds: 1, port: 443, region: 'HKG' } }),
      tags_json: '[]',
      sync_interval_min: 60,
      last_sync_at: null,
      last_status: 'idle',
      last_error: null,
      probe_last_at: null,
      probe_last_status: 'idle',
      probe_last_error: null,
      item_count: 1,
      created_at: '2026-03-15T00:00:00.000Z',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
  ];

  items = [
    {
      id: 'item_demo',
      source_id: 'src_probe',
      kind: 'ip',
      item_key: '1.1.1.1',
      value_json: JSON.stringify({ ip: '1.1.1.1' }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
      unknown_since_at: null,
      recheck_after_at: null,
      lifecycle_state: 'active',
      is_active: 1,
    },
  ];

  measurements: any[] = [];
  statusUpdates: any[] = [];

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.includes('SELECT * FROM sources WHERE enabled = 1')) return this.sources;
    if (sql.startsWith('SELECT * FROM sources WHERE id = ?')) return this.sources.filter((row) => row.id === params[0]);
    if (sql.includes('SELECT id FROM items') && sql.includes("lifecycle_state = 'pending_recheck'")) return [];
    if (sql.includes('FROM items\n     WHERE source_id = ? AND is_active = 1')) return this.items.slice(0, Number(params[1]));
    throw new Error('Unhandled query: ' + sql);
  }

  async exec(sql: string, params: unknown[]) {
    if (sql.startsWith('INSERT INTO measurements')) {
      this.measurements.push({ status: params[7], region: params[8], score: params[9] });
      return;
    }
    if (sql.startsWith('UPDATE sources SET probe_last_status = ?, probe_last_error = ?, updated_at = ? WHERE id = ?')) {
      this.statusUpdates.push({ status: params[0], last_error: params[1], id: params[3] });
      return;
    }
    if (sql.startsWith('UPDATE sources SET probe_last_status = ?, probe_last_error = ?, probe_last_at = ?, updated_at = ? WHERE id = ?')) {
      this.statusUpdates.push({ status: params[0], last_error: params[1], id: params[4], touched: true });
      return;
    }
    if (sql.startsWith('UPDATE items\n       SET unknown_since_at = COALESCE')) {
      return;
    }
    if (sql.startsWith('UPDATE items\n       SET unknown_since_at = NULL')) {
      return;
    }
    if (sql.startsWith('UPDATE items\n       SET is_active = 0')) {
      return;
    }
    throw new Error('Unhandled exec: ' + sql);
  }
}

async function main() {
  const env: Env = { DB: new FakeD1Database() as unknown as D1Database };
  const originalConnect = (globalThis as any).__cloudflareSocketsConnect;
  const originalNow = Date.now;
  let seq = 0;
  const timeline = [1000, 1020, 2000, 2030];
  Date.now = () => timeline[Math.min(seq++, timeline.length - 1)];
  (globalThis as any).__cloudflareSocketsConnect = () => ({
    opened: Promise.resolve({ remoteAddress: '1.1.1.1:443', localAddress: 'local' }),
    close: async () => undefined,
  });

  const results = await runScheduledProbes(env);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'probed');
  assert.equal(results[0].count, 1);

  const db = env.DB as unknown as FakeD1Database;
  assert.equal(db.measurements.length, 1);
  assert.equal(db.statusUpdates[0].status, 'probing');
  assert.equal(db.statusUpdates[1].status, 'success');

  Date.now = originalNow;
  (globalThis as any).__cloudflareSocketsConnect = originalConnect;
  console.log('cron-probe.test.ts ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
