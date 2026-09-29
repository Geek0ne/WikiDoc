import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Columns2, Eye, FileText, ListTree, Pencil, Save, ShieldAlert } from 'lucide-react';
import { useT } from '../i18n';
import { Button, Modal, Spinner, Textarea } from '../components/ui';
import { toast } from '../stores/toast';
import { createMarkdownEditor, type EditorHandle } from '../components/editor/cmSetup';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { getDocument, updateDocument } from '../api/documents';
import { uploadAttachment } from '../api/attachments';
import { ApiError } from '../api/client';
import { renderMarkdown, bindCodeCopy, bindDrawingEmbeds, parseMarkdownToc, type TocItem } from '../lib/markdown';
import type { DocumentDetail } from '../types/api';

type ViewMode = 'split' | 'edit' | 'preview';

const AUTO_SAVE_DELAY = 3000;

/**
 * 文档编辑页：CodeMirror 源码编辑 + 实时预览。
 * 自动保存（停笔 3s）与手动保存（Ctrl+S / 版本说明）共用 PUT 接口。
 */
export default function EditorPage() {
  const { t } = useT();
  const { key = '', docId } = useParams();
  const id = Number(docId);

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ViewMode>('split');
  const [noteOpen, setNoteOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const editorRef = useRef<EditorHandle | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const contentRef = useRef('');

  dirtyRef.current = dirty;
  contentRef.current = content;

  const canWrite = (detail?.my_permission ?? 0) >= 2;
  const toc: TocItem[] = useMemo(() => parseMarkdownToc(content), [content]);

  /* ---------- 加载文档 ---------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    getDocument(id)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        setTitle(res.doc.title);
        setContent(res.doc.content_md ?? '');
        setDirty(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else toast.error(err instanceof Error ? err.message : t('toast.networkError'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  /* ---------- 编辑器生命周期 ---------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || loading || !canWrite) return;
    const handle = createMarkdownEditor({
      parent: host,
      initialValue: contentRef.current,
      onChange: (value) => {
        setContent(value);
        setDirty(true);
      },
      onSave: () => {
        setNoteOpen(true);
        return true;
      },
    });
    editorRef.current = handle;
    return () => {
      handle.view.destroy();
      editorRef.current = null;
    };
    // 仅在拿到文档且可写后创建一次；内容更新走 dispatch，不重建实例
  }, [loading, canWrite]);

  /* ---------- 保存 ---------- */
  const persist = useCallback(
    async (note: string | null) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await updateDocument(id, {
          title: title.trim() || undefined,
          content_md: contentRef.current,
          change_note: note,
        });
        setDirty(false);
        if (note) toast.success(t('editor.autoSaved'));
        else toast.success(t('toast.saved'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          toast.error(t('toast.forbidden'));
          setForbidden(true);
        } else {
          toast.error(err instanceof Error ? err.message : t('toast.networkError'));
        }
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [id, title, t]
  );

  // 停笔 3s 自动保存
  useEffect(() => {
    if (!dirty || !canWrite) return;
    const timer = window.setTimeout(() => void persist('自动保存'), AUTO_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [content, dirty, canWrite, persist]);

  // 编辑器之外的 Ctrl+S（预览区/标题聚焦时）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setNoteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 有未保存修改时拦一下页面关闭
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /* ---------- 图片上传 → 插入引用 ---------- */
  const handleUploadImage = useCallback(
    (file: File) => {
      setUploading(true);
      uploadAttachment(file, id)
        .then(({ attachment }) => {
          const alt = attachment.filename.replace(/\.[^.]+$/, '');
          editorRef.current?.insertSnippet(`![${alt}](/api/attachments/${attachment.id}/raw)`);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : t('editor.uploadFailed')))
        .finally(() => setUploading(false));
    },
    [id, t]
  );

  /* ---------- 预览渲染与增强 ---------- */
  const html = useMemo(
    () => (mode === 'edit' ? '' : renderMarkdown(content)),
    [mode, content]
  );

  useEffect(() => {
    const container = previewRef.current;
    if (!container || !html) return;
    const offCopy = bindCodeCopy(container);
    const offDrawings = bindDrawingEmbeds(container);
    return () => {
      offCopy();
      offDrawings();
    };
  }, [html]);

  const scrollToHeading = (anchor: string) => {
    if (!previewRef.current) return;
    const target = previewRef.current.querySelector(`#${CSS.escape(anchor)}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ---------- 各视图 ---------- */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (forbidden || !canWrite) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldAlert size={28} aria-hidden className="text-fg-muted" />
        <h1 className="text-base font-semibold">{t('editor.noWritePerm')}</h1>
        <p className="max-w-sm text-2xs leading-relaxed text-fg-muted">{t('editor.noWriteHint')}</p>
        <Link to={`/s/${key}/d/${docId ?? ''}`}>
          <Button variant="secondary">{t('common.back')}</Button>
        </Link>
      </div>
    );
  }

  const showEditor = mode !== 'preview';
  const showPreview = mode !== 'edit';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏：返回 / 标题 / 状态 / 视图切换 / 保存 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Link
          to={`/s/${key}/d/${docId ?? ''}`}
          className="flex shrink-0 items-center gap-1 text-2xs text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          <ArrowLeft size={13} aria-hidden />
          {t('doc.backToSpace')}
        </Link>
        <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          aria-label={t('editor.editTitle')}
          className="min-w-0 flex-1 truncate rounded border-none bg-transparent text-sm font-semibold text-fg outline-none transition-colors duration-150 focus:bg-hover focus:px-2"
        />
        <span className="shrink-0 text-2xs text-fg-muted" aria-live="polite">
          {saving ? t('editor.saving') : dirty ? t('editor.unsavedHint') : ''}
        </span>
        <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />
        <div className="flex shrink-0 items-center rounded border border-line p-0.5" role="tablist" aria-label="视图切换">
          {(
            [
              { value: 'edit', icon: <Pencil size={13} aria-hidden />, label: t('editor.editOnly') },
              { value: 'split', icon: <Columns2 size={13} aria-hidden />, label: t('editor.splitView') },
              { value: 'preview', icon: <Eye size={13} aria-hidden />, label: t('editor.previewOnly') },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={mode === item.value}
              onClick={() => setMode(item.value)}
              className={`flex h-6 w-7 items-center justify-center rounded transition-colors duration-150 ${
                mode === item.value ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <Button size="sm" disabled={saving || !dirty} onClick={() => setNoteOpen(true)}>
          <Save size={14} aria-hidden />
          {t('editor.saveWithNote')}
        </Button>
      </div>

      <EditorToolbar onInsert={(s, off) => editorRef.current?.insertSnippet(s, off)} onUploadImage={handleUploadImage} uploading={uploading} />

      {/* 主体：编辑 | 预览 + 大纲 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_200px]">
        <div className={`grid min-h-0 ${mode === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} divide-line md:divide-x`}>
          {showEditor && (
            <div className="min-h-0 overflow-hidden bg-elevated">
              <div ref={hostRef} className="h-full" />
            </div>
          )}
          {showPreview && (
            <div className="min-h-0 overflow-y-auto">
              <div
                ref={previewRef}
                className="wiki-prose mx-auto max-w-3xl px-6 py-6"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )}
        </div>

        {/* 大纲侧栏 */}
        <aside className="hidden min-h-0 overflow-y-auto border-l border-line p-3 xl:block" aria-label={t('editor.outline')}>
          <p className="mb-2 flex items-center gap-1 px-1 text-2xs font-medium uppercase tracking-wider text-fg-muted">
            <ListTree size={12} aria-hidden />
            {t('editor.outline')}
          </p>
          {toc.length === 0 ? (
            <p className="px-1 text-2xs text-fg-muted">{t('editor.noOutline')}</p>
          ) : (
            <ul className="space-y-0.5">
              {toc.map((item, i) => (
                <li key={`${item.id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => scrollToHeading(item.id)}
                    style={{ paddingLeft: `${(item.level - 1) * 10 + 4}px` }}
                    className="block w-full truncate rounded px-1 py-1 text-left text-2xs text-fg-secondary transition-colors duration-150 hover:bg-hover hover:text-fg"
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* 手动保存：版本说明 */}
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title={t('editor.saveWithNote')}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="change-note" className="text-2xs font-medium text-fg-secondary">
              {t('editor.changeNote')}
            </label>
            <Textarea
              id="change-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder={t('editor.changeNotePlaceholder')}
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setNoteOpen(false);
                void persist(changeNote.trim() || null);
                setChangeNote('');
              }}
            >
              <FileText size={14} aria-hidden />
              {saving ? t('editor.saving') : t('editor.saveWithNote')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
