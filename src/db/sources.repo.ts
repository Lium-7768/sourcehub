import type { CreateSourceInput, Env, SourceRow, SourceType, UpdateSourceInput } from '../app/types';
import { makeId } from '../utils/id';
import { nowIso } from '../utils/time';

export async function listSources(
  env: Env,
  filters?: { type?: SourceType; enabled?: number; isPublic?: number }
): Promise<SourceRow[]> {
  const where: string[] = [];
  const binds: Array<string | number> = [];

  if (filters?.type) {
    where.push('type = ?');
    binds.push(filters.type);
  }
  if (filters?.enabled !== undefined) {
    where.push('enabled = ?');
    binds.push(filters.enabled);
  }
  if (filters?.isPublic !== undefined) {
    where.push('is_public = ?');
    binds.push(filters.isPublic);
  }

  const sql = `SELECT * FROM sources${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all<SourceRow>();
  return results;
}

export async function listEnabledSources(env: Env): Promise<SourceRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM sources WHERE enabled = 1 ORDER BY updated_at DESC`
  ).all<SourceRow>();
  return results;
}

export async function getSourceById(env: Env, id: string): Promise<SourceRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first<SourceRow>();
  return row ?? null;
}

export async function createSource(env: Env, input: CreateSourceInput): Promise<string> {
  const id = makeId('src');
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO sources (
      id, name, type, enabled, is_public, config_json, tags_json,
      sync_interval_min, last_status, item_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', 0, ?, ?)`
  ).bind(
    id,
    input.name,
    input.type,
    input.enabled === false ? 0 : 1,
    input.is_public === true ? 1 : 0,
    JSON.stringify(input.config),
    JSON.stringify(input.tags ?? []),
    60,
    now,
    now,
  ).run();
  return id;
}

export async function markSourceSyncStatus(env: Env, id: string, status: string, lastError: string | null = null) {
  await env.DB.prepare(
    `UPDATE sources SET last_status = ?, last_error = ?, last_sync_at = ?, updated_at = ? WHERE id = ?`
  ).bind(status, lastError, nowIso(), nowIso(), id).run();
}

export async function updateSource(env: Env, id: string, input: UpdateSourceInput): Promise<boolean> {
  const existing = await getSourceById(env, id);
  if (!existing) return false;

  const nextSyncInterval = Math.max(5, Math.min(1440, Number(input.sync_interval_min ?? existing.sync_interval_min ?? 60)));

  await env.DB.prepare(
    `UPDATE sources
      SET name = ?,
          enabled = ?,
          is_public = ?,
          config_json = ?,
          tags_json = ?,
          sync_interval_min = ?,
          updated_at = ?
      WHERE id = ?`
  ).bind(
    input.name ?? existing.name,
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
    input.is_public === undefined ? existing.is_public : input.is_public ? 1 : 0,
    JSON.stringify(input.config ?? JSON.parse(existing.config_json ?? '{}')),
    JSON.stringify(input.tags ?? JSON.parse(existing.tags_json ?? '[]')),
    nextSyncInterval,
    nowIso(),
    id,
  ).run();

  return true;
}

export async function setSourceEnabled(env: Env, id: string, enabled: boolean): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?`
  ).bind(enabled ? 1 : 0, nowIso(), id).run();

  return !!result.meta?.changes;
}
