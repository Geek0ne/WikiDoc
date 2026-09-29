import { useCallback, useEffect, useState } from 'react';
import { Database, HardDriveDownload, Loader2 } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button } from '../../components/ui';
import { createBackup, getStats, listBackups } from '../../api/admin';
import { NoAdminBlock } from './AppearancePage';

type Stats = Awaited<ReturnType<typeof getStats>>;
type BackupItem = { file: string; size: number; created_at: string };

function fmtSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** 备份与统计：站点统计概览 + 立即备份 + 备份产物列表 */
export default function BackupPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [stats, setStats] = useState<Stats | null>(null);
  const [files, setFiles] = useState<BackupItem[] | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    void getStats().then(setStats).catch(() => setStats(null));
    void listBackups()
      .then((res) => setFiles(res.items))
      .catch(() => setFiles([]));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) return <NoAdminBlock />;

  const backupNow = (): void => {
    setRunning(true);
    void createBackup()
      .then((res) => {
        if (res.file) toast.success(t('backup.backupDone', { file: res.file }));
        load();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')))
      .finally(() => setRunning(false));
  };

  const cards: { label: string; value: string }[] = stats
    ? [
        { label: t('backup.statUsers'), value: String(stats.users) },
        { label: t('backup.statGroups'), value: String(stats.groups) },
        { label: t('backup.statSpaces'), value: String(stats.spaces) },
        { label: t('backup.statDocs'), value: String(stats.documents) },
        { label: t('backup.statAttachments'), value: String(stats.attachments) },
        { label: t('backup.statAttachmentSize'), value: fmtSize(stats.attachmentBytes) },
        { label: t('backup.statAuditLogs'), value: String(stats.auditLogs) },
      ]
    : [];

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Database size={16} aria-hidden className="text-fg-muted" />
        <h1 className="text-sm font-semibold">{t('settings.backup')}</h1>
      </header>

      <section>
        <h2 className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-muted">{t('backup.statTitle')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cards.length === 0
            ? Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="rounded-lg border border-line bg-elevated px-3 py-2.5">
                  <div className="h-3 w-14 animate-pulse rounded bg-hover" />
                  <div className="mt-1.5 h-5 w-8 animate-pulse rounded bg-hover" />
                </div>
              ))
            : cards.map((c) => (
                <div key={c.label} className="rounded-lg border border-line bg-elevated px-3 py-2.5">
                  <p className="text-2xs text-fg-muted">{c.label}</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-fg">{c.value}</p>
                </div>
              ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xs font-medium uppercase tracking-wider text-fg-muted">{t('backup.backupFiles')}</h2>
          <Button disabled={running} onClick={backupNow}>
            {running ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <HardDriveDownload size={13} aria-hidden />}
            {running ? '…' : t('backup.backupNow')}
          </Button>
        </div>

        {files === null ? (
          <div className="rounded-lg border border-line px-3 py-6 text-center text-2xs text-fg-muted">…</div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-8 text-center">
            <p className="text-xs text-fg-secondary">{t('backup.backupEmpty')}</p>
            <p className="mt-1 text-2xs text-fg-muted">{t('backup.backupEmptyHint')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <tbody>
                {files.map((f) => (
                  <tr key={f.file} className="border-b border-line last:border-b-0 hover:bg-bg-elevated">
                    <td className="px-3 py-2 font-mono text-2xs text-fg">{f.file}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg-secondary">{fmtSize(f.size)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-2xs text-fg-muted">{f.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
