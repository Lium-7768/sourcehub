import { route } from './app/router';
import type { Env } from './app/types';
import { runScheduledSyncs } from './services/sync.service';
import { runScheduledProbes } from './services/probe.service';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return route(request, env);
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runScheduledSyncs(env);
    await runScheduledProbes(env);
  },
};
