import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { runScheduledSyncs } from '../../services/sync.service';

export async function handleAdminCron(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'POST' && pathname === '/api/admin/cron/run-once') {
    const results = await runScheduledSyncs(env);
    return json({ success: true, count: results.length, items: results });
  }

  return error('Not found', 404);
}
