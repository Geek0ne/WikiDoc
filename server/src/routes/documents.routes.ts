import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import {
  getDocument,
  getDocTree,
  listChildren,
  createDocument,
  updateDocument,
  moveDocument,
  deleteDocument,
  restoreDocument,
  listTrash,
  listVersions,
  getVersionContent,
  restoreVersion,
  listFavorites,
  toggleFavorite,
  recordView,
  listRecent,
} from '../services/document.service';
import { listAcl, replaceAcl } from '../services/acl.service';
import type { AuthRequest, Visibility } from '../types';

/**
 * 文档路由。树与列表挂在空间维度（见 spaces.routes），
 * 这里承载单篇文档的 CRUD、移动、回收站、版本、收藏与 ACL。
 */
const router: Router = createRouter();
router.use('/documents', requireAuth);

// 字面量路径必须先于 :id 注册，否则 "trash" 会被当作文档 id 匹配
router.get(
  '/documents/trash',
  h((req: AuthRequest, res) => {
    ok(res, { items: listTrash(req.user!, req.groupIds ?? []) });
  })
);

router.get(
  '/documents/:id',
  h((req: AuthRequest, res) => {
    ok(res, getDocument(req.user!, req.groupIds ?? [], Number(req.params.id)));
  })
);

router.get(
  '/documents/:id/children',
  h((req: AuthRequest, res) => {
    ok(res, { items: listChildren(req.user!, req.groupIds ?? [], Number(req.params.id)) });
  })
);

router.post(
  '/documents',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      space_id?: number;
      parent_id?: number | null;
      title?: string;
      content_md?: string;
      visibility?: Visibility;
      status?: 'draft' | 'published' | 'archived';
      sort_order?: number;
    };
    const doc = createDocument(req.user!, req.groupIds ?? [], {
      space_id: Number(body.space_id),
      parent_id: body.parent_id ?? null,
      title: body.title,
      content_md: body.content_md,
      visibility: body.visibility,
      status: body.status,
      sort_order: body.sort_order,
    });
    ok(res, { doc }, '文档已创建');
  })
);

router.put(
  '/documents/:id',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      title?: string;
      content_md?: string;
      visibility?: Visibility;
      status?: 'draft' | 'published' | 'archived';
      sort_order?: number;
      change_note?: string | null;
    };
    const doc = updateDocument(req.user!, req.groupIds ?? [], Number(req.params.id), body);
    ok(res, { doc }, '已保存');
  })
);

router.put(
  '/documents/:id/move',
  h((req: AuthRequest, res) => {
    const { parent_id } = req.body as { parent_id?: number | null };
    const doc = moveDocument(req.user!, req.groupIds ?? [], Number(req.params.id), parent_id ?? null);
    ok(res, { doc }, '文档已移动');
  })
);

router.delete(
  '/documents/:id',
  h((req: AuthRequest, res) => {
    const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
    deleteDocument(req.user!, req.groupIds ?? [], Number(req.params.id), permanent);
    ok(res, null, permanent ? '文档已彻底删除' : '文档已移入回收站');
  })
);

router.post(
  '/documents/:id/restore',
  h((req: AuthRequest, res) => {
    restoreDocument(req.user!, req.groupIds ?? [], Number(req.params.id));
    ok(res, null, '文档已恢复');
  })
);

router.get(
  '/documents/:id/versions',
  h((req: AuthRequest, res) => {
    ok(res, { items: listVersions(req.user!, req.groupIds ?? [], Number(req.params.id)) });
  })
);

router.get(
  '/documents/:id/versions/:version',
  h((req: AuthRequest, res) => {
    ok(res, getVersionContent(req.user!, req.groupIds ?? [], Number(req.params.id), Number(req.params.version)));
  })
);

router.post(
  '/documents/:id/versions/:version/restore',
  h((req: AuthRequest, res) => {
    const doc = restoreVersion(req.user!, req.groupIds ?? [], Number(req.params.id), Number(req.params.version));
    ok(res, { doc }, '已回滚');
  })
);

router.get(
  '/documents/:id/acl',
  h((req: AuthRequest, res) => {
    ok(res, { entries: listAcl('document', Number(req.params.id)) });
  })
);

router.put(
  '/documents/:id/acl',
  h((req: AuthRequest, res) => {
    const { entries } = req.body as { entries?: Parameters<typeof replaceAcl>[3] };
    const result = replaceAcl(req.user!, 'document', Number(req.params.id), Array.isArray(entries) ? entries : []);
    ok(res, result, '文档权限已更新');
  })
);

router.post(
  '/documents/:id/view',
  h((req: AuthRequest, res) => {
    recordView(req.user!.id, Number(req.params.id));
    ok(res, null);
  })
);

router.post(
  '/documents/:id/favorite',
  h((req: AuthRequest, res) => {
    ok(res, toggleFavorite(req.user!.id, Number(req.params.id)));
  })
);

router.get(
  '/favorites',
  requireAuth,
  h((req: AuthRequest, res) => {
    ok(res, { items: listFavorites(req.user!, req.groupIds ?? []) });
  })
);

router.get(
  '/recent',
  requireAuth,
  h((req: AuthRequest, res) => {
    ok(res, { items: listRecent(req.user!, req.groupIds ?? [], 10) });
  })
);

export default router;
