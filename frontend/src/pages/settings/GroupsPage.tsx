import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button, ConfirmDialog, Input, Modal, Spinner, Textarea } from '../../components/ui';
import { createGroup, deleteGroup, listGroups, syncGroupsFromLdap, updateGroup } from '../../api/groups';
import type { Group } from '../../types/api';
import { NoAdminBlock } from './AppearancePage';

/** 用户组管理：列表/新建/编辑/删除 + LDAP 全量同步 */
export default function GroupsPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    setGroups(null);
    void listGroups()
      .then((res) => setGroups(res.items))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
  }, [t]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) return <NoAdminBlock />;

  const doSync = (): void => {
    setSyncing(true);
    void syncGroupsFromLdap()
      .then((result) => toast.success(t('settings.syncDone', { groups: result.groups, users: result.users, memberships: result.memberships })))
      .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')))
      .finally(() => {
        setSyncing(false);
        load();
      });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold">{t('settings.groups')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={syncing} onClick={doSync}>
            {syncing ? <Spinner size={12} /> : <RefreshCw size={13} aria-hidden />}
            {syncing ? t('settings.syncing') : t('settings.syncFromLdap')}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setEditOpen(true); }}>
            <Plus size={13} aria-hidden />
            {t('settings.newGroup')}
          </Button>
        </div>
      </header>

      {groups === null ? (
        <div className="flex justify-center py-10">
          <Spinner size={20} />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-2xs text-fg-muted">{t('settings.newGroup')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {groups.map((group) => (
            <li key={group.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-bg-elevated">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  {group.name}
                  {group.source === 'ldap' && (
                    <span className="rounded bg-bg-sunken px-1 py-px text-2xs text-fg-muted">LDAP</span>
                  )}
                </p>
                {group.description && <p className="truncate text-2xs text-fg-muted">{group.description}</p>}
              </div>
              {isAdmin && group.source === 'local' && (
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(group); setEditOpen(true); }}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={t('common.delete')} onClick={() => setDeleteTarget(group)}>
                    <Trash2 size={12} aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editOpen && (
        <GroupDialog
          group={editing}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('common.delete')}
        message={deleteTarget ? t('settings.deleteGroupConfirm', { name: deleteTarget.name }) : ''}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteGroup(deleteTarget.id)
            .then(() => {
              toast.success(t('toast.deleted'));
              setDeleteTarget(null);
              load();
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function GroupDialog({ group, onClose, onSaved }: { group: Group | null; onClose(): void; onSaved(): void }) {
  const { t } = useT();
  const isEdit = group !== null;
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      if (isEdit) await updateGroup(group.id, { name: name.trim(), description: description || null });
      else await createGroup({ name: name.trim(), description: description || null });
      toast.success(t('toast.saved'));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? t('common.edit') : t('settings.newGroup')}>
      <div className="space-y-3.5">
        <label className="block space-y-1.5">
          <span className="block text-2xs font-medium text-fg-secondary">{t('settings.groupName')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-2xs font-medium text-fg-secondary">{t('settings.groupDesc')}</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
