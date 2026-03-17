import publicResults from '../../data/public-results.json';
import { error, json } from '../../app/response';

interface RepoResultItem {
  host: string;
  port?: number | null;
  latency_ms?: number | null;
  loss_pct?: number | null;
  jitter_ms?: number | null;
  score?: number | null;
  org?: string | null;
  city?: string | null;
  country?: string | null;
  checked_at?: string | null;
}

interface RepoResultsFile {
  items?: RepoResultItem[];
  meta?: {
    count?: number;
    failed?: number;
    scanned?: number;
    source?: string;
    updated_at?: string | null;
  };
}

function normalizeCountry(country: unknown): string | null {
  const text = typeof country === 'string' ? country.trim() : '';
  return text || null;
}

function compareNullableDesc(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (av > bv) return -1;
  if (av < bv) return 1;
  return 0;
}

export async function handlePublicResults(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const country = normalizeCountry(url.searchParams.get('country'));
  const requestedLimit = Number(url.searchParams.get('limit') ?? '50');

  if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
    return error('limit must be a positive integer', 400);
  }

  const limit = Math.min(100, Math.floor(requestedLimit));
  const payload = publicResults as RepoResultsFile;
  const allItems = Array.isArray(payload.items) ? payload.items : [];

  const availableCountries = Array.from(new Set(
    allItems
      .map((item) => normalizeCountry(item.country))
      .filter(Boolean) as string[],
  )).sort((a, b) => a.localeCompare(b));

  const items = allItems
    .filter((item) => !country || normalizeCountry(item.country) === country)
    .sort((a, b) => {
      const scoreCmp = compareNullableDesc(a.score, b.score);
      if (scoreCmp !== 0) return scoreCmp;
      const checkedCmp = compareNullableDesc(a.checked_at, b.checked_at);
      if (checkedCmp !== 0) return checkedCmp;
      return String(a.host ?? '').localeCompare(String(b.host ?? ''));
    })
    .slice(0, limit);

  return json({
    items,
    meta: {
      limit,
      count: items.length,
      total_count: Array.isArray(payload.items) ? payload.items.length : 0,
      source: payload.meta?.source ?? 'repo_file',
      country: country ?? null,
      available_countries: availableCountries,
      available_regions: [],
      scanned: payload.meta?.scanned ?? null,
      failed: payload.meta?.failed ?? null,
      updated_at: payload.meta?.updated_at ?? null,
    },
  }, {
    headers: {
      'cache-control': 'public, max-age=60, s-maxage=60',
      'x-sourcehub-public-limit': String(limit),
    },
  });
}
