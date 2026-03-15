import type { Env } from './types';
import { error, json } from './response';
import { requireAdminAuth } from './auth';
import { handleAdminSources } from '../api/admin/sources';
import { handleAdminSyncRuns } from '../api/admin/sync-runs';
import { handleAdminCron } from '../api/admin/cron';
import { handleAdminMeasurements } from '../api/admin/measurements';
import { handlePublicItems, handlePublicResults } from '../api/public/items';
import { handlePublicExport } from '../api/public/export';
import { renderAdminUi } from '../ui/admin';

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/') {
    return json({
      name: 'sourcehub',
      status: 'ok',
      endpoints: [
        'GET /ui',
        'GET /api/admin/sources',
        'POST /api/admin/sources',
        'GET /api/admin/sources/:id',
        'PUT /api/admin/sources/:id',
        'POST /api/admin/sources/:id/enable',
        'POST /api/admin/sources/:id/disable',
        'POST /api/admin/sources/:id/sync',
        'GET /api/admin/sources/:id/measurements',
        'POST /api/admin/sources/:id/measurements',
        'GET /api/admin/sync-runs',
        'GET /api/admin/sync-runs/:id',
        'POST /api/admin/cron/run-once',
        'GET /api/public/items',
        'GET /api/public/results',
        'GET /api/public/export/:sourceId?format=json|txt'
      ]
    });
  }

  if (pathname === '/ui') {
    return renderAdminUi();
  }

  if (pathname.startsWith('/api/admin/sources')) {
    const authError = requireAdminAuth(request, env);
    if (authError) return authError;

    if (/^\/api\/admin\/sources\/[^/]+\/measurements$/.test(pathname)) {
      return handleAdminMeasurements(request, env, pathname);
    }

    return handleAdminSources(request, env, pathname);
  }

  if (pathname.startsWith('/api/admin/sync-runs')) {
    const authError = requireAdminAuth(request, env);
    if (authError) return authError;
    return handleAdminSyncRuns(request, env, pathname);
  }

  if (pathname.startsWith('/api/admin/cron')) {
    const authError = requireAdminAuth(request, env);
    if (authError) return authError;
    return handleAdminCron(request, env, pathname);
  }

  if (pathname === '/api/public/items') {
    return handlePublicItems(request, env);
  }

  if (pathname === '/api/public/results') {
    return handlePublicResults(request, env);
  }

  const exportMatch = pathname.match(/^\/api\/public\/export\/([^/]+)$/);
  if (exportMatch) {
    return handlePublicExport(request, env, exportMatch[1]);
  }

  return error('Not found', 404);
}
