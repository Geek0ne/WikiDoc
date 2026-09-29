import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { toast } from '../../stores/toast';
import * as spacesApi from '../../api/spaces';
import type { Space, Visibility } from '../../types/api';
import { Button, Input, Modal, Select, Textarea } from '../ui';

export interface SpaceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  space: Space;
  /** 全量删除空间后的外跳处理 */
  onDeleted: () => void;
  onUpdated: (space: Space) => void;
}

/** 空间设置：重命名 / 描述 / 可见性 / 删除 */
export function SpaceSettingsModal({ open, onClose, space, onDeleted, onUpdated }: SpaceSettingsModalProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>(space.visibility);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(space.name);
      setDescription(space.description ?? '');
      setVisibility(space.visibility);
      setError(null);
    }
  }, [open, space]);

  const save = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('common.required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await spacesApi.updateSpace(space.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
      });
      toast.success(t('toast.updated'));
      onUpdated(res.space);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    setDeleting(true);
    try {
      await spacesApi.deleteSpace(space.id);
      toast.success(t('toast.spaceDeleted'));
      setDeleteOpen(false);
      onClose();
      onDeleted();
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.networkError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open={open && !deleteOpen}
        onClose={onClose}
        title={t('space.spaceSettings')}
        footer={
          <>
            <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" onClick={() => setDeleteOpen(true)}>
              {t('space.deleteSpace')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label={t('space.rename')} value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label={t('space.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Select
            label={t('space.visibility')}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            options={[
              { value: 'space', label: t('space.visibilitySpace') },
              { value: 'public', label: t('space.visibilityPublic') },
              { value: 'private', label: t('space.visibilityPrivate') },
              { value: 'inherit', label: t('space.visibilityInherit') },
            ]}
          />
          <p className="text-2xs text-fg-muted">key: {space.key}</p>
          {error && <p className="text-2xs text-danger">{error}</p>}
        </div>
      </Modal>

      {deleteOpen && (
        <Modal
          open
          onClose={() => setDeleteOpen(false)}
          title={t('space.deleteSpace')}
          width="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" loading={deleting} onClick={() => void remove()}>
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-fg-secondary">
            {t('space.deleteSpaceConfirm', { name: space.name })}
          </p>
        </Modal>
      )}
    </>
  );
}
