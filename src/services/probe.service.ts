import type { Env, SourceRow } from '../app/types';
import { createMeasurement } from '../db/measurements.repo';
import { deactivateExpiredUnknownItems, listActiveItemsBySource, markItemsPendingRecheck, resetItemsLifecycle, updateSourceItemCount } from '../db/items.repo';
import { getSourceById, listEnabledSources, markSourceProbeStatus } from '../db/sources.repo';

export interface ProbeRunInput {
  sourceId: string;
  limit?: number;
  port?: number;
  attempts?: number;
  timeoutMs?: number;
  region?: string | null;
}

interface ProbeDefaults {
  enabled: boolean;
  limit: number;
  port?: number;
  attempts: number;
  timeoutMs: number;
  intervalMin: number;
  maxRounds: number;
  region?: string | null;
}

const DEFAULT_PROBE: ProbeDefaults = {
  enabled: true,
  limit: 100,
  attempts: 2,
  timeoutMs: 1500,
  intervalMin: 30,
  maxRounds: 20,
  port: 443,
  region: 'HKG',
};

export interface ProbeResultItem {
  itemId: string;
  itemKey: string;
  host: string;
  port: number;
  attempts: number;
  successCount: number;
  failureCount: number;
  latencyMs: number | null;
  lossPct: number;
  jitterMs: number | null;
  status: 'ok' | 'partial' | 'fail';
  score: number;
}

interface ProbeAttemptSummary {
  port: number;
  attempts: number;
  successCount: number;
  failureCount: number;
  latencyMs: number | null;
  jitterMs: number | null;
  lossPct: number;
  status: 'ok' | 'partial' | 'fail';
  score: number;
}

