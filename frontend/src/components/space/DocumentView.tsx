import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Eye,
  FileUp,
  History,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Star,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { useT } from '../../i18n';
import { toast } from '../../stores/toast';
import { ApiError } from '../../api/client';
import * as documentsApi from '../../api/documents';
import * as attachmentsApi from '../../api/attachments';
import { bindCodeCopy, extractToc, renderMarkdown, type TocItem } from '../../lib/markdown';
import type {
  Attachment,
  DocumentDetail,
  VersionContent,
  VersionRow,
} from '../../types/api';
import {
  Button,
  ConfirmDialog,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  Empty,
  Modal,
  Spinner,
  Tooltip,
} from '../ui';
import { AclModal } from './AclModal';

export interface DocumentViewProps {
  docId: number;
  spaceKey: string;
  spaceName?: string;
  /** 通知外层刷新树 */
  onChanged?: () => void;
  /** 进入编辑路由 */
  onEdit?: (docId: number) => void;
  /** 删除后外跳 */
  onDeleted?: () => void;
}

/** 文档阅读视图：面包屑 + Markdown 渲染 + 自动目录 + 版本历史 + 附件 */
export function DocumentView({ docId, spaceKey, spaceName, onChanged, onEdit, onDeleted }: DocumentViewProps) {
  const { t } = useT();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [aclOpen, setAclOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const d = await documentsApi.getDocument(docId);
      setDetail(d);
      // 上报浏览（最近列表数据源），失败静默
      void documentsApi.recordView(docId).catch(() => undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('doc.notFound'));
      setDetail(null);
    }
  }, [docId, t]);

  useEffect(() => void load(), [load]);

  // 收藏状态
  useEffect(() => {
    let cancelled = false;
    void documentsApi
      .listFavorites()
      .then((res) => {
        if (!cancelled) setFavorited(res.items.some((d) => d.id === docId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const toggleFav = async (): Promise<void> => {
    try {
      const res = await documentsApi.toggleFavorite(docId);
      setFavorited(res.favorited);
      toast.success(res.favorited ? t('toast.favoriteOn') : t('toast.favoriteOff'));
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 403 ? t('toast.forbidden') : err instanceof Error ? err.message : t('toast.networkError'));
    }
  };

  const moveToTrash = async (): Promise<void> => {
    try {
      await documentsApi.deleteDocument(docId, false);
      toast.success(t('toast.deleted'));
      setTrashOpen(false);
      onChanged?.();
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('toast.networkError'));
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty title={t('doc.notFound')} hint={loadError}
          action={<Link to={`/s/${spaceKey}`} className="text-sm text-primary hover:underline">{t('doc.backToSpace')}</Link>} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  const { doc, my_permission: myPermission, breadcrumb } = detail;
  const canWrite = myPermission >= 2;
  const canManage = myPermission >= 3;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 面包屑 + 操作 */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-4 md:px-8">
        <nav aria-label="breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-2xs text-fg-muted">
          <Link to={`/s/${spaceKey}`} className="shrink-0 transition-colors duration-150 hover:text-fg">
            {spaceName ?? spaceKey}
          </Link>
          {breadcrumb.map((bc) => (
            <span key={bc.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight size={11} aria-hidden className="shrink-0" />
              <Link to={`/s/${spaceKey}/d/${bc.id}`} className="truncate transition-colors duration-150 hover:text-fg">
                {bc.title}
              </Link>
            </span>
          ))}
          <ChevronRight size={11} aria-hidden className="shrink-0" />
          <span className="truncate text-fg">{doc.title || t('doc.untitled')}</span>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content={favorited ? t('doc.unfavorite') : t('doc.favorite')}>
            <button
              type="button"
              onClick={() => void toggleFav()}
              aria-label={favorited ? t('doc.unfavorite') : t('doc.favorite')}
              className="flex h-8 w-8 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
            >
              <Star size={15} aria-hidden className={favorited ? 'fill-warning text-warning' : ''} />
            </button>
          </Tooltip>
          {canWrite && (
            <Tooltip content={t('doc.edit')}>
              <button
                type="button"
                aria-label={t('doc.edit')}
                onClick={() => (onEdit ? onEdit(doc.id) : navigate(`/s/${spaceKey}/d/${doc.id}/edit`))}
                className="flex h-8 w-8 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
              >
                <Pencil size={15} aria-hidden />
              </button>
            </Tooltip>
          )}
          <Dropdown
            align="right"
            trigger={(open) => (
              <button
                type="button"
                aria-label={t('common.more')}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 hover:bg-hover ${open ? 'bg-hover text-fg' : 'text-fg-muted'}`}
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
            )}
          >
            <DropdownItem icon={<History size={14} aria-hidden />} onClick={() => setVersionOpen(true)}>
              {t('doc.versions')}
            </DropdownItem>
            {canManage && (
              <DropdownItem icon={<ShieldCheck size={14} aria-hidden />} onClick={() => setAclOpen(true)}>
                {t('space.acl')}
              </DropdownItem>
            )}
            {canManage && (
              <>
                <DropdownDivider />
                <DropdownItem icon={<Trash2 size={14} aria-hidden />} danger onClick={() => setTrashOpen(true)}>
                  {t('doc.moveToTrash')}
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* 正文 + 目录 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-h-0 overflow-y-auto">
            <article className="mx-auto max-w-3xl px-6 py-8 md:px-10">
              <DocContent docId={doc.id} markdown={doc.content_md} />
              <AttachmentPanel docId={doc.id} />
            </article>
          </div>
          <TocPanel containerId={`doc-body-${docId}`} />
        </div>
      </div>

      {/* 弹层组 */}
      <VersionModal open={versionOpen} docId={doc.id} onClose={() => setVersionOpen(false)} onRolledBack={() => void load()} />
      {canManage && (
        <AclModal
          open={aclOpen}
          objectId={doc.id}
          objectType="document"
          onClose={() => setAclOpen(false)}
          onLoad={() => documentsApi.listDocAcl(doc.id).then((r) => r.entries)}
          onSave={(entries) => documentsApi.replaceDocAcl(doc.id, entries)}
        />
      )}
      <ConfirmDialog
        open={trashOpen}
        title={t('doc.moveToTrash')}
        message={t('doc.moveToTrashConfirm', { title: doc.title || t('doc.untitled') })}
        danger
        onConfirm={() => void moveToTrash()}
        onCancel={() => setTrashOpen(false)}
      />
    </div>
  );
}

/** 正文渲染容器：markdown → HTML、复制按钮委托 */
function DocContent({ docId, markdown }: { docId: number; markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown ?? ''), [markdown]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindCodeCopy(el);
  }, [html]);

  return <div id={`doc-body-${docId}`} ref={ref} className="wiki-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 右侧自动目录：从渲染 DOM 提取 h1-h4，IntersectionObserver 高亮当前节 */
function TocPanel({ containerId }: { containerId: string }) {
  const { t } = useT();
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = extractToc(container);
    setToc(items);

    const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[];
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 取视口顶部最近的可见标题
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          setActiveId(top.target.id);
        }
      },
      { rootMargin: '-64px 0px -70% 0px', threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [containerId]);

  return (
    <aside className="sticky top-0 hidden h-full overflow-y-auto border-l border-line px-4 py-6 xl:block" aria-label={t('doc.toc')}>
      {toc.length > 0 && (
        <>
          <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-fg-muted">{t('doc.toc')}</p>
          <ul className="space-y-1 border-l border-line">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`-ml-px block border-l-2 py-0.5 text-2xs leading-snug transition-colors duration-150 ${
                    item.level <= 2 ? 'pl-3' : 'pl-6'
                  } ${
                    activeId === item.id
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg'
                  }`}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

/** 版本历史弹窗：列表 → 查看内容 → 回滚 */
function VersionModal({
  open,
  docId,
  onClose,
  onRolledBack,
}: {
  open: boolean;
  docId: number;
  onClose: () => void;
  onRolledBack: () => void;
}) {
  const { t } = useT();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<VersionContent | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<VersionRow | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!open) {
      setViewing(null);
      setRollbackTarget(null);
      return;
    }
    setVersions(null);
    setError(null);
    void documentsApi
      .listVersions(docId)
      .then((res) => setVersions(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : t('toast.networkError')));
  }, [open, docId, t]);

  const viewVersion = async (version: VersionRow): Promise<void> => {
    try {
      const content = await documentsApi.getVersionContent(docId, version.version);
      setViewing(content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    }
  };

  const rollback = async (): Promise<void> => {
    if (!rollbackTarget) return;
    setRolling(true);
    try {
      await documentsApi.restoreVersion(docId, rollbackTarget.version);
      toast.success(t('toast.saved'));
      setRollbackTarget(null);
      onClose();
      onRolledBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setRolling(false);
    }
  };

  const fmt = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('doc.versions')} width="max-w-2xl">
        {versions === null ? (
          <p className="py-8 text-center text-sm text-fg-muted">{error ?? t('common.loading')}</p>
        ) : versions.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t('common.empty')}</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs text-fg-muted">
                  <th className="py-2 pr-3 font-medium">{t('doc.version')}</th>
                  <th className="py-2 pr-3 font-medium">{t('doc.changeNote')}</th>
                  <th className="py-2 pr-3 font-medium">{t('doc.author')}</th>
                  <th className="py-2 pr-3 font-medium">{t('doc.time')}</th>
                  <th className="py-2 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-mono text-2xs tabular-nums">v{v.version}</td>
                    <td className="max-w-40 truncate py-2 pr-3 text-fg-secondary">{v.change_note ?? '—'}</td>
                    <td className="py-2 pr-3 text-fg-secondary">{v.author_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-2xs tabular-nums text-fg-muted">{fmt(v.created_at)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void viewVersion(v)}>
                          <Eye size={13} aria-hidden />
                          {t('doc.viewVersion')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRollbackTarget(v)}>
                          {t('doc.rollback')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* 版本内容预览 */}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={`v${viewing.version} · ${viewing.title}`} width="max-w-3xl">
          <div className="max-h-[60vh] overflow-y-auto">
            <DocContent docId={-1} markdown={viewing.content_md} />
          </div>
        </Modal>
      )}

      {/* 回滚确认 */}
      <ConfirmDialog
        open={rollbackTarget !== null}
        title={t('doc.rollback')}
        message={t('doc.rollbackConfirm', { version: rollbackTarget?.version ?? '' })}
        onConfirm={() => void rollback()}
        onCancel={() => setRollbackTarget(null)}
        loading={rolling}
      />
    </>
  );
}

/** 附件面板：列表 / 上传 / 删除（正文章节底部） */
export function AttachmentPanel({ docId }: { docId: number }) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await attachmentsApi.listAttachments(docId);
      setItems(res.items);
    } catch {
      setItems([]);
    }
  }, [docId]);

  useEffect(() => {
    if (docId > 0) void load();
  }, [docId, load]);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      await attachmentsApi.uploadAttachment(file, docId);
      toast.success(t('toast.saved'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number): Promise<void> => {
    try {
      await attachmentsApi.deleteAttachment(id);
      toast.success(t('toast.deleted'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    }
  };

  const fmtSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <section aria-label={t('doc.attachments')} className="mt-10 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-fg-muted">
          <Paperclip size={13} aria-hidden />
          {t('doc.attachments')}
          {items && <span className="text-fg-muted">({items.length})</span>}
        </h3>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" loading={uploading} onClick={() => fileRef.current?.click()}>
          <FileUp size={13} aria-hidden />
          {t('doc.uploadAttachment')}
        </Button>
      </div>

      {items === null ? (
        <Spinner size={16} />
      ) : items.length === 0 ? (
        <p className="py-1 text-2xs text-fg-muted">{t('doc.attachmentEmpty')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((att) => (
            <li
              key={att.id}
              className="group flex items-center gap-2 rounded border border-line bg-elevated px-2.5 py-1.5 text-2xs"
            >
              <a
                href={attachmentsApi.attachmentRawUrl(att.id)}
                target="_blank"
                rel="noopener"
                className="max-w-48 truncate font-medium text-fg underline-offset-2 hover:text-primary hover:underline"
              >
                {att.filename}
              </a>
              <span className="tabular-nums text-fg-muted">{fmtSize(att.size)}</span>
              <button
                type="button"
                onClick={() => void remove(att.id)}
                aria-label={t('doc.deleteAttachment')}
                className="text-fg-muted opacity-0 transition-opacity duration-150 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
