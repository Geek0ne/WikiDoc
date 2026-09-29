import fs from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { Router as createRouter } from 'express';
import { db, getOne } from '../db';
import { config } from '../config';
import { ok, paged, buildPaged, parsePaging } from '../utils/response';
import { h } from '../utils/handler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { listAuditLogs, listAuditActions, recordAudit, AuditAction, clientIp } from '../services/audit.service';
import { rebuildAllAcl } from '../services/permission.service';
import { attachmentDiskUsage } from '../services/attachment.service';
import type { AuthRequest } from '../types';

/** 管理端杂项：审计日志、权限重算、站点统计、数据库备份 */
const router: Router = createRouter();
router.use('/admin', requireAuth, requireAdmin);

router.get(
  '/admin/audit',
  h((req: AuthRequest, res) => {
    const { page, limit, offset } = parsePaging(req.query as Record<string, unknown>);
    const q = req.query as { action?: string; user_id?: string; keyword?: string };
    const result = listAuditLogs({
      page,
      limit,
      offset,
      action: q.action || undefined,
      userId: q.user_id !== undefined ? Number(q.user_id) : undefined,
      keyword: q.keyword || undefined,
    });
    paged(res, buildPaged(result.items, result.total, page, limit));
  })
);

router.get(
  '/admin/audit/actions',
  h((_req, res) => {
    ok(res, { items: listAuditActions() });
  })
);

router.post(
  '/admin/permissions/rebuild',
  h((req: AuthRequest, res) => {
    const result = rebuildAllAcl();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: AuditAction.PERMISSION_REBUILD,
      detail: `手动重算权限：${result.documents} 文档 / ${result.entries} 条授权 / ${result.elapsedMs}ms`,
      ip: clientIp(req),
    });
    ok(res, result, '权限重算完成');
  })
);

router.get(
  '/admin/stats',
  h((_req, res) => {
    const count = (sql: string): number =>
      (getOne<{ c: number }>(sql) as { c: number }).c ?? 0;
    ok(res, {
      users: count('SELECT COUNT(*) AS c FROM users WHERE is_active = 1'),
      groups: count('SELECT COUNT(*) AS c FROM groups'),
      spaces: count('SELECT COUNT(*) AS c FROM spaces'),
      documents: count('SELECT COUNT(*) AS c FROM documents WHERE deleted_at IS NULL'),
      attachments: count('SELECT COUNT(*) AS c FROM attachments'),
      attachmentBytes: attachmentDiskUsage(),
      auditLogs: count('SELECT COUNT(*) AS c FROM audit_logs'),
    });
  })
);

router.post(
  '/admin/backup',
  h(async (req: AuthRequest, res) => {
    const backupDir = path.join(config.dataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const target = path.join(backupDir, `wikidoc-${stamp}.db`);

    try {
      // better-sqlite3 在线备份：不阻塞主连接，WAL 下安全
      await db.backup(target);
      const size = fs.statSync(target).size;
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: AuditAction.BACKUP,
        detail: `数据库备份 ${path.basename(target)}（${Math.round(size / 1024)}KB）`,
      });
      ok(res, { file: path.basename(target), size }, '备份完成');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: AuditAction.BACKUP,
        detail: `备份失败：${message}`,
      });
      ok(res, { file: null }, `备份失败：${message}`);
    }
  })
);

router.get(
  '/admin/backups',
  h((_req, res) => {
    const backupDir = path.join(config.dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      ok(res, { items: [] });
      return;
    }
    const items = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(backupDir, f));
        return { file: f, size: st.size, created_at: st.mtime.toISOString() };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    ok(res, { items });
  })
);

export default router;
