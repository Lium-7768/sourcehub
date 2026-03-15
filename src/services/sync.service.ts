import type { Env, SourceRow } from '../app/types';
import { getSourceById, listEnabledSources, markSourceSyncStatus } from '../db/sources.repo';
import { createFinishedSyncRun, createSyncRun, finishSyncRun } from '../db/sync-runs.repo';
import { upsertItems, updateSourceItemCount } from '../db/items.repo';
import { runCloudflareDnsSource } from '../source-adapters/cloudflare-dns.adapter';
import { runTextUrlSource } from '../source-adapters/text-url.adapter';
import { runJsonApiSource } from '../source-adapters/json-api.adapter';

function minutesSinceLastSync(lastSyncAt: string | null): number {
  if (!lastSyncAt) return Number.POSITIVE_INFINITY;
  const diffMs = Date.now() - new Date(lastSyncAt).getTime();
  return diffMs / 60000;
}

function getEffectiveSyncIntervalMin(source: SourceRow): number {
  return Math.max(5, Math.min(1440, Number(source.sync_interval_min ?? 60)));
}

function assertSourceCanSync(source: SourceRow, triggerType: 'manual' | 'cron') {
  if (!source.enabled) {
    throw new Error('Source is disabled');
  }

  const intervalMin = getEffectiveSyncIntervalMin(source);
  const elapsed = minutesSinceLastSync(source.last_sync_at);
  if (elapsed < intervalMin) {
    const waitMin = Math.ceil(intervalMin - elapsed);
    throw new Error(`Sync blocked by frequency control. Try again in about ${waitMin} minute(s)`);
  }

  if (triggerType === 'cron' && source.last_status === 'running') {
    throw new Error('Source is already running');
  }
}

async function runSourceAdapter(env: Env, source: SourceRow) {
  if (source.type === 'cloudflare_dns') {
    if (!env.CF_API_TOKEN) throw new Error('Missing CF_API_TOKEN in runtime env');
    return runCloudflareDnsSource(source, env.CF_API_TOKEN);
  }

  if (source.type === 'text_url') {
    return runTextUrlSource(source);
  }

  if (source.type === 'json_api') {
    return runJsonApiSource(source);
  }

  throw new Error(`Source type not implemented yet: ${source.type}`);
}

export async function syncSource(env: Env, sourceId: string, triggerType: 'manual' | 'cron' = 'manual') {
  const source = await getSourceById(env, sourceId);
  if (!source) throw new Error('Source not found');

  assertSourceCanSync(source, triggerType);
  const runId = await createSyncRun(env, sourceId, triggerType);
  await markSourceSyncStatus(env, sourceId, 'running');

  try {
    const result = await runSourceAdapter(env, source);

    let inserted = 0;
    let updated = 0;
    if (result.items?.length) {
      const stats = await upsertItems(
        env,
        result.items.map((item) => ({
          sourceId,
          kind: item.kind,
          itemKey: item.itemKey,
          value: item.value,
          tags: JSON.parse(source.tags_json ?? '[]'),
        }))
      );
      inserted = stats.inserted;
      updated = stats.updated;
      await updateSourceItemCount(env, sourceId);
    }

    await finishSyncRun(env, runId, 'success', `Sync completed: inserted=${inserted}, updated=${updated}`, null, result.fetchedCount, inserted, updated, 0);
    await markSourceSyncStatus(env, sourceId, 'success');

    return { runId, inserted, updated, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(env, runId, 'failed', 'Sync failed', message, 0);
    await markSourceSyncStatus(env, sourceId, 'failed', message);
    throw err;
  }
}

export async function runScheduledSyncs(env: Env) {
  const sources = await listEnabledSources(env);
  const results: Array<{ sourceId: string; status: 'synced' | 'skipped' | 'failed'; message?: string; runId?: string }> = [];

  for (const source of sources) {
    const intervalMin = getEffectiveSyncIntervalMin(source);
    const elapsed = minutesSinceLastSync(source.last_sync_at);
    if (elapsed < intervalMin) {
      const message = `Skipped: not due yet (${Math.floor(elapsed)}/${intervalMin} min)`;
      const runId = await createFinishedSyncRun(env, source.id, 'cron', 'skipped', message);
      results.push({
        sourceId: source.id,
        status: 'skipped',
        message,
        runId,
      });
      continue;
    }

    try {
      const result = await syncSource(env, source.id, 'cron');
      results.push({ sourceId: source.id, status: 'synced', runId: result.runId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const runId = await createFinishedSyncRun(env, source.id, 'cron', 'failed', 'Scheduled sync failed', message);
      results.push({ sourceId: source.id, status: 'failed', message, runId });
    }
  }

  return results;
}
