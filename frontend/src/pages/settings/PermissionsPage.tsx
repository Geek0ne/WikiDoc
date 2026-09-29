import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button } from '../../components/ui';
import { rebuildPermissions } from '../../api/admin';
import { NoAdminBlock } from './AppearancePage';

/** 权限运维：ACL 全量重算（仅异常场景使用） */
export default function PermissionsPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ documents: number; entries: number; elapsedMs: number } | null>(null);

  if (!isAdmin) return <NoAdminBlock />;

  const run = (): void => {
    setRunning(true);
    void rebuildPermissions()
      .then((res) => {
        setResult(res);
        toast.success(t('settings.rebuildDone', res));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')))
      .finally(() => setRunning(false));
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <ShieldCheck size={16} aria-hidden className="text-fg-muted" />
        <h1 className="text-sm font-semibold">{t('settings.permissions')}</h1>
      </header>
      <p className="rounded bg-bg-sunken px-3 py-2 text-2xs leading-relaxed text-fg-muted">{t('settings.rebuildHint')}</p>

      <div className="flex items-center gap-3">
        <Button disabled={running} onClick={run}>
          <RefreshCw size={13} aria-hidden className={running ? 'animate-spin' : ''} />
          {running ? '…' : t('settings.rebuild')}
        </Button>
        {result && (
          <p className="text-2xs tabular-nums text-fg-secondary">
            {result.documents} / {result.entries} / {result.elapsedMs}ms
          </p>
        )}
      </div>
    </div>
  );
}
