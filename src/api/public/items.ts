import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { listPublicItems } from '../../db/items.repo';
import { listPublicResults } from '../../db/measurements.repo';

export async function handlePublicItems(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? undefined;
  const sourceId = url.searchParams.get('source_id') ?? undefined;
  const requestedLimit = Number(url.searchParams.get('limit') ?? '50');

  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    return error('limit must be a positive integer', 400);
  }

  const limit = Math.min(100, Math.floor(requestedLimit));
  const items = await listPublicItems(env, { kind, sourceId, limit });

  return json({
    items: items.map((item: any) => ({
      ...item,
      value: JSON.parse(item.value_json),
      tags: JSON.parse(item.tags_json ?? '[]'),
    })),
    meta: { limit, count: items.length },
  }, {
    headers: {
      'cache-control': 'public, max-age=60, s-maxage=60',
      'x-sourcehub-public-limit': String(limit),
    },
  });
}

export async function handlePublicResults(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sourceId = url.searchParams.get('source_id') ?? undefined;
  const requestedLimit = Number(url.searchParams.get('limit') ?? '50');

  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    return error('limit must be a positive integer', 400);
  }

  const limit = Math.min(100, Math.floor(requestedLimit));
  const items = await listPublicResults(env, { sourceId, limit });

  return json({
    items: items.map((item: any) => ({
      host: item.host ?? item.item_key,
      latency_ms: item.latency_ms ?? null,
      loss_pct: item.loss_pct ?? null,
      jitter_ms: item.jitter_ms ?? null,
      score: item.score ?? null,
      org: item.org ?? null,
      city: item.city ?? null,
      country: item.country ?? null,
      checked_at: item.checked_at ?? null,
    })),
    meta: { limit, count: items.length, source: 'latest_results' },
  }, {
    headers: {
      'cache-control': 'public, max-age=60, s-maxage=60',
      'x-sourcehub-public-limit': String(limit),
    },
  });
}
