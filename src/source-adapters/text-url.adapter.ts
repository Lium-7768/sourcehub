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

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function parseByLine(text: string, kind: string): NormalizedTextItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = kind === 'ip' ? lines.filter(isValidIpv4) : lines;
  const unique = [...new Set(filtered)];

  return unique.map((line) => ({
    kind,
    itemKey: line,
    value: kind === 'ip' ? { ip: line } : { value: line },
  }));
}

function parseByRegexIp(text: string): NormalizedTextItem[] {
  const matches = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  const unique = [...new Set(matches.filter(isValidIpv4))];
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

  if (!text.trim()) {
    throw new Error('text_url upstream returned empty content');
  }

  let items: NormalizedTextItem[];
  if (parseMode === 'regex_ip') {
    items = parseByRegexIp(text);
  } else {
    items = parseByLine(text, kind);
  }

  if (!items.length) {
    throw new Error(`text_url produced no valid items (parse_mode=${parseMode}, kind=${kind})`);
  }

  return {
    fetchedCount: items.length,
    preview: items.slice(0, 10),
    items,
  };
}
