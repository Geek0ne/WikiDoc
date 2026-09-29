import fs from 'node:fs';
import path from 'node:path';
import { db, getOne, getMany, tx, now } from '../db';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { shortId } from '../utils/crypto';
import {
  resolveDocPermission,
  resolveSpacePermission,
  hasPermission,
  assertCanRead,
  assertCanWrite,
  assertCanManage,
  rebuildAclForSubtree,
} from './permission.service';
import { recordAudit, AuditAction } from './audit.service';
import { indexDocument, removeDocumentIndex, stripMarkdown } from '../search/indexer';
import type { Document, User, Visibility } from '../types';

/**
 * 文档服务：树 CRUD、物化路径维护、版本历史、回收站、收藏与浏览记录。
 *
 * 物化路径约定：/空间id/父id/.../自身id/，末段是自身 id。
 *   - 祖先解析 = 按 '/' 切开取数字；
 *   - 子树匹配 = path 前缀（前缀自带段边界，/1/12/ 不会误中 /1/120/）。
 *
 * 版本模型：创建存 v1；每次保存 version+1 并落一条快照；
 *   回滚 = 取历史快照内容作为新版本写入，历史永不改写。
 *
 * 权限要求：
 *   读文档 → 权限 ≥1；编辑内容/标题 → ≥2；改可见性/移动/删除 → ≥3；
 *   新建子文档 → 空间写权限 或 父文档管理权限。
 */

const VISIBILITIES: Visibility[] = ['inherit', 'public', 'space', 'private'];
const STATUSES = ['draft', 'published', 'archived'] as const;
type DocStatus = (typeof STATUSES)[number];

function loadDoc(id: number): Document {
  const doc = getOne<Document>('SELECT * FROM documents WHERE id = ?', [id]);
  if (!doc) throw AppError.notFound('文档不存在');
  return doc;
}

function computeContentText(markdown: string): string {
  return stripMarkdown(markdown);
}

// ---------------------------------------------------------------------------
// slug 与路径
// ---------------------------------------------------------------------------

function baseSlugFromTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return ascii || 'doc';
}

function slugExists(spaceId: number, parentId: number | null, slug: string): boolean {
  return !!getOne<{ x: number }>(
    'SELECT 1 AS x FROM documents WHERE space_id = ? AND parent_id IS ? AND slug = ? AND deleted_at IS NULL',
    [spaceId, parentId, slug]
  );
}

/** 中文标题没有可用 ASCII 时退化为 doc-随机后缀，保证 URL 稳定唯一 */
function genSlug(spaceId: number, parentId: number | null, title: string): string {
  const base = baseSlugFromTitle(title);
  if (!slugExists(spaceId, parentId, base)) return base;
  for (let i = 2; i < 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!slugExists(spaceId, parentId, candidate)) return candidate;
  }
  return `${base}-${shortId()}`;
}

// ---------------------------------------------------------------------------
// 树与读取
// ---------------------------------------------------------------------------

export interface DocTreeNode {
  id: number;
  parent_id: number | null;
  title: string;
  status: string;
  visibility: string;
  sort_order: number;
  my_permission: number;
  has_children: boolean;
  children: DocTreeNode[];
}