function getProbeDefaults(_source: SourceRow): ProbeDefaults {
  return { ...DEFAULT_PROBE };
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function calcJitter(values: number[]): number | null {
  if (values.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    deltas.push(Math.abs(values[i] - values[i - 1]));
  }
  return average(deltas);
}

function calcScore(latencyMs: number | null, lossPct: number, status: 'ok' | 'partial' | 'fail'): number {
  if (status === 'fail') return 0;
  const latencyPenalty = latencyMs === null ? 60 : Math.min(60, latencyMs / 5);
  const lossPenalty = Math.min(40, lossPct * 2);
  const base = 100 - latencyPenalty - lossPenalty;
  if (status === 'partial') return Math.max(1, Number((base * 0.75).toFixed(1)));
  return Math.max(1, Number(base.toFixed(1)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => Promise<void> | void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(async () => {
      try {
        await onTimeout?.();
      } catch {
        // ignore timeout cleanup errors
      }
      reject(new Error(`probe timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function getSocketConnect() {
  const injected = (globalThis as any).__cloudflareSocketsConnect;
  if (typeof injected === 'function') return injected;

  const mod = await import('cloudflare:sockets');
  return mod.connect;
}

async function probeOnce(host: string, port: number, timeoutMs: number): Promise<number> {
  const started = Date.now();
  const socketConnect = await getSocketConnect();
  const socket = socketConnect({ hostname: host, port }, { secureTransport: 'off', allowHalfOpen: false });

  try {
    await withTimeout(socket.opened, timeoutMs, async () => {
      await socket.close().catch(() => undefined);
    });
    return Date.now() - started;
  } finally {
    await socket.close().catch(() => undefined);
  }
}

function deriveHostAndPort(value: Record<string, unknown>, itemKey: string, portOverride?: number): { host: string; port?: number } {
  const host = String(value.ip ?? value.content ?? value.domain ?? itemKey ?? '').trim();
  const rawPort = value.port;
  const valuePort = typeof rawPort === 'number'
    ? rawPort
    : typeof rawPort === 'string' && rawPort.trim() && /^\d+$/.test(rawPort.trim())
      ? Number(rawPort.trim())
      : undefined;
  const port = portOverride ?? (typeof valuePort === 'number' && Number.isFinite(valuePort)
    ? Math.max(1, Math.min(65535, valuePort))
    : undefined);
  return { host, port };
}

function buildPortPlan(portOverride: number | undefined, valuePort: number | undefined): number[] {
  if (typeof portOverride === 'number') return [portOverride];
  if (typeof valuePort === 'number') return [valuePort];
  return [80, 443];
}

async function probePort(host: string, port: number, attempts: number, timeoutMs: number): Promise<ProbeAttemptSummary> {
  const latencies: number[] = [];
  let failures = 0;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const latency = await probeOnce(host, port, timeoutMs);
      latencies.push(latency);
    } catch {
      failures += 1;
    }
  }

  const successCount = latencies.length;
  const failureCount = failures;
  const lossPct = Number(((failureCount / attempts) * 100).toFixed(1));
  const latencyMs = average(latencies);
  const jitterMs = calcJitter(latencies);
  const status: 'ok' | 'partial' | 'fail' = successCount === 0 ? 'fail' : failureCount === 0 ? 'ok' : 'partial';
  const score = calcScore(latencyMs, lossPct, status);

  return {
    port,
    attempts,
    successCount,
    failureCount,
    latencyMs,
    jitterMs,
    lossPct,
    status,
    score,
  };
}

export async function runTcpProbeForSource(env: Env, input: ProbeRunInput) {
  const source = await getSourceById(env, input.sourceId);
  if (!source) {
    throw new Error('Source not found');
  }

  const defaults = getProbeDefaults(source);
  const safeLimit = Math.max(1, Math.min(100, Number(input.limit ?? defaults.limit)));
  const safeAttempts = Math.max(1, Math.min(5, Number(input.attempts ?? defaults.attempts)));
  const safeTimeoutMs = Math.max(300, Math.min(5000, Number(input.timeoutMs ?? defaults.timeoutMs)));
  const resolvedPort = input.port ?? defaults.port;
  const resolvedRegion = input.region ?? defaults.region ?? null;
  const rows = await listActiveItemsBySource(env, input.sourceId, safeLimit);
  const results: ProbeResultItem[] = [];

  for (const row of rows as any[]) {
    const value = JSON.parse(row.value_json ?? '{}');
    const derived = deriveHostAndPort(value, row.item_key, resolvedPort);
    const host = derived.host;
    const valuePort = typeof derived.port === 'number' ? derived.port : undefined;
    if (!host) continue;

    const portPlan = buildPortPlan(resolvedPort, valuePort);
    let chosen: ProbeAttemptSummary | null = null;

    for (const port of portPlan) {
      const attempt = await probePort(host, port, safeAttempts, safeTimeoutMs);
      chosen = attempt;
      if (attempt.status !== 'fail') break;
    }

    if (!chosen) continue;

    await createMeasurement(env, {
      itemId: row.id,
      sourceId: input.sourceId,
      probeType: 'tcp_connect',
      latencyMs: chosen.latencyMs,
      lossPct: chosen.lossPct,
      jitterMs: chosen.jitterMs,
      status: chosen.status,
      region: resolvedRegion,
      score: chosen.score,
    });

    results.push({
      itemId: row.id,
      itemKey: row.item_key,
      host,
      port: chosen.port,
      attempts: chosen.attempts,
      successCount: chosen.successCount,
      failureCount: chosen.failureCount,
      latencyMs: chosen.latencyMs,
      lossPct: chosen.lossPct,
      jitterMs: chosen.jitterMs,
      status: chosen.status,
      score: chosen.score,
    });
  }

  const unknownIds = results.filter((item) => item.status === 'fail').map((item) => item.itemId);
  const knownIds = results.filter((item) => item.status !== 'fail').map((item) => item.itemId);
  await markItemsPendingRecheck(env, unknownIds, 24);
  await resetItemsLifecycle(env, knownIds);

  return {
    success: true,
    count: results.length,
    items: results,
    meta: {
      sourceId: input.sourceId,
      limit: safeLimit,
      attempts: safeAttempts,
      timeoutMs: safeTimeoutMs,
      probeType: 'tcp_connect',
      port: resolvedPort ?? null,
      region: resolvedRegion,
      pendingRecheckCount: unknownIds.length,
    },
  };
}

function minutesSince(timestamp: string | null): number {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(timestamp).getTime()) / 60000;
}

export async function runScheduledProbes(env: Env) {
  const sources = await listEnabledSources(env);
  const results: Array<{ sourceId: string; status: 'probed' | 'skipped' | 'failed'; message?: string; count?: number; rounds?: number }> = [];

  for (const source of sources) {
    const defaults = getProbeDefaults(source);
    if (!defaults.enabled) continue;

    const elapsed = minutesSince(source.probe_last_at ?? null);
    if (elapsed < defaults.intervalMin) {
      results.push({
        sourceId: source.id,
        status: 'skipped',
        message: `Skipped probe: not due yet (${Math.floor(elapsed)}/${defaults.intervalMin} min)`,
      });
      continue;
    }

    try {
      const cleanup = await deactivateExpiredUnknownItems(env, source.id);
      if (cleanup.count > 0) {
        await updateSourceItemCount(env, source.id);
      }
      await markSourceProbeStatus(env, source.id, 'probing', null, { touchProbeLastAt: false });

      let total = 0;
      let rounds = 0;
      for (let i = 0; i < defaults.maxRounds; i += 1) {
        const result = await runTcpProbeForSource(env, { sourceId: source.id });
        total += result.count;
        rounds += 1;
        if (result.count < defaults.limit) break;
      }

      const cleanupText = cleanup.count > 0 ? `cleaned stale_unknown=${cleanup.count}` : null;
      const statusText = cleanupText ? `${cleanupText}; rounds=${rounds}; probed=${total}` : `rounds=${rounds}; probed=${total}`;
      await markSourceProbeStatus(env, source.id, 'success', statusText, { touchProbeLastAt: true });
      results.push({ sourceId: source.id, status: 'probed', count: total, rounds, message: cleanupText ?? undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markSourceProbeStatus(env, source.id, 'failed', `probe_failed: ${message}`, { touchProbeLastAt: false });
      results.push({ sourceId: source.id, status: 'failed', message });
    }
  }

  return results;
}
