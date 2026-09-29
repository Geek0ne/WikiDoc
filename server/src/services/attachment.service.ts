import fs from 'node:fs';
import path from 'node:path';
import { db, getOne, getMany, now } from '../db';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { randomStorageKey } from '../utils/crypto';
import { writeStorageFile, removeStorageFile, storagePathOf, assertAllowedFile } from '../utils/upload';
import { recordAudit, AuditAction } from './audit.service';
import { hasPermission, canManageDocument } from './permission.service';
import { indexDocument } from '../search/indexer';
import type { Attachment, User } from '../types';

/**
 * 附件服务。落盘名随机（无扩展名），扩展名/MIME 白名单由 utils/upload 把关。
 * 下载权限：附件挂在文档下 → 文档读权限；未挂文档 → 仅上传者或管理员。
 */

export function createAttachment(
  actor: User,
  groupIds: number[],
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  documentId: number | null
): Attachment {
  assertAllowedFile(file);
  if (documentId !== null) {
    if (!hasPermission(actor.id, documentId, 2, groupIds)) {
      throw AppError.forbidden('没有向该文档上传附件的权限');
    }
  }

  const storageKey = randomStorageKey();
  writeStorageFile(storageKey, file.buffer);
  const info = db
    .prepare(
      `INSERT INTO attachments (document_id, uploader_id, filename, mime_type, size, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(documentId, actor.id, file.originalname, file.mimetype, file.size, storageKey, now());

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.ATTACHMENT_UPLOAD,
    objectType: 'attachment',
    objectId: Number(info.lastInsertRowid),
    detail: `上传附件 ${file.originalname}（${file.size} 字节）`,
  });
  return loadAttachment(Number(info.lastInsertRowid));
}

function loadAttachment(id: number): Attachment {
  const row = getOne<Attachment>('SELECT * FROM attachments WHERE id = ?', [id]);
  if (!row) throw AppError.notFound('附件不存在');
  return row;
}

export function listAttachments(documentId: number): Attachment[] {
  return getMany<Attachment>(
    'SELECT * FROM attachments WHERE document_id = ? ORDER BY id DESC',
    [documentId]
  );
}

/** 下载入口：返回文件 Buffer 与原始文件名 */
export function readAttachment(
  actor: User,
  groupIds: number[],
  id: number
): { attachment: Attachment; content: Buffer } {
  const att = loadAttachment(id);
  if (att.document_id !== null) {
    if (!hasPermission(actor.id, att.document_id, 1, groupIds)) {
      throw AppError.forbidden();
    }
  } else if (att.uploader_id !== actor.id && !actor.is_admin) {
    throw AppError.forbidden('仅上传者或管理员可以访问未挂载的附件');
  }
  const file = storagePathOf(att.storage_key);
  if (!fs.existsSync(file)) throw AppError.notFound('附件文件已丢失');
  return { attachment: att, content: fs.readFileSync(file) };
}

export function deleteAttachment(actor: User, groupIds: number[], id: number): void {
  const att = loadAttachment(id);
  const mayDelete =
    att.uploader_id === actor.id ||
    actor.is_admin === 1 ||
    (att.document_id !== null && canManageDocument(actor.id, att.document_id, groupIds));
  if (!mayDelete) throw AppError.forbidden();

  removeStorageFile(att.storage_key);
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.ATTACHMENT_DELETE,
    objectType: 'attachment',
    objectId: id,
    detail: `删除附件 ${att.filename}`,
  });
}

/** 把附件挂到文档（导入链路用）：插入记录并返回 id */
export function attachBufferToDocument(
  uploaderId: number,
  documentId: number,
  filename: string,
  mimeType: string,
  content: Buffer
): Attachment {
  const storageKey = randomStorageKey();
  writeStorageFile(storageKey, content);
  const info = db
    .prepare(
      `INSERT INTO attachments (document_id, uploader_id, filename, mime_type, size, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(documentId, uploaderId, filename, mimeType, content.length, storageKey, now());
  return loadAttachment(Number(info.lastInsertRowid));
}

/** 附件引用重排（文档移动/删除时的挂载关系维护，预留） */
export function moveAttachmentTarget(attachmentId: number, newDocId: number | null): void {
  db.prepare('UPDATE attachments SET document_id = ? WHERE id = ?').run(newDocId, attachmentId);
}

/** 附件在正文中可用的引用地址 */
export function attachmentUrl(attachment: Attachment): string {
  return `/api/attachments/${attachment.id}/raw?name=${encodeURIComponent(attachment.filename)}`;
}

/** 导入后刷新文档索引（附件改名等场景预留） */
export function reindexAfterAttach(documentId: number): void {
  const doc = getOne<{ title: string; content_md: string }>(
    'SELECT title, content_md FROM documents WHERE id = ?',
    [documentId]
  );
  if (doc) indexDocument(documentId, doc.title, doc.content_md);
}

// 供空间删除统计占用（预留接口）
export function attachmentsDir(): string {
  return path.dirname(storagePathOf('x'));
}

export function attachmentDiskUsage(): number {
  try {
    return fs.readdirSync(config.uploadDir).reduce((sum, f) => {
      const st = fs.statSync(path.join(config.uploadDir, f));
      return sum + (st.isFile() ? st.size : 0);
    }, 0);
  } catch {
    return 0;
  }
}
