import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { AppError } from '../utils/errors';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import {
  listSpaces,
  getSpaceByKey,
  createSpace,
  updateSpace,
  deleteSpace,
} from '../services/space.service';
import { getDocTree } from '../services/document.service';
import { listAcl, replaceAcl } from '../services/acl.service';
import { resolveSpacePermission } from '../services/permission.service';
import type { AuthRequest, Visibility } from '../types';

/** 空间路由：:key 统一使用空间标识；管理操作校验空间管理权限 */
const router: Router = createRouter();
router.use('/spaces', requireAuth);

router.get(
  '/spaces',
  h((req: AuthRequest, res) => {
    ok(res, { items: listSpaces(req.user!, req.groupIds ?? []) });
  })
);

router.get(
  '/spaces/:key',
  h((req: AuthRequest, res) => {
    ok(res, getSpaceByKey(req.params.key, req.user!, req.groupIds ?? []));
  })
);

router.post(
  '/spaces',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      key?: string;
      name?: string;
      description?: string;
      icon?: string;
      visibility?: Visibility;
    };
    if (!body.key || !body.name) throw AppError.badRequest('空间标识与名称必填');
    const space = createSpace(req.user!, {
      key: body.key,
      name: body.name,
      description: body.description ?? null,
      icon: body.icon ?? null,
      visibility: body.visibility,
    });
    ok(res, { space }, '空间已创建');
  })
);

router.put(
  '/spaces/:id',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      name?: string;
      description?: string | null;
      icon?: string | null;
      visibility?: Visibility;
    };
    const space = updateSpace(req.user!, req.groupIds ?? [], Number(req.params.id), body);
    ok(res, { space }, '空间已更新');
  })
);

router.delete(
  '/spaces/:id',
  h((req: AuthRequest, res) => {
    deleteSpace(req.user!, Number(req.params.id));
    ok(res, null, '空间已删除');
  })
);

router.get(
  '/spaces/:id/tree',
  h((req: AuthRequest, res) => {
    ok(res, { tree: getDocTree(Number(req.params.id), req.user!, req.groupIds ?? []) });
  })
);

router.get(
  '/spaces/:id/acl',
  h((req: AuthRequest, res) => {
    ok(res, { entries: listAcl('space', Number(req.params.id)) });
  })
);

router.put(
  '/spaces/:id/acl',
  h((req: AuthRequest, res) => {
    const spaceId = Number(req.params.id);
    if ((resolveSpacePermission(req.user!.id, req.groupIds ?? [], spaceId) ?? 0) < 3) {
      throw AppError.forbidden('需要空间管理权限');
    }
    const { entries } = req.body as { entries?: Parameters<typeof replaceAcl>[3] };
    const result = replaceAcl(req.user!, 'space', spaceId, Array.isArray(entries) ? entries : []);
    ok(res, result, '空间权限已更新');
  })
);

export default router;