export function getDocTree(spaceId: number, user: User, groupIds: number[]): DocTreeNode[] {
  const rows = getMany<{
    id: number;
    parent_id: number | null;
    title: string;
    status: string;
    visibility: string;
    sort_order: number;
  }>(
    `SELECT id, parent_id, title, status, visibility, sort_order FROM documents
     WHERE space_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, title, id`,
    [spaceId]
  );

  const visible = new Map<number, DocTreeNode>();
  for (const r of rows) {
    const p = resolveDocPermission(user.id, groupIds, r.id) ?? 0;
    if (p < 1) continue;
    visible.set(r.id, {
      ...r,
      my_permission: p,
      has_children: false,
      children: [],
    });
  }

  const roots: DocTreeNode[] = [];
  for (const node of visible.values()) {
    const parent = node.parent_id !== null ? visible.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
      parent.has_children = true;
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export interface DocumentDetail {
  doc: Document;
  my_permission: number;
  breadcrumb: { id: number; title: string }[];
}

export function getDocument(user: User, groupIds: number[], id: number): DocumentDetail {
  assertCanRead(user.id, groupIds, id);
  const doc = loadDoc(id);
  const myPermission = resolveDocPermission(user.id, groupIds, id) ?? 0;

  const ancestorIdList = doc.path
    .split('/')
    .filter(Boolean)
    .map(Number)
    .filter((n) => n !== id);
  const breadcrumb: { id: number; title: string }[] = [];
  if (ancestorIdList.length) {
    const slots = ancestorIdList.map(() => '?').join(',');
    const rows = getMany<{ id: number; title: string }>(
      `SELECT id, title FROM documents WHERE id IN (${slots})`,
      ancestorIdList
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const aid of ancestorIdList) {
      const row = byId.get(aid);
      if (row) breadcrumb.push(row);
    }
  }
  return { doc, my_permission: myPermission, breadcrumb };
}

export function listChildren(user: User, groupIds: number[], parentId: number): Document[] {
  assertCanRead(user.id, groupIds, parentId);
  const parent = loadDoc(parentId);
  const rows = getMany<Document>(
    `SELECT * FROM documents WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, title, id`,
    [parent.id]
  );
  return rows.filter((d) => (resolveDocPermission(user.id, groupIds, d.id) ?? 0) >= 1);
}

// ---------------------------------------------------------------------------
// 创建 / 更新 / 移动
// ---------------------------------------------------------------------------

export interface CreateDocInput {
  space_id: number;
  parent_id?: number | null;
  title?: string;
  content_md?: string;
  visibility?: Visibility;
  status?: DocStatus;
  sort_order?: number;
}

export function createDocument(actor: User, groupIds: number[], input: CreateDocInput): Document {
  const space = getOne<{ id: number }>('SELECT id FROM spaces WHERE id = ?', [input.space_id]);
  if (!space) throw AppError.notFound('目标空间不存在');

  let parent: Document | null = null;
  if (input.parent_id !== null && input.parent_id !== undefined) {
    parent = getOne<Document>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [input.parent_id]
    );
    if (!parent) throw AppError.notFound('父文档不存在或已删除');
    if (parent.space_id !== input.space_id) {
      throw AppError.badRequest('父文档必须位于同一空间');
    }
  }

  // 新建权限：空间可写，或父文档可管理
  const spacePerm = hasSpaceWrite(actor, groupIds, input.space_id);
  const parentManage = parent ? hasPermission(actor.id, parent.id, 3, groupIds) : false;
  if (!spacePerm && !parentManage) {
    throw AppError.forbidden('没有在该位置创建文档的权限');
  }

  const title = input.title?.trim() || '无标题文档';
  const visibility = VISIBILITIES.includes(input.visibility as Visibility)
    ? (input.visibility as Visibility)
    : 'inherit';
  const status = STATUSES.includes(input.status as DocStatus) ? (input.status as DocStatus) : 'draft';
  const contentMd = input.content_md ?? '';
  const sortOrder = Number.isFinite(input.sort_order) ? Number(input.sort_order) : 0;

  let docId = 0;
  tx(() => {
    const info = db
      .prepare(
        `INSERT INTO documents
           (space_id, parent_id, title, slug, content_md, content_text, status, visibility,
            path, sort_order, author_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '/', ?, ?, 1, ?, ?)`
      )
      .run(
        input.space_id,
        parent ? parent.id : null,
        title,
        'pending',
        contentMd,
        computeContentText(contentMd),
        status,
        visibility,
        sortOrder,
        actor.id,
        now(),
        now()
      );
    docId = Number(info.lastInsertRowid);

    const parentPath = parent ? parent.path : `/${input.space_id}/`;
    const path = `${parentPath}${docId}/`;
    const slug = genSlug(input.space_id, parent ? parent.id : null, title);
    db.prepare('UPDATE documents SET path = ?, slug = ? WHERE id = ?').run(path, slug, docId);

    db.prepare(
      `INSERT INTO document_versions (document_id, version, title, content_md, author_id, change_note, created_at)
       VALUES (?, 1, ?, ?, ?, '初始版本', ?)`
    ).run(docId, title, contentMd, actor.id, now());
  });

  indexDocument(docId, title, contentMd);
  rebuildAclForSubtree(docId);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.DOCUMENT_CREATE,
    objectType: 'document',
    objectId: docId,
    detail: `创建文档「${title}」`,
  });
  return loadDoc(docId);
}

function hasSpaceWrite(user: User, groupIds: number[], spaceId: number): boolean {
  const p = resolveSpacePermission(user.id, groupIds, spaceId);
  return p !== null && p >= 2;
}

export interface UpdateDocInput {
  title?: string;
  content_md?: string;
  visibility?: Visibility;
  status?: DocStatus;
  sort_order?: number;
  change_note?: string | null;
}

