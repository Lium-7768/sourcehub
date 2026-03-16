import type { Env } from '../../app/types';
import { error, json } from '../../app/response';
import { runScheduledSyncs } from '../../services/sync.service';
import { runScheduledProbes } from '../../services/probe.service';

export async function handleAdminCron(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'POST' && pathname === '/api/admin/cron/run-once') {
    const syncResults = await runScheduledSyncs(env);
    const probeResults = await runScheduledProbes(env);
    return json({ success: true, count: syncResults.length + probeResults.length, sync: syncResults, probe: probeResults });
  }

  if (request.method === 'POST' && pathname === '/api/admin/cron/probe-once') {
    const probeResults = await runScheduledProbes(env);
    return json({ success: true, count: probeResults.length, items: probeResults });
  }

  return error('Not found', 404);
}
