import assert from 'node:assert/strict';
import { runTcpProbeForSource } from '../src/services/probe.service';
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
      id: 'item_demo',
      source_id: 'src_demo',
      kind: 'ip',
      item_key: '1.1.1.1',
      value_json: JSON.stringify({ ip: '1.1.1.1', port: 443 }),
      tags_json: '[]',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
  ];
  measurements: any[] = [];

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.includes('FROM items\n     WHERE source_id = ? AND is_active = 1')) {
      return this.items.slice(0, Number(params[1]));
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
      });
      return;
    }
    throw new Error('Unhandled exec: ' + sql);
  }
}

async function main() {
  const env: Env = { DB: new FakeD1Database() as unknown as D1Database };

  const originalNow = Date.now;
  const timeline = [1000, 1040, 2000, 2060, 3000];
  let idx = 0;
  Date.now = () => timeline[Math.min(idx++, timeline.length - 1)];

  const originalConnect = (globalThis as any).__cloudflareSocketsConnect;
  let call = 0;
  (globalThis as any).__cloudflareSocketsConnect = () => {
    call += 1;
    if (call <= 2) {
      return {
        opened: Promise.resolve({ remoteAddress: '1.1.1.1:443', localAddress: 'local' }),
        close: async () => undefined,
      };
    }
    return {
      opened: Promise.reject(new Error('connect failed')),
      close: async () => undefined,
    };
  };

  const result = await runTcpProbeForSource(env, {
    sourceId: 'src_demo',
    limit: 1,
    attempts: 3,
    timeoutMs: 2000,
    region: 'HKG',
  });

  assert.equal(result.count, 1);
  assert.equal(result.items[0].successCount, 2);
  assert.equal(result.items[0].failureCount, 1);
  assert.equal(result.items[0].lossPct, 33.3);
  assert.equal(result.items[0].latencyMs, 50);
  assert.equal(result.items[0].jitterMs, 20);
  assert.equal(result.items[0].status, 'partial');
  assert.ok(result.items[0].score > 0);

  const db = env.DB as unknown as FakeD1Database;
  assert.equal(db.measurements.length, 1);
  assert.equal(db.measurements[0].probe_type, 'tcp_connect');

  Date.now = originalNow;
  (globalThis as any).__cloudflareSocketsConnect = originalConnect;
  console.log('probe-service.test.ts ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
