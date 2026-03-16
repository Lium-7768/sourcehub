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

async function upsertLatestResult(env: Env, input: UpsertMeasurementInput) {
  const row = await env.DB.prepare(
    `SELECT i.item_key, i.value_json
     FROM items i
     WHERE i.id = ? AND i.source_id = ?
     LIMIT 1`
  ).bind(input.itemId, input.sourceId).first<{ item_key: string; value_json: string }>();

  if (!row) return;

  let value: Record<string, unknown> = {};
  try {
    value = JSON.parse(row.value_json ?? '{}');
  } catch {
    value = {};
  }

  const host = String(value.ip ?? value.content ?? value.domain ?? row.item_key ?? '').trim() || row.item_key;
  const rawPort = value.port;
  const port = typeof rawPort === 'number'
    ? rawPort
    : typeof rawPort === 'string' && /^\d+$/.test(rawPort.trim())
      ? Number(rawPort.trim())
      : null;

  const checkedAt = input.checkedAt ?? nowIso();
  const updatedAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO latest_results (
      item_id, source_id, item_key, host, port, org, city, country,
      latency_ms, loss_pct, jitter_ms, status, region, score, checked_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      source_id = excluded.source_id,
      item_key = excluded.item_key,
      host = excluded.host,
      port = excluded.port,
      org = excluded.org,
      city = excluded.city,
      country = excluded.country,
      latency_ms = excluded.latency_ms,
      loss_pct = excluded.loss_pct,
      jitter_ms = excluded.jitter_ms,
      status = excluded.status,
      region = excluded.region,
      score = excluded.score,
      checked_at = excluded.checked_at,
      updated_at = excluded.updated_at`
  ).bind(
    input.itemId,
    input.sourceId,
    row.item_key,
    host,
    port,
    value.org ?? null,
    value.city ?? null,
    value.country ?? null,
    input.latencyMs ?? null,
    input.lossPct ?? null,
    input.jitterMs ?? null,
    input.status ?? 'unknown',
    input.region ?? null,
    input.score ?? null,
    checkedAt,
    updatedAt,
  ).run();
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

  await upsertLatestResult(env, { ...input, checkedAt });
}

export async function listPublicResults(env: Env, options?: { sourceId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 50)));
  const sourceId = options?.sourceId;

  if (sourceId) {
    const { results } = await env.DB.prepare(
      `SELECT lr.*
       FROM latest_results lr
       JOIN sources s ON s.id = lr.source_id
       WHERE s.is_public = 1
         AND lr.source_id = ?
         AND lr.status IN ('ok', 'partial')
       ORDER BY
         CASE WHEN lr.score IS NULL THEN 1 ELSE 0 END ASC,
         lr.score DESC,
         lr.checked_at DESC,
         lr.item_key ASC
       LIMIT ?`
    ).bind(sourceId, limit).all();
    return results;
  }

  const { results } = await env.DB.prepare(
    `SELECT lr.*
     FROM latest_results lr
     JOIN sources s ON s.id = lr.source_id
     WHERE s.is_public = 1
       AND lr.status IN ('ok', 'partial')
     ORDER BY
       CASE WHEN lr.score IS NULL THEN 1 ELSE 0 END ASC,
       lr.score DESC,
       lr.checked_at DESC,
       lr.item_key ASC
     LIMIT ?`
  ).bind(limit).all();
  return results;
}
