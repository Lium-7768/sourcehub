import type { Env, SourceRow, SourceType, UpdateSourceInput } from './types';

type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fields: Record<string, string>;
    };

const ALLOWED_SOURCE_TYPES: SourceType[] = ['text_url', 'json_api', 'cloudflare_dns'];
const ALLOWED_DNS_RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA', 'PTR', 'HTTPS', 'SVCB']);
const JSON_API_KEY_FIELDS = ['itemKey', 'item_key', 'id', 'ip', 'domain'] as const;

export class SourceValidationError extends Error {
  fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('validation_failed');
    this.name = 'SourceValidationError';
    this.fields = fields;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function invalid(field: string, reason: string): ValidationResult {
  return {
    ok: false,
    error: 'validation_failed',
    fields: { [field]: reason },
  };
}

function validateTextUrlConfig(config: Record<string, unknown>): ValidationResult {
  if (config.url === undefined) {
    return invalid('config.url', 'required');
  }
  if (!isHttpUrl(config.url)) {
    return invalid('config.url', 'must be a valid http/https URL');
  }

  if (config.kind !== undefined && !isNonEmptyString(config.kind)) {
    return invalid('config.kind', 'must be a non-empty string');
  }

  if (config.parse_mode !== undefined && config.parse_mode !== 'line' && config.parse_mode !== 'regex_ip') {
    return invalid('config.parse_mode', 'must be line or regex_ip');
  }

  const parseMode = config.parse_mode ?? 'line';
  if (parseMode === 'line' && !isNonEmptyString(config.kind)) {
    return invalid('config.kind', 'required when parse_mode is line');
  }

  return { ok: true };
}

function validateJsonApiConfig(config: Record<string, unknown>): ValidationResult {
  if (config.url === undefined) {
    return invalid('config.url', 'required');
  }
  if (!isHttpUrl(config.url)) {
    return invalid('config.url', 'must be a valid http/https URL');
  }

  if (!isNonEmptyString(config.kind)) {
    return invalid('config.kind', 'required');
  }

  if (!isNonEmptyString(config.extract_path)) {
    return invalid('config.extract_path', 'required');
  }

  if (!isPlainObject(config.field_map)) {
    return invalid('config.field_map', 'required and must be an object');
  }

  const fieldMap = config.field_map;
  const entries = Object.entries(fieldMap);
  if (!entries.length) {
    return invalid('config.field_map', 'must not be empty');
  }

  for (const [key, value] of entries) {
    if (!isNonEmptyString(key) || !isNonEmptyString(value)) {
      return invalid('config.field_map', 'values must be non-empty strings');
    }
  }

  const hasStableKey = JSON_API_KEY_FIELDS.some((key) => isNonEmptyString(fieldMap[key]));
  if (!hasStableKey) {
    return invalid('config.field_map', 'must include one stable key mapping: itemKey, item_key, id, ip, or domain');
  }

  if (config.headers !== undefined) {
    if (!isPlainObject(config.headers)) {
      return invalid('config.headers', 'must be an object');
    }
    for (const value of Object.values(config.headers)) {
      if (!isNonEmptyString(value)) {
        return invalid('config.headers', 'values must be non-empty strings');
      }
    }
  }

  return { ok: true };
}

function validateCloudflareDnsConfig(config: Record<string, unknown>): ValidationResult {
  if (!isNonEmptyString(config.zone_id)) {
    return invalid('config.zone_id', 'required');
  }

  if (!/^[a-f0-9]{32}$/i.test(config.zone_id)) {
    return invalid('config.zone_id', 'must look like a Cloudflare zone id');
  }

  if (config.record_types !== undefined) {
    if (!isStringArray(config.record_types)) {
      return invalid('config.record_types', 'must be an array of non-empty strings');
    }

    for (const item of config.record_types) {
      if (!ALLOWED_DNS_RECORD_TYPES.has(item.toUpperCase())) {
        return invalid('config.record_types', 'contains unsupported DNS record type');
      }
    }
  }

  if (config.name_filter !== undefined && !isNonEmptyString(config.name_filter)) {
    return invalid('config.name_filter', 'must be a non-empty string');
  }

  return { ok: true };
}

export function validateSourcePayload(body: unknown, mode: 'create' | 'update'): ValidationResult {
  if (!isPlainObject(body)) {
    return invalid('body', 'must be a JSON object');
  }

  if (body.name !== undefined && !isNonEmptyString(body.name)) {
    return invalid('name', 'must be a non-empty string');
  }

  if (body.tags !== undefined && !isStringArray(body.tags)) {
    return invalid('tags', 'must be an array of non-empty strings');
  }

  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return invalid('enabled', 'must be a boolean');
  }

  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
    return invalid('is_public', 'must be a boolean');
  }

  if (body.sync_interval_min !== undefined) {
    const syncIntervalMin = body.sync_interval_min;
    if (typeof syncIntervalMin !== 'number' || !Number.isInteger(syncIntervalMin)) {
      return invalid('sync_interval_min', 'must be an integer');
    }
    if (syncIntervalMin < 5 || syncIntervalMin > 1440) {
      return invalid('sync_interval_min', 'must be between 5 and 1440');
    }
  }

  if (mode === 'create') {
    if (!isNonEmptyString(body.name)) {
      return invalid('name', 'required');
    }
    if (!isNonEmptyString(body.type)) {
      return invalid('type', 'required');
    }
    if (!isPlainObject(body.config)) {
      return invalid('config', 'required and must be an object');
    }
  }

  if (body.type !== undefined && !ALLOWED_SOURCE_TYPES.includes(body.type as SourceType)) {
    return invalid('type', 'must be one of: text_url, json_api, cloudflare_dns');
  }

  if (body.config !== undefined && !isPlainObject(body.config)) {
    return invalid('config', 'must be an object');
  }

  const type = body.type as SourceType | undefined;
  const config = body.config as Record<string, unknown> | undefined;

  if (!type || !config) {
    return { ok: true };
  }

  if (type === 'text_url') return validateTextUrlConfig(config);
  if (type === 'json_api') return validateJsonApiConfig(config);
  if (type === 'cloudflare_dns') return validateCloudflareDnsConfig(config);

  return { ok: true };
}

