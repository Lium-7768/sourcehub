import type { SourceRow } from '../app/types';
import { fetchCloudflareDnsRecords, type CloudflareDnsConfig } from '../integrations/cloudflare-api';

export interface NormalizedDnsRecordItem {
  kind: 'dns_record';
  itemKey: string;
  value: Record<string, unknown>;
}

function matchNameFilter(name: string, nameFilter?: string): boolean {
  if (!nameFilter) return true;
  if (nameFilter.startsWith('*.')) {
    const suffix = nameFilter.slice(1);
    return name.endsWith(suffix);
  }
  return name === nameFilter;
}

export async function runCloudflareDnsSource(source: SourceRow, apiToken: string) {
  const config = JSON.parse(source.config_json) as CloudflareDnsConfig;
  const records = await fetchCloudflareDnsRecords(config, apiToken);

  const normalized: NormalizedDnsRecordItem[] = records
    .filter((record) => matchNameFilter(String(record.name ?? ''), config.name_filter))
    .map((record) => {
      const name = String(record.name ?? '');
      const type = String(record.type ?? '');
      const content = String(record.content ?? '');

      return {
        kind: 'dns_record' as const,
        itemKey: `${name}:${type}:${content}`,
        value: {
          zone_id: config.zone_id,
          id: record.id ?? null,
          name,
          type,
          content,
          proxied: record.proxied ?? null,
          ttl: record.ttl ?? null,
        },
      };
    });

  return {
    fetchedCount: normalized.length,
    preview: normalized.slice(0, 10),
    items: normalized,
  };
}
