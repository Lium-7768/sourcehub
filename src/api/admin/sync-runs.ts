import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { getSyncRunById, listSyncRuns } from '../../db/sync-runs.repo';

export async function handleAdminSyncRuns(request: Request, env: Env, pathname: string): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && pathname === '/api/admin/sync-runs') {
    const sourceId = url.searchParams.get('source_id') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const items = await listSyncRuns(env, { sourceId, status });
    return json({ items, meta: { count: items.length, source_id: sourceId, status } });
  }

  const match = pathname.match(/^\/api\/admin\/sync-runs\/([^/]+)$/);
  if (request.method === 'GET' && match) {
    const item = await getSyncRunById(env, match[1]);
    if (!item) return error('Sync run not found', 404);
    return json(item);
  }

  return error('Not found', 404);
}