export function validateSourceRuntime(source: SourceRow, env: Env): ValidationResult {
  let config: unknown;
  let tags: unknown;

  try {
    config = JSON.parse(source.config_json ?? '{}');
  } catch {
    return invalid('config', 'stored config_json is not valid JSON');
  }

  try {
    tags = JSON.parse(source.tags_json ?? '[]');
  } catch {
    return invalid('tags', 'stored tags_json is not valid JSON');
  }

  const payloadValidation = validateSourcePayload(
    {
      name: source.name,
      type: source.type,
      enabled: Boolean(source.enabled),
      is_public: Boolean(source.is_public),
      config,
      tags,
      sync_interval_min: source.sync_interval_min,
    },
    'update'
  );
  if (!payloadValidation.ok) {
    return payloadValidation;
  }

  if (source.type === 'cloudflare_dns' && !isNonEmptyString(env.CF_API_TOKEN)) {
    return invalid('env.CF_API_TOKEN', 'required for cloudflare_dns sync');
  }

  return { ok: true };
}

export function mergeExistingSourceForValidation(
  existing: { name: string; type: SourceType; enabled: number; is_public: number; config_json: string; tags_json: string; sync_interval_min: number },
  input: UpdateSourceInput,
) {
  return {
    name: input.name ?? existing.name,
    type: existing.type,
    enabled: input.enabled ?? Boolean(existing.enabled),
    is_public: input.is_public ?? Boolean(existing.is_public),
    config: input.config ?? JSON.parse(existing.config_json ?? '{}'),
    tags: input.tags ?? JSON.parse(existing.tags_json ?? '[]'),
    sync_interval_min: input.sync_interval_min ?? existing.sync_interval_min,
  };
}
