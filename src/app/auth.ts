import type { Env } from './types';
import { error } from './response';

const FALLBACK_RESULTS_API_TOKEN = 'sourcehub-results-token-v1';

export function getResultsApiToken(env?: Env): string {
  return env?.RESULTS_API_TOKEN?.trim() || FALLBACK_RESULTS_API_TOKEN;
}

export function requireResultsToken(request: Request, env?: Env): Response | null {
  const resultsApiToken = getResultsApiToken(env);
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
