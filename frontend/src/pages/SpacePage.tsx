import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FileText, Search, Settings } from 'lucide-react';
import { useT } from '../i18n';
import * as spacesApi from '../api/spaces';
import { ApiError } from '../api/client';
import type { DocTreeNode, Space } from '../types/api';
import { DocTreePanel } from '../components/space/DocTreePanel';
import { DocumentView } from '../components/space/DocumentView';
import { SpaceSettingsModal } from '../components/space/SpaceSettingsModal';
import { AclModal } from '../components/space/AclModal';
import { NewDocModal } from '../components/space/NewDocModal';
import { Button, Empty, Spinner } from '../components/ui';
import type { OutletContext } from '../components/layout/layout-context';

/**
 * 空间页：左侧文档树 + 右侧内容区。
 * /s/:key 显示欢迎页；/s/:key/d/:docId 内嵌文档视图（树保持可见）。
 */
export default function SpacePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { key = '', docId: docIdParam } = useParams();
  const { reloadSpaces } = useOutletContext<OutletContext>();
  const docId = docIdParam ? Number(docIdParam) : null;

  const [space, setSpace] = useState<Space | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [tree, setTree] = useState<DocTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [newDocParent, setNewDocParent] = useState<number | 'root' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aclOpen, setAclOpen] = useState(false);

  const canManage = space?.my_permission !== null && (space?.my_permission ?? 0) >= 3;
  const canWrite = (space?.my_permission ?? 0) >= 2;

  const loadSpace = useCallback(async (): Promise<void> => {
    setSpaceError(null);
    try {
      const sp = await spacesApi.getSpace(key);
      setSpace(sp);
    } catch (err) {
      setSpaceError(err instanceof ApiError && err.status === 403 ? t('space.noAccess') : err instanceof Error ? err.message : t('common.error'));
    }
  }, [key, t]);

  const loadTree = useCallback(async (): Promise<void> => {
    if (!space) return;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await spacesApi.getDocTree(space.id);
      setTree(res.tree);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setTreeLoading(false);
    }
  }, [space, t]);

  useEffect(() => void loadSpace(), [loadSpace]);
  useEffect(() => void loadTree(), [loadTree]);

  if (spaceError) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty title={spaceError} action={<Button variant="primary" onClick={() => navigate('/')}>{t('nav.home')}</Button>} />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* 文档树 */}
      <div className="hidden w-72 shrink-0 md:block">
        <DocTreePanel
          tree={tree}
          loading={treeLoading}
          error={treeError}
          currentDocId={docId}
          spaceKey={space.key}
          canWrite={canWrite}
          onReload={() => void loadTree()}
          onRequestNewDoc={(parent) => setNewDocParent(parent)}
        />
      </div>

      {/* 内容区 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 空间工具条 */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{space.name}</h1>
          {canManage && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setAclOpen(true)}>
                {t('space.acl')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
                <Settings size={14} aria-hidden />
                {t('space.spaceSettings')}
              </Button>
            </>
          )}
        </div>

        {docId === null ? (
          /* 欢迎页 */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileText size={26} aria-hidden />
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{t('space.welcome', { name: space.name })}</h2>
            <p className="max-w-md text-sm leading-relaxed text-fg-secondary">
              {space.description || t('space.welcomeHint')}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {canWrite && (
                <Button variant="primary" onClick={() => setNewDocParent('root')}>
                  <FileText size={15} aria-hidden />
                  {t('space.newDoc')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => navigate(`/search?space_id=${space.id}`)}>
                <Search size={15} aria-hidden />
                {t('space.quickSearch')}
              </Button>
            </div>
          </div>
        ) : Number.isFinite(docId) ? (
          /* 文档视图（树保持可见） */
          <div className="min-h-0 flex-1 overflow-hidden">
            <DocumentView
              docId={docId as number}
              spaceKey={space.key}
              spaceName={space.name}
              onChanged={() => void loadTree()}
              onDeleted={() => navigate(`/s/${space.key}`, { replace: true })}
            />
          </div>
        ) : null}
      </div>

      {/* 弹层组 */}
      <NewDocModal
        open={newDocParent !== null}
        spaceId={space.id}
        tree={tree}
        initialParent={newDocParent}
        onClose={() => setNewDocParent(null)}
        onCreated={(id) => {
          setNewDocParent(null);
          void loadTree();
          navigate(`/s/${space.key}/d/${id}`);
        }}
      />
      {canManage && (
        <>
          <SpaceSettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            space={space}
            onDeleted={() => reloadSpaces()}
            onUpdated={(sp) => {
              setSpace(sp);
              void reloadSpaces();
            }}
          />
          <AclModal
            open={aclOpen}
            objectId={space.id}
            objectType="space"
            onClose={() => setAclOpen(false)}
            onLoad={() => spacesApi.listSpaceAcl(space.id).then((r) => r.entries)}
            onSave={(entries) => spacesApi.replaceSpaceAcl(space.id, entries).then(() => undefined)}
          />
        </>
      )}
    </div>
  );
}
