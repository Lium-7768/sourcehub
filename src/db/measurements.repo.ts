import type { Env } from '../app/types';
import { makeId } from '../utils/id';
import { nowIso } from '../utils/time';

export interface UpsertMeasurementInput {
  itemId: string;
  sourceId: string;
  probeType?: string;
  latencyMs?: number | null;
  lossPct?: number | null;
  jitterMs?: number | null;
  status?: string;
  region?: string | null;
  score?: number | null;
  checkedAt?: string;
}

export async function createMeasurement(env: Env, input: UpsertMeasurementInput) {
  const now = nowIso();
  const checkedAt = input.checkedAt ?? now;

  await env.DB.prepare(
    `INSERT INTO measurements (
      id, item_id, source_id, probe_type, latency_ms, loss_pct, jitter_ms,
      status, region, score, checked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('msr'),
    input.itemId,
    input.sourceId,
    input.probeType ?? 'manual',
    input.latencyMs ?? null,
    input.lossPct ?? null,
    input.jitterMs ?? null,
    input.status ?? 'unknown',
    input.region ?? null,
    input.score ?? null,
    checkedAt,
    now,
  ).run();
}

export async function createMeasurementByItemKey(
  env: Env,
  input: Omit<UpsertMeasurementInput, 'itemId'> & { sourceId: string; itemKey: string }
) {
  const item = await env.DB.prepare(
    `SELECT id, source_id, item_key FROM items WHERE source_id = ? AND item_key = ? AND is_active = 1 LIMIT 1`
  ).bind(input.sourceId, input.itemKey).first<{ id: string; source_id: string; item_key: string }>();

  if (!item) {
    return { item_key: input.itemKey, created: false, error: 'Item not found' };
  }

  await createMeasurement(env, {
    itemId: item.id,
    sourceId: item.source_id,
    probeType: input.probeType,
    latencyMs: input.latencyMs,
    lossPct: input.lossPct,
    jitterMs: input.jitterMs,
    status: input.status,
    region: input.region,
    score: input.score,
    checkedAt: input.checkedAt,
  });

  return { item_key: item.item_key, created: true };
}

export async function listMeasurementsBySource(env: Env, sourceId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.item_id, m.source_id, i.item_key, m.probe_type, m.latency_ms, m.loss_pct, m.jitter_ms,
            m.status, m.region, m.score, m.checked_at, m.created_at
     FROM measurements m
     JOIN items i ON i.id = m.item_id
     WHERE m.source_id = ?
     ORDER BY m.checked_at DESC, m.created_at DESC
     LIMIT ?`
  ).bind(sourceId, safeLimit).all();
  return results;
}

export async function listPublicResults(env: Env, options?: { sourceId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 50)));
  const sourceId = options?.sourceId;

  if (sourceId) {
    const { results } = await env.DB.prepare(
      `SELECT
         i.id AS item_id,
         i.source_id,
         i.kind,
         i.item_key,
         i.value_json,
         i.updated_at,
         m.latency_ms,
         m.loss_pct,
         m.jitter_ms,
         m.status,
         m.region,
         m.score,
         m.checked_at
       FROM items i
       JOIN sources s ON s.id = i.source_id
       LEFT JOIN measurements m ON m.id = (
         SELECT m2.id
         FROM measurements m2
         WHERE m2.item_id = i.id
         ORDER BY m2.checked_at DESC
         LIMIT 1
       )
       WHERE i.is_active = 1 AND s.is_public = 1 AND i.source_id = ?
       ORDER BY
         CASE WHEN m.score IS NULL THEN 1 ELSE 0 END ASC,
         m.score DESC,
         i.updated_at DESC
       LIMIT ?`
    ).bind(sourceId, limit).all();
    return results;
  }

  const { results } = await env.DB.prepare(
    `SELECT
       i.id AS item_id,
       i.source_id,
       i.kind,
       i.item_key,
       i.value_json,
       i.updated_at,
       m.latency_ms,
       m.loss_pct,
       m.jitter_ms,
       m.status,
       m.region,
       m.score,
       m.checked_at
     FROM items i
     JOIN sources s ON s.id = i.source_id
     LEFT JOIN measurements m ON m.id = (
       SELECT m2.id
       FROM measurements m2
       WHERE m2.item_id = i.id
       ORDER BY m2.checked_at DESC
       LIMIT 1
     )
     WHERE i.is_active = 1 AND s.is_public = 1
     ORDER BY
       CASE WHEN m.score IS NULL THEN 1 ELSE 0 END ASC,
       m.score DESC,
       i.updated_at DESC
     LIMIT ?`
  ).bind(limit).all();
  return results;
}
