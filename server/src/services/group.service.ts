import { Client } from 'ldapts';
import { db, getOne, getMany, tx, now } from '../db';
import { AppError } from '../utils/errors';
import { getLdapConfig } from './settings.service';
import { recordAudit, AuditAction } from './audit.service';
import { rebuildForGroups } from './permission.service';
import type { User } from '../types';

/**
 * 用户组：本地组手工维护，LDAP 组可从 AD 一键同步。
 *
 * 同步语义：
 *   - 按 external_dn 识别组，存在则改名，不存在则新建；
 *   - 组成员按"组内检索"（(&(objectClass=user)(memberOf=DN))）拉取，
 *     用户不存在时自动建档（source=ldap，首登后补全资料）；
 *   - 成员关系做全量对齐（同步后与目录一致，本地手工加的成员会被移出——
 *     这是刻意的：LDAP 组以目录为唯一事实来源）。
 * 注意：AD 单组成员超过 1500 时需要 ranged retrieval，本版本不处理，
 * 超大组请在 AD 侧拆分（见 README FAQ）。
 */

export interface GroupWithCount {
  id: number;
  name: string;
  description: string | null;
  external_dn: string | null;
  source: string;
  member_count: number;
}

export function listGroups(keyword?: string): GroupWithCount[] {
  const clause = keyword ? 'WHERE g.name LIKE ?' : '';
  const params = keyword ? [`%${keyword}%`] : [];
  return getMany<GroupWithCount>(
    `SELECT g.id, g.name, g.description, g.external_dn, g.source,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
     FROM groups g ${clause} ORDER BY g.name`,
    params
  );
}

export function getGroupMembers(groupId: number): { id: number; username: string; display_name: string; source: string }[] {
  return getMany(
    `SELECT u.id, u.username, u.display_name, u.source FROM users u
     JOIN group_members m ON m.user_id = u.id
     WHERE m.group_id = ? AND u.is_active = 1 ORDER BY u.username`,
    [groupId]
  );
}

export function createGroup(actor: User, input: { name: string; description?: string | null }): { id: number } {
  const name = input.name?.trim() || '';
  if (!name || name.length > 64) throw AppError.badRequest('组名必填且不超过 64 字');
  if (getOne<{ id: number }>('SELECT id FROM groups WHERE name = ?', [name])) {
    throw AppError.conflict('同名用户组已存在');
  }
  const info = db
    .prepare('INSERT INTO groups (name, description, source, created_at) VALUES (?, ?, ?, ?)')
    .run(name, input.description?.trim() || null, 'local', now());
  return { id: Number(info.lastInsertRowid) };
}

export function updateGroup(actor: User, id: number, input: { name?: string; description?: string | null }): void {
  const group = getOne<{ id: number; name: string; source: string }>(
    'SELECT id, name, source FROM groups WHERE id = ?',
    [id]
  );
  if (!group) throw AppError.notFound('用户组不存在');
  if (group.source === 'ldap' && input.name !== undefined && input.name.trim() !== group.name) {
    throw AppError.badRequest('LDAP 同步组的名称由目录服务管理，不能在此修改');
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 64) throw AppError.badRequest('组名必填且不超过 64 字');
    const dup = getOne<{ id: number }>('SELECT id FROM groups WHERE name = ? AND id != ?', [name, id]);
    if (dup) throw AppError.conflict('同名用户组已存在');
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, id);
  }
  if (input.description !== undefined) {
    db.prepare('UPDATE groups SET description = ? WHERE id = ?').run(input.description?.trim() || null, id);
  }
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_UPDATE,
    objectType: 'group',
    objectId: id,
    detail: `更新用户组 ${group.name}`,
  });
}

export function deleteGroup(actor: User, id: number): void {
  const group = getOne<{ name: string }>('SELECT name FROM groups WHERE id = ?', [id]);
  if (!group) throw AppError.notFound('用户组不存在');
  tx(() => {
    // 组删除后其 ACL 授权一并清理，避免悬空授权
    db.prepare("DELETE FROM acl_entries WHERE subject_type = 'group' AND subject_id = ?").run(id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  });
  rebuildForGroups();
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_DELETE,
    objectType: 'group',
    objectId: id,
    detail: `删除用户组 ${group.name}`,
  });
}

export function setGroupMembers(actor: User, groupId: number, userIds: number[]): void {
  const group = getOne<{ name: string; source: string }>('SELECT name, source FROM groups WHERE id = ?', [groupId]);
  if (!group) throw AppError.notFound('用户组不存在');
  if (group.source === 'ldap') {
    throw AppError.badRequest('LDAP 同步组的成员由目录服务管理，请在设置页重新同步');
  }
  tx(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)'
    );
    for (const uid of new Set(userIds)) ins.run(groupId, uid, now());
  });
  rebuildForGroups();
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_UPDATE,
    objectType: 'group',
    objectId: groupId,
    detail: `设置组成员（${userIds.length} 人）`,
  });
}

