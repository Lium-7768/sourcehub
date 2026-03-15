import type { Env, SourceRow } from '../app/types';
import { SourceValidationError, validateSourceRuntime } from '../app/source-validation';
import { getSourceById, listEnabledSources, markSourceSyncStatus } from '../db/sources.repo';
import { createFinishedSyncRun, createSyncRun, finishSyncRun } from '../db/sync-runs.repo';
import { upsertItems, updateSourceItemCount } from '../db/items.repo';
import { createMeasurement } from '../db/measurements.repo';
import { runCloudflareDnsSource } from '../source-adapters/cloudflare-dns.adapter';
import { runTextUrlSource } from '../source-adapters/text-url.adapter';
import { runJsonApiSource } from '../source-adapters/json-api.adapter';

class SyncExecutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SyncExecutionError';
    this.code = code;
  }
}

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
    throw new SyncExecutionError('source_disabled', 'Source is disabled');
  }

  const intervalMin = getEffectiveSyncIntervalMin(source);
  const elapsed = minutesSinceLastSync(source.last_sync_at);
  if (elapsed < intervalMin) {
    const waitMin = Math.ceil(intervalMin - elapsed);
    throw new SyncExecutionError('frequency_control', `Sync blocked by frequency control. Try again in about ${waitMin} minute(s)`);
  }

  if (triggerType === 'cron' && source.last_status === 'running') {
    throw new SyncExecutionError('source_running', 'Source is already running');
  }
}

async function runSourceAdapter(env: Env, source: SourceRow) {
  if (source.type === 'cloudflare_dns') {
    if (!env.CF_API_TOKEN) throw new SyncExecutionError('missing_runtime_secret', 'Missing CF_API_TOKEN in runtime env');
    return runCloudflareDnsSource(source, env.CF_API_TOKEN);
  }

  if (source.type === 'text_url') {
    return runTextUrlSource(source);
  }

  if (source.type === 'json_api') {
    return runJsonApiSource(source);
  }

  throw new SyncExecutionError('source_type_not_implemented', `Source type not implemented yet: ${source.type}`);
}

function toSyncFailure(err: unknown): { code: string; message: string } {
  if (err instanceof SourceValidationError) {
    return { code: 'runtime_validation_failed', message: JSON.stringify({ fields: err.fields }) };
  }
  if (err instanceof SyncExecutionError) {
    return { code: err.code, message: err.message };
  }

  const message = err instanceof Error ? err.message : String(err);

  if (/Failed to fetch text|Failed to fetch json/i.test(message)) {
    return { code: 'upstream_fetch_failed', message };
  }
  if (/empty content|empty array|does not contain object items|produced no valid items|returned no valid DNS records/i.test(message)) {
    return { code: 'upstream_empty', message };
  }
  if (/extract_path must resolve to an array|missing a usable stable key/i.test(message)) {
    return { code: 'invalid_upstream_shape', message };
  }

  return { code: 'sync_failed', message };
}

export async function syncSource(env: Env, sourceId: string, triggerType: 'manual' | 'cron' = 'manual') {
  const source = await getSourceById(env, sourceId);
  if (!source) throw new SyncExecutionError('source_not_found', 'Source not found');

  assertSourceCanSync(source, triggerType);
  const runId = await createSyncRun(env, sourceId, triggerType);

  try {
    const runtimeValidation = validateSourceRuntime(source, env);
    if (!runtimeValidation.ok) {
      throw new SourceValidationError(runtimeValidation.fields);
    }

    await markSourceSyncStatus(env, sourceId, 'running', null, { touchLastSyncAt: false });
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

      for (let i = 0; i < stats.itemIds.length; i += 1) {
        const normalized = result.items[i];
        const host = String(normalized?.value?.ip ?? normalized?.value?.content ?? normalized?.value?.domain ?? normalized?.itemKey ?? '');
        if (!host) continue;

        await createMeasurement(env, {
          itemId: stats.itemIds[i],
          sourceId,
          probeType: 'sync_placeholder',
          latencyMs: null,
          lossPct: null,
          jitterMs: null,
          status: 'unknown',
          region: null,
          score: null,
        });
      }
    }

    await finishSyncRun(env, runId, 'success', 'sync_success', null, result.fetchedCount, inserted, updated, 0);
    await markSourceSyncStatus(env, sourceId, 'success');

    return { runId, inserted, updated, ...result };
  } catch (err) {
    const failure = toSyncFailure(err);
    await finishSyncRun(env, runId, 'failed', failure.code, failure.message, 0);
    await markSourceSyncStatus(env, sourceId, 'failed', `${failure.code}: ${failure.message}`);
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
      const runId = await createFinishedSyncRun(env, source.id, 'cron', 'skipped', 'not_due_yet', message);
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
      const failure = toSyncFailure(err);
      const runId = await createFinishedSyncRun(env, source.id, 'cron', 'failed', failure.code, failure.message);
      results.push({ sourceId: source.id, status: 'failed', message: failure.message, runId });
    }
  }

  return results;
}
