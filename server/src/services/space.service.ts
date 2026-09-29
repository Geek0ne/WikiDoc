import fs from 'node:fs';
import path from 'node:path';
import { db, getOne, getMany, tx, now } from '../db';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { resolveSpacePermission } from './permission.service';
import { recordAudit } from './audit.service';
import type { Space, User, Visibility } from '../types';

/**
 * 空间管理。空间是文档树的根，可见性与 ACL 决定谁能进。
 * 删除空间为物理删除（级联清空文档树及其索引），仅空间所有者或管理员可执行。
 */

export const SPACE_KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;
const VISIBILITIES: Visibility[] = ['inherit', 'public', 'space', 'private'];

export interface SpaceWithMeta extends Space {
  doc_count: number;
  my_permission: number | null;
}

export function listSpaces(user: User | null, groupIds: number[]): SpaceWithMeta[] {
  const spaces = getMany<Space>('SELECT * FROM spaces ORDER BY name');
  const counts = new Map(
    getMany<{ space_id: number; c: number }>(
      'SELECT space_id, COUNT(*) AS c FROM documents WHERE deleted_at IS NULL GROUP BY space_id'
    ).map((r) => [r.space_id, r.c])
  );

  const out: SpaceWithMeta[] = [];
  for (const s of spaces) {
    const p = resolveSpacePermission(user ? user.id : null, groupIds, s.id);
    if (p === null) continue; // 无任何权限的空间直接不出现在列表
    out.push({ ...s, doc_count: counts.get(s.id) ?? 0, my_permission: p });
  }
  return out;
}

export function getSpaceByKey(key: string, user: User | null, groupIds: number[]): SpaceWithMeta {
  const space = getOne<Space>('SELECT * FROM spaces WHERE key = ?', [key]);
  if (!space) throw AppError.notFound('空间不存在');
  const p = resolveSpacePermission(user ? user.id : null, groupIds, space.id);
  if (p === null) throw AppError.forbidden();
  const docCount =
    (
      db
        .prepare('SELECT COUNT(*) AS c FROM documents WHERE space_id = ? AND deleted_at IS NULL')
        .get(space.id) as { c: number }
    ).c ?? 0;
  return { ...space, doc_count: docCount, my_permission: p };
}

export interface CreateSpaceInput {
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  visibility?: Visibility;
}

export function createSpace(actor: User, input: CreateSpaceInput): SpaceWithMeta {
  const key = input.key?.trim() || '';
  if (!SPACE_KEY_RE.test(key)) {
    throw AppError.badRequest('空间标识需为 2-32 位小写字母数字或连字符，且以字母开头');
  }
  if (!input.name?.trim()) throw AppError.badRequest('空间名称必填');
  if (getOne<{ id: number }>('SELECT id FROM spaces WHERE key = ?', [key])) {
    throw AppError.conflict('空间标识已被使用');
  }
  const visibility = VISIBILITIES.includes(input.visibility as Visibility)
    ? (input.visibility as Visibility)
    : 'space';

  const info = db
    .prepare(
      `INSERT INTO spaces (key, name, description, icon, owner_id, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      key,
      input.name.trim(),
      input.description?.trim() || null,
      input.icon || null,
      actor.id,
      visibility,
      now(),
      now()
    );
  const space = getOne<Space>('SELECT * FROM spaces WHERE id = ?', [Number(info.lastInsertRowid)])!;
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: 'space.create',
    objectType: 'space',
    objectId: space.id,
    detail: `创建空间 ${key}`,
  });
  return { ...space, doc_count: 0, my_permission: 3 };
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  visibility?: Visibility;
}

export function updateSpace(
  actor: User,
  groupIds: number[],
  spaceId: number,
  input: UpdateSpaceInput
): Space {
  const space = getOne<Space>('SELECT * FROM spaces WHERE id = ?', [spaceId]);
  if (!space) throw AppError.notFound('空间不存在');
  if (resolveSpacePermission(actor.id, groupIds, spaceId)! < 3) {
    throw AppError.forbidden('需要空间管理权限');
  }
  if (input.visibility !== undefined && !VISIBILITIES.includes(input.visibility)) {
    throw AppError.badRequest('可见性取值不合法');
  }

  tx(() => {
    if (input.name !== undefined) {
      if (!input.name.trim()) throw AppError.badRequest('空间名称必填');
      db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(input.name.trim(), spaceId);
    }
    if (input.description !== undefined) {
      db.prepare('UPDATE spaces SET description = ? WHERE id = ?').run(input.description?.trim() || null, spaceId);
    }
    if (input.icon !== undefined) {
      db.prepare('UPDATE spaces SET icon = ? WHERE id = ?').run(input.icon || null, spaceId);
    }
    if (input.visibility !== undefined && input.visibility !== space.visibility) {
      db.prepare('UPDATE spaces SET visibility = ? WHERE id = ?').run(input.visibility, spaceId);
    }
    db.prepare('UPDATE spaces SET updated_at = ? WHERE id = ?').run(now(), spaceId);
  });

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: 'space.update',
    objectType: 'space',
    objectId: spaceId,
    detail: `更新空间 ${space.key}`,
  });
  return getOne<Space>('SELECT * FROM spaces WHERE id = ?', [spaceId])!;
}

export function deleteSpace(actor: User, spaceId: number): void {
  const space = getOne<Space>('SELECT * FROM spaces WHERE id = ?', [spaceId]);
  if (!space) throw AppError.notFound('空间不存在');
  if (space.owner_id !== actor.id && !actor.is_admin) {
    throw AppError.forbidden('仅空间所有者或管理员可以删除空间');
  }

  const docIds = getMany<{ id: number }>(
    'SELECT id FROM documents WHERE space_id = ?',
    [spaceId]
  ).map((r) => r.id);
  const storageKeys = docIds.length
    ? getMany<{ storage_key: string }>(
        `SELECT storage_key FROM attachments WHERE document_id IN (${docIds.map(() => '?').join(',')})`,
        docIds
      ).map((r) => r.storage_key)
    : [];

  tx(() => {
    if (docIds.length) {
      const slots = docIds.map(() => '?').join(',');
      // FTS 表无外键，需显式清理
      db.prepare(`DELETE FROM doc_search WHERE doc_id IN (${slots})`).run(...docIds);
      // ACL 条目无外键，一并清理
      db.prepare(`DELETE FROM acl_entries WHERE object_type = 'document' AND object_id IN (${slots})`).run(...docIds);
      db.prepare("DELETE FROM acl_entries WHERE object_type = 'space' AND object_id = ?").run(spaceId);
      db.prepare(`DELETE FROM attachments WHERE document_id IN (${slots})`).run(...docIds);
    }
    db.prepare('DELETE FROM spaces WHERE id = ?').run(spaceId); // 文档树靠 FK 级联
  });

  // 附件文件 Best-effort 清理，失败不影响主流程
  for (const key of storageKeys) {
    fs.unlink(path.join(config.uploadDir, key), () => undefined);
  }

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: 'space.delete',
    objectType: 'space',
    objectId: spaceId,
    detail: `删除空间 ${space.key}（文档 ${docIds.length} 篇）`,
  });
}
