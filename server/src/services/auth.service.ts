import { Client } from 'ldapts';
import { Issuer } from 'openid-client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, getOne, tx, now } from '../db';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { sha256 } from '../utils/crypto';
import { getLdapConfig, getOidcConfig, getSetting } from './settings.service';
import { recordAudit } from './audit.service';
import { signAccessToken, signRefreshToken } from '../middleware/auth';
import type { User } from '../types';

/**
 * 认证服务：本地密码 / LDAP 域账号 / OIDC 单点 三条登录链路，
 * 以及 refresh token 的签发、轮换与注销。
 *
 * 约定：
 *   - access token 走 Authorization 头，15 分钟；
 *   - refresh token 只落库 SHA-256 哈希（refresh_tokens 表），httpOnly 下发；
 *   - 刷新一律轮换：旧 refresh 立即作废；检测到已作废 token 被复用时
 *     吊销该用户全部会话（token 泄露防护）。
 */

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function localLoginEnabled(): boolean {
  return getSetting('auth.localEnabled') !== 'false';
}

function loadActiveUser(id: number): User {
  const user = getOne<User>('SELECT * FROM users WHERE id = ? AND is_active = 1', [id]);
  if (!user) throw AppError.unauthorized('账号不存在或已停用');
  return user;
}

// ---------------------------------------------------------------------------
// Token 签发与会话存储
// ---------------------------------------------------------------------------

function persistRefreshToken(userId: number, refreshToken: string, meta: SessionMeta): void {
  const expires = new Date(Date.now() + config.refreshTokenTtlDays * 86400_000);
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    sha256(refreshToken),
    meta.userAgent ?? null,
    meta.ip ?? null,
    expires.toISOString().replace('T', ' ').slice(0, 19),
    now()
  );
}

function issueTokens(user: User, meta: SessionMeta): LoginResult {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user.id);
  persistRefreshToken(user.id, refreshToken, meta);
  return { user, accessToken, refreshToken };
}

function revokeByHash(tokenHash: string): void {
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`
  ).run(now(), tokenHash);
}

/** 用户主动登出：幂等，token 无效也不报错 */
export function logout(refreshToken: string | undefined, meta: SessionMeta = {}): void {
  if (!refreshToken) return;
  const hash = sha256(refreshToken);
  const row = getOne<{ user_id: number }>(
    'SELECT user_id FROM refresh_tokens WHERE token_hash = ?',
    [hash]
  );
  revokeByHash(hash);
  if (row) recordAudit({ userId: row.user_id, action: 'auth.logout', ip: meta.ip ?? null });
}

/** 吊销某用户全部会话（改密、停用、发现泄露时用） */
export function revokeAllForUser(userId: number): void {
  db.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL'
  ).run(now(), userId);
}

export function rotateRefresh(
  refreshToken: string | undefined,
  meta: SessionMeta = {}
): LoginResult {
  if (!refreshToken) throw AppError.unauthorized('缺少刷新凭证');

  let payload: { sub?: number; type?: string };
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as { sub?: number; type?: string };
  } catch {
    throw AppError.unauthorized('登录已失效，请重新登录');
  }
  if (payload.type !== 'refresh' || !payload.sub) {
    throw AppError.unauthorized('登录已失效，请重新登录');
  }

  const hash = sha256(refreshToken);
  const row = getOne<{ id: number; user_id: number; revoked_at: string | null; expires_at: string }>(
    'SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ?',
    [hash]
  );

  if (!row || row.expires_at <= now()) {
    throw AppError.unauthorized('登录已失效，请重新登录');
  }
  if (row.revoked_at) {
    // 已作废 token 再次出现 = 疑似泄露，吊销该用户所有会话
    revokeAllForUser(row.user_id);
    recordAudit({
      userId: row.user_id,
      action: 'auth.logout',
      detail: 'refresh token 复用，已吊销该用户全部会话',
      ip: meta.ip ?? null,
    });
    throw AppError.unauthorized('登录状态异常，请重新登录');
  }

  const user = loadActiveUser(row.user_id);
  revokeByHash(hash);
  return issueTokens(user, meta);
}

// ---------------------------------------------------------------------------
// 本地密码登录
// ---------------------------------------------------------------------------

export function loginLocal(
  username: string,
  password: string,
  meta: SessionMeta = {}
): LoginResult {
  if (!localLoginEnabled()) {
    throw AppError.forbidden('本地密码登录已被管理员关闭');
  }

  const user = getOne<User>('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !user.is_active) {
    recordAudit({ username, action: 'auth.login_failed', detail: '本地账号不存在或已停用', ip: meta.ip ?? null });
    throw AppError.unauthorized('用户名或密码错误');
  }
  if (!user.password_hash) {
    throw AppError.forbidden('该账号由域/单点登录管理，不支持密码登录');
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    recordAudit({ userId: user.id, username, action: 'auth.login_failed', detail: '密码错误', ip: meta.ip ?? null });
    throw AppError.unauthorized('用户名或密码错误');
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
  const fresh = loadActiveUser(user.id);
  recordAudit({ userId: user.id, username, action: 'auth.login', detail: '本地登录', ip: meta.ip ?? null });
  return issueTokens(fresh, meta);
}

// ---------------------------------------------------------------------------
// LDAP / AD 登录：两阶段 bind（服务账号检索 → 用户 DN 验密）
// ---------------------------------------------------------------------------

/** LDAP 过滤器转义，防注入（RFC 4515） */
function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(2).padStart(8, '0')}`);
}

