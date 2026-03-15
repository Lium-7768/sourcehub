import type { SourceRow } from '../app/types';
import { fetchText } from '../integrations/fetch-text';

interface TextUrlConfig {
  url: string;
  kind?: string;
  parse_mode?: 'line' | 'regex_ip';
}

interface NormalizedTextItem {
  kind: string;
  itemKey: string;
  value: Record<string, unknown>;
}

function parseByLine(text: string, kind: string): NormalizedTextItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      kind,
      itemKey: line,
      value: kind === 'ip' ? { ip: line } : { value: line },
    }));
}

function parseByRegexIp(text: string): NormalizedTextItem[] {
  const matches = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  const unique = [...new Set(matches)];
  return unique.map((ip) => ({
    kind: 'ip',
    itemKey: ip,
    value: { ip },
  }));
}

export async function runTextUrlSource(source: SourceRow) {
  const config = JSON.parse(source.config_json) as TextUrlConfig;
  if (!config.url) throw new Error('text_url source requires config.url');

  const kind = config.kind ?? 'text';
  const parseMode = config.parse_mode ?? 'line';
  const text = await fetchText(config.url);

  let items: NormalizedTextItem[];
  if (parseMode === 'regex_ip') {
    items = parseByRegexIp(text);
  } else {
    items = parseByLine(text, kind);
  }

  return {
    fetchedCount: items.length,
    preview: items.slice(0, 10),
    items,
  };
}
