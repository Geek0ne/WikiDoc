import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';
import { AppError } from '../utils/errors';
import type { AuthRequest, User } from '../types';

/**
 * 鉴权中间件。access token 由前端在 Authorization 头携带。
 * refresh token 仅存 httpOnly cookie，不参与普通接口鉴权。
 */

export interface AccessPayload {
  sub: number;
  username: string;
  isAdmin: number;
}

export function signAccessToken(user: User): string {
  const payload: AccessPayload = { sub: user.id, username: user.username, isAdmin: user.is_admin };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.jwtRefreshSecret, {
    expiresIn: `${config.refreshTokenTtlDays}d` as jwt.SignOptions['expiresIn'],
  });
}

function readAccessToken(req: AuthRequest): AccessPayload | null {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.access_token as string | undefined);
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret) as unknown as AccessPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const payload = readAccessToken(req);
  if (!payload) return next(AppError.unauthorized());

  const user = db
    .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
    .get(payload.sub) as User | undefined;
  if (!user) return next(AppError.unauthorized('账号不存在或已停用'));

  req.user = user;
  req.groupIds = db
    .prepare('SELECT group_id FROM group_members WHERE user_id = ?')
    .all(user.id)
    .map((r) => (r as { group_id: number }).group_id);
  next();
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.is_admin) return next(AppError.forbidden('需要管理员权限'));
  next();
}

/** 可选鉴权：未登录也能访问，登录了则挂载用户信息（用于 public 文档） */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const payload = readAccessToken(req);
  if (!payload) return next();
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub) as
    | User
    | undefined;
  if (user) {
    req.user = user;
    req.groupIds = db
      .prepare('SELECT group_id FROM group_members WHERE user_id = ?')
      .all(user.id)
      .map((r) => (r as { group_id: number }).group_id);
  }
  next();
}
