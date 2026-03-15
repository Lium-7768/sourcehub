import type { SourceRow } from '../app/types';
import { fetchJson } from '../integrations/fetch-json';

interface JsonApiConfig {
  url: string;
  kind?: string;
  extract_path?: string;
  field_map?: Record<string, string>;
  headers?: Record<string, string>;
}

interface NormalizedJsonItem {
  kind: string;
  itemKey: string;
  value: Record<string, unknown>;
}

function getByPath(input: unknown, path?: string): unknown {
  if (!path) return input;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, input);
}

function mapItem(raw: Record<string, unknown>, kind: string, fieldMap: Record<string, string>): NormalizedJsonItem {
  const value: Record<string, unknown> = {};

  for (const [targetKey, sourcePath] of Object.entries(fieldMap)) {
    value[targetKey] = getByPath(raw, sourcePath);
  }

  const itemKey = String(value.item_key ?? value.id ?? value.ip ?? value.domain ?? crypto.randomUUID());
  delete value.item_key;

  return {
    kind,
    itemKey,
    value,
  };
}

export async function runJsonApiSource(source: SourceRow) {
  const config = JSON.parse(source.config_json) as JsonApiConfig;
  if (!config.url) throw new Error('json_api source requires config.url');

  const json = await fetchJson(config.url, config.headers);
  const extracted = getByPath(json, config.extract_path);
  if (!Array.isArray(extracted)) {
    throw new Error('json_api extract_path must resolve to an array');
  }

  const kind = config.kind ?? 'json_record';
  const fieldMap = config.field_map ?? { item_key: 'id' };

  const items = extracted
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => mapItem(item, kind, fieldMap));

  return {
    fetchedCount: items.length,
    preview: items.slice(0, 10),
    items,
  };
}
