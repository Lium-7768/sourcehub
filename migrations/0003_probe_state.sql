ALTER TABLE sources ADD COLUMN probe_last_at TEXT;
ALTER TABLE sources ADD COLUMN probe_last_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE sources ADD COLUMN probe_last_error TEXT;
