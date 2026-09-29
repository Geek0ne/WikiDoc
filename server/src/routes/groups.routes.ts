import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  listGroups,
  getGroupMembers,
  createGroup,
  updateGroup,
  deleteGroup,
  setGroupMembers,
  syncGroupsFromLdap,
} from '../services/group.service';
import type { AuthRequest } from '../types';

/**
 * 用户组路由。列表对所有登录用户开放（权限编辑器需要选组），
 * 增删改与 LDAP 同步仅管理员。
 */
const router: Router = createRouter();
router.use('/groups', requireAuth);

router.get(
  '/groups',
  h((req: AuthRequest, res) => {
    ok(res, { items: listGroups((req.query.keyword as string) || undefined) });
  })
);

router.get(
  '/groups/:id/members',
  h((req: AuthRequest, res) => {
    ok(res, { items: getGroupMembers(Number(req.params.id)) });
  })
);

router.post(
  '/groups',
  requireAdmin,
  h((req: AuthRequest, res) => {
    const { name, description } = req.body as { name?: string; description?: string };
    const group = createGroup(req.user!, { name: name || '', description: description ?? null });
    ok(res, group, '用户组已创建');
  })
);

router.put(
  '/groups/:id',
  requireAdmin,
  h((req: AuthRequest, res) => {
    const { name, description } = req.body as { name?: string; description?: string | null };
    updateGroup(req.user!, Number(req.params.id), { name, description });
    ok(res, null, '用户组已更新');
  })
);

router.delete(
  '/groups/:id',
  requireAdmin,
  h((req: AuthRequest, res) => {
    deleteGroup(req.user!, Number(req.params.id));
    ok(res, null, '用户组已删除');
  })
);

router.put(
  '/groups/:id/members',
  requireAdmin,
  h((req: AuthRequest, res) => {
    const { userIds } = req.body as { userIds?: number[] };
    setGroupMembers(req.user!, Number(req.params.id), Array.isArray(userIds) ? userIds : []);
    ok(res, null, '组成员已更新');
  })
);

router.post(
  '/groups/sync',
  requireAdmin,
  h(async (req: AuthRequest, res) => {
    const result = await syncGroupsFromLdap(req.user!);
    ok(res, result, '同步完成');
  })
);

export default router;
