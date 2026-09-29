import { useCallback, useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { toast } from '../../stores/toast';
import * as usersApi from '../../api/users';
import type { AclEntryInput, AclEntryView, Permission, SubjectType } from '../../types/api';
import { Button, Input, Modal, Select } from '../ui';

export interface AclModalProps {
  open: boolean;
  onClose: () => void;
  /** 空间或文档的数字 id */
  objectId: number;
  objectType: 'space' | 'document';
  /** 保存函数：全量 PUT 由页面注入（空间与文档端点不同） */
  onSave: (entries: AclEntryInput[]) => Promise<unknown>;
  /** 加载函数：GET 由页面注入 */
  onLoad: () => Promise<AclEntryView[]>;
}

const PERMISSION_OPTIONS: { value: Permission; labelKey: 'space.aclRead' | 'space.aclWrite' | 'space.aclManage' }[] = [
  { value: 1, labelKey: 'space.aclRead' },
  { value: 2, labelKey: 'space.aclWrite' },
  { value: 3, labelKey: 'space.aclManage' },
];

/** ACL 管理弹窗：列出规则、增删行、全量保存 */
export function AclModal({ open, onClose, onSave, onLoad }: AclModalProps) {
  const { t } = useT();
  const [entries, setEntries] = useState<AclEntryInput[]>([]);
  /** 已有规则的展示名（后端解析），与 entries 按下标对齐 */
  const [names, setNames] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 打开时拉取规则与用户组（用户列表为管理员接口，普通用户以 ID 方式添加）
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await onLoad();
        setEntries(
          res.map((e) => ({
            subject_type: e.subject_type,
            subject_id: e.subject_id,
            permission: e.permission,
            inherit: e.inherit,
          }))
        );
        setNames(res.map((e) => e.subject_name));
        try {
          const g = await usersApi.listGroups();
          setGroups(g.items.map((x) => ({ id: x.id, name: x.name })));
        } catch {
          setGroups([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('toast.networkError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, onLoad, t]);

  const addRow = (): void => {
    setEntries((prev) => [...prev, { subject_type: 'user', subject_id: null, permission: 1, inherit: 1 }]);
    setNames((prev) => [...prev, null]);
  };

  const updateRow = (index: number, patch: Partial<AclEntryInput>): void => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const removeRow = (index: number): void => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setNames((prev) => prev.filter((_, i) => i !== index));
  };

  const save = useCallback(async (): Promise<void> => {
    // everyone 规则不能带 id；用户/组必须带正整数 id
    for (const e of entries) {
      if (e.subject_type === 'everyone') continue;
      if (e.subject_id === null || !Number.isInteger(e.subject_id) || e.subject_id <= 0) {
        setError(t('common.required'));
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(entries);
      toast.success(t('toast.updated'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  }, [entries, onSave, onClose, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('space.aclTitle')}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-muted">{t('common.loading')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-2xs text-fg-muted">
            <ShieldCheck size={13} aria-hidden />
            <span>
              1 = {t('space.aclRead')} · 2 = {t('space.aclWrite')} · 3 = {t('space.aclManage')}
            </span>
          </div>

          {entries.length === 0 && (
            <p className="rounded border border-dashed border-line px-3 py-4 text-center text-2xs text-fg-muted">
              {t('space.aclEmpty')}
            </p>
          )}

          <ul className="space-y-2">
            {entries.map((entry, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-bg p-2.5">
                <div className="w-28">
                  <Select
                    value={entry.subject_type}
                    onChange={(e) => {
                      const type = e.target.value as SubjectType;
                      updateRow(i, {
                        subject_type: type,
                        subject_id: type === 'everyone' ? null : entry.subject_id,
                      });
                    }}
                    options={[
                      { value: 'user', label: t('space.aclUser') },
                      { value: 'group', label: t('space.aclGroup') },
                      { value: 'everyone', label: t('space.aclEveryone') },
                    ]}
                  />
                </div>

                {entry.subject_type === 'user' && (
                  <div className="w-40">
                    <Input
                      aria-label={t('space.aclSubject')}
                      placeholder={`${t('space.aclPickUser')} ID`}
                      type="number"
                      min={1}
                      value={entry.subject_id ?? ''}
                      onChange={(e) => updateRow(i, { subject_id: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                )}
                {entry.subject_type === 'group' && (
                  <div className="w-44">
                    <Select
                      aria-label={t('space.aclSubject')}
                      value={entry.subject_id ? String(entry.subject_id) : ''}
                      onChange={(e) => updateRow(i, { subject_id: e.target.value ? Number(e.target.value) : null })}
                      options={[
                        { value: '', label: t('space.aclPickGroup'), disabled: true },
                        ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                      ]}
                    />
                  </div>
                )}
                {names[i] && entry.subject_type !== 'everyone' && (
                  <span className="hidden max-w-28 truncate pb-2 text-2xs text-fg-muted xl:block" title={names[i] ?? ''}>
                    {names[i]}
                  </span>
                )}

                <div className="w-36">
                  <Select
                    aria-label={t('space.aclPermission')}
                    value={String(entry.permission)}
                    onChange={(e) => updateRow(i, { permission: Number(e.target.value) as Permission })}
                    options={PERMISSION_OPTIONS.map((p) => ({ value: String(p.value), label: t(p.labelKey) }))}
                  />
                </div>

                <label className="flex h-9 items-center gap-1.5 text-2xs text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={entry.inherit === 1}
                    onChange={(e) => updateRow(i, { inherit: e.target.checked ? 1 : 0 })}
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  {t('space.aclInherit')}
                </label>

                <Button size="icon" variant="ghost" className="ml-auto h-9 w-8" onClick={() => removeRow(i)} aria-label={t('common.delete')}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>

          <Button size="sm" variant="secondary" onClick={addRow}>
            <Plus size={13} aria-hidden />
            {t('space.aclAddRule')}
          </Button>

          {error && <p className="text-2xs text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
