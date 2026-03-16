import type { Env, SourceRow } from '../app/types';
import { nowIso } from '../utils/time';

export async function listEnabledSources(env: Env): Promise<SourceRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM sources WHERE enabled = 1 ORDER BY updated_at DESC`
  ).all<SourceRow>();
  return results;
}

export async function getSourceById(env: Env, id: string): Promise<SourceRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM sources WHERE id = ?`).bind(id).first<SourceRow>();
  return row ?? null;
}

export async function markSourceProbeStatus(
  env: Env,
  id: string,
  status: string,
  lastError: string | null = null,
  options?: { touchProbeLastAt?: boolean }
) {
  const touchProbeLastAt = options?.touchProbeLastAt ?? true;
  if (touchProbeLastAt) {
    await env.DB.prepare(
      `UPDATE sources SET probe_last_status = ?, probe_last_error = ?, probe_last_at = ?, updated_at = ? WHERE id = ?`
    ).bind(status, lastError, nowIso(), nowIso(), id).run();
    return;
  }

  await env.DB.prepare(
    `UPDATE sources SET probe_last_status = ?, probe_last_error = ?, updated_at = ? WHERE id = ?`
  ).bind(status, lastError, nowIso(), id).run();
}
