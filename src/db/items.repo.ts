import type { Env, ItemRow } from '../app/types';
import { makeId } from '../utils/id';
import { nowIso } from '../utils/time';

export interface UpsertItemInput {
  sourceId: string;
  kind: string;
  itemKey: string;
  value: Record<string, unknown>;
  tags?: string[];
  checksum?: string;
}

export async function upsertItems(env: Env, items: UpsertItemInput[]) {
  const now = nowIso();
  let inserted = 0;
  let updated = 0;
  const itemIds: string[] = [];

  for (const item of items) {
    const existing = await env.DB.prepare(
      `SELECT id FROM items WHERE source_id = ? AND item_key = ?`
    ).bind(item.sourceId, item.itemKey).first<{ id: string }>();

    if (existing?.id) {
      await env.DB.prepare(
        `UPDATE items
         SET kind = ?, value_json = ?, tags_json = ?, checksum = ?, is_active = 1,
             unknown_since_at = NULL, recheck_after_at = NULL, lifecycle_state = 'active',
             last_seen_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        item.kind,
        JSON.stringify(item.value),
        JSON.stringify(item.tags ?? []),
        item.checksum ?? null,
        now,
        now,
        existing.id,
      ).run();
      itemIds.push(existing.id);
      updated += 1;
    } else {
      const id = makeId('item');
      await env.DB.prepare(
        `INSERT INTO items (
          id, source_id, kind, item_key, value_json, tags_json, checksum,
          is_active, first_seen_at, last_seen_at, unknown_since_at, recheck_after_at, lifecycle_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, 'active', ?, ?)`
      ).bind(
        id,
        item.sourceId,
        item.kind,
        item.itemKey,
        JSON.stringify(item.value),
        JSON.stringify(item.tags ?? []),
        item.checksum ?? null,
        now,
        now,
        now,
        now,
      ).run();
      itemIds.push(id);
      inserted += 1;
    }
  }

  return { inserted, updated, itemIds };
}

export async function updateSourceItemCount(env: Env, sourceId: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM items WHERE source_id = ? AND is_active = 1`
  ).bind(sourceId).first<{ count: number }>();

  await env.DB.prepare(
    `UPDATE sources SET item_count = ?, updated_at = ? WHERE id = ?`
  ).bind(row?.count ?? 0, nowIso(), sourceId).run();
}

export async function listActiveItemsBySource(env: Env, sourceId: string, limit = 10) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 10)));
  const { results } = await env.DB.prepare(
    `SELECT id, source_id, kind, item_key, value_json, tags_json, updated_at, unknown_since_at, recheck_after_at, lifecycle_state
     FROM items
     WHERE source_id = ? AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT ?`
  ).bind(sourceId, safeLimit).all<ItemRow>();
  return results;
}

export async function markItemsPendingRecheck(env: Env, itemIds: string[], hours = 24) {
  if (!itemIds.length) return 0;
  const now = new Date();
  const recheck = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const nowIsoText = now.toISOString();
  let changes = 0;

  for (const id of itemIds) {
    await env.DB.prepare(
      `UPDATE items
       SET unknown_since_at = COALESCE(unknown_since_at, ?),
           recheck_after_at = ?,
           lifecycle_state = 'pending_recheck',
           updated_at = ?
       WHERE id = ? AND is_active = 1`
    ).bind(nowIsoText, recheck, nowIsoText, id).run();
    changes += 1;
  }

  return changes;
}

export async function resetItemsLifecycle(env: Env, itemIds: string[]) {
  if (!itemIds.length) return 0;
  const now = nowIso();
  let changes = 0;

  for (const id of itemIds) {
    await env.DB.prepare(
      `UPDATE items
       SET unknown_since_at = NULL,
           recheck_after_at = NULL,
           lifecycle_state = 'active',
           updated_at = ?
       WHERE id = ? AND is_active = 1`
    ).bind(now, id).run();
    changes += 1;
  }

  return changes;
}

export async function deactivateExpiredUnknownItems(env: Env, sourceId: string, now = nowIso()) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM items
     WHERE source_id = ? AND is_active = 1 AND lifecycle_state = 'pending_recheck'
       AND recheck_after_at IS NOT NULL AND recheck_after_at <= ?`
  ).bind(sourceId, now).all<{ id: string }>();

  if (!results.length) return { count: 0, itemIds: [] as string[] };

  const itemIds = results.map((row) => row.id);
  for (const id of itemIds) {
    await env.DB.prepare(
      `UPDATE items
       SET is_active = 0,
           lifecycle_state = 'stale_unknown',
           updated_at = ?
       WHERE id = ?`
    ).bind(now, id).run();
  }

  return { count: itemIds.length, itemIds };
}

export async function listPublicItems(env: Env, options?: { kind?: string; sourceId?: string; limit?: number }) {
  const kind = options?.kind;
  const sourceId = options?.sourceId;
  const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 50)));

  if (kind && sourceId) {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.source_id, i.kind, i.item_key, i.value_json, i.tags_json, i.updated_at
       FROM items i
       JOIN sources s ON s.id = i.source_id
       WHERE i.is_active = 1 AND s.is_public = 1 AND i.kind = ? AND i.source_id = ?
       ORDER BY i.updated_at DESC
       LIMIT ?`
    ).bind(kind, sourceId, limit).all();
    return results;
  }

  if (kind) {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.source_id, i.kind, i.item_key, i.value_json, i.tags_json, i.updated_at
       FROM items i
       JOIN sources s ON s.id = i.source_id
       WHERE i.is_active = 1 AND s.is_public = 1 AND i.kind = ?
       ORDER BY i.updated_at DESC
       LIMIT ?`
    ).bind(kind, limit).all();
    return results;
  }

  if (sourceId) {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.source_id, i.kind, i.item_key, i.value_json, i.tags_json, i.updated_at
       FROM items i
       JOIN sources s ON s.id = i.source_id
       WHERE i.is_active = 1 AND s.is_public = 1 AND i.source_id = ?
       ORDER BY i.updated_at DESC
       LIMIT ?`
    ).bind(sourceId, limit).all();
    return results;
  }

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.source_id, i.kind, i.item_key, i.value_json, i.tags_json, i.updated_at
     FROM items i
     JOIN sources s ON s.id = i.source_id
     WHERE i.is_active = 1 AND s.is_public = 1
     ORDER BY i.updated_at DESC
     LIMIT ?`
  ).bind(limit).all();
  return results;
}
