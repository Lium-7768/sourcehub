import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { getSourceById } from '../../db/sources.repo';
import { createMeasurementByItemKey, listMeasurementsBySource } from '../../db/measurements.repo';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMeasurementBody(body: unknown): { ok: true } | { ok: false; fields: Record<string, string> } {
  if (!isPlainObject(body)) {
    return { ok: false, fields: { body: 'must be a JSON object' } };
  }

  if (body.item_key !== undefined && typeof body.item_key !== 'string') {
    return { ok: false, fields: { item_key: 'must be a string' } };
  }
  if (body.item_keys !== undefined && (!Array.isArray(body.item_keys) || !body.item_keys.every((v) => typeof v === 'string' && v.trim()))) {
    return { ok: false, fields: { item_keys: 'must be a non-empty string array' } };
  }
  if (body.item_key === undefined && body.item_keys === undefined) {
    return { ok: false, fields: { item_key: 'item_key or item_keys is required' } };
  }

  if (body.latency_ms !== undefined && !isFiniteNumber(body.latency_ms)) {
    return { ok: false, fields: { latency_ms: 'must be a finite number' } };
  }
  if (body.loss_pct !== undefined && !isFiniteNumber(body.loss_pct)) {
    return { ok: false, fields: { loss_pct: 'must be a finite number' } };
  }
  if (body.jitter_ms !== undefined && !isFiniteNumber(body.jitter_ms)) {
    return { ok: false, fields: { jitter_ms: 'must be a finite number' } };
  }
  if (body.score !== undefined && !isFiniteNumber(body.score)) {
    return { ok: false, fields: { score: 'must be a finite number' } };
  }
  if (body.status !== undefined && typeof body.status !== 'string') {
    return { ok: false, fields: { status: 'must be a string' } };
  }
  if (body.region !== undefined && typeof body.region !== 'string') {
    return { ok: false, fields: { region: 'must be a string' } };
  }
  if (body.probe_type !== undefined && typeof body.probe_type !== 'string') {
    return { ok: false, fields: { probe_type: 'must be a string' } };
  }
  if (body.checked_at !== undefined && typeof body.checked_at !== 'string') {
    return { ok: false, fields: { checked_at: 'must be a string' } };
  }

  return { ok: true };
}

export async function handleAdminMeasurements(request: Request, env: Env, pathname: string): Promise<Response> {
  const sourceMatch = pathname.match(/^\/api\/admin\/sources\/([^/]+)\/measurements$/);

  if (request.method === 'GET' && sourceMatch) {
    const sourceId = sourceMatch[1];
    const source = await getSourceById(env, sourceId);
    if (!source) return error('Source not found', 404);

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? '20');
    if (!Number.isFinite(limit) || limit < 1) {
      return error('limit must be a positive integer', 400);
    }

    const items = await listMeasurementsBySource(env, sourceId, Math.min(100, Math.floor(limit)));
    return json({ items, meta: { source_id: sourceId, count: items.length, limit: Math.min(100, Math.floor(limit)) } });
  }

  if (request.method === 'POST' && sourceMatch) {
    const sourceId = sourceMatch[1];
    const source = await getSourceById(env, sourceId);
    if (!source) return error('Source not found', 404);

    const body = await request.json<any>();
    const validation = validateMeasurementBody(body);
    if (!validation.ok) return error('validation_failed', 400, { fields: validation.fields });

    const itemKeys = body.item_keys ?? [body.item_key];
    const results = [];
    for (const itemKey of itemKeys) {
      const result = await createMeasurementByItemKey(env, {
        sourceId,
        itemKey,
        probeType: body.probe_type,
        latencyMs: body.latency_ms,
        lossPct: body.loss_pct,
        jitterMs: body.jitter_ms,
        status: body.status,
        region: body.region,
        score: body.score,
        checkedAt: body.checked_at,
      });
      results.push(result);
    }

    return json({ success: true, count: results.length, items: results }, { status: 201 });
  }

  return error('Not found', 404);
}
