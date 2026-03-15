import type { Env } from '../../app/types';
import { error } from '../../app/response';
import { listPublicItems } from '../../db/items.repo';

export async function handlePublicExport(request: Request, env: Env, sourceId: string): Promise<Response> {
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
  const kind = url.searchParams.get('kind') ?? undefined;
  const items = await listPublicItems(env, { kind, sourceId, limit: 1000 });

  const normalized = items.map((item: any) => ({
    ...item,
    value: JSON.parse(item.value_json),
    tags: JSON.parse(item.tags_json ?? '[]'),
  }));

  if (format === 'json') {
    return new Response(JSON.stringify({ items: normalized, meta: { count: normalized.length, export_limit: 1000 } }, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=120, s-maxage=120',
        'x-sourcehub-export-limit': '1000',
      },
    });
  }

  if (format === 'txt') {
    const lines = normalized.map((item: any) => {
      if (item.kind === 'dns_record') {
        const value = item.value ?? {};
        return `${value.name ?? ''} ${value.type ?? ''} ${value.content ?? ''}`.trim();
      }
      return item.item_key;
    });

    return new Response(lines.join('\n') + (lines.length ? '\n' : ''), {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=120, s-maxage=120',
        'x-sourcehub-export-limit': '1000',
      },
    });
  }

  return error('Unsupported export format', 400, { supported: ['json', 'txt'] });
}
