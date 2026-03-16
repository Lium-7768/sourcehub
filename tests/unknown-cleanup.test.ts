import assert from 'node:assert/strict';
import { deactivateExpiredUnknownItems, markItemsPendingRecheck, resetItemsLifecycle } from '../src/db/items.repo';
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
      id: 'item_a',
      source_id: 'src_demo',
      is_active: 1,
      unknown_since_at: null,
      recheck_after_at: null,
      lifecycle_state: 'active',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
    {
      id: 'item_b',
      source_id: 'src_demo',
      is_active: 1,
      unknown_since_at: '2026-03-14T00:00:00.000Z',
      recheck_after_at: '2026-03-15T00:00:00.000Z',
      lifecycle_state: 'pending_recheck',
      updated_at: '2026-03-15T00:00:00.000Z',
    },
  ];

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.includes('SELECT id FROM items') && sql.includes('lifecycle_state = \'pending_recheck\'')) {
      return this.items.filter((item) => item.source_id === params[0] && item.is_active === 1 && item.lifecycle_state === 'pending_recheck' && item.recheck_after_at && item.recheck_after_at <= params[1]);
    }
    throw new Error('Unhandled query: ' + sql);
  }

  async exec(sql: string, params: unknown[]) {
    if (sql.startsWith('UPDATE items\n       SET unknown_since_at = COALESCE')) {
      const item = this.items.find((row) => row.id === params[3]);
      if (item) {
        item.unknown_since_at = item.unknown_since_at ?? String(params[0]);
        item.recheck_after_at = String(params[1]);
        item.lifecycle_state = 'pending_recheck';
        item.updated_at = String(params[2]);
      }
      return;
    }
    if (sql.startsWith('UPDATE items\n       SET unknown_since_at = NULL')) {
      const item = this.items.find((row) => row.id === params[1]);
      if (item) {
        item.unknown_since_at = null;
        item.recheck_after_at = null;
        item.lifecycle_state = 'active';
        item.updated_at = String(params[0]);
      }
      return;
    }
    if (sql.startsWith('UPDATE items\n       SET is_active = 0')) {
      const item = this.items.find((row) => row.id === params[1]);
      if (item) {
        item.is_active = 0;
        item.lifecycle_state = 'stale_unknown';
        item.updated_at = String(params[0]);
      }
      return;
    }
    throw new Error('Unhandled exec: ' + sql);
  }
}

async function main() {
  const env: Env = { DB: new FakeD1Database() as unknown as D1Database };
  const db = env.DB as unknown as FakeD1Database;

  await markItemsPendingRecheck(env, ['item_a'], 24);
  assert.equal(db.items[0].lifecycle_state, 'pending_recheck');
  assert.ok(db.items[0].unknown_since_at);
  assert.ok(db.items[0].recheck_after_at);

  await resetItemsLifecycle(env, ['item_a']);
  assert.equal(db.items[0].lifecycle_state, 'active');
  assert.equal(db.items[0].unknown_since_at, null);

  const cleanup = await deactivateExpiredUnknownItems(env, 'src_demo', '2026-03-15T12:00:00.000Z');
  assert.equal(cleanup.count, 1);
  assert.equal(cleanup.itemIds[0], 'item_b');
  assert.equal(db.items[1].is_active, 0);
  assert.equal(db.items[1].lifecycle_state, 'stale_unknown');

  console.log('unknown-cleanup.test.ts ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
