import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { AppError } from '../utils/errors';
import { ok, paged, buildPaged } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { parsePaging } from '../utils/response';
import {
  listUsers,
  getUserDetail,
  createUser,
  updateUser,
  deactivateUser,
  setUserGroups,
} from '../services/user.service';
import type { AuthRequest } from '../types';

/** 用户管理路由（管理端，全部 requireAdmin） */
const router: Router = createRouter();
router.use('/users', requireAuth, requireAdmin);

router.get(
  '/users',
  h((req: AuthRequest, res) => {
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const result = listUsers({
      keyword: (req.query.keyword as string) || undefined,
      source: (req.query.source as string) || undefined,
      active: req.query.active !== undefined ? Number(req.query.active) : undefined,
      page,
      limit,
      offset,
    });
    paged(res, buildPaged(result.items, result.total, page, limit));
  })
);

router.get(
  '/users/:id',
  h((req: AuthRequest, res) => {
    ok(res, getUserDetail(Number(req.params.id)));
  })
);

router.post(
  '/users',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      username?: string;
      display_name?: string;
      email?: string;
      password?: string;
      is_admin?: number;
    };
    if (!body.username || !body.password) throw AppError.badRequest('用户名与密码必填');
    const user = createUser(req.user!, {
      username: body.username,
      display_name: body.display_name || body.username,
      email: body.email ?? null,
      password: body.password,
      is_admin: body.is_admin === 1 ? 1 : 0,
    });
    ok(res, { user }, '用户已创建');
  })
);

router.put(
  '/users/:id',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      display_name?: string;
      email?: string | null;
      is_admin?: number;
      is_active?: number;
      password?: string;
    };
    const user = updateUser(req.user!, Number(req.params.id), body);
    ok(res, { user }, '用户已更新');
  })
);

router.delete(
  '/users/:id',
  h((req: AuthRequest, res) => {
    deactivateUser(req.user!, Number(req.params.id));
    ok(res, null, '用户已停用');
  })
);

router.put(
  '/users/:id/groups',
  h((req: AuthRequest, res) => {
    const { groupIds } = req.body as { groupIds?: number[] };
    setUserGroups(req.user!, Number(req.params.id), Array.isArray(groupIds) ? groupIds : []);
    ok(res, null, '所属组已更新');
  })
);

export default router;
