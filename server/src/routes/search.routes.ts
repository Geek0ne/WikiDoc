import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { searchDocuments, suggestTitles } from '../search/search.service';
import type { AuthRequest } from '../types';

/** 检索路由。频率限制防爬：每用户 30 秒 20 次 */
const router: Router = createRouter();
const searchLimiter = rateLimit({ windowMs: 30 * 1000, max: 20 });

router.get(
  '/search',
  requireAuth,
  searchLimiter,
  h((req: AuthRequest, res) => {
    const q = req.query as { q?: string; space_id?: string; scope?: string; page?: string; limit?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const scope =
      q.scope === 'title' || q.scope === 'body' || q.scope === 'code' ? q.scope : 'all';
    const result = searchDocuments(req.user!, req.groupIds ?? [], {
      query: q.q || '',
      spaceId: q.space_id !== undefined ? Number(q.space_id) : undefined,
      scope,
      page,
      limit,
    });
    ok(res, result);
  })
);

router.get(
  '/search/suggest',
  requireAuth,
  h((req: AuthRequest, res) => {
    const q = (req.query as { q?: string }).q || '';
    ok(res, { items: suggestTitles(req.user!, req.groupIds ?? [], q) });
  })
);

export default router;
