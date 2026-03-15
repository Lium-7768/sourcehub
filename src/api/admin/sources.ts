import type { Env, SourceType } from '../../app/types';
import { error, json } from '../../app/response';
import { mergeExistingSourceForValidation, SourceValidationError, validateSourcePayload } from '../../app/source-validation';
import { createSource, getSourceById, listSources, setSourceEnabled, updateSource } from '../../db/sources.repo';
import { syncSource } from '../../services/sync.service';

function parseBooleanFilter(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (value === '1' || value === 'true') return 1;
  if (value === '0' || value === 'false') return 0;
  return undefined;
}

export async function handleAdminSources(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'GET' && pathname === '/api/admin/sources') {
    const url = new URL(request.url);
    const type = (url.searchParams.get('type') ?? undefined) as SourceType | undefined;
    const enabled = parseBooleanFilter(url.searchParams.get('enabled'));
    const isPublic = parseBooleanFilter(url.searchParams.get('is_public'));
    const items = await listSources(env, { type, enabled, isPublic });
    return json({ items, meta: { count: items.length, type, enabled, is_public: isPublic } });
  }

  if (request.method === 'POST' && pathname === '/api/admin/sources') {
    const body = await request.json<any>();
    const validation = validateSourcePayload(body, 'create');
    if (!validation.ok) return error(validation.error, 400, { fields: validation.fields });

    const id = await createSource(env, body);
    return json({ success: true, id }, { status: 201 });
  }

  const sourceMatch = pathname.match(/^\/api\/admin\/sources\/([^/]+)$/);
  if (request.method === 'GET' && sourceMatch) {
    const source = await getSourceById(env, sourceMatch[1]);
    if (!source) return error('Source not found', 404);
    return json(source);
  }

  if ((request.method === 'PUT' || request.method === 'PATCH') && sourceMatch) {
    const existing = await getSourceById(env, sourceMatch[1]);
    if (!existing) return error('Source not found', 404);

    const body = await request.json<any>();
    const merged = mergeExistingSourceForValidation(existing, body ?? {});
    const validation = validateSourcePayload(merged, 'update');
    if (!validation.ok) return error(validation.error, 400, { fields: validation.fields });

    const ok = await updateSource(env, sourceMatch[1], body ?? {});
    if (!ok) return error('Source not found', 404);
    const source = await getSourceById(env, sourceMatch[1]);
    return json({ success: true, item: source });
  }

  const toggleMatch = pathname.match(/^\/api\/admin\/sources\/([^/]+)\/(enable|disable)$/);
  if (request.method === 'POST' && toggleMatch) {
    const ok = await setSourceEnabled(env, toggleMatch[1], toggleMatch[2] === 'enable');
    if (!ok) return error('Source not found', 404);
    const source = await getSourceById(env, toggleMatch[1]);
    return json({ success: true, item: source });
  }

  const syncMatch = pathname.match(/^\/api\/admin\/sources\/([^/]+)\/sync$/);
  if (request.method === 'POST' && syncMatch) {
    try {
      const result = await syncSource(env, syncMatch[1], 'manual');
      return json({ success: true, ...result });
    } catch (err) {
      if (err instanceof SourceValidationError) {
        return error(err.message, 400, { fields: err.fields });
      }
      const message = err instanceof Error ? err.message : String(err);
      const status = /frequency control|disabled/i.test(message) ? 429 : 400;
      return error(message, status);
    }
  }

  return error('Not found', 404);
}
