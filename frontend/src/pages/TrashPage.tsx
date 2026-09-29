import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { toast } from '../stores/toast';
import * as documentsApi from '../api/documents';
import type { TrashItem } from '../types/api';
import { Button, ConfirmDialog, Empty, Spinner, Tooltip } from '../components/ui';

/** 回收站：软删除文档列表，恢复或彻底删除 */
export default function TrashPage() {
  const { t } = useT();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<TrashItem | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await documentsApi.listTrash();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
      setItems([]);
    }
  }, [t]);

  useEffect(() => void load(), [load]);

  const restore = async (item: TrashItem): Promise<void> => {
    setBusyId(item.id);
    try {
      await documentsApi.restoreDocument(item.id);
      toast.success(t('toast.restored'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setBusyId(null);
    }
  };

  const permanentDelete = async (item: TrashItem): Promise<void> => {
    setBusyId(item.id);
    try {
      await documentsApi.deleteDocument(item.id, true);
      toast.success(t('toast.deleted'));
      setPermanentTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (iso: string | null): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <header className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">{t('trash.title')}</h1>
          <p className="mt-1 text-2xs text-fg-muted">{t('trash.emptyHint')}</p>
        </header>

        {items === null ? (
          <div className="flex justify-center py-14">
            <Spinner size={22} />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-danger">{error}</p>
        ) : items.length === 0 ? (
          <Empty title={t('trash.empty')} hint={t('trash.emptyHint')} />
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line bg-elevated">
            {items.map((item, i) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {item.space_name} · {t('trash.timeCol')} {fmt(item.deleted_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === item.id}
                    onClick={() => void restore(item)}
                  >
                    <RotateCcw size={13} aria-hidden />
                    {t('trash.restore')}
                  </Button>
                  <Tooltip content={t('trash.deleteForever')}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => setPermanentTarget(item)}
                      aria-label={t('trash.deleteForever')}
                    >
                      <Trash2 size={13} aria-hidden />
                    </Button>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={permanentTarget !== null}
        title={t('trash.deleteForever')}
        message={t('trash.deleteForeverConfirm', { title: permanentTarget?.title ?? '' })}
        danger
        loading={busyId === permanentTarget?.id}
        onConfirm={() => permanentTarget && void permanentDelete(permanentTarget)}
        onCancel={() => setPermanentTarget(null)}
      />
    </div>
  );
}
