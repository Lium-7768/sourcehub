import type { Env } from './types';
import { error } from './response';

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
