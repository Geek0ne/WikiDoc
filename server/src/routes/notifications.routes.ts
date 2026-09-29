import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { ok, paged, buildPaged, parsePaging } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  listSubscriptions,
  replaceSubscriptions,
  listLogs,
  NOTIFY_EVENTS,
} from '../services/channel.service';
import { sendTest } from '../services/notify.service';
import type { AuthRequest } from '../types';

/**
 * 通知路由：渠道管理（管理员）+ 个人订阅 + 发送日志（管理员）。
 * 渠道 config 里的敏感键（webhook/密钥）由 channel.service 负责加密与掩码。
 */
const router: Router = createRouter();

router.get(
  '/notifications/events',
  requireAuth,
  h((_req, res) => {
    ok(res, { items: NOTIFY_EVENTS });
  })
);

router.get(
  '/notifications/channels',
  requireAuth,
  requireAdmin,
  h((_req, res) => {
    ok(res, { items: listChannels() });
  })
);

router.post(
  '/notifications/channels',
  requireAuth,
  requireAdmin,
  h((req: AuthRequest, res) => {
    const body = req.body as { name?: string; type?: 'wecom' | 'feishu' | 'email'; config?: Record<string, string>; enabled?: boolean };
    const channel = createChannel({
      name: body.name || '',
      type: body.type || 'wecom',
      config: body.config || {},
      enabled: body.enabled !== false,
    });
    ok(res, { channel }, '通知渠道已创建');
  })
);

router.put(
  '/notifications/channels/:id',
  requireAuth,
  requireAdmin,
  h((req: AuthRequest, res) => {
    const body = req.body as {
      name?: string;
      config?: Record<string, string>;
      enabled?: boolean;
    };
    const channel = updateChannel(Number(req.params.id), body);
    ok(res, { channel }, '通知渠道已更新');
  })
);

router.delete(
  '/notifications/channels/:id',
  requireAuth,
  requireAdmin,
  h((req: AuthRequest, res) => {
    deleteChannel(Number(req.params.id));
    ok(res, null, '通知渠道已删除');
  })
);

router.post(
  '/notifications/channels/:id/test',
  requireAuth,
  requireAdmin,
  h(async (req: AuthRequest, res) => {
    const result = await sendTest(Number(req.params.id), req.user!.username);
    ok(res, result, result.ok ? '测试消息已发送' : '测试发送失败，详见日志');
  })
);

router.get(
  '/notifications/subscriptions',
  requireAuth,
  h((req: AuthRequest, res) => {
    ok(res, { items: listSubscriptions(req.user!.id) });
  })
);

router.put(
  '/notifications/subscriptions',
  requireAuth,
  h((req: AuthRequest, res) => {
    const { items } = req.body as { items?: { channelId: number; eventType: string; enabled?: boolean }[] };
    const saved = replaceSubscriptions(req.user!.id, Array.isArray(items) ? items : []);
    ok(res, { items: saved }, '订阅已更新');
  })
);

router.get(
  '/notifications/logs',
  requireAuth,
  requireAdmin,
  h((req: AuthRequest, res) => {
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const result = listLogs({ page, limit, offset });
    paged(res, buildPaged(result.items, result.total, page, limit));
  })
);

export default router;
