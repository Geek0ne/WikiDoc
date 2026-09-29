import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import {
  createDrawing,
  getDrawing,
  listDrawings,
  updateDrawing,
  deleteDrawing,
} from '../services/drawing.service';
import type { AuthRequest } from '../types';

/** 画板路由：SVG 源码的存取，渲染由前端完成 */
const router: Router = createRouter();
router.use('/drawings', requireAuth);

router.post(
  '/drawings',
  h((req: AuthRequest, res) => {
    const body = req.body as {
      document_id?: number | null;
      title?: string;
      svg?: string;
      width?: number;
      height?: number;
    };
    const drawing = createDrawing(req.user!, req.groupIds ?? [], body);
    ok(res, { drawing }, '画板已创建');
  })
);

router.get(
  '/drawings/:id',
  h((req: AuthRequest, res) => {
    ok(res, { drawing: getDrawing(req.user!, req.groupIds ?? [], Number(req.params.id)) });
  })
);

router.get(
  '/drawings',
  h((req: AuthRequest, res) => {
    const documentId = Number((req.query as { document_id?: string }).document_id);
    ok(res, { items: Number.isInteger(documentId) ? listDrawings(req.user!, req.groupIds ?? [], documentId) : [] });
  })
);

router.put(
  '/drawings/:id',
  h((req: AuthRequest, res) => {
    const body = req.body as { title?: string; svg?: string; width?: number; height?: number };
    const drawing = updateDrawing(req.user!, req.groupIds ?? [], Number(req.params.id), body);
    ok(res, { drawing }, '画板已保存');
  })
);

router.delete(
  '/drawings/:id',
  h((req: AuthRequest, res) => {
    deleteDrawing(req.user!, req.groupIds ?? [], Number(req.params.id));
    ok(res, null, '画板已删除');
  })
);

export default router;
