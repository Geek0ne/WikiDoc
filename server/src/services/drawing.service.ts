import { db, getOne, getMany, tx, now } from '../db';
import { AppError } from '../utils/errors';
import { hasPermission } from './permission.service';
import { recordAudit } from './audit.service';
import type { User } from '../types';

/**
 * SVG 画板。自研方案（ADR-006）：只存 SVG 源码字符串，
 * 前端画板编辑器负责渲染与交互，服务端只做存储与权限。
 */

export interface DrawingRow {
  id: number;
  document_id: number | null;
  title: string;
  svg: string;
  width: number;
  height: number;
  author_id: number;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

function assertCanEditDrawing(
  actor: User,
  groupIds: number[],
  documentId: number | null,
  authorId?: number
): void {
  if (actor.is_admin === 1) return;
  if (documentId !== null) {
    if (!hasPermission(actor.id, documentId, 2, groupIds)) {
      throw AppError.forbidden('没有编辑该文档画板的权限');
    }
    return;
  }
  // 未挂文档的画板：仅作者本人可改
  if (authorId !== undefined && authorId !== actor.id) {
    throw AppError.forbidden('仅作者可以修改该画板');
  }
}

function assertCanReadDrawing(actor: User, groupIds: number[], documentId: number | null): void {
  if (actor.is_admin === 1 || documentId === null) return;
  if (!hasPermission(actor.id, documentId, 1, groupIds)) throw AppError.forbidden();
}

export function createDrawing(
  actor: User,
  groupIds: number[],
  input: { document_id?: number | null; title?: string; svg?: string; width?: number; height?: number }
): DrawingRow {
  const documentId = input.document_id ?? null;
  if (documentId !== null) {
    assertCanEditDrawing(actor, groupIds, documentId);
    const doc = getOne<{ id: number }>('SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!doc) throw AppError.notFound('目标文档不存在或已删除');
  }
  const info = db
    .prepare(
      `INSERT INTO drawings (document_id, title, svg, width, height, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      documentId,
      input.title?.trim() || '未命名画板',
      input.svg || '',
      Number.isFinite(input.width) ? Number(input.width) : 800,
      Number.isFinite(input.height) ? Number(input.height) : 450,
      actor.id,
      now(),
      now()
    );
  return getDrawing(actor, groupIds, Number(info.lastInsertRowid));
}

export function getDrawing(actor: User, groupIds: number[], id: number): DrawingRow {
  const row = getOne<DrawingRow>(
    `SELECT d.*, u.display_name AS author_name FROM drawings d
     LEFT JOIN users u ON u.id = d.author_id WHERE d.id = ?`,
    [id]
  );
  if (!row) throw AppError.notFound('画板不存在');
  assertCanReadDrawing(actor, groupIds, row.document_id);
  return row;
}

export function listDrawings(actor: User, groupIds: number[], documentId: number): DrawingRow[] {
  assertCanReadDrawing(actor, groupIds, documentId);
  return getMany<DrawingRow>(
    `SELECT d.*, u.display_name AS author_name FROM drawings d
     LEFT JOIN users u ON u.id = d.author_id
     WHERE d.document_id = ? ORDER BY d.updated_at DESC`,
    [documentId]
  );
}

export function updateDrawing(
  actor: User,
  groupIds: number[],
  id: number,
  input: { title?: string; svg?: string; width?: number; height?: number }
): DrawingRow {
  const row = getOne<{ document_id: number | null; author_id: number; title: string; svg: string; width: number; height: number }>(
    'SELECT document_id, author_id, title, svg, width, height FROM drawings WHERE id = ?',
    [id]
  );
  if (!row) throw AppError.notFound('画板不存在');
  assertCanEditDrawing(actor, groupIds, row.document_id, row.author_id);

  db.prepare(
    `UPDATE drawings SET title = ?, svg = ?, width = ?, height = ?, updated_at = ? WHERE id = ?`
  ).run(
    input.title !== undefined ? input.title.trim() || '未命名画板' : row.title,
    input.svg !== undefined ? input.svg : row.svg,
    Number.isFinite(input.width) ? Number(input.width) : row.width,
    Number.isFinite(input.height) ? Number(input.height) : row.height,
    now(),
    id
  );
  return getDrawing(actor, groupIds, id);
}

export function deleteDrawing(actor: User, groupIds: number[], id: number): void {
  const row = getOne<{ document_id: number | null; author_id: number; title: string }>(
    'SELECT document_id, author_id, title FROM drawings WHERE id = ?',
    [id]
  );
  if (!row) throw AppError.notFound('画板不存在');
  assertCanEditDrawing(actor, groupIds, row.document_id, row.author_id);
  db.prepare('DELETE FROM drawings WHERE id = ?').run(id);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    objectType: 'drawing',
    objectId: id,
    action: 'drawing.delete',
    detail: `删除画板「${row.title}」`,
  });
}
