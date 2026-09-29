import { db, getMany, tx, now } from '../db';
import { AppError } from '../utils/errors';
import { rebuildAclForSpace } from './permission.service';
import { recordAudit, AuditAction } from './audit.service';
import type { Permission, SubjectType } from '../types';

/**
 * ACL 条目读写：空间与文档共用一套"全量替换"语义。
 * 前端提交完整条目列表，服务端校验后整体替换并触发权限重算。
 */

export interface AclEntryInput {
  subject_type: SubjectType;
  subject_id: number | null;
  permission: Permission;
  inherit: number;
}

export interface AclEntryView extends AclEntryInput {
  /** 展示用主体名（用户名/组名/everyone） */
  subject_name: string | null;
}

const PERMISSIONS = [1, 2, 3];

function validateEntries(objectType: 'space' | 'document', entries: AclEntryInput[]): void {
  for (const e of entries) {
    if (!['user', 'group', 'everyone'].includes(e.subject_type)) {
      throw AppError.badRequest('授权主体类型不合法');
    }
    if (!PERMISSIONS.includes(e.permission)) {
      throw AppError.badRequest('权限等级只能为 1/2/3');
    }
    if (e.subject_type === 'everyone') {
      if (e.subject_id !== null) throw AppError.badRequest('everyone 授权不能指定主体 id');
    } else if (!Number.isInteger(e.subject_id) || e.subject_id === null || e.subject_id <= 0) {
      throw AppError.badRequest('用户/组授权必须指定主体 id');
    }
    if (objectType === 'space' && e.inherit !== 1) {
      // 空间级授权天然覆盖全部文档，inherit 恒为 1
      e.inherit = 1;
    }
  }
}

export function listAcl(objectType: 'space' | 'document', objectId: number): AclEntryView[] {
  const rows = getMany<{
    id: number;
    subject_type: SubjectType;
    subject_id: number | null;
    permission: Permission;
    inherit: number;
  }>(
    `SELECT id, subject_type, subject_id, permission, inherit FROM acl_entries
     WHERE object_type = ? AND object_id = ?
     ORDER BY subject_type, subject_id`,
    [objectType, objectId]
  );

  // 批量取主体名，避免 N+1
  const userIds = rows.filter((r) => r.subject_type === 'user').map((r) => r.subject_id as number);
  const groupIds = rows.filter((r) => r.subject_type === 'group').map((r) => r.subject_id as number);
  const userNames = new Map<string, string>();
  const groupNames = new Map<string, string>();
  if (userIds.length) {
    for (const r of getMany<{ id: number; display_name: string; username: string }>(
      `SELECT id, display_name, username FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds
    )) {
      userNames.set(String(r.id), r.display_name || r.username);
    }
  }
  if (groupIds.length) {
    for (const r of getMany<{ id: number; name: string }>(
      `SELECT id, name FROM groups WHERE id IN (${groupIds.map(() => '?').join(',')})`,
      groupIds
    )) {
      groupNames.set(String(r.id), r.name);
    }
  }

  return rows.map((r) => ({
    subject_type: r.subject_type,
    subject_id: r.subject_id,
    permission: r.permission,
    inherit: r.inherit,
    subject_name:
      r.subject_type === 'everyone'
        ? null
        : r.subject_type === 'user'
          ? userNames.get(String(r.subject_id)) ?? `用户#${r.subject_id}`
          : groupNames.get(String(r.subject_id)) ?? `组#${r.subject_id}`,
  }));
}

export function replaceAcl(
  actor: { id: number; username: string },
  objectType: 'space' | 'document',
  objectId: number,
  entries: AclEntryInput[]
): { count: number } {
  validateEntries(objectType, entries);

  tx(() => {
    db.prepare('DELETE FROM acl_entries WHERE object_type = ? AND object_id = ?').run(objectType, objectId);
    const ins = db.prepare(
      `INSERT INTO acl_entries (object_type, object_id, subject_type, subject_id, permission, inherit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of entries) {
      ins.run(objectType, objectId, e.subject_type, e.subject_id, e.permission, e.inherit === 1 ? 1 : 0, now());
    }
  });

  rebuildAclForSpace(objectId); // 内部为全量重算，入口语义不影响正确性
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.PERMISSION_UPDATE,
    objectType,
    objectId,
    detail: `更新${objectType === 'space' ? '空间' : '文档'} ACL（${entries.length} 条）`,
  });
  return { count: entries.length };
}
