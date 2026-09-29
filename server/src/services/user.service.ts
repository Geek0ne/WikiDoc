import bcrypt from 'bcryptjs';
import { db, getOne, getMany, tx, now } from '../db';
import { AppError } from '../utils/errors';
import { revokeAllForUser } from './auth.service';
import { recordAudit, AuditAction } from './audit.service';
import type { User } from '../types';

/**
 * 用户管理。管理员 CRUD + 用户自助资料与改密。
 *
 * 约定：
 *   - "删除"用户 = 停用（is_active=0），保留外键引用与历史作者信息；
 *   - 改密 / 停用后立即吊销该用户全部 refresh token；
 *   - 系统永远保留至少一名启用状态的管理员。
 */

export const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;

export interface PublicUser extends Omit<User, 'password_hash'> {}

/** 去掉敏感列后返回用户 */
export function sanitizeUser(user: User): PublicUser {
  const { password_hash: _ph, ...rest } = user as User & { password_hash?: string | null };
  void _ph;
  return rest;
}

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export interface UserQuery {
  keyword?: string;
  source?: string;
  active?: number;
  page: number;
  limit: number;
  offset: number;
}

export function listUsers(q: UserQuery): { items: PublicUser[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.keyword) {
    where.push('(username LIKE ? OR display_name LIKE ? OR email LIKE ?)');
    const like = `%${q.keyword}%`;
    params.push(like, like, like);
  }
  if (q.source) {
    where.push('source = ?');
    params.push(q.source);
  }
  if (q.active !== undefined) {
    where.push('is_active = ?');
    params.push(q.active);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM users ${clause}`).get(...(params as never[])) as { c: number }
  ).c;

  const rows = getMany<User>(
    `SELECT * FROM users ${clause} ORDER BY id LIMIT ? OFFSET ?`,
    [...params, q.limit, q.offset]
  );
  return { items: rows.map(sanitizeUser), total };
}

export function getUserDetail(id: number): { user: PublicUser; groups: { id: number; name: string; source: string }[] } {
  const user = getOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw AppError.notFound('用户不存在');
  const groups = getMany<{ id: number; name: string; source: string }>(
    `SELECT g.id, g.name, g.source FROM groups g
     JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY g.name`,
    [id]
  );
  return { user: sanitizeUser(user), groups };
}

export interface CreateUserInput {
  username: string;
  display_name: string;
  email?: string | null;
  password: string;
  is_admin?: number;
}

export function createUser(actor: User, input: CreateUserInput): PublicUser {
  const username = input.username?.trim() || '';
  if (!USERNAME_RE.test(username)) {
    throw AppError.badRequest('用户名需为 2-64 位字母数字或 . _ -，且以字母数字开头');
  }
  if (!input.password || input.password.length < 8) {
    throw AppError.badRequest('密码至少 8 位');
  }
  if (getOne<{ id: number }>('SELECT id FROM users WHERE username = ?', [username])) {
    throw AppError.conflict('用户名已存在');
  }

  const info = db
    .prepare(
      `INSERT INTO users (username, display_name, email, password_hash, source, is_admin, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'local', ?, 1, ?, ?)`
    )
    .run(
      username,
      input.display_name?.trim() || username,
      input.email?.trim() || null,
      hashPassword(input.password),
      input.is_admin === 1 ? 1 : 0,
      now(),
      now()
    );

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_CREATE,
    objectType: 'user',
    objectId: Number(info.lastInsertRowid),
    detail: `创建用户 ${username}`,
  });
  return sanitizeUser(loadUser(Number(info.lastInsertRowid)));
}

function loadUser(id: number): User {
  const user = getOne<User>('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw AppError.notFound('用户不存在');
  return user;
}

export interface UpdateUserInput {
  display_name?: string;
  email?: string | null;
  is_admin?: number;
  is_active?: number;
  password?: string;
}

export function updateUser(actor: User, id: number, input: UpdateUserInput): PublicUser {
  const target = loadUser(id);

  // 最后一名管理员的保护：降权或停用前确认还有其他可用管理员
  const losingAdmin =
    target.is_admin === 1 &&
    ((input.is_admin !== undefined && input.is_admin === 0) ||
      (input.is_active !== undefined && input.is_active === 0));
  if (losingAdmin) {
    const others = getOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND is_active = 1 AND id != ?',
      [id]
    );
    if (!others || others.c === 0) {
      throw AppError.conflict('系统至少需要保留一名可用的管理员');
    }
  }

  if (input.password !== undefined && input.password !== '') {
    if (input.password.length < 8) throw AppError.badRequest('密码至少 8 位');
    if (target.source !== 'local') {
      throw AppError.badRequest('域/单点账号的密码由上游目录服务管理，不能在此重置');
    }
  }

  tx(() => {
    if (input.display_name !== undefined || input.email !== undefined) {
      db.prepare('UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?').run(
        input.display_name !== undefined ? input.display_name.trim() || target.username : target.display_name,
        input.email !== undefined ? input.email?.trim() || null : target.email,
        now(),
        id
      );
    }
    if (input.is_admin !== undefined && input.is_admin !== target.is_admin) {
      db.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?').run(
        input.is_admin === 1 ? 1 : 0,
        now(),
        id
      );
    }
    if (input.is_active !== undefined && input.is_active !== target.is_active) {
      db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?').run(
        input.is_active === 1 ? 1 : 0,
        now(),
        id
      );
    }
    if (input.password) {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(input.password),
        now(),
        id
      );
    }
  });

  if (input.password || input.is_active === 0) revokeAllForUser(id);

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_UPDATE,
    objectType: 'user',
    objectId: id,
    detail: `更新用户 ${target.username}${input.password ? '（重置密码）' : ''}${input.is_active === 0 ? '（停用）' : ''}`,
  });
  return sanitizeUser(loadUser(id));
}

/** 停用用户（对外暴露为"删除"），保留历史数据 */
export function deactivateUser(actor: User, id: number): void {
  if (id === actor.id) throw AppError.badRequest('不能停用当前登录的账号');
  updateUser(actor, id, { is_active: 0 });
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_DELETE,
    objectType: 'user',
    objectId: id,
    detail: `停用用户 ${loadUser(id).username}`,
  });
}

export function updateProfile(
  userId: number,
  input: { display_name?: string; email?: string }
): PublicUser {
  const target = loadUser(userId);
  db.prepare('UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?').run(
    input.display_name !== undefined ? input.display_name.trim() || target.username : target.display_name,
    input.email !== undefined ? input.email?.trim() || null : target.email,
    now(),
    userId
  );
  return sanitizeUser(loadUser(userId));
}

export function changeOwnPassword(
  userId: number,
  oldPassword: string,
  newPassword: string,
  ip?: string | null
): void {
  const user = loadUser(userId);
  if (user.source !== 'local' || !user.password_hash) {
    throw AppError.forbidden('域/单点账号请在上游系统修改密码');
  }
  if (!bcrypt.compareSync(oldPassword || '', user.password_hash)) {
    throw AppError.badRequest('原密码不正确');
  }
  if (!newPassword || newPassword.length < 8) {
    throw AppError.badRequest('新密码至少 8 位');
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(newPassword),
    now(),
    userId
  );
  revokeAllForUser(userId);
  recordAudit({ userId, username: user.username, action: AuditAction.PASSWORD_CHANGE, ip: ip ?? null });
}

/** 给用户直接挂/摘组（管理端用户编辑页使用） */
export function setUserGroups(actor: User, userId: number, groupIds: number[]): void {
  loadUser(userId);
  tx(() => {
    db.prepare('DELETE FROM group_members WHERE user_id = ?').run(userId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)'
    );
    for (const gid of new Set(groupIds)) ins.run(gid, userId, now());
  });
  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.USER_UPDATE,
    objectType: 'user',
    objectId: userId,
    detail: `调整用户所属组（${groupIds.length} 个）`,
  });
}
