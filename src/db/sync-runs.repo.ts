import type { Env } from '../app/types';
import { makeId } from '../utils/id';
import { nowIso } from '../utils/time';

export interface SyncRunRow {
  id: string;
  source_id: string;
  trigger_type: string;
  status: string;
  fetched_count: number;
  inserted_count: number;
  updated_count: number;
  deactivated_count: number;
  message: string | null;
  error_text: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function createSyncRun(env: Env, sourceId: string, triggerType: string): Promise<string> {
  const id = makeId('run');
  await env.DB.prepare(
    `INSERT INTO sync_runs (id, source_id, trigger_type, status, started_at) VALUES (?, ?, ?, 'running', ?)`
  ).bind(id, sourceId, triggerType, nowIso()).run();
  return id;
}

export async function finishSyncRun(
  env: Env,
  runId: string,
  status: string,
  message: string,
  errorText: string | null = null,
  fetchedCount = 0,
  insertedCount = 0,
  updatedCount = 0,
  deactivatedCount = 0,
) {
  await env.DB.prepare(
    `UPDATE sync_runs
      SET status = ?, message = ?, error_text = ?, fetched_count = ?, inserted_count = ?, updated_count = ?, deactivated_count = ?, finished_at = ?
      WHERE id = ?`
  ).bind(status, message, errorText, fetchedCount, insertedCount, updatedCount, deactivatedCount, nowIso(), runId).run();
}

export async function listSyncRuns(
  env: Env,
  filters?: { sourceId?: string; status?: string }
): Promise<SyncRunRow[]> {
  const where: string[] = [];
  const binds: Array<string> = [];

  if (filters?.sourceId) {
    where.push('source_id = ?');
    binds.push(filters.sourceId);
  }
  if (filters?.status) {
    where.push('status = ?');
    binds.push(filters.status);
  }

  const sql = `SELECT * FROM sync_runs${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all<SyncRunRow>();
  return results;
}

export async function getSyncRunById(env: Env, id: string): Promise<SyncRunRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM sync_runs WHERE id = ?`
  ).bind(id).first<SyncRunRow>();
  return row ?? null;
}
