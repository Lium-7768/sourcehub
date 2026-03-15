import type { Env } from '../app/types';
import { createMeasurement } from '../db/measurements.repo';
import { listActiveItemsBySource } from '../db/items.repo';

export interface ProbeRunInput {
  sourceId: string;
  limit?: number;
  port?: number;
  attempts?: number;
  timeoutMs?: number;
  region?: string | null;
}

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

function deriveHostAndPort(value: Record<string, unknown>, itemKey: string, portOverride?: number): { host: string; port: number } {
  const host = String(value.ip ?? value.content ?? value.domain ?? itemKey ?? '').trim();
  const valuePort = typeof value.port === 'number' && Number.isFinite(value.port) ? value.port : undefined;
  const port = portOverride ?? valuePort ?? 443;
  return { host, port };
}

export async function runTcpProbeForSource(env: Env, input: ProbeRunInput) {
  const safeLimit = Math.max(1, Math.min(20, Number(input.limit ?? 5)));
  const safeAttempts = Math.max(1, Math.min(5, Number(input.attempts ?? 3)));
  const safeTimeoutMs = Math.max(300, Math.min(5000, Number(input.timeoutMs ?? 2000)));
  const rows = await listActiveItemsBySource(env, input.sourceId, safeLimit);
  const results: ProbeResultItem[] = [];

  for (const row of rows as any[]) {
    const value = JSON.parse(row.value_json ?? '{}');
    const { host, port } = deriveHostAndPort(value, row.item_key, input.port);
    if (!host) continue;

    const latencies: number[] = [];
    let failures = 0;

    for (let i = 0; i < safeAttempts; i += 1) {
      try {
        const latency = await probeOnce(host, port, safeTimeoutMs);
        latencies.push(latency);
      } catch {
        failures += 1;
      }
    }

    const successCount = latencies.length;
    const failureCount = failures;
    const lossPct = Number(((failureCount / safeAttempts) * 100).toFixed(1));
    const latencyMs = average(latencies);
    const jitterMs = calcJitter(latencies);
    const status: 'ok' | 'partial' | 'fail' = successCount === 0 ? 'fail' : failureCount === 0 ? 'ok' : 'partial';
    const score = calcScore(latencyMs, lossPct, status);

    await createMeasurement(env, {
      itemId: row.id,
      sourceId: input.sourceId,
      probeType: 'tcp_connect',
      latencyMs,
      lossPct,
      jitterMs,
      status,
      region: input.region ?? null,
      score,
    });

    results.push({
      itemId: row.id,
      itemKey: row.item_key,
      host,
      port,
      attempts: safeAttempts,
      successCount,
      failureCount,
      latencyMs,
      lossPct,
      jitterMs,
      status,
      score,
    });
  }

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
    },
  };
}