// ---------------------------------------------------------------------------
// AD / LDAP 组同步
// ---------------------------------------------------------------------------

export interface LdapSyncResult {
  groups: number;
  users: number;
  memberships: number;
  skipped: string[];
}

function upsertLdapUser(u: {
  username: string;
  displayName: string;
  email: string | null;
  externalId: string;
}): number {
  const existing = getOne<{ id: number }>(
    "SELECT id FROM users WHERE source = 'ldap' AND (external_id = ? OR username = ?)",
    [u.externalId, u.username]
  );
  if (existing) return existing.id;
  const info = db
    .prepare(
      `INSERT INTO users (username, display_name, email, source, external_id, is_admin, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'ldap', ?, 0, 1, ?, ?)`
    )
    .run(u.username, u.displayName, u.email, u.externalId, now(), now());
  return Number(info.lastInsertRowid);
}

export async function syncGroupsFromLdap(actor: User): Promise<LdapSyncResult> {
  const cfg = getLdapConfig();
  if (!cfg.enabled || !cfg.url || !cfg.baseDn) {
    throw AppError.unavailable('LDAP 未启用或未配置完整');
  }

  const client = new Client({ url: cfg.url, timeout: cfg.timeoutMs, connectTimeout: cfg.timeoutMs });
  const result: LdapSyncResult = { groups: 0, users: 0, memberships: 0, skipped: [] };

  try {
    await client.bind(cfg.bindDn || '', cfg.bindPassword || '');

    const { searchEntries: groupEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: cfg.groupFilter,
      attributes: ['cn', 'name'],
      sizeLimit: 0,
      paged: { pageSize: 500 },
    });

    for (const g of groupEntries) {
      const dn = g.dn;
      const cn = typeof g.cn === 'string' ? g.cn : Array.isArray(g.cn) ? String(g.cn[0] ?? '') : '';
      if (!dn || !cn) continue;

      // 组入库：按 external_dn 识别
      let groupId: number;
      const byDn = getOne<{ id: number }>('SELECT id FROM groups WHERE external_dn = ?', [dn]);
      if (byDn) {
        db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(cn, byDn.id);
        groupId = byDn.id;
      } else {
        if (getOne<{ id: number }>('SELECT id FROM groups WHERE name = ?', [cn])) {
          result.skipped.push(`${cn}（同名本地组已存在）`);
          continue;
        }
        const info = db
          .prepare('INSERT INTO groups (name, external_dn, source, created_at) VALUES (?, ?, ?, ?)')
          .run(cn, dn, 'ldap', now());
        groupId = Number(info.lastInsertRowid);
      }
      result.groups += 1;

      // 组内用户检索并入库
      const escDn = dn.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(2).padStart(8, '0')}`);
      const { searchEntries: userEntries } = await client.search(cfg.baseDn, {
        scope: 'sub',
        filter: `(&(objectClass=user)(memberOf=${escDn}))`,
        attributes: ['sAMAccountName', 'uid', 'displayName', 'cn', 'mail', 'objectGUID', 'entryUUID'],
        sizeLimit: 0,
        paged: { pageSize: 500 },
      });

      const memberIds: number[] = [];
      for (const u of userEntries) {
        const pick = (v: unknown): string =>
          typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : v ? String(v) : '';
        const username = pick(u.sAMAccountName) || pick(u.uid) || pick(u.cn);
        if (!username) continue;
        const guid =
          u.objectGUID && Buffer.isBuffer(u.objectGUID)
            ? (u.objectGUID as unknown as Buffer).toString('hex')
            : pick(u.objectGUID) || pick(u.entryUUID) || u.dn;
        memberIds.push(
          upsertLdapUser({
            username,
            displayName: pick(u.displayName) || pick(u.cn) || username,
            email: pick(u.mail) || null,
            externalId: guid,
          })
        );
        result.users += 1;
      }

      // 成员关系全量对齐
      tx(() => {
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
        const ins = db.prepare(
          'INSERT OR IGNORE INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)'
        );
        for (const uid of memberIds) ins.run(groupId, uid, now());
      });
      result.memberships += memberIds.length;
    }
  } finally {
    await client.unbind().catch(() => undefined);
  }

  rebuildForGroups();
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.GROUP_SYNC,
    detail: `LDAP 同步：${result.groups} 组 / ${result.users} 用户 / ${result.memberships} 成员关系` +
      (result.skipped.length ? `，跳过 ${result.skipped.length} 项` : ''),
  });
  return result;
}
