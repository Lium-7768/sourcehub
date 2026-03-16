import type { Env } from './types';
import { error, json } from './response';
import { requireResultsToken } from './auth';
import { handlePublicResults } from '../api/public/items';

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/') {
    return json({
      name: 'sourcehub',
      status: 'ok',
      endpoints: ['GET /api/results'],
    });
  }

  if (pathname === '/api/results') {
    const authError = requireResultsToken(request);
    if (authError) return authError;
    return handlePublicResults(request, env);
  }

  return error('Not found', 404);
}
