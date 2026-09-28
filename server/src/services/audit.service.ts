import { db, getMany, now } from '../db';
import type { AuthRequest } from '../types';

/**
 * 审计日志。登录、权限变更、删除、导出、设置变更等敏感动作都要留痕，
 * 且不可通过 API 删除。
 *
 * 写入必须"永不失败"：审计是旁路记录，不能因为它把主流程拖垮，
 * 所以写入异常只打日志不向上抛。
 */

export interface AuditInput {
  userId?: number | null;
  username?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: number | null;
  detail?: string | null;
  ip?: string | null;
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  username_snapshot: string | null;
  action: string;
  object_type: string | null;
  object_id: number | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

/** 常用动作枚举，避免各模块拼错字符串导致日志无法检索 */
export const AuditAction = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGE: 'auth.password_change',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  GROUP_SYNC: 'group.sync',
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_RESTORE: 'document.restore',
  PERMISSION_UPDATE: 'permission.update',
  PERMISSION_REBUILD: 'permission.rebuild',
  ATTACHMENT_UPLOAD: 'attachment.upload',
  ATTACHMENT_DELETE: 'attachment.delete',
  IMPORT: 'import.run',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_TEST: 'settings.test',
  BACKUP: 'admin.backup',
  NOTIFY_TEST: 'notify.test',
} as const;

export function recordAudit(p: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs
         (user_id, username_snapshot, action, object_type, object_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.userId ?? null,
      p.username ?? null,
      p.action,
      p.objectType ?? null,
      p.objectId ?? null,
      p.detail ?? null,
      p.ip ?? null,
      now()
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] 写入失败', p.action, err);
  }
}

/** 从已鉴权请求里提取操作者与来源 IP，省去每个路由重复拼装 */
export function auditFromRequest(req: AuthRequest, action: string, extra: Partial<AuditInput> = {}): void {
  recordAudit({
    userId: req.user?.id ?? null,
    username: req.user?.username ?? null,
    ip: clientIp(req),
    action,
    ...extra,
  });
}

export function clientIp(req: AuthRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw ? String(raw).split(',')[0].trim() : '') || req.ip || null;
}

export interface AuditQuery {
  page: number;
  limit: number;
  offset: number;
  action?: string;
  userId?: number;
  objectType?: string;
  objectId?: number;
  keyword?: string;
}

export function listAuditLogs(q: AuditQuery): { items: AuditLogRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.action) {
    where.push('action = ?');
    params.push(q.action);
  }
  if (q.userId !== undefined) {
    where.push('user_id = ?');
    params.push(q.userId);
  }
  if (q.objectType) {
    where.push('object_type = ?');
    params.push(q.objectType);
  }
  if (q.objectId !== undefined) {
    where.push('object_id = ?');
    params.push(q.objectId);
  }
  if (q.keyword) {
    where.push('(username_snapshot LIKE ? OR detail LIKE ? OR action LIKE ?)');
    const like = `%${q.keyword}%`;
    params.push(like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total =
    (
      db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${clause}`).get(...(params as never[])) as {
        c: number;
      }
    ).c ?? 0;

  const items = getMany<AuditLogRow>(
    `SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, q.limit, q.offset]
  );

  return { items, total };
}

/** 审计动作下拉选项，供管理端筛选器使用 */
export function listAuditActions(): string[] {
  return getMany<{ action: string }>('SELECT DISTINCT action FROM audit_logs ORDER BY action').map(
    (r) => r.action
  );
}
