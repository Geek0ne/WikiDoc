import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { Client } from 'ldapts';
import { ok } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { recordAudit, AuditAction } from '../services/audit.service';
import {
  getPublicSettings,
  getSettings,
  setSettings,
  maskSensitive,
  getSmtpConfig,
  getLdapConfig,
  SECRET_MASK,
} from '../services/settings.service';
import { verifySmtp } from '../integrations/notifiers';

/**
 * 站点设置路由。GET 返回脱敏值（敏感键为 *** 掩码），
 * PUT 遇到掩码值自动跳过——管理员没改的密码不会被覆盖。
 */
const router: Router = createRouter();

router.get(
  '/settings/public',
  h((_req, res) => {
    ok(res, getPublicSettings());
  })
);

router.get(
  '/settings',
  requireAuth,
  requireAdmin,
  h((_req, res) => {
    ok(res, { settings: maskSensitive(getSettings()) });
  })
);

router.put(
  '/settings',
  requireAuth,
  requireAdmin,
  h((req, res) => {
    const patch = req.body as Record<string, string>;
    setSettings(patch);
    recordAudit({
      userId: (req as { user?: { id: number; username: string } }).user?.id ?? null,
      username: (req as { user?: { username?: string } }).user?.username ?? null,
      action: AuditAction.SETTINGS_UPDATE,
      detail: `更新站点设置（${Object.keys(patch).length} 项）`,
    });
    ok(res, { settings: maskSensitive(getSettings()) }, '设置已保存');
  })
);

router.post(
  '/settings/test/smtp',
  requireAuth,
  requireAdmin,
  h(async (req, res) => {
    const body = (req.body || {}) as { to?: string };
    // 允许用表单值即时测试（未保存的配置），否则用库中配置
    const override = Object.fromEntries(
      Object.entries((req.body || {}) as Record<string, unknown>).filter(
        ([k, v]) => k.startsWith('smtp.') && typeof v === 'string' && v !== SECRET_MASK && v !== ''
      )
    ) as Record<string, string>;
    if (Object.keys(override).length) setSettings(override);
    const smtp = getSmtpConfig();
    if (!smtp.host) {
      ok(res, { ok: false }, 'SMTP 未配置');
      return;
    }
    await verifySmtp(smtp);
    recordAudit({
      userId: (req as { user?: { id: number } }).user?.id ?? null,
      action: AuditAction.SETTINGS_TEST,
      detail: `SMTP 连接测试成功（${smtp.host}）`,
    });
    ok(res, { ok: true }, 'SMTP 连接成功');
    void body;
  })
);

router.post(
  '/settings/test/ldap',
  requireAuth,
  requireAdmin,
  h(async (_req, res) => {
    const cfg = getLdapConfig();
    if (!cfg.enabled || !cfg.url || !cfg.baseDn) {
      ok(res, { ok: false }, 'LDAP 未启用或未配置完整');
      return;
    }
    const client = new Client({ url: cfg.url, timeout: cfg.timeoutMs, connectTimeout: cfg.timeoutMs });
    try {
      await client.bind(cfg.bindDn || '', cfg.bindPassword || '');
      const { searchEntries } = await client.search(cfg.baseDn, { scope: 'sub', sizeLimit: 1 });
      recordAudit({
        userId: (_req as { user?: { id: number } }).user?.id ?? null,
        action: AuditAction.SETTINGS_TEST,
        detail: `LDAP 连接测试成功（${cfg.url}，示例条目 ${searchEntries.length}）`,
      });
      ok(res, { ok: true, sample: searchEntries.length }, 'LDAP 连接与检索成功');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  })
);

export default router;