interface LdapUserAttrs {
  dn: string;
  username: string;
  displayName: string;
  email: string | null;
  externalId: string;
  memberOf: string[];
}

async function verifyLdapUser(
  cfg: ReturnType<typeof getLdapConfig>,
  username: string,
  password: string
): Promise<LdapUserAttrs | null> {
  const client = new Client({
    url: cfg.url,
    timeout: cfg.timeoutMs,
    connectTimeout: cfg.timeoutMs,
  });
  try {
    await client.bind(cfg.bindDn || '', cfg.bindPassword || '');
    const filter = cfg.userFilter.includes('{{username}}')
      ? cfg.userFilter.replace('{{username}}', escapeLdapFilter(username))
      : cfg.userFilter;
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter,
      sizeLimit: 2,
      attributes: ['dn', 'sAMAccountName', 'uid', 'displayName', 'cn', 'mail', 'objectGUID', 'entryUUID', 'memberOf'],
    });
    if (!searchEntries.length) return null;
    const e = searchEntries[0];

    await client.bind(e.dn, password);

    const pick = (v: unknown): string =>
      typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : v ? String(v) : '';
    const rawUsername = pick(e.sAMAccountName) || pick(e.uid) || pick(e.cn);
    const memberOfRaw = e.memberOf;
    const memberOf = Array.isArray(memberOfRaw)
      ? memberOfRaw.map(String)
      : memberOfRaw
        ? [String(memberOfRaw)]
        : [];

    const guid =
      e.objectGUID && Buffer.isBuffer(e.objectGUID)
        ? (e.objectGUID as unknown as Buffer).toString('hex')
        : pick(e.objectGUID) || pick(e.entryUUID) || e.dn;

    return {
      dn: e.dn,
      username: rawUsername || username,
      displayName: pick(e.displayName) || pick(e.cn) || rawUsername || username,
      email: pick(e.mail) || null,
      externalId: guid,
      memberOf,
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/** 域账号登录后同步组成员关系：memberOf DN 匹配本地组（按 external_dn），只增不删 */
function syncLdapMembership(userId: number, memberOf: string[]): void {
  if (!memberOf.length) return;
  const slots = memberOf.map(() => '?').join(',');
  const groups = db
    .prepare(`SELECT id FROM groups WHERE external_dn IN (${slots})`)
    .all(...(memberOf as never[])) as { id: number }[];
  if (!groups.length) return;
  const ins = db.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)'
  );
  tx(() => {
    for (const g of groups) ins.run(g.id, userId, now());
  });
}

export async function loginLdap(
  username: string,
  password: string,
  meta: SessionMeta = {}
): Promise<LoginResult> {
  const cfg = getLdapConfig();
  if (!cfg.enabled || !cfg.url || !cfg.baseDn) {
    throw AppError.unavailable('LDAP 登录未启用或未配置完整');
  }
  if (!password) {
    throw AppError.badRequest('请输入密码');
  }

  let attrs: LdapUserAttrs | null;
  try {
    attrs = await verifyLdapUser(cfg, username, password);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 目录服务不可达要和密码错误区分开
    if (/timeout|ECONNREFUSED|ENOTFOUND|certificate|socket/i.test(msg)) {
      throw AppError.unavailable(`无法连接目录服务：${msg}`);
    }
    throw AppError.unauthorized('域账号验证失败');
  }

  if (!attrs) {
    recordAudit({ username, action: 'auth.login_failed', detail: 'LDAP 未检索到用户', ip: meta.ip ?? null });
    throw AppError.unauthorized('用户名或密码错误');
  }

  // 自动开通域账号（企业内网默认全员工可登录），已存在则更新资料
  let user = getOne<User>(
    "SELECT * FROM users WHERE source = 'ldap' AND (external_id = ? OR username = ?)",
    [attrs.externalId, attrs.username]
  );
  if (user) {
    db.prepare(
      `UPDATE users SET display_name = ?, email = COALESCE(?, email), external_id = ?,
         is_active = 1, last_login_at = ?, updated_at = ? WHERE id = ?`
    ).run(attrs.displayName, attrs.email, attrs.externalId, now(), now(), user.id);
  } else {
    const info = db
      .prepare(
        `INSERT INTO users (username, display_name, email, source, external_id, is_admin, is_active, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, 'ldap', ?, 0, 1, ?, ?, ?)`
      )
      .run(attrs.username, attrs.displayName, attrs.email, attrs.externalId, now(), now(), now());
    user = loadActiveUser(Number(info.lastInsertRowid));
  }

  syncLdapMembership(user.id, attrs.memberOf);
  const fresh = loadActiveUser(user.id);
  recordAudit({ userId: user.id, username: user.username, action: 'auth.login', detail: '域账号登录', ip: meta.ip ?? null });
  return issueTokens(fresh, meta);
}

