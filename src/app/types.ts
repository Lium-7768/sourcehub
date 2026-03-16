export interface Env {
  DB: D1Database;
}

export interface SourceRow {
  id: string;
  name: string;
  enabled: number;
  is_public: number;
  config_json: string;
  sync_interval_min: number;
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
