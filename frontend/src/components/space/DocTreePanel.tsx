import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, ListTree, Plus } from 'lucide-react';
import { useT } from '../../i18n';
import type { DocTreeNode } from '../../types/api';
import { Button } from '../ui';

export interface DocTreePanelProps {
  tree: DocTreeNode[];
  loading: boolean;
  error: string | null;
  currentDocId: number | null;
  spaceKey: string;
  /** 有写权限才显示新建入口 */
  canWrite: boolean;
  onReload: () => void;
  /** 请求打开新建文档弹窗（root 或指定父节点） */
  onRequestNewDoc: (parentId: number | 'root') => void;
}

/** 空间文档树：递归渲染 + 展开/折叠 + 当前文档高亮；默认根层展开 */
export function DocTreePanel({
  tree,
  loading,
  error,
  currentDocId,
  spaceKey,
  canWrite,
  onReload,
  onRequestNewDoc,
}: DocTreePanelProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [manualExpanded, setManualExpanded] = useState<Set<number> | null>(null);

  /** 未做任何手动展开/折叠时默认全部展开；一旦操作按选择集合走 */
  const isOpen = (node: DocTreeNode): boolean =>
    manualExpanded === null ? true : manualExpanded.has(node.id);

  const toggle = (id: number): void => {
    setManualExpanded((prev) => {
      const base = prev ?? new Set(collectExpandable(tree));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = (): void => setManualExpanded(new Set(collectExpandable(tree)));
  const collapseAll = (): void => setManualExpanded(new Set<number>());

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-line bg-elevated">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-fg-muted">
          <ListTree size={13} aria-hidden />
          {t('space.tree')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="rounded px-1.5 py-0.5 text-2xs text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
          >
            {t('space.expandAll')}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded px-1.5 py-0.5 text-2xs text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
          >
            {t('space.collapseAll')}
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-1.5" aria-label={t('space.tree')}>
        {loading ? (
          <p className="px-3 py-4 text-2xs text-fg-muted">{t('common.loading')}</p>
        ) : error ? (
          <div className="px-3 py-4">
            <p className="text-2xs leading-relaxed text-danger">{error}</p>
            <button type="button" onClick={onReload} className="mt-1 text-2xs text-primary hover:underline">
              {t('common.retry')}
            </button>
          </div>
        ) : tree.length === 0 ? (
          <p className="px-3 py-4 text-2xs leading-relaxed text-fg-muted">
            {canWrite ? t('space.newDoc') : t('common.empty')}
          </p>
        ) : (
          <ul className="space-y-px px-1.5">
            {tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                isOpen={isOpen}
                toggle={toggle}
                currentDocId={currentDocId}
                onOpen={(id) => navigate(`/s/${spaceKey}/d/${id}`)}
                onNewHere={(parentId) => onRequestNewDoc(parentId)}
                canWrite={canWrite}
                newDocLabel={t('space.newDoc')}
              />
            ))}
          </ul>
        )}
      </nav>

      {canWrite && (
        <div className="shrink-0 border-t border-line p-2">
          <Button size="sm" variant="secondary" className="w-full justify-start" onClick={() => onRequestNewDoc('root')}>
            <FileText size={14} aria-hidden />
            {t('space.newDoc')}
          </Button>
        </div>
      )}
    </div>
  );
}

function collectExpandable(nodes: DocTreeNode[]): number[] {
  const ids: number[] = [];
  const walk = (list: DocTreeNode[]): void => {
    list.forEach((n) => {
      if (n.children.length > 0) ids.push(n.id);
      walk(n.children);
    });
  };
  walk(nodes);
  return ids;
}

interface TreeNodeProps {
  node: DocTreeNode;
  depth: number;
  isOpen: (node: DocTreeNode) => boolean;
  toggle: (id: number) => void;
  currentDocId: number | null;
  onOpen: (id: number) => void;
  onNewHere: (parentId: number) => void;
  canWrite: boolean;
  newDocLabel: string;
}

function TreeNode({
  node,
  depth,
  isOpen,
  toggle,
  currentDocId,
  onOpen,
  onNewHere,
  canWrite,
  newDocLabel,
}: TreeNodeProps) {
  const { t } = useT();
  const open = isOpen(node);
  const hasChildren = node.children.length > 0;
  const active = currentDocId === node.id;
  const clickable = node.my_permission >= 1;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded pr-1 transition-colors duration-150 ${
          active ? 'bg-primary-soft' : 'hover:bg-hover'
        }`}
        style={{ paddingLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-expanded={open}
            aria-label={node.title}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg"
          >
            <ChevronRight
              size={13}
              aria-hidden
              className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => clickable && onOpen(node.id)}
          disabled={!clickable}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
            active ? 'font-medium text-primary' : 'text-fg-secondary group-hover:text-fg'
          }`}
        >
          <FileText size={13} aria-hidden className="shrink-0 text-fg-muted" />
          <span className="truncate">{node.title || t('doc.untitled')}</span>
          {node.status === 'draft' && (
            <span className="shrink-0 rounded border border-line px-1 text-2xs leading-tight text-fg-muted">
              {t('doc.draft')}
            </span>
          )}
        </button>
        {canWrite && node.my_permission >= 2 && (
          <button
            type="button"
            onClick={() => onNewHere(node.id)}
            title={newDocLabel}
            aria-label={newDocLabel}
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-primary-soft hover:text-primary group-hover:flex"
          >
            <Plus size={12} aria-hidden />
          </button>
        )}
      </div>
      {open && hasChildren && (
        <ul className="space-y-px">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isOpen={isOpen}
              toggle={toggle}
              currentDocId={currentDocId}
              onOpen={onOpen}
              onNewHere={onNewHere}
              canWrite={canWrite}
              newDocLabel={newDocLabel}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
