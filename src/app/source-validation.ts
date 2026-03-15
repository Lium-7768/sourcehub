import type { SourceType, UpdateSourceInput } from './types';

type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function validateTextUrlConfig(config: Record<string, unknown>): ValidationResult {
  if (!isNonEmptyString(config.url)) {
    return { ok: false, error: 'text_url config.url is required' };
  }

  if (config.kind !== undefined && !isNonEmptyString(config.kind)) {
    return { ok: false, error: 'text_url config.kind must be a non-empty string' };
  }

  if (config.parse_mode !== undefined && config.parse_mode !== 'line' && config.parse_mode !== 'regex_ip') {
    return { ok: false, error: 'text_url config.parse_mode must be line or regex_ip' };
  }

  return { ok: true };
}

function validateJsonApiConfig(config: Record<string, unknown>): ValidationResult {
  if (!isNonEmptyString(config.url)) {
    return { ok: false, error: 'json_api config.url is required' };
  }

  if (config.kind !== undefined && !isNonEmptyString(config.kind)) {
    return { ok: false, error: 'json_api config.kind must be a non-empty string' };
  }

  if (config.extract_path !== undefined && !isNonEmptyString(config.extract_path)) {
    return { ok: false, error: 'json_api config.extract_path must be a non-empty string' };
  }

  if (config.field_map !== undefined) {
    if (!isPlainObject(config.field_map)) {
      return { ok: false, error: 'json_api config.field_map must be an object' };
    }
    for (const [key, value] of Object.entries(config.field_map)) {
      if (!isNonEmptyString(key) || !isNonEmptyString(value)) {
        return { ok: false, error: 'json_api config.field_map values must be non-empty strings' };
      }
    }
  }

  if (config.headers !== undefined) {
    if (!isPlainObject(config.headers)) {
      return { ok: false, error: 'json_api config.headers must be an object' };
    }
    for (const value of Object.values(config.headers)) {
      if (!isNonEmptyString(value)) {
        return { ok: false, error: 'json_api config.headers values must be non-empty strings' };
      }
    }
  }

  return { ok: true };
}

function validateCloudflareDnsConfig(config: Record<string, unknown>): ValidationResult {
  if (!isNonEmptyString(config.zone_id)) {
    return { ok: false, error: 'cloudflare_dns config.zone_id is required' };
  }

  if (config.record_types !== undefined && !isStringArray(config.record_types)) {
    return { ok: false, error: 'cloudflare_dns config.record_types must be an array of non-empty strings' };
  }

  if (config.name_filter !== undefined && !isNonEmptyString(config.name_filter)) {
    return { ok: false, error: 'cloudflare_dns config.name_filter must be a non-empty string' };
  }

  return { ok: true };
}

export function validateSourcePayload(body: unknown, mode: 'create' | 'update'): ValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'request body must be a JSON object' };
  }

  if (body.name !== undefined && !isNonEmptyString(body.name)) {
    return { ok: false, error: 'name must be a non-empty string' };
  }

  if (body.tags !== undefined && !isStringArray(body.tags)) {
    return { ok: false, error: 'tags must be an array of non-empty strings' };
  }

  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean' };
  }

  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') {
    return { ok: false, error: 'is_public must be a boolean' };
  }

  if (body.sync_interval_min !== undefined) {
    if (typeof body.sync_interval_min !== 'number' || !Number.isFinite(body.sync_interval_min)) {
      return { ok: false, error: 'sync_interval_min must be a number' };
    }
  }

  if (mode === 'create') {
    if (!isNonEmptyString(body.name)) {
      return { ok: false, error: 'name is required' };
    }
    if (!isNonEmptyString(body.type)) {
      return { ok: false, error: 'type is required' };
    }
    if (!isPlainObject(body.config)) {
      return { ok: false, error: 'config is required and must be an object' };
    }
  }

  if (body.type !== undefined && body.type !== 'text_url' && body.type !== 'json_api' && body.type !== 'cloudflare_dns') {
    return { ok: false, error: 'type must be one of: text_url, json_api, cloudflare_dns' };
  }

  if (body.config !== undefined && !isPlainObject(body.config)) {
    return { ok: false, error: 'config must be an object' };
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
