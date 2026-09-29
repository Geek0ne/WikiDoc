import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { toast } from '../../stores/toast';
import * as documentsApi from '../../api/documents';
import type { DocTreeNode } from '../../types/api';
import { Button, Input, Modal, Select } from '../ui';

export interface NewDocModalProps {
  open: boolean;
  spaceId: number;
  tree: DocTreeNode[];
  /** 初始父级：'root' 顶层或指定节点 id */
  initialParent: number | 'root' | null;
  onClose: () => void;
  onCreated: (docId: number) => void;
}

interface FlatNode {
  id: number;
  title: string;
  depth: number;
}

function flattenTree(nodes: DocTreeNode[], depth = 0, out: FlatNode[] = []): FlatNode[] {
  nodes.forEach((n) => {
    out.push({ id: n.id, title: n.title, depth });
    flattenTree(n.children, depth + 1, out);
  });
  return out;
}

/** 新建文档弹窗：标题 + 可选父级文档 */
export function NewDocModal({ open, spaceId, tree, initialParent, onClose, onCreated }: NewDocModalProps) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState<string>('root');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const candidates = flattenTree(tree);

  useEffect(() => {
    if (open) {
      setTitle('');
      setError(null);
      setParent(initialParent === 'root' || initialParent === null ? 'root' : String(initialParent));
    }
  }, [open, initialParent]);

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      setError(t('common.required'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await documentsApi.createDocument({
        space_id: spaceId,
        parent_id: parent === 'root' ? null : Number(parent),
        title: title.trim(),
      });
      toast.success(t('toast.created'));
      onCreated(res.doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('space.newDoc')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={t('space.newDocTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('space.docTitlePlaceholder')}
          autoFocus
        />
        <Select
          label={t('space.parentDoc')}
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          options={[
            { value: 'root', label: t('space.rootLevel') },
            ...candidates.map((c) => ({
              value: String(c.id),
              label: `${'　'.repeat(c.depth)}${c.title}`,
            })),
          ]}
        />
        {error && <p className="text-2xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
