import type { Env } from './types';
import { error } from './response';

const RESULTS_API_TOKEN = 'sourcehub-results-token-v1';

export function requireAdminAuth(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) {
    return error('Missing ADMIN_TOKEN in runtime env', 500);
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.ADMIN_TOKEN}`;

  if (authHeader !== expected) {
    return error('Unauthorized', 401, {
      hint: 'Send Authorization: Bearer <ADMIN_TOKEN>',
    });
  }

  return null;
}

export function requireResultsToken(request: Request): Response | null {
  const authHeader = request.headers.get('authorization') ?? '';
  const expectedBearer = `Bearer ${RESULTS_API_TOKEN}`;
  const tokenHeader = request.headers.get('x-results-token') ?? '';

  if (authHeader === expectedBearer || tokenHeader === RESULTS_API_TOKEN) {
    return null;
  }

  return error('Unauthorized', 401, {
    hint: 'Send Authorization: Bearer <results-token> or X-Results-Token header',
  });
}
