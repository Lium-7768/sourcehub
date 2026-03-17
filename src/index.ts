import { route } from './app/router';
import type { Env } from './app/types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return route(request, env);
  },
};