export function updateDocument(
  actor: User,
  groupIds: number[],
  id: number,
  input: UpdateDocInput
): Document {
  const doc = loadDoc(id);
  if (doc.deleted_at) throw AppError.notFound('文档已删除，请先恢复');

  const touchesContent = input.title !== undefined || input.content_md !== undefined;
  const touchesMeta =
    input.visibility !== undefined || input.status !== undefined || input.sort_order !== undefined;
  if (touchesContent) assertCanWrite(actor.id, groupIds, id);
  if (touchesMeta) assertCanManage(actor.id, groupIds, id);

  const title = input.title !== undefined ? input.title.trim() || doc.title : doc.title;
  const contentMd = input.content_md !== undefined ? input.content_md : doc.content_md;
  const visibility = input.visibility !== undefined ? input.visibility : doc.visibility;
  if (input.visibility !== undefined && !VISIBILITIES.includes(input.visibility)) {
    throw AppError.badRequest('可见性取值不合法');
  }
  const status = input.status !== undefined ? input.status : doc.status;
  const sortOrder = input.sort_order !== undefined ? Number(input.sort_order) : doc.sort_order;
  const nextVersion = doc.version + 1;

  tx(() => {
    db.prepare(
      `UPDATE documents SET title = ?, content_md = ?, content_text = ?, status = ?, visibility = ?,
         sort_order = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).run(title, contentMd, computeContentText(contentMd), status, visibility, sortOrder, nextVersion, actor.id, now(), id);

    db.prepare(
      `INSERT INTO document_versions (document_id, version, title, content_md, author_id, change_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, nextVersion, title, contentMd, actor.id, input.change_note?.trim() || null, now());
  });

  if (input.content_md !== undefined || input.title !== undefined) {
    indexDocument(id, title, contentMd);
  }
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.DOCUMENT_UPDATE,
    objectType: 'document',
    objectId: id,
    detail: `编辑文档「${title}」v${nextVersion}`,
  });
  return loadDoc(id);
}

/** 移动文档（同空间内调整父级）。跨空间移动暂不支持，保持 slug/链接语义简单。 */
export function moveDocument(
  actor: User,
  groupIds: number[],
  id: number,
  newParentId: number | null
): Document {
  const doc = loadDoc(id);
  if (doc.deleted_at) throw AppError.notFound('文档已删除，请先恢复');
  assertCanManage(actor.id, groupIds, id);

  let parent: Document | null = null;
  if (newParentId !== null && newParentId !== undefined) {
    parent = getOne<Document>('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [newParentId]);
    if (!parent) throw AppError.notFound('目标父文档不存在或已删除');
    if (parent.id === id) throw AppError.badRequest('不能把文档移动到自己下面');
    if (parent.space_id !== doc.space_id) throw AppError.badRequest('暂不支持跨空间移动');
    // 环检测：目标父级不能位于待移动子树内部
    if (parent.path.startsWith(doc.path)) {
      throw AppError.conflict('不能把文档移动到它自己的子文档下面');
    }
  }

  const spacePerm = hasSpaceWrite(actor, groupIds, doc.space_id);
  const parentManage = parent ? hasPermission(actor.id, parent.id, 3, groupIds) : true;
  if (!spacePerm && !parentManage) {
    throw AppError.forbidden('没有移动到目标位置的权限');
  }

  const oldPrefix = doc.path;
  const newParentPath = parent ? parent.path : `/${doc.space_id}/`;
  const newPrefix = `${newParentPath}${doc.id}/`;
  const slug = genSlug(doc.space_id, parent ? parent.id : null, doc.title);

  tx(() => {
    // 子树整体重写前缀（含已删除文档，保证恢复后路径正确）
    db.prepare(
      `UPDATE documents SET path = ? || substr(path, ?),
         parent_id = CASE WHEN id = ? THEN ? ELSE parent_id END,
         updated_at = ?
       WHERE path LIKE ? ESCAPE '\\'`
    ).run(newPrefix, oldPrefix.length + 1, id, parent ? parent.id : null, now(), escapeLike(oldPrefix));
    db.prepare('UPDATE documents SET slug = ? WHERE id = ?').run(slug, id);
  });

  rebuildAclForSubtree(id);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.DOCUMENT_UPDATE,
    objectType: 'document',
    objectId: id,
    detail: `移动文档「${doc.title}」`,
  });
  return loadDoc(id);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// 删除 / 回收站 / 恢复
// ---------------------------------------------------------------------------

