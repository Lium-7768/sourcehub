CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  probe_type TEXT NOT NULL DEFAULT 'manual',
  latency_ms REAL,
  loss_pct REAL,
  jitter_ms REAL,
  status TEXT NOT NULL DEFAULT 'unknown',
  region TEXT,
  score REAL,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS idx_measurements_item_checked_at ON measurements(item_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_source_checked_at ON measurements(source_id, checked_at DESC);
