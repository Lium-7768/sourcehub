import type { Env } from '../app/types';
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

  for (const item of items) {
    const existing = await env.DB.prepare(
      `SELECT id FROM items WHERE source_id = ? AND item_key = ?`
    ).bind(item.sourceId, item.itemKey).first<{ id: string }>();

    if (existing?.id) {
      await env.DB.prepare(
        `UPDATE items
         SET kind = ?, value_json = ?, tags_json = ?, checksum = ?, is_active = 1, last_seen_at = ?, updated_at = ?
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
      updated += 1;
    } else {
      await env.DB.prepare(
        `INSERT INTO items (
          id, source_id, kind, item_key, value_json, tags_json, checksum,
          is_active, first_seen_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      ).bind(
        makeId('item'),
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
      inserted += 1;
    }
  }

  return { inserted, updated };
}

export async function updateSourceItemCount(env: Env, sourceId: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM items WHERE source_id = ? AND is_active = 1`
  ).bind(sourceId).first<{ count: number }>();

  await env.DB.prepare(
    `UPDATE sources SET item_count = ?, updated_at = ? WHERE id = ?`
  ).bind(row?.count ?? 0, nowIso(), sourceId).run();
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