function subtreeIds(root: Document): number[] {
  const rows = getMany<{ id: number }>(
    "SELECT id FROM documents WHERE path LIKE ? ESCAPE '\\' AND deleted_at IS NULL",
    [escapeLike(root.path)]
  );
  return rows.map((r) => r.id);
}

export function deleteDocument(actor: User, groupIds: number[], id: number, permanent: boolean): void {
  const doc = loadDoc(id);
  if (doc.deleted_at && !permanent) return;
  // 已删除文档（彻底删除场景）不能走 assertCanManage，它会把已删除文档拒之门外
  if (!hasPermission(actor.id, id, 3, groupIds)) {
    throw AppError.forbidden('没有删除该文档的权限');
  }

  if (!permanent) {
    // 软删除整棵子树
    tx(() => {
      db.prepare(
        "UPDATE documents SET deleted_at = ?, updated_by = ? WHERE path LIKE ? ESCAPE '\\'"
      ).run(now(), actor.id, escapeLike(doc.path));
    });
    recordAudit({
      userId: actor.id,
      username: actor.username,
      action: AuditAction.DOCUMENT_DELETE,
      objectType: 'document',
      objectId: id,
      detail: `删除文档「${doc.title}」（移入回收站）`,
    });
    return;
  }

  // 物理删除：索引、ACL、附件一并清理，文件在事务提交后 best-effort 删除
  const ids = subtreeIds({ ...doc, deleted_at: null });
  const allIds = ids.length ? ids : [id];
  const storageKeys = getMany<{ storage_key: string }>(
    `SELECT storage_key FROM attachments WHERE document_id IN (${allIds.map(() => '?').join(',')})`,
    allIds
  ).map((r) => r.storage_key);

  tx(() => {
    const slots = allIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM doc_search WHERE doc_id IN (${slots})`).run(...allIds);
    db.prepare(`DELETE FROM acl_entries WHERE object_type = 'document' AND object_id IN (${slots})`).run(...allIds);
    db.prepare(`DELETE FROM attachments WHERE document_id IN (${slots})`).run(...allIds);
    const del = db.prepare('DELETE FROM documents WHERE id = ?'); // 版本/画板/表格靠 FK 级联
    for (const did of allIds) del.run(did);
  });

  // 附件文件 Best-effort 清理，失败不影响主流程
  for (const key of storageKeys) {
    fs.unlink(path.join(config.uploadDir, key), () => undefined);
  }

  rebuildAclForSubtree(id);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.DOCUMENT_DELETE,
    objectType: 'document',
    objectId: id,
    detail: `彻底删除文档「${doc.title}」（含子文档 ${allIds.length - 1} 篇）`,
  });
}

export function restoreDocument(actor: User, groupIds: number[], id: number): void {
  const doc = loadDoc(id);
  if (!doc.deleted_at) throw AppError.badRequest('该文档不在回收站中');
  // 不能用 assertCanRead/assertCanManage：二者都会把已删除文档拒之门外，
  // 而恢复操作恰恰要求"对该文档有管理权"
  if (!hasPermission(actor.id, id, 3, groupIds)) {
    throw AppError.forbidden('没有恢复该文档的权限');
  }

  tx(() => {
    db.prepare(
      "UPDATE documents SET deleted_at = NULL, updated_by = ?, updated_at = ? WHERE path LIKE ? ESCAPE '\\'"
    ).run(actor.id, now(), escapeLike(doc.path));
  });
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.DOCUMENT_RESTORE,
    objectType: 'document',
    objectId: id,
    detail: `恢复文档「${doc.title}」`,
  });
}

export interface TrashItem {
  id: number;
  space_id: number;
  title: string;
  deleted_at: string | null;
  space_name: string;
}

/** 回收站列表：只显示"子树根"（父级仍存在或已删除的最高层节点） */
export function listTrash(actor: User, groupIds: number[]): TrashItem[] {
  const rows = getMany<{
    id: number;
    space_id: number;
    title: string;
    deleted_at: string | null;
    parent_id: number | null;
    parent_deleted: number | null;
    space_name: string;
  }>(
    `SELECT d.id, d.space_id, d.title, d.deleted_at, d.parent_id,
            p.deleted_at AS parent_deleted, s.name AS space_name
     FROM documents d
     JOIN spaces s ON s.id = d.space_id
     LEFT JOIN documents p ON p.id = d.parent_id
     WHERE d.deleted_at IS NOT NULL
     ORDER BY d.deleted_at DESC`
  );

  const out: TrashItem[] = [];
  for (const r of rows) {
    // 父文档也删除时，只展示最顶层被删节点
    if (r.parent_id !== null && r.parent_deleted) continue;
    if ((resolveDocPermission(actor.id, groupIds, r.id) ?? 0) < 3) continue;
    out.push({
      id: r.id,
      space_id: r.space_id,
      title: r.title,
      deleted_at: r.deleted_at,
      space_name: r.space_name,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 版本历史
// ---------------------------------------------------------------------------

export interface VersionRow {
  id: number;
  version: number;
  title: string;
  author_id: number;
  author_name: string | null;
  change_note: string | null;
  created_at: string;
}

export function listVersions(actor: User, groupIds: number[], docId: number): VersionRow[] {
  assertCanRead(actor.id, groupIds, docId);
  return getMany<VersionRow>(
    `SELECT v.id, v.version, v.title, v.author_id, u.display_name AS author_name,
            v.change_note, v.created_at
     FROM document_versions v LEFT JOIN users u ON u.id = v.author_id
     WHERE v.document_id = ? ORDER BY v.version DESC`,
    [docId]
  );
}

export function getVersionContent(actor: User, groupIds: number[], docId: number, version: number) {
  assertCanRead(actor.id, groupIds, docId);
  const row = getOne<{ version: number; title: string; content_md: string; created_at: string }>(
    'SELECT version, title, content_md, created_at FROM document_versions WHERE document_id = ? AND version = ?',
    [docId, version]
  );
  if (!row) throw AppError.notFound('历史版本不存在');
  return row;
}

/** 回滚：把历史内容作为新版本写入 */
export function restoreVersion(
  actor: User,
  groupIds: number[],
  docId: number,
  version: number
): Document {
  const snapshot = getVersionContent(actor, groupIds, docId, version);
  return updateDocument(actor, groupIds, docId, {
    title: snapshot.title,
    content_md: snapshot.content_md,
    change_note: `回滚至 v${version}`,
  });
}

// ---------------------------------------------------------------------------
// 收藏与最近浏览
// ---------------------------------------------------------------------------

function filterReadable(user: User, groupIds: number[], docIds: number[]): Set<number> {
  const ok = new Set<number>();
  for (const id of docIds) {
    if ((resolveDocPermission(user.id, groupIds, id) ?? 0) >= 1) ok.add(id);
  }
  return ok;
}

export function listFavorites(user: User, groupIds: number[]): Document[] {
  const rows = getMany<{ document_id: number }>(
    'SELECT document_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    [user.id]
  );
  const ids = rows.map((r) => r.document_id);
  if (!ids.length) return [];
  const readable = filterReadable(user, groupIds, ids);
  const kept = ids.filter((id) => readable.has(id));
  if (!kept.length) return [];
  return getMany<Document>(
    `SELECT * FROM documents WHERE id IN (${kept.map(() => '?').join(',')}) AND deleted_at IS NULL`,
    kept
  );
}

export function toggleFavorite(userId: number, docId: number): { favorited: boolean } {
  const exists = getOne<{ x: number }>(
    'SELECT 1 AS x FROM favorites WHERE user_id = ? AND document_id = ?',
    [userId, docId]
  );
  if (exists) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND document_id = ?').run(userId, docId);
    return { favorited: false };
  }
  db.prepare(
    'INSERT OR IGNORE INTO favorites (user_id, document_id, created_at) VALUES (?, ?, ?)'
  ).run(userId, docId, now());
  return { favorited: true };
}

export function recordView(userId: number, docId: number): void {
  db.prepare(
    `INSERT INTO recent_views (user_id, document_id, viewed_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, document_id) DO UPDATE SET viewed_at = excluded.viewed_at`
  ).run(userId, docId, now());
}

export function listRecent(user: User, groupIds: number[], limit = 10): Document[] {
  const rows = getMany<{ document_id: number }>(
    'SELECT document_id FROM recent_views WHERE user_id = ? ORDER BY viewed_at DESC LIMIT ?',
    [user.id, limit * 2]
  );
  const ids = rows.map((r) => r.document_id);
  if (!ids.length) return [];
  const readable = filterReadable(user, groupIds, ids);
  const kept = ids.filter((id) => readable.has(id)).slice(0, limit);
  if (!kept.length) return [];
  return getMany<Document>(
    `SELECT * FROM documents WHERE id IN (${kept.map(() => '?').join(',')}) AND deleted_at IS NULL
     ORDER BY CASE id ${kept.map((_, i) => `WHEN ? THEN ${i}`).join(' ')} END`,
    [...kept, ...kept]
  );
}
