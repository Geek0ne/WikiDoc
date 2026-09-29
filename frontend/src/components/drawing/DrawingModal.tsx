import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { Button, ConfirmDialog, Input, Spinner } from '../ui';
import { toast } from '../../stores/toast';
import { createDrawing, deleteDrawing, listDrawings, updateDrawing } from '../../api/drawings';
import type { Drawing } from '../../types/api';
import { DrawingEditor, type DrawingEditorHandle } from './DrawingEditor';

interface DrawingModalProps {
  open: boolean;
  docId: number;
  onClose(): void;
  /** 插入 ```drawing:id``` 围栏到编辑器 */
  onInsert(drawingId: number): void;
  canWrite: boolean;
}

/** 画板管理弹窗：左侧列表 + 右侧编辑器，保存与插入引用 */
export function DrawingModal({ open, docId, onClose, onInsert, canWrite }: DrawingModalProps) {
  const { t } = useT();
  const [items, setItems] = useState<Drawing[] | null>(null);
  const [active, setActive] = useState<Drawing | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Drawing | null>(null);
  const [renaming, setRenaming] = useState<Drawing | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const editorRef = useRef<DrawingEditorHandle | null>(null);

  const load = useCallback(() => {
    setItems(null);
    listDrawings(docId)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [docId]);

  useEffect(() => {
    if (open) {
      load();
      setActive(null);
      setTitle('');
    }
  }, [open, load]);

  const openEditor = (drawing: Drawing | null): void => {
    setActive(drawing);
    setTitle(drawing?.title ?? '');
  };

  const save = async (): Promise<void> => {
    if (!editorRef.current || saving) return;
    setSaving(true);
    const svg = editorRef.current.getSvg();
    try {
      if (active) {
        const res = await updateDrawing(active.id, { title: title.trim() || active.title, svg });
        setItems((prev) => (prev ?? []).map((d) => (d.id === res.drawing.id ? res.drawing : d)));
        setActive(res.drawing);
      } else {
        const res = await createDrawing({ document_id: docId, title: title.trim() || undefined, svg });
        setItems((prev) => [res.drawing, ...(prev ?? [])]);
        setActive(res.drawing);
      }
      toast.success(t('toast.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await deleteDrawing(deleteTarget.id);
      setItems((prev) => (prev ?? []).filter((d) => d.id !== deleteTarget.id));
      if (active?.id === deleteTarget.id) openEditor(null);
      toast.success(t('toast.deleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setDeleteTarget(null);
    }
  };

  const doRename = async (): Promise<void> => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name || name === renaming.title) {
      setRenaming(null);
      return;
    }
    try {
      const res = await updateDrawing(renaming.id, { title: name });
      setItems((prev) => (prev ?? []).map((d) => (d.id === res.drawing.id ? res.drawing : d)));
      if (active?.id === res.drawing.id) setTitle(res.drawing.title);
      toast.success(t('toast.updated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setRenaming(null);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('drawing.insertDrawing')}>
          <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-bg shadow-[var(--shadow-overlay)]">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
              <h2 className="text-sm font-semibold">{t('drawing.insertDrawing')}</h2>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('common.close')}
              </Button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
              {/* 列表 */}
              <div className="min-h-0 overflow-y-auto border-b border-line p-2 md:border-b-0 md:border-r">
                {canWrite && (
                  <Button variant="secondary" size="sm" className="mb-2 w-full" disabled={creating} onClick={() => openEditor(null)}>
                    <Plus size={13} aria-hidden />
                    {t('drawing.newDrawing')}
                  </Button>
                )}
                {items === null ? (
                  <div className="flex justify-center py-6">
                    <Spinner size={18} />
                  </div>
                ) : items.length === 0 ? (
                  <p className="px-2 py-4 text-2xs leading-relaxed text-fg-muted">{t('drawing.drawingEmptyHint')}</p>
                ) : (
                  <ul className="space-y-0.5">
                    {items.map((d) => (
                      <li key={d.id} className={`group flex items-center gap-1 rounded px-2 py-1.5 transition-colors duration-150 ${active?.id === d.id ? 'bg-primary-soft' : 'hover:bg-hover'}`}>
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-xs" onClick={() => openEditor(d)}>
                          {d.title}
                        </button>
                        {canWrite && (
                          <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                            <button
                              type="button"
                              aria-label={t('drawing.rename')}
                              className="flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:text-fg"
                              onClick={() => {
                                setRenaming(d);
                                setRenameValue(d.title);
                              }}
                            >
                              <Pencil size={12} aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={t('common.delete')}
                              className="flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:text-danger"
                              onClick={() => setDeleteTarget(d)}
                            >
                              <Trash2 size={12} aria-hidden />
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 编辑区 */}
              <div className="flex min-h-0 flex-col">
                {items !== null && !active && !creating && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm font-medium text-fg-secondary">{t('drawing.drawingEmpty')}</p>
                    <p className="text-2xs text-fg-muted">{t('drawing.drawingEmptyHint')}</p>
                    {canWrite && (
                      <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                        <Plus size={13} aria-hidden />
                        {t('drawing.newDrawing')}
                      </Button>
                    )}
                  </div>
                )}
                {(active || creating) && (
                  <>
                    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('drawing.newDrawing')}
                        className="h-7 flex-1 text-xs"
                        aria-label={t('drawing.rename')}
                      />
                      {canWrite && (
                        <Button size="sm" disabled={saving} onClick={() => void save()}>
                          {saving ? t('editor.saving') : t('drawing.saveDrawing')}
                        </Button>
                      )}
                      {active && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            onInsert(active.id);
                            onClose();
                          }}
                        >
                          {t('drawing.insertToDoc')}
                        </Button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1">
                      <DrawingEditor
                        ref={editorRef}
                        key={active?.id ?? 'new'}
                        initialSvg={active?.svg}
                        width={active?.width ?? 800}
                        height={active?.height ?? 450}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('common.delete')}
        message={deleteTarget ? t('drawing.deleteConfirm', { title: deleteTarget.title }) : ''}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 重命名 */}
      {renaming && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-bg p-4 shadow-[var(--shadow-overlay)]">
            <h3 className="text-sm font-semibold">{t('drawing.rename')}</h3>
            <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void doRename()} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={() => void doRename()}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
