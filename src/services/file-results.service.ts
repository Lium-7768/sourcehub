import type { Env } from '../app/types';

// Deprecated helper kept only as a narrow compatibility stub.
// Public API must read from DB-backed results, not from result files directly.
export interface FileResultRow {
  host: string;
  latency_ms: number | null;
  loss_pct: number;
  jitter_ms: number | null;
  score: number;
  org?: string;
  city?: string;
  country?: string;
  port?: number | null;
  checked_at: string;
}

export async function listFileResults(_env: Env): Promise<FileResultRow[] | null> {
  return null;
}
