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
