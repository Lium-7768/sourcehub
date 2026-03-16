export interface Env {
  DB: D1Database;
  CF_API_TOKEN?: string;
  ADMIN_TOKEN?: string;
}

export type SourceType = 'text_url' | 'json_api' | 'cloudflare_dns';

export interface SourceRow {
  id: string;
  name: string;
  type: SourceType;
  enabled: number;
  is_public: number;
  config_json: string;
  tags_json: string;
  sync_interval_min: number;
  last_sync_at: string | null;
  last_status: string;
  last_error: string | null;
  probe_last_at?: string | null;
  probe_last_status?: string;
  probe_last_error?: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  source_id: string;
  kind: string;
  item_key: string;
  value_json: string;
  tags_json: string;
  checksum?: string | null;
  is_active: number;
  first_seen_at: string;
  last_seen_at: string;
  unknown_since_at?: string | null;
  recheck_after_at?: string | null;
  lifecycle_state?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSourceInput {
  name: string;
  type: SourceType;
  enabled?: boolean;
  is_public?: boolean;
  tags?: string[];
  config: Record<string, unknown>;
  sync_interval_min?: number;
}

export interface UpdateSourceInput {
  name?: string;
  type?: SourceType;
  enabled?: boolean;
  is_public?: boolean;
  tags?: string[];
  config?: Record<string, unknown>;
  sync_interval_min?: number;
}
