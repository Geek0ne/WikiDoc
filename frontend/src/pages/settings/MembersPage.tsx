import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Search, UserCog } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { Button, ConfirmDialog, Input, Modal, Pagination, Switch } from '../../components/ui';
import { Field } from '../../components/settings/SettingField';
import { createUser, deactivateUser, listUsers, updateUser } from '../../api/users';
import type { AdminUserRow } from '../../types/api';
import { NoAdminBlock } from './AppearancePage';

const PAGE_SIZE = 15;

/** 成员管理：列表/搜索/新建/编辑资料/重置密码/停用 */
export default function MembersPage() {
  const { t } = useT();
  const isAdmin = useAuthStore((s) => s.user?.is_admin) === 1;
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUserRow | null>(null);

  const load = useCallback(
    (p = page, kw = keyword) => {
      setRows(null);
      void listUsers({ page: p, limit: PAGE_SIZE, keyword: kw || undefined })
        .then((res) => {
          setRows(res.items);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
    },
    [page, keyword, t]
  );

  useEffect(() => {
    if (isAdmin) load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return <NoAdminBlock />;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold">{t('settings.members')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} aria-hidden />
          {t('settings.newUser')}
        </Button>
      </header>

      <div className="relative">
        <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1, keyword)}
          placeholder={t('settings.searchUser')}
          className="pl-8"
          aria-label={t('settings.searchUser')}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-bg-elevated text-2xs text-fg-muted">
              <th className="px-3 py-2 font-medium">{t('settings.username')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.email')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.source')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.lastLogin')}</th>
              <th className="px-3 py-2 font-medium">{t('settings.active')}</th>
              <th className="w-10 px-2" aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-2xs text-fg-muted">…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-2xs text-fg-muted">{t('settings.searchUser')}</td>
              </tr>
            ) : (
              rows.map((user) => (
                <tr key={user.id} className="border-b border-line last:border-b-0 hover:bg-bg-elevated">
                  <td className="px-3 py-2">
                    <span className="font-medium text-fg">{user.display_name || user.username}</span>
                    <span className="ml-1.5 text-2xs text-fg-muted">@{user.username}</span>
                    {user.is_admin === 1 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary-soft px-1 py-px text-2xs text-primary">
                        <UserCog size={10} aria-hidden />
                        admin
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">{user.email ?? '—'}</td>
                  <td className="px-3 py-2 text-fg-secondary">{user.source}</td>
                  <td className="px-3 py-2 text-fg-secondary">{user.last_login_at ?? '—'}</td>
                  <td className="px-3 py-2">
                    {user.is_active === 1 ? (
                      <span className="text-success">{t('settings.active')}</span>
                    ) : (
                      <span className="text-fg-muted">{t('settings.inactive')}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Button variant="ghost" size="sm" aria-label={t('common.edit')} onClick={() => setEditing(user)}>
                      <KeyRound size={12} aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={(p) => load(p)} />

      {createOpen && <UserDialog onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(page); }} />}
      {editing && (
        <UserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load(page);
          }}
        />
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t('settings.deactivate')}
        message={deactivateTarget ? t('settings.deactivateConfirm', { name: deactivateTarget.username }) : ''}
        onConfirm={() => {
          if (!deactivateTarget) return;
          void deactivateUser(deactivateTarget.id)
            .then(() => {
              toast.success(t('toast.saved'));
              setDeactivateTarget(null);
              load(page);
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : t('toast.networkError')));
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}

/** 新建/编辑用户弹窗：编辑时支持重置密码与停用 */
function UserDialog({ user, onClose, onSaved }: { user?: AdminUserRow; onClose(): void; onSaved(): void }) {
  const { t } = useT();
  const isEdit = user !== undefined;
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [grantAdmin, setGrantAdmin] = useState(user?.is_admin === 1);
  const [active, setActive] = useState(user?.is_active !== 0);
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      if (isEdit && user) {
        await updateUser(user.id, {
          display_name: displayName,
          email: email || null,
          is_admin: grantAdmin ? 1 : 0,
          is_active: active ? 1 : 0,
          ...(password ? { password } : {}),
        });
      } else {
        await createUser({ username: username.trim(), display_name: displayName || undefined, email: email || undefined, password, is_admin: grantAdmin ? 1 : 0 });
      }
      toast.success(t('toast.saved'));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `${t('common.edit')} @${user.username}` : t('settings.newUser')}>
      <div className="space-y-3.5">
        {!isEdit && (
          <Field label={t('settings.username')}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label={t('settings.displayName')}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('settings.email')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={isEdit ? t('settings.resetPassword') : t('settings.password')} hint={isEdit ? t('settings.newPasswordHint') : undefined}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-fg-secondary">{t('settings.isAdmin')}</span>
          <Switch checked={grantAdmin} onChange={setGrantAdmin} aria-label={t('settings.isAdmin')} />
        </div>
        {isEdit && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-fg-secondary">{t('settings.active')}</span>
            <Switch checked={active} onChange={setActive} aria-label={t('settings.active')} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={saving || (!isEdit && (!username.trim() || !password))} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
