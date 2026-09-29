import type { Router } from 'express';
import type { Response } from 'express';
import { Router as createRouter } from 'express';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { clientIp } from '../services/audit.service';
import { sanitizeUser, updateProfile, changeOwnPassword } from '../services/user.service';
import {
  loginLocal,
  loginLdap,
  logout,
  rotateRefresh,
  buildOidcAuthUrl,
  loginOidc,
} from '../services/auth.service';
import { getPublicSettings } from '../services/settings.service';
import type { AuthRequest } from '../types';

/**
 * 认证路由。refresh token 走 httpOnly cookie（path 限定 /api/auth），
 * access token 随响应体返回由前端内存保存。
 */

const router: Router = createRouter();
const REFRESH_COOKIE = 'wikidoc_refresh';
const STATE_COOKIE = 'wikidoc_sso_state';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/api/auth',
    maxAge: config.refreshTokenTtlDays * 86400_000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

/** 登录方式清单，登录页据此渲染 */
router.get('/auth/providers', (_req, res) => {
  ok(res, getPublicSettings().loginProviders);
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post(
  '/auth/login',
  loginLimiter,
  h(async (req: AuthRequest, res) => {
    const { username, password, type } = req.body as {
      username?: string;
      password?: string;
      type?: string;
    };
    if (!username || !password) throw AppError.badRequest('请输入用户名和密码');

    // type 缺省时先按本地验，本地账号不存在且 LDAP 开启时转域验证
    const providers = getPublicSettings().loginProviders;
    let result;
    if (type === 'ldap') {
      result = await loginLdap(username, password, {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
      });
    } else if (type === 'local') {
      result = loginLocal(username, password, {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
      });
    } else {
      try {
        result = loginLocal(username, password, {
          ip: clientIp(req),
          userAgent: req.headers['user-agent'] ?? null,
        });
      } catch (err) {
        const isCredentialIssue = err instanceof AppError && err.status === 401;
        if (isCredentialIssue && providers.ldap) {
          result = await loginLdap(username, password, {
            ip: clientIp(req),
            userAgent: req.headers['user-agent'] ?? null,
          });
        } else {
          throw err;
        }
      }
    }

    setRefreshCookie(res, result.refreshToken);
    ok(res, { user: sanitizeUser(result.user), accessToken: result.accessToken }, '登录成功');
  })
);

router.post(
  '/auth/refresh',
  h((req: AuthRequest, res) => {
    const result = rotateRefresh(req.cookies?.[REFRESH_COOKIE] as string | undefined, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    setRefreshCookie(res, result.refreshToken);
    ok(res, { user: sanitizeUser(result.user), accessToken: result.accessToken });
  })
);

router.post(
  '/auth/logout',
  h((req: AuthRequest, res) => {
    logout(req.cookies?.[REFRESH_COOKIE] as string | undefined, { ip: clientIp(req) });
    clearRefreshCookie(res);
    ok(res, null, '已退出登录');
  })
);

router.get(
  '/auth/me',
  requireAuth,
  h((req: AuthRequest, res) => {
    ok(res, { user: sanitizeUser(req.user!), groupIds: req.groupIds ?? [] });
  })
);

router.put(
  '/auth/profile',
  requireAuth,
  h((req: AuthRequest, res) => {
    const { display_name, email } = req.body as { display_name?: string; email?: string };
    const user = updateProfile(req.user!.id, { display_name, email });
    ok(res, { user });
  })
);

router.put(
  '/auth/password',
  requireAuth,
  h((req: AuthRequest, res) => {
    const { old_password, new_password } = req.body as {
      old_password?: string;
      new_password?: string;
    };
    changeOwnPassword(req.user!.id, old_password || '', new_password || '', clientIp(req));
    clearRefreshCookie(res); // 改密已吊销全部会话，前端引导重新登录
    ok(res, null, '密码已修改，请重新登录');
  })
);

// ---------------------------------------------------------------------------
// OIDC 单点登录
// ---------------------------------------------------------------------------

router.get(
  '/auth/sso/url',
  h(async (_req, res) => {
    const { url, state } = await buildOidcAuthUrl();
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/api/auth',
      maxAge: 10 * 60 * 1000,
    });
    ok(res, { url });
  })
);

router.get(
  '/auth/sso/callback',
  h(async (req: AuthRequest, res) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    const base = config.publicUrl.replace(/\/+$/, '');
    try {
      const result = await loginOidc(query, req.cookies?.[STATE_COOKIE] as string | undefined, {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] ?? null,
      });
      setRefreshCookie(res, result.refreshToken);
      // 前端为 hash 路由，回跳后凭 cookie 静默换取 access token
      res.redirect(`${base}/#/sso-done`);
    } catch (err) {
      clearRefreshCookie(res);
      const msg = err instanceof Error ? err.message : 'SSO 登录失败';
      res.redirect(`${base}/#/login?sso_error=${encodeURIComponent(msg)}`);
    }
  })
);

export default router;
