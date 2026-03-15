import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { getSourceById } from '../../db/sources.repo';
import { runTcpProbeForSource } from '../../services/probe.service';

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export async function handleAdminProbe(request: Request, env: Env, pathname: string): Promise<Response> {
  const match = pathname.match(/^\/api\/admin\/sources\/([^/]+)\/probe$/);
  if (!match) return error('Not found', 404);

  if (request.method !== 'POST') {
    return error('Not found', 404);
  }

  const sourceId = match[1];
  const source = await getSourceById(env, sourceId);
  if (!source) return error('Source not found', 404);

  const url = new URL(request.url);
  let body: any = {};
  try {
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      body = await request.json<any>();
    }
  } catch {
    return error('Invalid JSON body', 400);
  }

  const limit = typeof body.limit === 'number' ? body.limit : parsePositiveInt(url.searchParams.get('limit'), 5);
  const attempts = typeof body.attempts === 'number' ? body.attempts : parsePositiveInt(url.searchParams.get('attempts'), 3);
  const timeoutMs = typeof body.timeout_ms === 'number' ? body.timeout_ms : parsePositiveInt(url.searchParams.get('timeout_ms'), 2000);
  const port = typeof body.port === 'number' ? body.port : (url.searchParams.get('port') ? parsePositiveInt(url.searchParams.get('port'), 443) : undefined);
  const region = typeof body.region === 'string' ? body.region : undefined;

  const result = await runTcpProbeForSource(env, {
    sourceId,
    limit,
    attempts,
    timeoutMs,
    port,
    region,
  });

  return json(result);
}
