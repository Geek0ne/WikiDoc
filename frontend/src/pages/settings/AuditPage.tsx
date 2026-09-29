import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Pagination, Select } from '../../components/ui';
import { Field } from '../../components/settings/SettingField';
import { Input } from '../../components/ui';
import { listAuditActions, listAuditLogs } from '../../api/admin';
import type { AuditLogRow } from '../../types/api';
import { NoAdminBlock } from './AppearancePage';

const PAGE_SIZE = 20;

/** 审计日志：分页 + 操作类型/关键词过滤 */
export default function AuditPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [keyword, setKeyword] = useState('');
  const [actions, setActions] = useState<string[]>([]);

  const load = useCallback(
    (p = 1) => {
      setRows(null);
      void listAuditLogs({ page: p, limit: PAGE_SIZE, action: action || undefined, keyword: keyword || undefined })
        .then((res) => {
          setRows(res.items);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
    },
    [action, keyword, t]
  );

  useEffect(() => {
    if (!isAdmin) return;
    void listAuditActions()
      .then((res) => setActions(res.items))
      .catch(() => setActions([]));
    load(1);
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) return <NoAdminBlock />;

  return (
    <div className="space-y-4">
      <h1 className="text-sm font-semibold">{t('settings.audit')}</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t('settings.allActions')}>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            options={[{ value: '', label: t('settings.allActions') }, ...actions.map((a) => ({ value: a, label: a }))]}
          />
        </Field>
        <Field label={t('settings.keyword')}>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
            placeholder={t('settings.keyword')}
          />
        </Field>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-bg-elevated text-2xs text-fg-muted">
              <th className="px-3 py-2 font-medium">{t('settings.auditTime')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.username')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.auditAction')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.auditDetail')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.auditIp')}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-2xs text-fg-muted">…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-2xs text-fg-muted">—</td>
              </tr>
            ) : (
              rows.map((log) => (
                <tr key={log.id} className="border-b border-line last:border-b-0 align-top hover:bg-bg-elevated">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-2xs text-fg-muted">{log.created_at}</td>
                  <td className="px-3 py-2 text-fg-secondary">{log.username ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-fg">{log.action}</td>
                  <td className="max-w-[280px] px-3 py-2 text-fg-secondary">{log.detail ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-2xs text-fg-muted">{log.ip ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={(p) => load(p)} />
    </div>
  );
}
