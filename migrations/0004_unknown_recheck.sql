ALTER TABLE items ADD COLUMN unknown_since_at TEXT;
ALTER TABLE items ADD COLUMN recheck_after_at TEXT;
ALTER TABLE items ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_items_recheck_after_at ON items(recheck_after_at);
CREATE INDEX IF NOT EXISTS idx_items_lifecycle_state ON items(lifecycle_state);
