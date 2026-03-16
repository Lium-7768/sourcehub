CREATE TABLE IF NOT EXISTS latest_results (
  item_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER,
  org TEXT,
  city TEXT,
  country TEXT,
  latency_ms REAL,
  loss_pct REAL,
  jitter_ms REAL,
  status TEXT NOT NULL DEFAULT 'unknown',
  region TEXT,
  score REAL,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS idx_latest_results_source_score ON latest_results(source_id, score DESC, checked_at DESC, item_key ASC);
CREATE INDEX IF NOT EXISTS idx_latest_results_status ON latest_results(status);
