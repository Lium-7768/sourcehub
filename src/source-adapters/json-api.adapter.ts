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

function normalizeItemKey(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function mapItem(raw: Record<string, unknown>, kind: string, fieldMap: Record<string, string>, index: number): NormalizedJsonItem {
  const value: Record<string, unknown> = {};

  for (const [targetKey, sourcePath] of Object.entries(fieldMap)) {
    value[targetKey] = getByPath(raw, sourcePath);
  }

  const itemKey =
    normalizeItemKey(value.itemKey) ??
    normalizeItemKey(value.item_key) ??
    normalizeItemKey(value.id) ??
    normalizeItemKey(value.ip) ??
    normalizeItemKey(value.domain);

  if (!itemKey) {
    throw new Error(`json_api item at index ${index} is missing a usable stable key after field_map`);
  }

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
  if (!extracted.length) {
    throw new Error('json_api extract_path resolved to an empty array');
  }

  const kind = config.kind ?? 'json_record';
  const fieldMap = config.field_map ?? { item_key: 'id' };

  const objectItems = extracted.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
  if (!objectItems.length) {
    throw new Error('json_api extract_path array does not contain object items');
  }

  const items = objectItems.map((item, index) => mapItem(item, kind, fieldMap, index));

  if (!items.length) {
    throw new Error('json_api produced no valid items');
  }

  return {
    fetchedCount: items.length,
    preview: items.slice(0, 10),
    items,
  };
}
