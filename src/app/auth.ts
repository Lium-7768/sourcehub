import { error } from './response';

const RESULTS_API_TOKEN = 'sourcehub-results-token-v1';

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