// ---------------------------------------------------------------------------
// OIDC 单点登录
// ---------------------------------------------------------------------------

async function buildOidcClient() {
  const cfg = getOidcConfig();
  if (!cfg.enabled || !cfg.issuer || !cfg.clientId) {
    throw AppError.unavailable('SSO 未启用或未配置完整');
  }
  const issuer = await Issuer.discover(cfg.issuer);
  const client = new issuer.Client({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uris: [cfg.redirectUri],
    response_types: ['code'],
  });
  return { cfg, client };
}

/** 生成授权跳转地址；state 由调用方放 httpOnly cookie，回调时比对 */
export async function buildOidcAuthUrl(): Promise<{ url: string; state: string }> {
  const { cfg, client } = await buildOidcClient();
  const state = require('node:crypto').randomBytes(16).toString('hex');
  const url = client.authorizationUrl({ scope: cfg.scope, state });
  return { url, state };
}

export async function loginOidc(
  query: { code?: string; state?: string; error?: string },
  cookieState: string | undefined,
  meta: SessionMeta = {}
): Promise<LoginResult> {
  if (query.error) {
    throw AppError.badRequest(`SSO 授权被拒绝：${query.error}`);
  }
  if (!query.code) throw AppError.badRequest('SSO 回调缺少授权码');
  // state 校验防 CSRF；cookie 缺失（如跨浏览器打开）视为校验失败
  if (!cookieState || !query.state || cookieState !== query.state) {
    throw AppError.badRequest('SSO 状态校验失败，请重新发起登录');
  }

  const { cfg, client } = await buildOidcClient();
  let claims: Record<string, unknown>;
  try {
    const tokenSet = await client.callback(cfg.redirectUri, { code: query.code, state: query.state }, { state: query.state });
    claims = (await client.userinfo(tokenSet.access_token as string)) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw AppError.badRequest(`SSO 登录失败：${msg}`);
  }

  const pick = (k: string): string => {
    const v = claims[k];
    return typeof v === 'string' ? v : '';
  };
  const externalId = pick('sub');
  if (!externalId) throw AppError.badRequest('SSO 返回信息缺少 sub 标识');
  const username =
    pick('preferred_username') || pick('username') || pick('nickname') || pick('email') || externalId;
  const displayName = pick('name') || username;
  const email = pick('email') || null;

  let user = getOne<User>(
    "SELECT * FROM users WHERE source = 'oidc' AND external_id = ?",
    [externalId]
  );
  if (!user) user = getOne<User>('SELECT * FROM users WHERE username = ?', [username]) ?? null;

  if (!user) {
    const allowRegistration = getSetting('site.allowRegistration') === 'true';
    if (!allowRegistration) {
      throw AppError.forbidden('SSO 账号尚未开通站点权限，请联系管理员');
    }
    const info = db
      .prepare(
        `INSERT INTO users (username, display_name, email, source, external_id, is_admin, is_active, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, 'oidc', ?, 0, 1, ?, ?, ?)`
      )
      .run(username, displayName, email, externalId, now(), now(), now());
    user = loadActiveUser(Number(info.lastInsertRowid));
  } else {
    db.prepare(
      `UPDATE users SET display_name = ?, email = COALESCE(?, email), external_id = ?,
         is_active = 1, last_login_at = ?, updated_at = ? WHERE id = ?`
    ).run(displayName, email, externalId, now(), now(), user.id);
  }

  const fresh = loadActiveUser(user.id);
  recordAudit({ userId: user.id, username: user.username, action: 'auth.login', detail: 'SSO 登录', ip: meta.ip ?? null });
  return issueTokens(fresh, meta);
}
