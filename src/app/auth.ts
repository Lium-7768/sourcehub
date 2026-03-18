import type { Env } from './types';
import { error } from './response';

export function getResultsApiToken(env?: Env): string | null {
  const token = env?.RESULTS_API_TOKEN?.trim();
  return token || null;
}

export function requireResultsToken(request: Request, env?: Env): Response | null {
  const resultsApiToken = getResultsApiToken(env);
  if (!resultsApiToken) {
    return error('Server misconfigured', 500, {
      hint: 'RESULTS_API_TOKEN is not configured',
    });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedBearer = `Bearer ${resultsApiToken}`;
  const tokenHeader = request.headers.get('x-results-token') ?? '';

  if (authHeader === expectedBearer || tokenHeader === resultsApiToken) {
    return null;
  }

  return error('Unauthorized', 401, {
    hint: 'Send Authorization: Bearer <results-token> or X-Results-Token header',
  });
}
